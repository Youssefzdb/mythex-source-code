import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Dialog, Spinner, useToast } from "./ui";
import { btnClass, FIELD_CLASS, whiteBtnClass } from "../lib/surfaces";
import { appT, fill, useT } from "../i18n/app";
import { rich } from "../i18n/app/rich";
import { AuthLayout, FIELD_SHADOW, PrimaryButton } from "../pages/auth/AuthLayout";

function errMessage(err: unknown, fallback: string): string {
  const body = err instanceof ApiError ? (err.body as { message?: unknown } | null) : null;
  return typeof body?.message === "string" ? body.message : fallback;
}

/**
 * Two-factor sign-in (authenticator app) — apps/api/src/routes/two-factor.ts.
 *
 * `TwoFactorPrompt`: after signing in, an account with it on enters a code
 * before anything else opens (App.tsx `Protected` shows this instead).
 * `TwoFactorSetup`: Settings → Account turns it on (QR, first code, recovery
 * codes), makes new recovery codes, or turns it off.
 */

export function TwoFactorPrompt() {
  const { refresh, logout, user } = useAuth();
  const t = useT();
  const tf = t.teams.twoFactor;
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = async (value = code) => {
    if (!value.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/v1/auth/2fa/verify", { code: value.trim() });
      await refresh({ force: true });
    } catch (err) {
      setError(errMessage(err, appT().teams.twoFactor.codeFailed));
      setCode("");
      setBusy(false);
    }
  };

  // The same page as sign-in (pages/auth/AuthLayout): this is its second step.
  return (
    <div data-testid="two-factor-prompt">
      <AuthLayout
        title={tf.title}
        subtitle={recovery ? tf.enterRecovery : tf.enterCode}
        footer={
          user?.email ? (
            <span className="text-[13px]">{fill(tf.signedInAs, { email: user.email })}</span>
          ) : undefined
        }
      >
        <form
          className="flex w-full flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          {recovery ? (
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              autoFocus
              placeholder="xxxx-xxxx"
              dir="ltr"
              className="h-11 w-full rounded-[10px] bg-transparent px-3 text-center font-mono text-base tracking-[0.15em] text-white outline-none placeholder:text-white/30"
              style={{ boxShadow: FIELD_SHADOW }}
              aria-label={tf.recoveryAria}
              data-testid="two-factor-code"
            />
          ) : (
            <CodeBoxes
              value={code}
              onChange={(v) => {
                setCode(v);
                if (error) setError(null);
                // All six digits in: no need to reach for Continue.
                if (v.length === 6) void verify(v);
              }}
              disabled={busy}
              invalid={Boolean(error)}
              label={tf.codeAria}
            />
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <PrimaryButton disabled={busy || (!recovery && code.length !== 6) || (recovery && !code.trim())}>
            {busy ? <Spinner size={16} /> : t.common.continue}
          </PrimaryButton>
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              className="text-white underline-offset-2 hover:underline"
              onClick={() => {
                setRecovery((r) => !r);
                setCode("");
                setError(null);
              }}
            >
              {recovery ? tf.useApp : tf.useRecovery}
            </button>
            <button type="button" className="text-white/70 underline-offset-2 hover:text-white hover:underline" onClick={() => void logout()}>
              {tf.signOut}
            </button>
          </div>
        </form>
      </AuthLayout>
    </div>
  );
}

/**
 * Six boxes for the 6-digit code. One real input sits over them, so typing,
 * pasting and the phone's one-time-code autofill all just work.
 */
function CodeBoxes({
  value,
  onChange,
  disabled,
  invalid,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  label: string;
}) {
  const [focused, setFocused] = useState(true);
  return (
    <div className="relative w-full" dir="ltr">
      <div className="grid grid-cols-6 gap-2" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => {
          const active = focused && !disabled && (i === value.length || (i === 5 && value.length === 6));
          return (
            <div
              key={i}
              className="grid h-12 place-items-center rounded-[10px] text-xl font-medium text-white transition-shadow"
              style={{
                // The field's own shadow plus the ring (a ring class would be overridden by it).
                boxShadow: `${FIELD_SHADOW}${active ? ", 0 0 0 2px rgba(255,255,255,0.85)" : invalid ? ", 0 0 0 1px rgba(248,113,113,0.8)" : ""}`,
                background: value[i] ? "rgba(255,255,255,0.06)" : "transparent",
              }}
            >
              {value[i] ?? (active ? <span className="h-5 w-px animate-pulse bg-white" /> : null)}
            </div>
          );
        })}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        disabled={disabled}
        maxLength={6}
        aria-label={label}
        data-testid="two-factor-code"
        className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent"
      />
    </div>
  );
}

type SetupData = { secret: string; qr: string };

