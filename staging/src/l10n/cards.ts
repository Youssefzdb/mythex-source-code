/**
 * Template card words in the page's language, from /l10n-cards/{lang}.json
 * (written by prerender from every template's translation). Loaded once per
 * language; until it arrives, or for a template it lacks, cards stay English.
 */
import { useEffect, useState } from "react";

export type CardText = { title: string; tagline: string };
type Cards = Record<string, CardText>;

const CACHE = new Map<string, Cards | null>();
const INFLIGHT = new Map<string, Promise<Cards | null>>();

function load(lang: string): Promise<Cards | null> {
  const pending = INFLIGHT.get(lang);
  if (pending) return pending;
  const p = fetch(`/l10n-cards/${lang}.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Cards>) : null))
    .catch(() => null)
    .then((cards) => {
      CACHE.set(lang, cards);
      return cards;
    });
  INFLIGHT.set(lang, p);
  return p;
}

/** Load this language's template card words before the first render (main.tsx), so nothing shows in English first. */
export function preloadTemplateCards(lang: string): Promise<unknown> {
  return lang === "en" ? Promise.resolve() : load(lang);
}

/** The card text for "<category>/<slug>" in this language, if it is translated. */
export function useTemplateCardText(lang: string, key: string): CardText | undefined {
  return useTemplateCards(lang)?.[key];
}

/** Every template's card text in this language, keyed "<category>/<slug>" (null for English or until it loads). */
export function useTemplateCards(lang: string): Cards | null | undefined {
  const [cards, setCards] = useState(() => (lang === "en" ? null : CACHE.get(lang)));
  useEffect(() => {
    if (lang === "en") return void setCards(null);
    if (CACHE.has(lang)) return void setCards(CACHE.get(lang));
    let live = true;
    void load(lang).then((c) => live && setCards(c));
    return () => {
      live = false;
    };
  }, [lang]);
  return cards;
}
