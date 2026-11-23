import { appT, fill } from "../i18n/app";
import { DEPLOY_WINDOW_MS, deployRetryDelay, isDeployBlip, retryThroughDeploy } from "./deploy-window";

export interface OrchClient {
  url: string;
  token: string;
  projectId: string;
}

async function req<T>(c: OrchClient, path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${c.token}`,
    ...(init?.headers as Record<string, string> | undefined),
  };
  // Fastify rejects empty bodies when content-type is application/json
  // (e.g. DELETE /file?path=? with no body ? 500 { error: "internal" }).
  if (init?.body != null) {
    headers["content-type"] = headers["content-type"] ?? "application/json";
  }
  const res = await fetch(`${c.url}/p/${c.projectId}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) throw new Error(`orchestrator ${path}: ${res.status}`);
  return (await res.json()) as T;
}

export interface FileEntry {
  name: string;
  type: "file" | "dir";
  path: string;
}

/** One configured service (from the run manifest / stored config). */
export interface ServiceConfig {
  name: string;
  command: string;
  port: number;
  web?: boolean;
}

/** A service that's been (re)started, with its public URL + live health. */
/**
 * Did this start show the app cannot start: its install step failed, or its
 * web process had already ended? "Not healthy" alone is not that — an app can
 * still be compiling when a start stops waiting.
 */
export function startShowsCannotStart(res: {
  ok: boolean;
  healthy?: boolean;
  code?: string;
  services?: RunningService[];
}): boolean {
  if (!res.ok) return res.code === "setup_failed";
  if (res.healthy) return false;
  const web = res.services?.find((s) => s.web) ?? res.services?.[0];
  return Boolean(web?.exited);
}

export interface RunningService {
  name: string;
  port: number;
  url: string;
  web: boolean;
  healthy: boolean;
  /** From a start: the service's process had already ended (it could not start). */
  exited?: boolean;
}

