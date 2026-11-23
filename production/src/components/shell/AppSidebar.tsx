import { useEffect, useRef, useState, type ReactNode } from "react";
import { isPaidPlan } from "../../lib/plan-tiers";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  Coins,
  Blocks,
  Globe,
  PanelLeftClose,
  Plus,
  SquarePen,
  Settings,
  UserPlus,
  Building2,
  Bell,
  Waypoints,
  Zap,
} from "lucide-react";
import { type WorkspaceSummary } from "../../lib/api";
import {
  fetchWorkspaces,
  invalidateWorkspaceCatalog,
} from "../../lib/workspaceCatalog";
import { MythexMark } from "../mythex-mark";
import { Skeleton } from "../ui";
import { RecentChats } from "./RecentChats";
import { SidebarPromoCards } from "./SidebarPromoCards";
import { AccountMenu, PendingBadge } from "../nav/AccountMenu";
import { NewWorkspaceDialog } from "../nav/Navigator";
import { canBuyPlans, canSell } from "../../lib/native";
import { useAuth } from "../../lib/auth";
import { useUpgrade } from "../../lib/upgrade";
import { openConnectors } from "../../lib/connectors";
import { btnClass, CARD_BG, CONTROL_BG, FG_SECONDARY, SHELL_BG } from "../../lib/surfaces";
import { formatCredits } from "../../lib/tokens";
import { CREDIT_BAR, useCreditMeter } from "../../lib/credit-meter";
import { MenuSheet, useIsPhone } from "../ui/Sheet";
import { isSheetPath, useOpenInSheet } from "./PageSheet";
import { useScrollFade } from "../ui/useScrollFade";
import { fill, pl, useT } from "../../i18n/app";

const WS_KEY = "mythex_ws";
/** Dashboard chrome — the shell every nav sits on. */
const DRAWER = SHELL_BG;
/** Muted nav text (`--fg-tertiary` dark). */
const NAV_MUTED = "oklch(72.34% 0.002 107)";

/**
 * Survive route remounts (Dashboard → Billing → Settings each mount a new
 * AppSidebar). Without this, workspace + recents flash empty on every nav.
 */
const sidebarCache: { workspaces: WorkspaceSummary[] } = { workspaces: [] };

