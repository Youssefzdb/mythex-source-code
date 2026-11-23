import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  HeroAttachStrip,
  HERO_MAX_ATTACHMENTS,
  isHeroImageFile,
  makeHeroAttachment,
  revokeHeroAttachment,
  type HeroLocalAttachment,
} from "./HeroAttachStrip";
import { openConnectors } from "../lib/connectors";
import { attachmentSizeError } from "../lib/attachment-limits";
import {
  PromptBar,
  usePrefixTypewriter,
  type MythexModelTier,
  type PromptBuildMode,
} from "./PromptBar";
import { appT, fill, pl } from "../i18n/app";
import { usePageT } from "../i18n/usePageT";
import { tapHaptic } from "../lib/haptics";

/** Same chip chrome as ChatPanel composer (Cursor-style inline files). */
const FILE_CHIP_CLASS =
  "composer-file-chip inline-flex h-5 max-w-[15rem] items-center gap-1 rounded-md bg-white/10 py-0 pe-0.5 ps-1.5 align-middle text-[12px] leading-5 font-medium text-white/85 select-none";

function attachmentLabel(name: string): string {
  const base = name.split(/[/\\]/).pop() || name;
  if (base.length <= 22) return base;
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")) : "";
  const keep = Math.max(10, 18 - ext.length);
  return `${base.slice(0, keep)}…${ext}`;
}

function createFileChipElement(att: HeroLocalAttachment): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.contentEditable = "false";
  chip.dataset.fileChip = att.id;
  chip.className = FILE_CHIP_CLASS;
  chip.title = att.file.name;

  const icon = document.createElement("img");
  icon.alt = "";
  icon.draggable = false;
  icon.setAttribute("aria-hidden", "true");
  icon.className = "block h-3 w-3 shrink-0 object-contain";
  // Dynamic import keeps the material icon pack off the marketing critical path.
  void import("./FileTypeIcon").then(({ loadMaterialFileIconUrl }) =>
    loadMaterialFileIconUrl(att.file.name).then((url) => {
      if (url) icon.src = url;
    }),
  );

  const label = document.createElement("span");
  label.className = "min-w-0 truncate leading-5";
  label.textContent = attachmentLabel(att.file.name);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.dataset.chipRemove = "1";
  remove.className =
    "grid h-4 w-4 shrink-0 place-items-center rounded text-[11px] leading-none text-white/50 transition hover:bg-white/10 hover:text-white";
  remove.setAttribute("aria-label", fill(appT().chat.attachments.remove, { name: att.file.name }));
  remove.textContent = "×";

  chip.append(icon, label, remove);
  return chip;
}

function caretRangeInEditor(editor: HTMLElement, savedRange?: Range | null): Range {
  const sel = window.getSelection();
  const range = document.createRange();
  if (savedRange && editor.contains(savedRange.startContainer)) {
    range.setStart(savedRange.startContainer, savedRange.startOffset);
    range.setEnd(savedRange.endContainer, savedRange.endOffset);
  } else if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
    range.setStart(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
    range.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
  } else {
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  return range;
}

function insertFileChipAtCaret(
  editor: HTMLElement,
  att: HeroLocalAttachment,
  savedRange?: Range | null,
) {
  editor.focus();
  const sel = window.getSelection();
  const range = caretRangeInEditor(editor, savedRange);
  const chip = createFileChipElement(att);
  range.deleteContents();
  range.insertNode(chip);
  const space = document.createTextNode(" ");
  chip.after(space);
  range.setStartAfter(space);
  range.collapse(true);
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function composerPlainText(editor: HTMLElement): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += (node.textContent ?? "").replace(/\u200B/g, "");
      return;
    }
    if (node instanceof HTMLElement && node.dataset.fileChip) {
      out += " ";
      return;
    }
    node.childNodes.forEach(walk);
  };
  walk(editor);
  return out.replace(/\s+/g, " ").replace(/^\n+$/, "").trim();
}

function setComposerText(editor: HTMLElement, text: string) {
  editor.innerHTML = "";
  if (text) editor.textContent = text;
}

/** Grows with text, then scrolls (≈9 lines at 15px/1.45). */
const COMPOSER_EDITOR_MAX_H = 200;

function resizeEditor(el: HTMLElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.overflowY = "hidden";
  const contentH = el.scrollHeight;
  const next = Math.min(Math.max(contentH, 22), COMPOSER_EDITOR_MAX_H);
  el.style.height = `${next}px`;
  const capped = contentH > COMPOSER_EDITOR_MAX_H;
  el.style.overflowY = capped ? "auto" : "hidden";
  if (capped) el.scrollTop = el.scrollHeight;
}

