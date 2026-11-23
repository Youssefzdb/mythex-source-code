import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
  type SVGProps,
} from "react";
import { Check, ChevronDown, ImagePlus, Lock, Mic, Paperclip, Plus, Waypoints, X } from "lucide-react";
import { AnchoredPopover } from "./ui/Popover";
import { useToast } from "./ui";
import { appT, fill } from "../i18n/app";
import { usePageT } from "../i18n/usePageT";
import { CARD_BG, floatingRing } from "../lib/surfaces";
import { dictationLang, getSpeechRecognitionCtor, speechSupported } from "../lib/speech-dictation";
import {
  BUILD_PROMPT_MODES,
  CHAT_PROMPT_MODES,
  DEFAULT_MYTHEX_MODEL_TIER,
  MYTHEX_MODEL_STORAGE_KEY,
  MYTHEX_MODEL_TIERS,
  parseMythexModelTier,
  type MythexModelTier,
  type PromptBuildMode,
} from "../lib/prompt-modes";
import { selectionHaptic, tapHaptic } from "../lib/haptics";

export type { PromptBuildMode, MythexModelTier };
export {
  BUILD_PROMPT_MODES,
  CHAT_PROMPT_MODES,
  DEFAULT_MYTHEX_MODEL_TIER,
  MYTHEX_MODEL_STORAGE_KEY,
  MYTHEX_MODEL_TIERS,
  parseMythexModelTier,
};

/** Shared row for Build / model popover options. */

/** The chat.modes entry with each model tier's words (lib/prompt-modes.ts). */
const TIER_KEY: Record<MythexModelTier, "standard" | "pro"> = { "mythex-lite": "standard", "mythex-max": "pro" };
function ComposerMenuRow({
  selected,
  showCheck = true,
  light,
  label,
  description,
  onClick,
  testId,
  locked,
  lockTooltip,
}: {
  selected: boolean;
  /** When false, never render the check (e.g. Standard tier). */
  showCheck?: boolean;
  light?: boolean;
  label: string;
  description: string;
  onClick: () => void;
  testId?: string;
  /** Pro tier for Free users — looks disabled; click still fires (upgrade). */
  locked?: boolean;
  lockTooltip?: string;
}) {
  const marked = selected && showCheck && !locked;
  const [tipVisible, setTipVisible] = useState(false);
  const tipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTipTimer = () => {
    if (tipTimerRef.current != null) {
      clearTimeout(tipTimerRef.current);
      tipTimerRef.current = null;
    }
  };

  useEffect(() => () => clearTipTimer(), []);

  const onRowEnter = () => {
    if (!locked || !lockTooltip) return;
    clearTipTimer();
    tipTimerRef.current = setTimeout(() => setTipVisible(true), 200);
  };

  const onRowLeave = () => {
    clearTipTimer();
    setTipVisible(false);
  };

  return (
    <div
      className="group/row relative"
      onMouseEnter={onRowEnter}
      onMouseLeave={onRowLeave}
    >
      <button
        type="button"
        role="option"
        aria-selected={selected}
        aria-disabled={locked || undefined}
        data-testid={testId}
        aria-label={locked && lockTooltip ? `${label}. ${lockTooltip}` : undefined}
        onClick={onClick}
        className={`flex w-full items-start gap-2 rounded-[10px] px-2.5 py-2 text-start transition ${
          locked
            ? light
              ? "cursor-pointer opacity-55 hover:bg-black/[0.04]"
              : "cursor-pointer opacity-55 hover:bg-white/[0.06]"
            : light
              ? "hover:bg-black/[0.04]"
              : "hover:bg-white/[0.06]"
        }`}
      >
        <span
          className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center ${
            light ? "text-zinc-900" : "text-white"
          }`}
          aria-hidden
        >
          {locked ? (
            <Lock className={`h-3.5 w-3.5 ${light ? "text-zinc-400" : "text-white/50"}`} strokeWidth={2.5} />
          ) : marked ? (
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block text-sm font-medium leading-snug ${
              light ? "text-zinc-900" : "text-white"
            }`}
          >
            {label}
          </span>
          <span
            className={`mt-0.5 block text-[12px] leading-snug ${
              light ? "text-zinc-500" : "text-muted"
            }`}
          >
            {description}
          </span>
        </span>
      </button>
      {locked && lockTooltip && tipVisible && (
        <div
          role="tooltip"
          className={`pointer-events-none absolute start-full top-1/2 z-40 ms-2 w-max max-w-[12.5rem] -translate-y-1/2 rounded-lg px-2.5 py-1.5 text-start text-[11px] leading-snug shadow-lg ${
            light ? "bg-zinc-900 text-white" : "bg-white text-zinc-900"
          }`}
        >
          {lockTooltip}
        </div>
      )}
    </div>
  );
}

