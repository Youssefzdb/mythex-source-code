/**
 * Changing the language, and following the account's choice across devices.
 * Kept apart from app-locale.ts because it talks to the API and the DOM.
 */
import { api } from "../lib/api";
import { peekSessionHint } from "../lib/session-hint";
import { loadCatalog } from "./index";
import { appLocale, setAppLocale } from "./app";
import { isLocaleCode, localeInfo, type LocaleCode } from "./locales";
import {
  pageLocale,
  readSiteLanguage,
  readStoredPref,
  resolvePref,
  writeSiteLanguage,
  writeStoredPref,
  type LocalePref,
} from "./app-locale";

/**
 * <html lang dir> for the page being shown: after a language change, and once
 * sign-in is known (on "/" that decides landing page vs dashboard).
 */
export function syncDocument(appCode: LocaleCode = appLocale()): void {
  const code = pageLocale(window.location.pathname, appCode, peekSessionHint());
  const info = localeInfo(code);
  document.documentElement.lang = info.tag;
  document.documentElement.dir = info.dir;
}

async function apply(pref: LocalePref): Promise<LocaleCode> {
  const code = resolvePref(pref);
  // The marketing strings too: sign-in and the 404 page use them.
  await Promise.all([loadCatalog(code), setAppLocale(code)]);
  syncDocument(code);
  return code;
}

/**
 * The person picked a language (or "auto") in settings. Saved on this device
 * at once, and on the account when signed in, so their other devices follow.
 */
export async function chooseLocale(pref: LocalePref, opts: { signedIn: boolean }): Promise<void> {
  writeSiteLanguage(undefined);
  writeStoredPref(pref);
  await apply(pref);
  if (opts.signedIn) {
    await api.patch("/v1/account/locale", { locale: pref === "auto" ? null : pref });
  }
}

/**
 * On sign-in: the account's language wins over this device's, so a choice
 * made on the phone shows up on the laptop. An account on "auto" leaves the
 * device alone.
 */
export function followAccountLocale(accountLocale: string | null | undefined): void {
  // Signed in after reading the site in a language, with no choice saved anywhere:
  // that language becomes the choice, on this device and the account.
  const site = readSiteLanguage();
  if (site && !accountLocale && readStoredPref() === "auto") {
    void chooseLocale(site, { signedIn: true });
    return;
  }
  if (!accountLocale || !isLocaleCode(accountLocale)) return;
  if (readStoredPref() === accountLocale) return;
  writeStoredPref(accountLocale);
  void apply(accountLocale);
}

/**
 * A visitor with no saved language went from a page in `code` (/ar/…) to one
 * that follows their language (sign-in, sign-up, the app): show it in `code`,
 * as they were reading, instead of the browser's language. Not saved until they
 * sign in (followAccountLocale) or choose.
 */
export function followSiteLanguage(code: LocaleCode): void {
  if (readStoredPref() !== "auto" || appLocale() === code) return;
  writeSiteLanguage(code);
  void apply(code);
}

const SEEN_KEY = "mythex.languageSeen";

/** The browser's first language as it reports it ("ar-SA"), for reporting only. */
export function browserLanguageTag(): string {
  if (typeof navigator === "undefined") return "";
  return (navigator.languages?.[0] ?? navigator.language ?? "").slice(0, 35);
}

/**
 * Tell the account which language the app is shown in, and the browser's own
 * language — so we can count users per language and see which languages people
 * arrive with that we don't speak yet. Sent only when either changes for this
 * person on this device, so it is not a request per page load.
 */
export function reportLanguageSeen(userId: string, force = false): void {
  const uiLocale = resolvePref(readStoredPref());
  const browserLanguage = browserLanguageTag();
  const key = `${userId}|${uiLocale}|${browserLanguage}`;
  try {
    if (!force && window.localStorage.getItem(SEEN_KEY) === key) return;
  } catch {
    // No storage: report anyway; the API writes only when something changed.
  }
  void api.post("/v1/account/language-seen", { uiLocale, browserLanguage }).then(
    () => {
      try {
        window.localStorage.setItem(SEEN_KEY, key);
      } catch {
        /* private mode */
      }
    },
    () => undefined,
  );
}
