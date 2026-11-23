import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, Loader2, Plus, RefreshCw, Server, Trash2, TriangleAlert } from "lucide-react";
import {
  addMcpServer,
  fetchMcpServers,
  reauthMcpServer,
  refreshMcpServer,
  removeMcpServer,
  updateMcpServer,
  mcpReturnTo,
  type McpServer,
} from "../lib/connectors";
import { ApiError } from "../lib/api";
import { useToast } from "./ui";
import { appT, fill, pl, useT } from "../i18n/app";
import { ModalSurface, useSurfaceClose } from "./ui/Sheet";
import {
  btnClass,
  whiteBtnClass,
  CARD_BG,
  FG_SECONDARY,
  FG_TERTIARY,
  FIELD_CLASS,
  surfaceRing,
} from "../lib/surfaces";

/**
 * Custom MCP — the tab beside the catalogue.
 *
 * The catalogue is a fixed list someone else curates. This is the other half:
 * paste the URL of any MCP server — a company's internal one, a vendor's beta,
 * Mythex's own — and the agent can call its tools by name.
 *
 * Adding is deliberately slow. The server is handshaked before the row exists,
 * so a bad URL or a wrong token fails here, in a form, rather than three
 * messages into a build.
 */
/** The form's action, kept as a component only for the busy/label handling. */
function WhiteButton({
  children,
  disabled,
  onClick,
  testId,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={whiteBtnClass("lg")}
    >
      {children}
    </button>
  );
}

/**
 * One authentication choice.
 *
 * A real radio input rather than a styled div: arrow keys move between the
 * options, the label is clickable, and a screen reader reads it as the one
 * group of three it is.
 */
function AuthChoice({
  value,
  current,
  onPick,
  label,
  hint,
}: {
  value: "oauth" | "bearer" | "none";
  current: string;
  onPick: (v: "oauth" | "bearer" | "none") => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="radio"
        name="mcp-auth"
        value={value}
        checked={current === value}
        onChange={() => onPick(value)}
        className="mt-0.5 size-3.5 shrink-0 accent-white"
      />
      <span className="min-w-0">
        <span className="block text-[13px] leading-4 font-medium text-white">{label}</span>
        <span className="mt-0.5 block text-[12px] leading-4" style={{ color: FG_TERTIARY }}>
          {hint}
        </span>
      </span>
    </label>
  );
}

/**
 * The other direction, which is easy to miss from in here.
 *
 * Everything above connects an outside server *to* Mythex. Mythex also serves
 * an MCP endpoint of its own, so Claude, Cursor or Codex can drive a sandbox —
 * and the place someone thinks about MCP is this panel, not the docs. The URL
 * comes from the server rather than a constant, so a self-hosted deployment
 * shows its own.
 */
function MythexMcpCard({ url }: { url: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard refused (insecure origin, or permission): the URL is on
      // screen and selectable, which is the fallback.
    }
  };

  return (
    <div
      className="mt-6 rounded-[12px] p-3"
      style={{ background: CARD_BG, boxShadow: surfaceRing(CARD_BG, 0.4) }}
      data-testid="mythex-mcp-card"
    >
      <p className="text-[13px] leading-4 font-medium text-white">
        {t.settings.mcp.mythexTitle}
      </p>
      <p className="mt-1 text-[12px] leading-snug" style={{ color: FG_TERTIARY }}>
        {t.settings.mcp.mythexText}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <code
          dir="ltr"
          className="min-w-0 flex-1 truncate rounded-[8px] px-2.5 py-1.5 font-mono text-[12px] text-white"
          style={{ background: "oklch(0.5674 0.009 106.68 / 0.16)" }}
        >
          {url}
        </code>
        <button type="button" onClick={() => void copy()} className={btnClass("lg", "ghost")}>
          {copied ? t.common.copied : t.common.copy}
        </button>
        <a
          href="https://docs.mythex.ai/features/mcp"
          target="_blank"
          rel="noopener noreferrer"
          className={btnClass("lg", "ghost")}
        >
          {t.settings.mcp.docs}
          <ArrowUpRight className="size-3.5 opacity-80" />
        </a>
      </div>
    </div>
  );
}

