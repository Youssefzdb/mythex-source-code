import { createContext, Suspense, useContext, useEffect, useState, type ReactNode } from "react";
import { lazyRoute } from "../../lib/lazy-route";
import { isPaidPlan } from "../../lib/plan-tiers";
import { useNavigate } from "react-router-dom";
import { useUpgrade } from "../../lib/upgrade";
import { BookOpen, ChevronLeft, ChevronRight, ChevronsUpDown, Coins, Gift, Handshake, Home, LogOut, MessageCircle, Settings, Shield, Zap } from "lucide-react";
import { useCreators } from "../../i18n/solutions/creators";
import { onSupportUnread, openSupport, refreshSupportUnread } from "../../lib/support";
import { DOCS_URL } from "../../lib/docs-url";
import { canBuyPlans, canSell } from "../../lib/native";
import { useAuth } from "../../lib/auth";
import { formatCredits, creditsFromMillicredits } from "../../lib/tokens";
import { proTrialCta } from "../PricingPlans";
import { CARD_BG, CONTROL_BG, FG_TERTIARY, floatingRing } from "../../lib/surfaces";
import { CREDIT_BAR, useCreditMeter } from "../../lib/credit-meter";
import { MenuSheet, useIsPhone } from "../ui/Sheet";
import { Popover } from "../ui/Popover";
import { useOpenInSheet } from "../shell/PageSheet";
import { PanelSteps } from "../ui/PanelSwap";
import { CountBadge } from "../ui/CountBadge";
import { appLocale, fill, pl, useAppLocale, useT } from "../../i18n/app";
import { localizePath } from "../../i18n/locales";

const ShareMythexDialog = lazyRoute(() => import("../ShareMythexDialog").then((m) => ({ default: m.ShareMythexDialog })));

/**
 * Account button pinned to the bottom of the navigation drawer.
 * `compact` = the drawer's foot: avatar and name on one borderless row.
 */
