import type { Dispatch, SetStateAction, RefObject } from "react";
import { useCallback } from "react";
import { api, type MessagesPage, type ProjectDetail } from "../../lib/api";
import { mapHistory, mergeAttachmentPreviews } from "./history";
import { pickWorkedMs, turnCreatedPlan } from "./tool-model";
import { type DisplayBlock, type DisplayMessage } from "./types";
import type { ChatRefs } from "./refs";

/** Everything useChatHistory reads from the chat panel. */
export type ChatHistoryCtx = {
  refs: ChatRefs;
  planPendingRef: RefObject<{ path: string; title: string; overview: string; status: "ready" | "building" | "built"; } | null>;
  project: ProjectDetail;
  setHasMoreOlder: Dispatch<SetStateAction<boolean>>;
  setLoadingOlder: Dispatch<SetStateAction<boolean>>;
  setMessages: Dispatch<SetStateAction<DisplayMessage[] | null>>;
  /** Messages added above the first one loaded (older pages); see ChatPanel's turn keys. */
  setOlderShift: Dispatch<SetStateAction<number>>;
  threadId: string | undefined;
};

export function useChatHistory(ctx: ChatHistoryCtx) {
  const {
    planPendingRef,
    project,
    setHasMoreOlder,
    setLoadingOlder,
    setMessages,
    setOlderShift,
    threadId,
  } = ctx;
  const {
    busyRef,
    contentFrozenRef,
    emptyStopSealedRef,
    hasMoreOlderRef,
    loadedThreadRef,
    loadingOlderRef,
    messagesRef,
    reconcileInflightRef,
    reconcileOwedRef,
    scrollRef,
    suppressReconcileRef,
  } = ctx.refs;

  // Reconcile local state with the canonical DB history once a turn ends.
  // The persisted ASSISTANT row can lag a beat behind the terminal SSE event
  // (or, on a hard-kill after Stop, behind the abort itself) — replacing
  // immediately with a USER-only history would wipe the frozen partial reply
  // we just showed. Retry briefly instead of ever truncating what's on screen.
  // Only refreshes the latest page and merges — keeps older prepended pages.
  const reconcileHistory = useCallback(async (turnThreadId?: string) => {
    // A new chat's first turn creates its thread inside send(), after send
    // captured this callback — so `threadId` here is still null for the whole
    // turn, and the reconcile at its end returned without asking. Harmless
    // while the stream delivered every event; but a phone that slept through
    // the turn and came back after its replay buffer expired kept the few
    // blocks it had, sealed, until a manual refresh. Send passes the thread.
    const tid = turnThreadId ?? threadId;
    if (!tid) return;
    if (suppressReconcileRef.current) return;
    // Empty-Stop put the prompt back in the composer — don't pull that USER(+reply)
    // back from the DB into the transcript.
    if (emptyStopSealedRef.current) return;
    // User Stop froze the on-screen turn — don't replace it with a late full reply
    // if the sandbox kept generating after a missed cancel.
    if (contentFrozenRef.current) return;
    // Stop + stream-end both call this; coalesce so we don't hammer /messages.
    if (reconcileInflightRef.current) return reconcileInflightRef.current;

    reconcileOwedRef.current = tid;
    const run = (async () => {
      // After Stop the assistant row often never lands as ASSISTANT promptly —
      // don't retry 6× (and definitely not 6× per caller).
      const stopped = contentFrozenRef.current;
      const maxAttempts = stopped ? 2 : 6;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        let page: MessagesPage;
        try {
          page = await api.get<MessagesPage>(
            `/v1/projects/${project.id}/threads/${tid}/messages?limit=30`,
          );
        } catch {
          return;
        }
        // Another chat opened while this was asked for: its history is not ours.
        if (loadedThreadRef.current && loadedThreadRef.current !== tid) return;
        const history = page.items;
        const lastIsAssistant =
          history.length === 0 || history[history.length - 1].role === "ASSISTANT";
        if (!lastIsAssistant) {
          // Keep the frozen local assistant on screen after Stop instead of polling.
          if (
            stopped &&
            messagesRef.current?.length &&
            messagesRef.current[messagesRef.current.length - 1]?.role === "ASSISTANT"
          ) {
            return;
          }
          if (attempt < maxAttempts - 1) {
            await new Promise((r) => setTimeout(r, stopped ? 700 : 500));
          }
          continue;
        }
        const mapped = mapHistory(history);
        /*
         * Don't take a half-saved turn as the finished one.
         *
         * The orchestrator saves a turn in pieces while it streams and writes
         * the final row only after the turn has ended — so a reconcile that
         * lands first reads a snapshot from mid-turn and, until now, replaced
         * the live turn with it. Measured on a Plan turn: the reply and the
         * second thought vanished and a command lost its name, all present
         * again after a reload. If what history holds for the latest turn
         * says less than what is already on screen, it is behind: wait and ask
         * again rather than overwrite.
         */
        const substance = (blocks: DisplayBlock[] | undefined) =>
          (blocks ?? []).reduce(
            (n, b) =>
              n +
              (b.kind === "text" || b.kind === "thinking" ? (b.text?.trim().length ?? 0) : 0) +
              (b.kind === "tool" ? 40 : 0),
            0,
          );
        const liveTail = messagesRef.current?.[messagesRef.current.length - 1];
        const savedTail = mapped[mapped.length - 1];
        if (
          liveTail?.role === "ASSISTANT" &&
          savedTail?.role === "ASSISTANT" &&
          substance(savedTail.blocks) < substance(liveTail.blocks) &&
          attempt < maxAttempts - 1
        ) {
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
        const pending = planPendingRef.current;
        // Only backfill onto a turn that actually CreatePlan — never onto
        // follow-ups or UpdatePlan-only Build turns (that spawned a second card).
        if (pending && mapped.length > 0) {
          const last = mapped[mapped.length - 1];
          const prev = mapped.length >= 2 ? mapped[mapped.length - 2] : null;
          const lastIsPlanBuild =
            prev?.role === "USER" &&
            (!!prev.planBuild || !!prev.hideBubble || (prev.seedTodos?.length ?? 0) > 0);
          if (
            last.role === "ASSISTANT" &&
            !lastIsPlanBuild &&
            turnCreatedPlan(last.blocks) &&
            !last.blocks.some((b) => b.kind === "plan" && b.planPath === pending.path)
          ) {
            // The reply stands. Dropping text over 280 characters was a guess
            // at "the model restated the plan" made from length alone, and it
            // deleted the block rather than hiding it — so whatever the model
            // actually wrote was gone, at 281 characters but not at 279.
            last.blocks = [
              ...last.blocks,
              {
                kind: "plan",
                planPath: pending.path,
                planTitle: pending.title,
              },
            ];
          }
        }
        setMessages((prev) => {
          const withPreviews = mergeAttachmentPreviews(mapped, prev);
          if (!prev?.length) return withPreviews;
          // Mocked / failed persists can return an empty page — never wipe a richer live transcript.
          if (withPreviews.length === 0 && prev.length > 0) return prev;
          const mappedIds = new Set(withPreviews.map((m) => m.id).filter((id): id is string => Boolean(id)));
          const older = prev.filter((m) => m.id && !mappedIds.has(m.id));
          // Keep in-flight optimistic turns (no DB id yet). A late reconcile from the
          // previous plan turn used to wipe Plan→Build chrome + seeded todos.
          const trailingLive: DisplayMessage[] = [];
          for (let i = prev.length - 1; i >= 0; i--) {
            if (prev[i].id) break;
            trailingLive.unshift(prev[i]);
          }
          const liveHasSubstance = (m: DisplayMessage) =>
            m.streaming ||
            m.hideBubble ||
            !!m.planBuild ||
            (m.seedTodos?.length ?? 0) > 0 ||
            m.blocks.some(
              (b) =>
                b.kind === "plan" ||
                b.kind === "tool" ||
                (b.kind === "text" && Boolean(b.text?.trim())) ||
                (b.kind === "thinking" && Boolean(b.text?.trim())),
            );
          const userTurnKey = (m: DisplayMessage | undefined) => {
            if (!m || m.role !== "USER") return "";
            if (m.planBuild?.path) return `plan-build:${m.planBuild.path}`;
            return (m.blocks.find((b) => b.kind === "text")?.text || "")
              .trim()
              .replace(/\s+/g, " ")
              .replace(/[\u2018\u2019]/g, "'");
          };
          // Drop the optimistic copy of a turn history already has (persisted
          // USER+ASSISTANT), and keep the rest.
          //
          // This used to be one flag for the whole trailing block, keyed off the
          // *first* live USER in it. When a queued follow-up drained, the block
          // held the previous turn's optimistic rows as well: the check keyed
          // off that older turn, found it persisted, and discarded the whole
          // block — so the follow-up vanished from the transcript the moment it
          // started, while Stop correctly showed a turn running. Deciding per
          // turn keeps the new one and still de-duplicates the old.
          const historyCovers = (m: DisplayMessage) => {
            const key = userTurnKey(m);
            if (!key || withPreviews.length === 0) return false;
            // Only history written after this turn was painted can be this
            // turn. Matching on text alone made every "hi" look like every
            // other "hi": a follow-up sent now was judged already-on-screen
            // because an answered "hi" from a minute ago was still in history,
            // so the live turn — bubble and running status with it — was
            // dropped, and only came back on reload.
            const from = m.afterId
              ? withPreviews.findIndex((h) => h.id === m.afterId) + 1
              : 0;
            if (from <= 0 && m.afterId) return false;
            return withPreviews.some(
              (h, i) =>
                i >= from && userTurnKey(h) === key && withPreviews[i + 1]?.role === "ASSISTANT",
            );
          };
          const liveTurns: DisplayMessage[][] = [];
          for (const row of trailingLive) {
            if (row.role === "USER" || liveTurns.length === 0) liveTurns.push([row]);
            else liveTurns[liveTurns.length - 1].push(row);
          }
          const keptLive = liveTurns
            .filter((rows) => {
              // A turn that is still streaming cannot be one history already
              // holds — it has not finished happening. Without this, a
              // follow-up painted in the same tick that the previous turn's
              // reconcile landed was matched against that turn's persisted
              // text and wiped milliseconds after it appeared, coming back
              // only when its own history arrived seconds later.
              if (rows.some((r) => r.streaming)) return true;
              return !(rows[0]?.role === "USER" && historyCovers(rows[0]));
            })
            .flat();
          // Only keep no-id live rows while a turn is still busy. Never keep just
          // because a plan card is pending — that duplicated Plan prompts.
          const keepTrailing =
            keptLive.length > 0 && busyRef.current && keptLive.some(liveHasSubstance);
          // A duration this tab estimated counts the time it was away — only
          // used when history has none.
          const prevById = new Map(
            prev
              .filter((m) => m.id && m.workedMs != null && !m.workedMsEstimated)
              .map((m) => [m.id as string, m.workedMs as number]),
          );
          const lastPrev = prev[prev.length - 1];
          const enriched = withPreviews.map((m, i) => {
            if (m.role !== "ASSISTANT") return m;
            const fromId = m.id ? prevById.get(m.id) : undefined;
            const tailPrev =
              i === withPreviews.length - 1 && lastPrev?.role === "ASSISTANT" && lastPrev.workedMs != null
                ? lastPrev
                : undefined;
            const fromTail = tailPrev && !tailPrev.workedMsEstimated ? tailPrev.workedMs : undefined;
            const local = fromId ?? fromTail ?? (m.workedMs == null ? tailPrev?.workedMs : undefined);
            let next = m;
            // Prefer the longest credible duration. History USER→ASSISTANT can be
            // short if ASSISTANT.createdAt was stamped on the first mid-turn
            // partial; live/server duration from `done` must not be shrunk.
            const merged = pickWorkedMs(m.workedMs, local);
            if (merged != null && merged !== m.workedMs) {
              next = { ...next, workedMs: merged };
            }
            const prevAssist =
              i === withPreviews.length - 1 && lastPrev?.role === "ASSISTANT"
                ? lastPrev
                : prev.find((p) => p.id && p.id === m.id);
            if (prevAssist?.role === "ASSISTANT") {
              const liveThink = prevAssist.blocks.filter((b) => b.kind === "thinking");
              let thinkIdx = 0;
              // Carry over a live plan card when history only has CreatePlan tool rows.
              if (
                i === withPreviews.length - 1 &&
                !next.blocks.some((b) => b.kind === "plan")
              ) {
                const livePlan = prevAssist.blocks.find((b) => b.kind === "plan");
                if (livePlan) {
                  next = { ...next, blocks: [...next.blocks, livePlan] };
                }
              }
              next = {
                ...next,
                blocks: next.blocks.map((b) => {
                  if (b.kind === "thinking") {
                    const live = liveThink[thinkIdx++];
                    const merged = pickWorkedMs(b.thinkingMs, live?.thinkingMs);
                    if (merged != null && merged !== b.thinkingMs) {
                      b = { ...b, thinkingMs: merged };
                    }
                  }
                  if (b.kind !== "tool" || b.tool?.name !== "Agent") return b;
                  const live = prevAssist.blocks.find(
                    (pb) =>
                      pb.kind === "tool" &&
                      pb.tool?.name === "Agent" &&
                      ((b.tool?.id && pb.tool?.id === b.tool.id) ||
                        (!!b.tool?.target && pb.tool?.target === b.tool.target)),
                  )?.tool;
                  if (!live?.subagent) return b;
                  const mappedSub = b.tool?.subagent;
                  // Never clobber a finished nested turn with a stale "running" live snapshot.
                  if (
                    mappedSub &&
                    (mappedSub.status === "done" || mappedSub.status === "error") &&
                    live.subagent.status === "running"
                  ) {
                    return b;
                  }
                  const preferLive =
                    !mappedSub ||
                    (live.subagent.blocks.length > 0 && (mappedSub.blocks?.length ?? 0) === 0);
                  if (!preferLive && b.tool?.id) return b;
                  return {
                    ...b,
                    tool: {
                      ...b.tool!,
                      id: live.id || b.tool?.id,
                      done: live.done || b.tool?.done,
                      subagent: preferLive ? live.subagent : mappedSub ?? live.subagent,
                    },
                  };
                }),
              };
            }
            return next;
          });
          return keepTrailing
            ? [...older, ...enriched, ...keptLive]
            : [...older, ...enriched];
        });
        // Only seed hasMore when we had no older pages yet.
        if (!hasMoreOlderRef.current) {
          setHasMoreOlder(page.hasMore);
          hasMoreOlderRef.current = page.hasMore;
        }
        if (reconcileOwedRef.current === tid) reconcileOwedRef.current = null;
        return;
      }
      // Gave up — leave the frozen local turn on screen. A later refresh or
      // reconnect will pick up the real persisted state once it lands.
    })();

    reconcileInflightRef.current = run;
    try {
      await run;
    } finally {
      if (reconcileInflightRef.current === run) reconcileInflightRef.current = null;
    }
  }, [project.id, threadId]);

  const loadOlderMessages = useCallback(async () => {
    if (!threadId || !hasMoreOlderRef.current || loadingOlderRef.current) return;
    const firstId = messagesRef.current?.find((m) => m.id)?.id;
    if (!firstId) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const prevTop = el?.scrollTop ?? 0;
    try {
      const page = await api.get<MessagesPage>(
        `/v1/projects/${project.id}/threads/${threadId}/messages?limit=30&before=${encodeURIComponent(firstId)}`,
      );
      const mapped = mergeAttachmentPreviews(mapHistory(page.items), messagesRef.current);
      const had = new Set((messagesRef.current ?? []).map((m) => m.id).filter(Boolean));
      setOlderShift((n) => n + mapped.filter((m) => !m.id || !had.has(m.id)).length);
      setMessages((cur) => {
        const seen = new Set((cur ?? []).map((m) => m.id).filter((id): id is string => Boolean(id)));
        const unique = mapped.filter((m) => !m.id || !seen.has(m.id));
        return [...unique, ...(cur ?? [])];
      });
      setHasMoreOlder(page.hasMore);
      hasMoreOlderRef.current = page.hasMore;
      requestAnimationFrame(() => {
        const box = scrollRef.current;
        if (box) box.scrollTop = box.scrollHeight - prevHeight + prevTop;
      });
    } catch {
      // keep current
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [threadId, project.id]);
  return { loadOlderMessages, reconcileHistory };
}
