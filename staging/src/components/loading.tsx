import { Skeleton } from "./ui";
import { ChevronRight } from "lucide-react";
import { DrawerIcon } from "./ui/DrawerIcon";
import { lastKnownHasApp, readWorkspaceLayout } from "../lib/workspace-layout";
import { MythexMark } from "./mythex-mark";
import { BillingShell, scrollBillingTo } from "./billing/BillingShell";
import { useLayoutEffect } from "react";
import { useNativeBleedTop } from "../lib/native-bleed-top";
import { useLocation } from "react-router-dom";
import { PulseBackground } from "./PulseBackground";
import { CARD_BG, SHELL_BG } from "../lib/surfaces";
import { useAuth } from "../lib/auth";
import { isPaidPlan } from "../lib/plan-tiers";
import { BillingPlanCards } from "./billing/BillingPlanCards";

const PANEL = SHELL_BG;
/** Mirrors PAGE_BG in pages/auth/AuthLayout — imported from there would drag
    the whole auth chunk into every route that shows a skeleton. */
const AUTH_PAGE_BG = "#1f1f1e";
const AUTH_VISUAL_BG = "#1a1a19";
const DRAWER = SHELL_BG;

/**
 * The dashboard, before it has loaded.
 *
 * Drawn from the page it precedes rather than from a generic idea of one: the
 * same rounded panel inside the same gutter, the same pulse behind it, the
 * hero centred on the same line, and the projects card docked at the bottom
 * where it actually sits. The earlier version was a flat grey page with a grid
 * of cards floating in the middle — nothing in it survived the swap, which
 * makes it a different wrong layout rather than a placeholder.
 */
