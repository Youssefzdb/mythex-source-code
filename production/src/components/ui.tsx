import { createContext, useCallback, useContext, useState, type ReactNode, type CSSProperties } from "react";
import { ModalSurface, SurfaceScroll, useIsPhone, useSurfaceClose } from "./ui/Sheet";
import {
  ArrowUp,
  Check,
  Database,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  History,
  Info,
  Play,
  RefreshCw,
  Rocket,
  Settings,
  Sparkles,
  Square,
  SquareTerminal,
  TriangleAlert,
  X,
} from "lucide-react";
import { FG_TERTIARY, floatingRing, PANEL_BG, SHELL_BG } from "../lib/surfaces";
import { useT } from "../i18n/app";
import { errorHaptic } from "../lib/haptics";

/* ── Toasts ─────────────────────────────────────────────────────────────── */

interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  message: string;
}

const ToastContext = createContext<(kind: Toast["kind"], message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: Toast["kind"], message: string) => {
    // An error is felt as well as shown (in the app): it is the toast that
    // needs noticing, often while the eye is on something else.
    if (kind === "error") errorHaptic();
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      {/* On a phone: below the status bar (it sat on the clock and the
          Dynamic Island) and across the screen, like the system's banners. */}
      <div className="pointer-events-none fixed top-4 end-4 z-[100] flex w-80 flex-col gap-2 max-sm:inset-x-3 max-sm:top-[calc(var(--safe-top,0px)+0.5rem)] max-sm:w-auto">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="fade-up pointer-events-auto flex items-start gap-2.5 rounded-[12px] border border-black/5 bg-white px-3.5 py-3 text-sm text-[#141413] shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)]"
          >
            <span
              className={`mt-0.5 shrink-0 ${
                toast.kind === "error"
                  ? "text-red-600"
                  : toast.kind === "success"
                    ? "text-emerald-600"
                    : "text-[#52524e]"
              }`}
            >
              {toast.kind === "error" ? (
                <TriangleAlert className="size-4" />
              ) : toast.kind === "success" ? (
                <IconCheck />
              ) : (
                <IconInfo />
              )}
            </span>
            <span className="min-w-0 break-words font-medium leading-snug">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/* ── Dialog shell ───────────────────────────────────────────────────────── */

export function Dialog({
  title,
  subtitle,
  onClose,
  children,
  wide,
  extraWide,
  /** Left rail (e.g. project Publish/Settings nav). Uses a split layout. */
  sidebar,
  /** Panel fill — default drawer chrome; billing/pricing use page content bg. */
  panelBackground,
  /**
   * Come up from the bottom edge on a phone instead of sitting in the middle.
   *
   * Opt-in rather than automatic: a centred box is right for a short confirm,
   * and wrong for a panel with sections and a form in it, which is most of the
   * screen on a phone and should behave like the sheet it already resembles.
   * Above `sm` nothing changes.
   */
  sheet,
  /** False while something is in flight that closing would abandon. */
  dismissible = true,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** Pricing-style full-width modal (~3 plan cards). */
  extraWide?: boolean;
  sidebar?: ReactNode;
  panelBackground?: string;
  sheet?: boolean;
  dismissible?: boolean;
}) {
  const panelBg = panelBackground ?? SHELL_BG;
  const maxW = extraWide
    ? "max-w-[72rem]"
    : sidebar
      ? "max-w-5xl"
      : wide
        ? "max-w-2xl"
        : "max-w-lg";

  // Base UI underneath (ModalSurface): a Drawer on a phone when `sheet` is set —
  // follows the finger, flicks away — and a Dialog otherwise, growing in from
  // 95% and fading out. Every exit animates before `onClose` runs.
  if (sidebar) {
    return (
      <ModalSurface
        onClose={onClose}
        label={title}
        sheet={sheet}
        dismissible={dismissible}
        // A fixed frame, not max-height: with max-height the whole modal
        // resized every time you changed section, which is a lot of movement
        // for a navigation click. The panel scrolls instead. On a phone the
        // sheet holds its height for the same reason.
        sheetHeight="88dvh"
        sheetFixedHeight
        className={`h-[min(92dvh,720px)] overflow-hidden rounded-[16px] ${maxW} ${
          sheet ? "sheet-surface max-sm:h-auto" : ""
        }`}
        style={{ background: panelBg, boxShadow: floatingRing(SHELL_BG) }}
      >
        {/* Same shape as the connectors modal: the rail sits straight on the
            shell with no fill and no divider, and the content is an inset
            rounded panel a step lighter. A row of its own: the surface is a
            column, which on a phone has the sheet's grab handle at its top. */}
        <div className="flex min-h-0 flex-1">
        <aside className="hidden w-52 shrink-0 flex-col p-2 sm:flex">{sidebar}</aside>
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col p-2 sm:py-2 sm:pe-2 sm:ps-0 ${
            sheet ? "max-sm:p-0" : ""
          }`}
        >
          <div
            className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[8px] mx-ring ${
              sheet ? "sheet-flush" : ""
            }`}
            style={{ background: PANEL_BG }}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold tracking-tight text-white">{title}</h2>
                {subtitle && (
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: FG_TERTIARY }}>
                    {subtitle}
                  </p>
                )}
              </div>
              <DialogCloseButton sheet={sheet} />
            </div>
            {/* The inset at the bottom is the sheet's own: it reaches the
                bottom edge of the screen, which on a phone with three buttons
                is 48px of system nav bar with the last row of content under it. */}
            <SurfaceScroll className={`px-5 pb-5 ${sheet ? "native-safe-bottom" : ""}`}>
              {children}
            </SurfaceScroll>
          </div>
        </div>
        </div>
      </ModalSurface>
    );
  }

  return (
    <ModalSurface
      onClose={onClose}
      label={title}
      sheet={sheet}
      dismissible={dismissible}
      sheetHeight="88dvh"
      className={`max-h-[min(92dvh,900px)] overflow-hidden rounded-[16px] border border-line shadow-[0_24px_80px_-24px_rgba(0,0,0,0.75)] ${maxW} ${
        sheet ? "sheet-surface" : ""
      }`}
      style={{ background: panelBg }}
    >
      <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-5 pb-5 sm:px-6 sm:pt-6">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
          {subtitle && <p className="mt-1 text-sm leading-relaxed text-muted">{subtitle}</p>}
        </div>
        <DialogCloseButton sheet={sheet} />
      </div>
      <SurfaceScroll className={`px-5 pb-5 sm:px-6 sm:pb-6 ${sheet ? "native-safe-bottom" : ""}`}>
        {children}
      </SurfaceScroll>
    </ModalSurface>
  );
}

