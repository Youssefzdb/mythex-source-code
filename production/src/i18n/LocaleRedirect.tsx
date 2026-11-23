/**
 * Keeps a person on their language's version of the public pages while they
 * move around inside the app. main.tsx does this on a full page load; this
 * does it for in-app navigation, so opening the landing page from the
 * dashboard in Arabic shows /ar, not the English page with Arabic buttons.
 *
 * Same rule as main.tsx: only the English originals of pages that exist in
 * every language, never "/" for someone signed in (that is their dashboard),
 * and never a page already under a prefix (someone chose that language).
 */
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppLocale } from "./app";
import { DEFAULT_LOCALE, isTranslatedPath, localizePath, splitLocale } from "./locales";
import { peekSessionHint } from "../lib/session-hint";
import { useAuth } from "../lib/auth";
import { pageLocale } from "./app-locale";
import { followSiteLanguage } from "./choose-locale";

export function LocaleRedirect() {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const appCode = useAppLocale();
  // Signing out on "/" turns the dashboard into the landing page in place.
  const { user, loading } = useAuth();
  const signedIn = !loading && !!user;

  // From a page in Arabic to sign-in, sign-up or the app: those follow the
  // person's language, and someone who never chose one was reading Arabic —
  // signed in or not (followSiteLanguage leaves a saved choice alone, and does
  // not save this one on the account).
  const from = useRef(pathname);
  useEffect(() => {
    const site = splitLocale(from.current).locale;
    from.current = pathname;
    if (loading || site === DEFAULT_LOCALE) return;
    const { locale } = splitLocale(pathname);
    // Still on a page whose language is its URL (another /ar page, or the English landing page).
    if (locale !== DEFAULT_LOCALE || pageLocale(pathname, site, !!user) !== site) return;
    followSiteLanguage(site);
  }, [pathname, loading, user]);

  useEffect(() => {
    if (appCode === DEFAULT_LOCALE) return;
    const { locale, path } = splitLocale(pathname);
    if (locale !== DEFAULT_LOCALE || !isTranslatedPath(path)) return;
    if (path === "/" && peekSessionHint()) return;
    navigate(localizePath(path, appCode) + search + hash, { replace: true });
  }, [pathname, search, hash, appCode, navigate, signedIn]);

  return null;
}
