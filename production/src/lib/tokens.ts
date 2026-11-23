import { formatNumber } from "../i18n/app";

/**
 * User-facing billing is in "credits". Ledger stores millicredits
 * (CreditEntry.deltaTokens). Keep in sync with apps/api/src/lib/plans.ts.
 */
export const CREDIT_USD = 0.25;
export const MILLICREDITS_PER_CREDIT = 1000;

/** @deprecated — millicredits per cent of face value */
export const TOKENS_PER_CENT = MILLICREDITS_PER_CREDIT / (CREDIT_USD * 100); // 40

export const millicreditsFromCredits = (credits: number): number =>
  Math.round(credits * MILLICREDITS_PER_CREDIT);

export const creditsFromMillicredits = (mc: number): number => mc / MILLICREDITS_PER_CREDIT;

/** @deprecated */
export const tokensFromCents = (cents: number): number =>
  Math.round((cents / 100 / CREDIT_USD) * MILLICREDITS_PER_CREDIT);

/**
 * Format credits for UI, e.g. 100 → "100", 12.5 → "12.5", 0.48 → "0.48" —
 * with the app language's separators ("12,5" in German).
 */
export function formatCredits(credits: number): string {
  const c = Math.max(0, credits);
  // Grouped above a thousand: "12,071" is a balance, "12071" reads like an id.
  if (c >= 100) return formatNumber(Math.round(c));
  // Nothing left reads "0", not "0.00".
  const digits = c === 0 ? 0 : c >= 10 ? (c % 1 === 0 ? 0 : 1) : c >= 1 ? (c % 1 === 0 ? 0 : 2) : 2;
  // Rounded by toFixed first, so the digits are exactly what they always were.
  return formatNumber(Number(c.toFixed(digits)), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  });
}

/** Format millicredits as credits. */
export function formatMillicredits(mc: number): string {
  return formatCredits(creditsFromMillicredits(mc));
}

/** @deprecated Use formatCredits / formatMillicredits */
export function formatTokens(tokens: number): string {
  // Legacy callers passed token counts; treat as millicredits when large, else credits.
  if (tokens >= MILLICREDITS_PER_CREDIT) return formatMillicredits(tokens);
  return formatCredits(tokens);
}

/** @deprecated */
export const formatCentsAsTokens = (cents: number): string => formatMillicredits(tokensFromCents(cents));