type Props = {
  value: string;
  onChange: (v: string) => void;
  attachments: HeroLocalAttachment[];
  onAttachmentsChange: (next: HeroLocalAttachment[] | ((prev: HeroLocalAttachment[]) => HeroLocalAttachment[])) => void;
  onSubmit: () => void;
  busy?: boolean;
  autoFocus?: boolean;
  guest?: boolean;
  onLogin?: () => void;
  modes?: Array<{ id: PromptBuildMode; label: string; description: string }>;
  mode?: PromptBuildMode;
  onModeChange?: (mode: PromptBuildMode) => void;
  showModelTier?: boolean;
  modelTier?: MythexModelTier;
  onModelTierChange?: (tier: MythexModelTier) => void;
  proModelLocked?: boolean;
  onProUpgrade?: () => void;
  typewriterPrefix?: string;
  typewriterWords?: string[];
  /** Optional toast for size / count errors. */
  onError?: (message: string) => void;
  className?: string;
};

/**
 * Dashboard / landing PromptBar with builder-parity attach UX:
 * drag-and-drop, image thumbs above the editor, inline file chips inside it.
 */
export function LocalAttachComposer({
  value,
  onChange,
  attachments,
  onAttachmentsChange,
  onSubmit,
  busy,
  autoFocus,
  guest,
  onLogin,
  modes,
  mode,
  onModeChange,
  showModelTier,
  modelTier,
  onModelTierChange,
  proModelLocked,
  onProUpgrade,
  typewriterPrefix,
  typewriterWords,
  onError,
  className,
}: Props) {
  const t = usePageT();
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const [dragOver, setDragOver] = useState(false);
  const canAttach = !guest;

  const images = attachments.filter((a) => isHeroImageFile(a.file));
  const hasInlineFiles = attachments.some((a) => !isHeroImageFile(a.file));
  const canSubmit = Boolean(value.trim() || attachments.length);

  const removeAttachment = useCallback(
    (id: string) => {
      onAttachmentsChange((prev) => {
        const removed = prev.find((a) => a.id === id);
        if (removed) revokeHeroAttachment(removed);
        return prev.filter((a) => a.id !== id);
      });
      const el = editorRef.current;
      el?.querySelector(`[data-file-chip="${id}"]`)?.remove();
      if (el) {
        onChange(composerPlainText(el));
        resizeEditor(el);
      }
    },
    [onAttachmentsChange, onChange],
  );

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      if (!canAttach) return;
      const current = attachmentsRef.current;
      const room = HERO_MAX_ATTACHMENTS - current.length;
      if (room <= 0) {
        onError?.(pl(appT().chat.attachments.tooMany, HERO_MAX_ATTACHMENTS));
        return;
      }
      const accepted: HeroLocalAttachment[] = [];
      for (const file of Array.from(list).slice(0, room)) {
        const sizeError = attachmentSizeError(file);
        if (sizeError) {
          onError?.(sizeError);
          continue;
        }
        accepted.push(makeHeroAttachment(file));
      }
      if (!accepted.length) return;

      onAttachmentsChange((prev) => [...prev, ...accepted]);

      const editor = editorRef.current;
      for (const att of accepted) {
        if (!isHeroImageFile(att.file) && editor) {
          insertFileChipAtCaret(editor, att, savedRangeRef.current);
          savedRangeRef.current = null;
        }
      }
      if (editor) {
        onChange(composerPlainText(editor));
        resizeEditor(editor);
      }
    },
    [canAttach, onAttachmentsChange, onChange, onError],
  );

  // Chip × remove (same pattern as ChatPanel).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest?.("[data-chip-remove]");
      if (!btn) return;
      const fileChip = btn.closest<HTMLElement>("[data-file-chip]");
      const editor = editorRef.current;
      if (!fileChip || !editor?.contains(fileChip)) return;
      e.preventDefault();
      e.stopPropagation();
      const id = fileChip.dataset.fileChip;
      if (id) removeAttachment(id);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [removeAttachment]);

  // Keep contenteditable text in sync when voice / parent clears value.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (!value.trim() && !hasInlineFiles && composerPlainText(el)) {
      setComposerText(el, "");
      resizeEditor(el);
      return;
    }
    if (value && composerPlainText(el) !== value && !hasInlineFiles) {
      setComposerText(el, value);
      resizeEditor(el);
    }
  }, [value, hasInlineFiles]);

  useEffect(() => {
    resizeEditor(editorRef.current);
  }, [attachments.length, value]);

  useEffect(() => {
    if (!autoFocus) return;
    editorRef.current?.focus();
  }, [autoFocus]);

  const dragProps = canAttach
    ? {
        onDragOver: (e: DragEvent) => {
          e.preventDefault();
          setDragOver(true);
        },
        onDragLeave: () => setDragOver(false),
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        },
      }
    : {};

  const typewriterEnabled = Boolean(
    typewriterPrefix && typewriterWords?.length && !value.trim() && !hasInlineFiles,
  );
  const typewriterText = usePrefixTypewriter(
    typewriterPrefix ?? "",
    typewriterWords ?? [],
    typewriterEnabled,
  );

  const livePlaceholder: ReactNode =
    !value.trim() && !hasInlineFiles ? (
      <div className="pointer-events-none absolute inset-x-0 top-0 truncate text-[15px] leading-[1.45] text-white/70">
        {typewriterEnabled ? typewriterText : t.chat.composer.placeholder}
      </div>
    ) : null;

  const editorBlock = (
    <div className="relative min-h-[22px] w-full">
      {livePlaceholder}
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-label={t.chat.composer.prompt}
        dir="auto"
        contentEditable={!busy}
        suppressContentEditableWarning
        className="max-h-[200px] min-h-[22px] w-full wrap-break-word overflow-y-auto text-[15px] leading-[1.45] text-white outline-none caret-white"
        onBlur={() => {
          const sel = window.getSelection();
          const el = editorRef.current;
          if (sel && sel.rangeCount > 0 && el?.contains(sel.anchorNode)) {
            savedRangeRef.current = sel.getRangeAt(0).cloneRange();
          }
        }}
        onInput={() => {
          const el = editorRef.current;
          if (!el) return;
          onChange(composerPlainText(el));
          resizeEditor(el);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (canSubmit && !busy) {
              tapHaptic();
              onSubmit();
            }
          }
        }}
        onPaste={(e) => {
          const files = e.clipboardData?.files;
          if (files?.length && canAttach) {
            e.preventDefault();
            addFiles(files);
            return;
          }
          // Plain text only — rich clipboard HTML (markdown, docs, etc.) must not render.
          e.preventDefault();
          const pasted = e.clipboardData?.getData("text/plain") ?? "";
          document.execCommand("insertText", false, pasted);
          const el = editorRef.current;
          if (!el) return;
          onChange(composerPlainText(el));
          resizeEditor(el);
        }}
      />
    </div>
  );

  return (
    // text-start: marketing hero wraps this in text-center — without it the
    // contenteditable caret sits in the middle while the absolute placeholder stays at the start.
    <div className="w-full text-start" {...dragProps}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        data-testid="hero-attach-input"
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <PromptBar
        value={value}
        onChange={(next) => {
          onChange(next);
          const el = editorRef.current;
          if (el && composerPlainText(el) !== next) {
            // Voice dictation / external edits — only when no inline chips.
            if (!attachmentsRef.current.some((a) => !isHeroImageFile(a.file))) {
              setComposerText(el, next);
              resizeEditor(el);
            }
          }
        }}
        onSubmit={onSubmit}
        canSubmit={canSubmit}
        busy={busy}
        autoFocus={false}
        guest={guest}
        onLogin={onLogin}
        modes={modes}
        mode={mode}
        onModeChange={onModeChange}
        showModelTier={showModelTier}
        modelTier={modelTier}
        onModelTierChange={onModelTierChange}
        proModelLocked={proModelLocked}
        onProUpgrade={onProUpgrade}
        size="lg"
        tone="dark"
        onAttach={canAttach ? () => fileInputRef.current?.click() : undefined}
        // The + opens the same menu it opens inside a chat. Without this the
        // home and landing composers fell through to the bare file picker, so
        // Connectors was reachable from the chat composer and nowhere else —
        // including the screen most people start on.
        //
        // Not for a signed-out visitor: connecting anything needs an account,
        // and the menu would offer a door that opens onto the login page.
        onConnectors={guest ? undefined : () => openConnectors()}
        className={`${dragOver ? "!border-accent/40" : ""} ${className ?? ""}`}
        chat={false}
        header={
          images.length > 0 ? (
            <HeroAttachStrip items={images} onRemove={removeAttachment} />
          ) : null
        }
        body={editorBlock}
      />
    </div>
  );
}
