import { useState, type RefObject } from "react";
import type { PlatformToolChip, SkillInvocation } from "../PlatformToolsMenu";
import type { AgentMode, Attachment, ComposerSegment, DisplayMessage } from "./types";

/**
 * The chat panel's own refs, made once and handed around as one object.
 *
 * These are the ones that start from a constant. They lived as 56 separate
 * useRef calls in ChatPanel, and every hook it is split into had to be given
 * the ones it touched by name — 94 inputs for sending alone. A ref is only ever
 * a stable `{ current }` box, so creating them all in one lazy initializer is
 * the same thing React's useRef gives: one object each, for the life of the
 * panel. Refs seeded from a prop or state (the current thread, the agent mode)
 * stay in the component, where that value exists.
 */
export function useChatRefs() {
  const [refs] = useState(() => ({
    hasMoreOlderRef: { current: false } as RefObject<boolean>,
    loadingOlderRef: { current: false } as RefObject<boolean>,
    messagesRef: { current: null } as RefObject<DisplayMessage[] | null>,
  /** Ignore Send/submit that is really the mouseup of a Stop click. */
    suppressSendUntilRef: { current: 0 } as RefObject<number>,
    followUpDrainRef: { current: false } as RefObject<boolean>,
  /** Queued ids whose send could not start — don't auto-retry them in a loop. */
    strandedQueueRef: { current: new Set() } as RefObject<Set<string>>,
  /** After interrupt, send this text next instead of draining the queue head. */
    immediateSendRef: { current: null } as RefObject<{ text: string; skills?: SkillInvocation[]; forceMode?: AgentMode; attachments?: Attachment[]; } | null>,
  /**
   * Prompt cleared at Send — restore into the main composer on empty Stop
   * (before any assistant tokens). Survives paint/setState races.
   */
    emptyStopRestoreRef: { current: null } as RefObject<{ text: string; attachments: Attachment[]; segments?: ComposerSegment[]; platformTool?: PlatformToolChip | null; } | null>,
  /** Empty-Stop restored the composer — block reconcile from resurrecting that turn. */
    emptyStopSealedRef: { current: false } as RefObject<boolean>,
    applyEmptyStopRestoreRef: { current: () => {} } as RefObject<(stash: { text: string; attachments: Attachment[]; segments?: ComposerSegment[]; platformTool?: PlatformToolChip | null; }) => void>,
  /**
   * Put a stashed composer back, without any of Stop's other bookkeeping.
   *
   * A turn that never started has to give the text back, and until now only a
   * queued follow-up did. Everything else — a first message, the opening prompt
   * of a brand new project — was cleared from the composer before preflight and
   * dropped on failure, so an outage at the wrong moment lost what the user had
   * typed with nothing on screen to retry from.
   */
    restoreComposerRef: { current: () => {} } as RefObject<(stash: { text: string; attachments: Attachment[]; segments?: ComposerSegment[]; platformTool?: PlatformToolChip | null; }) => void>,
  /** Drop DB rows for an empty turn restored to the composer (Stop / soft failure). */
    discardEmptyRestoredTurnRef: { current: () => {} } as RefObject<(fromMessageId?: string | null, expectedText?: string) => void>,
  /** User hit Stop / send-now — freeze chat at last tokens; ignore further content events. */
    contentFrozenRef: { current: false } as RefObject<boolean>,
  // ReloadPreview calls seen this session, and the ones already acted on: the
  // stream replays a finished turn when it reconnects, and the replay must not
  // reload the pane a second time.
    reloadPreviewIdsRef: { current: new Set<string>() } as RefObject<Set<string>>,
    reloadPreviewDoneRef: { current: new Set<string>() } as RefObject<Set<string>>,
  /** After cancel, Redis lock may linger — next send should wait-idle once. */
    expectRemoteLockRef: { current: false } as RefObject<boolean>,
  // Most turns run no subagent: nothing to say then, and saying "nothing" again
  // on every streamed chunk was a Workspace update per chunk (Sentry 7d5dc8b2).
  //
  // While one runs, the snapshots really do change with every nested event, so
  // no equality check can hold — and reporting from the effect made each event
  // a chain: this panel commits, Workspace re-renders, this panel re-renders
  // with the next event, reports again. The chaos run caught it in a subagent
  // turn. So the report goes out at most once a frame, outside the commit.
    sentEmptySnapshotsFor: { current: null } as RefObject<string | null>,
    snapshotFrame: { current: null } as RefObject<number | null>,
  // Free + empty: open the upgrade modal once per empty episode (project open
  // or balance dropping to 0). Dismiss stays dismissed until they get credits
  // again; send while empty resurfaces it below.
    autoOpenedOutOfCreditsRef: { current: false } as RefObject<boolean>,
    scrollRef: { current: null } as RefObject<HTMLDivElement | null>,
    fileInputRef: { current: null } as RefObject<HTMLInputElement | null>,
    editorRef: { current: null } as RefObject<HTMLDivElement | null>,
    editFileInputRef: { current: null } as RefObject<HTMLInputElement | null>,
    editEditorRef: { current: null } as RefObject<HTMLDivElement | null>,
    editShellRef: { current: null } as RefObject<HTMLDivElement | null>,
    editSeedRef: { current: null } as RefObject<{ text: string; files: Attachment[]; segments?: ComposerSegment[]; platformTool?: PlatformToolChip; } | null>,
    editPickingFileRef: { current: false } as RefObject<boolean>,
  // Caret position when focus leaves the editor (e.g. paperclip click).
    savedRangeMainRef: { current: null } as RefObject<Range | null>,
    savedRangeEditRef: { current: null } as RefObject<Range | null>,
    pinnedToBottom: { current: true } as RefObject<boolean>,
    /** Set by a send: the new turn scrolls to the top of the chat (see ChatPanel). */
    pinNewTurnToTop: { current: false } as RefObject<boolean>,
    pinningChatScroll: { current: false } as RefObject<boolean>,
    chatScrollTop: { current: 0 } as RefObject<number>,
    touchChatYRef: { current: null } as RefObject<number | null>,
    sentInitial: { current: false } as RefObject<boolean>,
  /** Stable timestamp for the display-only home→workspace opening bubble. */
    openingSeedAtRef: { current: null } as RefObject<string | null>,
    openingSeedMessagesRef: { current: null } as RefObject<DisplayMessage[] | null>,
    abortRef: { current: null } as RefObject<AbortController | null>,
  /** Always the live send() controller — Stop must abort this even if resume stole abortRef. */
    sendAbortRef: { current: null } as RefObject<AbortController | null>,
  /** Bumped on every painted send so a stopped turn's cleanup can't kill the next one. */
    sendGenerationRef: { current: 0 } as RefObject<number>,
  /** Bumped the moment a send starts. A Stop's DB cleanup checks it before each
   * delete: once the user has sent again, "the last USER" is the new message,
   * and the orchestrator already removes the stopped turn's own rows by id. */
    sendStartsRef: { current: 0 } as RefObject<number>,
  // Mirrors `busy` for async code (e.g. waitUntilIdle) that can't see fresh
  // state through a closure.
    busyRef: { current: false } as RefObject<boolean>,
  // Wall-clock start of the in-flight assistant turn (survives message rewrites).
    turnStartedAtRef: { current: null } as RefObject<number | null>,
  /** Time spent blocked on AskUserQuestion — excluded from "Worked for" (Cursor-like). */
    askWaitAccumRef: { current: 0 } as RefObject<number>,
    askWaitStartedRef: { current: null } as RefObject<number | null>,
  // Per-build dedup of usage frames (parallel tool calls in a turn share a
  // message id, so their usage must only be counted once).
    usageSeenRef: { current: new Set() } as RefObject<Set<string>>,
  // Guards the mid-build reconnect so it runs at most once per thread mount
  // (hollow stream_end clears it for a bounded retry).
    reconnectedRef: { current: null } as RefObject<string | null>,
    reconnectHollowAttemptsRef: { current: 0 } as RefObject<number>,
  /** Bounded retries when an SSE drop happens mid-turn (mobile Safari / radio). */
    reconnectDropAttemptsRef: { current: 0 } as RefObject<number>,
    reconnectStatusAttemptsRef: { current: 0 } as RefObject<number>,
  /** POST /agent sent, no event back yet — nothing to resume if it is cut. */
    sendAwaitingAnswerRef: { current: false } as RefObject<boolean>,
  // Tracks which thread's history has been loaded so re-renders (which change
  // callback identities) never re-fetch and clobber an in-flight streamed
  // message. History is (re)loaded only when the thread actually changes.
    loadedThreadRef: { current: null } as RefObject<string | null>,
  // Reconnect must wait until history is in messagesRef — otherwise sandboxReady
  // can resume into an empty transcript, set reconnectedRef, then history load
  // wipes the streaming turn (Plan→Build looks stopped while the agent runs).
    historyReadyRef: { current: null } as RefObject<string | null>,
  /** Coalesce concurrent reconcileHistory calls (stop + stream end both fire it). */
    reconcileInflightRef: { current: null } as RefObject<Promise<void> | null>,
  /**
   * The thread whose reconcile has not landed yet. A phone that wakes on a bad
   * connection finds the turn over and then fails to fetch it, and the chat no
   * longer looks live, so nothing asked again: the half turn stayed until a
   * manual refresh. Coming back to the tab or the network asks again.
   */
    reconcileOwedRef: { current: null } as RefObject<string | null>,
  /** After Stop-with-no-reply we truncate the USER row — skip reconcile until that lands. */
    suppressReconcileRef: { current: false } as RefObject<boolean>,
  // For the user bubbles, which are memoized: one identity for the life of the
  // panel, calling whatever `startEdit` is current.
    startEditRef: { current: () => {} } as RefObject<(index: number) => void>,
  }));
  return refs;
}

export type ChatRefs = ReturnType<typeof useChatRefs>;
