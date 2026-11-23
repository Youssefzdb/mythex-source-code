import { localeInfo } from "../i18n/locales";
import { onL10nPageLoaded } from "../l10n/page";
import { appLocale, appT, useAppLocale } from "../i18n/app";
import { pageLocale } from "../i18n/app-locale";
import { peekSessionHint } from "./session-hint";
import { useAuth } from "./auth";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { alternatesForPath,
  SITE_NAME,
  DEFAULT_OG_IMAGE,
  type PageMeta,
  metaForPath,
  normalizePath,
  canonicalUrlFor,
  onMarketingMetaReady,
} from "./seo-meta";

export {
  SITE_ORIGIN,
  SITE_NAME,
  DEFAULT_OG_IMAGE,
  metaForPath,
  registerMarketingMeta,
  type PageMeta,
} from "./seo-meta";

function upsertMeta(
  attr: "name" | "property",
  key: string,
  content: string,
) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

/** Apply page meta to the document head (title, description, OG, Twitter, robots, canonical). */
export function applyPageMeta(meta: PageMeta, pathname: string) {
  const canonical = canonicalUrlFor(meta, pathname);
  const image = meta.image ?? DEFAULT_OG_IMAGE;
  const robots =
    import.meta.env.VITE_NOINDEX === "true" ? "noindex,nofollow" : (meta.robots ?? "index,follow");

  document.title = meta.title;

  upsertMeta("name", "description", meta.description);
  upsertMeta("name", "robots", robots);
  upsertMeta("name", "author", SITE_NAME);
  upsertMeta("name", "application-name", SITE_NAME);

  upsertMeta("property", "og:title", meta.title);
  upsertMeta("property", "og:description", meta.description);
  upsertMeta("property", "og:type", meta.ogType ?? "website");
  upsertMeta("property", "og:url", canonical);
  upsertMeta("property", "og:site_name", SITE_NAME);
  upsertMeta("property", "og:image", image);
  upsertMeta("property", "og:image:secure_url", image);
  upsertMeta("property", "og:image:type", "image/png");
  upsertMeta("property", "og:image:width", "1200");
  upsertMeta("property", "og:image:height", "630");
  upsertMeta("property", "og:image:alt", `${SITE_NAME} — AI App Builder`);

  upsertMeta("name", "twitter:card", "summary_large_image");
  upsertMeta("name", "twitter:site", "@mythexai");
  upsertMeta("name", "twitter:creator", "@mythexai");
  upsertMeta("name", "twitter:title", meta.title);
  upsertMeta("name", "twitter:description", meta.description);
  upsertMeta("name", "twitter:image", image);
  upsertMeta("name", "twitter:image:alt", `${SITE_NAME} — AI App Builder`);

  upsertLink("canonical", canonical);

  // Language: <html lang/dir>, og:locale, and hreflang links for pages that
  // exist in every language (replaced wholesale on each navigation).
  const locale = pageLocale(pathname, appLocale(), peekSessionHint());
  const info = localeInfo(locale);
  document.documentElement.lang = info.tag;
  document.documentElement.dir = info.dir;
  upsertMeta("property", "og:locale", info.tag.replace("-", "_"));
  for (const el of document.head.querySelectorAll('link[rel="alternate"][hreflang]')) el.remove();
  for (const alt of alternatesForPath(pathname)) {
    const link = document.createElement("link");
    link.rel = "alternate";
    link.hreflang = alt.hreflang;
    link.href = alt.href;
    document.head.appendChild(link);
  }
}

/**
 * The app screens' tab titles in the person's language. seo-meta stays
 * English (prerender and search engines read it); these pages are noindex,
 * so only the tab shows the translated name.
 */
function withAppTitle(meta: PageMeta, pathname: string): PageMeta {
  const p = normalizePath(pathname);
  const t = appT();
  const label = p.startsWith("/dashboard")
    ? t.shell.sidebar.projects
    : p.startsWith("/p/")
      ? t.shell.sidebar.workspace
      : p === "/settings" || p.startsWith("/settings/")
        ? t.common.settings
        : null;
  return label ? { ...meta, title: `${label} — ${SITE_NAME}` } : meta;
}

/** Keeps document head in sync with the current route. */
export function DocumentMeta() {
  const { pathname } = useLocation();
  // The app's pages carry the person's language in <html lang dir>.
  const appCode = useAppLocale();
  // "/" is the dashboard or the landing page depending on the session.
  const { user, loading } = useAuth();
  const signedIn = !loading && !!user;
  // The /ai and template pages resolve their meta from the marketing chunk,
  // which may land after the first paint; re-apply when it does.
  const [metaVersion, setMetaVersion] = useState(0);
  useEffect(() => onMarketingMetaReady(() => setMetaVersion((n) => n + 1)), []);
  // A translated page fetched after navigation brings its own title and language.
  useEffect(() => onL10nPageLoaded(() => setMetaVersion((n) => n + 1)), []);
  useEffect(() => {
    applyPageMeta(withAppTitle(metaForPath(pathname), pathname), pathname);
  }, [pathname, metaVersion, appCode, signedIn]);
  return null;
}
