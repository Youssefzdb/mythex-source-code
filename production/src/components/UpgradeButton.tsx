import { Zap } from "lucide-react";
import { isPaidPlan } from "../lib/plan-tiers";
import { useAuth } from "../lib/auth";
import { canBuyPlans } from "../lib/native";
import { useUpgrade } from "../lib/upgrade";
import { useT } from "../i18n/app";

/**
 * The project header's Upgrade pill.
 *
 * It decides for itself whether to exist, the same two conditions as the
 * sidebar's "Start with Pro" card: nothing to offer someone already on Pro,
 * and nothing to sell inside the iOS/Android app (`canSell` — see native.ts;
 * `openUpgrade` does nothing there, so a button would be a dead control and a
 * purchase signpost at once).
 *
 * `size="phone"` is the compact pill for the phone header, standing beside the
 * Preview / ⋯ capsule rather than inside it.
 */
export function UpgradeButton({
  size = "desktop",
  className = "",
}: {
  size?: "desktop" | "phone";
  /* (className "ws-collapse" makes it a round icon on a tablet; see index.css.) */
  className?: string;
}) {
  const t = useT();
  const { user } = useAuth();
  const openUpgrade = useUpgrade();
  if (!canBuyPlans() || !user || isPaidPlan(user.plan)) return null;
  return (
    <button
      type="button"
      onClick={() => openUpgrade("plans")}
      className={`btn-upgrade ${size === "phone" ? "btn-upgrade-phone" : ""} ${className}`}
      title={t.common.upgradeToPro}
      data-testid="upgrade-button"
    >
      {/* Filled: at this size the outlined bolt is a thin squiggle. */}
      <Zap className="size-4 shrink-0 fill-current" strokeWidth={1.5} aria-hidden />
      <span className="ws-label px-0.5">{t.common.upgrade}</span>
    </button>
  );
}
