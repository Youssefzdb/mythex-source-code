import type { SVGProps } from "react";

/**
 * The nav drawer's mark.
 *
 * Three rules with the last one short, rather than the even three of a
 * hamburger. The uneven stack reads as the top of a list — which is what the
 * drawer holds — and gives the glyph a direction, so it sits left in a control
 * the way an arrow would. Everything else about it matches the icon set it
 * stands next to: 24-unit box, 2-unit round caps, `currentColor`.
 */
export function DrawerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="13" y2="17" />
    </svg>
  );
}
