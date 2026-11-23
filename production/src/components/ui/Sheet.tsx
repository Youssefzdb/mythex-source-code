import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Drawer } from "@base-ui/react/drawer";
import { X } from "lucide-react";
import { SHELL_BG } from "../../lib/surfaces";
import { useT } from "../../i18n/app";
import { useBackCloses } from "../../lib/native-back";

/**
 * The app's modal layers, on Base UI (as Lovable builds them).
 *
 * A phone gets a Drawer — a bottom sheet that follows the finger, dismisses on
 * a flick at the flick's own speed, and hands a pull from the top of a list to
 * the sheet — and everything else a Dialog that grows in from 95% and fades
 * out. The hand-written drag this replaces (about 300 lines of touch handling,
 * slop and velocity thresholds) is Base UI's job now.
 */

/**
 * Below this the panel is a bottom sheet; at or above it the same component is
 * a centred dialog. Matches Tailwind's `sm`.
 */
const SHEET_MAX_WIDTH = 639.98;

/**
 * Whether this is a phone-width viewport — the width at which the dialogs in
 * here stop being centred boxes and become bottom sheets.
 *
 * A media query rather than a user-agent test: what matters is the shape of
 * the window, not what kind of machine it belongs to. A desktop browser
 * dragged narrow gets the sheet, and gets to dismiss it the same way.
 */
export function useIsPhone(): boolean {
  const query = `(max-width: ${SHEET_MAX_WIDTH}px)`;
  const [phone, setPhone] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setPhone(mq.matches);
    mq.addEventListener("change", onChange);
    onChange();
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return phone;
}


/* ── The modal surface: Base UI, as Lovable uses it ───────────────────────── */

type SurfaceMode = "sheet" | "dialog";
const SurfaceContext = createContext<{ close: () => void; mode: SurfaceMode }>({
  close: () => {},
  mode: "dialog",
});

/**
 * Closes the surface this is rendered in — animating it out first, and only
 * then calling its `onClose`. A close button inside the surface uses this, not
 * the caller's `onClose`, or the panel is unmounted mid-frame and simply
 * vanishes.
 */
export const useSurfaceClose = () => useContext(SurfaceContext).close;

/**
 * The scrolling body of a surface. On a phone sheet it is Base UI's
 * `Drawer.Content`, which is what lets the list scroll normally and still hand
 * the gesture to the sheet when a finger pulls down from the top of it — the
 * part the hand-written drag here needed a page of touch handling to get right.
 */
