import { useState } from "react";
import { isPaidPlan } from "../../lib/plan-tiers";
import { Minus, Plus } from "lucide-react";
import { api } from "../../lib/api";
import { track, getMetaClickIds, getImpactClickId } from "../../lib/analytics";
import { currentAppPath, goToExternalCheckout } from "../../lib/external-checkout";
import { formatCredits } from "../../lib/tokens";
import { BILLING_CARD } from "./BillingShell";
import { SELECT_FIELD_STYLE } from "../ui/DescribedSelect";
import { Spinner, useToast } from "../ui";
import { proTrialCta } from "../PricingPlans";
import { appT, fill, formatNumber, useT } from "../../i18n/app";
import { rich } from "../../i18n/app/rich";
import { BillingResultModal } from "./BillingResultModal";

const PACK_CREDITS = 50;
const PACK_CENTS = 1500;
const MAX_PACKS = 20;

const PRESETS = [1, 2, 4] as const;

export function CreditTopUp({
  plan,
  balanceCredits,
  packCredits = PACK_CREDITS,
  packCents = PACK_CENTS,
  maxPacks = MAX_PACKS,
  highlight = false,
  onUpgrade,
  store,
}: {
  plan: "FREE" | "PRO";
  balanceCredits: number;
  packCredits?: number;
  packCents?: number;
  maxPacks?: number;
  highlight?: boolean;
  onUpgrade?: () => void;
  /** Inside the app: the three packs its store sells, at the store's prices, bought through it. */
  store?: { packPrice: (packs: number) => string | null; buy: (packs: number) => Promise<void> };
}) {
  const [packs, setPacks] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  // Checkout for credits didn't open: say so in the result card, with Try again.
  const [checkoutFailed, setCheckoutFailed] = useState(false);
  const toast = useToast();
  const t = useT();
  const tt = t.billing.topUp;
  const totalCredits = packs * packCredits;
  const totalUsd = (packs * packCents) / 100;

  const upgrade = async () => {
    if (onUpgrade) {
      onUpgrade();
      return;
    }
    setBusy("upgrade");
    try {
      const res = await api.post<{ url: string; eventId?: string }>("/v1/billing/checkout", {
        returnTo: currentAppPath(),
        ...getMetaClickIds(),
        impactClickId: await getImpactClickId(),
      });
      track("checkout_started", { kind: "subscription", eventId: res.eventId });
      goToExternalCheckout(res.url);
    } catch {
      toast("error", appT().billing.checkoutFailed);
      setBusy(null);
    }
  };

  const buyCredits = async () => {
    if (!isPaidPlan(plan)) {
      void upgrade();
      return;
    }
    if (store) {
      setBusy("topup");
      try {
        await store.buy(packs);
      } finally {
        setBusy(null);
      }
      return;
    }
    setBusy("topup");
    try {
      const res = await api.post<{ url: string; eventId?: string }>("/v1/billing/topup", {
        packs,
        returnTo: currentAppPath(),
        ...getMetaClickIds(),
      });
      track("view_content", { kind: "topup", packs });
      track("checkout_started", { kind: "topup", packs, eventId: res.eventId });
      goToExternalCheckout(res.url);
    } catch (err) {
      setBusy(null);
      if (err && typeof err === "object" && "error" in err && (err as { error: string }).error === "pro_required") {
        toast("error", appT().billing.topUp.proRequired);
        return;
      }
      setCheckoutFailed(true);
    }
  };

  return (
    <section
      id="pricing-topup"
      className="rounded-[16px] border border-line p-5 sm:p-6"
      style={{
        background: BILLING_CARD,
        boxShadow: highlight ? "0 0 0 1px rgba(255,255,255,0.22)" : undefined,
      }}
      data-testid="credit-topup"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">{tt.title}</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {/* In the app the price is the store's, on the Buy button: never the website's dollars. */}
            {store ? null : isPaidPlan(plan)
              ? fill(tt.packPrice, { credits: formatNumber(packCredits) })
              : tt.availableOnPro}
          </p>
        </div>
        <p className="text-[13px] text-muted">
          {rich(tt.balance, {
            b: (s) => (
              <span className="font-medium text-white">
                {fill(s, { credits: formatCredits(balanceCredits) })}
              </span>
            ),
          })}
        </p>
      </div>

      {!isPaidPlan(plan) ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">{tt.claimToPurchase}</p>
          <button
            type="button"
            onClick={() => void upgrade()}
            disabled={busy === "upgrade"}
            className="rounded-[8px] bg-white px-4 py-2 text-sm font-medium text-[#141413] transition hover:bg-[#f0ebe3] disabled:opacity-60"
          >
            {busy === "upgrade" ? <Spinner size={16} /> : proTrialCta(t)}
          </button>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((n) => {
              const selected = packs === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPacks(n)}
                  className={`relative h-8 overflow-hidden rounded-[8px] px-3 text-sm transition ${
                    selected ? "text-white" : "text-muted hover:text-white"
                  }`}
                  style={
                    selected
                      ? SELECT_FIELD_STYLE
                      : { background: "transparent", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.1)" }
                  }
                >
                  {formatNumber(n * packCredits)}
                </button>
              );
            })}

            {!store && (
            <div
              className="ms-1 flex h-8 items-center gap-1 overflow-hidden rounded-[8px] px-1"
              style={SELECT_FIELD_STYLE}
            >
              <button
                type="button"
                aria-label={tt.fewerPacks}
                disabled={packs <= 1}
                onClick={() => setPacks((p) => Math.max(1, p - 1))}
                className="grid size-7 place-items-center rounded-[6px] text-white transition hover:bg-white/[0.06] disabled:opacity-35"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[2.5rem] text-center text-sm font-normal text-white">
                {packs}
              </span>
              <button
                type="button"
                aria-label={tt.morePacks}
                disabled={packs >= maxPacks}
                onClick={() => setPacks((p) => Math.min(maxPacks, p + 1))}
                className="grid size-7 place-items-center rounded-[6px] text-white transition hover:bg-white/[0.06] disabled:opacity-35"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void buyCredits()}
            disabled={busy === "topup" || (store !== undefined && !store.packPrice(packs))}
            // Not dimmed while it spins: on iPhone the fade repainted only where the
            // label had been, a grey box around the spinner.
            className={`inline-flex h-10 shrink-0 items-center justify-center rounded-[8px] bg-white px-5 text-sm font-semibold text-[#141413] transition hover:bg-[#f0ebe3] ${busy === "topup" ? "" : "disabled:opacity-60"}`}
          >
            {busy === "topup" ? (
              <Spinner size={16} />
            ) : store ? (
              fill(t.billing.store.buy, { credits: formatCredits(totalCredits), price: store.packPrice(packs) ?? "…" })
            ) : (
              fill(tt.buy, { credits: formatCredits(totalCredits), price: totalUsd.toFixed(0) })
            )}
          </button>
        </div>
      )}
      {checkoutFailed && (
        <BillingResultModal
          tone="fail"
          title={t.plans.result.checkoutTitle}
          body={t.plans.result.checkoutBody}
          primary={{ label: t.plans.result.tryAgain, busy: busy === "topup", onClick: () => { setCheckoutFailed(false); void buyCredits(); } }}
          secondary={{ label: t.plans.result.notNow, onClick: () => setCheckoutFailed(false) }}
          onClose={() => setCheckoutFailed(false)}
        />
      )}
    </section>
  );
}
