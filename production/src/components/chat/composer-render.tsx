import type { Dispatch, SetStateAction } from "react";
import { type DragEvent } from "react";
import { type ProjectDetail } from "../../lib/api";
import { type OrchClient } from "../../lib/orchestrator";
import { CHAT_PROMPT_MODES, PromptBar } from "../PromptBar";
import { SlashToolsPopover, filterPlatformTools, type PlatformToolChip, type PlatformToolId, type SkillInvocation } from "../PlatformToolsMenu";
import { openConnectors } from "../../lib/connectors";
import { ComposerShelf, type ShelfNotice } from "./ComposerShelf";
import { agentModeToPrompt, promptModeToAgent } from "./agent";
import { composerPlainText, readPlatformToolFromEditor, setComposerText } from "./composer-dom";
import { type AgentMode, type AgentTodo, type Attachment } from "./types";
import { AttachmentStrip } from "./user-message";
import type { ChatRefs } from "./refs";
import { Reveal } from "./motion";
import { useT } from "../../i18n/app";

/** The edit composer says nothing: one empty list, not a new one each render. */
const NO_NOTICES: ShelfNotice[] = [];

/** Everything useComposerRender reads from the chat panel. */
export type ComposerRenderCtx = {
  refs: ChatRefs;
  /** What the composer's shelf says, in order (see ChatPanel). */
  composerNotices: ShelfNotice[];
  addFiles: (files: FileList | File[], target?: "main" | "edit", opts?: { skipComposer?: boolean; }) => Promise<Attachment[]>;
  agentMode: AgentMode;
  attachments: Attachment[];
  busy: boolean;
  cancelQueueEdit: () => void;
  clearEditComposer: () => void;
  client: OrchClient;
  dragOver: boolean;
  editAttachments: Attachment[];
  editDragOver: boolean;
  editInput: string;
  editPlatformChip: PlatformToolChip | null;
  editingQueued: { id: string; originalText: string; index: number; attachments?: Attachment[]; } | null;
  initialPrompt: string | undefined;
  initialSkills: SkillInvocation[] | undefined;
  input: string;
  onOpenFileProp: ((path: string) => void | undefined) | undefined;
  outOfCredits: boolean;
  pendingQuestion: { toolCallId: string; questions: Array<{ id: string; prompt: string; options: Array<{ id: string; label: string; }>; }>; } | null;
  pickPlatformTool: (tool: PlatformToolId, fromEditor?: HTMLElement | null) => void;
  platformChip: PlatformToolChip | null;
  project: ProjectDetail;
  removeAttachment: (id: string, target?: "main" | "edit") => void;
  resizeEditor: (el: HTMLElement | null) => void;
  sandboxBlock: "credits" | "failed" | null;
  sandboxReady: boolean;
  send: (raw?: string, source?: "main" | "edit", confirmed?: boolean, opts?: { skills?: SkillInvocation[]; readyAttachments?: Attachment[]; hideUserBubble?: boolean; planBuild?: { path: string; title: string; todos: AgentTodo[]; }; forceMode?: AgentMode; modeSwitchResend?: boolean; skipUserPersist?: boolean; queued?: { id: string; text: string; skills?: SkillInvocation[]; attachments?: Attachment[]; }; fromKeyboard?: boolean; }) => Promise<void>;
  setAgentMode: Dispatch<SetStateAction<AgentMode>>;
  setDragOver: Dispatch<SetStateAction<boolean>>;
  setEditDragOver: Dispatch<SetStateAction<boolean>>;
  setEditInput: Dispatch<SetStateAction<string>>;
  setEditPlatformChip: Dispatch<SetStateAction<PlatformToolChip | null>>;
  setInput: Dispatch<SetStateAction<string>>;
  setPlatformChip: Dispatch<SetStateAction<PlatformToolChip | null>>;
  setSlashMenu: Dispatch<SetStateAction<{ query: string; active: number; } | null>>;
  slashMenu: { query: string; active: number; } | null;
  stop: () => void;
  stopping: boolean;
  syncSlashMenu: (el: HTMLElement) => void;
};

