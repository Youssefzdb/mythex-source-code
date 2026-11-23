import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { PlanBadge, planUrl } from "./ui/PlanBadge";
import { isPaidPlan } from "../lib/plan-tiers";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, MoreHorizontal, Plus, X } from "lucide-react";
import { API_URL, api } from "../lib/api";
import { formatCredits, creditsFromMillicredits } from "../lib/tokens";
import { useUpgrade } from "../lib/upgrade";
import { DescribedSelect } from "./ui/DescribedSelect";
import { useAuth } from "../lib/auth";
import {
  acknowledgePublishJob,
  ensurePublishPoller,
  getPublishJob,
  getPublishSnapshot,
  prefetchPublishSnapshot,
  setPublishSnapshot,
  startPublishJob,
  subscribePublishJob,
  syncPublishJobFromReadiness,
  type PublishDeploySummary,
  type PublishedService,
  type PublishReadiness,
  type PublishSnapshot,
  subscribePublishSnapshot,
} from "../lib/publishJob";
import { usePublishProgress } from "../lib/publishProgress";
import { Spinner, useToast } from "./ui";
import { PANEL_MOTION_MS, PanelSwap } from "./ui/PanelSwap";
import { AnchoredPopover, Popover } from "./ui/Popover";
import { ModalSurface, SurfaceScroll, useIsPhone } from "./ui/Sheet";
import { canSell } from "../lib/native";
import { proTrialCta, SlidingPillSwitch } from "./PricingPlans";
import { MobilePublishPanel } from "./publish/MobilePublishPanel";
import { CARD_BG, floatingRing, PANEL_BG, surfaceRing } from "../lib/surfaces";
import { appT, fill, formatDate, useT, type AppMessages } from "../i18n/app";
import { localizeServerMessage } from "../lib/server-messages";
import { rich } from "../i18n/app/rich";
import { pairInstruction, type PairRecord } from "../lib/domain-pair-text";

/**
 * Until the server says (publish-readiness carries `publishHostSuffix`), the
 * domain apps publish on. Only shown for the moment before that loads.
 */
function fallbackPublishSuffix(): string {
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    if (h === "staging.mythex.ai" || h.endsWith(".staging.mythex.ai")) return "-staging.mythex.app";
  }
  if (API_URL.includes("api-staging")) return "-staging.mythex.app";
  return ".mythex.app";
}

/** The last suffix the server gave, so reopening the dialog never flashes a guess. */
let serverPublishSuffix: string | null = null;

interface Deployment {
  id: string;
  slug: string;
  status: string;
  url: string | null;
  error: string | null;
  errorCode?: string | null;
  deployLog?: string | null;
  serviceApps?: string[];
  createdAt: string;
}

interface ProjectDomain {
  id: string;
  hostname: string;
  status: string;
  source?: "BYO" | "PURCHASED";
  isPrimary?: boolean;
  verifiedAt?: string | null;
  lastError?: string | null;
  /** Which published service this hostname serves. Null/absent = the site. */
  service?: string | null;
  url: string;
}

/**
 * The published surfaces, each with the domains that point at it.
 *
 * A split app deploys a site and a backend; this dialog showed one Site URL
 * and no sign the second existed — while the reaper, hosting pause and the
 * credit meter all acted on both. One section per surface, so what you are
 * paying to run is what you can see.
 */
type PublishSurface = {
  key: string;
  /** Section heading. "Site URL" when there is only the site, as before. */
  label: string;
  url: string;
  domains: ProjectDomain[];
  /** Null for the site; the service name otherwise. */
  service: string | null;
};

