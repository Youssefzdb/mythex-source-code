import { useEffect, useRef, useState } from "react";
import { preloadSolution } from "./preload";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useI18n } from "../../../i18n/useI18n";
// The partner program is for creators only for now: its line in the menu says so (i18n/solutions/creators).
import { useCreators } from "../../../i18n/solutions/creators";
import { PARTNERS_PATH, SOLUTION_PATHS, USE_CASES, WHO_FOR } from "./routes";

/**
 * The header's Solutions menu, as Lovable's: "Who is it for?" on the left,
 * "Use cases" and the programs (partners, students) on the right. Opens on
 * hover or click; Escape and a click outside close it.
 */
export function SolutionsMenu({ light, className }: { light?: boolean; className: string }) {
  const { m, lp, locale } = useI18n();
  const creatorsCopy = useCreators(locale);
  const sm = m.solutionsMenu;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const hover = (next: boolean) => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    // Opening the menu: fetch the Solutions page code, which every item uses.
    if (next) preloadSolution("/for-work");
    if (next) setOpen(true);
    else closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  };

  const item = (to: string, label: string, hint: string) => (
    <Link
      key={to}
      to={lp(to)}
      onMouseEnter={() => preloadSolution(to)}
      onFocus={() => preloadSolution(to)}
      onClick={() => setOpen(false)}
      className={`block rounded-lg px-3 py-2 transition ${light ? "hover:bg-zinc-900/[0.05]" : "hover:bg-white/[0.06]"}`}
    >
      <span className={`block text-[14px] font-medium ${light ? "text-zinc-900" : "text-white"}`}>{label}</span>
      <span className={`block text-[12.5px] ${light ? "text-zinc-600" : "text-white/72"}`}>{hint}</span>
    </Link>
  );

  return (
    <div ref={ref} className="relative" onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)}>
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)} className={`${className} inline-flex items-center gap-1`}>
        {sm.label}
        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          className={`absolute start-0 top-full z-50 mt-3 grid w-[640px] grid-cols-[1.4fr_1fr] gap-2 rounded-2xl p-3 shadow-2xl ${
            light ? "bg-white ring-1 ring-zinc-200" : "bg-[#262624] ring-1 ring-white/10"
          }`}
        >
          <div>
            <p className={`px-3 pb-1 pt-1 text-[12px] ${light ? "text-zinc-600" : "text-white/68"}`}>{sm.whoFor}</p>
            <div className="grid grid-cols-2">
              {WHO_FOR.map((k) => item(SOLUTION_PATHS[k], sm.items[k].label, sm.items[k].hint))}
            </div>
          </div>
          <div className={`rounded-xl p-1 ${light ? "bg-zinc-50" : "bg-white/[0.03]"}`}>
            <p className={`px-3 pb-1 pt-1 text-[12px] ${light ? "text-zinc-600" : "text-white/68"}`}>{sm.useCases}</p>
            {USE_CASES.map((k) => item(SOLUTION_PATHS[k], sm.items[k].label, sm.items[k].hint))}
            <div className={`mx-3 my-2 border-t ${light ? "border-zinc-200" : "border-white/10"}`} />
            {item(PARTNERS_PATH, sm.partners.label, creatorsCopy.partnerUi.menuHint)}
            {/* {item(STUDENTS_PATH, sm.students.label, sm.students.hint)} — Students is off for now (2026-10-15); uncomment to bring it back. */}
          </div>
        </div>
      )}
    </div>
  );
}

/** Lovable's phone submenu slide (measured): in from the right edge and back, 300ms. */
const PANEL_MS = 300;
const PANEL_EASE = "cubic-bezier(0.33, 1, 0.68, 1)";

/**
 * The phone menu's Solutions row, as Lovable's: it opens a full-screen panel
 * that slides in from the right, with Back and ✕ in a sticky bar, "Who is it
 * for?" and "Use cases" as rows of a title and a line under it, and slides back
 * out on Back. ✕ or a link closes the whole menu.
 */