export function useComposerRender(ctx: ComposerRenderCtx) {
  const {
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
  } = ctx;
  const {
    editEditorRef,
    editFileInputRef,
    editPickingFileRef,
    editorRef,
    fileInputRef,
    savedRangeEditRef,
    savedRangeMainRef,
  } = ctx.refs;
  const t = useT();

  const renderComposer = (source: "main" | "edit") => {
    const isEdit = source === "edit";
    const value = isEdit ? editInput : input;
    const atts = isEdit ? editAttachments : attachments;
    const over = isEdit ? editDragOver : dragOver;
    const editor = isEdit ? editEditorRef : editorRef;
    const fileInput = isEdit ? editFileInputRef : fileInputRef;
    const slashOpen = slashMenu != null;
    // Inline platform-tool chip lives in the contenteditable (main or edit).
    const hasPlatformTool = isEdit
      ? Boolean(editPlatformChip)
      : Boolean(platformChip) || Boolean(readPlatformToolFromEditor(editor.current));
    const composerLive = (
      isEdit
        ? editEditorRef.current
          ? composerPlainText(editEditorRef.current)
          : editInput
        : editorRef.current
          ? composerPlainText(editorRef.current)
          : value
    ).trim();
    const canSend =
      sandboxReady &&
      !outOfCredits &&
      // Still uploading counts: the press waits for it (send-hook) instead of the button hiding.
      (Boolean(composerLive) || atts.some((a) => a.status === "ready" || a.status === "uploading") || hasPlatformTool);
    const showStop = !isEdit && (busy || stopping) && !editingQueued;

    const editorBlock = (
      <div className="relative min-h-[22px] w-full">
        {slashOpen && slashMenu && (
          <SlashToolsPopover
            query={slashMenu.query}
            activeIndex={slashMenu.active}
            onActiveIndexChange={(i) => setSlashMenu((s) => (s ? { ...s, active: i } : s))}
            onPick={(tool) => pickPlatformTool(tool, editor.current)}
            onClose={() => setSlashMenu(null)}
            canPublish={(project.planLimits?.maxDeployments ?? 0) > 0}
          />
        )}
        {!value.trim() &&
          !atts.some((a) => !a.isImage) &&
          !hasPlatformTool &&
          !editingQueued &&
          !slashOpen && (
            <div className="pointer-events-none absolute top-0 start-0 text-[16px] leading-[22px] text-fg/50">
              {!isEdit && pendingQuestion
                ? t.chat.composer.placeholderDetails
                : !isEdit && busy
                  ? t.chat.composer.placeholderFollowUp
                  : !isEdit && sandboxBlock === "credits"
                    ? t.chat.credits.out
                    : !isEdit && sandboxBlock
                    ? t.chat.composer.placeholderRetry
                    : !isEdit &&
                        !sandboxReady &&
                        Boolean(initialPrompt?.trim() || initialSkills?.length)
                      ? t.chat.composer.placeholderStarting
                      : t.chat.composer.placeholder}
            </div>
          )}
        <div
          ref={editor}
          role="textbox"
          aria-multiline="true"
          aria-label={t.chat.composer.message}
          data-testid={isEdit ? "chat-composer-edit" : "chat-composer"}
          aria-placeholder={
            !isEdit && pendingQuestion
              ? t.chat.composer.placeholderDetails
              : !isEdit && busy && !editingQueued
                ? t.chat.composer.placeholderFollowUp
                : !isEdit && sandboxBlock === "credits"
                  ? t.chat.credits.out
                  : !isEdit && sandboxBlock
                  ? t.chat.composer.placeholderRetry
                  : !isEdit &&
                      !sandboxReady &&
                      Boolean(initialPrompt?.trim() || initialSkills?.length)
                    ? t.chat.composer.placeholderStarting
                    : t.chat.composer.placeholder
          }
          contentEditable={sandboxReady}
          suppressContentEditableWarning
          onBlur={() => {
            const sel = window.getSelection();
            const el = editor.current;
            if (sel && sel.rangeCount > 0 && el?.contains(sel.anchorNode)) {
              const range = sel.getRangeAt(0).cloneRange();
              if (isEdit) savedRangeEditRef.current = range;
              else savedRangeMainRef.current = range;
            }
          }}
          onInput={() => {
            const el = editor.current;
            if (!el) return;
            if (isEdit) {
              setEditInput(composerPlainText(el));
              setEditPlatformChip(readPlatformToolFromEditor(el));
              syncSlashMenu(el);
            } else {
              const next = composerPlainText(el);
              setInput(next);
              setPlatformChip(readPlatformToolFromEditor(el));
              syncSlashMenu(el);
            }
            resizeEditor(el);
          }}
          onKeyDown={(e) => {
            if (slashMenu) {
              const items = filterPlatformTools(slashMenu.query, {
                canPublish: (project.planLimits?.maxDeployments ?? 0) > 0,
              });
              if (e.key === "ArrowDown") {
                e.preventDefault();
                if (items.length) {
                  setSlashMenu((s) =>
                    s ? { ...s, active: (s.active + 1) % items.length } : s,
                  );
                }
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                if (items.length) {
                  setSlashMenu((s) =>
                    s
                      ? { ...s, active: (s.active - 1 + items.length) % items.length }
                      : s,
                  );
                }
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setSlashMenu(null);
                return;
              }
              if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
                if (items.length) {
                  e.preventDefault();
                  pickPlatformTool(items[slashMenu.active % items.length].id, editor.current);
                  return;
                }
              }
            }
            // Backspace past a command chip deletes it. The chip is an
            // uneditable node, so the browser leaves it alone and the key does
            // nothing — you had to find the small × instead, which is not where
            // anyone looks after typing /image by mistake.
            if (e.key === "Backspace") {
              const el = editor.current;
              const sel = window.getSelection();
              const chip = el?.querySelector<HTMLElement>("[data-platform-tool]");
              if (el && chip && sel?.isCollapsed && sel.rangeCount) {
                const caret = sel.getRangeAt(0);
                // What sits between the chip and the caret. Only when that is
                // nothing but spaces (the one we add after the chip) does the
                // key take the chip — backspacing over real text must still
                // edit text. The chip goes together with that space: deleting
                // the space alone left the caret against an uneditable node,
                // which iOS draws at the chip's front edge (or hides).
                const between = document.createRange();
                between.setStartAfter(chip);
                const chipBehindCaret =
                  between.compareBoundaryPoints(Range.START_TO_START, caret) <= 0;
                if (chipBehindCaret) between.setEnd(caret.startContainer, caret.startOffset);
                if (
                  chipBehindCaret &&
                  !between.toString().trim() &&
                  !between.cloneContents().querySelector("*")
                ) {
                  e.preventDefault();
                  between.deleteContents();
                  const at = document.createRange();
                  at.setStartBefore(chip);
                  at.collapse(true);
                  chip.remove();
                  sel.removeAllRanges();
                  sel.addRange(at);
                  if (isEdit) {
                    setEditInput(composerPlainText(el));
                    setEditPlatformChip(null);
                  } else {
                    setInput(composerPlainText(el));
                    setPlatformChip(null);
                  }
                  resizeEditor(el);
                  return;
                }
              }
            }
            if (e.key === "Escape" && isEdit) {
              e.preventDefault();
              clearEditComposer();
              return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(undefined, source, false, { fromKeyboard: true });
            }
          }}
          onPaste={(e) => {
            // Ask for files only when the clipboard says it has some. Reading
            // `.files` makes iOS hand over every item's full data while the app
            // waits — a 7 s freeze on a plain text paste (Sentry, 2026-11-08,
            // WKContentView.paste) when the copy came from another device.
            const types = Array.from(e.clipboardData.types ?? []);
            const files = types.some((t) => t === "Files" || t.startsWith("image/")) ? Array.from(e.clipboardData.files) : [];
            if (files.length) {
              e.preventDefault();
              void addFiles(files, source);
              return;
            }
            e.preventDefault();
            const pasted = e.clipboardData.getData("text/plain");
            document.execCommand("insertText", false, pasted);
            const el = editor.current;
            if (!el) return;
            if (isEdit) setEditInput(composerPlainText(el));
            else {
              setInput(composerPlainText(el));
              syncSlashMenu(el);
            }
            resizeEditor(el);
          }}
          dir="auto"
          className="max-h-[200px] min-h-[22px] w-full resize-none overflow-y-auto bg-transparent py-0 font-sans text-[16px] leading-[22px] break-words whitespace-pre-wrap text-fg caret-white outline-none disabled:opacity-50"
        />
      </div>
    );

    const fileInputEl = (
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (isEdit) editPickingFileRef.current = false;
          if (e.target.files?.length) void addFiles(e.target.files, source);
          e.target.value = "";
        }}
      />
    );

    const dragProps = outOfCredits
      ? {}
      : {
          onDragOver: (e: DragEvent) => {
            e.preventDefault();
            if (isEdit) setEditDragOver(true);
            else setDragOver(true);
          },
          onDragLeave: () => (isEdit ? setEditDragOver(false) : setDragOver(false)),
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            if (isEdit) setEditDragOver(false);
            else setDragOver(false);
            if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files, source);
          },
        };

    return (
      <div
        className={isEdit ? undefined : "ws-composer-dock native-safe-bottom pt-1 pb-3"}
        data-edit-composer={isEdit || undefined}
        {...dragProps}
      >
        {fileInputEl}
        <ComposerShelf notices={isEdit ? NO_NOTICES : composerNotices}>
        <PromptBar
          size="lg"
          tone="dark"
          menuPlacement={isEdit ? "down" : "up"}
          modes={CHAT_PROMPT_MODES}
          value={value}
          onChange={(next) => {
            // Voice dictation (and any PromptBar-driven edits) must update the
            // contenteditable — typing normally goes the other way via onInput.
            if (isEdit) {
              setEditInput(next);
              const el = editEditorRef.current;
              if (el && composerPlainText(el) !== next) {
                setComposerText(el, next);
                resizeEditor(el);
              }
            } else {
              setInput(next);
              const el = editorRef.current;
              if (el && composerPlainText(el) !== next) {
                setComposerText(el, next);
                resizeEditor(el);
              }
            }
          }}
          onSubmit={() => void send(undefined, source)}
          canSubmit={canSend}
          busy={isEdit ? false : busy && !editingQueued}
          mode={agentModeToPrompt(agentMode)}
          onModeChange={(m) => setAgentMode(promptModeToAgent(m))}
          creditsLocked={outOfCredits}
          // The + is a menu in chat: attach a file, or open Connectors. The
          // agent can only reach an app you have connected, and the composer
          // is where that occurs to you.
          onConnectors={isEdit ? undefined : () => openConnectors()}
          // Same command the slash menu arms — the + is where people look for
          // "what else can this do", and typing /image is not discoverable.
          onCreateImage={
            isEdit
              ? undefined
              : () => {
                  if (outOfCredits) return;
                  const el = editorRef.current;
                  if (!el) return;
                  el.focus();
                  pickPlatformTool("image", el);
                }
          }
          onAttach={() => {
            if (outOfCredits) return;
            if (isEdit) {
              editPickingFileRef.current = true;
              fileInput.current?.click();
              window.setTimeout(() => {
                editPickingFileRef.current = false;
              }, 1000);
            } else {
              fileInput.current?.click();
            }
          }}
          showStop={!isEdit && showStop}
          onStop={isEdit ? undefined : stop}
          stopping={isEdit ? undefined : stopping}
          className={over ? "!border-accent/40" : undefined}
          header={
            <>
              {/* The composer grows to make room for the pictures and gives
                  the room back as the last one goes — smoothly, not a jump. */}
              <Reveal show={atts.some((a) => a.isImage || a.elementLabel)} className="composer-attach">
                <div className="pb-2">
                  <AttachmentStrip
                    items={atts}
                    imagesOnly
                    large
                    client={client}
                    onOpenFile={onOpenFileProp}
                    onRemove={(id) => removeAttachment(id, source)}
                  />
                </div>
              </Reveal>
              {!isEdit && editingQueued && (
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[12px] text-white/50">{t.chat.composer.editingQueued}</span>
                  <button
                    type="button"
                    onClick={cancelQueueEdit}
                    className="text-[12px] font-medium text-fg transition hover:opacity-80"
                  >
                    {t.common.cancel}
                  </button>
                </div>
              )}
            </>
          }
          body={editorBlock}
        />
        </ComposerShelf>
      </div>
    );
  };
  return { renderComposer };
}
