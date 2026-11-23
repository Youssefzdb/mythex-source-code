import { isNative } from "./native";
import { nativeAccessToken, nativeRefreshToken } from "./native-session";
/** Last-known session hint (not a credential — cookies stay httpOnly). */
const SESSION_HINT_KEY = "mythex_session_hint";

export function peekSessionHint(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSessionHint(on: boolean) {
  try {
    if (on) localStorage.setItem(SESSION_HINT_KEY, "1");
    else localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    /* private mode */
  }
}

const PUBLIC_PATH_PREFIXES = [
  "/",
  "/home",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/terms",
  "/privacy",
  // "/cookies", — page disabled for now
  "/acceptable-use",
  "/about",
  "/faq",
  "/use-cases",
  // Every template page is indexed marketing — /templates, and a category and
  // a slug under it. Without them a signed-out visitor's first page load
  // fired /v1/auth/me, took a 401 and logged an error, which is the exact
  // noise this list exists to prevent.
  "/templates",
  "/docs",
  "/pricing",
  "/security",
];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "/home") return true;
  return PUBLIC_PATH_PREFIXES.some((p) => p !== "/" && p !== "/home" && pathname.startsWith(p));
}

/** OAuth / billing return flags — session may exist before the hint is set. */
function hasSessionReturnParams(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URL(window.location.href).searchParams;
  return (
    q.has("auth") ||
    q.has("signup") ||
    q.has("login") ||
    q.has("upgraded") ||
    q.has("topup")
  );
}

/**
 * Whether to call GET /v1/auth/me on boot.
 * Logged-out marketing visitors skip it (avoids 401 + refresh noise in DevTools).
 */
export function shouldProbeSession(): boolean {
  if (hasSessionReturnParams()) return true;
  // In the app the session is the tokens on the phone, nothing else: without
  // them the answer is already "signed out". Asking anyway held a signed-out
  // phone on the home screen's skeleton for a round trip before Sign in.
  if (isNative() && !nativeAccessToken() && !nativeRefreshToken()) return false;
  if (peekSessionHint()) return true;
  if (typeof window === "undefined") return true;
  return !isPublicPath(window.location.pathname);
}
