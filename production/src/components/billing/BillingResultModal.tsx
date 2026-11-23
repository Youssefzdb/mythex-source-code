import type { ReactNode } from "react";
import { CreditCard } from "lucide-react";
import { ModalSurface, useSurfaceClose } from "../ui/Sheet";
import { MythexMark } from "../mythex-mark";
import { formatCredits } from "../../lib/tokens";
import { fill, useT } from "../../i18n/app";
import { rich } from "../../i18n/app/rich";

/**
 * How a plan change or a top-up went, said in the same card as the welcome to
 * Pro (BillingCelebration): what happened, what it did to your credits, and
 * the next step — not a toast that is gone before it's read. A declined card
 * says nothing was charged and goes straight to updating it.
 */
export type BillingResultAction = { label: string; onClick: () => void; busy?: boolean };

export function BillingResultModal({
  tone,
  title,
  body,
  balanceCredits,
  primary,
  secondary,
  onClose,
}: {
  tone: "success" | "fail";
  title: string;
  body: ReactNode;
  balanceCredits?: number;
  /** The main button. Without one it's a Continue that closes. */
  primary?: BillingResultAction;
  secondary?: BillingResultAction;
  onClose: () => void;
}) {
  const t = useT();
  const balance =
    typeof balanceCredits === "number" && Number.isFinite(balanceCredits) ? formatCredits(balanceCredits) : null;

  return (
    <ModalSurface
      onClose={onClose}
      label={title}
      zIndex={60}
      testId={tone === "success" ? "billing-result-success" : "billing-result-fail"}
      className="billing-celebrate-card relative max-w-[26rem] overflow-hidden rounded-2xl border border-line px-7 py-9 text-center sm:px-9 sm:py-10"
      style={{
        background: "#1c1c1c",
        boxShadow: "0 0 0 0.5px var(--mx-ring), 0 0 0 1px var(--mx-ring-outer), 0 24px 80px -24px rgba(0,0,0,0.75)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-40"
        style={{
          background:
            tone === "success"
              ? "radial-gradient(ellipse 70% 80% at 50% -10%, rgba(196, 92, 106, 0.18), transparent 65%)"
              : "radial-gradient(ellipse 70% 80% at 50% -10%, rgba(239, 68, 68, 0.14), transparent 65%)",
        }}
        aria-hidden
      />

      <div className="billing-celebrate-mark relative mx-auto mb-6 grid place-items-center">
        {tone === "success" ? (
          <MythexMark size={72} />
        ) : (
          <div className="grid h-[72px] w-[72px] place-items-center rounded-2xl border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)]">
            <CreditCard className="h-8 w-8 text-[#f87171]" strokeWidth={1.75} aria-hidden />
          </div>
        )}
      </div>

      <h2 className="billing-celebrate-title relative text-[1.6rem] leading-tight font-semibold tracking-tight text-white">
        {title}
      </h2>
      <div className="relative mx-auto mt-2.5 max-w-[21rem] text-[15px] leading-relaxed text-muted">{body}</div>

      {balance != null && (
        <p className="billing-celebrate-balance relative mt-5 text-sm text-muted">
          {rich(t.billing.celebration.balance, {
            b: (s) => <span className="font-semibold text-white tabular-nums">{fill(s, { credits: balance })}</span>,
          })}
        </p>
      )}

      <ResultActions primary={primary} secondary={secondary} continueLabel={t.common.continue} />
    </ModalSurface>
  );
}

function ResultActions({
  primary,
  secondary,
  continueLabel,
}: {
  primary?: BillingResultAction;
  secondary?: BillingResultAction;
  continueLabel: string;
}) {
  const close = useSurfaceClose();
  return (
    <div className="relative mt-8 flex flex-col gap-2">
      <button
        type="button"
        disabled={primary?.busy}
        onClick={primary ? primary.onClick : close}
        className="billing-celebrate-cta w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#141413] transition hover:bg-[#f0ebe3] active:scale-[0.99] disabled:opacity-60"
      >
        {primary?.label ?? continueLabel}
      </button>
      {secondary && (
        <button
          type="button"
          disabled={secondary.busy}
          onClick={secondary.onClick}
          className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-muted transition hover:bg-white/[0.04] hover:text-white disabled:opacity-60"
        >
          {secondary.label}
        </button>
      )}
    </div>
  );
}
