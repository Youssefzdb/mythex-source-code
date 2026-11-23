import { useEffect, useMemo, useState, type ReactNode } from "react";
import { isPaidPlan } from "../lib/plan-tiers";
import { Link } from "react-router-dom";
import { ArrowUpRight, ChevronRight, Search } from "lucide-react";
import { api } from "../lib/api";
import { USAGE_CATEGORIES, type BillingUsageResponse, type UsageCategory, type UsageProject } from "../lib/billing";
import {
  CATEGORY_COLOR,
  CategoryCards,
  CategorySplit,
  PRO_USAGE_CATEGORIES,
  withoutWorkspace,
  UsageChart,
  categoryLabel,
  categoryUnits,
} from "../components/billing/usage-parts";
import { formatCredits } from "../lib/tokens";
import { BillingShell, BILLING_CARD } from "../components/billing/BillingShell";
import { SubPageBack } from "../components/shell/PageSheet";
import {
  DescribedSelect,
  SELECT_FIELD_STYLE,
} from "../components/ui/DescribedSelect";
import { useToast } from "../components/ui";
import { SlidingPillSwitch } from "../components/PricingPlans";
import { ProjectThumb } from "../components/ProjectPreview";
import { useAuth } from "../lib/auth";
import { PageBodySkeleton } from "../components/loading";
import { appT, fill, formatNumber, pl, useT, type AppMessages } from "../i18n/app";

const DOCS = "https://docs.mythex.ai/billing/usage";
const FG = "#ffffff";
const FG_MUTED = "oklch(72.34% 0.002 107)";
const FG_DIM = "oklch(72.34% 0.002 107)";

type Kind = "all" | "build" | "run";
type Range = "30d" | "90d";

function kindOptions(t: AppMessages): Array<{ id: Kind; label: string; description: string }> {
  const u = t.billing.usage;
  return [
    { id: "all", label: u.allCredits, description: u.allCreditsHint },
    { id: "build", label: u.buildCredits, description: u.buildCreditsHint },
    { id: "run", label: u.runCredits, description: u.runCreditsHint },
  ];
}

function rangeOptions(t: AppMessages): Array<{ id: Range; label: string; description: string }> {
  const u = t.billing.usage;
  return [
    { id: "30d", label: u.last30Days, description: u.last30DaysHint },
    { id: "90d", label: u.last90Days, description: u.last90DaysHint },
  ];
}

export function BillingUsagePage() {
  const { user } = useAuth();
  const t = useT();
  const tu = t.billing.usage;
  return (
    <BillingShell>
      <div className="mx-auto w-full max-w-6xl">
        {/* Header sits outside the card — same as Lovable usage page */}
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <SubPageBack to="/billing" label={tu.backToPlans} className="-mt-0.5" />
            <div className="min-w-0">
              <h1
                className="text-xl font-semibold tracking-tight"
                style={{ color: FG }}
              >
                {tu.title}
              </h1>
              <p className="mt-0.5 text-[13px]" style={{ color: FG_MUTED }}>
                {tu.subtitle}
              </p>
            </div>
          </div>
          <a
            href={DOCS}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 pt-1.5 text-sm transition hover:opacity-80"
            style={{ color: FG }}
          >
            {t.billing.openDocs}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>

        <UsageReport endpoint="/v1/billing/usage" hideWorkspace={isPaidPlan(user?.plan)} testId="billing-usage-details" />
      </div>
    </BillingShell>
  );
}


/**
 * The usage report — total, credit type / project / date range, the category
 * cards, the chart by day, and the projects. Billing → Usage shows the
 * account's; Team → Usage a workspace's (with people under it, `footer`).
 */
