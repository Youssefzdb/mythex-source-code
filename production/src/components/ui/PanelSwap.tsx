/**
 * Panels that change what they are showing, without jumping.
 *
 * A popover that swaps its contents does two jarring things at once: the new
 * content appears instantly where the old was, and the panel snaps to a new
 * height under the pointer. Both are avoidable, and the fix is the same in
 * every case — measure the thing that is showing, animate the box to that
 * height, and let the content arrive rather than cut.
 *
 * Two shapes, because panels change for two different reasons:
 *
 *   PanelSteps  — you went somewhere. A list to a form and back: the steps
 *                 travel sideways, and the direction says which way.
 *   PanelSwap   — the same place, in a new state. Loading to loaded, form to
 *                 result: it fades up — or, given the states' order, slides
 *                 in from the side it is heading toward, the way the share
 *                 panel's steps do.
 *
 * Both respect `prefers-reduced-motion`, where they become instant.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

/** Long enough to read as movement, short enough not to be in the way. */
export const PANEL_MOTION_MS = 220;

/**
 * The height of whatever is currently showing.
 *
 * Kept live with a ResizeObserver rather than measured once: the content of a
 * step changes under it — a link is added, an error appears, a skeleton gives
 * way to a list — and a box frozen at the first measurement clips all of it.
 */
function useMeasuredHeight(
  ref: RefObject<HTMLElement | null>,
  deps: unknown[],
): number | undefined {
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ...deps]);
  return height;
}

/**
 * A clipping box that cannot be scrolled.
 *
 * Clipping a track wider than the panel makes the box scrollable whether or not
 * anyone wants it to be, and focusing a field inside it makes the browser
 * scroll it into view — which lands on top of the transform and pushes every
 * step off-screen. Pinning it back to zero is what keeps that from happening
 * again when someone adds a field, uses find-in-page, or triggers autofill.
 */
function usePinnedScroll(ref: RefObject<HTMLElement | null>, deps: unknown[]): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pin = () => {
      if (el.scrollLeft !== 0) el.scrollLeft = 0;
      if (el.scrollTop !== 0) el.scrollTop = 0;
    };
    pin();
    el.addEventListener("scroll", pin);
    return () => el.removeEventListener("scroll", pin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ...deps]);
}

/**
 * Two steps of one panel, side by side, showing the one at `index`.
 *
 * Exactly two because that is what a popover this size can carry — a list and
 * the one form it opens. A third step would want a stack and a back history,
 * which is a different component and a different problem.
 */
export function PanelSteps({
  index,
  steps,
  label,
}: {
  index: 0 | 1;
  steps: [ReactNode, ReactNode];
  /** Optional test id for the clipping box. */
  label?: string;
}) {
  const clipRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLDivElement>(null);
  const secondRef = useRef<HTMLDivElement>(null);
  const height = useMeasuredHeight(index === 0 ? firstRef : secondRef, [index]);
  usePinnedScroll(clipRef, [index]);

  return (
    <div
      ref={clipRef}
      data-testid={label}
      className="overflow-hidden transition-[height] ease-out motion-reduce:transition-none"
      style={{ height, transitionDuration: `${PANEL_MOTION_MS}ms` }}
    >
      <div
        // The second step sits after the first — on its left when the page
        // reads right to left — so the track moves the other way there.
        className={`flex w-[200%] transition-transform ease-out motion-reduce:transition-none ${
          index === 1 ? "-translate-x-1/2 rtl:translate-x-1/2" : "translate-x-0"
        }`}
        style={{ transitionDuration: `${PANEL_MOTION_MS}ms` }}
      >
        {/* `inert` on the step that is off-screen: without it Tab walks into a
            form nobody can see, and a screen reader reads both steps as one
            muddled page. */}
        <div ref={firstRef} className="w-1/2 shrink-0 self-start" inert={index !== 0}>
          {steps[0]}
        </div>
        <div ref={secondRef} className="w-1/2 shrink-0 self-start" inert={index !== 1}>
          {steps[1]}
        </div>
      </div>
    </div>
  );
}

/**
 * One panel whose state changed underneath it.
 *
 * The new content fades up rather than crossfading with the old. A crossfade
 * needs both states rendered at once, which for these panels means two live
 * subscriptions, two spinners and two copies of whatever the state was about —
 * a lot of machinery to blur one frame that nobody is looking at yet. What the
 * eye actually wants is for the height not to snap and for the words not to
 * appear mid-blink.
 *
 * `stateKey` is what counts as a change. Give it the name of the state, not a
 * value that ticks — a key that changes on every poll fades the panel forever.
 */
export function PanelSwap({
  stateKey,
  children,
  className,
  order,
}: {
  stateKey: string;
  children: ReactNode;
  className?: string;
  /**
   * The states in the order a person moves through them. Given, a change
   * slides in from the right when it moves forward along it and from the left
   * when it moves back; without it the new state fades up in place.
   */
  order?: readonly string[];
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const height = useMeasuredHeight(contentRef, [stateKey]);
  /** Where the entering state starts from: 0 in place, 1 from the right, -1 from the left. */
  const [entering, setEntering] = useState<0 | 1 | -1 | null>(null);
  const firstRender = useRef(true);
  const previousKey = useRef(stateKey);

  useLayoutEffect(() => {
    // The panel has its own entry animation; a fade on top of it reads as a
    // flicker, so the first state shown is simply shown.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const from = order ? order.indexOf(previousKey.current) : -1;
    const to = order ? order.indexOf(stateKey) : -1;
    previousKey.current = stateKey;
    setEntering(from >= 0 && to >= 0 && from !== to ? (to > from ? 1 : -1) : 0);
    // The start position is jumped to, painted, and only then animated away
    // from: one frame is not enough for the browser to have drawn it, and a
    // transition toward the start position is barely visible.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setEntering(null));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey]);

  // Forward comes in from the end side: the right, or the left right to left.
  const ahead = typeof document !== "undefined" && document.documentElement.dir === "rtl" ? -24 : 24;
  const offset =
    entering === 1
      ? `translateX(${ahead}px)`
      : entering === -1
        ? `translateX(${-ahead}px)`
        : entering === 0
          ? "translateY(4px)"
          : "none";

  return (
    <div
      className="overflow-hidden transition-[height] ease-out motion-reduce:transition-none"
      style={{ height, transitionDuration: `${PANEL_MOTION_MS}ms` }}
    >
      <div
        ref={contentRef}
        className={`transition-[opacity,transform] ease-out motion-reduce:transition-none ${className ?? ""}`}
        style={{
          opacity: entering === null ? 1 : 0,
          transform: offset,
          transitionDuration: entering === null ? `${PANEL_MOTION_MS}ms` : "0ms",
        }}
      >
        {children}
      </div>
    </div>
  );
}
