import { API_URL } from "./api";
import { openIntercom } from "./intercom";
import { nativeClientHeaders } from "./native-session";

const OPEN_EVENT = "mythex:support-open";

export function isCustomSupportEnabled(): boolean {
  const flag = import.meta.env.VITE_SUPPORT_CHAT as string | undefined;
  return flag !== "false" && flag !== "0";
}

/** Sidebar / footer Support — custom messenger, else Intercom, else email. */
export function openSupport(): void {
  if (isCustomSupportEnabled()) {
    openSupportChat();
    return;
  }
  openIntercom();
}

export function openSupportChat(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function onSupportChatOpen(handler: () => void): () => void {
  window.addEventListener(OPEN_EVENT, handler);
  return () => window.removeEventListener(OPEN_EVENT, handler);
}

export type SupportMessage = {
  id: string;
  role: "customer" | "bot" | "human" | "system";
  body: string;
  createdAt: string;
};

export type SupportThread = {
  conversation: {
    id: string;
    status: string;
    classification: string;
    assignedTo: string | null;
  } | null;
  messages: SupportMessage[];
  /** True when the thread has messages older than the page just returned. */
  hasMore?: boolean;
};

async function supportFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
}

export async function fetchSupportThread(): Promise<SupportThread> {
  const res = await supportFetch("/v1/support/thread");
  if (!res.ok) {
    const err = new Error(res.status === 503 ? "support_unavailable" : "support_error");
    (err as { status?: number }).status = res.status;
    throw err;
  }
  return (await res.json()) as SupportThread;
}

/**
 * A signed-out visitor's first message carries a Cloudflare Turnstile token
 * (the API asks once per guest: routes/support.ts humanGuest). Content-type
 * goes here too: a request's own headers replace supportFetch's. The phone app
 * sends a token as well; its native header only identifies it.
 */
function withTurnstile(token?: string | null): Record<string, string> {
  return { "content-type": "application/json", ...nativeClientHeaders(), ...(token ? { "x-turnstile-token": token } : {}) };
}

