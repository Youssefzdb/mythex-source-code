import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { CONTROL_BG, FG_TERTIARY } from "../lib/surfaces";
import { fill, useT, type AppMessages } from "../i18n/app";

/**
 * Something to read while the preview is empty.
 *
 * A sandbox takes a few seconds to come up and a first build takes longer, and
 * for that whole time the biggest panel on screen has nothing in it. Spending
 * it on things the product can do is worth more than a spinner: this is the
 * moment someone is most likely to discover a feature, because they are
 * already looking and have nothing else to do.
 *
 * It carries a pause button because a carousel that cannot be stopped is a
 * carousel that fights anyone reading slowly.
 */

type Tip = { title: string; body: string };

/** Real capabilities, phrased as the thing you would actually ask for. */
function tipsFor(t: AppMessages): readonly Tip[] {
  return t.workspace.previewTips.tips;
}

const ROTATE_MS = 6_000;

export function PreviewTips({ className = "" }: { className?: string }) {
  const t = useT();
  const TIPS = tipsFor(t);
  const [index, setIndex] = useState(() => Math.floor(Math.random() * TIPS.length));
  const [paused, setPaused] = useState(false);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = Boolean(
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    );
    // Someone who asked for less motion gets one tip and no rotation.
    if (reduced.current) setPaused(true);
  }, []);

  const count = TIPS.length;
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => setIndex((n) => (n + 1) % count), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [paused, count]);

  const tip = TIPS[index] ?? TIPS[0];

  return (
    <div className={`w-full max-w-[26rem] text-center ${className}`} data-testid="preview-tips">
      {/* Fixed height for two lines of body: without it the dots hop up and
          down as tips of different lengths come round. */}
      <div className="min-h-[3.75rem]">
        <p className="text-[13px] leading-5 font-medium text-white">{tip.title}</p>
        <p className="mt-0.5 text-[13px] leading-5" style={{ color: FG_TERTIARY }}>
          {tip.body}
        </p>
      </div>

      <div className="mt-3 flex items-center justify-center gap-2">
        <span className="flex items-center gap-1.5">
          {TIPS.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={fill(t.workspace.previewTips.tipOf, { n: i + 1, total: TIPS.length })}
              aria-current={i === index}
              onClick={() => {
                setIndex(i);
                setPaused(true);
              }}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                // The current one stretches into a pill rather than merely
                // brightening, so position is readable at a glance.
                width: i === index ? 14 : 6,
                background: i === index ? "rgba(255,255,255,0.55)" : CONTROL_BG,
              }}
            />
          ))}
        </span>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? t.workspace.previewTips.play : t.workspace.previewTips.pause}
          data-testid="preview-tips-toggle"
          className="grid size-5 place-items-center rounded-[5px] text-white/40 transition hover:bg-white/[0.06] hover:text-white/70"
        >
          {paused ? <Play className="size-3" /> : <Pause className="size-3" />}
        </button>
      </div>
    </div>
  );
}
