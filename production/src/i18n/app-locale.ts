/**
 * Which language the app speaks to this person.
 *
 * Two layers, the way ChatGPT does it:
 *   - a preference: "auto" (follow the browser) or one language they picked.
 *     It lives on the account once they are signed in, and in localStorage so
 *     the first frame is already right, and so it works signed out.
 *   - the language it resolves to: the pick, or the browser's first language
 *     we speak, or English.
 *
 * The marketing pages are the exception: their language is in the URL
 * (/de/pricing), because search engines index each language by its URL.
 * `pageLocale` is the one rule that says which of the two a page follows.
 *
 * Pure apart from guarded reads of localStorage and navigator: no React.
 */
import { DEFAULT_LOCALE, LOCALES, isLocaleCode, splitLocale, type LocaleCode } from "./locales";

export type LocalePref = "auto" | LocaleCode;

const STORAGE_KEY = "mythex.locale";

/** The preference saved on this device; "auto" when there is none. */
export function readStoredPref(): LocalePref {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return isLocaleCode(v ?? undefined) ? (v as LocaleCode) : "auto";
  } catch {
    return "auto";
  }
}

const SITE_KEY = "mythex.siteLanguage";

/**
 * The language a visitor with no saved choice was reading the public site in
 * when they went on to sign in or sign up (choose-locale.ts followSiteLanguage):
 * this tab's app shows in it until they choose. Kept for the tab only.
 */
export function readSiteLanguage(): LocaleCode | undefined {
  try {
    const v = window.sessionStorage.getItem(SITE_KEY);
    return isLocaleCode(v ?? undefined) ? (v as LocaleCode) : undefined;
  } catch {
    return undefined;
  }
}

export function writeSiteLanguage(code: LocaleCode | undefined): void {
  try {
    if (code) window.sessionStorage.setItem(SITE_KEY, code);
    else window.sessionStorage.removeItem(SITE_KEY);
  } catch {
    // Blocked storage: it lasts until this page is reloaded.
  }
}

/** The app's language at load: the saved choice, else the site's language this tab was reading, else the browser's. */
export function startingLocale(): LocaleCode {
  const pref = readStoredPref();
  return pref === "auto" ? (readSiteLanguage() ?? resolvePref(pref)) : pref;
}

export function writeStoredPref(pref: LocalePref): void {
  try {
    if (pref === "auto") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Private mode or blocked storage: the choice lasts for this page only.
  }
}

/** Browser language codes that name one of ours differently. */
const ALIASES: Record<string, LocaleCode> = { no: "nb", nn: "nb", fil: "tl", in: "id" };

/**
 * The first of the browser's languages that we speak. An exact match wins
 * ("pt-PT", "es-ES", "fr-CA"); otherwise the language does ("pt" → Brazilian
 * Portuguese, "es-MX" → Spanish, "ar-SA" → Arabic). A language we don't have
 * is skipped, so "xx, de-DE" gives German.
 */
export function browserLocale(languages?: readonly string[]): LocaleCode {
  const list =
    languages ??
    (typeof navigator === "undefined"
      ? []
      : navigator.languages?.length
        ? navigator.languages
        : navigator.language
          ? [navigator.language]
          : []);
  for (const raw of list) {
    const tag = raw.toLowerCase();
    if (isLocaleCode(tag)) return tag;
    const parts = tag.split("-");
    const primary = parts[0]!;
    // Chinese is chosen by script: Traditional for Taiwan, Hong Kong and
    // Macau (or an explicit Hant), Simplified for everything else.
    if (primary === "zh") {
      if (parts.includes("hk") || parts.includes("mo")) return "zh-hk";
      if (parts.includes("hant") || parts.includes("tw")) return "zh-tw";
      return "zh-cn";
    }
    const alias = ALIASES[primary];
    if (alias) return alias;
    const match = LOCALES.find((l) => l.code === primary || l.code.split("-")[0] === primary);
    if (match) return match.code;
  }
  return DEFAULT_LOCALE;
}

export function resolvePref(pref: LocalePref, languages?: readonly string[]): LocaleCode {
  return pref === "auto" ? browserLocale(languages) : pref;
}

/**
 * Pages whose language comes from the URL: the public site. Everything else —
 * the dashboard, a project, settings, sign-in — follows the person's language.
 * Checked on the path without its language prefix.
 */
const MARKETING = [
  /^\/home$/,
  /^\/pricing$/,
  /^\/about$/,
  /^\/faq$/,
  /^\/use-cases$/,
  /^\/security$/,
  /^\/terms$/,
  /^\/privacy$/,
  /^\/cookies$/,
  /^\/acceptable-use$/,
  /^\/(templates|ai|compare|glossary|tools|guides|blog)(\/.*)?$/,
];

export function isMarketingPath(path: string): boolean {
  const p = path.replace(/\/+$/, "") || "/";
  return MARKETING.some((re) => re.test(p));
}

/**
 * The language a page renders in. A language prefix always wins. The public
 * pages at the root are English (that URL *is* the English page). "/" is the
 * landing page for a visitor and the dashboard for someone signed in.
 */
export function pageLocale(
  pathname: string,
  appLocale: LocaleCode,
  signedIn: boolean,
): LocaleCode {
  const { locale, path } = splitLocale(pathname);
  if (locale !== DEFAULT_LOCALE) return locale;
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/") return signedIn ? appLocale : DEFAULT_LOCALE;
  return isMarketingPath(p) ? DEFAULT_LOCALE : appLocale;
}
