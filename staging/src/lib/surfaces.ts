/**
 * The surface and control tokens the app chrome is built from.
 *
 * Three stacked surfaces, each a step lighter than the one beneath: the shell
 * a nav sits on, the rounded panel that holds the content, and the cards
 * inside it. Depth comes from those steps and from a ring on each raised
 * edge — not from dividing lines, which is why almost nothing here has a
 * border.
 *
 * These live in one place because the same ladder is meant to hold on every
 * chrome surface — the connectors modal, settings, billing — so a panel looks
 * the same wherever it appears.
 */

/** Behind the nav rail; the darkest step. */
export const SHELL_BG = "oklch(0.23 0.002 107)";
/** The rounded panel that holds the content, inset on the shell. */
export const PANEL_BG = "oklch(0.2474 0.002 107)";
/** A card inside the panel. */
export const CARD_BG = "oklch(0.272 0.002 107)";
/** The hairline around the content panel — the one line in the system. */
export const PANEL_BORDER = "var(--mx-line)";

/** Fill for a control or an icon tile: a translucent lift, not a colour. */
export const CONTROL_BG = "oklch(0.5674 0.009 106.68 / 0.16)";
export const CONTROL_BG_HOVER = "oklch(0.5674 0.009 106.68 / 0.24)";

/* ── Text ────────────────────────────────────────────────────────────────── */

/** Primary copy, and the label of whatever is selected. */
export const FG = "oklch(1 0 0)";
/** Ordinary body and nav text. Near-white, not a dimmed white. */
export const FG_SECONDARY = "oklch(0.9095 0.002 107)";
/** Section labels, counts, supporting lines. */
export const FG_TERTIARY = "oklch(0.7234 0.002 107)";

/* ── Edges ───────────────────────────────────────────────────────────────── */

/**
 * The edge on a raised surface.
 *
 * `highlight` is the hairline's colour. It is a warm grey by default; a card
 * nested inside another surface takes white instead, which is what makes the
 * inner panel read as lifted rather than merely a different fill.
 *
 * Not a border — a stack of rings. A warm hairline, then the surface's own
 * colour covering its inner half so it reads as half a pixel, then a dark ring
 * outside and a short drop. That is what gives a card a lit top edge and a
 * shadowed bottom one instead of a flat outline.
 */
export function surfaceRing(surface: string, strength = 0.4, highlight = "119,119,113"): string {
  return [
    `rgba(${highlight},${strength}) 0 0 0 0.5px`,
    `${surface} 0 0 0 0.5px`,
    `rgba(0,0,0,${strength * 0.4}) 0 0 0 1px`,
    `rgba(0,0,0,${strength * 0.2}) 0 1.5px 0 0`,
    `rgba(0,0,0,${strength * 0.2}) 0 1.5px 1px -0.5px`,
  ].join(", ");
}

/**
 * The edge on something that floats: a dialog, a popover, a menu.
 *
 * `surfaceRing` puts a dark ring outside the hairline, which is what gives a
 * card its weight when it sits *on* another surface. A floating panel is
 * already separated from the page by its drop shadow, so that ring has nothing
 * to do but draw a black outline around the panel — visible against any dark
 * backdrop, and the reason the publish popover looked like it had a border.
 *
 * Pass the panel's own background: the second layer covers the inner half of
 * the hairline so it reads as half a pixel, and covering it with the wrong
 * colour leaves a bright seam.
 */
export function floatingRing(surface: string, strength = 0.45, highlight = "119,119,113"): string {
  return [
    `rgba(${highlight},${strength}) 0 0 0 0.5px`,
    `${surface} 0 0 0 0.5px`,
    "rgba(0,0,0,0.75) 0 24px 80px -24px",
  ].join(", ");
}

/* ── Buttons ─────────────────────────────────────────────────────────────── */

/**
 * One chassis, three heights, two fills — and no loud primary. Even "Upgrade
 * plan" is the same muted fill as a dismiss button; emphasis comes from
 * placement and copy rather than from a bright pill.
 */
export type BtnSize = "sm" | "md" | "lg";
export type BtnVariant = "filled" | "ghost";

const SIZES: Record<BtnSize, string> = {
  sm: "h-6 rounded-[6px] px-2 text-[12px]",
  md: "h-7 rounded-[8px] px-[9px] text-[14px]",
  lg: "h-8 rounded-[8px] px-2.5 text-[14px]",
};

/**
 * Classes for a control. The look lives in `.btn-surface` / `.btn-surface-ghost`
 * in index.css, because the recipe is a stack of insets and a hover state that
 * inline styles cannot express. Weight stays normal at every size — the design
 * never bolds a button label.
 */
export function btnClass(size: BtnSize = "md", variant: BtnVariant = "filled"): string {
  return [
    "inline-flex shrink-0 items-center justify-center gap-1.5 font-normal text-white",
    "disabled:cursor-not-allowed disabled:opacity-50",
    SIZES[size],
    variant === "filled" ? "btn-surface" : "btn-surface-ghost",
  ].join(" ");
}

/**
 * The white primary, dimmed rather than recoloured when it is disabled.
 *
 * `.btn-primary` alone turns into a muted fill when disabled — right where a
 * button stands alone on a page, wrong on a card or a form where it spends its
 * first moments disabled and would appear to change into a different control
 * as you type. Same chassis and sizes as `btnClass`, so the two sit together.
 */
export function whiteBtnClass(size: BtnSize = "md"): string {
  return [
    "inline-flex shrink-0 items-center justify-center gap-1.5",
    "btn-primary !font-normal transition-opacity",
    "disabled:!border-0 disabled:!bg-white disabled:!text-zinc-900 disabled:!opacity-50",
    WHITE_SIZES[size],
  ].join(" ");
}

/** `!` throughout: `.btn-primary` brings its own height and padding. */
const WHITE_SIZES: Record<BtnSize, string> = {
  sm: "!h-6 !rounded-[6px] !px-2 !text-[12px]",
  md: "!h-7 !rounded-[8px] !px-[9px] !text-[14px]",
  lg: "!h-8 !rounded-[8px] !px-2.5 !text-[14px]",
};

/** A text field, pressed into the surface rather than raised out of it. */
export const FIELD_CLASS =
  "field-surface h-8 w-full rounded-[8px] px-3 text-[14px] text-white " +
  "placeholder:text-[oklch(0.7234_0.002_107)] outline-none";
