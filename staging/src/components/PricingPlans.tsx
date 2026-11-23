import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, CreditCard, Gift, Globe, Users } from "lucide-react";
import { Spinner } from "./ui";
import { Popover } from "./ui/Popover";
import { useScrollFade } from "./ui/useScrollFade";
import { CARD_BG, PANEL_BG, SHELL_BG } from "../lib/surfaces";
import { appT, fill, formatNumber, pl, type AppMessages } from "../i18n/app";
import { usePageT } from "../i18n/usePageT";
import { appEn } from "../i18n/app/en";
/** Shared pricing surfaces (landing + /billing plan cards). */
export const PRICING = {
  card: CARD_BG,
  /** Checklist / column shell — same as billing sidebar drawer. */
  drawer: SHELL_BG,
  /** Surface behind plan cards on /billing (and landing pricing grid). */
  panel: PANEL_BG,
  border: "var(--mx-line)",
  special: "oklch(58.99% 0.2523 294.88)",
  specialFg: "oklch(76.61% 0.1614 294.88)",
  successBg: "hsl(102 84% 11.7%)",
  successFg: "hsl(104.5 43.6% 54.7%)",
  desc: "oklch(72.34% 0.002 107)",
  fg: "oklch(100% 0 0)",
  switchTrack: "color-mix(in oklch, oklch(56.74% 0.009 106.68), transparent 96%)",
  bgTranslucent: "oklch(56.74% 0.009 106.68 / 0.16)",
  shadowSwitch:
    "inset 0px 2px 2px -1px #00000014, inset 0px 4px 4px -2px #00000014, inset 0px 0px 0px 0.5px #ffffff29",
  shadowNeutral:
    "inset 0px 0.5px 0px 0px #ffffff29, inset 0px -0.5px 0px 0px #ffffff0a, inset 0px 0px 0px 0.5px #ffffff29, 0px 2px 2px -1px #0000001f, 0px 4px 4px -2px #0000001f",
  shadowSpecial:
    "inset 0px 0.5px 0px 0px #ffffff29, inset 0px -0.5px 0px 0px #ffffff14, inset 0px 0px 0px 0.5px #ffffff52, 0px 2px 2px -1px #2b164d3d, 0px 4px 4px -2px #2b164d3d",
} as const;

/**
 * The Pro card's "Free custom domain" pill. Hidden for now; flip back to show
 * it (and the row it sits in) on every pricing surface.
 */
const SHOW_HIGHLIGHT_BADGE = false;

/** Display constants — keep in sync with apps/api/src/lib/plans.ts (including PRO_TRIAL_DAYS). */
export const PRO_MONTHLY_PRICE = 25;
/** $250 a year over 12 months — to the cent, as Stripe shows it. */
export const PRO_YEARLY_PER_MONTH = 20.83;
export const PRO_COMPARE_AT_MONTHLY = 36;
export const PRO_SALE_PERCENT = 30;
/** "30% off" in the current language. */
export function proSaleBadge(t: AppMessages = appT()): string {
  return fill(t.billing.percentOff, { n: formatNumber(PRO_SALE_PERCENT) });
}
/** $21 vs $36 list — deeper than the monthly 30% sale. */
export const PRO_YEARLY_SALE_PERCENT = Math.round(
  ((PRO_COMPARE_AT_MONTHLY - PRO_YEARLY_PER_MONTH) / PRO_COMPARE_AT_MONTHLY) * 100,
);
export function proYearlySaleBadge(t: AppMessages = appT()): string {
  return fill(t.billing.percentOff, { n: formatNumber(PRO_YEARLY_SALE_PERCENT) });
}
/** Match apps/api/src/lib/plans.ts. 0 = trial offer off. */
export const PRO_TRIAL_DAYS = 0;
/** Sale CTA while the 30% off campaign is on. */
export function proSaleCta(t: AppMessages = appT()): string {
  return t.billing.plans.claimOffer;
}
export function proTrialCta(t: AppMessages = appT()): string {
  return PRO_TRIAL_DAYS > 0 ? pl(t.billing.plans.startTrial, PRO_TRIAL_DAYS) : proSaleCta(t);
}
/** Sidebar upsell title — always leads with “Start”. */
export function proSidebarHeadline(t: AppMessages = appT()): string {
  return PRO_TRIAL_DAYS > 0 ? pl(t.billing.plans.startTrial, PRO_TRIAL_DAYS) : t.billing.plans.startWithPro;
}
export function proTrialSubtext(t: AppMessages = appT()): string {
  const p = t.billing.plans;
  return PRO_TRIAL_DAYS > 0
    ? fill(p.thenPerMonth, { price: PRO_MONTHLY_PRICE })
    : fill(p.insteadOf, { price: PRO_MONTHLY_PRICE, compare: PRO_COMPARE_AT_MONTHLY });
}
export function proYearlySubtext(t: AppMessages = appT()): string {
  const p = t.billing.plans;
  return fill(PRO_TRIAL_DAYS > 0 ? p.thenInsteadOf : p.insteadOf, {
    price: PRO_YEARLY_PER_MONTH,
    compare: PRO_COMPARE_AT_MONTHLY,
  });
}

