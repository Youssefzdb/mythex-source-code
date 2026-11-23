import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isPaidPlan } from "../lib/plan-tiers";
import { CREDIT_BAR } from "../lib/credit-meter";
import { InfoTip } from "../components/ui/InfoTip";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight, ExternalLink } from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, ApiError } from "../lib/api";
import { track, getMetaClickIds, getImpactClickId } from "../lib/analytics";
import { currentAppPath, goToExternalCheckout } from "../lib/external-checkout";
import { useAuth } from "../lib/auth";
import type { BillingSummary } from "../lib/billing";
import { formatCredits } from "../lib/tokens";
import { BillingShell, BILLING_CARD, scrollBillingTo } from "../components/billing/BillingShell";
import { CreditTopUp } from "../components/billing/CreditTopUp";
import { BillingResultModal } from "../components/billing/BillingResultModal";
import { BillingCelebration, type BillingCelebrationKind } from "../components/BillingCelebration";
import { AutoReload } from "../components/billing/AutoReload";
import { SELECT_FIELD_STYLE } from "../components/ui/DescribedSelect";
import { MythexMark } from "../components/mythex-mark";
import { BillingPlanCards } from "../components/billing/BillingPlanCards";
import { CREDIT_TIERS, dollars, planLabel, planPriceCents, type PaidPlan } from "../lib/plan-tiers";
import { PRICING, PRO_MONTHLY_PRICE, PRO_YEARLY_PER_MONTH } from "../components/PricingPlans";
import { trialDaysRemaining } from "../lib/pro-trial";
import { ConfirmDialog, Spinner, useToast } from "../components/ui";
import { DowngradeImpactList, type PlanDropImpact } from "../components/settings/DowngradeImpact";
import { BillingPageSkeleton } from "../components/loading";
import { useStoreBilling, type PurchaseOutcome } from "../lib/store-purchases";
import { appT, fill, formatDate, formatNumber, pl, useT } from "../i18n/app";
import { rich } from "../i18n/app/rich";

const DOCS = "https://docs.mythex.ai/billing/credits";
const FG = "#ffffff";
const FG_MUTED = "oklch(72.34% 0.002 107)";
const FG_DIM = "oklch(72.34% 0.002 107)";
/** `2026-06-26` → `Jun 26`, in the app's language. */
function formatAxisDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return formatDate(Date.UTC(y, m - 1, d), { month: "short", day: "numeric", timeZone: "UTC" }) || iso;
}

