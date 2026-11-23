import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isPaidPlan } from "../lib/plan-tiers";
import { flushSync } from "react-dom";
import { X } from "lucide-react";
import { api } from "../lib/api";
import { track, getMetaClickIds, getImpactClickId } from "../lib/analytics";
import type { BillingSummary, DailyCredits } from "../lib/billing";
import { currentAppPath, goToExternalCheckout } from "../lib/external-checkout";
import {
  PlanCard,
  PRO_COMPARE_AT_MONTHLY,
  PRO_MONTHLY_PRICE,
  proSaleBadge,
  PRO_SALE_PERCENT,
  proTrialCta,
  PRO_TRIAL_DAYS,
  proTrialSubtext,
} from "./PricingPlans";
import { useToast } from "./ui";
import { paidHighlights, proPlanFeatures } from "./billing/planCopy";
import { ModalSurface, useSurfaceClose } from "./ui/Sheet";
import { BillingCelebration } from "./BillingCelebration";
import { useStoreBilling } from "../lib/store-purchases";
import { useAuth } from "../lib/auth";
import { fill, formatNumber, useT, type AppMessages } from "../i18n/app";

export type UpgradeReason = "plans" | "credits";

function headlineFor(t: AppMessages, reason: UpgradeReason, trialEligible: boolean, daily?: DailyCredits | null) {
  const u = t.shell.upgrade;
  if (reason === "credits") {
    // Free is rarely "out" — today's credits are spent (back at midnight) or
    // the month's cap is reached; published apps run on their own Cloud credits.
    const title =
      daily && daily.allowance > 0
        ? daily.monthlyCap != null && daily.grantedThisMonth >= daily.monthlyCap - 0.001
          ? u.monthUsed
          : u.todayUsed
        : u.outOfCredits;
    return {
      title,
      body: trialEligible
        ? fill(u.outOfCreditsTrial, { days: PRO_TRIAL_DAYS })
        : fill(u.outOfCreditsSale, { percent: PRO_SALE_PERCENT }),
    };
  }
  return {
    title: trialEligible ? fill(u.tryFree, { days: PRO_TRIAL_DAYS }) : fill(u.getOff, { percent: PRO_SALE_PERCENT }),
    body: trialEligible
      ? u.trialBody
      : fill(u.saleBody, { price: PRO_MONTHLY_PRICE, compareAt: PRO_COMPARE_AT_MONTHLY }),
  };
}

