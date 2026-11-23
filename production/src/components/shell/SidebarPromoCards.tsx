import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { lazyRoute } from "../../lib/lazy-route";
import { Gift } from "lucide-react";
import { PANEL_BG, FG_SECONDARY, CARD_BG } from "../../lib/surfaces";
import { PRO_SALE_PERCENT, proSidebarHeadline, PRICING } from "../PricingPlans";
import { fill, pl, useT } from "../../i18n/app";
import { platformToOffer } from "../GetAppBanner";
import { STORE_URL } from "../../lib/force-update";
import { MythexMark } from "../mythex-mark";

const ShareMythexDialog = lazyRoute(() => import("../ShareMythexDialog").then((m) => ({ default: m.ShareMythexDialog })));

/**
 * The cards at the foot of the sidebar, as Lovable's: "Upgrade to Pro" (Free
 * plans) and "Share Mythex" (anyone who can buy). With both, they sit as a
 * deck — the second tucked 10px under the first at 95% — and fan out into a
 * column while the pointer is over them (or focus is inside), 8px apart, over
 * 200ms. Only with a fine pointer that can hover; on touch, and in the phone
 * drawer, they're a plain column.
 */

const TUCK_Y = 10;
const TUCK_SCALE = 0.05;
const GAP = 8;

const CARD_SHAPE = "relative flex h-14 w-full cursor-pointer items-center justify-between gap-3 rounded-[12px] px-3 py-2 text-start";
const MUTED = "oklch(0.7234 0.002 107)";

function layout(heights: number[], open: boolean) {
  if (open) {
    let y = 0;
    const items = heights.map((h) => {
      const at = { y, scale: 1 };
      y += h + GAP;
      return at;
    });
    return { items, height: Math.max(y - GAP, 0) };
  }
  const items = heights.map((_, i) => ({ y: i * TUCK_Y, scale: Math.max(1 - i * TUCK_SCALE, 0) }));
  return { items, height: Math.max(0, ...heights.map((h, i) => items[i].y + h * items[i].scale)) };
}

function useFinePointer() {
  const q = "(hover: hover) and (pointer: fine)";
  const [fine, setFine] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setFine(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return fine;
}

export function SidebarPromoCards({
  upgrade,
  share,
  onUpgrade,
  isFree,
  inDrawer = false,
}: {
  upgrade: boolean;
  share: boolean;
  onUpgrade: () => void;
  /** On Free the upgrade card is on top; otherwise sharing leads. */
  isFree: boolean;
  inDrawer?: boolean;
}) {
  const fine = useFinePointer();
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [sharing, setSharing] = useState(false);
  const onHeight = useCallback((key: string, h: number) => {
    setHeights((prev) => (prev[key] === h ? prev : { ...prev, [key]: h }));
  }, []);

  const cards: { key: string; node: ReactNode }[] = [];
  if (share) cards.push({ key: "share", node: <ShareCard onClick={() => setSharing(true)} /> });
  if (upgrade) {
    const card = { key: "upgrade", node: <UpgradeCard onClick={onUpgrade} /> };
    if (isFree) cards.unshift(card);
    else cards.push(card);
  }

  // In a phone's browser, the phone menu offers the app: the way back to it
  // after the bar at the bottom (GetAppBanner) was closed.
  const [appStore] = useState(() => (inDrawer ? platformToOffer() : null));
  if (appStore) cards.push({ key: "app", node: <AppCard href={STORE_URL[appStore]} /> });

  const dialog = sharing && (
    <Suspense fallback={null}>
      <ShareMythexDialog onClose={() => setSharing(false)} />
    </Suspense>
  );
  if (cards.length === 0) return null;

  const hs = cards.map((c) => heights[c.key] ?? 0);
  const deck = fine && !inDrawer && cards.length > 1 && hs.every((h) => h > 0) ? layout(hs, hover || focus) : null;

  return (
    <>
      <div
        className="-m-2 p-2"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setFocus(true)}
        onBlur={(e) => setFocus(e.currentTarget.contains(e.relatedTarget as Node | null))}
      >
        <div
          className={deck ? "relative transition-[height] duration-200 ease-out" : "flex flex-col gap-2"}
          style={deck ? { height: deck.height } : undefined}
        >
          {cards.map((c, i) => (
            <Measured
              key={c.key}
              id={c.key}
              onHeight={onHeight}
              className={deck ? "absolute inset-x-0 top-0 origin-top transition-transform duration-200 ease-out" : undefined}
              style={
                deck
                  ? { transform: `translateY(${deck.items[i].y}px) scale(${deck.items[i].scale})`, zIndex: cards.length - i }
                  : undefined
              }
            >
              {c.node}
            </Measured>
          ))}
        </div>
      </div>
      {dialog}
    </>
  );
}

