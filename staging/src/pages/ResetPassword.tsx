import { useId, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { PasswordStrength, passwordScore } from "../components/AuthShell";
import { useT } from "../i18n/app";
import { AuthField, AuthLayout, FG_MUTED, PrimaryButton } from "./auth/AuthLayout";
import { isNative } from "../lib/native";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const t = useT();
  const r = t.auth.resetPassword;

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordId = useId();
  const confirmId = useId();

  const mismatch = confirm.length > 0 && confirm !== password;
  const weak = password.length > 0 && passwordScore(password) < 3;

  if (!token) {
    return (
      <AuthLayout
        title={r.invalidTitle}
        subtitle={r.invalidSubtitle}
        footer={
          <Link to="/forgot-password" className="text-white underline">
            {r.requestNew}
          </Link>
        }
      >
        <p className="text-sm" style={{ color: FG_MUTED }}>
          {r.askFresh}
        </p>
      </AuthLayout>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (weak) {
      setError(t.auth.chooseStrongerPassword);
      return;
    }
    if (password !== confirm) {
      setError(r.mismatchError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/v1/auth/reset-password", { token, password });
      setDone(true);
      setTimeout(() => navigate("/login"), 2200);
    } catch (err: unknown) {
      const body = (err as { body?: { error?: string } }).body;
      setError(
        body?.error === "invalid_or_expired"
          ? r.expired
          : r.error,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={done ? r.doneTitle : r.title}
      subtitle={done ? r.doneSubtitle : r.subtitle}
      footer={
        !done ? (
          <Link to="/login" className="text-white underline">
            {t.auth.backToSignIn}
          </Link>
        ) : undefined
      }
    >
      {done ? (
        <p className="text-sm" style={{ color: FG_MUTED }}>
          {r.doneBody}
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate autoComplete="off">
          <div>
            <AuthField
              id={passwordId}
              label={r.newPasswordLabel}
              type="password"
              dir="ltr"
              autoFocus={!isNative()}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              placeholder={t.auth.passwordPlaceholder}
            />
            <PasswordStrength password={password} />
          </div>
          <div>
            <AuthField
              id={confirmId}
              label={r.confirmLabel}
              type="password"
              dir="ltr"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                if (error) setError(null);
              }}
              placeholder={r.confirmPlaceholder}
            />
            {mismatch && <p className="mt-1 text-xs text-red-400">{r.mismatch}</p>}
            {confirm.length > 0 && !mismatch && (
              <p className="mt-1 text-xs text-emerald-400">{r.match}</p>
            )}
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <PrimaryButton disabled={busy || weak || mismatch || !confirm}>
            {busy ? r.saving : r.submit}
          </PrimaryButton>
        </form>
      )}
    </AuthLayout>
  );
}
