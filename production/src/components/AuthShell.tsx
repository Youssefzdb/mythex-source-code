import { useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Link } from "react-router-dom";
import { MythexMark } from "./mythex-mark";
import { ThemeToggle } from "./ThemeToggle";
import { fill, useT } from "../i18n/app";

/** Branded auth page frame. Signup uses a split layout with mesh panel. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  split,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Split layout: form left, mesh + prompt mock right */
  split?: boolean;
}) {
  const t = useT();
  if (split) {
    return (
      <div className="grid min-h-full lg:grid-cols-2">
        <div className="relative flex flex-col justify-center px-6 py-12 sm:px-12">
          <div className="absolute top-4 end-4 z-20 lg:end-auto lg:start-6">
            <ThemeToggle />
          </div>
          <div className="mx-auto w-full max-w-sm">
            <Link to="/home" className="mb-8 inline-flex items-center gap-2">
              <MythexMark size={28} />
            </Link>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-5 text-center text-sm text-muted">{footer}</div>}
          </div>
        </div>
        <div className="relative hidden overflow-hidden lg:block">
          <div aria-hidden className="mx-atmosphere-mesh absolute inset-0" />
          <div className="relative z-10 flex h-full items-center justify-center p-12">
            <div className="w-full max-w-md rounded-2xl bg-white/95 p-5 text-start text-zinc-900 shadow-2xl">
              <p className="text-[15px] font-medium leading-relaxed">
                {t.auth.layout.shellPrompt}
                <span className="ms-0.5 inline-block h-4 w-0.5 animate-pulse bg-zinc-800 align-middle" />
              </p>
              <div className="mt-4 flex justify-end">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-zinc-900 text-white text-lg">
                  ↑
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative grid min-h-full place-items-center overflow-hidden bg-bg px-6 py-12">
      <div aria-hidden className="mx-atmosphere" />

      <div className="absolute top-4 end-4 z-20">
        <ThemeToggle />
      </div>

      <div className="fade-up relative z-10 w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link to="/home" className="mb-5 flex items-center gap-2.5">
            <span
              className="grid h-11 w-11 place-items-center rounded-[13px] border border-line bg-panel"
              style={{ boxShadow: "0 0 0 0.5px var(--mx-ring), 0 0 0 1px var(--mx-ring-outer), var(--mx-shadow), inset 0 1px 0 rgba(255,255,255,0.06)" }}
            >
              <MythexMark size={24} />
            </span>
            <span className="font-display text-xl font-semibold tracking-tight text-fg">Mythex</span>
          </Link>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">{title}</h1>
          {subtitle && <p className="mt-2 max-w-xs text-sm text-muted">{subtitle}</p>}
        </div>
        {children}
        {footer && <div className="mt-5 text-center text-sm text-muted">{footer}</div>}
      </div>
    </div>
  );
}

/** Password field with a show/hide toggle. */
export function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete = "off",
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  const t = useT();
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        required
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t.auth.passwordPlaceholder}
        className="input pe-10"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        className="absolute top-1/2 end-2.5 -translate-y-1/2 rounded p-1 text-muted transition hover:text-fg-2"
        aria-label={show ? t.auth.password.hide : t.auth.password.show}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/** At least 8 characters, an uppercase letter, a number, a special character. */
const PW_RULES = [
  (p: string) => p.length >= 8,
  (p: string) => /[A-Z]/.test(p),
  (p: string) => /[0-9]/.test(p),
  (p: string) => /[^A-Za-z0-9]/.test(p),
];

const STRENGTH_COLORS = ["#dc2626", "#f97316", "#eab308", "#22c55e"];

export function passwordScore(p: string): number {
  return PW_RULES.filter((test) => test(p)).length;
}

export function PasswordStrength({ password }: { password: string }) {
  const t = useT();
  const score = passwordScore(password);
  if (!password) return null;
  const idx = Math.max(0, score - 1);
  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full"
            style={{ background: i < score ? STRENGTH_COLORS[idx] : "var(--mx-line)" }}
          />
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-muted">
        {fill(t.auth.password.strengthLine, { strength: t.auth.password.strength[idx] ?? "" })}
      </p>
    </div>
  );
}
