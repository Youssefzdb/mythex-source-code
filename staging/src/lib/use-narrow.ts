import { useEffect, useState } from "react";

/**
 * Below Tailwind's `md` (768px): the phone layout, where the sidebar is the
 * drawer. The screens built both sidebars and let CSS hide one — on a phone
 * the hidden desktop sidebar (its Recents, menus, account row) cost 113ms of
 * the home screen's startup rendering (React profiler, production build),
 * against 11ms for the drawer that is actually used. They render only the one
 * for this width now; a resize across 768px swaps them.
 */
const QUERY = "(max-width: 767px)";

export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    onChange();
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}
