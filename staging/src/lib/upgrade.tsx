import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Context,
  type ReactNode,
} from "react";
import { isPaidPlan } from "./plan-tiers";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import { canBuyPlans, canSell, inAppStore } from "./native";
import { UpgradeModal, type UpgradeReason } from "../components/UpgradeModal";
import { proTrialCta } from "../components/PricingPlans";
import { rich } from "../i18n/app/rich";
import { fill, useT } from "../i18n/app";

export type { UpgradeReason };

type UpgradeContextValue = {
  openUpgrade: (reason?: UpgradeReason) => void;
};

const UpgradeContext: Context<UpgradeContextValue | null> =
  (import.meta.hot?.data.upgradeContext as Context<UpgradeContextValue | null> | undefined) ??
  createContext<UpgradeContextValue | null>(null);
if (import.meta.hot) import.meta.hot.data.upgradeContext = UpgradeContext;

function billingPath(reason: UpgradeReason) {
  return reason === "credits" ? "/billing?highlight=credits" : "/billing?highlight=plans";
}

/** Pro can be bought right here: Stripe on the web, the store in the apps. */
const canOfferPro = () => canSell() || inAppStore() !== null;

function isProjectPath(pathname: string) {
  return /^\/p\/[^/]+/.test(pathname);
}

/**
 * In a project: Free users get the Pro card modal (stay in the workspace).
 * Sidebar / dashboard / account menu: go to /billing at the matching section.
 * Pro users always go to billing (credits or plans).
 */
export function UpgradeProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const { user, loading } = useAuth();
  const [reason, setReason] = useState<UpgradeReason | null>(null);
  const inProject = isProjectPath(pathname);

  useEffect(() => {
    if (isPaidPlan(user?.plan) || !inProject) setReason(null);
  }, [user?.plan, inProject]);

  const openUpgrade = useCallback(
    (r: UpgradeReason = "plans") => {
      // Nothing is sold from inside the app and nothing points at where it is
      // sold — see `canSell`. Every call site funnels through here, so this one
      // return is what keeps a purchase path from existing at all.
      if (!canBuyPlans()) return;
      // The Pro card: Stripe's trial on the website, Apple's or Google's
      // purchase in the app (UpgradeModal). Elsewhere, the billing page.
      if (!canOfferPro() || isPaidPlan(user?.plan) || !inProject) {
        navigate(billingPath(r));
        return;
      }
      setReason(r);
    },
    [navigate, user?.plan, inProject],
  );

  // MCP (and other deep links): /p/:id?upgrade=credits opens the in-workspace modal.
  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(search);
    const raw = params.get("upgrade");
    if (raw !== "credits" && raw !== "plans") return;
    params.delete("upgrade");
    const next = params.toString();
    navigate({ pathname, search: next ? `?${next}` : "" }, { replace: true });
    openUpgrade(raw);
  }, [loading, search, pathname, navigate, openUpgrade]);

  const value = useMemo(() => ({ openUpgrade }), [openUpgrade]);

  return (
    <UpgradeContext.Provider value={value}>
      {children}
      {reason != null && !isPaidPlan(user?.plan) && canOfferPro() && (
        <UpgradeModal reason={reason} onClose={() => setReason(null)} />
      )}
    </UpgradeContext.Provider>
  );
}

export function useUpgrade() {
  const ctx = useContext(UpgradeContext);
  const navigate = useNavigate();
  // Vite HMR can replace this module while the mounted provider still holds the
  // previous context object — never crash the tree for that.
  return (
    ctx?.openUpgrade ??
    ((reason: UpgradeReason = "plans") => {
      if (!canBuyPlans()) return;
      navigate(billingPath(reason));
    })
  );
}

export function UpgradeRequiredBanner({
  feature,
  onUpgrade,
}: {
  feature: string;
  onUpgrade: () => void;
}) {
  const t = useT();
  return (
    <div className="text-sm">
      <p className="text-fg">
        {rich(t.shell.upgrade.availableOnPro, { feature: <span className="font-medium">{feature}</span> })}
      </p>
      {/* States the fact, offers no way to act on it. A button here would be a
          call to action pointing at a purchase made outside the app, which is
          the thing App Review looks for. On the web it is the whole point. */}
      {canBuyPlans() && (
        <button
          type="button"
          className="btn-primary mt-3 !h-9 !px-4 text-sm"
          onClick={onUpgrade}
        >
          {canSell() ? proTrialCta() : fill(t.plans.upgradeTo, { plan: "Pro" })}
        </button>
      )}
    </div>
  );
}
