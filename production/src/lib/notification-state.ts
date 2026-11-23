/**
 * What to say about notifications, and what to offer doing about it.
 *
 * Three platforms, three different ways of saying no, and only one of them
 * leaves a route back that the app itself can take:
 *
 *  - A browser's prompt can be declined once and then never shown again. Only
 *    the site settings behind the address bar can undo it, and no page can
 *    open those.
 *  - Android stops showing the runtime prompt after two declines, but the
 *    system's per-app notification screen can be opened from code.
 *  - iOS shows its prompt exactly once, ever. After that the Settings app is
 *    the only route, and it can be opened with a URL.
 *
 * The one thing none of them permits is asking again and hoping. So the state
 * and the offer are worked out here, in one place, with the copy that goes
 * with each — rather than a component guessing per platform.
 */

import { appT } from "../i18n/app";

export type NotificationState =
  /** No Push API at all: an old browser, or Safari before the site is installed. */
  | "unsupported"
  /** Never asked. The only state where asking is allowed. */
  | "default"
  /** Subscribed. */
  | "granted"
  /** Declined. Nothing in the app can change it. */
  | "denied";

export type NotificationOffer =
  /** Show a button that triggers the platform prompt. */
  | { kind: "ask"; label: string }
  /** Show a button that opens the system's own settings screen. */
  | { kind: "open-settings"; label: string; hint: string }
  /** Say where to go; there is no button that can get there. */
  | { kind: "explain"; hint: string }
  /** Nothing to show. */
  | { kind: "none" };

export type Platform = "web" | "ios" | "android";

/** The words for the current state, for a status row. */
export function notificationStatusLabel(state: NotificationState): string {
  const t = appT().shell.notifications;
  switch (state) {
    case "granted":
      return t.on;
    case "denied":
      return t.blocked;
    case "unsupported":
      return t.unsupported;
    default:
      return t.off;
  }
}

/**
 * What the app may offer, given where it is running and what was decided.
 *
 * The asymmetry is the point: a phone can open its own settings, a browser
 * cannot, so a browser gets a sentence instead of a button that would do
 * nothing.
 */
export function notificationOffer(
  state: NotificationState,
  platform: Platform,
): NotificationOffer {
  if (state === "granted" || state === "unsupported") return { kind: "none" };
  const t = appT().shell.notifications;

  if (state === "default") {
    return { kind: "ask", label: t.turnOn };
  }

  // Denied. Whether there is a button depends on whether anything can be
  // opened from here.
  if (platform === "android" || platform === "ios") {
    return {
      kind: "open-settings",
      label: t.openSettings,
      hint: platform === "ios" ? t.iosHint : t.androidHint,
    };
  }

  return {
    kind: "explain",
    hint: t.webHint,
  };
}
