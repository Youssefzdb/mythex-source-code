import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { X } from "lucide-react";
import { isNative } from "../lib/native";
import { STORE_URL } from "../lib/force-update";
import { CARD_BG, FG, FG_TERTIARY, surfaceRing } from "../lib/surfaces";
import { MythexMark } from "./mythex-mark";
import { useT } from "../i18n/app";
import { usePageT } from "../i18n/usePageT";
import { useI18n } from "../i18n/useI18n";
import { DEFAULT_LOCALE } from "../i18n/locales";

const DISMISS_KEY = "mythex.getAppClosedAt";
const DISMISS_FOR_MS = 30 * 24 * 60 * 60 * 1000;
/** Where it never shows: where a sign-in, a payment or a reply is under way, the chat (its composer is at the bottom), and /download, which is the offer itself. */
const HIDDEN = [/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(login|signup|forgot-password|reset-password|verify-email|billing|mcp|download)/, /^\/p\//, /^\/admin/];

/**
 * "Get the app", in every phone browser — Safari, Chrome, Gmail's and
 * Instagram's, Android's — and never in the app itself, on a tablet or on a
 * computer. Closed with ✕, it stays away for 30 days; Get leaves it
 * there, for whoever comes back from the store without installing. The site can't tell whether
 * the app is installed: the store page then says "Open".
 *
 * Instead of Safari's own banner (the apple-itunes-app tag, removed from
 * index.html): that showed in Safari only, and with this as well it was two.
 */
export function platformToOffer(): "ios" | "android" | null {
  if (isNative() || typeof navigator === "undefined") return null;
  // A phone's width — Android and iPhone tablets are wider. Not "a touch
  // screen" as well: the Android emulator reports a mouse, and the bar never
  // showed in its Chrome.
  if (!window.matchMedia?.("(max-width: 767px)").matches) return null;
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPod/.test(ua)) return "ios";
  return null;
}

export function GetAppBanner() {
  const { pathname } = useLocation();
  // A translated page (/ar/…) in its own language; the app's screens in the
  // person's app language.
  const { locale } = useI18n();
  const pageT = usePageT();
  const appT = useT();
  const t = locale === DEFAULT_LOCALE ? appT : pageT;
  const s = { ...t.shell.getApp, close: t.common.close };
  const [platform] = useState(platformToOffer);
  const [dismissed, setDismissed] = useState(() => {
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY));
      return at > 0 && Date.now() - at < DISMISS_FOR_MS;
    } catch {
      return false;
    }
  });
  const [shown, setShown] = useState(false);
  const hidden = !platform || dismissed || HIDDEN.some((r) => r.test(pathname));
  // In after the page has drawn, not with it: it slides up rather than being there from the first frame.
  useEffect(() => {
    if (hidden) return setShown(false);
    const t = window.setTimeout(() => setShown(true), 1200);
    return () => window.clearTimeout(t);
  }, [hidden]);
  if (hidden || !platform) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Private mode: gone for this visit.
    }
  };

  return (
    <div
      data-get-app-bar
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
    >
      <div
        role="region"
        aria-label={s.title}
        className="pointer-events-auto flex w-full max-w-[26rem] items-center gap-3 rounded-[16px] py-2.5 ps-3 pe-2 transition-[opacity,transform] duration-300 ease-out"
        style={{
          background: CARD_BG,
          boxShadow: `${surfaceRing(CARD_BG)}, 0 12px 32px rgb(0 0 0 / 0.45)`,
          opacity: shown ? 1 : 0,
          transform: shown ? "none" : "translateY(16px)",
        }}
      >
        <MythexMark size={40} className="rounded-[10px]" />
        <div className="min-w-0 flex-1 text-start">
          <p className="truncate text-[14px] font-semibold" style={{ color: FG }}>
            {s.title}
          </p>
          <p className="truncate text-[12px]" style={{ color: FG_TERTIARY }}>
            {s.body}
          </p>
        </div>
        <a
          // The same tab: the phone hands a store link to the store app and
          // the page stays as it was, bar and all, for whoever comes back. A
          // new tab left them on an empty one.
          href={STORE_URL[platform]}
          className="btn-primary h-8 shrink-0 rounded-full px-4 text-[13px]"
        >
          {s.download}
        </a>
        <button
          type="button"
          aria-label={s.close}
          onClick={dismiss}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ color: FG_TERTIARY }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
