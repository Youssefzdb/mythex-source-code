import type { CSSProperties } from "react";

/**
 * Mythex brand mark — rose plate + white script M (same art as favicon).
 * Prefers crisp SVG; `mono` uses the transparent glyph for muted watermarks.
 */
export function MythexMark({
  className,
  style,
  size = 24,
  mono = false,
}: {
  className?: string;
  style?: CSSProperties;
  size?: number;
  /** When true, renders as a muted monochrome silhouette via CSS filter. */
  mono?: boolean;
}) {
  return (
    <img
      src={mono ? "/mark.svg" : "/logo.svg"}
      alt="Mythex"
      width={size}
      height={size}
      className={className}
      style={{
        flexShrink: 0,
        display: "block",
        width: size,
        height: size,
        objectFit: "contain",
        borderRadius: mono ? undefined : Math.max(4, Math.round(size * 0.22)),
        ...(mono ? { filter: "grayscale(1) brightness(2) opacity(0.35)" } : null),
        ...style,
      }}
      draggable={false}
    />
  );
}
