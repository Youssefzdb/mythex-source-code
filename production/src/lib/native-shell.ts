import { isNative, nativePlatform } from "./native";
import { initSafeArea } from "./safe-area";
import { initAppLifecycle } from "./app-lifecycle";
import { initNativeKeyboard } from "./native-keyboard";
import { applyUpdateAtLaunch, markAppReady } from "./app-version";
import { initForceUpdate } from "./force-update";

/**
 * Everything the shell has to do once, at boot.
 *
 * All of it is dynamically imported: the plugins pull in native bridges that a
 * browser has no use for, and importing them at the top level would put the
 * whole set on the web bundle's critical path for nothing.
 *
 * Nothing here throws outward. A shell that fails to set its status bar colour
 * should look slightly wrong, not fail to start.
 */
export async function initNativeShell(): Promise<void> {
  if (!isNative()) return;
  const platform = nativePlatform();

  // The status bar sits over the page (viewport-fit=cover), so the app paints
  // behind it and the text on top of it has to be light or it vanishes.
  // Two calls, two try blocks: sharing one meant a failure in the first
  // silently skipped the second, and the one that matters visually is the
  // second. Android's theme already paints the bars (see styles.xml) — this is
  // what makes the page draw *under* them.
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    // Not fatal — the bar keeps whatever the theme gave it.
  }
  if (platform === "android") {
    try {
      const { StatusBar } = await import("@capacitor/status-bar");
      await StatusBar.setOverlaysWebView({ overlay: true });
    } catch {
      // Not fatal — the page then starts below the bar instead of behind it.
    }
  }

  // Before the splash goes: the first painted frame should already be inset,
  // rather than laying out under the status bar and correcting itself.
  await initSafeArea();

  // Not awaited: listeners only, and nothing on screen depends on them until
  // the first input is focused.
  void initNativeKeyboard();

  // An update downloaded last time is applied now, under the splash, rather
  // than when the app next goes to the background (app-version.ts). The new
  // bundle starts from the top and hides the splash itself.
  if (await applyUpdateAtLaunch()) return;

  // This bundle started: without it the updater rolls back to the last good
  // bundle after 10 seconds (app-version.ts).
  void markAppReady();

  // Older than the minimum store version: "Update required" over everything
  // (force-update.ts). The last minimum seen applies at once, before the
  // splash goes; the server's answer follows, and again on every return.
  void initForceUpdate();

  // The splash stays until the app knows who is signed in (auth.tsx sends
  // mythex:session-known) and the first screen has drawn, so it opens straight
  // onto Sign in or the home screen rather than a skeleton. Never longer than 4s: a slow network or a
  // failed boot must not leave anyone on the splash.
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    const started = Date.now();
    await new Promise<void>((resolve) => {
      if ((window as { __mythexSessionKnown?: boolean }).__mythexSessionKnown) return resolve();
      window.addEventListener("mythex:session-known", () => resolve(), { once: true });
      window.setTimeout(resolve, 4000);
    });
    // …and until the screen itself has drawn, not its loading placeholder
    // (data-boot-skeleton, loading.tsx): uncovering the placeholder showed
    // blocks that then jumped to where the real screen puts things.
    // Nor onto nothing: signed out, the first screen is a redirect to Sign in,
    // which draws nothing for a moment — the splash faded over an empty page
    // (seen frame by frame in a recording of the launch). Wait for the screen
    // to have something on it, then two frames for it to be painted.
    const ready = () => {
      const root = document.getElementById("root");
      return Boolean(root?.textContent?.trim()) && !document.querySelector("[data-boot-skeleton]");
    };
    while (!ready() && Date.now() - started < 4000) {
      await new Promise((r) => window.setTimeout(r, 50));
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await SplashScreen.hide();
    // Then every other screen's code, so none of them shows a skeleton when
    // opened (lazy-route.ts). After the splash, not before: it never delays
    // the first screen.
    window.setTimeout(() => {
      void import("./lazy-route").then((m) => m.warmAppRoutes());
    }, 300);
  } catch {
    // ignore
  }

  // Android's back — the button, or the swipe in from the edge. First it
  // closes whatever is open over the page (the side menu, a sheet, a dialog:
  // native-back.ts), then it goes back a screen, and on the first screen it
  // sends the app to the background the way Android apps do, rather than
  // closing it: closing threw the screen away, so coming back reloaded the
  // app instead of picking up where you were.
  if (platform === "android") {
    try {
      const { App } = await import("@capacitor/app");
      const { closeTopLayer } = await import("./native-back");
      await App.addListener("backButton", ({ canGoBack }) => {
        if (closeTopLayer()) return;
        if (canGoBack) window.history.back();
        else void App.minimizeApp();
      });
    } catch {
      // ignore
    }
  }

  // Session boundaries. Not awaited: the listener is reporting-only, and a
  // shell that blocked its own boot on analytics would be trading a visible
  // delay for an invisible metric.
  void initAppLifecycle();

  // Deep links (mythex.ai links the OS opens the app with) are routed by
  // AppLinks in App.tsx, through the router, so account pages open as sheets.
}
