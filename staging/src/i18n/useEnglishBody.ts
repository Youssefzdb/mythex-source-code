/**
 * Attributes for a page's content element when its words are English under a
 * language prefix (/ar/terms, /ar/ai/type/booking: canonical to the English
 * page). <html lang dir> stays the page's language, since the menus, footer
 * and buttons are in it; only the English passage is marked as English.
 */
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { metaForPath, onMarketingMetaReady } from "../lib/seo-meta";
import { onL10nPageLoaded } from "../l10n/page";
import { DEFAULT_LOCALE, splitLocale } from "./locales";

export function useEnglishBody(): { lang?: string; dir?: "ltr" } {
  const { pathname } = useLocation();
  // The meta that knows the canonical can land after the first render (the
  // marketing chunk, a translation fetched on navigation): look again then.
  const [, setVersion] = useState(0);
  useEffect(() => onMarketingMetaReady(() => setVersion((n) => n + 1)), []);
  useEffect(() => onL10nPageLoaded(() => setVersion((n) => n + 1)), []);
  if (splitLocale(pathname).locale === DEFAULT_LOCALE) return {};
  const canonical = metaForPath(pathname).canonicalPath;
  return canonical != null && splitLocale(canonical).locale === DEFAULT_LOCALE ? { lang: "en", dir: "ltr" } : {};
}