/*
 * The same text frozen in English, kept for callers that haven't moved to the
 * functions above yet. A constant is read at import time, so it can't follow
 * the language — prefer proTrialCta() and friends.
 */
/** @deprecated English only — use proSaleBadge(). */
export const PRO_SALE_BADGE = proSaleBadge(appEn);
/** @deprecated English only — use proYearlySaleBadge(). */
export const PRO_YEARLY_SALE_BADGE = proYearlySaleBadge(appEn);
/** @deprecated English only — use proSaleCta(). */
export const PRO_SALE_CTA = proSaleCta(appEn);
/** @deprecated English only — use proTrialCta(). */
export const PRO_TRIAL_CTA = proTrialCta(appEn);
/** @deprecated English only — use proSidebarHeadline(). */
export const PRO_SIDEBAR_HEADLINE = proSidebarHeadline(appEn);
/** @deprecated English only — use proTrialSubtext(). */
export const PRO_TRIAL_SUBTEXT = proTrialSubtext(appEn);
/** @deprecated English only — use proYearlySubtext(). */
export const PRO_YEARLY_SUBTEXT = proYearlySubtext(appEn);

const THUMB_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

export type PricingCtaState = "default" | "current" | "busy" | "disabled";

/** Sliding translucent thumb — used by billing period + Preview/Code + dialog tabs. */
export function SlidingPillSwitch({
  value,
  options,
  onChange,
  size = "md",
  fullWidth = false,
  className = "",
  bareTrack = false,
  "aria-label": ariaLabel,
}: {
  value: string;
  options: Array<{ value: string; label: ReactNode }>;
  onChange: (value: string) => void;
  size?: "md" | "sm";
  /** Stretch across the parent (settings / account dialogs). */
  fullWidth?: boolean;
  className?: string;
  /**
   * Drop the track's own fill and ring, keeping the moving thumb.
   *
   * Inside a panel that is already a rounded card, the track is a second
   * rounded box drawn a few pixels inside the first — two radii nested with
   * nothing between them. The selection still reads, because the thumb is what
   * carries it.
   */
  bareTrack?: boolean;
  "aria-label": string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [thumb, setThumb] = useState({ left: 0, width: 0, ready: false, slide: false });
  const compact = size === "sm";
  /** The value the thumb was last put under: it slides only when that changes. */
  const shownValue = useRef<string | null>(null);

  // A resize, a late font or a label that grows re-measures in place; only
  // picking another tab slides. Otherwise the thumb grew in from a sliver of
  // itself on the first paint of a page (Team's tabs), which read as a glitch.
  const measure = (slide = false) => {
    const track = trackRef.current;
    const btn = btnRefs.current[value];
    if (!track || !btn) return;
    // Offset, not a viewport delta. The thumb is absolutely positioned inside
    // the track, so it lives in the track's content coordinates — and once the
    // track scrolls, a `getBoundingClientRect` difference is short by exactly
    // `scrollLeft`, which parked the bubble a tab or two behind the selection.
    const left = btn.offsetLeft;
    const width = btn.offsetWidth;
    // The observer also fires once on observe, right after a tab change:
    // nothing moved, so leave the slide that's under way alone.
    setThumb((t) => (!slide && t.ready && t.left === left && t.width === width ? t : { left, width, ready: true, slide }));
  };

  useLayoutEffect(() => {
    measure(shownValue.current !== null && shownValue.current !== value);
    shownValue.current = value;
    // When the track scrolls — a dozen connector categories on a phone — the
    // tab you just picked can land off screen. Centre it.
    //
    // Done by setting scrollLeft rather than scrollIntoView, which walks up to
    // the nearest scrollable ancestor and just as happily scrolls the page.
    const btn = btnRefs.current[value];
    const track = trackRef.current;
    if (btn && track && track.scrollWidth > track.clientWidth) {
      const target = btn.offsetLeft - (track.clientWidth - btn.offsetWidth) / 2;
      track.scrollTo({
        left: Math.max(0, Math.min(target, track.scrollWidth - track.clientWidth)),
        behavior: "smooth",
      });
    }
  }, [value, options.length, size, fullWidth]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
    ro?.observe(track);
    return () => {
      window.removeEventListener("resize", onResize);
      ro?.disconnect();
    };
  }, [value, size, fullWidth]);

  return (
    <div
      ref={trackRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`relative items-center overflow-x-auto overflow-y-hidden rounded-full [scrollbar-width:none] [&::-webkit-scrollbar]{display:none} ${
        fullWidth ? "flex w-full" : "inline-flex w-max max-w-full"
      } ${compact ? "p-0.5" : "p-1"} ${className}`}
      style={
        bareTrack
          ? undefined
          : { background: PRICING.switchTrack, boxShadow: PRICING.shadowSwitch }
      }
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute z-0 rounded-full ${
          compact ? "top-0.5 bottom-0.5" : "top-1 bottom-1"
        }`}
        style={{
          left: thumb.left,
          width: thumb.width,
          background: PRICING.bgTranslucent,
          boxShadow: PRICING.shadowNeutral,
          opacity: thumb.ready ? 1 : 0,
          transition: thumb.ready && thumb.slide
            ? `left 0.34s ${THUMB_EASE}, width 0.34s ${THUMB_EASE}`
            : "none",
        }}
      />
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              btnRefs.current[opt.value] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={`relative z-10 inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full whitespace-nowrap outline-none transition-colors duration-150 focus-visible:outline-none ${
              fullWidth ? "min-w-0 flex-1" : ""
            } ${
              compact
                ? "min-w-0 px-3 py-1 text-[13px]"
                : "min-w-12 px-4 py-1.5 text-sm"
            }`}
            style={{ color: selected ? PRICING.fg : PRICING.desc }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function freeFeatures(t: AppMessages = appT()): string[] {
  return [...t.billing.plans.freeFeatures];
}

/** Plan checklist item — `accent` uses the special Pro color. */
export type PlanFeature = string | { text: string; accent?: boolean };

/**
 * The two icon lines above a card's checklist, as Lovable's ("Unlimited users",
 * "Free grants ⌄"). With `details`, the line opens a small list of them.
 */
export type PlanHighlight = { icon: "card" | "users" | "gift"; text: string; details?: readonly string[] };
const HIGHLIGHT_ICONS = { card: CreditCard, users: Users, gift: Gift } as const;

function HighlightIcon({ icon }: { icon: PlanHighlight["icon"] }) {
  const Icon = HIGHLIGHT_ICONS[icon];
  return <Icon className="h-4 w-4 shrink-0 text-white/70" strokeWidth={1.75} aria-hidden />;
}

/** "Free grants ⌄": opens what the plan gives for free (as Lovable's). */
function HighlightWithDetails({ highlight }: { highlight: PlanHighlight }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label={highlight.text}
      // Above the upgrade modal (110) it can open from.
      zIndex={120}
      className="rounded-[12px] px-4 py-3"
      style={{ background: CARD_BG, boxShadow: "0 0 0 1px rgba(255,255,255,0.1), 0 12px 32px rgba(0,0,0,0.45)" }}
      trigger={
        <button type="button" className="flex items-center gap-2 text-sm text-white transition hover:text-white/80" aria-expanded={open}>
          <HighlightIcon icon={highlight.icon} />
          {highlight.text}
          <ChevronDown className={`h-3.5 w-3.5 text-white/60 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
      }
    >
      <ul className="flex flex-col gap-1.5 text-sm text-white">
        {highlight.details!.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
    </Popover>
  );
}

