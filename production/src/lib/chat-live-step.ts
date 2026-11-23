import { useEffect, useState } from "react";

/**
 * What the chat says the agent is doing right now, word for word.
 *
 * The chat already shows it: the one shimmering line of the running turn —
 * "Planning next moves", "Thinking", "Editing src/App.tsx", "Running npm run
 * build". Every one of those is drawn with `.thinking-shimmer` (turn.tsx's
 * status line, thinking.tsx, ToolRow and the todo card in tool-cards.tsx), and
 * nothing finished is. So the newest shimmering line in the transcript is the
 * live step, and reading it keeps the preview's pill and the chat saying the
 * same thing without a second copy of every label's rules.
 *
 * On a phone the chat stays mounted beside the preview (the pane rail), so the
 * line is there to read while the preview is on screen.
 */
export function useChatLiveStep(active: boolean): string | null {
  const [step, setStep] = useState<string | null>(null);
  useEffect(() => {
    if (!active) {
      setStep(null);
      return;
    }
    let frame = 0;
    const read = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const lines = document.querySelectorAll<HTMLElement>(".ws-transcript .thinking-shimmer");
        const last = lines[lines.length - 1];
        const text = last ? spokenText(last) : null;
        setStep((prev) => (prev === text ? prev : text));
      });
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class"] });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [active]);
  return step;
}

/**
 * A line's words, with a space wherever the chat separates two pieces.
 *
 * A tool row is its verb and its subject in separate elements, set apart by a
 * margin rather than a space ("Checking" + "Dates editable…"), so textContent
 * ran them together: "CheckingDates editable…". Each text node is a piece.
 */
function spokenText(el: HTMLElement): string | null {
  const parts: string[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const piece = n.textContent?.replace(/\s+/g, " ").trim();
    if (piece) parts.push(piece);
  }
  return parts.join(" ").replace(/\s+([….,:;!?])/g, "$1") || null;
}
