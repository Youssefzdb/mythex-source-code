import { isNative, nativePlatform } from "./native";
import { trackAppEvent } from "./analytics";

/**
 * When the app is actually open, which a WebView cannot tell you on its own.
 *
 * PostHog's autocapture measures a *page*: it records a pageview on load and
 * then hears nothing until the next navigation. That is the whole story in a
 * browser tab, where closing the tab tears the page down. In a shell it is
 * not: the WebView stays alive and on the same route for days while the
 * person opens and closes the app around it, so one launch and thirty
 * sessions look identical — a single pageview, and a "session" that PostHog
 * eventually times out on its own.
 *
 * These two events are the real session boundaries, and they are what makes
 * app retention answerable at all.
 */

let attached = false;

/** Foreground/background events, once per process. Safe to call repeatedly. */
export async function initAppLifecycle(): Promise<void> {
  if (!isNative() || attached) return;
  attached = true;

  try {
    const { App } = await import("@capacitor/app");
    const platform = nativePlatform();

    // The first foreground is the launch itself: `appStateChange` does not
    // fire for the state the app started in, so without this every session
    // count is short by one and cold starts are invisible.
    trackAppEvent("app_opened", { platform, cold_start: true });

    await App.addListener("appStateChange", ({ isActive }) => {
      trackAppEvent(isActive ? "app_opened" : "app_backgrounded", {
        platform,
        cold_start: false,
      });
    });
  } catch {
    // A shell whose lifecycle we cannot observe still runs. Losing session
    // boundaries is a reporting gap, not a failure worth surfacing.
    attached = false;
  }
}
