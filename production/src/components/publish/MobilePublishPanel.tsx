import type { CSSProperties } from "react";
import { Download, ExternalLink } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { btnClass } from "../../lib/surfaces";
import { fill, useT } from "../../i18n/app";
import { PlanBadge } from "../ui/PlanBadge";
import { proTrialCta } from "../PricingPlans";
import { StoreTile } from "./MobileCardShell";
import { isActive, useMobileApp, type Platform } from "./mobile-app";

/**
 * The Publish popover's Android and iPhone tabs: where that app stands (the
 * same words as the chat card), the store account it uses (as Project
 * settings → Mobile app shows it), and one button that asks the AI in the
 * chat to build it — the build itself happens there, with its card.
 */

const PLAY_CONSOLE = "https://play.google.com/console";
const APP_STORE_CONNECT = "https://appstoreconnect.apple.com/apps";

/** Ask the AI, in the open chat, with the /mobile command for this platform. */
function askToBuild(platform: Platform, text: string) {
  window.dispatchEvent(
    new CustomEvent("mythex:agent-prompt", {
      detail: { text, skills: [{ id: "mobile", params: { platform } }], newChat: false },
    }),
  );
}

export function MobilePublishPanel({
  projectId,
  platform,
  onClose,
  onUpgrade,
  canUpgrade,
  card,
  cardStyle,
}: {
  projectId: string;
  platform: Platform;
  onClose: () => void;
  /** Content on the card surface (under the tabs), the action row on the shell below — like the Website tab. */
  card: boolean;
  cardStyle: CSSProperties;
  /** Opens the plans (the same as the popover's own "not on your plan" box). */
  onUpgrade: () => void;
  /** False in a teammate's workspace or a build that doesn't sell. */
  canUpgrade: boolean;
}) {
  const t = useT();
  const m = t.publish.mobile;
  const p = m.publish;
  const navigate = useNavigate();
  const location = useLocation();
  const app = useMobileApp(projectId);
  const ios = platform === "ios";
  const build = app.builds[platform] ?? null;
  const store = ios ? "apple" : "google";
  const connected = app.stores?.has(store) ?? false;

  const openSettings = () => {
    const search = new URLSearchParams(location.search);
    search.set("settings", "mobile");
    navigate({ pathname: location.pathname, search: search.toString() });
    onClose();
  };

  const statusFor: Record<string, string> = m.statusFor;
  const status = !app.loaded
    ? " "
    : !app.allowed
      ? p.pitch[platform]
      : !build
        ? p.notBuilt
        : isActive(build)
          ? p.building
          : build.status === "ready"
            ? fill(p.withBuild, {
                status: ios ? m.sentIos : build.storeState === "sent" ? m.sentAndroid : m.ready,
                n: String(build.buildNumber),
              })
            : (statusFor[!ios && build.errorCode === "store_key" ? "store_key_play" : (build.errorCode ?? "our_side")] ??
              statusFor.our_side);

  const rowAction =
    app.allowed && build?.status === "ready" ? (
      ios ? (
        <a href={APP_STORE_CONNECT} target="_blank" rel="noreferrer" className={btnClass("lg")}>
          {m.testFlight}
          <ExternalLink className="size-[15px]" aria-hidden />
        </a>
      ) : build.storeState === "sent" ? (
        <a href={PLAY_CONSOLE} target="_blank" rel="noreferrer" className={btnClass("lg")}>
          {m.playConsole}
          <ExternalLink className="size-[15px]" aria-hidden />
        </a>
      ) : build.downloadUrl ? (
        <a href={build.downloadUrl} className={btnClass("lg")}>
          <Download className="size-[15px]" aria-hidden />
          {m.download}
        </a>
      ) : null
    ) : null;

  const label = ios ? m.titleIos : m.titleAndroid;
  const ask = build && build.status === "ready" ? p.ask[ios ? "iosAgain" : "androidAgain"] : p.ask[platform];
  const buttonLabel = build && build.status === "ready" ? p.buildAgain : p.build[platform];

  return (
    <div data-testid={`publish-mobile-${platform}`}>
    <div
      className={`flex flex-col gap-3.5 ${card ? "rounded-b-[inherit] px-4 pb-4" : "p-4 pt-3.5"}`}
      style={card ? cardStyle : undefined}
    >
      <div className="flex items-center gap-3">
        <StoreTile platform={platform} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center text-[14px] font-medium text-white">
            {label}
            {app.loaded && !app.allowed && <PlanBadge plan="Pro" link={false} className="ms-1.5" />}
          </p>
          <p className="truncate text-[12px] leading-snug text-muted">{status}</p>
        </div>
        {rowAction}
      </div>

      {app.loaded && !app.allowed ? (
        <div className="rounded-lg border border-line bg-white/[0.04] px-3 py-3">
          <p className="text-sm text-white">{p.notOnPlan}</p>
          <p className="mt-1 text-[13px] text-fg-2">{p.notOnPlanHint}</p>
          {canUpgrade && (
            <button
              type="button"
              className="btn-accent mt-3 !h-9 w-full"
              onClick={() => {
                onClose();
                onUpgrade();
              }}
            >
              {proTrialCta()}
            </button>
          )}
        </div>
      ) : (
        app.loaded && (
          <>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white/[0.04] px-3 py-2.5 text-[13px]">
              <span className="min-w-0 truncate text-fg-2">
                <span className="me-2 text-muted">{ios ? p.appStore : p.googlePlay}</span>
                {connected
                  ? app.stores && fill(m.account.connected, { label: storeLabel(app, store) })
                  : ios
                    ? p.appStoreNotConnected
                    : p.googlePlayNotConnected}
              </span>
              {(connected || !ios) && (
                <button type="button" onClick={openSettings} className="shrink-0 text-white underline-offset-2 hover:underline">
                  {connected ? p.manage : p.connect}
                </button>
              )}
            </div>
          </>
        )
      )}
    </div>
    {app.loaded && app.allowed && (
      // Right-aligned on the shell, the same as Publish changes on the Website tab.
      <div className="flex justify-end p-4">
        <button
          type="button"
          disabled={isActive(build)}
          onClick={() => {
            askToBuild(platform, ask);
            onClose();
          }}
          className="btn-accent !h-8 !px-[9px] text-[14px]"
          data-testid={`publish-mobile-build-${platform}`}
        >
          {isActive(build) ? p.building : buttonLabel}
        </button>
      </div>
    )}
    </div>
  );
}

/** The connected key's label ("API key …", the service account's email), when the hook has it. */
function storeLabel(app: ReturnType<typeof useMobileApp>, store: "apple" | "google"): string {
  return app.storeLabels?.[store] ?? "";
}
