import { Capacitor } from "@capacitor/core";

/**
 * Is this the iOS/Android shell, or a browser?
 *
 * One answer, read everywhere, so "what the app does differently" is a list
 * you can find rather than a condition scattered through the tree. The web
 * build is unchanged by every one of them.
 */
export const isNative = (): boolean => Capacitor.isNativePlatform();

/** "ios" | "android" | "web". */
export const nativePlatform = (): string => Capacitor.getPlatform();

/**
 * Whether anything may be sold, linked to, or upsold from here.
 *
 * False inside the app, and that is deliberate. Apple requires In-App Purchase
 * for digital goods bought in an app, and takes a cut of them; credits are
 * bought on the web instead and the app only spends them. The same guideline
 * forbids *pointing* at the outside purchase — a button, a link, a price — so
 * the rule is not "hide the checkout", it is "there is nothing to buy here and
 * nothing that says where to". Every upgrade path already runs through
 * `useUpgrade`, which is where this is enforced.
 *
 * Android would allow more. It stays identical on purpose: one build, one
 * behaviour, nothing that only breaks on one platform.
 */
export const canSell = (): boolean => !isNative();

/**
 * The app's own store: Apple's In-App Purchase on iPhone, Google Play Billing
 * on Android — or null in a browser, or in an app build from before the
 * purchases plugin (its native side is missing, so nothing can be bought).
 */
export function inAppStore(): "apple" | "google" | null {
  if (!isNative() || !Capacitor.isPluginAvailable("PurchasePlugin")) return null;
  return nativePlatform() === "ios" ? "apple" : nativePlatform() === "android" ? "google" : null;
}

/**
 * Whether plans and credits can be bought here: on the web with Stripe, in the
 * app through its store (lib/store-purchases.ts). Narrower than it sounds:
 * the marketing site, domains and referral offers stay `canSell()` — web only.
 */
export const canBuyPlans = (): boolean => canSell() || inAppStore() !== null;

/**
 * Mark the document so CSS can scope native-only rules, and let the platform
 * be styled against as well.
 */
export function markNativeShell(): void {
  if (typeof document === "undefined") return;
  if (!isNative()) return;
  document.documentElement.classList.add("capacitor");
  document.documentElement.classList.add(`platform-${nativePlatform()}`);
}
