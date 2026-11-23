import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, type Me } from "./api";
import { attributePendingReferral } from "./referral";
import { browserLanguageTag, followAccountLocale, reportLanguageSeen, syncDocument } from "../i18n/choose-locale";
import { readStoredPref, resolvePref } from "../i18n/app-locale";
import { releasePush } from "./push";
import { releaseWebPush } from "./web-push";
import { forgetNativeSession, nativeAccessToken, nativeRefreshToken } from "./native-session";
import { isNative } from "./native";
import { identify, setImpactIdentity } from "./analytics";
import { deferNonCritical } from "./idle";
import { identifyIntercom, initIntercom, shutdownIntercom } from "./intercom";
import { isCustomSupportEnabled } from "./support";
import { setSessionHint, shouldProbeSession } from "./session-hint";

export { peekSessionHint } from "./session-hint";

interface AuthState {
  user: Me | null;
  loading: boolean;
  /** Pass `{ force: true }` after login/signup so /me runs even on public routes. */
  refresh: (opts?: { force?: boolean }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
});

function scheduleIntercom(boot: () => void) {
  if (isCustomSupportEnabled()) return;
  deferNonCritical(boot);
}

async function syncIntercom(me: Me) {
  scheduleIntercom(async () => {
    try {
      const hash = await api.get<{ userId: string; userJwt?: string }>("/v1/auth/intercom-hash");
      identifyIntercom({
        userId: hash.userId || me.id,
        email: me.email,
        name: me.name,
        userJwt: hash.userJwt,
        // Web Messenger Security is enforced (Intercom → Messenger → Security).
        // Unverified boots are rejected, so logged-in users must send the JWT.
        enforceIdentity: true,
      });
    } catch {
      identifyIntercom({ userId: me.id, email: me.email, name: me.name, enforceIdentity: true });
    }
  });
}

/**
 * The app opens on the account it last saw, as a native app does, and checks
 * the session behind it. Waiting for /v1/auth/me first held the splash for a
 * network round trip on every launch. If the session has gone, the check
 * that follows signs out and the app moves to Sign in.
 *
 * The app only: kept with the session's tokens on the phone, and dropped with
 * them. The website asks the server as before.
 */
const APP_ME_KEY = "mythex:app-me";

function readAppMe(): Me | null {
  if (!isNative() || (!nativeAccessToken() && !nativeRefreshToken())) return null;
  try {
    const raw = localStorage.getItem(APP_ME_KEY);
    return raw ? (JSON.parse(raw) as Me) : null;
  } catch {
    return null;
  }
}

