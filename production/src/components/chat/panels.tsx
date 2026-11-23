import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, ArrowUp, ChevronDown, ChevronRight, ChevronUp, Circle, CircleHelp, Pencil, TriangleAlert, Trash2, X } from "lucide-react";
import { PanelSwap } from "../ui/PanelSwap";
import { type SkillInvocation } from "../PlatformToolsMenu";
import { type Attachment, type ComposerHelper } from "./types";
import { CollapsePanel } from "./motion";
import { fill, pl, useT } from "../../i18n/app";
import { isNative } from "../../lib/native";

export function ComposerHelperBanner({
  helper,
  busy,
  onDismiss,
  onRetry,
}: {
  helper: ComposerHelper;
  busy: boolean;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  const t = useT();
  const canRetry = helper.action === "retry" && Boolean(helper.retryPrompt) && !busy;
  const modKey = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

  useEffect(() => {
    if (!canRetry) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      onRetry();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canRetry, onRetry]);

  return (
    <div
      className="rounded-lg border border-line bg-elevated px-2.5 py-2 shadow-sm"
      // The composer below is pulled up over what precedes it by half the
      // transcript's fade and a quarter rem (.ws-composer-dock): with only
      // mb-1.5 it covered this card's last ~10px, Try again included. That
      // overlap, plus the 6px gap the card always had.
      style={{ marginBottom: "calc(0.5 * var(--fade-bottom, 1.5rem) + 0.25rem + 0.375rem)" }}
      role="alert"
      data-testid="composer-helper"
    >
      <div className="flex items-center gap-1.5">
        <TriangleAlert className="size-3.5 shrink-0 text-fg-2 opacity-80" aria-hidden />
        <p className="min-w-0 flex-1 text-[13px] font-semibold leading-none text-fg">{helper.title}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="-me-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded text-muted transition hover:bg-hover hover:text-fg"
          aria-label={t.thread.helperBanner.dismiss}
          title={t.thread.helperBanner.dismiss}
        >
          <X className="size-3.5" />
        </button>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-muted">{helper.message}</p>
      {helper.action === "retry" && helper.retryPrompt && (
        <div className="mt-1.5 flex justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onRetry}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-line bg-panel px-2 text-[12px] font-medium text-fg transition hover:bg-hover disabled:opacity-50"
          >
            {t.common.tryAgain}
            {/* The shortcut is a keyboard's: in the phone app there is none to press. */}
            {!isNative() && <kbd className="text-[10px] font-normal text-muted">{modKey}↵</kbd>}
          </button>
        </div>
      )}
    </div>
  );
}

/** Cursor-style collapsible follow-up queue above the composer. */
export function FollowUpQueuePanel({
  items,
  onEdit,
  onSendNow,
  onRemove,
}: {
  items: Array<{ id: string; text: string; skills?: SkillInvocation[]; attachments?: Attachment[]; }>;
  onEdit: (id: string) => void;
  onSendNow: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(true);
  if (items.length === 0) return null;
  const n = items.length;
  return (
    <div className="border-t border-line px-2 pt-1.5" data-testid="follow-up-queue">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1 py-1 text-start text-[11px] font-medium text-fg/75 transition hover:text-fg"
      >
        {open ? <ChevronDown className="size-3 opacity-70" /> : <ChevronRight className="size-3 opacity-70 rtl:-scale-x-100" />}
        <span>
          {pl(t.thread.queue.queued, n)}
        </span>
      </button>
      <CollapsePanel open={open}>
        <ul className="no-scrollbar mb-1.5 max-h-28 space-y-0.5 overflow-y-auto">
          {items.map((item) => (
            <li
              key={item.id}
              className="group flex items-center gap-1.5 rounded-md px-0.5 py-0.5 hover:bg-white/4"
            >
              <Circle className="size-3 shrink-0 text-fg/55" strokeWidth={2} />
              <span dir="auto" className="min-w-0 flex-1 truncate text-[12px] text-fg/90 rtl:text-right" title={item.text}>
                {item.text}
              </span>
              <div className="flex shrink-0 items-center gap-0.5 transition md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                <button
                  type="button"
                  title={t.common.edit}
                  onClick={() => onEdit(item.id)}
                  className="rounded p-0.5 text-muted hover:bg-hover hover:text-fg-2"
                >
                  <Pencil className="size-3" />
                </button>
                <button
                  type="button"
                  title={t.thread.queue.sendNow}
                  onClick={() => onSendNow(item.id)}
                  className="rounded p-0.5 text-muted hover:bg-hover hover:text-fg-2"
                >
                  <ArrowUp className="size-3" />
                </button>
                <button
                  type="button"
                  title={t.thread.queue.removeFromQueue}
                  onClick={() => onRemove(item.id)}
                  className="rounded p-0.5 text-muted hover:bg-hover hover:text-danger"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </CollapsePanel>
    </div>
  );
}

/** Cursor-style AskUserQuestion panel above the composer. */
export function AskQuestionsPanel({
  questions,
  answers,
  customByQuestion,
  onAnswer,
  onCustom,
  onContinue,
  onSkip,
}: {
  questions: Array<{ id: string; prompt: string; options: Array<{ id: string; label: string }> }>;
  answers: Record<string, string>;
  customByQuestion: Record<string, string>;
  onAnswer: (questionId: string, optionId: string) => void;
  onCustom: (questionId: string, text: string) => void;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const tr = useT();
  const [index, setIndex] = useState(0);
  const [customFocused, setCustomFocused] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const total = questions.length;
  const safeIndex = Math.min(index, Math.max(0, total - 1));
  indexRef.current = safeIndex;
  const q = questions[safeIndex];
  const questionOrder = useMemo(() => questions.map((_, i) => String(i)), [questions]);

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);
  const goNext = useCallback(() => {
    setIndex((i) => Math.min(total - 1, i + 1));
  }, [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!q) return;
      const t = e.target as HTMLElement | null;
      const typing =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable);
      if (e.key === "Escape") {
        e.preventDefault();
        onSkip();
        return;
      }
      if ((e.key === "ArrowUp" || e.key === "ArrowDown") && total > 1 && !typing) {
        e.preventDefault();
        if (e.key === "ArrowUp") goPrev();
        else goNext();
        return;
      }
      const selected = answers[q.id];
      const custom = customByQuestion[q.id] ?? "";
      const hasAnswer = Boolean(selected) || Boolean(custom.trim());
      const allAnswered = questions.every((x) => answers[x.id] || customByQuestion[x.id]?.trim());
      const isLast = indexRef.current >= total - 1;
      const canContinue = isLast ? allAnswered : hasAnswer;
      if (e.key === "Enter" && !e.shiftKey && canContinue && !typing) {
        e.preventDefault();
        if (isLast) onContinue();
        else goNext();
        return;
      }
      if (typing) return;
      const letter = e.key.length === 1 ? e.key.toUpperCase() : "";
      const optIdx = letter >= "A" && letter <= "Z" ? letter.charCodeAt(0) - 65 : -1;
      if (optIdx >= 0 && optIdx < q.options.length) {
        e.preventDefault();
        onCustom(q.id, "");
        onAnswer(q.id, q.options[optIdx].id);
        return;
      }
      // Next letter after options focuses the empty custom row.
      if (optIdx === q.options.length) {
        e.preventDefault();
        const input = panelRef.current?.querySelector<HTMLInputElement>("input[type='text']");
        input?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answers, customByQuestion, goNext, goPrev, onAnswer, onContinue, onCustom, onSkip, q, questions, total]);

  if (!q) return null;
  const selected = answers[q.id];
  const custom = customByQuestion[q.id] ?? "";
  const hasAnswer = Boolean(selected) || Boolean(custom.trim());
  const allAnswered = questions.every((x) => answers[x.id] || customByQuestion[x.id]?.trim());
  const isLast = safeIndex >= total - 1;
  const canContinue = isLast ? allAnswered : hasAnswer;

  return (
    <div
      ref={panelRef}
      className="px-2 pt-2 pb-1"
      data-testid="ask-questions"
    >
      <div className="overflow-hidden rounded-xl border border-line bg-elevated">
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-fg-2">
            <CircleHelp className="size-3.5 text-muted" strokeWidth={2} />
            <span>{tr.thread.questions.title}</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted">
            <span>
              {fill(tr.thread.questions.position, { current: safeIndex + 1, total })}
            </span>
            <button
              type="button"
              disabled={safeIndex <= 0}
              onClick={goPrev}
              className="rounded p-0.5 hover:bg-hover hover:text-fg-2 disabled:opacity-30"
              title={tr.thread.questions.previous}
            >
              <ChevronUp className="size-3.5" />
            </button>
            <button
              type="button"
              disabled={safeIndex >= total - 1}
              onClick={goNext}
              className="rounded p-0.5 hover:bg-hover hover:text-fg-2 disabled:opacity-30"
              title={tr.common.next}
            >
              <ChevronDown className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Next slides in from the right, back from the left — the same move as
            the share and publish panels — and the height eases between
            questions of different lengths. */}
        <PanelSwap stateKey={String(safeIndex)} order={questionOrder}>
        <div className="space-y-2.5 px-3 py-3">
          <p dir="auto" className="text-[13px] leading-snug text-fg">
            <span className="text-muted">{safeIndex + 1}. </span>
            {q.prompt}
          </p>
          <div className="space-y-1">
            {q.options.map((o, i) => {
              const letter = String.fromCharCode(65 + i);
              const active = selected === o.id && !custom.trim();
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    onCustom(q.id, "");
                    onAnswer(q.id, o.id);
                  }}
                  className={`flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-start text-[12px] text-fg transition ${
                    active ? "bg-white/[0.08]" : "hover:bg-hover"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-medium ${
                      active
                        ? "border-white bg-white text-[#141413]"
                        : "border-line text-fg"
                    }`}
                  >
                    {letter}
                  </span>
                  <span dir="auto" className="min-w-0 flex-1 leading-5">{o.label}</span>
                </button>
              );
            })}
            {(() => {
              const letter = String.fromCharCode(65 + q.options.length);
              const active = Boolean(custom.trim()) || customFocused;
              return (
                <label
                  className={`flex w-full cursor-text items-start gap-2.5 rounded-lg px-2 py-1.5 text-start text-[12px] text-fg transition ${
                    active ? "bg-white/[0.08]" : "hover:bg-hover"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-medium ${
                      active
                        ? "border-white bg-white text-[#141413]"
                        : "border-line text-fg"
                    }`}
                  >
                    {letter}
                  </span>
                  <input
                    type="text"
                    value={custom}
                    onFocus={() => {
                      setCustomFocused(true);
                      if (selected) onAnswer(q.id, "");
                    }}
                    onBlur={() => setCustomFocused(false)}
                    onChange={(e) => {
                      const v = e.target.value;
                      onCustom(q.id, v);
                      if (v.trim() && selected) onAnswer(q.id, "");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!canContinue) return;
                        if (isLast) onContinue();
                        else goNext();
                      }
                    }}
                    placeholder={tr.thread.questions.customPlaceholder}
                    className="min-w-0 flex-1 bg-transparent py-0.5 text-[12px] leading-5 text-fg outline-none placeholder:text-muted"
                  />
                </label>
              );
            })()}
          </div>
        </div>
        </PanelSwap>

        <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
          <button
            type="button"
            onClick={onSkip}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-muted transition hover:bg-hover hover:text-fg-2"
          >
            {tr.thread.questions.skip}
            {!isNative() && <kbd className="rounded border border-line px-1 py-px text-[10px] text-disabled">Esc</kbd>}
          </button>
          <button
            type="button"
            disabled={!canContinue}
            onClick={() => {
              if (isLast) onContinue();
              else goNext();
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-[12px] font-medium text-[#141413] transition hover:bg-[#f0ebe3] disabled:opacity-40"
          >
            {tr.common.continue}
            {!isNative() && <kbd className="rounded bg-black/10 px-1 py-px text-[10px]">⏎</kbd>}
          </button>
        </div>
      </div>
    </div>
  );
}

const SWITCH_TO_PLAN_MS = 4000;

/** Cursor-like Build→Plan interrupt: linear countdown, Skip | Switch only. */
export function SwitchToPlanModePanel({
  reason,
  onSwitch,
  onSkip,
  durationMs = SWITCH_TO_PLAN_MS,
}: {
  reason?: string;
  onSwitch: () => void;
  onSkip: () => void;
  durationMs?: number;
}) {
  const tr = useT();
  const switchedRef = useRef(false);
  // Stable callbacks — parent re-renders while the agent streams must NOT reset
  // the auto-Switch timer (bar animation is one-shot from mount; JS must match).
  const onSwitchRef = useRef(onSwitch);
  const onSkipRef = useRef(onSkip);
  onSwitchRef.current = onSwitch;
  onSkipRef.current = onSkip;

  const switchOnce = useCallback(() => {
    if (switchedRef.current) return;
    switchedRef.current = true;
    onSwitchRef.current();
  }, []);
  const skipOnce = useCallback(() => {
    if (switchedRef.current) return;
    switchedRef.current = true;
    onSkipRef.current();
  }, []);

  useEffect(() => {
    const t = window.setTimeout(switchOnce, durationMs);
    return () => window.clearTimeout(t);
    // Only durationMs — switchOnce is stable; do not depend on parent onSwitch.
  }, [durationMs, switchOnce]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        skipOnce();
        return;
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        switchOnce();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skipOnce, switchOnce]);

  return (
    <div className="px-2 pt-2 pb-1" data-testid="switch-to-plan-mode">
      <div className="overflow-hidden rounded-xl border border-line bg-elevated">
        <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1.5 text-[12px] font-medium">
          <ArrowLeftRight className="size-3.5 text-amber-400" strokeWidth={2} />
          <span className="text-amber-400">{tr.thread.switchToPlan.title}</span>
        </div>
        <p className="px-3 pb-2.5 text-[12px] leading-snug text-fg-2">
          {reason?.trim() || tr.thread.switchToPlan.defaultReason}
        </p>
        <div className="mx-3 mb-2.5 h-0.5 overflow-hidden rounded-full bg-white/8">
          <div
            data-testid="switch-to-plan-countdown"
            className="h-full origin-left rtl:origin-right rounded-full bg-amber-400"
            style={{
              animation: `mx-switch-mode-drain ${durationMs}ms linear forwards`,
            }}
          />
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
          <button
            type="button"
            data-testid="switch-to-plan-skip"
            onClick={skipOnce}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-muted transition hover:bg-hover hover:text-fg-2"
          >
            {tr.thread.questions.skip}
            {!isNative() && <kbd className="rounded border border-line px-1 py-px text-[10px] text-disabled">Esc</kbd>}
          </button>
          <button
            type="button"
            data-testid="switch-to-plan-switch"
            onClick={switchOnce}
            className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-[12px] font-medium text-[#141413] transition hover:bg-[#f0ebe3]"
          >
            {tr.thread.switchToPlan.switch}
            {!isNative() && <kbd className="rounded bg-black/10 px-1 py-px text-[10px]">⌘↵</kbd>}
          </button>
        </div>
      </div>
    </div>
  );
}
