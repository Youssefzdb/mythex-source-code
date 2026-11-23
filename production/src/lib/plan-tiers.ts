/**
 * Plans and credit tiers — mirrors apps/api/src/lib/plans.ts (planPriceCents,
 * CREDIT_TIERS). Public pages show prices without signing in; the billing
 * summary's `catalog` is the source of truth where it's available.
 */
export type PlanId = "FREE" | "PRO" | "BUSINESS" | "ENTERPRISE";
export type PaidPlan = "PRO" | "BUSINESS" | "ENTERPRISE";

export const CREDIT_TIERS = [100, 200, 400, 800, 1200, 2000, 3000, 4000, 5000, 7500, 10000] as const;
export type CreditTier = (typeof CREDIT_TIERS)[number];
/** Enterprise is sold from 800 credits a month. */
export const ENTERPRISE_MIN_TIER = 800;

/** The tiers a plan is sold in. */
export function tiersFor(plan: PaidPlan): readonly number[] {
  return plan === "ENTERPRISE" ? CREDIT_TIERS.filter((t) => t >= ENTERPRISE_MIN_TIER) : CREDIT_TIERS;
}

/** A credit costs the same on every plan (25¢, a little off on a bigger tier); Business and Enterprise add a monthly fee for their features. */
const DISCOUNT: Partial<Record<number, number>> = { 1200: 2, 2000: 4, 3000: 6, 4000: 8, 5000: 10, 7500: 10, 10000: 10 };
const CENTS_PER_CREDIT = 25;
export const PLAN_FEE_CENTS: Record<PaidPlan, number> = { PRO: 0, BUSINESS: 2500, ENTERPRISE: 48000 };
export const YEARLY_MONTHS_CHARGED = 10;

export function isPaidPlan(p: string | null | undefined): p is PaidPlan {
  return p === "PRO" || p === "BUSINESS" || p === "ENTERPRISE";
}

/** Business or above: the plans with the team controls. */
export function isBusinessOrAbove(p: string | null | undefined): boolean {
  return p === "BUSINESS" || p === "ENTERPRISE";
}

export function planLabel(p: string | null | undefined): string {
  return p === "ENTERPRISE" ? "Enterprise" : p === "BUSINESS" ? "Business" : p === "PRO" ? "Pro" : "Free";
}

/** Percent off the credits at a tier, the same on every plan. */
export function tierDiscount(tier: number): number {
  return DISCOUNT[tier] ?? 0;
}

export function planPriceCents(plan: PaidPlan, tier: number, interval: "month" | "year" = "month"): number {
  const monthly = Math.round(tier * CENTS_PER_CREDIT * (1 - tierDiscount(tier) / 100)) + PLAN_FEE_CENTS[plan];
  return interval === "year" ? monthly * YEARLY_MONTHS_CHARGED : monthly;
}

/** The price shown on a card: per month, or the yearly price spread per month. */
export function monthlyDisplayCents(plan: PaidPlan, tier: number, yearly: boolean): number {
  return yearly ? Math.round(planPriceCents(plan, tier, "year") / 12) : planPriceCents(plan, tier, "month");
}

export function dollars(cents: number): string {
  const v = cents / 100;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export function cloudCreditsForTier(tier: number): number {
  return Math.round(tier / 5);
}
