import { isNative, nativePlatform } from "./native";
import { canRegisterForPush, initPush } from "./push";
import { enableWebPush, webPushPermission } from "./web-push";
import type { NotificationState, Platform } from "./notification-state";

/**
 * Reading and changing the notification setting, whichever shell this is.
 *
 * The two transports are different all the way down — a browser subscription
 * against a service worker, an APNs/FCM token against the app — so the state
 * has to be read from whichever one is actually in play. This is the seam:
 * everything above it deals in `NotificationState` and knows nothing about
 * either.
 */

export function currentPlatform(): Platform {
  if (!isNative()) return "web";
  return nativePlatform() === "ios" ? "ios" : "android";
}

/** What the platform currently says. Never throws. */
export async function readNotificationState(): Promise<NotificationState> {
  if (!isNative()) {
    const permission = webPushPermission();
    return permission === "unsupported" ? "unsupported" : permission;
  }
  try {
    // A build with no Firebase config cannot register at all, and asking would
    // crash rather than fail — see canRegisterForPush.
    if (!(await canRegisterForPush())) return "unsupported";
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const status = await PushNotifications.checkPermissions();
    if (status.receive === "granted") return "granted";
    if (status.receive === "denied") return "denied";
    return "default";
  } catch {
    return "unsupported";
  }
}

/**
 * Ask, on whichever platform this is.
 *
 * Only call this from something the person clicked: every platform here
 * punishes an unprompted ask, and none of them let you take it back.
 */
export async function requestNotifications(
  onOpenPath?: (path: string) => void,
): Promise<NotificationState> {
  if (!isNative()) {
    await enableWebPush();
    const permission = webPushPermission();
    return permission === "unsupported" ? "unsupported" : permission;
  }
  // initPush asks, registers the listener, and hands the token over; it is the
  // same call the app makes at sign-in, and it is safe to repeat.
  await initPush(onOpenPath);
  return readNotificationState();
}

/**
 * Make sure this device is registered, without asking anything.
 *
 * Someone who turns notifications back on in the system settings never passes
 * through the app's own prompt, so nothing re-registers them — and on a device
 * that had never granted before, there is no token at all until the next
 * launch. Safe to call whenever the state reads "granted": no platform shows a
 * prompt for a permission it has already given.
 */
export async function ensureRegistered(onOpenPath?: (path: string) => void): Promise<void> {
  if ((await readNotificationState()) !== "granted") return;
  try {
    if (isNative()) await initPush(onOpenPath);
    else await enableWebPush();
  } catch {
    // Best effort. The next launch registers again.
  }
}

/**
 * Open the system's own notification screen for this app.
 *
 * Returns false where there is nothing to open — every browser, since a page
 * cannot reach the settings behind its own address bar.
 */
export async function openSystemNotificationSettings(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    if (nativePlatform() === "ios") {
      // UIApplication.openSettingsURLString. Capacitor's web view hands a
      // scheme it does not recognise to the system, which is what opens
      // Settings on this app's page.
      window.location.href = "app-settings:";
      return true;
    }
    const { registerPlugin } = await import("@capacitor/core");
    const plugin = registerPlugin<{ open(): Promise<void> }>("NotificationSettings");
    await plugin.open();
    return true;
  } catch {
    return false;
  }
}
