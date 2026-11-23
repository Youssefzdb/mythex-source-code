import { Capacitor } from "@capacitor/core";
import { isNative } from "./native";

/**
 * The store's own "Rate this app" sheet (Apple's / Google's), in the app only.
 *
 * Asked at a good moment — an app just went live — never on first open. Apple
 * shows it at most 3 times a year and Google rations it too; we ask less than
 * that: once per 120 days, at most 3 times ever. Each platform decides whether
 * the sheet actually appears, and neither says whether it did or what was
 * rated, so there is nothing to wait on or report.
 *
 * App builds from before the plugin (1.0.8 and older) have no native side; the
 * availability check makes this a no-op there, so the web bundle that calls it
 * still runs on them and they keep receiving live updates.
 */
const KEY = "mythex.appReview";
const GAP_MS = 120 * 24 * 60 * 60 * 1000;
const MAX_ASKS = 3;
/** Long enough for the success state to show first; the sheet over a spinner reads as an error. */
const DELAY_MS = 2500;

type Asked = { at: number; count: number };

function readAsked(): Asked {
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Partial<Asked>) : null;
    return { at: Number(v?.at) || 0, count: Number(v?.count) || 0 };
  } catch {
    return { at: 0, count: 0 };
  }
}

export function canAskForReview(now = Date.now()): boolean {
  if (!isNative() || !Capacitor.isPluginAvailable("InAppReview")) return false;
  const asked = readAsked();
  return asked.count < MAX_ASKS && now - asked.at >= GAP_MS;
}

export function maybeAskForReview(): void {
  if (!canAskForReview()) return;
  // Claimed now, before the delay: two publishes finishing together ask once.
  const asked = readAsked();
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), count: asked.count + 1 }));
  } catch {
    return; // Can't remember asking — don't risk asking every time.
  }
  window.setTimeout(() => {
    void import("@capacitor-community/in-app-review")
      .then(({ InAppReview }) => InAppReview.requestReview())
      .catch(() => {});
  }, DELAY_MS);
}