// PRO_INFRA_MARKUP (2.5×) vs 5× on Free is the "50% off hosting" line — apps/api/src/lib/plans.ts.
export function proFeatures(t: AppMessages = appT()): PlanFeature[] {
  return [...t.billing.plans.proFeatures];
}

export function enterpriseFeatures(t: AppMessages = appT()): string[] {
  return [...t.billing.plans.enterpriseFeatures];
}

function normalizeFeature(f: PlanFeature): { text: string; accent: boolean } {
  if (typeof f === "string") return { text: f, accent: false };
  return { text: f.text, accent: Boolean(f.accent) };
}

/** Billing period switch: sliding translucent thumb + special “2 months free”. */
export function BillingPeriodSwitch({
  yearly,
  onChange,
  labels,
}: {
  yearly: boolean;
  onChange: (yearly: boolean) => void;
  /** Marketing pages pass their own catalog's words; the app uses its catalog. */
  labels?: { period: string; monthly: string; yearly: string; bonus: string };
}) {
  const t = usePageT();
  const p = t.billing.plans;
  const l = labels ?? { period: p.billingPeriod, monthly: p.monthly, yearly: p.yearly, bonus: p.twoMonthsFree };
  return (
    <SlidingPillSwitch
      aria-label={l.period}
      value={yearly ? "yearly" : "monthly"}
      onChange={(v) => onChange(v === "yearly")}
      options={[
        { value: "monthly", label: l.monthly },
        {
          value: "yearly",
          label: (
            <>
              {l.yearly}
              <span className="ms-1 font-medium" style={{ color: PRICING.specialFg }}>
                {l.bonus}
              </span>
            </>
          ),
        },
      ]}
    />
  );
}

