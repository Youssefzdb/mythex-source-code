import type { Dispatch, SetStateAction, RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";
import { canBuyPlans } from "../../lib/native";
import { type ProjectDetail } from "../../lib/api";
import { agentStatus, invalidateAgentStatus, orch, streamAgentResume, type AgentEvent, type OrchClient, type RunningService } from "../../lib/orchestrator";
import { track } from "../../lib/analytics";
import { type SkillInvocation } from "../PlatformToolsMenu";
import { fallbackTodosFromPlanBody, parsePlanFile, parsePlanToolResult, patchCachedPlanTodos, planOverviewFromParsed, planTitleFromParsed, planTitleFromPath, setCachedPlanContent } from "../../lib/plan-file";
import { COMPOSER_HELPER_CODES, isAgentTurnTerminal, lastUserPrompt, makeComposerHelper } from "./agent";
import { normalizePlanUiPath, sealOptimisticPlanBuildPaint, seedTodosForPlanBuildUser } from "./history";
import { EDIT_TOOLS, applyNestedEvent, completeInProgressTodos, findCreatePlanPathInBlocks, freezeOpenThinking, makeToolCall, pickWorkedMs, planOverviewFromText, planTitleFromText, sealOpenTools, sealOpenToolsAndCompletePlanTodos, sealWorkedMs, tasksFromDetail, todosAllCompleted, todosFromDetail, toolResultDetail, turnCreatedPlan } from "./tool-model";
import { type AgentMode, type AgentTodo, type Attachment, type ComposerHelper, type DisplayBlock, type DisplayMessage, type SubagentState } from "./types";
import type { ChatRefs } from "./refs";
import { appT } from "../../i18n/app";
import { successHaptic } from "../../lib/haptics";

/** Everything useAgentStream reads from the chat panel. */
export type AgentStreamCtx = {
  refs: ChatRefs;
  activeWorkedMs: (started?: number | null, fallbackStartedAtMs?: number) => number | undefined;
  agentModeRef: RefObject<AgentMode>;
  appChanged: () => void | undefined;
  client: OrchClient;
  onFilesChanged: (paths?: string[]) => void;
  onReloadPreview: (() => void) | undefined;
  onRunUpdate: (previewUrl: string | null, healthy: boolean, services?: RunningService[], opts?: { forceReload?: boolean; }) => void;
  pendingQuestion: { toolCallId: string; questions: Array<{ id: string; prompt: string; options: Array<{ id: string; label: string; }>; }>; } | null;
  planPendingRef: RefObject<{ path: string; title: string; overview: string; status: "ready" | "building" | "built"; } | null>;
  project: ProjectDetail;
  reconcileHistory: (turnThreadId?: string) => Promise<void>;
  refresh: (opts?: { force?: boolean; }) => Promise<void>;
  sandboxReady: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setComposerHelper: Dispatch<SetStateAction<ComposerHelper | null>>;
  setFollowUpQueue: Dispatch<SetStateAction<{ id: string; text: string; skills?: SkillInvocation[]; attachments?: Attachment[]; }[]>>;
  setMessages: Dispatch<SetStateAction<DisplayMessage[] | null>>;
  setPendingModeSwitch: Dispatch<SetStateAction<{ toolCallId: string; target: "plan"; reason?: string; prompt: string; } | null>>;
  setPendingQuestion: Dispatch<SetStateAction<{ toolCallId: string; questions: Array<{ id: string; prompt: string; options: Array<{ id: string; label: string; }>; }>; } | null>>;
  setPendingSecrets: Dispatch<SetStateAction<{ requestId: string; keys: string[]; reason?: string; kind?: "app_store" | "google_play"; } | null>>;
  setPlanPendingApprove: Dispatch<SetStateAction<{ path: string; title: string; overview: string; status: "ready" | "building" | "built"; } | null>>;
  setPlanStatusByPath: Dispatch<SetStateAction<Record<string, "ready" | "building" | "built">>>;
  setQuestionAnswers: Dispatch<SetStateAction<Record<string, string>>>;
  setQuestionCustom: Dispatch<SetStateAction<Record<string, string>>>;
  threadId: string | undefined;
  toast: (kind: "success" | "error" | "info", message: string) => void;
};

export function useAgentStream(ctx: AgentStreamCtx) {
  const {
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
  } = ctx;
  const {
    abortRef,
    applyEmptyStopRestoreRef,
    askWaitAccumRef,
    askWaitStartedRef,
    busyRef,
    contentFrozenRef,
    discardEmptyRestoredTurnRef,
    emptyStopRestoreRef,
    emptyStopSealedRef,
    historyReadyRef,
    immediateSendRef,
    messagesRef,
    pinnedToBottom,
    reconnectDropAttemptsRef,
    reconnectHollowAttemptsRef,
    reconnectStatusAttemptsRef,
    reconnectedRef,
    reloadPreviewDoneRef,
    reloadPreviewIdsRef,
    sendAbortRef,
    turnStartedAtRef,
    usageSeenRef,
  } = ctx.refs;

  // Mutate the trailing (streaming) assistant message. Shared by the live send
  // stream and the mid-build reconnect stream so both render identically.
  const mutateLast = useCallback((fn: (message: DisplayMessage) => DisplayMessage) => {
    setMessages((all) => {
      if (!all || all.length === 0) return all;
      const copy = [...all];
      copy[copy.length - 1] = fn({ ...copy[copy.length - 1], blocks: [...copy[copy.length - 1].blocks] });
      // Keep ref in sync for Stop — otherwise freeze sees a stale empty assistant
      // and takes the empty-restore path while tokens are already on screen.
      messagesRef.current = copy;
      return copy;
    });
  }, []);

  const finalizePlanTurn = useCallback(async () => {
    if (agentModeRef.current !== "plan") return;
    const snapshot = await new Promise<DisplayMessage[]>((resolve) => {
      setMessages((cur) => {
        resolve(cur ?? []);
        return cur;
      });
    });
    const last = snapshot[snapshot.length - 1];
    if (!last || last.role !== "ASSISTANT") return;

    // Only materialize a plan card when this turn called CreatePlan.
    // UpdatePlan / follow-ups / inventing from chat text must not attach a card.
    if (!turnCreatedPlan(last.blocks)) return;
    const path =
      findCreatePlanPathInBlocks(last.blocks) ||
      last.blocks.find((b) => b.kind === "plan")?.planPath ||
      null;
    if (!path) return;

    const text = last.blocks
      .filter((b) => b.kind === "text")
      .map((b) => b.text || "")
      .join("\n")
      .trim();

    // Prefer metadata from the saved plan file when available.
    let title = text ? planTitleFromText(text, path) : planTitleFromPath(path);
    let overview = text ? planOverviewFromText(text) : planPendingRef.current?.overview || "";
    try {
      const file = await orch.readFile(client, path.replace(/^\/home\/user\/app\//, ""));
      const parsed = parsePlanFile(file.content || "");
      title = planTitleFromParsed(parsed, path);
      overview = planOverviewFromParsed(parsed) || overview;
    } catch {
      /* keep text-derived title/overview */
    }
    const finalPath = path;
    setPlanPendingApprove({ path: finalPath, title, overview, status: "ready" });
    mutateLast((m) => {
      // Prefer in-place update — strip+re-push remounted PlanCard (fade-up flicker)
      // every time done/finally raced after the live CreatePlan inject.
      const existingIdx = m.blocks.findIndex((b) => b.kind === "plan");
      if (existingIdx >= 0) {
        const prev = m.blocks[existingIdx];
        if (
          prev.planPath === finalPath &&
          prev.planTitle === title &&
          (prev.planOverview || "") === (overview || "")
        ) {
          return m;
        }
        const blocks = [...m.blocks];
        blocks[existingIdx] = {
          ...prev,
          kind: "plan",
          planPath: finalPath,
          planTitle: title,
          planOverview: overview || prev.planOverview,
        };
        return { ...m, blocks };
      }
      /**
       * The turn keeps what it said, and the card is appended to it.
       *
       * This used to delete every text block over 280 characters and, if that
       * left the turn mute, push a sentence of our own wording in its place —
       * shown as the assistant's, with nothing marking the substitution. A turn
       * that writes nothing now simply shows its card.
       */
      const next = [
        ...m.blocks,
        { kind: "plan" as const, planPath: finalPath, planTitle: title, planOverview: overview || undefined },
      ];
      return { ...m, blocks: next };
    });
  }, [client, mutateLast, toast]);

  // Apply one agent SSE event to the current assistant message. Used verbatim by
  // both `send` (POST stream) and the reconnect (`/agent/stream`) replay+live.
  const applyEvent = useCallback(
    (event: AgentEvent) => {
      // The first write is the first moment there is an app to look at, and
      // this is the only place the tool's name is known outside a state
      // updater — the `shouldRefreshPreview` flag below is set inside one, so
      // it is still false on the line that reads it.
      if (event.type === "tool" && EDIT_TOOLS.has(String(event.name ?? ""))) {
        appChanged();
      }
      // After Stop / send-now, keep the frozen partial reply — ignore late tokens.
      // Still accept terminal/billing/run so cost refresh + preview stay correct.
      if (
        contentFrozenRef.current &&
        (event.type === "thinking" ||
          event.type === "text" ||
          event.type === "tool" ||
          event.type === "tool_update" ||
          event.type === "tool_result" ||
          event.type === "subagent_start" ||
          event.type === "subagent_event" ||
          event.type === "subagent_end" ||
          event.type === "question" ||
          event.type === "error")
      ) {
        return;
      }
      // The agent asked for the pane to reload. Decided here, from the event —
      // a flag set inside the mutateLast updater below is not set yet on the
      // line after it while the stream is busy. A restart reloads the pane
      // through the `run` event instead (Workspace handleRunUpdate), so only a
      // plain "Reloaded the preview." acts here.
      if (event.type === "tool" && event.name === "ReloadPreview" && typeof event.id === "string") {
        reloadPreviewIdsRef.current.add(event.id);
      } else if (event.type === "tool_result" && typeof event.tool_use_id === "string") {
        const id = event.tool_use_id;
        if (reloadPreviewIdsRef.current.has(id) && !reloadPreviewDoneRef.current.has(id)) {
          reloadPreviewDoneRef.current.add(id);
          if (!event.isError && (toolResultDetail(event) ?? "").startsWith("Reloaded")) onReloadPreview?.();
        }
      }
      switch (event.type) {
        case "thinking":
          mutateLast((message) => {
            // Keep exact sequence: append only while the latest block is still
            // thinking; after a tool/text, start a new thinking segment.
            const tail = message.blocks[message.blocks.length - 1];
            if (tail?.kind === "thinking" && tail.thinkingMs == null) {
              message.blocks[message.blocks.length - 1] = {
                ...tail,
                text: (tail.text ?? "") + (event.text as string),
              };
            } else {
              message.blocks = freezeOpenThinking(message.blocks);
              message.blocks.push({
                kind: "thinking",
                text: event.text as string,
                thinkingStartedAt: Date.now(),
              });
            }
            return message;
          });
          break;
        case "text":
          // Never surface the legacy synthetic stop line if a stale server still emits it.
          if (String(event.text || "").trim() === "Stopped.") break;
          mutateLast((message) => {
            const tail = message.blocks[message.blocks.length - 1];
            if (tail?.kind === "text") {
              message.blocks[message.blocks.length - 1] = { ...tail, text: (tail.text ?? "") + (event.text as string) };
            } else {
              message.blocks = freezeOpenThinking(message.blocks);
              message.blocks.push({ kind: "text", text: event.text as string });
            }
            return message;
          });
          break;
        case "tool":
          mutateLast((message) => {
            const id = event.id as string | undefined;
            // Ignore a duplicate start for an id we already have.
            if (id && message.blocks.some((b) => b.kind === "tool" && b.tool?.id === id)) return message;
            message.blocks = freezeOpenThinking(message.blocks);
            const name = event.name as string;
            message.blocks.push({
              kind: "tool",
              tool: makeToolCall(name, event.input, {
                id,
                done: false,
                ...(name === "Await" ? { awaitStartedAt: Date.now() } : {}),
              }),
            });
            return message;
          });
          break;
        case "tool_update":
          mutateLast((message) => {
            const id = event.id as string | undefined;
            const name = (event.name as string) || "";
            if (event.background_done && id) {
              const idx = message.blocks.findIndex((b) => b.kind === "tool" && b.tool?.id === id);
              if (idx >= 0 && message.blocks[idx].kind === "tool") {
                const block = message.blocks[idx];
                const prev = block.tool!;
                message.blocks[idx] = {
                  ...block,
                  tool: { ...prev, done: true, background: false },
                };
              }
              return message;
            }
            // Structured shell_id the instant a background shell starts (see
            // stream.mjs) — attach the terminal pane now instead of waiting
            // for the eventual tool_result and regex-parsing its prose.
            if (typeof event.shell_id === "string" && id) {
              const idx = message.blocks.findIndex((b) => b.kind === "tool" && b.tool?.id === id);
              if (idx >= 0 && message.blocks[idx].kind === "tool") {
                const block = message.blocks[idx];
                const prev = block.tool!;
                message.blocks[idx] = {
                  ...block,
                  tool: { ...prev, background: true, shellId: event.shell_id as string },
                };
              }
              return message;
            }
            const patch = makeToolCall(name || "Tool", event.input, { id, done: false });
            const idx = id
              ? message.blocks.findIndex((b) => b.kind === "tool" && b.tool?.id === id)
              : message.blocks.map((b) => b.kind).lastIndexOf("tool");
            if (idx >= 0 && message.blocks[idx].kind === "tool") {
              const block = message.blocks[idx];
              const prev = block.tool!;
              message.blocks[idx] = {
                ...block,
                tool: {
                  ...prev,
                  name: name || prev.name,
                  target: patch.target || prev.target,
                  label: patch.label ?? prev.label,
                  awaitBudgetMs: patch.awaitBudgetMs ?? prev.awaitBudgetMs,
                  todos: patch.todos ?? prev.todos,
                  image: patch.image ?? prev.image,
                  task: patch.task
                    ? { ...prev.task, ...patch.task, content: patch.task.content || prev.task?.content || "" }
                    : prev.task,
                },
              };
            } else if (id) {
              message.blocks.push({
                kind: "tool",
                tool: { ...patch, id, name: name || patch.name },
              });
            }
            return message;
          });
          break;
        case "tool_output_chunk":
          mutateLast((message) => {
            const id = event.id as string | undefined;
            const chunk = event.chunk as string | undefined;
            if (!id || !chunk) return message;
            const idx = message.blocks.findIndex((b) => b.kind === "tool" && b.tool?.id === id);
            if (idx >= 0 && message.blocks[idx].kind === "tool") {
              const block = message.blocks[idx];
              const prev = block.tool!;
              const merged = (prev.detail ?? "") + chunk;
              const detail = merged.length > 8000 ? `…${merged.slice(-8000)}` : merged;
              message.blocks[idx] = { ...block, tool: { ...prev, detail } };
            }
            return message;
          });
          break;
        case "tool_result": {
          // Only Write/Edit should soft-refresh the preview — Grep/Read/Bash
          // remounting the iframe is what made the preview flash mid-turn.
          let shouldRefreshPreview = false;
          let editedPath: string | null = null;
          let planWrittenPath: string | null = null;
          let planWrittenTitle: string | null = null;
          let planWrittenOverview = "";
          mutateLast((message) => {
            const id = event.tool_use_id as string | undefined;
            let idx = id
              ? message.blocks.findIndex((b) => b.kind === "tool" && b.tool?.id === id && !b.tool?.done)
              : -1;
            if (idx < 0) {
              // Prefer oldest pending tool (FIFO). Results without ids usually
              // complete in start order; LIFO wrongly leaves earlier cards spinning.
              for (let i = 0; i < message.blocks.length; i++) {
                if (message.blocks[i].kind === "tool" && !message.blocks[i].tool!.done) {
                  idx = i;
                  break;
                }
              }
            }
            if (idx >= 0) {
              const block = message.blocks[idx];
              const detail = toolResultDetail(event);
              const fromDetail =
                block.tool?.name === "TodoWrite" ? todosFromDetail(detail) : undefined;
              const fromTaskDetail =
                block.tool?.name === "TaskCreate" ||
                block.tool?.name === "TaskUpdate" ||
                block.tool?.name === "TaskList"
                  ? tasksFromDetail(detail)?.[0]
                  : undefined;
              // Plan tools update .mythex/plans only — don't bounce the app preview
              // (and CodeView file reloads) on every UpdatePlan during Plan mode.
              if (!event.isError && EDIT_TOOLS.has(block.tool?.name ?? "")) {
                shouldRefreshPreview = true;
              }
              const stayBackground =
                block.tool?.name === "Bash" && !!(block.tool.background || block.tool.shellId);
              const awaitMs =
                block.tool?.name === "Await" && block.tool.awaitStartedAt != null
                  ? Math.max(0, Date.now() - block.tool.awaitStartedAt)
                  : block.tool?.awaitMs;
              const prevTool = block.tool!;
              // Backfill path from result prose when streaming never delivered file_path
              // (e.g. model emitted content before path).
              let target = prevTool.target;
              if (!target && typeof detail === "string") {
                const fromWrite = detail.match(/^Wrote \d+ bytes to (.+)$/m)?.[1]?.trim();
                const fromEdit = detail.match(/^Edited (.+?) \(/m)?.[1]?.trim();
                const guessed = fromWrite || fromEdit || "";
                if (guessed) target = guessed.replace(/^\/home\/user\/app\//, "");
              }
              if (shouldRefreshPreview && target) {
                editedPath = target.replace(/^\.\//, "");
              }
              message.blocks[idx] = {
                ...block,
                tool: {
                  ...prevTool,
                  target: target || prevTool.target,
                  // Mark done so later tool_results (e.g. Await) don't bind here; keep
                  // `background` so the terminal card stays live until exit.
                  done: true,
                  background: stayBackground ? true : undefined,
                  shellId: prevTool.shellId,
                  awaitMs,
                  isError: Boolean(event.isError),
                  ...(detail ? { detail } : {}),
                  ...(fromDetail && !prevTool.todos?.length ? { todos: fromDetail } : {}),
                  ...(fromTaskDetail
                    ? {
                        task: {
                          ...prevTool.task,
                          ...fromTaskDetail,
                          content: fromTaskDetail.content || prevTool.task?.content || "",
                        },
                      }
                    : {}),
                },
              };
              // Plan card only from CreatePlan. UpdatePlan refreshes cache/todos only.
              if (!event.isError) {
                const planResult = parsePlanToolResult(detail);
                const isCreate = block.tool?.name === "CreatePlan";
                const isUpdate = block.tool?.name === "UpdatePlan";
                if (planResult && (isCreate || isUpdate)) {
                  const path = planResult.path;
                  const title = planResult.name || planTitleFromPath(path);
                  editedPath = path;
                  // Patch tool target so findPlanPathInBlocks / history see the path.
                  message.blocks[idx] = {
                    ...message.blocks[idx],
                    tool: {
                      ...message.blocks[idx].tool!,
                      target: path,
                    },
                  };
                  // Keep View Plan cache in sync with tool JSON during Build too —
                  // otherwise the tab stays on stale CreatePlan todos (all pending).
                  if (planResult.todos.length) {
                    patchCachedPlanTodos(path, planResult.todos, {
                      name: planResult.name || title,
                      overview: planResult.overview,
                    });
                    // Built = all todos completed (Stop→continue must not require "building").
                    if (todosAllCompleted(planResult.todos)) {
                      setPlanPendingApprove((p) => {
                        const pPath = p?.path?.replace(/^\/home\/user\/app\//, "");
                        if (pPath && pPath !== path) return p;
                        return p
                          ? { ...p, path: p.path || path, title: p.title || title, overview: p.overview || planResult.overview || "", status: "built" }
                          : { path, title, overview: planResult.overview || "", status: "built" };
                      });
                      setPlanStatusByPath((prev) => ({ ...prev, [path]: "built" }));
                    }
                  }
                  if (
                    isCreate &&
                    agentModeRef.current === "plan" &&
                    planPendingRef.current?.status !== "building" &&
                    planPendingRef.current?.status !== "built"
                  ) {
                    planWrittenPath = path;
                    planWrittenTitle = title;
                    planWrittenOverview = planResult.overview || "";
                    const existing = message.blocks.findIndex(
                      (b) => b.kind === "plan" && b.planPath === path,
                    );
                    const planBlock: DisplayBlock = {
                      kind: "plan",
                      planPath: path,
                      planTitle: title,
                      planOverview: planResult.overview || undefined,
                    };
                    if (existing >= 0) message.blocks[existing] = planBlock;
                    else message.blocks.push(planBlock);
                  } else if (
                    isUpdate &&
                    agentModeRef.current === "plan" &&
                    planPendingRef.current?.status !== "building"
                  ) {
                    // Refresh title/overview on the existing CreatePlan card only.
                    const existing = message.blocks.findIndex(
                      (b) => b.kind === "plan" && b.planPath === path,
                    );
                    if (existing >= 0) {
                      message.blocks[existing] = {
                        ...message.blocks[existing],
                        planTitle: title,
                        planOverview: planResult.overview || message.blocks[existing].planOverview,
                      };
                    }
                  }
                }
              }
            }
            return message;
          });
          if (shouldRefreshPreview) onFilesChanged(editedPath ? [editedPath] : undefined);
          if (
            planWrittenPath &&
            planWrittenTitle &&
            planPendingRef.current?.status !== "building" &&
            planPendingRef.current?.status !== "built"
          ) {
            const writtenPath = planWrittenPath;
            const writtenTitle = planWrittenTitle;
            const writtenOverview = planWrittenOverview;
            setPlanPendingApprove({
              path: writtenPath,
              title: writtenTitle,
              overview: writtenOverview,
              status: "ready",
            });
            if (!shouldRefreshPreview) onFilesChanged([writtenPath]);
            // Prefer tool JSON; fall back to reading the file for overview polish.
            if (!writtenOverview) {
              void orch
                .readFile(client, writtenPath)
                .then((file) => {
                  setCachedPlanContent(writtenPath, file.content || "");
                  const parsed = parsePlanFile(file.content || "");
                  const title = planTitleFromParsed(parsed, writtenPath);
                  const overview = planOverviewFromParsed(parsed);
                  setPlanPendingApprove((prev) =>
                    prev?.path === writtenPath
                      ? { ...prev, title, overview: overview || prev.overview }
                      : prev,
                  );
                  mutateLast((m) => {
                    const idx = m.blocks.findIndex((b) => b.kind === "plan" && b.planPath === writtenPath);
                    if (idx < 0) return m;
                    m.blocks[idx] = { ...m.blocks[idx], planTitle: title };
                    return m;
                  });
                })
                .catch(() => undefined);
            } else {
              // Still warm the full markdown for instant View Plan.
              void orch
                .readFile(client, writtenPath)
                .then((file) => setCachedPlanContent(writtenPath, file.content || ""))
                .catch(() => undefined);
            }
          }
          break;
        }
        case "subagent_start": {
          mutateLast((message) => {
            const id = event.id as string | undefined;
            if (!id) return message;
            let idx = message.blocks.findIndex((b) => b.kind === "tool" && b.tool?.id === id);
            if (idx < 0) {
              message.blocks = freezeOpenThinking(message.blocks);
              message.blocks.push({
                kind: "tool",
                tool: {
                  id,
                  name: "Agent",
                  target: typeof event.description === "string" ? event.description : "",
                  done: false,
                },
              });
              idx = message.blocks.length - 1;
            }
            const block = message.blocks[idx];
            const prev = block.tool!;
            const prompt = typeof event.prompt === "string" ? event.prompt : prev.subagent?.prompt ?? "";
            const description =
              typeof event.description === "string"
                ? event.description
                : prev.subagent?.description ?? prev.target;
            message.blocks[idx] = {
              ...block,
              tool: {
                ...prev,
                name: "Agent",
                target: description || prev.target || (prompt.length > 72 ? `${prompt.slice(0, 71)}…` : prompt),
                subagent: {
                  status: "running",
                  prompt,
                  description: description || undefined,
                  blocks: prev.subagent?.blocks ?? [],
                  finalText: prev.subagent?.finalText,
                },
              },
            };
            return message;
          });
          break;
        }
        case "subagent_event": {
          mutateLast((message) => {
            const id = event.id as string | undefined;
            const nested = event.event as AgentEvent | undefined;
            if (!id || !nested?.type) return message;
            const idx = message.blocks.findIndex((b) => b.kind === "tool" && b.tool?.id === id);
            if (idx < 0) return message;
            const block = message.blocks[idx];
            const prev = block.tool!;
            const sub: SubagentState = {
              status: "running",
              prompt: prev.subagent?.prompt ?? "",
              description: prev.subagent?.description,
              blocks: [...(prev.subagent?.blocks ?? [])],
              finalText: prev.subagent?.finalText,
            };
            applyNestedEvent(sub.blocks, nested);
            message.blocks[idx] = { ...block, tool: { ...prev, subagent: sub } };
            return message;
          });
          break;
        }
        case "subagent_end": {
          mutateLast((message) => {
            const id = event.id as string | undefined;
            if (!id) return message;
            const idx = message.blocks.findIndex((b) => b.kind === "tool" && b.tool?.id === id);
            if (idx < 0) return message;
            const block = message.blocks[idx];
            const prev = block.tool!;
            const text = typeof event.text === "string" ? event.text : "";
            message.blocks[idx] = {
              ...block,
              tool: {
                ...prev,
                // Mark done here — parent may keep streaming after the nested
                // turn ends; waiting for tool_result left the row on "Running…".
                done: true,
                isError: Boolean(event.isError) || prev.isError,
                subagent: {
                  status: event.isError ? "error" : "done",
                  prompt: prev.subagent?.prompt ?? "",
                  description: prev.subagent?.description,
                  blocks: freezeOpenThinking(prev.subagent?.blocks ?? []),
                  finalText: text,
                },
              },
            };
            return message;
          });
          break;
        }
        case "usage": {
          // Billing ledger is updated server-side; do not surface per-turn cost in chat.
          const id = event.messageId as string | undefined;
          if (id) usageSeenRef.current.add(id);
          break;
        }
        case "compaction": {
          // E2E / debug hook — no chat chrome. Agent memory tip was summarized.
          const payload = {
            tokensBefore: Number(event.tokensBefore) || 0,
            tokensAfter: Number(event.tokensAfter) || 0,
            threshold: Number(event.threshold) || 0,
            at: Date.now(),
          };
          (window as unknown as { __mythexLastCompaction?: typeof payload }).__mythexLastCompaction =
            payload;
          break;
        }
        case "checkpoint":
          mutateLast((m) => ({
            ...m,
            gitSha: (event.gitSha as string) || m.gitSha,
          }));
          // Workspace Publish button uses this to show unpublished-changes affordances.
          window.dispatchEvent(new Event("mythex:project-changed"));
          break;
        case "run":
          // Bind preview for healthy *and* unhealthy (restart in progress).
          // When services restarted (`unchanged === false`) force iframe reload
          // even if we were already "healthy" — otherwise proxy ECONNREFUSED
          // sticks until the user hits Refresh.
          if (event.previewUrl) {
            const healthy = Boolean(event.healthy);
            const restarted = event.unchanged === false;
            onRunUpdate(
              event.previewUrl as string,
              healthy,
              event.services as RunningService[] | undefined,
              { forceReload: healthy && restarted },
            );
            if (healthy && restarted) track("build_success");
          } else if (!event.unchanged && event.message) {
            mutateLast((m) => {
              m.blocks.push({ kind: "error", text: event.message as string });
              return m;
            });
          }
          break;
        case "error": {
          const code =
            typeof event.code === "string" && event.code
              ? event.code
              : "turn_interrupted";
          const retryable = event.retryable !== false;
          const forHelper = retryable && COMPOSER_HELPER_CODES.has(code);
          const retryPrompt = forHelper ? lastUserPrompt(messagesRef.current ?? []) : undefined;
          if (forHelper) {
            const last = messagesRef.current?.[messagesRef.current.length - 1];
            const helper = makeComposerHelper(code, {
              message: typeof event.message === "string" ? event.message : undefined,
              retryPrompt,
              retryable: true,
              sourceMessageId: last?.role === "ASSISTANT" ? last.id : undefined,
            });
            setComposerHelper(helper);
            // Daemon busy / transport errors often leave an empty turn + cleared
            // composer — put the stash back immediately (don't wait for Stop).
            const stash = emptyStopRestoreRef.current;
            const noWork =
              last?.role === "ASSISTANT" &&
              !last.blocks.some(
                (b) =>
                  b.kind === "tool" ||
                  (b.kind === "text" && Boolean(b.text?.trim())) ||
                  (b.kind === "thinking" && Boolean(b.text?.trim())),
              );
            if (stash && noWork && !immediateSendRef.current) {
              let truncateFromId: string | null = null;
              setMessages((prev) => {
                if (!prev?.length) return prev;
                let next = prev;
                const tail = next[next.length - 1];
                if (tail?.role === "ASSISTANT") next = next.slice(0, -1);
                const user = next[next.length - 1];
                if (user?.role === "USER") {
                  truncateFromId = user.id ?? null;
                  next = next.slice(0, -1);
                }
                messagesRef.current = next;
                return next;
              });
              applyEmptyStopRestoreRef.current(stash);
              // applyEmptyStopRestore clears the helper — put Connection Error back.
              setComposerHelper(helper);
              discardEmptyRestoredTurnRef.current(truncateFromId, stash.text);
              break;
            }
          }
          // Persist structured error so refresh/history can peel helper codes.
          mutateLast((m) => {
            if (!m.blocks.some((b) => b.kind === "error" && b.code === code)) {
              m.blocks.push({
                kind: "error",
                code,
                retryable,
                text: String(event.message ?? appT().thread.turnErrors.unfinished),
              });
            }
            return m;
          });
          break;
        }
        case "stopped":
          mutateLast((m) => {
            if (
              typeof event.reason === "string" &&
              event.reason === "wall" &&
              !m.blocks.some((b) => b.kind === "error" && b.code === "wall_timeout")
            ) {
              m.blocks.push({
                kind: "error",
                code: "wall_timeout",
                retryable: false,
                text: appT().thread.turnErrors.wallTimeout,
              });
            }
            return {
              ...m,
              costTokens: (event.costTokens as number) || m.costTokens,
              costCents: (event.costCents as number) || m.costCents,
              workedMs: sealWorkedMs(event.durationMs, m.workedMs),
            };
          });
          if (Number(event.costTokens) > 0) void refresh();
          // Server empty-stop (cancel-before-tokens / leftover stop intent): restore
          // the prompt like user Stop so a queued follow-up doesn't immediately
          // re-POST and look like "Stop did nothing".
          if (!contentFrozenRef.current && !immediateSendRef.current) {
            const last = messagesRef.current?.[messagesRef.current.length - 1];
            const noWork =
              last?.role === "ASSISTANT" &&
              !last.blocks.some(
                (b) =>
                  b.kind === "tool" ||
                  (b.kind === "text" && Boolean(b.text?.trim())) ||
                  (b.kind === "thinking" && Boolean(b.text?.trim())),
              );
            const stash = emptyStopRestoreRef.current;
            if (noWork && stash) {
              contentFrozenRef.current = true;
              setMessages((prev) => {
                if (!prev?.length) return prev;
                let next = prev;
                const tail = next[next.length - 1];
                if (tail?.role === "ASSISTANT") next = next.slice(0, -1);
                const user = next[next.length - 1];
                if (user?.role === "USER") next = next.slice(0, -1);
                messagesRef.current = next;
                return next;
              });
              applyEmptyStopRestoreRef.current(stash);
            } else if (noWork) {
              // Only the duplicate of this turn's own prompt would re-POST and
              // look like Stop did nothing. Other queued follow-ups are the
              // user's, were never sent, and must survive.
              const own = stash?.text?.trim();
              if (own) setFollowUpQueue((q) => q.filter((item) => item.text.trim() !== own));
              immediateSendRef.current = null;
            }
          }
          break;
        case "out_of_tokens":
          toast(
            "error",
            canBuyPlans()
              ? appT().thread.toasts.outOfTokensTopUp
              : appT().thread.toasts.outOfTokens,
          );
          mutateLast((m) => {
            if (!m.blocks.some((b) => b.kind === "error" && b.code === "out_of_tokens")) {
              m.blocks.push({
                kind: "error",
                code: "out_of_tokens",
                retryable: false,
                text: appT().thread.turnErrors.outOfCredits,
              });
            }
            return {
              ...m,
              costTokens: (event.costTokens as number) || m.costTokens,
              costCents: (event.costCents as number) || m.costCents,
              workedMs: sealWorkedMs(event.durationMs, m.workedMs),
            };
          });
          void refresh();
          break;
        case "done":
          // Empty-failure restore already removed this turn — don't stamp cost
          // onto the previous assistant.
          if (!emptyStopSealedRef.current) {
            // Felt when it finishes (in the app, on screen): you often look
            // away while it builds.
            if (document.visibilityState === "visible") successHaptic();
            mutateLast((m) => ({
              ...m,
              costTokens: event.costTokens as number,
              costCents: event.costCents as number,
              workedMs: sealWorkedMs(event.durationMs, m.workedMs),
            }));
            if (agentModeRef.current === "plan") {
              void finalizePlanTurn();
            }
            // Chat sticky: seal leftover in_progress for display. Plan.md on disk is
            // owned by the agent (UpdatePlan) + git commit — do not write it from the UI.
            if (agentModeRef.current === "agent") {
              const msgs = messagesRef.current;
              const lastUser =
                msgs && msgs.length >= 2 && msgs[msgs.length - 1]?.role === "ASSISTANT"
                  ? msgs[msgs.length - 2]
                  : null;
              const planPath = (
                lastUser?.role === "USER" && lastUser.planBuild?.path
                  ? lastUser.planBuild.path
                  : planPendingRef.current?.path || ""
              ).replace(/^\/home\/user\/app\//, "");
              if (planPath && (lastUser?.planBuild || planPendingRef.current)) {
                setMessages((prev) => {
                  if (!prev?.length) return prev;
                  const next = [...prev];
                  const aIdx = next.length - 1;
                  const assistant = next[aIdx];
                  if (assistant?.role === "ASSISTANT") {
                    next[aIdx] = {
                      ...assistant,
                      blocks: sealOpenToolsAndCompletePlanTodos(assistant.blocks),
                    };
                  }
                  if (aIdx >= 1) {
                    const user = next[aIdx - 1];
                    if (user?.role === "USER" && user.seedTodos?.length) {
                      next[aIdx - 1] = {
                        ...user,
                        seedTodos: completeInProgressTodos(user.seedTodos),
                      };
                    }
                  }
                  messagesRef.current = next;
                  return next;
                });
                void (async () => {
                  try {
                    const file = await orch.readFile(client, planPath);
                    const todos = parsePlanFile(file.content || "").todos;
                    window.dispatchEvent(
                      new CustomEvent("mythex:plan-cache-clear", { detail: { path: planPath } }),
                    );
                    if (todosAllCompleted(todos)) {
                      setPlanPendingApprove((p) => {
                        const pPath = p?.path?.replace(/^\/home\/user\/app\//, "");
                        if (pPath && pPath !== planPath) {
                          return {
                            path: planPath,
                            title: planTitleFromPath(planPath),
                            overview: "",
                            status: "built",
                          };
                        }
                        return p
                          ? { ...p, status: "built" }
                          : {
                              path: planPath,
                              title: planTitleFromPath(planPath),
                              overview: "",
                              status: "built",
                            };
                      });
                      setPlanStatusByPath((prev) => ({ ...prev, [planPath]: "built" }));
                    } else if (planPendingRef.current?.status === "building") {
                      setPlanPendingApprove((p) =>
                        p?.status === "building" ? { ...p, status: "ready" } : p,
                      );
                      setPlanStatusByPath((prev) => ({ ...prev, [planPath]: "ready" }));
                    }
                  } catch {
                    if (planPendingRef.current?.status === "building") {
                      setPlanPendingApprove((p) =>
                        p?.status === "building" ? { ...p, status: "ready" } : p,
                      );
                    }
                  }
                })();
              }
            }
          }
          setPendingQuestion(null);
          setPendingSecrets(null);
          // Balance only when this turn spent; title already updated via onThreadTitleHint.
          if (Number(event.costTokens) > 0 || Number(event.costCents) > 0) {
            void refresh();
          }
          break;
        case "result": {
          if (emptyStopSealedRef.current) break;
          const timing = event.timing as { durationMs?: number } | undefined;
          const dur = timing?.durationMs ?? event.durationMs;
          mutateLast((m) => ({
            ...m,
            workedMs: sealWorkedMs(dur, m.workedMs),
          }));
          break;
        }
        case "question": {
          const toolCallId = String(event.toolCallId || "");
          const questions = Array.isArray(event.questions) ? (event.questions as typeof pendingQuestion extends null ? never : NonNullable<typeof pendingQuestion>["questions"]) : [];
          if (toolCallId && questions.length) {
            setPendingQuestion({ toolCallId, questions });
            setQuestionAnswers({});
            setQuestionCustom({});
          }
          break;
        }
        case "switch_mode": {
          const toolCallId = String(event.toolCallId || "");
          const target = String(event.target || "plan");
          if (toolCallId && target === "plan") {
            // Keep the first in-flight card — parallel SwitchMode calls must not
            // orphan the answer file the user is about to confirm.
            setPendingModeSwitch((prev) => {
              if (prev?.toolCallId) return prev;
              return {
                toolCallId,
                target: "plan" as const,
                reason: typeof event.reason === "string" ? event.reason : undefined,
                prompt: lastUserPrompt(messagesRef.current ?? []) || "",
              };
            });
          }
          break;
        }
        case "secrets_request": {
          const requestId = String(event.requestId || "");
          const keys = Array.isArray(event.keys)
            ? (event.keys as unknown[]).map((k) => String(k || "").trim()).filter(Boolean)
            : [];
          if (requestId && keys.length) {
            setPendingSecrets({
              requestId,
              keys,
              reason: typeof event.reason === "string" ? event.reason : undefined,
              ...(event.kind === "app_store" || event.kind === "google_play" ? { kind: event.kind as "app_store" | "google_play" } : {}),
            });
          }
          break;
        }
        case "app_test_step": {
          // Live screenshot path from BrowserRun — attach to the open Browser tool row.
          if (event.kind === "screenshot" && typeof event.path === "string" && event.path) {
            const path = String(event.path);
            mutateLast((message) => {
              const blocks = [...message.blocks];
              for (let i = blocks.length - 1; i >= 0; i--) {
                const b = blocks[i];
                if (
                  b.kind === "tool" &&
                  (b.tool?.name === "BrowserRun" || b.tool?.name === "BrowserScreenshot")
                ) {
                  const prev = b.tool!;
                  const detail = prev.detail?.includes(path)
                    ? prev.detail
                    : `${prev.detail ? `${prev.detail}\n` : ""}Screenshot saved: ${path}`;
                  blocks[i] = {
                    ...b,
                    tool: { ...prev, screenshotPath: path, detail },
                  };
                  break;
                }
              }
              return { ...message, blocks };
            });
          }
          break;
        }
        case "app_test_start":
        case "app_test_end":
        case "app_test_event":
          // Legacy nested-tester events — ignore.
          break;
      }
    },
    [mutateLast, onFilesChanged, onReloadPreview, appChanged, onRunUpdate, refresh, client, toast, finalizePlanTurn],
  );

  // The chat stream now ends as soon as the agent's own reply + billing are
  // done — the app restart that follows (can take several more seconds) runs
  // after that response closes, so the composer/Stop button free up right
  // away instead of sitting "busy" through it. That restart still emits its
  // own `run` event (for the preview iframe) into the same server-side buffer;
  // reconnect briefly, without touching `busy`/chat state, just to catch it.
  const tailForRunUpdate = useCallback(async () => {
    // `/agent/stream` always replays the buffered events first (even if the
    // restart already finished by the time we connect), then either closes
    // with `stream_end` or keeps streaming live — so no need to pre-check
    // agent/status here. Stop as soon as `run` arrives, and cap the wait so a
    // stuck restart can never leave this connection open indefinitely.
    const ac = new AbortController();
    const cap = setTimeout(() => ac.abort(), 60_000);
    try {
      await streamAgentResume(
        client,
        (event) => {
          if (event.type !== "run") return;
          // Bind even when unchanged — first turn often has no preview URL yet
          // while the app is already healthy after the agent (or a prior start).
          if (event.previewUrl) {
            const healthy = Boolean(event.healthy);
            const restarted = event.unchanged === false;
            onRunUpdate(
              event.previewUrl as string,
              healthy,
              event.services as RunningService[] | undefined,
              { forceReload: healthy && restarted },
            );
          } else if (!event.unchanged && event.message) {
            toast("error", event.message as string);
          }
          ac.abort();
        },
        ac.signal,
      );
    } catch {
      // Best effort (including our own abort above) — the preview stays as-is;
      // the Run button still works manually.
    } finally {
      clearTimeout(cap);
    }
  }, [client, onRunUpdate, toast]);

  // Reconnect to a build that's still running server-side (page refresh / 2nd
  // tab). Replays the buffered events, then streams live — identical rendering
  // to the original send via the shared applyEvent.
  const reconnectIfActive = useCallback(async () => {
    if (!threadId || reconnectedRef.current === threadId) return;
    // User already Stopped — don't attach /agent/stream and flip Working back on.
    if (contentFrozenRef.current) return;
    // Live send() owns the turn (including its own drop-retry loop). Never steal
    // the controller — Stop would abort the resume stream and leave /agent POST running.
    if (sendAbortRef.current && !sendAbortRef.current.signal.aborted) return;
    // After a mid-turn SSE drop we clear abortRef but keep busy so we can retry.
    if (busyRef.current && abortRef.current) return;
    // Wait for sandbox wake — probing status while E2B is still connecting used
    // to clear the server "active" flag and make refresh look like Stop.
    if (!sandboxReady) return;
    // History must be painted first (see historyReadyRef) so Plan→Build chrome
    // and the in-flight ASSISTANT row survive resume.
    if (historyReadyRef.current !== threadId) return;
    invalidateAgentStatus(client);
    let status: { active: boolean; threadId: string | null };
    try {
      status = await agentStatus(client);
    } catch {
      // Status unknown (a deploy is replacing the orchestrator). A turn may be
      // running — ask again shortly instead of never reattaching to it.
      if (reconnectStatusAttemptsRef.current < 20) {
        reconnectStatusAttemptsRef.current += 1;
        window.setTimeout(() => {
          if (reconnectedRef.current === threadId || contentFrozenRef.current) return;
          void reconnectRef.current();
        }, Math.min(4000, 500 * 2 ** Math.min(reconnectStatusAttemptsRef.current - 1, 3)));
      }
      return;
    }
    reconnectStatusAttemptsRef.current = 0;
    if (contentFrozenRef.current) return;
    // `active` can be lock-only with threadId null after a mid-wake status race —
    // still reconnect (buffer is per-project). Only skip a *different* thread.
    if (!status.active) {
      // Undo optimistic Plan→Build live paint from history load.
      setMessages((prev) => {
        const sealed = sealOptimisticPlanBuildPaint(prev ?? []);
        messagesRef.current = sealed;
        return sealed;
      });
      setPlanPendingApprove((p) => (p?.status === "building" ? { ...p, status: "ready" } : p));
      // Drop-retry path keeps busy=true with no abort controller. If the turn
      // actually finished while the socket was dead, unlock the composer.
      if (busyRef.current && !abortRef.current) {
        busyRef.current = false;
        setBusy(false);
        void reconcileHistory();
      }
      return;
    }
    // Ignore non-id sentinels; only skip a *different* real thread.
    if (
      status.threadId != null &&
      status.threadId !== "locked" &&
      status.threadId !== threadId
    ) {
      return;
    }
    // busy && !abortRef is the drop-retry handoff — keep going.
    // Mark after we know status is live — cleared again if resume is a no-op
    // stream_end (lock/active race) so sandboxReady can retry.
    reconnectedRef.current = threadId;
    busyRef.current = true;
    setBusy(true);
    usageSeenRef.current = new Set();
    pinnedToBottom.current = true;
    askWaitAccumRef.current = 0;
    askWaitStartedRef.current = null;

    // Restore Plan→Build chrome — todos usually already seeded sync from history paint.
    const snap = messagesRef.current ?? [];
    const lastSnap = snap[snap.length - 1];
    const planBuildUser =
      lastSnap?.role === "USER" && lastSnap.planBuild
        ? lastSnap
        : lastSnap?.role === "ASSISTANT" &&
            snap[snap.length - 2]?.role === "USER" &&
            snap[snap.length - 2].planBuild
          ? snap[snap.length - 2]
          : null;
    if (planBuildUser?.planBuild) {
      const rel = normalizePlanUiPath(planBuildUser.planBuild.path);
      const titleHint = planBuildUser.planBuild.title || planTitleFromPath(rel);
      setPlanPendingApprove({
        path: rel,
        title: titleHint,
        overview: "",
        status: "building",
      });
      setPlanStatusByPath((prev) => ({ ...prev, [rel]: "building" }));
      // Sync seed if history paint missed (no cache / CreatePlan not in page).
      if (!planBuildUser.seedTodos?.length) {
        const userIdx = snap.indexOf(planBuildUser);
        const seeds = userIdx >= 0 ? seedTodosForPlanBuildUser(snap, userIdx) : undefined;
        if (seeds?.length) {
          setMessages((prev) => {
            if (!prev?.length) return prev;
            const next = [...prev];
            const idx = next.findIndex(
              (m) => m.role === "USER" && normalizePlanUiPath(m.planBuild?.path || "") === rel,
            );
            if (idx < 0 || next[idx].seedTodos?.length) return prev;
            next[idx] = { ...next[idx], seedTodos: seeds.map((t) => ({ ...t })) };
            messagesRef.current = next;
            return next;
          });
        }
      }
      void (async () => {
        try {
          const file = await orch.readFile(client, rel);
          const parsed = parsePlanFile(file.content || "");
          setCachedPlanContent(rel, file.content || "");
          const todos: AgentTodo[] =
            parsed.todos.length > 0
              ? parsed.todos.map((t) => ({
                  id: t.id,
                  content: t.content,
                  status: t.status,
                }))
              : fallbackTodosFromPlanBody(parsed.body).map((t) => ({
                  id: t.id,
                  content: t.content,
                  status: t.status,
                }));
          setPlanPendingApprove({
            path: rel,
            title: planTitleFromParsed(parsed, rel) || titleHint,
            overview: planOverviewFromParsed(parsed),
            status: "building",
          });
          if (!todos.length) return;
          setMessages((prev) => {
            if (!prev?.length) return prev;
            let userIdx = -1;
            for (let i = prev.length - 1; i >= 0; i--) {
              if (prev[i].role === "USER" && prev[i].planBuild?.path) {
                const p = normalizePlanUiPath(prev[i].planBuild!.path);
                if (p === rel) {
                  userIdx = i;
                  break;
                }
              }
            }
            if (userIdx < 0) return prev;
            // Prefer live disk statuses (in_progress) over stale CreatePlan pending.
            const next = [...prev];
            next[userIdx] = { ...next[userIdx], seedTodos: todos.map((t) => ({ ...t })) };
            messagesRef.current = next;
            return next;
          });
        } catch {
          // Checklist will still update from live UpdatePlan events.
        }
      })();
    }

    // Resume the existing assistant turn clock — never reset to "now" (that
    // under-counted "Worked for" after refresh/reconnect).
    // History load usually already painted streaming for Plan→Build; still
    // ensure a live ASSISTANT row exists for normal (non-plan) reconnects.
    setMessages((m) => {
      const list = m ?? [];
      const last = list[list.length - 1];
      let next: DisplayMessage[];
      if (last?.role === "ASSISTANT" && last.streaming) {
        turnStartedAtRef.current =
          last.startedAtMs ??
          (list[list.length - 2]?.createdAt
            ? new Date(list[list.length - 2].createdAt!).getTime()
            : Date.now());
        messagesRef.current = list;
        return list;
      }
      if (last?.role === "USER") {
        const startMs = last.createdAt ? new Date(last.createdAt).getTime() : Date.now();
        turnStartedAtRef.current = startMs;
        next = [
          ...list,
          {
            role: "ASSISTANT" as const,
            blocks: [],
            streaming: true,
            createdAt: new Date().toISOString(),
            startedAtMs: startMs,
          },
        ];
      } else {
        let marked = false;
        next = list.map((msg, idx) => {
          if (marked || msg.role !== "ASSISTANT") return msg;
          // Only the trailing assistant turn.
          if (list.slice(idx + 1).some((x) => x.role === "ASSISTANT")) return msg;
          let startMs =
            msg.startedAtMs ?? (msg.createdAt ? new Date(msg.createdAt as string).getTime() : Date.now());
          for (let j = idx - 1; j >= 0; j--) {
            if (list[j].role === "USER" && list[j].createdAt) {
              startMs = new Date(list[j].createdAt!).getTime();
              break;
            }
          }
          turnStartedAtRef.current = startMs;
          marked = true;
          return { ...msg, streaming: true, workedMs: undefined, startedAtMs: startMs };
        });
        if (!marked) {
          const startMs = Date.now();
          turnStartedAtRef.current = startMs;
          next = [
            ...list,
            {
              role: "ASSISTANT" as const,
              blocks: [],
              streaming: true,
              createdAt: new Date().toISOString(),
              startedAtMs: startMs,
            },
          ];
        }
      }
      // Sync before resume SSE — mutateLast/applyEvent must not race an empty USER tail.
      messagesRef.current = next;
      return next;
    });

    const ac = new AbortController();
    abortRef.current = ac;
    let ended = false;
    let sawTerminalWork = false;
    let eventCount = 0;
    // Wipe on the first replayed event (not up front) so a failed reconnect
    // doesn't blank the in-progress reply — that looked like a mobile "cut".
    let replayPrimed = reconnectDropAttemptsRef.current === 0;
    const finish = (opts?: { hollow?: boolean }) => {
      if (ended) return;
      ended = true;
      ac.abort();
      abortRef.current = null;
      // Empty stream_end right after refresh — status said active but resume
      // closed immediately. Clear the guard so we can retry when sandbox settles.
      if (opts?.hollow) {
        reconnectedRef.current = null;
        busyRef.current = false;
        setBusy(false);
        mutateLast((m) =>
          m.role === "ASSISTANT" && m.streaming && m.blocks.length === 0
            ? { ...m, streaming: false }
            : m,
        );
        if (reconnectHollowAttemptsRef.current < 3) {
          reconnectHollowAttemptsRef.current += 1;
          window.setTimeout(() => {
            if (contentFrozenRef.current) return;
            if (reconnectedRef.current === threadId || busyRef.current) return;
            void reconnectRef.current();
          }, 750);
        }
        return;
      }
      const started = turnStartedAtRef.current ?? undefined;
      turnStartedAtRef.current = null;
      const worked = activeWorkedMs(started);
      askWaitAccumRef.current = 0;
      askWaitStartedRef.current = null;
      mutateLast((m) => ({
        ...m,
        blocks: sealOpenTools(freezeOpenThinking(m.blocks)),
        streaming: false,
        // Keep server-sealed duration from done/stopped — don't inflate with the
        // Send→done client clock (includes preflight / daemon wait).
        workedMs:
          m.workedMs != null
            ? m.workedMs
            : pickWorkedMs(worked, activeWorkedMs(null, m.startedAtMs)),
        workedMsEstimated: m.workedMs == null || m.workedMsEstimated === true,
      }));
      setBusy(false);
      // Reconcile with the canonical DB state (drops any duplicate reconstructed
      // message if the turn had already persisted while still marked active).
      void reconcileHistory();
      // `done`/`stopped`/`out_of_tokens` can arrive before the trailing app
      // restart's `run` event (see tailForRunUpdate) — this connection is
      // about to close either way, so pick that up on its own.
      void tailForRunUpdate();
    };
    const terminal = new Set(["done", "stopped", "out_of_tokens", "stream_end"]);
    try {
      await streamAgentResume(
        client,
        (event) => {
          eventCount += 1;
          if (!replayPrimed && event.type !== "stream_end") {
            replayPrimed = true;
            mutateLast((m) =>
              m.role === "ASSISTANT" && m.streaming ? { ...m, blocks: [], streaming: true } : m,
            );
          }
          // Same rule as the live stream: nothing after the ending is the turn's failure.
          if (event.type === "error" && sawTerminalWork) return;
          if (isAgentTurnTerminal(event.type)) {
            sawTerminalWork = true;
          }
          if (event.type !== "stream_end") applyEvent(event);
          if (terminal.has(event.type)) {
            const hollow = event.type === "stream_end" && !sawTerminalWork && eventCount <= 1;
            finish(hollow ? { hollow: true } : undefined);
          }
        },
        ac.signal,
      );
    } catch {
      // aborted or connection dropped
    } finally {
      if (!ended) {
        const hollow = !sawTerminalWork && eventCount === 0;
        if (!hollow && !sawTerminalWork && !contentFrozenRef.current) {
          // Socket died mid-turn (mobile Safari / radio). Don't seal a truncated
          // reply — retry GET /agent/stream while the sandbox is still working.
          ended = true;
          ac.abort();
          abortRef.current = null;
          reconnectedRef.current = null;
          reconnectDropAttemptsRef.current += 1;
          const delay = Math.min(4000, 400 * 2 ** Math.min(reconnectDropAttemptsRef.current - 1, 4));
          window.setTimeout(() => {
            if (contentFrozenRef.current) return;
            void reconnectRef.current();
          }, delay);
          return;
        }
        finish(hollow ? { hollow: true } : undefined);
      }
    }
  }, [
    client,
    project.id,
    threadId,
    sandboxReady,
    applyEvent,
    mutateLast,
    reconcileHistory,
    tailForRunUpdate,
  ]);

  // Keep the latest reconnect logic in a ref so the load effect doesn't have to
  // depend on it (its identity changes with parent callback props).
  const reconnectRef = useRef(reconnectIfActive);
  useEffect(() => {
    reconnectRef.current = reconnectIfActive;
  }, [reconnectIfActive]);
  const reconcileHistoryRef = useRef(reconcileHistory);
  useEffect(() => {
    reconcileHistoryRef.current = reconcileHistory;
  }, [reconcileHistory]);
  return { applyEvent, finalizePlanTurn, mutateLast, reconcileHistoryRef, reconnectRef, tailForRunUpdate };
}
