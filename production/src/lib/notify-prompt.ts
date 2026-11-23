/**
 * When to offer browser notifications, and what a "not now" costs.
 *
 * A browser's permission prompt is one-shot in a way a phone's sheet is not.
 * A decline is permanent and only the person can undo it from site settings,
 * and Chrome puts a site that asks on page load into the quiet UI, where the
 * prompt stops appearing at all. So the asking is rationed, and the rationing
 * lives here rather than in the component, because it is the part with rules.
 *
 * The hard case is the one the platform will not tell you about: closing the
 * prompt without choosing leaves permission at "default", indistinguishable
 * from never having asked. Treated as a decline it would silence someone who
 * meant "later"; treated as nothing it would ask them forever. So it backs
 * off, further each time, and stops.
 */

export const SNOOZE_KEY = "mythex.notify.snoozedUntil";
export const DISMISSALS_KEY = "mythex.notify.dismissals";

/**
 * How long each successive dismissal buys, in days.
 *
 * The third is not a "not now", it is a no.
 */
export const SNOOZE_DAYS = [3, 14, Number.POSITIVE_INFINITY];

type Store = Pick<Storage, "getItem" | "setItem">;

function readNumber(store: Store, key: string): number {
  try {
    return Number(store.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function writeNumber(store: Store, key: string, value: number): void {
  try {
    store.setItem(key, String(value));
  } catch {
    // A browser that will not store this asks again next time — the wrong
    // behaviour, but not a broken one.
  }
}

/** Whether a previous dismissal is still in force. */
export function isSnoozed(store: Store, now = Date.now()): boolean {
  const until = readNumber(store, SNOOZE_KEY);
  return until > 0 && now < until;
}

/**
 * Record a dismissal and set the next window. Returns when it expires, which
 * is `Infinity` once they have said no often enough to mean it.
 */
export function recordDismissal(store: Store, now = Date.now()): number {
  const count = readNumber(store, DISMISSALS_KEY) + 1;
  writeNumber(store, DISMISSALS_KEY, count);
  const days = SNOOZE_DAYS[Math.min(count, SNOOZE_DAYS.length) - 1];
  const until = days === Number.POSITIVE_INFINITY ? Number.MAX_SAFE_INTEGER : now + days * 86_400_000;
  writeNumber(store, SNOOZE_KEY, until);
  return until;
}

/**
 * The whole gate.
 *
 * `permission` is the browser's, or "unsupported" where the question does not
 * arise — a native shell, which has its own sheet, or a browser without the
 * Push API at all. "granted" is excluded for the obvious reason and "denied"
 * because nothing on this page can undo it.
 */
export function shouldOfferNotifications(
  permission: NotificationPermission | "unsupported",
  store: Store,
  now = Date.now(),
): boolean {
  if (permission !== "default") return false;
  return !isSnoozed(store, now);
}
