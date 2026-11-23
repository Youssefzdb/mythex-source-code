import { api } from "./api";

/**
 * Connected apps, from the browser's side.
 *
 * Nothing here ever holds a credential. Connecting is a redirect to the
 * provider and back; from then on the account lives with Mythex's Composio
 * key, and the chat agent reaches it through the server.
 */

export type IntegrationConnection = {
  id: string;
  toolkit: string;
  status: string;
  createdAt?: string;
  name?: string;
  logo?: string;
  description?: string;
};

export type ToolkitCatalogItem = {
  slug: string;
  name: string;
  description: string;
  logo: string;
  categories: string[];
  authSchemes: string[];
  noAuth: boolean;
  toolsCount?: number;
};

export type CategoryCount = { id: string; label: string; count: number };

export type IntegrationsOverview = {
  configured: boolean;
  connections: IntegrationConnection[];
  featured: ToolkitCatalogItem[];
  /** Rail entries with their sizes, from the server's cached count. */
  categories: CategoryCount[];
  /** How many connectable apps exist in total. */
  totalApps: number;
  setupHint?: string;
};

export type CatalogPage = {
  items: ToolkitCatalogItem[];
  nextCursor: string | null;
  totalItems?: number;
};

export function fetchIntegrations(): Promise<IntegrationsOverview> {
  return api.get<IntegrationsOverview>("/v1/integrations");
}

export function fetchCatalog(opts: {
  search?: string;
  category?: string;
  cursor?: string | null;
  limit?: number;
}): Promise<CatalogPage> {
  const params = new URLSearchParams();
  if (opts.search) params.set("search", opts.search);
  if (opts.category) params.set("category", opts.category);
  if (opts.cursor) params.set("cursor", opts.cursor);
  params.set("limit", String(opts.limit ?? 48));
  return api.get<CatalogPage>(`/v1/integrations/catalog?${params}`);
}

/**
 * Start OAuth for one app.
 *
 * `returnTo` is where the provider drops them afterwards — the page they were
 * on, so the modal can reopen over their work instead of dumping them home.
 */
export function startConnect(
  toolkit: string,
  returnTo: string,
): Promise<{ redirectUrl: string; connectedAccountId?: string }> {
  return api.post("/v1/integrations/connect", { toolkit, returnTo });
}

/**
 * Tell the API a connection finished, on the way back from the provider.
 *
 * Composio sends the callback to the browser, not to us, so this is the only
 * moment anything server-side can learn that an account was actually linked.
 * The API re-checks the id against the signed-in user before it believes it.
 *
 * Fire-and-forget: a notification that did not send must never be the reason
 * someone's freshly connected app looks broken.
 */
export function reportConnected(connectedAccountId: string): void {
  void api
    .post("/v1/integrations/connected", { connectedAccountId })
    .catch(() => {});
}

/** The account id Composio hands back, taken off the URL and cleared from it. */
export function takeReturnedConnection(): string | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const id = url.searchParams.get("connected_account_id");
  if (!id) return null;
  // Strip both, or a refresh re-reports the same connection and the params
  // follow the user around the app for the rest of the session.
  url.searchParams.delete("connected_account_id");
  url.searchParams.delete("status");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  return id;
}

export function disconnectApp(connectedAccountId: string): Promise<{ ok: true }> {
  return api.delete(`/v1/integrations/${encodeURIComponent(connectedAccountId)}`);
}

/** Composio serves a logo per toolkit at a predictable path. */
export function connectorLogo(slug: string): string {
  return `https://logos.composio.dev/api/${slug}`;
}

/**
 * The faces on the dashboard pill.
 *
 * Decorative, so it is a fixed list rather than a fetch — the pill sits above
 * the fold and should not wait on the catalogue to paint. The real list lives
 * on the server; these are just the ones worth showing off.
 */
export const PILL_CONNECTORS = [
  "gmail",
  "slack",
  "googlesheets",
  "googledrive",
  "notion",
  "stripe",
  "linear",
  "github",
  "airtable",
  "hubspot",
];


/* ── Custom MCP servers ──────────────────────────────────────────────────── */

export type McpServer = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  /** What the server advertised at handshake, or null if it advertised none. */
  icon: string | null;
  /** "none", "bearer" (a pasted token) or "oauth" (the sign-in flow). */
  auth: "none" | "bearer" | "oauth";
  /** "ready", or "pending_auth" while a sign-in is out for approval. */
  status: "ready" | "pending_auth";
  hasToken: boolean;
  toolCount: number;
  tools: Array<{ name: string; description?: string }>;
  lastError: string | null;
  lastCheckedAt: string | null;
};

