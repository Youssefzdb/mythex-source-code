/**
 * The app's strings in the person's language, and the formatters that go with
 * them.
 *
 *   const t = useT();
 *   <button>{t.common.cancel}</button>
 *   fill(t.chat.renamed, { name })        // "{name}" placeholders
 *   pl(t.common.credits, 3)               // counts: "3 credits"
 *   formatRelative(date)                  // "5 minutes ago", in the language
 *
 * Outside React (a hook's toast, a lib function), `appT()` gives the same
 * catalog. English ships with the app; another language is one chunk, loaded
 * before the first render and whenever the language changes, so a screen
 * never shows half of one language and half of another.
 */
import { useSyncExternalStore } from "react";
import { appEn, type AppMessages } from "./en";
import type { Plural } from "./plural";
import { fill } from "../index";
import { DEFAULT_LOCALE, localeInfo, type LocaleCode } from "../locales";

export type { AppMessages, AppArea } from "./en";
export type { Plural } from "./plural";
export { plural } from "./plural";
export { fill } from "../index";

const CATALOGS: Partial<Record<LocaleCode, AppMessages>> = { en: appEn };

const LOADERS: Record<Exclude<LocaleCode, "en">, () => Promise<{ default: AppMessages }>> = {
  "pt-br": () => import("./pt-br"),
  de: () => import("./de"),
  fr: () => import("./fr"),
  es: () => import("./es"),
  it: () => import("./it"),
  hi: () => import("./hi"),
  id: () => import("./id"),
  th: () => import("./th"),
  ko: () => import("./ko"),
  ja: () => import("./ja"),
  ar: () => import("./ar"),
  "zh-cn": () => import("./zh-cn"),
  "zh-tw": () => import("./zh-tw"),
  "zh-hk": () => import("./zh-hk"),
  ru: () => import("./ru"),
  tr: () => import("./tr"),
  vi: () => import("./vi"),
  pl: () => import("./pl"),
  nl: () => import("./nl"),
  uk: () => import("./uk"),
  fa: () => import("./fa"),
  ur: () => import("./ur"),
  "es-es": () => import("./es-es"),
  "fr-ca": () => import("./fr-ca"),
  "pt-pt": () => import("./pt-pt"),
  sq: () => import("./sq"),
  bs: () => import("./bs"),
  bg: () => import("./bg"),
  ca: () => import("./ca"),
  hr: () => import("./hr"),
  cs: () => import("./cs"),
  da: () => import("./da"),
  et: () => import("./et"),
  fi: () => import("./fi"),
  el: () => import("./el"),
  hu: () => import("./hu"),
  is: () => import("./is"),
  lv: () => import("./lv"),
  lt: () => import("./lt"),
  mk: () => import("./mk"),
  nb: () => import("./nb"),
  ro: () => import("./ro"),
  sr: () => import("./sr"),
  sk: () => import("./sk"),
  sl: () => import("./sl"),
  sv: () => import("./sv"),
  bn: () => import("./bn"),
  gu: () => import("./gu"),
  kn: () => import("./kn"),
  ml: () => import("./ml"),
  mr: () => import("./mr"),
  pa: () => import("./pa"),
  ta: () => import("./ta"),
  te: () => import("./te"),
  ms: () => import("./ms"),
  tl: () => import("./tl"),
  my: () => import("./my"),
  kk: () => import("./kk"),
  mn: () => import("./mn"),
  hy: () => import("./hy"),
  ka: () => import("./ka"),
  am: () => import("./am"),
  so: () => import("./so"),
  sw: () => import("./sw"),
};

/** Load a language's app strings. Resolves either way; a failure stays English. */
export async function loadAppCatalog(code: LocaleCode): Promise<boolean> {
  if (CATALOGS[code]) return true;
  try {
    CATALOGS[code] = (await LOADERS[code as Exclude<LocaleCode, "en">]()).default;
    return true;
  } catch {
    // An old tab after a deploy can't find the chunk: stay on what we have.
    return false;
  }
}

/** A language's strings if they are loaded (see loadAppCatalog). */
export function appCatalog(code: LocaleCode): AppMessages | undefined {
  return code === DEFAULT_LOCALE ? appEn : CATALOGS[code];
}

/** For tests and prerender: put a catalog in memory directly. */
export function registerAppCatalog(code: LocaleCode, messages: AppMessages): void {
  CATALOGS[code] = messages;
}

// ── The current language ─────────────────────────────────────────────────

let current: LocaleCode = DEFAULT_LOCALE;
const listeners = new Set<() => void>();

export function appLocale(): LocaleCode {
  return current;
}

/**
 * Switch the app's language. Only switches once the strings are loaded, so
 * the screen goes from one whole language to the other.
 */
export async function setAppLocale(code: LocaleCode): Promise<void> {
  const ok = await loadAppCatalog(code);
  const next = ok ? code : DEFAULT_LOCALE;
  if (next === current) return;
  current = next;
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The app's strings; the component re-renders when the language changes. */
export function useT(): AppMessages {
  const code = useSyncExternalStore(subscribe, appLocale, appLocale);
  return CATALOGS[code] ?? appEn;
}

/** The current language code, reactive. */
export function useAppLocale(): LocaleCode {
  return useSyncExternalStore(subscribe, appLocale, appLocale);
}

/** The app's strings outside React. Read it at the moment you need the text. */
export function appT(): AppMessages {
  return CATALOGS[current] ?? appEn;
}

// ── Formatting ───────────────────────────────────────────────────────────

/**
 * The BCP 47 tag for Intl, always with Latin digits: Arabic, Persian, Bengali,
 * Marathi and Burmese would otherwise switch to their own numerals, and the
 * app's prices, credits and code read the same everywhere (as ChatGPT does).
 */
export function intlTag(code: LocaleCode = current): string {
  return `${localeInfo(code).tag}-u-nu-latn`;
}

/** Pick the form for a count and fill {n} (plus any other values). */
export function pl(
  forms: Plural,
  n: number,
  values: Record<string, string | number> = {},
  code: LocaleCode = current,
): string {
  const cat = new Intl.PluralRules(intlTag(code)).select(n) as keyof Plural;
  const template = forms[cat] ?? forms.other;
  return fill(template, { n: formatNumber(n, undefined, code), ...values });
}

export function formatNumber(
  n: number,
  opts?: Intl.NumberFormatOptions,
  code: LocaleCode = current,
): string {
  return new Intl.NumberFormat(intlTag(code), opts).format(n);
}

/** A date (and time, when asked) in the language's own order and month names. */
export function formatDate(
  value: Date | string | number,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
  code: LocaleCode = current,
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(intlTag(code), opts).format(d);
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "5 minutes ago", "in 2 days", "just now" — in the current language. */
export function formatRelative(
  value: Date | string | number,
  now: number = Date.now(),
  code: LocaleCode = current,
): string {
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.round((t - now) / 1000);
  const abs = Math.abs(diff);
  if (abs < 45) return (CATALOGS[code] ?? appEn).common.justNow;
  const rtf = new Intl.RelativeTimeFormat(intlTag(code), { numeric: "auto" });
  for (const [unit, secs] of UNITS) {
    if (abs >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return rtf.format(Math.round(diff / 60), "minute");
}
