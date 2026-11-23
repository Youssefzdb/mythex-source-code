/**
 * A project's Usage tab: what it spent and on what, the monthly limit on what
 * its published app spends, and whether its database sleeps when idle.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlanBadge, planUrl } from "../ui/PlanBadge";
import { canBuyPlans } from "../../lib/native";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowUpRight, Check } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { USAGE_CATEGORIES, type ProjectUsageResponse, type UsageCategory } from "../../lib/billing";
import { formatCredits } from "../../lib/tokens";
import { CARD_BG, FG, FG_SECONDARY, surfaceRing } from "../../lib/surfaces";
import { appT, fill, useT } from "../../i18n/app";
import { Spinner, useToast } from "../ui";
import { ListRowsSkeleton } from "../loading";
import { CategoryCards, PRO_USAGE_CATEGORIES, UsageChart, withoutWorkspace } from "./usage-parts";

const card = { background: CARD_BG, boxShadow: surfaceRing(CARD_BG) };

export function ProjectUsageSettings({ projectId, onUpgrade }: { projectId: string; onUpgrade: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const p = t.settings.project;
  const toast = useToast();
  const [data, setData] = useState<ProjectUsageResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"limit" | "remove" | "db" | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<ProjectUsageResponse>(`/v1/projects/${projectId}/usage?range=30d`);
      setData(d);
      setDraft(d.limit.credits != null ? String(d.limit.credits) : "");
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const out = Object.fromEntries(USAGE_CATEGORIES.map((c) => [c, 0])) as Record<UsageCategory, number>;
    for (const c of data?.usage.categories ?? []) if (!(data?.workspaceIncluded && c.id === "workspace")) out[c.id] = c.credits;
    return out;
  }, [data]);

  const patch = async (body: { runLimitCredits?: number | null; dbAlwaysOn?: boolean }) => {
    await api.patch(`/v1/projects/${projectId}/usage`, body);
    await load();
  };

  const saveLimit = async () => {
    const n = Number(draft.trim());
    if (!Number.isInteger(n) || n < 1) {
      toast("error", p.limitInvalid);
      return;
    }
    setBusy("limit");
    try {
      await patch({ runLimitCredits: n });
      toast("success", p.limitSaved);
    } catch {
      toast("error", appT().settings.project.saveFailed);
    } finally {
      setBusy(null);
    }
  };

  const removeLimit = async () => {
    setBusy("remove");
    try {
      await patch({ runLimitCredits: null });
      toast("success", p.limitRemoved);
    } catch {
      toast("error", appT().settings.project.saveFailed);
    } finally {
      setBusy(null);
    }
  };

  const setAlwaysOn = async (on: boolean) => {
    if (!data || data.database.alwaysOn === on) return;
    if (on && !data.database.canAlwaysOn) {
      onUpgrade();
      return;
    }
    setBusy("db");
    try {
      await patch({ dbAlwaysOn: on });
      toast("success", p.dbModeSaved);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403 && on) onUpgrade();
      else toast("error", appT().settings.project.saveFailed);
    } finally {
      setBusy(null);
    }
  };

  if (failed) return <p className="text-sm text-muted">{p.usageLoadFailed}</p>;
  if (!data) return <ListRowsSkeleton rows={4} />;

  const { limit, database, isOwner } = data;
  const usage = data.workspaceIncluded ? withoutWorkspace(data.usage) : data.usage;
  const categoryList = data.workspaceIncluded ? PRO_USAGE_CATEGORIES : USAGE_CATEGORIES;
  const pct = limit.credits ? Math.min(100, (limit.spentThisMonth / limit.credits) * 100) : 0;
  const barColor = limit.state === "reached" ? "#f87171" : limit.state === "warn" ? "#f59e0b" : "#60a5fa";
  const draftChanged = draft.trim() !== (limit.credits != null ? String(limit.credits) : "");

  return (
    <section className="space-y-4" data-testid="project-usage">
      <div className="rounded-[12px] p-4" style={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-xl font-semibold leading-none tracking-tight" style={{ color: FG }}>
              {fill(t.billing.creditsAmount, { credits: formatCredits(usage.totalCredits) })}
            </p>
            <p className="mt-1.5 text-[12px]" style={{ color: FG_SECONDARY }}>
              {p.usageLast30}
            </p>
          </div>
          <Link
            to="/billing/usage"
            className="inline-flex items-center gap-1 text-[13px] transition hover:opacity-80"
            style={{ color: FG_SECONDARY }}
          >
            {p.usageAllProjects}
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
        <div className="mt-4">
          <CategoryCards t={t} totals={totals} units={usage.units} fg={FG} muted={FG_SECONDARY} categories={categoryList} />
        </div>
        <UsageChart t={t} days={usage.days} show={categoryList} fg={FG} muted={FG_SECONDARY} className="mt-5 h-44" />
      </div>

      <div className="rounded-[12px] p-4" style={card} data-testid="project-run-limit">
        <h3 className="text-sm font-semibold text-fg">{p.limitTitle}</h3>
        <p className="mt-1.5 text-[13px] text-muted">{p.limitText}</p>

        <p className="mt-3 text-[13px]" style={{ color: FG }}>
          {limit.credits != null
            ? fill(p.limitThisMonth, { spent: formatCredits(limit.spentThisMonth), limit: formatCredits(limit.credits) })
            : fill(p.limitNoneThisMonth, { spent: formatCredits(limit.spentThisMonth) })}
        </p>
        {limit.credits != null && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
          </div>
        )}
        {(limit.state === "warn" || limit.state === "reached") && (
          <p
            className="mt-2 flex items-center gap-1.5 text-[12px]"
            style={{ color: limit.state === "reached" ? "#fca5a5" : "#fcd34d" }}
            data-testid="project-run-limit-state"
          >
            <AlertTriangle className="size-3.5 shrink-0" />
            {limit.state === "reached" ? p.limitReached : p.limitWarn}
          </p>
        )}

        {isOwner ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void saveLimit();
                }
              }}
              inputMode="numeric"
              placeholder={p.limitPlaceholder}
              aria-label={p.limitPlaceholder}
              className="input w-40 !py-2 text-sm"
              data-testid="project-run-limit-input"
            />
            <button
              type="button"
              disabled={busy !== null || !draft.trim() || !draftChanged}
              onClick={() => void saveLimit()}
              className="btn-primary shrink-0 !px-4 !py-2 text-sm"
            >
              {busy === "limit" ? <Spinner size={16} /> : p.limitSet}
            </button>
            {limit.credits != null && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void removeLimit()}
                className="shrink-0 px-2 text-[13px] text-muted underline-offset-2 transition hover:text-fg hover:underline"
              >
                {busy === "remove" ? <Spinner size={14} /> : p.limitRemove}
              </button>
            )}
          </div>
        ) : (
          <p className="mt-3 text-[12px] text-muted">{p.ownerOnly}</p>
        )}
      </div>

      {database.hasDatabase && (
        <div className="rounded-[12px] p-4" style={card} data-testid="project-db-mode">
          <h3 className="text-sm font-semibold text-fg">{p.dbModeTitle}</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              { on: false, title: p.dbSleepTitle, text: p.dbSleepText },
              {
                on: true,
                title: p.dbAlwaysOnTitle,
                text: fill(p.dbAlwaysOnText, { credits: formatCredits(database.alwaysOnMonthlyCredits) }),
              },
            ].map((o) => {
              const active = database.alwaysOn === o.on;
              const locked = o.on && !database.canAlwaysOn;
              return (
                <button
                  key={String(o.on)}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={!isOwner || busy !== null}
                  // Locked (Free): the option opens the plans instead, as its badge says.
                  onClick={() => (locked ? canBuyPlans() && navigate(planUrl("Pro")) : void setAlwaysOn(o.on))}
                  data-testid={o.on ? "db-mode-always-on" : "db-mode-sleep"}
                  className={`rounded-[10px] px-3 py-2.5 text-start transition disabled:cursor-default ${
                    active ? "bg-white/[0.08] ring-1 ring-white/25" : "bg-white/[0.03] hover:bg-white/[0.06]"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2 text-[13px] font-medium" style={{ color: FG }}>
                    {o.title}
                    {busy === "db" && !active ? (
                      <Spinner size={12} />
                    ) : active ? (
                      <Check className="size-3.5 shrink-0" />
                    ) : locked ? (
                      <PlanBadge plan="Pro" link={false} />
                    ) : null}
                  </span>
                  <span className="mt-1 block text-[12px] leading-snug" style={{ color: FG_SECONDARY }}>
                    {o.text}
                  </span>
                </button>
              );
            })}
          </div>
          {!database.canAlwaysOn && <p className="mt-2 text-[12px] text-muted">{p.dbAlwaysOnPro}</p>}
          {!isOwner && <p className="mt-2 text-[12px] text-muted">{p.ownerOnly}</p>}
        </div>
      )}
    </section>
  );
}
