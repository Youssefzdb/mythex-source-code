import { api } from "./api";
import { isNative } from "./native";

/**
 * The same notification, in a browser.
 *
 * Web push is a different transport from the app's — a service worker holding
 * a subscription with the browser's own push service — but it need not be a
 * different backend. Firebase Cloud Messaging issues a token for a web
 * subscription exactly as it does for a handset, and the server sends to it
 * through the endpoint it already uses. So there is one credential, one
 * payload, and one place a send can go wrong. See apps/api/src/lib/push.ts.
 *
 * Nothing here throws outward. A browser with notifications blocked, a private
 * window that refuses to register a worker, Safari before it supported any of
 * this — all of them still have a working app.
 */

/** Public, and printed in every request the SDK makes. */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDHfFCjkTn7m1ruiMEvqi-lbDEHmjD4PCM",
  authDomain: "mythex.firebaseapp.com",
  projectId: "mythex",
  storageBucket: "mythex.firebasestorage.app",
  messagingSenderId: "535714672657",
  appId: "1:535714672657:web:fe9f4976fc434dde5681b0",
};

/** The public half of the project's Web Push key pair. */
const VAPID_KEY =
  "BDQ_Rg8FaJ_DOta8-WQsYpljiQ38w9r2K03vNICFDkLiGyKWIPLJRCfl0CIQ5NxJDLMNZStSR7iRyYC30V3TUeo";

const SW_PATH = "/firebase-messaging-sw.js";

let currentToken: string | null = null;

export const lastWebPushToken = (): string | null => currentToken;

/**
 * Whether to offer it at all.
 *
 * Three separate things have to exist, and on the platforms where they do not
 * the answer is permanent — an iPhone only gets `PushManager` once the site is
 * installed to the home screen, and a browser with no service workers never
 * will. Offering a switch that cannot be turned on is worse than not offering
 * one.
 */
export function webPushSupported(): boolean {
  if (isNative() || typeof window === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** granted / denied / default, or "unsupported" where the question is moot. */
export function webPushPermission(): NotificationPermission | "unsupported" {
  if (!webPushSupported()) return "unsupported";
  return Notification.permission;
}

async function registerToken(token: string): Promise<void> {
  currentToken = token;
  // `api`, not a bare fetch: an access token that expired while the tab sat
  // open makes this 401, and only `api` knows to refresh and retry. A bare
  // fetch does not even look at the status, so the registration is dropped in
  // silence and the person is told notifications are on while the server has
  // no way to reach them. Measured — this is exactly what happened.
  await api.post("/v1/push/devices", { token, platform: "web" });
}

/**
 * Subscribe, prompting if necessary.
 *
 * Only call this from something the person clicked. A notification prompt
 * fired on page load is the surest way to have it dismissed permanently, and
 * Chrome will stop showing it at all for a site that does it.
 *
 * Returns whether a subscription now exists.
 */
export async function enableWebPush(): Promise<boolean> {
  if (!webPushSupported()) return false;
  try {
    const permission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
    if (permission !== "granted") return false;

    // The worker must be live before a token can be minted against it — the
    // token *is* a subscription belonging to this registration.
    const registration = await navigator.serviceWorker.register(SW_PATH);
    await navigator.serviceWorker.ready;

    const { initializeApp, getApps, getApp } = await import("firebase/app");
    const { getMessaging, getToken } = await import("firebase/messaging");

    const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return false;

    // No `onMessage` handler: that hook only fires when the Firebase SDK is
    // running inside the service worker and forwards the push to a visible
    // page, and this worker deliberately does not load the SDK. The worker
    // shows every notification itself, foreground or not — one code path, and
    // no chance of showing two.

    await registerToken(token);
    return true;
  } catch (err) {
    console.warn("push: web registration failed", err);
    return false;
  }
}

/**
 * Re-subscribe on load, but only for someone who already said yes.
 *
 * A push token is not permanent — it rotates, and a browser may drop the
 * subscription when it clears site data — so a site that registers once
 * eventually goes quiet with no way to notice. This never prompts: with
 * permission already granted there is no prompt to show.
 */
export async function resumeWebPush(): Promise<void> {
  if (webPushPermission() !== "granted") return;
  await enableWebPush();
}

/**
 * The token this browser already holds, without prompting for anything.
 *
 * Only meaningful once permission is granted and a worker is registered; in
 * every other case there is no subscription to find and this is null.
 */
async function existingToken(): Promise<string | null> {
  if (webPushPermission() !== "granted") return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
    if (!registration) return null;
    const { initializeApp, getApps, getApp } = await import("firebase/app");
    const { getMessaging, getToken } = await import("firebase/messaging");
    const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
    return await getToken(getMessaging(app), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
  } catch {
    return null;
  }
}

/**
 * Hand the token back on sign-out.
 *
 * Without this the browser keeps receiving the previous account's notifications
 * — telling whoever is at the machine about work they can no longer see.
 */
export async function releaseWebPush(): Promise<void> {
  // Not just the one in memory. `resumeWebPush` sets that on load, and someone
  // who signs out in the first seconds of a page — or in a tab that never ran
  // it — would otherwise leave a live subscription pointed at the account they
  // just left. The subscription itself is the record, so ask it.
  const token = currentToken ?? (await existingToken());
  currentToken = null;
  if (!token) return;
  await api.delete("/v1/push/devices", { token }).catch(() => {
    // Best effort — the server drops tokens that keep failing anyway.
  });
  // The server has already forgotten it; the browser forgetting too is a
  // courtesy, not a requirement — and a round trip to Google sign-out needn't wait for.
  void (async () => {
    try {
      const { getApps, getApp } = await import("firebase/app");
      if (!getApps().length) return;
      const { getMessaging, deleteToken } = await import("firebase/messaging");
      await deleteToken(getMessaging(getApp()));
    } catch {
      /* see above */
    }
  })();
}