/** Build / Plan (/ Ask) + optional Standard/Pro in one menu. */
function BuildModeMenu({
  open,
  anchorRef,
  mode,
  light,
  placement = "down",
  modes = BUILD_PROMPT_MODES,
  modelTier,
  onSelect,
  onSelectTier,
  onClose,
  proModelLocked,
  onProUpgrade,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  mode: PromptBuildMode;
  light?: boolean;
  /** Chat composer sits at the bottom — open upward. */
  placement?: "up" | "down";
  modes?: typeof BUILD_PROMPT_MODES;
  /** When set, Standard / Pro appear under the mode list. */
  modelTier?: MythexModelTier;
  onSelect: (m: PromptBuildMode) => void;
  onSelectTier?: (t: MythexModelTier) => void;
  onClose: () => void;
  /** Free / guest — Pro is not selectable. */
  proModelLocked?: boolean;
  onProUpgrade?: () => void;
}) {
  const t = usePageT();
  const showTiers = modelTier != null && Boolean(onSelectTier);

  return (
    <AnchoredPopover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      ignoreOutside={(el) => Boolean(el.closest('[data-testid="build-mode"]'))}
      side={placement === "up" ? "top" : "bottom"}
      align="end"
      role="listbox"
      label={t.chat.composer.buildModeMenu}
      testId="build-mode-menu"
      className={`min-w-[13.5rem] overflow-visible rounded-[16px] p-1.5 ${
        light ? "border border-black/8 bg-white shadow-xl" : ""
      }`}
      style={{
        background: light ? undefined : CARD_BG,
        // A warm hairline and a drop, not a black ring.
        boxShadow: light ? undefined : floatingRing(CARD_BG),
      }}
    >
      {modes.map((m) => (
        <ComposerMenuRow
          key={m.id}
          selected={m.id === mode}
          light={light}
          label={t.chat.modes[m.id]?.label ?? m.label}
          description={t.chat.modes[m.id]?.description ?? m.description}
          onClick={() => {
            onSelect(m.id);
            onClose();
          }}
        />
      ))}
      {showTiers && (
        <>
          <div
            className={`my-1.5 h-px ${light ? "bg-black/8" : "bg-white/10"}`}
            role="separator"
          />
          {MYTHEX_MODEL_TIERS.map((opt) => {
            const locked = opt.id === "mythex-max" && Boolean(proModelLocked);
            return (
              <ComposerMenuRow
                key={opt.id}
                selected={opt.id === modelTier}
                light={light}
                label={t.chat.modes[TIER_KEY[opt.id]].label}
                description={t.chat.modes[TIER_KEY[opt.id]].description}
                testId={`model-tier-${opt.id}`}
                locked={locked}
                lockTooltip={locked ? t.chat.composer.proModelLocked : undefined}
                onClick={() => {
                  if (locked) {
                    onClose();
                    onProUpgrade?.();
                    return;
                  }
                  onSelectTier?.(opt.id);
                  onClose();
                }}
              />
            );
          })}
        </>
      )}
    </AnchoredPopover>
  );
}

