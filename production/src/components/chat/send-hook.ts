import type { Dispatch, SetStateAction, RefObject } from "react";
import { isPaidPlan } from "../../lib/plan-tiers";
import type { UpgradeReason } from "../UpgradeModal";
import { useEffect, useRef } from "react";
import { MAX_ATTACHMENTS, attachmentSizeError, isPreviewableImage } from "../../lib/attachment-limits";
import { pickSendAttachments } from "../../lib/send-attachments";
import { api, ApiError, type MessagesPage, type ProjectDetail } from "../../lib/api";
import { isDeployBlip, retryThroughDeploy } from "../../lib/deploy-window";
import { agentStatus, cancelAgent, invalidateAgentStatus, isDroppedAgentStreamError, orch, streamAgent, streamAgentResume, type AgentEvent, type OrchClient } from "../../lib/orchestrator";
import { isOffline } from "../../lib/online";
import { dismissKeyboard } from "../../lib/native-keyboard";
import { isNative } from "../../lib/native";
import { defaultPublishSlug, platformChipToSkills, platformToolChipLabel, skillToPlatformChip, type PlatformToolChip, type SkillInvocation } from "../PlatformToolsMenu";
import { clearPlanContentCache, encodePlanBuildMarker } from "../../lib/plan-file";
import { AGENT_LOCK_WAIT_MS, TURN_REFUSAL_CODES, helperFromFailure, isAgentTurnTerminal, sleepMs } from "./agent";
import { blobUrlToDataUrl, clearComposerEditor, composerFileIds, composerPlainText, fileToBase64, finalizeComposerSegments, insertFileChipAtCaret, meaningfulComposerSegments, readPlatformToolFromEditor, revokeAttachmentPreview } from "./composer-dom";
import { ATTACHMENT_APPENDIX_RE, mapHistory, mergeAttachmentPreviews, planPathsFromMessages, planStatusesFromDisk, publishVisibleText, rememberAttachmentPreview } from "./history";
import { freezeOpenThinking, newAttachmentId, pickWorkedMs, sealOpenTools } from "./tool-model";
import { type AgentMode, type AgentTodo, type Attachment, type ComposerHelper, type ComposerSegment, type DisplayMessage, type MessageAttachment } from "./types";
import type { Me } from "../../lib/api";
import type { ChatRefs } from "./refs";
import { appT, fill, pl } from "../../i18n/app";

/** Everything useSendTurn reads from the chat panel. */
export type SendTurnCtx = {
  refs: ChatRefs;
  activeWorkedMs: (started?: number | null, fallbackStartedAtMs?: number) => number | undefined;
  agentModeRef: RefObject<AgentMode>;
  applyEvent: (event: AgentEvent) => void;
  attachments: Attachment[];
  busy: boolean;
  clearEditComposer: () => void;
  client: OrchClient;
  editAttachments: Attachment[];
  editInput: string;
  editPlatformChip: PlatformToolChip | null;
  editingIndex: number | null;
  editingQueued: { id: string; originalText: string; index: number; attachments?: Attachment[]; } | null;
  finalizePlanTurn: () => Promise<void>;
  followUpQueue: { id: string; text: string; skills?: SkillInvocation[]; attachments?: Attachment[]; }[];
  freezeTurnLocally: (opts?: { restoreToInput?: boolean; }) => void;
  input: string;
  messages: DisplayMessage[] | null;
  mutateLast: (fn: (message: DisplayMessage) => DisplayMessage) => void;
  onEnsureThread: ((beforeSwitch: (threadId: string) => void) => Promise<string | null>) | undefined;
  onFilesChanged: (paths?: string[]) => void;
  onReloadPreview: (() => void) | undefined;
  onThreadTitleHint: ((threadId: string, title: string) => void) | undefined;
  openUpgrade: (reason?: UpgradeReason) => void;
  outOfCredits: boolean;
  pendingModeSwitch: { toolCallId: string; target: "plan"; reason?: string; prompt: string; } | null;
  pendingQuestion: { toolCallId: string; questions: Array<{ id: string; prompt: string; options: Array<{ id: string; label: string; }>; }>; } | null;
  pendingSecrets: { requestId: string; keys: string[]; reason?: string; kind?: "app_store" | "google_play"; } | null;
  planPendingRef: RefObject<{ path: string; title: string; overview: string; status: "ready" | "building" | "built"; } | null>;
  platformChip: PlatformToolChip | null;
  project: ProjectDetail;
  reconcileHistory: (turnThreadId?: string) => Promise<void>;
  refresh: (opts?: { force?: boolean; }) => Promise<void>;
  resizeEditor: (el: HTMLElement | null) => void;
  sandboxReady: boolean;
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setComposerHelper: Dispatch<SetStateAction<ComposerHelper | null>>;
  setCreditNudgeDismissed: Dispatch<SetStateAction<string | null>>;
  setEditAttachments: Dispatch<SetStateAction<Attachment[]>>;
  setEditInput: Dispatch<SetStateAction<string>>;
  setEditingQueued: Dispatch<SetStateAction<{ id: string; originalText: string; index: number; attachments?: Attachment[]; } | null>>;
  setFollowUpQueue: Dispatch<SetStateAction<{ id: string; text: string; skills?: SkillInvocation[]; attachments?: Attachment[]; }[]>>;
  setHasMoreOlder: Dispatch<SetStateAction<boolean>>;
  setInput: Dispatch<SetStateAction<string>>;
  setMessages: Dispatch<SetStateAction<DisplayMessage[] | null>>;
  setPendingEditSend: Dispatch<SetStateAction<{ raw?: string; } | null>>;
  setPendingModeSwitch: Dispatch<SetStateAction<{ toolCallId: string; target: "plan"; reason?: string; prompt: string; } | null>>;
  setPendingQuestion: Dispatch<SetStateAction<{ toolCallId: string; questions: Array<{ id: string; prompt: string; options: Array<{ id: string; label: string; }>; }>; } | null>>;
  setPendingSecrets: Dispatch<SetStateAction<{ requestId: string; keys: string[]; reason?: string; } | null>>;
  setPlanPendingApprove: Dispatch<SetStateAction<{ path: string; title: string; overview: string; status: "ready" | "building" | "built"; } | null>>;
  setPlanStatusByPath: Dispatch<SetStateAction<Record<string, "ready" | "building" | "built">>>;
  setPlatformChip: Dispatch<SetStateAction<PlatformToolChip | null>>;
  setSlashMenu: Dispatch<SetStateAction<{ query: string; active: number; } | null>>;
  setStopping: Dispatch<SetStateAction<boolean>>;
  stopping: boolean;
  tailForRunUpdate: () => Promise<void>;
  threadId: string | undefined;
  threadIdRef: RefObject<string | undefined>;
  toast: (kind: "success" | "error" | "info", message: string) => void;
  user: Me | null;
  waitForAgentInactive: (timeoutMs?: number, signal?: AbortSignal) => Promise<boolean>;
  waitUntilIdle: (timeoutMs?: number) => Promise<boolean>;
};

