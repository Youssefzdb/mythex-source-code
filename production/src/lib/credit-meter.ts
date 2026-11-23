import { useEffect, useState } from "react";
import { api, type Me } from "./api";
import type { BillingSummary, DailyCredits } from "./billing";
import { creditsFromMillicredits } from "./tokens";

/** The credits bar's fill, the billing page's blue — one colour wherever a balance is drawn. */
export const CREDIT_BAR = "#3b82f6";

/** The daily allowance, as the billing summary last reported it. */
let dailyCache: { daily: DailyCredits | null; at: number } | null = null;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const STALE_MS = 60_000;

function loadDaily() {
  if (inFlight || (dailyCache && Date.now() - dailyCache.at < STALE_MS)) return;
  inFlight = api
    .get<BillingSummary>("/v1/billing/summary")
    .then((s) => {
      dailyCache = { daily: s.daily ?? null, at: Date.now() };
      listeners.forEach((fn) => fn());
    })
    .catch(() => undefined)
    .finally(() => {
      inFlight = null;
    });
}

/**
 * The credits meter the drawer's workspace menu and the phone's project sheet
 * draw: the balance, and the bar the billing page draws — what is left of
 * today's allowance. It used to be the balance over a guessed month (30 on
 * Free), so 9.55 credits drew a third of a bar here and nearly a full one on
 * the billing page, for the same account at the same moment.
 */
export function useCreditMeter(user: Me | null | undefined) {
  const [, bump] = useState(0);
  useEffect(() => {
    const onChange = () => bump((n) => n + 1);
    listeners.add(onChange);
    loadDaily();
    return () => {
      listeners.delete(onChange);
    };
  }, [user?.id, user?.plan]);
  const balance =
    user?.balanceCredits ?? (typeof user?.balanceTokens === "number" ? creditsFromMillicredits(user.balanceTokens) : 0);
  const daily = dailyCache?.daily;
  const pct =
    daily && daily.allowance > 0
      ? Math.max(0, Math.min(100, Math.round((daily.remaining / daily.allowance) * 100)))
      : 0;
  return { balance, pct, daily };
}
