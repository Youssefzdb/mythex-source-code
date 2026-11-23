import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Server, Waypoints } from "lucide-react";
import { ApiError } from "../lib/api";
import {
  btnClass,
  whiteBtnClass,
  CARD_BG,
  CONTROL_BG,
  FG,
  FG_SECONDARY,
  FG_TERTIARY,
  floatingRing,
  PANEL_BG,
  SHELL_BG,
  surfaceRing,
} from "../lib/surfaces";
import { useToast } from "./ui";
import { SearchField } from "./ui/SearchField";
import { SlidingPillSwitch } from "./PricingPlans";
import { ModalSurface, SurfaceCloseButton, SurfaceScroll, useIsPhone } from "./ui/Sheet";
import {
  connectStartedInChat,
  consumeConnectReturn,
  disconnectApp,
  fetchCatalog,
  fetchMcpServers,
  fetchIntegrations,
  onConnectorsOpen,
  openConnectors,
  startConnect,
  type CategoryCount,
  type IntegrationConnection,
  type ToolkitCatalogItem,
} from "../lib/connectors";
import { McpServersPanel } from "./McpServersPanel";
import { appT, fill, useAppLocale, useT, type AppMessages } from "../i18n/app";
import type { LocaleCode } from "../i18n/locales";

/**
 * A connector's one-line summary. The provider writes descriptions in English
 * only, so another language gets our own line ("Connect Gmail.") rather than an
 * English sentence in the middle of the page; the English stays in the tooltip.
 */
function summaryFor(app: ToolkitCatalogItem, t: AppMessages, locale: LocaleCode): string {
  if (locale === "en" && app.description) return app.description;
  return fill(t.publish.connectors.connectApp, { name: app.name });
}

/** A rail category's name in the current language; the API's English for any id we don't know. */
function categoryName(t: AppMessages, id: string, fallback: string): string {
  return (t.publish.connectors.categoryNames as Record<string, string>)[id] ?? fallback;
}

/**
 * Connectors — one modal, opened from the left sidebar, over whatever the
 * person was doing.
 *
 * It is deliberately not a settings page. Linking an app is something you do
 * in the middle of building, because the chat just asked for a spreadsheet you
 * have not connected yet, and walking away to Settings loses the thread.
 */

/** Connected, and half-connected. */
const DOT_GREEN = "oklch(0.5442 0.1689 138.23)";

/**
 * The highlight over the drifting wall: an ellipse in the middle, narrowed
 * again by a vertical falloff so the top and bottom rows stay quiet.
 */
const CENTRE_MASK = [
  "radial-gradient(50% 60% at 50% 50%, #000 0%, #000 20%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0.15) 65%, rgba(0,0,0,0) 80%)",
  "linear-gradient(rgba(0,0,0,0.3) 0%, #000 15%, #000 40%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0) 100%)",
].join(", ");

const CARD_RING = surfaceRing(CARD_BG);
const CARD_RING_HOVER = surfaceRing(CARD_BG, 0.75);
const HERO_DISMISSED = "mythex_connectors_hero";
/**
 * Connected means connected. Nothing else is a state worth showing.
 *
 * Composio writes a row the moment we hand out a redirect URL, and it stays in
 * INITIATED or INITIALIZING until the user approves — forever, if they never
 * do. The card used to read that as "Finish connecting", which is a guess the
 * server cannot make: it has no way to tell someone who is still on the
 * provider's page from someone who closed it an hour ago. Pressing Connect
 * mints a fresh link and sweeps the old rows either way, so "Connect" is both
 * simpler and never wrong.
 */
const ACTIVE = "ACTIVE";

type Tab =
  | { kind: "all" }
  | { kind: "connected" }
  | { kind: "mcp" }
  | { kind: "category"; id: string; label: string };

/**
 * The modal's place, kept in the address bar.
 *
 * Not for deep links so much as for coming back: an MCP sign-in leaves the app
 * entirely and returns through the API, and without this the user lands on a
 * closed modal having lost the panel, the tab and the form they were in.
 */
function tabFromUrl(): Tab {
  if (typeof window === "undefined") return { kind: "all" };
  const key = new URL(window.location.href).searchParams.get("tab");
  if (key === "connected") return { kind: "connected" };
  if (key === "mcp") return { kind: "mcp" };
  if (key?.startsWith("category:")) {
    const id = key.slice("category:".length);
    return { kind: "category", id, label: id };
  }
  return { kind: "all" };
}

function subtabFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URL(window.location.href).searchParams.get("subtab");
}

function paramFromUrl(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URL(window.location.href).searchParams.get(name);
}

