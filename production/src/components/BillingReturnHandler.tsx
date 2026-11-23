import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { track } from "../lib/analytics";
import {
  BillingCelebration,
  type BillingCelebrationKind,
} from "./BillingCelebration";

/**
 * Stripe returns to the page you left (`?upgraded=1` or `?topup=1`).
 * Sync with Stripe (webhook may have been missed), refresh session, celebrate.
 */
export function BillingReturnHandler() {
  const [params, setParams] = useSearchParams();
  const { user, refresh } = useAuth();
  const handled = useRef<string | null>(null);
  const [celebration, setCelebration] = useState<{
    kind: BillingCelebrationKind;
    balanceCredits?: number;
    plan?: string;
    credits?: number;
  } | null>(null);

  useEffect(() => {
    const kind = params.get("upgraded")
      ? "upgraded"
      : params.get("topup")
        ? "topup"
        : null;
    const sid = params.get("sid");
    if (!kind || !user) return;
    if (handled.current === kind) return;
    handled.current = kind;

    const next = new URLSearchParams(params);
    next.delete("upgraded");
    next.delete("topup");
    next.delete("sid");
    setParams(next, { replace: true });

    void (async () => {
      try {
        const sync = await api.post<{
          plan: "FREE" | "PRO" | "BUSINESS" | "ENTERPRISE";
          balanceCredits?: number;
          synced?: boolean;
        }>("/v1/billing/sync");
        await refresh();
        // The plan and tier bought, for the welcome line (Business, Pro 400 …).
        const bought = await api.get<{ plan: string; planCredits?: number }>("/v1/billing/summary").catch(() => null);
        setCelebration({
          kind,
          balanceCredits: sync.balanceCredits ?? user.balanceCredits,
          plan: bought?.plan ?? sync.plan,
          credits: bought?.planCredits,
        });
        track("paid", {
          kind: kind === "upgraded" ? "subscription" : "topup",
          ...(sid
            ? {
                subscribeEventId: `subscribe:${sid}`,
                completePaymentEventId: `complete_payment:${sid}`,
                purchaseEventId: `purchase:${sid}`,
              }
            : {}),
        });
      } catch {
        await refresh();
        setCelebration({ kind, balanceCredits: user.balanceCredits });
        track("paid", {
          kind: kind === "upgraded" ? "subscription" : "topup",
          ...(sid
            ? {
                subscribeEventId: `subscribe:${sid}`,
                completePaymentEventId: `complete_payment:${sid}`,
                purchaseEventId: `purchase:${sid}`,
              }
            : {}),
        });
      }
    })();
  }, [params, user, refresh, setParams]);

  const liveBalance = user?.balanceCredits;
  useEffect(() => {
    if (typeof liveBalance !== "number") return;
    setCelebration((prev) =>
      prev && prev.balanceCredits !== liveBalance
        ? { ...prev, balanceCredits: liveBalance }
        : prev,
    );
  }, [liveBalance]);

  if (!celebration) return null;

  return (
    <BillingCelebration
      kind={celebration.kind}
      balanceCredits={celebration.balanceCredits}
      plan={celebration.plan}
      credits={celebration.credits}
      onClose={() => setCelebration(null)}
    />
  );
}
