import type { Dispatch, SetStateAction } from "react";
import { type ProjectDetail } from "../../lib/api";
import { cancelAgent, type OrchClient } from "../../lib/orchestrator";
import { defaultPublishSlug, matchSlashCommand, platformChipToSkills, textBeforeCaret, type PlatformToolChip, type PlatformToolId, type SkillInvocation } from "../PlatformToolsMenu";
import { clearComposerEditor, composerPlainText, deleteSlashTokenAtCaret, insertPlatformToolChipAtCaret, setComposerText } from "./composer-dom";
import { type AgentMode, type AgentTodo, type Attachment } from "./types";
import type { ChatRefs } from "./refs";
import { appT } from "../../i18n/app";

/** Everything useQueueActions reads from the chat panel. */
export type QueueActionsCtx = {
  refs: ChatRefs;
  busy: boolean;
  client: OrchClient;
  editingQueued: { id: string; originalText: string; index: number; attachments?: Attachment[]; } | null;
  followUpQueue: { id: string; text: string; skills?: SkillInvocation[]; attachments?: Attachment[]; }[];
  freezeTurnLocally: (opts?: { restoreToInput?: boolean; }) => void;
  input: string;
  platformChip: PlatformToolChip | null;
  project: ProjectDetail;
  resizeEditor: (el: HTMLElement | null) => void;
  send: (raw?: string, source?: "main" | "edit", confirmed?: boolean, opts?: { skills?: SkillInvocation[]; readyAttachments?: Attachment[]; hideUserBubble?: boolean; planBuild?: { path: string; title: string; todos: AgentTodo[]; }; forceMode?: AgentMode; modeSwitchResend?: boolean; skipUserPersist?: boolean; queued?: { id: string; text: string; skills?: SkillInvocation[]; attachments?: Attachment[]; }; fromKeyboard?: boolean; }) => Promise<void>;
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  setEditInput: Dispatch<SetStateAction<string>>;
  setEditPlatformChip: Dispatch<SetStateAction<PlatformToolChip | null>>;
  setEditingQueued: Dispatch<SetStateAction<{ id: string; originalText: string; index: number; attachments?: Attachment[]; } | null>>;
  setFollowUpQueue: Dispatch<SetStateAction<{ id: string; text: string; skills?: SkillInvocation[]; attachments?: Attachment[]; }[]>>;
  setInput: Dispatch<SetStateAction<string>>;
  setPlatformChip: Dispatch<SetStateAction<PlatformToolChip | null>>;
  setSlashMenu: Dispatch<SetStateAction<{ query: string; active: number; } | null>>;
  setStopping: Dispatch<SetStateAction<boolean>>;
  toast: (kind: "success" | "error" | "info", message: string) => void;
};