export function fetchMcpServers(): Promise<{
  servers: McpServer[];
  /** Mythex's own MCP endpoint — the other direction, for Claude and Cursor. */
  mythexMcpUrl?: string;
}> {
  return api.get("/v1/integrations/mcp");
}

/**
 * Add a server by URL.
 *
 * The server is handshaked before it is saved, so this is slow by design and
 * fails loudly — a URL that cannot be reached is not worth a row in the list.
 */
/**
 * The reply is one of two shapes.
 *
 * A server that let us straight in comes back saved. One that wants a sign-in
 * comes back with `authorizeUrl` and a row parked on `pending_auth` — the
 * browser sends the user there, and the API's callback finishes the row.
 */
export function addMcpServer(body: {
  url: string;
  name?: string;
  token?: string;
  auth?: "oauth" | "bearer" | "none";
  returnTo?: string;
}): Promise<{ server: McpServer; authorizeUrl?: string }> {
  return api.post("/v1/integrations/mcp", body);
}

/** Run the sign-in again for a server whose grant lapsed or was revoked. */
export function reauthMcpServer(
  id: string,
  returnTo?: string,
): Promise<{ server: McpServer; authorizeUrl?: string }> {
  return api.post(`/v1/integrations/mcp/${encodeURIComponent(id)}/reauth`, { returnTo });
}

/**
 * Where the sign-in should drop them: this page, this panel.
 *
 * The provider redirects through our API, which has no idea what was on
 * screen, so the address to come back to is decided here and carried through
 * the flow.
 */
export function mcpReturnTo(): string {
  if (typeof window === "undefined") return "/";
  const url = new URL(window.location.href);
  url.searchParams.set("connectors", "1");
  url.searchParams.set("tab", "mcp");
  url.searchParams.delete("mcp");
  url.searchParams.delete("mcp_error");
  return `${url.pathname}${url.search}`;
}

/**
 * Change a server in place.
 *
 * A rename saves outright. Anything that changes what we connect to — the
 * URL, the auth mode, a new token — is proved against the server first, and
 * switching to OAuth comes back with `authorizeUrl` because a grant belongs
 * to the address it was issued for.
 */
export function updateMcpServer(
  id: string,
  body: {
    enabled?: boolean;
    name?: string;
    url?: string;
    token?: string;
    auth?: "oauth" | "bearer" | "none";
    returnTo?: string;
  },
): Promise<{ server: McpServer; authorizeUrl?: string }> {
  return api.patch(`/v1/integrations/mcp/${encodeURIComponent(id)}`, body);
}

export function refreshMcpServer(id: string): Promise<{ server: McpServer }> {
  return api.post(`/v1/integrations/mcp/${encodeURIComponent(id)}/refresh`, {});
}

export function removeMcpServer(id: string): Promise<{ ok: true }> {
  return api.delete(`/v1/integrations/mcp/${encodeURIComponent(id)}`);
}

/* ── Opening the modal from anywhere ─────────────────────────────────────── */

const OPEN_EVENT = "mythex:connectors-open";

/** Sidebar, chat, or a return from OAuth — all open the same one modal. */
export function openConnectors(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function onConnectorsOpen(handler: () => void): () => void {
  window.addEventListener(OPEN_EVENT, handler);
  return () => window.removeEventListener(OPEN_EVENT, handler);
}

/**
 * Did we just come back from a provider?
 *
 * The flag is consumed here — stripped from the URL — so a reload does not
 * announce the same connection twice.
 */
export function consumeConnectReturn(): boolean {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  if (url.searchParams.get("connectors") !== "connected") return false;
  url.searchParams.delete("connectors");
  url.searchParams.delete(CONNECT_FROM);
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  return true;
}

/**
 * Who started the connection, carried through the provider and back.
 *
 * A connect begun in the modal should land back in the modal. One begun from
 * a card in chat should land back in the chat, with no modal opening over a
 * conversation the user never asked to leave.
 */
const CONNECT_FROM = "connect_from";

/** Where a connect started from the chat should return to. */
export function chatConnectReturnTo(): string {
  if (typeof window === "undefined") return "/";
  const url = new URL(window.location.href);
  url.searchParams.set(CONNECT_FROM, "chat");
  return `${url.pathname}${url.search}`;
}

/** Did this return come from a card in the chat rather than from the modal? */
export function connectStartedInChat(): boolean {
  if (typeof window === "undefined") return false;
  return new URL(window.location.href).searchParams.get(CONNECT_FROM) === "chat";
}
