import type { Dispatch, SetStateAction, RefObject } from "react";
import { useEffect } from "react";
import { api, ApiError, type MessagesPage, type ProjectDetail } from "../../lib/api";
import { agentStreamQuietMs } from "../../lib/orchestrator";
import { applyHistoryWithHelper, peelComposerHelperFromMessages } from "./agent";
import { mapHistory, paintPlanBuildTurnLive } from "./history";
import { AGENT_STREAM_DEAD_AFTER_MS } from "./tool-model";
import { type ComposerHelper, type DisplayMessage } from "./types";
import type { ChatRefs } from "./refs";


/**
 * How recently a chat must have been written to for its last Plan→Build turn
 * to be drawn as live on load. Well past the gap between two saves of a
 * streaming reply; far short of a chat left overnight.
 */
const LIVE_PAINT_WINDOW_MS = 10 * 60_000;
/** Everything useThreadSync reads from the chat panel. */
export type ThreadSyncCtx = {
  refs: ChatRefs;
  busy: boolean;
  composerHelper: ComposerHelper | null;
  messages: DisplayMessage[] | null;
  project: ProjectDetail;
  reconcileHistoryRef: RefObject<(turnThreadId?: string) => Promise<void>>;
  reconnectRef: RefObject<() => Promise<void>>;
  sandboxReady: boolean;
  setComposerHelper: Dispatch<SetStateAction<ComposerHelper | null>>;
  setHasMoreOlder: Dispatch<SetStateAction<boolean>>;
  setMessages: Dispatch<SetStateAction<DisplayMessage[] | null>>;
  setPlanPendingApprove: Dispatch<SetStateAction<{ path: string; title: string; overview: string; status: "ready" | "building" | "built"; } | null>>;
  setPlanStatusByPath: Dispatch<SetStateAction<Record<string, "ready" | "building" | "built">>>;
  threadId: string | undefined;
};

