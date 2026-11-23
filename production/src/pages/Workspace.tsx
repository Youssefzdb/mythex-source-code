import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNarrow } from "../lib/use-narrow";
import { isPaidPlan } from "../lib/plan-tiers";
import { isDeployBlip, retryThroughDeploy } from "../lib/deploy-window";
import { btnClass, CARD_BG, FG_TERTIARY, floatingRing, SHELL_BG } from "../lib/surfaces";
import { MobileNavDrawer } from "../components/shell/MobileNavDrawer";
import { ProjectMenuSheet } from "../components/ProjectMenuSheet";
import { UpgradeButton } from "../components/UpgradeButton";
import { CursorIcon } from "../components/ui/CursorIcon";
import { DrawerIcon } from "../components/ui/DrawerIcon";
import { useNativeBleedTop } from "../lib/native-bleed-top";
import {
  previewStartState,
  readWorkspaceLayout,
  writeWorkspaceLayout,
  type WorkspaceLayout, lastKnownHasApp, rememberHasApp } from "../lib/workspace-layout";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowUpRight, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Code2, Copy, Database, Download, Eye, ExternalLink, Gauge, GitBranch, Globe, HardDrive, KeyRound, LayoutDashboard, MoreHorizontal, MessageSquare, MessageSquarePlus, Minimize2, Monitor, PanelLeftClose, PanelLeftOpen, PanelRight, RefreshCw, Rocket, Settings, Settings2, Share2, Smartphone, UserPlus } from "lucide-react";
import { COMPOSER_ATTACH_EVENT } from "../lib/preview-tools-client";
import { api, ApiError, type ProjectDetail, type Session, type ThreadsPage } from "../lib/api";
import { agentStatus, orch, startShowsCannotStart, waitForAgentDaemon, type OrchClient, type RunningService } from "../lib/orchestrator";
import { trackAppEvent } from "../lib/analytics";
import { isNative, nativePlatform } from "../lib/native";
import type { PreviewHealthEvent } from "../components/PreviewPane";
import { useAuth } from "../lib/auth";
import { MythexMark } from "../components/mythex-mark";
import {
  ChatPanel,
  SubagentTabPane,
  PlanTabPane,
  type SubagentViewSnapshot,
} from "../components/ChatPanel";
import { ChatEmptyState, ChatTabs } from "../components/ChatTabs";
import { CodeView } from "../components/CodeView";
import { PreviewPane, previewPathFromUrl } from "../components/PreviewPane";
import { PublishPopover } from "../components/PublishDialog";
import { SharePreviewPopover } from "../components/SharePreviewPopover";
import { SettingsDialog, type SettingsTab } from "../components/SettingsDialog";
import { Popover } from "../components/ui/Popover";
import { AppSidebar } from "../components/shell/AppSidebar";
import { SlidingPillSwitch } from "../components/PricingPlans";
import { ConfirmDialog, useToast } from "../components/ui";
import { WorkspaceShellSkeleton } from "../components/loading";
import {
  draftTabId,
  hydrateOpenTabs,
  MAX_CHAT_TABS,
  persistThreadTabs,
  planTabId,
  subagentTabId,
  threadTabId,
  type OpenTab,
} from "../lib/chatTabs";
import { ensurePublishPoller, getPublishJob, prefetchPublishSnapshot } from "../lib/publishJob";
import { usePublishLive } from "../lib/usePublishLive";
import { LiveDot } from "../components/ui/LiveDot";
import { appT, fill, useT } from "../i18n/app";
import { useBackCloses } from "../lib/native-back";
import { dismissKeyboard } from "../lib/native-keyboard";
import { tapHaptic } from "../lib/haptics";

/** Matches the API's provisional name for a project created from a prompt (projects.ts). */
const PROVISIONAL_PROJECT_NAME = "New project";

type ChatTab = Extract<OpenTab, { kind: "thread" | "draft" }>;

const isChatTab = (t: OpenTab): t is ChatTab => t.kind === "thread" || t.kind === "draft";

/** Where a chat tab's opening seed is kept — a draft has no thread id yet. */
const seedKeyOf = (t: ChatTab) => (t.kind === "draft" ? t.id : t.threadId);

function isApiDeployBlip(err: unknown): boolean {
  return err instanceof ApiError && isDeployBlip(err.status, err.body);
}

/**
 * E2B has no room. Named by its code, not by the status alone: a 503 also
 * means "your sandbox is still waking" (`sandbox_waking`), which is a retry,
 * and told as capacity it sent people away from a workspace seconds from ready.
 */
function isAtCapacity(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 503 || isApiDeployBlip(err)) return false;
  const code = err.body && typeof err.body === "object" ? (err.body as { error?: unknown }).error : undefined;
  return code === "at_capacity";
}

function isTransientSandboxError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  return err.status === 0 || err.status >= 500;
}

/** Same running services, in order: name, url, port, web and health. */
function sameServices(a: RunningService[], b: RunningService[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (s, i) =>
        s.name === b[i].name &&
        s.url === b[i].url &&
        s.port === b[i].port &&
        s.web === b[i].web &&
        s.healthy === b[i].healthy,
    )
  );
}

function snapsEqual(
  a: Record<string, SubagentViewSnapshot>,
  b: Record<string, SubagentViewSnapshot>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of bKeys) {
    const x = a[k];
    const y = b[k];
    if (!x || !y) return false;
    if (
      x.toolId !== y.toolId ||
      x.title !== y.title ||
      x.busy !== y.busy ||
      x.streaming !== y.streaming ||
      x.finalText !== y.finalText ||
      x.blocks !== y.blocks
    ) {
      return false;
    }
  }
  return true;
}

const MIN_CHAT = 300;
/** Preview keeps at least this much space while the split is open. */
const MIN_PREVIEW = 520;
/** Drag chat this far past the max before releasing closes the preview. */
const PREVIEW_CLOSE_THRESHOLD = 72;
/** Drag chat this far past the min before releasing closes the chat. */
const CHAT_CLOSE_THRESHOLD = 72;

/** Tracks the `md:` breakpoint so we can skip the desktop-only resizable
 * chat width on small screens, where the layout stacks instead of splitting. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** Wide enough for the two-column workspace — matches Tailwind's `md:`. */
const useIsDesktop = () => useMediaQuery("(min-width: 768px)");

/**
 * A pointer that can be clicked precisely — a mouse or a trackpad.
 *
 * Width alone said "desktop" for anything 768px and up, which is a tablet held
 * in two hands. Double-click is not a gesture a finger performs reliably or
 * goes looking for, so opening a chat alongside another was offered there and
 * could not actually be reached. An iPad with a trackpad attached reports a
 * fine pointer and does get it, which is the right answer for both.
 */
const useHasFinePointer = () => useMediaQuery("(pointer: fine)");

/** Read from the catalog when used, so the labels follow the app's language. */
function friendlyServiceName(key: string): string | undefined {
  const n = appT().workspace.services;
  const names: Record<string, string> = {
    web: n.website,
    app: n.app,
    api: "API",
    admin: n.admin,
    docs: n.docs,
    worker: n.worker,
    frontend: n.frontend,
    backend: n.backend,
    server: n.server,
    ui: "UI",
    www: n.website,
  };
  return names[key];
}