export function AppSidebar({
  onToggle,
  inDrawer = false,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
  /** @deprecated Global search removed from drawer. */
  onOpenSearch?: () => void;
  /**
   * The phone's drawer (MobileNavDrawer), laid out as ChatGPT's is: the title
   * row with the workspace as a round button on its right, and the account
   * and "New chat" floating over the foot of the list. The desktop rail keeps
   * its own layout.
   */
  inDrawer?: boolean;
}) {
  const t = useT();
  const { user } = useAuth();
  const navigate = useNavigate();
  const openUpgrade = useUpgrade();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>(
    () => sidebarCache.workspaces,
  );
  const [workspaceId, setWorkspaceId] = useState(() => localStorage.getItem(WS_KEY) ?? "");
  const [newWs, setNewWs] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);
  const phone = useIsPhone();
  // Recents scroll under the workspace switcher and the account button: fade
  // at those edges, as the chat does under its header and composer.
  const navRef = useRef<HTMLElement>(null);
  useScrollFade(navRef);

  const workspace =
    workspaces.find((w) => w.id === workspaceId) ??
    workspaces.find((w) => w.isDefault) ??
    workspaces[0];

  useEffect(() => {
    let cancelled = false;
    void fetchWorkspaces()
      .then((list) => {
        if (cancelled) return;
        sidebarCache.workspaces = list;
        setWorkspaces(list);
      })
      .catch(() => {
        if (!cancelled && sidebarCache.workspaces.length === 0) setWorkspaces([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!workspace) return;
    localStorage.setItem(WS_KEY, workspace.id);
    setWorkspaceId(workspace.id);
  }, [workspace?.id]);

  useEffect(() => {
    const onWs = () => {
      invalidateWorkspaceCatalog();
      void fetchWorkspaces({ force: true })
        .then((list) => {
          sidebarCache.workspaces = list;
          setWorkspaces(list);
        })
        .catch(() => undefined);
    };
    window.addEventListener("mythex:workspace-changed", onWs);
    // The Team page approved or declined something: the badge's counts moved.
    window.addEventListener("mythex:workspace-pending", onWs);
    return () => {
      window.removeEventListener("mythex:workspace-changed", onWs);
      window.removeEventListener("mythex:workspace-pending", onWs);
    };
  }, []);

  // Opening the menu re-reads the list, so what's waiting is current.
  useEffect(() => {
    if (!wsOpen) return;
    void fetchWorkspaces({ force: true })
      .then((list) => {
        sidebarCache.workspaces = list;
        setWorkspaces(list);
      })
      .catch(() => undefined);
  }, [wsOpen]);


  const initial = (workspace?.name ?? "M").slice(0, 1).toUpperCase();
  // Only once the user is known: during the sign-in check `user` is null, and
  // "not Pro" drew the trial offer for a moment on every page — Pro included.
  const showUpgradeCard = canSell() && Boolean(user) && !isPaidPlan(user?.plan);
  // In the phone drawer one card, not two: a Free plan sees the offer, a paid
  // one sees Share. Two cards ate a fifth of the screen the history needs.
  const showShareCard = canSell() && Boolean(user) && !(inDrawer && showUpgradeCard);
  const promoCards = Number(showUpgradeCard) + Number(showShareCard);
  const { balance: balanceCredits, pct: creditPct } = useCreditMeter(user);
  const otherWorkspaces = workspaces.filter((w) => w.id !== workspace?.id);
  /** Join requests and publishes waiting on you (as an admin) — the badge. */
  const pendingOf = (w?: WorkspaceSummary | null) => (w?.pending?.joinRequests ?? 0) + (w?.pending?.approvals ?? 0);
  const pendingHere = pendingOf(workspace);
  const pendingAll = workspaces.reduce((sum, w) => sum + pendingOf(w), 0);

  /** The workspace button. On a phone it toggles the sheet; on a desktop Base
   *  UI's trigger does, and a second toggle here would cancel it out. */
  const wsTrigger = (onClick?: () => void) => (
    <button
      type="button"
      onClick={onClick}
      data-ws-trigger
      className="flex w-full items-center gap-1.5 rounded-[10px] border border-line px-1.5 py-1 text-start transition hover:bg-white/[0.06]"
    >
      <span
        data-ws-avatar
        className="grid h-5 w-5 shrink-0 place-items-center rounded-[4px] bg-[#e11d8a] text-[10px] font-semibold text-white"
      >
        {initial}
      </span>
      <span data-ws-name className="min-w-0 flex-1 truncate text-sm font-medium text-white">
        {workspace?.name ?? t.shell.sidebar.workspace}
      </span>
      {pendingAll > 0 && <PendingBadge count={pendingAll} label={pl(t.teams.pending.waiting, pendingAll)} />}
      <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: NAV_MUTED }} />
    </button>
  );

  const planLabel = user?.plan === "ENTERPRISE" ? t.plans.enterprisePlan : user?.plan === "BUSINESS" ? t.plans.businessPlan : user?.plan === "PRO" ? t.shell.sidebar.proPlan : t.shell.sidebar.freePlan;
  const memberCount = workspace?.memberCount ?? 1;
  const memberLabel = pl(t.shell.sidebar.members, memberCount);
  const pickWorkspace = (id: string, close = () => setWsOpen(false)) => {
    setWorkspaceId(id);
    localStorage.setItem(WS_KEY, id);
    close();
    window.dispatchEvent(new Event("mythex:workspace-changed"));
  };
  /** Team (Settings → Team) for this workspace, on a tab; a sheet on a phone. */
  const openTeamPage = useOpenInSheet();
  const openTeam = (tab: "people" | "workspace" | "approvals", extra = "") => {
    setWsOpen(false);
    const ws = workspace?.id ? `workspace=${encodeURIComponent(workspace.id)}&` : "";
    openTeamPage(`/settings/team?${ws}tab=${tab}${extra}`);
  };
  /** A hairline across the card, between its groups. */
  const wsRule = <div className="-mx-1.5 my-1.5 h-px" style={{ background: "oklch(0.55 0.002 107 / 0.4)" }} />;
  /** Lovable's secondary button — our raised control (`btnClass`), which is
   *  the same chassis at the same 28px, full width. */
  const wsButton = `${btnClass("md")} w-full`;

  /**
   * The workspace menu, as Lovable's desktop one, measured: a card (the card
   * colour, 12px corners, a hairline ring) holding who the workspace is and
   * its two actions, the credits with their bar, and the other workspaces —
   * set in a darker shell whose foot carries "Turn Pro" for a free plan.
   */
  // From the account menu (the phone drawer's sheet, the desktop's popover),
  // which already has Settings, the credits and the upgrade, the workspace
  // menu keeps to workspaces. `inline` is the desktop's: it is a step of the
  // account popover, already on the card, so it drops its own card.
  const wsMenuBody = (
    flat: boolean,
    simple = false,
    { close = () => setWsOpen(false), inline = false }: { close?: () => void; inline?: boolean } = {},
  ) => (
    <>
      <div
        className={flat ? "px-2.5 pt-1" : inline ? "" : "rounded-[12px] p-1.5"}
        // The card only needs its edge, not a drop: it sits inside the menu, not
        // over the page. Lovable's: a half-pixel ring and a 1px dark hairline.
        style={
          flat || inline
            ? undefined
            : {
                background: CARD_BG,
                boxShadow: `rgba(119,119,113,0.4) 0 0 0 0.5px, ${CARD_BG} 0 0 0 0.5px, rgba(0,0,0,0.16) 0 0 0 1px`,
              }
        }
      >
        <div className="px-1.5 pt-1.5 pb-1">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-[6px] bg-[#e11d8a] text-[16px] text-white">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] leading-[21px] font-[480] text-fg">{workspace?.name ?? t.shell.sidebar.workspace}</p>
              <p className="truncate text-[12px] leading-[18px]" style={{ color: NAV_MUTED }}>
                {planLabel} • {memberLabel}
              </p>
            </div>
          </div>
          <div className="mt-2.5 space-y-1.5">
            {/* As Lovable's workspace menu: invite and the workspace's settings
                both open Team (Settings → Team), on the right tab. */}
            <button
              type="button"
              onClick={() => {
                close();
                openTeam("people", "&invite=1");
              }}
              className={wsButton}
              data-testid="ws-menu-invite"
            >
              <UserPlus className="size-4" />
              {t.shell.sidebar.inviteMembers}
            </button>
            <button
              type="button"
              onClick={() => {
                close();
                openTeam("workspace");
              }}
              className={wsButton}
              data-testid="ws-menu-workspace-settings"
            >
              <Building2 className="size-4" />
              {t.teams.pending.workspaceSettings}
            </button>
            {/* What's waiting on you here, one tap from where it's decided. */}
            {pendingHere > 0 && (
              <button
                type="button"
                onClick={() => {
                  close();
                  if (workspace?.pending?.joinRequests) openTeam("people", "&view=requests");
                  else openTeam("approvals");
                }}
                className="flex w-full items-center gap-2 rounded-[8px] bg-amber-500/10 px-2.5 py-1.5 text-start text-[13px] text-amber-200 transition hover:bg-amber-500/15"
                data-testid="ws-menu-pending"
              >
                <Bell className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {[
                    workspace?.pending?.joinRequests ? pl(t.teams.pending.joinRequests, workspace.pending.joinRequests) : null,
                    workspace?.pending?.approvals ? pl(t.teams.pending.approvals, workspace.pending.approvals) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className="shrink-0 font-medium">{t.teams.pending.review}</span>
              </button>
            )}
            {!simple && (
              <button
                type="button"
                onClick={() => {
                  setWsOpen(false);
                  navigate("/settings");
                }}
                className={wsButton}
              >
                <Settings className="size-4" />
                {t.common.settings}
              </button>
            )}
          </div>
        </div>

        {!simple && (
          <>
        {wsRule}
        {/* Credits: the balance, the bar (the billing page's blue) and when the
            daily ones come back. Where this build sells, it goes to more. */}
        <button
          type="button"
          onClick={() => {
            if (!canBuyPlans()) return;
            setWsOpen(false);
            if (isPaidPlan(user?.plan)) navigate("/billing?highlight=credits");
            else openUpgrade("plans");
          }}
          className="block w-full rounded-[6px] p-1.5 text-start transition hover:bg-white/[0.04]"
        >
          <span className="flex items-center justify-between text-[14px] leading-[21px]">
            <span className="font-[480] text-fg">{t.shell.credits.title}</span>
            <span className="flex items-center gap-0.5" style={{ color: NAV_MUTED }}>
              {fill(t.shell.credits.left, { credits: formatCredits(balanceCredits) })}
              {canBuyPlans() && <ChevronRight className="size-4 rtl:-scale-x-100" />}
            </span>
          </span>
          <span className="mt-2.5 block h-2.5 overflow-hidden rounded-full" style={{ background: CONTROL_BG }}>
            <span
              className="block h-full rounded-full transition-[width]"
              style={{ width: `${Math.max(0, creditPct)}%`, background: CREDIT_BAR }}
            />
          </span>
          <span className="mt-2.5 flex items-center gap-1.5 text-[12px] leading-[18px]" style={{ color: NAV_MUTED }}>
            <span className="inline-block size-2 shrink-0 rounded-full bg-white/40" />
            {t.shell.credits.dailyReset}
          </span>
        </button>

          </>
        )}
        {wsRule}
        {otherWorkspaces.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => pickWorkspace(w.id, close)}
            className={`flex ${flat ? "h-11 text-[15px]" : "h-8 text-[14px]"} w-full items-center gap-2.5 rounded-[6px] px-2 text-start transition hover:bg-white/[0.04] hover:text-fg`}
            style={{ color: FG_SECONDARY }}
          >
            <span className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-[#e11d8a] text-[10px] text-white">
              {w.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate">{w.name}</span>
            {pendingOf(w) > 0 && <PendingBadge count={pendingOf(w)} label={pl(t.teams.pending.waiting, pendingOf(w))} />}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            close();
            setNewWs(true);
          }}
          className={`flex ${flat ? "h-11 text-[15px]" : "h-8 text-[14px]"} w-full items-center gap-2.5 rounded-[6px] px-2 text-start transition hover:bg-white/[0.04] hover:text-fg`}
          style={{ color: FG_SECONDARY }}
        >
          <Plus className="size-4 shrink-0" />
          {t.shell.sidebar.newWorkspace}
        </button>
      </div>

      {/* The shell's foot: Turn Pro, with Upgrade in the special colour at
          a fifth — Lovable's tinted secondary. */}
      {!simple && user?.plan === "FREE" && canBuyPlans() && (
        <div
          className={`flex h-11 items-center gap-2 pe-2 ps-3.5 ${flat ? "mx-1 mt-1 border-t px-3.5! h-14!" : ""}`}
          style={flat ? { borderColor: "oklch(0.55 0.002 107 / 0.4)" } : undefined}
        >
          <Zap className="size-4 shrink-0 fill-current text-fg" strokeWidth={1.5} />
          <span className="min-w-0 flex-1 truncate text-[14px] text-fg">{t.shell.sidebar.turnPro}</span>
          <button
            type="button"
            onClick={() => {
              setWsOpen(false);
              openUpgrade("plans");
            }}
            className="h-7 shrink-0 rounded-[8px] px-2.5 text-[14px] transition hover:brightness-125 active:opacity-80"
            style={{
              background: "color-mix(in oklch, oklch(58.99% 0.2523 294.88), transparent 80%)",
              color: "oklch(0.7661 0.1614 294.88)",
            }}
          >
            {t.common.upgrade}
          </button>
        </div>
      )}
    </>
  );

  return (
    <aside
      className="relative z-30 flex h-full min-h-0 w-[15.5rem] shrink-0 flex-col overflow-visible text-white"
      style={{ background: DRAWER }}
    >
      <div
        data-brand-row
        // In the phone drawer the title floats over the list with nothing
        // behind it: the list fades itself out as it rises past the title, as
        // the chat's transcript does under the workspace header (index.css,
        // [data-phone-drawer] nav).
        className={
          inDrawer
            ? "pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center gap-2 [&>*]:pointer-events-auto"
            : "flex items-center gap-2 px-3 pt-3 pb-3"
        }
      >
        <Link
          to="/"
          aria-label={t.shell.sidebar.home}
          className="flex min-w-0 items-center gap-2 transition-opacity hover:opacity-80"
        >
          {/* Larger in the phone drawer, where the word is the drawer's title
              (index.css): at 22px the mark looked small beside it. */}
          <MythexMark size={inDrawer ? 28 : 22} className="shrink-0" />
          <span className="truncate text-[15px] font-semibold tracking-tight text-white">
            Mythex
          </span>
        </Link>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="ms-auto rounded-[8px] p-1.5 transition hover:bg-white/[0.06]"
            style={{ color: NAV_MUTED }}
            aria-label={t.shell.sidebar.collapse}
          >
            <PanelLeftClose className="h-4 w-4 rtl:-scale-x-100" />
          </button>
        )}
      </div>

      {/* The workspace is switched from the account menu, as on the phone: a
          sheet there, and on a desktop a step of the account popover itself.
          A phone with no drawer (the rail itself, narrow) still gets the
          button at the top. */}
      {phone && (
        <div className={inDrawer ? "contents" : "relative z-50 px-2 pt-1 pb-3"}>
          {!inDrawer && wsTrigger(() => setWsOpen((o) => !o))}
          <MenuSheet
            open={wsOpen}
            onClose={() => setWsOpen(false)}
            label={t.shell.sidebar.workspace}
            surface={CARD_BG}
          >
            {wsMenuBody(true, inDrawer)}
          </MenuSheet>
        </div>
      )}

      <nav
        ref={navRef}
        // How tall the floating foot is (the avatar, and the offer card above
        // it when shown), for the list's fade under it — index.css.
        // Each card is 3.5rem with 0.5rem between; the share card counts too.
        style={
          inDrawer
            ? ({
                "--drawer-foot": `calc(${promoCards === 0 ? 5.5 : 5.5 + 4 + (promoCards - 1) * 4}rem + var(--safe-bottom, 0px))`,
                paddingBottom: `calc(${promoCards === 0 ? 6 : 7 + promoCards * 4}rem + var(--safe-bottom, 0px))`,
              } as React.CSSProperties)
            : undefined
        }
        // In the phone drawer the list runs to the bottom, under the floating
        // avatar and New chat, with room at its end to scroll clear of them.
        className={`mx-scroll-fade min-h-0 flex-1 space-y-3 overflow-y-auto px-2 ${inDrawer ? "pt-[68px]" : "pt-1"}`}
      >
        {/* One of each. "Dashboard" and "New project" both went to the same
            page, and the Account and Resources blocks repeated the account
            menu at the foot of the drawer — which is where they live now.
            One group, with Recents 12px under it, as Lovable's drawer. */}
        <div>
          <SideLink to="/" end icon={<SquarePen strokeWidth={1.75} />}>
            {t.shell.sidebar.newProject}
          </SideLink>
          <SideLink to="/dashboard/projects" icon={<Blocks strokeWidth={1.75} />}>
            {t.shell.sidebar.projects}
          </SideLink>
          <button
            type="button"
            data-testid="integrations-sidebar"
            onClick={() => openConnectors()}
            className={`${NAV_ROW} w-full text-start text-fg-2 hover:bg-white/[0.1] hover:text-fg`}
          >
            <NavIcon>
              <Waypoints strokeWidth={1.75} />
            </NavIcon>
            {t.shell.sidebar.connectors}
          </button>
          <SideLink to="/settings/domains" icon={<Globe strokeWidth={1.75} />}>
            {t.shell.sidebar.domains}
          </SideLink>
          {/* Only where this build sells: in the app the billing page is a
              way to go and buy, which is what guideline 3.1.1 stops. */}
          {canBuyPlans() && (
            // Not `end`: Usage details (/billing/usage) is part of it too.
            <SideLink to="/billing" icon={<Coins strokeWidth={1.75} />}>
              {t.shell.sidebar.plansAndCredits}
            </SideLink>
          )}
        </div>

        <RecentChats workspaceId={workspace?.id} />
      </nav>

      <div
        // In the drawer the card floats over the list with the avatar under
        // it, so the list scrolls on beneath both — no solid band at the foot.
        className={
          inDrawer
            ? "pointer-events-none absolute inset-x-0 z-40 px-2 [&>*]:pointer-events-auto"
            : "shrink-0 space-y-2 px-2"
        }
        // Above the avatar row, which sits on the home indicator's inset.
        style={inDrawer ? { bottom: "calc(72px + var(--safe-bottom, 0px))" } : undefined}
      >
        {/* `canSell`, not just the plan, on both cards.

            Without it the upgrade card rendered in the app too, where
            `openUpgrade` deliberately does nothing — a button that advertised
            a discount and then ignored the tap, and a price inside the app,
            which is the purchase signposting guideline 3.1.1 exists to stop.
            Upgrade (Free) and Share (everyone) stack as Lovable's do. */}
        <SidebarPromoCards
          upgrade={showUpgradeCard}
          share={showShareCard}
          isFree={!isPaidPlan(user?.plan)}
          onUpgrade={() => openUpgrade("plans")}
          inDrawer={inDrawer}
        />
      </div>

      {/* The account: avatar and name on one light row (no box, no email —
          those are in the menu it opens). In the phone drawer it floats over
          the foot of the list instead, beside "New chat", as ChatGPT's do. */}
      {inDrawer ? (
        <DrawerFoot
          workspace={{ initial, name: workspace?.name ?? t.shell.sidebar.workspace, pending: pendingAll }}
          onOpenWorkspace={() => setWsOpen(true)}
        />
      ) : (
        <div className="shrink-0">
          {user ? (
            <AccountMenu
              compact
              workspace={{ initial, name: workspace?.name ?? t.shell.sidebar.workspace, pending: pendingAll }}
              workspaceMenu={(close) => wsMenuBody(false, true, { close, inline: true })}
            />
          ) : (
            // Until the sign-in check answers: the row's shape, not a "?"
            // avatar and the word "Account" that then change under the pointer.
            <div className="flex items-center gap-2.5 p-2 px-3" aria-hidden>
              <Skeleton className="size-6 shrink-0 rounded-full" />
              <Skeleton className="h-3.5 w-24 rounded-md" />
            </div>
          )}
        </div>
      )}
      {newWs && (
        <NewWorkspaceDialog
          onClose={() => setNewWs(false)}
          onCreated={(id) => {
            setNewWs(false);
            setWorkspaceId(id);
            localStorage.setItem(WS_KEY, id);
            invalidateWorkspaceCatalog();
            void fetchWorkspaces({ force: true })
              .then((list) => {
                sidebarCache.workspaces = list;
                setWorkspaces(list);
              })
              .catch(() => undefined);
            window.dispatchEvent(new Event("mythex:workspace-changed"));
          }}
        />
      )}
    </aside>
  );
}

/**
 * The phone drawer's foot, floating over the list with the list fading out
 * beneath it: you on the left — avatar and name, as Claude's app has it, and
 * the menu it opens is where the workspace is switched too — and "New chat"
 * on the right while you are in a project (a new chat in that project).
 */
function DrawerFoot({
  workspace,
  onOpenWorkspace,
}: {
  workspace: { initial: string; name: string; pending?: number };
  onOpenWorkspace: () => void;
}) {
  const t = useT();
  const { pathname } = useLocation();
  const inProject = /^\/p\/[^/]+/.test(pathname);
  return (
    <div
      // No band behind it: the list stays in view under the two floating
      // buttons, as in Claude's and ChatGPT's drawers.
      className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 px-4"
      // Clear of the home indicator: the drawer no longer pads its foot, so
      // the list can run under this row to the screen's edge.
      style={{ paddingBottom: "calc(1rem + var(--safe-bottom, 0px))" }}
    >
      <div className="pointer-events-auto">
        <AccountMenu floating workspace={workspace} onOpenWorkspace={onOpenWorkspace} />
      </div>
      {inProject && (
        <button
          type="button"
          data-testid="drawer-new-chat"
          onClick={() => window.dispatchEvent(new Event("mythex:new-chat"))}
          className="pointer-events-auto inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-white px-4 text-[16px] font-semibold whitespace-nowrap text-black shadow-[0_6px_20px_rgb(0_0_0/0.35)] transition active:opacity-80"
        >
          <Plus className="size-[18px]" strokeWidth={2.2} />
          {t.shell.sidebar.newChat}
        </button>
      )}
    </div>
  );
}

function SideLink({
  to,
  end,
  icon,
  children,
}: {
  to: string;
  end?: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  // On a phone the account's pages open in a sheet over this page.
  const phone = useIsPhone();
  const openInSheet = useOpenInSheet();
  return (
    <NavLink
      to={to}
      end={end}
      onClick={(e) => {
        if (!phone || !isSheetPath(to)) return;
        e.preventDefault();
        openInSheet(to);
      }}
      className={({ isActive }) =>
        `${NAV_ROW} ${isActive ? "bg-white/[0.1] text-fg" : "text-fg-2 hover:bg-white/[0.1] hover:text-fg"}`
      }
    >
      <NavIcon>{icon}</NavIcon>
      <span className="truncate">{children}</span>
    </NavLink>
  );
}

/** A rail row, as ChatGPT's measure: 36px tall with 10px corners (`h-8`
 *  stays for the phone drawer, whose CSS sizes rows by it), the icon in a
 *  square of its own and the label 2px after it, so the labels line up
 *  whatever the icon's shape. */
const NAV_ROW =
  "group/nav flex h-8 md:h-9 items-center gap-0.5 rounded-[8px] md:rounded-[10px] text-[14px] leading-[21px] transition [&[aria-current=page]>span:first-child]:text-fg";

/** The row's icon, muted until the row is pointed at: 20px, ChatGPT's. */
function NavIcon({ children }: { children: ReactNode }) {
  return (
    <span
      data-nav-icon
      className="grid size-8 shrink-0 place-items-center text-[oklch(72.34%_0.002_107)] transition-colors group-hover/nav:text-fg-2 [&>svg]:size-5"
    >
      {children}
    </span>
  );
}

