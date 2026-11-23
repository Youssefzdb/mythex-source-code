/**
 * The titles of the translated pages in a language, from
 * /l10n-titles/{lang}.json (written by prerender): lists and "related" links
 * name the pages they point to in the page's language. Loaded once per
 * language; until it arrives, or for a page it lacks, the English title stays.
 */
import { useEffect, useState } from "react";

type Titles = Record<string, [string] | [string, string]>;

const CACHE = new Map<string, Titles | null>();
const INFLIGHT = new Map<string, Promise<Titles | null>>();

function load(lang: string): Promise<Titles | null> {
  const pending = INFLIGHT.get(lang);
  if (pending) return pending;
  const p = fetch(`/l10n-titles/${lang}.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Titles>) : null))
    .catch(() => null)
    .then((titles) => {
      CACHE.set(lang, titles);
      return titles;
    });
  INFLIGHT.set(lang, p);
  return p;
}

/** Load this language's page titles before the first render (main.tsx), so nothing shows in English first. */
export function preloadL10nTitles(lang: string): Promise<unknown> {
  return lang === "en" ? Promise.resolve() : load(lang);
}

export type L10nTitle = { title: string; description?: string };

/** A lookup from an English path ("/ai/x", "/guides/y") to its title in `lang`; undefined in English or for an untranslated page. */
export function useL10nTitles(lang: string): (englishPath: string) => L10nTitle | undefined {
  const [titles, setTitles] = useState(() => (lang === "en" ? null : CACHE.get(lang)));
  useEffect(() => {
    if (lang === "en") return void setTitles(null);
    if (CACHE.has(lang)) return void setTitles(CACHE.get(lang));
    let live = true;
    void load(lang).then((t) => live && setTitles(t));
    return () => {
      live = false;
    };
  }, [lang]);
  return (englishPath) => {
    const t = titles?.[englishPath];
    return t ? { title: t[0], description: t[1] } : undefined;
  };
}