/** Will saving this send them back through someone else's consent screen? */
function needsReauth(
  server: McpServer,
  form: { url: string; auth: "oauth" | "bearer" | "none" },
): boolean {
  if (form.auth !== "oauth") return false;
  return form.url.trim() !== server.url || server.auth !== "oauth";
}

/** One dot vocabulary: amber is waiting on you, red is broken. */
const DOT_PENDING = "oklch(0.82 0.13 85)";
const DOT_ERROR = "oklch(0.63 0.19 25)";

/**
 * Point the tab we opened at the authorization server.
 *
 * If the browser refused the popup, navigating this window is better than
 * dropping the sign-in on the floor — the callback brings them back anyway.
 */
function sendToSignIn(tab: Window | null, authorizeUrl: string): void {
  if (tab && !tab.closed) tab.location.href = authorizeUrl;
  else window.location.href = authorizeUrl;
}

/**
 * A server's own mark, when it has one.
 *
 * `icons` is optional in the handshake and most servers skip it, so the glyph
 * is the normal case rather than the error case. The fallback is also the
 * error path: a `src` that 404s or is refused swaps back to the glyph rather
 * than leaving a broken image in the row.
 */
function McpIcon({ icon }: { icon: string | null }) {
  const [broken, setBroken] = useState(false);
  if (icon && !broken) {
    return (
      <img
        src={icon}
        alt=""
        width={28}
        height={28}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        data-testid="mcp-server-icon"
        className="mt-0.5 size-7 shrink-0 rounded-[8px] object-contain"
        style={{ background: "oklch(0.5674 0.009 106.68 / 0.16)", padding: 3 }}
      />
    );
  }
  return (
    <span
      className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-[8px]"
      style={{ background: "oklch(0.5674 0.009 106.68 / 0.16)" }}
    >
      <Server className="size-3.5" style={{ color: FG_SECONDARY }} />
    </span>
  );
}

