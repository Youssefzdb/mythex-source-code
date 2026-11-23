import { cloneElement, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactElement, type ReactNode, type RefObject } from "react";
import { MenuSheet, useIsPhone } from "./Sheet";
import { CARD_BG } from "../../lib/surfaces";
import { Popover as BasePopover } from "@base-ui/react/popover";

/**
 * Closes an open popover when a click lands in an iframe — the app preview.
 *
 * Base UI listens for presses on the document, and a cross-origin iframe
 * swallows them: clicking into the preview left every menu open (measured —
 * no change event at all). What does reach this window is that it loses focus
 * to the iframe, so that is the signal. It is what the full-screen backdrops
 * these popovers used to carry were for, without a layer over the page.
 */
function useCloseOnIframeFocus(open: boolean | undefined, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const onBlur = () => {
      // The new focus owner is only settled after the blur has run.
      window.setTimeout(() => {
        if (document.activeElement instanceof HTMLIFrameElement) closeRef.current();
      }, 0);
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [open]);
}

/**
 * A panel anchored to the button that opens it — menus, pickers, the
 * workspace switcher. Base UI underneath, as Lovable builds them.
 *
 * What that buys over the hand-placed `absolute top-full` panels it replaces:
 * the panel grows out of the button itself (Base UI puts the anchor point in
 * `--transform-origin`, which `.mx-popup` scales from), so a menu under a
 * button drops from it and one above the composer rises from it, rather than
 * every menu making the same 9px upward slide wherever it was. It also leaves:
 * closing fades and shrinks back into the button in 100ms, where these used to
 * vanish. And it flips to the other side, and stays on screen, near an edge.
 *
 * The trigger is the caller's own button, passed as an element; it must not
 * toggle `open` itself — Base UI does, and two toggles cancel out.
 */
export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  side = "bottom",
  align = "start",
  sideOffset = 6,
  className = "",
  style,
  testId,
  label,
  zIndex = 100,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The button that opens it. */
  trigger: ReactElement;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  /** Classes for the panel (size, fill, shape). */
  className?: string;
  style?: CSSProperties;
  testId?: string;
  /** Accessible name, when the panel has no visible title. */
  label?: string;
  /** Raise it over a modal it opens from (the upgrade modal is 110). */
  zIndex?: number;
}) {
  useCloseOnIframeFocus(open, () => onOpenChange?.(false));
  return (
    <BasePopover.Root open={open} onOpenChange={(next) => onOpenChange?.(next)}>
      <BasePopover.Trigger render={trigger} />
      <BasePopover.Portal>
        <BasePopover.Positioner
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={8}
          className="outline-none"
          style={{ zIndex }}
        >
          <BasePopover.Popup
            aria-label={label}
            data-testid={testId}
            className={`mx-popup mx-popover outline-none ${className}`}
            style={style}
          >
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}

/** A point or box on screen to hang a panel from, with no element there. */
export type VirtualAnchor = { getBoundingClientRect: () => DOMRect };

/**
 * The same panel, anchored to a button rendered somewhere else — the
 * composer's menus, whose buttons live in the prompt bar while the menus are
 * their own components. The caller toggles `open` from its button; a press on
 * that button is therefore not an outside press, or the menu would close on
 * mousedown and the click would open it straight back.
 */
export function AnchoredPopover({
  open,
  onClose,
  anchorRef,
  ignoreOutside,
  onEscape,
  children,
  side = "bottom",
  align = "start",
  sideOffset = 6,
  className = "",
  style,
  role,
  label,
  testId,
  hoverCard = false,
  onMouseEnter,
  onMouseLeave,
}: {
  open: boolean;
  onClose: () => void;
  /** The element to hang from — or a function, when that depends on which
   *  control is on screen, or returns a bare rectangle (a right-click point). */
  anchorRef: RefObject<HTMLElement | null> | (() => HTMLElement | VirtualAnchor | null);
  /** More elements whose presses should not count as outside. */
  ignoreOutside?: (target: Element) => boolean;
  /** Escape, first: return true to keep the panel open (a step back, say). */
  onEscape?: () => boolean;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  className?: string;
  style?: CSSProperties;
  role?: string;
  label?: string;
  testId?: string;
  /** Opened by hovering, not by a click: focus stays where it is, both ways —
   *  pointing at a button must not pull the caret out of the composer. */
  hoverCard?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  useCloseOnIframeFocus(open, () => {
    if (!ignoreOutside?.(document.body)) onClose();
  });
  return (
    <BasePopover.Root
      open={open}
      onOpenChange={(next, details) => {
        if (next) return;
        if (details.reason === "escape-key" && onEscape?.()) {
          details.cancel();
          return;
        }
        const anchor = typeof anchorRef === "function" ? anchorRef() : anchorRef.current;
        const target = details.event?.target;
        if (details.reason === "outside-press" && target instanceof Element) {
          if (anchor instanceof Element && anchor.contains(target)) return;
          if (ignoreOutside?.(target)) return;
        }
        // Focus leaving for the caller's own button is that same press: a panel
        // with a focused field (Publish's Site URL) closed on it here, and the
        // click then opened it straight back — so its button could not close it.
        const to = (details.event as FocusEvent | undefined)?.relatedTarget;
        if (details.reason === "focus-out" && to instanceof Element && anchor instanceof Element && anchor.contains(to)) {
          return;
        }
        onClose();
      }}
    >
      <BasePopover.Portal>
        <BasePopover.Positioner
          anchor={anchorRef}
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={8}
          className="z-[100] outline-none"
        >
          <BasePopover.Popup
            initialFocus={hoverCard ? false : undefined}
            finalFocus={hoverCard ? false : undefined}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            role={role}
            aria-label={label}
            data-testid={testId}
            className={`mx-popup mx-popover outline-none ${className}`}
            style={style}
          >
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}

/**
 * A menu that is a popover on a desktop and a sheet on a phone, for the "…"
 * menus. Anchored on a phone, they opened as small desktop lists beside their
 * button — the Recents "…" in the drawer, a project's and a domain's options —
 * unlike every other menu in the app, which comes up from the bottom.
 *
 * On a phone the trigger's own click opens it (chained, not wrapped: some of
 * these buttons stop their click from reaching the row they sit in).
 */
export function MenuPopover(props: Parameters<typeof Popover>[0]) {
  const isPhone = useIsPhone();
  const [own, setOwn] = useState(false);
  const open = props.open ?? own;
  const setOpen = (next: boolean) => {
    if (props.open === undefined) setOwn(next);
    props.onOpenChange?.(next);
  };
  if (!isPhone) return <Popover {...props} />;
  const trigger = props.trigger as ReactElement<{ onClick?: (e: MouseEvent) => void }>;
  return (
    <>
      {cloneElement(trigger, {
        onClick: (e: MouseEvent) => {
          trigger.props.onClick?.(e);
          setOpen(true);
        },
      })}
      <MenuSheet
        open={open}
        onClose={() => setOpen(false)}
        label={props.label ?? ""}
        surface={(props.style?.background as string | undefined) ?? CARD_BG}
      >
        {props.children}
      </MenuSheet>
    </>
  );
}