export const orch = {
  listFiles: (c: OrchClient, path = "") => req<FileEntry[]>(c, `/files?path=${encodeURIComponent(path)}`),
  /** Recursive file paths for Quick Open (excludes node_modules / .git / .attachments). */
  listAllFiles: (c: OrchClient) => req<{ files: string[] }>(c, `/files/index`),
  /** Project search for the Code sidebar (??F). */
  searchFiles: (
    c: OrchClient,
    q: string,
    opts?: {
      caseInsensitive?: boolean;
      wholeWord?: boolean;
      regex?: boolean;
      include?: string;
      exclude?: string;
      max?: number;
    },
  ) => {
    const params = new URLSearchParams({ q });
    if (opts?.caseInsensitive) params.set("caseInsensitive", "1");
    if (opts?.wholeWord) params.set("wholeWord", "1");
    if (opts?.regex) params.set("regex", "1");
    if (opts?.include) params.set("include", opts.include);
    if (opts?.exclude) params.set("exclude", opts.exclude);
    if (opts?.max) params.set("max", String(opts.max));
    return req<{ matches: { path: string; line: number; text: string }[] }>(c, `/search?${params}`);
  },
  readFile: (c: OrchClient, path: string) => req<{ content: string }>(c, `/file?path=${encodeURIComponent(path)}`),
  /** Binary-safe read for chat image thumbnails (returns a data: URL). */
  readFileDataUrl: async (c: OrchClient, path: string) => {
    const res = await req<{ content: string; mime: string; encoding: "base64" }>(
      c,
      `/file?path=${encodeURIComponent(path)}&encoding=base64`,
    );
    return `data:${res.mime};base64,${res.content}`;
  },
  writeFile: (c: OrchClient, path: string, content: string) =>
    req<{ ok: true }>(c, `/file`, { method: "PUT", body: JSON.stringify({ path, content }) }),
  createFile: (c: OrchClient, path: string, dir = false) =>
    req<{ ok: true }>(c, `/file/create`, { method: "POST", body: JSON.stringify({ path, dir }) }),
  renameFile: (c: OrchClient, from: string, to: string) =>
    req<{ ok: true }>(c, `/file/rename`, { method: "POST", body: JSON.stringify({ from, to }) }),
  deleteFile: (c: OrchClient, path: string) =>
    req<{ ok: true }>(c, `/file?path=${encodeURIComponent(path)}`, { method: "DELETE" }),
  run: (c: OrchClient, command: string, port: number) =>
    req<{ ok: true; previewUrl: string; healthy: boolean }>(c, `/run`, {
      method: "POST",
      body: JSON.stringify({ command, port }),
    }),
  // Start ALL of the project's services (multi-service aware). `stored` is the
  // last-known config, used only if the manifest is missing.
  start: (
    c: OrchClient,
    stored?: { runCommand?: string | null; runPort?: number | null; services?: ServiceConfig[] | null },
  ) =>
    req<{
      ok: boolean;
      previewUrl?: string;
      healthy?: boolean;
      services?: RunningService[];
      message?: string;
      /** "setup_failed" when the project's install step failed. */
      code?: string;
      /** False when this start restarted the app (the page in the preview is from before). */
      unchanged?: boolean;
    }>(
      c,
      `/start`,
      { method: "POST", body: JSON.stringify(stored ?? {}) },
    ),
  services: (c: OrchClient) => req<{ services: RunningService[] }>(c, `/services`),
  /** The app's latest output lines, once (the stream is `streamLogs`). */
  recentLogs: (c: OrchClient, lines = 40) =>
    req<{ lines: string[] }>(c, `/logs/recent?lines=${lines}`),
  stop: (c: OrchClient) => req<{ ok: true }>(c, `/stop`, { method: "POST" }),
  health: (c: OrchClient, port: number) => req<{ healthy: boolean }>(c, `/health?port=${port}`),
  preview: (c: OrchClient, port: number) =>
    req<{ url: string; services?: RunningService[] }>(c, `/preview?port=${port}`),
  // `gitSha: null` resets to the repo's root commit (editing the first message
  // in a thread, before any checkpoint exists).
  // `filesOnly: true` = git reset only (Cursor-like, used by edit-as-rewind).
  // Default restarts preview services too (manual Restore button).
  restore: (c: OrchClient, gitSha: string | null, opts?: { filesOnly?: boolean }) =>
    req<{ ok: true; previewUrl: string | null; healthy: boolean; services: RunningService[] }>(c, `/restore`, {
      method: "POST",
      body: JSON.stringify({ gitSha, filesOnly: opts?.filesOnly ?? false }),
    }),
  upload: (c: OrchClient, name: string, base64Data: string) =>
    req<{ ok: true; path: string }>(c, `/upload`, {
      method: "POST",
      body: JSON.stringify({ name, data: base64Data }),
    }),
  // Terminal auth rides in the WebSocket subprotocol, not the query string
  // (which would leak the token into server access logs).
  terminalUrl: (c: OrchClient) => `${c.url.replace(/^http/, "ws")}/p/${c.projectId}/terminal`,
  terminalProtocols: (c: OrchClient) => ["mythex-token", c.token],
  /** Keep the sandbox's idle countdown from running out while the person works in the preview. */
  touch: (c: OrchClient) => req<{ ok: true }>(c, `/touch`, { method: "POST" }),
  /** Language server proxy (?server=typescript|python|go|?). */
  lspUrl: (c: OrchClient, server: string) =>
    `${c.url.replace(/^http/, "ws")}/p/${c.projectId}/lsp?server=${encodeURIComponent(server)}`,
  lspProtocols: (c: OrchClient) => ["mythex-token", c.token],
};

/** Stream a running app's logs over SSE, authenticating via header (no query token). */
export async function streamLogs(
  c: OrchClient,
  onLine: (line: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${c.url}/p/${c.projectId}/logs`, {
    headers: { authorization: `Bearer ${c.token}` },
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`logs stream failed: ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data: ")) continue;
      try {
        onLine(JSON.parse(line.slice(6)) as string);
      } catch {
        // ignore malformed frames
      }
    }
  }
}

export interface AgentEvent {
  type: string;
  [key: string]: unknown;
}

/** Parse an SSE response body, forwarding each JSON `data:` frame to `onEvent`. */
/**
 * When each project's agent stream last received a byte — events and the
 * server's `: ping` (every 15s) alike. A stream that has had one recently is
 * alive, whatever the page's visibility events suggest.
 */
const sseActivityAt = new Map<string, number>();

function markSseActivity(projectId: string): void {
  sseActivityAt.set(projectId, Date.now());
}

