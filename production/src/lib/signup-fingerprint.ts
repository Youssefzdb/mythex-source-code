/**
 * The browser's FingerprintJS visitor id, sent with a signup only.
 *
 * One person opened 15 free accounts on 15 October 2026 and started clearing
 * cookies once the per-browser limit (the device cookie) caught him. The
 * fingerprint is worked out from the browser itself — screen, fonts, graphics,
 * audio — so it stays the same in an incognito window or after cookies are
 * cleared. The API counts new accounts per fingerprint
 * (apps/api/src/lib/signup-ip-limit.ts); it is never used to sign anyone in,
 * and nothing is sent anywhere but our own API.
 *
 * FingerprintJS 5 is MIT-licensed and runs entirely in the page. It is loaded
 * only when the sign-in page asks for it, never on other pages. Nothing ever
 * waits for it: a signup sends it if it is ready by then, and otherwise goes
 * ahead without it.
 */

let pending: Promise<string | undefined> | null = null;
let ready: string | undefined;

async function compute(): Promise<string | undefined> {
  const FingerprintJS = await import("@fingerprintjs/fingerprintjs");
  const agent = await FingerprintJS.load({ monitoring: false });
  const { visitorId } = await agent.get();
  return /^[a-f0-9]{16,64}$/i.test(visitorId) ? visitorId : undefined;
}

/** Start working it out early (the sign-in page calls this on mount). */
export function prefetchSignupFingerprint(): void {
  if (!pending) {
    pending = compute()
      .then((id) => (ready = id))
      .catch(() => undefined);
  }
}

/** The visitor id once it is worked out, however long that takes (for links built at render). */
export function whenSignupFingerprint(): Promise<string | undefined> {
  prefetchSignupFingerprint();
  return pending as Promise<string | undefined>;
}

/** The visitor id if it is already worked out, else undefined — never waits. */
export function readySignupFingerprint(): string | undefined {
  prefetchSignupFingerprint();
  return ready;
}
