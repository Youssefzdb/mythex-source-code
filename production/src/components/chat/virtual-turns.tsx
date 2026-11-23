import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { defaultRangeExtractor, measureElement, useVirtualizer } from "@tanstack/react-virtual";

/**
 * The chat's turns, only those near the screen on the page.
 *
 * Every turn ever loaded used to stay on the page. Measured in the iOS
 * simulator with a long chat (150 turns, each an agent run with its tool groups,
 * thoughts and screenshots): 70,000 elements and ~960MB in the web view, a
 * fold's height change cost 144ms of layout (a thought opened in two frames),
 * scrolling ran at 48ms a frame, and the composer took 3s to follow the
 * keyboard down. Cost grew with every page of older messages loaded.
 *
 * TanStack Virtual decides which turns are near (a few screens' worth) and
 * remembers each one's measured height; the rest are empty space of exactly
 * that height. Turns are kept in normal flow between spacers rather than
 * absolutely positioned, so a fold opening still pushes the turns under it in
 * the same frame: positioned rows are moved only after their size has been
 * measured, a frame late, and would overlap while a fold animates.
 *
 * Its scroll anchoring is left at the start: anchored to the end it also holds
 * a reader at the bottom while a reply streams in, and the chat lets a sent
 * prompt rise to the top and the reply fill in under it instead. Following the
 * tail and keeping one's place when older messages load stay with ChatPanel.
 */
export function VirtualTurns({
  scrollRef,
  turns,
  keepMounted,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Each turn's stable key (unchanged when older turns load above it) and content. */
  turns: Array<{ key: string; node: ReactNode; fill?: boolean }>;
  /**
   * Turns that stay on the page wherever the reader is: the newest (a reply
   * may be streaming into it, and the send glide measures it) and one being
   * edited (its composer has the focus).
   */
  keepMounted: number[];
}) {
  const listRef = useRef<HTMLDivElement>(null);
  // Where the list starts inside the scroller: under its top padding and the
  // "load earlier" row when there is one.
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const list = listRef.current;
    const box = scrollRef.current;
    if (!list || !box) return;
    const m = Math.round(list.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop);
    if (m !== scrollMargin) setScrollMargin(m);
  });
  /**
   * Turns measured at least once. A turn that has never been drawn is drawn —
   * wherever it is — until it has been: placed by a guess instead (600px for
   * turns of up to several thousand), it was corrected only as it scrolled into
   * view, and iOS holds such a correction back until a scroll ends so as not to
   * stop its momentum, so scrolling up jumped by the difference (measured: up to
   * 3,479px) and showed blank strips. Drawn once on arrival — the chat opening,
   * an older page loading — every height is real before anyone scrolls to it.
   */
  const measured = useRef(new Set<string>());
  const virtualizer = useVirtualizer({
    count: turns.length,
    getScrollElement: () => scrollRef.current,
    // A turn is anything from a line to several screens; this only places
    // turns never yet drawn, and each is corrected as it is measured.
    estimateSize: () => 600,
    getItemKey: (i) => turns[i].key,
    // Two screens or so either side: drawn before they can be scrolled to.
    overscan: 3,
    // space-y-5 between turns.
    gap: 20,
    scrollMargin,
    rangeExtractor: (range) => {
      const out = new Set(defaultRangeExtractor(range));
      for (const i of keepMounted) if (i >= 0 && i < turns.length) out.add(i);
      for (let i = 0; i < turns.length; i++) if (!measured.current.has(turns[i].key)) out.add(i);
      return [...out].sort((a, b) => a - b);
    },
    measureElement: (el, entry, instance) => {
      const size = measureElement(el, entry, instance);
      const turn = turns[Number(el.getAttribute("data-index"))];
      if (turn) measured.current.add(turn.key);
      return size;
    },
  });
  // A new width wraps every turn differently: measure them all again.
  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    let width = box.clientWidth;
    const ro = new ResizeObserver(() => {
      if (box.clientWidth === width) return;
      width = box.clientWidth;
      measured.current.clear();
      virtualizer.measure();
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [scrollRef, virtualizer]);

  const items = virtualizer.getVirtualItems();
  const rows: ReactNode[] = [];
  let cursor = scrollMargin;
  for (const item of items) {
    const before = item.start - cursor;
    if (before > 0) rows.push(<div key={`gap-${item.key}`} aria-hidden style={{ height: before }} />);
    const turn = turns[item.index];
    rows.push(
      <div
        key={item.key}
        data-index={item.index}
        ref={virtualizer.measureElement}
        data-chat-turn
        className="group/turn relative"
        // The newest turn always holds a screen, whether it was just sent or
        // the chat was opened on it: opening scrolls to the bottom, which with
        // this is its prompt at the top — as ChatGPT's and Lovable's do.
        style={turn.fill ? { minHeight: "var(--turn-fill)" } : undefined}
      >
        {turn.node}
      </div>,
    );
    cursor = item.end;
  }
  const after = virtualizer.getTotalSize() + scrollMargin - cursor;
  if (after > 0) rows.push(<div key="gap-end" aria-hidden style={{ height: after }} />);
  return (
    <div ref={listRef} className="flow-root">
      {rows}
    </div>
  );
}