/** How long this project's agent stream has been silent (Infinity if never). */
export function agentStreamQuietMs(projectId: string): number {
  const at = sseActivityAt.get(projectId);
  return at == null ? Number.POSITIVE_INFINITY : Date.now() - at;
}

export async function consumeSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal,
  onBytes?: () => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const onAbort = () => {
    void reader.cancel().catch(() => {});
  };
  if (signal) {
    if (signal.aborted) {
      onAbort();
      throw new DOMException("Aborted", "AbortError");
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      onBytes?.();
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        // Frames may contain comment lines (": ping"); take the data line only.
        const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;
        try {
          onEvent(JSON.parse(dataLine.slice(6)) as AgentEvent);
        } catch {
          // ignore malformed frames
        }
      }
    }
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    // Safari iOS: TypeError "Load failed" when the radio / background kill SSE.
    throw toAgentStreamDropError(err);
  } finally {
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

/** Safari / Chrome fetch errors that mean the socket died, not that the turn ended. */
export function isDroppedAgentStreamError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; code?: string; retryable?: boolean; message?: string };
  if (e.name === "AbortError") return true;
  // The server answered, or the turn provably never started — nothing dropped.
  if ((err as { notStarted?: boolean }).notStarted) return false;
  if (typeof (err as { status?: unknown }).status === "number") return false;
  if (e.code === "network_error" || e.retryable === true) return true;
  // fetch reports every network failure as a TypeError; each browser words it
  // differently ("Load failed", "Failed to fetch", …), so the words say nothing.
  return e.name === "TypeError";
}

/** Our sentence for a connection that failed or dropped, in the app's language. */
export function connectionLost(): string {
  return appT().publish.agentConnection.connectionLost;
}

/**
 * The text an error may show a person: its own message only when it is one of
 * ours, which always carry a code. A browser's or library's error has none,
 * and its words ("Load failed", "Failed to fetch") are not an explanation.
 */
export function failureMessage(err: unknown): string | undefined {
  const e = err as { code?: unknown; message?: unknown } | null;
  if (!e || typeof e.code !== "string" || typeof e.message !== "string") return undefined;
  return e.message.trim() || undefined;
}

function toAgentStreamDropError(err: unknown): Error {
  if (isDroppedAgentStreamError(err) && (err as { code?: string }).code === "network_error") {
    return err as Error;
  }
  // The browser's error stays as the cause, for debugging; the message is ours.
  const wrapped = new Error(connectionLost()) as Error & { code?: string; retryable?: boolean; cause?: unknown };
  wrapped.code = "network_error";
  wrapped.retryable = true;
  wrapped.cause = err;
  return wrapped;
}

