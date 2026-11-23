import { useEffect, useState } from "react";
import { type ShelfNotice } from "../chat/ComposerShelf";
import { Zap } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { BillingSummary } from "../../lib/billing";
import { useUpgrade } from "../../lib/upgrade";
import { PRICING, PRO_TRIAL_DAYS, proSaleBadge } from "../PricingPlans";
import { pl, useT } from "../../i18n/app";

function storageKey(userId: string) {
  return `mythex_pro_trial_offer_dismissed:${userId}`;
}

/**
 * One-time offer strip above the chat composer.
 * Free + trial-eligible only; off when PRO_TRIAL_DAYS is 0.
 */
export function useTrialOfferNotice({ hidden }: { hidden?: boolean } = {}): ShelfNotice | null {
  const { user } = useAuth();
  const openUpgrade = useUpgrade();
  const t = useT();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (PRO_TRIAL_DAYS <= 0 || !user?.id || user.plan !== "FREE") {
      setShow(false);
      return;
    }
    try {
      if (localStorage.getItem(storageKey(user.id))) {
        setShow(false);
        return;
      }
    } catch {
      /* private mode */
    }
    let cancelled = false;
    void (async () => {
      try {
        const s = await api.get<BillingSummary>("/v1/billing/summary");
        if (cancelled) return;
        setShow(s.trialEligible === true);
      } catch {
        if (!cancelled) setShow(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.plan]);

  if (hidden || !show || user?.plan !== "FREE" || PRO_TRIAL_DAYS <= 0) return null;

  const dismiss = () => {
    if (user?.id) {
      try {
        localStorage.setItem(storageKey(user.id), "1");
      } catch {
        /* ignore */
      }
    }
    setShow(false);
  };

  return {
    key: "trial",
    testId: "pro-trial-offer-banner",
    icon: <Zap className="size-4 fill-current text-violet-300" />,
    title: pl(t.billing.trialOffer.title, PRO_TRIAL_DAYS),
    detail: (
      <span
        className="ms-2 inline-flex items-center rounded-full px-1.5 py-0.5 align-[1px] text-[12px] font-medium"
        style={{ background: PRICING.successBg, color: PRICING.successFg }}
      >
        {proSaleBadge(t)}
      </span>
    ),
    action: { label: t.billing.trialOffer.startTrial, onClick: () => openUpgrade("plans") },
    onDismiss: dismiss,
    dismissLabel: t.billing.trialOffer.dismiss,
  };
}
