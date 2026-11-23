import type { Dispatch, SetStateAction, RefObject } from "react";
import { useCallback } from "react";
import { api, type ChatMessageDto, type MessagesPage, type ProjectDetail } from "../../lib/api";
import { cancelAgent, orch, type OrchClient } from "../../lib/orchestrator";
import { type PlatformToolChip, type SkillInvocation } from "../PlatformToolsMenu";
import { clearPlanContentCache, formatPlanFile, parsePlanFile, planTitleFromParsed, setCachedPlanContent, type PlanTodo } from "../../lib/plan-file";
import { hydrateComposerWithFiles } from "./composer-dom";
import { demoteInProgressTodos, freezeOpenThinking, pickWorkedMs, sealOpenToolsAndDemotePlanTodos } from "./tool-model";
import { type Attachment, type ComposerHelper, type DisplayMessage } from "./types";
import type { ChatRefs } from "./refs";
import { appT } from "../../i18n/app";
import { mediumHaptic } from "../../lib/haptics";

/** Everything useStopTurn reads from the chat panel. */
export type StopTurnCtx = {
  refs: ChatRefs;
  activeWorkedMs: (started?: number | null, fallbackStartedAtMs?: number) => number | undefined;
  busy: boolean;
  client: OrchClient;
  onFilesChanged: (paths?: string[]) => void;
  onReloadPreview: (() => void) | undefined;
  planPendingRef: RefObject<{ path: string; title: string; overview: string; status: "ready" | "building" | "built"; } | null>;
  project: ProjectDetail;
  resizeEditor: (el: HTMLElement | null) => void;
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setComposerHelper: Dispatch<SetStateAction<ComposerHelper | null>>;
  setFollowUpQueue: Dispatch<SetStateAction<{ id: string; text: string; skills?: SkillInvocation[]; attachments?: Attachment[]; }[]>>;
  setInput: Dispatch<SetStateAction<string>>;
  setMessages: Dispatch<SetStateAction<DisplayMessage[] | null>>;
  setPendingModeSwitch: Dispatch<SetStateAction<{ toolCallId: string; target: "plan"; reason?: string; prompt: string; } | null>>;
  setPendingQuestion: Dispatch<SetStateAction<{ toolCallId: string; questions: Array<{ id: string; prompt: string; options: Array<{ id: string; label: string; }>; }>; } | null>>;
  setPendingSecrets: Dispatch<SetStateAction<{ requestId: string; keys: string[]; reason?: string; } | null>>;
  setPlanPendingApprove: Dispatch<SetStateAction<{ path: string; title: string; overview: string; status: "ready" | "building" | "built"; } | null>>;
  setPlanStatusByPath: Dispatch<SetStateAction<Record<string, "ready" | "building" | "built">>>;
  setPlatformChip: Dispatch<SetStateAction<PlatformToolChip | null>>;
  setStopping: Dispatch<SetStateAction<boolean>>;
  threadId: string | undefined;
  toast: (kind: "success" | "error" | "info", message: string) => void;
};