/** Unix seconds → `Jul 25, 2026` for cancel-at-period-end copy. */
function formatPeriodEnd(unix: number | null | undefined): string | null {
  if (!unix) return null;
  const d = new Date(unix * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return formatDate(d, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}


type PlanChangeFailure = "card_declined" | "no_card" | "other";
type PlanChoice = { plan: PaidPlan; credits: number; interval?: "month" | "year" };
type PlanChangeResult =
  | {
      tone: "success";
      change: PlanChoice;
      from: PlanChoice;
      grantedCredits: number;
      upgrade: boolean;
      /** In the app: the store's price ("AED 91.99/month"), not the website's dollars. */
      priceLabel?: string;
      /** In the app, a move down: the store starts it at the next renewal, so the plan hasn't changed yet. */
      scheduled?: boolean;
    }
  | { tone: "fail"; change: PlanChoice; from: PlanChoice; reason: PlanChangeFailure };

export function BillingPage() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const t = useT();
  const tb = t.billing;
  const tp = t.billing.page;
  const [params, setParams] = useSearchParams();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [yearly, setYearly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const viewedPricing = useRef(false);
  const highlightTopup =
    params.get("topup") === "1" || params.get("highlight") === "credits";
  const highlightPlans = params.get("highlight") === "plans";

  const plan = summary?.plan ?? user?.plan ?? "FREE";
  const balanceCredits =
    summary?.balanceCredits ??
    (typeof summary?.balanceTokens === "number" ? summary.balanceTokens / 1000 : user?.balanceCredits ?? 0);
  const daily = summary?.daily;
  // Pro includes the workspace, so — as on the usage page — it's left out here.
  const rawPreview = summary?.usagePreview;
  const preview =
    rawPreview && isPaidPlan(summary?.plan)
      ? {
          totalCredits:
            Math.round(
              (rawPreview.totalCredits - rawPreview.days.reduce((s, d) => s + (d.workspace ?? 0), 0)) * 100,
            ) / 100,
          days: rawPreview.days.map((d) => ({ ...d, build: Math.max(0, d.build - (d.workspace ?? 0)), workspace: 0 })),
          topProjects: rawPreview.topProjects
            .map((p) => ({ ...p, total: Math.round((p.total - (p.categories?.workspace ?? 0)) * 100) / 100 }))
            .filter((p) => p.total > 0)
            .sort((a, b) => b.total - a.total),
        }
      : rawPreview;
  const subscription = summary?.subscription;
  // A plan bought in the app is cancelled in Apple's or Google's settings:
  // its auto-renew off is this page's Canceling, through the period it paid for.
  const storeSub = !subscription ? (summary?.storeBilled ?? null) : null;
  const canceling = Boolean(subscription?.cancelAtPeriodEnd) || Boolean(storeSub && !storeSub.autoRenew);
  const periodEndLabel = formatPeriodEnd(
    subscription?.currentPeriodEnd ?? (storeSub ? Math.floor(new Date(storeSub.expiresAt).getTime() / 1000) : null),
  );
  const trialing = subscription?.status === "trialing";
  const trialDaysLeft = trialing ? trialDaysRemaining(subscription?.currentPeriodEnd) : 0;
  const proPrice = yearly ? PRO_YEARLY_PER_MONTH : PRO_MONTHLY_PRICE;
  const showSale = !isPaidPlan(plan);
  const currentTier = summary?.planCredits ?? 100;
  const [proTier, setProTier] = useState(100);
  const [bizTier, setBizTier] = useState(100);
  const [entTier, setEntTier] = useState(800);
  const [pendingChange, setPendingChange] = useState<PlanChoice | null>(null);
  // How the last plan change went (BillingResultModal).
  const [changeResult, setChangeResult] = useState<PlanChangeResult | null>(null);
  // In the app: the same cards as after Stripe Checkout — the welcome for a new
  // plan or a pack, and a failed purchase with Try again.
  const [storeCelebration, setStoreCelebration] = useState<{ kind: BillingCelebrationKind; plan?: PlanChoice } | null>(null);
  const [storeFail, setStoreFail] = useState<{ kind: "plan" | "credits" | "other_account"; retry: () => void } | null>(null);
  // Moving to a smaller plan, or cancelling: what stops working in the workspaces you own.
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // From the pricing page: ?plan=BUSINESS&credits=400 opens on that choice.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const want = q.get("plan");
    const credits = normalizeTierParam(q.get("credits"));
    if (want === "PRO") setProTier(credits);
    if (want === "BUSINESS") setBizTier(credits);
    if (want === "ENTERPRISE") setEntTier(Math.max(800, credits));
  }, []);
  // Open each picker on the tier you're on.
  useEffect(() => {
    if (summary?.plan === "PRO") setProTier(summary.planCredits ?? 100);
    if (summary?.plan === "BUSINESS") setBizTier(summary.planCredits ?? 100);
    if (summary?.plan === "ENTERPRISE") setEntTier(summary.planCredits ?? 800);
  }, [summary?.plan, summary?.planCredits]);

  // Back from Stripe Checkout (`?upgraded=1&sid=…`, `?topup=1&sid=…`). Read on
  // the first render: BillingReturnHandler strips these from the URL at once.
  const [returningFromCheckout] = useState(() => params.has("sid") || params.has("upgraded"));
  // Auto-reload saves made since the page opened. A summary read that started
  // before one of them answers with the old settings; those must not replace
  // what was just saved.
  const autoReloadSaves = useRef(0);
  // In the iPhone and Android apps: plans and credits through the phone's store (null on the web).
  const storeBilling = useStoreBilling();
  const storeName = storeBilling ? (storeBilling.store === "apple" ? tb.store.appStore : tb.store.googlePlay) : "";
  // A plan billed anywhere but this phone's store — the website, or the other
  // phone's store — is changed there: a second subscription here bills twice.
  const storeLocked = Boolean(storeBilling?.billedBy && storeBilling.billedBy !== storeBilling.store);
  // On the website: a plan bought in the app is changed there, never with a second (Stripe) subscription.
  const webStoreBilled = storeBilling ? null : (summary?.storeBilled ?? null);
  const webStoreName = webStoreBilled ? (webStoreBilled.store === "apple" ? tb.store.appStore : tb.store.googlePlay) : "";
  const reloadSummary = async () => {
    const s = await api.get<BillingSummary>("/v1/billing/summary").catch(() => null);
    if (s) setSummary(s);
    await refresh();
  };
  // Back from the store's subscription settings (Manage in App Store / Google
  // Play), or the website's Stripe portal in another tab: read the plan
  // again, quietly — a cancellation shows without leaving the page. The
  // store's notice to our server can land a few seconds after, so once more.
  const reloadRef = useRef(reloadSummary);
  reloadRef.current = reloadSummary;
  useEffect(() => {
    let later = 0;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void reloadRef.current();
      window.clearTimeout(later);
      later = window.setTimeout(() => void reloadRef.current(), 5000);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(later);
    };
  }, []);
  /**
   * What a store purchase came to, in the cards the website shows after Stripe:
   * the welcome for a first plan or a pack, "You're on …" for a change of plan
   * (with the credits it added, or when a smaller plan starts), and a failed
   * purchase with Try again.
   */
  /**
   * The iPhone's subscription settings open over the app, not in the App
   * Store, so the page never leaves the screen and its return reload never
   * ran: a plan cancelled there still read Current (seen on an iPhone). Read
   * it when they close, and a few times after while Apple's notice arrives.
   */
  const watchTimers = useRef<number[]>([]);
  const watchStoreChange = () => {
    watchTimers.current.forEach((t) => window.clearTimeout(t));
    watchTimers.current = [0, 5000, 15000, 40000].map((ms) => window.setTimeout(() => void reloadRef.current(), ms));
  };
  useEffect(() => () => watchTimers.current.forEach((t) => window.clearTimeout(t)), []);
  const afterStorePurchase = async (
    outcome: PurchaseOutcome,
    ctx: { kind: "credits"; retry: () => void } | { kind: "plan"; change: PlanChoice; from: PlanChoice | null; interval: "month" | "year"; retry: () => void },
  ) => {
    if (outcome.status === "bought" || outcome.status === "scheduled") {
      await reloadSummary();
      // The store's own notice can reach our server a few seconds after the
      // app's report: a plan bought back after a cancellation still read
      // Canceling until the page was opened again (seen on an iPhone).
      window.setTimeout(() => void reloadRef.current(), 5000);
      if (ctx.kind === "credits") {
        setStoreCelebration({ kind: "topup" });
        return;
      }
      if (!ctx.from) {
        setStoreCelebration({ kind: "upgraded", plan: ctx.change });
        return;
      }
      const storePrice = storeBilling?.subPrice(ctx.change.plan, ctx.change.credits, ctx.interval);
      const granted = outcome.status === "bought" && outcome.result.kind === "subscription" ? outcome.result.grantedCredits : 0;
      setChangeResult({
        tone: "success",
        change: ctx.change,
        from: ctx.from,
        grantedCredits: granted,
        upgrade: PLAN_RANK[ctx.change.plan] > PLAN_RANK[ctx.from.plan] || (ctx.change.plan === ctx.from.plan && ctx.change.credits > ctx.from.credits),
        priceLabel: storePrice ? fill(ctx.interval === "year" ? t.plans.pricePerYear : t.plans.pricePerMonth, { price: storePrice }) : undefined,
        scheduled: outcome.status === "scheduled",
      });
    } else if (outcome.status === "pending") toast("info", tb.store.pending);
    else if (outcome.status === "unconfirmed") toast("info", tb.store.notConfirmed);
    else if (outcome.status === "failed") setStoreFail({ kind: ctx.kind, retry: ctx.retry });
    else if (outcome.status === "other_account") setStoreFail({ kind: "other_account", retry: ctx.retry });
  };
  // The store sells four tiers: open each picker on one it has.
  useEffect(() => {
    if (!storeBilling || storeBilling.loading) return;
    const fit = (tier: number, plan: string) => {
      const tiers = storeBilling.tiers(plan);
      return tiers.includes(tier) || !tiers.length ? tier : tiers[0];
    };
    setProTier((t) => fit(t, "PRO"));
    setBizTier((t) => fit(t, "BUSINESS"));
    setEntTier((t) => fit(t, "ENTERPRISE"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeBilling?.loading]);

  useEffect(() => {
    let cancelled = false;
    const loadSummary = async () => {
      const saves = autoReloadSaves.current;
      const s = await api.get<BillingSummary>("/v1/billing/summary");
      if (cancelled) return;
      setSummary((prev) =>
        saves !== autoReloadSaves.current && prev?.autoReload ? { ...s, autoReload: prev.autoReload } : s,
      );
    };
    // The Stripe sync catches a checkout whose webhook was missed. It takes
    // ~1.5s for any account with a Stripe customer — Free ones that opened
    // Checkout once included — and the page used to wait for it on every
    // visit. Only a return from Checkout waits now (so a fresh upgrade never
    // shows Free for a moment); otherwise the page shows at once and is read
    // again when the sync is done.
    void (async () => {
      try {
        if (!returningFromCheckout) await loadSummary();
        await api.post("/v1/billing/sync").catch(() => null);
        await refresh();
        await loadSummary();
      } catch {
        if (!cancelled) toast("error", appT().billing.page.loadFailed);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Load once on mount — don't re-fetch when toast/refresh identities change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!summary || viewedPricing.current) return;
    viewedPricing.current = true;
    track("view_content", { kind: "subscription", plan: summary.plan });
  }, [summary]);

  // The plans are on the page from the first render, so go to them before it is
  // painted: the timer below scrolled a frame or more late, and the top of the
  // page flashed first.
  useLayoutEffect(() => {
    if (highlightPlans && !highlightTopup) scrollBillingTo("change-plan");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nested panel scroll — wait until the section is in the DOM. The plans draw
  // at once; the credit packs come with the summary.
  useEffect(() => {
    const target = highlightTopup ? "pricing-topup" : highlightPlans ? "change-plan" : null;
    if (!target || (target === "pricing-topup" && !summary)) return;
    let cancelled = false;
    let tries = 0;
    const interval = window.setInterval(() => {
      if (cancelled) return;
      const ok = scrollBillingTo(target);
      if (ok || ++tries >= 40) {
        window.clearInterval(interval);
        if (cancelled || !ok) return;
        setParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete("highlight");
            next.delete("topup");
            return next;
          },
          { replace: true },
        );
      }
    }, 50);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [highlightTopup, highlightPlans, summary, setParams]);

  const upgrade = async () => {
    setBusy("upgrade");
    try {
      const interval = yearly ? "year" : "month";
      const res = await api.post<{ url: string; eventId?: string }>("/v1/billing/checkout", {
        interval,
        returnTo: currentAppPath(),
        ...getMetaClickIds(),
        impactClickId: await getImpactClickId(),
      });
      track("checkout_started", { kind: "subscription", interval, eventId: res.eventId });
      goToExternalCheckout(res.url);
    } catch {
      toast("error", appT().billing.checkoutFailed);
      setBusy(null);
    }
  };

  /** Free → any plan and tier: Stripe Checkout. Pro 100 keeps the trial and sale (upgrade()). */
  const checkoutPlan = async (target: PaidPlan, credits: number) => {
    setBusy(`plan:${target}`);
    try {
      const interval = yearly ? "year" : "month";
      const res = await api.post<{ url: string; eventId?: string }>("/v1/billing/checkout", {
        interval,
        plan: target,
        credits,
        returnTo: currentAppPath(),
        ...getMetaClickIds(),
        impactClickId: await getImpactClickId(),
      });
      track("checkout_started", { kind: "subscription", interval, plan: target, credits, eventId: res.eventId });
      goToExternalCheckout(res.url);
    } catch {
      toast("error", appT().billing.checkoutFailed);
      setBusy(null);
    }
  };

  /** Enterprise's second button: the Book a demo form. */
  const navigate = useNavigate();
  const bookDemo = () => {
    navigate("/enterprise/demo");
  };

  const choosePlan = (target: PaidPlan, credits: number) => {
    if (webStoreBilled) return;
    if (storeBilling) {
      if (storeLocked) return;
      setBusy(`plan:${target}`);
      const interval = yearly ? "year" : "month";
      const from = isPaidPlan(plan) ? { plan: plan as PaidPlan, credits: currentTier } : null;
      void storeBilling
        .buySubscription(target, credits, interval)
        .then((o) =>
          afterStorePurchase(o, { kind: "plan", change: { plan: target, credits }, from, interval, retry: () => choosePlan(target, credits) }),
        )
        .finally(() => setBusy(null));
      return;
    }
    if (isPaidPlan(plan) && hasStripeSub) {
      if (trialing) {
        toast("error", appT().plans.trialing);
        return;
      }
      setPendingChange({ plan: target, credits, interval: yearly ? "year" : "month" });
      return;
    }
    if (target === "PRO" && credits === 100) {
      void upgrade();
      return;
    }
    void checkoutPlan(target, credits);
  };

  useEffect(() => {
    setDropPreview(null);
    if (!pendingChange || PLAN_RANK[pendingChange.plan] >= PLAN_RANK[plan]) return;
    let live = true;
    api
      .get<DropPreview>(`/v1/billing/downgrade-preview?plan=${pendingChange.plan}`)
      .then((r) => live && setDropPreview(r))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [pendingChange, plan]);

  /** Cancel is Stripe's page; first say what stops working in your workspaces, if anything. */
  const startCancel = async () => {
    const r = await api.get<DropPreview>("/v1/billing/downgrade-preview?plan=FREE").catch(() => null);
    if (r?.workspaces.length) {
      setDropPreview(r);
      setConfirmCancel(true);
    } else void openPortal("cancel");
  };

  /** Already subscribed: change plan or tier on the same subscription; the result card says how it went. */
  const applyPlanChange = async (change = pendingChange) => {
    if (!change) return;
    const from = { plan: isPaidPlan(plan) ? plan : ("PRO" as PaidPlan), credits: currentTier };
    setBusy("change");
    try {
      const res = await api.post<{ grantedCredits?: number; upgrade?: boolean; unchanged?: boolean }>(
        "/v1/billing/change-plan",
        change,
      );
      setPendingChange(null);
      await refresh();
      setSummary(await api.get<BillingSummary>("/v1/billing/summary"));
      if (!res.unchanged) {
        setChangeResult({ tone: "success", change, from, grantedCredits: res.grantedCredits ?? 0, upgrade: Boolean(res.upgrade) });
      }
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { reason?: PlanChangeFailure } | null) : null;
      setPendingChange(null);
      setChangeResult({ tone: "fail", change, from, reason: body?.reason ?? "other" });
    } finally {
      setBusy(null);
    }
  };

  const simulateAdminPurchase = async (kind: "subscription" | "topup") => {
    setBusy("admin-sim");
    try {
      const packs = kind === "topup" ? 1 : undefined;
      const interval = yearly ? "year" : "month";
      const res = await api.post<{
        viewEventId?: string;
        eventId?: string;
        subscribeEventId?: string;
        completePaymentEventId?: string;
        purchaseEventId?: string;
      }>("/v1/billing/admin/simulate-purchase", {
        kind,
        ...(packs ? { packs } : {}),
        ...getMetaClickIds(),
      });
      track("view_content", { kind, packs, interval, eventId: res.viewEventId });
      track("checkout_started", { kind, packs, interval, eventId: res.eventId });
      track("paid", {
        kind,
        packs,
        interval,
        subscribeEventId: res.subscribeEventId,
        completePaymentEventId: res.completePaymentEventId,
        purchaseEventId: res.purchaseEventId,
      });
      await refresh();
      const s = await api.get<BillingSummary>("/v1/billing/summary");
      setSummary(s);
      toast(
        "success",
        kind === "subscription"
          ? appT().billing.page.adminSimulatedPro
          : appT().billing.page.adminSimulatedTopUp,
      );
    } catch {
      toast("error", appT().billing.page.adminSimulateFailed);
    } finally {
      setBusy(null);
    }
  };

  const hasStripeSub = Boolean(subscription);
  /** Stripe Customer Portal — cancel, resume, payment method, invoices. */
  const openPortal = async (intent: "manage" | "cancel" | "card" = "manage") => {
    if (!hasStripeSub) {
      toast("error", appT().billing.page.noStripeSubscription);
      return;
    }
    setBusy("portal");
    try {
      const res = await api.post<{ url: string }>("/v1/billing/portal", { intent });
      goToExternalCheckout(res.url);
    } catch (err) {
      const code =
        err instanceof ApiError && err.body && typeof err.body === "object" && "error" in err.body
          ? String((err.body as { error: string }).error)
          : "";
      toast(
        "error",
        code === "no_subscription"
          ? appT().billing.page.noActiveSubscription
          : appT().billing.page.portalFailed,
      );
      setBusy(null);
    }
  };

  /**
   * Fill = what is left. Filling by what was *used* meant a full allowance drew
   * an empty bar and a spent one drew a full bar, which reads as the opposite
   * of the number beside it.
   */
  const cloud = summary?.cloud;
  const dailyRemainingPct =
    daily && daily.allowance > 0
      ? Math.max(0, Math.min(100, Math.round((daily.remaining / daily.allowance) * 100)))
      : 0;

  const statusLabel = canceling
    ? tb.status.canceling
    : trialing
      ? trialDaysLeft > 0
        ? pl(tb.status.trialDaysLeft, trialDaysLeft)
        : tb.status.trial
      : tb.status.current;

  const chartDays = (preview?.days ?? []).map((d) => ({
    ...d,
    label: formatAxisDate(d.date),
    total: d.build + d.run,
  }));

  return (
    <BillingShell>
          <div className="mx-auto w-full max-w-6xl">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold tracking-tight" style={{ color: FG }}>
                  {tp.title}
                </h1>
                <p className="mt-0.5 text-[13px]" style={{ color: FG_MUTED }}>
                  {tp.subtitle}
                </p>
              </div>
              <a
                href={DOCS}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm transition hover:opacity-80"
                style={{ color: FG }}
              >
                {tb.openDocs}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            {!summary ? (
              <BillingPageSkeleton plans={false} packs={isPaidPlan(plan)} />
            ) : (
              <>
                <div className="mt-8 grid gap-3 lg:grid-cols-2">
                  <section
                    className="rounded-[16px] border border-line p-5"
                    style={{ background: BILLING_CARD }}
                    data-testid="billing-plan-card"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <MythexMark size={34} />
                        {/* On a phone the credits take their own line: beside the
                            name they were cut to "2,000 cre…", with no hover there
                            to read the rest. */}
                        <h2 className="min-w-0 text-[19px] font-semibold leading-tight" style={{ color: FG }}>
                          <span className="block truncate sm:inline">Mythex {planLabel(plan)}</span>
                          {isPaidPlan(plan) && (
                            <span className="mt-0.5 block text-sm font-normal sm:ms-2 sm:mt-0 sm:inline" style={{ color: FG_DIM }}>
                              {fill(t.plans.creditsPerMonth, { credits: formatNumber(currentTier) })}
                            </span>
                          )}
                        </h2>
                      </div>
                      <span
                        className="shrink-0 rounded-full px-2.5 py-0.5 text-xs"
                        style={{
                          background: canceling
                            ? "rgba(245, 158, 11, 0.16)"
                            : trialing
                              ? "rgba(139, 92, 246, 0.2)"
                              : "rgba(255,255,255,0.08)",
                          color: canceling
                            ? "rgb(251, 191, 36)"
                            : trialing
                              ? "rgb(196, 181, 253)"
                              : FG,
                        }}
                      >
                        {statusLabel}
                      </span>
                    </div>

                    {trialing && !canceling && (
                      <p className="mt-3 text-[13px]" style={{ color: FG_MUTED }} data-testid="billing-trial-notice">
                        {periodEndLabel ? fill(tp.trialEndsOn, { date: periodEndLabel }) : tp.trialActive}
                      </p>
                    )}

                    {canceling && (
                      <p className="mt-3 text-[13px]" style={{ color: FG_MUTED }} data-testid="billing-canceling-notice">
                        {periodEndLabel
                          ? fill(trialing ? tp.cancelingThroughTrial : tp.cancelingThrough, { date: periodEndLabel, plan: planLabel(plan) })
                          : fill(trialing ? tp.cancelingThroughPeriodTrial : tp.cancelingThroughPeriod, { plan: planLabel(plan) })}
                      </p>
                    )}

                    {!canceling && storeSub?.renewsInto && periodEndLabel && (
                      <p className="mt-3 text-[13px]" style={{ color: FG_MUTED }} data-testid="billing-renews-into">
                        {fill(tp.changesOn, {
                          plan: [
                            planLabel(storeSub.renewsInto.plan),
                            fill(t.plans.result.tierCredits, { credits: formatNumber(storeSub.renewsInto.credits) }),
                            // The period only when it changes ("· Yearly").
                            ...(storeSub.renewsInto.interval !== storeSub.interval
                              ? [storeSub.renewsInto.interval === "year" ? tb.plans.yearly : tb.plans.monthly]
                              : []),
                          ].join(" · "),
                          date: periodEndLabel,
                        })}
                      </p>
                    )}

                    {daily && daily.allowance > 0 && (
                      <p className="mt-3 flex items-center gap-1 text-[13px]" style={{ color: FG_DIM }}>
                        {tp.includedUsage}
                        {cloud && cloud.grantCredits > 0 && (
                          // Like Lovable: the month's Cloud credits are part of
                          // the balance, and broken out only here, on demand.
                          <InfoTip label={tp.includedUsage} testId="billing-included-info" width="w-72">
                            <div className="space-y-2" style={{ color: FG_MUTED }}>
                              <div className="flex justify-between gap-3">
                                <span style={{ color: FG }}>{tp.dailyCredits}</span>
                                <span>
                                  {formatCredits(daily.remaining)} / {formatNumber(daily.allowance)}
                                </span>
                              </div>
                              <div className="flex justify-between gap-3" data-testid="billing-cloud-credits">
                                <span style={{ color: FG }}>{tp.cloudCredits}</span>
                                <span>
                                  {formatCredits(cloud.leftCredits)} / {formatNumber(cloud.grantCredits)}
                                </span>
                              </div>
                              <p className="pt-1 text-[12px]" style={{ color: FG_DIM }}>
                                {tp.cloudFor}
                                {isPaidPlan(plan) ? ` ${tp.cloudThen}` : ""}
                              </p>
                            </div>
                          </InfoTip>
                        )}
                      </p>
                    )}

                    {daily && daily.allowance > 0 && (
                      <div
                        data-testid="billing-daily-credits"
                        className="mt-2 rounded-[12px] border border-line p-4"
                        style={{ background: "rgba(255,255,255,0.02)" }}
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="flex items-center gap-1.5 text-[15px] font-semibold" style={{ color: FG }}>
                            {tp.dailyCredits}
                            <span className="font-normal" style={{ color: FG_DIM }}>
                              <InfoTip label={tp.dailyCredits} testId="billing-daily-info" width="max-w-[360px]">
                                {fill(isPaidPlan(plan) ? tp.dailyTipPro : tp.dailyTipFree, {
                                  cap: formatNumber(daily.monthlyCap ?? 0),
                                })}
                              </InfoTip>
                            </span>
                          </span>
                          <span className="shrink-0 text-[15px]" style={{ color: FG_DIM }}>
                            {rich(tp.dailyLeft, {
                              credits: (
                                <span className="font-semibold" style={{ color: FG }}>
                                  {formatCredits(daily.remaining)}
                                </span>
                              ),
                            })}
                          </span>
                        </div>
                        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/[0.08]">
                          <div
                            className="h-full rounded-full transition-[width]"
                            style={{ width: `${dailyRemainingPct}%`, background: CREDIT_BAR }}
                          />
                        </div>
                        <p className="mt-2.5 text-[13px]" style={{ color: FG_DIM }}>
                          {/* With the month's daily credits all handed out, midnight brings nothing. */}
                          {daily.monthlyCap != null && daily.grantedThisMonth >= daily.monthlyCap - 0.001
                            ? fill(t.chat.credits.monthUsed, { cap: formatNumber(daily.monthlyCap) })
                            : tp.resetsMidnight}
                        </p>
                        {daily.monthlyCap != null && (
                          /*
                           * What is left of the monthly ceiling. On Free a day
                           * that is over counts in full (its leftovers were
                           * thrown away) and today counts what was used: 30/30
                           * with 10 on day 1, 27/30 after using 3, 20/30 on day 2.
                           */
                          <p className="mt-1 text-[13px]" style={{ color: FG_DIM }}>
                            {fill(tp.monthlyLeft, {
                              left: formatCredits(Math.max(0, daily.monthlyCap - daily.grantedThisMonth)),
                              cap: formatNumber(daily.monthlyCap),
                            })}
                          </p>
                        )}
                      </div>
                    )}

                    {cloud && (cloud.pausedApps ?? 0) > 0 && cloud.leftCredits <= 0 && (
                      <p
                        className="mt-3 rounded-[10px] border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-200"
                        data-testid="billing-cloud-out"
                      >
                        {isPaidPlan(plan)
                          ? tp.cloudOutPro
                          : fill(tp.cloudOutFree, {
                              date: formatDate(cloud.resetsAt, { month: "short", day: "numeric", timeZone: "UTC" }),
                            })}
                      </p>
                    )}

                    {/* On Free the balance is just today's daily credits, already
                        shown above — so only show it when there's more (Pro, or
                        a Free account with gifted credits). */}
                    {(isPaidPlan(plan) || balanceCredits > (daily?.remaining ?? 0) + 0.001) && (
                    <div
                      data-testid="billing-balance"
                      className="mt-4 space-y-1"
                      style={{ color: FG_MUTED }}
                    >
                      <p className="text-[15px]">
                        {rich(tp.creditBalance, {
                          b: (s) => (
                            <span className="font-semibold" style={{ color: FG }}>
                              {fill(s, { credits: formatCredits(balanceCredits) })}
                            </span>
                          ),
                        })}
                      </p>
                      <p className="text-[13px]" style={{ color: FG_DIM }}>
                        {tp.oneBalance}
                      </p>
                    </div>
                    )}

                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (isPaidPlan(plan)) {
                            document.getElementById("pricing-topup")?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                          } else {
                            document.getElementById("change-plan")?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                          }
                        }}
                        className="inline-flex h-9 items-center justify-center rounded-[8px] px-4 text-sm font-normal text-white transition hover:brightness-110"
                        style={SELECT_FIELD_STYLE}
                      >
                        {isPaidPlan(plan) ? tp.addCredits : tp.upgradePlan}
                      </button>
                      {isPaidPlan(plan) && storeBilling && storeBilling.billedBy === storeBilling.store && (
                        <button
                          type="button"
                          onClick={() => void storeBilling.manage().finally(watchStoreChange)}
                          className="inline-flex h-9 items-center justify-center rounded-[8px] px-4 text-sm font-normal text-white transition hover:brightness-110"
                          style={SELECT_FIELD_STYLE}
                        >
                          {fill(tb.store.manage, { store: storeName })}
                        </button>
                      )}
                      {isPaidPlan(plan) && webStoreBilled && (
                        <span className="text-[13px]" style={{ color: FG_MUTED }}>
                          {fill(tb.store.billedBy, { store: webStoreName })}
                        </span>
                      )}
                      {isPaidPlan(plan) && !storeBilling && !webStoreBilled && (
                        <button
                          type="button"
                          onClick={() => void openPortal("manage")}
                          disabled={busy === "portal"}
                          data-testid="billing-manage-subscription"
                          className="inline-flex h-9 items-center justify-center rounded-[8px] px-4 text-sm font-normal text-white transition hover:brightness-110 disabled:opacity-60"
                          style={SELECT_FIELD_STYLE}
                        >
                          {busy === "portal" ? (
                            <Spinner size={16} />
                          ) : canceling ? (
                            tp.manageResume
                          ) : (
                            tp.manageSubscription
                          )}
                        </button>
                      )}
                    </div>
                  </section>

                  <section
                    className="flex flex-col rounded-[16px] border border-line p-5"
                    style={{ background: BILLING_CARD }}
                    data-testid="billing-usage-preview"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-base font-semibold" style={{ color: FG }}>
                        {tp.usage}
                      </h2>
                      <Link
                        to="/billing/usage"
                        className="grid size-7 place-items-center rounded-[8px] text-muted transition hover:text-white"
                        aria-label={tp.moreUsageDetails}
                      >
                        <ChevronRight className="h-4 w-4 rtl:-scale-x-100" />
                      </Link>
                    </div>

                    {/* Lovable-style sparkline (line), not bars */}
                    <div className="mt-3 h-28">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartDays} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                          <XAxis
                            dataKey="label"
                            tick={{ fill: FG_DIM, fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            interval="preserveStartEnd"
                            minTickGap={40}
                          />
                          <YAxis hide domain={[0, "auto"]} />
                          <Tooltip
                            contentStyle={{
                              background: "#2c2c2a",
                              border: "none",
                              boxShadow: "0 0 0 0.5px var(--mx-ring), 0 0 0 1px var(--mx-ring-outer)",
                              borderRadius: 8,
                              fontSize: 12,
                              color: FG,
                            }}
                            labelStyle={{ color: FG_MUTED }}
                          />
                          <Line
                            type="monotone"
                            dataKey="total"
                            name={tp.chartCredits}
                            stroke="#e8e8e6"
                            strokeWidth={1.5}
                            dot={false}
                            activeDot={{ r: 3, fill: FG }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <p className="mt-3 text-sm" style={{ color: FG }}>
                      {rich(tp.last30Days, {
                        b: (s) => (
                          <span className="font-medium">
                            {fill(s, { credits: formatCredits(preview?.totalCredits ?? 0) })}
                          </span>
                        ),
                      })}
                    </p>

                    <ul className="mt-2 space-y-1.5">
                      {(preview?.topProjects ?? []).slice(0, 3).map((p) => (
                        <li
                          key={p.projectId ?? p.name}
                          className="flex items-center justify-between gap-3 text-[13px]"
                          style={{ color: FG_MUTED }}
                        >
                          <span className="truncate" dir="auto" style={{ color: FG }}>
                            {p.name}
                          </span>
                          <span className="shrink-0">
                            {fill(tb.creditsAmount, { credits: formatCredits(p.total) })}
                          </span>
                        </li>
                      ))}
                      {(preview?.topProjects?.length ?? 0) === 0 && (
                        <li className="text-[13px]" style={{ color: FG_DIM }}>
                          {tp.noUsage30Days}
                        </li>
                      )}
                    </ul>

                    <Link
                      to="/billing/usage"
                      className="mt-auto inline-flex h-9 w-fit items-center justify-center rounded-[8px] px-4 text-sm font-normal text-white transition hover:brightness-110"
                      style={{ ...SELECT_FIELD_STYLE, marginTop: 16 }}
                    >
                      {tp.moreUsageDetails}
                    </Link>
                  </section>
                </div>

                {/* Credit packs are Pro-only (Free upgrades via plan cards / Upgrade plan). */}
                {isPaidPlan(plan) && (
                  <div className="mt-6">
                    <CreditTopUp
                      plan="PRO"
                      balanceCredits={balanceCredits}
                      packCredits={summary.topup?.packCredits}
                      packCents={summary.topup?.packCents}
                      maxPacks={summary.topup?.maxPacks}
                      highlight={highlightTopup}
                      store={
                        storeBilling
                          ? {
                              packPrice: storeBilling.packPrice,
                              buy: function buy(packs: number): Promise<void> {
                                return storeBilling.buyCredits(packs).then((o) => afterStorePurchase(o, { kind: "credits", retry: () => void buy(packs) }));
                              },
                            }
                          : undefined
                      }
                    />
                  </div>
                )}

                {/* Sits under the pack buttons: the same purchase, unattended. */}
                {isPaidPlan(plan) && summary.autoReload && !storeBilling && (
                  <div className="mt-4">
                    <AutoReload
                      settings={summary.autoReload}
                      packCredits={summary.topup?.packCredits ?? 50}
                      packCents={summary.topup?.packCents ?? 1500}
                      maxPacks={summary.topup?.maxPacks ?? 20}
                      onChange={(autoReload) => {
                        autoReloadSaves.current += 1;
                        setSummary((prev) => (prev ? { ...prev, autoReload } : prev));
                      }}
                    />
                  </div>
                )}

              </>
            )}

            {/*
             * The plans are the site's own prices and copy — nothing here waits
             * on the summary but which card is yours — so they show at once,
             * while the account's own figures above are still loading.
             */}
                <div id="change-plan" className="mt-12 scroll-mt-6">
                  <BillingPlanCards
                    plan={plan}
                    currentTier={currentTier}
                    currentInterval={(subscription?.interval ?? storeSub?.interval) === "year" ? "year" : "month"}
                    yearly={yearly}
                    onYearlyChange={setYearly}
                    proTier={proTier}
                    setProTier={setProTier}
                    bizTier={bizTier}
                    setBizTier={setBizTier}
                    entTier={entTier}
                    setEntTier={setEntTier}
                    busy={busy}
                    loading={!summary}
                    trialing={trialing}
                    canceling={canceling}
                    periodEndLabel={periodEndLabel}
                    hasStripeSub={hasStripeSub}
                    statusLabel={statusLabel}
                    onChoose={choosePlan}
                    onBookDemo={bookDemo}
                    locked={Boolean(webStoreBilled)}
                    store={
                      storeBilling
                        ? { subPrice: storeBilling.subPrice, tiers: storeBilling.tiers, locked: storeLocked || storeBilling.loading }
                        : undefined
                    }
                  />
                  {storeBilling && <StorePurchaseNotes store={storeBilling} storeName={storeName} locked={storeLocked} onRestored={reloadSummary} />}
                  {webStoreBilled && (
                    <p className="mt-4 text-center text-[13px]" style={{ color: PRICING.desc }}>
                      {fill(tb.store.billedInApp, { store: webStoreName })}
                    </p>
                  )}
                  {/* Free isn't a card here (as Lovable's): going back to it is cancelling. */}
                  {isPaidPlan(plan) && hasStripeSub && !storeBilling && (
                    <p className="mt-4 text-center text-[13px]" style={{ color: PRICING.desc }}>
                      {rich(t.plans.backToFree, {
                        cancel: (text) => (
                          <button
                            type="button"
                            className="text-white underline underline-offset-2 disabled:opacity-60"
                            disabled={busy === "portal"}
                            onClick={() => void openPortal("cancel")}
                          >
                            {text}
                          </button>
                        ),
                      })}
                    </p>
                  )}
                  {pendingChange && (
                    <ConfirmDialog
                      title={fill(t.plans.changeConfirmTitle, { plan: planLabel(pendingChange.plan), credits: formatNumber(pendingChange.credits) })}
                      subtitle={(() => {
                        const interval = pendingChange.interval ?? subscription?.interval ?? "month";
                        const price = fill(interval === "year" ? t.plans.pricePerYear : t.plans.pricePerMonth, {
                          price: dollars(planPriceCents(pendingChange.plan, pendingChange.credits, interval)),
                        });
                        const nowMonthly = planPriceCents(isPaidPlan(plan) ? plan : "PRO", currentTier, "month");
                        const nextMonthly = planPriceCents(pendingChange.plan, pendingChange.credits, "month");
                        // As the server decides (change-plan): monthly to yearly at the
                        // same price is a move up, charged now — this said "from your
                        // next renewal" and the year started at once.
                        const toYearly = interval === "year" && (subscription?.interval ?? "month") === "month";
                        return fill(nextMonthly > nowMonthly || (nextMonthly === nowMonthly && toYearly) ? t.plans.changeUp : t.plans.changeDown, { price });
                      })()}
                      confirmLabel={t.plans.switchTo}
                      busy={busy === "change"}
                      onClose={() => setPendingChange(null)}
                      onConfirm={() => void applyPlanChange()}
                    >
                      {dropPreview && <DropWarning preview={dropPreview} />}
                    </ConfirmDialog>
                  )}
                  {changeResult && (() => {
                    const r = changeResult;
                    const tr = t.plans.result;
                    const close = () => setChangeResult(null);
                    const name = (c: PlanChoice) => `${planLabel(c.plan)} · ${fill(tr.tierCredits, { credits: formatNumber(c.credits) })}`;
                    if (r.tone === "success") {
                      const tier = formatNumber(r.change.credits);
                      const interval = r.change.interval ?? subscription?.interval ?? "month";
                      const price =
                        r.priceLabel ??
                        fill(interval === "year" ? t.plans.pricePerYear : t.plans.pricePerMonth, {
                          price: dollars(planPriceCents(r.change.plan, r.change.credits, interval)),
                        });
                      const body =
                        r.grantedCredits > 0
                          ? rich(fill(tr.addedNow, { tier, credits: formatCredits(r.grantedCredits) }), { b: (x) => <span className="font-semibold text-white tabular-nums">{x}</span> })
                          : !r.upgrade
                            ? fill(tr.movedDown, { price, tier })
                            : fill(tr.sameCredits, { plan: planLabel(r.change.plan), tier });
                      return (
                        <BillingResultModal
                          tone="success"
                          title={fill(r.scheduled ? tr.scheduledTitle : tr.switchedTitle, { plan: planLabel(r.change.plan) })}
                          body={body}
                          balanceCredits={balanceCredits}
                          onClose={close}
                        />
                      );
                    }
                    const cardIssue = r.reason !== "other";
                    return (
                      <BillingResultModal
                        tone="fail"
                        title={r.reason === "card_declined" ? tr.declinedTitle : r.reason === "no_card" ? tr.noCardTitle : tr.failedTitle}
                        body={fill(r.reason === "card_declined" ? tr.declinedBody : r.reason === "no_card" ? tr.noCardBody : tr.failedBody, { plan: name(r.from) })}
                        primary={
                          cardIssue
                            ? { label: r.reason === "no_card" ? tr.addCard : tr.updateCard, busy: busy === "portal", onClick: () => void openPortal("card") }
                            : { label: tr.tryAgain, busy: busy === "change", onClick: () => { close(); void applyPlanChange(r.change); } }
                        }
                        secondary={{ label: tr.notNow, onClick: close }}
                        onClose={close}
                      />
                    );
                  })()}
                  {storeCelebration && (
                    <BillingCelebration
                      kind={storeCelebration.kind}
                      plan={storeCelebration.plan?.plan}
                      credits={storeCelebration.plan?.credits}
                      balanceCredits={balanceCredits}
                      onClose={() => setStoreCelebration(null)}
                    />
                  )}
                  {storeFail?.kind === "other_account" && storeBilling && (
                    <BillingResultModal
                      tone="fail"
                      title={tb.store.otherAccountTitle}
                      body={fill(tb.store.otherAccount, { account: storeBilling.store === "apple" ? tb.store.appleAccount : tb.store.googleAccount })}
                      onClose={() => setStoreFail(null)}
                    />
                  )}
                  {storeFail && storeFail.kind !== "other_account" && (
                    <BillingResultModal
                      tone="fail"
                      title={storeFail.kind === "plan" ? t.plans.result.failedTitle : t.plans.result.checkoutTitle}
                      body={
                        storeFail.kind === "plan"
                          ? fill(t.plans.result.failedBody, {
                              plan: isPaidPlan(plan) ? `${planLabel(plan)} · ${fill(t.plans.result.tierCredits, { credits: formatNumber(currentTier) })}` : planLabel("FREE"),
                            })
                          : t.plans.result.checkoutBody
                      }
                      primary={{ label: t.plans.result.tryAgain, onClick: () => { const r = storeFail.retry; setStoreFail(null); r(); } }}
                      secondary={{ label: t.plans.result.notNow, onClick: () => setStoreFail(null) }}
                      onClose={() => setStoreFail(null)}
                    />
                  )}
                  {confirmCancel && dropPreview && (
                    <ConfirmDialog
                      title={t.teams.workspace.downgrade.cancelTitle}
                      subtitle={t.teams.workspace.downgrade.cancelBody}
                      confirmLabel={t.teams.workspace.downgrade.cancelGo}
                      danger
                      onClose={() => setConfirmCancel(false)}
                      onConfirm={() => {
                        setConfirmCancel(false);
                        void openPortal("cancel");
                      }}
                    >
                      <DropWarning preview={dropPreview} />
                    </ConfirmDialog>
                  )}
                  {/* Stripe's terms are the website's: in the app the store's notice above says how it's charged. */}
                  {!storeBilling && (
                  <p className="mt-4 text-center text-xs" style={{ color: PRICING.desc }}>
                    {tp.chargedInUsd}{" "}
                    {isPaidPlan(plan) && hasStripeSub
                      ? rich(fill(tp.cancelInStripe, { plan: planLabel(plan) }), {
                          cancel: (s) => (
                            <button
                              type="button"
                              onClick={() => void startCancel()}
                              className="underline decoration-white/20 underline-offset-2 transition hover:decoration-white/50"
                              style={{ color: PRICING.desc }}
                            >
                              {s}
                            </button>
                          ),
                        })
                      : tp.cancelAfterUpgrade}{" "}
                    {tp.paymentsByStripe}
                  </p>
                  )}
                </div>

                {summary && user?.isAdmin && (
                  <div
                    className="mt-10 rounded-[12px] border border-amber-500/35 bg-amber-500/5 p-4"
                    style={{ background: BILLING_CARD }}
                  >
                    <h3 className="text-sm font-semibold text-amber-100">{tp.adminTitle}</h3>
                    <p className="mt-1 text-xs" style={{ color: FG_MUTED }}>
                      {tp.adminDescription}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy === "admin-sim"}
                        onClick={() => void simulateAdminPurchase("subscription")}
                        className="inline-flex h-9 items-center justify-center rounded-[8px] px-4 text-sm font-normal text-white transition hover:brightness-110 disabled:opacity-50"
                        style={SELECT_FIELD_STYLE}
                      >
                        {busy === "admin-sim" ? tp.adminSimulating : tp.adminSimulatePro}
                      </button>
                      {isPaidPlan(plan) && (
                        <button
                          type="button"
                          disabled={busy === "admin-sim"}
                          onClick={() => void simulateAdminPurchase("topup")}
                          className="inline-flex h-9 items-center justify-center rounded-[8px] px-4 text-sm font-normal text-white transition hover:brightness-110 disabled:opacity-50"
                          style={SELECT_FIELD_STYLE}
                        >
                          {tp.adminSimulateTopUp}
                        </button>
                      )}
                    </div>
                  </div>
                )}
          </div>
    </BillingShell>
  );
}

function normalizeTierParam(raw: string | null): number {
  const n = Number(raw);
  return (CREDIT_TIERS as readonly number[]).includes(n) ? n : 100;
}

const PLAN_RANK: Record<string, number> = { FREE: 0, PRO: 1, BUSINESS: 2, ENTERPRISE: 3 };

/** GET /v1/billing/downgrade-preview */
type DropPreview = { fromPlan: string; toPlan: string; workspaces: Array<PlanDropImpact & { id: string; name: string }> };

/** Each workspace you own that would lose something, and what. */
function DropWarning({ preview }: { preview: DropPreview }) {
  const t = useT();
  if (!preview.workspaces.length) return null;
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3" data-testid="downgrade-warning">
      {preview.workspaces.map((w) => (
        <div key={w.id}>
          <p className="text-[13px] font-medium text-amber-200">
            {fill(t.teams.workspace.downgrade.billingIntro, { name: w.name, to: planLabel(w.toPlan) })}
          </p>
          <DowngradeImpactList impact={w} who="you" />
        </div>
      ))}
    </div>
  );
}

/**
 * Under the plans in the app: what Apple and Google require beside a
 * subscription (it renews, where to cancel, the terms), and Restore purchases.
 * A plan bought on the website says so instead of offering a second one.
 */
function StorePurchaseNotes({
  store,
  storeName,
  locked,
  onRestored,
}: {
  store: NonNullable<ReturnType<typeof useStoreBilling>>;
  storeName: string;
  locked: boolean;
  onRestored: () => Promise<void>;
}) {
  const t = useT();
  const ts = t.billing.store;
  const toast = useToast();
  const [restoring, setRestoring] = useState(false);
  return (
    <div className="mx-auto mt-5 flex max-w-[640px] flex-col items-center gap-3 text-center text-[12.5px] leading-relaxed" style={{ color: PRICING.desc }}>
      {locked && <p className="text-[13px] text-white">{ts.boughtElsewhere}</p>}
      <p>
        {fill(ts.renewsNotice, {
          account: store.store === "apple" ? ts.appleAccount : ts.googleAccount,
          store: storeName,
        })}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <Link to="/terms" className="underline underline-offset-2 hover:text-white">
          {ts.terms}
        </Link>
        <Link to="/privacy" className="underline underline-offset-2 hover:text-white">
          {ts.privacy}
        </Link>
        <button
          type="button"
          disabled={restoring}
          className="underline underline-offset-2 hover:text-white disabled:opacity-60"
          onClick={() => {
            setRestoring(true);
            void store
              .restore()
              .then(async ({ sent, otherAccount, cancelled }) => {
                if (cancelled) return;
                if (sent) toast("success", pl(ts.restored, sent));
                else if (otherAccount) toast("error", fill(ts.otherAccount, { account: store.store === "apple" ? ts.appleAccount : ts.googleAccount }));
                else toast("success", ts.nothingToRestore);
                if (sent) await onRestored();
              })
              .catch(() => toast("error", ts.unavailable))
              .finally(() => setRestoring(false));
          }}
        >
          {restoring ? <Spinner size={14} /> : ts.restore}
        </button>
      </div>
    </div>
  );
}