export async function sendSupportMessage(body: string, turnstileToken?: string | null): Promise<SupportThread> {
  const res = await supportFetch("/v1/support/messages", {
    method: "POST",
    headers: withTurnstile(turnstileToken),
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    const err = new Error(res.status === 400 ? "validation" : res.status === 503 ? "support_unavailable" : "support_error");
    (err as { status?: number }).status = res.status;
    throw err;
  }
  return (await res.json()) as SupportThread;
}

/** Live thread + token updates while the panel is open. One connection — not polling. */
export function subscribeSupportThread(handlers: {
  onThread: (thread: SupportThread) => void;
  onToken?: (text: string) => void;
}): () => void {
  const es = new EventSource(`${API_URL}/v1/support/stream`, { withCredentials: true });
  const onThread = (ev: Event) => {
    const data = (ev as MessageEvent).data;
    if (typeof data !== "string") return;
    try {
      handlers.onThread(JSON.parse(data) as SupportThread);
    } catch {
      /* ignore malformed frames */
    }
  };
  const onToken = (ev: Event) => {
    const data = (ev as MessageEvent).data;
    if (typeof data !== "string") return;
    try {
      const parsed = JSON.parse(data) as { text?: unknown };
      if (typeof parsed.text === "string" && parsed.text) handlers.onToken?.(parsed.text);
    } catch {
      /* ignore */
    }
  };
  es.addEventListener("thread", onThread);
  es.addEventListener("token", onToken);
  return () => {
    es.removeEventListener("thread", onThread);
    es.removeEventListener("token", onToken);
    es.close();
  };
}

export const SUPPORT_MAX_CHARS = 4000;
export const SUPPORT_EMAIL = "support@mythex.ai";

export type SupportThreadSummary = {
  id: string;
  externalId: string;
  status: string;
  assignedTo: string | null;
  createdAt: string;
  /** The question that started it — how the widget names the conversation. */
  title?: string;
  lastMessage: { role: string; body: string; createdAt: string } | null;
};

function supportError(res: Response): Error {
  const err = new Error(
    res.status === 400 ? "validation" : res.status === 503 ? "support_unavailable" : "support_error",
  );
  (err as { status?: number }).status = res.status;
  return err;
}

/** Past conversations, newest first. */
export async function fetchSupportThreads(): Promise<SupportThreadSummary[]> {
  const res = await supportFetch("/v1/support/threads");
  if (!res.ok) throw supportError(res);
  return ((await res.json()) as { threads: SupportThreadSummary[] }).threads;
}

/**
 * One conversation. `before` is the id of the oldest message on screen, which
 * is how scrolling up asks for the page before it.
 */
export async function fetchSupportThreadById(
  threadId: string,
  before?: string,
): Promise<SupportThread & { hasMore: boolean }> {
  const params = new URLSearchParams({ threadId });
  if (before) params.set("before", before);
  const res = await supportFetch(`/v1/support/thread-by-id?${params.toString()}`);
  if (!res.ok) throw supportError(res);
  return (await res.json()) as SupportThread & { hasMore: boolean };
}

/** Start a new conversation; the current one stays readable in the list. */
export async function startSupportThread(turnstileToken?: string | null): Promise<{ id: string }> {
  const res = await supportFetch("/v1/support/threads", {
    method: "POST",
    headers: withTurnstile(turnstileToken),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw supportError(res);
  return ((await res.json()) as { thread: { id: string } }).thread;
}

/** End the conversation. The next question starts fresh with the AI. */
export async function endSupportThread(threadId: string): Promise<void> {
  const res = await supportFetch(`/v1/support/threads/${encodeURIComponent(threadId)}/end`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.ok) throw supportError(res);
}

/**
 * "Someone answered while you were away."
 *
 * Held per browser rather than on the server: what counts as seen is whether
 * this person has looked at the widget, which only the browser knows. Checked
 * when the app loads and when the tab comes back, so there is no polling.
 */
const SEEN_KEY = "mythex.support.seen";
const unreadListeners = new Set<(unread: boolean) => void>();
let unreadState = false;

function readSeenAt(): number {
  try {
    return Number(window.localStorage.getItem(SEEN_KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
}

/** The newest thing said to this person, ignoring their own messages. */
function newestInboundAt(threads: SupportThreadSummary[]): number {
  let newest = 0;
  for (const t of threads) {
    const m = t.lastMessage;
    if (!m || m.role === "customer") continue;
    newest = Math.max(newest, new Date(m.createdAt).getTime());
  }
  return newest;
}

export function supportUnread(): boolean {
  return unreadState;
}

export function onSupportUnread(cb: (unread: boolean) => void): () => void {
  unreadListeners.add(cb);
  cb(unreadState);
  return () => unreadListeners.delete(cb);
}

function setUnread(next: boolean): void {
  if (next === unreadState) return;
  unreadState = next;
  for (const cb of unreadListeners) cb(next);
}

/**
 * One check in flight at a time, and not more than one every few seconds.
 *
 * The badge is a single global, but the sidebar that refreshes it is mounted
 * twice at once — a drawer for narrow screens and the fixed rail for wide ones,
 * both always mounted and one merely hidden by CSS. So every visibilitychange
 * fetched the whole support thread list twice, on every focus, for a boolean
 * nobody had asked to see.
 *
 * Fixed here rather than by unmounting a sidebar or moving the call up a level:
 * this is global state with global callers, so the coalescing belongs next to
 * the state. Any number of callers now cost one request.
 */
let unreadInFlight: Promise<void> | null = null;
let unreadCheckedAt = 0;
/** Long enough to swallow duplicate mounts and focus storms, short enough that
 *  coming back to the tab still feels live. */
const UNREAD_MIN_INTERVAL_MS = 5_000;

/** Ask once whether anything new arrived. Safe to call on focus. */
export function refreshSupportUnread(): Promise<void> {
  if (!isCustomSupportEnabled()) return Promise.resolve();
  if (unreadInFlight) return unreadInFlight;
  if (Date.now() - unreadCheckedAt < UNREAD_MIN_INTERVAL_MS) return Promise.resolve();

  unreadInFlight = (async () => {
    try {
      const threads = await fetchSupportThreads();
      setUnread(newestInboundAt(threads) > readSeenAt());
      // Only a real answer counts: a failed check must not buy quiet for the
      // next five seconds.
      unreadCheckedAt = Date.now();
    } catch {
      /* never let a badge check surface an error */
    } finally {
      unreadInFlight = null;
    }
  })();
  return unreadInFlight;
}


/** The widget is open: everything up to now has been seen. */
export function markSupportSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, String(Date.now()));
  } catch {
    /* private mode — the badge just stays as it was */
  }
  setUnread(false);
}
