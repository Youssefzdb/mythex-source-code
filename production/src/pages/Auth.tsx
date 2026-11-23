import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { pendingReferralBonus } from "../lib/referral";
import { en } from "../i18n/messages/en";
import { fill } from "../i18n";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, API_URL, googleAuthUrl } from "../lib/api";
import { readySignupFingerprint, whenSignupFingerprint } from "../lib/signup-fingerprint";
import { track, getMetaClickIds } from "../lib/analytics";
import { useAuth } from "../lib/auth";
import { appleSignInAvailable, signInWithApple } from "../lib/apple-signin";
import {
  GoogleSignInCancelled,
  nativeGoogleSignInAvailable,
  signInWithGoogle,
} from "../lib/google-signin";
import { peekPendingPrompt, setPendingPrompt } from "../lib/pending-prompt";
import { setSessionHint } from "../lib/session-hint";
import { PasswordStrength, passwordScore } from "../components/AuthShell";
import { Spinner } from "../components/ui";
import { Turnstile, turnstileOn, type TurnstileHandle } from "../components/auth/Turnstile";
import { useT } from "../i18n/app";
import { rich } from "../i18n/app/rich";
import {
  AuthField,
  AuthLayout,
  FG_MUTED,
  OutlineButton,
  PAGE_BG,
  PrimaryButton,
} from "./auth/AuthLayout";
import { isNative } from "../lib/native";

/**
 * Apple's mark, at the same optical size as the Google one beside it.
 *
 * Both sit in a 24-unit box at `size-4`, which only matches if both glyphs fill
 * that box — and they do not. Measured: the Google mark spans 21.5 x 22 of the
 * 24, Apple's 15.2 x 18. Same nominal size, 82% the height and 58% the ink, and
 * it read as the smaller button.
 *
 * So the glyph is scaled about the centre until its height matches Google's:
 * 22 / 18. The width goes to 18.6, still inside the box.
 */
function AppleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden className="size-4 shrink-0">
      <g transform="translate(12 12) scale(1.222) translate(-12 -12)">
        <path
          fill="currentColor"
          d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
        />
      </g>
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden className="size-4 shrink-0">
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function safeAppReturnTo(raw: string | null): string | null {
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* already decoded */
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("://")) return null;
  if (decoded.startsWith("/login") || decoded.startsWith("/signup")) return null;
  return decoded;
}

/** Single-step Sign in / Sign up — split chrome via AuthLayout. */
/**
 * A new account refused because of where it comes from: a VPN, proxy or
 * datacenter address (the API's lib/signup-vpn.ts). Said plainly, unlike the
 * other refusals, because turning the VPN off is all it takes.
 */
function isVpnRefusal(err: unknown): boolean {
  return (err as { body?: { error?: string } } | null)?.body?.error === "vpn_not_allowed";
}

