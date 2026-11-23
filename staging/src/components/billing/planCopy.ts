import { fill, type AppMessages } from "../../i18n/app";
import type { PlanFeature, PlanHighlight } from "../PricingPlans";

/**
 * The plan cards' highlight lines and checklists, from a plans catalog: the
 * app's (`t.plans`) on /billing, the page's (`m.plans`) on the landing page,
 * which follows its URL's language. Amounts come in already formatted.
 */
export type PlansCopy = AppMessages["plans"];

export function freeHighlights(p: PlansCopy): PlanHighlight[] {
  const h = p.highlights;
  return [
    { icon: "card", text: h.noCard },
    { icon: "gift", text: h.freeGrants, details: [h.freeBuild, h.freeCloud] },
  ];
}

/**
 * Pro and Business: `cloud` is the tier's Cloud credits (a fifth of it).
 * `fee` (Business): the plan's monthly fee, formatted — its credits cost what Pro's do.
 */
export function paidHighlights(p: PlansCopy, cloud: string, fee?: string): PlanHighlight[] {
  const h = p.highlights;
  // Business: its fee takes the members line's place (All Pro features covers
  // it), so every card has two lines and the checklists start level.
  return [
    // Business keeps "Unlimited members" on the same line as its fee, so the cards stay level.
    fee ? { icon: "card" as const, text: `${fill(h.planFee, { fee })} · ${h.unlimitedMembers}` } : { icon: "users" as const, text: h.unlimitedMembers },
    { icon: "gift", text: h.freeGrants, details: [h.paidBuild, fill(h.paidCloud, { cloud })] },
  ];
}

/** `fee`: Enterprise's monthly fee, formatted — its credits cost what Pro's do. */
export function enterpriseHighlights(p: PlansCopy, fee: string): PlanHighlight[] {
  return [
    { icon: "card", text: fill(p.highlights.planFee, { fee }) },
    { icon: "users", text: p.highlights.unlimitedMembers },
  ];
}

export function freePlanFeatures(p: PlansCopy): PlanFeature[] {
  return [...p.freeFeatures];
}

/**
 * `credits` is the tier, formatted ("1,200"). `includesFree` leads with "All
 * Free features" — meaningful beside the Free card, noise where Pro stands alone.
 */
export function proPlanFeatures(
  p: PlansCopy,
  credits: string,
  { includesFree = true }: { includesFree?: boolean } = {},
): PlanFeature[] {
  const features = p.proFeatures.map((f) => fill(f, { credits }));
  return includesFree ? [{ text: p.proIncludes, accent: true }, ...features] : features;
}

export function businessPlanFeatures(p: PlansCopy, credits: string): PlanFeature[] {
  return [{ text: p.businessIncludes, accent: true }, ...p.businessFeatures.map((f) => fill(f, { credits }))];
}

/** `credits` is the tier, formatted (from 800). */
export function enterprisePlanFeatures(p: PlansCopy, credits: string): PlanFeature[] {
  return [{ text: p.enterpriseIncludes, accent: true }, ...p.enterpriseFeatures.map((f) => fill(f, { credits }))];
}