export function McpServersPanel({
  adding,
  editingId,
  onAddingChange,
  onEditingChange,
  onCountChange,
}: {
  /** Held by the dialog so it can live in the URL and survive a sign-in. */
  adding: boolean;
  editingId: string | null;
  onAddingChange: (next: boolean) => void;
  onEditingChange: (id: string | null) => void;
  /** The rail carries the count, and only this panel knows when it moves. */
  onCountChange?: (count: number) => void;
}) {
  const toast = useToast();
  const t = useT();
  const tm = t.settings.mcp;
  const [servers, setServers] = useState<McpServer[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<{
    url: string;
    name: string;
    token: string;
    auth: "oauth" | "bearer" | "none";
  }>({ url: "", name: "", token: "", auth: "oauth" });
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<McpServer | null>(null);
  const [mythexMcpUrl, setMythexMcpUrl] = useState<string | null>(null);

  const editing = servers?.find((s) => s.id === editingId) ?? null;

  // Opening the editor loads the row into the same form the add panel uses.
  // The token is never sent to the browser, so the field starts blank and
  // blank means "leave the stored one alone".
  //
  // Keyed on the id: the list reloads on every window focus, which made
  // `editing` a new object and wiped whatever had been typed into the form.
  const editingKey = editing?.id ?? null;
  useEffect(() => {
    if (!editing) return;
    setForm({ url: editing.url, name: editing.name, token: "", auth: editing.auth });
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingKey]);

  const save = async () => {
    if (!editing) return;
    setBusy("add");
    setError(null);
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const { server, authorizeUrl } = await updateMcpServer(editing.id, {
        name: form.name.trim() || undefined,
        url: form.url.trim(),
        auth: form.auth,
        token: form.auth === "bearer" ? form.token.trim() || undefined : undefined,
        returnTo: mcpReturnTo(),
      });
      setServers((prev) => prev?.map((s) => (s.id === server.id ? server : s)) ?? null);
      onEditingChange(null);
      if (authorizeUrl) {
        sendToSignIn(tab, authorizeUrl);
        toast("info", fill(tm.approveOn, { name: server.name }));
      } else {
        tab?.close();
        toast("success", fill(tm.serverSaved, { name: server.name }));
      }
    } catch (err) {
      tab?.close();
      setError(message(err, tm.saveFailed));
    } finally {
      setBusy(null);
    }
  };

  const load = useCallback(async () => {
    try {
      const data = await fetchMcpServers();
      setServers(data.servers);
      setMythexMcpUrl(data.mythexMcpUrl ?? null);
      onCountChange?.(data.servers.length);
    } catch {
      setServers([]);
    }
  }, [onCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  // The sign-in redirect says how it went, and the message belongs here rather
  // than in a toast that fires before the modal has finished opening.
  useEffect(() => {
    const url = new URL(window.location.href);
    const outcome = url.searchParams.get("mcp");
    if (!outcome) return;
    const detail = url.searchParams.get("mcp_error");
    url.searchParams.delete("mcp");
    url.searchParams.delete("mcp_error");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    const tm = appT().settings.mcp;
    if (outcome === "connected") toast("success", tm.serverConnected);
    else toast("error", detail || tm.signInFailed);
  }, [toast]);

  // A sign-in finishes in another tab and the API writes the row there, so
  // this list only learns about it when the user comes back to this window.
  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const message = (err: unknown, fallback: string) =>
    (err instanceof ApiError && (err.body as { message?: string })?.message) || fallback;

  const submit = async () => {
    const url = form.url.trim();
    if (!url) return;
    setBusy("add");
    setError(null);
    // Opened before the round trip, while the click still counts as a user
    // gesture: most remote servers answer with a sign-in, and a popup opened
    // after an await is a popup the browser blocks. Closed again if it turns
    // out there is nowhere to send them.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const { server, authorizeUrl } = await addMcpServer({
        url,
        name: form.name.trim() || undefined,
        token: form.auth === "bearer" ? form.token.trim() || undefined : undefined,
        auth: form.auth,
        returnTo: mcpReturnTo(),
      });
      setServers((prev) => {
        const next = [...(prev ?? []), server];
        onCountChange?.(next.length);
        return next;
      });
      setForm({ url: "", name: "", token: "", auth: "oauth" });
      onAddingChange(false);
      if (authorizeUrl) {
        sendToSignIn(tab, authorizeUrl);
        toast("info", fill(tm.approveOn, { name: server.name }));
      } else {
        tab?.close();
        toast(
          "success",
          server.toolCount
            ? pl(tm.connectedWithTools, server.toolCount, { name: server.name })
            : fill(tm.connectedNoTools, { name: server.name }),
        );
      }
    } catch (err) {
      tab?.close();
      // The server's own complaint, in the form, next to the field that caused
      // it — a toast would be gone before they read the URL back.
      setError(message(err, tm.unreachable));
    } finally {
      setBusy(null);
    }
  };

  const reauth = async (server: McpServer) => {
    setBusy(`reauth:${server.id}`);
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const { server: next, authorizeUrl } = await reauthMcpServer(server.id, mcpReturnTo());
      setServers((prev) => prev?.map((s) => (s.id === server.id ? next : s)) ?? null);
      if (authorizeUrl) sendToSignIn(tab, authorizeUrl);
      else tab?.close();
    } catch (err) {
      // Nothing opened, so say why on the row itself. Sending someone through
      // a consent screen and failing on the way back wastes the trip; failing
      // here, in place, at least leaves the reason on screen.
      tab?.close();
      const detail = message(err, tm.connectFailed);
      setServers(
        (prev) => prev?.map((s) => (s.id === server.id ? { ...s, lastError: detail } : s)) ?? null,
      );
      toast("error", detail);
    } finally {
      setBusy(null);
    }
  };

  const refresh = async (id: string) => {
    setBusy(`refresh:${id}`);
    try {
      const { server } = await refreshMcpServer(id);
      setServers((prev) => prev?.map((s) => (s.id === id ? server : s)) ?? null);
      toast("success", pl(tm.refreshed, server.toolCount, { name: server.name }));
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { server?: McpServer }) : null;
      const detail = message(err, tm.unreachable);
      setServers(
        (prev) =>
          prev?.map((s) =>
            s.id === id ? (body?.server ?? { ...s, lastError: detail }) : s,
          ) ?? null,
      );
      toast("error", detail);
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (server: McpServer) => {
    setBusy(`toggle:${server.id}`);
    try {
      const { server: next } = await updateMcpServer(server.id, { enabled: !server.enabled });
      setServers((prev) => prev?.map((s) => (s.id === server.id ? next : s)) ?? null);
    } catch (err) {
      toast("error", message(err, tm.changeFailed));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (server: McpServer) => {
    setBusy(`remove:${server.id}`);
    try {
      await removeMcpServer(server.id);
      setServers((prev) => {
        const next = prev?.filter((s) => s.id !== server.id) ?? null;
        onCountChange?.(next?.length ?? 0);
        return next;
      });
      setConfirmDelete(null);
      toast("success", fill(tm.removed, { name: server.name }));
    } catch (err) {
      toast("error", message(err, tm.removeFailed));
    } finally {
      setBusy(null);
    }
  };

  if (adding || editing) {
    const oauth = form.auth === "oauth";
    const isEdit = Boolean(editing);
    const close = () => {
      if (isEdit) onEditingChange(null);
      else onAddingChange(false);
      setError(null);
    };
    const submitForm = () => void (isEdit ? save() : submit());
    return (
      <div className="w-full px-5 py-5" data-testid={isEdit ? "mcp-edit-form" : "mcp-add-form"}>
        <label className="block text-[13px] font-medium text-white">{tm.serverName}</label>
        <input
          className={`${FIELD_CLASS} mt-1.5`}
          placeholder={tm.namePlaceholder}
          value={form.name}
          autoFocus
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          onKeyDown={(e) => e.key === "Enter" && submitForm()}
        />

        <label className="mt-4 block text-[13px] font-medium text-white">{tm.serverUrl}</label>
        <input
          className={`${FIELD_CLASS} mt-1.5`}
          type="url"
          placeholder="https://mcp.example.com"
          value={form.url}
          onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
          onKeyDown={(e) => e.key === "Enter" && submitForm()}
        />

        <p className="mt-5 text-[13px] font-medium text-white">{tm.authentication}</p>
        <div className="mt-2 grid gap-2.5">
          <AuthChoice
            value="oauth"
            current={form.auth}
            onPick={(auth) => setForm((f) => ({ ...f, auth }))}
            label={tm.oauthLabel}
            hint={tm.oauthHint}
          />
          <AuthChoice
            value="bearer"
            current={form.auth}
            onPick={(auth) => setForm((f) => ({ ...f, auth }))}
            label={tm.bearerLabel}
            hint={tm.bearerHint}
          />
          {form.auth === "bearer" && (
            <input
              className={`${FIELD_CLASS} ms-6 w-[calc(100%-1.5rem)]`}
              type="password"
              autoComplete="off"
              placeholder={
                isEdit && editing?.hasToken ? tm.tokenStored : tm.tokenPlaceholder
              }
              value={form.token}
              onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && submitForm()}
            />
          )}
          <AuthChoice
            value="none"
            current={form.auth}
            onPick={(auth) => setForm((f) => ({ ...f, auth }))}
            label={tm.noneLabel}
            hint={tm.noneHint}
          />
        </div>

        <p className="mt-3 text-[12px]" style={{ color: FG_TERTIARY }}>
          {tm.credentialsNote}
        </p>

        {error && (
          <p
            className="mt-4 flex items-start gap-2 rounded-[8px] p-2.5 text-[12px] leading-snug"
            style={{ background: "oklch(0.55 0.16 25 / 0.14)", color: "oklch(0.82 0.12 25)" }}
          >
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            className={btnClass("lg", "ghost")}
            onClick={close}
          >
            {t.common.cancel}
          </button>
          <WhiteButton
            disabled={!form.url.trim() || busy === "add"}
            onClick={submitForm}
            testId="mcp-add-submit"
          >
            {busy === "add" ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3.5 animate-spin" />
                {isEdit ? t.common.saving : tm.connecting}
              </span>
            ) : isEdit ? (
              // Changing the URL or moving to OAuth costs a new grant, so the
              // button says what it is about to do rather than a flat "Save".
              needsReauth(editing!, form) ? tm.saveAuthorize : t.common.save
            ) : oauth ? (
              tm.addAuthorize
            ) : (
              t.common.add
            )}
          </WhiteButton>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 py-4" data-testid="mcp-panel">
      {/* Side by side the button squeezes the paragraph into a six-line
          column on a phone, so below `sm` it stacks and the text gets the
          width. */}
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-white">{tm.title}</h3>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: FG_TERTIARY }}>
            {tm.description}
          </p>
        </div>
        <WhiteButton onClick={() => onAddingChange(true)} testId="mcp-add-open">
          <span className="inline-flex items-center gap-1.5">
            <Plus className="size-3.5" />
            {tm.addServer}
          </span>
        </WhiteButton>
      </div>

      {servers === null ? (
        <div className="mt-5 space-y-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-[68px] animate-pulse rounded-[12px]"
              style={{ background: CARD_BG }}
            />
          ))}
        </div>
      ) : servers.length === 0 ? (
        <div
          className="mt-5 rounded-[12px] px-4 py-8 text-center"
          style={{ background: CARD_BG, boxShadow: surfaceRing(CARD_BG, 0.4) }}
        >
          <Server className="mx-auto size-5" style={{ color: FG_TERTIARY }} />
          <p className="mt-2.5 text-[13px] font-medium text-white">{tm.emptyTitle}</p>
          <p className="mx-auto mt-1 max-w-[26rem] text-[12px]" style={{ color: FG_TERTIARY }}>
            {tm.emptyText}
          </p>
        </div>
      ) : (
        <ul className="mt-5 space-y-2">
          {servers.map((s) => (
            <li
              key={s.id}
              data-testid="mcp-server-row"
              data-name={s.name}
              className="rounded-[12px] p-3"
              style={{ background: CARD_BG, boxShadow: surfaceRing(CARD_BG, 0.4) }}
            >
              {/* The row opens the editor; the controls on the right stop the
                  click so they still do their own jobs. */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => onEditingChange(s.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onEditingChange(s.id);
                  }
                }}
                className="flex cursor-pointer flex-col gap-2.5 outline-none sm:flex-row sm:items-start sm:gap-3"
                aria-label={fill(tm.editAria, { name: s.name })}
              >
                <span className="relative flex min-w-0 flex-1 items-start gap-3 sm:contents">
                <span className="relative shrink-0">
                  <McpIcon icon={s.icon} />
                  {(s.lastError || s.status === "pending_auth") && (
                    <span
                      aria-hidden
                      className="absolute top-0 end-0 size-2.5 translate-x-1/4 translate-y-1/4 rounded-full rtl:-translate-x-1/4"
                      style={{
                        background: s.lastError ? DOT_ERROR : DOT_PENDING,
                        boxShadow: `0 0 0 2px ${CARD_BG}`,
                      }}
                    />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p dir="auto" className="truncate text-[13px] font-medium text-white rtl:text-right">{s.name}</p>
                  <p className="truncate text-[12px]" style={{ color: FG_TERTIARY }}>
                    {s.url}
                  </p>
                  {s.status === "pending_auth" ? (
                    <p className="mt-1 text-[12px]" style={{ color: "oklch(0.82 0.11 85)" }}>
                      {s.lastError || tm.waitingApproval}
                    </p>
                  ) : s.lastError ? (
                    <p className="mt-1 text-[12px]" style={{ color: "oklch(0.78 0.12 25)" }}>
                      {s.lastError}
                    </p>
                  ) : (
                    <button
                      type="button"
                      className="mt-1 text-[12px] underline-offset-2 hover:underline"
                      style={{ color: FG_TERTIARY }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpanded((id) => (id === s.id ? null : s.id));
                      }}
                    >
                      {pl(tm.tools, s.toolCount)}
                      {s.auth === "oauth"
                        ? tm.signedInSuffix
                        : s.auth === "bearer"
                          ? tm.tokenSuffix
                          : ""}
                      {!s.enabled ? tm.offSuffix : ""}
                    </button>
                  )}
                </div>
                </span>
                <div
                  className="flex shrink-0 items-center gap-1.5 self-end sm:self-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  {s.status === "pending_auth" ? (
                    // "Connect", not "Sign in": what is missing is this
                    // server's connection, and the account being signed in to
                    // is theirs, not Mythex's.
                    <button
                      type="button"
                      className={whiteBtnClass("sm")}
                      onClick={() => void reauth(s)}
                      disabled={busy === `reauth:${s.id}`}
                      data-testid="mcp-sign-in"
                    >
                      {busy === `reauth:${s.id}` ? tm.opening : t.common.connect}
                    </button>
                  ) : s.lastError ? (
                    // Connected but not working. Offering "Disable" here read
                    // as though everything were fine and this were merely a
                    // switch; the thing to do with a broken server is try it
                    // again.
                    <button
                      type="button"
                      className={whiteBtnClass("sm")}
                      onClick={() => void refresh(s.id)}
                      disabled={busy === `refresh:${s.id}`}
                      data-testid="mcp-retry"
                    >
                      {busy === `refresh:${s.id}` ? tm.trying : t.common.retry}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={btnClass("sm", "ghost")}
                      onClick={() => void toggle(s)}
                      disabled={busy === `toggle:${s.id}`}
                    >
                      {s.enabled ? t.common.disable : t.common.enable}
                    </button>
                  )}
                  <button
                    type="button"
                    className={btnClass("sm", "ghost")}
                    onClick={() => void refresh(s.id)}
                    disabled={busy === `refresh:${s.id}`}
                    aria-label={fill(tm.refreshAria, { name: s.name })}
                    title={tm.refreshTitle}
                  >
                    <RefreshCw
                      className={`size-3 ${busy === `refresh:${s.id}` ? "animate-spin" : ""}`}
                    />
                  </button>
                  <button
                    type="button"
                    className={btnClass("sm", "ghost")}
                    onClick={() => setConfirmDelete(s)}
                    aria-label={fill(tm.removeAria, { name: s.name })}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>

              {expanded === s.id && s.tools.length > 0 && (
                <ul className="mt-2.5 grid gap-1 border-t border-line pt-2.5">
                  {s.tools.map((tool) => (
                    <li key={tool.name} className="text-[12px] leading-snug">
                      <span className="font-mono" style={{ color: FG_SECONDARY }}>
                        {tool.name}
                      </span>
                      {tool.description && (
                        <span dir="auto" style={{ color: FG_TERTIARY }}> — {tool.description.slice(0, 120)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {mythexMcpUrl && <MythexMcpCard url={mythexMcpUrl} />}

      {confirmDelete && (
        <ConfirmRemove
          server={confirmDelete}
          busy={busy === `remove:${confirmDelete.id}`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void remove(confirmDelete)}
        />
      )}
    </div>
  );
}

/**
 * Removing a server is not undoable and takes the sign-in with it.
 *
 * The trash icon sits next to Refresh in a tight row, so a slip is easy and
 * the cost is going through the whole authorization again.
 */
function ConfirmRemove({
  server,
  busy,
  onCancel,
  onConfirm,
}: {
  server: McpServer;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  const tm = t.settings.mcp;
  return (
    <ModalSurface
      onClose={onCancel}
      label={fill(tm.removeAria, { name: server.name })}
      dismissible={!busy}
      zIndex={60}
      testId="mcp-remove-confirm"
      className="max-w-[24rem] rounded-[12px] p-4"
      style={{ background: CARD_BG, boxShadow: surfaceRing(CARD_BG, 0.45) }}
    >
      <p className="text-[14px] font-medium text-white">{fill(tm.removeTitle, { name: server.name })}</p>
      <p className="mt-1.5 text-[12px] leading-snug" style={{ color: FG_TERTIARY }}>
        {server.auth === "oauth" ? tm.removeOauthText : tm.removeOtherText}
      </p>
      <div className="mt-4 flex items-center justify-end gap-2">
        <ConfirmRemoveCancel />
        {/* Destructive and irreversible, so it looks it — a muted button
            wearing rose text reads as just another option in the row. */}
        <button
          type="button"
          className="btn-danger !h-8 !px-2.5 text-[14px] !font-normal"
          onClick={onConfirm}
          disabled={busy}
          data-testid="mcp-remove-confirm-yes"
        >
          {busy ? tm.removing : t.common.remove}
        </button>
      </div>
    </ModalSurface>
  );
}

/** Cancel through the surface, so the confirm animates out. */
function ConfirmRemoveCancel() {
  const close = useSurfaceClose();
  const t = useT();
  return (
    <button type="button" className={btnClass("lg", "ghost")} onClick={close}>
      {t.common.cancel}
    </button>
  );
}
