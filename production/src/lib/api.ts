import { localizeServerMessage } from "./server-messages";
import type { ServiceConfig } from "./orchestrator";
import {
  nativeAuthHeaders,
  nativeClientHeaders,
  nativeRefreshToken,
  rememberNativeSession,
} from "./native-session";
import { peekSessionHint } from "./session-hint";
import { DEPLOY_WINDOW_MS, deployRetryDelay, isDeployBlip } from "./deploy-window";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

/** Public MCP endpoint (Figma-style mcp.* host in prod). */
export const MCP_URL = (() => {
  const fromEnv = import.meta.env.VITE_MCP_URL?.replace(/\/$/, "");
  if (fromEnv) return `${fromEnv}/mcp`;
  const api = API_URL.replace(/\/$/, "");
  if (api.includes("api-staging.mythex.ai")) return "https://mcp-staging.mythex.ai/mcp";
  if (api.includes("api.mythex.ai")) return "https://mcp.mythex.ai/mcp";
  return `${api}/mcp`;
})();

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API ${status}`);
    // The API writes some error sentences in English; every screen reads
    // body.message, so it is put in the person's language once, here.
    const b = body as { message?: unknown } | null;
    if (b && typeof b === "object" && typeof b.message === "string") {
      b.message = localizeServerMessage(b.message);
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Send the user to login when their session can't be refreshed. */
function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const { pathname } = window.location;
  if (pathname.startsWith("/login") || pathname.startsWith("/signup")) return;
  window.location.assign("/login");
}

/**
 * fetch with retry for idempotent GETs. A dropped connection, or the balancer
 * answering 502/503/504 while a deploy replaces the API, is waited out for
 * about as long as a deploy takes (see deploy-window.ts) — it must not surface
 * as an empty page, a logout, or an error mid-session. Non-GETs are never
 * retried here (they may not be idempotent).
 */
async function fetchWithRetry(url: string, opts: RequestInit): Promise<Response> {
  const method = (opts.method ?? "GET").toUpperCase();
  const start = Date.now();
  let lastErr: unknown;
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch(url, opts);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") throw err;
      lastErr = err;
    }
    if (res) {
      if (method !== "GET" || ![502, 503, 504].includes(res.status)) return res;
      const body = await res.clone().json().catch(() => null);
      if (!isDeployBlip(res.status, body)) return res;
    }
    const delay = deployRetryDelay(attempt);
    if (method !== "GET" || Date.now() - start + delay > DEPLOY_WINDOW_MS) {
      if (res) return res;
      throw new ApiError(0, { error: "network", cause: String(lastErr) });
    }
    await sleep(delay);
  }
}

// Endpoints that must NOT trigger a token refresh on 401: refreshing itself
// (recursion), and the credential endpoints where a 401 means "bad credentials"
// rather than "expired session". Every OTHER authenticated route — crucially
// including /v1/auth/me — should refresh-and-retry so an expiring access token
// expiring never logs the user out while their 30-day refresh token is valid.
const NO_REFRESH_PATHS = [
  "/v1/auth/refresh",
  "/v1/auth/login",
  "/v1/auth/register",
  "/v1/auth/logout",
  "/v1/auth/forgot-password",
  "/v1/auth/reset-password",
];

// The refresh token is single-use (rotated on every refresh). When the access
// token expires and several requests 401 at once, we must NOT fire a refresh per
// request — the first would rotate the token and the rest would send the now
// revoked one, getting logged out. Coalesce concurrent refreshes into one call
// so a whole burst shares a single rotation.
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    const stored = nativeRefreshToken();
    refreshInFlight = fetch(`${API_URL}/v1/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: {
        ...nativeClientHeaders(),
        ...(stored ? { "content-type": "application/json" } : {}),
      },
      // The app has no cookie to refresh from — it sends the token it stored.
      ...(stored ? { body: JSON.stringify({ refreshToken: stored }) } : {}),
    })
      .then(async (r) => {
        if (r.ok) rememberNativeSession(await r.json().catch(() => null));
        return r.ok;
      })
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

let ssoRedirecting = false;
/**
 * A workspace that requires SSO refuses a session that didn't sign in through
 * it; go sign in with SSO and come back here. Once per page load.
 */
function maybeSsoRedirect(body: unknown): void {
  const b = body as { error?: string; loginUrl?: string } | null;
  if (b?.error !== "sso_required" || !b.loginUrl?.startsWith("/v1/auth/sso/start") || ssoRedirecting) return;
  if (typeof window === "undefined") return;
  ssoRedirecting = true;
  const back = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`${API_URL}${b.loginUrl}&returnTo=${encodeURIComponent(back)}`);
}

