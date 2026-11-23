import { api } from "./api";
import { errorHaptic, successHaptic } from "./haptics";
import { maybeAskForReview } from "./app-review";
import { track } from "./analytics";
import { appT } from "../i18n/app";
import {
  getPublishSnapshot,
  setPublishSnapshot,
  snapshotFetchedAt,
  type PublishDeploySummary,
  type PublishSnapshot,
} from "./publishSnapshotStore";

export {
  getPublishSnapshot,
  setPublishSnapshot,
  subscribePublishSnapshot,
  type PublishDeploySummary,
  type PublishedService,
  type PublishSnapshot,
} from "./publishSnapshotStore";

export type PublishJobState = {
  status: "idle" | "publishing" | "success" | "error";
  error?: string | null;
  errorCode?: string | null;
  /** Why the publish failed (API errorCode: build, app_crash, retry_later, our_side, …). */
  failCode?: string | null;
  suggestions?: string[];
  deploymentId?: string | null;
  /** db_changes_need_confirm: what publishing would delete in the live database, and the token that confirms it. */
  dbChanges?: Array<{ ddl: string; message: string }>;
  dbConfirmToken?: string | null;
};

/** One published surface: the site, or a backend deployed beside it. */
export type PublishReadiness = {
  /** What follows the slug in the published host, from the server (`.mythex.app`). */
  publishHostSuffix?: string | null;
  ready?: boolean;
  reason?: string | null;
  topologyHint?: string | null;
  canPublish?: boolean;
  isLive?: boolean;
  isPublishing?: boolean;
  hasUnpublishedChanges?: boolean;
  /** The workspace's rule for this person: publish, ask an admin, or not at all. */
  publishAs?: "allow" | "approval" | "forbidden";
  publishBlockedMessage?: string | null;
  approvalPendingSince?: string | null;
  appAccess?: { current: "public" | "members"; membersOnlyAvailable: boolean };
  live: PublishSnapshot["live"];
  latest: PublishDeploySummary | null;
  suspended: PublishSnapshot["suspended"];
};

async function fetchPublishReadiness(projectId: string): Promise<PublishReadiness> {
  return api.get<PublishReadiness>(`/v1/projects/${projectId}/publish-readiness`);
}

function slugFromReadiness(r: PublishReadiness): string | null {
  return r.live?.slug ?? r.latest?.slug ?? null;
}

const prefetchInflight = new Map<string, Promise<PublishSnapshot | null>>();
const SNAPSHOT_FRESH_MS = 8_000;

/** Warm cache so opening Publish doesn’t flash empty → loaded. Coalesces callers. */
export async function prefetchPublishSnapshot(
  projectId: string,
  opts?: { force?: boolean },
): Promise<PublishSnapshot | null> {
  if (!opts?.force) {
    const existing = getPublishSnapshot(projectId);
    const meta = snapshotFetchedAt.get(projectId);
    if (existing && meta && Date.now() - meta < SNAPSHOT_FRESH_MS) return existing;
  }
  const inflight = prefetchInflight.get(projectId);
  if (inflight) return inflight;

  const p = (async (): Promise<PublishSnapshot | null> => {
    try {
      const [readiness, hosting, domains] = await Promise.all([
        fetchPublishReadiness(projectId),
        api
          .get<{
            runtimeAllowance?: number;
            runtimeRemaining?: number;
            runtimeUsedThisProject?: number;
            hardCap: boolean;
            runtimeCredits?: number;
          }>(`/v1/projects/${projectId}/hosting`)
          .catch(() => null),
        api
          .get<{ canCustomDomain?: boolean }>(`/v1/projects/${projectId}/domains`)
          .catch(() => null),
      ]);
      const snap: PublishSnapshot = {
        live: readiness.live ?? null,
        latest: readiness.latest ?? null,
        suspended: readiness.suspended ?? null,
        usage: hosting
          ? {
              runtimeAllowance: hosting.runtimeAllowance ?? hosting.runtimeCredits ?? 20,
              runtimeRemaining: hosting.runtimeRemaining ?? 0,
              runtimeUsedThisProject: hosting.runtimeUsedThisProject ?? 0,
              hardCap: hosting.hardCap,
            }
          : null,
        canCustomDomain: Boolean(domains?.canCustomDomain),
        // Always offer republish — no dirty-state gate in the UI.
        hasUnpublishedChanges: true,
        slug: slugFromReadiness(readiness),
      };
      setPublishSnapshot(projectId, snap);
      snapshotFetchedAt.set(projectId, Date.now());
      syncPublishJobFromReadiness(projectId, readiness);
      if (readiness.isPublishing) ensurePublishPoller(projectId);
      return snap;
    } catch {
      return null;
    }
  })().finally(() => {
    if (prefetchInflight.get(projectId) === p) prefetchInflight.delete(projectId);
  });

  prefetchInflight.set(projectId, p);
  return p;
}