export function SurfaceScroll({
  className = "",
  ref,
  children,
}: {
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  const { mode } = useContext(SurfaceContext);
  const cls = `min-h-0 flex-1 overflow-y-auto overscroll-contain ${className}`;
  return mode === "sheet" ? (
    <Drawer.Content ref={ref} className={cls}>
      {children}
    </Drawer.Content>
  ) : (
    <div ref={ref} className={cls}>
      {children}
    </div>
  );
}

/**
 * A layer over the page with one way in and several ways out.
 *
 * On a phone, when `sheet` is set, it is a Base UI Drawer: it comes up from the
 * bottom edge, follows a finger down, and a flick dismisses it at the speed of
 * the flick. Everywhere else it is a Base UI Dialog, centred, growing in from
 * 95% and fading back out. Backdrop, Escape, the close button and a swipe all
 * leave the same way — animated, and only then `onClose`.
 *
 * Mounted while open, like the panels it replaces: the caller renders it when
 * it should show and drops it in `onClose`. Open state is kept here so the
 * exit can finish before that happens.
 */
export function ModalSurface({
  open: openProp,
  onClose,
  onExited,
  label,
  sheet = false,
  dismissible = true,
  className = "",
  style,
  sheetHeight = "85dvh",
  sheetFixedHeight = false,
  zIndex = 50,
  testId = "sheet",
  children,
}: {
  /**
   * Controlled: stay mounted and follow this, so a close the parent makes
   * (an item picked in a menu) animates out instead of unmounting mid-frame.
   * Left out, the surface opens on mount and asks `onClose` once it has left.
   */
  open?: boolean;
  onClose: () => void;
  /** Called once a close has finished animating out. */
  onExited?: () => void;
  /** Accessible name. */
  label: string;
  /** A bottom sheet on a phone; a centred dialog above `sm` either way. */
  sheet?: boolean;
  /** False while something is in flight that must not be walked away from. */
  dismissible?: boolean;
  /** Classes for the panel itself (size, shape, fill). */
  className?: string;
  style?: CSSProperties;
  /** How tall the sheet may get, not counting its bleed below the screen. */
  sheetHeight?: string;
  /** Hold that height instead of growing to it — for panels whose content changes. */
  sheetFixedHeight?: boolean;
  zIndex?: number;
  testId?: string;
  children: ReactNode;
}) {
  const phone = useIsPhone();
  // Mounted closed and opened a frame later: Base UI plays the entrance only on
  // a change from closed to open — mounted already open, it just appears.
  const controlled = openProp !== undefined;
  const [innerOpen, setInnerOpen] = useState(false);
  // Controlled and mounted already open (the page sheet's first page) is the
  // same case: held closed for the first frame, or it appeared with no
  // entrance the first time and slid up only on later opens.
  const [mountedFrame, setMountedFrame] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setMountedFrame(true);
      if (!controlled) setInnerOpen(true);
    });
    return () => cancelAnimationFrame(raf);
  }, [controlled]);
  const open = controlled ? openProp && mountedFrame : innerOpen;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;
  const controlledRef = useRef(controlled);
  controlledRef.current = controlled;
  const close = useCallback(() => {
    if (!dismissibleRef.current) return;
    // Controlled: the parent owns open, and closing is asking it to.
    if (controlledRef.current) onCloseRef.current();
    else setInnerOpen(false);
  }, []);
  const onOpenChange = (next: boolean) => {
    if (!next) close();
  };
  // Android's back closes the sheet, not the screen behind it.
  useBackCloses(open, close);
  const onOpenChangeComplete = (next: boolean) => {
    if (next) return;
    if (!controlledRef.current) onCloseRef.current();
    onExited?.();
  };

  if (sheet && phone) {
    const height = `calc(${sheetHeight} + var(--bleed))`;
    return (
      <Drawer.Root open={open} onOpenChange={onOpenChange} onOpenChangeComplete={onOpenChangeComplete}>
        <Drawer.Portal>
          {/* forceRender: Base UI drops a nested drawer's backdrop — a tier
              list opened over the Plans sheet sat on the page undimmed. */}
          <Drawer.Backdrop
            forceRender
            className="mx-drawer-backdrop fixed inset-0 bg-black backdrop-blur-[3px]"
            style={{ zIndex }}
          />
          <Drawer.Viewport className="fixed inset-0 flex items-end justify-center" style={{ zIndex }}>
            <Drawer.Popup
              aria-label={label}
              data-testid={testId}
              className={`mx-drawer flex w-full min-h-0 flex-col overflow-hidden rounded-t-[20px] outline-none ${className}`}
              style={
                {
                  height: sheetFixedHeight ? height : undefined,
                  maxHeight: sheetFixedHeight ? undefined : height,
                  // The app's keyboard cap (index.css) keeps this one too.
                  "--sheet-max": height,
                  ...style,
                } as CSSProperties
              }
            >
              <div className="flex shrink-0 justify-center pt-2.5 pb-1">
                <div className="h-1 w-9 rounded-full bg-white/25" />
              </div>
              <SurfaceContext.Provider value={{ close, mode: "sheet" }}>
                {children}
              </SurfaceContext.Provider>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange} onOpenChangeComplete={onOpenChangeComplete}>
      <BaseDialog.Portal>
        {/* forceRender: Base UI drops a nested dialog's backdrop, and in the app
            most dialogs open over a page sheet (Plans & credits) — without it
            they floated over the page with nothing behind them dimmed. */}
        <BaseDialog.Backdrop
          forceRender
          className="mx-fade fixed inset-0 bg-black/60 backdrop-blur-[3px]"
          style={{ zIndex }}
        />
        <BaseDialog.Viewport
          className="fixed inset-0 grid place-items-center p-4 sm:p-6"
          style={{ zIndex }}
        >
          <BaseDialog.Popup
            aria-label={label}
            data-testid={testId}
            className={`mx-popup flex w-full min-h-0 flex-col outline-none ${className}`}
            style={style}
          >
            <SurfaceContext.Provider value={{ close, mode: "dialog" }}>
              {children}
            </SurfaceContext.Provider>
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

/** The close control every surface header uses: it animates the surface out. */
export function SurfaceCloseButton({ className = "" }: { className?: string }) {
  const t = useT();
  const { close, mode } = useContext(SurfaceContext);
  // A bottom sheet has its grab handle, a pull down and a tap outside.
  if (mode === "sheet") return null;
  return (
    <button
      type="button"
      onClick={close}
      aria-label={t.common.close}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-white/50 transition hover:bg-white/[0.06] hover:text-white ${className}`}
    >
      <X className="h-4 w-4" />
    </button>
  );
}

/**
 * A panel that comes up from the bottom on a phone and sits in the middle on a
 * desktop. One component for both because they are the same thing — a layer
 * with a title, a body that scrolls and an optional footer.
 */
export function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <ModalSurface
      onClose={onClose}
      label={title}
      sheet
      className="max-h-[80vh] overflow-hidden mx-ring max-sm:max-h-none sm:max-w-2xl sm:rounded-[16px]"
      style={{ background: SHELL_BG }}
    >
      <div className="flex shrink-0 items-center gap-3 px-4 pt-2 pb-3 sm:pt-4">
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-white">{title}</h2>
        <SurfaceCloseButton />
      </div>
      <SurfaceScroll>{children}</SurfaceScroll>
      {footer && (
        <div className="native-safe-bottom shrink-0 border-t border-line px-4 py-3">{footer}</div>
      )}
    </ModalSurface>
  );
}

/**
 * A menu that is a popover on a desktop and a sheet on a phone.
 *
 * Only the phone half lives here. Above `sm` the caller keeps rendering its
 * own popover, because the anchoring is the part that differs between them.
 * An item that closes the menu should call `useSurfaceClose()` so the sheet
 * slides away rather than vanishing.
 */
export function MenuSheet({
  open,
  onClose,
  label,
  surface,
  children,
}: {
  /** Controlled, so a picked item slides the sheet away (see ModalSurface). */
  open?: boolean;
  onClose: () => void;
  /** Accessible name; these menus have no visible title. */
  label: string;
  /** The panel fill, so it matches the popover it replaces. */
  surface: string;
  children: ReactNode;
}) {
  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      label={label}
      sheet
      zIndex={60}
      style={{ background: surface }}
    >
      {/* native-safe-bottom: the sheet reaches the bottom edge, which on a
          phone with three buttons is 48px of system nav bar. */}
      <SurfaceScroll className="native-safe-bottom px-1.5 pb-2">{children}</SurfaceScroll>
    </ModalSurface>
  );
}
