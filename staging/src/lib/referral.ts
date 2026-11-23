import { api, ApiError } from "./api";

/**
 * A `?ref=<code>` link (a partner's or a friend's invite), remembered in the
 * browser for 60 days and handed to the API right after sign-up, which ties
 * the new account to it (apps/api/src/lib/referrals.ts).
 */

const KEY = "mythex_ref";
const WINDOW_MS = 60 * 24 * 60 * 60 * 1000;

type Stored = { code: string; at: number; kind?: "partner" | "user"; bonusCredits?: number };

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    if (!s.code || Date.now() - s.at > WINDOW_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

function write(s: Stored | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

/** On load: keep the link's code, count the click, and take ?ref= out of the address bar. */
export function captureReferral(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const code = url.searchParams.get("ref")?.trim();
  if (!code || !/^[A-Za-z0-9-]{3,40}$/.test(code)) return;
  url.searchParams.delete("ref");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  // The newest link wins, as with any referral program.
  write({ code, at: Date.now() });
  void api
    .post<{ valid: boolean; kind?: "partner" | "user"; bonusCredits?: number }>("/v1/referrals/click", { code })
    .then((r) => {
      // Signed in already, the link may have been handed over (or refused) meanwhile: don't bring it back.
      if (read()?.code !== code) return;
      if (!r.valid) write(null);
      else write({ code, at: Date.now(), kind: r.kind, bonusCredits: r.bonusCredits });
    })
    .catch(() => {});
}

/** The friend's bonus to mention on the sign-up screen, when there is one. */
export function pendingReferralBonus(): number {
  const s = read();
  return s?.kind === "user" ? (s.bonusCredits ?? 0) : 0;
}

let inflight = false;

/**
 * Signed in: hand a remembered link to the API. It only counts for an account
 * made in the last day, so for everyone else this just clears it.
 */
export async function attributePendingReferral(): Promise<void> {
  const s = read();
  if (!s || inflight) return;
  inflight = true;
  try {
    await api.post("/v1/referrals/attribute", { code: s.code });
    write(null);
  } catch (err) {
    // Rate limited or offline: try again next time. Anything else: done.
    if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 429) write(null);
  } finally {
    inflight = false;
  }
}
