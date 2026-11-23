// Cookie/tracking consent, stored locally and read by the analytics module.
// Essential cookies (auth/session) are always on and not covered here.

export interface Consent {
  analytics: boolean;
  marketing: boolean;
}

const KEY = "mythex_consent_v1";

type Listener = (c: Consent) => void;
const listeners = new Set<Listener>();

export function getConsent(): Consent | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Consent;
  } catch {
    return null;
  }
}

export function setConsent(consent: Consent): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(consent));
  } catch {
    // ignore storage errors (private mode)
  }
  for (const l of listeners) l(consent);
}

export function onConsentChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
