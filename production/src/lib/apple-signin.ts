import { api } from "./api";
import { nativePlatform } from "./native";
import { readySignupFingerprint } from "./signup-fingerprint";

/**
 * Sign in with Apple.
 *
 * Required rather than optional: App Review guideline 4.8 says an app offering
 * any third-party sign-in must offer Apple's too, and this one offers Google.
 * Without it the build is rejected, however well the rest of it works.
 *
 * Only on iOS. The same button on Android or the web would need Apple's web
 * flow — a services ID, a return URL, a popup — to reach the same endpoint the
 * native sheet does, and neither store asks for it there.
 *
 * The exchange is the same shape as every other sign-in here: hand the token to
 * the API, let it verify against Apple's keys (see apple-signin.ts in the API)
 * and set the session. Nothing is trusted on this side.
 */

/** Whether to offer it at all. */
export function appleSignInAvailable(): boolean {
  return nativePlatform() === "ios";
}

export type AppleSignInResult = { isNew: boolean };

export async function signInWithApple(): Promise<AppleSignInResult> {
  const { SignInWithApple } = await import("@capacitor-community/apple-sign-in");

  const result = await SignInWithApple.authorize({
    clientId: "ai.mythex.app",
    // Both are for the web flow, which this is not — the native sheet returns
    // to the app. The plugin's types require them.
    redirectURI: "",
    scopes: "email name",
  });

  const identityToken = result.response?.identityToken;
  if (!identityToken) throw new Error("apple_no_token");

  // Apple sends the name once, on the very first authorisation, and never
  // again — so it goes with this request or it is lost. The address may be a
  // relay, or absent entirely if they chose to hide it; the API handles both.
  return api.post<AppleSignInResult>("/v1/auth/apple", {
    identityToken,
    givenName: result.response.givenName || undefined,
    familyName: result.response.familyName || undefined,
    fp: readySignupFingerprint(),
  });
}