type Listener = () => void;

const stateByProject = new Map<string, PublishJobState>();
const listeners = new Map<string, Set<Listener>>();
const inflight = new Map<string, Promise<void>>();
const pollers = new Map<string, ReturnType<typeof setInterval>>();

const IN_PROGRESS = new Set(["BUILDING", "DEPLOYING", "QUEUED"]);
/**
 * Match server STALE_DEPLOY_MS — don't spin “Publishing…” forever on orphaned
 * rows. Measured against the row's heartbeat (`updatedAt`), NOT how long the
 * publish has been running: a real deploy can legitimately take 15min+, and
 * the old elapsed-time version gave up on publishes that were still working.
 */
const STALE_DEPLOY_MS = 5 * 60 * 1000;

function getState(projectId: string): PublishJobState {
  return stateByProject.get(projectId) ?? { status: "idle" };
}

function isStaleInProgress(
  latest: { createdAt?: string | Date; updatedAt?: string | Date } | null | undefined,
): boolean {
  // Fall back to createdAt for rows written before the heartbeat existed.
  const beat = latest?.updatedAt ?? latest?.createdAt;
  if (!beat) return false;
  const t = typeof beat === "string" ? Date.parse(beat) : beat.getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t > STALE_DEPLOY_MS;
}

function setState(projectId: string, next: PublishJobState): void {
  // The end of a publish is felt (in the app), whichever screen is showing.
  const was = stateByProject.get(projectId)?.status;
  if (was === "publishing" && next.status === "success") {
    successHaptic();
    // An app just went live: the moment to ask for a store rating (app only, rationed).
    maybeAskForReview();
  }
  else if (was === "publishing" && next.status === "error") errorHaptic();
  stateByProject.set(projectId, next);
  listeners.get(projectId)?.forEach((fn) => fn());
  window.dispatchEvent(
    new CustomEvent("mythex:publish-job", { detail: { projectId, ...next } }),
  );
}

export function getPublishJob(projectId: string): PublishJobState {
  return getState(projectId);
}