export function useThreadSync(ctx: ThreadSyncCtx) {
  const {
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
  } = ctx;
  const {
    abortRef,
    busyRef,
    contentFrozenRef,
    hasMoreOlderRef,
    historyReadyRef,
    loadedThreadRef,
    messagesRef,
    pinnedToBottom,
    reconcileOwedRef,
    reconnectDropAttemptsRef,
    reconnectHollowAttemptsRef,
    reconnectedRef,
    sendAbortRef,
    sendAwaitingAnswerRef,
  } = ctx.refs;

  // Load history once per thread, then reconnect if a build is still running.
  // Keyed ONLY on project/thread so re-renders never re-fetch and wipe the
  // in-flight streamed message (thinking/tools) or the resumed stream.
  useEffect(() => {
    if (!threadId) {
      setMessages([]);
      setComposerHelper(null);
      setHasMoreOlder(false);
      hasMoreOlderRef.current = false;
      loadedThreadRef.current = null;
      historyReadyRef.current = null;
      reconnectedRef.current = null;
      reconnectHollowAttemptsRef.current = 0;
      reconnectDropAttemptsRef.current = 0;
      return;
    }
    if (loadedThreadRef.current === threadId) return;
    loadedThreadRef.current = threadId;
    historyReadyRef.current = null;
    reconnectedRef.current = null;
    reconnectHollowAttemptsRef.current = 0;
    reconnectDropAttemptsRef.current = 0;
    setComposerHelper(null);
    setHasMoreOlder(false);
    hasMoreOlderRef.current = false;
    // GETs already wait out a deploy (api.ts); this covers an API that stays
    // unreachable a while longer. Clearing on the first failure showed an
    // existing chat as a blank "What do you want to build?".
    const loadHistory = (attempt: number): Promise<MessagesPage> =>
      api
        .get<MessagesPage>(`/v1/projects/${project.id}/threads/${threadId}/messages?limit=30`)
        .catch(async (err: unknown) => {
          const transient = !(err instanceof ApiError) || err.status === 0 || err.status >= 500;
          if (!transient || attempt >= 5 || loadedThreadRef.current !== threadId) throw err;
          await new Promise((r) => setTimeout(r, 3_000));
          if (loadedThreadRef.current !== threadId) throw err;
          return loadHistory(attempt + 1);
        });
    void loadHistory(0)
      .then((page) => {
        // Thread switched while this fetch was in flight — discard.
        if (loadedThreadRef.current !== threadId) return;
        const { messages: mapped, helper } = applyHistoryWithHelper(mapHistory(page.items), null);
        // Avoid "Worked for Xs" → Working → todos flash on early Plan→Build refresh.
        // Only for a chat that could be mid-turn: a running turn saves its reply
        // as it streams, and each save moves the thread's updatedAt. One that
        // has sat untouched is a turn that died or was stopped — painting it
        // live showed "Building Plan", a running todo list and "Planning next
        // moves" on a two-day-old chat until the sandbox woke and the status
        // check put it back. The status check still attaches to a turn that
        // really is running, whatever this decides.
        const lastWrite = page.threadUpdatedAt ? Date.parse(page.threadUpdatedAt) : NaN;
        const mayBeRunning = !Number.isFinite(lastWrite) || Date.now() - lastWrite < LIVE_PAINT_WINDOW_MS;
        const live = mayBeRunning ? paintPlanBuildTurnLive(mapped) : { messages: mapped, pending: undefined };
        messagesRef.current = live.messages;
        setMessages(live.messages);
        if (live.pending) {
          setPlanPendingApprove({
            path: live.pending.path,
            title: live.pending.title,
            overview: "",
            status: "building",
          });
          setPlanStatusByPath((prev) => ({ ...prev, [live.pending!.path]: "building" }));
        }
        if (helper) setComposerHelper(helper);
        setHasMoreOlder(page.hasMore);
        hasMoreOlderRef.current = page.hasMore;
        pinnedToBottom.current = true;
        historyReadyRef.current = threadId;
        void reconnectRef.current();
      })
      .catch(() => {
        if (loadedThreadRef.current !== threadId) return;
        loadedThreadRef.current = null;
        historyReadyRef.current = null;
        setMessages([]);
        setHasMoreOlder(false);
        hasMoreOlderRef.current = false;
      });
  }, [project.id, threadId]);

  // History often loads before the sandbox finishes waking — retry reconnect then.
  useEffect(() => {
    if (!sandboxReady || !threadId) return;
    if (historyReadyRef.current !== threadId) return;
    if (reconnectedRef.current === threadId) return;
    void reconnectRef.current();
  }, [sandboxReady, threadId]);

  // iOS Safari drops fetch SSE when the tab backgrounds / screen locks / radio
  // flaps. Coming back, abort the dead reader (not Stop) and resume /agent/stream.
  useEffect(() => {
    if (!threadId || !sandboxReady) return;
    const tryResume = (dropStream: boolean) => {
      if (document.visibilityState === "hidden") return;
      // The turn ended but its reconcile failed while away — ask again now.
      if (reconcileOwedRef.current === threadId && !busyRef.current) {
        void reconcileHistoryRef.current(threadId);
      }
      if (contentFrozenRef.current) return;
      if (historyReadyRef.current !== threadId) return;
      const last = messagesRef.current?.[messagesRef.current.length - 1];
      const looksLive = Boolean(busyRef.current || (last?.role === "ASSISTANT" && last.streaming));
      if (!looksLive) return;
      const streamAc = abortRef.current;
      const turnAc = sendAbortRef.current;
      if (dropStream && streamAc && streamAc !== turnAc) {
        // A send still waiting for its first answer (a deploy's retries) has
        // no stream to revive — aborting it here threw the message away.
        if (sendAwaitingAnswerRef.current) return;
        // Only a reader that has gone quiet is dead. These events fire far
        // more often than streams die — every tab switch, every unlock, and
        // in some embedded browsers every couple of seconds — and aborting a
        // live stream each time looped: reconnect, replay from empty, abort
        // again, until the chat sat on "Connecting…" and then said the turn
        // had ended while it was still running. The server pings every 15s.
        if (agentStreamQuietMs(project.id) < AGENT_STREAM_DEAD_AFTER_MS) return;
        streamAc.abort();
        return;
      }
      if (turnAc && !turnAc.signal.aborted) return;
      if (busyRef.current && abortRef.current) return;
      reconnectedRef.current = null;
      void reconnectRef.current();
    };
    // Messages sent from another tab or device never showed here until this
    // tab sent something itself. Back after a while and idle: take the latest
    // page from the database (merges; never cuts what is on screen).
    let hiddenAt = 0;
    const onVisible = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const awayMs = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      const last = messagesRef.current?.[messagesRef.current.length - 1];
      const idle = !busyRef.current && !(last?.role === "ASSISTANT" && last.streaming);
      if (awayMs >= 5_000 && idle && historyReadyRef.current === threadId && !contentFrozenRef.current) {
        void reconcileHistoryRef.current(threadId);
      }
      tryResume(true);
    };
    const onPageShow = () => tryResume(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onVisible);
    };
  }, [threadId, sandboxReady, project.id]);

  // Keep the screen awake during a turn so iOS is less likely to freeze JS / kill SSE.
  useEffect(() => {
    if (!busy) return;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    if (!nav.wakeLock?.request) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const request = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        lock = await nav.wakeLock!.request("screen");
      } catch {
        lock = null;
      }
    };
    void request();
    const onVis = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => {});
    };
  }, [busy]);

  // History / reconnect may still carry a crash-only assistant stub — lift it above the input.
  useEffect(() => {
    if (busy || composerHelper || !messages?.length) return;
    const { messages: next, helper } = peelComposerHelperFromMessages(messages);
    if (!helper) return;
    messagesRef.current = next;
    setMessages(next);
    setComposerHelper(helper);
  }, [messages, busy, composerHelper]);

}