/**
 * The dialog's ✕: closes it through the surface, so it animates out. Not in a
 * phone's bottom sheet: the grab handle, a pull down and a tap outside close
 * it, as every other sheet in the app does.
 */
function DialogCloseButton({ sheet = false }: { sheet?: boolean }) {
  const t = useT();
  const close = useSurfaceClose();
  const phone = useIsPhone();
  if (sheet && phone) return null;
  return (
    <button
      type="button"
      onClick={close}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-white/50 transition hover:bg-white/[0.06] hover:text-white"
      aria-label={t.common.close}
    >
      <IconX />
    </button>
  );
}

/* ── Confirm dialog ─────────────────────────────────────────────────────── */

export function ConfirmDialog({
  title,
  subtitle,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Shown between the subtitle and the buttons (a warning, say). */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <Dialog title={title} subtitle={subtitle} onClose={onClose} dismissible={!busy}>
      {children}
      <div className="mt-5 flex justify-end gap-2">
        <DialogCancelButton label={cancelLabel ?? t.common.cancel} disabled={busy} />
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={danger ? "btn-danger" : "btn-primary"}
        >
          {busy ? <Spinner size={16} /> : (confirmLabel ?? t.common.confirm)}
        </button>
      </div>
    </Dialog>
  );
}

/** Cancel closes through the surface, so the dialog animates out like the ✕. */
function DialogCancelButton({ label, disabled }: { label: string; disabled: boolean }) {
  const close = useSurfaceClose();
  return (
    <button type="button" onClick={close} disabled={disabled} className="btn-ghost">
      {label}
    </button>
  );
}

/* ── Spinner / skeleton ─────────────────────────────────────────────────── */

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    // Arc only — the faint full-circle track read as a ring drawn around the
    // spinner rather than as part of it.
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="animate-spin">
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} />;
}

/* ── Icons (lucide-react, sized for inline use) ─────────────────────────── */

export const IconX = () => <X className="h-4 w-4" />;
export const IconCheck = () => <Check className="h-4 w-4" />;
export const IconAlert = () => <TriangleAlert className="h-4 w-4" />;
export const IconInfo = () => <Info className="h-4 w-4" />;
export const IconPlay = () => <Play className="h-4 w-4 fill-current" />;
export const IconStop = () => <Square className="h-2.5 w-2.5 fill-current" />;
export const IconRocket = () => <Rocket className="h-4 w-4" />;
export const IconGear = () => <Settings className="h-4 w-4" />;
export const IconRefresh = () => <RefreshCw className="h-4 w-4" />;
export const IconExternal = () => <ExternalLink className="h-4 w-4" />;
export const IconSend = () => <ArrowUp className="h-3.5 w-3.5 stroke-[2.5]" />;
export const IconFile = () => <FileText className="h-3.5 w-3.5" />;
export const IconFolder = ({ open }: { open?: boolean }) =>
  open ? <FolderOpen className="h-3.5 w-3.5" /> : <Folder className="h-3.5 w-3.5" />;
export const IconTerminal = () => <SquareTerminal className="h-4 w-4" />;
export const IconDb = () => <Database className="h-4 w-4" />;
export const IconSparkle = () => <Sparkles className="h-4 w-4" />;
export const IconHistory = () => <History className="h-3.5 w-3.5" />;