export function AccountMenu({
  compact = false,
  floating = false,
  workspace,
  onOpenWorkspace,
  workspaceMenu,
}: {
  compact?: boolean;
  /** The phone drawer's foot: avatar and name, as Claude's app has them. */
  floating?: boolean;
  /** The current workspace, shown as a row in the menu that opens the workspace switcher. */
  workspace?: { initial: string; name: string; /** Join requests and publishes waiting on you. */ pending?: number };
  onOpenWorkspace?: () => void;
  /** On a desktop the workspace menu slides in over this one, in the same
   *  popover, rather than closing it and opening another: given `close`, the
   *  menu's own contents. */
  workspaceMenu?: (close: () => void) => ReactNode;
}) {
  // The partner link's label in the app's language (i18n/solutions/creators).
  const creatorsCopy = useCreators(useAppLocale());
  const t = useT();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const openUpgrade = useUpgrade();
  const [open, setOpen] = useState(false);
  /** Which of the desktop popover's two steps shows: you, or your workspaces. */
  const [step, setStep] = useState<0 | 1>(0);
  const phone = useIsPhone();
  /** The account's pages: a sheet on a phone, the page anywhere else. */
  const openInSheet = useOpenInSheet();
  const inPlace = !phone && !!workspaceMenu;
  /** The phone drawer shows one offer card, so on a Free plan, where that is
   *  the trial, sharing is a row here. */
  const [sharing, setSharing] = useState(false);
  const shareRow = phone && canSell() && !isPaidPlan(user?.plan);
  const pending = workspace?.pending ?? 0;
  const { balance: balanceCredits, pct: creditPct } = useCreditMeter(user);
  /** Someone answered in Support while the widget was closed. Support lives in
   *  this menu now, so the dot rides on the avatar until it is opened. */
  const [supportUnread, setSupportUnread] = useState(false);
  useEffect(() => {
    const unsub = onSupportUnread(setSupportUnread);
    void refreshSupportUnread();
    // When the tab comes back rather than on a timer: the answer only changes
    // while the person is away, and polling would cost every session.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshSupportUnread();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  const go = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  /** The person's picture, or their initial. `small` is the drawer's foot:
   *  a 28px avatar in a 36px button (Lovable's 20px read as a dot there). */
  const avatarOf = (small = false) =>
    user?.avatarUrl ? (
      <img
        src={user.avatarUrl}
        alt=""
        className={`${small ? "size-7" : "size-8"} shrink-0 rounded-full border border-line`}
        referrerPolicy="no-referrer"
      />
    ) : (
      <span
        className={`grid ${small ? "size-7 text-[12px]" : "size-8 text-xs"} shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-500 font-semibold text-white`}
      >
        {(user?.name ?? "?").slice(0, 1).toUpperCase()}
      </span>
    );
  const avatar = avatarOf();

  const menuBody = (
    <>
      {workspace && (onOpenWorkspace || inPlace) ? (
        // Who you are and which workspace you are in, as one row — the
        // workspace's mark sits on your avatar — and a tap on it switches
        // workspace: neither the phone drawer nor the desktop rail has a
        // switcher of its own. The email is in Account settings.
        <button
          type="button"
          data-testid="account-workspace"
          onClick={() => {
            if (inPlace) return setStep(1);
            setOpen(false);
            onOpenWorkspace?.();
          }}
          className={`flex w-full items-center text-start transition hover:bg-white/[0.04] active:bg-white/[0.06] ${
            floating ? "gap-3 rounded-[12px] px-2.5 py-2.5" : "gap-2.5 rounded-[8px] px-2 py-2"
          }`}
        >
          {/* The sheet's 44px avatar; the desktop menu's is the 32px it had. */}
          <span
            className={`relative shrink-0 ${floating ? "[&>:first-child]:!size-11 [&>span:first-child]:!text-[17px]" : ""}`}
          >
            {avatar}
            <span
              className={`absolute grid place-items-center bg-[#e11d8a] font-semibold text-white ${
                floating
                  ? "-end-1 -bottom-1 size-[22px] rounded-[6px] text-[11px]"
                  : "-end-1 -bottom-1 size-[16px] rounded-[4px] text-[9px]"
              }`}
              style={{ boxShadow: `0 0 0 2px ${CARD_BG}` }}
            >
              {workspace.initial}
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span
              className={`block truncate text-fg ${
                floating ? "text-[16px] leading-[21px] font-[500]" : "text-[14px] leading-[21px] font-[480]"
              }`}
            >
              {user?.name}
            </span>
            <span
              className={`block truncate ${floating ? "text-[13px]" : "text-[12px]"} leading-[18px]`}
              style={{ color: FG_TERTIARY }}
            >
              {workspace.name}
            </span>
          </span>
          {pending > 0 && <PendingBadge count={pending} label={pl(t.teams.pending.waiting, pending)} />}
          <ChevronsUpDown className="size-4 shrink-0" style={{ color: FG_TERTIARY }} />
        </button>
      ) : (
        <div className="flex items-center gap-2.5 px-2 py-2">
          {avatar}
          <div className="min-w-0">
            <p className="truncate text-[14px] leading-[21px] font-[480] text-fg">{user?.name}</p>
            <p className="truncate text-[12px] leading-[18px]" style={{ color: FG_TERTIARY }}>
              {user?.email}
            </p>
          </div>
        </div>
      )}
      {RULE}

      {floating || inPlace ? (
        // The credits as the workspace menu used to show them — the balance,
        // the day's bar and when it comes back — since this menu is where
        // they are kept now, on the phone and the desktop alike.
        <button
          type="button"
          data-testid="account-credits"
          onClick={() => {
            if (!canBuyPlans()) return;
            setOpen(false);
            if (isPaidPlan(user?.plan)) openInSheet("/billing?highlight=credits");
            else openUpgrade("plans");
          }}
          className={`mb-1 block w-full text-start transition hover:bg-white/[0.04] active:bg-white/[0.06] ${
            floating ? "rounded-[10px] px-2.5 py-2" : "rounded-[8px] px-2.5 py-1.5"
          }`}
        >
          <span
            className={`flex items-center justify-between ${floating ? "text-[15px] leading-[20px]" : "text-[14px] leading-[21px]"}`}
          >
            <span className="text-fg">{t.shell.credits.title}</span>
            <span className="flex items-center gap-0.5" style={{ color: FG_TERTIARY }}>
              {fill(t.shell.credits.left, { credits: formatCredits(balanceCredits) })}
              {canBuyPlans() && <ChevronRight className="size-4 rtl:-scale-x-100" />}
            </span>
          </span>
          <span className="mt-2.5 block h-2 overflow-hidden rounded-full" style={{ background: CONTROL_BG }}>
            <span
              className="block h-full rounded-full transition-[width]"
              style={{ width: `${Math.max(0, creditPct)}%`, background: CREDIT_BAR }}
            />
          </span>
          <span className="mt-2 block text-[12px] leading-[18px]" style={{ color: FG_TERTIARY }}>
            {t.shell.credits.dailyReset}
          </span>
        </button>
      ) : (
        // Still shows the balance — that is the account's own state. In the
        // app it does not go anywhere, because where it went was a purchase.
        <MenuItem
          icon={Coins}
          onClick={() => {
            if (canBuyPlans()) navigate("/billing?highlight=plans");
            setOpen(false);
          }}
        >
          <span className="flex-1">{t.shell.credits.title}</span>
          <span style={{ color: FG_TERTIARY }}>
            {fill(t.shell.credits.left, {
              credits: formatCredits(user?.balanceCredits ?? creditsFromMillicredits(user?.balanceTokens ?? 0)),
            })}
          </span>
        </MenuItem>
      )}
      {/* Under the credits: what you have first, then where you change things. */}
      <MenuItem
        icon={Settings}
        onClick={() => {
          openInSheet("/settings");
          setOpen(false);
        }}
      >
        {t.shell.account.settings}
      </MenuItem>
      {/* Same reason as the sidebar's card: in the app `openUpgrade` does
          nothing, so this was an offer you could tap and tap. The balance
          above stays — that is the account's own state, which Apple has no
          objection to; what it objects to is a way to go and buy. */}
      {canBuyPlans() && user?.plan === "FREE" && (
        <MenuItem
          icon={Zap}
          onClick={() => {
            openUpgrade("plans");
            setOpen(false);
          }}
        >
          {proTrialCta()}
        </MenuItem>
      )}
      {shareRow && (
        <MenuItem
          icon={Gift}
          onClick={() => {
            setSharing(true);
            setOpen(false);
          }}
        >
          <span className="min-w-0 flex-1 truncate">{pl(t.referrals.share.title, 100)}</span>
        </MenuItem>
      )}
      {/* Partners (approved in Admin → Partners) reach their dashboard from here. English for now. */}
      {user?.partnerTrack && (
        <MenuItem
          icon={Handshake}
          onClick={() => {
            openInSheet("/settings/partner");
            setOpen(false);
          }}
        >
          {creatorsCopy.partnerUi.menuLink}
        </MenuItem>
      )}
      {user?.isAdmin && (
        <MenuItem
          icon={Shield}
          onClick={() => {
            navigate("/admin");
            setOpen(false);
          }}
        >
          {t.shell.account.admin}
        </MenuItem>
      )}
      {RULE}
      {/* Help and the public site: these were a "Resources" block in the
          sidebar, which repeated this menu. */}
      <MenuItem
        icon={MessageCircle}
        testId="support-menu"
        onClick={() => {
          setOpen(false);
          openSupport();
        }}
      >
        <span className="flex-1">{t.shell.account.support}</span>
        {supportUnread && (
          <span data-testid="support-unread-item" className="h-2 w-2 rounded-full bg-rose-500" aria-label={t.shell.account.newReply} />
        )}
      </MenuItem>
      <MenuItem
        icon={BookOpen}
        testId="docs-menu"
        onClick={() => {
          setOpen(false);
          window.open(DOCS_URL, "_blank", "noopener,noreferrer");
        }}
      >
        {t.shell.account.docs}
      </MenuItem>
      {/* The marketing site is the web's: in the app /home only leads back to
          the app's own home, so the row went nowhere. */}
      {canSell() && (
        <MenuItem icon={Home} onClick={() => go("/home")}>
          {t.shell.account.homepage}
        </MenuItem>
      )}
      {RULE}
      <MenuItem
        icon={LogOut}
        danger
        // In the app, straight to sign-in: "/" there is only a redirect to it, and
        // signing out on home had already fired that redirect — sending the app
        // back to "/" afterwards left it on a redirect that had been used up, an
        // empty screen. On the web "/" is the site, signed out, in their language
        // (/ar for someone using the app in Arabic), as a fresh load of "/" sends them.
        onClick={() => void logout().then(() => navigate(canSell() ? localizePath("/", appLocale()) : "/login", { replace: true }))}
      >
        {t.shell.account.signOut}
      </MenuItem>
    </>
  );

  /** The account button. On a phone it toggles the sheet; on a desktop Base
   *  UI's trigger does, and a second toggle here would cancel it out. */
  const trigger = (onClick?: () => void) =>
    floating ? (
      <button
        type="button"
        onClick={onClick}
        data-testid="drawer-account"
        // Floating over the list: just the avatar, full size, with no disc
        // around it — the list fades out beneath it instead.
        className="relative grid size-11 place-items-center rounded-full shadow-[0_4px_16px_rgb(0_0_0/0.35)] transition active:opacity-80 [&>:first-child]:!size-11 [&>span:first-child]:!text-[17px]"
        aria-label={supportUnread ? t.shell.account.menuNewReply : t.shell.account.menu}
      >
        {avatarOf()}
        {supportUnread && (
          <span
            data-testid="support-unread"
            className="absolute end-0 top-0 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-black"
            aria-hidden
          />
        )}
      </button>
    ) : (
    <button
      type="button"
      onClick={onClick}
      className={
        compact
          ? "flex h-11 w-full min-w-0 items-center gap-2.5 rounded-[10px] px-2 text-start transition hover:bg-white/[0.06] active:opacity-80"
          : "flex w-full items-center gap-2 rounded-[10px] border border-line px-2 py-1.5 text-start transition hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-white/20"
      }
      aria-label={supportUnread ? t.shell.account.menuNewReply : t.shell.account.menu}
    >
      <span className="relative shrink-0">
        {compact ? avatarOf(true) : avatar}
        {supportUnread && (
          <span
            data-testid="support-unread"
            className="absolute -end-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-[#171717]"
            aria-hidden
          />
        )}
      </span>
      {/* The drawer's foot: the name beside the avatar, as ChatGPT's reads —
          alone, the avatar looked dropped at the end of the list. The email
          is in the menu it opens. */}
      {compact && (
        <span className="min-w-0 flex-1 truncate text-[14px] leading-[21px] text-fg-2">
          {user?.name ?? t.shell.account.label}
        </span>
      )}
      {!compact && (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white">
              {user?.name ?? t.shell.account.label}
            </span>
            <span className="block truncate text-[11px] text-white/45">
              {user?.email ??
                fill(t.shell.credits.count, {
                  credits: formatCredits(user?.balanceCredits ?? creditsFromMillicredits(user?.balanceTokens ?? 0)),
                })}
            </span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-white/40" />
        </>
      )}
    </button>
  );

  // A sheet on a phone; on a desktop a popover that rises out of the button
  // (it sits at the bottom of the drawer), as wide as the button it grew from.
  return (
    <div className={floating ? "relative" : "relative p-2"}>
      {sharing && (
        <Suspense fallback={null}>
          <ShareMythexDialog onClose={() => setSharing(false)} />
        </Suspense>
      )}
      {phone ? (
        <>
          {trigger(() => setOpen((o) => !o))}
          <MenuSheet open={open} onClose={() => setOpen(false)} label={t.shell.account.label} surface={CARD_BG}>
            <InSheet.Provider value={true}>{menuBody}</InSheet.Provider>
          </MenuSheet>
        </>
      ) : (
        <Popover
          open={open}
          onOpenChange={(next) => {
            // Each opening starts on you, not wherever it was left.
            if (next) setStep(0);
            setOpen(next);
          }}
          trigger={trigger()}
          side="top"
          align={compact ? "start" : "center"}
          label={t.shell.account.label}
          className={`overflow-hidden rounded-[14px] ${inPlace ? "w-[17.5rem]" : compact ? "w-64" : "w-[var(--anchor-width)]"}`}
          style={{ background: CARD_BG, boxShadow: floatingRing(CARD_BG) }}
        >
          {inPlace && workspaceMenu ? (
            <PanelSteps
              index={step}
              label="account-steps"
              steps={[
                <div key="account" className="p-1.5">
                  {menuBody}
                </div>,
                <div key="workspace" className="p-1.5">
                  <button
                    type="button"
                    data-testid="workspace-back"
                    onClick={() => setStep(0)}
                    className="flex h-9 w-full items-center gap-1.5 rounded-[8px] px-1.5 text-start text-[14px] font-[480] text-fg transition hover:bg-white/[0.04]"
                  >
                    <ChevronLeft className="size-4 shrink-0 rtl:-scale-x-100" style={{ color: FG_TERTIARY }} />
                    {t.shell.account.workspaces}
                  </button>
                  {RULE}
                  {workspaceMenu(() => setOpen(false))}
                </div>,
              ]}
            />
          ) : (
            <div className="p-1.5">{menuBody}</div>
          )}
        </Popover>
      )}
    </div>
  );
}

/** The hairline between groups — the workspace menu's. */
const RULE = <div className="mx-1 my-1 h-px" style={{ background: "oklch(0.55 0.002 107 / 0.4)" }} />;

/** In the phone's sheet the rows are the sheets' 44px and 15px, not the
 *  desktop menu's 36px and 14px — the same as the workspace sheet's. */
const InSheet = createContext(false);

function MenuItem({
  icon: Icon,
  onClick,
  children,
  danger,
  testId,
}: {
  icon: typeof Settings;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
  testId?: string;
}) {
  const big = useContext(InSheet);
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`flex w-full items-center gap-2.5 rounded-[8px] px-2.5 text-start transition hover:bg-white/[0.04] ${
        big ? "h-11 text-[15px]" : "h-9 text-[14px]"
      } ${danger ? "text-red-400 hover:text-red-300" : "text-fg-2 hover:text-fg"}`}
    >
      <Icon className="size-4 shrink-0" style={danger ? undefined : { color: FG_TERTIARY }} />
      {children}
    </button>
  );
}

export function PendingBadge({ count, label }: { count: number; label: string }) {
  return <CountBadge count={count} label={label} testId="ws-pending-badge" />;
}
