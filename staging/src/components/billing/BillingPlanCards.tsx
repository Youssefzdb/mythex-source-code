import { isPaidPlan, cloudCreditsForTier, dollars, monthlyDisplayCents, PLAN_FEE_CENTS, planLabel, planPriceCents, type PaidPlan } from "../../lib/plan-tiers";
import { businessPlanFeatures, enterpriseHighlights, enterprisePlanFeatures, paidHighlights, proPlanFeatures } from "./planCopy";
import {
  BillingPeriodSwitch,
  PlanCard,
  PRO_COMPARE_AT_MONTHLY,
  PRO_MONTHLY_PRICE,
  PRO_YEARLY_PER_MONTH,
  proSaleBadge,
  proTrialCta,
  proTrialSubtext,
  proYearlySaleBadge,
  proYearlySubtext,
} from "../PricingPlans";
import { TierSelect } from "./TierSelect";
import { fill, formatNumber, useT } from "../../i18n/app";

const FG = "#ffffff";

/**
 * "Change your plan": the three paid plans. Everything on them is the site's
 * own prices and copy, so they draw without the billing summary — on the page
 * while it loads, and in the route's loading placeholder before the page's
 * code has arrived. `loading` keeps a paid plan's buttons waiting: which one
 * switches and which one subscribes depends on the subscription the summary
 * brings. `placeholder` is the loading screen's copy: nothing works yet, so
 * every button waits and the pickers are off.
 */