/** POST the prompt and stream SSE events back. */
export async function streamAgent(
  c: OrchClient,
  body: {
    prompt: string;
    threadId?: string;
    resumeSessionAt?: string;
    /** Cursor-style mode. */
    mode?: "agent" | "plan" | "ask";
    /** Ignored — orchestrator always runs the Standard coding agent. */
    model?: string;
    /** Replit-style App Testing (default true). */
    appTesting?: boolean;
    /** User-invoked hard skills (allowlist + optional entry tool_choice). */
    skills?: Array<{ id: string; params?: Record<string, unknown> }>;
    /** Playbook Skills ? inject full SKILL.md this turn. */
    attachedSkillIds?: string[];
    /** Interleaved skill/text blocks so the chip stays where the user placed it. */
    messageContent?: Array<
      | { type: "text"; text: string }
      | { type: "skill"; id: string; params?: Record<string, unknown> }
    >;
    /**
     * Build→Plan SwitchMode restart: USER was already persisted on the first turn.
     * Skip a second agent-begin so history doesn't get a duplicate USER row.
     */
    skipUserPersist?: boolean;
  },
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const start = Date.now();
  let res: Response | null = null;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(`${c.url}/p/${c.projectId}/agent`, {
        method: "POST",
        headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
      // No answer at all. The request may still have landed (mobile Safari
      // kills the socket, not the POST) — only a running turn says so. Resume
      // that; anything else is a turn that never started, and the message
      // goes back to the person rather than vanishing.
      const running = await retryThroughDeploy(
        () => agentStatus(c),
        (err) => (err as { deployBlip?: boolean }).deployBlip === true || (err as Error)?.name === "TypeError",
        { signal, budgetMs: 15_000 },
      ).catch(() => null);
      const err = new Error(connectionLost()) as Error & {
        code?: string;
        retryable?: boolean;
        notStarted?: boolean;
      };
      err.code = "network_error";
      err.retryable = true;
      if (!running?.active) err.notStarted = true;
      throw err;
    }
    if (res.ok && res.body) break;
    // The balancer answering while a deploy replaces the orchestrator: the
    // POST never reached a handler, so sending it again is safe.
    const blipBody = [502, 503, 504].includes(res.status)
      ? await res.clone().json().catch(() => null)
      : undefined;
    if (blipBody === undefined || !isDeployBlip(res.status, blipBody)) break;
    const delay = deployRetryDelay(attempt);
    if (Date.now() - start + delay > DEPLOY_WINDOW_MS) break;
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, delay);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
    });
  }
  if (!res || !res.ok || !res.body) {
    const status = res?.status ?? 0;
    const info = (await res?.json().catch(() => null)) as { error?: string; message?: string; limitCredits?: number } | null;
    const code = info?.error || "agent_stream_failed";
    // A project deleted from another tab or device answers "workspace not
    // ready, try again" here, forever. Ask once whether it still exists.
    const deleted = code === "sandbox_not_running" && (await projectIsGone(c.projectId));
    const err = new Error(
      info?.message ||
        (deleted
          ? appT().publish.agentConnection.projectDeleted
          : code === "build_in_progress"
          ? appT().publish.agentConnection.buildInProgress
          : code === "sandbox_not_running"
            ? appT().publish.agentConnection.sandboxNotRunning
            : fill(appT().publish.agentConnection.couldntStart, { status })),
    ) as Error & { status?: number; code?: string; retryable?: boolean; notStarted?: boolean; serverMessage?: string; limitCredits?: number };
    err.status = status;
    // A member's monthly limit here: the number, so the app can say it in the person's language.
    if (typeof info?.limitCredits === "number") err.limitCredits = info.limitCredits;
    err.code = code;
    // What the API itself said, if anything (a workspace member's refusal names who to ask).
    err.serverMessage = info?.message;
    err.retryable = true;
    err.notStarted = true;
    if (deleted) {
      // Its own card: no "Try again", and not the "workspace not ready" title.
      err.code = "project_deleted";
      err.retryable = false;
    } else if (code === "message_too_long") {
      // Sending it again changes nothing; the text stays in the composer to shorten.
      err.retryable = false;
    }
    throw err;
  }
  markSseActivity(c.projectId);
  await consumeSse(res.body, onEvent, signal, () => markSseActivity(c.projectId));
}

/** True only when the API says the project no longer exists (404). Anything else — offline, 401, 5xx — is not "gone". */
async function projectIsGone(projectId: string): Promise<boolean> {
  try {
    const { api, ApiError } = await import("./api");
    try {
      await api.get(`/v1/projects/${projectId}`);
      return false;
    } catch (err) {
      return err instanceof ApiError && err.status === 404;
    }
  } catch {
    return false;
  }
}

type AgentStatus = { active: boolean; threadId: string | null };

/** Coalesce concurrent + near-duplicate status probes (boot + ChatPanel reconnect). */
const agentStatusInFlight = new Map<string, Promise<AgentStatus>>();
const agentStatusCache = new Map<string, { at: number; value: AgentStatus }>();
const AGENT_STATUS_TTL_MS = 500;

/** Drop cached status — call before mid-build reconnect after sandbox wake. */
export function invalidateAgentStatus(c: OrchClient): void {
  agentStatusCache.delete(c.projectId);
  agentStatusInFlight.delete(c.projectId);
}

/** Is a build currently running for this project (server-side)? */
export async function agentStatus(c: OrchClient): Promise<AgentStatus> {
  const key = c.projectId;
  const cached = agentStatusCache.get(key);
  if (cached && Date.now() - cached.at < AGENT_STATUS_TTL_MS) return cached.value;

  const existing = agentStatusInFlight.get(key);
  if (existing) return existing;

  const p = (async () => {
    const res = await fetch(`${c.url}/p/${c.projectId}/agent/status`, {
      headers: { authorization: `Bearer ${c.token}` },
    });
    // A deploy's balancer answer is not "nothing is running": reading it that
    // way sealed live turns as finished. Throw, so callers keep what they knew.
    if (!res.ok && isDeployBlip(res.status, await res.clone().json().catch(() => null))) {
      throw Object.assign(new Error(`agent status ${res.status}`), { deployBlip: true });
    }
    const value: AgentStatus = !res.ok
      ? { active: false, threadId: null }
      : ((await res.json()) as AgentStatus);
    agentStatusCache.set(key, { at: Date.now(), value });
    return value;
  })().finally(() => {
    if (agentStatusInFlight.get(key) === p) agentStatusInFlight.delete(key);
  });

  agentStatusInFlight.set(key, p);
  return p;
}

