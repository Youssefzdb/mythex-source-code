import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from "react";

/**
 * Cloudflare Turnstile on the email signup form, forgot password, the partner
 * forms and a signed-out visitor's first support message (the API checks the
 * token: apps/api/src/lib/turnstile.ts). Nearly every abusive account was made by a
 * script through this form; Turnstile tells a person in a browser from a
 * script, and most people never see it — it only shows a checkbox when
 * Cloudflare isn't sure.
 *
 * Off only when no site key is built in (local development). The phone app
 * runs it too: its pages are served as app.mythex.ai (capacitor.config.ts), and
 * the widget hands out tokens the API accepts there, measured on the iOS
 * simulator and the Android emulator against prod on 2026-10-29. Before that
 * it was off in the app, so email sign-up there always failed verification.
 */
const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() || "";

export const turnstileOn = (): boolean => Boolean(SITE_KEY);

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let script: Promise<TurnstileApi> | null = null;
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  script ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile_missing")));
    s.onerror = () => {
      script = null;
      reject(new Error("turnstile_load_failed"));
    };
    document.head.appendChild(s);
  });
  return script;
}

export type TurnstileHandle = {
  /** A token is good for one signup attempt; ask for a new one after a failed try. */
  reset: () => void;
};

export const Turnstile = forwardRef<TurnstileHandle, { onToken: (token: string | null) => void }>(
  function Turnstile({ onToken }, ref) {
    const box = useRef<HTMLDivElement>(null);
    const widget = useRef<string | null>(null);
    const latest = useRef(onToken);
    latest.current = onToken;

    useImperativeHandle(ref, () => ({
      reset: () => {
        latest.current(null);
        if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
      },
    }));

    useEffect(() => {
      if (!turnstileOn()) return;
      let gone = false;
      void loadTurnstile()
        .then((api) => {
          if (gone || !box.current) return;
          widget.current = api.render(box.current, {
            sitekey: SITE_KEY,
            // Hidden unless Cloudflare needs the visitor to click.
            appearance: "interaction-only",
            theme: "dark",
            callback: (token: string) => latest.current(token),
            "expired-callback": () => latest.current(null),
            "error-callback": () => latest.current(null),
          });
        })
        .catch(() => latest.current(null));
      return () => {
        gone = true;
        if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
        widget.current = null;
      };
    }, []);

    if (!turnstileOn()) return null;
    return <div ref={box} className="flex justify-center empty:hidden" />;
  },
);

/**
 * The widget to render in a form, and `take()` for its submit handler: waits
 * up to 10 seconds for a token, hands it over and asks for a fresh one, since a
 * token is good for one check. Undefined where Turnstile is off.
 */
export function useTurnstileToken(): { element: ReactNode; take: () => Promise<string | undefined> } {
  const ref = useRef<TurnstileHandle>(null);
  const token = useRef<string | null>(null);
  const take = async (): Promise<string | undefined> => {
    if (!turnstileOn()) return undefined;
    for (let i = 0; i < 40 && !token.current; i++) await new Promise((r) => setTimeout(r, 250));
    const t = token.current ?? undefined;
    if (t) ref.current?.reset();
    return t;
  };
  return { element: <Turnstile ref={ref} onToken={(t) => (token.current = t)} />, take };
}
