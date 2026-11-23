import { createContext, useContext, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import {
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
  type Location,
} from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { canBuyPlans } from "../../lib/native";
import { CONTROL_BG, PANEL_BG } from "../../lib/surfaces";
import { ModalSurface, useIsPhone } from "../ui/Sheet";
import { useT } from "../../i18n/app";

/**
 * The account's own pages — projects, settings, domains, billing — as a bottom
 * sheet on a phone, over whatever was on screen, the way the native apps
 * present them, rather than a whole new screen you have to find your way back
 * out of.
 *
 * It is still a route: the URL moves to the page, so back closes it, a reload
 * lands on it and a link to it works. What makes it a sheet is the page it was
 * opened from, carried in the history entry's state — the routes render that
 * page underneath, and this renders the new one in a sheet on top (React
 * Router's "modal route"). On a desktop there is no sheet: the same address is
 * the page.
 */

type SheetState = { sheetBackground?: Location };

/** The pages that open in the sheet. Billing only where this build sells. */
export function isSheetPath(pathname: string): boolean {
  if (pathname === "/dashboard/projects") return true;
  if (pathname === "/settings" || pathname === "/settings/domains" || pathname === "/settings/memory" || pathname === "/settings/team" || pathname === "/settings/referrals" || pathname === "/settings/partner") return true;
  if (canBuyPlans() && (pathname === "/billing" || pathname === "/billing/usage")) return true;
  // The legal pages a sign-in screen links to: a sheet over it on a phone,
  // with a way to close, not the website's page with its header and no way back.
  if (pathname === "/terms" || pathname === "/privacy" || pathname === "/acceptable-use") return true;
  return false;
}

type SheetNav = { back: (to?: string) => void };
/** Set inside the sheet: the page drops its chrome (drawer, header, gutter),
 *  and going back is a step back through the sheet's pages. */
const InPageSheet = createContext<SheetNav | null>(null);
export const useInPageSheet = () => useContext(InPageSheet) !== null;

/**
 * A sub-page's way back: a round button beside its title, as a pushed screen
 * has in a sheet on iOS and Android. In the sheet it steps back to the page
 * it came from (or up to `to`); anywhere else it goes to `to`.
 */
export function SubPageBack({ to, label, className = "" }: { to: string; label: string; className?: string }) {
  const sheet = useContext(InPageSheet);
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => (sheet ? sheet.back(to) : navigate(to))}
      aria-label={label}
      data-testid="subpage-back"
      className={`grid size-8 shrink-0 place-items-center rounded-full text-fg-2 transition hover:text-fg hover:brightness-125 active:opacity-80 ${className}`}
      style={{ background: CONTROL_BG }}
    >
      <ChevronLeft className="size-[18px] rtl:-scale-x-100" />
    </button>
  );
}

/**
 * Opens a path in the sheet on a phone; anywhere else, or for a path that is
 * not one of the sheet's pages, it is a plain navigation. From inside the sheet
 * it keeps the page underneath, so a second page replaces the first in the
 * sheet rather than stacking a sheet on a sheet.
 */
