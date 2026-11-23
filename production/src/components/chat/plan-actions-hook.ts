import type { Dispatch, SetStateAction, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { answerAgentQuestion, cancelAgent, orch, type OrchClient } from "../../lib/orchestrator";
import { type SkillInvocation } from "../PlatformToolsMenu";
import { fallbackTodosFromPlanBody, parsePlanFile, planOverviewFromParsed, planTitleFromParsed, planTitleFromPath, setCachedPlanContent } from "../../lib/plan-file";
import { AGENT_LOCK_WAIT_MS } from "./agent";
import { type AgentMode, type AgentTodo, type Attachment } from "./types";
import type { ChatRefs } from "./refs";
import { appT } from "../../i18n/app";

/** Everything usePlanActions reads from the chat panel. */
export type PlanActionsCtx = {
  refs: ChatRefs;
  agentModeRef: RefObject<AgentMode>;
  client: OrchClient;
  finalizePlanTurn: () => Promise<void>;
  freezeTurnLocally: (opts?: { restoreToInput?: boolean; }) => void;
  onPlanUiChange: ((threadId: string, ui: { statusByPath: Record<string, "ready" | "building" | "built">; onBuild: (path: string) => void; }) => void) | undefined;
  pendingModeSwitchRef: RefObject<{ toolCallId: string; target: "plan"; reason?: string; prompt: string; } | null>;
  planPendingApprove: { path: string; title: string; overview: string; status: "ready" | "building" | "built"; } | null;
  planStatusByPath: Record<string, "ready" | "building" | "built">;
  threadId: string | undefined;
  send: (raw?: string, source?: "main" | "edit", confirmed?: boolean, opts?: { skills?: SkillInvocation[]; readyAttachments?: Attachment[]; hideUserBubble?: boolean; planBuild?: { path: string; title: string; todos: AgentTodo[]; }; forceMode?: AgentMode; modeSwitchResend?: boolean; skipUserPersist?: boolean; queued?: { id: string; text: string; skills?: SkillInvocation[]; attachments?: Attachment[]; }; fromKeyboard?: boolean; }) => Promise<void>;
  setAgentMode: Dispatch<SetStateAction<AgentMode>>;
  setPendingModeSwitch: Dispatch<SetStateAction<{ toolCallId: string; target: "plan"; reason?: string; prompt: string; } | null>>;
  setPlanPendingApprove: Dispatch<SetStateAction<{ path: string; title: string; overview: string; status: "ready" | "building" | "built"; } | null>>;
  setStopping: Dispatch<SetStateAction<boolean>>;
  toast: (kind: "success" | "error" | "info", message: string) => void;
  waitForAgentInactive: (timeoutMs?: number, signal?: AbortSignal) => Promise<boolean>;
  waitUntilIdle: (timeoutMs?: number) => Promise<boolean>;
};

export function usePlanActions(ctx: PlanActionsCtx) {
  const {
    agentModeRef,
    client,
    finalizePlanTurn,
    freezeTurnLocally,
    onPlanUiChange,
    pendingModeSwitchRef,
    planPendingApprove,
    planStatusByPath,
    threadId,
    send,
    setAgentMode,
    setPendingModeSwitch,
    setPlanPendingApprove,
    setStopping,
    toast,
    waitForAgentInactive,
    waitUntilIdle,
  } = ctx;
  const {
    abortRef,
    busyRef,
    contentFrozenRef,
    expectRemoteLockRef,
    messagesRef,
    sendAbortRef,
  } = ctx.refs;

  // Keep a fresh send() for Plan→Build (send is recreated each render).
  const sendRef = useRef(send);
  sendRef.current = send;

  /**
   * Unblock every open SwitchMode on the current assistant (models often fire 2×).
   * Timer end = same as Switch (auto-switch) — never Skip, never Build.
   */
  const answerAllOpenSwitchModes = useCallback(
    (action: "switch" | "skip") => {
      const ids = new Set<string>();
      const pending = pendingModeSwitchRef.current;
      if (pending?.toolCallId) ids.add(pending.toolCallId);
      const last = messagesRef.current?.[messagesRef.current.length - 1];
      if (last?.role === "ASSISTANT") {
        for (const b of last.blocks) {
          if (b.kind === "tool" && b.tool?.name === "SwitchMode" && !b.tool.done && b.tool.id) {
            ids.add(b.tool.id);
          }
        }
      }
      if (!ids.size) return;
      void Promise.all(
        [...ids].map((toolCallId) =>
          answerAgentQuestion(client, { toolCallId, answers: { action } }),
        ),
      ).then((results) => {
        if (results.some((ok) => !ok)) {
          toast("error", action === "switch" ? appT().thread.toasts.switchToPlanFailed : appT().thread.toasts.skipModeSwitchFailed);
        }
        if (action === "switch") void finalizePlanTurn();
      });
    },
    [client, toast, finalizePlanTurn],
  );

  /**
   * SwitchMode card: Switch / timer — same turn continues (AskUserQuestion-style).
   * Countdown end auto-Switches (Cursor-like). Does not Build.
   */
  const confirmSwitchToPlan = useCallback(() => {
    const pending = pendingModeSwitchRef.current;
    setPendingModeSwitch(null);
    if (!pending?.toolCallId) return;
    setAgentMode("plan");
    agentModeRef.current = "plan";
    answerAllOpenSwitchModes("switch");
  }, [answerAllOpenSwitchModes]);

  /** SwitchMode card: Skip → stay in Build; unblock the waiting tool(s). */
  const skipSwitchToPlan = useCallback(() => {
    setPendingModeSwitch(null);
    answerAllOpenSwitchModes("skip");
  }, [answerAllOpenSwitchModes]);

  /** Cursor-style Build: hide implement prompt; checklist comes from the plan file + AI UpdatePlan. */
  const startPlanBuild = useCallback(
    async (path: string) => {
      const rel = path.replace(/^\/home\/user\/app\//, "");
      // Sync before send — React setState would leave plan mode for this turn.
      agentModeRef.current = "agent";
      setAgentMode("agent");

      // Another turn running (e.g. Build on plan B while A is Building): stop it
      // first — Cursor-style interrupt — then start this plan. Waiting alone left
      // the previous card stuck on "Building Plan".
      if (busyRef.current) {
        setStopping(true);
        expectRemoteLockRef.current = true;
        freezeTurnLocally();
        const ok = await cancelAgent(client);
        if (!ok) {
          setStopping(false);
          toast("error", appT().thread.toasts.stopUnreachableRetrySoon);
          return;
        }
        sendAbortRef.current?.abort();
        abortRef.current?.abort();
        const stopped = await waitUntilIdle();
        // freezeTurnLocally sets contentFrozen — clear so idle wait / send can proceed.
        contentFrozenRef.current = false;
        const cleared = stopped && (await waitForAgentInactive(AGENT_LOCK_WAIT_MS));
        setStopping(false);
        if (!cleared || busyRef.current) {
          toast("error", appT().thread.toasts.stillFinishingBuild);
          return;
        }
      }

      let title = planTitleFromPath(rel);
      let overview = "";
      let todos: AgentTodo[] = [];
      try {
        const file = await orch.readFile(client, rel);
        const parsed = parsePlanFile(file.content || "");
        setCachedPlanContent(rel, file.content || "");
        title = planTitleFromParsed(parsed, rel);
        overview = planOverviewFromParsed(parsed);
        todos =
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
      } catch (err) {
        console.error(err);
        toast("error", appT().thread.toasts.planReadFailed);
        return;
      }

      // Bind building UI to the plan that was clicked — not the latest CreatePlan.
      setPlanPendingApprove({
        path: rel,
        title,
        overview,
        status: "building",
      });

      const todoIds = todos.map((t) => t.id).filter(Boolean).join(", ");
      const prompt = [
        `Implement the approved plan in \`${rel}\`.`,
        `Read that file and follow it.`,
        `Drive the checklist with TaskUpdate using plan todo ids${todoIds ? ` (${todoIds})` : ""} — never TaskCreate the full list.`,
        `When a status changes, call UpdatePlan on \`${rel}\` with merge todos by id (keep todo ids stable). Do not Edit the plan YAML.`,
        `Do not re-ask for confirmation.`,
      ].join(" ");

      await sendRef.current(prompt, "main", false, {
        hideUserBubble: true,
        forceMode: "agent",
        planBuild: { path: rel, title, todos },
      });
    },
    [client, toast, waitForAgentInactive, waitUntilIdle, freezeTurnLocally],
  );

  const planActionsForLast = useMemo(
    () => ({
      pendingPath: (planPendingApprove?.path as string | null) ?? null,
      overview: planPendingApprove?.overview,
      status: (planPendingApprove?.status ?? "ready") as "ready" | "building" | "built" | "idle",
      statusByPath: planStatusByPath,
      onBuild: (path: string) => {
        void startPlanBuild(path);
      },
    }),
    [planPendingApprove, planStatusByPath, startPlanBuild],
  );

  const onPlanUiChangeRef = useRef(onPlanUiChange);
  onPlanUiChangeRef.current = onPlanUiChange;
  const startPlanBuildRef = useRef(startPlanBuild);
  startPlanBuildRef.current = startPlanBuild;
  // One function for the life of the panel: Workspace keeps the report it has
  // when nothing in it changed, and a fresh arrow each time made that never so.
  const buildPlanFromTab = useCallback((path: string) => {
    void startPlanBuildRef.current(path);
  }, []);
  // The plan tab builds from here: hand it the current statuses and the way in.
  useEffect(() => {
    if (!threadId || !onPlanUiChangeRef.current) return;
    onPlanUiChangeRef.current(threadId, {
      statusByPath: planStatusByPath,
      onBuild: buildPlanFromTab,
    });
  }, [threadId, planStatusByPath, buildPlanFromTab]);

  return { confirmSwitchToPlan, planActionsForLast, skipSwitchToPlan };
}
