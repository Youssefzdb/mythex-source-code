import { useEffect, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useNativeBleedTop } from "../../lib/native-bleed-top";
import { ArrowUp } from "lucide-react";
import { Link } from "react-router-dom";
import { MythexMark } from "../../components/mythex-mark";
import { PulseBackground } from "../../components/PulseBackground";
import { lockDocumentTheme } from "../../lib/theme";
import { useT } from "../../i18n/app";
import { canSell } from "../../lib/native";

/**
 * Shared auth chrome for login / signup / forgot / reset / verify / invite.
 * Layout: `lg:grid-cols-2`, form max 350px, right panel on the landing page's background.
 */
export const PAGE_BG = "#1f1f1e";
export const FG_MUTED = "oklch(72.34% 0.002 107)";

export const SHADOW_BUTTON_NEUTRAL =
  "inset 0px 0.5px 0px 0px #ffffff29, inset 0px -0.5px 0px 0px #ffffff0a, inset 0px 0px 0px 0.5px #ffffff29, 0px 2px 2px -1px #0000001f, 0px 4px 4px -2px #0000001f";

export const SHADOW_BUTTON_INVERSE =
  "inset 0px 0.5px 0px 0px #ffffff29, inset 0px -0.5px 0px 0px #ffffff0a, inset 0px 0px 0px 0.5px #fff, 0px 2px 2px -1px #0000001f, 0px 4px 4px -2px #0000001f";

export const FIELD_SHADOW =
  "rgba(255, 255, 255, 0.08) 0px 1px 0px 0px inset, rgba(0, 0, 0, 0.08) 0px 2px 2px -1px inset, rgba(0, 0, 0, 0.08) 0px 4px 4px -2px inset, rgba(0, 0, 0, 0.12) 0px 1px 0px 0px, oklch(0.55 0.002 107 / 0.16) 0px 0px 0px 1px inset";

/** Auth button: `rounded-2` (8px) + `min-h-8` (32px). */
export const BTN =
  "inline-flex h-8 min-h-8 w-full items-center justify-center gap-2 rounded-[8px] px-2.5 text-sm font-normal transition";

export function OutlineButton({
  children,
  href,
  onClick,
  type = "button",
  disabled,
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const className = `${BTN} text-white hover:bg-white/[0.04] disabled:opacity-60`;
  const style = { boxShadow: SHADOW_BUTTON_NEUTRAL };
  if (href) {
    return (
      <a href={href} className={className} style={style}>
        {children}
      </a>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={className} style={style}>
      {children}
    </button>
  );
}

export function PrimaryButton({
  children,
  type = "submit",
  disabled,
  onClick,
}: {
  children: ReactNode;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${BTN} bg-white text-zinc-900 hover:bg-white/95 disabled:opacity-60`}
      style={{ boxShadow: SHADOW_BUTTON_INVERSE }}
    >
      {children}
    </button>
  );
}

export function AuthField({
  id,
  label,
  ...props
}: {
  id: string;
  label: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-white">
        {label}
      </label>
      <input
        id={id}
        className="h-8 w-full rounded-[8px] bg-transparent px-3 text-sm text-white outline-none placeholder:text-white/40"
        style={{ boxShadow: FIELD_SHADOW }}
        {...props}
        autoComplete="off"
      />
    </div>
  );
}

function AuthTypewriter({ className = "" }: { className?: string }) {
  const [wordIdx, setWordIdx] = useState(0);
  const [chars, setChars] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const t = useT();
  const words = t.auth.layout.typewriterWords;
  const word = words[wordIdx % words.length] ?? "";

  useEffect(() => {
    const done = chars === word.length && !deleting;
    const empty = chars === 0 && deleting;
    const delay = done ? 1600 : deleting ? 28 : 42;
    const timer = window.setTimeout(() => {
      if (done) {
        setDeleting(true);
        return;
      }
      if (empty) {
        setDeleting(false);
        setWordIdx((i) => (i + 1) % words.length);
        return;
      }
      setChars((c) => c + (deleting ? -1 : 1));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [chars, deleting, word, words.length]);

  return (
    <span className={`relative inline-block min-w-[80px] ${className}`}>
      {t.auth.layout.typewriterPrefix}
      {word.slice(0, Math.min(chars, word.length))}
      <span
        className="absolute top-1/2 ms-[2px] inline-block h-[1.4em] w-[2px] -translate-y-1/2 bg-[#fb7185] opacity-100"
        aria-hidden
      />
    </span>
  );
}

function AuthVisualPanel({ promptPreview }: { promptPreview?: string }) {
  return (
    <div className="sticky top-0 hidden h-full min-h-dvh p-4 lg:block">
      <div
        className="relative h-full min-h-[calc(var(--app-content-h)-2rem)] w-full overflow-hidden rounded-[12px]"
        style={{ contain: "paint" }}
      >
        {/* The landing page's own background, so sign-in looks like the home hero. */}
        <PulseBackground position="absolute" />

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div
            className="flex w-[min(450px,calc(100%-2rem))] items-center gap-4 rounded-[16px] p-4 shadow-xl"
            style={{ background: "rgba(252, 251, 248, 0.85)" }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-base text-black" dir={promptPreview?.trim() ? "auto" : undefined}>
                {promptPreview?.trim() ? promptPreview.trim() : <AuthTypewriter className="text-base" />}
              </p>
            </div>
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gray-900 text-gray-50">
              <ArrowUp className="h-5 w-5" strokeWidth={2.25} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  promptPreview,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  promptPreview?: string;
}) {
  // This page paints its own background, one step off <body>'s; without this
  // the strip behind the status bar stays body's colour and shows as a seam.
  useNativeBleedTop();
  const t = useT();
  useEffect(() => {
    lockDocumentTheme("dark");
    return () => lockDocumentTheme(null);
  }, []);

  return (
    <div
      className="native-inset-top flex min-h-screen flex-col text-white"
      style={{ background: PAGE_BG }}
    >
      <div className="grid flex-1 lg:grid-cols-2">
        {/* min-w-0: a grid item defaults to `min-width: auto`, which is its
            min-content width — here the 350px card plus its 32px of padding.
            On a 375px screen that is 382px the item refuses to give up, and
            the whole page scrolled sideways by the 7px difference. */}
        <div className="flex min-w-0 justify-center px-4 py-20">
          {/* In the app the title stays put from screen to screen (Sign in,
              Sign up, Forgot password) as a native screen's does: centred, it
              moved with each screen's amount of content. */}
          <div
            className={`relative flex w-full max-w-[350px] flex-col items-start ${canSell() ? "justify-center" : "justify-start pt-4"}`}
          >
            <div className="mb-6">
              {/* In the app there is no website to go to: the mark is just the mark. */}
              {canSell() ? (
                <Link to="/home" className="inline-flex h-9 items-center" aria-label={t.auth.layout.homeAria}>
                  <MythexMark size={36} />
                </Link>
              ) : (
                <span className="inline-flex h-9 items-center">
                  <MythexMark size={36} />
                </span>
              )}
            </div>

            <div className="flex w-full flex-col gap-8">
              <div>
                <h1 className="text-3xl font-medium text-white">{title}</h1>
                {subtitle && (
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: FG_MUTED }}>
                    {subtitle}
                  </p>
                )}
              </div>

              <div className="flex w-full flex-col gap-4">{children}</div>

              {footer && <div className="w-full text-center text-sm" style={{ color: FG_MUTED }}>{footer}</div>}
            </div>
          </div>
        </div>

        <AuthVisualPanel promptPreview={promptPreview} />
      </div>
    </div>
  );
}
