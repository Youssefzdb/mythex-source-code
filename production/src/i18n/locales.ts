/**
 * The languages the marketing site speaks, and how a URL carries one.
 *
 * English lives at the root (/pricing); every other language is a prefix
 * (/de/pricing, /pt-br/pricing), the same scheme Lovable and most sites use,
 * so each language version is its own crawlable URL. Pure: no DOM, no React,
 * safe for prerender.
 */

import { ALL_SOLUTION_PATHS } from "../pages/marketing/solutions/routes";

export type LocaleCode =
  | "en"
  | "pt-br"
  | "de"
  | "fr"
  | "es"
  | "it"
  | "hi"
  | "id"
  | "th"
  | "ko"
  | "ja"
  | "ar"
  | "zh-cn"
  | "zh-tw"
  | "zh-hk"
  | "ru"
  | "tr"
  | "vi"
  | "pl"
  | "nl"
  | "uk"
  | "fa"
  | "ur"
  | "es-es"
  | "fr-ca"
  | "pt-pt"
  | "sq"
  | "bs"
  | "bg"
  | "ca"
  | "hr"
  | "cs"
  | "da"
  | "et"
  | "fi"
  | "el"
  | "hu"
  | "is"
  | "lv"
  | "lt"
  | "mk"
  | "nb"
  | "ro"
  | "sr"
  | "sk"
  | "sl"
  | "sv"
  | "bn"
  | "gu"
  | "kn"
  | "ml"
  | "mr"
  | "pa"
  | "ta"
  | "te"
  | "ms"
  | "tl"
  | "my"
  | "kk"
  | "mn"
  | "hy"
  | "ka"
  | "am"
  | "so"
  | "sw";

export type Locale = {
  code: LocaleCode;
  /** BCP 47 tag for <html lang> and hreflang. */
  tag: string;
  /** The language's own name, for the switcher. */
  label: string;
  dir: "ltr" | "rtl";
};

export const LOCALES: readonly Locale[] = [
  { code: "en", tag: "en", label: "English", dir: "ltr" },
  { code: "pt-br", tag: "pt-BR", label: "Português (Brasil)", dir: "ltr" },
  { code: "de", tag: "de", label: "Deutsch", dir: "ltr" },
  { code: "fr", tag: "fr", label: "Français", dir: "ltr" },
  { code: "es", tag: "es", label: "Español", dir: "ltr" },
  { code: "it", tag: "it", label: "Italiano", dir: "ltr" },
  { code: "hi", tag: "hi", label: "हिन्दी", dir: "ltr" },
  { code: "id", tag: "id", label: "Bahasa Indonesia", dir: "ltr" },
  { code: "th", tag: "th", label: "ไทย", dir: "ltr" },
  { code: "ko", tag: "ko", label: "한국어", dir: "ltr" },
  { code: "ja", tag: "ja", label: "日本語", dir: "ltr" },
  { code: "ar", tag: "ar", label: "العربية", dir: "rtl" },
  { code: "zh-cn", tag: "zh-CN", label: "简体中文", dir: "ltr" },
  { code: "zh-tw", tag: "zh-TW", label: "繁體中文（台灣）", dir: "ltr" },
  { code: "zh-hk", tag: "zh-HK", label: "繁體中文（香港）", dir: "ltr" },
  { code: "ru", tag: "ru", label: "Русский", dir: "ltr" },
  { code: "tr", tag: "tr", label: "Türkçe", dir: "ltr" },
  { code: "vi", tag: "vi", label: "Tiếng Việt", dir: "ltr" },
  { code: "pl", tag: "pl", label: "Polski", dir: "ltr" },
  { code: "nl", tag: "nl", label: "Nederlands", dir: "ltr" },
  { code: "uk", tag: "uk", label: "Українська", dir: "ltr" },
  { code: "fa", tag: "fa", label: "فارسی", dir: "rtl" },
  { code: "ur", tag: "ur", label: "اردو", dir: "rtl" },
  { code: "es-es", tag: "es-ES", label: "Español (España)", dir: "ltr" },
  { code: "fr-ca", tag: "fr-CA", label: "Français (Canada)", dir: "ltr" },
  { code: "pt-pt", tag: "pt-PT", label: "Português (Portugal)", dir: "ltr" },
  { code: "sq", tag: "sq", label: "Shqip", dir: "ltr" },
  { code: "bs", tag: "bs", label: "Bosanski", dir: "ltr" },
  { code: "bg", tag: "bg", label: "Български", dir: "ltr" },
  { code: "ca", tag: "ca", label: "Català", dir: "ltr" },
  { code: "hr", tag: "hr", label: "Hrvatski", dir: "ltr" },
  { code: "cs", tag: "cs", label: "Čeština", dir: "ltr" },
  { code: "da", tag: "da", label: "Dansk", dir: "ltr" },
  { code: "et", tag: "et", label: "Eesti", dir: "ltr" },
  { code: "fi", tag: "fi", label: "Suomi", dir: "ltr" },
  { code: "el", tag: "el", label: "Ελληνικά", dir: "ltr" },
  { code: "hu", tag: "hu", label: "Magyar", dir: "ltr" },
  { code: "is", tag: "is", label: "Íslenska", dir: "ltr" },
  { code: "lv", tag: "lv", label: "Latviešu", dir: "ltr" },
  { code: "lt", tag: "lt", label: "Lietuvių", dir: "ltr" },
  { code: "mk", tag: "mk", label: "Македонски", dir: "ltr" },
  { code: "nb", tag: "nb", label: "Norsk bokmål", dir: "ltr" },
  { code: "ro", tag: "ro", label: "Română", dir: "ltr" },
  { code: "sr", tag: "sr", label: "Srpski", dir: "ltr" },
  { code: "sk", tag: "sk", label: "Slovenčina", dir: "ltr" },
  { code: "sl", tag: "sl", label: "Slovenščina", dir: "ltr" },
  { code: "sv", tag: "sv", label: "Svenska", dir: "ltr" },
  { code: "bn", tag: "bn", label: "বাংলা", dir: "ltr" },
  { code: "gu", tag: "gu", label: "ગુજરાતી", dir: "ltr" },
  { code: "kn", tag: "kn", label: "ಕನ್ನಡ", dir: "ltr" },
  { code: "ml", tag: "ml", label: "മലയാളം", dir: "ltr" },
  { code: "mr", tag: "mr", label: "मराठी", dir: "ltr" },
  { code: "pa", tag: "pa", label: "ਪੰਜਾਬੀ", dir: "ltr" },
  { code: "ta", tag: "ta", label: "தமிழ்", dir: "ltr" },
  { code: "te", tag: "te", label: "తెలుగు", dir: "ltr" },
  { code: "ms", tag: "ms", label: "Bahasa Melayu", dir: "ltr" },
  { code: "tl", tag: "fil", label: "Tagalog", dir: "ltr" },
  { code: "my", tag: "my", label: "မြန်မာ", dir: "ltr" },
  { code: "kk", tag: "kk", label: "Қазақ тілі", dir: "ltr" },
  { code: "mn", tag: "mn", label: "Монгол", dir: "ltr" },
  { code: "hy", tag: "hy", label: "Հայերեն", dir: "ltr" },
  { code: "ka", tag: "ka", label: "ქართული", dir: "ltr" },
  { code: "am", tag: "am", label: "አማርኛ", dir: "ltr" },
  { code: "so", tag: "so", label: "Soomaali", dir: "ltr" },
  { code: "sw", tag: "sw", label: "Kiswahili", dir: "ltr" },
];

