import type { SolutionKey } from "../../../i18n/solutions";

/** Where each Solutions page lives — /for-work as Lovable's, the rest under /solutions. */
export const SOLUTION_PATHS: Record<SolutionKey, string> = {
  forWork: "/for-work",
  founders: "/solutions/founders",
  productManagers: "/solutions/product-managers",
  designers: "/solutions/designers",
  marketers: "/solutions/marketers",
  sales: "/solutions/sales",
  ops: "/solutions/ops",
  people: "/solutions/people",
  websites: "/solutions/websites",
  prototyping: "/solutions/prototyping",
  internalTools: "/solutions/internal-tools",
};

/** The Solutions menu's two columns. */
export const WHO_FOR: SolutionKey[] = ["forWork", "founders", "productManagers", "designers", "marketers", "sales", "ops", "people"];
export const USE_CASES: SolutionKey[] = ["websites", "prototyping", "internalTools"];

export const PARTNERS_PATH = "/partners";
export const STUDENTS_PATH = "/students";

/** The page a path is, if it's one of these. */
export function solutionForPath(path: string): SolutionKey | null {
  const hit = (Object.entries(SOLUTION_PATHS) as [SolutionKey, string][]).find(([, p]) => p === path);
  return hit ? hit[0] : null;
}

/** Every path, for the router, the sitemap and the edge's list of site pages. */
// STUDENTS_PATH left out: Students is off for now (2026-10-15); uncomment to bring it back.
export const ALL_SOLUTION_PATHS = [...Object.values(SOLUTION_PATHS), PARTNERS_PATH];
