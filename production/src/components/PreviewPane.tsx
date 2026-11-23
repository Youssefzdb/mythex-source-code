import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CreditCard, TriangleAlert } from "lucide-react";
import { canBuyPlans, canSell } from "../lib/native";
import { useAuth } from "../lib/auth";
import { isPaidPlan } from "../lib/plan-tiers";
import { useUpgrade } from "../lib/upgrade";
import { PRO_SALE_PERCENT, proSaleCta } from "./PricingPlans";
import { previewOverlayKind } from "../lib/preview-overlay";
import { MythexMark } from "./mythex-mark";
import { LineSwap } from "./chat/motion";
import { useChatLiveStep } from "../lib/chat-live-step";
import { PreviewTips } from "./PreviewTips";
import { useIsPhone } from "./ui/Sheet";
import { useOpenInSheet } from "./shell/PageSheet";
import { AnnotateOverlay } from "./AnnotateOverlay";
import type { OrchClient } from "../lib/orchestrator";
import { COMPOSER_ATTACH_EVENT, dataUrlToFile, usePreviewTools, type ComposerAttachDetail } from "../lib/preview-tools-client";
import { selectedElementContext, type ElementInfo } from "../lib/annotate-context";
import {
  CARD_BG,
  CONTROL_BG,
  FG_SECONDARY,
  FG_TERTIARY,
  SHELL_BG,
  surfaceRing,
  whiteBtnClass,
} from "../lib/surfaces";
import { fill, useT } from "../i18n/app";

/** Why a preview page did not come up (from its boot signal, or a 20s wait). */
export type PreviewFailure = "down" | "transient" | "app-error" | "empty" | "timeout";
/** The file the page's boot signal last named as failing, and what it answered. */
export type PreviewFailedFile = { status: number; file: string };
export type PreviewHealthEvent =
  /** busy: the agent was still building when it failed (a first build has nothing to show yet). */
  | { type: "failed"; reason: PreviewFailure; busy: boolean }
  | { type: "recovered"; attempts: number }
  | { type: "stuck"; reason: PreviewFailure; attempts: number; failed?: PreviewFailedFile };

/** A reload keeps the old page this long before the cover comes back (no flash on quick reloads). */
const REDRAW_GRACE_MS = 3000;
/** After a reloaded page has replaced the old one on screen, how long it may stay undrawn before the cover returns. */
const COMMIT_GRACE_MS = 1500;
/** A page that is loading but has not drawn (nor said "empty") by now is recovered. */
const SLOW_PAINT_CAP_MS = 45000;

/**
 * Whether anything answers at the preview's address. `no-cors` gives an opaque
 * response for any reply (even an error page) and rejects only when nothing
 * answered — the case where the frame holds the browser's own error page.
 */
export async function previewAnswers(url: string | null | undefined, timeoutMs = 6000): Promise<boolean> {
  if (!url) return false;
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await fetch(url, { mode: "no-cors", cache: "no-store", credentials: "include", signal: ctrl.signal });
    return true;
  } catch (e) {
    // Slow (the sandbox holds a request while the app restarts) is not
    // "nothing there": only a refused/failed connection means the frame holds
    // the browser's own error page.
    return (e as { name?: string })?.name === "AbortError";
  } finally {
    window.clearTimeout(t);
  }
}
/** An app whose own code failed: how long to wait for its error screen to draw. */
const APP_ERROR_GRACE_MS = 8000;
/** After `load`, how long to wait for a boot signal before treating the page as one without it. */
const NO_SIGNAL_GRACE_MS = 1500;
/**
 * Waits before each recovery attempt — about a minute in all, enough for a
 * resumed sandbox, a dev server restart or a Vite re-bundle to finish. When it
 * runs out the pane says the app isn't loading instead of covering forever.
 */
const RECOVERY_DELAYS_MS = [800, 1500, 2500, 4000, 6000, 8000, 10000, 12000, 15000];
/** Starts in a row that left the app unhealthy, after which it is taken as unable to start. */
const FAILED_STARTS_LIMIT = 2;
/** Reloads tried when the page's files answer fine but it still does not draw. */
const TRANSIENT_ATTEMPTS = 2;

/** How much of the app's latest output Fix with AI sends with its message. */
const APP_OUTPUT_LINES = 30;

const MIN_FRAME_WIDTH = 320;
const MIN_MOBILE_HEIGHT = 600;
// At/under this width the frame keeps its phone-like vertical margin (90% of
// the panel's height, floored at MIN_MOBILE_HEIGHT). Past it, that margin
// drops immediately — the frame snaps to the panel's full height — while the
// rounded, bordered device chrome stays put.
const MARGIN_BREAKPOINT = 440;
// Drag the frame out to (within this many px of) the panel's full width and,
// once the mouse is released, mobile mode cancels itself, handing back to
// the plain desktop view.
const EXIT_THRESHOLD_PX = 120;
const DEFAULT_FRAME_WIDTH = 390;

/** App-relative path for the address bar (`/`, `/about?x=1`). */
export function previewPathFromUrl(url: string | null | undefined): string {
  if (!url) return "/";
  try {
    const u = new URL(url);
    return (u.pathname || "/") + u.search + u.hash;
  } catch {
    return "/";
  }
}

/**
 * The shape of a pane with nothing in it yet.
 *
 * The mark sits in the optical centre and the tips run along the bottom, so
 * the two do not compete: one says whose product this is and roughly what is
 * happening, the other is there to be read if the wait is long enough to want
 * something to read.
 */
function PreviewWaiting({ mark, children }: { mark: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center px-6 py-10">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        {mark}
        <div className="mt-3.5">{children}</div>
      </div>
      <PreviewTips />
    </div>
  );
}

/**
 * One shape for every state this pane can be in.
 *
 * There were two layouts drifting apart — an empty state and a loading overlay
 * — each with its own greys and its own idea of type scale, and neither used
 * the surface tokens the rest of the app moved onto. A reader sees these more
 * often than almost any other screen in the product: it is what a new project
 * shows for its first thirty seconds.
 */