export const DEFAULT_LOCALE: LocaleCode = "en";

const BY_CODE = new Map(LOCALES.map((l) => [l.code, l]));

export function isLocaleCode(s: string | undefined): s is LocaleCode {
  return Boolean(s && BY_CODE.has(s as LocaleCode));
}

export function localeInfo(code: LocaleCode): Locale {
  return BY_CODE.get(code)!;
}

/** "/de/pricing" → { locale: "de", path: "/pricing" }; "/pricing" → en. */
export function splitLocale(pathname: string): { locale: LocaleCode; path: string } {
  const m = pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)(?=\/|$)(.*)$/);
  if (m && m[1] !== DEFAULT_LOCALE && isLocaleCode(m[1])) {
    return { locale: m[1], path: m[2] || "/" };
  }
  return { locale: DEFAULT_LOCALE, path: pathname || "/" };
}

/**
 * A root-relative path in a language. Leaves external URLs, mailto: and bare
 * hashes alone, and never double-prefixes.
 */
export function localizePath(path: string, locale: LocaleCode): string {
  if (locale === DEFAULT_LOCALE || !path.startsWith("/") || path.startsWith("//")) return path;
  const already = splitLocale(path.split(/[?#]/)[0]!);
  if (already.locale !== DEFAULT_LOCALE) return path;
  if (path === "/") return `/${locale}`;
  if (path.startsWith("/#") || path.startsWith("/?")) return `/${locale}${path.slice(1)}`;
  return `/${locale}${path}`;
}

/** Sign-in and sign-up speak the person's own language: one address for all. */
const UNPREFIXED = /^\/(login|signup)(?=[/?#]|$)/;

/** A link target in this page's language: localizePath, except sign-in/up. */
export function localHref(path: string, locale: LocaleCode): string {
  return UNPREFIXED.test(path) ? path : localizePath(path, locale);
}

/**
 * Pages written out in every language, which get their own canonical URL and
 * hreflang alternates. Everything else can still be opened under a language
 * prefix — the menus and footer are translated — but its body is English, so
 * it points search engines at the English original (as Lovable does).
 */
export function isTranslatedPath(path: string): boolean {
  const p = path.replace(/\/+$/, "") || "/";
  return (
    p === "/" ||
    p === "/home" ||
    p === "/pricing" ||
    p === "/faq" ||
    p === "/about" ||
    p === "/download" ||
    p === "/use-cases" ||
    p === "/guides" ||
    p === "/blog" ||
    /^\/(guides|blog)\/category\/[^/]+$/.test(p) ||
    ALL_SOLUTION_PATHS.includes(p)
  );
}