function humanizeServiceName(name: string): string {
  return name
    .replace(/[-_]+/g, " ")
    .replace(/\bapi\b/gi, "API")
    .replace(/\bui\b/gi, "UI")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function publishSurfaces(
  t: AppMessages,
  siteUrl: string,
  services: PublishedService[] | null | undefined,
  domains: ProjectDomain[],
): PublishSurface[] {
  const forService = (name: string | null) =>
    domains.filter((d) => (d.service ?? null) === name);
  const extras = (services ?? []).filter((svc) => !svc.web && svc.url);
  const site: PublishSurface = {
    key: "site",
    // Naming it "Website" only earns its keep when there is something to tell
    // it apart from.
    label: extras.length ? t.publish.publishDialog.website : t.publish.publishDialog.siteUrl,
    url: siteUrl,
    domains: forService(null),
    service: null,
  };
  return [
    site,
    ...extras.map((svc) => ({
      key: `svc:${svc.name}`,
      label: humanizeServiceName(svc.name),
      url: svc.url,
      domains: forService(svc.name),
      service: svc.name,
    })),
  ];
}

interface PurchasedDomain {
  id: string;
  hostname: string;
  status: string;
  projectId: string | null;
}

interface HostingUsage {
  runtimeAllowance: number;
  runtimeRemaining: number;
  runtimeUsedThisProject: number;
  hardCap: boolean;
  runtimeCredits?: number;
}

function slugToDefault(projectName: string): string {
  return projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

/**
 * Failures with nothing in the project to fix — a provider asking us to slow
 * down, or our own side. Only the toast's wording differs ("try again in a few
 * minutes"); the dialog offers Fix with AI for these too. Said by the
 * failure's code (decided where it failed), never read from its wording.
 */
const RETRY_CODES = new Set(["retry_later", "our_side"]);

function isRetryLater(code: string | null | undefined): boolean {
  return RETRY_CODES.has(code ?? "");
}

/**
 * Hosting refused the link name itself. The fix is a new name: typed in the
 * field above, or picked by the agent through Fix with AI.
 */
function isNameRejected(code: string | null | undefined): boolean {
  return code === "name_rejected";
}

function failToast(code: string | null | undefined): string {
  const t = appT().publish.publishDialog;
  if (isNameRejected(code)) return t.failNameRejected;
  return isRetryLater(code) ? t.failRetryLater : t.failFixWithAi;
}

/** The API sends failures already worded for people; an empty one gets ours. */
function friendlyError(message: string | null | undefined): string {
  const text = message?.trim();
  return text ? localizeServerMessage(text) : appT().publish.publishDialog.genericFail;
}

function dispatchAgentPrompt(detail: {
  text?: string;
  skills?: Array<{ id: string; params?: Record<string, unknown> }>;
}): void {
  window.dispatchEvent(
    // Into the chat the person is in (ChatPanel), not a new tab beside it.
    new CustomEvent("mythex:agent-prompt", { detail: { ...detail, newChat: false } }),
  );
}

type SiteUrlMenuItem = {
  label: string;
  onClick: () => void;
  danger?: boolean;
  /** External URL (new tab). */
  href?: string;
  /** In-app route. */
  to?: string;
};

/** Portaled ⋯ menu — one control per URL row so icon counts stay consistent. */
function SiteUrlRowMenu({
  open,
  onOpenChange,
  ariaLabel,
  busy,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ariaLabel: string;
  busy?: boolean;
  items: SiteUrlMenuItem[];
}) {
  // A Base UI popover nested in the Publish one: Base UI knows it is inside,
  // so a press in it neither closes the panel nor counts as outside it.
  return (
    <div className="shrink-0" data-domain-menu>
      <Popover
        open={open}
        onOpenChange={onOpenChange}
        align="end"
        label={ariaLabel}
        className="w-[168px] overflow-hidden rounded-lg p-1"
        style={{ background: CARD_BG, boxShadow: floatingRing(CARD_BG) }}
        trigger={
          <button
            type="button"
            disabled={busy}
            className="grid size-6 place-items-center rounded-md text-muted transition hover:bg-white/6 hover:text-white disabled:opacity-50"
            aria-label={ariaLabel}
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        }
      >
            <div data-domain-menu>
              {items.map((item) => {
                const className = `block w-full rounded-md px-2.5 py-1.5 text-start text-sm transition hover:bg-white/6 ${
                  item.danger ? "font-medium text-red-400" : "text-white"
                }`;
                if (item.to) {
                  return (
                    <Link
                      key={item.label}
                      to={item.to}
                      onClick={() => {
                        item.onClick();
                        onOpenChange(false);
                      }}
                      className={className}
                    >
                      {item.label}
                    </Link>
                  );
                }
                if (item.href) {
                  return (
                    <a
                      key={item.label}
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => {
                        item.onClick();
                        onOpenChange(false);
                      }}
                      className={className}
                    >
                      {item.label}
                    </a>
                  );
                }
                return (
                  <button
                    key={item.label}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      item.onClick();
                      onOpenChange(false);
                    }}
                    className={`${className} disabled:opacity-50`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
      </Popover>
    </div>
  );
}

function OverflowMenu({
  open,
  onOpenChange,
  busy,
  onUnpublish,
  rootRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onUnpublish: () => void;
  rootRef: RefObject<HTMLDivElement | null>;
}) {
  const t = useT();
  // Nested in the Publish popover, so Base UI treats it as part of it.
  return (
    <div ref={rootRef} className="relative shrink-0">
      <Popover
        open={open}
        onOpenChange={onOpenChange}
        align="end"
        sideOffset={4}
        label={t.common.more}
        className="min-w-40 overflow-hidden rounded-lg p-1"
        style={{ background: CARD_BG, boxShadow: floatingRing(CARD_BG) }}
        trigger={
          <button
            type="button"
            className="grid size-7 place-items-center rounded-lg text-muted transition hover:bg-white/6 hover:text-white"
            aria-label={t.common.more}
          >
            <MoreHorizontal className="size-4" />
          </button>
        }
      >
          <a
            href="https://docs.mythex.ai/publish/overview"
            target="_blank"
            rel="noreferrer"
            onClick={() => onOpenChange(false)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-sm text-white transition hover:bg-white/6"
          >
            <BookOpen className="size-3.5 shrink-0 text-muted" />
            {t.publish.publishDialog.docs}
          </a>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onOpenChange(false);
              onUnpublish();
            }}
            className="block w-full rounded-md px-2.5 py-1.5 text-start text-sm font-medium text-red-400 transition hover:bg-white/6 disabled:opacity-50"
          >
            {t.publish.publishDialog.unpublish}
          </button>
      </Popover>
    </div>
  );
}

/** The panel's faces in the order a publish moves through them — forward slides in from the right. */
const PANEL_ORDER = ["loading", "blocked", "form", "unpublishing", "publishing", "published"] as const;

export function PublishPopover({
  projectId,
  projectName,
  onClose,
  anchorRef,
  open = true,
  paidByMe,
  ownerPlan,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  /** When false, plays exit animation then unmounts portal content. */
  open?: boolean;
  /** False in a teammate's workspace: their plan and credits apply, and there's nothing for you to buy. */
  paidByMe?: boolean;
  /** The plan that pays for this project (its owner's). */
  ownerPlan?: "FREE" | "PRO" | "BUSINESS" | "ENTERPRISE";
}) {
  const cached = getPublishSnapshot(projectId);
  const t = useT();
  const d = t.publish.publishDialog;
  const toast = useToast();
  const openUpgrade = useUpgrade();
  const { user } = useAuth();
  // A published app runs on the month's Cloud credits, so having used today's
  // building credits doesn't stop a publish — only having none of either does.
  const teammatePays = paidByMe === false;
  // Whose plan the messages describe: yours, or the owner's in a teammate's workspace.
  const planHere = teammatePays ? ownerPlan : user?.plan;
  /** Offers to upgrade or buy: only where you pay, and only where this build sells. */
  const sells = () => canSell() && !teammatePays;
  const outOfCredits =
    !teammatePays &&
    (user?.balanceCredits ?? creditsFromMillicredits(user?.balanceTokens ?? 0)) + (user?.cloudCredits ?? 0) <= 0;
  const creditCta = isPaidPlan(planHere) ? d.buyCredits : proTrialCta();
  const goCredits = () => {
    onClose();
    openUpgrade(isPaidPlan(planHere) ? "credits" : "plans");
  };
  const overflowRef = useRef<HTMLDivElement>(null);
  const phone = useIsPhone();
  const [live, setLive] = useState<PublishSnapshot["live"]>(() => cached?.live ?? null);
  const [latest, setLatest] = useState<PublishDeploySummary | null>(() => cached?.latest ?? null);
  const [suspended, setSuspended] = useState<PublishSnapshot["suspended"]>(
    () => cached?.suspended ?? null,
  );
  // Paused in a way publishing again can't fix: out of Cloud credits, or at
  // its own monthly limit.
  const stuckPaused = Boolean(
    suspended && ((suspended.reason === "credits" && suspended.canRun === false) || suspended.reason === "limit"),
  );
  const navigate = useNavigate();
  const [usage, setUsage] = useState<HostingUsage | null>(() => cached?.usage ?? null);
  const [domainSuffix, setDomainSuffix] = useState(() => serverPublishSuffix ?? fallbackPublishSuffix());
  const [canPublish, setCanPublish] = useState(true);
  const [configBlockedReason, setConfigBlockedReason] = useState<string | null>(null);
  const [slug, setSlug] = useState(
    () => cached?.slug || slugToDefault(projectName),
  );
  const [jobTick, setJobTick] = useState(0);
  const [unpublishing, setUnpublishing] = useState(false);
  const job = getPublishJob(projectId);
  const publishing = job.status === "publishing";
  const busy = publishing || unpublishing;
  const { label: deployLabel } = usePublishProgress(publishing);
  const [error, setError] = useState<string | null>(null);
  // Workspace rules (Business): may this person publish, and who opens the app.
  const [publishAs, setPublishAs] = useState<"allow" | "approval" | "forbidden">("allow");
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [approvalPendingSince, setApprovalPendingSince] = useState<string | null>(null);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const [membersOnlyAvailable, setMembersOnlyAvailable] = useState(false);
  const [access, setAccess] = useState<"public" | "members">("public");
  /** Why the publish this dialog is showing failed, when it came from the job and not a row. */
  const [jobFailCode, setJobFailCode] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [failedDep, setFailedDep] = useState<Deployment | null>(() => {
    const newest = cached?.latest;
    return newest?.status === "FAILED" ? (newest as Deployment) : null;
  });
  const [confirm, setConfirm] = useState<"republish" | "unpublish" | null>(null);
  /** The live database would lose data: what, and the token that confirms exactly that. */
  const [dbConfirm, setDbConfirm] = useState<{ changes: Array<{ ddl: string; message: string }>; token: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  /** Website, or one of the phone apps (their tab asks the AI in the chat to build). */
  const [target, setTarget] = useState<"website" | "android" | "ios">("website");
  /** The tabs' content box, and its height just before a switch: the height glides from it to the new tab's. */
  const tabsBoxRef = useRef<HTMLDivElement>(null);
  const heightBeforeSwitch = useRef<number | null>(null);
  const switchTab = (next: typeof target) => {
    heightBeforeSwitch.current = tabsBoxRef.current?.offsetHeight ?? null;
    setTarget(next);
  };
  useLayoutEffect(() => {
    const el = tabsBoxRef.current;
    const from = heightBeforeSwitch.current;
    heightBeforeSwitch.current = null;
    if (!el || from == null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const to = el.offsetHeight;
    if (from === to) return;
    el.style.overflow = "hidden";
    el.style.height = `${from}px`;
    void el.offsetHeight; // start from the old height
    el.style.transition = `height ${PANEL_MOTION_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
    el.style.height = `${to}px`;
    const done = window.setTimeout(() => {
      el.style.height = "";
      el.style.transition = "";
      el.style.overflow = "";
    }, PANEL_MOTION_MS + 20);
    return () => window.clearTimeout(done);
  }, [target]);
  const [copied, setCopied] = useState(false);
  const [canCustomDomain, setCanCustomDomain] = useState(
    () => cached?.canCustomDomain ?? false,
  );
  const [customDomains, setCustomDomains] = useState<ProjectDomain[]>([]);
  const [unconnectedDomains, setUnconnectedDomains] = useState<PurchasedDomain[]>([]);
  const [domainBusy, setDomainBusy] = useState<string | null>(null);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [domainMenuFor, setDomainMenuFor] = useState<string | null>(null);
  const [ready, setReady] = useState(() => Boolean(cached));
  const toastedFailId = useRef<string | null>(null);

  const loadUnconnectedDomains = async () => {
    const purchased = await api
      .get<{ domains: PurchasedDomain[] }>("/v1/domains/purchased")
      .catch(() => null);
    if (!purchased) return;
    // Show domains free to attach here — unconnected, or already on another project.
    setUnconnectedDomains(
      purchased.domains.filter(
        (d) => d.status === "ACTIVE" && d.projectId !== projectId,
      ),
    );
  };

  const applyReadiness = (readiness: PublishReadiness) => {
    setLive(readiness.live?.status === "LIVE" ? readiness.live : null);
    setLatest(readiness.latest ?? null);
    setSuspended(readiness.suspended ?? null);
    if (typeof readiness.canPublish === "boolean") setCanPublish(readiness.canPublish);
    setPublishAs(readiness.publishAs ?? "allow");
    setBlockedMessage(readiness.publishBlockedMessage ?? null);
    setApprovalPendingSince(readiness.approvalPendingSince ?? null);
    if (readiness.appAccess) {
      setMembersOnlyAvailable(readiness.appAccess.membersOnlyAvailable);
      setAccess(readiness.appAccess.current);
    }
    setConfigBlockedReason(
      readiness.ready === false && readiness.reason ? readiness.reason : null,
    );
    const nextSlug = readiness.live?.slug || readiness.latest?.slug || null;
    if (nextSlug) setSlug(nextSlug);
    if (readiness.latest?.status === "FAILED") {
      setFailedDep((prev) =>
        prev?.id === readiness.latest!.id
          ? prev
          : (readiness.latest as Deployment),
      );
    } else {
      setFailedDep(null);
    }
    syncPublishJobFromReadiness(projectId, readiness);
    if (readiness.isPublishing) ensurePublishPoller(projectId);
    return nextSlug;
  };

  const load = async () => {
    const [readiness, hosting, domains] = await Promise.all([
      api.get<PublishReadiness>(`/v1/projects/${projectId}/publish-readiness`),
      api.get<HostingUsage>(`/v1/projects/${projectId}/hosting`).catch(() => null),
      api
        .get<{
          canCustomDomain?: boolean;
          domains?: ProjectDomain[];
        }>(`/v1/projects/${projectId}/domains`)
        .catch(() => null),
    ]);

    const nextUsage = hosting
      ? {
          runtimeAllowance: hosting.runtimeAllowance ?? hosting.runtimeCredits ?? 20,
          runtimeRemaining: hosting.runtimeRemaining ?? 0,
          runtimeUsedThisProject: hosting.runtimeUsedThisProject ?? 0,
          hardCap: hosting.hardCap,
        }
      : null;
    if (nextUsage) setUsage(nextUsage);
    if (readiness.publishHostSuffix) {
      serverPublishSuffix = readiness.publishHostSuffix;
      setDomainSuffix(readiness.publishHostSuffix);
    }
    setCanCustomDomain(Boolean(domains?.canCustomDomain));
    setCustomDomains(domains?.domains ?? []);
    void loadUnconnectedDomains();

    const nextSlug = applyReadiness(readiness);

    setPublishSnapshot(projectId, {
      live: readiness.live ?? null,
      latest: readiness.latest ?? null,
      suspended: readiness.suspended ?? null,
      usage: nextUsage,
      canCustomDomain: Boolean(domains?.canCustomDomain),
      hasUnpublishedChanges: true,
      slug: nextSlug,
    });
    setReady(true);
    return readiness;
  };

  // Prefetch while closed so open is instant + stable. Rehydrate from cache on project switch.
  useEffect(() => {
    const snap = getPublishSnapshot(projectId);
    if (snap) {
      setLive(snap.live);
      setLatest(snap.latest);
      setSuspended(snap.suspended);
      setUsage(snap.usage);
      setCanCustomDomain(snap.canCustomDomain);
      if (snap.slug) setSlug(snap.slug);
      setFailedDep(
        snap.latest?.status === "FAILED" ? (snap.latest as Deployment) : null,
      );
      setReady(true);
    } else {
      setLive(null);
      setLatest(null);
      setSuspended(null);
      setUsage(null);
      setReady(false);
      setSlug(slugToDefault(projectName));
    }
    setError(null);
    setSuggestions([]);
    toastedFailId.current = null;
    // Prefer Workspace prefetch (coalesced). Full load() only when popover opens.
    if (!snap) {
      void prefetchPublishSnapshot(projectId).then((s) => {
        if (!s) return;
        setLive(s.live);
        setLatest(s.latest);
        setSuspended(s.suspended);
        setUsage(s.usage);
        setCanCustomDomain(s.canCustomDomain);
        if (s.slug) setSlug(s.slug);
        setFailedDep(s.latest?.status === "FAILED" ? (s.latest as Deployment) : null);
        setReady(true);
      });
    }
  }, [projectId, projectName]);

  // Every new snapshot, whoever fetched it — open or closed, so opening never
  // shows a state the cache has already moved past.
  useEffect(
    () =>
      subscribePublishSnapshot(projectId, (snap) => {
        setLive(snap.live?.status === "LIVE" ? snap.live : null);
        setLatest(snap.latest);
        setSuspended(snap.suspended);
        if (snap.usage) setUsage(snap.usage);
        setCanCustomDomain(snap.canCustomDomain);
        if (snap.slug) setSlug(snap.slug);
        setFailedDep((prev) =>
          snap.latest?.status === "FAILED"
            ? prev?.id === snap.latest.id
              ? prev
              : (snap.latest as Deployment)
            : null,
        );
        setReady(true);
      }),
    [projectId],
  );

  // Refresh whenever the popover opens so Fix-with-AI / agent PublishApp
  // results aren't stuck on a stale failure; start clean when it closes. The
  // motion both ways is Base UI's.
  useEffect(() => {
    if (open) {
      setError(null);
      void load();
      return;
    }
    setMenuOpen(false);
    setConfirm(null);
  }, [open]);

  // Agent PublishApp / external publish updates — refresh snapshot + open dialog state.
  useEffect(() => {
    const onUpdated = () => {
      // Forced: the cached copy is exactly what this event says is out of date.
      void prefetchPublishSnapshot(projectId, { force: true }).then(() => {
        if (open) void load();
      });
    };
    window.addEventListener("mythex:publish-updated", onUpdated);
    return () => window.removeEventListener("mythex:publish-updated", onUpdated);
  }, [projectId, open]);

  useEffect(() => {
    return subscribePublishJob(projectId, () => setJobTick((n) => n + 1));
  }, [projectId]);

  // Spinner is driven by publishJob; one shared poller checks publish-readiness.
  // Do NOT re-fetch hosting/domains on an interval while publishing.
  useEffect(() => {
    void jobTick;
    const s = getPublishJob(projectId).status;
    if (s === "publishing") {
      ensurePublishPoller(projectId);
      // Pull latest from the poller-updated snapshot without a history list.
      const snap = getPublishSnapshot(projectId);
      if (snap) {
        setLive(snap.live);
        setLatest(snap.latest);
        setSuspended(snap.suspended);
      }
      return;
    }
    if (s === "success") {
      void load();
      acknowledgePublishJob(projectId);
      return;
    }
    if (s === "error") {
      const j = getPublishJob(projectId);
      if (j.errorCode === "db_changes_need_confirm" && j.dbConfirmToken) {
        setDbConfirm({ changes: j.dbChanges ?? [], token: j.dbConfirmToken });
        setError(null);
      } else if (j.errorCode === "slug_taken") {
        setError(appT().publish.publishDialog.slugTaken);
        setSuggestions(j.suggestions ?? []);
      } else if (j.errorCode === "deployment_limit") {
        setLimitMessage(j.error ?? appT().publish.publishDialog.deploymentLimit);
        setError("deployment_limit");
      } else if (j.errorCode === "approval_requested") {
        setError("approval_requested");
        setApprovalPendingSince(new Date().toISOString());
        toast("success", appT().teams.publish.approvalSent);
      } else if (j.errorCode === "publish_not_allowed") {
        const msg = j.error ?? appT().teams.publish.onlyAdmins;
        setError(msg);
        toast("error", msg);
      } else if (j.errorCode === "email_not_verified") {
        setError("verify_email");
      } else if (j.errorCode === "upgrade_required") {
        setError("upgrade_required");
      } else if (
        j.errorCode === "runtime_exhausted" ||
        j.errorCode === "credits_exhausted"
      ) {
        setError("credits_exhausted");
      } else if (j.deploymentId) {
        const failId = j.deploymentId;
        void api
          .get<Deployment>(`/v1/projects/${projectId}/deployments/${failId}`)
          .then((full) => {
            setFailedDep(full);
            setLatest({
              id: full.id,
              slug: full.slug,
              status: full.status,
              url: full.url,
              error: full.error,
              errorCode: full.errorCode ?? null,
              createdAt: full.createdAt,
            });
            setError(null);
            if (toastedFailId.current !== failId) {
              toastedFailId.current = failId;
              toast("error", failToast(full.errorCode));
            }
          })
          .catch(() => {
            void load();
            if (j.error) setError(friendlyError(j.error));
            setJobFailCode(j.failCode ?? null);
            if (toastedFailId.current !== failId) {
              toastedFailId.current = failId;
              toast("error", failToast(j.failCode));
            }
          });
      } else {
        void load();
        if (j.error) setError(friendlyError(j.error));
        else setError(appT().publish.publishDialog.genericFail);
        setJobFailCode(j.failCode ?? null);
      }
      acknowledgePublishJob(projectId);
    }
  }, [projectId, jobTick, toast]);

  // Escape walks back before it closes: nothing while an unpublish is running,
  // then the confirm, then the panel. (An open ⋯ or row menu is a nested Base
  // UI popover and takes its own Escape first.)
  const onEscape = () => {
    if (unpublishing) return true;
    if (dbConfirm) {
      setDbConfirm(null);
      return true;
    }
    if (confirm) {
      setConfirm(null);
      return true;
    }
    return false;
  };
  // Presses outside: ignored mid-unpublish, and one while the confirm is up
  // dismisses the confirm rather than the panel — as the old backdrop did.
  const ignoreOutside = () => {
    if (unpublishing) return true;
    if (dbConfirm) {
      setDbConfirm(null);
      return true;
    }
    if (confirm) {
      setConfirm(null);
      return true;
    }
    return false;
  };

  const publish = async (confirmDbChanges?: string) => {
    setError(null);
    setSuggestions([]);
    setFailedDep(null);
    setDbConfirm(null);
    // Job continues even if this popover unmounts (close / navigate).
    await startPublishJob(projectId, slug, { confirmDbChanges, ...(membersOnlyAvailable ? { access } : {}) });
  };

  const unpublish = async () => {
    // The confirm steps aside and the panel slides to the unpublishing face.
    setConfirm(null);
    setUnpublishing(true);
    setError(null);
    try {
      await api.post(`/v1/projects/${projectId}/unpublish`);
      setFailedDep(null);
      await load();
      toast("success", appT().publish.publishDialog.offlineToast);
      window.dispatchEvent(new Event("mythex:publish-updated"));
    } catch (err) {
      const body = (err as { body?: { error?: string; message?: string } }).body;
      const msg = body?.error === "publish_not_allowed" && body.message ? body.message : appT().publish.publishDialog.unpublishFailed;
      setError(msg);
      toast("error", msg);
    } finally {
      setUnpublishing(false);
    }
  };

  const fixWithAi = async () => {
    const dep = failedDep || (latest?.status === "FAILED" ? (latest as Deployment) : null);
    const useSlug = dep?.slug || slug;
    // The message goes into the person's chat, so it carries only what they
    // already saw. The failed publish's output reaches the agent in its own
    // context (<last-publish-failure>), never pasted here.
    const shown = friendlyError(dep?.error || error);
    dispatchAgentPrompt({
      text: fill(appT().publish.publishDialog.agentFixPrompt, { slug: useSlug, error: shown }),
      skills: [{ id: "publish", params: { slug: useSlug } }],
    });
    onClose();
  };

  const askAiToPublish = () => {
    const blocked = configBlockedReason?.trim();
    dispatchAgentPrompt({
      text: blocked
        ? fill(appT().publish.publishDialog.agentFinishSetupPrompt, { slug, reason: blocked })
        : fill(appT().publish.publishDialog.agentPublishPrompt, { slug }),
      skills: [{ id: "publish", params: { slug } }],
    });
    onClose();
  };

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  const connectPurchased = async (id: string) => {
    setDomainBusy(id);
    setDomainError(null);
    try {
      await api.post(`/v1/domains/purchased/${id}/connect`, { projectId });
      await load();
    } catch (err: unknown) {
      const code = (err as { body?: { error?: string } }).body?.error;
      const m = appT().publish.publishDialog;
      setDomainError(code === "not_published" ? m.publishFirst : m.couldntConnect);
    } finally {
      setDomainBusy(null);
    }
  };

  const removeCustomDomain = async (domainId: string) => {
    setDomainBusy(domainId);
    setDomainError(null);
    setDomainMenuFor(null);
    try {
      await api.delete(`/v1/projects/${projectId}/domains/${domainId}`);
      await load();
    } catch {
      setDomainError(appT().publish.publishDialog.couldntRemoveDomain);
    } finally {
      setDomainBusy(null);
    }
  };

  const setPrimaryDomain = async (domainId: string) => {
    setDomainBusy(domainId);
    setDomainError(null);
    setDomainMenuFor(null);
    try {
      await api.post(`/v1/projects/${projectId}/domains/${domainId}/set-primary`);
      await load();
    } catch {
      setDomainError(appT().publish.publishDialog.couldntSetPrimary);
    } finally {
      setDomainBusy(null);
    }
  };

  const verifyCustomDomain = async (domainId: string) => {
    setDomainBusy(domainId);
    setDomainError(null);
    setDomainMenuFor(null);
    try {
      await api.post(`/v1/projects/${projectId}/domains/${domainId}/verify`);
      await load();
    } catch (err: unknown) {
      const body = (err as { body?: { error?: string; message?: string; records?: PairRecord[] } })?.body;
      // A root and its www: what is still missing, in the viewer's language.
      if (body?.records?.length) {
        setDomainError(pairInstruction(body.records, appT().domains));
        await load();
      } else if (body?.error === "edge_pending" && body.message) {
        // DNS is right and the domain waits on a TXT record or its certificate:
        // the server says which, and Manage domain shows the record.
        setDomainError(body.message);
        await load();
      } else {
        setDomainError(appT().publish.publishDialog.dnsNotReady);
      }
    } finally {
      setDomainBusy(null);
    }
  };

  const newestFailed = latest?.status === "FAILED";
  // A URL on the row is not "the site is up". Crash-loop publishes used to
  // leave a fly.dev URL on a FAILED row, and this panel still said Published.
  const liveUrl = live?.status === "LIVE" && live.url ? live.url : null;
  const actuallyLive = Boolean(liveUrl);
  // Never keep the failure CTA once a newer LIVE deploy exists.
  const showFailedCta = Boolean(
    !actuallyLive &&
      (failedDep ||
        newestFailed ||
        (error && error !== "verify_email" && !suggestions.length)),
  );

  /**
   * Which of the panel's five faces is showing.
   *
   * The chain below decides this inline; naming it as well gives the swap
   * something to compare, and it is deliberately a name rather than a value —
   * keying on `live?.url` or a job tick would fade the panel on every poll.
   */
  const panelState: (typeof PANEL_ORDER)[number] = !ready && !publishing
    ? "loading"
    : !canPublish && !live?.url
      ? "blocked"
      : unpublishing
        ? "unpublishing"
        : publishing
        ? "publishing"
        : actuallyLive && !showFailedCta
          ? "published"
          : "form";

  /** The Website tab's publish form and published faces are a card that reaches the top. */
  const cardFace = !phone && (target !== "website" || panelState === "published" || panelState === "form");
  /** A card face under the tabs: no ring along its top, where it meets them. */
  const cardUnderTabs = {
    background: CARD_BG,
    boxShadow: surfaceRing(CARD_BG, 0.14, "255,255,255"),
    // 1px into its top: the tabs cover that pixel, and a half-pixel edge would show the ring.
    ...(cardFace ? { clipPath: "inset(1px -4px -4px -4px)" } : {}),
  };
  const tabBar = (
    <div className="flex items-center justify-between gap-2">
          <SlidingPillSwitch
            size="sm"
            value={target}
            onChange={(v) => switchTab(v as typeof target)}
            aria-label={t.publish.mobile.publish.tabsLabel}
            options={[
              { value: "website", label: t.publish.mobile.publish.tabs.website },
              { value: "android", label: t.publish.mobile.publish.tabs.android },
              { value: "ios", label: t.publish.mobile.publish.tabs.ios },
            ]}
          />
          <div className="flex items-center gap-1">
            {target === "website" && panelState === "published" && (
              <OverflowMenu
                open={menuOpen}
                onOpenChange={setMenuOpen}
                busy={busy}
                onUnpublish={() => setConfirm("unpublish")}
                rootRef={overflowRef}
              />
            )}
            {!phone && (
              <button
                type="button"
                onClick={onClose}
                disabled={unpublishing}
                className="grid size-7 place-items-center rounded-lg text-white/45 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
                aria-label={t.common.close}
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
  );

  const ui = (
    <>
      {/* Where to publish, with the popover's own ⋯ and × beside it: one switch
          for every tab, so its pill slides between them. Over a card face it
          wears the card's surface, and the card carries on below it. */}
      <div
        className={cardFace ? "rounded-t-[inherit] px-4 pt-4 pb-[15px]" : "px-4 pt-4"}
        // Over a card face, 1px under the card's top edge too, so no sub-pixel seam shows between them.
        style={cardFace ? { background: CARD_BG, marginBottom: -1 } : undefined}
      >
        {tabBar}
      </div>
      {/* Like the app's other tabs: the pill slides, the content just changes. */}
      {/* Every tab stays mounted (the phone tabs load when the popover opens),
          so switching shows a settled panel; only the height glides. */}
      <div ref={tabsBoxRef}>
      {(["android", "ios"] as const).map((platform) => (
        <div key={platform} hidden={target !== platform}>
          <MobilePublishPanel
            projectId={projectId}
            platform={platform}
            onClose={onClose}
            card={!phone}
            cardStyle={cardUnderTabs}
            onUpgrade={() => openUpgrade("plans")}
            canUpgrade={sells()}
          />
        </div>
      ))}
      <div hidden={target !== "website"}>
      {/* The panel does not jump between its faces: loading to form, form to
          publishing, publishing to published are all different heights, and
          each used to snap under the pointer. Same machinery the share panel
          slides with — here there is nowhere to slide to, so it fades. */}
      <PanelSwap key={target === "website" ? "shown" : "hidden"} stateKey={panelState} order={PANEL_ORDER}>
      {!ready && !publishing ? (
        <div className="p-4 pt-3.5" aria-busy>
          <div className="pe-8">
            <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
            <div className="mt-2 h-3 w-40 animate-pulse rounded bg-white/6" />
          </div>
          <div className="mt-4 h-10 animate-pulse rounded-xl bg-white/6" />
          <div className="mt-4 h-9 animate-pulse rounded-lg bg-white/8" />
        </div>
      ) : !canPublish && !live?.url ? (
        <div className="p-4 pt-3.5">
          <div className="pe-8">
            <p className="text-[18px] leading-[27px] font-medium text-white">{d.title}</p>
            <p className="mt-0.5 text-[14px] leading-[21px] text-fg-2">{d.subtitle}</p>
          </div>
          <div className="mt-4 rounded-lg border border-line bg-white/[0.04] px-3 py-3">
            <p className="text-sm text-white">{d.notOnPlan}</p>
            <p className="mt-1 text-[13px] text-fg-2">
              {d.notOnPlanHint}
            </p>
            <button
              type="button"
              className="btn-accent mt-3 !h-9 w-full"
              onClick={() => {
                onClose();
                openUpgrade("plans");
              }}
            >
              {proTrialCta()}
            </button>
          </div>
        </div>
      ) : unpublishing ? (
        // The mirror of publishing: the panel itself says what is happening,
        // rather than a spinner inside the confirm's button.
        <div className="flex flex-col items-center px-6 py-10 text-center" aria-busy>
          <Spinner size={28} />
          <p className="mt-4 text-base font-semibold text-white">{d.unpublishingTitle}</p>
          <p className="mt-1.5 max-w-[17rem] text-[13px] leading-snug text-fg-2">
            {live?.url
              ? rich(d.unpublishingUrl, {
                  url: () => (
                    <span className="text-white/80" dir="ltr">
                      {live.url!.replace(/^https?:\/\//, "")}
                    </span>
                  ),
                })
              : d.unpublishingNoUrl}
          </p>
        </div>
      ) : publishing ? (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <Spinner size={28} />
          <p className="mt-4 text-base font-semibold text-white">{d.publishingTitle}</p>
          <p className="mt-1.5 max-w-[16rem] text-[13px] leading-snug text-fg-2">
            {d.publishingHint}
          </p>
          <p className="mt-3 text-[12px] text-fg-2">{fill(d.progressStep, { step: deployLabel })}</p>
        </div>
      ) : actuallyLive && !showFailedCta ? (
        <>
          <div className={cardFace ? "rounded-b-[inherit] px-4 pb-4" : "rounded-[inherit] p-4"} style={phone ? undefined : cardUnderTabs}>
          <div className="pe-8">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden />
                  <p className="text-[18px] leading-[27px] font-medium text-white">{d.published}</p>
                </div>
                {usage && (
                  <p className="mt-0.5 text-[14px] leading-[21px] text-fg-2">
                    {fill(d.hostingCreditsLeft, { credits: formatCredits(usage.runtimeRemaining) })}
                  </p>
                )}
              </div>
            </div>
            {usage && usage.runtimeRemaining < 5 && usage.runtimeRemaining > 0 && (
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                <p className="text-[12px] text-amber-200">
                  {d.lowCredits}
                </p>
                {sells() && (
                  <button
                    type="button"
                    className="mt-1 text-[12px] font-medium text-white underline"
                    onClick={() => {
                      onClose();
                      openUpgrade(isPaidPlan(planHere) ? "credits" : "plans");
                    }}
                  >
                    {isPaidPlan(planHere) ? d.buyCredits : proTrialCta()}
                  </button>
                )}
              </div>
            )}
          </div>

          {liveUrl && live && publishSurfaces(t, liveUrl, live.services, customDomains).map((surface) => (
          <div key={surface.key} className="mt-4">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-[14px] leading-[21px] font-medium text-white">{surface.label}</p>
              <Link
                to={
                  canCustomDomain
                    ? `/settings/domains?project=${encodeURIComponent(projectId)}${
                        surface.service ? `&service=${encodeURIComponent(surface.service)}` : ""
                      }`
                    : planUrl("Pro")
                }
                onClick={onClose}
                className="inline-flex items-center gap-0.5 text-[13px] font-medium text-white transition hover:opacity-80"
              >
                <Plus className="size-3.5" />
                {d.addDomain}
                {!canCustomDomain && <PlanBadge plan="Pro" link={false} className="ms-1.5" />}
              </Link>
            </div>
            <div className="overflow-hidden rounded-xl border border-line">
              <div
                className="flex h-10 items-center gap-2 px-3"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="min-w-0 flex-1 truncate text-sm text-white rtl:text-right" dir="ltr">
                  {surface.url.replace(/^https?:\/\//, "")}
                </p>
                <SiteUrlRowMenu
                  open={domainMenuFor === surface.key}
                  onOpenChange={(open) => setDomainMenuFor(open ? surface.key : null)}
                  ariaLabel={fill(d.surfaceActions, { label: surface.label })}
                  busy={busy}
                  items={[
                    {
                      label: copied ? t.common.copied : t.common.copyLink,
                      onClick: () => void copyLink(surface.url),
                    },
                    {
                      label: t.common.open,
                      href: surface.url,
                      onClick: () => {},
                    },
                  ]}
                />
              </div>
              {surface.domains.map((dom) => {
                const items: SiteUrlMenuItem[] = [
                  {
                    label: t.common.copyLink,
                    onClick: () => void copyLink(dom.url),
                  },
                  ...(dom.status === "ACTIVE"
                    ? [{ label: t.common.open, href: dom.url, onClick: () => {} }]
                    : []),
                  {
                    label: d.manageDomain,
                    to: "/settings/domains",
                    onClick: () => onClose(),
                  },
                  ...(dom.status === "PENDING_DNS"
                    ? [{ label: d.verifyDns, onClick: () => void verifyCustomDomain(dom.id) }]
                    : []),
                  ...(dom.status === "ACTIVE" && !dom.isPrimary
                    ? [{ label: d.setPrimary, onClick: () => void setPrimaryDomain(dom.id) }]
                    : []),
                  {
                    label: dom.source === "PURCHASED" ? t.common.disconnect : t.common.remove,
                    danger: true,
                    onClick: () => void removeCustomDomain(dom.id),
                  },
                ];
                return (
                  <div
                    key={dom.id}
                    className="flex min-h-10 items-center gap-2 border-t border-line px-3 py-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className="truncate text-sm text-white rtl:text-right" dir="ltr">{dom.hostname}</p>
                        {dom.isPrimary ? (
                          <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/70">
                            {d.primary}
                          </span>
                        ) : null}
                      </div>
                      {dom.status !== "ACTIVE" && (
                        <p className="truncate text-[11px] text-amber-300/90">
                          {dom.status === "PENDING_DNS" ? d.waitingForDns : dom.status}
                        </p>
                      )}
                    </div>
                    <SiteUrlRowMenu
                      open={domainMenuFor === dom.id}
                      onOpenChange={(open) => setDomainMenuFor(open ? dom.id : null)}
                      ariaLabel={fill(d.domainActions, { host: dom.hostname })}
                      busy={Boolean(domainBusy) || busy}
                      items={items}
                    />
                  </div>
                );
              })}
            </div>
            {domainError && surface.domains.length > 0 ? (
              <p className="mt-2 text-[12px] leading-snug text-red-300/90">{domainError}</p>
            ) : null}
          </div>
          ))}

          {canCustomDomain && unconnectedDomains.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-[14px] leading-[21px] font-medium text-white">{d.yourDomains}</p>
              <div className="overflow-hidden rounded-xl border border-line">
                {unconnectedDomains.map((dom, i) => (
                  <div
                    key={dom.id}
                    className={`flex min-h-10 items-center justify-between gap-2 px-3 py-2 ${
                      i > 0 ? "border-t border-line" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white rtl:text-right" dir="ltr">{dom.hostname}</p>
                      {dom.projectId ? (
                        <p className="truncate text-[11px] text-muted">{d.onAnotherProject}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={Boolean(domainBusy) || busy}
                      onClick={() => void connectPurchased(dom.id)}
                      className="shrink-0 text-[12px] font-medium text-white transition hover:opacity-80 disabled:opacity-50"
                    >
                      {domainBusy === dom.id ? <Spinner size={14} /> : dom.projectId ? d.useHere : t.common.connect}
                    </button>
                  </div>
                ))}
              </div>
              {domainError && (
                <p className="mt-2 text-[12px] leading-snug text-red-300/90">{domainError}</p>
              )}
            </div>
          )}

          {suspended && (
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
              <p className="text-[13px] text-amber-200">
                {suspended.reason === "credits"
                  ? isPaidPlan(planHere)
                    ? d.pausedCreditsPro
                    : d.pausedCloudFree
                  : suspended.reason === "limit"
                    ? d.pausedLimit
                    : d.paused}
              </p>
              {sells() && (
                <button
                  type="button"
                  className="mt-1.5 text-[12px] font-medium text-white underline"
                  onClick={() => {
                    onClose();
                    openUpgrade(isPaidPlan(planHere) ? "credits" : "plans");
                  }}
                >
                  {isPaidPlan(planHere) ? d.buyCredits : proTrialCta()}
                </button>
              )}
            </div>
          )}

          {configBlockedReason && (
            <div className="mt-3 rounded-lg border border-line bg-white/[0.04] px-3 py-2.5">
              <p className="text-sm text-white">{d.cantRepublish}</p>
              <p className="mt-1 text-[13px] text-fg-2">{configBlockedReason}</p>
              <button
                type="button"
                className="btn-accent mt-3 !h-9 w-full"
                onClick={() => {
                  if (outOfCredits) {
                    goCredits();
                    return;
                  }
                  askAiToPublish();
                }}
              >
                {outOfCredits ? creditCta : d.askAiFinishSetup}
              </button>
            </div>
          )}

          </div>
          {/* Right-aligned on the shell, not a full-width slab inside the
              card: at that size the button was the loudest thing in the
              popover, above the URL people came to read. */}
          <div className="flex justify-end p-4">
            <button
              type="button"
              onClick={() => setConfirm("republish")}
              disabled={busy || slug.length < 2 || Boolean(configBlockedReason) || outOfCredits}
              className="btn-accent !h-8 !px-[9px] text-[14px]"
            >
              {d.publishChanges}
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Content on the card surface, action row on the shell below it —
              the same two-tone the rest of the chrome uses. */}
          <div className={cardFace ? "rounded-b-[inherit] px-4 pb-4" : "rounded-[inherit] p-4"} style={phone ? undefined : cardUnderTabs}>
          <div className="pe-8">
            <p className="text-[18px] leading-[27px] font-medium text-white">{d.title}</p>
            <p className="mt-0.5 text-[14px] leading-[21px] text-fg-2">{d.subtitle}</p>
          </div>

          <div className="mt-4">
            <p className="mb-1.5 text-[14px] leading-[21px] font-medium text-white">{d.siteUrl}</p>
            <div className="flex h-10 items-center gap-1 rounded-md border border-line bg-input px-3 text-sm" dir="ltr">
              <span className="shrink-0" style={{ color: "oklch(72.34% 0.002 107)" }}>
                https://
              </span>
              <input
                value={slug}
                onChange={(e) =>
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                }
                className="min-w-0 flex-1 bg-transparent text-white outline-none"
                disabled={busy}
                aria-label={d.subdomain}
                autoFocus
              />
              <span className="shrink-0" style={{ color: "oklch(72.34% 0.002 107)" }}>
                {domainSuffix}
              </span>
            </div>
          </div>

          {error === "verify_email" ? (
            <p className="mt-3 text-sm text-amber-400">
              {rich(d.verifyEmail, {
                link: (s) => (
                  <Link to="/verify-email" className="text-white underline" onClick={onClose}>
                    {s}
                  </Link>
                ),
              })}
            </p>
          ) : error === "approval_requested" ? (
            <div className="mt-3 rounded-lg border border-line bg-white/[0.04] px-3 py-2.5" data-testid="publish-approval-requested">
              <p className="text-sm text-white">{t.teams.publish.waitingTitle}</p>
              <p className="mt-1 text-[13px] text-fg-2">{t.teams.publish.waitingBody}</p>
            </div>
          ) : error === "deployment_limit" ? (
            <div className="mt-3 rounded-lg border border-line bg-white/[0.04] px-3 py-2.5" data-testid="publish-deployment-limit">
              <p className="text-sm text-white">{limitMessage ?? d.deploymentLimit}</p>
              {/* Only the person who pays can upgrade; a teammate is told to ask them. */}
              {sells() && !isPaidPlan(planHere) && !teammatePays && (
                <button
                  type="button"
                  className="mt-1.5 text-[13px] font-medium text-white underline"
                  onClick={() => {
                    onClose();
                    openUpgrade("plans");
                  }}
                >
                  {d.upgradeToPro}
                </button>
              )}
            </div>
          ) : error === "upgrade_required" ? (
            <div className="mt-3 rounded-lg border border-line bg-white/[0.04] px-3 py-2.5">
              <p className="text-sm text-white">{d.notOnPlan}</p>
              <button
                type="button"
                className="mt-1.5 text-[13px] font-medium text-white underline"
                onClick={() => {
                  onClose();
                  openUpgrade("plans");
                }}
              >
                {proTrialCta()}
              </button>
            </div>
          ) : error === "credits_exhausted" ? (
            <div className="mt-3 rounded-lg border border-line bg-white/[0.04] px-3 py-2.5">
              <p className="text-sm text-white">{d.outOfCredits}</p>
              <p className="mt-1 text-[13px] text-fg-2">
                {d.outOfCreditsHint}
              </p>
              <button
                type="button"
                className="mt-1.5 text-[13px] font-medium text-white underline"
                onClick={() => {
                  onClose();
                  openUpgrade("plans");
                }}
              >
                {proTrialCta()}
              </button>
            </div>
          ) : (
            error &&
            !showFailedCta && (
              <div className="mt-3">
                <p className="text-sm text-red-400">{error}</p>
                {sells() &&
                  (error.toLowerCase().includes("credit") ||
                    error.toLowerCase().includes("balance")) && (
                    <button
                      type="button"
                      className="mt-1.5 text-[13px] font-medium text-white underline"
                      onClick={() => {
                        onClose();
                        openUpgrade(isPaidPlan(planHere) ? "credits" : "plans");
                      }}
                    >
                      {isPaidPlan(planHere) ? d.buyCredits : proTrialCta()}
                    </button>
                  )}
              </div>
            )
          )}

          {configBlockedReason && !showFailedCta && (
            <div className="mt-3 rounded-lg border border-line bg-white/[0.04] px-3 py-2.5">
              <p className="text-sm text-white">{d.notReady}</p>
              <p className="mt-1 text-[13px] text-fg-2">{configBlockedReason}</p>
              <button
                type="button"
                className="btn-accent mt-3 !h-9 w-full"
                onClick={() => {
                  if (outOfCredits) {
                    goCredits();
                    return;
                  }
                  askAiToPublish();
                }}
              >
                {outOfCredits ? creditCta : d.askAiFinishSetup}
              </button>
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="rounded-lg border border-line px-2 py-1 text-xs text-white hover:bg-white/[0.04]"
                  dir="ltr"
                  onClick={() => setSlug(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {showFailedCta && !busy && (
            <div className="mt-3">
              <p className="text-sm text-red-400">
                {friendlyError(failedDep?.error || latest?.error || error)}
              </p>
              {/* Fix with AI on every failure, "our side" included: the agent
                  gets the failure's code and output, so it republishes when
                  nothing in the app is wrong and fixes the app when something
                  is — the person never has to tell which it was. */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <button
                  type="button"
                  data-testid="publish-fix-with-ai"
                  onClick={() => (outOfCredits ? goCredits() : void fixWithAi())}
                  className="btn-accent !h-9 px-4"
                >
                  {outOfCredits ? creditCta : d.fixWithAi}
                </button>
                <button
                  type="button"
                  data-testid="publish-retry"
                  onClick={() => void publish()}
                  disabled={slug.length < 2}
                  className="text-sm text-fg-2 transition hover:text-white"
                >
                  {t.common.tryAgain}
                </button>
              </div>
            </div>
          )}

          {suspended && !showFailedCta && (
            <p className="mt-3 text-[13px] text-amber-300" data-testid="publish-paused-reason">
              {/* Publishing again can't bring back an app that ran out of
                  credits or hit its own limit — say what will. */}
              {suspended.reason === "credits"
                ? isPaidPlan(planHere)
                  ? d.pausedCreditsPro
                  : d.pausedCloudFree
                : suspended.reason === "limit"
                  ? d.pausedLimit
                  : d.pausedRepublish}
            </p>
          )}

          {membersOnlyAvailable && publishAs !== "forbidden" && (
            <div className="mt-3 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[13px] text-fg-2">{t.teams.publish.whoCanOpen}</span>
              <DescribedSelect
                value={access}
                disabled={busy}
                onChange={setAccess}
                ariaLabel={t.teams.publish.whoCanOpen}
                align="right"
                options={[
                  { id: "public", label: t.teams.publish.anyoneWithLink },
                  { id: "members", label: t.teams.publish.membersOnly, description: t.teams.publish.membersOnlyHint },
                ]}
              />
            </div>
          )}
          {publishAs === "forbidden" && (
            <p className="mt-3 text-[13px] text-amber-300" data-testid="publish-forbidden">
              {blockedMessage ?? t.teams.publish.onlyAdmins}
            </p>
          )}
          {publishAs === "approval" && approvalPendingSince && error !== "approval_requested" && (
            <p className="mt-3 text-[13px] text-fg-2" data-testid="publish-approval-pending">
              {fill(t.teams.publish.pendingSince, {
                date: formatDate(approvalPendingSince, { year: "numeric", month: "numeric", day: "numeric" }),
              })}
            </p>
          )}

          </div>
          {!showFailedCta && !configBlockedReason && stuckPaused && (
            // Publishing again can't bring this app back — only credits (or a
            // higher monthly limit) can, so that's the one action offered.
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4" data-testid="publish-paused-action">
              {suspended?.reason === "limit" ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate(`/p/${projectId}?settings=usage`);
                  }}
                  className="btn-accent !h-8 px-4"
                >
                  {d.raiseLimit}
                </button>
              ) : (
                sells() && (
                  <button type="button" onClick={goCredits} className="btn-accent !h-8 px-4">
                    {isPaidPlan(planHere) ? d.buyCredits : d.upgradeToPro}
                  </button>
                )
              )}
            </div>
          )}
          {!showFailedCta && !configBlockedReason && !stuckPaused && (
            // The main action on the right, like Publish changes and the phone tabs; the AI route just before it.
            <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 p-4">
              <button
                type="button"
                onClick={() => (outOfCredits ? goCredits() : askAiToPublish())}
                className="text-sm text-fg-2 transition hover:text-white"
              >
                {outOfCredits ? creditCta : d.askAiToPublish}
              </button>
              <button
                type="button"
                onClick={() => void publish()}
                disabled={busy || slug.length < 2 || outOfCredits || publishAs === "forbidden"}
                className="btn-accent !h-8 !px-[9px] text-[14px]"
                data-testid="publish-submit"
              >
                {publishAs === "approval" ? t.teams.publish.askAdmin : suspended ? d.publishChanges : d.publishButton}
              </button>
            </div>
          )}
        </>
      )}
      </PanelSwap>
      </div>
      </div>

      {dbConfirm && (
        <div className="absolute inset-0 z-30 flex flex-col justify-end bg-[#1c1c1c]/95 p-4 backdrop-blur-[2px]">
          <p className="text-sm font-semibold text-white">{d.liveDbTitle}</p>
          <p className="mt-1 text-[13px] leading-snug text-fg-2">{d.liveDbBody}</p>
          <ul className="mt-2 max-h-40 min-h-0 shrink space-y-1.5 overflow-y-auto">
            {dbConfirm.changes.slice(0, 8).map((c, i) => (
              <li key={i} className="rounded-md border border-line bg-white/[0.04] px-2 py-1.5">
                <code className="block break-all font-mono text-[12px] text-white">{c.ddl}</code>
                <span className="text-[12px] text-red-400">{c.message}</span>
              </li>
            ))}
            {dbConfirm.changes.length > 8 && (
              <li className="text-[12px] text-fg-2">{fill(d.liveDbMore, { n: dbConfirm.changes.length - 8 })}</li>
            )}
          </ul>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setDbConfirm(null)} className="btn-ghost !h-9 !rounded-lg">
              {t.common.cancel}
            </button>
            <button type="button" onClick={() => void publish(dbConfirm.token)} className="btn-danger !h-9 !rounded-lg">
              {d.liveDbConfirm}
            </button>
          </div>
        </div>
      )}

      {confirm && (
        <div className="absolute inset-0 z-30 flex flex-col justify-end bg-[#1c1c1c]/95 p-4 backdrop-blur-[2px]">
          <p className="text-sm font-semibold text-white">
            {confirm === "unpublish" ? d.unpublishConfirmTitle : d.republishConfirmTitle}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-fg-2">
            {confirm === "unpublish" ? d.unpublishConfirmBody : d.republishConfirmBody}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirm(null)}
              className="btn-ghost !h-9 !rounded-lg"
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (confirm === "unpublish") {
                  void unpublish();
                  return;
                }
                setConfirm(null);
                void publish();
              }}
              className={
                confirm === "unpublish"
                  ? "btn-danger !h-9 !rounded-lg"
                  : "btn-accent !h-9"
              }
            >
              {confirm === "unpublish" ? d.unpublish : d.publishChanges}
            </button>
          </div>
        </div>
      )}
    </>
  );

  // Base UI: a popover out of the Publish button on a desktop — growing from
  // it and gone on an outside press, the preview iframe included (the old
  // full-screen backdrop existed only because the iframe swallows mousedown);
  // a bottom sheet on a phone, where Publish is opened from the ⋯ menu.
  if (phone) {
    return (
      <ModalSurface
        open={open}
        onClose={onClose}
        label={d.title}
        sheet
        zIndex={80}
        dismissible={!unpublishing}
        testId="publish-popover"
        className="relative"
        style={{ background: PANEL_BG }}
      >
        <SurfaceScroll className="native-safe-bottom relative">{ui}</SurfaceScroll>
      </ModalSurface>
    );
  }

  return (
    <AnchoredPopover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      onEscape={onEscape}
      ignoreOutside={ignoreOutside}
      align="end"
      sideOffset={8}
      label={d.title}
      testId="publish-popover"
      className="relative w-[min(100vw-1.5rem,26.25rem)] overflow-hidden rounded-[20px]"
      style={{ background: PANEL_BG, boxShadow: floatingRing(PANEL_BG) }}
    >
      {ui}
    </AnchoredPopover>
  );
}

/** @deprecated Use PublishPopover — kept for import compatibility. */
export function PublishDialog({
  projectId,
  projectName,
  onClose,
  anchorRef,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
  embedded?: boolean;
  anchorRef?: RefObject<HTMLElement | null>;
}) {
  const fallbackRef = useRef<HTMLElement | null>(null);
  return (
    <PublishPopover
      open
      projectId={projectId}
      projectName={projectName}
      onClose={onClose}
      anchorRef={anchorRef ?? fallbackRef}
    />
  );
}
