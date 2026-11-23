import { useState } from "react";
import { CreditCard, ExternalLink, TriangleAlert } from "lucide-react";
import { api } from "../../lib/api";
import { track } from "../../lib/analytics";
import { goToExternalCheckout } from "../../lib/external-checkout";
import { formatCredits } from "../../lib/tokens";
import type { AutoReloadDisabledReason, AutoReloadSettings } from "../../lib/billing";
import { BILLING_CARD } from "./BillingShell";
import { SELECT_FIELD_STYLE } from "../ui/DescribedSelect";
import { Spinner, useToast } from "../ui";
import { appT, fill, formatNumber, useT, type AppMessages } from "../../i18n/app";

const THRESHOLD_CHOICES = [5, 10, 25, 50] as const;
const CAP_CHOICES_CENTS = [7_500, 15_000, 30_000, 60_000] as const;

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

/** What we tell someone whose auto-reload we switched off for them. */
function disabledCopy(reason: AutoReloadDisabledReason, t: AppMessages): string | null {
  const a = t.billing.autoReload;
  switch (reason) {
    case "card_declined":
      return a.cardDeclined;
    case "authentication_required":
      return a.authenticationRequired;
    case "no_card":
      return a.noCard;
    // A retryable failure leaves auto-reload on; nothing to explain.
    case "retryable":
      return null;
  }
}

/**
 * Auto-reload — buy credits automatically before the balance hits zero.
 *
 * The spend limit is shown with the same weight as the trigger, not tucked
 * behind an "advanced" disclosure. It is the only thing standing between a
 * runaway build loop and a drained card, and someone switching this on
 * deserves to see the worst case at the moment they agree to it.
 */
