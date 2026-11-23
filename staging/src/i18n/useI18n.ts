/**
 * The current language, from the URL, with its messages and a path helper.
 *
 *   const { m, lp, locale } = useI18n();
 *   <Link to={lp("/pricing")}>{m.nav.pricing}</Link>
 */
import { useLocation } from "react-router-dom";
import { messagesFor } from "./index";
import { useAppLocale } from "./app";
import { pageLocale } from "./app-locale";
import { localHref, splitLocale, type LocaleCode } from "./locales";
import { peekSessionHint } from "../lib/session-hint";

export function useI18n() {
  const { pathname } = useLocation();
  const appCode = useAppLocale();
  const { path } = splitLocale(pathname);
  // A public page speaks its URL's language; sign-in, the 404 page and the
  // rest of the app speak the person's.
  const locale = pageLocale(pathname, appCode, peekSessionHint());
  return {
    locale,
    /** The path without its language prefix: what the page is. */
    path,
    m: messagesFor(locale),
    lp: (to: string, code: LocaleCode = locale) => localHref(to, code),
  };
}
