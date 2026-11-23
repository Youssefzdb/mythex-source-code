import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { SHELL_BG } from "../../lib/surfaces";
import { AppSidebar } from "./AppSidebar";
import { useBackCloses } from "../../lib/native-back";
import { tapHaptic } from "../../lib/haptics";
import { dismissKeyboard } from "../../lib/native-keyboard";

/** Movement before a touch is read as a swipe one way or the other. */
const SLOP = 8;
/** A flick this fast (px/ms) settles it whichever way it was going. */
const FLICK = 0.4;
/**
 * ChatGPT's drawer: most of the screen, with a strip of the page still showing
 * beside it (about 104pt of a 393pt phone), and never wider than a sidebar
 * needs on a big phone.
 */
const WIDTH = "min(calc(100vw - 6.5rem), 22rem)";
/** The page's corners while it is pushed aside, and how dark it goes. */
const PAGE_RADIUS = 28;
const PAGE_DIM = 0.4;
/** iOS's own curve for a sheet or drawer settling. */
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const DURATION_MS = 380;

/**
 * Which way "open" is: 1 when the drawer comes from the left, -1 when the page
 * reads right to left and it comes from the right. Every x below is in
 * "toward open" terms and multiplied by this on the way in and out.
 */
const side = () => (typeof document !== "undefined" && document.documentElement.dir === "rtl" ? -1 : 1);

/** The page the drawer pushes aside — each layout marks its content with this. */
const pageEl = () => document.querySelector<HTMLElement>("[data-drawer-page]");

/**
 * Something under the finger that a rightward swipe would scroll (a code
 * block, a table, a pager scrolled past its start): that swipe is its, not
 * the drawer's. At its start it has nothing to scroll back to, so the swipe
 * opens the drawer — as it does in ChatGPT.
 */
function scrollsBack(target: EventTarget | null): boolean {
  // Right to left, scrolled-in is a negative scrollLeft.
  const s = side();
  for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
    if (el.scrollLeft * s > 0 && el.scrollWidth > el.clientWidth) {
      const x = getComputedStyle(el).overflowX;
      if (x === "auto" || x === "scroll") return true;
    }
  }
  return false;
}

/**
 * The phone's navigation drawer, as ChatGPT's works: the page slides aside to
 * show it — rounded, dimmed, with a strip left in view — rather than a panel
 * sliding over the page. A rightward swipe opens it from anywhere on the page,
 * not only the edge; a leftward swipe, or a tap on the page, puts it away.
 * Let go past half way, or with a flick, and it finishes the move; otherwise
 * it goes back.
 *
 * The finger's position is written straight to the panel's, the page's and the
 * dim layer's styles while it moves, not through React: a render per
 * touchmove is what makes a drag lag behind the finger. On release the
 * transition goes back on, so the rest of the way animates from where the
 * finger left it.
 *
 * `edgeSwipe` is off where a rightward swipe already does something — the
 * workspace's preview, whose strip it scrolls back to the chat.
 */
