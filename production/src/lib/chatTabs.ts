/** Cursor-style open chat tabs (client-only; max 10). */

export const MAX_CHAT_TABS = 10;

export type OpenTab =
  /**
   * `renderKey` is set when the tab started as a draft: the thread is created
   * by the draft's first send, and the ChatPanel that is mid-turn must not be
   * remounted when the tab becomes a real thread.
   */
  | { kind: "thread"; id: string; threadId: string; renderKey?: string }
  /** A chat with no thread yet — one is created when its first message is sent. */
  | { kind: "draft"; id: string }
  | { kind: "subagent"; id: string; parentThreadId: string; toolId: string; title: string }
  | { kind: "plan"; id: string; parentThreadId: string; path: string; title: string };

function storageKey(projectId: string) {
  return `mythex.chatTabs.${projectId}`;
}

export function threadTabId(threadId: string) {
  return `thread:${threadId}`;
}

let draftSeq = 0;
export function draftTabId() {
  draftSeq += 1;
  return `draft:${Date.now().toString(36)}-${draftSeq}`;
}

export function subagentTabId(parentThreadId: string, toolId: string) {
  return `subagent:${parentThreadId}:${toolId}`;
}

export function planTabId(parentThreadId: string, path: string) {
  const rel = path.replace(/^\/home\/user\/app\//, "").replace(/^\.\//, "");
  return `plan:${parentThreadId}:${rel}`;
}

export function loadPersistedThreadTabs(projectId: string): { openThreadIds: string[]; activeThreadId: string | null } {
  try {
    const raw = sessionStorage.getItem(storageKey(projectId));
    if (!raw) return { openThreadIds: [], activeThreadId: null };
    const parsed = JSON.parse(raw) as { openThreadIds?: unknown; activeThreadId?: unknown };
    const openThreadIds = Array.isArray(parsed.openThreadIds)
      ? parsed.openThreadIds.filter((x): x is string => typeof x === "string")
      : [];
    const activeThreadId = typeof parsed.activeThreadId === "string" ? parsed.activeThreadId : null;
    return { openThreadIds, activeThreadId };
  } catch {
    return { openThreadIds: [], activeThreadId: null };
  }
}

export function persistThreadTabs(projectId: string, openTabs: OpenTab[], activeTabId: string | null) {
  const openThreadIds = openTabs.filter((t): t is Extract<OpenTab, { kind: "thread" }> => t.kind === "thread").map((t) => t.threadId);
  let activeThreadId: string | null = null;
  const active = openTabs.find((t) => t.id === activeTabId);
  if (active?.kind === "thread") activeThreadId = active.threadId;
  else if (active?.kind === "subagent" || active?.kind === "plan") activeThreadId = active.parentThreadId;
  else if (openThreadIds.length) activeThreadId = openThreadIds[openThreadIds.length - 1];
  try {
    sessionStorage.setItem(storageKey(projectId), JSON.stringify({ openThreadIds, activeThreadId }));
  } catch {
    // ignore quota
  }
}

export function hydrateOpenTabs(
  projectId: string,
  fallbackIds: string[],
): { openTabs: OpenTab[]; activeTabId: string | null } {
  const { openThreadIds, activeThreadId } = loadPersistedThreadTabs(projectId);
  // Trust persisted ids even if they're not on the first history page yet.
  const seed = (openThreadIds.length ? openThreadIds : fallbackIds.slice(0, 1)).slice(0, MAX_CHAT_TABS);
  const openTabs: OpenTab[] = seed.map((threadId) => ({
    kind: "thread",
    id: threadTabId(threadId),
    threadId,
  }));
  const preferred = activeThreadId && seed.includes(activeThreadId) ? threadTabId(activeThreadId) : openTabs[0]?.id ?? null;
  return { openTabs, activeTabId: preferred };
}
