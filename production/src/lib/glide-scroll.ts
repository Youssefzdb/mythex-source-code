import { nativePlatform, isNative } from "./native";

/**
 * A short smooth scroll of `el` to `top`.
 *
 * In the iPhone app this is animated here, not by the browser. iOS keeps the
 * target of a native smooth scroll and goes back to it later, when the
 * scroller's content changes size: a sent prompt glided to the top (8983),
 * and minutes later, as the keyboard opened, the chat was put at its end
 * (9080) and iOS scrolled it back to 8983 by itself ~140ms on — no script
 * write, the ↓ showing, until the app was reopened (logged in the simulator,
 * twice, each time to that send's exact target). An animation of scrollTop
 * leaves iOS no target to go back to. Elsewhere the browser's own glide.
 *
 * The glide stops as soon as anything else moves the scroll (a finger, the
 * keyboard's own placing of the chat): it never fights another scroll.
 */
const running = new WeakMap<HTMLElement, number>();

export function glideScrollTo(el: HTMLElement, top: number): void {
  if (!(isNative() && nativePlatform() === "ios")) {
    el.scrollTo({ top, behavior: "smooth" });
    return;
  }
  const prev = running.get(el);
  if (prev) cancelAnimationFrame(prev);
  const from = el.scrollTop;
  const max = Math.max(0, el.scrollHeight - el.clientHeight);
  const to = Math.min(Math.max(0, top), max);
  if (Math.abs(to - from) < 1 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    el.scrollTop = to;
    running.delete(el);
    return;
  }
  const duration = 320;
  const start = performance.now();
  let last = from;
  const step = (now: number) => {
    // Moved by someone else since the last frame: theirs now.
    if (Math.abs(el.scrollTop - last) > 2) {
      running.delete(el);
      return;
    }
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.scrollTop = from + (to - from) * eased;
    last = el.scrollTop;
    if (t < 1) running.set(el, requestAnimationFrame(step));
    else running.delete(el);
  };
  running.set(el, requestAnimationFrame(step));
}