/** One row of the + menu: an icon and a label, no description. */
function PlusMenuRow({
  icon: Icon,
  label,
  light,
  testId,
  onClick,
}: {
  icon: typeof Paperclip;
  label: string;
  light?: boolean;
  testId?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={testId}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-start transition ${
        light ? "hover:bg-black/[0.04]" : "hover:bg-white/[0.06]"
      }`}
    >
      <Icon
        className={`h-[18px] w-[18px] shrink-0 ${light ? "text-zinc-500" : "text-white/70"}`}
        strokeWidth={1.75}
      />
      <span className={`text-sm font-medium ${light ? "text-zinc-900" : "text-white"}`}>
        {label}
      </span>
    </button>
  );
}

/**
 * The + menu: attach a file, or connect an app.
 *
 * The + used to open the file picker on click. It grew a menu because
 * connectors need a home in the composer and there was nowhere else to put
 * one — the chat column is too narrow for another control in the action row,
 * and a chip above the composer sat in the middle of the conversation.
 * Attaching is the first row so it stays one click away from muscle memory.
 */
function AttachMenu({
  open,
  anchorRef,
  light,
  placement = "down",
  onAttach,
  onConnectors,
  onCreateImage,
  onClose,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  light?: boolean;
  placement?: "up" | "down";
  onAttach?: () => void;
  onConnectors: () => void;
  /** Arms the Create image command, same as typing /image. */
  onCreateImage?: () => void;
  onClose: () => void;
}) {
  const t = usePageT();
  return (
    <AnchoredPopover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      side={placement === "up" ? "top" : "bottom"}
      align="start"
      role="menu"
      label={t.chat.composer.plusMenu}
      testId="plus-menu"
      className={`min-w-[11.5rem] overflow-visible rounded-[16px] p-1.5 ${
        light ? "border border-black/8 bg-white shadow-xl" : ""
      }`}
      style={{
        background: light ? undefined : CARD_BG,
        // A warm hairline and a drop, not a black ring.
        boxShadow: light ? undefined : floatingRing(CARD_BG),
      }}
    >
      <PlusMenuRow
        icon={Paperclip}
        label={t.chat.composer.attach}
        light={light}
        testId="plus-menu-attach"
        onClick={() => {
          onClose();
          onAttach?.();
        }}
      />
      {onCreateImage && (
        <PlusMenuRow
          icon={ImagePlus}
          label={t.chat.composer.createImage}
          light={light}
          testId="plus-menu-create-image"
          onClick={() => {
            onClose();
            onCreateImage();
          }}
        />
      )}
      <PlusMenuRow
        icon={Waypoints}
        label={t.chat.composer.connectors}
        light={light}
        testId="plus-menu-connectors"
        onClick={() => {
          onClose();
          onConnectors();
        }}
      />
    </AnchoredPopover>
  );
}

/** Filled send arrow — shaft + arrowhead (not Lucide stroke). */
function ArrowUpMediumIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path
        d="M11.0004 19.0005V7.41461L7.70744 10.7076C7.31692 11.0981 6.68391 11.0981 6.29338 10.7076C5.90286 10.3171 5.90286 9.68404 6.29338 9.29352L11.2934 4.29352L11.3666 4.22711C11.5446 4.08128 11.7683 4.00055 12.0004 4.00055C12.2656 4.00055 12.5199 4.10598 12.7074 4.29352L17.7074 9.29352C18.098 9.68404 18.098 10.3171 17.7074 10.7076C17.3169 11.0981 16.6839 11.0981 16.2934 10.7076L13.0004 7.41461V19.0005C13.0004 19.5528 12.5527 20.0005 12.0004 20.0005C11.4481 20.0005 11.0004 19.5528 11.0004 19.0005Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * Homepage typewriter: fixed prefix + rotating suffixes.
 * typingSpeed/deletingSpeed = 30ms.
 */
/** Rotating suffix typewriter: fixed prefix + typing/deleting words. */
export function usePrefixTypewriter(
  prefix: string,
  words: string[],
  enabled: boolean,
) {
  const [wordIdx, setWordIdx] = useState(0);
  const [suffix, setSuffix] = useState("");
  const [phase, setPhase] = useState<"typing" | "pausing" | "deleting">("typing");
  const wordsKey = words.join("\0");

  useEffect(() => {
    if (!enabled || words.length === 0) {
      setSuffix("");
      setPhase("typing");
      return;
    }
    let cancelled = false;
    const word = words[wordIdx % words.length];
    const SPEED = 30;
    const PAUSE_MS = 1800;

    if (phase === "typing") {
      if (suffix.length >= word.length) {
        const t = window.setTimeout(() => {
          if (!cancelled) setPhase("pausing");
        }, PAUSE_MS);
        return () => {
          cancelled = true;
          window.clearTimeout(t);
        };
      }
      const t = window.setTimeout(() => {
        if (!cancelled) setSuffix(word.slice(0, suffix.length + 1));
      }, SPEED);
      return () => {
        cancelled = true;
        window.clearTimeout(t);
      };
    }

    if (phase === "pausing") {
      const t = window.setTimeout(() => {
        if (!cancelled) setPhase("deleting");
      }, 40);
      return () => {
        cancelled = true;
        window.clearTimeout(t);
      };
    }

    // deleting
    if (suffix.length === 0) {
      const t = window.setTimeout(() => {
        if (cancelled) return;
        setWordIdx((i) => (i + 1) % words.length);
        setPhase("typing");
      }, 200);
      return () => {
        cancelled = true;
        window.clearTimeout(t);
      };
    }
    const t = window.setTimeout(() => {
      if (!cancelled) setSuffix((s) => s.slice(0, -1));
    }, SPEED);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- wordsKey stands in for words
  }, [enabled, wordIdx, suffix, phase, wordsKey, prefix]);

  useEffect(() => {
    if (!enabled) return;
    setSuffix("");
    setPhase("typing");
  }, [enabled, wordsKey]);

  return enabled ? prefix + suffix : "";
}

/** Legacy full-phrase typewriter (dashboard / compact). */
function useTypewriter(phrases: string[], enabled: boolean) {
  const [text, setText] = useState("");
  const [phraseIdx, setPhraseIdx] = useState(0);
  const key = phrases.join("\0");

  useEffect(() => {
    if (!enabled || phrases.length === 0) {
      setText("");
      return;
    }
    let cancelled = false;
    const phrase = phrases[phraseIdx % phrases.length];
    let i = 0;
    setText("");

    const tick = () => {
      if (cancelled) return;
      if (i < phrase.length) {
        i += 1;
        setText(phrase.slice(0, i));
        window.setTimeout(tick, 30);
        return;
      }
      window.setTimeout(() => {
        if (cancelled) return;
        // delete then next
        const del = () => {
          if (cancelled) return;
          setText((t) => {
            if (t.length <= 0) {
              window.setTimeout(() => setPhraseIdx((p) => (p + 1) % phrases.length), 200);
              return "";
            }
            window.setTimeout(del, 30);
            return t.slice(0, -1);
          });
        };
        window.setTimeout(del, 1800);
      }, 0);
    };
    const start = window.setTimeout(tick, 40);
    return () => {
      cancelled = true;
      window.clearTimeout(start);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, phraseIdx, key]);

  return text;
}

/** Dark prompt: guest = muted Build/mic + circled + ; signed-in = solid white controls. */
const MUTED_BUILD = "text-white/50";
const MUTED_ICON = "text-white/50";
const SOLID_BUILD = "text-white";
const SOLID_ICON = "text-white";

/**
 * Send/stop entrance: layout spacer keeps empty-state right padding normal;
 * the button itself clips from the prompt-bar’s outer edge (past the padding).
 */
function PromptSendEntrance({
  show,
  padClass,
  clipClass,
  restRightClass,
  children,
}: {
  show: boolean;
  /** Negative margin that reaches the bar’s outer edge (matches form padding). */
  padClass: string;
  clipClass: string;
  restRightClass: string;
  children: ReactNode;
}) {
  return (
    <>
      {/* Reserves space only while visible — empty state keeps original right padding. */}
      <div
        aria-hidden
        className={`shrink-0 transition-[width,margin] duration-200 ease-out ${
          show ? "ms-0.5 w-8" : "w-0"
        }`}
      />
      <div
        className={`pointer-events-none absolute top-0 end-0 h-8 overflow-hidden ${padClass} ${clipClass}`}
        aria-hidden={!show}
        // Prevent focusable send controls from living under aria-hidden (a11y tree).
        inert={show ? undefined : true}
      >
        <div
          className={`pointer-events-auto absolute top-0 ${restRightClass} transition-transform duration-200 ease-out ${
            show ? "translate-x-0" : "translate-x-[calc(100%+1.25rem)] rtl:-translate-x-[calc(100%+1.25rem)]"
          }`}
        >
          {children}
        </div>
      </div>
    </>
  );
}

const VOICE_BARS = 72;
const VOICE_MIN_H = 2;
const VOICE_MAX_H = 32;
/** Single-line prompt text row (15px × 1.45) — match UserPromptCard / contenteditable. */
const EDITOR_ROW_H = 22;
/** Mic waveform needs a taller row than a single text line. */
const VOICE_ROW_H = 36;

/**
 * Google/Lovable-style mic waveform: live levels from the microphone via
 * Web Audio AnalyserNode, shaped with a center-tall envelope.
 */
function VoiceWaveform({ light, active }: { light?: boolean; active: boolean }) {
  const barsRef = useRef<Array<HTMLSpanElement | null>>([]);
  const levelsRef = useRef<Float32Array>(new Float32Array(VOICE_BARS).fill(0.08));

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    let idleT = 0;

    const paint = () => {
      const levels = levelsRef.current;
      for (let i = 0; i < VOICE_BARS; i++) {
        const el = barsRef.current[i];
        if (!el) continue;
        const h = VOICE_MIN_H + levels[i]! * (VOICE_MAX_H - VOICE_MIN_H);
        el.style.height = `${h}px`;
      }
    };

    const runIdle = () => {
      idleT += 0.08;
      for (let i = 0; i < VOICE_BARS; i++) {
        const envelope = Math.sin((Math.PI * i) / (VOICE_BARS - 1));
        levelsRef.current[i] = 0.06 + envelope * (0.08 + Math.sin(idleT + i * 0.35) * 0.04);
      }
      paint();
      raf = requestAnimationFrame(runIdle);
    };

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtx = new AC();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.82;
        source.connect(analyser);
        const time = new Uint8Array(analyser.fftSize);
        const freq = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (cancelled) return;
          analyser.getByteTimeDomainData(time);
          analyser.getByteFrequencyData(freq);

          let sum = 0;
          for (let i = 0; i < time.length; i++) {
            const v = (time[i]! - 128) / 128;
            sum += v * v;
          }
          const rms = Math.min(1, Math.sqrt(sum / time.length) * 3.2);

          for (let i = 0; i < VOICE_BARS; i++) {
            const t = i / (VOICE_BARS - 1);
            // Center-tall Google-style envelope.
            const envelope = Math.sin(Math.PI * t);
            // Mirror low-mid frequency energy across the bar row.
            const bin = Math.min(
              freq.length - 1,
              Math.floor((Math.min(t, 1 - t) * 2) * freq.length * 0.35),
            );
            const local = (freq[bin] ?? 0) / 255;
            const target = 0.05 + envelope * (0.12 + rms * 0.75 + local * 0.35);
            const prev = levelsRef.current[i]!;
            levelsRef.current[i] = prev + (Math.min(1, target) - prev) * 0.35;
          }
          paint();
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        // Mic analyser unavailable — soft idle pulse so the UI still feels alive.
        runIdle();
      }
    };

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void audioCtx?.close();
      levelsRef.current.fill(0.08);
    };
  }, [active]);

  return (
    <div
      className="flex h-full w-full items-center justify-between"
      style={{ minHeight: VOICE_ROW_H }}
      aria-hidden
      role="presentation"
    >
      {Array.from({ length: VOICE_BARS }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className={`w-[2px] shrink-0 rounded-full ${light ? "bg-zinc-800" : "bg-white/90"}`}
          style={{ height: `${VOICE_MIN_H + 0.08 * (VOICE_MAX_H - VOICE_MIN_H)}px` }}
        />
      ))}
    </div>
  );
}

function UnlockFeaturesCard({
  open,
  anchorRef,
  light,
  onLogin,
  onClose,
  align = "right",
  onMouseEnter,
  onMouseLeave,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  light?: boolean;
  onLogin: () => void;
  onClose: () => void;
  align?: "left" | "right";
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const t = usePageT();
  return (
    <AnchoredPopover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      side="bottom"
      align={align === "left" ? "start" : "end"}
      hoverCard
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="dialog"
      label={t.chat.composer.unlockTitle}
      className={`w-72 p-4 text-start ${
        light
          ? "rounded-[24px] border border-black/[0.06] bg-white text-zinc-900 shadow-xl"
          : "rounded-[24px] text-white"
      }`}
      style={{
        background: light ? undefined : CARD_BG,
        boxShadow: light ? undefined : floatingRing(CARD_BG),
      }}
    >
      <p className="font-medium">{t.chat.composer.unlockTitle}</p>
      <p className={`text-sm ${light ? "text-zinc-500" : "text-muted"}`}>{t.chat.composer.unlockBody}</p>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onLogin}
          className={`inline-flex h-7 items-center rounded-full px-[9px] py-1 text-sm font-normal transition ${
            light
              ? "bg-zinc-900 text-white hover:bg-zinc-800"
              : "bg-[oklch(100%_0_0_/_0.96)] text-[oklch(23.85%_0.004_106.68)] hover:bg-white"
          }`}
        >
          <span className="px-0.5">{t.chat.composer.logIn}</span>
        </button>
      </div>
    </AnchoredPopover>
  );
}

export function PromptBar({
  value,
  onChange,
  onSubmit,
  placeholder: placeholderProp,
  typewriterPhrases,
  typewriterPrefix,
  typewriterWords,
  submitLabel: submitLabelProp,
  busy,
  autoFocus,
  trailing,
  size = "md",
  tone = "dark",
  guest = false,
  onLogin,
  mode: modeProp,
  onModeChange,
  modelTier: modelTierProp,
  onModelTierChange,
  showModelTier = false,
  /** Free plan / guest — Pro tier locked; click opens upgrade. */
  proModelLocked = false,
  onProUpgrade,
  /** Chat: custom editor (contenteditable) instead of textarea. */
  body,
  /**
   * Flat chat chrome (UserPromptCard-matched padding). Defaults on when `body`
   * is set — pass false for dashboard / landing hero composers.
   */
  chat,
  /** Chat: image strip / queue banner above the editor. */
  header,
  onAttach,
  /** When set, + opens a menu (Attach / Connectors) instead of the file picker. */
  onConnectors,
  onCreateImage,
  creditsLocked = false,
  /** Override submit enablement (chips / attachments). */
  canSubmit: canSubmitProp,
  onStop,
  showStop,
  stopping,
  hideMic,
  /** Modes shown in the dropdown. Defaults to Build / Plan; pass CHAT_PROMPT_MODES for Ask. */
  modes,
  menuPlacement = "down",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  /** Full phrases (legacy). Prefer prefix+words for the rotating typewriter. */
  typewriterPhrases?: string[];
  /** e.g. "Ask Mythex to create " */
  typewriterPrefix?: string;
  /** e.g. ["a landing page for my...", "a blog about..."] */
  typewriterWords?: string[];
  submitLabel?: string;
  busy?: boolean;
  autoFocus?: boolean;
  trailing?: ReactNode;
  size?: "md" | "lg";
  tone?: "dark" | "light";
  /** Logged-out: hover on + / Build / mic shows unlock card */
  guest?: boolean;
  onLogin?: () => void;
  mode?: PromptBuildMode;
  onModeChange?: (mode: PromptBuildMode) => void;
  /** Branded Standard / Pro (chat composer). */
  modelTier?: MythexModelTier;
  onModelTierChange?: (tier: MythexModelTier) => void;
  showModelTier?: boolean;
  proModelLocked?: boolean;
  onProUpgrade?: () => void;
  body?: ReactNode;
  /** Override chat chrome; defaults to true when `body` is set. */
  chat?: boolean;
  header?: ReactNode;
  onAttach?: () => void;
  onConnectors?: () => void;
  /** Arms the Create image command from the + menu. */
  onCreateImage?: () => void;
  /** Out of credits — attach and mic stay visible but can't start a turn. */
  creditsLocked?: boolean;
  canSubmit?: boolean;
  onStop?: () => void;
  showStop?: boolean;
  stopping?: boolean;
  hideMic?: boolean;
  modes?: Array<{ id: PromptBuildMode; label: string; description: string }>;
  menuPlacement?: "up" | "down";
  className?: string;
}) {
  const t = usePageT();
  const placeholder = placeholderProp ?? t.chat.composer.placeholder;
  const submitLabel = submitLabelProp ?? t.chat.modes.build.label;
  const modeOptions = modes ?? BUILD_PROMPT_MODES;
  const [menuOpen, setMenuOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [modeInternal, setModeInternal] = useState<PromptBuildMode>("build");
  const mode = modeProp ?? modeInternal;
  const setMode = (m: PromptBuildMode) => {
    // A picker's tick, as iOS gives one: only when the mode actually changes.
    if (m !== mode) selectionHaptic();
    if (modeProp === undefined) setModeInternal(m);
    onModeChange?.(m);
  };
  const [tierInternal, setTierInternal] = useState<MythexModelTier>(DEFAULT_MYTHEX_MODEL_TIER);
  const modelTier = modelTierProp ?? tierInternal;
  const setModelTier = (tier: MythexModelTier) => {
    if (modelTierProp === undefined) setTierInternal(tier);
    onModelTierChange?.(tier);
  };
  // In the page's language (usePageT), like the rest of the box: the shared option lists follow the app's.
  const modeLabel = modeOptions.some((m) => m.id === mode) ? (t.chat.modes[mode]?.label ?? submitLabel) : submitLabel;
  const proSelected = showModelTier && modelTier === "mythex-max";
  const [unlockOpen, setUnlockOpen] = useState<"left" | "right" | null>(null);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buildModeBtnRef = useRef<HTMLButtonElement>(null);
  const attachBtnRef = useRef<HTMLButtonElement>(null);
  const micBtnRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  // The mic's error is the button's tooltip, which a touch screen never
  // shows: on a phone a mic that couldn't start did nothing at all when
  // tapped (no speech recognition in the page, seen on an iPhone). Said
  // out loud there instead.
  const toast = useToast();
  useEffect(() => {
    if (voiceError && window.matchMedia?.("(hover: none)").matches) toast("error", voiceError);
  }, [voiceError, toast]);
  const recognitionRef = useRef<InstanceType<NonNullable<ReturnType<typeof getSpeechRecognitionCtor>>> | null>(
    null,
  );
  const baseTextRef = useRef("");
  const finalChunkRef = useRef("");
  const interimChunkRef = useRef("");
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const voiceSupported = speechSupported();

  const openUnlock = (side: "left" | "right") => {
    if (!guest || !onLogin) return;
    if (unlockTimerRef.current) {
      clearTimeout(unlockTimerRef.current);
      unlockTimerRef.current = null;
    }
    setMenuOpen(false);
    setUnlockOpen(side);
  };
  const scheduleCloseUnlock = () => {
    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    unlockTimerRef.current = setTimeout(() => setUnlockOpen(null), 120);
  };
  const cancelCloseUnlock = () => {
    if (unlockTimerRef.current) {
      clearTimeout(unlockTimerRef.current);
      unlockTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
      try {
        recognitionRef.current?.abort();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    };
  }, []);

  const stopVoice = useCallback((commit: boolean) => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    try {
      rec?.stop();
    } catch {
      try {
        rec?.abort();
      } catch {
        /* ignore */
      }
    }
    setListening(false);
    if (commit) {
      const spoken = `${finalChunkRef.current}${interimChunkRef.current}`.trim();
      if (spoken) {
        const base = baseTextRef.current;
        onChangeRef.current(base && !/\s$/.test(base) ? `${base} ${spoken}` : `${base}${spoken}`);
      }
    }
    finalChunkRef.current = "";
    interimChunkRef.current = "";
  }, []);

  const startVoice = useCallback(() => {
    setVoiceError(null);
    setMenuOpen(false);
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setVoiceError(appT().chat.composer.voiceUnsupportedTry);
      return;
    }
    try {
      recognitionRef.current?.abort();
    } catch {
      /* ignore */
    }
    const rec = new Ctor();
    recognitionRef.current = rec;
    baseTextRef.current = valueRef.current;
    finalChunkRef.current = "";
    interimChunkRef.current = "";
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = dictationLang();

    // Buffer speech only — Lovable keeps the waveform up until ✓ commits text.
    rec.onresult = (ev) => {
      let interim = "";
      let finals = finalChunkRef.current;
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const piece = ev.results[i]![0]?.transcript ?? "";
        if (ev.results[i]!.isFinal) finals += piece;
        else interim += piece;
      }
      finalChunkRef.current = finals;
      interimChunkRef.current = interim;
    };

    rec.onerror = (ev) => {
      if (ev.error === "aborted" || ev.error === "no-speech") return;
      if (ev.error === "not-allowed") {
        setVoiceError(appT().chat.composer.micDenied);
      } else {
        setVoiceError(appT().chat.composer.voiceCaptureFailed);
      }
      stopVoice(false);
    };

    rec.onend = () => {
      // Chrome ends recognition periodically in continuous mode — restart while armed.
      if (recognitionRef.current === rec) {
        try {
          rec.start();
          return;
        } catch {
          /* fall through */
        }
      }
      setListening(false);
    };

    try {
      rec.start();
      setListening(true);
    } catch {
      setVoiceError(appT().chat.composer.voiceStartFailed);
      recognitionRef.current = null;
      setListening(false);
    }
  }, [stopVoice]);

  // The microphone starting and stopping is felt (in the app): the eyes are
  // usually not on the composer while speaking.
  const heardListening = useRef(listening);
  useEffect(() => {
    if (heardListening.current === listening) return;
    heardListening.current = listening;
    tapHaptic();
  }, [listening]);
  const toggleVoice = useCallback(() => {
    if (listening) {
      stopVoice(true);
      return;
    }
    startVoice();
  }, [listening, startVoice, stopVoice]);

  const empty = !value;
  const usePrefixMode = Boolean(typewriterPrefix && typewriterWords?.length);
  const prefixTyping = usePrefixTypewriter(
    typewriterPrefix ?? "",
    typewriterWords ?? [],
    usePrefixMode && empty && !body,
  );
  const phraseTyping = useTypewriter(
    typewriterPhrases ?? [],
    !usePrefixMode && Boolean(typewriterPhrases?.length) && empty && !body,
  );
  const typing = usePrefixMode ? prefixTyping : phraseTyping;
  /** Typewriter drives the native placeholder so the real caret stays visible on focus. */
  const livePlaceholder = empty && typing ? typing : placeholder;
  const light = tone === "light";
  const lg = size === "lg";
  /** Flat chat chrome vs elevated hero — body alone used to imply chat. */
  const chatChrome = chat ?? Boolean(body);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const ok = canSubmitProp ?? Boolean(value.trim());
    if (!ok) return;
    // A turn in flight is not a reason to swallow the submit where the caller
    // queues follow-ups — that is what `showStop` marks (the chat composer).
    // Anywhere else (the hero bar creating a project) a second submit would
    // duplicate the action, so it stays blocked.
    if (busy && !showStop) return;
    tapHaptic();
    onSubmit();
  };

  const showUnlock = guest && Boolean(onLogin);
  const buildColor = light ? "text-zinc-500" : showUnlock ? MUTED_BUILD : SOLID_BUILD;
  const iconColor = light ? "text-zinc-500" : showUnlock ? MUTED_ICON : SOLID_ICON;
  const hasText = Boolean(value.trim());
  const canSubmit = (canSubmitProp ?? hasText) && !busy && !listening;
  /**
   * A turn is running and the user has typed something: that text is a
   * follow-up to queue, so the action has to be Send. `canSubmit` is false
   * while busy, which used to leave Stop as the only button — the message
   * could be queued by pressing Enter and no other way.
   */
  // `hasText` reads the `value` prop, which lags the contenteditable; the
  // caller derives `canSubmit` from the live editor, so use that.
  const queueMode = Boolean(showStop) && (canSubmitProp ?? hasText) && !listening;
  /** Send appears for text, stop, or parent-ready state (e.g. image-only attach). */
  const showSend = !listening && (Boolean(showStop) || hasText || canSubmitProp === true);

  // Lovable-style shortcut: Option/Alt+V
  useEffect(() => {
    if (showUnlock || hideMic || !voiceSupported) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey || e.key.toLowerCase() !== "v") return;
      e.preventDefault();
      toggleVoice();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hideMic, showUnlock, toggleVoice, voiceSupported]);

  const focusInput = () => {
    if (body) return;
    (textareaRef.current ?? inputRef.current)?.focus();
  };

  const sendButtonClass = light
    ? "bg-zinc-900 text-white hover:bg-zinc-800"
    : "bg-white text-zinc-900 hover:bg-white/95";

  /** Guest/landing: soft circle. Signed-in dashboard: plain white + . */
  const plusClass = creditsLocked
    ? "cursor-not-allowed bg-transparent text-white/30"
    : light
      ? "bg-black/[0.06] text-zinc-600 hover:bg-black/10"
      : showUnlock
        ? "bg-white/[0.08] text-white/50 hover:bg-white/[0.12] hover:text-white"
        : "bg-transparent text-white hover:bg-white/[0.08]";

  const guestHandlers = (side: "left" | "right") =>
    showUnlock
      ? {
          onMouseEnter: () => openUnlock(side),
          onMouseLeave: scheduleCloseUnlock,
          onFocus: () => openUnlock(side),
          onBlur: scheduleCloseUnlock,
        }
      : {};

  if (lg) {
    return (
      <form
        onSubmit={submit}
        onMouseDown={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("button, a, input, textarea, [contenteditable], [role='listbox'], [role='dialog']"))
            return;
          e.preventDefault();
          focusInput();
        }}
        className={`prompt-bar prompt-bar--hero w-full ${
          light ? "prompt-bar--on-light" : ""
        } ${chatChrome ? "prompt-bar--chat max-w-none" : "mx-auto max-w-[40rem]"} ${className ?? ""}`}
      >
        {header}
        <div
          className={`relative flex w-full flex-1 ${
            body ? "items-start" : "items-center px-0.5"
          }`}
          style={{ minHeight: listening ? VOICE_ROW_H : body ? undefined : EDITOR_ROW_H }}
        >
          {/* Keep editor in layout while listening so the bar height doesn’t jump. */}
          <div
            className={`w-full ${listening ? "invisible pointer-events-none select-none" : ""}`}
            aria-hidden={listening}
            inert={listening || undefined}
          >
            {body ?? (
              <textarea
                ref={textareaRef}
                autoFocus={autoFocus}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={livePlaceholder}
                rows={1}
                autoComplete="off"
                className={`max-h-[200px] w-full resize-none overflow-y-auto bg-transparent text-[16px] leading-[22px] outline-none caret-white ${
                  light
                    ? "text-zinc-900 caret-zinc-900 placeholder:text-zinc-400"
                    : "text-white placeholder:text-white/50"
                }`}
                style={{ minHeight: VOICE_ROW_H }}
                disabled={busy || listening}
                aria-label={t.chat.composer.prompt}
                dir="auto"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if ((canSubmitProp ?? Boolean(value.trim())) && !busy) {
                      tapHaptic();
                      onSubmit();
                    }
                  }
                }}
              />
            )}
          </div>
          {listening && (
            <div className="absolute inset-y-0 -inset-x-1 flex items-center sm:-inset-x-2">
              <VoiceWaveform light={light} active />
            </div>
          )}
        </div>

        <div className="relative mt-2 flex h-8 w-full min-w-0 items-center justify-between gap-1 overflow-visible">
          <div className="relative shrink-0" {...guestHandlers("left")}>
            <button
              ref={attachBtnRef}
              type="button"
              /* Pulled left so the + itself, not its 32px hit area, starts where
                 the placeholder does: the glyph sits 11px inside the circle. */
              className={`-ms-[11px] grid h-8 w-8 shrink-0 place-items-center rounded-full transition ${plusClass}`}
              aria-label={t.chat.composer.attach}
              disabled={creditsLocked}
              title={
                creditsLocked
                  ? t.chat.composer.attachNeedsCredits
                  : showUnlock
                    ? undefined
                    : onAttach
                      ? t.chat.composer.attachFiles
                      : t.chat.composer.attachSoon
              }
              aria-haspopup={onConnectors ? "menu" : undefined}
              aria-expanded={onConnectors ? plusOpen : undefined}
              onClick={() => {
                if (creditsLocked) return;
                if (showUnlock && onLogin) {
                  openUnlock("left");
                  return;
                }
                if (onConnectors) {
                  setMenuOpen(false);
                  setPlusOpen((o) => !o);
                  return;
                }
                onAttach?.();
              }}
            >
              <Plus className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </button>
            {onConnectors && (
              <AttachMenu
                open={plusOpen}
                anchorRef={attachBtnRef}
                light={light}
                placement={menuPlacement}
                onAttach={onAttach}
                onConnectors={onConnectors}
                onCreateImage={onCreateImage}
                onClose={() => setPlusOpen(false)}
              />
            )}
            {onLogin && (
              <UnlockFeaturesCard
                open={unlockOpen === "left"}
                onClose={() => setUnlockOpen(null)}
                anchorRef={attachBtnRef}
                light={light}
                align="left"
                onMouseEnter={cancelCloseUnlock}
                onMouseLeave={scheduleCloseUnlock}
                onLogin={() => {
                  setUnlockOpen(null);
                  onLogin();
                }}
              />
            )}
          </div>

          <div className="relative flex min-w-0 items-center gap-0 overflow-visible @[22rem]:gap-0.5">
            {listening ? (
              <>
                <button
                  type="button"
                  onClick={() => stopVoice(false)}
                  className={`grid h-8 w-8 place-items-center rounded-full transition ${
                    light
                      ? "text-zinc-500 hover:bg-black/[0.08] hover:text-zinc-800"
                      : "text-white/70 hover:bg-white/[0.08] hover:text-white"
                  }`}
                  aria-label={t.chat.composer.discardRecording}
                  title={t.chat.composer.discard}
                >
                  <X className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={() => stopVoice(true)}
                  className="grid h-8 w-8 place-items-center rounded-full bg-white text-zinc-900 transition hover:bg-white/90"
                  aria-label={t.chat.composer.finishRecording}
                  title={t.common.done}
                >
                  <Check className="h-4 w-4" strokeWidth={2.25} />
                </button>
              </>
            ) : (
              <>
                {trailing}
                <button
                  ref={buildModeBtnRef}
                  type="button"
                  data-testid="build-mode"
                  aria-label={proSelected ? fill(t.chat.composer.modeWithPro, { mode: modeLabel }) : modeLabel}
                  title={proSelected ? `${modeLabel} · Pro` : modeLabel}
                  className={`inline-flex h-8 shrink-0 items-center gap-0.5 rounded-full px-1.5 text-sm font-normal transition @[22rem]:gap-1 @[22rem]:px-2 ${buildColor} ${
                    light
                      ? "hover:bg-black/[0.08] hover:text-zinc-800"
                      : "hover:bg-white/[0.08] hover:text-white"
                  }`}
                  onClick={() => {
                    setUnlockOpen(null);
                    setMenuOpen((o) => !o);
                  }}
                >
                  {modeLabel}
                  {proSelected && (
                    <span
                      data-testid="model-tier-pro-marker"
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none tracking-wide ${
                        light
                          ? "bg-zinc-900 text-white"
                          : "bg-white/15 text-white"
                      }`}
                    >
                      Pro
                    </span>
                  )}
                  <ChevronDown className="h-3.5 w-3.5 opacity-80" />
                </button>
                {!hideMic && (
                  <button
                    ref={micBtnRef}
                    type="button"
                    disabled={creditsLocked}
                    /* Last in the row while Send is hidden: pulled right so the
                       mic glyph, not its 32px hit area, sits as far from the edge
                       as the + does on the left (both glyphs sit 11px inside
                       their circles). Send brings its own spacer; the pull
                       eases out with it. */
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition-[margin,color,background-color] duration-200 ease-out ${
                      showSend ? "" : "-me-[11px]"
                    } ${
                      creditsLocked
                        ? "cursor-not-allowed text-white/30"
                        : `${iconColor} ${
                            light
                              ? "hover:bg-black/[0.08] hover:text-zinc-800"
                              : "hover:bg-white/[0.08] hover:text-white"
                          }`
                    }`}
                    aria-label={t.chat.composer.voiceInput}
                    title={
                      creditsLocked
                        ? t.chat.composer.voiceNeedsCredits
                        : showUnlock
                          ? undefined
                          : voiceError
                            ? voiceError
                            : voiceSupported
                              ? fill(t.chat.composer.voiceInputShortcut, { keys: "⌥V" })
                              : t.chat.composer.voiceUnsupported
                    }
                    {...(creditsLocked ? {} : guestHandlers("right"))}
                    onClick={() => {
                      if (creditsLocked) return;
                      if (showUnlock && onLogin) {
                        openUnlock("right");
                        return;
                      }
                      if (!voiceSupported) {
                        setVoiceError(appT().chat.composer.voiceUnsupportedTry);
                        return;
                      }
                      startVoice();
                    }}
                  >
                    <Mic className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                )}
                <PromptSendEntrance
                  show={showSend}
                  /* Hang past form padding so send slides in from the bar’s outer edge
                     (same at any chat width — matches landing / wide panel). */
                  padClass={chatChrome ? "-me-4" : "-me-4 sm:-me-[18px]"}
                  clipClass={
                    chatChrome
                      ? "w-[calc(2rem+1rem)]"
                      : "w-[calc(2rem+1rem)] sm:w-[calc(2rem+18px)]"
                  }
                  restRightClass={chatChrome ? "end-4" : "end-4 sm:end-[18px]"}
                >
                  {/* While a turn runs the action is Stop — but once the user
                      has typed a follow-up there has to be a way to send it.
                      Without this the only route into the queue was Enter, and
                      a click landed on Stop instead. */}
                  {showStop && onStop && !queueMode ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (stopping) return;
                        onStop();
                      }}
                      disabled={stopping || !showSend}
                      aria-label={stopping ? t.chat.composer.stopping : t.chat.composer.stop}
                      title={stopping ? t.chat.composer.stoppingEllipsis : t.chat.composer.stopGenerating}
                      data-testid="chat-stop"
                      className="grid h-8 w-8 place-items-center rounded-full bg-white/90 text-zinc-900 transition hover:bg-white disabled:opacity-60"
                    >
                      <span className="block size-2.5 rounded-[2px] bg-current" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={(!canSubmit && !queueMode) || !showSend}
                      aria-label={t.common.send}
                      data-testid="chat-send"
                      // The text keeps the focus through the tap. Taken from
                      // it, the phone's keyboard started down and the layout
                      // moved under the finger, and the click landed beside
                      // the button: the first tap only closed the keyboard
                      // (logged in the simulator). Sending puts it away.
                      onMouseDown={(e) => e.preventDefault()}
                      className={`grid h-8 w-8 place-items-center rounded-full transition ${sendButtonClass}`}
                    >
                      <ArrowUpMediumIcon className="size-[18px]" />
                    </button>
                  )}
                </PromptSendEntrance>
                {onLogin && (
                  <UnlockFeaturesCard
                    open={unlockOpen === "right"}
                    onClose={() => setUnlockOpen(null)}
                    anchorRef={micBtnRef}
                    light={light}
                    align="right"
                    onMouseEnter={cancelCloseUnlock}
                    onMouseLeave={scheduleCloseUnlock}
                    onLogin={() => {
                      setUnlockOpen(null);
                      onLogin();
                    }}
                  />
                )}
                <BuildModeMenu
                  open={menuOpen}
                  anchorRef={buildModeBtnRef}
                  mode={mode}
                  light={light}
                  placement={menuPlacement}
                  modes={modeOptions}
                  modelTier={showModelTier ? modelTier : undefined}
                  onSelect={setMode}
                  onSelectTier={showModelTier ? setModelTier : undefined}
                  onClose={() => setMenuOpen(false)}
                  proModelLocked={proModelLocked}
                  onProUpgrade={onProUpgrade}
                />
              </>
            )}
          </div>
        </div>
      </form>
    );
  }

  const muted = light ? "text-zinc-400" : "text-white/50";
  const mutedHover = light
    ? "hover:bg-black/5 hover:text-zinc-800"
    : "hover:bg-white/10 hover:text-white";
  const inputText = light
    ? "text-zinc-900 caret-zinc-900 placeholder:text-zinc-400"
    : "text-white caret-white placeholder:text-white/40";

  return (
    <form
      onSubmit={submit}
      onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button, a, input, textarea, [role='dialog']")) return;
        e.preventDefault();
        focusInput();
      }}
      className={`prompt-bar mx-auto w-full max-w-2xl ${light ? "prompt-bar--on-light" : ""} ${
        listening ? "flex-col items-stretch gap-2 py-2.5" : ""
      }`}
    >
      {listening ? (
        <>
          <VoiceWaveform light={light} active />
          <div className="flex w-full items-center justify-between">
            <button
              type="button"
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition ${muted} ${mutedHover}`}
              aria-label={t.chat.composer.attach}
              title={t.chat.composer.attachSoon}
            >
              <Plus className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => stopVoice(false)}
                className={`grid h-9 w-9 place-items-center rounded-full transition ${muted} ${mutedHover}`}
                aria-label={t.chat.composer.discardRecording}
                title={t.chat.composer.discard}
              >
                <X className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => stopVoice(true)}
                className="grid h-8 w-8 place-items-center rounded-full bg-white text-zinc-900 transition hover:bg-white/90"
                aria-label={t.chat.composer.finishRecording}
                title={t.common.done}
              >
                <Check className="h-4 w-4" strokeWidth={2.25} />
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition ${muted} ${mutedHover}`}
            aria-label={t.chat.composer.attach}
            title={t.chat.composer.attachSoon}
          >
            <Plus className="h-4 w-4" />
          </button>
          <div className="relative min-w-0 flex-1">
            <input
              ref={inputRef}
              autoFocus={autoFocus}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={livePlaceholder}
              autoComplete="off"
              className={`h-9 w-full min-w-0 bg-transparent text-sm outline-none ${inputText}`}
              disabled={busy}
              aria-label={t.chat.composer.prompt}
            />
          </div>
          {trailing}
          <div className="relative flex shrink-0 items-center gap-1">
            <button
              ref={buildModeBtnRef}
              type="button"
              data-testid="build-mode"
              aria-label={proSelected ? fill(t.chat.composer.modeWithPro, { mode: modeLabel }) : modeLabel}
              title={proSelected ? `${modeLabel} · Pro` : modeLabel}
              className={`inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-normal transition ${buildColor} ${mutedHover}`}
              onClick={() => setMenuOpen((o) => !o)}
            >
              {modeLabel}
              {proSelected && (
                <span
                  data-testid="model-tier-pro-marker"
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none tracking-wide ${
                    light ? "bg-zinc-900 text-white" : "bg-white/15 text-white"
                  }`}
                >
                  Pro
                </span>
              )}
              <ChevronDown className="h-3.5 w-3.5 opacity-80" />
            </button>
            <button
              type="button"
              className={`grid h-9 w-9 place-items-center rounded-full transition ${muted} ${mutedHover}`}
              aria-label={t.chat.composer.voiceInput}
              title={
                voiceError
                  ? voiceError
                  : voiceSupported
                    ? fill(t.chat.composer.voiceInputShortcut, { keys: "⌥V" })
                    : t.chat.composer.voiceUnsupported
              }
              onClick={() => {
                if (!voiceSupported) {
                  setVoiceError(appT().chat.composer.voiceUnsupportedTry);
                  return;
                }
                startVoice();
              }}
            >
              <Mic className="h-4 w-4" />
            </button>
            <PromptSendEntrance
              show={showSend}
              padClass="-me-3"
              clipClass="w-[calc(2rem+0.75rem)]"
              restRightClass="end-3"
            >
              <button
                type="submit"
                disabled={!canSubmit || !showSend}
                aria-label={t.common.send}
                // As the chat's send button: the tap doesn't take the focus.
                onMouseDown={(e) => e.preventDefault()}
                className={`grid h-8 w-8 place-items-center rounded-full transition ${sendButtonClass}`}
              >
                <ArrowUpMediumIcon className="size-[18px]" />
              </button>
            </PromptSendEntrance>
            <BuildModeMenu
              open={menuOpen}
              anchorRef={buildModeBtnRef}
              mode={mode}
              light={light}
              onSelect={setMode}
              onClose={() => setMenuOpen(false)}
            />
          </div>
        </>
      )}
    </form>
  );
}