export function MobileSolutions({ light, rowClass, onNavigate }: { light?: boolean; rowClass: string; onNavigate: () => void }) {
  const { m, lp, locale } = useI18n();
  const creatorsCopy = useCreators(locale);
  const sm = m.solutionsMenu;
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const timer = useRef<number | null>(null);

  const open = () => {
    if (timer.current) window.clearTimeout(timer.current);
    preloadSolution("/for-work");
    setMounted(true);
    // Mounted off-screen first, then moved, so the slide plays.
    requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
  };
  const back = () => {
    setShown(false);
    timer.current = window.setTimeout(() => setMounted(false), PANEL_MS);
  };
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && back();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted]);

  const bg = light ? "hsl(0 0% 98%)" : "#1c1c1c";
  const muted = light ? "text-[#5f5f5d]" : "text-white/70";
  const rule = light ? "border-black/[0.08]" : "border-white/10";
  const row = (to: string, label: string, hint: string, last: boolean) => (
    <li key={to}>
      <Link
        to={lp(to)}
        onTouchStart={() => preloadSolution(to)}
        onClick={onNavigate}
        className={`flex flex-col pt-2 pb-[11px] ${last ? "" : `border-b ${rule}`}`}
      >
        <span className={`text-[18px] leading-7 font-medium ${light ? "text-zinc-900" : "text-white"}`}>{label}</span>
        <span className={`text-[14px] leading-5 ${muted}`}>{hint}</span>
      </Link>
    </li>
  );
  const group = (title: string, items: [string, string, string][]) => (
    <div>
      <p className={`py-2 text-[14px] leading-5 ${muted}`}>{title}</p>
      <ul>{items.map(([to, label, hint], i) => row(to, label, hint, i === items.length - 1))}</ul>
    </div>
  );

  return (
    <div>
      <button type="button" aria-haspopup="dialog" aria-expanded={shown} onClick={open} className={`${rowClass} w-full justify-between`}>
        {sm.label}
        <ChevronRight className="h-5 w-5 opacity-60 rtl:rotate-180" />
      </button>
      {mounted &&
        createPortal(
          <div
            role="dialog"
            aria-label={sm.label}
            className="fixed inset-0 z-[60] overflow-y-auto overscroll-none lg:hidden motion-reduce:!transition-none"
            style={{
              background: bg,
              transform: shown ? "translateX(0)" : "translateX(100%)",
              transition: `transform ${PANEL_MS}ms ${PANEL_EASE}`,
            }}
          >
            <div className="sticky top-0 z-10">
              {/* The bar fades into the list scrolling under it. */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[88px]" style={{ background: `linear-gradient(to bottom, ${bg} 64px, transparent)` }} />
              <div className={`relative flex h-16 items-center justify-between px-4 ${light ? "text-zinc-900" : "text-white"}`}>
                <button type="button" onClick={back} className="-ms-2 flex items-center gap-x-1 p-2 text-[16px]">
                  <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
                  {sm.back}
                </button>
                <button type="button" onClick={onNavigate} aria-label={sm.closeMenu} className="-me-2 p-2">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="px-4 pt-1 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              {group(sm.whoFor, WHO_FOR.map((k) => [SOLUTION_PATHS[k], sm.items[k].label, sm.items[k].hint]))}
              <hr className={`my-4 ${light ? "border-black/[0.15]" : "border-white/15"}`} />
              {group(sm.useCases, USE_CASES.map((k) => [SOLUTION_PATHS[k], sm.items[k].label, sm.items[k].hint]))}
              <hr className={`my-4 ${light ? "border-black/[0.15]" : "border-white/15"}`} />
              <ul>
                {row(PARTNERS_PATH, sm.partners.label, creatorsCopy.partnerUi.menuHint, true)}
                {/* {row(STUDENTS_PATH, sm.students.label, sm.students.hint, true)} — Students is off for now (2026-10-15); uncomment to bring it back. */}
              </ul>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
