import { useState, type ReactNode } from "react";
import { useNarrow } from "../../lib/use-narrow";
import { SurfaceScroll } from "../ui/Sheet";
import { useInPageSheet } from "../shell/PageSheet";
import { AppSidebar } from "../shell/AppSidebar";
import { CARD_BG, PANEL_BG, SHELL_BG } from "../../lib/surfaces";
import { MobileNavDrawer } from "../shell/MobileNavDrawer";
import { DrawerIcon } from "../ui/DrawerIcon";
import { useNativeBleedTop } from "../../lib/native-bleed-top";
import { useT } from "../../i18n/app";

/**
 * The same three surfaces the rest of the chrome uses.
 *
 * These were hand-picked hexes approximating the ladder; they are now the
 * ladder itself, so billing, domains, settings and the connectors modal all
 * sit on identical steps instead of near-misses.
 */
export const BILLING_DRAWER = SHELL_BG;
export const BILLING_CONTENT = PANEL_BG;
export const BILLING_CARD = CARD_BG;

/**
 * Shared chrome for /billing and /billing/usage — logo lives in AppSidebar;
 * usage keeps the same drawer instead of a bare full-page layout.
 */
export function BillingShell({ children }: { children: ReactNode }) {
  // In the phone's page sheet the page is only its content: the sheet is the
  // chrome, and it scrolls the page so a pull from the top can dismiss it.
  if (useInPageSheet()) {
    return <SurfaceScroll className="native-safe-bottom px-3 pt-1 pb-10">{children}</SurfaceScroll>;
  }
  return <BillingPageShell>{children}</BillingPageShell>;
}

function BillingPageShell({ children }: { children: ReactNode }) {
  const [mobileNav, setMobileNav] = useState(false);
  const narrow = useNarrow();
  const t = useT();
  useNativeBleedTop();

  return (
    <div className="flex h-dvh overflow-hidden" style={{ background: BILLING_DRAWER }}>
      {/* Clipped only while closed, and raised over the content panel — the
          workspace menu is wider than the drawer, and clipping it here cut it
          off at the drawer's edge. Same rule as the dashboard's drawer. */}
      {/* Always open on a desktop: collapsing only earns its keep beside a
          project's chat and preview (Workspace), not on a settings page. */}
      {/* Only the sidebar this width uses (useNarrow). */}
      {!narrow && (
        <div className="relative z-30 hidden w-[15.5rem] shrink-0 overflow-visible md:block">
          <div className="h-full w-[15.5rem]">
            <AppSidebar />
          </div>
        </div>
      )}

      {narrow && <MobileNavDrawer open={mobileNav} onOpenChange={setMobileNav} />}

      {/* Gutter + rounded content panel — same 16px corners as Workspace preview. */}
      <div data-drawer-page className="flex min-w-0 flex-1 flex-col overflow-hidden max-md:p-0 p-2 md:p-2.5">
        <div
          className="native-inset-top relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[12px] max-md:rounded-none md:mx-ring"
          style={{ background: BILLING_CONTENT }}
        >
          {/* The drawer control gets a row of its own, the same as the
              dashboard and the workspace.

              It used to sit absolutely in the corner with the page padded 40px
              clear of it, which indented every section on the page — profile,
              security, all of it — around an icon that belongs to none of
              them, and left the icon floating beside the cap-height of a 2xl
              heading rather than reading as a control. The row is still only
              rendered when there is something in it, so a desktop with the
              sidebar open gets no empty strip. */}
          <header className="shell-header relative z-20 flex items-center gap-2 px-3 pt-2 md:hidden">
            <button
              type="button"
              className="shell-drawer-btn rounded-lg p-1.5 text-white/50 transition hover:bg-white/8 hover:text-white md:hidden"
              onClick={() => setMobileNav(true)}
              aria-label={t.billing.shell.openMenu}
            >
              <DrawerIcon className="h-4.5 w-4.5" />
            </button>
          </header>

          <div
            id="billing-scroll"
            className="shell-scroll min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-16 md:px-5 md:pt-5"
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Billing content lives in an overflow panel, not the window. */
export function scrollBillingTo(id: string): boolean {
  // In the phone's page sheet, the card there — the page underneath may be
  // billing too, with the same ids — and the sheet's own scroller.
  const el =
    document.querySelector<HTMLElement>(`[data-testid="page-sheet"] #${id}`) ?? document.getElementById(id);
  const scroller =
    el?.closest<HTMLElement>('[data-testid="page-sheet"] .overflow-y-auto') ?? document.getElementById("billing-scroll");
  if (!scroller || !el) return false;
  // Clear of the scroller's own top padding as well — on a phone that is the
  // room kept for the floating drawer button, and the card's heading was
  // landing under it.
  const inset = parseFloat(getComputedStyle(scroller).paddingTop) || 0;
  const top =
    el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - inset - 12;
  // Layout not ready yet (target below the fold but the panel can't scroll).
  if (top > scroller.clientHeight && scroller.scrollHeight <= scroller.clientHeight + 8) {
    return false;
  }
  // Arriving from a link lands on the section, not a glide down to it.
  scroller.scrollTo({ top: Math.max(0, top), behavior: "instant" });
  return true;
}