export function DashboardShellSkeleton() {
  // Home takes the status bar inset on itself (native-inset-top), as the real
  // home does with this hook. Without it <body> kept its inset too and the
  // skeleton sat a status bar lower than home (measured in the simulator:
  // ~60px), then jumped up when home arrived.
  useNativeBleedTop();
  return (
    <div data-boot-skeleton className="flex h-full min-h-dvh bg-bg text-fg">
      {/* The sidebar as it is now (AppSidebar): the mark and the collapse
          button, five links, Recents and its chats, and the account row at the
          foot. It used to draw a workspace switcher, three labelled groups and
          two cards at the bottom — none of which the sidebar still has, so all
          of it moved on the swap. */}
      <aside
        className="hidden w-[15.5rem] shrink-0 flex-col px-2 pt-3 pb-2 md:flex"
        style={{ background: DRAWER }}
        aria-hidden
      >
        <div className="mb-3 flex items-center gap-2 px-1">
          <MythexMark size={22} />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="ms-auto h-5 w-5 rounded-md" />
        </div>
        <div className="space-y-0.5">
          {[24, 20, 24, 18, 26].map((w, i) => (
            <div key={i} className="flex h-8 items-center gap-2.5 px-2">
              <Skeleton className="h-4 w-4 shrink-0 rounded" />
              <Skeleton className="h-3.5 rounded-md" style={{ width: `${w * 4}px` }} />
            </div>
          ))}
        </div>
        <div className="mt-5 flex h-8 items-center px-2">
          <Skeleton className="h-3 w-14 rounded-md" />
        </div>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-hidden">
          {[80, 64, 72, 56, 76, 60, 70, 52, 66, 74].map((pct, i) => (
            <div key={i} className="flex h-8 items-center px-2">
              <Skeleton className="h-3.5 rounded-md" style={{ width: `${pct}%` }} />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2.5 px-3 pt-2 pb-1">
          <Skeleton className="size-6 shrink-0 rounded-full" />
          <Skeleton className="h-3.5 w-24 rounded-md" />
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden p-2 max-md:p-0 md:p-2.5">
        <div
          className="native-inset-top relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] md:mx-ring max-md:rounded-none"
          style={{ background: PANEL }}
        >
          {/* The real background, not a grey stand-in: it is the loudest thing
              on the page, and a skeleton without it flashes the whole mesh in
              at the moment of the swap. */}
          <PulseBackground position="absolute" parallax={0} className="z-0 pulse-kb-steady" />

          {/* The real scroller's classes and the real button's size, so the
              placeholder sits exactly where the screen puts the button: in a
              panel that kept the status-bar padding it showed a status bar's
              height lower, and jumped up when the screen arrived. */}
          <header className="shell-header relative z-10 flex items-center gap-2 px-3 py-2 md:px-4">
            {/* The drawer button itself, as on the chat's skeleton: it is the
                same on every account, so only what depends on data waits. */}
            <span className="shell-drawer-btn rounded-lg p-1.5 text-white/50 md:hidden" aria-hidden>
              <DrawerIcon className="h-4.5 w-4.5" />
            </span>
          </header>

          <div className="shell-scroll relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-[calc(var(--app-content-h)-8rem)] flex-col items-center justify-center px-5 py-16">
              {/* Connectors pill, heading, composer — the hero's three rows. */}
              <Skeleton className="mb-6 h-9 w-52 rounded-full" />
              <Skeleton className="h-9 w-72 max-w-full rounded-lg sm:h-12 sm:w-[26rem]" />
              <div className="mt-8 w-full max-w-[40rem]">
                {/* The composer's own surface, not a translucent white card:
                    it sits on the brightest part of the mesh, where anything
                    see-through reads as a pale box beside the solid dark one
                    that replaces it. */}
                <div className="prompt-bar prompt-bar--hero">
                  <Skeleton className="mb-auto h-4 w-56 max-w-[70%]" />
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-6 w-6 rounded-md" />
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-5 w-14 rounded-md" />
                      <Skeleton className="h-5 w-5 rounded-md" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* The projects card is docked at the bottom and only its top edge
                is on screen at first — which is exactly what this shows. */}
            <div className="w-full px-4 sm:px-6 lg:px-8 max-md:hidden">
              <div className="rounded-t-[28px] p-4 sm:p-5" style={{ background: PANEL }}>
                <div className="mb-4 flex items-center gap-3">
                  <Skeleton className="h-9 w-full max-w-xs rounded-[10px]" />
                  <Skeleton className="ms-auto h-4 w-20" />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-[4/3] w-full rounded-xl" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Workspace layout while project + sandbox client boot. */
/**
 * The workspace, before it has loaded.
 *
 * Shaped from the layout that project was actually left in, not from a fixed
 * guess: the chat column has a remembered width and the preview may be shut,
 * so a skeleton that always drew a 380px column beside a preview panel
 * rearranged itself the moment the real thing mounted. The point of a skeleton
 * is that nothing moves when it is replaced.
 */
export function WorkspaceShellSkeleton() {
  // The workspace's own top: the header takes the status bar inset itself
  // (.ws-header), so <body> must not carry it as well — the same as the screen
  // this stands in for.
  useNativeBleedTop();
  // The route is /p/:id, and this renders before the router hands anyone
  // params — reading the path directly is the only way to know which project's
  // layout to copy.
  const projectId = typeof window === "undefined" ? "" : window.location.pathname.split("/p/")[1]?.split(/[/?#]/)[0] ?? "";
  const total = typeof window === "undefined" ? 1440 : window.innerWidth;
  const layout = projectId
    ? readWorkspaceLayout(projectId, { minChat: 300, maxChat: Math.max(300, total - 520) })
    : {};
  // Unknown projects get the same default the workspace itself starts from —
  // and that default is shut. This skeleton is the first thing painted, so a
  // pane drawn here on a guess is a pane the workspace has to take away a
  // moment later once it learns the project has no app. Only a remembered
  // choice opens it.
  const chatWidth = layout.chatWidth ?? 400;
  /**
   * The split only exists from `md` up.
   *
   * `previewOpen` and `chatWidth` are remembered per project from a desktop
   * session, and the width was applied as an inline style — which no media
   * query can reach. On a phone that pinned the chat column to the 300px it
   * had been dragged to on a laptop, so the transcript and the composer sat
   * in a narrow strip down the left with the rest of the screen empty, and
   * then snapped to full width when the real workspace painted. A phone has
   * no preview pane to make room for; the chat is the whole screen.
   */
  const previewOpen = layout.previewOpen ?? (projectId ? lastKnownHasApp(projectId) : null) ?? false;
  const split = total >= 768 && previewOpen;

  return (
    <div
      data-boot-skeleton
      className="ws-root native-inset-top relative flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      style={{ background: PANEL }}
    >
      {/* The header is not the same on both: a phone carries the drawer and an
          overflow button and nothing else, while the desktop also has the
          mark, the project name, its two actions and Publish. Drawing the
          desktop row on a phone put a title and four controls where there is
          only ever two. */}
      {/* .ws-header: on a phone it floats below the clock with the same
          padding as the real one, and its controls are the real 44px. */}
      <header className="ws-header z-30 flex h-12 shrink-0 items-center gap-2 px-3 max-md:h-auto max-md:px-2.5">
        <Skeleton className="hidden h-8 w-8 rounded-full md:block" />
        {/* On a phone the two round buttons are the same for every project,
            so they are drawn as themselves (inert until the screen is up):
            only the project's name is unknown, and only it waits. */}
        <span className="ws-glass-btn text-white/50 md:hidden" aria-hidden>
          <DrawerIcon className="h-4 w-4" />
        </span>
        {/* A phone centres the project's name between its two buttons. */}
        <Skeleton className="mx-auto h-11 w-36 rounded-full md:hidden" />
        <Skeleton className="hidden h-5 w-5 rounded-md md:block" />
        <Skeleton className="hidden h-4 w-28 md:block" />
        <Skeleton className="hidden h-5 w-5 rounded-md md:block" />
        <Skeleton className="hidden h-5 w-5 rounded-md md:block" />
        <div className="flex items-center gap-2 md:ms-auto">
          {/* The › to the preview: there whenever the real header has it
              (anything but a project known to have no app). */}
          {projectId && lastKnownHasApp(projectId) === false ? (
            <span className="size-11 md:hidden" aria-hidden />
          ) : (
            <span className="ws-glass-btn md:hidden" aria-hidden>
              <ChevronRight className="rtl:-scale-x-100" />
            </span>
          )}
          <Skeleton className="hidden h-7 w-7 rounded-md md:block" />
          <Skeleton className="hidden h-7 w-7 rounded-md md:block" />
          {/* Publish is a filled pill, so it reads as solid rather than as a
              bar the width of a word. */}
          <Skeleton className="hidden h-7 w-24 rounded-full md:block" />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div
          className={`flex w-full min-w-0 flex-col ${previewOpen ? "md:shrink-0" : "md:flex-1"}`}
          style={split ? { width: chatWidth } : undefined}
        >
          {/* The same reading column the chat itself uses. Without the cap
              these bars ran the full width of the window whenever the preview
              was shut, then snapped into a narrower column once the real chat
              painted — the skeleton has to be the shape of what follows it, or
              it is just a different wrong layout. */}
          {/* Nothing in this transcript is right-aligned. A user turn is a
              full-width pill and an assistant turn is plain text on the same
              margin — the old `ml-auto` bar was a chat layout this app has
              never had. */}
          {/* On a phone the header floats, so the first turn starts below it
              and the clock, where the transcript's does. */}
          <div className="mx-auto w-full max-w-2xl flex-1 space-y-4 overflow-hidden p-4 max-md:pt-[calc(var(--bar-top)+3.25rem)]">
            <TranscriptSkeleton />
          </div>
          {/* Composer — the prompt bar itself (its classes), 94px tall, 16px
              from the sides and clear of the home indicator
              (native-safe-bottom) as the real one is. */}
          <div className="native-safe-bottom mx-auto w-full max-w-2xl shrink-0 px-4 pt-1 pb-3">
            {/* One control on the left, the mode and the mic on the right —
                the same three the composer actually has. */}
            <div className="prompt-bar prompt-bar--hero prompt-bar--chat h-[94px] w-full max-w-none">
              <Skeleton className="mb-auto h-4 w-44 max-w-[70%]" />
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-6 w-6 rounded-md" />
                <div className="flex items-center gap-3">
                  <Skeleton className="h-5 w-14 rounded-md" />
                  <Skeleton className="h-5 w-5 rounded-md" />
                </div>
              </div>
            </div>
          </div>
        </div>
        {previewOpen && (
          <div className="relative hidden min-w-0 flex-1 md:block">
            <div className="absolute inset-0 m-2 overflow-hidden rounded-[16px] bg-canvas mx-ring-inside" />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A conversation before its messages arrive: a user turn as a bubble on the
 * right, at most three quarters of the column (UserPromptCard), with the reply
 * under it. One shape for both waits — the workspace's own skeleton and the
 * chat's while it fetches the thread — so the switch from one to the other
 * moves nothing; the chat used its own four grey blocks, which read as a
 * second, different loading screen.
 */
export function TranscriptSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="ms-auto h-11 w-3/4 rounded-[24px]" />
      <div className="space-y-2.5 px-1">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3.5 w-[78%]" />
        <Skeleton className="h-3.5 w-[92%]" />
        <Skeleton className="h-3.5 w-[60%]" />
      </div>
    </div>
  );
}

/** Login / signup while session resolves (form-shaped, not a blank page). */
/**
 * The auth pages, before they have loaded.
 *
 * Drawn from AuthLayout rather than from a generic idea of a form. That page
 * is a two-column grid: a left-aligned 350px column holding a 36px mark, a
 * 3xl heading and controls 32px tall, beside a rounded visual panel from `lg`
 * up. The skeleton it replaced was a centred bordered card with a 40px-tall
 * stack in it — the wrong alignment, the wrong widths, the wrong control
 * height and a border the real page does not have, so every element moved on
 * the swap.
 *
 * The shape differs per page, so the caller says which: sign-in and sign-up
 * carry a provider button and two fields, the password pages one field, and
 * the ones that only confirm something none at all.
 */
export function AuthPageSkeleton({
  fields = 2,
  social = true,
  subtitle = false,
}: {
  fields?: number;
  social?: boolean;
  /** The pages that explain themselves under the heading; sign-in does not. */
  subtitle?: boolean;
}) {
  // The same inset rule as AuthLayout, which this stands in for.
  useNativeBleedTop();
  return (
    <div data-boot-skeleton
      className="native-inset-top flex min-h-screen flex-col text-white"
      style={{ background: AUTH_PAGE_BG }}
    >
      <div className="grid flex-1 lg:grid-cols-2">
        <div className="flex min-w-0 justify-center px-4 py-20">
          <div className="flex w-full max-w-[350px] flex-col items-start justify-center">
            {/* The mark is 36px and sits in a 36px box, 24px above the title. */}
            <div className="mb-6">
              <Skeleton className="h-9 w-9 rounded-[10px]" />
            </div>

            <div className="flex w-full flex-col gap-8">
              <div>
                {/* text-3xl: 30px tall, and the line box a little more. */}
                <Skeleton className="h-9 w-40 rounded-lg" />
                {subtitle && (
                  <div className="mt-2 space-y-1.5">
                    <Skeleton className="h-3.5 w-full rounded" />
                    <Skeleton className="h-3.5 w-2/5 rounded" />
                  </div>
                )}
              </div>

              <div className="flex w-full flex-col gap-4">
                {social && (
                  <>
                    <Skeleton className="h-8 w-full rounded-[8px]" />
                    <div className="flex items-center gap-3" aria-hidden>
                      <span className="h-px flex-1 bg-white/10" />
                      <Skeleton className="h-3 w-6 rounded" />
                      <span className="h-px flex-1 bg-white/10" />
                    </div>
                  </>
                )}
                {Array.from({ length: fields }).map((_, i) => (
                  <div key={i}>
                    <Skeleton className="mb-1 h-4 w-16 rounded" />
                    <Skeleton className="h-8 w-full rounded-[8px]" />
                  </div>
                ))}
                <Skeleton className="h-8 w-full rounded-[8px]" />
              </div>

              <Skeleton className="mx-auto h-4 w-48 rounded" />
            </div>
          </div>
        </div>

        {/* The visual panel, at its own colour so it does not flash when the
            real one arrives. Its contents are not worth faking. */}
        <div className="sticky top-0 hidden h-full min-h-dvh p-4 lg:block">
          <div
            className="h-full min-h-[calc(var(--app-content-h)-2rem)] w-full rounded-[12px]"
            style={{ background: AUTH_VISUAL_BG }}
          />
        </div>
      </div>
    </div>
  );
}

/** Generic settings / billing page body. */
export function PageBodySkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/**
 * A settings-shaped page inside the app chrome.
 *
 * Domains, account settings and the projects library all render a
 * `BillingShell` with a title, a line of explanation and a stack of cards —
 * and all three were falling back to the *dashboard* skeleton, which draws a
 * hero and a projects card they do not have. Every element moved on the swap,
 * which makes it a different wrong page rather than a placeholder.
 *
 * `wide` is the projects library, which is max-w-5xl rather than max-w-2xl.
 */
export function SettingsRouteSkeleton({
  rows = 3,
  wide = false,
}: {
  rows?: number;
  wide?: boolean;
}) {
  return (
    <BillingShell>
      <div className={`mx-auto w-full pb-8 ${wide ? "max-w-5xl" : "max-w-2xl"}`}>
        {/* text-2xl title, then the sentence under it. */}
        <Skeleton className="h-7 w-52 rounded-lg" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full rounded" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-[14px]" />
          ))}
        </div>
      </div>
    </BillingShell>
  );
}

/**
 * The projects library before it has loaded (pages/ProjectsLibrary): the
 * title with Create beside it, the search row with the grid/list switch, then
 * cards — a thumbnail over an avatar, a name and "Edited …". It used the
 * settings skeleton, a stack of wide bars, and every element moved on the swap.
 */
export function ProjectsRouteSkeleton() {
  return (
    <BillingShell>
      <div className="mx-auto w-full max-w-5xl pb-8" aria-hidden>
        <div className="flex items-center gap-3">
          <div>
            <Skeleton className="h-7 w-32 rounded-lg" />
            <Skeleton className="mt-2 h-4 w-52 rounded" />
          </div>
          <Skeleton className="ms-auto h-9 w-24 rounded-[10px]" />
        </div>
        <div className="mt-6 flex items-center gap-2">
          <Skeleton className="h-9 max-w-sm flex-1 rounded-[10px]" />
          <Skeleton className="ms-auto h-9 w-20 rounded-full" />
        </div>
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="aspect-[16/10] w-full rounded-xl" />
              <div className="mt-2.5 flex items-center gap-2.5 px-0.5">
                <Skeleton className="size-7 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/3 rounded" />
                  <Skeleton className="h-3 w-1/3 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </BillingShell>
  );
}

/**
 * Full billing chrome while the lazy chunk / auth resolves — keeps the drawer
 * visible so refresh doesn't flash a bare page skeleton.
 *
 * Once the account is known, the plans are the real cards (they are the site's
 * own prices and copy), so they don't turn from grey boxes into cards when the
 * page arrives. Before that — the first moment of a reload — they stay grey: a
 * paid account must not flash the Free sale prices.
 */
export function BillingRouteSkeleton() {
  const { user } = useAuth();
  const plan = user?.plan;
  // Headed for the plans (?highlight=plans): be there from the first paint,
  // as the page will be, rather than at the top until the page arrives.
  const toPlans = new URLSearchParams(useLocation().search).get("highlight") === "plans";
  useLayoutEffect(() => {
    if (plan && toPlans) scrollBillingTo("change-plan");
  }, [plan, toPlans]);
  return (
    <BillingShell>
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-3.5 w-64 max-w-full" />
          </div>
          <Skeleton className="h-4 w-24" />
        </div>
        {plan ? (
          <>
            <BillingPageSkeleton plans={false} packs={isPaidPlan(plan)} />
            <div id="change-plan" className="mt-12">
              <BillingPlanCards
                placeholder
                plan={plan}
                currentTier={100}
                yearly={false}
                onYearlyChange={() => {}}
                proTier={100}
                setProTier={() => {}}
                bizTier={100}
                setBizTier={() => {}}
                entTier={800}
                setEntTier={() => {}}
                busy={null}
                loading
                trialing={false}
                canceling={false}
                periodEndLabel={null}
                hasStripeSub={false}
                statusLabel=""
                onChoose={() => {}}
                onBookDemo={() => {}}
              />
            </div>
          </>
        ) : (
          <BillingPageSkeleton />
        )}
      </div>
    </BillingShell>
  );
}

/** Matches Plans & credit usage: 2 top cards, add-credits strip, 3 plan cards. */
/**
 * `plans: false` leaves out the plan cards — the billing page draws those
 * without waiting. `packs: false` leaves out the credit packs, which Free
 * doesn't have, so the plans don't move up when the page arrives.
 */
export function BillingPageSkeleton({ plans = true, packs = true }: { plans?: boolean; packs?: boolean } = {}) {
  const card = "rounded-[12px] border border-line bg-[oklch(0.272_0.002_107)] p-5";
  return (
    <div className="mt-8 space-y-3" aria-hidden>
      <div className="grid gap-3 lg:grid-cols-2">
        {/* Plan card */}
        <section className={card}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-7 w-7 rounded-full" />
              <Skeleton className="h-5 w-28" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3.5 w-14" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-3 w-36" />
          </div>
          <div className="mt-4 space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3.5 w-36" />
          </div>
          <div className="mt-5 flex gap-2">
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-9 w-36 rounded-lg" />
          </div>
        </section>

        {/* Usage card */}
        <section className={card}>
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-4 w-4 rounded" />
          </div>
          <Skeleton className="mt-4 h-28 w-full rounded-lg" />
          <Skeleton className="mt-3 h-3.5 w-40" />
          <div className="mt-4 space-y-2.5">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-[90%]" />
            <Skeleton className="h-3.5 w-[80%]" />
          </div>
          <Skeleton className="mt-5 h-9 w-40 rounded-lg" />
        </section>
      </div>

      {/* Add credits */}
      {packs && (
      <section className={`${card} flex flex-wrap items-center justify-between gap-4`}>
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3.5 w-56 max-w-full" />
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-9 w-12 rounded-lg" />
            <Skeleton className="h-9 w-12 rounded-lg" />
            <Skeleton className="h-9 w-12 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-10 w-36 rounded-lg" />
        </div>
      </section>
      )}

      {/* Change plan */}
      {plans && (
      <div className="pt-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-8 w-52 rounded-full" />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <section key={i} className={`${card} space-y-3`}>
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-[85%]" />
              <Skeleton className="mt-2 h-7 w-28" />
              <Skeleton className="mt-4 h-10 w-full rounded-lg" />
            </section>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}

/** Compact list placeholders (chat tabs, settings panels). */
export function ListRowsSkeleton({ rows = 4, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 px-2 py-1.5">
          <Skeleton className="h-3.5 flex-1 rounded-md" />
          <Skeleton className="h-3 w-10 rounded-md" />
        </div>
      ))}
    </div>
  );
}

/** Dashboard project card grid while projects fetch. */
export function ProjectGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-line bg-white/[0.03]">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="space-y-2 p-2.5">
            <Skeleton className="h-3.5 w-[75%]" />
            <Skeleton className="h-3 w-[50%]" />
          </div>
        </div>
      ))}
    </div>
  );
}
