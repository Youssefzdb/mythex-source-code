/**
 * Whether the preview pane starts open, on a fresh load of a project.
 *
 * This was an effect inline in Workspace that reached for whatever state was
 * to hand — the thread's message count, and whether a preview URL had arrived
 * — and got both wrong. Talking to the agent is not building an app, and a URL
 * only says the sandbox woke up: the starter template answers on one long
 * before there is anything of the user's to look at. Worse, the URL arrives
 * asynchronously, so which signal won the race decided whether the pane opened
 * — the same project behaving differently on two consecutive reloads.
 *
 * Pulled out here as a function of facts so the cases can be written down and
 * tested. Note what is deliberately absent from `PreviewStartFacts`: there is
 * no message count and no preview URL, because neither answers the question.
 */

/** Undecided is a real answer: it means "do not move the pane yet". */
export type PreviewStart = "open" | "closed" | "undecided";

export type PreviewStartFacts = {
  /**
   * Has the agent ever written a file in this project?
   *
   * `null` while that is still unknown — history not loaded yet. Guessing
   * during that window is what makes the pane flick open and shut on load.
   */
  hasApp: boolean | null;
  /**
   * What this viewer last chose for this project, if anything.
   *
   * Dragging the split shut is a decision, and it should outlive a reload.
   * It also outranks `hasApp`: someone who closed the pane on a finished app
   * meant it, and someone who opened it on an empty one meant that too.
   */
  remembered?: boolean | null;
};

export function previewStartState({ hasApp, remembered }: PreviewStartFacts): PreviewStart {
  // The user's own choice first — a heuristic never overrules it.
  if (remembered === true) return "open";
  if (remembered === false) return "closed";
  // Nothing chosen, and nothing known yet: hold still rather than guess and
  // correct yourself a moment later.
  if (hasApp === null) return "undecided";
  return hasApp ? "open" : "closed";
}

/**
 * The bits of the workspace layout that are the user's to decide.
 *
 * None of this used to survive a reload: every state was hardcoded to its
 * default, so dragging the split, narrowing the chat, or switching to Code
 * lasted until the next refresh and then quietly undid itself. Kept as one
 * record per project rather than a key each — it is one layout, it is written
 * and read together, and one key is one thing to clear.
 */
export type WorkspaceLayout = {
  previewOpen?: boolean;
  chatOpen?: boolean;
  chatWidth?: number;
  view?: "preview" | "code";
  previewDevice?: "desktop" | "mobile";
};

export function workspaceLayoutKey(projectId: string): string {
  return `mx:workspace:${projectId}`;
}

/**
 * Read a stored layout, keeping only what still makes sense.
 *
 * Every field is checked rather than trusted: storage holds whatever any older
 * build of the app wrote, and a stale `chatWidth` from a wider window would
 * otherwise push the preview off the screen. Anything unrecognised is dropped
 * and the caller falls back to its default.
 */
export function parseWorkspaceLayout(
  raw: string | null | undefined,
  bounds: { minChat: number; maxChat: number },
): WorkspaceLayout {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const o = parsed as Record<string, unknown>;
  const out: WorkspaceLayout = {};
  if (typeof o.previewOpen === "boolean") out.previewOpen = o.previewOpen;
  if (typeof o.chatOpen === "boolean") out.chatOpen = o.chatOpen;
  if (o.view === "preview" || o.view === "code") out.view = o.view;
  if (o.previewDevice === "desktop" || o.previewDevice === "mobile") {
    out.previewDevice = o.previewDevice;
  }
  if (typeof o.chatWidth === "number" && Number.isFinite(o.chatWidth)) {
    // Clamped to this window, not the one it was saved from.
    out.chatWidth = Math.min(bounds.maxChat, Math.max(bounds.minChat, o.chatWidth));
  }
  return out;
}

/**
 * Storage access, wrapped.
 *
 * Reading and writing both throw outright in some contexts — a private window
 * with site data blocked, a thumbnail capture — and a workspace that cannot
 * remember its layout is not a reason to take the page down.
 */
export function readWorkspaceLayout(
  projectId: string,
  bounds: { minChat: number; maxChat: number },
): WorkspaceLayout {
  try {
    return parseWorkspaceLayout(window.localStorage.getItem(workspaceLayoutKey(projectId)), bounds);
  } catch {
    return {};
  }
}

/** Merges, so a caller can save one field without knowing the rest. */
export function writeWorkspaceLayout(projectId: string, patch: WorkspaceLayout): void {
  try {
    const key = workspaceLayoutKey(projectId);
    const prev = window.localStorage.getItem(key);
    let base: Record<string, unknown> = {};
    try {
      const j = prev ? JSON.parse(prev) : null;
      if (j && typeof j === "object" && !Array.isArray(j)) base = j as Record<string, unknown>;
    } catch {
      // Unreadable: start over rather than lose the write.
    }
    window.localStorage.setItem(key, JSON.stringify({ ...base, ...patch }));
  } catch {
    // Nothing to do: the layout still works, it just will not be remembered.
  }
}

/**
 * Whether this project had an app the last time it was open here.
 *
 * The workspace only learns that once it has read the chat, so it used to
 * start with the preview shut on every project and open it a moment later —
 * and its skeleton, which follows the same rule, was chat-only even for a
 * project that has always had a preview. Starting from what was true last
 * time puts the pane where it will be; a project that changed since is
 * corrected when the chat is read, as before.
 */
const hasAppKey = (projectId: string) => `mythex.hasApp.${projectId}`;

export function lastKnownHasApp(projectId: string): boolean | null {
  try {
    const v = window.localStorage.getItem(hasAppKey(projectId));
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

export function rememberHasApp(projectId: string, hasApp: boolean): void {
  try {
    window.localStorage.setItem(hasAppKey(projectId), hasApp ? "1" : "0");
  } catch {
    /* private mode: the next visit just starts from the old default */
  }
}
