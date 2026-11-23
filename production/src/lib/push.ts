import { isNative, nativePlatform } from "./native";
import { api } from "./api";

/**
 * Asking to be told when a build finishes, and handing over the token for it.
 *
 * Registration runs on every launch rather than once. A push token is not
 * permanent — it rotates on reinstall, on restore from a backup, and whenever
 * the platform decides — so an app that registers once eventually goes quiet
 * with no way to notice.
 *
 * Nothing here throws outward. Someone who declined notifications, or whose
 * device could not reach the push service, still has a working app.
 */

let currentToken: string | null = null;

/**
 * Listeners are added once per process, tokens re-registered every call.
 *
 * `addListener` stacks: calling `initPush` twice would leave two handlers on
 * `registration`, and every rotation would then be posted twice. It is called
 * more than once on purpose — at sign-in, and again after someone turns
 * notifications back on in the system settings — so the second call must be
 * the cheap half.
 */
let listenersAttached = false;

/** The token this device last handed over, so sign-out can take it back. */
export const lastPushToken = (): string | null => currentToken;

/**
 * Android's `register()` throws when the build carries no google-services.json,
 * and it throws on the native plugin thread — outside any `try` written here,
 * killing the process. Measured on the emulator: the app died on launch and
 * JavaScript never saw an error. So ask a native plugin of our own first,
 * whose only job is to answer that question without touching Firebase.
 */
export async function canRegisterForPush(): Promise<boolean> {
  if (nativePlatform() !== "android") return true;
  try {
    const { registerPlugin } = await import("@capacitor/core");
    const plugin = registerPlugin<{ check(): Promise<{ available: boolean }> }>(
      "PushAvailability",
    );
    return (await plugin.check()).available;
  } catch {
    // An older shell without the plugin cannot be asked, and guessing "yes"
    // here is the crash this function exists to avoid.
    return false;
  }
}

export async function initPush(onOpenPath?: (path: string) => void): Promise<void> {
  if (!isNative()) return;
  try {
    if (!(await canRegisterForPush())) return;
    const { PushNotifications } = await import("@capacitor/push-notifications");

    // Ask only after checking: `requestPermissions` on an already-denied
    // device returns immediately, and iOS only ever shows the prompt once, so
    // there is nothing to gain by asking again and no way to un-ask.
    const status = await PushNotifications.checkPermissions();
    const granted =
      status.receive === "granted"
        ? true
        : (await PushNotifications.requestPermissions()).receive === "granted";
    if (!granted) return;

    if (listenersAttached) {
      // Already wired; just ask the platform for the token again, which is
      // what re-registers this device.
      await PushNotifications.register();
      return;
    }
    listenersAttached = true;

    await PushNotifications.addListener("registration", (token) => {
      currentToken = token.value;
      // `api`, not a bare fetch: it carries the app's bearer token and, when
      // the access token has expired, refreshes and retries. A bare fetch gets
      // a 401 it does not even look at, and the device is never registered.
      void api.post("/v1/push/devices", { token: token.value, platform: nativePlatform() }).catch(() => {
        // Offline at launch. The next launch registers again.
      });
    });

    await PushNotifications.addListener("registrationError", (err) => {
      console.warn("push: registration failed", err);
    });

    // Tapping a notification should land on the thing it was about, not just
    // open the app wherever it was left.
    await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const path = action.notification?.data?.path;
      if (typeof path === "string" && path.startsWith("/")) onOpenPath?.(path);
    });

    await PushNotifications.register();
  } catch (err) {
    console.warn("push: unavailable", err);
  }
}

/**
 * Hand the token back on sign-out.
 *
 * Without this the device keeps receiving the previous account's notifications
 * — telling whoever is holding the phone about work they can no longer see.
 */
export async function releasePush(): Promise<void> {
  if (!isNative() || !currentToken) return;
  const token = currentToken;
  currentToken = null;
  await api.delete("/v1/push/devices", { token }).catch(() => {
    // Best effort — the server drops tokens that keep failing anyway.
  });
}
