/** Whole days remaining until trial end (unix seconds). Min 1 while still active. */
export function trialDaysRemaining(
  currentPeriodEndUnix: number | null | undefined,
  nowMs = Date.now(),
): number {
  if (!currentPeriodEndUnix) return 0;
  const ms = currentPeriodEndUnix * 1000 - nowMs;
  if (ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