export function AutoReload({
  settings,
  packCredits,
  packCents,
  maxPacks,
  onChange,
}: {
  settings: AutoReloadSettings;
  packCredits: number;
  packCents: number;
  maxPacks: number;
  onChange: (next: AutoReloadSettings) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const t = useT();
  const ta = t.billing.autoReload;

  const save = async (patch: Record<string, unknown>, key: string) => {
    setBusy(key);
    try {
      const next = await api.put<AutoReloadSettings>("/v1/billing/auto-reload", patch);
      onChange(next);
      if (patch.enabled !== undefined) {
        track("auto_reload_toggled", { enabled: Boolean(patch.enabled) });
      }
    } catch (err) {
      const code =
        err && typeof err === "object" && "error" in err ? (err as { error: string }).error : "";
      toast(
        "error",
        code === "no_card"
          ? appT().billing.autoReload.addCardFirst
          : code === "cap_below_pack"
            ? appT().billing.autoReload.capBelowPack
            : appT().billing.autoReload.saveFailed,
      );
    } finally {
      setBusy(null);
    }
  };

  /**
   * Cards live in the Stripe portal — adding, removing and re-defaulting all
   * happen there. It already enforces the rules we would get wrong, like
   * refusing to delete the card an active subscription depends on.
   */
  const manageCards = async () => {
    setBusy("portal");
    try {
      const res = await api.post<{ url: string }>("/v1/billing/portal", { intent: "manage" });
      track("auto_reload_manage_cards", {});
      goToExternalCheckout(res.url);
    } catch {
      toast("error", appT().billing.autoReload.stripeFailed);
      setBusy(null);
    }
  };

  const reloadCents = settings.packs * packCents;
  const reloadCredits = settings.packs * packCredits;
  const capNote = disabledCopy(settings.disabledReason ?? "retryable", t);
  const atCap = settings.spentThisMonthCents + packCents > settings.monthlyCapCents;
  const capPct = Math.min(
    100,
    Math.round((settings.spentThisMonthCents / settings.monthlyCapCents) * 100),
  );

  return (
    <section
      id="auto-reload"
      className="rounded-[16px] border border-line p-5 sm:p-6"
      style={{ background: BILLING_CARD }}
      data-testid="auto-reload"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[34rem]">
          <h2 className="text-base font-semibold text-white">{ta.title}</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {ta.description}
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={settings.enabled}
          aria-label={ta.title}
          data-testid="auto-reload-toggle"
          disabled={busy !== null || (!settings.hasCard && !settings.enabled)}
          onClick={() => void save({ enabled: !settings.enabled }, "toggle")}
          className="relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40"
          style={{
            background: settings.enabled ? "#ffffff" : "rgba(255,255,255,0.14)",
            boxShadow: settings.enabled ? undefined : "inset 0 0 0 1px rgba(255,255,255,0.1)",
          }}
        >
          <span
            className="absolute top-[3px] size-[18px] rounded-full transition-all"
            style={{
              insetInlineStart: settings.enabled ? 23 : 3,
              background: settings.enabled ? "#141413" : "rgba(255,255,255,0.75)",
            }}
          />
        </button>
      </div>

      {settings.disabledReason && capNote && (
        <div
          className="mt-4 flex items-start gap-2 rounded-[10px] px-3 py-2.5"
          style={{ background: "rgba(248,113,113,0.08)", boxShadow: "inset 0 0 0 1px rgba(248,113,113,0.22)" }}
          data-testid="auto-reload-warning"
        >
          <TriangleAlert className="mt-px h-4 w-4 shrink-0 text-[#f87171]" />
          <p className="text-[13px] leading-relaxed text-[#fca5a5]">{capNote}</p>
        </div>
      )}

      {!settings.hasCard ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {ta.addPaymentMethodHint}
          </p>
          <button
            type="button"
            onClick={() => void manageCards()}
            disabled={busy !== null}
            data-testid="auto-reload-add-card"
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-white px-5 text-sm font-semibold text-[#141413] transition hover:bg-[#f0ebe3] disabled:opacity-60"
          >
            {busy === "portal" ? <Spinner size={16} /> : <CreditCard className="h-4 w-4" />}
            {ta.addPaymentMethod}
          </button>
        </div>
      ) : settings.enabled ? (
        // The settings only while it's on: off, the card is the switch and one line.
        <>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field label={ta.whenBelow}>
              <Choices
                values={[...THRESHOLD_CHOICES]}
                selected={settings.thresholdCredits}
                disabled={busy !== null}
                format={(n) => formatNumber(n)}
                onPick={(n) => void save({ thresholdCredits: n }, "threshold")}
              />
              <p className="mt-2 text-[12px] text-muted">
                {fill(ta.currently, { credits: formatCredits(settings.thresholdCredits) })}
              </p>
            </Field>

            <Field label={ta.buy}>
              <Choices
                values={[1, 2, 4, 10].filter((n) => n <= maxPacks)}
                selected={settings.packs}
                disabled={busy !== null}
                format={(n) => formatNumber(n * packCredits)}
                onPick={(n) => void save({ packs: n }, "packs")}
              />
              <p className="mt-2 text-[12px] text-muted">
                {fill(ta.perReload, { price: usd(reloadCents) })}
              </p>
            </Field>
          </div>

          <div className="mt-6 rounded-[12px] p-4" style={{ background: "rgba(255,255,255,0.025)" }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">{ta.neverSpendMore}</p>
                <p className="mt-0.5 text-[12px] text-muted">
                  {ta.perMonthAcross}
                </p>
              </div>
              <Choices
                values={[...CAP_CHOICES_CENTS].filter(
                  (c) => c >= settings.minCapCents && c <= settings.maxCapCents,
                )}
                selected={settings.monthlyCapCents}
                disabled={busy !== null}
                format={usd}
                onPick={(c) => void save({ monthlyCapCents: c }, "cap")}
              />
            </div>

            <div className="mt-3.5">
              <div
                className="h-1.5 w-full overflow-hidden rounded-full"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${capPct}%`,
                    background: atCap ? "#f87171" : "rgba(255,255,255,0.55)",
                  }}
                />
              </div>
              <p className="mt-2 text-[12px] text-muted" data-testid="auto-reload-spent">
                {fill(atCap ? ta.spentThisMonthPaused : ta.spentThisMonth, {
                  spent: usd(settings.spentThisMonthCents),
                  cap: usd(settings.monthlyCapCents),
                })}
              </p>
            </div>
          </div>

          {/* Payment method: what gets charged, and one way out to Stripe. */}
          <div
            className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[12px] p-4"
            style={{ background: "rgba(255,255,255,0.025)" }}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="grid size-9 shrink-0 place-items-center rounded-[8px]"
                style={{ background: "rgba(255,255,255,0.06)" }}
              >
                <CreditCard className="h-4 w-4 text-white" />
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium text-white">
                  <span data-testid="auto-reload-card">
                    {settings.cardBrand && settings.cardLast4 ? (
                      <>
                        <span className="capitalize">{settings.cardBrand}</span>{" "}
                        <span dir="ltr">•••• {settings.cardLast4}</span>
                      </>
                    ) : (
                      ta.paymentMethod
                    )}
                  </span>
                  <span
                    className="rounded-[5px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted"
                    style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)" }}
                  >
                    {ta.default}
                  </span>
                </p>
                <p className="mt-0.5 text-[12px] text-muted">
                  {settings.enabled
                    ? fill(ta.chargedWhenBelow, {
                        price: usd(reloadCents),
                        credits: formatCredits(reloadCredits),
                        threshold: formatCredits(settings.thresholdCredits),
                      })
                    : ta.usedForSubscription}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void manageCards()}
              disabled={busy !== null}
              data-testid="auto-reload-manage-cards"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[8px] px-4 text-sm font-normal text-white transition hover:brightness-110 disabled:opacity-60"
              style={SELECT_FIELD_STYLE}
            >
              {busy === "portal" ? <Spinner size={16} /> : ta.manageInStripe}
              {busy !== "portal" && <ExternalLink className="h-3.5 w-3.5 text-muted" />}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium text-white">{label}</p>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function Choices<T extends number>({
  values,
  selected,
  disabled,
  format,
  onPick,
}: {
  values: T[];
  selected: number;
  disabled: boolean;
  format: (v: T) => string;
  onPick: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {values.map((v) => {
        const on = v === selected;
        return (
          <button
            key={v}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onPick(v)}
            className={`h-8 overflow-hidden rounded-[8px] px-3 text-sm transition disabled:opacity-50 ${
              on ? "text-white" : "text-muted hover:text-white"
            }`}
            style={
              on
                ? SELECT_FIELD_STYLE
                : { background: "transparent", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.1)" }
            }
          >
            {format(v)}
          </button>
        );
      })}
    </div>
  );
}
