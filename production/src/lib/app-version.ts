import { isNative, nativePlatform } from "./native";

/**
 * Which Mythex this is, for Settings, support and bug reports.
 *
 * Two versions, because they move separately:
 * - the web bundle, `YYYY.MMDD.RUN` + the commit, set by the build
 *   (VITE_APP_VERSION / VITE_GIT_SHA in deploy-web.yml and ios-release.yml);
 *   it is also the live-update version the app reports to /v1/app/updates;
 * - in the app, the native shell from the store, e.g. 1.0.1 (7), which only
 *   changes with a store release.
 * A local build has neither and says "dev".
 */
export const webVersion: string = import.meta.env.VITE_APP_VERSION || "dev";
export const gitSha: string = (import.meta.env.VITE_GIT_SHA || "").slice(0, 7);

export type NativeVersion = { version: string; build: string; platform: string };

/** The store app's own version, or null on the web. */
export async function nativeVersion(): Promise<NativeVersion | null> {
  if (!isNative()) return null;
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    return { version: info.version, build: info.build, platform: nativePlatform() };
  } catch {
    return null;
  }
}

/** One line: "Web 2026.1016.512 (abc1234)" or "iOS 1.0.1 (7) · Web 2026.1016.512 (abc1234)". */
export async function versionLine(): Promise<string> {
  const web = `Web ${webVersion}${gitSha ? ` (${gitSha})` : ""}`;
  const n = await nativeVersion();
  if (!n) return web;
  const name = n.platform === "ios" ? "iOS" : n.platform === "android" ? "Android" : "App";
  return `${name} ${n.version} (${n.build}) · ${web}`;
}

/**
 * Tell the updater this bundle started. Without it, within 10 seconds, the
 * plugin treats the bundle as broken and goes back to the last good one — the
 * rollback that keeps a bad deploy from bricking phones.
 */
export async function markAppReady(): Promise<void> {
  if (!isNative()) return;
  try {
    const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
    await CapacitorUpdater.notifyAppReady();
  } catch {
    // A shell without the updater (1.0.0) has nothing to tell.
  }
}

/**
 * A downloaded update is applied when the app starts, never while it is in use.
 *
 * Left to itself the updater installs a waiting update the moment the app goes
 * to the background — a second in another app to copy a key, or the browser
 * for a Google sign-in or a connector — and reloads it: back in Mythex, the
 * unsent message, the open sheet and the scroll position were gone, and an
 * OAuth return could land in a page that had just restarted.
 *
 * So the background install is held off for good (a delay condition dated
 * far in the future — the plugin's own way to say "not on background"), and
 * at each launch, while the splash is still up, an update that has already
 * finished downloading is applied by reloading into it. Nothing is fetched
 * here; the splash never waits on the network for it. True when reloading.
 */
export async function applyUpdateAtLaunch(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
    await CapacitorUpdater.setMultiDelay({ delayConditions: [{ kind: "date", value: "9999-12-31T23:59:59Z" }] });
    const [next, { bundle: current }] = await Promise.all([CapacitorUpdater.getNextBundle(), CapacitorUpdater.current()]);
    if (!next || next.id === current.id || next.status === "error") return false;
    await CapacitorUpdater.reload();
    return true;
  } catch {
    // A shell without the updater (1.0.0), or one that refused: carry on as is.
    return false;
  }
}
