import { api } from "./api";
import { isNative, nativePlatform } from "./native";
import { readySignupFingerprint } from "./signup-fingerprint";

/**
 * Sign in with Google, in the app.
 *
 * The web signs in by leaving the page: `/v1/auth/google` redirects to Google,
 * Google redirects back to the API, the API sets a cookie. None of that works
 * in a shell. The web view has no address bar to show the origin, so Google
 * refuses to render the consent screen inside it (disallowed_useragent), and
 * even if it did the cookie would land on an origin the app cannot read —
 * see native-session.ts.
 *
 * So the app asks the platform instead. Android hands the request to the
 * system credential picker, iOS to the Google SDK's own sheet, and both return
 * a signed ID token. That token goes to `/v1/auth/google/token`, which verifies
 * it against Google's keys and issues the same session every other sign-in
 * does. Nothing is trusted on this side; the token is the whole proof.
 */

/**
 * Public identifiers, not secrets — Google prints them in the consent screen's
 * URL. They are the same values as `android/app/google-services.json`, which is
 * where the native SDKs read them from on Android; iOS has no such file here,
 * because no Firebase pod is linked.
 */
const WEB_CLIENT_ID = "535714672657-j90gnphu67pv94e0k386p95mhibv9gam.apps.googleusercontent.com";
const IOS_CLIENT_ID = "535714672657-dk0qufjjm9lev12l490m8thphqf0qc9u.apps.googleusercontent.com";

/** Whether the native sheet is available; the web keeps the redirect flow. */
export function nativeGoogleSignInAvailable(): boolean {
  return isNative();
}

type SocialLoginModule = typeof import("@capgo/capacitor-social-login");

let initialised: Promise<SocialLoginModule> | null = null;

/**
 * Initialisation is per-process and must precede the first login, so it is
 * cached rather than repeated — a second `initialize` is not harmful, but a
 * login racing one is.
 */
function ready(): Promise<SocialLoginModule> {
  initialised ??= (async () => {
    const mod = await import("@capgo/capacitor-social-login");
    await mod.SocialLogin.initialize({
      google: {
        // Android reads this one; it is the audience the API checks the token
        // against, so it is what makes the token verifiable server-side.
        webClientId: WEB_CLIENT_ID,
        iOSClientId: IOS_CLIENT_ID,
        // Asking iOS for a token the server can verify: without it the SDK
        // issues a token whose audience is the iOS client alone.
        iOSServerClientId: WEB_CLIENT_ID,
        mode: "online",
      },
    });
    return mod;
  })();
  return initialised;
}

export type GoogleSignInResult = { isNew: boolean };

/** Thrown when the person closed the sheet. Callers stay silent for it. */
export class GoogleSignInCancelled extends Error {
  constructor() {
    super("google_sign_in_cancelled");
    this.name = "GoogleSignInCancelled";
  }
}

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  const { SocialLogin } = await ready();

  let response: Awaited<ReturnType<typeof SocialLogin.login>>;
  try {
    // No `scopes`. email, profile and openid are what the provider asks for
    // anyway, and naming them turns on a path that rejects outright unless
    // MainActivity is subclassed for the plugin — measured on the emulator:
    // "You CANNOT use scopes without modifying the main activity".
    response = await SocialLogin.login({ provider: "google", options: {} });
  } catch (err) {
    // Every platform words a dismissal differently, and none of them use a
    // distinct error type: Android's credential manager says the activity was
    // cancelled, iOS's SDK returns code -5. Treated as a cancel so the screen
    // does not accuse the person of a failure they chose.
    const msg = err instanceof Error ? err.message : String(err);
    if (/cancel|dismiss|-5\b|user closed/i.test(msg)) throw new GoogleSignInCancelled();
    throw err;
  }

  const result = response.result as { idToken?: string | null };
  const idToken = result?.idToken;
  if (!idToken) throw new Error("google_no_token");

  return api.post<GoogleSignInResult>("/v1/auth/google/token", { idToken, fp: readySignupFingerprint() });
}

/** Best-effort: lets the next sign-in show the picker rather than resuming. */
export async function signOutOfGoogle(): Promise<void> {
  if (!isNative()) return;
  try {
    const { SocialLogin } = await ready();
    await SocialLogin.logout({ provider: "google" });
  } catch {
    // Signing out of the app matters; signing out of the picker does not.
  }
}

/** Only used to explain a failure — the two platforms fail for different reasons. */
export function googleSignInPlatform(): string {
  return nativePlatform() ?? "web";
}
