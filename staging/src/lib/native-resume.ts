import { useEffect } from "react";
import type { Location } from "react-router-dom";
import { isNative } from "./native";
import { nativeAccessToken, nativeRefreshToken } from "./native-session";

/**
 * The app reopens on the project it was closed in, as a native app would.
 *
 * Closed while in a project, the app came back on its home screen. Now the
 * project (and the chat open in it) is remembered while it is on screen and
 * the app starts there; going anywhere else — home, settings, sign out —
 * forgets it, so a launch after leaving the project is the usual one.
 *
 * The app only. On the website the address bar already says where you are.
 */
const KEY = "mythex:app-last-project";

/** `/p/<id>`, with the open chat kept and everything else (a dialog's flag) dropped. */
export function projectResumePath(pathname: string, search: string): string | null {
  const m = /^\/p\/([^/]+)\/?$/.exec(pathname);
  if (!m) return null;
  const thread = new URLSearchParams(search).get("thread");
  return `/p/${m[1]}${thread ? `?thread=${encodeURIComponent(thread)}` : ""}`;
}

/**
 * Keeps the project on screen remembered, and forgets it on leaving. Given the
 * page under an open sheet, so Account settings over a project keeps it.
 */
export function useRememberProject({ pathname, search }: Pick<Location, "pathname" | "search">): void {
  useEffect(() => {
    if (!isNative()) return;
    const path = projectResumePath(pathname, search);
    try {
      if (path) localStorage.setItem(KEY, path);
      else localStorage.removeItem(KEY);
    } catch {
      // Storage unavailable: the app starts on home, as before.
    }
  }, [pathname, search]);
}

/**
 * Before the first render: a launch onto the start page goes to the project
 * the app was closed in instead. Only when signed in (the app's session is its
 * tokens on the phone) — signed out, the project would only send them to Sign in.
 */
export function resumeLastProject(): void {
  if (!isNative() || window.location.pathname !== "/") return;
  if (!nativeAccessToken() && !nativeRefreshToken()) return;
  let path: string | null = null;
  try {
    path = localStorage.getItem(KEY);
  } catch {
    return;
  }
  const url = path ? new URL(path, window.location.origin) : null;
  if (url && projectResumePath(url.pathname, url.search) === path) {
    window.history.replaceState(null, "", path);
  }
}
