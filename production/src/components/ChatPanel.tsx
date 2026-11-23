import { isNative } from "../lib/native";
import { glideScrollTo } from "../lib/glide-scroll";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { isPaidPlan } from "../lib/plan-tiers";
import { useNavigate } from "react-router-dom";
import { ArrowDown, Gem } from "lucide-react";
import { canBuyPlans, canSell } from "../lib/native";
import { api, type ProjectDetail } from "../lib/api";
import { answerAgentQuestion, ackAgentSecrets, cancelAgent, orch, waitUntilAgentIdle, type OrchClient, type RunningService } from "../lib/orchestrator";
import { formatCredits, creditsFromMillicredits } from "../lib/tokens";
import { useAuth } from "../lib/auth";
import { useOnline } from "../lib/online";
import { useUpgrade } from "../lib/upgrade";
import { Dialog, useToast, Spinner } from "./ui";
import { MythexMark } from "./mythex-mark";
import { useTrialOfferNotice } from "./billing/ProTrialOfferBanner";
import { useNotifyNotice } from "./NotifyWhenDonePrompt";
import { type ShelfNotice } from "./chat/ComposerShelf";
import { PRICING, PRO_SALE_PERCENT, PRO_TRIAL_DAYS } from "./PricingPlans";
import { runPendingAttachmentSeed, peekPendingAttachments } from "../lib/pending-attachments";
import { isPreviewableImage } from "../lib/attachment-limits";
import { SecretsRequestCard } from "./SecretsRequestCard";
import { AppStoreConnectPanel, GooglePlayConnectPanel } from "./publish/MobileStoresSection";
import { parsePublishInvokePrompt, skillToPlatformChip, type PlatformToolChip, type SkillInvocation } from "./PlatformToolsMenu";
import { clearPlanContentCache, mergePlanTodosWithLive, planTitleFromPath } from "../lib/plan-file";
import { Sheet, useIsPhone } from "./ui/Sheet";
import { AGENT_BUSY_POLL_MS, AGENT_LOCK_WAIT_MS, AGENT_MODE_STORAGE_KEY, isComposerHelperError } from "./chat/agent";
import { COMPOSER_EDITOR_MAX_H, clearComposerEditor, composerPlainText, finalizeComposerSegments, hydrateComposerWithFiles, readPlatformToolFromEditor, revokeAttachmentPreview, setComposerText } from "./chat/composer-dom";
import { groupChatTurns, mergePlanUiStatuses, messagesUpToGitSha, persistedSubagentBlocks, planPathsFromMessages, planStatusesFromDisk, planStatusesFromHistory, publishVisibleText, readBuiltPlans, rememberBuiltPlans, samePlanStatuses, stripAttachmentAppendix } from "./chat/history";
import { followTailFromScroll, followTailFromWheel, pinScrollToTail, Reveal } from "./chat/motion";
import { AskQuestionsPanel, ComposerHelperBanner, FollowUpQueuePanel, SwitchToPlanModePanel } from "./chat/panels";
import { StarterIdeas } from "./chat/starters";
import { appT, fill, formatNumber, pl, useT } from "../i18n/app";
import { useCreditMeter } from "../lib/credit-meter";
import { StickyTodos } from "./chat/tool-cards";
import { EDIT_TOOLS, latestTodosFromAssistants, replyTextOf, subagentSnapshot } from "./chat/tool-model";
import { AssistantTurn, SubagentActivity } from "./chat/turn";
import { VirtualTurns } from "./chat/virtual-turns";
import { type AgentMode, type AgentTodo, type Attachment, type ComposerHelper, type DisplayMessage, type SubagentViewSnapshot } from "./chat/types";
import { UserPromptCard } from "./chat/user-message";
import { useChatHistory } from "./chat/history-hook";
import { useAgentStream } from "./chat/stream-hook";
import { COMPOSER_ATTACH_EVENT, type ComposerAttachDetail } from "../lib/preview-tools-client";
import { useStopTurn } from "./chat/stop-hook";
import { useSendTurn } from "./chat/send-hook";
import { useThreadSync } from "./chat/thread-sync-hook";
import { useComposerRender } from "./chat/composer-render";
import { useQueueActions } from "./chat/queue-actions-hook";
import { usePlanActions } from "./chat/plan-actions-hook";
import { useChatRefs } from "./chat/refs";
import { TranscriptSkeleton } from "./loading";
export type { SubagentViewSnapshot } from "./chat/types";
export { StreamingReply, Markdown, PlanTabPane, SubagentTabPane } from "./chat/turn";

/* ── Chat panel ───────────────────────────────────────────────────────────── */