export function MobileNavDrawer({
  open,
  onOpenChange,
  edgeSwipe = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edgeSwipe?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  /** How far open it is right now (0–1), including mid-swipe and mid-animation. */
  const shownRef = useRef(0);
  const live = useRef({ open, edgeSwipe, onOpenChange });
  live.current = { open, edgeSwipe, onOpenChange };

  // Anything picked in it that moves the URL — a chat, a page, the credits row
  // taking you to billing — puts it away, including a move within the same
  // screen (/billing to /billing?highlight=plans), where nothing remounts.
  // Android's back puts the drawer away instead of leaving the screen.
  useBackCloses(open, () => onOpenChange(false));

  const location = useLocation();
  useEffect(() => {
    live.current.onOpenChange(false);
  }, [location.pathname, location.search]);

  /** Put everything at `p` of the way open (0 shut, 1 open); `animate` for the settle. */
  const place = (p: number, animate: boolean) => {
    const panel = panelRef.current;
    const dim = dimRef.current;
    const page = pageEl();
    if (!panel || !dim) return;
    shownRef.current = p;
    // The layer takes touches whenever any of the drawer is showing — while a
    // swipe is opening it and while it animates shut too, not only once the
    // open state has caught up. In those gaps a drag on the strip of page
    // beside it went through and scrolled the page.
    if (rootRef.current) rootRef.current.style.pointerEvents = p > 0 ? "auto" : "none";
    const w = panel.offsetWidth * side();
    const t = animate ? `transform ${DURATION_MS}ms ${EASE}` : "none";
    panel.style.transition = t;
    panel.style.transform = `translateX(${(p - 1) * w}px)`;
    dim.style.transition = animate ? `${t}, opacity ${DURATION_MS}ms ${EASE}` : "none";
    dim.style.transform = `translateX(${p * w}px)`;
    dim.style.opacity = String(p * PAGE_DIM);
    if (page) {
      page.style.transition = animate ? `${t}, border-radius ${DURATION_MS}ms ${EASE}` : "none";
      page.style.transform = p > 0 ? `translateX(${p * w}px)` : "";
      page.style.borderRadius = p > 0 ? `${PAGE_RADIUS}px` : "";
      page.style.overflow = p > 0 ? "hidden" : "";
    }
  };

  // Open and shut from the burger, a link, a tap on the page.
  //
  // The first open waits two frames a pixel open: until then iOS has never
  // drawn the panel (the whole Recents list) nor the page with its corners and
  // clip, and doing that took the slide's frames — it sat shut, showed one
  // frame of an unpainted black panel, then was open (recorded at 60fps in the
  // simulator; every later open slid in 6 frames).
  //
  // Not after a swipe: the drag has drawn all of that already, and priming
  // put the drawer back a pixel open as the finger let go — open, shut, open.
  const painted = useRef(false);
  // Marked on the page while open: the "Get the app" bar (GetAppBanner) steps
  // aside, the drawer offering the app itself.
  useEffect(() => {
    document.documentElement.toggleAttribute("data-nav-drawer-open", open);
    return () => document.documentElement.removeAttribute("data-nav-drawer-open");
  }, [open]);
  useEffect(() => {
    if (open) dismissKeyboard();
    if (open && shownRef.current > 0) painted.current = true;
    if (!open || painted.current) {
      place(open ? 1 : 0, true);
      return;
    }
    painted.current = true;
    // A pixel open: the panel, and the page with its corners and clip, which
    // iOS also sets up the first time — priming the panel alone still left
    // the first open to pop in over two frames.
    const panel = panelRef.current;
    if (panel?.offsetWidth) place(1 / panel.offsetWidth, false);
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        if (live.current.open) place(1, true);
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // A light tap as it opens and as it closes, however that happened — the
  // button, a swipe, back — not on first render, when it is just shut.
  const settled = useRef(open);
  useEffect(() => {
    if (settled.current === open) return;
    settled.current = open;
    tapHaptic();
  }, [open]);

  useEffect(() => {
    let drag: {
      x0: number;
      y0: number;
      from: boolean;
      on: boolean;
      w: number;
      last: { x: number; t: number }[];
    } | null = null;

    const onStart = (e: TouchEvent) => {
      drag = null;
      if (e.touches.length !== 1 || window.innerWidth >= 768) return;
      const { open: isOpen, edgeSwipe: allowed } = live.current;
      // A sheet or dialog over the drawer (Account settings, the account
      // menu) has the screen: a swipe anywhere — on it or on its backdrop —
      // is not a swipe to shut the drawer underneath it.
      if (document.querySelector('[role="dialog"]')) return;
      const t = e.touches[0];
      if (!isOpen) {
        if (!allowed) return;
        const target = e.target instanceof Element ? e.target : null;
        // A sheet or dialog over the page, or something that scrolls sideways
        // itself, keeps its swipe.
        if (target?.closest('[role="dialog"], [data-no-drawer-swipe]')) return;
        if (!target?.closest("[data-drawer-page]")) return;
        if (scrollsBack(target)) return;
      }
      drag = { x0: t.clientX, y0: t.clientY, from: isOpen, on: false, w: 0, last: [] };
    };

    /**
     * The page the drawer pushed aside, or the dim layer over it — the only
     * places a drag must not scroll while it shows. Not the drawer itself, and
     * not anything opened over it: Account settings opens as a sheet over the
     * screen with the drawer still open beneath, and blocking every drag
     * outside the drawer made that sheet impossible to scroll.
     */
    const besideDrawer = (target: EventTarget | null): boolean => {
      if (!(target instanceof Node)) return false;
      if (panelRef.current?.contains(target)) return false;
      return Boolean(dimRef.current?.contains(target) || pageEl()?.contains(target));
    };

    const onMove = (e: TouchEvent) => {
      if (!drag) {
        // Open, and not a swipe to close it: the page behind stays put. Only
        // the drawer's own content scrolls (and it is contained, see index.css).
        if (shownRef.current > 0 && besideDrawer(e.target)) e.preventDefault();
        return;
      }
      const t = e.touches[0];
      const dx = (t.clientX - drag.x0) * side();
      const dy = t.clientY - drag.y0;
      if (!drag.on) {
        if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) {
          // A scroll, not a swipe: let it be one — inside the drawer. Begun on
          // the page beside an open drawer it scrolls nothing.
          if (drag.from && besideDrawer(e.target)) e.preventDefault();
          drag = null;
          return;
        }
        const toward = drag.from ? -dx : dx;
        if (toward < SLOP || toward < Math.abs(dy)) return;
        const panel = panelRef.current;
        if (!panel) return;
        drag.on = true;
        drag.w = panel.offsetWidth;
        // Opening it puts the keyboard away, as the burger's tap does: swiped
        // open with the composer focused, the keyboard stayed up over the
        // drawer's Recents.
        if (!drag.from) dismissKeyboard();
      }
      e.preventDefault();
      const shown = drag.from ? drag.w + Math.min(0, dx) : Math.max(0, Math.min(drag.w, dx));
      place(shown / drag.w, false);
      drag.last.push({ x: t.clientX, t: e.timeStamp });
      if (drag.last.length > 5) drag.last.shift();
    };

    const onEnd = (e: TouchEvent) => {
      const d = drag;
      drag = null;
      if (!d?.on) return;
      const x = e.changedTouches[0]?.clientX ?? d.x0;
      const first = d.last[0];
      const v = first && e.timeStamp > first.t ? ((x - first.x) * side()) / (e.timeStamp - first.t) : 0;
      const dx = (x - d.x0) * side();
      const shown = d.from ? d.w + Math.min(0, dx) : Math.max(0, dx);
      const open = Math.abs(v) > FLICK ? v > 0 : shown > d.w / 2;
      // Settle from where the finger left it; `open` may not change (a drag
      // that springs back), so the effect above would not run.
      place(open ? 1 : 0, true);
      if (open !== live.current.open) live.current.onOpenChange(open);
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
      place(0, false);
    };
  }, []);

  return (
    <div ref={rootRef} className="fixed inset-0 z-50 md:hidden" style={{ pointerEvents: "none" }}>
      {/* Over the pushed page only: dims it, and a tap on it closes. */}
      <div
        ref={dimRef}
        className="absolute inset-0 touch-none bg-black"
        style={{ opacity: 0, borderRadius: PAGE_RADIUS, transform: "translateX(0)" }}
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={panelRef}
        data-phone-drawer
        className="native-safe-y absolute inset-y-0 start-0 h-full [&>aside]:!w-full"
        style={{ width: WIDTH, background: SHELL_BG, transform: side() < 0 ? "translateX(100%)" : "translateX(-100%)", ["--drawer-bg" as string]: SHELL_BG }}
      >
        <AppSidebar inDrawer />
      </div>
    </div>
  );
}