export function UsageReport<T extends BillingUsageResponse = BillingUsageResponse>({
  endpoint,
  hideWorkspace,
  testId,
  people,
  compactChart = false,
}: {
  endpoint: string;
  /** Paid plans include the workspace (sandbox) time: leave that category out. */
  hideWorkspace: boolean;
  testId?: string;
  /**
   * A workspace's usage by person. Given, the list under the chart switches
   * between People (first) and Projects instead of stacking one under the other.
   */
  people?: { count: (data: T) => number; render: (data: T, query: string) => ReactNode };
  /** A shorter chart, so the list starts nearer the top. */
  compactChart?: boolean;
}) {
  const toast = useToast();
  const t = useT();
  const tu = t.billing.usage;
  const [kind, setKind] = useState<Kind>("all");
  const [range, setRange] = useState<Range>("30d");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [category, setCategory] = useState<UsageCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [list, setList] = useState<"people" | "projects">(people ? "people" : "projects");
  const [raw, setRaw] = useState<T | null>(null);
  // A paid plan includes the workspace, so its usage leaves it out entirely.
  const isPro = hideWorkspace;
  const data = useMemo(() => (raw && isPro ? withoutWorkspace(raw) : raw), [raw, isPro]);
  const categoryList = isPro ? PRO_USAGE_CATEGORIES : USAGE_CATEGORIES;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void api
      .get<T>(`${endpoint}${endpoint.includes("?") ? "&" : "?"}range=${range}&kind=${kind}`)
      .then(setRaw)
      .catch(() => {
        toast("error", appT().billing.usage.loadFailed);
        setRaw(null);
      })
      .finally(() => setLoading(false));
  }, [kind, range, toast, endpoint]);

  // The categories the credit type covers; picking one card narrows it to that.
  const shown = useMemo<UsageCategory[]>(() => {
    const byKind = categoryList.filter((c) => kind === "all" || (kind === "build") === (c === "agent" || c === "workspace"));
    return category === "all" ? byKind : byKind.filter((c) => c === category);
  }, [kind, category, categoryList]);

  const totals = useMemo(() => {
    const out = Object.fromEntries(USAGE_CATEGORIES.map((c) => [c, 0])) as Record<UsageCategory, number>;
    for (const c of data?.categories ?? []) out[c.id] = c.credits;
    return out;
  }, [data]);

  const projectTotal = (p: UsageProject) =>
    category === "all" ? p.total : p.categories[category] ?? 0;

  const projectOptions = useMemo(() => {
    const list = data?.byProject ?? [];
    return [
      { id: "all", label: t.billing.usage.allProjects, description: t.billing.usage.allProjectsHint },
      ...list.map((p) => ({
        id: p.projectId ?? p.name,
        label: p.name,
        description: fill(t.billing.creditsAmount, { credits: formatCredits(p.total) }),
      })),
    ];
  }, [data, t]);

  const projects = useMemo(() => {
    let list = data?.byProject ?? [];
    if (category !== "all") {
      list = list
        .filter((p) => (p.categories[category] ?? 0) > 0)
        .sort((a, b) => (b.categories[category] ?? 0) - (a.categories[category] ?? 0));
    }
    if (projectFilter !== "all") {
      list = list.filter((p) => (p.projectId ?? p.name) === projectFilter);
    }
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => p.name.toLowerCase().includes(q));
  }, [data, query, projectFilter, category]);

  return (
        <section
      className="rounded-[16px] border border-line px-4 py-5 sm:px-5 sm:py-6 md:px-6 md:py-7"
      style={{ background: BILLING_CARD }}
      data-testid={testId}
    >
      {loading || !data ? (
        <PageBodySkeleton rows={6} />
      ) : (
        <>
          <div>
            <p
              className="text-2xl font-semibold leading-none tracking-tight"
              style={{ color: FG }}
            >
              {fill(t.billing.creditsAmount, { credits: formatCredits(data.totalCredits) })}
            </p>
            <p className="mt-1.5 text-[13px]" style={{ color: FG_MUTED }}>
              {pl(tu.inLastDays, data.rangeDays)}
            </p>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <DescribedSelect
                ariaLabel={tu.creditType}
                value={kind}
                options={kindOptions(t)}
                onChange={setKind}
              />
              <DescribedSelect
                ariaLabel={tu.filterByProject}
                value={projectFilter}
                options={projectOptions}
                onChange={setProjectFilter}
                placeholder={tu.projects}
                emptyValue="all"
                wide
              />
            </div>
            <DescribedSelect
              ariaLabel={tu.dateRange}
              value={range}
              options={rangeOptions(t)}
              onChange={setRange}
              align="right"
            />
          </div>

          <div className="mt-5">
            <CategoryCards
              t={t}
              totals={totals}
              units={data.units}
              selected={category}
              onSelect={setCategory}
              fg={FG}
              muted={FG_MUTED}
              categories={categoryList}
            />
          </div>

          <UsageChart t={t} days={data.days} show={shown} fg={FG} muted={FG_MUTED} className={compactChart ? "mt-6 h-44 sm:h-52" : "mt-8 h-64 sm:h-72"} />

          <div className={compactChart ? "mt-8" : "mt-10"}>
            {people && (
              <SlidingPillSwitch
                aria-label={t.teams.usage.showBy}
                size="sm"
                className="mb-4"
                value={list}
                onChange={(v) => {
                  setList(v as "people" | "projects");
                  setQuery("");
                }}
                options={[
                  { value: "people", label: fill(t.teams.usage.peopleTab, { n: formatNumber(people.count(raw ?? data as T)) }) },
                  { value: "projects", label: fill(t.teams.usage.projectsTab, { n: formatNumber(data.byProject.length) }) },
                ]}
              />
            )}
            <div className="relative max-w-sm">
              <Search
                className="pointer-events-none absolute top-1/2 start-3 z-[1] h-4 w-4 -translate-y-1/2"
                style={{ color: FG_DIM }}
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={list === "people" ? t.teams.usage.searchPeople : tu.searchProjects}
                autoComplete="off"
                className="h-9 w-full rounded-[8px] pe-3 ps-9 text-sm text-white outline-none placeholder:text-muted"
                style={{ ...SELECT_FIELD_STYLE, color: FG }}
              />
            </div>

            {list === "people" && people ? (
              people.render(raw ?? (data as T), query)
            ) : (
            <>
            <div
              className="mt-6 mb-1 flex items-center justify-between text-xs"
              style={{ color: FG_MUTED }}
            >
              <span>{tu.project}</span>
              <span>{tu.usageSorted}</span>
            </div>

            <ul className="divide-y divide-white/[0.06]">
              {projects.map((p) => {
                const unitLine = category === "all" ? "" : categoryUnits(t, category, p.units);
                const row = (
                  <div className="flex items-center gap-3 py-3.5">
                    <ProjectThumb thumbnailUrl={p.projectId ? p.thumbnailUrl : null} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium" dir="auto" style={{ color: FG }}>
                        {p.name}
                      </span>
                      {category === "all" ? (
                        <span className="mt-1.5 flex items-center gap-2">
                          <CategorySplit categories={p.categories} className="w-28 sm:w-40" />
                          <span className="truncate text-[11px]" style={{ color: FG_MUTED }}>
                            {USAGE_CATEGORIES.filter((c) => p.categories[c] > 0)
                              .map((c) => categoryLabel(t, c))
                              .join(" · ")}
                          </span>
                        </span>
                      ) : (
                        unitLine && (
                          <span className="mt-0.5 flex items-center gap-1.5 truncate text-[11px]" style={{ color: FG_MUTED }}>
                            <span className="size-1.5 rounded-full" style={{ background: CATEGORY_COLOR[category] }} />
                            {unitLine}
                          </span>
                        )
                      )}
                    </span>
                    <span
                      className="flex shrink-0 items-center gap-1 text-sm"
                      style={{ color: FG_MUTED }}
                    >
                      {fill(t.billing.creditsAmount, { credits: formatCredits(projectTotal(p)) })}
                      {p.projectId && (
                        <ChevronRight className="h-4 w-4 rtl:-scale-x-100" style={{ color: FG_DIM }} />
                      )}
                    </span>
                  </div>
                );
                return (
                  <li key={p.projectId ?? p.name}>
                    {p.projectId ? (
                      <Link
                        to={`/p/${p.projectId}?settings=usage`}
                        title={tu.openProjectUsage}
                        className="-mx-2 block rounded-lg px-2 transition hover:bg-white/[0.03]"
                      >
                        {row}
                      </Link>
                    ) : (
                      row
                    )}
                  </li>
                );
              })}
              {projects.length === 0 && (
                <li className="py-8 text-center text-sm" style={{ color: FG_MUTED }}>
                  {tu.noMatches}
                </li>
              )}
            </ul>
            </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
