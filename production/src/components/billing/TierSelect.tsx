import { dollars, monthlyDisplayCents, tierDiscount, tiersFor, type PaidPlan } from "../../lib/plan-tiers";
import { fill, formatNumber } from "../../i18n/app";
import { usePageT } from "../../i18n/usePageT";
import type { LocaleCode } from "../../i18n/locales";
import type { PlansCopy } from "./planCopy";
import { PRICING } from "../PricingPlans";
import { DescribedSelect } from "../ui/DescribedSelect";

/**
 * Credits a month for a paid plan — laid out like Lovable's: the field says
 * "100 monthly credits" (the price is the card's headline), and each menu row
 * has the credits, a "Save x%" pill on the bigger tiers, and the price a month.
 * Our own select (DescribedSelect), 40px to sit level with the card's button.
 */
export function TierSelect({
  plan,
  value,
  onChange,
  yearly = false,
  disabled = false,
  baseTierPrice,
  copy,
  locale,
  storeOptions,
  storePeriod,
}: {
  plan: PaidPlan;
  value: number;
  onChange: (credits: number) => void;
  yearly?: boolean;
  disabled?: boolean;
  id?: string;
  /** The 100-credit tier's price when the card shows an offer for it (Pro's sale), so the two agree. */
  baseTierPrice?: string;
  /** The landing page's own catalog and language (it follows its URL); the app's otherwise. */
  copy?: PlansCopy;
  locale?: LocaleCode;
  /** In the app: only the tiers its store sells, at the store's own prices (null while they load). */
  storeOptions?: { credits: number; price: string | null }[];
  /** After a store price: "/ month" or "/ year". */
  storePeriod?: string;
}) {
  const t = usePageT();
  const p = copy ?? t.plans;
  if (storeOptions) {
    const options = storeOptions.map(({ credits, price }) => {
      const n = formatNumber(credits, undefined, locale);
      return {
        id: String(credits),
        label: fill(p.tierRow, { credits: n }),
        triggerLabel: fill(p.tierTrigger, { credits: n }),
        trailing: (
          <span className="text-[13px] tabular-nums text-white/70">
            {price ?? "…"}
            <span className="text-[11px] text-white/45"> {storePeriod}</span>
          </span>
        ),
      };
    });
    return (
      <DescribedSelect
        value={String(value)}
        options={options}
        onChange={(v) => onChange(Number(v))}
        ariaLabel={p.tierLabel}
        fullWidth
        size="lg"
        wideMenu
        disabled={disabled}
        className="w-full"
      />
    );
  }
  // Enterprise starts at 800; the discount is on the credits, the same on every plan.
  const options = tiersFor(plan).map((credits) => {
    const off = tierDiscount(credits);
    const n = formatNumber(credits, undefined, locale);
    const price = credits === 100 && baseTierPrice ? baseTierPrice : dollars(monthlyDisplayCents(plan, credits, yearly));
    return {
      id: String(credits),
      label: fill(p.tierRow, { credits: n }),
      triggerLabel: fill(p.tierTrigger, { credits: n }),
      trailing: (
        <>
          {off ? (
            <span
              className="rounded-full px-1.5 py-0.5 text-[11px] font-medium"
              style={{ background: PRICING.successBg, color: PRICING.successFg }}
            >
              {fill(p.tierSaves, { percent: formatNumber(off, undefined, locale) })}
            </span>
          ) : null}
          <span className="text-[13px] tabular-nums text-white/70">
            {price}
            <span className="text-[11px] text-white/45"> {p.tierPerMonth}</span>
          </span>
        </>
      ),
    };
  });
  return (
    <DescribedSelect
      value={String(value)}
      options={options}
      onChange={(v) => onChange(Number(v))}
      ariaLabel={p.tierLabel}
      fullWidth
      size="lg"
      wideMenu
      disabled={disabled}
      className="w-full"
    />
  );
}
