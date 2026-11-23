import { useEffect, type RefObject } from "react";

/**
 * Marks a scroller with which of its edges have content past them, for
 * `.mx-scroll-fade` to fade (index.css): `data-fade-top` once something has
 * scrolled under the top, `data-fade-bottom` while there is more below. The
 * same fade the chat transcript has, for any list that scrolls under fixed
 * chrome — without dimming the first or last row of a list that fits.
 */
export function useScrollFade(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      el.toggleAttribute("data-fade-top", el.scrollTop > 1);
      el.toggleAttribute("data-fade-bottom", el.scrollTop + el.clientHeight < el.scrollHeight - 1);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    // The content changes height too: Recents loading, "Show more".
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    const mo = new MutationObserver(() => {
      for (const child of Array.from(el.children)) ro.observe(child);
      update();
    });
    mo.observe(el, { childList: true });
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
      mo.disconnect();
    };
  }, [ref]);
}