let twoFactorRedirecting = false;
/**
 * Two-factor: `mfa_required` — this session hasn't entered its code yet (the
 * auth provider re-reads /me and the app asks for it); `two_factor_required` —
 * a workspace requires it and the account doesn't have it on: go set it up.
 */
function maybeTwoFactor(body: unknown): void {
  const b = body as { error?: string } | null;
  if (typeof window === "undefined") return;
  if (b?.error === "mfa_required") {
    window.dispatchEvent(new Event("mythex:mfa-required"));
    return;
  }
  if (b?.error === "two_factor_required" && !twoFactorRedirecting && window.location.pathname !== "/settings") {
    twoFactorRedirecting = true;
    window.location.assign("/settings?setup2fa=required");
  }
}

async function request<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const res = await fetchWithRetry(`${API_URL}${path}`, {
    credentials: "include",
    // Only send a JSON content-type when there is actually a body,
    // otherwise Fastify rejects the request with FST_ERR_CTP_EMPTY_JSON_BODY.
    // The two native header sets are empty objects on the web, so this is the
    // same request a browser has always made.
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...nativeClientHeaders(),
      ...nativeAuthHeaders(),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (res.status === 401 && !retried && !NO_REFRESH_PATHS.some((p) => path.startsWith(p))) {
    // No hint → visitor on a public page; don't chain a doomed /refresh after /me 401.
    if (path.startsWith("/v1/auth/me") && !peekSessionHint()) {
      throw new ApiError(res.status, await res.json().catch(() => null));
    }
    if (await refreshSession()) return request(path, init, true);
    // Refresh failed → the session is truly gone. Let the AuthProvider handle the
    // /v1/auth/me probe itself (so logged-out visitors on public pages aren't
    // force-redirected; the Protected route guard covers protected pages). Any
    // other authenticated data request bounces to login rather than showing
    // broken data.
    if (path !== "/v1/auth/me") redirectToLogin();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (res.status === 403) {
      maybeSsoRedirect(body);
      maybeTwoFactor(body);
    }
    throw new ApiError(res.status, body);
  }
  const json = (await res.json()) as T;
  // An auth response to the app carries the tokens it cannot get from a cookie.
  // A web response carries neither field and this is a no-op.
  rememberNativeSession(json);
  return json;
}

/**
 * A file's bytes from the API, as a Blob — for chat files streamed through it
 * (same origin as every other call, so reading them needs no CORS on a bucket).
 * Retries once after a refresh, like `request`.
 */
export async function fetchBlob(path: string, retried = false): Promise<Blob> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { ...nativeClientHeaders(), ...nativeAuthHeaders() },
  });
  if (res.status === 401 && !retried && (await refreshSession())) return fetchBlob(path, true);
  if (!res.ok) throw new ApiError(res.status, null);
  return res.blob();
}

/** Coalesce concurrent identical GETs (React StrictMode double-mount, overlapping boot). */
const getInFlight = new Map<string, Promise<unknown>>();

/**
 * GETs started before anything asked for them (prefetchGet), each handed to the
 * first caller of the same path. Opening a project used to ask for its chat only
 * once the page's code had loaded and the sign-in check had come back — about
 * 0.9 s in — and for the chat's messages only after the chat list; these start
 * at boot instead.
 */
const prefetched = new Map<string, Promise<unknown>>();
const PREFETCH_TTL_MS = 15_000;

/**
 * Start a GET the app is about to make. Only with a session: a signed-out
 * visitor must get the sign-in flow, not a data request that bounces to it.
 * A failed prefetch is never an answer — the caller makes its own request.
 */
export function prefetchGet(path: string): void {
  if (prefetched.has(path) || !peekSessionHint()) return;
  const p = request<unknown>(path);
  p.catch(() => {});
  prefetched.set(path, p);
  setTimeout(() => {
    if (prefetched.get(path) === p) prefetched.delete(path);
  }, PREFETCH_TTL_MS);
}

function getDeduped<T>(path: string): Promise<T> {
  const pre = prefetched.get(path);
  if (pre) {
    prefetched.delete(path);
    return (pre as Promise<T>).catch(() => getDeduped<T>(path));
  }
  const existing = getInFlight.get(path);
  if (existing) return existing as Promise<T>;
  const p = request<T>(path).finally(() => {
    if (getInFlight.get(path) === p) getInFlight.delete(path);
  });
  getInFlight.set(path, p);
  return p;
}

