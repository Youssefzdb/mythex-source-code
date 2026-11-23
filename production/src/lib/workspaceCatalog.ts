import { api, type ProjectSummary, type WorkspaceSummary, type WorkspaceThreadsPage } from "./api";
import { isNative } from "./native";

/** Shared workspaces/projects cache — AppSidebar + Dashboard + library share one fetch. */

const WORKSPACES_TTL_MS = 30_000;
const PROJECTS_TTL_MS = 15_000;

type CacheEntry<T> = { at: number; data: T };

let workspacesCache: CacheEntry<WorkspaceSummary[]> | null = null;
let workspacesInflight: Promise<WorkspaceSummary[]> | null = null;

const projectsCache = new Map<string, CacheEntry<ProjectSummary[]>>();
const projectsInflight = new Map<string, Promise<ProjectSummary[]>>();

export function peekWorkspaces(): WorkspaceSummary[] | null {
  return workspacesCache?.data ?? null;
}

export function peekWorkspaceProjects(workspaceId: string): ProjectSummary[] | null {
  return projectsCache.get(workspaceId)?.data ?? null;
}

export function invalidateWorkspaceCatalog(opts?: { workspaceId?: string }): void {
  workspacesCache = null;
  workspacesInflight = null;
  if (opts?.workspaceId) {
    projectsCache.delete(opts.workspaceId);
    projectsInflight.delete(opts.workspaceId);
  } else {
    projectsCache.clear();
    projectsInflight.clear();
  }
}

/** Seed / update cache after a local mutation (create, rename, delete). */
export function seedWorkspaceProjects(workspaceId: string, list: ProjectSummary[]): void {
  projectsCache.set(workspaceId, { at: Date.now(), data: list });
}

export async function fetchWorkspaces(opts?: { force?: boolean }): Promise<WorkspaceSummary[]> {
  const now = Date.now();
  if (
    !opts?.force &&
    workspacesCache &&
    now - workspacesCache.at < WORKSPACES_TTL_MS
  ) {
    return workspacesCache.data;
  }
  if (workspacesInflight) return workspacesInflight;

  const p = api
    .get<WorkspaceSummary[]>("/v1/workspaces")
    .then((list) => {
      workspacesCache = { at: Date.now(), data: list };
      return list;
    })
    .finally(() => {
      if (workspacesInflight === p) workspacesInflight = null;
    });

  workspacesInflight = p;
  return p;
}

export async function fetchWorkspaceProjects(
  workspaceId: string,
  opts?: { force?: boolean },
): Promise<ProjectSummary[]> {
  const now = Date.now();
  const cached = projectsCache.get(workspaceId);
  if (!opts?.force && cached && now - cached.at < PROJECTS_TTL_MS) {
    return cached.data;
  }
  const existing = projectsInflight.get(workspaceId);
  if (existing) return existing;

  const p = api
    .get<ProjectSummary[]>(`/v1/projects?workspaceId=${workspaceId}`)
    .then((list) => {
      projectsCache.set(workspaceId, { at: Date.now(), data: list });
      return list;
    })
    .finally(() => {
      if (projectsInflight.get(workspaceId) === p) projectsInflight.delete(workspaceId);
    });

  projectsInflight.set(workspaceId, p);
  return p;
}

export function pickStoredWorkspace(
  workspaces: WorkspaceSummary[],
  storedId?: string | null,
): WorkspaceSummary | undefined {
  const stored = storedId ?? localStorage.getItem("mythex_ws") ?? undefined;
  return (
    workspaces.find((w) => w.id === stored) ??
    workspaces.find((w) => w.isDefault) ??
    workspaces[0]
  );
}

/* ── Recent chats across the workspace (the sidebar's Recents) ─────────────── */

const threadsCache = new Map<string, WorkspaceThreadsPage>();

/**
 * In the app the first page is also kept on the phone, so a cold start draws
 * Recents at once and the fetch only refreshes it; in memory alone the list
 * was empty on every launch until the network answered. A phone is one
 * person's; in a browser, which may be a shared computer, chat titles are not
 * left behind.
 */
const threadsKey = (workspaceId: string) => `mythex.recents.${workspaceId}`;

/** The last first page seen for this workspace, to draw before the fetch lands. */
export function peekWorkspaceThreads(workspaceId: string): WorkspaceThreadsPage | null {
  const hit = threadsCache.get(workspaceId);
  if (hit || !isNative()) return hit ?? null;
  try {
    const raw = localStorage.getItem(threadsKey(workspaceId));
    const page = raw ? (JSON.parse(raw) as WorkspaceThreadsPage) : null;
    if (page && Array.isArray(page.items)) {
      threadsCache.set(workspaceId, page);
      return page;
    }
  } catch {
    // Unreadable: the fetch fills it in.
  }
  return null;
}

/**
 * A page of the workspace's chats, newest activity first. The first page is
 * remembered, so every screen that mounts the sidebar starts from it instead
 * of an empty list.
 */
export async function fetchWorkspaceThreads(
  workspaceId: string,
  cursor?: string | null,
): Promise<WorkspaceThreadsPage> {
  const page = await api.get<WorkspaceThreadsPage>(
    `/v1/workspaces/${workspaceId}/threads?limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
  );
  if (!cursor) {
    threadsCache.set(workspaceId, page);
    if (isNative()) {
      try {
        localStorage.setItem(threadsKey(workspaceId), JSON.stringify(page));
      } catch {
        // Storage full or blocked: memory still has it.
      }
    }
  }
  return page;
}