/**
 * One long-poll until the project agent lock is free (or timeout). Prefer this
 * over looping GET /agent/status after Stop → Send.
 */
export async function waitUntilAgentIdle(
  c: OrchClient,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<boolean> {
  agentStatusCache.delete(c.projectId);
  agentStatusInFlight.delete(c.projectId);
  const res = await fetch(
    `${c.url}/p/${c.projectId}/agent/wait-idle?timeoutMs=${encodeURIComponent(String(timeoutMs))}`,
    {
      headers: { authorization: `Bearer ${c.token}` },
      signal,
    },
  );
  if (!res.ok) return false;
  const body = (await res.json()) as AgentStatus;
  agentStatusCache.set(c.projectId, { at: Date.now(), value: body });
  return !body.active;
}

/**
 * Ask the orchestrator to finish warming the agent daemon (best-effort).
 * Workspace fires this in the background after sandbox wake; `/agent` still
 * awaits ensureDaemon on the first turn if the daemon isn't ready yet.
 */
export async function waitForAgentDaemon(c: OrchClient): Promise<boolean> {
  const res = await fetch(`${c.url}/p/${c.projectId}/agent/daemon`, {
    method: "POST",
    headers: { authorization: `Bearer ${c.token}` },
  });
  if (!res.ok) return false;
  const body = (await res.json()) as { ready?: boolean };
  return Boolean(body.ready);
}

/** Reconnect to an in-progress build: replay buffered events, then stream live. */
export async function streamAgentResume(
  c: OrchClient,
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${c.url}/p/${c.projectId}/agent/stream`, {
      headers: { authorization: `Bearer ${c.token}` },
      signal,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw toAgentStreamDropError(e);
  }
  if (!res.ok || !res.body) throw toAgentStreamDropError(new Error(`agent resume failed: ${res.status}`));
  markSseActivity(c.projectId);
  await consumeSse(res.body, onEvent, signal, () => markSseActivity(c.projectId));
}

/**
 * Request a graceful stop of the current build (exact-cost interrupt).
 * Returns whether the cancel actually reached the sandbox ? callers must not
 * assume Stop worked just because the request was sent (see ChatPanel's
 * `stop()`, which surfaces a failure here instead of freezing the UI as if
 * the remote run had actually halted).
 */
export async function cancelAgent(
  c: OrchClient,
  opts?: { /** When false, only nudge kill — don't plant stop intent for the next send. */ intent?: boolean },
): Promise<boolean> {
  // Stop invalidates cached "active" — next send must re-probe the lock.
  agentStatusCache.delete(c.projectId);
  agentStatusInFlight.delete(c.projectId);
  const intent = opts?.intent !== false;
  try {
    const res = await fetch(
      `${c.url}/p/${c.projectId}/agent/cancel${intent ? "" : "?nudge=1"}`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${c.token}` },
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** Resolve an in-flight AskUserQuestion. */
export async function answerAgentQuestion(
  c: OrchClient,
  body: { toolCallId: string; answers: Record<string, string> },
): Promise<boolean> {
  try {
    const res = await fetch(`${c.url}/p/${c.projectId}/agent/answer`, {
      method: "POST",
      headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** After PATCH env: tell orch to restart + ack RequestSecrets (keys only). */
export async function ackAgentSecrets(
  c: OrchClient,
  body: { requestId: string; keys: string[]; cancelled?: boolean; kind?: "app_store" | "google_play" },
): Promise<boolean> {
  try {
    const res = await fetch(`${c.url}/p/${c.projectId}/agent/secrets-ack`, {
      method: "POST",
      headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Generated images, kept as data URLs for the life of the tab.
 *
 * The same picture is fetched by the peek chip while the turn runs and again by
 * the card once it is hoisted — and a 2K render is a couple of megabytes of
 * base64 each time. Without this the image appears, vanishes, and re-arrives
 * behind a second loading sweep, which reads as the thing being generated
 * twice. Keyed by project so two projects cannot serve each other's files.
 */
const generatedImageCache = new Map<string, string>();

function generatedImageKey(c: OrchClient, path: string): string {
  return `${c.projectId}:${path}`;
}

/** Sync cache peek — a hit renders the image with no loading state at all. */
export function peekGeneratedImage(c: OrchClient, path: string): string | null {
  return generatedImageCache.get(generatedImageKey(c, path)) ?? null;
}

/** Read a generated image as a data URL, once per project+path. */
export async function fetchGeneratedImage(c: OrchClient, path: string): Promise<string> {
  const key = generatedImageKey(c, path);
  const hit = generatedImageCache.get(key);
  if (hit) return hit;
  // The chat's copy (kept once the turn ends) doesn't wake the sandbox and
  // outlives it; while the turn is still running, only the sandbox has it.
  const { chatFileObjectUrl } = await import("./chat-files");
  const kept = await chatFileObjectUrl(c.projectId, { path });
  const url = kept ?? (await orch.readFileDataUrl(c, path));
  generatedImageCache.set(key, url);
  return url;
}

/** App Testing screenshot PNG under `/tmp/mythex-app-test` (basename only). */
export function agentAppTestScreenshotUrl(c: OrchClient, fileName: string): string {
  return `${c.url}/p/${c.projectId}/agent/app-test/screenshot?name=${encodeURIComponent(fileName)}`;
}

/** projectId:basename ? blob URL ? survives composer re-renders (do not revoke). */
const appTestScreenshotCache = new Map<string, string>();

function appTestScreenshotCacheKey(c: OrchClient, absOrName: string): string {
  const name = absOrName.includes("/") ? absOrName.split("/").pop()! : absOrName;
  return `${c.projectId}:${name}`;
}

/** Sync cache peek ? avoids spinner flash when thumbs remount on typing. */
export function peekAppTestScreenshot(c: OrchClient, absOrName: string): string | null {
  return appTestScreenshotCache.get(appTestScreenshotCacheKey(c, absOrName)) ?? null;
}

/** Fetch an App Testing screenshot as a cached blob URL (stable across remounts). */
/**
 * A fresh screenshot of a preview path taken in the sandbox's own browser, at
 * the size the person sees it. For annotating when the preview tools could not
 * load into the page (they draw what is on screen; this reloads the page, so a
 * scroll position or an open menu is not in it). Returns an object URL.
 */
export async function previewServerScreenshot(
  c: OrchClient,
  path: string,
  width: number,
  height: number,
): Promise<string> {
  const w = Math.max(320, Math.min(2560, Math.round(width)));
  const h = Math.max(320, Math.min(2560, Math.round(height)));
  // Its own endpoint, not browser-run: that one runs any code, so it is Pro
  // only, and it refused this picture for Free users with a 403.
  const res = await req<{ ok: boolean; result?: string; error?: string }>(c, `/preview-screenshot`, {
    method: "POST",
    body: JSON.stringify({ path: path || "/", width: w, height: h }),
  });
  const shot = parseAppTestScreenshotPathFromText(res.result ?? "");
  if (!res.ok || !shot) throw new Error(res.error || "no screenshot");
  return fetchAppTestScreenshot(c, shot);
}

function parseAppTestScreenshotPathFromText(text: string): string | null {
  const m = /\/tmp\/mythex-app-test\/[a-zA-Z0-9._-]+\.png/.exec(text);
  return m ? m[0] : null;
}

export async function fetchAppTestScreenshot(c: OrchClient, absOrName: string): Promise<string> {
  const key = appTestScreenshotCacheKey(c, absOrName);
  const hit = appTestScreenshotCache.get(key);
  if (hit) return hit;
  const name = absOrName.includes("/") ? absOrName.split("/").pop()! : absOrName;
  const res = await fetch(agentAppTestScreenshotUrl(c, name), {
    headers: { authorization: `Bearer ${c.token}` },
  });
  if (!res.ok) throw new Error(`screenshot ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  appTestScreenshotCache.set(key, url);
  return url;
}