export const api = {
  get: <T>(path: string) => getDeduped<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "DELETE", body: body === undefined ? undefined : JSON.stringify(body) }),
};

export const googleAuthUrl = (invite?: string, returnTo?: string | null, fingerprint?: string) => {
  const q = new URLSearchParams();
  if (invite) q.set("invite", invite);
  // Counted only if this Google sign-in creates an account (lib/signup-fingerprint.ts).
  if (fingerprint) q.set("fp", fingerprint);
  // Back to the page that sent you to sign in (an invite link, a members-only app).
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) q.set("returnTo", returnTo);
  const qs = q.toString();
  return `${API_URL}/v1/auth/google${qs ? `?${qs}` : ""}`;
};

export const githubAuthUrl = (returnTo?: string) =>
  `${API_URL}/v1/auth/github${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;

/** Download a binary API response (e.g. project export) with cookie auth. */
export async function apiDownload(path: string, fallbackFilename: string): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, { credentials: "include" });
  if (res.status === 401) {
    const refreshed = await refreshSession();
    if (!refreshed) {
      redirectToLogin();
      throw new ApiError(401, { error: "unauthorized" });
    }
    return apiDownload(path, fallbackFilename);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body);
  }
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(cd);
  const filename = match?.[1] ?? fallbackFilename;
  const { saveFile } = await import("./save-file");
  saveFile(blob, filename);
}

/** Read a File as base64 (no data: prefix) for import endpoints. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const i = result.indexOf(",");
      resolve(i >= 0 ? result.slice(i + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

export interface Me {
  id: string;
  email: string;
  name: string;
  plan: "FREE" | "PRO" | "BUSINESS" | "ENTERPRISE";
  balanceCents: number;
  balanceTokens: number;
  /** Build-credit balance (preferred for UI). */
  balanceCredits?: number;
  /** This month's Cloud credits left (published apps only). */
  cloudCredits?: number;
  isAdmin: boolean;
  /** Set when the account is an approved partner (the account menu links its dashboard). */
  partnerTrack?: "expert" | "agency" | "creator" | null;
  emailVerified: boolean;
  avatarUrl: string | null;
  githubLogin: string | null;
  /** False for Google-only accounts (no password step-up on delete). */
  hasPassword?: boolean;
  /** The app language picked on the account; null follows the browser. */
  locale?: string | null;
  /** Two-factor sign-in: on, and whether this session must still enter a code. */
  twoFactor?: { enabled: boolean; required: boolean };
}

export type WorkspaceRole = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";

export interface TeamFeatures {
  roles: boolean;
  perMemberLimits: boolean;
  privateProjects: boolean;
  publishPolicy: boolean;
  membersOnlyApps: boolean;
  autoJoinDomain: boolean;
  sso: boolean;
  auditLog: boolean;
  defaultProjectVisibility: boolean;
  domainRequests: boolean;
  sharingControls: boolean;
  require2fa: boolean;
  /** Letting Editors invite (Enterprise). */
  inviteControls: boolean;
}

/** GET /v1/workspaces/:id — a workspace's settings, plan and your role. */
export interface WorkspaceDetail {
  id: string;
  name: string;
  avatarUrl: string | null;
  isDefault: boolean;
  createdAt: string;
  role: WorkspaceRole;
  owner: { id: string; name: string };
  plan: "FREE" | "PRO" | "BUSINESS" | "ENTERPRISE";
  features: TeamFeatures;
  settings: {
    publishPolicy: "everyone" | "admins" | "approval";
    defaultAppAccess: "public" | "members";
    autoJoinDomain: string | null;
    /** The company domain is proven over DNS; SSO needs it. */
    domainVerified?: boolean;
    /** The TXT record value that proves it (admins only). */
    domainTxt?: string | null;
    defaultMemberCreditLimit: number | null;
    ssoEnabled: boolean;
    ssoEnforced: boolean;
    ssoProvider?: "google" | "workos" | null;
    ssoAvailable?: { google: boolean; workos: boolean };
    domainJoinMode: "auto" | "request";
    invitePolicy: "admins" | "editors";
    inviteLinksEnabled: boolean;
    defaultProjectVisibility: "workspace" | "private";
    previewLinksEnabled: boolean;
    codeDownloadsEnabled: boolean;
    require2fa: boolean;
  };
  pendingApprovals: number;
  pendingJoinRequests: number;
  canInvite: boolean;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: WorkspaceRole;
  isDefault: boolean;
  memberCount: number;
  projectCount: number;
  plan?: "FREE" | "PRO" | "BUSINESS" | "ENTERPRISE";
  features?: TeamFeatures;
  avatarUrl?: string | null;
  /** Waiting on you as an admin (0s otherwise): join requests and publishes to approve. */
  pending?: { joinRequests: number; approvals: number };
}

export interface WorkspaceMembers {
  members: Array<{
    userId: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    role: WorkspaceRole;
    joinedAt: string;
    monthlyCreditLimit?: number | null;
    creditsThisMonth?: number;
    creditsTotal?: number;
  }>;
  invitations: Array<{ id: string; email: string; createdAt: string; role?: WorkspaceRole; invitedBy?: { name: string } }>;
  role?: WorkspaceRole;
  plan?: "FREE" | "PRO" | "BUSINESS" | "ENTERPRISE";
  features?: TeamFeatures;
}

export interface InvitePreview {
  workspaceName: string;
  inviterName: string;
  email: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  template: string | null;
  sandboxStatus: "NONE" | "STARTING" | "RUNNING" | "PAUSED";
  lastActiveAt: string;
  publishedUrl: string | null;
  /** Static screenshot of last successful publish (dashboard cards). */
  thumbnailUrl?: string | null;
  createdBy?: string;
}

export interface ProjectPlanLimits {
  canEditCode: boolean;
  canExportCode: boolean;
  canGitHub: boolean;
  canAttachDatabase: boolean;
  canEnableStorage: boolean;
  maxDeployments: number;
  previewInfraEphemeral?: boolean;
  storageBytesCap?: number | null;
}

export interface ProjectDetail {
  id: string;
  name: string;
  template: string | null;
  sandboxStatus: string;
  runCommand: string | null;
  runPort: number | null;
  runServices: ServiceConfig[] | null;
  hasDatabase: boolean;
  /** Published with its own database (Fly projects). */
  hasLiveDatabase?: boolean;
  hasStorage: boolean;
  githubRepo?: string | null;
  githubBaseBranch?: string | null;
  githubBranch?: string | null;
  githubAutoSync?: boolean;
  threads: Array<{ id: string; title: string; agentSessionId: string | null }>;
  orchestratorToken: string;
  orchestratorUrl: string;
  planLimits?: ProjectPlanLimits;
  /** Your role in this project's workspace (a private project's creator: Owner). */
  role?: WorkspaceRole;
  visibility?: "workspace" | "private";
  createdById?: string;
  ownerPlan?: "FREE" | "PRO" | "BUSINESS" | "ENTERPRISE";
  /** Your own credits and plan pay for it; false in a teammate's workspace. */
  paidByMe?: boolean;
}

export interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ThreadsPage {
  items: Session[];
  nextCursor: string | null;
}

/** A chat in the workspace-wide Recents list (every project's chats). */
export interface WorkspaceThread {
  id: string;
  title: string;
  updatedAt: string;
  projectId: string;
  projectName: string;
}

export interface WorkspaceThreadsPage {
  items: WorkspaceThread[];
  nextCursor: string | null;
}

export interface MessagesPage {
  items: ChatMessageDto[];
  hasMore: boolean;
  /** When the chat was last written to (first page only); see thread-sync-hook. */
  threadUpdatedAt?: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
}

export interface ChatMessageDto {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: Array<{
    type: string;
    text?: string;
    /** Structured agent error code (e.g. turn_interrupted) — UI keys off this, not copy. */
    code?: string;
    /** When true, composer may offer Try again. */
    retryable?: boolean;
    /** Hard skill invocation persisted on USER messages. */
    id?: string;
    params?: Record<string, unknown>;
    name?: string;
    input?: unknown;
    output?: string;
    /** Nested Agent transcript for subagent tabs. */
    subagent?: {
      status?: string;
      prompt?: string;
      description?: string;
      finalText?: string;
      blocks?: Array<Record<string, unknown>>;
      /** Transcript left out for its size; fetch it with GET …/subagent/:toolUseId. */
      deferred?: { blocks: number; tools: number };
    };
    /** AskUserQuestion wait, thinking duration, or tool wall time. */
    durationMs?: number;
  }>;
  costCents: number;
  costTokens: number;
  createdAt: string;
  /** Git checkpoint committed at the end of this (ASSISTANT) turn, if any. */
  gitSha?: string | null;
}
