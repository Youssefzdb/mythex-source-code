/**
 * The shared publish snapshot for each project, and who wants to hear about it.
 *
 * Kept apart from publishJob.ts, which talks to the API, so the store can be
 * read and tested without a network client.
 */
export type PublishedService = {
  name: string;
  web: boolean;
  url: string;
  flyAppName?: string;
};

export type PublishDeploySummary = {
  id: string;
  slug: string;
  status: string;
  url: string | null;
  error: string | null;
  errorCode?: string | null;
  services?: PublishedService[] | null;
  createdAt: string;
  /** Publish heartbeat — bumped while a live API process is driving the deploy. */
  updatedAt?: string;
};

/** Thin publish summary from GET /publish-readiness (+ hosting/domains for the popover). */
export type PublishSnapshot = {
  live: {
    id: string;
    slug: string;
    url: string | null;
    status: string;
    services?: PublishedService[] | null;
  } | null;
  latest: PublishDeploySummary | null;
  /** `reason` says what brings it back: credits (Cloud), its own monthly limit, or something else. */
  suspended: {
    id: string;
    slug: string;
    reason?: "credits" | "limit" | "other";
    /** False while the owner's Cloud credits can't run it — publishing again would only pause it. */
    canRun?: boolean;
  } | null;
  usage: {
    runtimeAllowance: number;
    runtimeRemaining: number;
    runtimeUsedThisProject: number;
    hardCap: boolean;
  } | null;
  canCustomDomain: boolean;
  hasUnpublishedChanges: boolean;
  slug: string | null;
};


const snapshots = new Map<string, PublishSnapshot>();
/** When each snapshot was set — how fresh the cache is. */
export const snapshotFetchedAt = new Map<string, number>();

export function getPublishSnapshot(projectId: string): PublishSnapshot | null {
  return snapshots.get(projectId) ?? null;
}

const snapshotListeners = new Map<string, Set<(snap: PublishSnapshot) => void>>();

export function setPublishSnapshot(projectId: string, snap: PublishSnapshot): void {
  snapshots.set(projectId, snap);
  snapshotFetchedAt.set(projectId, Date.now());
  for (const fn of snapshotListeners.get(projectId) ?? []) fn(snap);
}

/**
 * Hear about every new snapshot for a project, whoever fetched it.
 *
 * The popover used to read the snapshot only when it loaded or while a publish
 * it started was running. The poller writes the newly live state into it the
 * moment a publish lands, and an agent's publish refreshes it from the chat —
 * but the popover went on showing what it had, "not published", until its own
 * fetch came back.
 */
export function subscribePublishSnapshot(
  projectId: string,
  fn: (snap: PublishSnapshot) => void,
): () => void {
  let set = snapshotListeners.get(projectId);
  if (!set) {
    set = new Set();
    snapshotListeners.set(projectId, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
  };
}