export function subscribePublishJob(projectId: string, fn: Listener): () => void {
  let set = listeners.get(projectId);
  if (!set) {
    set = new Set();
    listeners.set(projectId, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
  };
}

/** Keep polling publish-readiness while a publish is in flight (survives popover close / remount). */
export function ensurePublishPoller(projectId: string): void {
  if (pollers.has(projectId)) return;
  const tick = async () => {
    try {
      const readiness = await fetchPublishReadiness(projectId);
      const latest = readiness.latest;
      const inProgress =
        readiness.isPublishing &&
        latest &&
        IN_PROGRESS.has(latest.status) &&
        !isStaleInProgress(latest);
      const cur = getState(projectId);

      // Keep snapshot fresh for the popover without a history list fetch.
      const prev = getPublishSnapshot(projectId);
      if (prev) {
        setPublishSnapshot(projectId, {
          ...prev,
          live: readiness.live?.status === "LIVE" ? readiness.live : null,
          latest: readiness.latest ?? null,
          suspended: readiness.suspended ?? null,
          slug: slugFromReadiness(readiness) ?? prev.slug,
        });
      }

      if (inProgress || (readiness.isPublishing && latest && !isStaleInProgress(latest))) {
        if (cur.status !== "publishing") {
          setState(projectId, { status: "publishing" });
        }
        return;
      }

      // Local POST still running — wait for it to settle.
      if (inflight.has(projectId)) return;

      if (cur.status === "publishing") {
        if (latest?.status === "LIVE" || readiness.isLive) {
          setState(projectId, { status: "success" });
          window.dispatchEvent(new Event("mythex:publish-updated"));
        } else if (latest?.status === "FAILED" || isStaleInProgress(latest)) {
          setState(projectId, {
            status: "error",
            error:
              latest?.error?.trim() ||
              appT().publish.progress.timedOut,
            failCode: latest?.errorCode ?? (latest?.error ? null : "our_side"),
            deploymentId: latest?.id ?? null,
          });
          window.dispatchEvent(new Event("mythex:publish-updated"));
        } else {
          setState(projectId, { status: "idle" });
          window.dispatchEvent(new Event("mythex:publish-updated"));
        }
      }

      // Stop polling when idle/success/error and nothing in progress.
      if (!inflight.has(projectId) && getState(projectId).status !== "publishing") {
        const t = pollers.get(projectId);
        if (t) clearInterval(t);
        pollers.delete(projectId);
      }
    } catch {
      /* ignore transient poll errors */
    }
  };
  void tick();
  pollers.set(projectId, setInterval(() => void tick(), 2000));
}

/** Align local job with server (e.g. after refresh mid-deploy). */
export function syncPublishJobFromReadiness(
  projectId: string,
  readiness: Pick<PublishReadiness, "isPublishing" | "isLive" | "latest">,
): void {
  const latest = readiness.latest;
  const inProgress =
    Boolean(readiness.isPublishing) &&
    latest &&
    IN_PROGRESS.has(latest.status) &&
    !isStaleInProgress(latest);

  if (inProgress || (readiness.isPublishing && latest && !isStaleInProgress(latest))) {
    if (getState(projectId).status !== "publishing") {
      setState(projectId, { status: "publishing" });
    }
    ensurePublishPoller(projectId);
    return;
  }
  if (!inflight.has(projectId) && getState(projectId).status === "publishing") {
    if (latest?.status === "LIVE" || readiness.isLive) setState(projectId, { status: "success" });
    else if (latest?.status === "FAILED") {
      setState(projectId, { status: "error", deploymentId: latest.id });
    } else setState(projectId, { status: "idle" });
  } else if (
    !inflight.has(projectId) &&
    getState(projectId).status === "idle" &&
    latest &&
    IN_PROGRESS.has(latest.status) &&
    isStaleInProgress(latest)
  ) {
    // Orphaned BUILDING after refresh — don't enter publishing loop.
    setState(projectId, { status: "idle" });
  }
}

export async function startPublishJob(
  projectId: string,
  slug: string,
  opts: { confirmDbChanges?: string; access?: "public" | "members" } = {},
): Promise<void> {
  if (inflight.has(projectId)) return;
  setState(projectId, { status: "publishing" });
  ensurePublishPoller(projectId);

  const run = (async () => {
    try {
      // API returns BUILDING quickly; poller drives success/error from LIVE/FAILED.
      const res = await api.post<{ error?: string; message?: string }>(`/v1/projects/${projectId}/deployments`, {
        slug,
        ...(opts.confirmDbChanges ? { confirmDbChanges: opts.confirmDbChanges } : {}),
        ...(opts.access ? { access: opts.access } : {}),
      });
      // 202: this workspace's admins approve publishes — nothing is building.
      if (res?.error === "approval_requested") {
        setState(projectId, { status: "error", errorCode: "approval_requested", error: res.message ?? null });
        window.dispatchEvent(new Event("mythex:publish-updated"));
        return;
      }
      track("publish");
    } catch (err: unknown) {
      const body = (
        err as {
          body?: {
            error?: string;
            message?: string;
            /** Why a publish failed, when error is deploy_failed. */
            code?: string;
            suggestions?: string[];
            deploymentId?: string;
            dbChanges?: Array<{ ddl: string; message: string }>;
            dbConfirmToken?: string;
          };
        }
      ).body;
      if (body?.error === "publish_in_progress") {
        // This app is already publishing — started in another tab, by the
        // agent, or by a click that fired twice. Nothing failed, so follow the
        // build that is running rather than reporting an error over it.
        setState(projectId, { status: "publishing", deploymentId: body.deploymentId ?? null });
        window.dispatchEvent(new Event("mythex:publish-updated"));
        return;
      }
      setState(projectId, {
        status: "error",
        errorCode: body?.error ?? null,
        failCode: body?.code ?? null,
        error: body?.message ?? null,
        suggestions: body?.suggestions,
        deploymentId: body?.deploymentId ?? null,
        dbChanges: body?.dbChanges,
        dbConfirmToken: body?.dbConfirmToken ?? null,
      });
      window.dispatchEvent(new Event("mythex:publish-updated"));
    } finally {
      inflight.delete(projectId);
      ensurePublishPoller(projectId);
    }
  })();

  inflight.set(projectId, run);
  await run;
}

export function clearPublishJobSuccess(projectId: string): void {
  if (getState(projectId).status === "success") {
    setState(projectId, { status: "idle" });
  }
}

/** After UI has applied success/error, return job to idle. */
export function acknowledgePublishJob(projectId: string): void {
  const s = getState(projectId).status;
  if (s === "success" || s === "error") {
    setState(projectId, { status: "idle" });
  }
}