/** Turn a service name into a readable label, keeping each service distinct. */
function humanizeServiceName(name: string): string {
  const key = name.toLowerCase();
  const friendly = friendlyServiceName(key);
  if (friendly) return friendly;
  return name
    .replace(/[-_]+/g, " ")
    .replace(/\bapi\b/gi, "API")
    .replace(/\bui\b/gi, "UI")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isWebsiteService(s: Pick<RunningService, "web">): boolean {
  return Boolean(s.web);
}

/** Preview-bar label — unique per service, no ports. */
function servicePreviewLabel(s: Pick<RunningService, "name" | "healthy">): string {
  const base = humanizeServiceName(s.name);
  return s.healthy ? base : fill(appT().workspace.services.starting, { name: base });
}

type ServiceMenuGroup = { heading: string; items: RunningService[] };

const PANEL = "#1c1c1c";

/** Group many services into Websites / Servers so multi-app projects stay clear. */
function groupServicesForMenu(list: RunningService[]): ServiceMenuGroup[] {
  const websites = list.filter(isWebsiteService);
  const servers = list.filter((s) => !isWebsiteService(s));
  if (websites.length > 0 && servers.length > 0) {
    return [
      { heading: appT().workspace.services.websites, items: websites },
      { heading: appT().workspace.services.servers, items: servers },
    ];
  }
  return [{ heading: "", items: list }];
}

export function Workspace() {
  const { projectId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const i18n = useT();
  const wp = i18n.workspace.page;
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  /** Seed first message for a newly created chat (e.g. Ask AI to publish). */
  type ThreadSeed = {
    prompt: string;
    skills?: Array<{ id: string; params?: Record<string, unknown> }>;
  };
  /** Keyed by thread id, or by tab id for a draft (see `seedKeyOf`). */
  const [seedByThread, setSeedByThread] = useState<Record<string, ThreadSeed>>({});
  /** Router `state.prompt` must bind to one thread once — never "whoever is first tab". */
  const routerPromptRef = useRef<string | undefined>(
    (location.state as { prompt?: string } | null)?.prompt,
  );
  const routerPromptBoundRef = useRef(false);

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [client, setClient] = useState<OrchClient | null>(null);
  /** Which boot failure to explain — the text is looked up when shown. */
  const [bootError, setBootError] = useState<"capacity" | "openFailed" | null>(null);
  const [atCapacity, setAtCapacity] = useState(false);
  const [bootNonce, setBootNonce] = useState(0);
  const [sandboxReady, setSandboxReady] = useState(false);
  /**
   * A start request is in flight.
   *
   * Between the sandbox coming up and the app answering on a URL there was no
   * state at all, so the pane fell through to its empty case and spent four
   * seconds telling people their app would appear once they described it —
   * while it was starting. This is not an inference about the project: we
   * asked it to start and have not heard back yet.
   */
  const [startPending, setStartPending] = useState(false);
  /** Starts in a row that showed the app cannot start (orchestrator.startShowsCannotStart). */
  const [failedStarts, setFailedStarts] = useState(0);
  const noteStart = useCallback((res: Parameters<typeof startShowsCannotStart>[0]) => {
    setFailedStarts((n) => (startShowsCannotStart(res) ? n + 1 : res.ok && res.healthy ? 0 : n));
  }, []);
  const [sandboxBlock, setSandboxBlock] = useState<"credits" | "failed" | null>(null);
  /**
   * The layout this person left the project in.
   *
   * Read once, synchronously, so the states below can start where they were
   * rather than snapping into place a frame later. `maxChat` is measured off
   * this window, so a width saved on a bigger screen is brought back in range.
   */
  const savedLayout = useRef<WorkspaceLayout | null>(null);
  if (savedLayout.current === null) {
    const total = typeof window === "undefined" ? 1440 : window.innerWidth;
    savedLayout.current = readWorkspaceLayout(projectId, {
      minChat: MIN_CHAT,
      maxChat: Math.max(MIN_CHAT, total - MIN_PREVIEW),
    });
  }
  const saved = savedLayout.current;
  /**
   * Where the preview pane starts, before anything is known about the project.
   *
   * `previewStartState` is built around "undecided" meaning hold still — but
   * the pane used to start from a flat `?? true` regardless, which is the one
   * guess that function exists to avoid making. On a project with no
   * remembered layout it opened the preview on load and then, once history
   * came back and said there was no app, shut it again: the panel flashing up
   * and vanishing on every refresh.
   *
   * Undecided starts closed. Holding the column open and drawing nothing in it
   * was the same fault in a quieter coat: on a project with no app the panel
   * still appeared and was still taken away a second later. Showing something
   * and then removing it reads as a fault; showing it once we know does not.
   * So the pane is revealed when there is an app to put in it, never before —
   * and a remembered choice still outranks all of this, which is the case that
   * actually covers a project you have opened before.
   */
  const initialPreviewStart = previewStartState({
    // What was true last visit (lib/workspace-layout.ts); the chat, once read,
    // confirms or corrects it.
    hasApp: projectId ? lastKnownHasApp(projectId) : null,
    remembered: saved.previewOpen ?? null,
  });

  const [view, setView] = useState<"preview" | "code">(saved.view ?? "preview");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  /** Path shown in the preview address bar (not the E2B host). */
  const [previewPath, setPreviewPath] = useState("/");
  /** Select-and-annotate: pick elements of the live preview, or freeze it and draw, for the chat. */
  const [annotating, setAnnotating] = useState(false);
  // It lives on the preview: leaving it (for the code) ends it.
  useEffect(() => {
    if (view !== "preview") setAnnotating(false);
  }, [view]);
  const [previewPathDraft, setPreviewPathDraft] = useState("/");
  /** Bumped when the user commits a path so PreviewPane navigates the iframe. */
  const [previewNavigatePath, setPreviewNavigatePath] = useState<string | null>(null);
  /** In-app preview history (iframe is cross-origin, so we own back/forward). */
  const previewHistoryRef = useRef<{ stack: string[]; index: number }>({ stack: ["/"], index: 0 });
  const previewHistoryNavRef = useRef(false);
  const [canPreviewBack, setCanPreviewBack] = useState(false);
  const [canPreviewForward, setCanPreviewForward] = useState(false);
  const [services, setServices] = useState<RunningService[]>([]);
  const [activeService, setActiveService] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  /** True only when the web service actually answered — never capture broken proxy pages. */
  const [previewHealthy, setPreviewHealthy] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [showPublish, setShowPublish] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const appLive = usePublishLive(projectId);
  const publishBtnRef = useRef<HTMLButtonElement>(null);
  const shareBtnRef = useRef<HTMLButtonElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [titleMenuOpen, setTitleMenuOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [chatWidth, setChatWidth] = useState(saved.chatWidth ?? 400);
  const [mobilePane, setMobilePane] = useState<"chat" | "app">("chat");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const narrow = useNarrow();
  // Picking a chat or a project in the drawer's Recents moves the URL; the
  // drawer is an overlay, so it gets out of the way of what was just opened.
  useEffect(() => {
    setSidebarOpen(false);
    setMobileNav(false);
  }, [location.pathname, location.search]);
  const [chatOpen, setChatOpen] = useState(saved.chatOpen ?? true);
  const [previewOpen, setPreviewOpen] = useState(initialPreviewStart === "open");
  const [resizing, setResizing] = useState(false);
  const [serviceMenuOpen, setServiceMenuOpen] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">(
    saved.previewDevice ?? "desktop",
  );
  const [codeOpenPath, setCodeOpenPath] = useState<string | null>(null);
  const [codeOpenLine, setCodeOpenLine] = useState<number | null>(null);
  const clearCodeOpenPath = useCallback(() => {
    setCodeOpenPath(null);
    setCodeOpenLine(null);
  }, []);
  /** Bumps CodeView to reload clean tabs after agent writes / restore. */
  const [codeSyncToken, setCodeSyncToken] = useState(0);
  const [codeChangedPaths, setCodeChangedPaths] = useState<string[] | null>(null);

  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [sessionsNextCursor, setSessionsNextCursor] = useState<string | null>(null);
  const [sessionsLoadingMore, setSessionsLoadingMore] = useState(false);
  const sessionsCursorRef = useRef<string | null>(null);
  const sessionsLoadingRef = useRef(false);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  // Read inside the setOpenTabs updater, which must not close over a
  // changing activeTabId or every tab switch would rebuild openThread.
  const activeTabIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);
  const openTabsRef = useRef<OpenTab[]>(openTabs);
  openTabsRef.current = openTabs;
  const [busyThreadId, setBusyThreadId] = useState<string | null>(null);
  // The drawer's Recents lists every chat in the workspace, newest first. Tell
  // it when this project's chats change — one made, titled, renamed or deleted
  // (all of which pass through `sessions`), or a turn starting or ending (which
  // is when a chat moves to the top) — so it refreshes then instead of polling.
  useEffect(() => {
    if (sessions) window.dispatchEvent(new Event("mythex:threads-changed"));
  }, [sessions, busyThreadId]);
  const busyThreadIdRef = useRef<string | null>(null);
  busyThreadIdRef.current = busyThreadId;
  const [subagentSnapshots, setSubagentSnapshots] = useState<
    Record<string, Record<string, SubagentViewSnapshot>>
  >({});
  const [planUiByThread, setPlanUiByThread] = useState<
    Record<
      string,
      {
        statusByPath: Record<string, "ready" | "building" | "built">;
        onBuild: (path: string) => void;
      }
    >
  >({});
  const [historyOpenRequest, setHistoryOpenRequest] = useState(0);
  /** A bar listing one tab is chrome that says nothing; its controls move up. */
  const singleTab = openTabs.length <= 1;
  const tabsHydratedFor = useRef<string | null>(null);

  const bootedForRef = useRef<string | null>(null);
  const dragging = useRef(false);
  const chatWidthBeforePreviewClose = useRef(400);
  const chatWidthRef = useRef(400);
  const chatOpenRef = useRef(true);
  const previewOpenRef = useRef(initialPreviewStart === "open");
  const splitRef = useRef<HTMLDivElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const previewHealthyRef = useRef(false);
  const isDesktop = useIsDesktop();
  const hasFinePointer = useHasFinePointer();
  // Both hooks run every render — `&&` on the calls themselves would
  // short-circuit one of them and change the hook order between renders.
  const canOpenAlongside = isDesktop && hasFinePointer;

  // The phone's pane strip (see the split below). The button sets the pane and
  // the strip glides there; a swipe moves the strip and, once it has come to
  // rest, that is the pane. Each side only acts when the other disagrees, so
  // neither sets off the other.
  /**
   * The button's glide, while it is under way: where it is going.
   *
   * The strip snaps to a pane (snap-mandatory, snap-always), and while a turn
   * was running a tap on › or Chat often went nowhere: the page laid itself out
   * again under the glide (the chat streaming, the preview reloading) and iOS
   * snapped the strip back to the pane it was still nearest, the one it was
   * leaving. The scroll then came to rest there, and resting there said "that
   * is the pane", so the tap was undone. A swipe was fine — the finger carries
   * it past halfway. So for the length of the glide the snap is off and where
   * the strip rests means nothing; it ends on arrival, or when a finger takes
   * over.
   */
  const glideTo = useRef<number | null>(null);
  const glideTimer = useRef(0);
  const endGlide = useCallback(() => {
    const rail = splitRef.current;
    window.clearTimeout(glideTimer.current);
    const target = glideTo.current;
    glideTo.current = null;
    if (!rail) return;
    rail.style.removeProperty("scroll-snap-type");
    // Stopped short (the glide was cut off): finish it, without the animation.
    if (target != null && Math.abs(rail.scrollLeft - target) > 2) rail.scrollTo({ left: target });
  }, []);
  useEffect(() => {
    const rail = splitRef.current;
    if (!rail || isDesktop) return;
    // Right to left, the strip starts at its right edge and scrollLeft runs
    // negative towards the preview on the left.
    const sign = getComputedStyle(rail).direction === "rtl" ? -1 : 1;
    const left = mobilePane === "app" ? sign * rail.clientWidth : 0;
    if (Math.abs(rail.scrollLeft - left) <= 2) return;
    glideTo.current = left;
    rail.style.setProperty("scroll-snap-type", "none");
    rail.scrollTo({ left, behavior: "smooth" });
    window.clearTimeout(glideTimer.current);
    // A glide takes ~300-500ms; past this it is settled however it went.
    glideTimer.current = window.setTimeout(endGlide, 900);
  }, [mobilePane, isDesktop, endGlide]);
  // On a phone the chat is a screen away from the preview: once a pick or a
  // drawing lands in the composer, go there so it can be seen and sent.
  useEffect(() => {
    if (isDesktop) return;
    const toChat = () => setMobilePane("chat");
    window.addEventListener(COMPOSER_ATTACH_EVENT, toChat);
    return () => window.removeEventListener(COMPOSER_ATTACH_EVENT, toChat);
  }, [isDesktop]);
  // On a phone the preview is a pane you swipe to: Android's back brings the
  // chat back rather than leaving the project.
  useBackCloses(!isDesktop && mobilePane === "app", () => setMobilePane("chat"));
  const mobilePaneRef = useRef(mobilePane);
  // A light tap when the phone moves between the chat and the preview.
  const paneSettled = useRef(mobilePane);
  useEffect(() => {
    if (isDesktop || paneSettled.current === mobilePane) return;
    paneSettled.current = mobilePane;
    tapHaptic();
  }, [mobilePane, isDesktop]);
  useEffect(() => {
    mobilePaneRef.current = mobilePane;
    // …and so does the button that opens the preview.
    if (mobilePane === "app") dismissKeyboard();
  }, [mobilePane]);
  useEffect(() => {
    const rail = splitRef.current;
    if (!rail || isDesktop) return;
    let timer = 0;
    // Only a person swipes to the preview. The browser scrolls the strip too —
    // to show something that took focus inside the preview, say — and that
    // used to count as a swipe: reading the chat mid-build, you were thrown to
    // the preview. Such a scroll is put back. Back to the chat always counts:
    // that swipe starts on the preview, whose touches go to its own frame and
    // never reach this page.
    let touching = false;
    let lastInput = 0;
    // Touched since the strip last came to rest: the whole of that slide is a
    // person's, however long it glides. Timed from the last touch alone, a
    // swipe to the preview that took 1.95s to settle was read as the browser's
    // and put back — straight to the chat, in one frame (recorded in the
    // simulator). Touches on the preview itself never reach this page.
    let touchedSinceRest = false;
    const onTouchStart = () => {
      // A finger on the strip mid-glide: the person is moving it now.
      if (glideTo.current != null) {
        window.clearTimeout(glideTimer.current);
        glideTo.current = null;
        rail.style.removeProperty("scroll-snap-type");
      }
      touching = true;
      touchedSinceRest = true;
      lastInput = Date.now();
    };
    const onTouchEnd = () => {
      touching = false;
      lastInput = Date.now();
    };
    const onWheel = () => {
      lastInput = Date.now();
    };
    const settle = () => {
      window.clearTimeout(timer);
      // The button's glide decides where it ends, not where it pauses.
      if (glideTo.current != null) {
        if (Math.abs(rail.scrollLeft - glideTo.current) <= 2) endGlide();
        else rail.scrollTo({ left: glideTo.current, behavior: "smooth" });
        return;
      }
      // A flick glides on after the finger lifts; its end still counts.
      const byPerson = touching || touchedSinceRest || Date.now() - lastInput < 1500;
      if (!touching) touchedSinceRest = false;
      const pane = Math.abs(rail.scrollLeft) > rail.clientWidth / 2 ? "app" : "chat";
      if (pane === "app" && mobilePaneRef.current === "chat" && !byPerson) {
        if (Math.abs(rail.scrollLeft) > 2) rail.scrollTo({ left: 0 });
        return;
      }
      setMobilePane((p) => (p === pane ? p : pane));
    };
    // Arrived at either end by a person's swipe: that is the pane now, not
    // once `scrollend` says so. The drawer only takes a swipe while the chat is
    // the pane, and a swipe begun 70ms before scrollend came was refused — the
    // strip stretched instead, showing empty space, and only the next swipe
    // opened the drawer (recorded in the simulator).
    // Back at the chat counts whoever moved it — a swipe back starts on the
    // preview, whose touches this page never sees; only arriving at the preview
    // needs a person (see above).
    const onArrive = () => {
      if (glideTo.current != null) return;
      const x = Math.abs(rail.scrollLeft);
      const end = rail.scrollWidth - rail.clientWidth;
      // Leaving the chat puts the keyboard away: swiped to the preview with
      // the composer focused, it stayed up over the preview.
      if (x > 8 && (touching || touchedSinceRest)) dismissKeyboard();
      if (x <= 1) setMobilePane((p) => (p === "chat" ? p : "chat"));
      else if (end > 0 && x >= end - 1 && (touching || touchedSinceRest)) setMobilePane((p) => (p === "app" ? p : "app"));
    };
    rail.addEventListener("scroll", onArrive, { passive: true });
    // `scrollend` where there is one; a short quiet spell where there is not
    // (Safari before 26).
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, 150);
    };
    const hasScrollEnd = "onscrollend" in window;
    rail.addEventListener(hasScrollEnd ? "scrollend" : "scroll", hasScrollEnd ? settle : onScroll, {
      passive: true,
    });
    rail.addEventListener("touchstart", onTouchStart, { passive: true });
    rail.addEventListener("touchend", onTouchEnd, { passive: true });
    rail.addEventListener("touchcancel", onTouchEnd, { passive: true });
    rail.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.clearTimeout(timer);
      rail.removeEventListener("scroll", onArrive);
      rail.removeEventListener("scrollend", settle);
      rail.removeEventListener("scroll", onScroll);
      rail.removeEventListener("touchstart", onTouchStart);
      rail.removeEventListener("touchend", onTouchEnd);
      rail.removeEventListener("touchcancel", onTouchEnd);
      rail.removeEventListener("wheel", onWheel);
    };
  }, [isDesktop, project, client, endGlide]);

  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  useEffect(() => {
    if (!projectId) {
      setIsPublishing(false);
      return;
    }
    // One shared prefetch (readiness + hosting + domains). Popover reuses the snapshot.
    const applyFromJob = () => {
      const job = getPublishJob(projectId);
      const publishing = job.status === "publishing";
      setIsPublishing(publishing);
      if (publishing) ensurePublishPoller(projectId);
    };
    void prefetchPublishSnapshot(projectId).then(applyFromJob);
    const onPublishJob = (e: Event) => {
      const detail = (e as CustomEvent<{ projectId?: string; status?: string }>).detail;
      if (detail?.projectId && detail.projectId !== projectId) return;
      if (detail?.status === "publishing") {
        setIsPublishing(true);
        ensurePublishPoller(projectId);
        return; // don't hammer publish-readiness while the deploy poller is active
      }
      if (detail?.status === "success" || detail?.status === "error" || detail?.status === "idle") {
        setIsPublishing(false);
        void prefetchPublishSnapshot(projectId, { force: true }).then(applyFromJob);
      }
    };
    const onPublishUpdated = () => {
      void prefetchPublishSnapshot(projectId, { force: true }).then(applyFromJob);
    };
    window.addEventListener("mythex:publish-updated", onPublishUpdated);
    window.addEventListener("mythex:publish-job", onPublishJob);
    return () => {
      window.removeEventListener("mythex:publish-updated", onPublishUpdated);
      window.removeEventListener("mythex:publish-job", onPublishJob);
    };
  }, [projectId]);

  useEffect(() => {
    chatWidthRef.current = chatWidth;
  }, [chatWidth]);

  useEffect(() => {
    chatOpenRef.current = chatOpen;
  }, [chatOpen]);

  useEffect(() => {
    previewOpenRef.current = previewOpen;
  }, [previewOpen]);

  /** Starts true so the mount pass stores nothing; see the effect below. */
  const suppressLayoutWrite = useRef(true);

  /**
   * Remember the workspace the way the user left it.
   *
   * None of this survived a reload — every state was hardcoded to its default,
   * so dragging the split, narrowing the chat or switching to Code came undone
   * the next time the page loaded.
   *
   * Not written while resizing: a drag is hundreds of renders, and the value
   * worth keeping is where it was let go. And not while the automatic close
   * still owns the pane, or the heuristic would harden into a choice the user
   * never made.
   */
  useEffect(() => {
    if (resizing) return;
    // Mount, and the automatic close, are not decisions. Writing on mount
    // would store the defaults as if they had been chosen, and the heuristic
    // would never get to run again on this project.
    if (suppressLayoutWrite.current) {
      suppressLayoutWrite.current = false;
      return;
    }
    writeWorkspaceLayout(projectId, {
      previewOpen,
      chatOpen,
      chatWidth,
      view,
      previewDevice,
    });
  }, [projectId, previewOpen, chatOpen, chatWidth, view, previewDevice, resizing]);

  const syncPreviewHistoryButtons = useCallback(() => {
    const { stack, index } = previewHistoryRef.current;
    setCanPreviewBack(index > 0);
    setCanPreviewForward(index < stack.length - 1);
  }, []);

  const recordPreviewHistory = useCallback(
    (path: string) => {
      if (previewHistoryNavRef.current) {
        previewHistoryNavRef.current = false;
        return;
      }
      const h = previewHistoryRef.current;
      if (h.stack[h.index] === path) return;
      const stack = [...h.stack.slice(0, h.index + 1), path];
      previewHistoryRef.current = { stack, index: stack.length - 1 };
      syncPreviewHistoryButtons();
    },
    [syncPreviewHistoryButtons],
  );

  const goPreviewHistory = useCallback(
    (delta: -1 | 1) => {
      const h = previewHistoryRef.current;
      const index = h.index + delta;
      if (index < 0 || index >= h.stack.length) return;
      const path = h.stack[index];
      previewHistoryRef.current = { stack: h.stack, index };
      previewHistoryNavRef.current = true;
      setPreviewPath(path);
      setPreviewPathDraft(path);
      setPreviewNavigatePath(path);
      syncPreviewHistoryButtons();
      // Clear even if the iframe never reports a location (no bridge).
      window.setTimeout(() => {
        previewHistoryNavRef.current = false;
      }, 800);
    },
    [syncPreviewHistoryButtons],
  );

  // Reset the address-bar path when the preview origin changes (new sandbox / service).
  useEffect(() => {
    const path = previewPathFromUrl(previewUrl);
    setPreviewPath(path);
    setPreviewPathDraft(path);
    setPreviewNavigatePath(null);
    previewHistoryRef.current = { stack: [path], index: 0 };
    previewHistoryNavRef.current = false;
    syncPreviewHistoryButtons();
  }, [previewUrl, syncPreviewHistoryButtons]);

  const commitPreviewPath = useCallback(() => {
    if (!previewUrl) return;
    let path = previewPathDraft.trim() || "/";
    if (!path.startsWith("/")) path = `/${path}`;
    setPreviewPath(path);
    setPreviewPathDraft(path);
    setPreviewNavigatePath(path);
    recordPreviewHistory(path);
  }, [previewUrl, previewPathDraft, recordPreviewHistory]);

  const openPreviewUrl = previewUrl
    ? (() => {
        try {
          return new URL(previewPath || "/", previewUrl).href;
        } catch {
          return previewUrl;
        }
      })()
    : null;

  // Soft-reload the preview after Write/Edit. Dev-server HMR through the E2B proxy is
  // often flaky (especially after big UI/WebGL edits); without this users only
  // saw changes after reloading the whole Mythex page. Debounce so a burst of
  // Writes becomes one reload. PreviewPane reloads via src bounce (cross-origin
  // safe) — not contentWindow.location.reload().
  // Also sync CodeView tabs (clean buffers reload from disk).
  // While the agent is mid-turn, don't bounce the iframe on every Write — that
  // stacks with HMR and paints "loading" over BrowserRun. Queue one reload for
  // when the turn ends.
  /**
   * Has the agent ever changed a file in this session?
   *
   * A new project boots the baked starter, so a preview URL exists within
   * seconds of the sandbox waking whether or not anyone has built anything —
   * which makes the URL useless as "there is an app now". Writing a file is
   * the first moment there is.
   */
  /**
   * How many times the agent has written a file, not merely whether it has.
   *
   * A boolean could only ever reopen the preview once. Someone who closes the
   * pane, asks for a change and gets one expects to see it — and that has to
   * keep working on the turn after that, and the one after that.
   */
  const [appChangeCount, setAppChangeCount] = useState(0);
  const appEverChanged = appChangeCount > 0;
  const filesChangedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCodePaths = useRef<Set<string>>(new Set());
  /**
   * Files changed: the Code tab picks them up. The preview is not reloaded
   * here — a hot-reload dev server has already updated it, and reloading on
   * top threw away what the person was doing in it. An app that cannot update
   * itself is reloaded by the agent (ReloadPreview) or by `reloadPreview`
   * below when the person restores or imports.
   */
  const onFilesChanged = useCallback((paths?: string[]) => {
    if (paths?.length) {
      for (const p of paths) {
        const n = p.replace(/^\.\//, "").replace(/^\/home\/user\/app\//, "");
        if (n) pendingCodePaths.current.add(n);
      }
    } else {
      // null = refresh all clean open tabs (restore / unknown set of files)
      pendingCodePaths.current.clear();
      pendingCodePaths.current.add("__all__");
    }
    if (filesChangedTimer.current) clearTimeout(filesChangedTimer.current);
    filesChangedTimer.current = setTimeout(() => {
      filesChangedTimer.current = null;
      const all = pendingCodePaths.current.has("__all__");
      const list = all ? null : [...pendingCodePaths.current];
      pendingCodePaths.current.clear();
      setCodeChangedPaths(list);
      setCodeSyncToken((n) => n + 1);
    }, 900);
  }, []);

  /** Reload the preview pane once (ReloadPreview, a restore, an import). */
  const reloadPreview = useCallback(() => {
    setPreviewNonce((n) => n + 1);
  }, []);

  // Dashboard cards show a static screenshot of last preview work (not publish).
  // Only when idle + healthy — never mid-build, never the proxy error page.
  useEffect(() => {
    if (!projectId || !previewUrl || !running || !previewHealthy) return;
    if (busyThreadId) return; // wait until the agent turn finishes
    const t = window.setTimeout(() => {
      void api.post(`/v1/projects/${projectId}/thumbnail/capture`).catch(() => {
        /* best-effort — missing Playwright / storage is fine */
      });
    }, 8_000);
    return () => window.clearTimeout(t);
  }, [projectId, previewUrl, running, previewHealthy, busyThreadId]);

  const handleRunUpdate = useCallback((
    url: string | null,
    healthy: boolean,
    list?: RunningService[],
    opts?: { forceReload?: boolean },
  ) => {
    if (!url) return;
    // For a multi-service app, the preview follows the `web` service; the port
    // switcher lets the user peek at the others (e.g. a raw API response).
    // Accept unhealthy updates too — checkpoint restore returns immediately
    // after restarting services (skips the health wait) so Discard & resend /
    // Restore aren't blocked for up to 25s; the preview URL is still valid
    // and we refresh once the port is likely up.
    let nextUrl = url;
    let webHealthy = healthy;
    if (list && list.length > 0) {
      const web = list.find((s) => s.web) ?? list[0];
      nextUrl = web.url;
      webHealthy = web.healthy;
      // Every `run` event lands here, live and on replay: keep the list we
      // have when nothing in it changed, or Workspace and every panel re-render.
      setServices((prev) => (sameServices(prev, list) ? prev : list));
      setActiveService(web.name);
    } else {
      setServices((prev) => (prev.length === 0 ? prev : []));
      setActiveService(null);
    }
    const wasHealthy = previewHealthyRef.current;
    previewHealthyRef.current = webHealthy;
    setPreviewHealthy(webHealthy);
    // Up, however it got there: earlier failed starts no longer count.
    if (webHealthy) setFailedStarts(0);
    const prev = previewUrlRef.current;
    const forceReload = Boolean(opts?.forceReload);
    // Same URL: normally leave the iframe alone (avoids HMR flash). Reload when
    // (a) app just became healthy after starting/proxy-error, or (b) platform
    // restarted services (SetRunConfig) — otherwise users stay on ECONNREFUSED
    // until they hit the toolbar refresh.
    const reloadNow = () => {
      setPreviewNonce((n) => n + 1);
    };
    if (prev === nextUrl) {
      setRunning(true);
      if (webHealthy && (!wasHealthy || forceReload)) {
        reloadNow();
      }
      return;
    }
    setPreviewUrl(nextUrl);
    previewUrlRef.current = nextUrl;
    setRunning(true);
    // New URL: if already healthy, bounce iframe so we don't keep a prior
    // error document from the old host/path mapping.
    if (webHealthy) {
      reloadNow();
    }
  }, []);

  // Switch which service the preview iframe points at.
  const selectService = useCallback(
    (name: string) => {
      const svc = services.find((s) => s.name === name);
      if (!svc) return;
      setActiveService(name);
      setPreviewUrl(svc.url);
      setPreviewNonce((n) => n + 1);
      setServiceMenuOpen(false);
    },
    [services],
  );

  /**
   * Bring the preview's backend back up: the same steps opening the project
   * takes. Wake the sandbox (or have a new one made, if the old one is gone),
   * then start the app — which restarts it if it crashed and leaves it alone
   * if it is running. Mid-turn the agent owns restarts, so then this only
   * reads what is running. Refresh, coming back to the app and the preview's
   * own recovery all go through here; concurrent calls share one run.
   *
   * Refresh used to reload the same address and nothing else, so a preview
   * whose sandbox had ended (a phone left in the background) or whose app had
   * crashed stayed broken until the app was closed and reopened.
   */
  const ensuringRef = useRef<Promise<boolean | undefined> | null>(null);
  /** Resolves whether the app came up healthy; undefined when it could not tell (mid-turn, a viewer, an error). */
  const ensurePreview = useCallback((): Promise<boolean | undefined> => {
    if (ensuringRef.current) return ensuringRef.current;
    const run = (async (): Promise<boolean | undefined> => {
      if (!projectId || !client || !project) return undefined;
      try {
        await api.post<{ previewUrl: string | null }>(`/v1/projects/${projectId}/sandbox`);
        setSandboxReady(true);
      } catch (err) {
        if (err instanceof ApiError && err.status === 402) setSandboxBlock("credits");
        return undefined;
      }
      const bindListed = async () => {
        const listed = await orch.services(client);
        const web = listed.services?.find((s) => s.web) ?? listed.services?.[0];
        if (web?.url) handleRunUpdate(web.url, Boolean(web.healthy), listed.services);
      };
      try {
        if (busyThreadIdRef.current || project.role === "VIEWER") {
          await bindListed();
          return undefined;
        }
        // A start in flight, the same as when the project opens: while the
        // orchestrator restarts a crashed app the service reads as not
        // running, and without this the pane had no cover for that window.
        setStartPending(true);
        try {
          const res = await orch.start(client, {
            runCommand: project.runCommand,
            runPort: project.runPort,
            services: project.runServices,
          });
          noteStart(res);
          // A start that restarted the app leaves a page from the old process
          // in the preview: reload it, as after an agent's restart.
          if (res.ok && res.previewUrl) {
            handleRunUpdate(res.previewUrl, Boolean(res.healthy), res.services, { forceReload: res.unchanged === false });
          }
          return res.ok ? Boolean(res.healthy) : undefined;
        } finally {
          setStartPending(false);
        }
      } catch {
        // Nothing runnable, or the orchestrator blipped: the next attempt retries.
        return undefined;
      }
    })().finally(() => {
      ensuringRef.current = null;
    });
    ensuringRef.current = run;
    return run;
  }, [projectId, client, project, handleRunUpdate, noteStart]);

  // Back from the background after a while: the sandbox may have slept or been
  // replaced. Bring it up now, so the preview is ready rather than broken.
  // One listener for the page's life: the time it went hidden must survive
  // re-renders. Keyed on ensurePreview, the listener was replaced whenever the
  // project reloaded — which a sandbox ending does — and the replacement had
  // forgotten when the app went away, so coming back did nothing.
  const ensurePreviewRef = useRef(ensurePreview);
  ensurePreviewRef.current = ensurePreview;
  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt && Date.now() - hiddenAt > 60_000) void ensurePreviewRef.current();
      hiddenAt = 0;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  /** The app's latest output, for "Your app isn't loading" and its Fix with AI. */
  const loadAppOutput = useCallback(
    async (lines: number): Promise<string[]> => {
      if (!client) return [];
      const res = await orch.recentLogs(client, lines);
      return res.lines;
    },
    [client],
  );

  /** Count every preview that failed / came back / could not; alert on the last. */
  const onPreviewHealth = useCallback(
    (e: PreviewHealthEvent) => {
      const device = isNative() ? `${nativePlatform()} app` : isDesktop ? "web" : "mobile web";
      trackAppEvent(`preview_${e.type}`, { ...e, device });
      // Only count failures after the agent finished: while it builds (a new
      // project's first turn above all) the app has nothing to draw yet.
      if (e.type === "failed" && !e.busy && projectId) {
        void api.post(`/v1/projects/${projectId}/preview-failed`, { reason: e.reason }).catch(() => {});
      }
      if (e.type === "stuck" && projectId) {
        void api
          .post(`/v1/projects/${projectId}/preview-stuck`, {
            reason: e.reason,
            attempts: e.attempts,
            device,
            ...(e.failed ? { failedStatus: e.failed.status, failedFile: e.failed.file } : {}),
          })
          .catch(() => {});
      }
    },
    [projectId, isDesktop],
  );

  const loadSessions = useCallback(async () => {
    try {
      const page = await api.get<ThreadsPage>(`/v1/projects/${projectId}/threads?limit=30`);
      setSessions(page.items);
      setSessionsNextCursor(page.nextCursor);
      sessionsCursorRef.current = page.nextCursor;
    } catch {
      setSessions([]);
      setSessionsNextCursor(null);
      sessionsCursorRef.current = null;
    }
  }, [projectId]);

  const loadMoreSessions = useCallback(async () => {
    const cursor = sessionsCursorRef.current;
    if (!cursor || sessionsLoadingRef.current) return;
    sessionsLoadingRef.current = true;
    setSessionsLoadingMore(true);
    try {
      const page = await api.get<ThreadsPage>(
        `/v1/projects/${projectId}/threads?limit=30&cursor=${encodeURIComponent(cursor)}`,
      );
      setSessions((cur) => {
        const seen = new Set((cur ?? []).map((s) => s.id));
        const added = page.items.filter((s) => !seen.has(s.id));
        return [...(cur ?? []), ...added];
      });
      setSessionsNextCursor(page.nextCursor);
      sessionsCursorRef.current = page.nextCursor;
    } catch {
      // keep current list
    } finally {
      sessionsLoadingRef.current = false;
      setSessionsLoadingMore(false);
    }
  }, [projectId]);

  useEffect(() => {
    // Only once this project's own tabs are open: moving to another project,
    // the page has the new id a render before its tabs, and the last
    // project's chats were saved as the new one's — reopened there, the
    // stranger showed as a "New chat" tab beside the chat picked from Recents.
    if (!projectId || tabsHydratedFor.current !== projectId) return;
    persistThreadTabs(projectId, openTabs, activeTabId);
  }, [openTabs, activeTabId, projectId]);

  /** The `?thread=` this page last put in the URL itself (or read from it on open). */
  const urlThreadWrittenRef = useRef<string | null | undefined>(undefined);
  /** A thread named by the URL from outside, waiting for its tab to become the active one. */
  const urlThreadPendingRef = useRef<string | null>(null);

  /*
   * A `?thread=` that arrives from outside while the project is already open
   * opens that chat. Tapping a notification in the app navigates within the
   * page, so the tabs were hydrated long ago and nothing else reads the URL
   * again — and the effect below, which only writes it, put the chat already
   * on screen straight back over it.
   */
  useEffect(() => {
    if (!projectId || tabsHydratedFor.current !== projectId) return;
    const urlThread = new URLSearchParams(location.search).get("thread");
    if (urlThreadWrittenRef.current === undefined) {
      urlThreadWrittenRef.current = urlThread;
      return;
    }
    if (!urlThread || urlThread === urlThreadWrittenRef.current || urlThread === urlThreadPendingRef.current) return;
    urlThreadPendingRef.current = urlThread;
    const tabId = threadTabId(urlThread);
    setOpenTabs((tabs) => {
      if (tabs.some((t) => t.id === tabId)) return tabs;
      // In place of the chat on screen, as a click in the chat's own history
      // does — picking a chat from the sidebar's Recents used to add a tab.
      const tab: OpenTab = { kind: "thread", id: tabId, threadId: urlThread };
      const at = tabs.findIndex((t) => t.id === activeTabIdRef.current);
      if (at >= 0) {
        const next = [...tabs];
        next[at] = tab;
        return next;
      }
      return [...tabs.slice(-(MAX_CHAT_TABS - 1)), tab];
    });
    setActiveTabId(tabId);
  }, [projectId, location.search, openTabs]);

  // `?thread=` names the chat on screen, so a link or a refresh lands back on
  // it. A draft has no thread yet and clears it. Held off until the tabs have
  // been read from the URL, or the first pass would erase what it asked for.
  useEffect(() => {
    if (!projectId || tabsHydratedFor.current !== projectId) return;
    const active = openTabs.find((t) => t.id === activeTabId);
    const threadId =
      !active || active.kind === "draft"
        ? null
        : active.kind === "thread"
          ? active.threadId
          : active.parentThreadId;
    // A thread someone else put in the URL is the effect above's to open. Both
    // run in the same commit, before its tab is active — writing the chat still
    // on screen here would undo the navigation — so wait until it is.
    if (urlThreadPendingRef.current) {
      if (threadId !== urlThreadPendingRef.current) return;
      urlThreadPendingRef.current = null;
    }
    const next = new URLSearchParams(location.search);
    urlThreadWrittenRef.current = threadId;
    if (next.get("thread") === threadId) return;
    if (threadId) next.set("thread", threadId);
    else next.delete("thread");
    const search = next.toString();
    navigate(
      { pathname: location.pathname, search: search ? `?${search}` : "", hash: location.hash },
      { replace: true, state: location.state },
    );
  }, [openTabs, activeTabId, projectId, location.pathname, location.search, location.hash, location.state, navigate]);

  // Consume create-from-prompt router state once into seedByThread for a specific
  // thread id. Binding to "first open tab" on every render re-fires the bootstrap
  // message when that tab is closed and a newer empty chat becomes first.
  useEffect(() => {
    const prompt = routerPromptRef.current?.trim();
    if (!routerPromptBoundRef.current) {
      if (!prompt) {
        routerPromptBoundRef.current = true;
      } else {
        const first = openTabs.find(isChatTab);
        if (first) {
          routerPromptBoundRef.current = true;
          const key = seedKeyOf(first);
          setSeedByThread((prev) => (prev[key] ? prev : { ...prev, [key]: { prompt } }));
        }
      }
    }
    if (routerPromptBoundRef.current && (location.state as { prompt?: string } | null)?.prompt) {
      navigate(
        { pathname: location.pathname, search: location.search, hash: location.hash },
        { replace: true, state: null },
      );
    }
  }, [openTabs, location.pathname, location.search, location.hash, location.state, navigate]);

  // Live tab dots come from ChatPanel onBusyChange; boot sets the initial
  // busy thread via the single agentStatus call below (no separate poll).
  /**
   * Threads something has actually happened in since this page loaded.
   *
   * `Session.messageCount` is read once when the list loads and never
   * refreshed, so on its own it says a chat is empty long after it stopped
   * being one. A turn starting is the event that makes it wrong, so record
   * that and read the two together.
   */
  const usedThreadsRef = useRef<Set<string>>(new Set());

  const handleBusyChange = useCallback((threadId: string, busy: boolean) => {
    if (busy) usedThreadsRef.current.add(threadId);
    setBusyThreadId((prev) => {
      if (busy) return threadId;
      if (prev === threadId) return null;
      return prev;
    });
  }, []);

  /**
   * `replace` puts the thread in the active tab's place instead of adding one.
   *
   * New chat is "start again here", not "add another" — pressing + a few times
   * should not leave a row of empty chats to tidy up. Several chats at once is
   * what history is for, and opening one from there still adds a tab.
   */
  const openThread = useCallback(
    (threadId: string, opts?: { replace?: boolean }) => {
      const id = threadTabId(threadId);
      setOpenTabs((tabs) => {
        if (tabs.some((t) => t.id === id)) {
          setActiveTabId(id);
          return tabs;
        }
        if (opts?.replace) {
          const at = tabs.findIndex((t) => t.id === activeTabIdRef.current);
          if (at >= 0) {
            setActiveTabId(id);
            const next = [...tabs];
            next[at] = { kind: "thread", id, threadId };
            return next;
          }
          // Nothing to replace yet — fall through and open the first tab.
        }
        if (tabs.length >= MAX_CHAT_TABS) {
          toast("info", fill(appT().workspace.page.tooManyTabs, { max: MAX_CHAT_TABS }));
          return tabs;
        }
        setActiveTabId(id);
        return [...tabs, { kind: "thread", id, threadId }];
      });
      setChatOpen(true);
      setMobilePane("chat");
    },
    [toast],
  );

  const closeTab = useCallback((id: string) => {
    setOpenTabs((tabs) => {
      const idx = tabs.findIndex((t) => t.id === id);
      if (idx < 0) return tabs;
      const next = tabs.filter((t) => t.id !== id);
      setActiveTabId((cur) => {
        if (cur !== id) return cur;
        const neighbor = next[idx] ?? next[idx - 1] ?? next[next.length - 1];
        return neighbor?.id ?? null;
      });
      return next;
    });
  }, []);

  const openSubagentTab = useCallback(
    (parentThreadId: string, toolId: string, title: string) => {
      const id = subagentTabId(parentThreadId, toolId);
      setOpenTabs((tabs) => {
        if (tabs.some((t) => t.id === id)) {
          setActiveTabId(id);
          return tabs;
        }
        if (tabs.length >= MAX_CHAT_TABS) {
          toast("info", fill(appT().workspace.page.tooManyTabs, { max: MAX_CHAT_TABS }));
          return tabs;
        }
        setActiveTabId(id);
        return [...tabs, { kind: "subagent", id, parentThreadId, toolId, title }];
      });
      setChatOpen(true);
      setMobilePane("chat");
    },
    [toast],
  );

  const openPlanTab = useCallback(
    (parentThreadId: string, path: string, title: string) => {
      const id = planTabId(parentThreadId, path);
      setOpenTabs((tabs) => {
        if (tabs.some((t) => t.id === id)) {
          setActiveTabId(id);
          return tabs;
        }
        if (tabs.length >= MAX_CHAT_TABS) {
          toast("info", fill(appT().workspace.page.tooManyTabs, { max: MAX_CHAT_TABS }));
          return tabs;
        }
        setActiveTabId(id);
        return [...tabs, { kind: "plan", id, parentThreadId, path, title }];
      });
      setChatOpen(true);
      setMobilePane("chat");
    },
    [toast],
  );

  /** Stable callback — an inline fn here re-fires ChatPanel's lift effect every
   * render and causes "Maximum update depth exceeded". */
  const handleSubagentSnapshots = useCallback(
    (threadId: string, snaps: Record<string, SubagentViewSnapshot>) => {
      setSubagentSnapshots((prev) => {
        const cur = prev[threadId];
        if (cur && snapsEqual(cur, snaps)) return prev;
        return { ...prev, [threadId]: snaps };
      });
    },
    [],
  );

  const handlePlanUiChange = useCallback(
    (
      threadId: string,
      ui: {
        statusByPath: Record<string, "ready" | "building" | "built">;
        onBuild: (path: string) => void;
      },
    ) => {
      setPlanUiByThread((prev) => {
        const cur = prev[threadId];
        const sameStatus =
          cur &&
          Object.keys(cur.statusByPath).length === Object.keys(ui.statusByPath).length &&
          Object.entries(ui.statusByPath).every(([k, v]) => cur.statusByPath[k] === v);
        if (sameStatus && cur.onBuild === ui.onBuild) return prev;
        return { ...prev, [threadId]: ui };
      });
    },
    [],
  );

  // GitHub OAuth return (billing return is handled globally by BillingReturnHandler),
  // and links straight to a settings section (`?settings=usage` from emails).
  useEffect(() => {
    const SECTIONS: SettingsTab[] = ["general", "usage", "knowledge", "secrets", "database", "storage", "export", "github", "mobile"];
    const asked = params.get("settings") as SettingsTab | null;
    const section = params.get("github") === "connected" ? "github" : asked && SECTIONS.includes(asked) ? asked : null;
    if (section) {
      if (params.get("github") === "connected") {
        toast("success", appT().workspace.page.githubConnected);
      }
      setSettingsTab(section);
      setShowSettings(true);
      params.delete("github");
      params.delete("settings");
      setParams(params, { replace: true });
    }
    // Re-read when the link changes, so "Raise the limit" in the publish
    // panel can open Settings → Usage on the page it's already on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get("settings"), params.get("github")]);

  // Load project, wake the sandbox, auto-start the app, and load sessions.
  // Guarded by a projectId-keyed ref so it runs exactly once per project — even
  // under React StrictMode's dev double-invoke — so we never wake the sandbox or
  // start the app twice (a double `run` restarts the dev server and flickers the
  // preview).
  useEffect(() => {
    const bootKey = `${projectId}:${bootNonce}`;
    if (!projectId || bootedForRef.current === bootKey) return;
    bootedForRef.current = bootKey;

    setProject(null);
    setClient(null);
    setBootError(null);
    setAtCapacity(false);
    setSandboxReady(false);
    setSandboxBlock(null);
    setRunning(false);
    setFailedStarts(0);
    setPreviewHealthy(false);
    previewHealthyRef.current = false;
    setPreviewUrl(null);
    setServices([]);
    setActiveService(null);
    setSessions(null);
    setSessionsNextCursor(null);
    sessionsCursorRef.current = null;
    setOpenTabs([]);
    setActiveTabId(null);
    tabsHydratedFor.current = null;
    setSubagentSnapshots({});
    setSeedByThread({});
    routerPromptRef.current = (location.state as { prompt?: string } | null)?.prompt;
    routerPromptBoundRef.current = false;

    void (async () => {
      try {
        // Wake the sandbox in parallel with the project fetch — the E2B resume
        // (3–60s) doesn't depend on the project body, so overlap them.
        // Waking is idempotent, so a deploy's balancer answers are waited out
        // rather than shown as "at capacity" or a failed workspace.
        const sandboxPromise = retryThroughDeploy(
          () => api.post<{ previewUrl: string | null }>(`/v1/projects/${projectId}/sandbox`),
          isApiDeployBlip,
        );
        sandboxPromise.catch(() => {}); // avoid an unhandled rejection before we await it

        const [detail, threadsPage] = await Promise.all([
          api.get<ProjectDetail>(`/v1/projects/${projectId}`),
          api.get<ThreadsPage>(`/v1/projects/${projectId}/threads?limit=30`),
        ]);
        // Another project was opened while this one loaded. The workspace stays
        // mounted across projects, so a boot that finishes late would write its
        // project, sandbox and preview into the one on screen: A → B → A left
        // A showing B's preview (prod, 2026-11-08: a white preview that Refresh
        // could not fix). Every step after an await checks this first.
        const stale = () => bootedForRef.current !== bootKey;
        if (stale()) return;
        setProject(detail);
        // The API names a prompt-created project after the row exists, so this
        // fetch usually lands before the name does. Pick it up when it arrives.
        if (detail.name === PROVISIONAL_PROJECT_NAME) {
          void (async () => {
            for (let i = 0; i < 10; i++) {
              await new Promise((r) => setTimeout(r, 1500));
              if (bootedForRef.current !== bootKey) return;
              const next = await api.get<ProjectDetail>(`/v1/projects/${projectId}`).catch(() => null);
              if (bootedForRef.current !== bootKey) return;
              if (next && next.name !== PROVISIONAL_PROJECT_NAME) {
                setProject((p) => (p && p.name === PROVISIONAL_PROJECT_NAME ? { ...p, name: next.name } : p));
                window.dispatchEvent(
                  new CustomEvent("mythex:project-renamed", { detail: { id: projectId, name: next.name } }),
                );
                return;
              }
            }
          })();
        }
        setSessions(threadsPage.items);
        setSessionsNextCursor(threadsPage.nextCursor);
        sessionsCursorRef.current = threadsPage.nextCursor;
        if (tabsHydratedFor.current !== projectId) {
          // The URL says which chat is open. Without a thread in it — opening
          // the project from its card or the sidebar — it is the chat you last
          // worked in: the most recently active thread with anything in it
          // (the list comes back newest first, and every saved message moves a
          // thread to the top). A new chat — a draft, whose thread is made
          // when its first message is sent, never on open — only when there
          // is none yet, or when this visit brings a prompt to start one.
          const urlThreadId =
            new URLSearchParams(window.location.search).get("thread") ??
            (routerPromptRef.current?.trim()
              ? null
              : (threadsPage.items.find((t) => t.messageCount > 0)?.id ?? null));
          let tabs: OpenTab[];
          let activeId: string;
          if (urlThreadId) {
            activeId = threadTabId(urlThreadId);
            const restored = hydrateOpenTabs(projectId, []).openTabs;
            tabs = restored.some((t) => t.id === activeId)
              ? restored
              : [
                  ...restored.slice(-(MAX_CHAT_TABS - 1)),
                  { kind: "thread", id: activeId, threadId: urlThreadId },
                ];
          } else {
            activeId = draftTabId();
            tabs = [{ kind: "draft", id: activeId }];
          }
          setOpenTabs(tabs);
          setActiveTabId(activeId);
          tabsHydratedFor.current = projectId;
          const prompt = routerPromptRef.current?.trim();
          if (prompt && !routerPromptBoundRef.current) {
            const first = tabs.find((t) => t.id === activeId && isChatTab(t)) ?? tabs.find(isChatTab);
            if (first && isChatTab(first)) {
              routerPromptBoundRef.current = true;
              const key = seedKeyOf(first);
              setSeedByThread((prev) => (prev[key] ? prev : { ...prev, [key]: { prompt } }));
            }
          }
        }
        const c: OrchClient = {
          url: detail.orchestratorUrl,
          token: detail.orchestratorToken,
          projectId: detail.id,
        };
        setClient(c);

        try {
          await sandboxPromise;
          if (stale()) return;
          setSandboxReady(true);
          // Bringing the preview up starts here, not at the fetch below: an
          // agentStatus round trip sits in between, and for its duration the
          // sandbox was ready with nothing marked as pending — which is the
          // sliver where the pane still flashed "your app will appear here".
          setStartPending(true);
        } catch (sandboxErr) {
          if (stale()) return;
          // Still show the workspace (chat / settings / publish gates) when the
          // sandbox can't wake — Preview/agent stay unavailable until retry.
          if (sandboxErr instanceof ApiError && sandboxErr.status === 402) {
            setSandboxBlock("credits");
            setSandboxReady(false);
            return;
          }
          if (isAtCapacity(sandboxErr)) {
            setAtCapacity(true);
            setBootError("capacity");
            return;
          }
          // E2B/orchestrator blips (EADDRNOTAVAIL, 500) are common on first create —
          // retry once before locking the opening prompt behind a hard error.
          if (isTransientSandboxError(sandboxErr)) {
            try {
              await new Promise((r) => setTimeout(r, 1500));
              await api.post<{ previewUrl: string | null }>(`/v1/projects/${projectId}/sandbox`);
              if (stale()) return;
              setSandboxReady(true);
              // Same window as the first attempt — this path falls through to
              // the same start below.
              setStartPending(true);
            } catch (retryErr) {
              if (stale()) return;
              if (retryErr instanceof ApiError && retryErr.status === 402) {
                setSandboxBlock("credits");
                setSandboxReady(false);
                return;
              }
              if (isAtCapacity(retryErr)) {
                setAtCapacity(true);
                setBootError("capacity");
                return;
              }
              setSandboxBlock("failed");
              setSandboxReady(false);
              return;
            }
          } else {
            setSandboxBlock("failed");
            setSandboxReady(false);
            return;
          }
        }
        // Unlock the composer as soon as the sandbox is up so send isn't
        // blocked on the agent daemon's cold LangGraph import (30–90s on
        // a fresh/resumed sandbox). Daemon still warms in the background; the
        // first /agent turn awaits ensureDaemon server-side.
        void waitForAgentDaemon(c).catch(() => false);

        // If a build is already running (e.g. started in another tab and still
        // going), don't compete with a boot `/start` — that can restart the
        // dev server under the agent. Bind whatever is already listening;
        // ChatPanel replay of `run` fills in the rest.
        let buildActive = false;
        try {
          const status = await agentStatus(c);
          if (stale()) return;
          buildActive = status.active;
          setBusyThreadId(status.active ? status.threadId : null);
        } catch {
          if (stale()) return;
          // status unknown — fall through to the normal boot run
          setBusyThreadId(null);
        }

        // Start the preview when possible. New projects seed a Vite starter with
        // .mythex/run.json — resolveServices finds it even if DB runCommand is
        // still null (detail was fetched in parallel with sandbox wake).
        //
        // Not for a Viewer: starting runs the project's commands, which the
        // orchestrator refuses them (403 forbidden_role), and that refusal was
        // swallowed below — a Viewer opening an idle project got an empty
        // preview. They take what is already running, as during a build.
        if (!buildActive && detail.role !== "VIEWER") {
          try {
            const startOnce = () =>
              orch
                .start(c, {
                  runCommand: detail.runCommand,
                  runPort: detail.runPort,
                  services: detail.runServices,
                })
                .then((r) => {
                  noteStart(r);
                  return r;
                });
            let res = await startOnce();
            // Pause/resume often leaves the port closed on the first probe —
            // retry once so we don't leave the preview on a dead 5173 URL.
            if (res.ok && res.previewUrl && !res.healthy) {
              await new Promise((r) => setTimeout(r, 2500));
              res = await startOnce().catch(() => res);
            }
            // Wire URL even when still warming — PreviewPane hides the iframe
            // until healthy so users never see E2B's "Closed Port" page.
            if (stale()) return;
            if (res.ok && res.previewUrl) {
              handleRunUpdate(res.previewUrl, Boolean(res.healthy), res.services);
            }
          } catch {
            // Nothing runnable yet — it auto-starts after the next agent turn.
          } finally {
            if (!stale()) setStartPending(false);
          }
        } else {
          try {
            const listed = await orch.services(c);
            if (stale()) return;
            const web = listed.services?.find((s) => s.web) ?? listed.services?.[0];
            if (web?.url) {
              handleRunUpdate(web.url, Boolean(web.healthy), listed.services);
            }
          } catch {
            // Replayed `run` events from ChatPanel will bind the preview.
          } finally {
            // Nothing was started here; the agent's own run events bind the
            // preview, and `agentBusy` covers the wait in the meantime.
            if (!stale()) setStartPending(false);
          }
        }
      } catch (err) {
        if (bootedForRef.current !== bootKey) return;
        if (err instanceof ApiError && err.status === 503) {
          setAtCapacity(true);
          setBootError("capacity");
        } else {
          setBootError("openFailed");
        }
      }
    })();
  }, [projectId, bootNonce, handleRunUpdate]);

  // Workspace may have booted while Free + empty (sandbox 402 → credits block).
  // After Pro upgrade / top-up, auth refresh updates balance — retry wake without
  // remounting the whole workspace (bootNonce would wipe open tabs).
  useEffect(() => {
    if (sandboxBlock !== "credits" || !projectId || !client || !project) return;
    const credits =
      user?.balanceCredits ??
      (typeof user?.balanceTokens === "number" ? user.balanceTokens / 1000 : 0);
    if (!(credits > 0)) return;

    let cancelled = false;
    void (async () => {
      try {
        await api.post<{ previewUrl: string | null }>(`/v1/projects/${projectId}/sandbox`);
        if (cancelled) return;
        setSandboxBlock(null);
        setSandboxReady(true);
        void waitForAgentDaemon(client).catch(() => false);
        try {
          setStartPending(true);
          const startOnce = () =>
            orch
              .start(client, {
                runCommand: project.runCommand,
                runPort: project.runPort,
                services: project.runServices,
              })
              .then((r) => {
                noteStart(r);
                return r;
              });
          let res = await startOnce();
          if (res.ok && res.previewUrl && !res.healthy) {
            await new Promise((r) => setTimeout(r, 2500));
            res = await startOnce().catch(() => res);
          }
          if (!cancelled && res.ok && res.previewUrl) {
            handleRunUpdate(res.previewUrl, Boolean(res.healthy), res.services);
          }
        } catch {
          /* preview can start after the next agent turn */
        } finally {
          setStartPending(false);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 402) return;
        setSandboxBlock("failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    sandboxBlock,
    user?.balanceCredits,
    user?.balanceTokens,
    projectId,
    client,
    project,
    handleRunUpdate,
  ]);

  // Panel resize (desktop only). Past the min/max, keep dragging: close preview
  // on the way right or chat on the way left; reopen if the pointer comes back
  // — drag only ends on mouseup.
  useEffect(() => {
    const endDrag = () => {
      dragging.current = false;
      setResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      // Width is measured from the split container's start edge, so the divider
      // tracks the cursor whether the sidebar is docked (pinned) or an overlay.
      // The start edge is the left one, or the right one in a right-to-left
      // language, where the chat sits on the right and the split mirrors; the
      // rest of this works on the chat's width and does not care which side.
      const split = splitRef.current;
      const rect = split?.getBoundingClientRect();
      const rtl = split ? getComputedStyle(split).direction === "rtl" : false;
      const total = rect?.width ?? 0;
      const maxChat = Math.max(MIN_CHAT, total - MIN_PREVIEW);
      const next = rtl ? (rect?.right ?? 0) - e.clientX : e.clientX - (rect?.left ?? 0);

      if (!chatOpenRef.current) {
        // Still holding after chat close — pull right to bring chat back.
        if (next >= MIN_CHAT) {
          chatOpenRef.current = true;
          setChatOpen(true);
          setChatWidth(Math.min(maxChat, Math.max(MIN_CHAT, next)));
        }
        return;
      }

      if (!previewOpenRef.current) {
        // Still holding after preview close — pull left to bring preview back.
        if (next <= maxChat) {
          previewOpenRef.current = true;
          setPreviewOpen(true);
          setChatWidth(Math.min(maxChat, Math.max(MIN_CHAT, next)));
        }
        return;
      }

      if (next > maxChat + PREVIEW_CLOSE_THRESHOLD) {
        chatWidthBeforePreviewClose.current = maxChat;
        setChatWidth(maxChat);
        previewOpenRef.current = false;
        setPreviewOpen(false);
        return;
      }
      if (next < MIN_CHAT - CHAT_CLOSE_THRESHOLD) {
        setChatWidth(MIN_CHAT);
        chatOpenRef.current = false;
        setChatOpen(false);
        return;
      }
      setChatWidth(Math.min(maxChat, Math.max(MIN_CHAT, next)));
    };
    const onUp = () => {
      if (!dragging.current) return;
      endDrag();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const restorePreview = useCallback(() => {
    setChatWidth(chatWidthBeforePreviewClose.current);
    previewOpenRef.current = true;
    setPreviewOpen(true);
    setChatOpen(true);
  }, []);

  /** A file chip or a Read/Write row: show the file in Code. With the right
   *  pane shut (a new project with no app yet starts that way) that used to
   *  change nothing you could see. */
  const openFileInCode = useCallback(
    (path: string) => {
      setView("code");
      setMobilePane("app");
      setCodeOpenPath(path);
      if (!previewOpenRef.current) restorePreview();
    },
    [restorePreview],
  );

  /**
   * The same, from the chat — asked first. A row like "Write gen_zoo.py" or a
   * file chip reads as part of the conversation, and a click on one used to
   * swap the whole right pane to Code without warning, away from the preview.
   * `confirmed` is for a click that already chose Code — the file preview's
   * "Open in Code" — so it isn't asked twice.
   */
  const [confirmOpenPath, setConfirmOpenPath] = useState<string | null>(null);
  const askOpenFileInCode = useCallback(
    (path: string, opts?: { confirmed?: boolean }) => {
      if (opts?.confirmed) openFileInCode(path);
      else setConfirmOpenPath(path);
    },
    [openFileInCode],
  );

  /**
   * A project with no app yet opens on the chat alone.
   *
   * Half the window is otherwise given to a panel that can only say "your app
   * will appear here" — and it is the half holding the one thing there is to
   * do, which is type. Talking is not the trigger to open it: asking a
   * question, connecting an app, planning out loud all leave nothing to
   * preview, and a panel that opens to show a spinner and then nothing is
   * worse than one that waited. It comes back the first time the agent writes
   * a file — a URL alone means nothing, because the starter template answers
   * on one as soon as the sandbox wakes.
   *
   * Decided once, from the first sessions payload, and only ever undone
   * automatically if this is what closed it. Dragging the split shut is the
   * user's decision and outlives any of this.
   */
  const autoClosedPreview = useRef(false);
  const previewStartDecided = useRef(false);

  /**
   * Does this project have an app, as far as we can tell yet?
   *
   * Sticky once true: history is loaded a thread at a time, and the thread you
   * happen to have open may not be the one that built anything.
   */
  const [appReport, setAppReport] = useState<{ read: Set<string>; any: boolean }>(() => ({
    read: new Set(),
    any: false,
  }));
  const noteAppPresence = useCallback((threadId: string, present: boolean) => {
    setAppReport((prev) => {
      if (prev.read.has(threadId) && (prev.any || !present)) return prev;
      const read = new Set(prev.read);
      read.add(threadId);
      return { read, any: prev.any || present };
    });
  }, []);

  const hasApp: boolean | null = useMemo(() => {
    if (appEverChanged || appReport.any) return true;
    if (!sessions) return null;
    // No messages in any thread means no app, and that can be said without
    // waiting for a history fetch that will come back empty. This is all a
    // message count is good for — whether there is history to read, never
    // whether the agent built anything.
    const withMessages = sessions.filter((s) => s.messageCount > 0);
    if (withMessages.length === 0) return false;
    // "No app" is only safe to conclude once every thread that has anything in
    // it has been read. A project often carries a couple of empty "New chat"
    // threads in front of the one that did the work, and an empty one opens
    // first — reading only that and concluding "no app" hid the preview on
    // finished projects. Until the rest are read this stays unknown, and
    // unknown leaves the pane where it is rather than shutting it.
    if (!withMessages.every((s) => appReport.read.has(s.id))) return null;
    return false;
  }, [appEverChanged, sessions, appReport]);

  useEffect(() => {
    if (projectId && hasApp !== null) rememberHasApp(projectId, hasApp);
  }, [projectId, hasApp]);

  useEffect(() => {
    if (previewStartDecided.current) return;
    const want = previewStartState({ hasApp, remembered: saved.previewOpen ?? null });
    if (want === "undecided") return;
    previewStartDecided.current = true;
    if (want === "open") {
      // The other half of the decision. This used to be a bare `return`,
      // because the pane began open and there was only ever closing to do —
      // now that it begins shut until there is something to show, opening it is
      // this effect's job too. Not a decision by the user, so not written to
      // the layout, same as the close below.
      if (!previewOpenRef.current) {
        suppressLayoutWrite.current = true;
        previewOpenRef.current = true;
        setPreviewOpen(true);
      }
      return;
    }
    autoClosedPreview.current = true;
    suppressLayoutWrite.current = true;
    chatWidthBeforePreviewClose.current = chatWidth;
    previewOpenRef.current = false;
    setPreviewOpen(false);
  }, [hasApp, projectId, chatWidth]);

  /**
   * The agent changed the app, so show it — whoever shut the pane.
   *
   * This used to reopen only what it had closed itself, on the reasoning that
   * closing the split is the user's decision. But asking for a change *is* a
   * decision too, and the more recent one: closing the preview, saying "show
   * me hello", and then not being shown it is the pane ignoring you.
   *
   * Once per turn, on the first file written. Reopening on every Write would
   * mean someone who shuts it mid-build has to keep shutting it.
   *
   * Deliberately not waiting for a preview URL: with the panel shut nothing
   * asks for one, so that condition could never come true. The pane has its
   * own waiting state for the seconds between opening and the app answering.
   */
  const reopenedThisTurn = useRef(false);
  useEffect(() => {
    if (busyThreadId) reopenedThisTurn.current = false;
  }, [busyThreadId]);

  useEffect(() => {
    if (appChangeCount === 0 || reopenedThisTurn.current) return;
    reopenedThisTurn.current = true;
    autoClosedPreview.current = false;
    if (!previewOpenRef.current) restorePreview();
  }, [appChangeCount, restorePreview]);

  /**
   * `replace` — the + button. With one tab open it takes over that tab, so a
   * lone chat never grows a strip; with several it adds a tab like any other
   * (and so respects the cap). Seeded
   * calls (the empty state, a skill chip) open a tab the ordinary way.
   *
   * Nothing is created here. New chat is a draft that looks like any empty
   * chat; its thread is made by the first send (`ensureThread`), so pressing +
   * and walking away leaves no "New chat" behind in history.
   */
  const newSession = useCallback(
    (seed?: string | ThreadSeed, opts?: { replace?: boolean }) => {
      const normalized: ThreadSeed | null =
        typeof seed === "string"
          ? seed.trim()
            ? { prompt: seed.trim() }
            : null
          : seed && (seed.prompt.trim() || (seed.skills?.length ?? 0) > 0)
            ? {
                prompt: seed.prompt.trim(),
                skills: seed.skills,
              }
            : null;
      const activeTab = openTabs.find((t) => t.id === activeTabIdRef.current);
      // Already sitting in a new chat: + has nothing to do.
      if (!normalized && activeTab?.kind === "draft") {
        setChatOpen(true);
        setMobilePane("chat");
        return;
      }
      // + only takes over the tab when it is the only one. With several open,
      // the person is working across chats, and a new one goes alongside.
      const replace = Boolean(opts?.replace && activeTab && openTabs.length <= 1);
      if (!replace && openTabs.length >= MAX_CHAT_TABS) {
        toast("info", fill(appT().workspace.page.tooManyTabs, { max: MAX_CHAT_TABS }));
        return;
      }
      const id = draftTabId();
      if (normalized) setSeedByThread((prev) => ({ ...prev, [id]: normalized }));
      setOpenTabs((tabs) => {
        const at = replace ? tabs.findIndex((t) => t.id === activeTabIdRef.current) : -1;
        if (at < 0) return [...tabs, { kind: "draft", id }];
        const next = [...tabs];
        next[at] = { kind: "draft", id };
        return next;
      });
      setActiveTabId(id);
      setChatOpen(true);
      setMobilePane("chat");
    },
    [openTabs, toast],
  );
  const newSessionRef = useRef(newSession);
  newSessionRef.current = newSession;

  /**
   * Give a draft its thread — called by the draft's first send.
   *
   * A project is created with one empty thread, and a chat abandoned before
   * this change may be sitting empty too; one of those is used before a new
   * one is made, so they don't pile up in history unwritten. The tab keeps its
   * render key, so the ChatPanel mid-send is not remounted.
   */
  const ensureThread = useCallback(
    /**
     * @param beforeSwitch runs once the thread is known and before the tab
     *   becomes it — the chat marks the thread as its own there, so switching
     *   cannot load that thread's history over the turn being sent.
     */
    async (draftId: string, beforeSwitch?: (threadId: string) => void): Promise<string | null> => {
      // Whether an empty chat can be reused is the API's call, made against the
      // database: the list loaded with this page can be stale, and reusing from
      // it put a new chat's first message into a thread another tab had used.
      const excludeIds = [
        ...openTabsRef.current.flatMap((t) => (t.kind === "thread" ? [t.threadId] : [])),
        ...usedThreadsRef.current,
        ...(busyThreadIdRef.current ? [busyThreadIdRef.current] : []),
      ].slice(-50);
      let session: Session & { reused?: boolean };
      try {
        // First message of a new chat during a deploy: the balancer's answer
        // means no thread was claimed or made, so asking again is safe.
        session = await retryThroughDeploy(
          () =>
            api.post<Session & { reused?: boolean }>(`/v1/projects/${projectId}/threads`, {
              reuseEmpty: true,
              excludeIds,
            }),
          isApiDeployBlip,
        );
      } catch {
        return null;
      }
      usedThreadsRef.current.add(session.id);
      setSessions((cur) => {
        const { reused: _reused, ...row } = session;
        return [row, ...(cur ?? []).filter((x) => x.id !== row.id)];
      });
      const threadId = session.id;
      beforeSwitch?.(threadId);
      const id = threadTabId(threadId);
      setOpenTabs((tabs) =>
        tabs.map((t) => (t.id === draftId ? { kind: "thread", id, threadId, renderKey: draftId } : t)),
      );
      setActiveTabId((cur) => (cur === draftId ? id : cur));
      return threadId;
    },
    [projectId],
  );

  // PublishPopover "Ask AI to publish" / "Fix with AI" → new chat + seed (Publish skill).
  // The phone drawer's "New chat" (AppSidebar's DrawerFoot): a new chat in
  // this project, as the header's + does.
  useEffect(() => {
    const onNewChat = () => void newSessionRef.current(undefined, { replace: true });
    window.addEventListener("mythex:new-chat", onNewChat);
    return () => window.removeEventListener("mythex:new-chat", onNewChat);
  }, []);

  useEffect(() => {
    const onAgentPrompt = (ev: Event) => {
      const detail = (
        ev as CustomEvent<{
          text?: string;
          newChat?: boolean;
          skills?: Array<{ id: string; params?: Record<string, unknown> }>;
        }>
      ).detail;
      if (!detail) return;
      const text = detail.text?.trim() || "";
      if (!text && !(detail.skills?.length)) return;
      setChatOpen(true);
      chatOpenRef.current = true;
      setMobilePane("chat");
      if (!sandboxReady) {
        toast("info", appT().workspace.page.startingPublish);
      }
      if (!detail.newChat) {
        // The active chat tab's ChatPanel takes it (acceptAgentPrompt). With no
        // chat tab active there is no one to take it — start a chat for it
        // rather than lose it.
        const active = openTabsRef.current.find((t) => t.id === activeTabIdRef.current);
        if (active && isChatTab(active)) return;
      }
      void newSession({
        prompt: text,
        skills: detail.skills,
      });
    };
    window.addEventListener("mythex:agent-prompt", onAgentPrompt);
    return () => window.removeEventListener("mythex:agent-prompt", onAgentPrompt);
  }, [newSession, sandboxReady, toast]);

  const renameSession = async (id: string, title: string) => {
    setSessions((cur) => (cur ?? []).map((s) => (s.id === id ? { ...s, title } : s)));
    await api.patch(`/v1/projects/${projectId}/threads/${id}`, { title }).catch(() => {
      toast("error", appT().workspace.page.renameChatFailed);
      void loadSessions();
    });
  };

  const deleteSession = async (id: string) => {
    try {
      await api.delete(`/v1/projects/${projectId}/threads/${id}`);
      const remaining = (sessions ?? []).filter((s) => s.id !== id);
      setSessions(remaining);
      const next = openTabs.filter(
        (t) =>
          !(t.kind === "thread" && t.threadId === id) &&
          !(t.kind === "subagent" && t.parentThreadId === id) &&
          !(t.kind === "plan" && t.parentThreadId === id),
      );
      setOpenTabs(next);
      setActiveTabId((cur) => {
        if (cur && next.some((t) => t.id === cur)) return cur;
        return next[0]?.id ?? null;
      });
      // Deleting the only open chat used to land on the empty state, which
      // reads as "this project has nothing in it" when the project has plenty.
      // Fall back to the most recent chat that still exists; sessions are
      // newest first, so that is the head of what is left.
      if (next.length === 0 && remaining[0]) openThread(remaining[0].id);
    } catch {
      toast("error", appT().workspace.page.deleteChatFailed);
    }
  };

  const busySubagentIds = (() => {
    const set = new Set<string>();
    for (const [parentId, map] of Object.entries(subagentSnapshots)) {
      for (const [toolId, snap] of Object.entries(map)) {
        if (snap.busy) set.add(`${parentId}:${toolId}`);
      }
    }
    return set;
  })();

  const currentServiceName =
    activeService ?? services.find((s) => s.web)?.name ?? services[0]?.name ?? null;
  const currentService =
    (currentServiceName ? services.find((s) => s.name === currentServiceName) : null) ??
    services[0] ??
    null;
  useNativeBleedTop();
  const serviceMenuGroups = groupServicesForMenu(services);

  /** The workspace's header. On a desktop it spans the split; on a phone it
   *  is the chat pane's own bar, placed inside that pane so it moves with it. */
  const header =
    project && client ? (
      <header className="ws-header relative z-30 flex min-h-12 shrink-0 items-stretch" data-pane={mobilePane}>
        {/* Left block — aligns with the chat column so the preview controls
            center over the preview area (v0-style), not the whole page. */}
        <div
          className={`ws-header-left flex min-w-0 items-center gap-1 overflow-hidden px-2.5 sm:px-1.5 max-md:min-w-0 max-md:flex-1 max-md:pe-2 ${
            chatOpen && previewOpen ? "md:shrink-0" : ""
          }`}
          style={isDesktop && chatOpen && previewOpen ? { width: chatWidth } : undefined}
        >
          {/* A phone's two panes each carry their own bar, as
              Lovable's do, and each moves with its pane as you swipe:
              this one — the drawer, the project's name, the › to the
              preview — rides on the chat; the preview's toolbar (‹ Chat,
              ⋯, Publish) is `appBar`, on the preview. */}
          <button
            onClick={() => setMobileNav(true)}
            className="ws-glass-btn shrink-0 rounded-md p-1.5 text-white/50 transition hover:bg-white/8 hover:text-white md:hidden"
            title={wp.menu}
            aria-label={wp.openMenu}
          >
            <DrawerIcon className="h-4 w-4" />
          </button>
          {!isDesktop && (
            // The project's name, centred between the drawer and the ›
            // to the preview, as plain text: it opens the project's
            // sheet (ProjectMenuSheet), as Lovable's does.
            <button
              type="button"
              onClick={() => setTitleMenuOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={titleMenuOpen}
              data-testid="mobile-project-menu"
              className="ws-title ms-1 min-w-0 flex-1"
            >
              <span dir="auto" className="min-w-0 truncate">{project.name}</span>
              <ChevronDown className="size-5 shrink-0 text-white/60" />
            </button>
          )}
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="hidden size-7 shrink-0 items-center justify-center rounded-md text-white/50 transition hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-accent md:flex"
              title={wp.openSidebar}
              aria-label={wp.openSidebar}
            >
              {/* The hamburger, same as the one on mobile: this opens
                  the app's navigation drawer, and it is the one control
                  here that is not about the workspace's own layout. The
                  panel arrows next to the preview are for that. */}
              <DrawerIcon className="h-4 w-4" />
            </button>
          )}
          {/* The project's name opens its menu, as Lovable's does: the way back
              to the dashboard (the logo button that did this is gone) and the
              project's settings (the gear that sat by Share is gone too). */}
          {isDesktop ? (
            chatOpen && (
              <Popover
                open={projectMenuOpen}
                onOpenChange={setProjectMenuOpen}
                align="start"
                sideOffset={6}
                label={wp.projectMenu}
                className="w-56 rounded-[12px] p-1.5"
                style={{ background: CARD_BG, boxShadow: floatingRing(CARD_BG) }}
                trigger={
                  <button
                    type="button"
                    data-testid="project-menu"
                    title={project.name}
                    className="ms-1 flex h-7 min-w-0 items-center gap-1 rounded-[8px] px-1.5 text-sm font-medium text-white transition hover:bg-white/[0.06]"
                  >
                    <span dir="auto" className="min-w-0 truncate">{project.name}</span>
                    <ChevronDown
                      className={`size-3.5 shrink-0 transition-transform ${projectMenuOpen ? "rotate-180" : ""}`}
                      style={{ color: FG_TERTIARY }}
                    />
                  </button>
                }
              >
                <div role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setProjectMenuOpen(false);
                      navigate("/");
                    }}
                    className="flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-start text-[14px] text-fg-2 transition hover:bg-white/[0.04] hover:text-fg"
                  >
                    <LayoutDashboard className="size-4 shrink-0" style={{ color: FG_TERTIARY }} />
                    {wp.goToDashboard}
                  </button>
                  <div className="mx-1 my-1 h-px" style={{ background: "oklch(0.55 0.002 107 / 0.4)" }} />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProjectMenuOpen(false);
                    setSettingsTab("general");
                    setShowSettings(true);
                  }}
                  className="flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-start text-[14px] text-fg-2 transition hover:bg-white/[0.04] hover:text-fg"
                >
                  <Settings2 className="size-4 shrink-0" style={{ color: FG_TERTIARY }} />
                  {i18n.common.settings}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProjectMenuOpen(false);
                    setSettingsTab("usage");
                    setShowSettings(true);
                  }}
                  className="flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-start text-[14px] text-fg-2 transition hover:bg-white/[0.04] hover:text-fg"
                >
                  <Gauge className="size-4 shrink-0" style={{ color: FG_TERTIARY }} />
                  {i18n.settings.project.usage}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProjectMenuOpen(false);
                    setSettingsTab("knowledge");
                    setShowSettings(true);
                  }}
                  className="flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-start text-[14px] text-fg-2 transition hover:bg-white/[0.04] hover:text-fg"
                >
                  <BookOpen className="size-4 shrink-0" style={{ color: FG_TERTIARY }} />
                  {wp.knowledge}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProjectMenuOpen(false);
                    setSettingsTab("database");
                    setShowSettings(true);
                  }}
                  className="flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-start text-[14px] text-fg-2 transition hover:bg-white/[0.04] hover:text-fg"
                >
                  <Database className="size-4 shrink-0" style={{ color: FG_TERTIARY }} />
                  {i18n.settings.project.database}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProjectMenuOpen(false);
                    setSettingsTab("storage");
                    setShowSettings(true);
                  }}
                  className="flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-start text-[14px] text-fg-2 transition hover:bg-white/[0.04] hover:text-fg"
                >
                  <HardDrive className="size-4 shrink-0" style={{ color: FG_TERTIARY }} />
                  {i18n.settings.project.fileStorage}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProjectMenuOpen(false);
                    setSettingsTab("secrets");
                    setShowSettings(true);
                  }}
                  className="flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-start text-[14px] text-fg-2 transition hover:bg-white/[0.04] hover:text-fg"
                >
                  <KeyRound className="size-4 shrink-0" style={{ color: FG_TERTIARY }} />
                  {wp.secrets}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProjectMenuOpen(false);
                    setSettingsTab("github");
                    setShowSettings(true);
                  }}
                  className="flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-start text-[14px] text-fg-2 transition hover:bg-white/[0.04] hover:text-fg"
                >
                  <GitBranch className="size-4 shrink-0" style={{ color: FG_TERTIARY }} />
                  GitHub
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProjectMenuOpen(false);
                    setSettingsTab("export");
                    setShowSettings(true);
                  }}
                  className="flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-start text-[14px] text-fg-2 transition hover:bg-white/[0.04] hover:text-fg"
                >
                  <Download className="size-4 shrink-0" style={{ color: FG_TERTIARY }} />
                  {wp.export}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProjectMenuOpen(false);
                    setSettingsTab("mobile");
                    setShowSettings(true);
                  }}
                  className="flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-start text-[14px] text-fg-2 transition hover:bg-white/[0.04] hover:text-fg"
                >
                  <Smartphone className="size-4 shrink-0" style={{ color: FG_TERTIARY }} />
                  {i18n.publish.mobile.settingsTab}
                </button>
                </div>
              </Popover>
            )
          ) : (
            <span className="ws-project-name ms-1 min-w-0 truncate text-sm font-medium text-white" title={project.name}>
              <bdi>{project.name}</bdi>
            </span>
          )}
          <span className={`min-w-0 flex-1 ${isDesktop ? "" : "hidden"}`} />
          {/* New chat and history sit at the far end of the chat column,
              past the project name rather than trailing it: they act on
              the workspace, not on the project. One chat needs no tab
              bar, so they come up here rather than onto a row of their
              own. */}
          {singleTab && chatOpen && (
            <span className="ms-1 flex shrink-0 items-center max-md:hidden" data-testid="chat-tabs-inline">
              <ChatTabs
                variant="inline"
                openTabs={openTabs}
                activeTabId={activeTabId}
                sessions={sessions}
                sessionsHasMore={sessionsNextCursor != null}
                sessionsLoadingMore={sessionsLoadingMore}
                onLoadMoreSessions={() => void loadMoreSessions()}
                busyThreadId={busyThreadId}
                busySubagentIds={busySubagentIds}
                onSelectTab={setActiveTabId}
                onCloseTab={closeTab}
                onNewAgent={() => void newSession(undefined, { replace: true })}
                onOpenThread={(id, o) => openThread(id, { replace: !o?.additional })}
                allowMultiple={canOpenAlongside}
                onRenameSession={(id, title) => void renameSession(id, title)}
                onDeleteSession={(id) => void deleteSession(id)}
                historyOpenRequest={historyOpenRequest}
              historyAnchorRef={publishBtnRef}
              />
            </span>
          )}
        </div>

        {/* Preview section — desktop controls + URL bar.
            Uses @container so controls collapse when the preview column is narrow.
            Hidden on mobile (Chat/Preview/Code live in the tab switcher below). */}
        <div className="@container relative hidden min-w-0 flex-1 items-center gap-1.5 pe-1 md:flex">
          {previewOpen ? (
            <>
              {/* This shows and hides the chat column, so it is drawn as
                  a panel — the same language as PanelRight on "Show
                  preview" beside it. Panels are for the workspace's own
                  layout; the hamburger at the far left is navigation, and
                  nothing else in this bar borrows either. A speech bubble
                  said "chat" while New chat and history sat immediately
                  to its left, so three icons read as one group when only
                  two of them were about chats. The arrow carries the
                  state, which is why the colour no longer has to: it went
                  bright whenever the panel was open and drew the eye to
                  the least interesting thing in the row. */}
              {/* Hidden, the chat's toggle is drawn switched on — Lovable's
                  filled "Show chat panel" — so the one control that brings the
                  panel back is the one that stands out. */}
              <button
                onClick={() => setChatOpen((o) => !o)}
                aria-pressed={!chatOpen}
                className={`z-10 flex size-7 shrink-0 items-center justify-center rounded-[8px] transition focus-visible:ring-2 focus-visible:ring-accent ${
                  chatOpen ? "text-muted hover:bg-hover hover:text-fg" : "btn-surface text-fg"
                }`}
                title={chatOpen ? wp.hideChat : wp.showChat}
                aria-label={wp.toggleChat}
              >
                {chatOpen ? (
                  <PanelLeftClose className="h-4 w-4 rtl:-scale-x-100" />
                ) : (
                  <PanelLeftOpen className="h-4 w-4 rtl:-scale-x-100" />
                )}
              </button>
              <div className="z-10 shrink-0">
                <SlidingPillSwitch
                  size="sm"
                  aria-label={wp.workspaceView}
                  value={view}
                  onChange={(v) => setView(v as "preview" | "code")}
                  options={[
                    {
                      value: "preview",
                      // A tablet gets Lovable's icons, leaving the address bar its room.
                      label: (
                        <>
                          <Eye className="size-3.5 lg:hidden" aria-label={wp.preview} />
                          <span className="max-lg:hidden">{wp.preview}</span>
                        </>
                      ),
                    },
                    {
                      value: "code",
                      label: (
                        <>
                          <Code2 className="size-3.5 lg:hidden" aria-label={wp.code} />
                          <span className="max-lg:hidden">{wp.code}</span>
                        </>
                      ),
                    },
                  ]}
                />
              </div>

              {view === "preview" && (
                <div className="flex min-w-0 flex-1 items-center justify-end gap-1 @min-[240px]:justify-center">
                  <div className="hidden h-7 w-full max-w-[24rem] min-w-0 items-center gap-0.5 rounded-lg border border-line bg-elevated py-0 ps-0.5 pe-1 @min-[240px]:flex">
                    <button
                      type="button"
                      onClick={() => goPreviewHistory(-1)}
                      disabled={!canPreviewBack}
                      className="inline-flex size-6 shrink-0 @max-[440px]:hidden items-center justify-center rounded-md text-fg transition hover:bg-hover disabled:pointer-events-none disabled:text-muted/40"
                      title={i18n.common.back}
                      aria-label={wp.previewBack}
                    >
                      <ChevronLeft className="h-3.5 w-3.5 rtl:-scale-x-100" />
                    </button>
                    <button
                      type="button"
                      onClick={() => goPreviewHistory(1)}
                      disabled={!canPreviewForward}
                      className="inline-flex size-6 shrink-0 @max-[440px]:hidden items-center justify-center rounded-md text-fg transition hover:bg-hover disabled:pointer-events-none disabled:text-muted/40"
                      title={wp.forward}
                      aria-label={wp.previewForward}
                    >
                      <ChevronRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
                    </button>
                    <button
                      onClick={() => setPreviewDevice((d) => (d === "desktop" ? "mobile" : "desktop"))}
                      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-fg transition hover:bg-hover"
                      title={previewDevice === "desktop" ? wp.switchToMobile : wp.switchToDesktop}
                      aria-label={previewDevice === "desktop" ? wp.switchToMobile : wp.switchToDesktop}
                    >
                      {previewDevice === "desktop" ? (
                        <Smartphone className="h-3.5 w-3.5" />
                      ) : (
                        <Monitor className="h-3.5 w-3.5" />
                      )}
                    </button>
                    {services.length > 1 && (
                      <div className="relative ms-0.5 hidden shrink-0 @min-[520px]:block">
                        {/* Base UI popover: grows from this button, and outside
                            presses and Escape close it. */}
                        <Popover
                          open={serviceMenuOpen}
                          onOpenChange={setServiceMenuOpen}
                          label={wp.previewTarget}
                          className="max-h-72 min-w-44 overflow-y-auto rounded-xl border border-line bg-panel p-1.5 shadow-2xl shadow-black/50"
                          trigger={
                        <button
                          type="button"
                          title={wp.switchTarget}
                          aria-label={wp.switchTarget}
                          aria-haspopup="listbox"
                          aria-expanded={serviceMenuOpen}
                          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-fg transition hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          <span className="max-w-24 truncate font-medium @min-[640px]:max-w-36">
                            {currentService ? servicePreviewLabel(currentService) : i18n.workspace.services.website}
                          </span>
                          <ChevronDown
                            className={`h-3 w-3 shrink-0 text-muted transition-transform ${serviceMenuOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                          }
                        >
                          <div role="listbox" aria-label={wp.previewTarget}>
                            {serviceMenuGroups.map((group, gi) => (
                              <div key={group.heading || "all"} className={gi > 0 ? "mt-1.5" : undefined}>
                                {group.heading && (
                                  <div className="px-2.5 pt-1 pb-1 text-[10px] font-medium tracking-wide text-muted uppercase">
                                    {group.heading}
                                  </div>
                                )}
                                <div className="flex flex-col gap-0.5">
                                  {group.items.map((s) => {
                                    const selected = s.name === currentServiceName;
                                    return (
                                      <button
                                        key={s.name}
                                        type="button"
                                        role="option"
                                        aria-selected={selected}
                                        onClick={() => selectService(s.name)}
                                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start text-xs transition ${
                                          selected
                                            ? "bg-accent-subtle text-fg"
                                            : "text-fg-2 hover:bg-hover hover:text-fg"
                                        }`}
                                      >
                                        <Check
                                          className={`h-3.5 w-3.5 shrink-0 ${selected ? "text-fg opacity-100" : "opacity-0"}`}
                                        />
                                        <span className="min-w-0 flex-1 truncate font-medium">
                                          {servicePreviewLabel(s)}
                                        </span>
                                        {s.web && (
                                          <span className="shrink-0 text-[10px] text-muted">{wp.main}</span>
                                        )}
                                        {!s.healthy && (
                                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </Popover>
                      </div>
                    )}
                    {previewUrl ? (
                      <input
                        value={previewPathDraft}
                        onChange={(e) => setPreviewPathDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitPreviewPath();
                            (e.target as HTMLInputElement).blur();
                          } else if (e.key === "Escape") {
                            setPreviewPathDraft(previewPath);
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        onBlur={() => {
                          if (previewPathDraft.trim() !== previewPath) commitPreviewPath();
                        }}
                        spellCheck={false}
                        title={openPreviewUrl ?? undefined}
                        aria-label={wp.appPath}
                        dir="ltr"
                        className="min-w-0 flex-1 truncate bg-transparent px-1.5 text-xs text-fg outline-none placeholder:text-muted"
                        placeholder="/"
                      />
                    ) : (
                      <span className="min-w-0 flex-1 truncate px-1.5 text-xs text-muted">
                        {wp.previewWillAppear}
                      </span>
                    )}
                    {openPreviewUrl && (
                      <a
                        href={openPreviewUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-fg transition hover:bg-hover"
                        title={i18n.common.openInNewTab}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button
                      onClick={() => {
                        setPreviewNonce((n) => n + 1);
                        void ensurePreview();
                      }}
                      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-fg transition hover:bg-hover"
                      title={wp.refreshPreview}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                    {/* Just outside the address bar, after refresh: it stays when a narrow header hides the bar (tablet). */}
                    <button
                      type="button"
                      onClick={() => setAnnotating((v) => !v)}
                      disabled={!previewUrl}
                      aria-pressed={annotating}
                      data-testid="preview-select"
                      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md transition disabled:pointer-events-none disabled:text-muted/40 ${
                        annotating ? "bg-hover text-fg" : "text-fg hover:bg-hover"
                      }`}
                      title={i18n.workspace.annotate.buttonTitle}
                      aria-label={wp.selectElement}
                    >
                      <CursorIcon className="size-[18px]" />
                    </button>
                </div>
              )}
            </>
          ) : null}

          {/* Preview closed, the chat has the screen — Lovable's fullscreen
              chat: the header keeps the project and one control on the right
              to bring the preview back (their collapse arrows), and Share,
              Upgrade and Publish step out with the app they act on. */}
          {!previewOpen && (
            <button
              type="button"
              onClick={restorePreview}
              className="z-10 me-4 ms-auto inline-flex size-7 items-center justify-center rounded-[8px] text-fg-2 transition hover:bg-white/[0.06] hover:text-fg active:opacity-80"
              title={wp.showPreview}
              aria-label={wp.showPreview}
            >
              <Minimize2 className="size-4" />
            </button>
          )}
        </div>

        {/*
          The header's right-hand slot.
          -----------------------------------------------------------
          Desktop keeps the gear and Publish in the open. Mobile cannot:
          the pane switch has to be a labelled button — an unlabelled
          eye is a guess — and a labelled button plus a gear plus Publish
          does not fit beside a project name at 375px.

          So on mobile the two things you press occasionally fold into a
          ⋯ menu, and the thing you press constantly gets the room. The
          publish popover anchors to whichever button is actually on
          screen, which is why these are branched on `isDesktop` rather
          than hidden with CSS — a display:none anchor has no rectangle
          to point at.
        */}
        {/* No Upgrade here on a phone, as Lovable's has none: it pushed the
            project's name off centre, and upgrading is already offered by the
            composer's trial notice and the project sheet's credits card. */}
        <div
          className={`ws-header-actions z-10 flex shrink-0 items-center gap-1.5 pe-3 sm:pe-4 ${
            isDesktop && !previewOpen ? "hidden" : ""
          }`}
        >
          {isDesktop ? (
            <>
              <button
                ref={shareBtnRef}
                type="button"
                onClick={() => {
                  setShowPublish(false);
                  setShowShare((o) => !o);
                }}
                // The standard raised control, not a one-off: a bare
                // word needs the chassis to read as a button at all, and
                // Publish beside it is the white primary — two buttons
                // that differ in fill say which one is the bigger step.
                className={`${btnClass("md")} ws-collapse`}
                aria-expanded={showShare}
                aria-haspopup="dialog"
                aria-label={i18n.common.share}
                title={i18n.workspace.sharePreview.title}
              >
                <UserPlus className="ws-icon-tablet size-3.5" aria-hidden />
                <span className="ws-label">{i18n.common.share}</span>
              </button>
              {/* Lovable's order: Share, Upgrade, Publish. */}
              {/* In a teammate's workspace there's nothing for you to upgrade. */}
              {project?.paidByMe !== false && <UpgradeButton className="ws-collapse" />}
              <button
                ref={publishBtnRef}
                type="button"
                onClick={() => {
                  setShowShare(false);
                  setShowPublish((o) => !o);
                }}
                className="ws-collapse group/live relative inline-flex h-7 items-center gap-1.5 rounded-md bg-white px-2.5 text-xs font-medium text-zinc-900 transition hover:bg-white/90"
                aria-label={isPublishing ? wp.publishing : wp.publish}
                aria-expanded={showPublish}
                aria-haspopup="dialog"
                // The dot has its own "Live" label; a native title would stack a second one on it.
                title={isPublishing ? wp.publishingEllipsis : appLive ? undefined : wp.publish}
              >
                {isPublishing ? (
                  <span className="size-3.5 animate-spin rounded-full border-2 border-zinc-900/20 border-t-zinc-900" />
                ) : appLive ? (
                  // Published and up: the dot says so where the rocket was.
                  <span className="grid size-3.5 place-items-center">
                    <LiveDot placement="bottom" />
                  </span>
                ) : (
                  <Rocket className="h-3.5 w-3.5" />
                )}
                <span className="ws-label">{isPublishing ? wp.publishing : wp.publish}</span>
              </button>
            </>
          ) : (
            <>
                {/* Lovable's: a round › to the preview, the same size as
                    the drawer button opposite, so the name sits centred
                    between them. With no app there is nowhere to go, and
                    an empty disc's worth of room keeps it centred. */}
                {hasApp !== false ? (
                  <button
                    type="button"
                    onClick={() => setMobilePane("app")}
                    data-testid="mobile-pane-switch"
                    aria-label={wp.preview}
                    title={wp.preview}
                    className="ws-glass-btn"
                  >
                    <ChevronRight className="rtl:-scale-x-100" />
                  </button>
                ) : (
                  <span className="size-11" aria-hidden />
                )}
            </>
          )}
        </div>
      </header>
    ) : null;

  /** The preview's toolbar on a phone: ‹ Chat, then ⋯ and Publish. It lives
   *  in the preview pane, so it slides in with it (see the chat's bar). */
  const appBar =
    project && client ? (
      <div className="ws-appbar" data-testid="mobile-app-bar">
        <button
          type="button"
          onClick={() => setMobilePane("chat")}
          data-testid="mobile-back-to-chat"
          className="ws-pill shrink-0"
        >
          <ChevronLeft className="-ms-1 size-[18px] rtl:-scale-x-100" />
          {wp.chat}
        </button>
        <span className="min-w-0 flex-1" />
        <div className="flex shrink-0 items-center gap-2">
        {/* Showing code, the way back to the app gets its own
            button for as long as the code is up — reached,
            often, by tapping a file in the chat, which gave no
            hint the preview was one menu away. */}
        {view === "code" && (
          <button
            type="button"
            onClick={() => setView("preview")}
            data-testid="mobile-code-to-app"
            className="ws-pill"
          >
            <Eye className="size-[18px]" />
            {wp.preview}
          </button>
        )}
        {/* Base UI popover: grows from this button, and flips
            above it, the row being at the foot of the screen. */}
        <Popover
          open={moreOpen}
          onOpenChange={setMoreOpen}
          align="end"
          sideOffset={8}
          // Lovable's preview menu: the card colour, 12px corners,
          // 48px rows of 14px text with a 16px icon, no rules.
          className="ws-more-menu w-44 rounded-[12px] p-1"
          style={{ background: CARD_BG, boxShadow: floatingRing(CARD_BG) }}
          trigger={
            <button
              type="button"
              aria-label={i18n.common.more}
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              data-testid="workspace-more"
              className="ws-glass-btn"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          }
        >
          <div role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMoreOpen(false);
                setView("preview");
                setPreviewNonce((n) => n + 1);
                void ensurePreview();
              }}
              className="press flex h-12 w-full items-center gap-2 rounded-[8px] px-2 text-start text-[14px] text-fg active:bg-white/[0.04]"
            >
              <RefreshCw className="size-4 shrink-0" />
              {wp.refresh}
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!previewUrl}
              onClick={() => {
                setMoreOpen(false);
                setView("preview");
                setAnnotating(true);
              }}
              data-testid="mobile-preview-select"
              className="press flex h-12 w-full items-center gap-2 rounded-[8px] px-2 text-start text-[14px] text-fg active:bg-white/[0.04] disabled:text-muted/40"
            >
              <CursorIcon className="size-4 shrink-0" />
              {i18n.workspace.annotate.menuItem}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMoreOpen(false);
                setShowPublish(false);
                setShowShare(true);
              }}
              className="press flex h-12 w-full items-center gap-2 rounded-[8px] px-2 text-start text-[14px] text-fg active:bg-white/[0.04]"
            >
              <Share2 className="size-4 shrink-0" />
              {i18n.common.share}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMoreOpen(false);
                setView((v) => (v === "code" ? "preview" : "code"));
              }}
              className="press flex h-12 w-full items-center gap-2 rounded-[8px] px-2 text-start text-[14px] text-fg active:bg-white/[0.04]"
            >
              <Code2 className="size-4 shrink-0" />
              {view === "code" ? wp.viewApp : wp.viewCode}
            </button>
            {/* The preview in a tab of its own, and — as Lovable's
                row has — its link to copy, on the same row. */}
            {openPreviewUrl && (
              <div className="flex items-center">
                <a
                  role="menuitem"
                  href={openPreviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setMoreOpen(false)}
                  className="press flex h-12 min-w-0 flex-1 items-center gap-2 rounded-[8px] px-2 text-start text-[14px] text-fg active:bg-white/[0.04]"
                >
                  <Globe className="size-4 shrink-0" />
                  {wp.preview}
                  <ArrowUpRight className="size-4 shrink-0 text-white/50" />
                </a>
                <button
                  type="button"
                  aria-label={wp.copyPreviewLink}
                  onClick={() => {
                    setMoreOpen(false);
                    void navigator.clipboard
                      ?.writeText(openPreviewUrl)
                      .then(() => toast("success", appT().workspace.page.previewLinkCopied))
                      .catch(() => undefined);
                  }}
                  className="press me-1 grid size-7 shrink-0 place-items-center rounded-[8px] text-white/70 active:bg-white/[0.04]"
                >
                  <Copy className="size-4" />
                </button>
              </div>
            )}
          </div>
        </Popover>
        {/* Publish is the step this pane is for, so it is out
            in the row in the one solid fill, as on desktop. */}
        <button
          ref={publishBtnRef}
          type="button"
          onClick={() => {
            setShowShare(false);
            setShowPublish((o) => !o);
          }}
          aria-expanded={showPublish}
          aria-haspopup="dialog"
          data-testid="mobile-publish"
          className="ws-pill ws-pill-primary"
        >
          {isPublishing ? (
            <span className="size-4 animate-spin rounded-full border-2 border-zinc-900/20 border-t-zinc-900" />
          ) : appLive ? (
            <span className="grid size-4 place-items-center">
              <LiveDot placement="top" />
            </span>
          ) : null}
          {isPublishing ? wp.publishing : wp.publish}
        </button>
        </div>
      </div>
    ) : null;

  return (
    <div className="ws-root native-inset-top relative flex h-full text-white" style={{ background: PANEL }}>
      {/* Desktop overlay drawer — sits on top of content, never pushes layout.
          Only the sidebar this width uses (useNarrow). */}
      {!narrow && <div
        className={`fixed inset-0 z-40 hidden md:flex ${sidebarOpen ? "pointer-events-auto" : "pointer-events-none"}`}
      >
        <div
          className="absolute inset-0 bg-black/50 transition-opacity duration-300"
          style={{ opacity: sidebarOpen ? 1 : 0 }}
          onClick={() => setSidebarOpen(false)}
        />
        <div
          // Slides in from the start edge: the left, or the right in a
          // right-to-left language, where the flex row puts it.
          className={`native-safe-y relative h-full shadow-2xl shadow-black/40 transition-transform duration-300 ease-out ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"
          }`}
          style={{ background: SHELL_BG }}
        >
          <AppSidebar onToggle={() => setSidebarOpen(false)} />
        </div>
      </div>}

      {/* Mobile overlay drawer */}
      {narrow && <MobileNavDrawer open={mobileNav} onOpenChange={setMobileNav} edgeSwipe={mobilePane === "chat"} />}

      <div
        data-drawer-page
        className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden"
        style={{ background: PANEL }}
      >
        {bootError ? (
          <div className="grid flex-1 place-items-center px-6 text-center">
            <div>
              <MythexMark size={36} className={`mx-auto ${atCapacity ? "animate-pulse" : ""}`} />
              <p className="mt-4 text-sm text-muted">{bootError === "capacity" ? wp.atCapacity : wp.openFailed}</p>
              <div className="mt-5 flex items-center justify-center gap-2">
                {atCapacity && (
                  <button type="button" onClick={() => setBootNonce((n) => n + 1)} className="btn-secondary">
                    {i18n.common.retry}
                  </button>
                )}
                <button type="button" onClick={() => navigate("/")} className="btn-primary">
                  {wp.backHome}
                </button>
              </div>
            </div>
          </div>
        ) : !project || !client ? (
          <WorkspaceShellSkeleton />
        ) : (
          <>
            {isDesktop && header}

            {/* On a phone the two panes sit side by side in one horizontal
                scroll-snap strip, as Lovable's do: a sideways swipe moves
                between chat and preview with the browser's own scrolling —
                the finger's speed, the snap, the rubber band — and the
                Preview/Chat button glides the same strip (see the effects on
                splitRef). Above md it is the resizable split. */}
            <div
              ref={splitRef}
              data-testid="ws-split"
              className="flex min-h-0 flex-1 md:flex-row max-md:snap-x max-md:snap-mandatory max-md:overflow-x-auto max-md:overflow-y-hidden max-md:overscroll-x-none ws-swipe-rail"
            >
              {/* Outer width animates; inner stays at chatWidth so content clips
                  instead of squashing (same feel as the nav drawer slide). */}
              <div
                className={`min-h-0 overflow-hidden ${
                  previewOpen ? "md:shrink-0" : "md:min-w-0 md:flex-1"
                } max-md:relative max-md:h-full max-md:w-full max-md:shrink-0 max-md:snap-start max-md:snap-always ${
                  resizing ? "" : "transition-[width] duration-200 ease-out"
                }`}
                style={
                  isDesktop
                    ? previewOpen
                      ? { width: chatOpen ? chatWidth : 0 }
                      : { width: "100%" }
                    : undefined
                }
              >
                {!isDesktop && header}
                <div
                  className="ws-chat-col flex h-full min-h-0 flex-col"
                  data-tabs={singleTab ? undefined : "true"}
                  style={isDesktop && previewOpen ? { width: chatWidth } : undefined}
                >
                  {!singleTab && (
                  <ChatTabs
                    openTabs={openTabs}
                    activeTabId={activeTabId}
                    sessions={sessions}
                    sessionsHasMore={sessionsNextCursor != null}
                    sessionsLoadingMore={sessionsLoadingMore}
                    onLoadMoreSessions={() => void loadMoreSessions()}
                    busyThreadId={busyThreadId}
                    busySubagentIds={busySubagentIds}
                    onSelectTab={setActiveTabId}
                    onCloseTab={closeTab}
                    onNewAgent={() => void newSession(undefined, { replace: true })}
                    onOpenThread={(id, o) => openThread(id, { replace: !o?.additional })}
                    allowMultiple={canOpenAlongside}
                    onRenameSession={(id, title) => void renameSession(id, title)}
                    onDeleteSession={(id) => void deleteSession(id)}
                    historyOpenRequest={historyOpenRequest}
                      historyAnchorRef={publishBtnRef}
                  />
                  )}
                  {openTabs.length === 0 ? (
                    <ChatEmptyState
                      onNewAgent={() => void newSession(undefined, { replace: true })}
                      onOpenHistory={() => setHistoryOpenRequest((n) => n + 1)}
                    />
                  ) : (
                    openTabs.map((tab) => {
                      const active = tab.id === activeTabId;
                      if (isChatTab(tab)) {
                        const threadId = tab.kind === "thread" ? tab.threadId : undefined;
                        const seedKey = seedKeyOf(tab);
                        return (
                          <div
                            key={tab.kind === "thread" ? (tab.renderKey ?? tab.id) : tab.id}
                            className={active ? "flex min-h-0 flex-1 flex-col" : "hidden"}
                            aria-hidden={!active}
                          >
                            <ChatPanel
                              client={client}
                              project={project}
                              sandboxReady={sandboxReady}
                              sandboxBlock={sandboxBlock}
                              acceptAgentPrompt={active}
                              initialPrompt={seedByThread[seedKey]?.prompt}
                              initialSkills={seedByThread[seedKey]?.skills}
                              threadId={threadId}
                              onEnsureThread={
                                tab.kind === "draft" ? (beforeSwitch) => ensureThread(tab.id, beforeSwitch) : undefined
                              }
                              onFilesChanged={onFilesChanged}
                              onReloadPreview={reloadPreview}
                              onAppChanged={() => setAppChangeCount((n) => n + 1)}
                              onAppPresence={noteAppPresence}
                              onRunUpdate={handleRunUpdate}
                              onInitialSeedConsumed={() => {
                                setSeedByThread((prev) => {
                                  if (!prev[seedKey]) return prev;
                                  const next = { ...prev };
                                  delete next[seedKey];
                                  return next;
                                });
                              }}
                              onThreadTitleHint={(id, title) => {
                                setSessions((cur) => {
                                  const list = cur ?? [];
                                  const idx = list.findIndex((s) => s.id === id);
                                  if (idx < 0) return list;
                                  const s = list[idx];
                                  if (s.title !== "New chat" && s.title.trim()) return list;
                                  const next = { ...s, title, updatedAt: new Date().toISOString() };
                                  return [next, ...list.filter((_, i) => i !== idx)];
                                });
                              }}
                              onOpenFile={askOpenFileInCode}
                              onOpenSubagentTab={({ toolId, title }) => {
                                if (threadId) openSubagentTab(threadId, toolId, title);
                              }}
                              openSubagentToolIds={openTabs.flatMap((t) =>
                                t.kind === "subagent" && t.parentThreadId === threadId ? [t.toolId] : [],
                              )}
                              onOpenPlanTab={({ path, title }) => {
                                if (threadId) openPlanTab(threadId, path, title);
                              }}
                              onSubagentSnapshots={handleSubagentSnapshots}
                              onPlanUiChange={handlePlanUiChange}
                              onBusyChange={handleBusyChange}
                            />
                          </div>
                        );
                      }
                      if (tab.kind === "plan") {
                        const planUi = planUiByThread[tab.parentThreadId];
                        const rel = tab.path.replace(/^\/home\/user\/app\//, "").replace(/^\.\//, "");
                        const status = planUi?.statusByPath[rel] ?? "ready";
                        return (
                          <div
                            key={tab.id}
                            className={active ? "flex min-h-0 flex-1 flex-col" : "hidden"}
                            aria-hidden={!active}
                          >
                            <PlanTabPane
                              path={tab.path}
                              client={client}
                              status={status}
                              onBuild={
                                status === "ready" && planUi?.onBuild
                                  ? () => planUi.onBuild(rel)
                                  : undefined
                              }
                            />
                          </div>
                        );
                      }
                      const snap = subagentSnapshots[tab.parentThreadId]?.[tab.toolId] ?? null;
                      return (
                        <div
                          key={tab.id}
                          className={active ? "flex min-h-0 flex-1 flex-col" : "hidden"}
                          aria-hidden={!active}
                        >
                          <SubagentTabPane
                            snapshot={snap}
                            onOpenFile={askOpenFileInCode}
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div
                className={`relative z-20 hidden w-0 shrink-0 ${
                  chatOpen && previewOpen ? "md:block" : "md:hidden"
                }`}
                aria-hidden
              >
                <div
                  onMouseDown={() => {
                    dragging.current = true;
                    setResizing(true);
                    document.body.style.cursor = "col-resize";
                    document.body.style.userSelect = "none";
                  }}
                  className="group absolute inset-y-0 -start-1.5 w-3 cursor-col-resize"
                >
                  {/* Soft mid-edge grip — fades out toward the rounded corners. */}
                  <span
                    className={`pointer-events-none absolute top-3 bottom-3 left-1/2 w-px -translate-x-1/2 transition-opacity ${
                      resizing ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                    style={{
                      background:
                        "linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.45) 18%, rgba(255,255,255,0.45) 82%, transparent 100%)",
                    }}
                  />
                </div>
              </div>

              <div
                className={`min-w-0 ${
                  previewOpen ? "md:block md:flex-1" : "md:hidden"
                } ${
                  hasApp === false
                    ? "max-md:hidden"
                    : "max-md:relative max-md:h-full max-md:w-full max-md:shrink-0 max-md:snap-start max-md:snap-always"
                }`}
              >
                {!isDesktop && appBar}
                {view === "preview" ? (
                  <div className="ws-app-pane h-full min-h-0 overflow-hidden rounded-[16px] md:mx-ring-inside bg-[#1c1c1c] max-md:rounded-none">
                    <PreviewPane
                      annotate={
                        annotating
                          ? { client, path: previewPath, onClose: () => setAnnotating(false) }
                          : null
                      }
                      url={previewUrl}
                      nonce={previewNonce}
                      running={running}
                      startPending={startPending}
                      sandboxReady={sandboxReady}
                      blocked={sandboxBlock}
                      healthy={previewHealthy}
                      agentBusy={Boolean(busyThreadId)}
                      device={previewDevice}
                      navigatePath={previewNavigatePath}
                      onPathChange={(path) => {
                        setPreviewPath(path);
                        setPreviewPathDraft(path);
                        recordPreviewHistory(path);
                      }}
                      onExitMobile={() => setPreviewDevice("desktop")}
                      onOpenChat={() => setMobilePane("chat")}
                      onRecover={() => ensurePreview()}
                      onHealth={onPreviewHealth}
                      loadAppOutput={loadAppOutput}
                      failedStarts={failedStarts}
                    />
                  </div>
                ) : (
                  <div className="ws-code-pane h-full min-h-0">
                  <CodeView
                    client={client}
                    ready={sandboxReady}
                    openPath={codeOpenPath}
                    openLine={codeOpenLine}
                    onOpenPathConsumed={clearCodeOpenPath}
                    filesSyncToken={codeSyncToken}
                    changedPaths={codeChangedPaths}
                    canEditCode={
                      project.planLimits?.canEditCode ?? isPaidPlan(user?.plan)
                    }
                  />
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* While dragging the resizer, this overlay sits above the preview iframe
          so it can't swallow the mouse events (which would freeze the drag). */}
      {resizing && <div className="fixed inset-0 z-50 cursor-col-resize" />}

      {project && !isDesktop && (
        <ProjectMenuSheet
          paidByMe={project.paidByMe}
          open={titleMenuOpen}
          onClose={() => setTitleMenuOpen(false)}
          hasApp={hasApp !== false}
          view={view}
          isPublishing={isPublishing}
          openPreviewUrl={openPreviewUrl ?? null}
          onShare={() => {
            setShowPublish(false);
            setShowShare(true);
          }}
          onPublish={() => {
            setShowShare(false);
            setShowPublish(true);
          }}
          onNewChat={() => void newSession(undefined, { replace: true })}
          onHistory={() => setHistoryOpenRequest((n) => n + 1)}
          onToggleCode={() => {
            setMobilePane("app");
            setView((v) => (v === "code" ? "preview" : "code"));
          }}
          onRefresh={() => {
            setMobilePane("app");
            setView("preview");
            // Reload now, and make sure the sandbox and app are up in the same
            // breath: if they were gone, the page reports it and the preview
            // recovers through ensurePreview instead of staying blank.
            setPreviewNonce((n) => n + 1);
            void ensurePreview();
          }}
          onSettings={(tab) => {
            setSettingsTab(tab);
            setShowSettings(true);
          }}
        />
      )}

      {project && (
        <PublishPopover
          open={showPublish}
          projectId={project.id}
          projectName={project.name}
          onClose={() => setShowPublish(false)}
          anchorRef={publishBtnRef}
          paidByMe={project.paidByMe}
          ownerPlan={project.ownerPlan}
        />
      )}

      {/* Rendered while closed too: open is what Base UI animates, and
          unmounting here the moment it went false cut the exit off. */}
      {project && (
        <SharePreviewPopover
          open={showShare}
          projectId={project.id}
          onClose={() => setShowShare(false)}
          // Falls back to the ⋯ button on mobile, where Share lives in the menu
          // and has no rectangle of its own to point at.
          anchorRef={shareBtnRef.current ? shareBtnRef : publishBtnRef}
        />
      )}

      {showSettings && project && (
        <SettingsDialog
          projectId={project.id}
          projectName={project.name}
          hasDatabase={project.hasDatabase}
          hasLiveDatabase={Boolean(project.hasLiveDatabase)}
          hasStorage={Boolean(project.hasStorage)}
          planLimits={project.planLimits}
          initialTab={settingsTab}
          onClose={() => setShowSettings(false)}
          onRenamed={(name) => {
            setProject((p) => (p ? { ...p, name } : p));
          }}
          onDeleted={() => {
            navigate("/");
          }}
          onImported={(result) => {
            // Never bump bootNonce here — that clears open tabs / sandboxReady and
            // races the AI bootstrap, leaving an empty chat while agent+start run.
            if (result.started && result.previewUrl) {
              handleRunUpdate(result.previewUrl, Boolean(result.healthy), result.services);
            }
            onFilesChanged();
            reloadPreview();
          }}
        />
      )}
      {confirmOpenPath && (
        <ConfirmDialog
          title={fill(wp.openInCodeTitle, { name: confirmOpenPath.split("/").pop() ?? confirmOpenPath })}
          subtitle={wp.openInCodeSubtitle}
          confirmLabel={i18n.workspace.filePreview.openInCode}
          onClose={() => setConfirmOpenPath(null)}
          onConfirm={() => {
            const path = confirmOpenPath;
            setConfirmOpenPath(null);
            openFileInCode(path);
          }}
        />
      )}
    </div>
  );
}
