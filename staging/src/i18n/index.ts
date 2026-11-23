/**
 * Message catalogs for the marketing site.
 *
 * English ships with the page. Every other language is its own chunk, loaded
 * once before the first render (main.tsx) and after that read synchronously —
 * switching language is a full navigation, so a page never renders half in one
 * language. Prerender registers every catalog up front.
 */
import { en, type Messages } from "./messages/en";
import { DEFAULT_LOCALE, type LocaleCode } from "./locales";

export type { Messages } from "./messages/en";

const CATALOGS: Partial<Record<LocaleCode, Messages>> = { en };

const LOADERS: Record<Exclude<LocaleCode, "en">, () => Promise<{ default: Messages }>> = {
  "pt-br": () => import("./messages/pt-br"),
  de: () => import("./messages/de"),
  fr: () => import("./messages/fr"),
  es: () => import("./messages/es"),
  it: () => import("./messages/it"),
  hi: () => import("./messages/hi"),
  id: () => import("./messages/id"),
  th: () => import("./messages/th"),
  ko: () => import("./messages/ko"),
  ja: () => import("./messages/ja"),
  ar: () => import("./messages/ar"),
  "zh-cn": () => import("./messages/zh-cn"),
  "zh-tw": () => import("./messages/zh-tw"),
  "zh-hk": () => import("./messages/zh-hk"),
  ru: () => import("./messages/ru"),
  tr: () => import("./messages/tr"),
  vi: () => import("./messages/vi"),
  pl: () => import("./messages/pl"),
  nl: () => import("./messages/nl"),
  uk: () => import("./messages/uk"),
  fa: () => import("./messages/fa"),
  ur: () => import("./messages/ur"),
  "es-es": () => import("./messages/es-es"),
  "fr-ca": () => import("./messages/fr-ca"),
  "pt-pt": () => import("./messages/pt-pt"),
  sq: () => import("./messages/sq"),
  bs: () => import("./messages/bs"),
  bg: () => import("./messages/bg"),
  ca: () => import("./messages/ca"),
  hr: () => import("./messages/hr"),
  cs: () => import("./messages/cs"),
  da: () => import("./messages/da"),
  et: () => import("./messages/et"),
  fi: () => import("./messages/fi"),
  el: () => import("./messages/el"),
  hu: () => import("./messages/hu"),
  is: () => import("./messages/is"),
  lv: () => import("./messages/lv"),
  lt: () => import("./messages/lt"),
  mk: () => import("./messages/mk"),
  nb: () => import("./messages/nb"),
  ro: () => import("./messages/ro"),
  sr: () => import("./messages/sr"),
  sk: () => import("./messages/sk"),
  sl: () => import("./messages/sl"),
  sv: () => import("./messages/sv"),
  bn: () => import("./messages/bn"),
  gu: () => import("./messages/gu"),
  kn: () => import("./messages/kn"),
  ml: () => import("./messages/ml"),
  mr: () => import("./messages/mr"),
  pa: () => import("./messages/pa"),
  ta: () => import("./messages/ta"),
  te: () => import("./messages/te"),
  ms: () => import("./messages/ms"),
  tl: () => import("./messages/tl"),
  my: () => import("./messages/my"),
  kk: () => import("./messages/kk"),
  mn: () => import("./messages/mn"),
  hy: () => import("./messages/hy"),
  ka: () => import("./messages/ka"),
  am: () => import("./messages/am"),
  so: () => import("./messages/so"),
  sw: () => import("./messages/sw"),
};

export function registerCatalog(code: LocaleCode, messages: Messages): void {
  CATALOGS[code] = messages;
}

/** Load a language's catalog if it is not in memory. Resolves to English on failure. */
export async function loadCatalog(code: LocaleCode): Promise<void> {
  if (CATALOGS[code] || code === DEFAULT_LOCALE) return;
  try {
    CATALOGS[code] = (await LOADERS[code as Exclude<LocaleCode, "en">]()).default;
  } catch {
    // A missing chunk (an old tab after a deploy) falls back to English.
  }
}

/** The catalog for a language, or English while it is not loaded. */
export function messagesFor(code: LocaleCode): Messages & typeof en {
  const m = CATALOGS[code];
  if (!m) return en;
  // Fill English-only keys once, so the catalog stays the same object.
  if (!m.solutionsMenu) m.solutionsMenu = en.solutionsMenu;
  if (!m.referral) m.referral = en.referral;
  return m as Messages & typeof en;
}

/** "{n} min read" style interpolation. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? `{${k}}`));
}

/** A message by dotted key ("nav.pricing"); the key itself if it is not one. */
export function t(m: Messages, key: string): string {
  let cur: unknown = m;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  return typeof cur === "string" ? cur : key;
}
