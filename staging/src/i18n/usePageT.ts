/**
 * The app's strings in the page's language. Inside the app that is the
 * person's language (same as useT); on a marketing page it is the URL's, so
 * the prompt box on /ar speaks Arabic even when the person picked Slovak.
 */
import { useEffect, useState } from "react";
import { appCatalog, loadAppCatalog, useT } from "./app";
import type { AppMessages } from "./app/en";
import { useI18n } from "./useI18n";

export function usePageT(): AppMessages {
  const { locale } = useI18n();
  const app = useT();
  const [, setLoaded] = useState(0);
  const page = appCatalog(locale);
  useEffect(() => {
    if (!page) void loadAppCatalog(locale).then((ok) => ok && setLoaded((n) => n + 1));
  }, [locale, page]);
  return page ?? app;
}