function writeAppMe(me: Me | null): void {
  if (!isNative()) return;
  try {
    if (me) localStorage.setItem(APP_ME_KEY, JSON.stringify(me));
    else localStorage.removeItem(APP_ME_KEY);
  } catch {
    /* storage unavailable: the next launch asks the server first */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(readAppMe);
  // Nothing to ask about (a signed-out phone, a visitor on a public page), or
  // the app's remembered account: resolved from the first render, so no
  // skeleton flashes before the screen and the splash waits on no request.
  const [loading, setLoading] = useState(() => !readAppMe() && shouldProbeSession());
  // The app's splash waits for this (native-shell.ts).
  useEffect(() => {
    if (loading) return;
    (window as { __mythexSessionKnown?: boolean }).__mythexSessionKnown = true;
    window.dispatchEvent(new Event("mythex:session-known"));
  }, [loading]);
  // Ignore stale /me failures that finish after a successful login refresh.
  const refreshGen = useRef(0);
  const refreshInflight = useRef<Promise<void> | null>(null);
  // Signing out finishes on the server after the screen has moved on (logout).
  const logoutInflight = useRef<Promise<void> | null>(null);
  const userRef = useRef<Me | null>(null);
  userRef.current = user;

  const refresh = useCallback(async (opts?: { force?: boolean }) => {
    if (refreshInflight.current && !opts?.force) return refreshInflight.current;

    const gen = ++refreshGen.current;
    // Public routes skip /me for anonymous marketing visitors. After password
    // login we must force a probe — otherwise refresh() no-ops on /login,
    // navigates to /, and the UI stays logged out despite valid cookies.
    if (!opts?.force && !shouldProbeSession()) {
      // Do NOT clear an in-memory session here. Callers on public routes may
      // refresh() without force; wiping user would look like a spontaneous logout.
      if (!userRef.current) {
        scheduleIntercom(() => initIntercom());
      }
      if (gen === refreshGen.current) setLoading(false);
      return;
    }

    let current!: Promise<void>;
    current = (async () => {
      let keepLoading = false;
      try {
        // Mid sign-out the cookies are still good: asking now would sign back in.
        if (logoutInflight.current) await logoutInflight.current;
        const me = await api.get<Me>("/v1/auth/me");
        if (gen !== refreshGen.current) return;
        const prev = userRef.current;
        setUser(me);
        writeAppMe(me);
        setSessionHint(true);
        // A code is still owed (two-factor): nothing else runs until it's entered —
        // every other call would be refused and re-trigger this read.
        if (me.twoFactor?.required) return;
        followAccountLocale(me.locale);
        syncDocument();
        reportLanguageSeen(me.id);
        // Signed up through a partner's or a friend's link: tie the new account to it.
        void attributePendingReferral();
        setImpactIdentity({ id: me.id, email: me.email });
        identify(me.id, {
          plan: me.plan,
          // For charts of users by language, and languages we don't speak yet.
          ui_locale: resolvePref(readStoredPref()),
          browser_language: browserLanguageTag(),
        });
        // Re-boot Intercom only when identity/plan changes — extra /me calls
        // (route + tab focus) were making the messenger flicker.
        if (prev?.id !== me.id || prev?.plan !== me.plan) {
          void syncIntercom(me);
        }
      } catch (err) {
        if (gen !== refreshGen.current) return;
        const status = err instanceof ApiError ? err.status : 0;
        // Coming back to the tab always re-probes /me. A blip there must not
        // look like logout — in-tab refresh still works, and a later API call
        // will refresh or redirect if the session is actually gone. A 401 is
        // not a blip: it arrives only once the token refresh has failed too
        // (api.ts), and the app's remembered account (readAppMe) relies on it
        // to sign out a session that ended while the phone was away.
        if (userRef.current && !opts?.force && status !== 401) return;
        // The API could not be reached (a deploy, an outage) — that says
        // nothing about the session. Clearing it here sent people to Sign in,
        // and wiping the hint kept them there after the API came back. Keep
        // loading and ask again.
        // Same for "too many requests": the per-IP limit says nothing about the
        // session, and treating it as signed out showed Sign in to everyone
        // behind one shared IP (an office, a school) at once.
        if (status === 0 || status === 429 || status >= 500) {
          window.setTimeout(() => {
            if (gen === refreshGen.current) void refresh({ force: opts?.force });
          }, 3_000);
          keepLoading = true;
          return;
        }
        setUser(null);
        writeAppMe(null);
        setSessionHint(false);
        setImpactIdentity(null);
        // Boot visitor messenger after idle — do not leave a zombie after failed session checks.
        scheduleIntercom(() => initIntercom());
      } finally {
        if (gen === refreshGen.current && !keepLoading) setLoading(false);
        if (refreshInflight.current === current) refreshInflight.current = null;
      }
    })();

    refreshInflight.current = current;
    return current;
  }, []);

  const logout = useCallback(async () => {
    refreshGen.current += 1;
    // The screen signs out now; the server part runs behind it. It used to be
    // awaited step by step — the push token from Firebase, handing it back,
    // Firebase forgetting it, then the sign-out call — a second or more of a
    // frozen menu. refresh() waits for it, so nothing reads /me while the
    // cookies are still good.
    const work = (async () => {
      // Before the session goes: the push tokens are handed back while the
      // request is still authenticated. After logout the server cannot tell
      // whose device it is, and it would keep receiving the last account's builds.
      await Promise.all([releasePush(), releaseWebPush()]);
      await api.post("/v1/auth/logout").catch(() => {});
      // The app's session is the stored token, not a cookie the server can clear.
      forgetNativeSession();
    })();
    const tracked = work.finally(() => {
      if (logoutInflight.current === tracked) logoutInflight.current = null;
    });
    logoutInflight.current = tracked;
    // The pictures this person attached (ATTACHMENT_PREVIEW_LS_KEY in
    // chat/history.ts) — they outlived the session for whoever came next.
    try {
      localStorage.removeItem("mythex-attachment-previews");
      // Recents kept on the phone (workspaceCatalog.ts), the same way.
      for (const key of Object.keys(localStorage)) if (key.startsWith("mythex.recents.")) localStorage.removeItem(key);
    } catch {
      /* private mode */
    }
    setUser(null);
    writeAppMe(null);
    setSessionHint(false);
    setImpactIdentity(null);
    shutdownIntercom();
    scheduleIntercom(() => initIntercom());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Plan/credits can change out of band (Stripe cancel, admin reset). Re-read
  // /me when the tab is focused so dashboard Upgrade isn't stuck on a stale Pro.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  // A request said this session must still enter a two-factor code: re-read
  // /me, which says so, and the app shows the code screen (App.tsx Protected).
  useEffect(() => {
    const onMfa = () => {
      // Already showing the code screen: nothing new to learn.
      if (userRef.current?.twoFactor?.required) return;
      void refresh({ force: true });
    };
    window.addEventListener("mythex:mfa-required", onMfa);
    return () => window.removeEventListener("mythex:mfa-required", onMfa);
  }, [refresh]);

  return <AuthContext.Provider value={{ user, loading, refresh, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