export function useSendTurn(ctx: SendTurnCtx) {
  const {
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
  } = ctx;
  const {
    abortRef,
    applyEmptyStopRestoreRef,
    askWaitAccumRef,
    askWaitStartedRef,
    busyRef,
    contentFrozenRef,
    discardEmptyRestoredTurnRef,
    editEditorRef,
    editorRef,
    emptyStopRestoreRef,
    emptyStopSealedRef,
    expectRemoteLockRef,
    followUpDrainRef,
    hasMoreOlderRef,
    historyReadyRef,
    immediateSendRef,
    loadedThreadRef,
    messagesRef,
    pinNewTurnToTop,
    pinnedToBottom,
    reconnectedRef,
    restoreComposerRef,
    savedRangeEditRef,
    savedRangeMainRef,
    sendAbortRef,
    sendAwaitingAnswerRef,
    sendGenerationRef,
    sendStartsRef,
    strandedQueueRef,
    suppressSendUntilRef,
    turnStartedAtRef,
    usageSeenRef,
  } = ctx.refs;

  const addFiles = async (
    files: FileList | File[],
    target: "main" | "edit" = "main",
    opts?: { skipComposer?: boolean; context?: string; elementLabel?: string },
  ): Promise<Attachment[]> => {
    if (!sandboxReady) {
      toast("info", appT().thread.toasts.workspaceNotReady);
      return [];
    }
    const current = target === "edit" ? editAttachments : attachments;
    const setAtts = target === "edit" ? setEditAttachments : setAttachments;
    const list = Array.from(files).slice(0, MAX_ATTACHMENTS - current.length);
    if (list.length === 0) {
      toast("error", fill(appT().thread.toasts.tooManyAttachments, { max: MAX_ATTACHMENTS }));
      return [];
    }
    const ready: Attachment[] = [];
    for (const file of list) {
      const sizeError = attachmentSizeError(file);
      if (sizeError) {
        toast("error", sizeError);
        continue;
      }
      // A picked element is a chip in the text (its label), not a thumbnail in the image strip.
      const isImage = !opts?.elementLabel && isPreviewableImage(file.name, file.type);
      const att: Attachment = {
        id: newAttachmentId(),
        name: file.name,
        isImage,
        status: "uploading",
        previewUrl: isImage ? URL.createObjectURL(file) : undefined,
        ...(opts?.context ? { context: opts.context } : {}),
        ...(opts?.elementLabel ? { elementLabel: opts.elementLabel } : {}),
      };
      if (!opts?.skipComposer) {
        setAtts((a) => [...a, att]);
        // Non-images insert at the caret (Cursor-style inline chips); a picked
        // element is a card above the text instead, with the pictures.
        if (!isImage && !opts?.elementLabel) {
          const editor = target === "edit" ? editEditorRef.current : editorRef.current;
          const saved = target === "edit" ? savedRangeEditRef.current : savedRangeMainRef.current;
          if (editor) {
            insertFileChipAtCaret(editor, att, saved);
            if (target === "edit") {
              savedRangeEditRef.current = null;
              setEditInput(composerPlainText(editor));
            } else {
              savedRangeMainRef.current = null;
              setInput(composerPlainText(editor));
            }
            resizeEditor(editor);
          }
        }
      }
      try {
        const data = await fileToBase64(file);
        const res = await orch.upload(client, file.name, data);
        const done: Attachment = { ...att, status: "ready", path: res.path };
        if (!opts?.skipComposer) {
          setAtts((a) => a.map((x) => (x.id === att.id ? done : x)));
        }
        ready.push(done);
      } catch {
        if (!opts?.skipComposer) {
          setAtts((a) => a.map((x) => (x.id === att.id ? { ...x, status: "error" } : x)));
          const editor = target === "edit" ? editEditorRef.current : editorRef.current;
          editor?.querySelector(`[data-file-chip="${att.id}"]`)?.remove();
          if (editor) {
            if (target === "edit") setEditInput(composerPlainText(editor));
            else setInput(composerPlainText(editor));
          }
        } else if (att.previewUrl) {
          revokeAttachmentPreview(att.previewUrl);
        }
        toast("error", fill(appT().thread.toasts.uploadFailed, { name: file.name }));
      }
    }
    return ready;
  };

  /** A send pressed during an upload, waiting for it (see send()). */
  const sendAfterUploadRef = useRef<"main" | "edit" | null>(null);
  /**
   * When a send passed its checks and has not yet claimed busy (see send()); 0
   * when none is. A time, not a flag: it lapses on its own after a few seconds,
   * so a path that forgets to clear it can never block sending.
   */
  const sendStartingRef = useRef(0);
  useEffect(() => {
    const source = sendAfterUploadRef.current;
    if (!source) return;
    const atts = source === "edit" ? editAttachments : attachments;
    if (atts.some((a) => a.status === "uploading")) return;
    sendAfterUploadRef.current = null;
    void send(undefined, source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments, editAttachments]);

  const removeAttachment = (id: string, target: "main" | "edit" = "main") => {
    const setAtts = target === "edit" ? setEditAttachments : setAttachments;
    setAtts((all) => {
      const removed = all.find((a) => a.id === id);
      const stillInHistory =
        removed?.previewUrl &&
        (messages ?? []).some((m) => m.attachments?.some((x) => x.previewUrl === removed.previewUrl));
      const stillInOther =
        removed?.previewUrl &&
        (target === "edit" ? attachments : editAttachments).some((x) => x.previewUrl === removed.previewUrl);
      if (removed?.previewUrl && !stillInHistory && !stillInOther) revokeAttachmentPreview(removed.previewUrl);
      return all.filter((a) => a.id !== id);
    });
  };

  const send = async (
    raw?: string,
    source: "main" | "edit" = "main",
    confirmed = false,
    opts?: {
      skills?: SkillInvocation[];
      readyAttachments?: Attachment[];
      /** Hide USER bubble (Cursor plan → Build). */
      hideUserBubble?: boolean;
      planBuild?: { path: string; title: string; todos: AgentTodo[] };
      /** Force agent mode for this turn (sync — don't wait for React state). */
      forceMode?: AgentMode;
      /**
       * Build→Plan SwitchMode: keep the existing USER bubble; only paint a new
       * ASSISTANT and optionally skip agent-begin USER persist.
       */
      modeSwitchResend?: boolean;
      /** When modeSwitchResend and USER still exists in DB. */
      skipUserPersist?: boolean;
      /**
       * The follow-up this send is draining. The queue hands the item over
       * rather than dropping it, so a send that never starts can put it back
       * instead of losing the message from the queue, the transcript and the
       * database at once.
       */
      queued?: { id: string; text: string; skills?: SkillInvocation[]; attachments?: Attachment[]; };
      /**
       * Sent with the keyboard. The pause after Stop exists to swallow the
       * same click landing on the Send button that replaces Stop under the
       * pointer; a key press cannot be that click, and dropping it silently
       * lost a message resent the moment Stop put it back in the composer.
       */
      fromKeyboard?: boolean;
    },
  ) => {
    const isEdit = source === "edit";
    const planBuildOpts = opts?.planBuild;
    const hideUserBubble = Boolean(opts?.hideUserBubble || planBuildOpts);
    const modeSwitchResend = Boolean(opts?.modeSwitchResend);
    const skipUserPersist = Boolean(opts?.skipUserPersist ?? modeSwitchResend);
    if (opts?.forceMode) {
      agentModeRef.current = opts.forceMode;
    }

    // Stop (pointer/click) restores the prompt and can remount Send under the
    // cursor — the same gesture's mouseup must not fire a new turn.
    if (!isEdit && !opts?.fromKeyboard && Date.now() < suppressSendUntilRef.current) {
      return;
    }
    // A send is between its first await and claiming busy (it turns image
    // previews into data URLs there). A second Enter in that gap started a
    // second turn; the server refused it and its failure path put the text and
    // images back in the composer, ready to be sent again (2026-11-14). The
    // press is the same message — drop it.
    if (Date.now() - sendStartingRef.current < 5_000 && !opts?.queued && !modeSwitchResend && !hideUserBubble) {
      return;
    }

    if (outOfCredits && !isEdit) {
      // Stay in chat — resurface the credit nudge + upgrade modal for Free.
      setCreditNudgeDismissed(null);
      void refresh();
      if (!isPaidPlan(user?.plan)) openUpgrade("credits");
      return;
    }

    // Editing a message that has later turns after it is destructive (DB rows,
    // sandbox code, and the SDK session all get rewound) — confirm first.
    if (isEdit && !confirmed && messages && editingIndex != null && editingIndex < messages.length - 1) {
      setPendingEditSend({ raw });
      return;
    }

    const editor = isEdit ? editEditorRef.current : editorRef.current;
    const editorChip =
      readPlatformToolFromEditor(editor) ?? (isEdit ? editPlatformChip : platformChip);
    const skills: SkillInvocation[] | undefined =
      opts?.skills ??
      platformChipToSkills(
        editorChip?.tool === "publish"
          ? {
              tool: "publish",
              slug: editorChip.slug || defaultPublishSlug(project.name),
            }
          : editorChip,
      );
    const turnMode: AgentMode =
      opts?.forceMode ?? (skills?.length ? "agent" : agentModeRef.current);
    const paintedChip =
      (skills?.[0] ? skillToPlatformChip(skills[0]) : null) ??
      (editorChip?.tool === "publish"
        ? {
            tool: "publish" as const,
            slug: editorChip.slug || defaultPublishSlug(project.name),
          }
        : editorChip);
    // Typed text only — skills persist as structured blocks, not prompt encoding.
    let text = (raw ?? (editor ? composerPlainText(editor) : isEdit ? editInput : input)).trim();
    // If edit/resend still has legacy encode in the string, strip it for the wire.
    text = publishVisibleText(text);
    // A queued follow-up carries its own files, never the composer's (see pickSendAttachments).
    const { atts, fromQueue } = pickSendAttachments({
      readyAttachments: opts?.readyAttachments,
      queued: opts?.queued,
      isEdit,
      editAttachments,
      composerAttachments: attachments,
    });
    const byId = new Map(atts.map((a) => [a.id, a]));
    const chipOrder = editor && !opts?.readyAttachments && !fromQueue ? composerFileIds(editor) : [];
    const orderedFiles = chipOrder.map((id) => byId.get(id)).filter((a): a is Attachment => Boolean(a));
    const images = atts.filter((a) => a.isImage);
    // Preserve caret chip order for files, then images. Seed/handoff passes readyAttachments.
    const ready = opts?.readyAttachments?.length
      ? opts.readyAttachments.filter((a) => a.status === "ready" && a.path)
      : fromQueue
        ? atts.filter((a) => a.status === "ready" && a.path)
        : [...orderedFiles, ...images].filter((a) => a.status === "ready" && a.path);
    const uploading = !opts?.readyAttachments && !fromQueue && atts.some((a) => a.status === "uploading");
    // Sent while a picture is still uploading (a picked element's lands a second after
    // its card): send it the moment the upload finishes, rather than dropping the press.
    if (uploading && sandboxReady && !raw && !confirmed && !opts?.readyAttachments) {
      sendAfterUploadRef.current = source;
      return;
    }
    // Allow command-chip-only turns (no typed text / files).
    if ((!text && ready.length === 0 && !(skills?.length)) || !sandboxReady || uploading) {
      return;
    }

    // Saving an edited queued follow-up — put it back in the queue, don't start a turn.
    if (!isEdit && editingQueued) {
      const saved = {
        id: editingQueued.id,
        text: text || editingQueued.originalText,
        skills,
        // The composer holds the item's files while it is being edited (files
        // put back from the queue have no chip in the editor, so take them all).
        attachments: atts.filter((a) => a.status === "ready" && a.path),
      };
      const idx = editingQueued.index;
      setEditingQueued(null);
      setFollowUpQueue((q) => {
        const next = [...q];
        next.splice(Math.min(idx, next.length), 0, saved);
        return next;
      });
      setInput("");
      if (editor) clearComposerEditor(editor);
      setAttachments([]);
      setPlatformChip(null);
      return;
    }

    // New user send always unfreezes — empty-stop left this true until now.
    contentFrozenRef.current = false;
    emptyStopSealedRef.current = false;
    sendStartsRef.current += 1;
    setPendingModeSwitch(null);

    // While a turn is running, queue follow-ups (Cursor-style) instead of blocking.
    // Use busyRef (not `busy`) so a drain microtask after stop sees the synced false.
    // Never fall through to start a second concurrent turn — that raced Stop and
    // left a follow-up drain re-POSTing /agent after empty-stop (looks like Stop failed).
    // Plan→Build must never queue the implement blob as a visible follow-up.
    // SwitchMode handoff already waited on the Build lock and keeps UI busy on purpose.
    if (busyRef.current && !isEdit && modeSwitchResend) {
      busyRef.current = false;
    } else if (busyRef.current && !isEdit && (hideUserBubble || planBuildOpts)) {
      const cleared = await waitForAgentInactive(AGENT_LOCK_WAIT_MS);
      if (!cleared || busyRef.current) {
        toast("error", appT().thread.toasts.stillFinishingBuild);
        setPlanPendingApprove((p) =>
          p?.status === "building" ? { ...p, status: "ready" } : p,
        );
        return;
      }
    } else if (busyRef.current && !isEdit) {
      setFollowUpQueue((q) => [
        ...q,
        {
          id: crypto.randomUUID(),
          text: text || `(sent ${ready.length} file${ready.length === 1 ? "" : "s"})`,
          skills,
          // Keep this message's own files with it: the composer is cleared below.
          attachments: ready,
        },
      ]);
      setInput("");
      if (editor) clearComposerEditor(editor);
      setAttachments([]);
      setPlatformChip(null);
      return;
    }

    // Edit/resend while a turn is running: interrupt first, then rewind. Opening
    // the edit composer alone must not cancel (see startEdit).
    if (busyRef.current && isEdit) {
      setStopping(true);
      freezeTurnLocally();
      expectRemoteLockRef.current = true;
      const ok = await cancelAgent(client);
      if (!ok) {
        setStopping(false);
        toast("error", appT().thread.toasts.stopUnreachableRetrySoon);
        return;
      }
      abortRef.current?.abort();
      const stopped = await waitUntilIdle();
      if (!stopped) {
        setStopping(false);
        toast("error", appT().thread.toasts.runStillStopping);
        return;
      }
      const cleared = await waitForAgentInactive(AGENT_LOCK_WAIT_MS);
      setStopping(false);
      if (!cleared) {
        toast("error", appT().thread.toasts.stillStoppingPrevious);
        return;
      }
    }

    // A draft chat has no thread until now: opening New chat must not leave an
    // empty one behind in history. The thread is marked loaded and reconnected
    // before the prop arrives — inside the callback, not after the await: the
    // tab switch can render and run the history load before an await resumes,
    // and that load wiped the turn painted below and aborted its stream.
    let turnThreadId = threadId ?? threadIdRef.current;
    // From here to `busyRef.current = true` there are awaits; a second press
    // in between is dropped (top of send()).
    sendStartingRef.current = Date.now();
    if (!turnThreadId && onEnsureThread) {
      const created = await onEnsureThread((id) => {
        threadIdRef.current = id;
        loadedThreadRef.current = id;
        historyReadyRef.current = id;
        reconnectedRef.current = id;
      });
      if (!created) {
        sendStartingRef.current = 0;
        toast("error", appT().thread.toasts.chatStartFailed);
        return;
      }
      turnThreadId = created;
    }

    // Capture before clearEditComposer() wipes editingIndex.
    const forkFrom = isEdit ? editingIndex : null;
    let editedMessageId = isEdit && editingIndex != null ? messages?.[editingIndex]?.id : undefined;
    // Edited right after its turn: the bubble has no DB id until history is
    // reconciled. Look it up (Nth user message) so this rewinds instead of
    // sending as a new message below the old one.
    if (isEdit && editingIndex != null && !editedMessageId && turnThreadId) {
      const local = messages ?? [];
      const userText = (m: DisplayMessage) =>
        m.blocks.filter((b) => b.kind === "text").map((b) => b.text ?? "").join("\n").trim();
      const edited = local[editingIndex];
      // Counted from the end: older pages may not be loaded on either side.
      const fromEnd = local.slice(editingIndex).filter((m) => m.role === "USER").length;
      if (edited?.role === "USER") {
        try {
          const page = await api.get<MessagesPage>(
            `/v1/projects/${project.id}/threads/${turnThreadId}/messages?limit=30`,
          );
          const users = mapHistory(page.items).filter((m) => m.role === "USER");
          const localTail = local.slice(editingIndex).filter((m) => m.role === "USER").map(userText);
          const savedTail = users.slice(users.length - fromEnd).map(userText);
          const match = users[users.length - fromEnd];
          // Only when every user message from here on lines up — a wrong id would rewind too far.
          if (
            match?.id &&
            users.length >= fromEnd &&
            savedTail.length === localTail.length &&
            savedTail.every((t, i) => t === localTail[i])
          ) {
            editedMessageId = match.id;
          }
        } catch {
          // Fall through: sent as a new message, as before.
        }
      }
    }
    const rewind = Boolean(isEdit && editedMessageId && turnThreadId);

    let prompt = text;
    // Files sent with no words run read-only (Ask mode) — see below.
    let filesOnly = false;
    // What was selected on an annotated preview: for the agent, not the bubble
    // (history.ts strips it the way it strips the attached-files note below).
    const contexts = ready.map((a) => a.context).filter((c): c is string => Boolean(c));
    if (contexts.length) prompt = `${prompt}\n\n${contexts.join("\n\n")}`;
    if (ready.length > 0) {
      const refs = ready.map((a) => `- ${a.path} (${a.name})`).join("\n");
      // Files with no words: a picture alone made the agent rebuild the whole
      // app to match it, unasked (2026-11-14). Have it look, then ask.
      const noWords = !text.trim() && !contexts.length && !(skills?.length);
      filesOnly = noWords;
      const ask = noWords
        ? ". No instructions came with them. Do not change any files this turn — say briefly what you see and ask what they want done with it"
        : "";
      prompt = `${prompt}\n\n[The user attached ${ready.length === 1 ? "a file" : "files"} to this message, saved in the project workspace. Use the Read tool to view ${ready.length === 1 ? "it" : "them"}${ask}:\n${refs}]`;
    }

    const messageAtts: MessageAttachment[] = await Promise.all(
      ready.map(async (a) => {
        let previewUrl = a.previewUrl;
        if (a.isImage && a.path && previewUrl?.startsWith("blob:")) {
          try {
            const durable = await blobUrlToDataUrl(previewUrl);
            revokeAttachmentPreview(previewUrl);
            previewUrl = durable;
          } catch {
            /* keep blob — thumb onError can still fall back to sandbox */
          }
        }
        if (a.isImage && a.path && previewUrl) {
          rememberAttachmentPreview(a.path, previewUrl);
        }
        return {
          id: a.id,
          name: a.name,
          path: a.path!,
          isImage: a.isImage,
          previewUrl,
          ...(a.elementLabel ? { elementLabel: a.elementLabel } : {}),
        };
      }),
    );
    // Capture before clear — keep chip inline where the user placed it.
    const paintedPlatformTool = paintedChip ?? undefined;
    // A queued follow-up carries its own text. The composer holds whatever the
    // user is typing *now*, so reading it here painted the bubble — and the
    // content persisted with the turn — from an unrelated draft: the message
    // on screen said one thing while the agent was answering another.
    const paintFromComposer = !opts?.queued;
    let paintSegs = finalizeComposerSegments(
      paintFromComposer && editor ? meaningfulComposerSegments(editor) ?? [] : [],
      paintedPlatformTool,
    );
    if (text && !paintSegs.some((s) => s.type === "text")) {
      paintSegs = finalizeComposerSegments(
        [...paintSegs, { type: "text", text }],
        paintedPlatformTool,
      );
    }
    // Landing/dashboard seed uploads with skipComposer — editor has no file chips.
    // Without synthesizing file segments here, UserPromptCard prefers text-only
    // `segments` and hides non-image attachments (images still show via the strip).
    const paintedFileIds = new Set(
      paintSegs.filter((s): s is Extract<ComposerSegment, { type: "file" }> => s.type === "file").map((s) => s.id),
    );
    const missingFileSegs = ready
      .filter((a) => !a.isImage && !a.elementLabel && !paintedFileIds.has(a.id))
      .map((a) => ({ type: "file" as const, id: a.id }));
    if (missingFileSegs.length) {
      paintSegs = finalizeComposerSegments([...paintSegs, ...missingFileSegs], paintedPlatformTool);
    }
    const segmentsForPaint = paintSegs.length ? paintSegs : undefined;

    // Stash before clearing — empty Stop must put this back in the main input.
    // Plan-build / mode-switch restart: never restore (USER already stays in chat).
    if (!isEdit && !hideUserBubble && !modeSwitchResend) {
      emptyStopRestoreRef.current = {
        text,
        attachments: ready.map((a) => {
          const painted = messageAtts.find((m) => m.id === a.id);
          return {
            ...a,
            // Prefer durable data: URL — blob may already be revoked above.
            previewUrl: painted?.previewUrl ?? a.previewUrl,
          };
        }),
        segments: segmentsForPaint,
        platformTool: paintedPlatformTool ?? null,
      };
    } else {
      emptyStopRestoreRef.current = null;
    }

    // AbortController before busy/paint so Stop can cancel during preflight.
    abortRef.current = new AbortController();
    sendAbortRef.current = abortRef.current;
    const turnSignal = abortRef.current.signal;

    // Paint the user bubble + streaming assistant immediately. Remote lock /
    // preflight can take seconds after Stop — waiting first made sends feel broken.
    const myGen = ++sendGenerationRef.current;
    const isCurrentTurn = () => sendGenerationRef.current === myGen;
    busyRef.current = true;
    sendStartingRef.current = 0;
    setBusy(true);
    setComposerHelper(null);
    if (isEdit) {
      clearEditComposer();
    } else if (!modeSwitchResend && !opts?.queued) {
      // A queued follow-up was cleared from the composer when it was queued.
      // Clearing again here wiped whatever the user had started typing since —
      // and took the caret with it — every time the queue drained.
      setInput("");
      if (editor) clearComposerEditor(editor);
      setAttachments([]);
      setPlatformChip(null);
      setSlashMenu(null);
    }
    // On a phone the keyboard goes once the message is sent, as ChatGPT's
    // and Claude's apps do: the reply gets the whole screen. Not for a
    // queued follow-up draining, which nobody just sent. In the app always: an
    // Android phone with a mouse or stylus (and the emulator) reports a fine
    // pointer, and the keyboard stayed up over the reply.
    if (!modeSwitchResend && !opts?.queued && (isNative() || window.matchMedia?.("(pointer: coarse)").matches)) dismissKeyboard();
    usageSeenRef.current = new Set();
    // The prompt goes to the top of the chat and the reply grows under it,
    // rather than the view chasing the bottom (ChatPanel does the scroll).
    pinnedToBottom.current = false;
    pinNewTurnToTop.current = true;
    turnStartedAtRef.current = Date.now();
    askWaitAccumRef.current = 0;
    askWaitStartedRef.current = null;
    const optimisticText = text;
    const setAssistantHint = (hint: DisplayMessage["statusHint"]) => {
      if (!isCurrentTurn()) return;
      mutateLast((m) => (m.role === "ASSISTANT" ? { ...m, statusHint: hint } : m));
    };
    const abandonOptimisticTurn = () => {
      if (!isCurrentTurn()) return;
      // This turn never started. If it was a queued follow-up, it goes back to
      // the queue — the composer was already cleared when it was queued, so
      // dropping it here would leave the user nothing to retry.
      const requeue = opts?.queued;
      if (requeue) {
        // Also mark it: the idle drain below must not immediately pick it up
        // again and spin. It waits there for the user, who can send or edit it.
        strandedQueueRef.current.add(requeue.id);
        setFollowUpQueue((q) =>
          q.some((item) => item.id === requeue.id)
            ? q
            : [{ id: requeue.id, text: requeue.text, skills: requeue.skills }, ...q],
        );
      } else {
        // Every other send had its composer cleared before preflight, and this
        // is the path preflight failure takes — so without this the text is
        // gone: not on screen, not in the composer, and never persisted, since
        // the turn never reached the server. An outage while the opening prompt
        // of a new project was starting left the chat on "What do you want to
        // build?" with the message nowhere at all.
        const stash = emptyStopRestoreRef.current;
        if (stash?.text.trim() || stash?.attachments.length) {
          // Only into an empty composer. Anything typed since belongs to the
          // person who typed it; the abandoned text goes to the queue instead,
          // stranded so the idle drain does not immediately re-send it into the
          // same failure.
          const typedSince = (editorRef.current?.textContent ?? "").trim();
          if (!typedSince) {
            restoreComposerRef.current(stash);
          } else if (stash.text.trim()) {
            const strandedId = crypto.randomUUID();
            strandedQueueRef.current.add(strandedId);
            setFollowUpQueue((q) => [...q, { id: strandedId, text: stash.text, skills }]);
          }
          emptyStopRestoreRef.current = null;
        }
      }
      setMessages((prev) => {
        if (!prev?.length) return prev;
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "ASSISTANT" && !last.id) next.pop();
        // Mode-switch keeps the prior USER — never strip it on abandon.
        if (!modeSwitchResend) {
          const user = next[next.length - 1];
          if (user?.role === "USER" && !user.id) next.pop();
        }
        messagesRef.current = next;
        return next;
      });
      // Build never started — put the plan back to Ready.
      if (planPendingRef.current?.status === "building") {
        setPlanPendingApprove((p) =>
          p?.status === "building" ? { ...p, status: "ready" } : p,
        );
      }
      busyRef.current = false;
      setBusy(false);
      turnStartedAtRef.current = null;
    };
    setMessages((m) => {
      // Stop clicked before this updater flushed — don't resurrect the turn.
      if (contentFrozenRef.current) return messagesRef.current ?? m;
      const assistantStub: DisplayMessage = {
        role: "ASSISTANT",
        blocks: [] as DisplayMessage["blocks"],
        streaming: true,
        statusHint: "planning",
        createdAt: new Date().toISOString(),
        startedAtMs: turnStartedAtRef.current ?? Date.now(),
      };
      // SwitchMode restart: keep the existing USER bubble; only add ASSISTANT.
      if (modeSwitchResend) {
        let base = [...(m ?? [])];
        const tail = base[base.length - 1];
        if (tail?.role === "ASSISTANT") base = base.slice(0, -1);
        const next = [...base, assistantStub];
        messagesRef.current = next;
        return next;
      }
      const base = (m ?? []).slice(0, forkFrom ?? m?.length ?? 0);
      const next = [
        ...base,
        {
          role: "USER" as const,
          // Plan-build: no visible bubble — keep blocks empty; marker lives on the wire.
          blocks:
            hideUserBubble
              ? []
              : optimisticText
                ? [{ kind: "text" as const, text: optimisticText }]
                : [],
          attachments: hideUserBubble
            ? undefined
            : messageAtts.length
              ? messageAtts
              : undefined,
          segments: hideUserBubble ? undefined : segmentsForPaint,
          platformTool: hideUserBubble ? undefined : paintedPlatformTool,
          createdAt: new Date().toISOString(),
          // Everything already persisted belongs to earlier turns, whatever it
          // says. Reconcile only lets history *after* this point cover us.
          afterId: [...(m ?? [])].reverse().find((x) => x.id)?.id,
          hideBubble: hideUserBubble || undefined,
          planBuild: planBuildOpts
            ? { path: planBuildOpts.path, title: planBuildOpts.title }
            : undefined,
          seedTodos: planBuildOpts?.todos?.length
            ? planBuildOpts.todos.map((t) => ({ ...t }))
            : undefined,
        },
        assistantStub,
      ];
      // Sync immediately so Stop before the useEffect can still restore the prompt.
      messagesRef.current = next;
      return next;
    });
    // Tab title: don't wait for run end — API auto-titles at agent-begin.
    if (turnThreadId && !modeSwitchResend) {
      const titleHint = hideUserBubble
        ? planBuildOpts?.title || appT().thread.buildTitle
        : text.trim() || (paintedPlatformTool ? platformToolChipLabel(paintedPlatformTool) : "");
      if (titleHint) onThreadTitleHint?.(turnThreadId, titleHint.slice(0, 60));
    }

    // Superseded by a newer send OR explicitly stopped — never touch the next turn.
    const turnCancelled = () =>
      !isCurrentTurn() || turnSignal.aborted || contentFrozenRef.current;
    const releaseTurnStreams = () => {
      if (sendAbortRef.current?.signal === turnSignal) sendAbortRef.current = null;
      if (isCurrentTurn()) abortRef.current = null;
      else if (abortRef.current?.signal === turnSignal) abortRef.current = null;
    };

    // Preflight always. Status only after Stop (lingering Redis lock) — not on every
    // send (busyRef is already true here, so it must not gate the probe).
    if (!turnCancelled()) {
      // Deliberately not "connecting" here. The stub is already showing
      // "Planning next moves…", preflight takes about two hundred milliseconds,
      // and setting it meant the line flipped to another word and back before
      // anyone could read either — a flicker on every single send. The word is
      // worth keeping for the one case it describes something the user can act
      // on, which is a stream that dropped and is being picked back up.
      const needStatus = !isEdit && (expectRemoteLockRef.current || Boolean(opts?.queued));
      const statusPromise = needStatus
        ? agentStatus(client).catch(() => ({ active: false as boolean }))
        : Promise.resolve({ active: false as boolean });
      // The orchestrator enforces the turn gate itself as the turn starts, and
      // its refusal is handled where the stream call fails (`refuseTurn`) — so
      // an ordinary send no longer waits a round trip for it (0.6–0.9s measured
      // in production). An edit still asks first: it truncates the conversation
      // before the turn starts, and a refused edit must not cost the history.
      // Read-only check — safe to repeat while a deploy's balancer answers for the API.
      const preflightPromise = rewind
        ? retryThroughDeploy(
            () => api.post(`/v1/projects/${project.id}/agent/preflight`, { prompt: text }),
            (err) => err instanceof ApiError && isDeployBlip(err.status, err.body),
            { signal: turnSignal },
          )
            .then(() => ({ ok: true as const }))
            .catch((err: unknown) => ({ ok: false as const, err }))
        : Promise.resolve({ ok: true as const });

      const [remote, preflight] = await Promise.all([statusPromise, preflightPromise]);
      if (turnCancelled()) {
        // stop() already froze UI
      } else if (!preflight.ok) {
        const err = preflight.err;
        const status = (err as { status?: number }).status;
        const body = (err as { body?: { message?: string; error?: string } }).body;
        abandonOptimisticTurn();
        // A member's limit, or a workspace someone else pays for: say why — buying
        // or upgrading on your own account wouldn't help.
        if (status === 402 && (body?.error === "member_limit" || body?.message)) {
          // In the person's language, not the server's English.
          const limit = (body as { limitCredits?: number } | undefined)?.limitCredits;
          const tt = appT().teams;
          toast(
            "error",
            body?.error === "member_limit" && typeof limit === "number"
              ? pl(tt.memberLimitReached, limit)
              : body?.error === "no_credits"
                ? tt.workspaceOutOfCredits
                : (body?.message ?? appT().thread.toasts.requestRefused),
          );
          return;
        }
        if (status === 402) {
          setCreditNudgeDismissed(null);
          void refresh();
          if (!isPaidPlan(user?.plan)) openUpgrade("credits");
          return;
        }
        if (status === 403) {
          toast("error", body?.message ?? appT().thread.toasts.requestRefused);
          return;
        }
        // fetchWithRetry reports a network failure as status 0, which the
        // generic message below turned into "try again" — true, but it never
        // said why, and being told the connection is the problem is the
        // difference between retrying now and retrying pointlessly.
        if (status === 0) {
          toast(
            "error",
            isOffline()
              ? appT().thread.toasts.offlineMessageRestored
              : appT().thread.toasts.unreachableMessageRestored,
          );
          return;
        }
        toast("error", body?.message ?? appT().thread.toasts.turnStartFailed);
        return;
      } else if (remote.active) {
        setAssistantHint("planning");
        let cleared = await waitForAgentInactive(AGENT_LOCK_WAIT_MS, turnSignal);
        if (!cleared && !turnCancelled()) {
          // Cold daemon teardown can outlast one window — one more shot.
          cleared = await waitForAgentInactive(AGENT_LOCK_WAIT_MS, turnSignal);
        }
        if (turnCancelled()) {
          // cancelled while waiting
        } else if (!cleared) {
          // abandonOptimisticTurn re-queues a drained follow-up; a first send
          // still needs its text kept.
          if (!opts?.queued) {
            setFollowUpQueue((q) => [...q, { id: crypto.randomUUID(), text, skills }]);
          }
          abandonOptimisticTurn();
          toast("error", appT().thread.toasts.stillStoppingPrevious);
          return;
        }
      }
    }

    if (turnCancelled()) {
      // Shared end-of-turn cleanup (busy false + queue drain) below.
    } else {
      setAssistantHint("planning");

      // True branch-on-edit: discard DB rows + sandbox files from the edit point
      // onward before the new prompt runs. UI already shows the branch above.
      // Cursor-like speed: truncate (API) and files-only git reset (sandbox) run
      // in parallel; we do NOT restart preview services (dev-server HMR picks up the
      // file change — killing/restarting over E2B is what made this feel slow).
      let resumeSessionAt: string | undefined;
      if (rewind) {
        // Drop live plan UI — remaining history (if any) rebuilds status; a full
        // rewind to the first message must not keep "plan ready" / Build chrome.
        setPlanPendingApprove(null);
        setPlanStatusByPath({});
        // Checkpoint is truth for plan todos — wipe mid-Build View Plan cache.
        clearPlanContentCache();
        const prior = forkFrom != null && forkFrom > 0 ? messages?.[forkFrom - 1] : null;
        const gitShaHint =
          prior?.role === "ASSISTANT"
            ? (prior.gitSha ?? prior.blocks.find((b) => b.kind === "checkpoint")?.gitSha ?? null)
            : null;
        try {
          const [trunc] = await Promise.all([
            api.post<{
              ok: true;
              gitSha: string | null;
              resumeSessionAt: string | null;
              resetAgentSession?: boolean;
            }>(`/v1/projects/${project.id}/threads/${turnThreadId}/truncate`, {
              fromMessageId: editedMessageId,
            }),
            orch.restore(client, gitShaHint, { filesOnly: true }).then(() => {
              // Files rolled back: refresh the Code tab and reload the preview.
              onFilesChanged();
              onReloadPreview?.();
            }).catch(() => {
              // Best-effort — proceed even if the sandbox couldn't be reset.
            }),
          ]);
          resumeSessionAt = trunc.resumeSessionAt ?? undefined;
          // If the client hint disagreed with the server (shouldn't — same prior
          // turn), re-restore to the canonical SHA. Cheap no-op when they match.
          if (trunc.gitSha !== gitShaHint) {
            try {
              await orch.restore(client, trunc.gitSha, { filesOnly: true });
              onFilesChanged();
              onReloadPreview?.();
            } catch {
              // ignore
            }
          }
          // Git already restored files. Drop live plan cache; Built/Ready from disk.
          clearPlanContentCache();
          const kept = (messages ?? []).slice(0, forkFrom ?? 0);
          const diskStatuses = await planStatusesFromDisk(client, planPathsFromMessages(kept));
          setPlanStatusByPath(diskStatuses);
          window.dispatchEvent(new CustomEvent("mythex:plan-cache-clear", { detail: {} }));
          onFilesChanged();
          onReloadPreview?.();
        } catch {
          toast("error", appT().thread.toasts.editPrepareFailed);
          abandonOptimisticTurn();
          if (turnThreadId) {
            void api
              .get<MessagesPage>(`/v1/projects/${project.id}/threads/${turnThreadId}/messages?limit=30`)
              .then((page) => {
                setMessages(mergeAttachmentPreviews(mapHistory(page.items), messagesRef.current));
                setHasMoreOlder(page.hasMore);
                hasMoreOlderRef.current = page.hasMore;
              })
              .catch(() => {});
          }
          return;
        }
      }

      if (turnCancelled()) {
        // stopped during rewind
      } else {
        const streamBody = {
          prompt,
          threadId: turnThreadId,
          resumeSessionAt,
          // A picture with no words is not an instruction. The note alone did
          // not stop DeepSeek rebuilding the app to match it (tested twice), so
          // this one turn runs read-only: it can look, and then it asks.
          mode: (filesOnly && turnMode === "agent" && !isEdit ? "ask" : turnMode) as "agent" | "plan" | "ask",
          model: "mythex-lite",
          appTesting: true,
          skills,
          ...(skipUserPersist ? { skipUserPersist: true as const } : {}),
          messageContent: (() => {
            const blocks: Array<
              | { type: "text"; text: string }
              | { type: "skill"; id: string; params?: Record<string, unknown> }
            > = [];
            if (hideUserBubble && planBuildOpts) {
              // Persist marker + implement prompt (UI hides the bubble on reload).
              blocks.push({
                type: "text",
                text: `${encodePlanBuildMarker(planBuildOpts.path, planBuildOpts.title)}${text}`,
              });
              return blocks;
            }
            for (const seg of paintSegs) {
              if (seg.type === "platformTool") {
                const inv = platformChipToSkills({
                  tool: seg.tool,
                  slug: seg.slug,
                  keys: seg.keys,
                })?.[0];
                if (inv) blocks.push({ type: "skill", id: inv.id, params: inv.params });
              } else if (seg.type === "text" && seg.text.trim()) {
                blocks.push({ type: "text", text: seg.text });
              }
            }
            if (!blocks.length && skills?.length) {
              for (const s of skills) blocks.push({ type: "skill", id: s.id, params: s.params });
              if (text.trim()) blocks.push({ type: "text", text });
            }
            // History recovers chips via parseAttachmentsFromPrompt — the appendix
            // must live in the persisted text (messageContent wins over prompt).
            const appendix = prompt.match(ATTACHMENT_APPENDIX_RE)?.[0];
            if (appendix) {
              const lastText = [...blocks].reverse().find((b) => b.type === "text");
              if (lastText && lastText.type === "text") {
                if (!ATTACHMENT_APPENDIX_RE.test(lastText.text)) {
                  // The agent reads this text, not `prompt`: the selected elements go with the note.
                  const elements = contexts.length ? `\n\n${contexts.join("\n\n")}` : "";
                  lastText.text = `${lastText.text}${elements}${appendix}`;
                }
              } else if (ready.length > 0) {
                blocks.push({ type: "text", text: prompt.trimStart() });
              }
            }
            return blocks.length ? blocks : undefined;
          })(),
        };

        const failEmptyAssistant = (err: unknown) => {
          if (!isCurrentTurn()) return;
          const stash = emptyStopRestoreRef.current;
          const helper = helperFromFailure(err, prompt);
          setComposerHelper(helper);
          let truncateFromId: string | null = null;
          setMessages((prev) => {
            if (!prev?.length) return prev;
            const last = prev[prev.length - 1];
            if (last?.role !== "ASSISTANT") return prev;
            const hasWork = last.blocks.some(
              (b) =>
                b.kind === "tool" ||
                (b.kind === "text" && Boolean(b.text?.trim())) ||
                (b.kind === "thinking" && Boolean(b.text?.trim())),
            );
            if (hasWork) return prev;
            let next = prev.slice(0, -1);
            const user = next[next.length - 1];
            // Mirror empty-Stop: pull the USER bubble back into the composer.
            if (user?.role === "USER" && stash) {
              truncateFromId = user.id ?? null;
              next = next.slice(0, -1);
            }
            messagesRef.current = next;
            return next;
          });
          if (stash) {
            applyEmptyStopRestoreRef.current(stash);
            // applyEmptyStopRestore clears the helper — restore Connection Error.
            setComposerHelper(helper);
            // Never reached a handler — nothing was saved, so nothing to undo.
            if (!(err as { notStarted?: boolean }).notStarted) {
              discardEmptyRestoredTurnRef.current(truncateFromId, stash.text);
            }
          }
        };

        try {
          let sawTerminal = false;
          let posted = false;
          const liveStreamSignal = (): AbortSignal => {
            const streamAc = new AbortController();
            abortRef.current = streamAc;
            const stopStream = () => streamAc.abort();
            if (turnSignal.aborted) stopStream();
            else turnSignal.addEventListener("abort", stopStream, { once: true });
            return streamAc.signal;
          };
          // Resume stream (not the POST one) currently being read, if any. The
          // turn's own `done` does not clear `streaming` — only the finalize
          // block below does, and that waits on the stream promise. Older
          // orchestrators keep /agent/stream open after the turn ends, so close
          // it ourselves or the chat freezes on "Finishing up…" until refresh.
          let resumeAc: AbortController | null = null;
          let sawEnding = false;
          const onStreamEvent = (event: AgentEvent) => {
            sendAwaitingAnswerRef.current = false;
            // The turn already ended; a failure after that is the preview
            // restart, not the turn — never a Connection Error under the reply.
            if (event.type === "error" && sawEnding) return;
            if (isAgentTurnTerminal(event.type)) sawEnding = true;
            if (isAgentTurnTerminal(event.type) || event.type === "error") sawTerminal = true;
            if (isAgentTurnTerminal(event.type)) resumeAc?.abort();
            if (event.type !== "stream_end") applyEvent(event);
          };
          const resumeStreamSignal = (): AbortSignal => {
            const signal = liveStreamSignal();
            resumeAc = abortRef.current;
            return signal;
          };
          const resumeFromDrop = async () => {
            setAssistantHint("connecting");
            mutateLast((m) =>
              m.role === "ASSISTANT" ? { ...m, streaming: true, statusHint: "connecting" } : m,
            );
            for (let attempt = 0; !sawTerminal && !turnCancelled(); attempt++) {
              invalidateAgentStatus(client);
              let stillActive = true;
              try {
                stillActive = (await agentStatus(client)).active;
              } catch {
                stillActive = true;
              }
              if (!stillActive) {
                try {
                  await streamAgentResume(client, onStreamEvent, resumeStreamSignal());
                } catch {
                  // buffer replay best-effort
                }
                break;
              }
              let primed = false;
              const onResumeEvent = (event: AgentEvent) => {
                if (!primed && event.type !== "stream_end") {
                  primed = true;
                  mutateLast((m) =>
                    m.role === "ASSISTANT" ? { ...m, blocks: [], streaming: true, statusHint: "connecting" } : m,
                  );
                }
                onStreamEvent(event);
              };
              try {
                await streamAgentResume(client, onResumeEvent, resumeStreamSignal());
              } catch {
                if (turnCancelled()) break;
              }
              if (!sawTerminal && !turnCancelled()) {
                try {
                  await sleepMs(Math.min(4000, 500 * 2 ** Math.min(attempt, 4)), turnSignal);
                } catch {
                  break;
                }
              }
            }
          };
          /**
           * The turn was refused as it started — suspended project, blocked
           * content, unverified email or no credits. Answered the way preflight
           * used to be: the message goes back to the composer and the reason is
           * shown (the upgrade prompt for credits).
           */
          const refuseTurn = (err: unknown): boolean => {
            const e = err as { code?: string; status?: number; message?: string; serverMessage?: string; limitCredits?: number };
            if (!e?.code || !TURN_REFUSAL_CODES.has(e.code)) return false;
            refused = true;
            abandonOptimisticTurn();
            if (e.code === "no_credits" && !e.serverMessage) {
              setCreditNudgeDismissed(null);
              void refresh();
              if (!isPaidPlan(user?.plan)) openUpgrade("credits");
              return true;
            }
            // A workspace's own refusals, in the person's language (the server's are English).
            const tt = appT().teams;
            toast(
              "error",
              e.code === "member_limit" && typeof e.limitCredits === "number"
                ? pl(tt.memberLimitReached, e.limitCredits)
                : e.code === "no_credits" && e.serverMessage
                  ? tt.workspaceOutOfCredits
                  : e.message || appT().thread.toasts.requestRefused,
            );
            return true;
          };
          sendAwaitingAnswerRef.current = true;
          let refused = false;
          try {
            await streamAgent(client, streamBody, onStreamEvent, liveStreamSignal());
            posted = true;
          } catch (err) {
            if (turnCancelled()) {
              // Stop / supersede — lock wait already covered below for follow-ups.
            } else if (refuseTurn(err)) {
              // Refused before anything started.
            } else if ((err as { code?: string }).code === "build_in_progress") {
              // Status should have waited already; one recovery wait then one shot.
              setAssistantHint("planning");
              const cleared = await waitForAgentInactive(AGENT_LOCK_WAIT_MS, turnSignal);
              if (!cleared || turnCancelled()) {
                if (!turnCancelled()) failEmptyAssistant(err);
              } else {
                try {
                  await streamAgent(client, streamBody, onStreamEvent, liveStreamSignal());
                  posted = true;
                } catch (err2) {
                  if (turnCancelled()) {
                    // Stop
                  } else if (refuseTurn(err2)) {
                    // Refused before anything started.
                  } else if (isDroppedAgentStreamError(err2)) {
                    posted = true;
                  } else {
                    failEmptyAssistant(err2);
                  }
                }
              }
            } else if (isDroppedAgentStreamError(err)) {
              // Mobile Safari: TypeError "Load failed" / fetch abort — turn still live.
              posted = true;
            } else {
              failEmptyAssistant(err);
            }
          }
          sendAwaitingAnswerRef.current = false;
          // Refused: the turn was abandoned like a refused preflight, and like
          // that path it ends here. The shared cleanup below drains the queue,
          // which would send a re-queued follow-up straight back into the same
          // refusal, over and over.
          if (refused) return;
          // Mobile Safari / radio often ends the POST SSE without a `done` frame
          // while the sandbox turn is still running. Resume via /agent/stream
          // instead of sealing a truncated reply.
          if (posted && !sawTerminal && !turnCancelled()) {
            await resumeFromDrop();
          }
          if (sawTerminal) void tailForRunUpdate();
        } catch (err) {
          if ((err as Error).name !== "AbortError" && !turnCancelled()) {
            failEmptyAssistant(err);
          }
        }
      }
    }
    {
      // A newer send() already owns busy/messages/queue — don't finalize over it.
      // Still drain the follow-up queue if we left items stranded (e.g. empty-stop
      // cleared busy while this turn was mid-await, then a send hit the queue path).
      if (!isCurrentTurn()) {
        releaseTurnStreams();
        return;
      }
      // User Stop (or empty server-stop restore) — do not drain a queued duplicate
      // of the same prompt (that re-POST /agent and looks like Stop did nothing).
      if (contentFrozenRef.current || emptyStopSealedRef.current) {
        releaseTurnStreams();
        busyRef.current = false;
        setBusy(false);
        setPendingQuestion(null);
        // Keep pendingModeSwitch — Stop clears it; Switch/Skip own the card.
        setPendingSecrets(null);
        // Drop only a queued copy of the prompt this turn just stopped; keep
        // the follow-ups the user queued behind it.
        const stoppedText = text.trim();
        if (stoppedText) {
          setFollowUpQueue((q) => q.filter((item) => item.text.trim() !== stoppedText));
        }
        // ↑ on a queued item cuts this turn and leaves its text pending. This
        // branch returns before the drain that would send it, so clearing the
        // ref here threw that message away — the one the user had just asked
        // to send now. Put it back in the queue and let the idle drain take it.
        const pendingNow = immediateSendRef.current;
        immediateSendRef.current = null;
        if (pendingNow?.text) {
          setFollowUpQueue((q) =>
            q.some((item) => item.text === pendingNow.text)
              ? q
              : [{ id: crypto.randomUUID(), text: pendingNow.text, skills: pendingNow.skills }, ...q],
          );
        }
        return;
      }

      releaseTurnStreams();
      const started = turnStartedAtRef.current ?? undefined;
      turnStartedAtRef.current = null;
      const worked = activeWorkedMs(started);
      askWaitAccumRef.current = 0;
      askWaitStartedRef.current = null;
      // Only finalize the last assistant if it's still present (failure path may have removed it).
      const tail = messagesRef.current?.[messagesRef.current.length - 1];
      if (tail?.role === "ASSISTANT") {
        mutateLast((m) => ({
          ...m,
          blocks: sealOpenTools(freezeOpenThinking(m.blocks)),
          streaming: false,
          statusHint: undefined,
          // Keep server-sealed duration from done/stopped — don't inflate with the
          // Send→done client clock (includes preflight / daemon wait).
          workedMs:
            m.workedMs != null
              ? m.workedMs
              : pickWorkedMs(worked, activeWorkedMs(null, m.startedAtMs)),
          workedMsEstimated: m.workedMs == null || m.workedMsEstimated === true,
        }));
      }
      // Sync before queueMicrotask drain — React's busy effect can lag a tick,
      // and send() would otherwise re-queue the follow-up while busyRef is still true.
      busyRef.current = false;
      setBusy(false);
      setPendingQuestion(null);
      // Do not clear pendingModeSwitch here — the countdown card must stay until
      // Switch / Skip / Stop (stream can end in mocks; live waits on the tool).
      setPendingSecrets(null);
      // Plan mode: always materialize the plan card after the turn (done may
      // race with reconcile). Uses turnMode captured at send-time.
      if (turnMode === "plan") {
        await finalizePlanTurn();
      }
      // Drain follow-up queue (one at a time). Prefer an interrupt "send now" text.
      // Important: React may invoke this updater twice (Strict Mode). Always pop the
      // head when draining — only guard *scheduling* send with followUpDrainRef.
      // Returning `q` unchanged when the ref is set left the item visible in "Queued"
      // while the microtask still sent it.
      setFollowUpQueue((q) => {
        const immediate = immediateSendRef.current;
        if (immediate) {
          immediateSendRef.current = null;
          if (!followUpDrainRef.current) {
            followUpDrainRef.current = true;
            queueMicrotask(() => {
              void send(immediate.text, "main", false, {
                skills: immediate.skills,
                forceMode: immediate.forceMode,
                queued: { id: crypto.randomUUID(), text: immediate.text, skills: immediate.skills, attachments: immediate.attachments },
              }).finally(() => {
                followUpDrainRef.current = false;
              });
            });
          }
          // sendQueuedNow already removed that id; drop any duplicate same text.
          return q.filter((item) => item.text !== immediate.text);
        }
        if (!q.length) return q;
        const [next, ...rest] = q;
        if (!followUpDrainRef.current) {
          followUpDrainRef.current = true;
          queueMicrotask(() => {
            void send(next.text, "main", false, {
              skills: next.skills,
              queued: next,
            }).finally(() => {
              followUpDrainRef.current = false;
            });
          });
        }
        return rest;
      });
      // Do NOT call onFilesChanged() here — that remounts the preview iframe
      // after every turn (including a plain "hi"). File tools already trigger
      // a debounced refresh via applyEvent's tool_result path; HMR covers
      // the rest.
      // Reconcile with the canonical DB state: picks up the persisted id +
      // checkpoint gitSha for this turn (needed for a LATER edit to rewind
      // correctly) without requiring a manual refresh. Never wipes the frozen
      // partial reply — see reconcileHistory. Given this turn's thread: a new
      // chat's thread did not exist when send() began.
      void reconcileHistory(turnThreadId ?? undefined);
    }
  };

  // The queue used to drain from one place only: the end of a turn, inside that
  // turn's own cleanup. Every path that left items queued while idle stranded
  // them for good — an interrupt (↑ on a queued item) freezes the turn, whose
  // cleanup returns early and never drains, so the remaining follow-ups sat
  // there with nothing left to trigger them. Idle with something queued is the
  // real condition, so make that the trigger.
  useEffect(() => {
    if (busy || stopping) return;
    // send() returns without starting a turn while the workspace is down, after
    // this effect has already taken the item off the queue — the message was
    // gone. Hold the queue until the workspace is up; this re-runs then.
    if (!sandboxReady) return;
    if (followUpDrainRef.current || immediateSendRef.current) return;
    // Deliberately not gated on contentFrozen / emptyStopSealed: an interrupt
    // sets those and they stay set until the next send — which is this one, so
    // gating here is self-defeating and left the rest of the queue stranded.
    // They guard the stopped turn's transcript, not the user's other messages;
    // the queued copy of the stopped prompt is already dropped where it stops.
    // These are waiting on the user, not on us.
    if (pendingQuestion || pendingSecrets || pendingModeSwitch || editingQueued) return;
    const next = followUpQueue.find((item) => !strandedQueueRef.current.has(item.id));
    if (!next) return;
    // Held across the whole send, not just until it is scheduled: `busy` only
    // becomes true a render later, so releasing early let this effect fire
    // again on the next render and put two turns in flight at once — which
    // reordered the transcript and left one stuck on "Connecting...".
    followUpDrainRef.current = true;
    setFollowUpQueue((q) => q.filter((item) => item.id !== next.id));
    queueMicrotask(() => {
      void send(next.text, "main", false, { skills: next.skills, queued: next }).finally(() => {
        followUpDrainRef.current = false;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, stopping, sandboxReady, followUpQueue, pendingQuestion, pendingSecrets, pendingModeSwitch, editingQueued]);
  return { addFiles, removeAttachment, send };
}