export function useQueueActions(ctx: QueueActionsCtx) {
  const {
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
  } = ctx;
  const {
    abortRef,
    editEditorRef,
    editorRef,
    expectRemoteLockRef,
    immediateSendRef,
    sendAbortRef,
    strandedQueueRef,
  } = ctx.refs;

  const startQueueEdit = (id: string) => {
    const idx = followUpQueue.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const item = followUpQueue[idx];
    const prev = editingQueued;
    const prevText = prev
      ? (editorRef.current ? composerPlainText(editorRef.current) : input).trim() || prev.originalText
      : null;
    setFollowUpQueue((q) => {
      let next = q.filter((x) => x.id !== id);
      if (prev && prevText != null) {
        next = next.filter((x) => x.id !== prev.id);
        next.splice(Math.min(prev.index, next.length), 0, { id: prev.id, text: prevText, attachments: prev.attachments });
      }
      return next;
    });
    setEditingQueued({ id: item.id, originalText: item.text, index: idx, attachments: item.attachments });
    setInput(item.text);
    // Its files go into the composer with its text, so saving keeps them.
    setAttachments(item.attachments ?? []);
    const el = editorRef.current;
    if (el) {
      setComposerText(el, item.text);
      resizeEditor(el);
      el.focus();
    }
  };

  const cancelQueueEdit = () => {
    if (!editingQueued) return;
    const { id, originalText, index, attachments: originalAttachments } = editingQueued;
    setEditingQueued(null);
    setFollowUpQueue((q) => {
      const next = [...q];
      next.splice(Math.min(index, next.length), 0, { id, text: originalText, attachments: originalAttachments });
      return next;
    });
    setInput("");
    if (editorRef.current) clearComposerEditor(editorRef.current);
    setAttachments([]);
  };

  /** Interrupt the current turn and send this queued message next (Cursor ↑). */
  const sendQueuedNow = (id: string) => {
    // The user is asking for this one directly, so it is no longer stranded.
    strandedQueueRef.current.delete(id);
    let payload: { text: string; skills?: SkillInvocation[]; attachments?: Attachment[] } | null = null;
    if (editingQueued?.id === id) {
      const text =
        (editorRef.current ? composerPlainText(editorRef.current) : input).trim() ||
        editingQueued.originalText;
      payload = { text, skills: platformChipToSkills(platformChip), attachments: editingQueued.attachments };
      setEditingQueued(null);
      setInput("");
      if (editorRef.current) clearComposerEditor(editorRef.current);
      setAttachments([]);
      setPlatformChip(null);
    } else {
      const item = followUpQueue.find((x) => x.id === id);
      if (!item) return;
      payload = {
        text: item.text,
        skills: item.skills,
        attachments: item.attachments,
      };
      setFollowUpQueue((q) => q.filter((x) => x.id !== id));
    }
    if (!payload?.text && !(payload?.skills?.length)) return;

    if (!busy) {
      // As a queued item, so it takes its own files and not the composer's.
      void send(payload.text, "main", false, {
        skills: payload.skills,
        queued: { id, text: payload.text, skills: payload.skills, attachments: payload.attachments },
      });
      return;
    }

    // Cut the in-flight turn; freeze at last token, then send this text next.
    // If the user ↑'d another queued item first, put that pending one back so
    // it isn't dropped when this interrupt replaces immediateSendRef.
    const displaced = immediateSendRef.current;
    if (displaced && (displaced.text !== payload.text || displaced.skills !== payload.skills)) {
      setFollowUpQueue((q) => [
        { id: crypto.randomUUID(), text: displaced.text, skills: displaced.skills, attachments: displaced.attachments },
        ...q,
      ]);
    }
    immediateSendRef.current = payload;
    setStopping(true);
    expectRemoteLockRef.current = true;
    void cancelAgent(client).then((ok) => {
      if (!ok) {
        toast("error", appT().thread.toasts.stopUnreachable);
      }
    });
    sendAbortRef.current?.abort();
    abortRef.current?.abort();
    freezeTurnLocally();
  };

  /** Insert platform command inline at caret (Cursor-style), replacing `/query`. */
  const pickPlatformTool = (tool: PlatformToolId, fromEditor?: HTMLElement | null) => {
    const el = fromEditor ?? editorRef.current;
    if (!el) {
      setSlashMenu(null);
      return;
    }
    const chip: PlatformToolChip =
      tool === "publish"
        ? { tool: "publish", slug: defaultPublishSlug(project.name) }
        : tool === "secrets"
          ? { tool: "secrets" }
          : { tool };
    deleteSlashTokenAtCaret(el);
    insertPlatformToolChipAtCaret(el, chip);
    const next = composerPlainText(el);
    const isEditEditor = el === editEditorRef.current;
    if (isEditEditor) {
      setEditPlatformChip(chip);
      setEditInput(next);
    } else {
      setPlatformChip(chip);
      setInput(next);
    }
    resizeEditor(el);
    el.focus();
    setSlashMenu(null);
  };
  // What the slash menu shows, from the text before the caret.
  const syncSlashMenu = (el: HTMLElement) => {
    const before = textBeforeCaret(el);
    if (before == null) {
      setSlashMenu(null);
      return;
    }
    const match = matchSlashCommand(before);
    if (!match) {
      setSlashMenu(null);
      return;
    }
    setSlashMenu((prev) => ({
      query: match.query,
      active: prev && prev.query === match.query ? prev.active : 0,
    }));
  };
  return { cancelQueueEdit, pickPlatformTool, sendQueuedNow, startQueueEdit, syncSlashMenu };
}