/** Single Pro plan card — used for in-project upgrade moments. */
export function UpgradeModal({
  reason,
  onClose,
}: {
  reason: UpgradeReason;
  onClose: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [trialEligible, setTrialEligible] = useState(false);
  const [daily, setDaily] = useState<DailyCredits | null>(null);
  // The headline depends on the summary (today's credits or the month's, the
  // trial or the sale): until it arrives the words wait, their room kept —
  // shown at once they said "You're out of credits" and changed a moment
  // later to "Today's credits are used up".
  const [summaryRead, setSummaryRead] = useState(false);
  const alive = useRef(true);
  // In the iPhone and Android apps Pro is bought from Apple or Google: their
  // price, no Stripe trial or sale, and the store's own purchase sheet.
  const storeBilling = useStoreBilling();
  const { refresh } = useAuth();
  const [bought, setBought] = useState(false);
  const base = headlineFor(t, reason, storeBilling ? false : trialEligible, daily);
  const copy = storeBilling
    ? {
        title: reason === "credits" ? base.title : fill(t.plans.upgradeTo, { plan: "Pro" }),
        body: t.shell.upgrade.outOfCreditsStore,
      }
    : base;
  const storePrice = storeBilling?.subPrice("PRO", 100, "month") ?? null;

  const buyInStore = async () => {
    if (busy || !storeBilling) return;
    setBusy(true);
    const o = await storeBilling.buySubscription("PRO", 100, "month");
    if (!alive.current) return;
    setBusy(false);
    const tb = t.billing;
    if (o.status === "bought" || o.status === "scheduled") {
      await refresh();
      setBought(true);
    } else if (o.status === "pending") toast("info", tb.store.pending);
    else if (o.status === "unconfirmed") toast("info", tb.store.notConfirmed);
    else if (o.status === "other_account")
      toast("error", fill(tb.store.otherAccount, { account: storeBilling.store === "apple" ? tb.store.appleAccount : tb.store.googleAccount }));
    else if (o.status === "failed") toast("error", t.plans.result.checkoutBody);
  };

  useEffect(() => {
    alive.current = true;
    void (async () => {
      try {
        const s = await api.get<BillingSummary>("/v1/billing/summary");
        if (!alive.current) return;
        setTrialEligible(s.trialEligible === true);
        setDaily(isPaidPlan(s.plan) ? null : (s.daily ?? null));
      } catch {
        /* the general copy, then */
      }
      if (alive.current) setSummaryRead(true);
    })();
    return () => {
      alive.current = false;
    };
  }, [onClose]);

  const startCheckout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.post<{ url: string; eventId?: string }>("/v1/billing/checkout", {
        interval: "month",
        returnTo: currentAppPath(),
        ...getMetaClickIds(),
        impactClickId: await getImpactClickId(),
      });
      if (!alive.current) return;
      track("checkout_started", { kind: "subscription", interval: "month", eventId: res.eventId });
      flushSync(() => setBusy(false));
      goToExternalCheckout(res.url);
    } catch {
      if (!alive.current) return;
      toast("error", t.shell.upgrade.checkoutFailed);
      setBusy(false);
    }
  };

  if (bought) return <BillingCelebration kind="upgraded" plan="PRO" credits={100} onClose={onClose} />;

  // A Base UI dialog (ModalSurface): grows in from 95% and fades out, and
  // Escape, the backdrop and the ✕ all leave the same animated way.
  return (
    <ModalSurface
      onClose={onClose}
      label={copy.title}
      zIndex={110}
      testId="upgrade-modal"
      // Never taller than the window: the plan's feature list outgrew a
      // laptop's height and cut the headline off the top with no way back to
      // it. The card's list scrolls inside the card instead (scrollFeatures).
      // …nor than the room between the phone's status bar and home indicator:
      // in the app the page runs under both, and the headline and ✕ sat under
      // the clock.
      className="relative max-h-[calc(100dvh-2rem-var(--safe-top)-var(--safe-bottom-raw))] max-w-[360px] sm:max-h-[calc(100dvh-3rem-var(--safe-top)-var(--safe-bottom-raw))]"
    >
          <UpgradeClose />

          <div className={`mb-4 shrink-0 text-center transition-opacity duration-150 ${summaryRead ? "opacity-100" : "opacity-0"}`}>
            <h2
              id="upgrade-modal-title"
              className="text-[1.25rem] font-semibold tracking-tight text-white"
            >
              {copy.title}
            </h2>
            <p className="mx-auto mt-1.5 max-w-[20rem] text-[13px] leading-relaxed text-white">
              {copy.body}
            </p>
          </div>

          <PlanCard
            compact
            elevatedShell
            name="Pro"
            description={t.shell.upgrade.proDescription}
            price={storeBilling ? (storePrice ?? "…") : `$${PRO_MONTHLY_PRICE}`}
            compareAtPrice={storeBilling ? undefined : `$${PRO_COMPARE_AT_MONTHLY}`}
            period={t.shell.upgrade.perMonth}
            saveBadge={storeBilling ? "" : proSaleBadge()}
            highlightBadge={t.shell.upgrade.freeDomain}
            cta={storeBilling ? fill(t.plans.upgradeTo, { plan: "Pro" }) : proTrialCta()}
            ctaSubtext={storeBilling ? undefined : proTrialSubtext()}
            primary
            onCta={() => void (storeBilling ? buyInStore() : startCheckout())}
            // While the store's price loads, the button waits; with no price at all
            // (the store unreachable) there is nothing to buy, so it goes.
            ctaState={busy || storeBilling?.loading ? "busy" : storeBilling && !storePrice ? "disabled" : "default"}
            highlights={paidHighlights(t.plans, formatNumber(20))}
            features={proPlanFeatures(t.plans, formatNumber(100), { includesFree: false })}
            scrollFeatures
          />
          <p className="mt-3 shrink-0 text-center text-[12px] text-white/60">
            {t.plans.moreUsage}{" "}
            <ComparePlansLink label={t.plans.comparePlans} />
          </p>
    </ModalSurface>
  );
}

/**
 * Plans & credits, in place: the modal goes and the page opens in the app
 * (the phone's sheet over the chat), not a reload of the whole site.
 */
function ComparePlansLink({ label }: { label: string }) {
  const close = useSurfaceClose();
  const navigate = useNavigate();
  return (
    <a
      href="/billing?highlight=plans"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        close();
        navigate("/billing?highlight=plans");
      }}
      className="text-white underline underline-offset-2 hover:text-white/80"
    >
      {label}
    </a>
  );
}

/** Closes through the surface, so the modal animates out. */
function UpgradeClose() {
  const t = useT();
  const close = useSurfaceClose();
  return (
    <button
      type="button"
      aria-label={t.common.close}
      onClick={close}
      className="absolute -end-1 -top-1 z-10 grid size-8 place-items-center rounded-lg bg-[#1c1c1c] text-white/50 transition hover:bg-white/[0.08] hover:text-white sm:-end-2 sm:-top-2"
    >
      <X className="size-4" />
    </button>
  );
}
