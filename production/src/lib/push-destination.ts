import { canSell } from "./native";

/**
 * Where a notification is allowed to send someone, in this build.
 *
 * The path comes from the server, so it is whatever a campaign was written
 * against — and what a campaign is written against is the website. The app is
 * not the website: `/billing` is absent from it entirely, because App Review
 * guideline 3.1.1 forbids steering anyone to a purchase outside the store, so
 * the route is not registered rather than merely hidden. Measured on the
 * emulator: an offer linking to "/billing?highlight=plans" opened the app on
 * "Page not found".
 *
 * A notification we sent must never dead-end. Anything this build cannot open
 * falls back to the home screen, which is at least the thing the offer was
 * about.
 */
export function pushDestination(path: string | null | undefined): string {
  return resolvePushPath(path, canSell());
}

/**
 * The rule on its own, so it can be tested without a Capacitor runtime.
 * `selling` is `canSell()`: true in a browser, false in either shell.
 */
export function resolvePushPath(path: string | null | undefined, selling: boolean): string {
  const target = path?.trim();
  // Only in-app paths. "//evil.com" is a protocol-relative URL, not a path,
  // and a notification that could navigate anywhere is a phishing primitive.
  if (!target || !target.startsWith("/") || target.startsWith("//")) return "/";

  // Everything under /billing — the page, its sub-pages, and any query on
  // them — exists on the web alone.
  if (!selling && /^\/billing(?:[/?#]|$)/.test(target)) return "/";

  return target;
}
