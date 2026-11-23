import { ModalSurface, useSurfaceClose } from "./ui/Sheet";
import { MythexMark } from "./mythex-mark";
import { formatCredits } from "../lib/tokens";
import { fill, formatNumber, useT } from "../i18n/app";
import { planLabel } from "../lib/plan-tiers";
import { rich } from "../i18n/app/rich";

export type BillingCelebrationKind = "upgraded" | "topup";

export function BillingCelebration({
  kind,
  balanceCredits,
  plan,
  credits,
  onClose,
}: {
  kind: BillingCelebrationKind;
  balanceCredits?: number;
  /** The plan and monthly credits bought (a plan, not a pack); Pro 100 when not known. */
  plan?: string;
  credits?: number;
  onClose: () => void;
}) {
  const isUpgrade = kind === "upgraded";
  const t = useT();
  const tc = t.billing.celebration;
  const title = !isUpgrade
    ? tc.creditsAdded
    : plan && plan !== "PRO"
      ? fill(t.plans.result.switchedTitle, { plan: planLabel(plan) })
      : tc.welcomeToPro;
  const balance =
    typeof balanceCredits === "number" && Number.isFinite(balanceCredits)
      ? formatCredits(balanceCredits)
      : null;

  return (
    <ModalSurface
      onClose={onClose}
      label={title}
      zIndex={60}
      testId="billing-celebration"
      // Its own entrance (a longer rise, the contents staggered in after it);
      // Base UI's exit fades it out.
      className="billing-celebrate-card relative max-w-[26rem] overflow-hidden rounded-2xl border border-line px-7 py-9 text-center sm:px-9 sm:py-10"
      style={{
        background: "#1c1c1c",
        boxShadow: "0 0 0 0.5px var(--mx-ring), 0 0 0 1px var(--mx-ring-outer), 0 24px 80px -24px rgba(0,0,0,0.75)",
      }}
    >
      {/* Soft brand wash — not a glow stack */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-40"
        style={{
          background:
            "radial-gradient(ellipse 70% 80% at 50% -10%, rgba(196, 92, 106, 0.18), transparent 65%)",
        }}
        aria-hidden
      />

      <div className="billing-celebrate-mark relative mx-auto mb-6 grid place-items-center">
        <MythexMark size={72} />
      </div>

      <h2
        id="billing-celebrate-title"
        className="billing-celebrate-title relative text-[1.75rem] leading-tight font-semibold tracking-tight text-white"
      >
        {title}
      </h2>
      <p className="relative mx-auto mt-2.5 max-w-[20rem] text-[15px] leading-relaxed text-muted">
        {isUpgrade
          ? fill(tc.proReady, { credits: formatNumber(credits ?? 100) })
          : tc.packAdded}
      </p>

      {balance != null && !(isUpgrade && (balanceCredits ?? 0) <= 0) && (
        <p className="billing-celebrate-balance relative mt-5 text-sm text-muted">
          {rich(tc.balance, {
            b: (s) => (
              <span className="font-semibold text-white tabular-nums">{fill(s, { credits: balance })}</span>
            ),
          })}
        </p>
      )}

      <CelebrationCta label={isUpgrade ? tc.startBuilding : t.common.continue} />
    </ModalSurface>
  );
}

function CelebrationCta({ label }: { label: string }) {
  const close = useSurfaceClose();
  return (
    <button
      type="button"
      onClick={close}
      className="billing-celebrate-cta relative mt-8 w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#141413] transition hover:bg-[#f0ebe3] active:scale-[0.99]"
    >
      {label}
    </button>
  );
}
