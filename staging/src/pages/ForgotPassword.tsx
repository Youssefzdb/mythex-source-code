import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { fill, useT } from "../i18n/app";
import { rich } from "../i18n/app/rich";
import { AuthField, AuthLayout, FG_MUTED, PrimaryButton } from "./auth/AuthLayout";
import { isNative } from "../lib/native";
import { useTurnstileToken } from "../components/auth/Turnstile";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailId = useId();
  const t = useT();
  const f = t.auth.forgotPassword;
  // A person in a browser, so nobody scripts reset emails at strangers (routes/auth.ts).
  const human = useTurnstileToken();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError(t.auth.enterEmail);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/v1/auth/forgot-password", { email: email.toLowerCase(), turnstileToken: await human.take() });
      setSent(true);
    } catch {
      setError(f.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={sent ? f.sentTitle : f.title}
      subtitle={sent ? fill(f.sentSubtitle, { email }) : f.subtitle}
      footer={
        <Link to="/login" className="text-white underline hover:text-white">
          {t.auth.backToSignIn}
        </Link>
      }
    >
      {sent ? null : (
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate autoComplete="off">
          <AuthField
            id={emailId}
            label={t.auth.emailLabel}
            type="email"
            dir="ltr"
            autoFocus={!isNative()}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value.toLowerCase());
              if (error) setError(null);
            }}
            placeholder={t.auth.emailPlaceholder}
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          {human.element}
          <PrimaryButton disabled={busy}>{busy ? f.sending : f.send}</PrimaryButton>
        </form>
      )}
      {sent && (
        <p className="text-sm" style={{ color: FG_MUTED }}>
          {rich(f.notReceived, {
            retry: (s) => (
              <button
                type="button"
                className="text-white underline"
                onClick={() => {
                  setSent(false);
                  setError(null);
                }}
              >
                {s}
              </button>
            ),
          })}
        </p>
      )}
    </AuthLayout>
  );
}