/** Rewrite the address without a navigation — the modal is not a route. */
function syncUrl(tab: Tab, addingMcp: boolean, editingMcp: string | null): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("connectors", "1");
  if (tab.kind === "all") url.searchParams.delete("tab");
  else url.searchParams.set("tab", tabKey(tab));
  if (addingMcp) {
    url.searchParams.set("subtab", "add-mcp-server");
    url.searchParams.delete("server");
  } else if (editingMcp) {
    url.searchParams.set("subtab", "edit-mcp-server");
    url.searchParams.set("server", editingMcp);
  } else {
    url.searchParams.delete("subtab");
    url.searchParams.delete("server");
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

/** Strip the modal's own params when it closes, leaving the page's alone. */
function clearUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const key of ["connectors", "tab", "subtab", "server", "mcp", "mcp_error"]) {
    url.searchParams.delete(key);
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function tabKey(tab: Tab): string {
  return tab.kind === "category" ? `category:${tab.id}` : tab.kind;
}

/** Provider logo, falling back to a lettered tile when the image 404s. */
function AppLogo({ slug, logo, name }: { slug: string; logo?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [slug, logo]);
  // Every logo gets a light plate.
  //
  // These are bare brand marks, not app icons: GitHub's is #24292F, Gist ships
  // a black PNG, and on a dark card they simply vanish. Working out which ones
  // need help is not something the asset can be asked — reading the SVG gets
  // it wrong both ways, and a PNG cannot be read at all — so the plate is
  // unconditional, which is also what makes every row line up.
  return (
    <span
      className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-[6px] bg-white"
    >
      {failed || !logo ? (
        <span className="text-sm font-semibold text-[#141413]">{name.slice(0, 1).toUpperCase()}</span>
      ) : (
        <img
          src={logo}
          alt=""
          width={40}
          height={40}
          className="size-10 object-contain p-1"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

/* ── The hero ────────────────────────────────────────────────────────────── */

type Chip = { slug: string; name: string; logo: string };

function HeroChip({ chip }: { chip: Chip }) {
  return (
    <span
      className="flex shrink-0 items-center gap-1.5 rounded-full py-[5px] pe-3 ps-[5px]"
      style={{ background: PANEL_BG }}
    >
      <img
        src={chip.logo}
        alt=""
        className="size-[22px] shrink-0 rounded-full bg-white object-contain"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      <span className="shrink-0 text-[13px] leading-4 font-medium text-white">{chip.name}</span>
    </span>
  );
}

/**
 * One drifting row.
 *
 * The three copies live inside a single animated element, and the keyframe
 * travels a third of it — which is exactly one copy, so copy two lands where
 * copy one began and the loop has no seam. Animating each copy separately
 * looks the same standing still and is wrong twice over: it moves a third of
 * one copy instead of a whole one, so it runs at a third of the speed and
 * jumps every time it wraps.
 */
function MarqueeRow({ chips, reverse }: { chips: Chip[]; reverse: boolean }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex overflow-hidden">
      <div
        className={`flex shrink-0 gap-1.5 pr-1.5 ${
          reverse ? "connectors-marquee-left" : "connectors-marquee-right"
        }`}
      >
        {[0, 1, 2].map((copy) =>
          chips.map((c) => <HeroChip key={`${copy}-${c.slug}`} chip={c} />),
        )}
      </div>
    </div>
  );
}

/** Reading speed while the pointer is over the wall, as a share of full pace. */
const HOVER_PLAYBACK_RATE = 0.15;

function Hero({ chips, onDismiss }: { chips: Chip[]; onDismiss: () => void }) {
  const t = useT();
  const c = t.publish.connectors;
  const bandRef = useRef<HTMLDivElement>(null);

  /**
   * Slow both layers on hover.
   *
   * Done through the animation's `playbackRate` rather than by swapping the
   * CSS duration, because a duration change restarts the timeline and the wall
   * would visibly jump the moment the pointer arrived.
   */
  const setPace = (rate: number) => {
    bandRef.current
      ?.querySelectorAll(".connectors-marquee-right, .connectors-marquee-left")
      .forEach((el) => {
        for (const a of el.getAnimations()) a.playbackRate = rate;
      });
  };

  // Four rows, each a different slice, so no two rows read the same.
  const rows = useMemo(() => {
    if (chips.length < 8) return [];
    const per = Math.floor(chips.length / 4);
    return [0, 1, 2, 3].map((i) => chips.slice(i * per, (i + 1) * per));
  }, [chips]);

  const wall = (
    <div className="-mt-2 flex flex-col items-center gap-1.5">
      {rows.map((row, i) => (
        <MarqueeRow key={i} chips={row} reverse={i % 2 === 1} />
      ))}
    </div>
  );

  return (
    // Drawn above the list (z-[1]): iOS gives everything painted after a
    // running animation in the same scroller a layer of its own, and the wall
    // turned every connector row and icon into one — 133 layers instead of
    // 48, each repainted on every frame the sheet moved with the keyboard
    // (45–80ms frames; measured on an iPhone with the Web Inspector).
    <div className="relative z-[1]">
      {/* Two copies of the same wall, one behind the other: a barely-there one
          at three percent everywhere, and a full-brightness one masked to an
          ellipse in the middle. That is what makes the names surface as they
          drift through the centre and sink again at the edges — a single
          layer, however it is faded, only ever looks evenly dim. */}
      <div
        ref={bandRef}
        className="relative h-[138px] overflow-hidden"
        aria-hidden
        dir="ltr"
        onMouseEnter={() => setPace(HOVER_PLAYBACK_RATE)}
        onMouseLeave={() => setPace(1)}
      >
        <div className="opacity-[0.03]">{wall}</div>
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            maskImage: CENTRE_MASK,
            WebkitMaskImage: CENTRE_MASK,
            maskComposite: "intersect",
            WebkitMaskComposite: "source-in",
          }}
        >
          {wall}
        </div>
      </div>

      <div className="relative -mt-3 px-6 pb-5 text-center">
        <h3 className="text-[22px] font-semibold tracking-tight text-white">
          {c.heroTitle}
        </h3>
        <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed" style={{ color: FG_TERTIARY }}>
          {c.heroBody}
        </p>
        <div className="mt-3.5 flex items-center justify-center gap-2">
          <a
            href="https://docs.mythex.ai/features/connectors"
            target="_blank"
            rel="noreferrer"
            className={btnClass("md", "ghost")}
          >
            {c.viewDocs}
          </a>
          <button
            type="button"
            onClick={onDismiss}
            className={btnClass("md")}
            data-testid="connector-hero-dismiss"
          >
            {c.gotIt}
          </button>
        </div>
      </div>
    </div>
  );
}

function RailButton({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-start text-[14px] leading-[21px] transition-colors ${
        active ? "bg-white/[0.04] font-medium" : "hover:bg-white/[0.03]"
      }`}
      style={{ color: active ? FG : FG_SECONDARY }}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count != null && (
        <span className="shrink-0 text-[12px] font-medium tabular-nums" style={{ color: FG_TERTIARY }}>
          {count}
        </span>
      )}
    </button>
  );
}

/* ── A card ──────────────────────────────────────────────────────────────── */

function CardSkeleton() {
  return (
    <div className="flex h-14 items-center gap-3 rounded-[12px] p-2" style={{ background: CARD_BG }}>
      <span className="size-10 shrink-0 animate-pulse rounded-[6px] bg-white/[0.05]" />
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="block h-3 w-24 animate-pulse rounded bg-white/[0.06]" />
        <span className="block h-2.5 w-40 animate-pulse rounded bg-white/[0.035]" />
      </span>
    </div>
  );
}

function AppCard({
  app,
  connection,
  busy,
  onConnect,
  onDisconnect,
}: {
  app: ToolkitCatalogItem;
  connection?: IntegrationConnection;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: (id: string) => void;
}) {
  const t = useT();
  const locale = useAppLocale();
  const connected = connection?.status === ACTIVE;
  /**
   * One line, until you ask for the rest.
   *
   * A phone has no hover and no title tooltip, so a clipped description is
   * unreadable — but letting every one of them run to four lines turned a
   * catalogue into a wall of prose you have to scroll past. So the card keeps
   * its one line and the text block is a button: tap it for the whole thing,
   * tap again to put it back.
   */
  const [expanded, setExpanded] = useState(false);
  // Only on a phone. A pointer gets the whole description from the `title`
  // tooltip without the card changing size, and an expanded card in a
  // two-column grid leaves its neighbour standing in a hole.
  const phone = useIsPhone();

  return (
    <div
      className="group/card relative flex min-w-0 items-center gap-3 rounded-[12px] p-2 transition-shadow duration-200 ease-out"
      style={{ background: CARD_BG, boxShadow: CARD_RING }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = CARD_RING_HOVER)}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = CARD_RING)}
      data-testid="connector-card"
      data-slug={app.slug}
      data-state={connected ? "connected" : "available"}
    >
      <span className="relative shrink-0">
        <AppLogo slug={app.slug} logo={app.logo} name={app.name} />
        {connected && (
          <span
            aria-hidden
            className="absolute top-0 end-0 size-2.5 translate-x-1/4 -translate-y-1/4 rounded-full rtl:-translate-x-1/4"
            style={{ background: DOT_GREEN, boxShadow: `0 0 0 2px ${CARD_BG}` }}
          />
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className="truncate text-[13px] leading-4 font-medium text-white"
          data-testid="connector-name"
        >
          {app.name}
        </span>
        {/* On a phone the description is the toggle: a button rather than the
            whole card, so it cannot be confused with Connect sitting beside
            it, and a block child of this column so `truncate` still has a
            width to work against — as a flex item it stretched past the
            button and ran off the card. */}
        {phone ? (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            data-testid="connector-summary"
            className={`w-full cursor-pointer text-start text-[12px] leading-4 ${
              expanded ? "" : "truncate"
            }`}
            style={{ color: FG_TERTIARY }}
          >
            {connected ? t.common.connected : summaryFor(app, t, locale)}
          </button>
        ) : (
          <span
            className="truncate text-[12px] leading-4"
            style={{ color: FG_TERTIARY }}
            title={connected ? undefined : (app.description ?? undefined)}
          >
            {connected ? t.common.connected : summaryFor(app, t, locale)}
          </span>
        )}
      </div>

      {/* The card stays clean until you reach for it — the action appears on
          hover, and stays put on touch, where there is no hover to reach. */}
      {connected && connection ? (
        <button
          type="button"
          onClick={() => onDisconnect(connection.id)}
          disabled={busy}
          className={`me-1 ${btnClass("sm", "ghost")} hover:!text-rose-200 focus:opacity-100 md:opacity-0 md:group-hover/card:opacity-100`}
        >
          {busy ? "…" : t.common.disconnect}
        </button>
      ) : (
        <button
          type="button"
          onClick={onConnect}
          disabled={busy}
          className={`me-1 ${whiteBtnClass("sm")} focus:opacity-100 md:opacity-0 md:group-hover/card:opacity-100`}
          data-testid="connector-connect"
        >
          {busy ? t.publish.connectors.opening : t.common.connect}
        </button>
      )}
    </div>
  );
}

/* ── The modal ───────────────────────────────────────────────────────────── */

function ConnectorsModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const c = t.publish.connectors;
  const toast = useToast();

  const [configured, setConfigured] = useState(true);
  const [setupHint, setSetupHint] = useState<string | undefined>();
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [featured, setFeatured] = useState<ToolkitCatalogItem[]>([]);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [totalApps, setTotalApps] = useState(0);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewFailed, setOverviewFailed] = useState(false);

  const [tab, setTab] = useState<Tab>(() => tabFromUrl());
  /** Servers added, for the rail. Fetched here so the row can carry a count
   *  before anyone has opened the panel; the panel reports its own changes. */
  const [mcpCount, setMcpCount] = useState<number | null>(null);
  /** The add-server panel, in the URL so a sign-in comes back to it. */
  const [addingMcp, setAddingMcp] = useState(() => subtabFromUrl() === "add-mcp-server");
  const [editingMcp, setEditingMcp] = useState<string | null>(() =>
    subtabFromUrl() === "edit-mcp-server" ? paramFromUrl("server") : null,
  );
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [catalog, setCatalog] = useState<ToolkitCatalogItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [heroOpen, setHeroOpen] = useState(() => {
    try {
      return localStorage.getItem(HERO_DISMISSED) !== "1";
    } catch {
      return true;
    }
  });

  const searchRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const loadOverview = useCallback(async () => {
    setOverviewFailed(false);
    try {
      const data = await fetchIntegrations();
      setConfigured(Boolean(data.configured));
      setConnections(data.connections ?? []);
      setFeatured(data.featured ?? []);
      setCategories(data.categories ?? []);
      setTotalApps(data.totalApps ?? 0);
      setSetupHint(data.setupHint);
    } catch {
      setOverviewFailed(true);
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void fetchMcpServers()
      .then((data) => alive && setMcpCount(data.servers.length))
      .catch(() => alive && setMcpCount(0));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    syncUrl(tab, addingMcp, editingMcp);
  }, [tab, addingMcp, editingMcp]);

  // The panel belongs to the Custom MCP tab; picking any other tab is a way
  // out of it, and leaving it open would paint a form under the wrong heading.
  useEffect(() => {
    if (tab.kind === "mcp") return;
    if (addingMcp) setAddingMcp(false);
    if (editingMcp) setEditingMcp(null);
  }, [tab, addingMcp, editingMcp]);

  useEffect(() => () => clearUrl(), []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  // Consent now happens in a tab of its own, so this one never reloads and
  // would otherwise still show the app as unconnected. Coming back to this
  // window is the only signal we get that they are done over there.
  useEffect(() => {
    const onFocus = () => void loadOverview();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadOverview]);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(query.trim()), 260);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    // Escape and the backdrop belong to the surface (Base UI) now.
    // A thousand apps is not a list you scroll, so the caret starts here.
    const focus = window.setTimeout(() => searchRef.current?.focus(), 60);
    return () => {
      window.clearTimeout(focus);
    };
  }, [onClose]);

  const category = tab.kind === "category" ? tab.id : undefined;
  const browsing = tab.kind !== "connected";

  useEffect(() => {
    if (!configured || !browsing) return;
    let cancelled = false;
    setCatalogLoading(true);
    setCatalogFailed(false);
    // Drop what is on screen so the wait shows skeletons rather than the
    // previous search's results, which read as "these are your matches".
    setCatalog([]);
    setCursor(null);
    bodyRef.current?.scrollTo({ top: 0 });
    void fetchCatalog({ search, category })
      .then((page) => {
        if (cancelled) return;
        setCatalog(page.items ?? []);
        setCursor(page.nextCursor ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setCatalog([]);
        setCursor(null);
        setCatalogFailed(true);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, browsing, search, category]);

  const loadMore = async () => {
    if (!cursor) return;
    setCatalogLoading(true);
    try {
      const page = await fetchCatalog({ search, category, cursor });
      setCatalog((prev) => [...prev, ...(page.items ?? [])]);
      setCursor(page.nextCursor ?? null);
    } catch {
      setCatalogFailed(true);
    } finally {
      setCatalogLoading(false);
    }
  };

  const bySlug = useMemo(() => {
    const m = new Map<string, IntegrationConnection>();
    for (const c of connections) {
      if (c.status !== ACTIVE) continue;
      m.set(c.toolkit, c);
    }
    return m;
  }, [connections]);

  const activeCount = connections.filter((c) => c.status === ACTIVE).length;

  /** Chips for the hero, from whatever we already have loaded. */
  const heroChips = useMemo<Chip[]>(() => {
    const seen = new Set<string>();
    const out: Chip[] = [];
    for (const app of [...featured, ...catalog]) {
      if (seen.has(app.slug) || !app.logo) continue;
      seen.add(app.slug);
      out.push({ slug: app.slug, name: app.name, logo: app.logo });
      if (out.length >= 44) break;
    }
    return out;
  }, [featured, catalog]);

  /** Pinned apps lead the default view; searching or filtering drops them. */
  const shown = useMemo(() => {
    if (tab.kind === "connected") {
      const needle = search.toLowerCase();
      return connections
        // Connected only. A half-finished attempt is not an account they have.
        .filter((c) => c.status === ACTIVE)
        // The search box is on screen here too, so it has to do something —
        // over a handful of accounts, filtering them locally is the answer.
        .filter((c) => !needle || (c.name || c.toolkit).toLowerCase().includes(needle))
        .map<ToolkitCatalogItem>((c) => ({
          slug: c.toolkit,
          name: c.name || c.toolkit,
          description: c.description || "",
          logo: c.logo || "",
          categories: [],
          authSchemes: [],
          noAuth: false,
        }));
    }
    if (search || tab.kind === "category") return catalog;
    const pinned = new Set(featured.map((f) => f.slug));
    return [...featured, ...catalog.filter((c) => !pinned.has(c.slug))];
  }, [tab, search, catalog, featured, connections]);

  /** Either MCP panel replaces the body, and the chrome reacts the same way. */
  const panelOpen = addingMcp || editingMcp != null;

  const errMsg = (err: unknown, fallback: string) =>
    (err instanceof ApiError && (err.body as { message?: string })?.message) || fallback;

  const connect = async (slug: string) => {
    setBusy(`connect:${slug}`);
    // Opened now, empty, while the click still counts as a user gesture —
    // open it after the round trip and every browser treats it as a popup.
    // Consent happens in the provider's tab so this one keeps the project,
    // the chat, and the half-written message that asked for the connection.
    const tab = window.open("about:blank", "_blank");
    // Third-party page: take away its handle on us before it loads.
    if (tab) tab.opener = null;
    try {
      const { redirectUrl } = await startConnect(
        slug,
        `${window.location.pathname}${window.location.search}`,
      );
      if (!redirectUrl) throw new Error("no_redirect");
      if (tab && !tab.closed) {
        tab.location.href = redirectUrl;
        setBusy(null);
      } else {
        // Popups blocked. Losing the page beats losing the connection.
        window.location.href = redirectUrl;
      }
    } catch (err) {
      tab?.close();
      toast("error", errMsg(err, appT().publish.connectors.couldntStart));
      setBusy(null);
    }
  };

  const disconnect = async (id: string) => {
    setBusy(`disconnect:${id}`);
    try {
      await disconnectApp(id);
      setConnections((prev) => prev.filter((c) => c.id !== id));
      toast("success", appT().publish.connectors.disconnected);
      void loadOverview();
    } catch (err) {
      toast("error", errMsg(err, appT().publish.connectors.couldntDisconnect));
    } finally {
      setBusy(null);
    }
  };

  const dismissHero = () => {
    setHeroOpen(false);
    try {
      localStorage.setItem(HERO_DISMISSED, "1");
    } catch {
      /* a remembered dismissal is a nicety, not a requirement */
    }
  };

  const tabs: Tab[] = [
    { kind: "all" },
    { kind: "connected" },
    { kind: "mcp" },
    ...categories.map((c) => ({ kind: "category" as const, id: c.id, label: categoryName(t, c.id, c.label) })),
  ];

  /**
   * Both layouts are always in the DOM — the rail on desktop, the bar on a
   * phone — so each field gets its own id and only the desktop one takes the
   * autofocus ref. They share `query`, because they are the same filter.
   */
  const searchField = (testId: string, ref?: React.Ref<HTMLInputElement>) => (
    <SearchField
      ref={ref}
      value={query}
      onChange={setQuery}
      data-testid={testId}
      aria-label={c.search}
    />
  );

  const body = () => {
    if (!configured) {
      return (
        <div className="px-1 py-12 text-center">
          <Waypoints className="mx-auto size-7 text-white/25" />
          <p className="mt-3 text-sm text-white/70">{c.notEnabled}</p>
          {setupHint && (
            <p className="mx-auto mt-1.5 max-w-md text-xs" style={{ color: FG_TERTIARY }}>
              {setupHint}
            </p>
          )}
        </div>
      );
    }
    if (overviewFailed && shown.length === 0) {
      return (
        <div className="px-1 py-12 text-center">
          <p className="text-sm text-white/70">{c.loadFailed}</p>
          <button
            type="button"
            onClick={() => void loadOverview()}
            className={`mt-3 ${btnClass("md")}`}
          >
            {t.common.tryAgain}
          </button>
        </div>
      );
    }
    // "Nothing connected" and "nothing matched your search" are different
    // states; only the first one deserves the invitation to go browsing.
    if (tab.kind === "connected" && shown.length === 0 && !search && !overviewLoading) {
      return (
        <div className="px-1 py-12 text-center">
          <Waypoints className="mx-auto size-7 text-white/25" />
          <p className="mt-3 text-sm text-white/70">{c.nothingConnected}</p>
          <button
            type="button"
            onClick={() => setTab({ kind: "all" })}
            className={`mt-3 ${btnClass("md")}`}
          >
            {c.browse}
          </button>
        </div>
      );
    }

    const initialLoading = browsing ? catalogLoading && catalog.length === 0 : overviewLoading;

    return (
      <>
        {/* Columns appear when there is room for a whole card rather than at a
            fixed breakpoint, and min() keeps a track from outgrowing a phone. */}
        <div
          className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(19rem,100%),1fr))]"
          data-testid="connector-grid"
        >
          {initialLoading
            ? Array.from({ length: 10 }, (_, i) => <CardSkeleton key={i} />)
            : shown.map((app) => (
                <AppCard
                  key={app.slug}
                  app={app}
                  connection={bySlug.get(app.slug)}
                  busy={
                    busy === `connect:${app.slug}` ||
                    busy === `disconnect:${bySlug.get(app.slug)?.id ?? ""}`
                  }
                  onConnect={() => void connect(app.slug)}
                  onDisconnect={(id) => void disconnect(id)}
                />
              ))}
        </div>

        {!initialLoading && shown.length === 0 && (
          <p className="py-12 text-center text-sm" style={{ color: FG_TERTIARY }}>
            {catalogFailed
              ? c.catalogFailed
              : tab.kind === "connected"
                ? c.noConnectedMatch
                : c.noMatch}
          </p>
        )}

        {browsing && cursor && (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={catalogLoading}
              className={btnClass("md")}
            >
              {catalogLoading && <Loader2 className="size-3.5 animate-spin" />}
              {catalogLoading ? c.loadingMore : c.loadMore}
            </button>
          </div>
        )}

        {/* Someone who has scrolled the catalogue and not found their tool is
            exactly who needs this, and the rail entry is easy to miss on the
            way past. Only at the foot of the full list — not under a search
            or a category, where it would read as a result. */}
        {tab.kind === "all" && !search && !initialLoading && (
          <button
            type="button"
            onClick={() => setTab({ kind: "mcp" })}
            data-testid="mcp-catalog-footer"
            className="group/mcp mt-3 flex w-full items-center gap-3 rounded-[12px] p-2 text-start transition-shadow duration-200 ease-out"
            style={{ background: CARD_BG, boxShadow: CARD_RING }}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = CARD_RING_HOVER)}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = CARD_RING)}
          >
            <span
              className="grid size-9 shrink-0 place-items-center rounded-full"
              style={{ background: CONTROL_BG }}
            >
              <Server className="size-4" style={{ color: FG_SECONDARY }} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[13px] leading-4 font-medium text-white">
                {c.mcpFooterTitle}
              </span>
              <span className="truncate text-[12px] leading-4" style={{ color: FG_TERTIARY }}>
                {c.mcpFooterBody}
              </span>
            </span>
            <span className={`me-1 ${btnClass("sm")}`}>{c.customMcp}</span>
          </button>
        )}
      </>
    );
  };

  return (
    <ModalSurface
      onClose={onClose}
      label={c.title}
      testId="connectors-dialog"
      sheet
      // Fixed height on a phone as well as on a desktop: with `h-auto` the
      // whole sheet resized every time you moved between Connected, All and a
      // category, and those differ by dozens of cards.
      sheetHeight="88dvh"
      sheetFixedHeight
      className="sheet-surface h-[min(92dvh,780px)] max-w-5xl overflow-hidden rounded-[16px]"
      style={{ background: SHELL_BG, boxShadow: floatingRing(SHELL_BG) }}
    >
      <div className="flex min-h-0 flex-1">
        {/* No fill and no divider: the rail sits on the panel, and the cards
            beside it are what read as raised. */}
        <aside className="hidden w-56 shrink-0 flex-col md:flex">
          <div className="shrink-0 p-2.5">{searchField("connector-search", searchRef)}</div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            <RailButton
              active={tab.kind === "connected"}
              onClick={() => setTab({ kind: "connected" })}
              count={activeCount}
            >
              {t.common.connected}
            </RailButton>
            <RailButton
              active={tab.kind === "all"}
              onClick={() => setTab({ kind: "all" })}
              count={totalApps || undefined}
            >
              {c.all}
            </RailButton>
            {/* Its own row rather than a category: nothing here comes from the
                catalogue, and someone who has added a server needs a way back
                to it that is not "open the add form and press back". */}
            <RailButton
              active={tab.kind === "mcp"}
              onClick={() => setTab({ kind: "mcp" })}
              count={mcpCount || undefined}
            >
              {c.customMcp}
            </RailButton>
            {categories.length > 0 && (
              <p className="mt-3 mb-1 px-3 text-[14px] leading-[21px]" style={{ color: FG_TERTIARY }}>
                {c.categories}
              </p>
            )}
            {categories.map((c) => (
              <RailButton
                key={c.id}
                active={tab.kind === "category" && tab.id === c.id}
                onClick={() => setTab({ kind: "category", id: c.id, label: categoryName(t, c.id, c.label) })}
                count={c.count}
              >
                {categoryName(t, c.id, c.label)}
              </RailButton>
            ))}
          </div>
        </aside>

        {/* Inset on three sides and flush to the rail, so the catalog reads
            as a panel floating on the shell rather than as the other half of
            a split. No inset on a phone, where there is no rail to sit beside. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col md:py-2 md:pe-2">
          <div
            className="sheet-flush flex min-h-0 flex-1 flex-col overflow-hidden md:rounded-[8px] md:mx-ring"
            style={{ background: PANEL_BG }}
          >
          {/* A breadcrumb rather than a title, because the add panel is a place
              you can be inside the modal — and the way back has to be obvious
              when the whole body has been replaced. */}
          {/* Draggable as well as the grabber: 18px of pill is not a target
              for a sheet this tall. Buttons inside still click — a gesture
              under the slop is not a drag. */}
          <div className="flex shrink-0 items-center justify-between gap-4 px-5 py-3.5">
            <nav aria-label={c.breadcrumb} className="min-w-0 flex-1">
              <ol className="flex min-w-0 items-center gap-2 text-[15px]">
                <li className="flex min-w-0 items-center gap-2">
                  {panelOpen ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAddingMcp(false);
                        setEditingMcp(null);
                      }}
                      className="flex items-center gap-2 font-semibold tracking-tight transition hover:text-white"
                      style={{ color: FG_TERTIARY }}
                    >
                      <Waypoints className="size-[18px]" />
                      {c.title}
                    </button>
                  ) : (
                    <span className="flex items-center gap-2 font-semibold tracking-tight text-white">
                      <Waypoints className="size-[18px] text-white/60" />
                      {c.title}
                    </span>
                  )}
                </li>
                {panelOpen && (
                  <li className="flex min-w-0 items-center gap-2">
                    <span aria-hidden style={{ color: FG_TERTIARY }}>
                      /
                    </span>
                    <span className="truncate font-semibold tracking-tight text-white">
                      {addingMcp ? c.addMcpServer : c.editMcpServer}
                    </span>
                  </li>
                )}
              </ol>
            </nav>
            <div className="flex shrink-0 items-center gap-1">
              {/* Not while the Custom MCP tab is up: its own "Add server"
                  button is right there, and two of them side by side on a
                  phone is most of the header spent saying the same thing. */}
              {!panelOpen && tab.kind !== "mcp" && (
                <button
                  type="button"
                  onClick={() => {
                    setTab({ kind: "mcp" });
                    setEditingMcp(null);
                    setAddingMcp(true);
                  }}
                  data-testid="connectors-add"
                  className={btnClass("lg", "ghost")}
                >
                  <Plus className="size-3.5" />
                  {/* The label is the point: a lone + in a catalogue of a
                      thousand apps reads as "add a connector", which is not
                      what it does. */}
                  <span className="hidden sm:inline">{c.addMcpServer}</span>
                  <span className="sm:hidden">MCP</span>
                </button>
              )}
              <SurfaceCloseButton />
            </div>
          </div>

          {/* The rail owns search on desktop; a phone has no rail, so it rides
              here with the same choices as pills. */}
          {/* No bottom padding: the list scrolls up to the pills. Below them
              it left a band of empty panel where the cards were cut off; the
              list's own top padding keeps the space at rest. */}
          <div className="shrink-0 px-5 pt-3 md:hidden">
            {searchField("connector-search-mobile")}
            {/* The app already has a sliding-pill switch (Monthly / Yearly);
                the filter uses the same one so tabs behave alike everywhere. */}
            <div className="-mx-1 mt-2.5 px-1 pb-0.5">
              <SlidingPillSwitch
                aria-label={c.filter}
                size="sm"
                value={tabKey(tab)}
                onChange={(key) => {
                  const next = tabs.find((tb) => tabKey(tb) === key);
                  if (next) setTab(next);
                }}
                options={tabs.map((tb) => ({
                  value: tabKey(tb),
                  label:
                    tb.kind === "all"
                      ? c.all
                      : tb.kind === "connected"
                        ? t.common.connected
                        : tb.kind === "mcp"
                          ? c.customMcp
                          : tb.label,
                }))}
              />
            </div>
          </div>

            {/* native-safe-bottom: the sheet runs to the bottom edge, and on
                a phone with three hardware buttons the last card would sit
                under them. */}
            {/* The surface's scroll body: on a phone it hands a pull from the
                top of the list to the sheet. */}
            <SurfaceScroll ref={bodyRef} className="native-safe-bottom">
              {tab.kind === "mcp" ? (
                <McpServersPanel
                  adding={addingMcp}
                  editingId={editingMcp}
                  onAddingChange={setAddingMcp}
                  onEditingChange={setEditingMcp}
                  onCountChange={setMcpCount}
                />
              ) : (
                <>
                  {heroOpen && configured && tab.kind === "all" && !search && (
                    <Hero chips={heroChips} onDismiss={dismissHero} />
                  )}
                  <div className="px-5 pt-4 pb-5">{body()}</div>
                </>
              )}
            </SurfaceScroll>
          </div>
        </div>
      </div>
    </ModalSurface>
  );
}

/**
 * Mounted once, at the app root. Anything that wants the catalog calls
 * `openConnectors()`; coming back from a provider opens it too, so the person
 * lands on the app they just linked rather than on a page they left.
 */
export function ConnectorsDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => onConnectorsOpen(() => setOpen(true)), []);

  useEffect(() => {
    // A connect that began on a card in the chat goes back to the chat. The
    // return flag is the same either way, so the card marks the trip on its
    // way out and this reads the mark rather than assuming the modal.
    const fromChat = connectStartedInChat();
    if (consumeConnectReturn() && !fromChat) openConnectors();
    if (fromChat) return;

    // Coming back from an MCP sign-in, or from anywhere that linked here: the
    // address says which panel to reopen, and the modal reads it on mount.
    const params = new URL(window.location.href).searchParams;
    if (params.get("connectors") || params.get("mcp")) openConnectors();
  }, []);

  if (!open) return null;
  return <ConnectorsModal onClose={() => setOpen(false)} />;
}
