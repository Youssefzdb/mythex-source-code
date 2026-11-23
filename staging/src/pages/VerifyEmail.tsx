import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { track } from "../lib/analytics";
import { useAuth } from "../lib/auth";
import { peekPendingPrompt, setPendingPrompt } from "../lib/pending-prompt";
import { useToast } from "../components/ui";
import { fill, useT } from "../i18n/app";
import { rich } from "../i18n/app/rich";
import { AuthLayout, FG_MUTED, FIELD_SHADOW } from "./auth/AuthLayout";
import { isNative } from "../lib/native";

export function VerifyEmail() {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(30);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const t = useT();
  const v = t.auth.verifyEmail;
  const { user, loading, refresh, logout } = useAuth();
  const state = location.state as { email?: string; prompt?: string; invite?: string; returnTo?: string } | null;
  // Back to the page that sent them to sign up (the creator program, a members-only app).
  const returnTo = state?.returnTo?.startsWith("/") && !state.returnTo.startsWith("//") ? state.returnTo : null;
  const email = state?.email ?? user?.email;
  const prompt = state?.prompt?.trim() || peekPendingPrompt();
  const afterVerify = state?.invite
    ? `/invite?token=${encodeURIComponent(state.invite)}`
    : (returnTo ?? "/");

  useEffect(() => {
    if (prompt) setPendingPrompt(prompt);
  }, [prompt]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    if (user.emailVerified) {
      navigate(afterVerify, {
        replace: true,
        state: prompt ? { prompt } : undefined,
      });
    }
  }, [user, loading, navigate, afterVerify, prompt]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const submit = async (code: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/v1/auth/verify-email", { code });
      track("email_verified");
      await refresh({ force: true });
      toast("success", v.verified);
      navigate(afterVerify, { state: prompt ? { prompt } : undefined });
    } catch {
      setError(v.wrongCode);
      setDigits(Array(6).fill(""));
      inputs.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  };

  const setDigit = (i: number, value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length > 1) {
      const next = Array(6).fill("");
      cleaned
        .slice(0, 6)
        .split("")
        .forEach((c, j) => (next[j] = c));
      setDigits(next);
      if (cleaned.length >= 6) void submit(cleaned.slice(0, 6));
      else inputs.current[cleaned.length]?.focus();
      return;
    }
    const next = [...digits];
    next[i] = cleaned;
    setDigits(next);
    if (cleaned && i < 5) inputs.current[i + 1]?.focus();
    const code = next.join("");
    if (code.length === 6) void submit(code);
  };

  const resend = async () => {
    setResendIn(30);
    try {
      await api.post("/v1/auth/resend-verification");
      toast("info", v.resent);
    } catch {
      toast("error", v.resendFailed);
    }
  };

  const switchAccount = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <AuthLayout
      title={v.title}
      subtitle={rich(v.subtitle, {
        // The tag wraps the {email} placeholder; the address itself fills it.
        email: () => (
          <span className="text-white" dir={email ? "ltr" : undefined}>
            {email ?? v.yourEmail}
          </span>
        ),
      })}
      footer={
        <button
          type="button"
          onClick={() => void switchAccount()}
          className="underline hover:text-white"
          style={{ color: FG_MUTED }}
        >
          {v.switchAccount}
        </button>
      }
    >
      <div className="flex justify-center gap-2" dir="ltr">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            value={digit}
            autoFocus={i === 0 && !isNative()}
            inputMode="numeric"
            maxLength={6}
            disabled={busy}
            autoComplete="off"
            name={`mythex-otp-${i}`}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
            }}
            className="h-10 w-10 rounded-[8px] bg-transparent text-center font-mono text-xl text-white outline-none"
            style={{ boxShadow: FIELD_SHADOW }}
          />
        ))}
      </div>

      {error && <p className="text-center text-sm text-red-400">{error}</p>}

      <p className="text-center text-sm" style={{ color: FG_MUTED }}>
        {v.notReceived}{" "}
        {resendIn > 0 ? (
          <span>{fill(v.resendIn, { n: resendIn })}</span>
        ) : (
          <button type="button" onClick={() => void resend()} className="text-white underline">
            {v.resend}
          </button>
        )}
      </p>
    </AuthLayout>
  );
}