function Measured({
  id,
  onHeight,
  className,
  style,
  children,
}: {
  id: string;
  onHeight: (id: string, h: number) => void;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => el.offsetHeight > 0 && onHeight(id, el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [id, onHeight]);
  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}

/** Free plans: the offer, with a gradient border that runs while hovered. */
function UpgradeCard({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group/upgrade ${CARD_SHAPE} border-[0.5px] border-[oklch(0.55_0.002_107/0.4)] transition-colors hover:border-transparent`}
      style={{ background: PANEL_BG }}
    >
      <style>{`@keyframes mx-promo-gradient{0%{background-position:100% center}50%{background-position:50% center}100%{background-position:0% center}}`}</style>
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-px block rounded-[inherit] bg-[linear-gradient(to_right,rgb(139_123_255/0.6),rgb(255_90_122/0.6),rgb(255_122_47/0.6))] bg-[length:400%_100%] p-px opacity-0 transition-opacity group-hover/upgrade:opacity-100 group-hover/upgrade:duration-0 [animation:mx-promo-gradient_8s_ease-in-out_infinite_alternate] [animation-play-state:paused] group-hover/upgrade:[animation-play-state:running] motion-reduce:[animation:none]"
        style={{
          WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "destination-out",
          mask: "linear-gradient(#fff 0 0) content-box subtract, linear-gradient(#fff 0 0)",
          clipPath: "padding-box",
        }}
      />
      <span className="flex min-w-0 flex-col justify-between">
        <span className="truncate text-sm leading-5 font-[480] text-white">{proSidebarHeadline()}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs leading-4" style={{ color: MUTED }}>
          <span
            className="inline-flex shrink-0 items-center rounded-full px-1.5 text-[11px] leading-4 font-medium"
            style={{ background: PRICING.successBg, color: PRICING.successFg }}
          >
            {fill(t.shell.sidebar.percentOff, { percent: PRO_SALE_PERCENT })}
          </span>
          <span className="truncate">{t.shell.sidebar.unlockPro}</span>
        </span>
      </span>
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full" style={{ background: "oklch(0.5899 0.2523 294.88 / 0.2)" }}>
        <svg viewBox="0 0 24 24" className="size-4" style={{ color: "oklch(0.7661 0.1614 294.88)" }} fill="currentColor">
          <path d="M11.546 1.27c.73-.877 2.204-.374 2.204.809V9.25h5.787c1.013 0 1.604 1.141 1.022 1.97l-8.037 11.42c-.702.998-2.272.501-2.272-.72V14.75H4.463c-1.013 0-1.604-1.141-1.022-1.97L11.478 1.36l.068-.09Z" />
        </svg>
      </span>
    </button>
  );
}

/** Everyone who can buy: invite friends, earn credits. Opens the share dialog. */
function ShareCard({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <div className="group/share-wrap relative isolate">
      {/* The coloured glow along its bottom edge, which dips a touch on hover. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-2 bottom-2 z-0 h-3 rounded-b-[26px] bg-[linear-gradient(90deg,rgb(139_123_255/0.8)_0%,rgb(255_90_122/0.8)_50%,rgb(255_122_47/0.8)_100%)] blur-[12px] transition-transform group-hover/share-wrap:translate-y-0.5 group-hover/share-wrap:duration-0 motion-reduce:transition-none"
      />
      <button
        type="button"
        onClick={onClick}
        className={`group/share ${CARD_SHAPE} z-10 overflow-hidden shadow-[inset_0_0.5px_0_0_rgba(255,255,255,0.20),inset_0_-0.5px_0_0_rgba(255,90,122,0.32),inset_0_0_0_0.5px_rgba(119,119,113,0.40)] hover:shadow-[inset_0_0.5px_0_0_rgba(255,255,255,0.28),inset_0_-0.5px_0_0_rgba(255,90,122,0.40),inset_0_0_0_0.5px_rgba(119,119,113,0.48)]`}
        style={{ background: PANEL_BG }}
      >
        <span className="flex min-w-0 flex-col justify-between">
          <span className="truncate text-sm leading-5 font-[480] text-white">{t.referrals.card.title}</span>
          <span className="truncate text-xs leading-4" style={{ color: MUTED }}>
            {pl(t.referrals.card.subtitle, 100)}
          </span>
        </span>
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full shadow-[inset_0_0.5px_1px_0_rgba(255,255,255,0.16),inset_0_-0.5px_1px_0_rgba(150,102,147,0.48),inset_0_0_0_0.5px_oklch(0.55_0.002_107/0.4)] group-hover/share:shadow-[inset_0_0.5px_1px_0_rgba(255,255,255,0.24),inset_0_-0.5px_1px_0_rgba(150,102,147,0.64),inset_0_0_0_0.5px_oklch(0.55_0.002_107/0.4)]"
          style={{ background: CARD_BG }}
        >
          <Gift className="size-4" style={{ color: FG_SECONDARY }} strokeWidth={1.75} />
        </span>
      </button>
    </div>
  );
}

/** A phone's browser, in the phone menu: the store page for the app. */
function AppCard({ href }: { href: string }) {
  const t = useT();
  return (
    <a
      href={href}
      className={`${CARD_SHAPE} shadow-[inset_0_0_0_0.5px_oklch(0.55_0.002_107/0.4)]`}
      style={{ background: PANEL_BG }}
    >
      <span className="flex min-w-0 flex-col justify-between">
        <span className="truncate text-sm leading-5 font-[480] text-white">{t.shell.getApp.title}</span>
        <span className="truncate text-xs leading-4" style={{ color: MUTED }}>
          {t.shell.getApp.body}
        </span>
      </span>
      <MythexMark size={32} className="shrink-0 rounded-[8px]" />
    </a>
  );
}