export function useStopTurn(ctx: StopTurnCtx) {
  const {
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
  } = ctx;
  const {
    abortRef,
    applyEmptyStopRestoreRef,
    askWaitAccumRef,
    askWaitStartedRef,
    busyRef,
    contentFrozenRef,
    discardEmptyRestoredTurnRef,
    editorRef,
    emptyStopRestoreRef,
    emptyStopSealedRef,
    expectRemoteLockRef,
    immediateSendRef,
    messagesRef,
    restoreComposerRef,
    sendAbortRef,
    sendGenerationRef,
    sendStartsRef,
    suppressReconcileRef,
    suppressSendUntilRef,
    turnStartedAtRef,
  } = ctx.refs;

  /** Text, files, chip and caret back into the main composer. Nothing else. */
  const restoreComposer = useCallback(
    (stash: NonNullable<typeof emptyStopRestoreRef.current>) => {
      setComposerHelper(null);
      setInput(stash.text);
      setAttachments(stash.attachments);
      setPlatformChip(stash.platformTool ?? null);
      const el = editorRef.current;
      if (el) {
        hydrateComposerWithFiles(
          el,
          stash.text,
          stash.attachments.filter((a) => !a.isImage),
          stash.segments,
          stash.platformTool ?? undefined,
        );
        resizeEditor(el);
        el.focus();
      }
    },
    [resizeEditor],
  );
  restoreComposerRef.current = restoreComposer;

  // Stop freezes tokens immediately (Cursor-style), cancels the remote agent,
  // and aborts the local SSE reader. Follow-ups wait for the remote lock via
  // waitForAgentInactive inside send() so we don't race "build already running".
  const applyEmptyStopRestore = useCallback(
    (stash: NonNullable<typeof emptyStopRestoreRef.current>) => {
      emptyStopRestoreRef.current = null;
      emptyStopSealedRef.current = true;
      restoreComposer(stash);
      // Invalidate in-flight send() so its finally won't reseal over the restore.
      sendGenerationRef.current += 1;
      busyRef.current = false;
      setBusy(false);
      // Keep `stopping` true until after the Stop click gesture ends — clearing
      // it here swapped Stop→Send under the cursor and re-sent the prompt.
      turnStartedAtRef.current = null;
      setFollowUpQueue([]);
    },
    [restoreComposer],
  );
  applyEmptyStopRestoreRef.current = applyEmptyStopRestore;

  /**
   * Empty-Stop / empty-failure put the prompt back in the composer. Drop the
   * USER row (+ trailing ASSISTANT) so a refresh doesn't resurrect the turn.
   * Retries cover agent-begin / late agent-result races.
   */
  const discardEmptyRestoredTurn = useCallback(
    (fromMessageId?: string | null, expectedText?: string) => {
      if (!threadId) return;
      suppressReconcileRef.current = true;
      const fromId = fromMessageId ?? null;
      const startsAtStop = sendStartsRef.current;
      const sentAgain = () => sendStartsRef.current !== startsAtStop;
      // When this turn never reached the server there is no row of its own, and
      // "the last USER" is the previous, finished turn — deleting it erased a
      // real conversation. Only a USER carrying the text being restored is ours.
      const expected = (expectedText ?? "").trim();
      const isOurs = (item: ChatMessageDto): boolean => {
        if (!expected) return false;
        const blocks = Array.isArray(item.content) ? (item.content as Array<{ type?: string; text?: string }>) : [];
        const text = blocks
          .filter((b) => b?.type === "text" && typeof b.text === "string")
          .map((b) => b.text)
          .join("\n");
        return text.includes(expected);
      };
      void (async () => {
        try {
          let id: string | null = fromId;
          for (let attempt = 0; attempt < 20 && !id; attempt++) {
            if (attempt > 0) await new Promise((r) => setTimeout(r, 150));
            const page = await api.get<MessagesPage>(
              `/v1/projects/${project.id}/threads/${threadId}/messages?limit=30`,
            );
            const items = page.items;
            // Last USER is the restored turn — skip a trailing ASSISTANT even when
            // agent-result already wrote the error text into it.
            let i = items.length - 1;
            if (i >= 0 && items[i].role === "ASSISTANT") i--;
            if (i >= 0 && items[i].role === "USER") {
              if (!isOurs(items[i])) break;
              id = items[i].id;
            }
          }
          if (sentAgain()) return;
          if (id) {
            await api.post(`/v1/projects/${project.id}/threads/${threadId}/truncate`, {
              fromMessageId: id,
            });
          }
          // Late agent-result may write an ASSISTANT after USER was removed, or an
          // empty ASSISTANT stub after truncate. Never delete a prior completed turn.
          for (let attempt = 0; attempt < 8; attempt++) {
            await new Promise((r) => setTimeout(r, 400));
            if (!emptyStopSealedRef.current || sentAgain()) break;
            const again = await api.get<MessagesPage>(
              `/v1/projects/${project.id}/threads/${threadId}/messages?limit=10`,
            );
            const items = again.items;
            const tail = items[items.length - 1];
            if (!tail || tail.role !== "ASSISTANT") break;
            const prev = items[items.length - 2];
            const empty =
              !Array.isArray(tail.content) || tail.content.length === 0;
            if (!prev || prev.role !== "USER") {
              if (sentAgain()) break;
              // Orphan ASSISTANT after USER truncate.
              await api.post(`/v1/projects/${project.id}/threads/${threadId}/truncate`, {
                fromMessageId: tail.id,
              });
              continue;
            }
            if (empty) {
              if (!isOurs(prev) || sentAgain()) break;
              await api.post(`/v1/projects/${project.id}/threads/${threadId}/truncate`, {
                fromMessageId: prev.id,
              });
              continue;
            }
            break;
          }
        } catch {
          // Best-effort — local UI already restored.
        } finally {
          suppressReconcileRef.current = false;
        }
      })();
    },
    [project.id, threadId],
  );
  discardEmptyRestoredTurnRef.current = discardEmptyRestoredTurn;

  const freezeTurnLocally = useCallback(
    (opts?: { restoreToInput?: boolean }) => {
      contentFrozenRef.current = true;
      // Stopped mid-Build — put the plan back to Ready so they can retry.
      const stoppedMidBuild = planPendingRef.current?.status === "building";
      const stoppedPlanPath = stoppedMidBuild
        ? planPendingRef.current!.path.replace(/^\/home\/user\/app\//, "")
        : null;
      if (stoppedMidBuild) {
        setPlanPendingApprove((p) =>
          p?.status === "building" ? { ...p, status: "ready" } : p,
        );
        // Don't let history merge re-promote this path to Built this tick.
        setPlanStatusByPath((prev) => {
          if (!stoppedPlanPath) return prev;
          return { ...prev, [stoppedPlanPath]: "ready" };
        });
      }
      const started = turnStartedAtRef.current ?? undefined;
      const worked = activeWorkedMs(started);
      askWaitAccumRef.current = 0;
      askWaitStartedRef.current = null;

      // Decide restore + next messages from the ref synchronously (mutateLast keeps
      // it current). Do not put restore flags inside setState updaters — React may
      // run those after we continue and we'd wipe the stash without hydrating.
      const source = messagesRef.current;
      let restoreEmptyTurn = false;
      let truncateFromId: string | null = null;
      let nextMessages: DisplayMessage[] | null | undefined = source;

      const stash = emptyStopRestoreRef.current;
      const wantRestore = Boolean(opts?.restoreToInput && stash && !immediateSendRef.current);

      if (source?.length) {
        const last = source[source.length - 1];
        if (last?.role === "ASSISTANT") {
          const hasWork = last.blocks.some(
            (b) =>
              b.kind === "tool" ||
              (b.kind === "text" && Boolean(b.text?.trim())) ||
              (b.kind === "thinking" && Boolean(b.text?.trim())),
          );
          if (!hasWork) {
            // Empty assistant (planning / errored with no tokens) — drop the turn.
            restoreEmptyTurn = true;
            let next = source.slice(0, -1);
            const user = next[next.length - 1];
            if (user?.role === "USER") {
              truncateFromId = user.id ?? null;
              next = next.slice(0, -1);
            }
            nextMessages = next;
          } else if (last.streaming) {
            const next = [...source];
            // Always demote leftover in_progress Task* (not only Plan→Build) so
            // the sticky checklist spinner stops when they hit Stop.
            const sealedBlocks = sealOpenToolsAndDemotePlanTodos(
              freezeOpenThinking(last.blocks),
            );
            next[next.length - 1] = {
              ...last,
              blocks: sealedBlocks,
              streaming: false,
              statusHint: undefined,
              workedMs: pickWorkedMs(last.workedMs, worked, activeWorkedMs(null, last.startedAtMs)),
            };
            // Demote seedTodos on the Plan→Build USER so sticky checklist clears.
            if (stoppedMidBuild && next.length >= 2) {
              const userIdx = next.length - 2;
              const user = next[userIdx];
              if (user?.role === "USER" && user.seedTodos?.length) {
                next[userIdx] = {
                  ...user,
                  seedTodos: demoteInProgressTodos(user.seedTodos),
                };
              }
            }
            nextMessages = next;
          } else if (wantRestore) {
            // Prior completed turn still on screen; optimistic paint not flushed yet.
            restoreEmptyTurn = true;
          }
        } else if (last?.role === "USER" && wantRestore) {
          restoreEmptyTurn = true;
          truncateFromId = last.id ?? null;
          nextMessages = source.slice(0, -1);
        }
      } else if (wantRestore) {
        restoreEmptyTurn = true;
      }

      messagesRef.current = nextMessages ?? null;
      setMessages(nextMessages ?? null);

      // Stop mid-Build: demote in_progress → pending on disk so View Plan doesn't
      // keep a spinner (agent was killed before it could UpdatePlan).
      if (stoppedMidBuild && stoppedPlanPath) {
        void (async () => {
          try {
            const file = await orch.readFile(client, stoppedPlanPath);
            const parsed = parsePlanFile(file.content || "");
            if (!parsed.todos.some((t) => t.status === "in_progress")) {
              clearPlanContentCache(stoppedPlanPath);
              return;
            }
            const content = formatPlanFile({
              name: planTitleFromParsed(parsed, stoppedPlanPath),
              overview: parsed.overview,
              todos: demoteInProgressTodos(parsed.todos) as PlanTodo[],
              body: parsed.body,
            });
            setCachedPlanContent(stoppedPlanPath, content);
            await orch.writeFile(client, stoppedPlanPath, content);
          } catch {
            clearPlanContentCache(stoppedPlanPath);
          }
        })();
      }

      if (restoreEmptyTurn && stash && wantRestore) {
        applyEmptyStopRestore(stash);
      } else {
        emptyStopRestoreRef.current = null;
      }

      // Drop the persisted USER row (+ any empty ASSISTANT stubs) so refresh stays clean.
      // Retry briefly — agent-begin may still be in flight when Stop lands.
      // If send never started (no abort controller), the USER was never persisted —
      // don't poll /messages looking for a row that does not exist.
      if (threadId && (truncateFromId || restoreEmptyTurn) && (truncateFromId || sendAbortRef.current)) {
        suppressReconcileRef.current = true;
        const fromId = truncateFromId;
        const startsAtStop = sendStartsRef.current;
        const sentAgain = () => sendStartsRef.current !== startsAtStop;
        void (async () => {
          try {
            let id: string | null = fromId;
            for (let attempt = 0; attempt < 4 && !id; attempt++) {
              if (attempt > 0) await new Promise((r) => setTimeout(r, 150));
              const page = await api.get<MessagesPage>(
                `/v1/projects/${project.id}/threads/${threadId}/messages?limit=30`,
              );
              const items = page.items;
              let i = items.length - 1;
              while (
                i >= 0 &&
                items[i].role === "ASSISTANT" &&
                (!Array.isArray(items[i].content) || items[i].content.length === 0)
              ) {
                i--;
              }
              if (i >= 0 && items[i].role === "USER") id = items[i].id;
            }
            if (!id || sentAgain()) return;
            await api.post(`/v1/projects/${project.id}/threads/${threadId}/truncate`, {
              fromMessageId: id,
            });
            // Agent may still write an empty ASSISTANT after truncate — strip again.
            await new Promise((r) => setTimeout(r, 400));
            if (sentAgain()) return;
            const again = await api.get<MessagesPage>(
              `/v1/projects/${project.id}/threads/${threadId}/messages?limit=10`,
            );
            const tail = again.items[again.items.length - 1];
            if (
              tail?.role === "ASSISTANT" &&
              (!Array.isArray(tail.content) || tail.content.length === 0)
            ) {
              const prev = again.items[again.items.length - 2];
              if (prev?.role === "USER" && !sentAgain()) {
                await api.post(`/v1/projects/${project.id}/threads/${threadId}/truncate`, {
                  fromMessageId: prev.id,
                });
              }
            }
          } catch {
            // Best-effort — local UI already restored; server discard-empty-stop is backup.
          } finally {
            suppressReconcileRef.current = false;
          }
        })();
      }

      setPendingQuestion(null);
      setPendingSecrets(null);
    },
    [project.id, resizeEditor, threadId, applyEmptyStopRestore, client, onFilesChanged, onReloadPreview],
  );

  const stop = () => {
    // Firmer than a send's tap: Stop changes what is happening.
    mediumHaptic();
    // Cancel FIRST — aborting the SSE alone does not stop the sandbox
    // (orch keeps the turn alive for refresh). Without /agent/cancel the model
    // keeps going and the reply reappears after "empty stop".
    contentFrozenRef.current = true;
    expectRemoteLockRef.current = true;
    // Kill any pending "send after this turn" so empty-stop can't re-POST.
    // That pending send is the only thing Stop needs to cancel here: the queue
    // holds other messages the user wrote, and dropping them made ↑ on one
    // queued item silently delete the rest.
    immediateSendRef.current = null;
    setPendingModeSwitch(null);
    setStopping(true);
    // Cover mouseup/click of this same gesture after Stop→Send would remount.
    suppressSendUntilRef.current = Date.now() + 750;
    // Always POST cancel. After refresh / a second tab, this client never ran
    // send() so sendAbortRef is empty — gating on it left the sandbox running
    // while the UI froze. Idle cancel is a no-op (no stop-intent landmine).
    void cancelAgent(client)
      .then((ok) => {
        if (!ok) {
          toast("error", appT().thread.toasts.stopUnreachable);
        }
      })
      .catch(() => {
        toast("error", appT().thread.toasts.stopUnreachable);
      });
    sendAbortRef.current?.abort();
    abortRef.current?.abort();

    // Even if busy already flipped false, Send may have cleared the composer
    // while a stash remains — put it back.
    if (!busyRef.current && !busy) {
      const stash = emptyStopRestoreRef.current;
      if (stash) {
        const last = messagesRef.current?.[messagesRef.current.length - 1];
        const emptyAssist =
          last?.role === "ASSISTANT" &&
          !last.blocks.some(
            (b) =>
              b.kind === "tool" ||
              (b.kind === "text" && Boolean(b.text?.trim())) ||
              (b.kind === "thinking" && Boolean(b.text?.trim())),
          );
        if (emptyAssist || last?.role === "USER" || !last) {
          freezeTurnLocally({ restoreToInput: true });
        }
      } else {
        window.setTimeout(() => setStopping(false), 400);
      }
      return;
    }
    freezeTurnLocally({ restoreToInput: true });
  };
  return { freezeTurnLocally, stop };
}