export function useOpenInSheet(): (to: string) => void {
  const navigate = useNavigate();
  const location = useLocation();
  const phone = useIsPhone();
  return (to: string) => {
    const pathname = to.split(/[?#]/)[0];
    if (!phone || !isSheetPath(pathname)) {
      navigate(to);
      return;
    }
    const background = (location.state as SheetState | null)?.sheetBackground ?? location;
    navigate(to, { state: { sheetBackground: background } satisfies SheetState });
  };
}

/**
 * Which page is underneath, if a sheet is up. Links inside the sheet's pages
 * (Billing's "More usage details", Settings' "Manage") navigate without the
 * state, so while the sheet is up the page underneath is remembered here and
 * a move to another of its pages stays in the sheet. A move anywhere else —
 * opening a project — is a real page, and the sheet goes.
 */
export function usePageSheet() {
  const location = useLocation();
  const navigate = useNavigate();
  const navType = useNavigationType();
  const phone = useIsPhone();
  const lastBackground = useRef<Location | null>(null);
  /** History entries the sheet has pushed, so closing it can go back past all of them. */
  const depth = useRef(0);
  /** The sheet's pages, oldest first, as a navigation stack would hold them. */
  const stack = useRef<string[]>([]);
  const lastKey = useRef(location.key);
  /** The page on screen before this navigation. */
  const previous = useRef<Location | null>(null);

  const stateBackground = (location.state as SheetState | null)?.sheetBackground ?? null;
  // Any other link to one of these pages — "Settings → Memory" in a project's
  // knowledge, "See plans" when the credits run out, the home page's "all
  // projects" — opens it in the sheet too, over the page it was followed
  // from. Not from one of these pages shown whole (a reload onto /settings):
  // that stays a page, as it was.
  const followed =
    navType === "PUSH" &&
    previous.current &&
    previous.current.key !== location.key &&
    !isSheetPath(previous.current.pathname)
      ? previous.current
      : null;
  const background =
    phone && isSheetPath(location.pathname)
      ? (stateBackground ?? lastBackground.current ?? followed)
      : null;
  useEffect(() => {
    previous.current = location;
  }, [location]);

  useEffect(() => {
    if (lastKey.current === location.key) return;
    lastKey.current = location.key;
    if (!background) {
      lastBackground.current = null;
      depth.current = 0;
      stack.current = [];
      return;
    }
    const path = location.pathname;
    const s = stack.current;
    // The first move into the sheet counts too: the render has already
    // recorded the page underneath by the time this runs.
    if (navType === "PUSH") {
      depth.current += 1;
      if (s[s.length - 1] !== path) s.push(path);
    } else if (navType === "POP") {
      depth.current = Math.max(0, depth.current - 1);
      if (s[s.length - 2] === path) s.pop();
      else stack.current = [path];
    } else {
      s[s.length - 1] = path;
    }
    lastBackground.current = background;
  }, [location.key, background, navType, location.pathname]);
  if (background && stack.current.length === 0) stack.current = [location.pathname];
  // Opened by a reload or a link straight to it: there is a page underneath
  // (from the entry's state) but no history of ours to go back through.
  if (background && !lastBackground.current) lastBackground.current = background;

  /** What the sheet shows — kept after it closes, so it can slide away with its page in it. */
  const shown = useRef<Location | null>(null);
  if (background) shown.current = location;

  const close = () => {
    const bg = lastBackground.current;
    if (depth.current > 0) navigate(-depth.current);
    else if (bg) navigate(`${bg.pathname}${bg.search}${bg.hash}`, { replace: true, state: bg.state });
  };

  /** Back a step: through history when the page before is the one wanted,
   *  otherwise up to `to` in place of this one. */
  const back = (to?: string) => {
    const s = stack.current;
    const prev = s[s.length - 2];
    if (prev && (!to || prev === to)) navigate(-1);
    else if (to) navigate(to, { replace: true, state: { sheetBackground: lastBackground.current } });
  };

  return { background, shown: shown.current, close, back };
}

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * The sheet itself. `children` is the routes it can show; they render at the
 * sheet's location, so the page inside reads its own path and query.
 */
export function PageSheetHost({
  sheet,
  children,
}: {
  sheet: ReturnType<typeof usePageSheet>;
  children: ReactNode;
}) {
  const t = useT();
  const phone = useIsPhone();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const path = sheet.shown?.pathname ?? null;
  const open = !!sheet.background;
  const last = useRef({ path, open });

  // A move between the sheet's pages, animated the way a navigation stack is:
  // deeper (Plans & credits → Usage details, Settings → Memory) comes in from
  // the right, back up from the left, and across (Settings → Plans) fades in.
  // Only while it stays up — the sheet opening or closing is its own motion.
  useLayoutEffect(() => {
    const from = last.current;
    last.current = { path, open };
    if (!open || !from.open || !path || !from.path || from.path === path) return;
    const el = bodyRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const step = segments(path) - segments(from.path);
    // "From the right" is from the end: mirrored when the page reads right to left.
    const dir = document.documentElement.dir === "rtl" ? -1 : 1;
    const x = (step > 0 ? 48 : step < 0 ? -48 : 0) * dir;
    el.animate(
      [
        { transform: `translateX(${x}px)`, opacity: 0 },
        { transform: "translateX(0)", opacity: 1 },
      ],
      { duration: 280, easing: EASE },
    );
  }, [path, open]);


  if (!phone || !sheet.shown) return null;
  return (
    <ModalSurface
      open={!!sheet.background}
      onClose={sheet.close}
      label={t.shell.pageSheet.label}
      sheet
      sheetHeight="92dvh"
      sheetFixedHeight
      testId="page-sheet"
      style={{ background: PANEL_BG }}
    >
      <InPageSheet.Provider value={{ back: sheet.back }}>
        {/* The page's own scroller sits in here, so it keeps the sheet's
            height to fill. */}
        <div
          ref={bodyRef}
          className="flex min-h-0 flex-1 flex-col"
        >
          <Routes location={sheet.shown}>{children}</Routes>
        </div>
      </InPageSheet.Provider>
    </ModalSurface>
  );
}

/** How deep a page is: /billing is 1, /billing/usage is 2. */
function segments(pathname: string): number {
  return pathname.split("/").filter(Boolean).length;
}