export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const search = new URLSearchParams(location.search);
  const searchPrompt = search.get("prompt");
  const prompt =
    (location.state as { prompt?: string } | null)?.prompt ??
    searchPrompt ??
    peekPendingPrompt() ??
    undefined;
  const inviteToken = search.get("invite") ?? undefined;
  const oauthError = search.get("error");
  const ssoError = search.get("sso_error");
  const prefillEmail = search.get("email") ?? "";
  const emailId = useId();
  const passwordId = useId();
  const nameId = useId();
  const t = useT();

  const isSignup = mode === "signup";
  const [inviteBonus] = useState(() => pendingReferralBonus());
  const inviteQuery = inviteToken ? `?invite=${encodeURIComponent(inviteToken)}` : "";
  const weakPassword = isSignup && password.length > 0 && passwordScore(password) < 3;
  // Cloudflare Turnstile on email sign-up and sign-in (components/auth/Turnstile.tsx).
  const turnstile = useRef<TurnstileHandle>(null);
  const turnstileToken = useRef<string | null>(null);
  /** The widget's token; waits briefly if it hasn't arrived yet (it usually has). */
  const waitForTurnstile = async (): Promise<string | undefined> => {
    if (!turnstileOn()) return undefined;
    for (let i = 0; i < 40 && !turnstileToken.current; i++) await new Promise((r) => setTimeout(r, 250));
    return turnstileToken.current ?? undefined;
  };

  useEffect(() => {
    if (prefillEmail) setEmail(prefillEmail.toLowerCase());
  }, [prefillEmail]);

  // Worked out on this page only, for the per-browser signup limit (lib/signup-fingerprint.ts).
  const [fingerprint, setFingerprint] = useState<string | undefined>();
  useEffect(() => {
    let live = true;
    void whenSignupFingerprint().then((fp) => live && setFingerprint(fp));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (prompt?.trim()) setPendingPrompt(prompt);
  }, [prompt]);

  const afterAuthPath = () => {
    const returnTo = safeAppReturnTo(search.get("returnTo"));
    if (returnTo) {
      const q = returnTo.indexOf("?");
      if (q === -1) return { pathname: returnTo, search: "", state: undefined as { prompt?: string } | undefined };
      return { pathname: returnTo.slice(0, q), search: returnTo.slice(q), state: undefined as { prompt?: string } | undefined };
    }
    const p = prompt?.trim() || peekPendingPrompt();
    return { pathname: "/" as const, search: "", state: p ? { prompt: p } : undefined };
  };

  // As Lovable's: the email decides. A domain whose company signs in with SSO
  // skips the password and goes to SSO (apps/api/src/routes/sso.ts lookup).
  const [ssoDomain, setSsoDomain] = useState(false);
  useEffect(() => {
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setSsoDomain(false);
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      void api
        .get<{ sso: boolean }>(`/v1/auth/sso/lookup?email=${encodeURIComponent(value)}`)
        .then((r) => live && setSsoDomain(r.sso))
        .catch(() => live && setSsoDomain(false));
    }, 350);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [email]);

  // Back from Google with the browser's Back button: the page comes out of
  // the back/forward cache as it was left — spinning. Let it be pressed again.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const goToSso = () => {
    // The trip to the company's sign-in takes a moment; show it's on its way.
    setBusy(true);
    setError(null);
    const back = safeAppReturnTo(search.get("returnTo")) ?? "/";
    window.location.assign(`${API_URL}/v1/auth/sso/start?email=${encodeURIComponent(email.trim())}&returnTo=${encodeURIComponent(back)}`);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError(t.auth.enterEmail);
      return;
    }
    if (ssoDomain) {
      goToSso();
      return;
    }
    if (!password) {
      setError(t.auth.enterPassword);
      return;
    }
    if (weakPassword) {
      setError(t.auth.chooseStrongerPassword);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isSignup) {
        const res = await api.post<{ analyticsEventId?: string }>("/v1/auth/register", {
          email: email.trim(),
          password,
          name: name || undefined,
          turnstileToken: await waitForTurnstile(),
          fp: fingerprint ?? readySignupFingerprint(),
          ...getMetaClickIds(),
        });
        track("signup", { method: "password", eventId: res.analyticsEventId ?? undefined });
        setSessionHint(true);
        await refresh({ force: true });
        navigate("/verify-email", {
          state: { email: email.trim(), prompt, invite: inviteToken, returnTo: safeAppReturnTo(search.get("returnTo")) ?? undefined },
        });
        return;
      }
      const res = await api.post<{ emailVerified?: boolean }>("/v1/auth/login", {
        email: email.trim(),
        password,
        turnstileToken: await waitForTurnstile(),
      });
      track("login", { method: "password" });
      setSessionHint(true);
      await refresh({ force: true });
      if (res.emailVerified === false) {
        navigate("/verify-email", { state: { email: email.trim(), prompt, returnTo: safeAppReturnTo(search.get("returnTo")) ?? undefined } });
      } else if (inviteToken) {
        navigate(`/invite?token=${encodeURIComponent(inviteToken)}`);
      } else {
        const next = afterAuthPath();
        navigate({ pathname: next.pathname, search: next.search }, { state: next.state });
      }
    } catch (err: unknown) {
      // A Turnstile token is good for one try.
      turnstile.current?.reset();
      const body = (err as { body?: { error?: string } }).body;
      setError(
        body?.error === "email_taken"
          ? t.auth.signInPage.emailTaken
          : body?.error === "email_not_allowed"
            ? t.auth.signInPage.emailNotAllowed
            : body?.error === "vpn_not_allowed"
            ? t.auth.signInPage.vpnNotAllowed
            : body?.error === "invalid_credentials"
            ? t.auth.signInPage.invalidCredentials
            : t.auth.signInPage.genericError,
      );
    } finally {
      setBusy(false);
    }
  };

  /**
   * A native sheet is not a page: there is nowhere to navigate away to and
   * come back from, so the whole exchange happens here and the session is live
   * the moment it resolves. Both Apple and Google land in this.
   */
  const afterNativeSignIn = async (isNew: boolean, method: string) => {
    track(isNew ? "signup" : "login", { method, ...getMetaClickIds() });
    setSessionHint(true);
    await refresh({ force: true });
    if (inviteToken) {
      navigate(`/invite?token=${encodeURIComponent(inviteToken)}`);
    } else {
      const next = afterAuthPath();
      navigate({ pathname: next.pathname, search: next.search }, { state: next.state });
    }
  };

  /**
   * A cancel comes back as a thrown error like any other, and is the one case
   * that should say nothing — the person closed the sheet on purpose.
   */
  const [appleBusy, setAppleBusy] = useState(false);
  const continueWithApple = async () => {
    setError(null);
    setAppleBusy(true);
    try {
      const { isNew } = await signInWithApple();
      await afterNativeSignIn(isNew, "apple");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      const cancelled = /cancel|1001|user did not/i.test(msg);
      if (!cancelled) setError(isVpnRefusal(err) ? t.auth.signInPage.vpnNotAllowed : t.auth.signInPage.appleFailed);
    } finally {
      setAppleBusy(false);
    }
  };

  const [googleBusy, setGoogleBusy] = useState(false);
  const continueWithGoogle = async () => {
    setError(null);
    setGoogleBusy(true);
    try {
      const { isNew } = await signInWithGoogle();
      await afterNativeSignIn(isNew, "google");
    } catch (err: unknown) {
      if (!(err instanceof GoogleSignInCancelled)) setError(isVpnRefusal(err) ? t.auth.signInPage.vpnNotAllowed : t.auth.signInPage.googleFailed);
    } finally {
      setGoogleBusy(false);
    }
  };

  const title =
    inviteToken && isSignup
      ? t.auth.signInPage.acceptInvitationTitle
      : isSignup
        ? t.auth.signUp
        : t.auth.signIn;

  return (
    <AuthLayout title={title} promptPreview={prompt}>
      {isSignup && !inviteToken && inviteBonus > 0 && (
        // English until the referral feature is translated (i18n/messages/en.ts).
        <p className="mb-1 rounded-[12px] bg-white/[0.06] px-3 py-2 text-[13px] leading-snug text-white/85">
          {fill(en.referral.invited, { n: inviteBonus })}
        </p>
      )}
      {nativeGoogleSignInAvailable() ? (
        <OutlineButton onClick={() => void continueWithGoogle()} disabled={googleBusy}>
          {googleBusy ? <Spinner /> : <GoogleIcon />}
          {t.auth.signInPage.continueWithGoogle}
        </OutlineButton>
      ) : (
        <OutlineButton href={googleAuthUrl(inviteToken, safeAppReturnTo(search.get("returnTo")), fingerprint)}>
          <GoogleIcon />
          {t.auth.signInPage.continueWithGoogle}
        </OutlineButton>
      )}

      {appleSignInAvailable() && (
        <OutlineButton onClick={() => void continueWithApple()} disabled={appleBusy}>
          {appleBusy ? <Spinner /> : <AppleIcon />}
          {t.auth.signInPage.continueWithApple}
        </OutlineButton>
      )}

      <div className="relative w-full">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-line" />
        </div>
        <div className="relative flex justify-center text-[11px] tracking-wide uppercase">
          <span className="px-2.5" style={{ background: PAGE_BG, color: FG_MUTED }}>
            {t.auth.signInPage.or}
          </span>
        </div>
      </div>

      {oauthError && (
        <p className="text-sm text-red-400">
          {oauthError === "vpn_not_allowed" ? t.auth.signInPage.vpnNotAllowed : t.auth.signInPage.oauthFailed}
        </p>
      )}
      {ssoError && (
        <p className="text-sm text-red-400" data-testid="sso-error">
          {t.teams.ssoSignIn.errors[ssoError] ?? t.teams.ssoSignIn.failed}
        </p>
      )}

      <form onSubmit={submit} className="flex flex-col gap-3" noValidate autoComplete="off">
        <AuthField
          id={emailId}
          label={t.auth.emailLabel}
          type="email"
          dir="ltr"
          // Not in the app: the keyboard came up over "Continue with Google /
          // Apple" before anything was tapped.
          autoFocus={!isNative()}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value.toLowerCase());
            if (error) setError(null);
          }}
          placeholder={t.auth.emailPlaceholder}
        />
        {isSignup && !ssoDomain && (
          <AuthField
            id={nameId}
            label={t.auth.signInPage.nameLabel}
            value={name}
            onChange={(e) => setName(e.target.value)}
            dir="auto"
            placeholder={t.auth.signInPage.namePlaceholder}
          />
        )}
        {!ssoDomain && (
        <div>
          <AuthField
            id={passwordId}
            label={t.auth.passwordLabel}
            type="password"
            dir="ltr"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
            placeholder={t.auth.passwordPlaceholder}
          />
          {isSignup && <PasswordStrength password={password} />}
        </div>
        )}
        {!ssoDomain && <Turnstile ref={turnstile} onToken={(t) => (turnstileToken.current = t)} />}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <PrimaryButton disabled={busy || (!ssoDomain && weakPassword)}>
          {busy ? <Spinner size={16} /> : ssoDomain ? t.teams.ssoSignIn.continue : isSignup ? t.auth.signUp : t.auth.signIn}
        </PrimaryButton>
        {!isSignup && !ssoDomain && (
          <Link
            to="/forgot-password"
            className="text-center text-sm underline hover:text-white"
            style={{ color: FG_MUTED }}
          >
            {t.auth.signInPage.forgotPassword}
          </Link>
        )}
      </form>

      <p className="w-full text-center text-sm" style={{ color: FG_MUTED }}>
        {isSignup ? (
          rich(t.auth.signInPage.haveAccount, {
            link: (s) => (
              <Link to={`/login${inviteQuery}`} className="text-white underline">
                {s}
              </Link>
            ),
          })
        ) : (
          rich(t.auth.signInPage.noAccount, {
            link: (s) => (
              <Link to={`/signup${inviteQuery}`} className="text-white underline">
                {s}
              </Link>
            ),
          })
        )}
      </p>

      <div className="w-full border-t border-line" />

      <p
        className="w-full text-center text-[12px] leading-relaxed text-balance sm:whitespace-nowrap"
        style={{ color: FG_MUTED }}
      >
        {rich(t.auth.signInPage.legal, {
          terms: (s) => (
            <Link to="/terms" className="underline hover:text-white">
              {s}
            </Link>
          ),
          privacy: (s) => (
            <Link to="/privacy" className="underline hover:text-white">
              {s}
            </Link>
          ),
        })}
      </p>
    </AuthLayout>
  );
}
