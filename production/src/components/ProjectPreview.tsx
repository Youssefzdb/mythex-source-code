import { useState } from "react";
import { MythexMark } from "./mythex-mark";

/**
 * Project card thumbnail. Always a static image of last preview work (or a
 * placeholder) — never a live iframe. Publish is not required.
 */
export function ProjectPreview({
  thumbnailUrl,
  name,
}: {
  thumbnailUrl: string | null | undefined;
  name: string;
}) {
  if (!thumbnailUrl) {
    return (
      <div
        className="grid aspect-[16/10] place-items-center rounded-[12px] border border-line"
        style={{ background: "#1c1c1c" }}
      >
        <MythexMark size={40} mono className="text-white/[0.12]" />
      </div>
    );
  }

  return (
    <div className="relative aspect-[16/10] overflow-hidden rounded-[12px] border border-line bg-[#1c1c1c]">
      <img
        src={thumbnailUrl}
        alt={`${name} preview`}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover object-top"
      />
    </div>
  );
}

/**
 * The same picture, small, for a row in a list (usage, a member's projects):
 * the preview if there is one and it loads, else the faint Mythex mark.
 */
export function ProjectThumb({ thumbnailUrl, className = "h-9 w-14" }: { thumbnailUrl: string | null | undefined; className?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-[8px] border border-line ${className}`}
      style={{ background: "#1c1c1c" }}
      aria-hidden
    >
      {thumbnailUrl && !broken ? (
        <img
          src={thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
      ) : (
        <MythexMark size={16} mono className="text-white/[0.12]" />
      )}
    </span>
  );
}
