/**
 * A translated marketing page (l10n/{lang}/{type}/{slug}.json) as the browser
 * gets it: prerender embeds the translation in the page's own HTML as
 * <script type="application/json" id="l10n-page">, so the first load needs no
 * second request, and moving to another translated page fetches that page's
 * HTML and reads the same script. No list of translated pages ships in the
 * bundle: a page that comes back without the script has no translation, and
 * the English page renders instead.
 */
import { useEffect, useState } from "react";
import type { L10nUi } from "./ui-en";
import { DEFAULT_LOCALE, splitLocale } from "../i18n/locales";
import type { L10nWords } from "./pages-en";

export type L10nPage = {
  lang: string;
  type: string;
  slug: string;
  /** The localized path, e.g. /ar/ai/builder. */
  path: string;
  doc: Record<string, unknown>;
  ui: L10nUi;
  /** Locales (besides English) this page exists in. */
  langs: string[];
  /** Related pages in the same language, picked by prerender. */
  links?: Array<{ to: string; label: string }>;
  /** This page type's controls in its language (l10n/{lang}/ui/pages.json). */
  words?: Partial<L10nWords> & { industries?: Record<string, string> };
};

const SCRIPT_ID = "l10n-page";
const LANGS_ID = "l10n-langs";
const CACHE = new Map<string, L10nPage | null>();
/** English path → locales that have it, from the pages seen so far. */
const LANGS = new Map<string, string[]>();

const englishPathOf = (page: L10nPage) => clean(page.path.replace(new RegExp(`^/${page.lang}(?=/|$)`), "")) ;

function remember(page: L10nPage): void {
  CACHE.set(clean(page.path), page);
  LANGS.set(englishPathOf(page), page.langs);
}

/** Told when a translation arrives after navigation, so the head can be redone. */
const LOADED = new Set<() => void>();
export function onL10nPageLoaded(listener: () => void): () => void {
  LOADED.add(listener);
  return () => void LOADED.delete(listener);
}
const INFLIGHT = new Map<string, Promise<L10nPage | null>>();

const clean = (p: string) => p.replace(/\/+$/, "") || "/";

function parse(json: string): L10nPage | null {
  try {
    return JSON.parse(json) as L10nPage;
  } catch {
    return null;
  }
}

/** The page the HTML was prerendered for, read once at startup. */
function fromDocument(): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById(SCRIPT_ID);
  const page = el?.textContent ? parse(el.textContent) : null;
  if (page) remember(page);
  // An English page lists the languages it is translated into.
  const langs = document.getElementById(LANGS_ID)?.textContent;
  if (langs) {
    try {
      const v = JSON.parse(langs) as { path: string; langs: string[] };
      LANGS.set(clean(v.path), v.langs);
    } catch {
      /* ignore */
    }
  }
}
fromDocument();

export function cachedL10nPage(path: string): L10nPage | null | undefined {
  return CACHE.get(clean(path));
}

export function loadL10nPage(path: string): Promise<L10nPage | null> {
  const key = clean(path);
  if (CACHE.has(key)) return Promise.resolve(CACHE.get(key)!);
  const pending = INFLIGHT.get(key);
  if (pending) return pending;
  const p = fetch(key, { headers: { accept: "text/html" } })
    .then((r) => (r.ok ? r.text() : ""))
    .then((html) => {
      const m = html.match(/<script type="application\/json" id="l10n-page">([\s\S]*?)<\/script>/);
      const page = m ? parse(m[1]!) : null;
      const found = page && clean(page.path) === key ? page : null;
      if (found) {
        remember(found);
        for (const l of LOADED) l();
      } else CACHE.set(key, null);
      return found;
    })
    .catch(() => null)
    .finally(() => INFLIGHT.delete(key));
  INFLIGHT.set(key, p);
  return p;
}

/**
 * The translation for this path, when the path has a language prefix.
 * undefined while loading, null when the page has no translation.
 */
export function useL10nPage(path: string, wanted: boolean): L10nPage | null | undefined {
  const key = clean(path);
  const [page, setPage] = useState<L10nPage | null | undefined>(() => (wanted ? cachedL10nPage(key) : null));
  useEffect(() => {
    if (!wanted) return void setPage(null);
    const cached = cachedL10nPage(key);
    if (cached !== undefined) return void setPage(cached);
    setPage(undefined);
    let live = true;
    void loadL10nPage(key).then((p) => live && setPage(p));
    return () => {
      live = false;
    };
  }, [key, wanted]);
  return page;
}

/** Fill "{name}"-style slots in a UI label. */
export function fill(label: string, values: Record<string, string | number>): string {
  return label.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ""));
}

/** Locales (besides English) the English page at this path is translated into, if known. */
export function l10nLangsFor(englishPath: string): string[] | undefined {
  return LANGS.get(clean(englishPath));
}

/** Title and description of a translated page, whatever its type. */
export function l10nPageMeta(page: Pick<L10nPage, "type" | "doc">): { title: string; description: string } {
  const d = page.doc as Record<string, string | null | undefined>;
  if (page.type === "guides" || page.type === "blog") {
    return { title: d.metaTitle || `${d.title} | Mythex`, description: d.description ?? "" };
  }
  return { title: d.metaTitle ?? "", description: d.metaDescription ?? "" };
}

/**
 * Start fetching a translated page when the pointer or focus reaches its link,
 * so it is usually in hand by the click and the page shows no loading frame.
 * Only same-site /{lang}/… links; loadL10nPage caches and de-duplicates.
 * `alsoPreload` warms whatever else a path needs (main.tsx: Solutions copy).
 */
export function prefetchL10nOnIntent(alsoPreload?: (path: string) => unknown): void {
  if (typeof document === "undefined") return;
  const intent = (e: Event) => {
    const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a || a.origin !== location.origin || a.pathname === location.pathname) return;
    if (splitLocale(a.pathname).locale === DEFAULT_LOCALE) return;
    void loadL10nPage(a.pathname);
    // Pages whose words come from a catalog (Solutions, Partners) load theirs too.
    alsoPreload?.(a.pathname);
  };
  for (const type of ["pointerover", "focusin", "touchstart"]) document.addEventListener(type, intent, { passive: true });
}