export function ChatPanel({
  client,
  project,
  sandboxReady,
  sandboxBlock = null,
  acceptAgentPrompt = false,
  initialPrompt,
  initialSkills,
  threadId,
  onEnsureThread,
  onFilesChanged,
  onReloadPreview,
  onAppChanged,
  onAppPresence,
  onRunUpdate,
  onInitialSeedConsumed,
  onOpenFile,
  onOpenSubagentTab,
  openSubagentToolIds,
  onOpenPlanTab,
  onSubagentSnapshots,
  onPlanUiChange,
  onThreadTitleHint,
  onBusyChange,
}: {
  client: OrchClient;
  project: ProjectDetail;
  sandboxReady: boolean;
  /** Wake failed — stop waiting on an opening seed (402 credits, or other). */
  sandboxBlock?: "credits" | "failed" | null;
  /** When true, listen for window `mythex:agent-prompt` (Fix with AI from Publish). */
  acceptAgentPrompt?: boolean;
  initialPrompt?: string;
  /** Seeded hard skills (e.g. Ask AI to publish / Fix with AI). */
  initialSkills?: SkillInvocation[];
  threadId: string | undefined;
  /**
   * A draft chat (no `threadId`) gets its thread here, on its first send.
   * Resolves to the thread id, or null when it couldn't be created.
   */
  /** `beforeSwitch` runs with the thread id before this panel's `threadId` becomes it. */
  onEnsureThread?: (beforeSwitch: (threadId: string) => void) => Promise<string | null>;
  /** Optional paths that changed (agent Write/Edit). Empty/omitted = refresh all clean tabs. */
  onFilesChanged: (paths?: string[]) => void;
  /** Reload the preview pane once: the agent's ReloadPreview, or a restore. */
  onReloadPreview?: () => void;
  /** The agent has written or edited a file in this project. */
  onAppChanged?: () => void;
  /**
   * Whether this thread's history contains any file the agent wrote.
   *
   * `onAppChanged` only ever fires for live events, so after a reload nothing
   * knew whether the project had an app — which is how the preview came back
   * open on a project where all that had happened was a conversation. Reported
   * only once history has actually arrived, never during the load.
   */
  onAppPresence?: (threadId: string, hasApp: boolean) => void;
  onRunUpdate: (
    previewUrl: string | null,
    healthy: boolean,
    services?: RunningService[],
    opts?: { forceReload?: boolean },
  ) => void;
  /** Clear one-shot seed in the parent after the bootstrap send is claimed. */
  onInitialSeedConsumed?: () => void;
  /** `confirmed`: the click already chose Code (the file preview's button), so don't ask again. */
  onOpenFile?: (path: string, opts?: { confirmed?: boolean }) => void;
  /** Cursor-style: open subagent as a workspace tab instead of inline inspector. */
  onOpenSubagentTab?: (info: { toolId: string; title: string }) => void;
  /** Sub-agents of this chat open as workspace tabs — their transcripts are fetched if the list left them out. */
  openSubagentToolIds?: string[];
  /** Cursor-style: open plan as a workspace tab (View Plan). */
  onOpenPlanTab?: (info: { path: string; title: string }) => void;
  /** Lift Agent tool snapshots so subagent tabs stay live. */
  onSubagentSnapshots?: (threadId: string, snapshots: Record<string, SubagentViewSnapshot>) => void;
  /** Lift plan Build/Built state so plan tabs stay in sync. */
  onPlanUiChange?: (
    threadId: string,
    ui: {
      statusByPath: Record<string, "ready" | "building" | "built">;
      onBuild: (path: string) => void;
    },
  ) => void;
  /** Optimistic tab title as soon as the first prompt is sent. */
  onThreadTitleHint?: (threadId: string, title: string) => void;
  /** Drive tab busy dots from local stream state (no perpetual /agent/status poll). */
  onBusyChange?: (threadId: string, busy: boolean) => void;
}) {
  // Constant-initialized refs, made once (see chat/refs.ts).
  const refs = useChatRefs();
  const {
    askWaitAccumRef,
    askWaitStartedRef,
    autoOpenedOutOfCreditsRef,
    busyRef,
    chatScrollTop,
    contentFrozenRef,
    editEditorRef,
    editPickingFileRef,
    editSeedRef,
    editShellRef,
    editorRef,
    emptyStopSealedRef,
    expectRemoteLockRef,
    hasMoreOlderRef,
    loadingOlderRef,
    messagesRef,
    openingSeedAtRef,
    openingSeedMessagesRef,
    pinNewTurnToTop,
    pinnedToBottom,
    pinningChatScroll,
    scrollRef,
    sentEmptySnapshotsFor,
    sentInitial,
    snapshotFrame,
    startEditRef,
    touchChatYRef,
  } = refs;
  const [messages, setMessages] = useState<DisplayMessage[] | null>(null);

  /**
   * Workspace passes these as fresh arrows on every render. Handed straight on,
   * they broke the memo on every reply (the whole transcript re-rendered with
   * each Workspace render) and re-created `applyEvent` and the stream handlers
   * with them. One function each, for the life of the panel, calling whatever
   * the parent passed last — and still undefined where the parent passes none.
   */
  const parentFns = useRef({ onAppChanged, onOpenFile, onOpenSubagentTab, onOpenPlanTab });
  parentFns.current = { onAppChanged, onOpenFile, onOpenSubagentTab, onOpenPlanTab };
  const appChanged = useCallback(() => parentFns.current.onAppChanged?.(), []);
  const openFileStable = useCallback(
    (path: string, opts?: { confirmed?: boolean }) => parentFns.current.onOpenFile?.(path, opts),
    [],
  );
  const openSubagentTabStable = useCallback(
    (info: { toolId: string; title: string }) => parentFns.current.onOpenSubagentTab?.(info),
    [],
  );
  const openPlanTabStable = useCallback(
    (info: { path: string; title: string }) => parentFns.current.onOpenPlanTab?.(info),
    [],
  );
  const onOpenFileProp = onOpenFile ? openFileStable : undefined;
  const onOpenSubagentTabProp = onOpenSubagentTab ? openSubagentTabStable : undefined;
  const onOpenPlanTabProp = onOpenPlanTab ? openPlanTabStable : undefined;

  /**
   * Tell the workspace whether this project has an app, once history is in.
   *
   * `messages` is null until the first page lands, and that distinction is the
   * whole point: answering "no app" while it is still loading is what made the
   * preview pane open on reload for a project that had only ever been talked
   * to. Nothing is reported until there is something to report.
   */
  // The answer, not the transcript: reported when it changes rather than on
  // every streamed chunk (see samePlanStatuses for why that matters).
  const appPresent = useMemo(
    () =>
      messages === null
        ? null
        : messages.some((m) =>
            m.blocks.some((b) => b.kind === "tool" && EDIT_TOOLS.has(b.tool?.name ?? "")),
          ),
    [messages],
  );
  useEffect(() => {
    if (appPresent === null || !threadId) return;
    onAppPresence?.(threadId, appPresent);
  }, [appPresent, threadId, onAppPresence]);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  /**
   * How many messages older pages have added above the first one loaded. A
   * turn's key is its place less this, so it keeps its key — and VirtualTurns
   * its measured height — when a page arrives above it.
   */
  const [olderShift, setOlderShift] = useState(0);
  useEffect(() => setOlderShift(0), [threadId]);
  /**
   * Bumped when the chat on screen becomes another chat, which gives it a new
   * list of turns (VirtualTurns). Not when a new chat is given its id by its
   * first message: that is the same chat, its reply still arriving.
   */
  const turnListRef = useRef({ threadId, gen: 0 });
  if (turnListRef.current.threadId !== threadId) {
    if (turnListRef.current.threadId !== undefined) turnListRef.current.gen++;
    turnListRef.current.threadId = threadId;
  }
  const turnListGen = turnListRef.current.gen;
  const [loadingOlder, setLoadingOlder] = useState(false);
  /**
   * The thread this panel is on right now.
   *
   * `send` is called from closures that outlive the render they came from — the
   * queue drains from the end of the turn that was running, using that turn's
   * own `send`. For a new chat that closure was made before the chat had a
   * thread, so a queued follow-up read "no thread" and asked for one again: it
   * went into a second thread, off screen, and was missing after a reload.
   */
  const threadIdRef = useRef<string | undefined>(threadId);
  threadIdRef.current = threadId ?? threadIdRef.current;
  const [input, setInput] = useState("");
  /** Soft status/error above the composer (retryable connection failures, etc.). */
  const [composerHelper, setComposerHelper] = useState<ComposerHelper | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!threadId || !onBusyChange) return;
    onBusyChange(threadId, busy);
    return () => onBusyChange(threadId, false);
  }, [busy, threadId, onBusyChange]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  /** Clicked USER message index — in-place editor (main bottom input stays). */
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editInput, setEditInput] = useState("");
  const [editAttachments, setEditAttachments] = useState<Attachment[]>([]);
  const [editDragOver, setEditDragOver] = useState(false);
  // Pending edit submission awaiting the "discard later messages?" confirm.
  const [pendingEditSend, setPendingEditSend] = useState<{ raw?: string } | null>(null);
  const [pendingRestoreSha, setPendingRestoreSha] = useState<string | null>(null);
  // True from the moment Stop is clicked until the click gesture finishes —
  // keeps the Stop button mounted so mouseup doesn't land on Send.
  const [stopping, setStopping] = useState(false);
  const [agentMode, setAgentMode] = useState<AgentMode>(
    () => (localStorage.getItem(AGENT_MODE_STORAGE_KEY) as AgentMode | null) || "agent",
  );
  const [followUpQueue, setFollowUpQueue] = useState<
    Array<{ id: string; text: string; skills?: SkillInvocation[]; attachments?: Attachment[]; }>
  >([]);
  const [platformChip, setPlatformChip] = useState<PlatformToolChip | null>(null);
  /** Inline platform tool in the in-place edit composer (chip-only won't change editInput). */
  const [editPlatformChip, setEditPlatformChip] = useState<PlatformToolChip | null>(null);
  /** Cursor-style `/` menu while typing in the main composer. */
  const [slashMenu, setSlashMenu] = useState<{ query: string; active: number } | null>(null);
  /** Composer is editing a queued follow-up (Cursor: "Editing queued message"). */
  const [editingQueued, setEditingQueued] = useState<{
    id: string;
    originalText: string;
    index: number;
  } | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<{
    toolCallId: string;
    questions: Array<{ id: string; prompt: string; options: Array<{ id: string; label: string }> }>;
  } | null>(null);
  /** Agent SwitchMode → Plan countdown card (Build mode only). */
  const [pendingModeSwitch, setPendingModeSwitch] = useState<{
    toolCallId: string;
    target: "plan";
    reason?: string;
    prompt: string;
  } | null>(null);
  /** Timer auto-Switch must not see a stale null from an old callback identity. */
  const pendingModeSwitchRef = useRef(pendingModeSwitch);
  pendingModeSwitchRef.current = pendingModeSwitch;
  const [pendingSecrets, setPendingSecrets] = useState<{
    requestId: string;
    keys: string[];
    reason?: string;
    /** app_store / google_play: that store's account panel instead of env values. */
    kind?: "app_store" | "google_play";
  } | null>(null);
  const [secretsSaving, setSecretsSaving] = useState(false);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const [questionCustom, setQuestionCustom] = useState<Record<string, string>>({});
  const [planPendingApprove, setPlanPendingApprove] = useState<{
    path: string;
    title: string;
    overview: string;
    status: "ready" | "building" | "built";
  } | null>(null);
  /** Per-plan card status so Build on plan A doesn't light up plan B. */
  const [planStatusByPath, setPlanStatusByPath] = useState<
    Record<string, "ready" | "building" | "built">
  >({});
  const planStatusRef = useRef(planStatusByPath);
  planStatusRef.current = planStatusByPath;
  useEffect(() => {
    if (!planPendingApprove) return;
    const path = planPendingApprove.path.replace(/^\/home\/user\/app\//, "");
    const status = planPendingApprove.status;
    setPlanStatusByPath((prev) => {
      const next = { ...prev };
      if (status === "building") {
        for (const [k, v] of Object.entries(next)) {
          if (v === "building" && k !== path) next[k] = "ready";
        }
      }
      next[path] = status;
      return samePlanStatuses(prev, next) ? prev : next;
    });
  }, [planPendingApprove]);

  // ready/building from transcript. Built is set from disk only on restore /
  // CreatePlan·UpdatePlan·turn-end — never on every SSE messages tick (that
  // flooded GET /file while the agent was working).
  useEffect(() => {
    if (!messages?.length) return;
    const fromHistory = planStatusesFromHistory(messages);
    if (Object.keys(fromHistory).length === 0) return;
    // What the disk said last time, until it says it again (see readBuiltPlans).
    // Only over "ready": a turn building it right now is still building.
    const built = readBuiltPlans(project.id);
    for (const [path, status] of Object.entries(fromHistory)) {
      if (status === "ready" && built.has(path) && !diskSyncedRef.current) {
        fromHistory[path] = "built";
        builtFromCacheRef.current.add(path);
      }
    }
    // Not even a same-value set: from an effect it still counts toward React's
    // nested-update limit, and this runs on every streamed chunk.
    const current = planStatusRef.current;
    if (samePlanStatuses(current, mergePlanUiStatuses(fromHistory, current))) return;
    setPlanStatusByPath((prev) => {
      const next = mergePlanUiStatuses(fromHistory, prev);
      return samePlanStatuses(prev, next) ? prev : next;
    });
  }, [messages]);

  /** Paths whose Built came from readBuiltPlans, not from this session. */
  const builtFromCacheRef = useRef(new Set<string>());
  /** The disk has been read this session; the remembered answer is spent. */
  const diskSyncedRef = useRef(false);
  // A plan turning Built during this session is remembered as it happens.
  // Nothing is forgotten from here: before the disk has been read, a status
  // that is not Built only means it is not known yet.
  useEffect(() => {
    rememberBuiltPlans(project.id, planStatusByPath, false);
  }, [project.id, planStatusByPath]);

  // One disk sync when the sandbox becomes ready (refresh / first load).
  useEffect(() => {
    if (!sandboxReady || !messages?.length || busy) return;
    const paths = planPathsFromMessages(messages);
    if (!paths.length) return;
    let cancelled = false;
    void planStatusesFromDisk(client, paths).then((disk) => {
      if (cancelled) return;
      diskSyncedRef.current = true;
      rememberBuiltPlans(project.id, disk, true);
      setPlanStatusByPath((prev) => {
        const next = { ...disk };
        for (const [k, v] of Object.entries(prev)) {
          // Keep live Building / Built — disk can lag behind UpdatePlan JSON
          // (refresh resume finishes before the file mock/git catches up).
          // Not a Built that only came from this device's memory of the last
          // disk read: the disk is what that was standing in for.
          if (v === "building" || (v === "built" && !builtFromCacheRef.current.has(k))) next[k] = v;
        }
        builtFromCacheRef.current.clear();
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // Intentionally not depending on `messages` — live turns update status via tools/done.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandboxReady, client, busy]);

  const [inspectSubagentId, setInspectSubagentId] = useState<string | null>(null);
  const isPhone = useIsPhone();
  const [sheetSubagentId, setSheetSubagentId] = useState<string | null>(null);
  // Rebuilt from messages each render so the sheet streams like the tab does.
  const sheetSubagent = useMemo(() => {
    if (!sheetSubagentId) return null;
    for (const m of messages ?? []) {
      const b = m.blocks.find((x) => x.kind === "tool" && x.tool?.id === sheetSubagentId);
      if (b?.tool) return subagentSnapshot({ ...b.tool, id: sheetSubagentId }, !!m.streaming);
    }
    return null;
  }, [messages, sheetSubagentId]);
  /**
   * One subscription for the whole panel.
   *
   * A turn cannot make progress with no network, and the resume loop behind it
   * is silent, so every wait looked the same as a slow model. Passed down to
   * each reply rather than subscribed per reply — see AssistantTurn's `online`.
   */
  const online = useOnline();
  useEffect(() => {
    localStorage.setItem(AGENT_MODE_STORAGE_KEY, agentMode);
  }, [agentMode]);

  // Lift Agent-tool snapshots so Workspace can render live subagent tabs.
  // Keep the callback in a ref so an unstable parent identity can't loop.
  const onSubagentSnapshotsRef = useRef(onSubagentSnapshots);
  onSubagentSnapshotsRef.current = onSubagentSnapshots;
  const snapshotThreadRef = useRef(threadId);
  snapshotThreadRef.current = threadId;
  useEffect(() => {
    if (!threadId || !onSubagentSnapshotsRef.current || snapshotFrame.current != null) return;
    snapshotFrame.current = requestAnimationFrame(() => {
      snapshotFrame.current = null;
      const tid = snapshotThreadRef.current;
      if (!tid || !onSubagentSnapshotsRef.current) return;
      const next: Record<string, SubagentViewSnapshot> = {};
      for (const m of messagesRef.current ?? []) {
        for (const b of m.blocks) {
          if (b.kind !== "tool" || b.tool?.name !== "Agent" || !b.tool.id) continue;
          next[b.tool.id] = subagentSnapshot({ ...b.tool, id: b.tool.id }, !!m.streaming);
        }
      }
      const empty = Object.keys(next).length === 0;
      if (empty && sentEmptySnapshotsFor.current === tid) return;
      sentEmptySnapshotsFor.current = empty ? tid : null;
      onSubagentSnapshotsRef.current(tid, next);
    });
  }, [messages, threadId]);
  useEffect(
    () => () => {
      if (snapshotFrame.current != null) cancelAnimationFrame(snapshotFrame.current);
    },
    [],
  );

  const { refresh, user, loading: authLoading } = useAuth();
  const t = useT();
  const openUpgrade = useUpgrade();
  const navigate = useNavigate();
  const openBilling = (highlight?: "plans" | "credits") => {
    openUpgrade(highlight ?? "plans");
  };
  const balanceCredits =
    user?.balanceCredits ??
    (typeof user?.balanceTokens === "number" ? creditsFromMillicredits(user.balanceTokens) : 0);
  const outOfCredits = balanceCredits <= 0;
  // On Free, being out usually means today's daily credits are spent (they
  // come back at midnight) or the month's cap is reached — not "no credits":
  // published apps keep running on their own Cloud credits.
  const { daily } = useCreditMeter(user);
  const freeOutTitle =
    !isPaidPlan(user?.plan) && daily && daily.allowance > 0
      ? daily.monthlyCap != null && daily.grantedThisMonth >= daily.monthlyCap - 0.001
        ? fill(t.chat.credits.monthUsed, { cap: formatNumber(daily.monthlyCap) })
        : t.shell.upgrade.todayUsed
      : null;
  const lowCredits = !outOfCredits && balanceCredits < 5;
  // Dismiss hides until refresh (or until balance recovers / hits empty after a "low" dismiss).
  const creditNudgeKind = outOfCredits ? "out" : lowCredits ? "low" : null;
  const [creditNudgeDismissed, setCreditNudgeDismissed] = useState<string | null>(null);
  useEffect(() => {
    if (balanceCredits >= 5) {
      setCreditNudgeDismissed(null);
    }
  }, [balanceCredits]);
  // In a teammate's workspace their credits pay, not yours: your own balance
  // and plan say nothing here, and there's nothing for you to buy. The server
  // explains its own limits (your monthly limit, the workspace running out).
  const teammatePays = project.paidByMe === false;
  const showCreditNudge =
    !teammatePays && creditNudgeKind != null && creditNudgeDismissed !== creditNudgeKind;
  // The composer's shelf says one thing at a time (ComposerShelf), in this
  // order: a problem with credits, then the trial, then notifications. Out of
  // credits and the trial offer used to show together, offering the trial twice.
  const trialNotice = useTrialOfferNotice();
  const notifyNotice = useNotifyNotice(busy);
  const dismissCreditNudge = () => {
    if (!creditNudgeKind) return;
    setCreditNudgeDismissed(creditNudgeKind);
  };
  const creditNotice: ShelfNotice | null = showCreditNudge
    ? {
        key: `credits-${creditNudgeKind}`,
        testId: "credit-nudge",
        icon: <Gem className="size-4 fill-current text-amber-300" />,
        title: outOfCredits
          ? (freeOutTitle ?? t.chat.credits.out)
          : pl(t.chat.credits.left, balanceCredits, { credits: formatCredits(balanceCredits) }),
        // `canSell` throughout: in the app nothing is sold, so the balance is
        // said and the offers are not (guideline 3.1.1).
        detail:
          outOfCredits && canSell() && !isPaidPlan(user?.plan) ? (
            <span
              className="ms-2 inline-flex items-center rounded-full px-1.5 py-0.5 align-[1px] text-[12px] font-medium"
              style={{ background: PRICING.successBg, color: PRICING.successFg }}
            >
              {fill(t.chat.credits.percentOff, { percent: PRO_SALE_PERCENT })}
            </span>
          ) : undefined,
        secondary:
          canBuyPlans() && isPaidPlan(user?.plan)
            ? { label: t.chat.credits.seePlans, onClick: () => navigate("/billing?highlight=plans") }
            : undefined,
        action: canBuyPlans()
          ? {
              // Shorter than PRO_TRIAL_CTA ("Start 3-day free trial"): in a
              // narrow chat column that label pushed "You're out of credits"
              // itself into an ellipsis, and the title is the point.
              label: isPaidPlan(user?.plan)
                ? t.chat.credits.buyCredits
                : !canSell()
                  ? t.chat.credits.seePlans
                  : PRO_TRIAL_DAYS > 0
                  ? t.chat.credits.startTrial
                  : t.billing.plans.claimOffer,
              onClick: () => openBilling(isPaidPlan(user?.plan) ? "credits" : outOfCredits ? "credits" : "plans"),
            }
          : undefined,
        onDismiss: dismissCreditNudge,
      }
    : null;
  // Stacked on the shelf in this order. Only the trial is held back, and only
  // when the credit notice's own button is already the trial (a Free account
  // short of credits) — the one pairing that said the same thing twice.
  const creditOffersTrial = Boolean(creditNotice && !isPaidPlan(user?.plan) && canSell());
  const composerNotices = [creditNotice, creditOffersTrial || teammatePays ? null : trialNotice, notifyNotice].filter(
    (n): n is ShelfNotice => n != null,
  );
  useEffect(() => {
    if (authLoading || !user) return;
    if (isPaidPlan(user.plan)) return;
    if (!outOfCredits) {
      autoOpenedOutOfCreditsRef.current = false;
      return;
    }
    if (autoOpenedOutOfCreditsRef.current) return;
    autoOpenedOutOfCreditsRef.current = true;
    openUpgrade("credits");
  }, [authLoading, user, outOfCredits, openUpgrade]);
  const toast = useToast();
  /**
   * The opening seed as painted, kept on screen after the seed is handed to
   * send(). A new chat asks the API for its thread before the turn paints, and
   * without this the chat sat empty for that request.
   */
  const [heldOpeningSeed, setHeldOpeningSeed] = useState<DisplayMessage[] | null>(null);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  const agentModeRef = useRef(agentMode);
  useEffect(() => {
    agentModeRef.current = agentMode;
  }, [agentMode]);
  const planPendingRef = useRef(planPendingApprove);
  useEffect(() => {
    planPendingRef.current = planPendingApprove;
  }, [planPendingApprove]);

  // Pause the "Worked for" clock while Ask / SwitchMode cards are open.
  useEffect(() => {
    if (pendingQuestion || pendingModeSwitch) {
      if (askWaitStartedRef.current == null) askWaitStartedRef.current = Date.now();
      return;
    }
    if (askWaitStartedRef.current != null) {
      askWaitAccumRef.current += Date.now() - askWaitStartedRef.current;
      askWaitStartedRef.current = null;
    }
  }, [pendingQuestion, pendingModeSwitch]);

  const activeWorkedMs = (started?: number | null, fallbackStartedAtMs?: number) => {
    const base = started ?? fallbackStartedAtMs;
    if (base == null) return undefined;
    let wait = askWaitAccumRef.current;
    if (askWaitStartedRef.current != null) wait += Date.now() - askWaitStartedRef.current;
    return Math.max(0, Date.now() - base - wait);
  };

  const resizeEditor = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    // Grow with content up to COMPOSER_EDITOR_MAX_H, then scroll — and glide
    // to the new height rather than jump to it, a new line or a deleted one.
    //
    // Measuring needs `height: auto`, which on its own would be the frame the
    // transition starts from. So measure with the transition off, put the old
    // height back and let the browser settle on it, then set the new height
    // with the transition on: it animates from where the box actually was.
    const from = el.getBoundingClientRect().height;
    el.style.transition = "none";
    el.style.height = "auto";
    el.style.overflowY = "hidden";
    const contentH = el.scrollHeight;
    const maxH = COMPOSER_EDITOR_MAX_H;
    const next = Math.min(Math.max(contentH, 22), maxH);
    const capped = contentH > maxH;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (from > 0 && Math.abs(from - next) > 1 && !reduced) {
      el.style.height = `${from}px`;
      void el.offsetHeight;
      el.style.transition = "height 160ms cubic-bezier(0.215, 0.61, 0.355, 1)";
    }
    el.style.height = `${next}px`;
    el.style.overflowY = capped ? "auto" : "hidden";
    if (capped) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    // Growing, the new line is below the box until the box reaches it, and
    // the browser scrolls the text up to show the caret — every line jumped a
    // line up and slid back down as the box grew. Hold the text still for the
    // length of the glide; the box brings the new line into view.
    el.scrollTop = 0;
    const until = performance.now() + 200;
    const hold = () => {
      if (el.scrollTop !== 0) el.scrollTop = 0;
      if (performance.now() < until) requestAnimationFrame(hold);
    };
    requestAnimationFrame(hold);
  }, []);

  useEffect(() => {
    resizeEditor(editorRef.current);
  }, [input, attachments, resizeEditor]);

  useEffect(() => {
    resizeEditor(editEditorRef.current);
  }, [editInput, editAttachments, resizeEditor]);

  // Inline chip × — remove from DOM + attachment / platform-tool state.
  // A click on the rest of a file chip opens the file, as a sent chip does —
  // inside the editor it only moved the caret.
  const composerFilesRef = useRef<Attachment[]>([]);
  composerFilesRef.current = [...attachments, ...editAttachments];
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest?.("[data-chip-remove]");
      if (!btn) {
        const chip = target?.closest?.<HTMLElement>("[data-file-chip]");
        if (!chip) return;
        if (!editorRef.current?.contains(chip) && !editEditorRef.current?.contains(chip)) return;
        const att = composerFilesRef.current.find((a) => a.id === chip.dataset.fileChip);
        if (!att?.path || att.status !== "ready") return;
        e.preventDefault();
        e.stopPropagation();
        openFileStable(att.path);
        return;
      }
      const fileChip = btn.closest<HTMLElement>("[data-file-chip]");
      const toolChip = btn.closest<HTMLElement>("[data-platform-tool]");
      const chip = fileChip ?? toolChip;
      if (!chip) return;
      const inMain = editorRef.current?.contains(chip);
      const inEdit = editEditorRef.current?.contains(chip);
      if (!inMain && !inEdit) return;
      e.preventDefault();
      e.stopPropagation();
      chip.remove();
      if (toolChip) {
        if (inEdit) {
          setEditPlatformChip(null);
          if (editEditorRef.current) setEditInput(composerPlainText(editEditorRef.current));
          resizeEditor(editEditorRef.current);
        } else {
          setPlatformChip(null);
          if (editorRef.current) setInput(composerPlainText(editorRef.current));
          resizeEditor(editorRef.current);
        }
        return;
      }
      const id = fileChip?.dataset.fileChip;
      if (!id) return;
      if (inEdit) {
        setEditAttachments((all) => all.filter((a) => a.id !== id));
        if (editEditorRef.current) setEditInput(composerPlainText(editEditorRef.current));
        resizeEditor(editEditorRef.current);
      } else {
        setAttachments((all) => all.filter((a) => a.id !== id));
        if (editorRef.current) setInput(composerPlainText(editorRef.current));
        resizeEditor(editorRef.current);
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [resizeEditor, openFileStable]);

  // Insert a starter prompt into the bottom input (editable) and focus it.
  const useSuggestion = (text: string) => {
    const el = editorRef.current;
    if (el) {
      setComposerText(el, text);
      setInput(text);
      requestAnimationFrame(() => {
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        resizeEditor(el);
      });
    } else {
      setInput(text);
    }
  };

  const clearEditComposer = useCallback(() => {
    setEditingIndex(null);
    setEditInput("");
    setEditPlatformChip(null);
    setSlashMenu(null);
    if (editEditorRef.current) clearComposerEditor(editEditorRef.current);
    setEditAttachments((prev) => {
      for (const a of prev) {
        const kept =
          a.previewUrl &&
          (messages ?? []).some((m) => m.attachments?.some((x) => x.previewUrl === a.previewUrl));
        if (a.previewUrl && !kept) revokeAttachmentPreview(a.previewUrl);
      }
      return [];
    });
  }, [messages]);

  // Click / focus outside the in-place editor → restore the message card.
  useEffect(() => {
    if (editingIndex == null) return;
    const onPointerDown = (e: PointerEvent) => {
      if (editPickingFileRef.current) return;
      const root = editShellRef.current;
      if (!root) return;
      if (root.contains(e.target as Node)) return;
      const target = e.target as Element | null;
      // Dialogs (e.g. the discard-later-messages confirm) render via a portal
      // to document.body, outside the editor's DOM — without this check,
      // pointerdown on "Discard & resend" would clear the edit state (wiping
      // the prompt + editingIndex) a beat before its own onClick runs `send()`.
      if (target?.closest?.('[role="dialog"]')) return;
      // Build / Plan / Ask (+ Standard/Pro) menu is also portaled to body.
      if (target?.closest?.('[data-testid="build-mode-menu"]')) return;
      clearEditComposer();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [editingIndex, clearEditComposer]);

  // Wait for the in-flight turn to genuinely finish server-side (busy flips
  // false once the live stream reaches its terminal event — see `stop()`),
  // instead of optimistically assuming a cancel request took effect. Bounded
  // so a stuck sandbox can't hang the UI forever.
  const waitUntilIdle = useCallback(async (timeoutMs = AGENT_LOCK_WAIT_MS): Promise<boolean> => {
    if (!busyRef.current) return true;
    const deadline = Date.now() + timeoutMs;
    while (busyRef.current) {
      if (Date.now() > deadline) return false;
      await new Promise((r) => setTimeout(r, AGENT_BUSY_POLL_MS));
    }
    return true;
  }, []);

  /** Remote project lock cleared after cancel (local busy can flip sooner). */
  const waitForAgentInactive = useCallback(async (timeoutMs = AGENT_LOCK_WAIT_MS, signal?: AbortSignal): Promise<boolean> => {
    if (signal?.aborted || contentFrozenRef.current) return false;
    // Nudge only — must not plant Redis stop intent or the *next* POST /agent
    // empty-stops itself (looks like Stop failed / turn "continues" on retry).
    void cancelAgent(client, { intent: false });
    try {
      const cleared = await waitUntilAgentIdle(client, timeoutMs, signal);
      if (cleared) expectRemoteLockRef.current = false;
      return cleared;
    } catch {
      return false;
    }
  }, [client]);

  useEffect(() => {
    hasMoreOlderRef.current = hasMoreOlder;
  }, [hasMoreOlder]);
  useEffect(() => {
    loadingOlderRef.current = loadingOlder;
  }, [loadingOlder]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // After empty-Stop, keep the contenteditable aligned with restored `input`
  // (React re-renders can leave the DOM empty while state has the prompt).
  useLayoutEffect(() => {
    if (!emptyStopSealedRef.current || busy) return;
    const el = editorRef.current;
    if (!el || !input.trim()) return;
    if (composerPlainText(el) === input) return;
    hydrateComposerWithFiles(
      el,
      input,
      attachments.filter((a) => !a.isImage),
      undefined,
      platformChip ?? undefined,
    );
    resizeEditor(el);
  }, [input, busy, attachments, platformChip, resizeEditor]);
  const { loadOlderMessages, reconcileHistory } = useChatHistory({
    refs,
    planPendingRef,
    project,
    setHasMoreOlder,
    setLoadingOlder,
    setMessages,
    setOlderShift,
    threadId,
  });
  const startEditStable = useCallback((index: number) => startEditRef.current(index), []);
  const startEdit = (index: number) => {
    if (!messages) return;
    const msg = messages[index];
    if (!msg || msg.role !== "USER") return;
    // Never cancel on click — users can open/edit the bubble while a turn runs.
    // Interrupt + rewind only happens when they actually resend (see send()).

    const rawText = msg.blocks.find((b) => b.kind === "text")?.text ?? "";
    const pub = parsePublishInvokePrompt(rawText);
    const platformTool: PlatformToolChip | undefined =
      msg.platformTool ?? (pub ? { tool: "publish", slug: pub.slug } : undefined);
    const text = publishVisibleText(stripAttachmentAppendix(rawText));
    const atts: Attachment[] = (msg.attachments ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      path: a.path,
      isImage: a.isImage,
      previewUrl: a.previewUrl,
      status: "ready" as const,
    }));

    setEditAttachments((prev) => {
      for (const a of prev) {
        if (a.previewUrl && !atts.some((x) => x.previewUrl === a.previewUrl)) {
          revokeAttachmentPreview(a.previewUrl);
        }
      }
      return atts;
    });
    editSeedRef.current = {
      text,
      files: atts.filter((a) => !a.isImage),
      segments: msg.segments,
      platformTool,
    };
    // Publish chip — hydrate inline; plain input is rest text only (not the encode line).
    setEditPlatformChip(platformTool ?? null);
    setEditInput(pub ? pub.rest : text);
    // Editing a message is reading back, not following the reply: still
    // following, the keyboard's resize pinned the chat to its end and the
    // edit's scroll-into-view then glided it back up (1128 → 619, logged on an
    // iPhone the second time a message was edited).
    pinnedToBottom.current = false;
    setEditingIndex(index);
  };
  startEditRef.current = startEdit;

  useEffect(() => {
    if (editingIndex == null || editSeedRef.current == null) return;
    const seed = editSeedRef.current;
    editSeedRef.current = null;
    const el = editEditorRef.current;
    if (!el) return;
    hydrateComposerWithFiles(el, seed.text, seed.files, seed.segments, seed.platformTool);
    setEditPlatformChip(readPlatformToolFromEditor(el) ?? seed.platformTool ?? null);
    setEditInput(composerPlainText(el));
    // focus() scrolled just the text line into view, leaving the message's
    // pictures above it cut off at the top of the chat. Show the whole box.
    el.focus({ preventScroll: true });
    resizeEditor(el);
    const shell = editShellRef.current;
    const sc = scrollRef.current;
    if (shell && sc) {
      const box = shell.getBoundingClientRect();
      const view = sc.getBoundingClientRect();
      const above = box.top - view.top - 8;
      const below = box.bottom - view.bottom + 8;
      if (above < 0) sc.scrollTop += above;
      else if (below > 0) sc.scrollTop += Math.min(below, above);
    }
  }, [editingIndex, resizeEditor]);
  const { applyEvent, finalizePlanTurn, mutateLast, reconcileHistoryRef, reconnectRef, tailForRunUpdate } = useAgentStream({
    refs,
    activeWorkedMs,
    agentModeRef,
    appChanged,
    client,
    onFilesChanged,
    onReloadPreview,
    onRunUpdate,
    pendingQuestion,
    planPendingRef,
    project,
    reconcileHistory,
    refresh,
    sandboxReady,
    setBusy,
    setComposerHelper,
    setFollowUpQueue,
    setMessages,
    setPendingModeSwitch,
    setPendingQuestion,
    setPendingSecrets,
    setPlanPendingApprove,
    setPlanStatusByPath,
    setQuestionAnswers,
    setQuestionCustom,
    threadId,
    toast,
  });
  useThreadSync({
    refs,
    busy,
    composerHelper,
    messages,
    project,
    reconcileHistoryRef,
    reconnectRef,
    sandboxReady,
    setComposerHelper,
    setHasMoreOlder,
    setMessages,
    setPlanPendingApprove,
    setPlanStatusByPath,
    threadId,
  });

  /**
   * A sent prompt goes to the top of the chat, as ChatGPT's and Lovable's do:
   * the newest turn holds a screen's height (`--turn-fill`, on the turn in the
   * render below, so even "hi" can reach the top), the view glides it up, and
   * the reply fills in below — nothing chases the bottom.
   */
  useLayoutEffect(() => {
    if (!pinNewTurnToTop.current) return;
    const box = scrollRef.current;
    if (!box) return;
    const turns = box.querySelectorAll<HTMLElement>("[data-chat-turn]");
    const last = turns[turns.length - 1];
    if (!last) return;
    pinNewTurnToTop.current = false;
    pinnedToBottom.current = false;
    const padTop = parseFloat(getComputedStyle(box).paddingTop) || 0;
    const top =
      last.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - padTop;
    glideScrollTo(box, Math.max(0, top));
    // Where the glide is going, for the keyboard to pick it up again: closing
    // it as the message is sent sets the scroll, which ends a smooth scroll
    // where it is — the prompt stopped halfway up (lib/native-keyboard.ts).
    box.dataset.glideTo = String(Math.max(0, top));
    window.setTimeout(() => delete box.dataset.glideTo, 900);
  }, [messages]);

  // Follow the live turn only while the user is at the tail. Wheel/touch up
  // unpins immediately so streaming tokens can't yank them back down.
  useEffect(() => {
    pinScrollToTail(scrollRef.current, pinnedToBottom, pinningChatScroll);
  }, [messages, initialPrompt]);

  /**
   * The ↓ above the composer: shown once the newest message is out of reach —
   * scrolled up from it, or a reply growing below the screen — and it takes
   * the reader back down, as ChatGPT's and Claude's do.
   */
  const [showJump, setShowJump] = useState(false);
  // Not while a message is being edited: brought up above the composer, the
  // edit box sat where the ↓ does, under it.
  const jumpShown = showJump && editingIndex == null;
  /** When the reader last tapped a button in the chat, and the content height then. */
  const tappedAt = useRef(-Infinity);
  const lastContentHeight = useRef(0);
  const updateJump = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // From the first bit scrolled up, the same 48px the keyboard counts as the
    // end (native-keyboard NEAR_END): at 200px, a chat scrolled up a little
    // showed no ↓ yet wasn't at its end either.
    setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 48);
  }, [scrollRef]);
  useEffect(() => {
    updateJump();
  }, [messages, updateJump]);
  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedToBottom.current = true;
    // In the app, straight to the end: on a phone the glide was still iOS's
    // when the keyboard opened, and the keyboard's scroll correction landed a
    // screen up from the end, with the ↓ back (reported on an iPhone; never
    // in the simulator).
    if (isNative()) {
      el.scrollTop = el.scrollHeight;
      updateJump();
      return;
    }
    // Held while it glides, so the glide is not read as the reader scrolling.
    pinningChatScroll.current = true;
    // Straight there, not back down through everything scrolled past: at
    // once to a screen above the end, then a short glide for the last screen,
    // so it reads as arriving rather than as a cut.
    if (el.scrollHeight - el.scrollTop - el.clientHeight > el.clientHeight) {
      el.scrollTop = el.scrollHeight - el.clientHeight * 2;
    }
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    window.setTimeout(() => {
      // The end may have moved while it glided (turns measured on the way).
      el.scrollTop = el.scrollHeight;
      pinningChatScroll.current = false;
      updateJump();
    }, 450);
  }, [scrollRef, pinnedToBottom, pinningChatScroll, updateJump]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    followTailFromScroll(el, pinnedToBottom, pinningChatScroll, chatScrollTop, 48);
    updateJump();
    if (el.scrollTop < 80) void loadOlderMessages();
    // The top edge fades only once something has scrolled under it — at the
    // top, the first message would be dimmed for nothing (see .ws-transcript).
    el.toggleAttribute("data-scrolled", el.scrollTop > 0);
  };

  // Before `send`, which freezes the turn through it.
  const { freezeTurnLocally, stop } = useStopTurn({
    refs,
    activeWorkedMs,
    busy,
    client,
    onFilesChanged,
    onReloadPreview,
    planPendingRef,
    project,
    resizeEditor,
    setAttachments,
    setBusy,
    setComposerHelper,
    setFollowUpQueue,
    setInput,
    setMessages,
    setPendingModeSwitch,
    setPendingQuestion,
    setPendingSecrets,
    setPlanPendingApprove,
    setPlanStatusByPath,
    setPlatformChip,
    setStopping,
    threadId,
    toast,
  });

  // The transcript's scrollbar width, 0 when it overlays the content. A classic
  // one only appears once the chat overflows, so this follows the content.
  // Read by .ws-chat-gutter to keep the text's right edge on the composer's.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      el.style.setProperty("--sbw", `${el.offsetWidth - el.clientWidth}px`);
      // A screen of chat, less the transcript's own padding: the height the
      // newest turn holds so its prompt can sit at the top.
      const cs = getComputedStyle(el);
      const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      el.style.setProperty(
        "--turn-fill",
        `${Math.max(0, el.clientHeight - pad)}px`,
      );
      // Content that grew because the reader opened something — a "Worked
      // for" fold, a thought, a tool card — is theirs to read, not a reply to
      // follow: following the tail scrolled them to the new bottom, past what
      // they had just opened (a 9-minute turn's fold, thousands of pixels).
      // Growth right after a tap in the chat stops the following; a reply
      // streaming in with no tap still follows.
      if (el.scrollHeight > lastContentHeight.current && performance.now() - tappedAt.current < 800) {
        pinnedToBottom.current = false;
      }
      lastContentHeight.current = el.scrollHeight;
      // Opening a chat pins to the tail before this height exists; with it the
      // tail moves, so land on it again (only while still following the tail).
      pinScrollToTail(el, pinnedToBottom, pinningChatScroll);
      // The ↓ follows the content too, not only scrolling: collapsing a
      // "Worked for" fold shrank the chat until it all fit, no scroll event
      // came, and the ↓ stayed up with nothing below to go to.
      updateJump();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [updateJump]);
  const { addFiles, removeAttachment, send } = useSendTurn({
    refs,
    activeWorkedMs,
    agentModeRef,
    applyEvent,
    attachments,
    busy,
    clearEditComposer,
    client,
    editAttachments,
    editInput,
    editPlatformChip,
    editingIndex,
    editingQueued,
    finalizePlanTurn,
    followUpQueue,
    freezeTurnLocally,
    input,
    messages,
    mutateLast,
    onEnsureThread,
    onFilesChanged,
    onReloadPreview,
    onThreadTitleHint,
    openUpgrade,
    outOfCredits,
    pendingModeSwitch,
    pendingQuestion,
    pendingSecrets,
    planPendingRef,
    platformChip,
    project,
    reconcileHistory,
    refresh,
    resizeEditor,
    sandboxReady,
    setAttachments,
    setBusy,
    setComposerHelper,
    setCreditNudgeDismissed,
    setEditAttachments,
    setEditInput,
    setEditingQueued,
    setFollowUpQueue,
    setHasMoreOlder,
    setInput,
    setMessages,
    setPendingEditSend,
    setPendingModeSwitch,
    setPendingQuestion,
    setPendingSecrets,
    setPlanPendingApprove,
    setPlanStatusByPath,
    setPlatformChip,
    setSlashMenu,
    setStopping,
    stopping,
    tailForRunUpdate,
    threadId,
    threadIdRef,
    toast,
    user,
    waitForAgentInactive,
    waitUntilIdle,
  });

  useEffect(() => {
    if (busy) return;
    // Delay clearing stopping so the Stop button stays under the cursor through
    // mouseup (otherwise Send remounts and the same click re-sends).
    const t = window.setTimeout(() => setStopping(false), 400);
    return () => clearTimeout(t);
  }, [busy]);

  useEffect(() => {
    if (!sandboxReady || sentInitial.current || messages === null || messages.length > 0) return;
    const pendingFiles = peekPendingAttachments();
    const prompt = initialPrompt?.trim() || "";
    const skills = initialSkills;
    if (!prompt && !(skills?.length) && !pendingFiles.length) return;
    sentInitial.current = true;
    setHeldOpeningSeed(openingSeedMessagesRef.current);
    onInitialSeedConsumed?.();

    const sendSeed = async (files: File[]) => {
      let readyAttachments: Attachment[] = [];
      if (files.length) {
        readyAttachments = await addFiles(files, "main", { skipComposer: true });
      }
      try {
        if (!prompt && !(skills?.length) && readyAttachments.length === 0) return;
        await send(prompt, "main", false, {
          skills,
          readyAttachments: readyAttachments.length ? readyAttachments : undefined,
        });
      } finally {
        setHeldOpeningSeed(null);
      }
    };

    // File seeds from landing/dashboard share a module lock (Strict Mode / remount).
    // Prompt/skill seeds (Ask AI to publish) must not share that lock or a
    // sibling ChatPanel can swallow the turn.
    if (pendingFiles.length) {
      void runPendingAttachmentSeed(sendSeed);
    } else {
      void sendSeed([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt, initialSkills, sandboxReady, messages]);

  useEffect(() => {
    const prompt = initialPrompt?.trim();
    if (!threadId || !prompt) return;
    onThreadTitleHint?.(threadId, prompt.slice(0, 60));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, initialPrompt]);

  // "Add to chat" from the preview's annotate mode: the picture joins this
  // chat's composer, carrying the selected elements' details for the agent.
  useEffect(() => {
    if (!acceptAgentPrompt) return;
    const onAttach = (ev: Event) => {
      const detail = (ev as CustomEvent<ComposerAttachDetail>).detail;
      if (!detail?.file) return;
      // One selected element at a time, as in Claude: a new pick replaces the last.
      if (detail.elementLabel) setAttachments((all) => all.filter((a) => !a.elementLabel));
      void addFiles([detail.file], "main", { context: detail.context, elementLabel: detail.elementLabel });
      requestAnimationFrame(() => editorRef.current?.focus());
    };
    window.addEventListener(COMPOSER_ATTACH_EVENT, onAttach);
    return () => window.removeEventListener(COMPOSER_ATTACH_EVENT, onAttach);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptAgentPrompt, sandboxReady]);

  // Inject a prompt into the active chat (Workspace handles newChat: true separately).
  useEffect(() => {
    if (!acceptAgentPrompt) return;
    const onAgentPrompt = (ev: Event) => {
      const detail = (
        ev as CustomEvent<{
          text?: string;
          newChat?: boolean;
          skills?: SkillInvocation[];
        }>
      ).detail;
      if (detail?.newChat) return;
      const text = detail?.text?.trim() || "";
      if (!text && !(detail?.skills?.length)) return;
      // Through the follow-up queue, not send(): a queued message carries its
      // own text and files and leaves the composer alone, so a draft the
      // person is typing is neither sent along nor wiped. The queue sends it
      // the moment this chat is idle and the workspace is up, and holds it
      // (visible, editable) while a turn is running — instead of dropping it
      // when the workspace was still starting, as the direct send did.
      setFollowUpQueue((q) => [...q, { id: crypto.randomUUID(), text, skills: detail?.skills }]);
    };
    window.addEventListener("mythex:agent-prompt", onAgentPrompt);
    return () => window.removeEventListener("mythex:agent-prompt", onAgentPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandboxReady, acceptAgentPrompt]);

  const restore = useCallback(
    async (gitSha: string) => {
      try {
        const res = await orch.restore(client, gitSha);
        // Git is the source of truth for plan.md (including todo statuses) — same
        // as every other project file. Chat is not truncated; only drop the live
        // View Plan cache and re-read Built/Ready from restored disk.
        clearPlanContentCache();
        setPlanPendingApprove(null);
        const slice = messagesUpToGitSha(messagesRef.current ?? [], gitSha);
        const diskStatuses = await planStatusesFromDisk(client, planPathsFromMessages(slice));
        setPlanStatusByPath(diskStatuses);
        toast("success", appT().chat.panel.restored);
        window.dispatchEvent(new Event("mythex:project-changed"));
        window.dispatchEvent(new CustomEvent("mythex:plan-cache-clear", { detail: {} }));
        onFilesChanged();
        // The dev server is restarted against the restored code (a plain git
        // reset can otherwise leave it watching files that no longer match
        // disk), so refresh the preview with the fresh run result.
        if (res.previewUrl) {
          onRunUpdate(res.previewUrl, Boolean(res.healthy), res.services, {
            forceReload: Boolean(res.healthy),
          });
        }
      } catch {
        toast("error", appT().chat.panel.restoreFailed);
      }
    },
    [client, toast, onFilesChanged, onRunUpdate],
  );

  /**
   * Sub-agent transcripts the chat list left out for their size (API:
   * lib/message-page.ts) are fetched when the sub-agent is opened — a row
   * tapped, or a tab open for it — and put back into the message. Anything that
   * reloads the history (a finished turn, a reconnect) brings the marker back
   * without the transcript, so this runs again for whatever is still open.
   */
  const wantedSubagentsRef = useRef(new Set<string>());
  const subagentFetchesRef = useRef(new Set<string>());
  const failedSubagentsRef = useRef(new Set<string>());
  const [wantedSubagentsTick, setWantedSubagentsTick] = useState(0);
  const openSubagentKey = (openSubagentToolIds ?? []).join(",");
  useEffect(() => {
    if (!threadId || !messages) return;
    const wanted = new Set([...wantedSubagentsRef.current, ...(openSubagentKey ? openSubagentKey.split(",") : [])]);
    if (!wanted.size) return;
    for (const m of messages) {
      for (const b of m.blocks) {
        const t = b.kind === "tool" ? b.tool : undefined;
        const id = t?.id;
        if (!t || t.name !== "Agent" || !id || !t.subagent?.deferred || !wanted.has(id)) continue;
        if (subagentFetchesRef.current.has(id) || failedSubagentsRef.current.has(id)) continue;
        subagentFetchesRef.current.add(id);
        const forThread = threadId;
        void api
          .get<{ blocks: unknown[] }>(
            `/v1/projects/${project.id}/threads/${forThread}/subagent/${encodeURIComponent(id)}`,
          )
          .then((res) => {
            const blocks = persistedSubagentBlocks(res.blocks);
            setMessages((prev) =>
              prev?.map((msg) =>
                msg.blocks.some((x) => x.kind === "tool" && x.tool?.id === id)
                  ? {
                      ...msg,
                      blocks: msg.blocks.map((x) => {
                        if (x.kind !== "tool" || x.tool?.id !== id || !x.tool.subagent?.deferred) return x;
                        const { deferred: _loaded, ...sub } = x.tool.subagent;
                        return { ...x, tool: { ...x.tool, subagent: { ...sub, blocks } } };
                      }),
                    }
                  : msg,
              ) ?? prev,
            );
          })
          .catch(() => {
            // Not retried until it is opened again, so a missing block does not loop.
            failedSubagentsRef.current.add(id);
          })
          .finally(() => subagentFetchesRef.current.delete(id));
      }
    }
  }, [messages, threadId, project.id, wantedSubagentsTick, openSubagentKey]);

  const handleInspectSubagent = useCallback(
    (toolId: string) => {
      wantedSubagentsRef.current.add(toolId);
      failedSubagentsRef.current.delete(toolId);
      setWantedSubagentsTick((n) => n + 1);
      // A phone has no room for tabs: a sheet over the chat, swiped away,
      // leaves the person where they were.
      if (isPhone) {
        setSheetSubagentId(toolId);
        return;
      }
      if (onOpenSubagentTabProp) {
        const tool = messagesRef.current
          ?.flatMap((m) => m.blocks)
          .find((b) => b.kind === "tool" && b.tool?.id === toolId)?.tool;
        onOpenSubagentTabProp({
          toolId,
          title: tool?.subagent?.description || tool?.target || appT().chat.tabs.subagent,
        });
        return;
      }
      setInspectSubagentId(toolId);
    },
    [onOpenSubagentTabProp, isPhone],
  );

  const handleCloseSubagent = useCallback(() => setInspectSubagentId(null), []);

  const handleViewPlan = useCallback(
    (path: string, titleHint?: string) => {
      const rel = path.replace(/^\/home\/user\/app\//, "");
      const title =
        titleHint?.trim() ||
        (planPendingRef.current?.path?.replace(/^\/home\/user\/app\//, "") === rel
          ? planPendingRef.current.title
          : null) ||
        planTitleFromPath(rel);
      // PlanTabPane always reads disk — just open (or bump reload if already open).
      onOpenPlanTabProp?.({ path: rel, title });
      window.dispatchEvent(
        new CustomEvent("mythex:plan-cache-clear", { detail: { path: rel } }),
      );
    },
    [onOpenPlanTabProp],
  );
  const { confirmSwitchToPlan, planActionsForLast, skipSwitchToPlan } = usePlanActions({
    refs,
    threadId,
    agentModeRef,
    client,
    finalizePlanTurn,
    freezeTurnLocally,
    onPlanUiChange,
    pendingModeSwitchRef,
    planPendingApprove,
    planStatusByPath,
    send,
    setAgentMode,
    setPendingModeSwitch,
    setPlanPendingApprove,
    setStopping,
    toast,
    waitForAgentInactive,
    waitUntilIdle,
  });

  const { cancelQueueEdit, pickPlatformTool, sendQueuedNow, startQueueEdit, syncSlashMenu } = useQueueActions({
    refs,
    busy,
    client,
    editingQueued,
    followUpQueue,
    freezeTurnLocally,
    input,
    platformChip,
    project,
    resizeEditor,
    send,
    setAttachments,
    setEditInput,
    setEditPlatformChip,
    setEditingQueued,
    setFollowUpQueue,
    setInput,
    setPlatformChip,
    setSlashMenu,
    setStopping,
    toast,
  });

  const { renderComposer } = useComposerRender({
    refs,
    composerNotices,
    addFiles,
    agentMode,
    attachments,
    busy,
    cancelQueueEdit,
    clearEditComposer,
    client,
    dragOver,
    editAttachments,
    editDragOver,
    editInput,
    editPlatformChip,
    editingQueued,
    initialPrompt,
    initialSkills,
    input,
    onOpenFileProp,
    outOfCredits,
    pendingQuestion,
    pickPlatformTool,
    platformChip,
    project,
    removeAttachment,
    resizeEditor,
    sandboxBlock,
    sandboxReady,
    send,
    setAgentMode,
    setDragOver,
    setEditDragOver,
    setEditInput,
    setEditPlatformChip,
    setInput,
    setPlatformChip,
    setSlashMenu,
    slashMenu,
    stop,
    stopping,
    syncSlashMenu,
  });

  const seedText = initialPrompt?.trim() || "";
  /**
   * Files attached on the dashboard or landing page, shown in the opening
   * message from the moment the chat opens. They are uploaded only once the
   * sandbox is up, and the message used to show its text alone until then —
   * the pictures popped in seconds later (or nothing showed at all when there
   * was no text). Local previews of the same files, taken once on open; the
   * real message, with the uploaded files, replaces this as before.
   */
  const [seedFiles] = useState(() =>
    peekPendingAttachments().map((file, i) => {
      const isImage = isPreviewableImage(file.name, file.type);
      return {
        id: `seed-${i}`,
        name: file.name,
        path: "",
        isImage,
        previewUrl: isImage ? URL.createObjectURL(file) : undefined,
      };
    }),
  );
  useEffect(
    () => () => {
      for (const f of seedFiles) if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    },
    [seedFiles],
  );
  const openingSeedMessages = useMemo((): DisplayMessage[] | null => {
    if (!seedText && !(initialSkills?.length) && !seedFiles.length) return null;
    // Non-image files are chips in the text, where the composer put them.
    const seedFileSegments = seedFiles.filter((f) => !f.isImage).map((f) => ({ type: "file" as const, id: f.id }));
    const nowIso = openingSeedAtRef.current ?? (openingSeedAtRef.current = new Date().toISOString());
    const paintedChip = initialSkills?.[0] ? skillToPlatformChip(initialSkills[0]) : null;
    const blocked = sandboxBlock;
    return [
      {
        role: "USER",
        blocks: seedText ? [{ kind: "text", text: seedText }] : [],
        ...(seedFiles.length ? { attachments: seedFiles } : {}),
        platformTool: paintedChip ?? undefined,
        segments: paintedChip
          ? finalizeComposerSegments(seedText ? [{ type: "text", text: seedText }] : [], paintedChip)
          : seedText || seedFileSegments.length
            ? [...(seedText ? [{ type: "text" as const, text: seedText }] : []), ...seedFileSegments]
            : undefined,
        createdAt: nowIso,
      },
      {
        role: "ASSISTANT",
        blocks: blocked
          ? [
              {
                kind: "error",
                text:
                  blocked === "credits"
                    ? t.chat.panel.workspaceNeedsCredits
                    : t.chat.panel.workspaceStartFailed,
              },
            ]
          : [],
        streaming: !blocked,
        statusHint: blocked ? undefined : "waking",
        createdAt: nowIso,
        startedAtMs: Date.parse(nowIso) || undefined,
      },
    ];
  }, [seedText, initialSkills, sandboxBlock, seedFiles, t]);
  openingSeedMessagesRef.current = openingSeedMessages;
  // Once the seed is being sent, the copy taken then (text and files together)
  // stays on screen: the prompt is cleared as it is consumed, and the live seed
  // would otherwise go on without its text while the files upload.
  const seedOnScreen = heldOpeningSeed ?? openingSeedMessages;
  const showOpeningSeed =
    Boolean(seedOnScreen) && (messages === null || messages.length === 0);
  const displayMessages = showOpeningSeed ? seedOnScreen : messages;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-bg">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        onClickCapture={(e) => {
          if ((e.target as Element).closest?.("button")) tappedAt.current = performance.now();
        }}
        onWheel={(e) => followTailFromWheel(e.deltaY, scrollRef.current, pinnedToBottom)}
        onTouchStart={(e) => {
          touchChatYRef.current = e.touches[0]?.clientY ?? null;
        }}
        onTouchMove={(e) => {
          const y = e.touches[0]?.clientY;
          const prev = touchChatYRef.current;
          if (prev != null && y != null && y > prev + 2) pinnedToBottom.current = false;
          if (y != null) touchChatYRef.current = y;
        }}
        // Fixed bottom padding: a little room under the last message, about the
        // gap between turns. It was 160px — at the bottom of a chat, the last
        // line sat a third of a phone screen above the composer. Side gutters:
        // .ws-chat-gutter.
        // md:pt-1.5 — the first message and a prompt pinned to the top by a
        // send sit at the same place: 6px + the turn's 10px, just under the
        // 16px top fade (.ws-transcript[data-scrolled]).
        // pb-9: the fade's 24px plus the 12px the composer overlaps
        // (.ws-composer-dock), so the last line still clears the card.
        className="ws-transcript ws-chat-gutter min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pt-0 pb-9 md:pt-1.5"
        style={{ overflowAnchor: "none" }}
      >
        <div
          // Block, not a flex column, once there are messages: see .chat-rows
          // in index.css. The empty state centres itself and keeps flex.
          className={`mx-auto w-full max-w-2xl ${
            displayMessages != null && displayMessages.length === 0 ? "flex min-h-full flex-col" : "flow-root space-y-5"
          }`}
        >
        {(loadingOlder || hasMoreOlder) && displayMessages && displayMessages.length > 0 && (
          <div className="flex items-center justify-center gap-1.5 py-2 text-[11px] text-muted">
            {loadingOlder ? (
              <>
                <Spinner size={12} />
                {t.chat.panel.loadingEarlier}
              </>
            ) : (
              t.chat.panel.scrollForEarlier
            )}
          </div>
        )}
        {displayMessages === null ? (
          <div className="pt-2.5 max-md:pt-0" data-testid="chat-loading">
            <TranscriptSkeleton />
          </div>
        ) : displayMessages.length === 0 ? (
          <div data-chat-empty className="fade-up flex flex-1 flex-col items-center justify-center px-5 pb-6 text-center">
            <MythexMark size={40} className="opacity-95" />
            <h2 className="font-display mt-7 text-[1.35rem] font-semibold tracking-tight text-fg">
              {project?.role === "VIEWER" ? project.name : t.chat.panel.emptyTitle}
            </h2>
            {project?.role === "VIEWER" ? (
              <p className="mt-2.5 max-w-[20rem] text-[13px] leading-relaxed text-muted">{t.teams.viewer.nothingBuilt}</p>
            ) : (
              <>
                <p className="mt-2.5 max-w-[20rem] text-[13px] leading-relaxed text-muted">
                  {t.chat.panel.emptyBody}
                </p>
                <StarterIdeas onPick={useSuggestion} disabled={busy || outOfCredits} />
              </>
            )}
          </div>
        ) : (
          // Each USER + following ASSISTANT(s) as one group. The prompt used to
          // stick to the top while its turn scrolled past; it no longer does —
          // on a phone it never had room, and on desktop it hid the reply.
          // Only the turns near the screen are on the page (VirtualTurns).
          (() => {
            const allTurns = groupChatTurns(displayMessages);
            const editingTurn =
              editingIndex == null ? -1 : allTurns.findIndex((t) => t.userIndex === editingIndex);
            return (
              <VirtualTurns
                // Turn keys are places in a chat: another chat's are the same
                // keys for different turns, so it starts its own list.
                key={turnListGen}
                scrollRef={scrollRef}
                keepMounted={[allTurns.length - 1, editingTurn]}
                turns={allTurns.map((turn, turnIdx) => ({
                  // Its place in the chat less the messages loaded above since:
                  // the same key before and after an older page arrives.
                  key: `turn-${turn.userIndex - olderShift}`,
                  fill: turnIdx === allTurns.length - 1,
                  node: (
            <>
              <div
                ref={
                  editingIndex === turn.userIndex && !turn.user.hideBubble
                    ? editShellRef
                    : undefined
                }
                className="pt-2.5 pb-1.5"
              >
                {turn.user.hideBubble || turn.user.planBuild ? null : editingIndex === turn.userIndex ? (
                  renderComposer("edit")
                ) : (
                  <UserPromptCard
                    message={turn.user}
                    editIndex={showOpeningSeed ? undefined : turn.userIndex}
                    onEditIndex={startEditStable}
                    onOpenFile={onOpenFileProp}
                    client={client}
                  />
                )}
                {(() => {
                  // Plan→Build: seed from the plan file + live Task*/UpdatePlan.
                  // Regular agent turns: show StickyTodos when TaskCreate/TaskUpdate ran.
                  // Plan-mode edits: skip UpdatePlan so "0 of N Done" stays on View Plan.
                  const isPlanBuild = !!(turn.user.seedTodos?.length || turn.user.planBuild);
                  const live = latestTodosFromAssistants(turn.assistants, {
                    includeUpdatePlan: isPlanBuild,
                  });
                  const todos = (isPlanBuild
                    ? mergePlanTodosWithLive(turn.user.seedTodos, live, {
                        seedAuthoritative: true,
                      })
                    : live) as AgentTodo[] | null;
                  if (!todos?.length) return null;
                  const streaming = turn.assistants.some(({ message }) => !!message.streaming);
                  return (
                    <div data-testid={isPlanBuild ? "plan-build-todos" : "sticky-todos"}>
                      <StickyTodos todos={todos} streaming={streaming} />
                    </div>
                  );
                })()}
              </div>
              <div className="mt-1.5 space-y-3">
                {turn.assistants.map(({ message, index }, assistantIdx) => {
                  const isLastInTurn = assistantIdx === turn.assistants.length - 1;
                  // Revert sits at the end of the turn's reply, as Lovable's
                  // does: the checkpoint the turn left, newest first.
                  const restoreGitSha = isLastInTurn
                    ? (() => {
                        for (let i = turn.assistants.length - 1; i >= 0; i--) {
                          const a = turn.assistants[i].message;
                          if (a.streaming) continue;
                          const sha =
                            a.gitSha || a.blocks.find((b) => b.kind === "checkpoint" && b.gitSha)?.gitSha;
                          if (sha) return sha;
                        }
                        return undefined;
                      })()
                    : undefined;
                  return (
                  <div key={index} className="min-w-0">
                    <AssistantTurn
                      message={message}
                      online={online}
                      onOpenFile={onOpenFileProp}
                      restoreGitSha={restoreGitSha}
                      onRequestRestore={setPendingRestoreSha}
                      replyText={
                        isLastInTurn && !message.streaming
                          ? replyTextOf(turn.assistants.map((a) => a.message))
                          : undefined
                      }
                      client={client}
                      inspectSubagentId={onOpenSubagentTabProp ? null : inspectSubagentId}
                      onInspectSubagent={handleInspectSubagent}
                      onCloseSubagent={onOpenSubagentTabProp ? undefined : handleCloseSubagent}
                      planActions={planActionsForLast}
                      onViewPlan={handleViewPlan}
                      // Plan cards only from CreatePlan tool results — never invent.
                      injectMissingPlan={false}
                      suppressPlanCards={
                        !!(turn.user.planBuild || turn.user.hideBubble || turn.user.seedTodos?.length)
                      }
                    />
                  </div>
                  );
                })}
              </div>
            </>
                  ),
                }))}
              />
            );
          })()
        )}
        </div>
      </div>

      {/* The transcript's side gutters (see .ws-transcript), outside the max
          width as there, so the composer and the messages share both edges. */}
      <div className="ws-chat-gutter px-4">
      <div className="mx-auto w-full max-w-2xl">
      {/* .ws-jump: slides with the composer as the keyboard comes and goes
          (lib/native-keyboard.ts); left behind, it sat under the rising
          keyboard and appeared above the composer only once it had landed. */}
      <div className="ws-jump relative h-0">
        <button
          type="button"
          onClick={jumpToLatest}
          aria-label={t.chat.panel.jumpToLatest}
          aria-hidden={!jumpShown}
          tabIndex={jumpShown ? 0 : -1}
          className={`mx-ring absolute bottom-3 left-1/2 z-10 grid size-10 -translate-x-1/2 place-items-center rounded-full bg-elevated text-fg shadow-lg transition duration-200 ${
            jumpShown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0"
          }`}
        >
          <ArrowDown size={18} strokeWidth={2} />
        </button>
      </div>
      {/* What waits on you above the composer — each grows in and shrinks
          away (Reveal) rather than jumping the composer by its full height.
          The composer is pulled up over the chat by its fade (-16px,
          .ws-composer-dock), which also slid it over the bottom of these
          cards: the questions card lost its last 8px, rounded corners and all,
          under the composer (measured at phone width). Room for that overlap
          while a card is up. */}
      <div
        className="transition-[padding] duration-200"
        style={{
          paddingBottom:
            followUpQueue.length > 0 || pendingModeSwitch || pendingSecrets || pendingQuestion ? 16 : 0,
        }}
      >
          <Reveal show={Boolean(followUpQueue.length > 0)}>
            {followUpQueue.length > 0 && (
              <FollowUpQueuePanel
                items={followUpQueue}
                onEdit={startQueueEdit}
                onSendNow={sendQueuedNow}
                onRemove={(id) => setFollowUpQueue((q) => q.filter((x) => x.id !== id))}
              />
            )}
          </Reveal>
          <Reveal show={Boolean(pendingModeSwitch)}>
            {pendingModeSwitch && (
              <SwitchToPlanModePanel
                key={pendingModeSwitch.toolCallId}
                reason={pendingModeSwitch.reason}
                onSwitch={confirmSwitchToPlan}
                onSkip={skipSwitchToPlan}
              />
            )}
          </Reveal>
          <Reveal show={Boolean(pendingSecrets)}>
            {pendingSecrets?.kind ? (
              <div className="px-2">
                <StorePanel
                  kind={pendingSecrets.kind}
                  key={pendingSecrets.requestId}
                  projectId={project.id}
                  closing={secretsSaving}
                  onCancel={() => {
                    setSecretsSaving(true);
                    void ackAgentSecrets(client, {
                      requestId: pendingSecrets.requestId,
                      keys: pendingSecrets.keys,
                      cancelled: true,
                      kind: pendingSecrets.kind,
                    }).finally(() => {
                      setSecretsSaving(false);
                      setPendingSecrets(null);
                    });
                  }}
                  onConnected={() => {
                    setSecretsSaving(true);
                    void ackAgentSecrets(client, {
                      requestId: pendingSecrets.requestId,
                      keys: pendingSecrets.keys,
                      kind: pendingSecrets.kind,
                    }).then((ok) => {
                      if (!ok) toast("error", t.chat.panel.secretsConfirmFailed);
                      else setPendingSecrets(null);
                    }).finally(() => setSecretsSaving(false));
                  }}
                />
              </div>
            ) : pendingSecrets && (
              <div className="px-2">
                <SecretsRequestCard
                  keys={pendingSecrets.keys}
                  reason={pendingSecrets.reason}
                  saving={secretsSaving}
                  onCancel={() => {
                    setSecretsSaving(true);
                    void ackAgentSecrets(client, {
                      requestId: pendingSecrets.requestId,
                      keys: pendingSecrets.keys,
                      cancelled: true,
                    }).finally(() => {
                      setSecretsSaving(false);
                      setPendingSecrets(null);
                    });
                  }}
                  onSave={(vars: Array<{ key: string; value: string }>) => {
                    setSecretsSaving(true);
                    void (async () => {
                      try {
                        await api.patch(`/v1/projects/${project.id}/env`, { vars });
                        const ok = await ackAgentSecrets(client, {
                          requestId: pendingSecrets.requestId,
                          keys: vars.map((v: { key: string; value: string }) => v.key),
                        });
                        if (!ok) toast("error", t.chat.panel.secretsConfirmFailed);
                        else setPendingSecrets(null);
                      } catch {
                        toast("error", t.chat.panel.secretsSaveFailed);
                      } finally {
                        setSecretsSaving(false);
                      }
                    })();
                  }}
                />
              </div>
            )}
          </Reveal>
          <Reveal show={Boolean(pendingQuestion)}>
            {pendingQuestion && (
              <AskQuestionsPanel
                key={pendingQuestion.toolCallId}
                questions={pendingQuestion.questions}
                answers={questionAnswers}
                customByQuestion={questionCustom}
                onAnswer={(questionId, optionId) =>
                  setQuestionAnswers((a) => {
                    if (!optionId) {
                      const next = { ...a };
                      delete next[questionId];
                      return next;
                    }
                    return { ...a, [questionId]: optionId };
                  })
                }
                onCustom={(questionId, text) =>
                  setQuestionCustom((c) => ({ ...c, [questionId]: text }))
                }
                onContinue={() => {
                  const answers: Record<string, string> = {};
                  for (const q of pendingQuestion.questions) {
                    const custom = questionCustom[q.id]?.trim();
                    if (custom) {
                      answers[q.id] = custom;
                      continue;
                    }
                    const optId = questionAnswers[q.id];
                    const opt = q.options.find((o) => o.id === optId);
                    answers[q.id] = opt?.label || optId || "__skip__";
                  }
                  const details = (editorRef.current ? composerPlainText(editorRef.current) : input).trim();
                  if (details) answers._details = details;
                  void answerAgentQuestion(client, {
                    toolCallId: pendingQuestion.toolCallId,
                    answers,
                  }).then((ok) => {
                    if (!ok) toast("error", t.chat.panel.answersFailed);
                    else {
                      setPendingQuestion(null);
                      setPendingSecrets(null);
                      setQuestionAnswers({});
                      setQuestionCustom({});
                      setInput("");
                      if (editorRef.current) clearComposerEditor(editorRef.current);
                    }
                  });
                }}
                onSkip={() => {
                  const answers: Record<string, string> = { ...questionAnswers };
                  for (const q of pendingQuestion.questions) {
                    const custom = questionCustom[q.id]?.trim();
                    if (custom) answers[q.id] = custom;
                    else if (!answers[q.id]) answers[q.id] = "__skip__";
                    else {
                      const opt = q.options.find((o) => o.id === answers[q.id]);
                      if (opt) answers[q.id] = opt.label;
                    }
                  }
                  void answerAgentQuestion(client, {
                    toolCallId: pendingQuestion.toolCallId,
                    answers,
                  }).then((ok) => {
                    if (!ok) toast("error", t.chat.panel.skipFailed);
                    else {
                      setPendingQuestion(null);
                      setPendingSecrets(null);
                      setQuestionAnswers({});
                      setQuestionCustom({});
                    }
                  });
                }}
              />
            )}
          </Reveal>
        </div>

      {/* Out of credits, the trial offer and notifications live on the
          composer's shelf now (ComposerShelf), one at a time. */}

      <Reveal show={Boolean(composerHelper)}>
        {composerHelper && (
          <ComposerHelperBanner
            helper={composerHelper}
            busy={busy}
            onDismiss={() => {
              // Strip helper errors locally (if still present) and clear the DB
              // row so refresh can't peel the banner back up.
              const dismissId = composerHelper.sourceMessageId;
              setMessages((prev) => {
                if (!prev?.length) return prev;
                const idx = dismissId
                  ? prev.findIndex((m) => m.id === dismissId)
                  : prev.length - 1;
                if (idx < 0) return prev;
                const target = prev[idx];
                if (target?.role !== "ASSISTANT") return prev;
                const nextBlocks = target.blocks.filter((b) => !isComposerHelperError(b));
                if (nextBlocks.length === target.blocks.length && target.id === dismissId) {
                  // Already peeled locally — nothing to change in UI state.
                  return prev;
                }
                if (nextBlocks.length === target.blocks.length) return prev;
                const next = [...prev.slice(0, idx), { ...target, blocks: nextBlocks }, ...prev.slice(idx + 1)];
                messagesRef.current = next;
                return next;
              });
              setComposerHelper(null);
              if (dismissId && threadId) {
                void api
                  .post(
                    `/v1/projects/${project.id}/threads/${threadId}/messages/${dismissId}/dismiss-helper`,
                    {},
                  )
                  .catch(() => {});
              }
            }}
            onRetry={() => {
              const retryPrompt = composerHelper.retryPrompt?.trim();
              if (!retryPrompt || busyRef.current) return;
              setComposerHelper(null);
              // Drop the empty/failed assistant (and its user bubble) so retry doesn't duplicate.
              setMessages((prev) => {
                if (!prev?.length) return prev;
                let end = prev.length;
                const last = prev[end - 1];
                if (last?.role === "ASSISTANT") {
                  const hasWork = last.blocks.some(
                    (b) =>
                      b.kind === "tool" ||
                      (b.kind === "text" && Boolean(b.text?.trim())) ||
                      (b.kind === "thinking" && Boolean(b.text?.trim())),
                  );
                  if (!hasWork) end--;
                }
                if (prev[end - 1]?.role === "USER") end--;
                const next = prev.slice(0, end);
                messagesRef.current = next;
                return next;
              });
              void send(retryPrompt, "main");
            }}
          />
        )}
      </Reveal>

      {project?.role === "VIEWER" ? (
        <div
          className="mx-3 mb-3 rounded-xl border border-line bg-white/[0.03] px-4 py-3 text-center text-[13px] text-fg-2"
          data-testid="viewer-readonly"
        >
          {t.teams.viewer.readOnly}
        </div>
      ) : (
        renderComposer("main")
      )}
      </div>
      </div>

      {pendingEditSend && (
        <Dialog
          title={t.chat.panel.discardTitle}
          subtitle={t.chat.panel.discardBody}
          onClose={() => setPendingEditSend(null)}
        >
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setPendingEditSend(null)}>
              {t.common.cancel}
            </button>
            <button
              className="btn-danger"
              onClick={() => {
                const pending = pendingEditSend;
                setPendingEditSend(null);
                void send(pending.raw, "edit", true);
              }}
            >
              {t.chat.panel.discardResend}
            </button>
          </div>
        </Dialog>
      )}

      {sheetSubagentId && (
        <Sheet title={sheetSubagent?.title ?? t.chat.tabs.subagent} onClose={() => setSheetSubagentId(null)}>
          <div className="native-safe-bottom px-4 pb-4" data-testid="subagent-sheet">
            <SubagentActivity
              snapshot={sheetSubagent}
              onOpenFile={
                onOpenFile &&
                ((path) => {
                  // The file opens in the app pane; a sheet left over it hides it.
                  setSheetSubagentId(null);
                  onOpenFile(path);
                })
              }
            />
          </div>
        </Sheet>
      )}
      {pendingRestoreSha && (
        <Dialog
          title={t.chat.panel.restoreTitle}
          subtitle={t.chat.panel.restoreBody}
          onClose={() => setPendingRestoreSha(null)}
        >
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setPendingRestoreSha(null)}>
              {t.common.cancel}
            </button>
            <button
              className="btn-primary"
              data-testid="restore-checkpoint-confirm"
              onClick={() => {
                const sha = pendingRestoreSha;
                setPendingRestoreSha(null);
                void restore(sha);
              }}
            >
              {t.chat.panel.restore}
            </button>
          </div>
        </Dialog>
      )}

    </div>
  );
}

/** The store account panel the AI is waiting on. */
function StorePanel({
  kind,
  ...props
}: { kind: "app_store" | "google_play" } & Parameters<typeof AppStoreConnectPanel>[0]) {
  return kind === "google_play" ? <GooglePlayConnectPanel {...props} /> : <AppStoreConnectPanel {...props} />;
}
