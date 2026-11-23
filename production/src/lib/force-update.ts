import { useSyncExternalStore } from "react";
import { api } from "./api";
import { nativeVersion } from "./app-version";
import { isNative, nativePlatform } from "./native";

/**
 * Whether this store app is older than the oldest one still allowed.
 *
 * The minimum is set per platform in the admin console (Mobile app) and read
 * from /v1/app/min-version when the app opens and whenever it comes back to the
 * foreground. Older than it, ForceUpdateScreen covers the whole app with a
 * button to the store. Live updates still reach such a phone — this is what
 * they cannot fix: a native shell too old for what the app now needs.
 *
 * The last minimum seen is kept on the phone, so an app opened offline is held
 * to it too. A lookup that fails changes nothing: no answer never locks anyone
 * out, and no answer never lets anyone past a minimum already seen.
 *
 * Only in the iOS and Android apps; the web has no version to be behind.
 */
export type ForceUpdate = { current: string; minVersion: string; platform: "ios" | "android" };

export const STORE_URL = {
  ios: "https://apps.apple.com/app/id6823479848",
  android: "https://play.google.com/store/apps/details?id=ai.mythex.app",
} as const;

const CACHE_KEY = "mythex:app-min-version";

let state: ForceUpdate | null = null;
const listeners = new Set<() => void>();
const set = (next: ForceUpdate | null) => {
  if (next?.current === state?.current && next?.minVersion === state?.minVersion) return;
  state = next;
  for (const l of listeners) l();
};

export function useForceUpdate(): ForceUpdate | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => null,
  );
}

/** Negative when a is older than b. Missing parts count as 0 ("1.1" = "1.1.0"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

const readCache = (): string | null => {
  try {
    return localStorage.getItem(CACHE_KEY);
  } catch {
    return null;
  }
};
const writeCache = (v: string | null) => {
  try {
    if (v) localStorage.setItem(CACHE_KEY, v);
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    // Private storage off: the next launch asks the server again.
  }
};

async function check(current: string, platform: "ios" | "android"): Promise<void> {
  const apply = (min: string | null) =>
    set(min && compareVersions(current, min) < 0 ? { current, minVersion: min, platform } : null);
  try {
    const { minVersion } = await api.get<{ minVersion: string | null }>(`/v1/app/min-version?platform=${platform}`);
    writeCache(minVersion);
    apply(minVersion);
  } catch {
    // Offline, or the API is down: keep whatever was decided before.
  }
}

/** At boot, once: the cached answer now, the server's when it comes, and again on every return. */
export async function initForceUpdate(): Promise<void> {
  if (!isNative()) return;
  const platform = nativePlatform();
  if (platform !== "ios" && platform !== "android") return;
  const native = await nativeVersion();
  if (!native?.version) return;
  const current = native.version;
  const cached = readCache();
  if (cached && compareVersions(current, cached) < 0) set({ current, minVersion: cached, platform });
  void check(current, platform);
  try {
    const { App } = await import("@capacitor/app");
    await App.addListener("resume", () => void check(current, platform));
  } catch {
    // No lifecycle events: the launch check stands.
  }
}

/** The store page, in the store app (Capacitor hands an outside link to the system). */
export function openStore(platform: "ios" | "android"): void {
  window.open(STORE_URL[platform], "_blank", "noopener,noreferrer");
}
