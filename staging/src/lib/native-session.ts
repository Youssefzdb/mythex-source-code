import { isNative, nativePlatform } from "./native";

/**
 * The session, for a client that cannot keep a cookie.
 *
 * The native shells serve their web view from their own origin —
 * `capacitor://app.mythex.ai` on iOS, `https://app.mythex.ai` on Android (it
 * was `localhost` until the preview needed a mythex.ai origin) — so every
 * call to the API is cross-site. The auth cookie is third-party there, subject
 * to whatever each platform currently does about third-party cookies, and
 * dropped outright over plain http. Measured on the Android emulator: login
 * returned 200 and the very next `/v1/auth/me` returned 401.
 *
 * So in the app the same token travels in an Authorization header instead.
 * Identical token, identical verification — only a transport the app can hold.
 * The web is untouched and keeps its httpOnly cookies, which are strictly
 * better when the client is a browser.
 */

const ACCESS_KEY = "mythex.native.access";
const REFRESH_KEY = "mythex.native.refresh";

/** Native only. On the web this is always null and nothing here runs. */
export function nativeAccessToken(): string | null {
  if (!isNative()) return null;
  try {
    return localStorage.getItem(ACCESS_KEY);
  } catch {
    return null;
  }
}

export function nativeRefreshToken(): string | null {
  if (!isNative()) return null;
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

/**
 * Called with whatever an auth response returned. A web response carries
 * neither field and this does nothing, which is what keeps the browser on
 * cookies without a second code path.
 */
export function rememberNativeSession(body: unknown): void {
  if (!isNative() || !body || typeof body !== "object") return;
  const { accessToken, refreshToken } = body as {
    accessToken?: string;
    refreshToken?: string;
  };
  try {
    if (accessToken) localStorage.setItem(ACCESS_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  } catch {
    // A device that cannot store it falls back to the cookie, for whatever
    // that is worth — better than failing the sign-in that just succeeded.
  }
}

export function forgetNativeSession(): void {
  try {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    // ignore
  }
}

/** The Authorization header to attach, or nothing on the web. */
export function nativeAuthHeaders(): Record<string, string> {
  const token = nativeAccessToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

/**
 * Tells the API this client wants tokens in the body it cannot get from a
 * cookie — and which shell is asking.
 *
 * The platform matters because the two emulators do not agree on what "this
 * machine" is called: an Android emulator reaches the host at 10.0.2.2 and an
 * iOS simulator reaches it at localhost. The API hands back an orchestrator
 * address, and handing every native client the same one meant iOS was given
 * 10.0.2.2 and sat waiting on an address that does not exist there.
 */
export function nativeClientHeaders(): Record<string, string> {
  if (!isNative()) return {};
  return { "x-mythex-client": "native", "x-mythex-platform": nativePlatform() };
}
