/**
 * The creator program's words in the page's language: the partner page
 * (/partners), its application form, the partner dashboard, the account
 * menu's link and the Solutions menu's line. English (en-creators.ts) is
 * bundled and is the fallback; each other language is ./<code>.ts, loaded on
 * demand, and only has to give what's shown (CreatorsUi).
 */
import { useEffect, useState } from "react";
import type { LocaleCode } from "../../locales";
import { enCreatorsUi, type CreatorsUi } from "../en-creators-ui";

export { enCreatorsUi, type CreatorsUi };

const loaders = import.meta.glob<{ default: CreatorsUi }>(["./*.ts", "!./index.ts"]);
const cache = new Map<string, CreatorsUi>([["en", enCreatorsUi]]);

export async function loadCreators(code: LocaleCode | string): Promise<CreatorsUi> {
  const hit = cache.get(code);
  if (hit) return hit;
  const load = loaders[`./${code}.ts`];
  if (!load) return enCreatorsUi;
  try {
    const copy = (await load()).default;
    cache.set(code, copy);
    return copy;
  } catch {
    return enCreatorsUi;
  }
}

/** Already loaded (or English): for places that can't wait, like page titles. */
export function creatorsLoaded(code: string): CreatorsUi | undefined {
  return cache.get(code);
}

/** The creator words for this language — English until they've loaded. */
/** Whether this language's creator-program words are in hand (see useSolutionsReady). */
export function useCreatorsReady(code: LocaleCode | string): boolean {
  const [ready, setReady] = useState(() => cache.has(code));
  useEffect(() => {
    if (cache.has(code)) return void setReady(true);
    setReady(false);
    let live = true;
    void loadCreators(code).then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [code]);
  return ready;
}

export function useCreators(code: LocaleCode | string): CreatorsUi {
  const [copy, setCopy] = useState<CreatorsUi>(() => cache.get(code) ?? enCreatorsUi);
  useEffect(() => {
    let live = true;
    void loadCreators(code).then((c) => live && setCopy(c));
    return () => {
      live = false;
    };
  }, [code]);
  return copy;
}