function PreviewState({
  mark,
  plain,
  title,
  body,
  action,
  progress,
}: {
  mark: ReactNode;
  /**
   * Skip the tile. A bare glyph — a spinner, a warning — needs something to
   * sit on; the Mythex mark is already a rounded square of its own, and
   * putting it on another one is a box inside a box.
   */
  plain?: boolean;
  title: string;
  body: string;
  action?: ReactNode;
  /** A slow, indefinite sweep — honest about not knowing how long is left. */
  progress?: boolean;
}) {
  return (
    <div className="w-full max-w-[22rem] text-center">
      {plain ? (
        <span className="mx-auto grid size-11 place-items-center">{mark}</span>
      ) : (
        <span
          className="mx-auto grid size-11 place-items-center rounded-[14px]"
          style={{ background: CARD_BG, boxShadow: surfaceRing(CARD_BG, 0.4) }}
        >
          {mark}
        </span>
      )}
      <p className="mt-3.5 text-[14px] leading-5 font-medium text-white">{title}</p>
      <p className="mt-1 text-[13px] leading-5" style={{ color: FG_TERTIARY }}>
        {body}
      </p>
      {progress && (
        <span
          aria-hidden
          className="mx-auto mt-4 block h-[3px] w-28 overflow-hidden rounded-full"
          style={{ background: CONTROL_BG }}
        >
          <span className="preview-progress block h-full w-1/3 rounded-full bg-white/45" />
        </span>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function PreviewPane({
  url,
  nonce,
  running,
  sandboxReady,
  blocked = null,
  /** When false, don't load a *first* iframe — avoids E2B "Closed Port" error pages.
   * After a successful paint (`booted`), keep the last-good iframe if health
   * flickers while idle. During an agent restart (`updating` overlay) the iframe
   * is unmounted so a dying Vite HMR client cannot spam public :3000 502s. */
  healthy = true,
  /** Agent turn in progress — cover an unhealthy iframe after first boot so
   * stack switches don't paint Vite host-block / dying HMR. Idle BrowserRun
   * health blips must not set this. */
  agentBusy = false,
  startPending = false,
  device = "desktop",
  /** When set, navigate the iframe to this path on the current origin (address bar). */
  navigatePath,
  onPathChange,
  onExitMobile,
  onOpenChat,
  onRetry,
  onRecover,
  onHealth,
  loadAppOutput,
  failedStarts = 0,
  annotate = null,
}: {
  url: string | null;
  nonce: number;
  running: boolean;
  sandboxReady: boolean;
  /** Wake failed — stop the spinner (402 credits, or other). */
  blocked?: "credits" | "failed" | null;
  healthy?: boolean;
  agentBusy?: boolean;
  /** A start request is in flight — see previewOverlayKind. */
  startPending?: boolean;
  device?: "desktop" | "mobile";
  navigatePath?: string | null;
  /** Retry a failed wake. Falls back to reloading the page. */
  onRetry?: () => void;
  /**
   * The page loaded but the app did not draw (its scripts failed, or nothing
   * appeared). Make sure the workspace and the app are up — wake or replace the
   * sandbox, restart a crashed app — and resolve when the preview is worth
   * loading again. The pane reloads itself afterwards.
   */
  onRecover?: (reason: PreviewFailure) => Promise<unknown>;
  /**
   * Starts in a row (opening, Refresh, recovery) after which the app still
   * reported unhealthy. The platform starting the app and it not coming up,
   * twice, is the app failing to start, and is said so at once.
   */
  failedStarts?: number;
  /** A preview that failed, came back, or could not be brought back (for counting and alerts). */
  onHealth?: (event: PreviewHealthEvent) => void;
  /** The app's latest output lines, sent with Fix with AI when the app will not come up. */
  loadAppOutput?: (lines: number) => Promise<string[]>;
  /** Fired when the preview posts `mythex:preview-location` (optional in-app bridge). */
  onPathChange?: (path: string) => void;
  /** Called when the user drags the mobile frame out to the panel's full width. */
  onExitMobile?: () => void;
  /** Phone: back to the chat (the working pill's tap). */
  onOpenChat?: () => void;
  /** Select-and-annotate mode is on: pick elements of the live page, or freeze it and draw, for the chat. */
  annotate?: { client: OrchClient | null; path: string; onClose: () => void } | null;
}) {
  // `booted` = the app has loaded successfully at least once for this URL.
  // The full-screen "Getting your app ready…" overlay only shows *before* that
  // first load. Background auto-refreshes (nonce bumps after a run/agent turn,
  // or the manual refresh button) then reload the iframe silently instead of
  // flashing the loading screen 2–3 times.
  const t = useT();
  const p = t.workspace.previewPane;
  const { user } = useAuth();
  const openUpgrade = useUpgrade();
  // Free can't buy credits, so "Add credits" led nowhere: Free gets the Pro offer.
  const freePlan = !isPaidPlan(user?.plan);
  const phone = useIsPhone();
  const openInSheet = useOpenInSheet();
  const [booted, setBooted] = useState(false);
  /** Recovery ran out: say so instead of covering forever. */
  const [stuck, setStuck] = useState(false);
  const stuckRef = useRef(stuck);
  stuckRef.current = stuck;
  /** The file the page last named as failing (from its boot signal), for the stuck report. */
  const failedFileRef = useRef<PreviewFailedFile | null>(null);
  /**
   * Give up and say so — once. Two things can reach this verdict at about the
   * same moment (starts that show the app cannot start, and running out of
   * retries); one stuck preview is one event and one alert.
   */
  const declareStuck = useCallback((reason: PreviewFailure, attempts: number) => {
    if (stuckRef.current) return;
    stuckRef.current = true;
    setStuck(true);
    const failed = failedFileRef.current;
    onHealthRef.current?.({ type: "stuck", reason, attempts, ...(failed ? { failed } : {}) });
  }, []);
  const loadAppOutputRef = useRef(loadAppOutput);
  loadAppOutputRef.current = loadAppOutput;
  /** What the current page's boot signal last said; false = no signal yet. */
  const signalRef = useRef<false | "start" | "ready" | "failed" | "app-error">(false);
  const appErrorTimerRef = useRef(0);
  const attemptsRef = useRef(0);
  const recoveringRef = useRef(false);
  const redrawTimerRef = useRef(0);
  const onRecoverRef = useRef(onRecover);
  onRecoverRef.current = onRecover;
  const agentBusyRef = useRef(agentBusy);
  agentBusyRef.current = agentBusy;
  const onHealthRef = useRef(onHealth);
  onHealthRef.current = onHealth;
  const [slow, setSlow] = useState(false);
  const [frameWidth, setFrameWidth] = useState(DEFAULT_FRAME_WIDTH);
  const [resizing, setResizing] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [toolbarDock, setToolbarDock] = useState<HTMLDivElement | null>(null);
  const dragSide = useRef<"left" | "right" | null>(null);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(DEFAULT_FRAME_WIDTH);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const containerSizeRef = useRef(containerSize);
  const onExitMobileRef = useRef(onExitMobile);
  // Mirrors `frameWidth`, updated synchronously inside the mousemove handler
  // itself (not via an effect) so `onUp` can read the true latest value with
  // no risk of lagging a render behind on fast drags.
  const frameWidthRef = useRef(frameWidth);

  useEffect(() => {
    containerSizeRef.current = containerSize;
  }, [containerSize]);

  useEffect(() => {
    onExitMobileRef.current = onExitMobile;
  }, [onExitMobile]);

  // Re-entering mobile mode always starts fresh at the default width, instead
  // of resuming whatever size it was dragged to last time.
  useEffect(() => {
    if (device === "mobile") {
      frameWidthRef.current = DEFAULT_FRAME_WIDTH;
      setFrameWidth(DEFAULT_FRAME_WIDTH);
    }
  }, [device]);

  // Track the available panel size so the frame can be dragged all the way
  // out to fill it (no artificial max width).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Only a real change: this fires every frame while the split is dragged
    // or the chat column animates, and a fresh object re-rendered each time.
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setContainerSize((prev) =>
        prev && prev.width === width && prev.height === height ? prev : { width, height },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Drag either edge to resize the mobile frame — since it's horizontally
  // centered, growing one edge grows the other by the same amount to keep it
  // under the cursor. A transparent overlay (while `resizing`) keeps the drag
  // smooth even when the cursor crosses the iframe, which would otherwise
  // swallow the mouse events and freeze it. The frame can be dragged freely
  // all the way out to the panel's full width during the drag itself — the
  // snap-back-to-default and exit-mobile-mode decisions only happen once the
  // mouse is released, never mid-drag.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragSide.current) return;
      const maxWidth = containerRef.current?.getBoundingClientRect().width || containerSizeRef.current.width || Infinity;
      const delta = (e.clientX - dragStartX.current) * (dragSide.current === "right" ? 2 : -2);
      const next = Math.min(maxWidth, Math.max(MIN_FRAME_WIDTH, dragStartWidth.current + delta));
      frameWidthRef.current = next;
      setFrameWidth(next);
    };
    const onUp = () => {
      if (!dragSide.current) return;
      dragSide.current = null;
      setResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // Measure the actual rendered frame/container directly from the DOM —
      // not from state, which can lag a render behind a fast drag — so this
      // decision is always based on what the user actually sees on release.
      const frameW = frameRef.current?.getBoundingClientRect().width ?? frameWidthRef.current;
      const maxWidth = containerRef.current?.getBoundingClientRect().width ?? containerSizeRef.current.width;
      if (maxWidth && frameW >= maxWidth - EXIT_THRESHOLD_PX) {
        onExitMobileRef.current?.();
      } else if (frameW < DEFAULT_FRAME_WIDTH) {
        frameWidthRef.current = DEFAULT_FRAME_WIDTH;
        setFrameWidth(DEFAULT_FRAME_WIDTH);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startResize = useCallback(
    (side: "left" | "right") => (e: React.MouseEvent) => {
      dragSide.current = side;
      dragStartX.current = e.clientX;
      dragStartWidth.current = frameWidth;
      setResizing(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [frameWidth],
  );

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewTools = usePreviewTools(iframeRef, url);

  // An element picked in the page (see AnnotateOverlay) goes to the chat as a card with its
  // picture, and the pick ends the mode, as in Claude: one element, then back to the chat.
  const annotateRef = useRef(annotate);
  annotateRef.current = annotate;
  useEffect(() => {
    const offPicked = previewTools.on("mythex:tools:picked", (d) => {
      const info = d.info as ElementInfo | undefined;
      if (!info) return;
      const label = String(d.label || info.tag).slice(0, 80);
      annotateRef.current?.onClose();
      void (async () => {
        // Its own name per pick: the sent message finds the chip's label by it.
        const name = `element-${(info.react?.name || info.tag).replace(/[^\w-]/g, "")}-${Date.now().toString(36)}.png`;
        const picture =
          typeof d.dataUrl === "string" ? await dataUrlToFile(d.dataUrl, name) : await labelPicture(label);
        const file = picture.name === name ? picture : new File([picture], name, { type: picture.type || "image/png" });
        window.dispatchEvent(
          new CustomEvent<ComposerAttachDetail>(COMPOSER_ATTACH_EVENT, {
            detail: { file, context: selectedElementContext(info, { label, picture: name }), elementLabel: label },
          }),
        );
      })();
    });
    return offPicked;
  }, [previewTools]);
  const lastNonceRef = useRef(nonce);

  // Reset the boot state when the app URL changes (new project / fresh sandbox).
  useEffect(() => {
    setBooted(false);
    setSlow(false);
    setStuck(false);
    attemptsRef.current = 0;
  }, [url]);

  // Manual refresh / soft file-change reload. Never remount via key={nonce}.
  // Cross-origin E2B hosts block contentWindow.location.reload() (silent catch),
  // which made the toolbar Refresh look broken — users had to reload the whole
  // Mythex page. Bounce src via about:blank so the same URL loads again.
  const reloadFrame = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !url) return () => {};
    let href = url;
    try {
      href = navigatePath ? new URL(navigatePath, url).href : new URL(url).href;
    } catch {
      href = url;
    }
    // A reload keeps the page that is on screen until the new one has drawn;
    // only if it has not drawn within a few seconds does the cover come back.
    // A quick end-of-turn reload therefore never flashes the loading screen.
    signalRef.current = false;
    if (redrawTimerRef.current) window.clearTimeout(redrawTimerRef.current);
    redrawTimerRef.current = window.setTimeout(() => {
      redrawTimerRef.current = 0;
      if (signalRef.current !== "ready") setBooted(false);
    }, REDRAW_GRACE_MS);
    // Navigate the page in the frame rather than bouncing the frame through
    // about:blank: a cross-origin frame cannot be told to reload(), but it can
    // be sent to a URL, and while that request is on its way (or held by the
    // sandbox proxy during a restart) the browser keeps painting the old page.
    // The about:blank bounce committed a white page at once instead — the
    // white flash on every Refresh, seconds long while the app restarted.
    try {
      const win = iframe.contentWindow;
      if (win && iframe.getAttribute("src") !== "about:blank") {
        win.location.replace(href);
        return () => {};
      }
    } catch {
      // No window to navigate yet: fall back to resetting src.
    }
    iframe.src = "about:blank";
    const timer = window.setTimeout(() => {
      iframe.src = href;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [url, navigatePath]);

  useEffect(() => {
    if (nonce === lastNonceRef.current) return;
    lastNonceRef.current = nonce;
    // A deliberate reload (Refresh, a turn's changes) starts recovery afresh.
    attemptsRef.current = 0;
    setStuck(false);
    return reloadFrame();
  }, [nonce, reloadFrame]);

  // Address-bar navigation: load origin + path without remounting the React tree.
  const lastNavPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (!url || !navigatePath || !iframeRef.current) return;
    if (lastNavPathRef.current === navigatePath) return;
    lastNavPathRef.current = navigatePath;
    try {
      const next = new URL(navigatePath, url).href;
      iframeRef.current.src = next;
    } catch {
      // ignore bad paths
    }
  }, [url, navigatePath]);

  const onPathChangeRef = useRef(onPathChange);
  useEffect(() => {
    onPathChangeRef.current = onPathChange;
  }, [onPathChange]);

  const reportPath = useCallback((path: string) => {
    if (!path.startsWith("/")) return;
    lastNavPathRef.current = path;
    onPathChangeRef.current?.(path);
  }, []);

  // Preview proxy (and in-app bridge) post { type: "mythex:preview-location", path }.
  useEffect(() => {
    let previewOrigin = "";
    try {
      if (url) previewOrigin = new URL(url).origin;
    } catch {
      previewOrigin = "";
    }
    const onMessage = (e: MessageEvent) => {
      const data = e.data;
      if (!data || typeof data !== "object") return;
      if ((data as { type?: string }).type !== "mythex:preview-location") return;
      const fromIframe =
        !e.source ||
        !iframeRef.current?.contentWindow ||
        e.source === iframeRef.current.contentWindow;
      const fromPreviewOrigin = Boolean(previewOrigin) && e.origin === previewOrigin;
      // Accept the iframe window OR the preview origin (covers transient
      // contentWindow identity mismatches during src reloads).
      if (!fromIframe && !fromPreviewOrigin) return;
      const path = (data as { path?: unknown }).path;
      if (typeof path !== "string" || !path.startsWith("/")) return;
      reportPath(path);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [reportPath, url]);

  // The page's boot signal (workers/preview-proxy/src/preview-boot.ts, also
  // injected by the sandbox proxy) says whether the app actually drew. Until
  // it says "ready" the cover stays; if the page failed, the pane brings the
  // workspace and app back up and reloads, with backoff, before ever showing
  // a blank pane — and says so plainly if it cannot.
  const recover = useCallback(
    async (reason: PreviewFailure) => {
      if (recoveringRef.current) return;
      recoveringRef.current = true;
      let pendingRetry = false;
      try {
        attemptsRef.current += 1;
        const attempt = attemptsRef.current;
        if (attempt === 1) onHealthRef.current?.({ type: "failed", reason, busy: agentBusyRef.current });
        // Files that load fine but a page that never works is the app itself,
        // not a server coming back: a couple of reloads, then say so (with
        // "Fix with AI") rather than reloading for a minute.
        const limit =
          reason === "transient" || reason === "app-error" ? TRANSIENT_ATTEMPTS : RECOVERY_DELAYS_MS.length;
        // Mid-turn the agent is changing the app, so a page that does not come
        // up yet is work in progress, not a stuck preview: stop retrying and
        // keep the cover. When the turn ends, recovery starts afresh (below).
        if (attempt > limit && agentBusyRef.current) {
          attemptsRef.current = limit;
          return;
        }
        const giveUp = () => declareStuck(reason, attemptsRef.current);
        if (attempt > limit) {
          attemptsRef.current = attempt - 1;
          giveUp();
          return;
        }
        await new Promise((r) => window.setTimeout(r, RECOVERY_DELAYS_MS[attempt - 1]));
        // The page may have drawn meanwhile — a framework's own error screen
        // often lands a moment after the failure. Then there is nothing to fix.
        const drewMeanwhile = () => signalRef.current === "ready";
        if (drewMeanwhile()) return;
        await onRecoverRef.current?.(reason).catch(() => {});
        if (drewMeanwhile() || stuckRef.current) return;
        if (iframeRef.current) {
          reloadFrame();
          return;
        }
        // No page in the pane (the app was never healthy enough to load one),
        // so nothing will report back: carry on with the next attempt here.
        pendingRetry = true;
      } finally {
        recoveringRef.current = false;
      }
      if (pendingRetry) void recoverRef.current(reason);
    },
    [reloadFrame],
  );
  const recoverRef = useRef(recover);
  recoverRef.current = recover;

  // While the agent is idle the page holds Vite's "is the server back?" pings
  // (preview-boot.ts): after the sandbox sleeps, that ping woke it and Vite
  // reloaded the page — a white flash every ~5 min on an open preview, and a
  // sandbox kept awake. Mid-turn the agent restarts the server, and Vite's
  // own reconnect-and-reload is wanted, so pings go through.
  const postPingHold = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.postMessage({ type: "mythex:vite-ping-hold", hold: !agentBusyRef.current }, "*");
    } catch {
      // frame gone
    }
  }, []);
  useEffect(() => {
    postPingHold();
  }, [agentBusy, postPingHold]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: unknown; phase?: unknown; kind?: unknown; status?: unknown; file?: unknown } | null;
      if (!data || typeof data !== "object" || data.type !== "mythex:preview-boot") return;
      const frame = iframeRef.current?.contentWindow;
      if (frame && e.source && e.source !== frame) return;
      if (data.phase === "failed") {
        // Kept for the report only: which file failed tells us at a glance
        // whether it is the app's code or the platform.
        const status = typeof data.status === "number" ? data.status : 0;
        const file = typeof data.file === "string" ? data.file.slice(0, 200) : "";
        failedFileRef.current = file ? { status, file } : null;
      }
      if (data.phase === "start") {
        // Tell the new page whether to hold Vite's reconnect pings (agent idle).
        postPingHold();
        // A page that starts after one had drawn is a new page in the frame —
        // the app reloading itself (a dev server's full reload, a page's own
        // navigation), not one we asked for. Same rule as a reload of ours:
        // nothing changes if it draws quickly, the cover comes back if not.
        const newPage = signalRef.current === "ready" || signalRef.current === "app-error";
        const reloading = Boolean(redrawTimerRef.current);
        signalRef.current = "start";
        // The new page has replaced the old one on screen ("start" runs in
        // it), so from here the pane shows whatever it has drawn — nothing
        // yet. The 3 s grace counted from the reload's start, and a page that
        // committed at once stood blank (white) for the rest of it: the flash
        // after every turn's reload and every idle-wake reload (2026-11-18).
        // Now the cover is back a moment after the new page shows, unless it
        // draws first.
        if (newPage || reloading) {
          if (redrawTimerRef.current) window.clearTimeout(redrawTimerRef.current);
          redrawTimerRef.current = window.setTimeout(() => {
            redrawTimerRef.current = 0;
            if (signalRef.current !== "ready") setBooted(false);
          }, COMMIT_GRACE_MS);
        }
        return;
      }
      if (data.phase === "ready") {
        signalRef.current = "ready";
        if (redrawTimerRef.current) {
          window.clearTimeout(redrawTimerRef.current);
          redrawTimerRef.current = 0;
        }
        setBooted(true);
        setStuck(false);
        if (attemptsRef.current > 0) {
          onHealthRef.current?.({ type: "recovered", attempts: attemptsRef.current });
          attemptsRef.current = 0;
        }
        return;
      }
      if (data.phase === "failed" && data.kind === "app-error") {
        // The app's own code broke: its error screen is the thing to show,
        // not something to restart. The page keeps watching and says "ready"
        // once that screen draws (Vite's overlay lands a moment later); until
        // then the cover stays.
        signalRef.current = "app-error";
        if (appErrorTimerRef.current) window.clearTimeout(appErrorTimerRef.current);
        appErrorTimerRef.current = window.setTimeout(() => {
          appErrorTimerRef.current = 0;
          // Nothing drew — no error screen either: showing it would be the
          // blank page all this is here to prevent. A couple of reloads (the
          // server may just have changed under it), then "isn't loading".
          if (signalRef.current === "app-error") void recover("app-error");
        }, APP_ERROR_GRACE_MS);
        return;
      }
      if (data.phase === "empty") {
        // Loaded, nothing failed, nothing visible yet. That can be an app
        // whose first screen draws in a way the page cannot see (only a
        // background colour or image, text drawn by CSS) — so it is shown as
        // it is, never retried or called "not loading", and only counted.
        if (signalRef.current === "ready") return;
        signalRef.current = "ready";
        setBooted(true);
        onHealthRef.current?.({ type: "failed", reason: "empty", busy: agentBusyRef.current });
        return;
      }
      if (data.phase === "failed") {
        signalRef.current = "failed";
        setBooted(false);
        void recover(data.kind === "transient" ? "transient" : "down");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [recover, postPingHold]);

  /** Counts the page's loads: each one wipes what the annotate tools put in it. */
  const [pageLoads, setPageLoads] = useState(0);
  const onIframeLoad = useCallback(() => {
    setPageLoads((n) => n + 1);
    // A page with the boot signal says itself when it has drawn. One without
    // it (a service that answers JSON, a sandbox from before the signal) has
    // nothing more to say than "loaded", so that is taken as drawn. The blank
    // page a reload passes through first (about:blank) is not the preview at
    // all and says nothing either way.
    const frame = iframeRef.current;
    if (!frame || frame.getAttribute("src") === "about:blank") return;
    window.setTimeout(() => {
      if (signalRef.current || iframeRef.current?.getAttribute("src") === "about:blank") return;
      // The browser's own "can't reach this page" also fires `load`, with no
      // signal either: uncovering it left Chrome's broken-page icon in the
      // pane until someone pressed Refresh (prod, 2026-11-17). Ask the server
      // first — any answer at all means a real page loaded; none means the
      // frame holds the browser's error page, so recover instead.
      void previewAnswers(url).then((answers) => {
        if (signalRef.current || iframeRef.current?.getAttribute("src") === "about:blank") return;
        if (answers) setBooted(true);
        else void recoverRef.current("down");
      });
    }, NO_SIGNAL_GRACE_MS);
    // Same-origin fallback (rare); cross-origin relies on the injected bridge.
    try {
      const loc = iframeRef.current?.contentWindow?.location;
      if (!loc || loc.origin === "null") return;
      const path = (loc.pathname || "/") + (loc.search || "") + (loc.hash || "");
      if (path.startsWith("/")) reportPath(path);
    } catch {
      // cross-origin — bridge postMessage handles it
    }
  }, [reportPath, url]);

  // Fallbacks in case the iframe's onLoad never fires while booting, so the
  // overlay can't get stuck forever.
  useEffect(() => {
    if (!url || !running || booted || stuck) return;
    const slowT = setTimeout(() => setSlow(true), 8000);
    // Nothing drew in 20s: recover, never uncover. A page that loaded without
    // the boot signal was already taken as drawn (onIframeLoad); anything
    // still here either reported and did not draw, or has not even loaded —
    // a request the sandbox is holding, a host that does not answer — and
    // uncovering that showed a blank pane. Recovery is bounded: it ends on
    // "Your app isn't loading", so the cover cannot hold forever either.
    const giveUp = setTimeout(() => {
      // An app error is shown, not restarted (its own timer uncovers it). A
      // page that is loading ("start", nothing failed) is a slow first paint:
      // reloading it only starts it over. It says "ready" or "empty" itself;
      // the cap below catches one that never does.
      if (signalRef.current === "app-error" || signalRef.current === "start") return;
      void recover("timeout");
    }, 20000);
    const cap = setTimeout(() => {
      if (signalRef.current === "start") void recover("timeout");
    }, SLOW_PAINT_CAP_MS);
    return () => {
      clearTimeout(slowT);
      clearTimeout(giveUp);
      clearTimeout(cap);
    };
  }, [url, running, booted, stuck, recover]);

  const hasApp = Boolean(url) && running && (healthy || booted);
  const cover = previewOverlayKind({
    hasUrl: Boolean(url),
    running,
    healthy,
    sandboxReady,
    booted,
    agentBusy,
    startPending,
    blocked,
  });
  const waking = cover === "waking";
  const starting = cover === "starting";
  const updating = cover === "updating";
  const showOverlay = cover !== null;

  // The agent's restart is over and the iframe is mounted again: that load
  // has to draw too. Same grace as a reload — the cover only returns if the
  // new page has not drawn within a few seconds, and a failure recovers.
  const wasUpdatingRef = useRef(false);
  useEffect(() => {
    if (updating) {
      wasUpdatingRef.current = true;
      return;
    }
    if (!wasUpdatingRef.current) return;
    wasUpdatingRef.current = false;
    signalRef.current = false;
    if (redrawTimerRef.current) window.clearTimeout(redrawTimerRef.current);
    redrawTimerRef.current = window.setTimeout(() => {
      redrawTimerRef.current = 0;
      if (signalRef.current !== "ready") setBooted(false);
    }, REDRAW_GRACE_MS);
  }, [updating]);

  // The platform started the app and it did not come up — twice in a row, and
  // not while the agent is mid-change: say so now, with the app's output,
  // rather than restarting it again for minutes. Counted when it rises, so
  // "Try again" gets its own start before the verdict comes back.
  const lastFailedStartsRef = useRef(failedStarts);
  useEffect(() => {
    const rose = failedStarts > lastFailedStartsRef.current;
    lastFailedStartsRef.current = failedStarts;
    if (!rose || failedStarts < FAILED_STARTS_LIMIT || agentBusy || booted || stuck) return;
    declareStuck("down", failedStarts);
  }, [failedStarts, agentBusy, booted, stuck]);

  // The turn is over and the page still has not drawn: try again from the
  // start, now that the agent has stopped changing things.
  const wasBusyRef = useRef(agentBusy);
  useEffect(() => {
    const was = wasBusyRef.current;
    wasBusyRef.current = agentBusy;
    if (!was || agentBusy || !url || booted || stuck) return;
    if (signalRef.current === "ready" || signalRef.current === "app-error") return;
    attemptsRef.current = 0;
    void recover("timeout");
  }, [agentBusy, url, booted, stuck, recover]);

  const emptyState = (
    <div
      className={blocked ? "grid h-full place-items-center px-6" : ""}
      style={{ background: SHELL_BG, height: blocked ? undefined : "100%" }}
    >
      {blocked === "credits" ? (
        <PreviewState
          mark={<CreditCard className="size-5" style={{ color: FG_SECONDARY }} />}
          title={p.needsCredits}
          body={
            canSell() && freePlan
              ? fill(t.shell.upgrade.outOfCreditsSale, { percent: PRO_SALE_PERCENT })
              : canBuyPlans()
              ? p.needsCreditsBody
              : // No "add more" in the app: that is a call to action for a
                // purchase made elsewhere. The daily grant is a fact about the
                // account and is the honest thing to tell someone here.
                p.needsCreditsBodyNoSale
          }
          action={
            // A plain link, not a router Link: this pane is rendered inside the
            // workspace and a full navigation is the honest way out of a
            // sandbox that could not start.
            canSell() && freePlan ? (
              <button type="button" onClick={() => openUpgrade("credits")} className={whiteBtnClass("lg")}>
                {proSaleCta(t)}
              </button>
            ) : canBuyPlans() ? (
              <a
                href="/billing"
                // On a phone, the billing page in its sheet over the
                // workspace, as everywhere else in the app.
                onClick={(e) => {
                  if (!phone) return;
                  e.preventDefault();
                  openInSheet("/billing");
                }}
                className={whiteBtnClass("lg")}
              >
                {p.addCredits}
              </a>
            ) : null
          }
        />
      ) : blocked === "failed" ? (
        <PreviewState
          mark={<TriangleAlert className="size-5" style={{ color: "oklch(0.78 0.12 25)" }} />}
          title={p.startFailed}
          body={p.startFailedBody}
          action={
            <button
              type="button"
              onClick={() => (onRetry ? onRetry() : window.location.reload())}
              className={whiteBtnClass("lg")}
            >
              {t.common.tryAgain}
            </button>
          }
        />
      ) : (
        <PreviewWaiting mark={<MythexMark size={38} />}>
          <p className="text-[14px] leading-5 font-medium text-white">
            {p.emptyTitle}
          </p>
          <p className="mt-1 text-[13px] leading-5" style={{ color: FG_TERTIARY }}>
            {p.emptyBody}
          </p>
        </PreviewWaiting>
      )}
    </div>
  );

  const stuckState = (
    <div className="absolute inset-0 grid place-items-center px-6" style={{ background: SHELL_BG }}>
      <PreviewState
        mark={<TriangleAlert className="size-5" style={{ color: "oklch(0.78 0.12 25)" }} />}
        title={p.notLoading}
        body={p.notLoadingBody}
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                attemptsRef.current = 0;
                setStuck(false);
                void recover("timeout");
              }}
              className={whiteBtnClass("lg")}
            >
              {t.common.tryAgain}
            </button>
            <button
              type="button"
              onClick={async () => {
                // In the person's language: it lands in their chat as their
                // message, with the app's latest output under it so the agent
                // starts from the actual error. The pane itself shows no logs.
                const lines = await loadAppOutputRef.current?.(APP_OUTPUT_LINES).catch(() => [] as string[]);
                const output = (lines ?? []).join("\n").trim();
                const text = output ? `${p.fixNotLoadingPrompt}\n\n\`\`\`\n${output}\n\`\`\`` : p.fixNotLoadingPrompt;
                window.dispatchEvent(new CustomEvent("mythex:agent-prompt", { detail: { text, newChat: false } }));
                onOpenChat?.();
              }}
              className="rounded-full px-4 py-2 text-[14px] font-medium text-white/80 ring-1 ring-white/15 transition hover:bg-white/8"
            >
              {t.publish.publishDialog.fixWithAi}
            </button>
          </div>
        }
      />
    </div>
  );

  const overlay = stuck ? stuckState : showOverlay && (
    <div className="absolute inset-0" style={{ background: SHELL_BG }}>
      <PreviewWaiting mark={<MythexMark size={38} />}>
        <p className="text-[13px] leading-5" style={{ color: FG_TERTIARY }}>
          {waking
            ? p.startingWorkspace
            : updating
              ? p.updatingApp
              : starting
                ? p.startingApp
                : slow
                  ? p.almostThere
                  : p.gettingReady}
        </p>
        <span
          aria-hidden
          className="mx-auto mt-3 block h-[3px] w-24 overflow-hidden rounded-full"
          style={{ background: CONTROL_BG }}
        >
          <span className="preview-progress block h-full w-1/3 rounded-full bg-white/45" />
        </span>
      </PreviewWaiting>
    </div>
  );

  const isMobile = device === "mobile";

  // The vertical margin is a hard step at MARGIN_BREAKPOINT — present below
  // it, gone (frame fills the panel's height) immediately above it. The
  // rounded, bordered chrome stays constant throughout mobile mode; it's only
  // ever removed by actually leaving mobile mode (via the toggle, or by
  // dragging out to full width, which triggers onExitMobile above).
  const panelHeight = containerSize.height || 800;
  const mobileHeight = Math.max(panelHeight * 0.9, MIN_MOBILE_HEIGHT);
  const hasMargin = frameWidth <= MARGIN_BREAKPOINT;
  const frameHeight = isMobile ? (hasMargin ? mobileHeight : panelHeight) : undefined;

  // Single, stable DOM tree for both device modes — only sizes/styles change —
  // so toggling device never unmounts or reloads the iframe.
  const annotating = !!annotate && !!url && hasApp && !updating && booted;

  return (
    <div className="flex h-full flex-col" style={{ background: SHELL_BG }}>
    <div
      ref={containerRef}
      className="flex min-h-0 flex-1 items-center justify-center overflow-hidden"
      style={{ background: SHELL_BG }}
    >
      <div
        ref={frameRef}
        className={`relative shrink-0 max-w-full ${resizing ? "" : "transition-[width,height] duration-200 ease-out"} ${
          isMobile ? "max-h-full" : "h-full w-full"
        }`}
        style={isMobile ? { width: frameWidth, height: frameHeight } : undefined}
      >
        <div
          className={`h-full w-full overflow-hidden ${isMobile ? "rounded-2xl" : ""}`}
          style={{
            background: SHELL_BG,
            // The phone frame is a raised surface like any other, so it takes
            // the same ring rather than a flat white border.
            boxShadow: isMobile ? surfaceRing(SHELL_BG, 0.45) : undefined,
          }}
        >
          {url && hasApp ? (
            <>
              {/* Unmount while SetRunConfig is restarting — a kept last-good
                  Vite iframe keeps HMR reconnecting to public :3000 (502). */}
              {!updating && (
                <iframe
                  ref={iframeRef}
                  src={url}
                  className="block h-full w-full border-0 outline-none"
                  style={{ background: SHELL_BG }}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  title={p.appPreview}
                  onLoad={onIframeLoad}
                />
              )}
              {annotate && annotating && (
                <AnnotateOverlay
                  tools={previewTools}
                  previewPath={annotate.path}
                  client={annotate.client}
                  onClose={annotate.onClose}
                  toolbarDock={toolbarDock}
                  pageLoads={pageLoads}
                />
              )}
              {/* Overlay: first boot, or agent turn while preview is down. */}
              {overlay}
              {/* On a phone the preview is its own screen, so the chat saying
                  the agent is at work is out of sight: what you see may still
                  change under you. A pill says what it is doing, in the chat's
                  own words. */}
              {phone && (
                <AgentWorkingPill show={agentBusy && !showOverlay} fallback={t.tools.turn.working} onOpen={onOpenChat} />
              )}
            </>
          ) : waking || starting ? (
            <div className="relative h-full w-full" style={{ background: SHELL_BG }}>
              {overlay}
            </div>
          ) : (
            emptyState
          )}
        </div>

        {isMobile && (
          <>
            <div
              onMouseDown={startResize("left")}
              className="absolute inset-y-0 -left-2 flex w-4 cursor-col-resize items-center justify-center"
            >
              <div className="h-10 w-1 rounded-full bg-white/15 transition-colors hover:bg-white/30" />
            </div>
            <div
              onMouseDown={startResize("right")}
              className="absolute inset-y-0 -right-2 flex w-4 cursor-col-resize items-center justify-center"
            >
              <div className="h-10 w-1 rounded-full bg-white/15 transition-colors hover:bg-white/30" />
            </div>
          </>
        )}
      </div>

      {/* While dragging a resize handle, this overlay sits above the preview
          iframe so it can't swallow the mouse events (which would freeze the drag). */}
      {resizing && <div className="fixed inset-0 z-50 cursor-col-resize" />}
    </div>
    {/* The annotate toolbar's own strip: the page above shrinks to make room, so no part of it is covered. */}
    {annotating && (
      <div ref={setToolbarDock} className="flex shrink-0 justify-center px-2 pt-1 pb-2" data-testid="annotate-dock" />
    )}
    </div>
  );
}

/** An element whose picture could not be taken still gets one: its label, drawn. */
async function labelPicture(label: string): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f4f4f5";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#18181b";
  ctx.font = "500 18px Inter, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(label.slice(0, 44), 16, 32);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  return new File([blob ?? new Blob()], "element.png", { type: "image/png" });
}

/**
 * The phone preview's "still working" pill.
 *
 * It shows the chat's live line (useChatLiveStep), sliding to each new step
 * the way the chat's own line does (LineSwap), and the generic sentence only
 * when the chat has no line to read. It fades and rises in when a turn starts
 * and fades out when it ends, staying mounted for the exit. It sits just above
 * the preview's bottom bar. Only the pill itself takes a tap, and it goes to
 * the chat, where the work is; the app around it stays usable.
 */
function AgentWorkingPill({ show, fallback, onOpen }: { show: boolean; fallback: string; onOpen?: () => void }) {
  const [mounted, setMounted] = useState(show);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (show) {
      setMounted(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const id = window.setTimeout(() => setMounted(false), 320);
    return () => window.clearTimeout(id);
  }, [show]);
  const step = useChatLiveStep(mounted);
  // The last words stay up until new ones come: between two steps the chat
  // has a beat with no live line, and the pill fell back to the generic
  // sentence for it — and kept them while fading out, so it doesn't change as
  // it goes. A new turn starts from nothing.
  const lastStep = useRef<string | null>(null);
  if (!mounted) lastStep.current = null;
  if (show && step) lastStep.current = step;
  const text = lastStep.current ?? fallback;
  const measureRef = useRef<HTMLSpanElement>(null);
  const [textWidth, setTextWidth] = useState<number | null>(null);
  // While the box grows to a longer line, the line is clipped, not cut with
  // "…": an ellipsis that shows for 300ms and goes away read as text being
  // shortened. Past the pill's widest it truncates as usual.
  const [growing, setGrowing] = useState(false);
  const shownWidth = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    let id = 0;
    const measure = () => {
      const next = Math.ceil(el.getBoundingClientRect().width);
      if (next === shownWidth.current) return;
      if (shownWidth.current != null && next > shownWidth.current) {
        setGrowing(true);
        window.clearTimeout(id);
        id = window.setTimeout(() => setGrowing(false), 320);
      }
      shownWidth.current = next;
      setTextWidth(next);
    };
    measure();
    // Measured again whenever the line's real size changes — the web font
    // arriving after the first measure made the words wider than the box, and
    // they stayed cut ("Planning next mo…", seen on iOS and Android).
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      window.clearTimeout(id);
    };
  }, [text, mounted]);
  if (!mounted) return null;
  return (
    <div
      // 12px above the preview's own edge: the bar under the preview already
      // keeps clear of the home indicator, so its inset is not added again
      // (with it the pill floated ~45pt up, away from the bar).
      className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center"
      data-testid="preview-agent-working"
      role="status"
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        className="pointer-events-auto inline-flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-full px-3 py-1.5 text-start text-[12px] font-medium text-white"
        style={{
          background: CARD_BG,
          boxShadow: `${surfaceRing(CARD_BG, 0.45)}, 0 6px 18px rgba(0,0,0,0.35)`,
          opacity: visible ? 1 : 0,
          transform: visible ? "none" : "translateY(8px) scale(0.94)",
          transition: visible
            ? "opacity 260ms ease, transform 380ms cubic-bezier(0.2, 0.9, 0.3, 1.2)"
            : "opacity 220ms ease, transform 260ms ease",
        }}
      >
        <span aria-hidden className="relative flex size-2 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/60" />
          <span className="relative inline-flex size-2 rounded-full bg-white" />
        </span>
        {/* The chat's shimmer (brighter, .pill-shimmer), so it reads as the
            same live line. The box eases to each new line's width instead of
            jumping: an invisible copy of the line is measured, and the box
            takes its width over the same 300ms as the line's own slide. */}
        <span
          className="relative block min-w-0 overflow-hidden"
          style={{ width: textWidth ?? undefined, transition: "width 300ms cubic-bezier(0.2, 0.8, 0.2, 1)" }}
        >
          <span ref={measureRef} aria-hidden className="invisible absolute whitespace-nowrap">
            {text}
          </span>
          <LineSwap swapKey={text} className="min-w-0">
            <span className={`pill-shimmer block overflow-hidden whitespace-nowrap ${growing ? "text-clip" : "text-ellipsis"}`}>{text}</span>
          </LineSwap>
        </span>
      </button>
    </div>
  );
}