/**
 * The outline buttons' hover: Lovable's soft grey fill. A class, not an inline
 * background — an inline `transparent` beat the hover, so they never changed.
 */
const OUTLINE_HOVER = "bg-transparent hover:bg-[oklch(0.5674_0.009_106.68/0.16)]";

export function PlanCard({
  name,
  description,
  price,
  period,
  priceLabel,
  saveBadge,
  /** Strikethrough compare-at price (e.g. "$36") shown before `price`. */
  compareAtPrice,
  /** Purple highlight pill (e.g. Pro “Free custom domain”). */
  highlightBadge,
  /** Overrides the default "Current" chip when ctaState is current (e.g. "Canceling"). */
  statusBadge,
  /** Draw the status chip in the amber "canceling" tone. */
  statusCanceling,
  cta,
  /** Small line under the CTA (e.g. “$25/mo. Cancel anytime.”). */
  ctaSubtext,
  primary,
  onCta,
  features,
  footerNote,
  ctaState = "default",
  compact,
  /** Lighter shell on dark page bg (landing) — same contrast as /billing without a wrapper panel. */
  elevatedShell,
  /** Under the price: the credit-tier dropdown on Pro and Business. */
  tierPicker,
  /**
   * In a row where other cards have a tier dropdown: keep its space, so every
   * card's button sits at the same height.
   */
  alignWithTiers,
  /** Narrow 4-up rows (Billing's panel), where a description can run to 4 lines. */
  tallDescription,
  descriptionClassName,
  highlights,
  tagBadge,
  secondaryCta,
  reserveSecondaryCta = false,
  scrollFeatures = false,
}: {
  name: string;
  description: string;
  price?: string;
  period?: string;
  priceLabel?: string;
  saveBadge?: string;
  compareAtPrice?: string;
  highlightBadge?: string;
  statusBadge?: string;
  statusCanceling?: boolean;
  cta: string;
  ctaSubtext?: string;
  primary?: boolean;
  onCta: () => void;
  features: PlanFeature[];
  footerNote?: string;
  ctaState?: PricingCtaState;
  /** Tighter card for modal layouts */
  compact?: boolean;
  elevatedShell?: boolean;
  tierPicker?: ReactNode;
  alignWithTiers?: boolean;
  tallDescription?: boolean;
  /** Overrides the description's reserved height (responsive rows with their own breakpoints). */
  descriptionClassName?: string;
  highlights?: PlanHighlight[];
  /** A violet tag beside the name (Enterprise's "Add-ons available"). */
  tagBadge?: string;
  /** A second, outlined button under the main one (Enterprise's "Book a demo"). */
  secondaryCta?: { label: string; onClick: () => void };
  /** Keep the second button's space empty, so cards in a row with one stay level (not on a phone). */
  reserveSecondaryCta?: boolean;
  /**
   * In a box shorter than the card (the upgrade modal): the price and button
   * stay put and the list under them scrolls inside the card, fading at the
   * edge that has more.
   */
  scrollFeatures?: boolean;
}) {
  const t = usePageT();
  const disabled = ctaState === "current" || ctaState === "busy" || ctaState === "disabled";
  const showCta = ctaState !== "disabled";
  const chip =
    ctaState === "current" ? (statusBadge?.trim() || t.billing.status.current) : null;
  // Callers say so; the text match is for callers that still pass the English word.
  const cancelingChip = Boolean(chip) && (statusCanceling ?? chip?.toLowerCase() === "canceling");
  const periodMain = period?.split(",")[0]?.trim();
  const periodExtra = period?.includes(",")
    ? period.split(",").slice(1).join(",").trim()
    : null;
  const pad = compact ? "p-4 sm:p-5" : "p-5 sm:p-6";
  const featureRows = features.map(normalizeFeature);
  // Followed as state: in a dialog the card mounts a frame after it opens.
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null);
  const listRef = useMemo(() => ({ current: scrollFeatures ? listEl : null }), [listEl, scrollFeatures]);
  useScrollFade(listRef);

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-3xl mx-ring"
      style={{
        background: elevatedShell ? PRICING.panel : PRICING.drawer,
      }}
    >
      {/* Elevated top block — fixed slots above CTA so buttons align across columns */}
      <div className={`flex flex-col rounded-3xl ${pad} ${scrollFeatures ? "shrink-0" : ""}`} style={{ background: PRICING.card }}>
        {/* One line, as Lovable's: a wrapped tag pushed this card's price and
            buttons below its neighbours'. The tag gives way (trims) first. */}
        <div className="flex min-h-7 min-w-0 flex-nowrap items-center gap-2">
          <h3 className="shrink-0 text-xl font-medium text-white">{name}</h3>
          {chip && (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{
                background: cancelingChip ? "rgba(245, 158, 11, 0.16)" : "rgba(255,255,255,0.08)",
                color: cancelingChip ? "rgb(251, 191, 36)" : "#ffffff",
              }}
            >
              {chip}
            </span>
          )}
          {saveBadge ? (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{
                background: PRICING.successBg,
                color: PRICING.successFg,
              }}
            >
              {saveBadge}
            </span>
          ) : null}
          {tagBadge ? (
            <span
              className="min-w-0 truncate rounded-full px-2 py-0.5 text-[10.5px] font-medium tracking-wide whitespace-nowrap uppercase"
              style={{ background: "color-mix(in oklch, oklch(58.99% 0.2523 294.88), transparent 80%)", color: PRICING.specialFg }}
              title={tagBadge}
            >
              {tagBadge}
            </span>
          ) : null}
        </div>

        {/* 3-line slot — keeps Free / Pro / Enterprise CTAs level when copy wraps differently */}
        <p
          className={`mt-1.5 text-sm leading-snug text-white ${descriptionClassName ?? (tallDescription ? "sm:min-h-[5.25rem]" : "sm:min-h-[3.9375rem]")}`}
        >
          {description}
        </p>

        <div className="mt-5">
          {priceLabel ? (
            <p
              className="flex min-h-7 items-baseline text-[1.75rem] leading-none font-medium"
              style={{ color: PRICING.desc }}
            >
              {priceLabel}
            </p>
          ) : (
            <p className="flex min-h-7 flex-wrap items-baseline gap-x-2 gap-y-1 text-[1.75rem] leading-none font-medium tracking-tight text-white">
              {compareAtPrice ? (
                <span
                  className="text-[1.25rem] font-medium line-through"
                  style={{ color: PRICING.desc }}
                >
                  {compareAtPrice}
                </span>
              ) : null}
              <span>{price}</span>
            </p>
          )}
          <p
            className={`mt-1.5 text-base font-normal ${periodMain ? "" : "invisible"}`}
            style={{ color: PRICING.desc }}
            aria-hidden={!periodMain}
          >
            {periodMain || t.billing.plans.perMonth}
          </p>
          {/* Same period-extra slot for every card (incl. compact) so CTAs stay aligned */}
          <p
            className={`mt-0.5 text-sm font-normal ${periodExtra ? "" : "invisible max-sm:hidden"}`}
            style={{ color: PRICING.desc }}
            aria-hidden={!periodExtra}
          >
            {periodExtra || t.billing.plans.billedAnnually}
          </p>
        </div>

        {tierPicker ? (
          <div className="mt-4">{tierPicker}</div>
        ) : alignWithTiers ? (
          <div className="mt-4 h-10 max-sm:hidden" aria-hidden />
        ) : null}

        {/* The Pro highlight pill ("Free custom domain") — off for now, and its
            reserved row with it (see SHOW_HIGHLIGHT_BADGE). */}
        {SHOW_HIGHLIGHT_BADGE && (
        <div className="mt-2 flex min-h-8 items-center">
          {highlightBadge ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium"
              style={{
                background: "color-mix(in oklch, oklch(58.99% 0.2523 294.88), transparent 82%)",
                color: PRICING.specialFg,
              }}
            >
              <Globe className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
              {highlightBadge}
            </span>
          ) : null}
        </div>
        )}

        {showCta ? (
          <div className="mt-5">
            <button
              type="button"
              onClick={onCta}
              disabled={disabled}
              className={`inline-flex h-10 w-full shrink-0 items-center justify-center rounded-[8px] px-5 text-sm font-normal transition ${
                primary && ctaState === "default"
                  ? "text-white hover:brightness-110"
                  : `text-white ${OUTLINE_HOVER} disabled:opacity-70`
              }`}
              style={
                primary && ctaState === "default"
                  ? { background: PRICING.special, boxShadow: PRICING.shadowSpecial }
                  : { boxShadow: PRICING.shadowNeutral }
              }
            >
              {ctaState === "busy" ? <Spinner size={16} /> : cta}
            </button>
            {/* Enterprise's second button sits right under the first, as Lovable's;
                the other cards keep its space empty so every row stays level. */}
            {secondaryCta ? (
              <button
                type="button"
                onClick={secondaryCta.onClick}
                className={`mt-2 inline-flex h-10 w-full shrink-0 items-center justify-center rounded-[8px] px-5 text-sm font-normal text-white transition ${OUTLINE_HOVER}`}
                style={{ boxShadow: PRICING.shadowNeutral }}
              >
                {secondaryCta.label}
              </button>
            ) : null}
            {/* Always reserve subtext line so feature lists stay level */}
            <p
              className={`mt-2 min-h-[1.125rem] text-center text-[11px] leading-snug ${
                ctaSubtext && ctaState === "default" ? "" : "invisible max-sm:hidden"
              }`}
              style={{ color: PRICING.desc }}
              aria-hidden={!(ctaSubtext && ctaState === "default")}
            >
              {ctaSubtext && ctaState === "default" ? ctaSubtext : proTrialSubtext(t)}
            </p>
            {!secondaryCta && reserveSecondaryCta ? <div className="mt-2 h-10 max-sm:hidden" aria-hidden /> : null}
          </div>
        ) : (
          <div className="mt-5">
            {/* No plan to buy here (it's billed elsewhere, or not sold): a demo is still one tap away. */}
            {secondaryCta ? (
              <button
                type="button"
                onClick={secondaryCta.onClick}
                className={`inline-flex h-10 w-full shrink-0 items-center justify-center rounded-[8px] px-5 text-sm font-normal text-white transition ${OUTLINE_HOVER}`}
                style={{ boxShadow: PRICING.shadowNeutral }}
              >
                {secondaryCta.label}
              </button>
            ) : (
              <div className="h-10 w-full shrink-0" aria-hidden />
            )}
            <p className="mt-2 min-h-[1.125rem] invisible text-[11px]" aria-hidden>
              {proTrialSubtext(t)}
            </p>
          </div>
        )}
      </div>

      <div
        ref={setListEl}
        className={
          scrollFeatures
            ? "mx-scroll-fade min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&[data-fade-bottom]]:[--fade-bottom:3rem]"
            : "contents"
        }
      >
      {highlights?.length ? (
        <div
          className={`flex flex-col gap-3 border-b pt-5 pb-4 ${compact ? "px-4 sm:px-5" : "px-5 sm:px-6"}`}
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
        >
          {highlights.map((h) =>
            h.details?.length ? (
              <HighlightWithDetails key={h.text} highlight={h} />
            ) : (
              <p key={h.text} className="flex items-center gap-2 text-sm text-white">
                <HighlightIcon icon={h.icon} />
                {h.text}
              </p>
            ),
          )}
        </div>
      ) : null}

      {/* Checklist on drawer color */}
      <div className={`pt-5 pb-5 ${compact ? "px-4 sm:px-5" : "px-5 sm:px-6"}`}>
        <ul className="flex flex-col gap-3.5">
          {featureRows.map((f) => (
            <li
              key={f.text}
              className={`flex items-start gap-2 text-sm text-white ${f.accent ? "font-medium" : ""}`}
            >
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-white/80" strokeWidth={2} />
              {f.text}
            </li>
          ))}
        </ul>
        {footerNote && (
          <p className="mt-4 text-xs leading-relaxed" style={{ color: PRICING.desc }}>
            {footerNote}
          </p>
        )}
      </div>
      </div>
    </div>
  );
}