export function BillingPlanCards({
  plan,
  currentTier,
  currentInterval = "month",
  yearly,
  onYearlyChange,
  proTier,
  setProTier,
  bizTier,
  setBizTier,
  entTier,
  setEntTier,
  busy,
  loading,
  trialing,
  canceling,
  periodEndLabel,
  hasStripeSub,
  statusLabel,
  onChoose,
  onBookDemo,
  placeholder = false,
  store,
  locked = false,
}: {
  plan: string;
  currentTier: number;
  /**
   * The current plan's billing period: the same plan and tier billed the
   * other way is a switch, not "Current plan" (a monthly plan couldn't move
   * to yearly).
   */
  currentInterval?: "month" | "year";
  yearly: boolean;
  onYearlyChange: (yearly: boolean) => void;
  proTier: number;
  setProTier: (credits: number) => void;
  bizTier: number;
  setBizTier: (credits: number) => void;
  entTier: number;
  setEntTier: (credits: number) => void;
  busy: string | null;
  loading: boolean;
  trialing: boolean;
  canceling: boolean;
  periodEndLabel: string | null | undefined;
  hasStripeSub: boolean;
  statusLabel: string;
  onChoose: (plan: PaidPlan, credits: number) => void;
  onBookDemo: () => void;
  placeholder?: boolean;
  /**
   * Inside the iPhone and Android apps: the tiers the store sells (all up to
   * its $999.99 ceiling), at the store's prices; Enterprise keeps Book a demo
   * for the rest, as on the website. `locked`: the plan was bought on the
   * website, so the app can't change it (that would be a second subscription).
   */
  store?: {
    subPrice: (plan: string, tier: number, interval: "month" | "year") => string | null;
    tiers: (plan: string, interval?: "month" | "year") => number[];
    locked: boolean;
  };
  /** On the website: the plan was bought in the app, so no card here starts or changes one. */
  locked?: boolean;
}) {
  const t = useT();
  const tb = t.billing;
  const tp = t.billing.page;
  const proPrice = yearly ? PRO_YEARLY_PER_MONTH : PRO_MONTHLY_PRICE;
  const showSale = !isPaidPlan(plan);
  return (
    <>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold" style={{ color: FG }}>
        {tp.changePlan}
      </h2>
      <BillingPeriodSwitch yearly={yearly} onChange={onYearlyChange} />
    </div>

    <div className="mx-auto mt-6 grid w-full gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
      {(["PRO", "BUSINESS", "ENTERPRISE"] as const).map((cardPlan) => {
        const tier = cardPlan === "PRO" ? proTier : cardPlan === "BUSINESS" ? bizTier : entTier;
        const setTier = cardPlan === "PRO" ? setProTier : cardPlan === "BUSINESS" ? setBizTier : setEntTier;
        if (store) {
          // No yearly Enterprise fits under the stores' ceiling: that card stays monthly (it says "/ month").
          const interval = yearly && store.tiers(cardPlan, "year").length ? "year" : "month";
          // A tier this length isn't sold in (no yearly above $1,000): the nearest one below that is.
          const available = store.tiers(cardPlan, interval);
          const shown = available.includes(tier) ? tier : (available.filter((x) => x <= tier).pop() ?? available[0] ?? tier);
          const storePrice = store.subPrice(cardPlan, shown, interval);
          const isCurrentStore = plan === cardPlan && currentTier === shown && currentInterval === interval;
          return (
            <PlanCard
              alignWithTiers
              tallDescription
              key={cardPlan}
              compact
              name={planLabel(cardPlan)}
              description={cardPlan === "PRO" ? tp.proDescription : cardPlan === "BUSINESS" ? t.plans.businessDescription : t.plans.enterpriseDescription}
              price={storePrice ?? "…"}
              period={interval === "year" ? t.billing.store.perYear : tb.plans.perMonth}
              saveBadge=""
              statusBadge={isCurrentStore ? statusLabel : undefined}
              tierPicker={
                <TierSelect
                  id={`tier-${cardPlan}`}
                  plan={cardPlan}
                  value={shown}
                  yearly={yearly}
                  onChange={setTier}
                  disabled={placeholder || busy !== null}
                  storeOptions={available.map((credits) => ({ credits, price: store.subPrice(cardPlan, credits, interval) }))}
                  storePeriod={interval === "year" ? t.billing.store.perYear : tb.plans.perMonth}
                />
              }
              cta={isCurrentStore ? tp.currentPlan : isPaidPlan(plan) ? t.plans.switchTo : fill(t.plans.upgradeTo, { plan: planLabel(cardPlan) })}
              primary={plan === "PRO" ? cardPlan === "BUSINESS" : plan === "BUSINESS" || plan === "ENTERPRISE" ? cardPlan === "ENTERPRISE" : cardPlan === "PRO"}
              tagBadge={cardPlan === "ENTERPRISE" ? t.plans.addOnsAvailable : undefined}
              // Bigger tiers and yearly Enterprise cost more than the stores sell: a demo, as on the website.
              secondaryCta={cardPlan === "ENTERPRISE" ? { label: t.plans.bookDemo, onClick: onBookDemo } : undefined}
              reserveSecondaryCta
              ctaState={
                isCurrentStore
                  ? "current"
                  : store.locked || !storePrice
                    ? "disabled"
                    : placeholder || loading || busy === `plan:${cardPlan}`
                      ? "busy"
                      : "default"
              }
              onCta={() => {
                if (placeholder || loading || !storePrice || store.locked) return;
                onChoose(cardPlan, shown);
              }}
              // No "Pro's credit price + fee" here: the store's price is the whole price.
              highlights={paidHighlights(t.plans, formatNumber(cloudCreditsForTier(shown)))}
              features={
                cardPlan === "PRO"
                  ? proPlanFeatures(t.plans, formatNumber(shown))
                  : cardPlan === "BUSINESS"
                    ? businessPlanFeatures(t.plans, formatNumber(shown))
                    : enterprisePlanFeatures(t.plans, formatNumber(shown))
              }
            />
          );
        }
        const isCurrent = plan === cardPlan && currentTier === tier && currentInterval === (yearly ? "year" : "month");
        const onCurrentPlan = plan === cardPlan;
        const baseProOffer = cardPlan === "PRO" && tier === 100 && plan === "FREE";
        const cents = monthlyDisplayCents(cardPlan, tier, yearly);
        return (
          <PlanCard
        alignWithTiers
        tallDescription
            key={cardPlan}
            compact
            name={planLabel(cardPlan)}
            description={
              onCurrentPlan && trialing && canceling && periodEndLabel
                ? fill(tp.proTrialCanceled, { date: periodEndLabel })
                : onCurrentPlan && trialing && periodEndLabel
                  ? fill(tp.proTrialActive, { date: periodEndLabel, price: PRO_MONTHLY_PRICE })
                  : onCurrentPlan && canceling && periodEndLabel
                    ? fill(tp.proActiveThrough, { date: periodEndLabel })
                    : cardPlan === "PRO"
                      ? tp.proDescription
                      : cardPlan === "BUSINESS"
                        ? t.plans.businessDescription
                        : t.plans.enterpriseDescription
            }
            price={baseProOffer ? `$${proPrice}` : dollars(cents)}
            compareAtPrice={
              baseProOffer
                ? showSale
                  ? `$${PRO_COMPARE_AT_MONTHLY}`
                  : undefined
                : yearly
                  ? dollars(planPriceCents(cardPlan, tier, "month"))
                  : undefined
            }
            period={yearly ? tb.plans.perMonthBilledAnnually : tb.plans.perMonth}
            saveBadge={baseProOffer && showSale ? (yearly ? proYearlySaleBadge(t) : proSaleBadge(t)) : ""}
            statusBadge={isCurrent ? statusLabel : undefined}
            statusCanceling={isCurrent && canceling}
            tierPicker={
              <TierSelect
                id={`tier-${cardPlan}`}
                plan={cardPlan}
                value={tier}
                yearly={yearly}
                onChange={setTier}
                disabled={placeholder || busy !== null}
                baseTierPrice={cardPlan === "PRO" && plan === "FREE" ? `$${proPrice}` : undefined}
              />
            }
            cta={
              isCurrent
                ? canceling
                  ? periodEndLabel
                    ? fill(tp.until, { date: periodEndLabel })
                    : tb.status.canceling
                  : trialing
                    ? periodEndLabel
                      ? fill(tp.trialUntil, { date: periodEndLabel })
                      : tp.onTrial
                    : tp.currentPlan
                : isPaidPlan(plan) && hasStripeSub
                  ? t.plans.switchTo
                  : baseProOffer
                    ? proTrialCta(t)
                    : fill(t.plans.upgradeTo, { plan: planLabel(cardPlan) })
            }
            ctaSubtext={
              baseProOffer
                ? yearly
                  ? proYearlySubtext(t)
                  : proTrialSubtext(t)
                : yearly
                  ? fill(t.plans.billedYearly, { total: dollars(planPriceCents(cardPlan, tier, "year")) })
                  : undefined
            }
            // The step up from where you are is the one in colour.
            primary={plan === "PRO" ? cardPlan === "BUSINESS" : plan === "BUSINESS" || plan === "ENTERPRISE" ? cardPlan === "ENTERPRISE" : cardPlan === "PRO"}
            tagBadge={cardPlan === "ENTERPRISE" ? t.plans.addOnsAvailable : undefined}
            secondaryCta={cardPlan === "ENTERPRISE" ? { label: t.plans.bookDemo, onClick: onBookDemo } : undefined}
            reserveSecondaryCta
            ctaState={
              isCurrent
                ? "current"
                : locked
                  ? "disabled"
                  : placeholder || busy === `plan:${cardPlan}` || (loading && isPaidPlan(plan))
                  ? // On a paid plan, which button means "switch" and which
                    // "subscribe" depends on the subscription the summary
                    // brings — a click before it could open a second one.
                    "busy"
                  : "default"
            }
            onCta={() => {
              if (placeholder || (loading && isPaidPlan(plan))) return;
              onChoose(cardPlan, tier);
            }}
            highlights={
              cardPlan === "ENTERPRISE"
                ? enterpriseHighlights(t.plans, dollars(PLAN_FEE_CENTS.ENTERPRISE))
                : paidHighlights(t.plans, formatNumber(cloudCreditsForTier(tier)), cardPlan === "BUSINESS" ? dollars(PLAN_FEE_CENTS.BUSINESS) : undefined)
            }
            features={
              cardPlan === "PRO"
                ? proPlanFeatures(t.plans, formatNumber(tier))
                : cardPlan === "BUSINESS"
                  ? businessPlanFeatures(t.plans, formatNumber(tier))
                  : enterprisePlanFeatures(t.plans, formatNumber(tier))
            }
          />
        );
      })}
    </div>
    </>
  );
}