/** Settings → Account → Two-factor sign-in. */
export function TwoFactorSetup({ enabled, onChanged, required }: { enabled: boolean; onChanged: () => void; required?: boolean }) {
  const toast = useToast();
  const t = useT();
  const tf = t.teams.twoFactor;
  const [open, setOpen] = useState<"setup" | "off" | "codes" | null>(null);
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(null);
    setSetup(null);
    setCode("");
    setCodes(null);
    setError(null);
  };

  const start = async () => {
    setOpen("setup");
    setBusy(true);
    try {
      setSetup(await api.post<SetupData>("/v1/account/2fa/setup", {}));
    } catch (err) {
      setError(errMessage(err, appT().teams.twoFactor.setupFailed));
    } finally {
      setBusy(false);
    }
  };

  // Sent here because a workspace requires it: open the setup straight away.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (required && !enabled && !autoStarted.current) {
      autoStarted.current = true;
      void start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [required, enabled]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (open === "setup") {
        const res = await api.post<{ recoveryCodes: string[] }>("/v1/account/2fa/enable", { code: code.trim() });
        setCodes(res.recoveryCodes);
        onChanged();
      } else if (open === "codes") {
        const res = await api.post<{ recoveryCodes: string[] }>("/v1/account/2fa/recovery-codes", { code: code.trim() });
        setCodes(res.recoveryCodes);
      } else if (open === "off") {
        await api.post("/v1/account/2fa/disable", { code: code.trim() });
        toast("success", appT().teams.twoFactor.turnedOff);
        onChanged();
        close();
      }
    } catch (err) {
      setError(errMessage(err, appT().teams.twoFactor.codeFailed));
    } finally {
      setBusy(false);
    }
  };

  const codeInput = (
    <input
      value={code}
      onChange={(e) => setCode(e.target.value.slice(0, 32))}
      inputMode="text"
      autoComplete="one-time-code"
      placeholder={open === "setup" ? "123456" : tf.codeOrRecovery}
      className={`${FIELD_CLASS} !h-10 text-center tracking-[0.2em]`}
      aria-label={tf.codeAria}
      autoFocus
      data-testid="two-factor-setup-code"
    />
  );

  return (
    <>
      {enabled ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnClass("lg")} onClick={() => setOpen("codes")}>
            {tf.newCodes}
          </button>
          <button type="button" className={`${btnClass("lg")} text-red-300`} onClick={() => setOpen("off")}>
            {t.teams.turnOff}
          </button>
        </div>
      ) : (
        <button type="button" className={whiteBtnClass("lg")} onClick={() => void start()} data-testid="two-factor-setup">
          {tf.setUp}
        </button>
      )}

      {open && (
        <Dialog
          title={codes ? tf.saveCodesTitle : open === "setup" ? tf.setupTitle : open === "off" ? tf.offTitle : tf.newCodes}
          subtitle={codes ? tf.codesBody : open === "setup" ? (required ? tf.setupRequired : tf.setupBody) : tf.enterAnyCode}
          onClose={close}
          dismissible={!busy}
          sheet
        >
          {codes ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-line p-3 font-mono text-[13px] text-fg" data-testid="recovery-codes">
                {codes.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className={btnClass("lg")}
                  onClick={() => void navigator.clipboard.writeText(codes.join("\n")).then(() => toast("success", t.teams.copied))}
                >
                  {t.common.copy}
                </button>
                <button type="button" className={whiteBtnClass("lg")} onClick={close}>
                  {t.common.done}
                </button>
              </div>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {open === "setup" && (
                <div className="mt-4 flex flex-col items-center gap-3">
                  {setup ? (
                    <>
                      <img src={setup.qr} alt={tf.qrAlt} className="size-44 rounded-lg bg-white p-2" />
                      <p className="text-center text-[12px] text-muted">
                        {rich(tf.cantScan, { key: <code className="break-all text-fg-2">{setup.secret}</code> })}
                      </p>
                    </>
                  ) : (
                    <Spinner size={18} />
                  )}
                </div>
              )}
              <div className="mt-4">{codeInput}</div>
              {error && <p className="mt-2 text-sm text-danger">{error}</p>}
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className={btnClass("lg", "ghost")} onClick={close} disabled={busy}>
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className={open === "off" ? "btn-danger !h-8 !rounded-[8px] !px-3 text-sm" : whiteBtnClass("lg")}
                  disabled={busy || code.trim().length < 6 || (open === "setup" && !setup)}
                  data-testid="two-factor-setup-submit"
                >
                  {busy ? <Spinner size={12} /> : open === "setup" ? t.teams.turnOn : open === "off" ? t.teams.turnOff : tf.makeCodes}
                </button>
              </div>
            </form>
          )}
        </Dialog>
      )}
    </>
  );
}
