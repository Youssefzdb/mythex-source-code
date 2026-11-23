import { Children, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Boxes,
  ChevronDown,
  Coins,
  CreditCard,
  Flag,
  Gauge,
  Handshake,
  Inbox,
  LayoutDashboard,
  Mail,
  Rocket,
  Smartphone,
  ScrollText,
  Users as UsersIcon,
  Wrench,
  ExternalLink,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, apiDownload } from "../../lib/api";
import { formatCredits, formatMillicredits, formatTokens } from "../../lib/tokens";
import { MythexMark } from "../../components/mythex-mark";
import { ConfirmDialog, Skeleton, Spinner, useToast } from "../../components/ui";
import { AdminPartnerDetail, AdminPartners } from "./AdminPartners";
// import { AdminStudents } from "./AdminStudents"; — Students is off for now (2026-10-15); uncomment to bring it back.

export const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
export const dt = (v: string | number | null) =>
  v ? new Date(typeof v === "number" ? v * 1000 : v).toLocaleString() : "—";

/** Same canvas as AppSidebar / dashboard. */
const DRAWER = "#1c1c1c";
export const CARD = "#272725";
const NAV_MUTED = "oklch(72.34% 0.002 107)";

export function useAdminData<T>(path: string | null): { data: T | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setLoading(true);
    void api
      .get<T>(path)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [path, nonce]);
  return { data, loading, reload: () => setNonce((n) => n + 1) };
}

function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

const NAV = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/credits", label: "Credits", icon: Coins },
  { to: "/admin/users", label: "Users", icon: UsersIcon },
  { to: "/admin/workspaces", label: "Workspaces", icon: Boxes },
  { to: "/admin/subscribers", label: "Subscribers", icon: CreditCard },
  { to: "/admin/runs", label: "Runs", icon: Activity },
  { to: "/admin/capacity", label: "Capacity", icon: Gauge },
  { to: "/admin/alerts", label: "Alerts", icon: AlertTriangle },
  { to: "/admin/deployments", label: "Deployments", icon: Rocket },
  { to: "/admin/abuse", label: "Abuse", icon: Flag },
  { to: "/admin/partners", label: "Partners", icon: Handshake },
  // { to: "/admin/students", label: "Students", icon: GraduationCap }, — Students is off for now (2026-10-15); uncomment to bring it back.
  { to: "/admin/mobile-app", label: "Mobile app", icon: Smartphone },
  { to: "/admin/emails", label: "Emails", icon: Mail },
  { to: "/admin/audit", label: "Audit log", icon: ScrollText },
];

const CHART_COLORS = ["#fb7185", "#fdba74", "#e11d48", "#22c55e", "#a1a1aa", "#f87171"];

export function AdminApp() {
  return (
    <div className="flex h-full text-white" style={{ background: DRAWER }}>
      <aside
        className="relative z-30 hidden w-[15.5rem] shrink-0 flex-col overflow-visible sm:flex"
        style={{ background: DRAWER }}
      >
        <div className="flex items-center gap-2 px-3 pt-3 pb-3">
          <Link to="/" className="flex min-w-0 items-center gap-2 transition-opacity hover:opacity-80">
            <MythexMark size={22} className="shrink-0" />
            <span className="truncate text-[15px] font-semibold tracking-tight text-white">Mythex</span>
          </Link>
        </div>
        <p className="mb-2 px-5 text-[11px] font-medium" style={{ color: NAV_MUTED }}>
          Admin console
        </p>
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-sm text-white transition ${
                  isActive ? "bg-white/[0.1] font-medium" : "hover:bg-white/[0.06]"
                }`
              }
            >
              <n.icon className="h-4 w-4 shrink-0 text-white/70" />
              <span className="truncate">{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <Link
          to="/"
          className="m-2 flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-sm text-white transition hover:bg-white/[0.06]"
        >
          <ArrowLeft className="h-4 w-4 text-white/70" /> Back to app
        </Link>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto" style={{ background: DRAWER }}>
        <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
          <Routes>
            <Route index element={<Overview />} />
            <Route path="credits" element={<Credits />} />
            <Route path="users" element={<Users />} />
            <Route path="users/:id" element={<UserDetail />} />
            <Route path="workspaces" element={<Workspaces />} />
            <Route path="subscribers" element={<Subscribers />} />
            <Route path="runs" element={<Runs />} />
            <Route path="runs/:id" element={<RunInspector />} />
            <Route path="capacity" element={<Capacity />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="deployments" element={<Deployments />} />
            <Route path="abuse" element={<Abuse />} />
            <Route path="partners" element={<AdminPartners />} />
            {/* <Route path="students" element={<AdminStudents />} /> — Students is off for now (2026-10-15); uncomment to bring it back. */}
            <Route path="partners/:id" element={<AdminPartnerDetail />} />
            <Route path="mobile-app" element={<MobileApp />} />
            <Route path="emails" element={<EmailLogs />} />
            <Route path="audit" element={<Audit />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

/* ── Shared bits ─────────────────────────────────────────────────────────── */

export function PageTitle({ children, sub, action }: { children: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">{children}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  delta,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  delta?: number | null;
}) {
  return (
    <div className="rounded-[12px] border border-line p-4" style={{ background: CARD }}>
      <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight text-fg">{value}</span>
        {delta != null && (
          <span
            className={`text-xs font-medium ${
              delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-muted"
            }`}
          >
            {delta > 0 ? "+" : ""}
            {delta}%
          </span>
        )}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-auto min-w-34 cursor-pointer appearance-none rounded-[10px] border border-line py-0 pr-9 pl-3 text-sm text-white outline-none"
        style={{ background: CARD }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-white/40" />
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={active ? "btn-primary !py-1.5" : "btn-ghost !py-1.5"}>
      {children}
    </button>
  );
}

function ChartCard({ title, sub, children, className = "" }: { title: string; sub?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[12px] border border-line p-4 sm:p-5 ${className}`} style={{ background: CARD }}>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  icon: Icon = Inbox,
}: {
  title: string;
  hint?: string;
  icon?: typeof Inbox;
}) {
  return (
    <div className="grid place-items-center rounded-[12px] border border-dashed border-line px-6 py-16 text-center" style={{ background: CARD }}>
      <div className="grid h-12 w-12 place-items-center rounded-[10px] text-white/40 ring-1 ring-white/10">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm font-medium text-fg">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function Table({
  head,
  children,
  emptyTitle = "No results",
  emptyHint = "Nothing to show here yet.",
}: {
  head: string[];
  children: ReactNode;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  const rows = Children.toArray(children).filter(Boolean);
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} hint={emptyHint} />;
  }
  return (
    <div className="overflow-hidden rounded-[12px] border border-line" style={{ background: CARD }}>
      <div className="max-h-[calc(var(--app-content-h)-17rem)] overflow-auto">
        <table className="w-full min-w-180 text-sm">
          <thead className="sticky top-0 z-10" style={{ background: CARD }}>
            <tr className="border-b border-line text-left text-[11px] tracking-wide text-white/45 uppercase">
              {head.map((h) => (
                <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap" style={{ background: CARD }}>
                  {h || <span className="sr-only">Actions</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8 text-white">{rows}</tbody>
        </table>
      </div>
    </div>
  );
}

export function Loading() {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[12px] border border-line px-3 py-2 text-xs" style={{ background: CARD }}>
      {label && <p className="mb-1 font-medium text-fg">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="text-muted">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="text-fg">{p.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

/* ── Overview ────────────────────────────────────────────────────────────── */

interface OverviewData {
  rangeDays: number;
  totalUsers: number;
  activeUsers7d: number;
  activeUsers30d: number;
  activeUsersInRange: number;
  signups7d: number;
  signups30d: number;
  signupsInRange: number;
  signupsDeltaPct: number | null;
  signupsToday: number;
  proUsers: number;
  paidUsers: number;
  activeProjects: number;
  totalProjects: number;
  totalWorkspaces: number;
  runsToday: number;
  runsYesterday: number;
  runsInRange: number;
  runsDeltaPct: number | null;
  runs7d: number;
  liveApps: number;
  tokensConsumed: number;
  mrrCents: number;
  grossRevenueCents: number;
  rawCostCents30d: number;
  chargedCents30d: number;
  rawCostCentsRange: number;
  chargedCentsRange: number;
  marginPct: number | null;
  openAbuse: number;
  unverifiedUsers: number;
  bannedUsers: number;
  failedDeploys7d: number;
  emptyBalanceUsers: number;
  mobile?: Array<{
    platform: string;
    reachable: number;
    unreachable: number;
    uninstalledInRange: number;
    invalidTokenInRange: number;
    senderMismatchInRange: number;
    unreachableInRange: number;
  }>;
  funnel: {
    signedUp: number;
    verified: number;
    built: number;
    chatted: number;
    published: number;
    paid: number;
  };
  topSpenders: Array<{ id: string; email: string; name: string; runs: number; costCents: number }>;
  activity?: Array<{ label: string; date: string; runs: number; signups: number }>;
  activity7d?: Array<{ label: string; date: string; runs: number; signups: number }>;
}

const PLATFORM_LABEL: Record<string, string> = {
  ios: "iOS",
  android: "Android",
  web: "Web push",
};

const FUNNEL_STEPS: Array<{ key: keyof OverviewData["funnel"]; label: string }> = [
  { key: "signedUp", label: "Signed up" },
  { key: "verified", label: "Verified" },
  { key: "built", label: "Built" },
  { key: "chatted", label: "Chatted" },
  { key: "published", label: "Published" },
  { key: "paid", label: "Paid" },
];

function Overview() {
  const [range, setRange] = useState<7 | 30 | 90>(7);
  const { data, loading, reload } = useAdminData<OverviewData>(`/v1/admin/overview?range=${range}`);

  const activity = useMemo(() => {
    const series = data?.activity ?? data?.activity7d;
    return series?.map((d) => ({ label: d.label, runs: d.runs, signups: d.signups })) ?? [];
  }, [data]);

  const planMix = useMemo(() => {
    if (!data) return [];
    const free = Math.max(0, data.totalUsers - data.proUsers);
    return [
      { name: "Pro", value: data.proUsers },
      { name: "Free", value: free },
    ].filter((d) => d.value > 0);
  }, [data]);

  const revenueBars = useMemo(() => {
    if (!data) return [];
    return [
      { name: "MRR", value: data.mrrCents / 100 },
      { name: `Charged ${range}d`, value: (data.rawCostCentsRange != null ? data.chargedCentsRange : data.chargedCents30d) / 100 },
      { name: `AI cost ${range}d`, value: (data.rawCostCentsRange ?? data.rawCostCents30d) / 100 },
      { name: "Gross", value: data.grossRevenueCents / 100 },
    ];
  }, [data, range]);

  const funnelBase = data?.funnel.signedUp ?? 0;

  return (
    <>
      <PageTitle
        sub="Live product, revenue, and conversion. Percents vs the previous window."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {([7, 30, 90] as const).map((d) => (
              <Pill key={d} active={range === d} onClick={() => setRange(d)}>
                {d}d
              </Pill>
            ))}
            <button type="button" className="btn-secondary !py-1.5" onClick={() => reload()}>
              Refresh
            </button>
          </div>
        }
      >
        Overview
      </PageTitle>
      {loading || !data ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Users"
              value={data.totalUsers.toLocaleString()}
              delta={data.signupsDeltaPct}
              hint={`${data.signupsToday} today · +${data.signupsInRange} in ${range}d`}
            />
            <Stat
              label="Active users"
              value={(data.activeUsersInRange ?? data.activeUsers7d).toLocaleString()}
              hint={`${data.activeUsers7d} in 7d · ${data.activeUsers30d} in 30d`}
            />
            <Stat
              label="Agent runs"
              value={data.runsInRange.toLocaleString()}
              delta={data.runsDeltaPct}
              hint={`${data.runsToday} today · ${data.runsYesterday} yesterday (UTC)`}
            />
            <Stat
              label="Margin"
              value={data.marginPct === null ? "—" : `${data.marginPct}%`}
              hint={`charged ${usd(data.chargedCentsRange ?? data.chargedCents30d)} · cost ${usd(data.rawCostCentsRange ?? data.rawCostCents30d)}`}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Projects"
              value={data.totalProjects.toLocaleString()}
              hint={`${data.activeProjects.toLocaleString()} active in ${range}d`}
            />
            <Stat label="Live apps" value={data.liveApps.toLocaleString()} hint="published & online" />
            <Stat label="Paid accounts" value={data.paidUsers.toLocaleString()} hint={`${data.proUsers} Pro · MRR ${usd(data.mrrCents)}`} />
            <Stat
              label="Empty credits"
              value={data.emptyBalanceUsers.toLocaleString()}
              hint={`${data.unverifiedUsers} unverified · ${data.bannedUsers} banned`}
            />
          </div>

          {data.mobile && data.mobile.some((m) => m.reachable + m.unreachable > 0) && (
            <ChartCard
              title="Apps"
              sub={`Devices registered for push · disable reasons from the last ${range} days`}
            >
              <div className="grid gap-3 sm:grid-cols-3">
                {data.mobile.map((m) => {
                  const total = m.reachable + m.unreachable;
                  const pct = total > 0 ? Math.round((m.reachable / total) * 100) : 0;
                  return (
                    <div
                      key={m.platform}
                      className="rounded-[10px] border border-line p-3"
                      style={{ background: CARD }}
                    >
                      <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">
                        {PLATFORM_LABEL[m.platform] ?? m.platform}
                      </p>
                      <p className="mt-1 text-xl font-semibold text-fg">
                        {m.reachable.toLocaleString()}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        reachable · {pct}% of {total.toLocaleString()}
                      </p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      <div className="mt-2 space-y-0.5 text-xs text-muted">
                        <p>{m.uninstalledInRange.toLocaleString()} uninstalled</p>
                        {/* Not churn — our own bug or misconfiguration. Shown
                            separately so it is never read as people leaving. */}
                        {m.invalidTokenInRange > 0 && (
                          <p className="text-amber-400">
                            {m.invalidTokenInRange.toLocaleString()} invalid token
                          </p>
                        )}
                        {m.senderMismatchInRange > 0 && (
                          <p className="text-amber-400">
                            {m.senderMismatchInRange.toLocaleString()} sender mismatch
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-muted">
                A device appears here only if its owner allowed notifications, so this counts
                reachable installs, not installs. Store totals live in Play Console and App Store
                Connect.
              </p>
            </ChartCard>
          )}

          <ChartCard title="Activation funnel" sub="All-time conversion from signup to paid">
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {FUNNEL_STEPS.map((step, i) => {
                const count = data.funnel[step.key];
                const prev = i === 0 ? funnelBase : data.funnel[FUNNEL_STEPS[i - 1].key];
                const ofTotal = funnelBase > 0 ? Math.round((count / funnelBase) * 100) : 0;
                const ofPrev = i > 0 && prev > 0 ? Math.round((count / prev) * 100) : null;
                return (
                  <div key={step.key} className="rounded-[10px] border border-line p-3" style={{ background: CARD }}>
                    <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{step.label}</p>
                    <p className="mt-1 text-xl font-semibold text-fg">{count.toLocaleString()}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {ofTotal}% of signups{ofPrev != null ? ` · ${ofPrev}% step` : ""}
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, ofTotal)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </ChartCard>

          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard title="Activity" sub={`Signups and agent runs · last ${range} days (UTC)`} className="xl:col-span-2">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={activity}>
                    <defs>
                      <linearGradient id="runsFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="signupsFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="label"
                      interval={range === 7 ? 0 : range === 30 ? 4 : 13}
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="runs" name="Runs" stroke="#6366f1" fill="url(#runsFill)" strokeWidth={2} />
                    <Area type="monotone" dataKey="signups" name="Signups" stroke="#34d399" fill="url(#signupsFill)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Plan mix" sub={`${data.totalUsers} total accounts`}>
              {planMix.length === 0 ? (
                <EmptyState title="No users yet" hint="Signups will show up here." />
              ) : (
                <div className="flex h-64 flex-col items-center justify-center">
                  <ResponsiveContainer width="100%" height="70%">
                    <PieChart>
                      <Pie data={planMix} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={3}>
                        {planMix.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 text-xs text-muted">
                    {planMix.map((p, i) => (
                      <span key={p.name} className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS[i] }} />
                        {p.name} · {p.value}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Revenue vs cost" sub={`USD in the last ${range} days, plus MRR / gross`}>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueBars} barSize={28}>
                    <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" name="USD" radius={[8, 8, 0, 0]}>
                      {revenueBars.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard
              title="Heaviest spenders"
              sub={
                <>
                  Top accounts by AI cost · last {range} days ·{" "}
                  <Link to="/admin/credits" className="text-fg hover:underline">
                    all credits
                  </Link>
                </>
              }
            >
              {data.topSpenders.length === 0 ? (
                <EmptyState title="No agent spend yet" hint="Once people chat, the costliest accounts show here." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] tracking-wide text-muted uppercase">
                        <th className="pb-2 font-semibold">User</th>
                        <th className="pb-2 font-semibold">Runs</th>
                        <th className="pb-2 text-right font-semibold">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.topSpenders.map((u) => (
                        <tr key={u.id}>
                          <td className="py-2 pr-3">
                            <Link to={`/admin/users/${u.id}`} className="text-fg hover:underline">
                              {u.name}
                            </Link>
                            <div className="text-xs text-muted">{u.email}</div>
                          </td>
                          <td className="py-2 text-fg-2">{u.runs.toLocaleString()}</td>
                          <td className="py-2 text-right text-fg-2">{usd(u.costCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ChartCard>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Credits spent"
              value={formatMillicredits(data.tokensConsumed)}
              hint="agent all-time · sandbox + vendor $ are on Credits"
            />
            <Stat label="Gross revenue" value={usd(data.grossRevenueCents)} hint="MRR + top-ups" />
            <Stat label="Open abuse" value={data.openAbuse.toLocaleString()} hint="needs triage" />
            <Stat
              label="Failed deploys"
              value={data.failedDeploys7d.toLocaleString()}
              hint={`in last ${range}d · ${data.totalWorkspaces} workspaces`}
            />
          </div>
        </div>
      )}
    </>
  );
}

const REASON_LABEL: Record<string, string> = {
  agent_run: "AI chat",
  web_search: "Web search",
  sandbox_runtime: "Preview sandbox",
  hosting_overage: "Published hosting",
  db_overage: "Database",
  storage_usage: "App file storage",
};

interface CreditsDashboard {
  rangeDays: number;
  spentCredits: number;
  chargedCents: number;
  vendorCents: number;
  marginPct: number | null;
  byReason: Record<string, { credits: number; chargedCents: number; vendorCents: number }>;
  users: Array<{
    id: string;
    email: string;
    name: string;
    plan: string;
    isAdmin: boolean;
    availableCredits: number;
    spentCredits: number;
    chargedCents: number;
    vendorCents: number;
  }>;
  projects: Array<{
    projectId: string | null;
    name: string;
    agentCredits: number;
    sandboxCredits: number;
    hostingCredits: number;
    totalCredits: number;
    chargedCents: number;
    vendorCents: number;
  }>;
  page: number;
  pageSize: number;
  total: number;
}

function Credits() {
  const [range, setRange] = useState<7 | 30 | 90>(7);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const params = new URLSearchParams({ range: String(range), page: String(page), pageSize: "25" });
  if (dq) params.set("q", dq);
  const { data, loading, reload } = useAdminData<CreditsDashboard>(`/v1/admin/credits?${params}`);

  return (
    <>
      <PageTitle
        sub="Credits spent, still available, charged to users, and real vendor cost."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {([7, 30, 90] as const).map((d) => (
              <Pill
                key={d}
                active={range === d}
                onClick={() => {
                  setPage(1);
                  setRange(d);
                }}
              >
                {d}d
              </Pill>
            ))}
            <button type="button" className="btn-secondary !py-1.5" onClick={() => reload()}>
              Refresh
            </button>
          </div>
        }
      >
        Credits
      </PageTitle>
      {loading || !data ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Credits spent" value={formatCredits(data.spentCredits)} hint={`last ${range} days`} />
            <Stat label="Charged" value={usd(data.chargedCents)} hint="what users paid in credits" />
            <Stat label="Vendor cost" value={usd(data.vendorCents)} hint="AI COGS + sandbox/hosting" />
            <Stat
              label="Gross margin"
              value={data.marginPct == null ? "—" : `${data.marginPct}%`}
              hint="charged minus vendor"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(
              ["agent_run", "web_search", "sandbox_runtime", "hosting_overage", "db_overage", "storage_usage"] as const
            ).map((reason) => {
              const row = data.byReason[reason];
              return (
                <Stat
                  key={reason}
                  label={REASON_LABEL[reason]}
                  value={formatCredits(row?.credits ?? 0)}
                  hint={`charged ${usd(row?.chargedCents ?? 0)} · cost ${usd(row?.vendorCents ?? 0)}`}
                />
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              placeholder="Filter spenders by email or name…"
              className="h-9 max-w-xs rounded-[10px] border border-line px-3 text-sm text-white outline-none placeholder:text-white/40"
              style={{ background: CARD }}
            />
          </div>

          <h2 className="text-sm font-semibold text-fg">Heaviest spenders</h2>
          <p className="mb-2 text-xs text-muted">Available credits plus spend in the last {range} days</p>
          <Table
              head={["User", "Available", "Spent", "Charged", "Vendor", "Margin"]}
              emptyTitle="No credit spend yet"
              emptyHint="Agent runs and sandbox ticks will show here."
            >
              {data.users.map((u) => {
                const margin =
                  u.chargedCents > 0 ? Math.round(((u.chargedCents - u.vendorCents) / u.chargedCents) * 100) : null;
                return (
                  <tr key={u.id} className="hover:bg-white/[0.04]">
                    <td className="px-4 py-2.5">
                      <Link to={`/admin/users/${u.id}`} className="font-medium text-fg hover:underline">
                        {u.name || u.email}
                      </Link>
                      <div className="text-xs text-muted">
                        {u.email}
                        {u.isAdmin ? " · admin" : ""} · {u.plan}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-fg">{formatCredits(u.availableCredits)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-fg">{formatCredits(u.spentCredits)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-fg-2">{usd(u.chargedCents)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-fg-2">{usd(u.vendorCents)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-muted">{margin == null ? "—" : `${margin}%`}</td>
                  </tr>
                );
              })}
            </Table>
            <div className="mt-3">
              <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
            </div>

          <h2 className="mt-2 text-sm font-semibold text-fg">Projects</h2>
          <p className="mb-2 text-xs text-muted">Top projects by credits spent · last {range} days</p>
          <Table
              head={["Project", "AI", "Sandbox", "Hosting", "Total", "Charged", "Vendor"]}
              emptyTitle="No project spend yet"
              emptyHint="Spend is attributed from the credit ledger and agent runs."
            >
              {data.projects.map((p) => (
                <tr key={p.projectId ?? p.name} className="hover:bg-white/[0.04]">
                  <td className="px-4 py-2.5">
                    {p.projectId ? (
                      <a
                        href={`/p/${p.projectId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-fg hover:underline"
                      >
                        {p.name}
                      </a>
                    ) : (
                      <span className="text-fg">{p.name}</span>
                    )}
                    {p.projectId && <div className="font-mono text-[11px] text-muted">{p.projectId}</div>}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-fg-2">{formatCredits(p.agentCredits)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-fg-2">{formatCredits(p.sandboxCredits)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-fg-2">{formatCredits(p.hostingCredits)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-fg">{formatCredits(p.totalCredits)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-fg-2">{usd(p.chargedCents)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-fg-2">{usd(p.vendorCents)}</td>
                </tr>
              ))}
            </Table>
        </div>
      )}
    </>
  );
}

/* ── Users ───────────────────────────────────────────────────────────────── */

interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  plan: string;
  isAdmin: boolean;
  emailVerified: boolean;
  banned: boolean;
  createdAt: string;
  projectCount: number;
  balanceTokens: number;
  lifetimeSpendTokens: number;
  chargedCents?: number;
}

function Users() {
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("all");
  const [verified, setVerified] = useState("all");
  const [banned, setBanned] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const toast = useToast();
  const dq = useDebounced(q);
  const params = new URLSearchParams({ page: String(page), pageSize: "25" });
  if (dq) params.set("q", dq);
  if (plan !== "all") params.set("plan", plan);
  if (verified !== "all") params.set("verified", verified);
  if (banned !== "all") params.set("banned", banned);
  if (sort !== "newest") params.set("sort", sort);
  const { data, loading } = useAdminData<{ total: number; page: number; pageSize: number; users: AdminUserRow[] }>(
    `/v1/admin/users?${params}`,
  );

  const resetPage = () => setPage(1);

  return (
    <>
      <PageTitle
        sub={data ? `${data.total} accounts` : undefined}
        action={
          <button
            type="button"
            className="btn-secondary !py-1.5"
            onClick={() =>
              void apiDownload("/v1/admin/users/export", "users.csv").catch(() => toast("error", "Export failed."))
            }
          >
            Export CSV
          </button>
        }
      >
        Users
      </PageTitle>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => {
            resetPage();
            setQ(e.target.value);
          }}
          placeholder="Search email or name…"
          className="h-9 max-w-xs rounded-[10px] border border-line px-3 text-sm text-white outline-none placeholder:text-white/40"
          style={{ background: CARD }}
        />
        <FilterSelect
          value={plan}
          onChange={(v) => {
            resetPage();
            setPlan(v);
          }}
          options={[
            { value: "all", label: "All plans" },
            { value: "FREE", label: "Free" },
            { value: "PRO", label: "Pro" },
            { value: "BUSINESS", label: "Business" },
            { value: "ENTERPRISE", label: "Enterprise" },
          ]}
        />
        <FilterSelect
          value={verified}
          onChange={(v) => {
            resetPage();
            setVerified(v);
          }}
          options={[
            { value: "all", label: "Any verify" },
            { value: "yes", label: "Verified" },
            { value: "no", label: "Unverified" },
          ]}
        />
        <FilterSelect
          value={banned}
          onChange={(v) => {
            resetPage();
            setBanned(v);
          }}
          options={[
            { value: "all", label: "Any status" },
            { value: "no", label: "Active" },
            { value: "yes", label: "Banned" },
          ]}
        />
        <FilterSelect
          value={sort}
          onChange={(v) => {
            resetPage();
            setSort(v);
          }}
          options={[
            { value: "newest", label: "Newest" },
            { value: "oldest", label: "Oldest" },
            { value: "projects", label: "Most projects" },
            { value: "spent", label: "Most spent" },
          ]}
        />
      </div>
      {loading || !data ? (
        <Loading />
      ) : (
        <>
          <Table head={["User", "Plan", "Available", "Spent", "Charged", "Projects", "Joined"]} emptyTitle="No users found" emptyHint="Try a different search or filter.">
            {data.users.map((u) => (
              <tr key={u.id} className="hover:bg-white/[0.04]">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Link to={`/admin/users/${u.id}`} className="font-medium text-fg hover:underline">
                      {u.name}
                    </Link>
                    {u.isAdmin && <Badge tone="violet">admin</Badge>}
                    {u.banned && <Badge tone="red">banned</Badge>}
                    {!u.emailVerified && <Badge tone="amber">unverified</Badge>}
                  </div>
                  <Link to={`/admin/users/${u.id}`} className="text-xs text-muted hover:underline">
                    {u.email}
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={u.plan !== "FREE" ? "violet" : "zinc"}>{u.plan}</Badge>
                </td>
                <td className="px-4 py-2.5 tabular-nums text-fg">{formatMillicredits(u.balanceTokens)}</td>
                <td className="px-4 py-2.5 tabular-nums text-fg">{formatMillicredits(u.lifetimeSpendTokens)}</td>
                <td className="px-4 py-2.5 tabular-nums text-fg-2">{usd(u.chargedCents ?? 0)}</td>
                <td className="px-4 py-2.5 text-fg">{u.projectCount}</td>
                <td className="px-4 py-2.5 text-muted">{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </Table>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}

interface UserDetailData {
  user: {
    id: string;
    email: string;
    name: string;
    plan: string;
    isAdmin: boolean;
    emailVerified: boolean;
    banned: boolean;
    createdAt: string;
    hasStripeCustomer: boolean;
  };
  subscription: { status: string; currentPeriodEnd: number | null; cancelAtPeriodEnd: boolean } | null;
  balanceTokens: number;
  credits?: {
    availableCredits: number;
    spentCredits: number;
    chargedCents: number;
    vendorCents: number;
    marginPct: number | null;
    byReason: Record<string, { credits: number; chargedCents: number; vendorCents: number }>;
    byProject: Array<{
      projectId: string | null;
      name: string;
      agentCredits: number;
      sandboxCredits: number;
      hostingCredits: number;
      totalCredits: number;
      chargedCents: number;
      vendorCents: number;
    }>;
  };
  ledger: Array<{ id: string; deltaTokens: number; deltaCents?: number; reason: string; createdAt: string; meta?: { projectId?: string } | null }>;
  workspaces: Array<{ id: string; name: string; role: string; projectCount: number; members: Array<{ userId: string; name: string; email: string; role: string }> }>;
  projects: Array<{
    id: string;
    name: string;
    sandboxId: string | null;
    sandboxStatus: string;
    runPort: number | null;
    e2bUrl: string | null;
    suspended: boolean;
    hasDatabase: boolean;
    hasStorage: boolean;
    lastActiveAt: string;
    deployments: Array<{ id: string; slug: string; status: string; url: string | null }>;
    sessions: Array<{
      id: string;
      title: string;
      messageCount: number;
      updatedAt: string;
      lastRunId?: string | null;
      costTokens?: number;
      costCents?: number;
      rawCostCents?: number;
    }>;
  }>;
}

function UserDetail() {
  const { id = "" } = useParams();
  const { data, loading, reload } = useAdminData<UserDetailData>(`/v1/admin/users/${id}`);
  // New signups blocked from this person's devices / fingerprint / IPs (separate from a ban).
  const signupBlock = useAdminData<{
    devices: number;
    fingerprints: number;
    ips: number;
    blocked: { devices: number; fingerprints: number; ips: number };
    until: number | null;
  }>(`/v1/admin/users/${id}/signup-block`);
  const [blockDays, setBlockDays] = useState("90");
  const [blockIps, setBlockIps] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"ban" | "delete" | "downgrade" | "block" | null>(null);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast("success", ok);
      reload();
      signupBlock.reload();
    } catch {
      toast("error", "Action failed.");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const grant = () => {
    const raw = window.prompt("Grant tokens (negative to deduct):", "500000");
    if (raw === null) return;
    const tokens = Number(raw);
    if (!Number.isFinite(tokens) || tokens === 0) return;
    void act(() => api.post(`/v1/admin/users/${id}/grant`, { tokens }), "Balance adjusted.");
  };

  if (loading || !data) return <Loading />;
  const u = data.user;
  const spendByProject = new Map((data.credits?.byProject ?? []).map((p) => [p.projectId, p]));

  return (
    <>
      <Link to="/admin/users" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Users
      </Link>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-fg">
            {u.name}
            {u.isAdmin && <Badge tone="violet">admin</Badge>}
            {u.banned && <Badge tone="red">banned</Badge>}
            {signupBlock.data?.until && (
              <Badge tone="red">signups blocked until {new Date(signupBlock.data.until).toLocaleDateString()}</Badge>
            )}
          </h1>
          <p className="text-sm text-muted">{u.email} · joined {new Date(u.createdAt).toLocaleDateString()}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={grant} className="btn-secondary">Adjust tokens</button>
          <button
            disabled={busy}
            onClick={() => {
              if (u.plan !== "FREE") setConfirm("downgrade");
              else void act(() => api.post(`/v1/admin/users/${id}/plan`, { plan: "PRO" }), "Plan changed.");
            }}
            className="btn-secondary"
          >
            {u.plan !== "FREE" ? "Downgrade to Free" : "Upgrade to Pro"}
          </button>
          {/* Comp a plan and tier (no Stripe subscription): Business, or a bigger Pro. */}
          <select
            disabled={busy}
            aria-label="Set plan and tier"
            value=""
            onChange={(e) => {
              const [plan, credits] = e.target.value.split(":");
              if (!plan) return;
              void act(() => api.post(`/v1/admin/users/${id}/plan`, { plan, credits: Number(credits) }), "Plan changed.");
            }}
            className="btn-secondary"
          >
            <option value="">Set plan…</option>
            {["PRO", "BUSINESS", "ENTERPRISE"].flatMap((p) =>
              (p === "ENTERPRISE" ? [800, 2000, 5000] : [100, 200, 400, 800, 2000]).map((c) => (
                <option key={`${p}:${c}`} value={`${p}:${c}`}>
                  {p === "PRO" ? "Pro" : p === "BUSINESS" ? "Business" : "Enterprise"} · {c} credits
                </option>
              )),
            )}
          </select>
          {!u.isAdmin && (
            <button
              disabled={busy}
              onClick={() => {
                if (u.banned) void act(() => api.post(`/v1/admin/users/${id}/ban`, { banned: false }), "User unbanned.");
                else setConfirm("ban");
              }}
              className="btn-secondary"
            >
              {u.banned ? "Unban" : "Ban"}
            </button>
          )}
          {!u.isAdmin && (
            <button
              disabled={busy}
              onClick={() => {
                if (signupBlock.data?.until) {
                  void act(() => api.delete(`/v1/admin/users/${id}/signup-block`), "Signups unblocked.");
                } else setConfirm("block");
              }}
              className="btn-secondary"
            >
              {signupBlock.data?.until ? "Unblock signups" : "Block signups…"}
            </button>
          )}
          {!u.isAdmin && (
            <button
              disabled={busy}
              onClick={() => setConfirm("delete")}
              className="btn-danger"
            >
              Delete
            </button>
          )}
        </div>
      </div>
      {confirm === "ban" && (
        <ConfirmDialog
          title="Ban user?"
          subtitle={`${u.email} will be locked out of Mythex.`}
          confirmLabel="Ban"
          danger
          busy={busy}
          onClose={() => setConfirm(null)}
          onConfirm={() => void act(() => api.post(`/v1/admin/users/${id}/ban`, { banned: true }), "User banned.")}
        />
      )}
      {confirm === "block" && (
        <ConfirmDialog
          title="Block new signups?"
          subtitle={`No new accounts from ${u.email}'s ${signupBlock.data?.devices ?? 0} browser(s) and ${signupBlock.data?.fingerprints ?? 0} fingerprint(s). This account itself is not changed.`}
          confirmLabel="Block"
          danger
          busy={busy}
          onClose={() => setConfirm(null)}
          onConfirm={() =>
            void act(
              () => api.post(`/v1/admin/users/${id}/signup-block`, { days: Number(blockDays), ips: blockIps }),
              "Signups blocked.",
            )
          }
        >
          <div className="mt-3 flex flex-col gap-3 text-sm text-fg">
            <label className="flex items-center justify-between gap-3">
              For
              <select value={blockDays} onChange={(e) => setBlockDays(e.target.value)} className="btn-secondary">
                {["30", "90", "180", "365"].map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={blockIps} onChange={(e) => setBlockIps(e.target.checked)} />
              Also block their {signupBlock.data?.ips ?? 0} IP address(es) (others on the same network or VPN are blocked too)
            </label>
          </div>
        </ConfirmDialog>
      )}
      {confirm === "downgrade" && (
        <ConfirmDialog
          title="Downgrade to Free?"
          subtitle={`${u.email} will lose Pro plan limits.`}
          confirmLabel="Downgrade"
          danger
          busy={busy}
          onClose={() => setConfirm(null)}
          onConfirm={() => void act(() => api.post(`/v1/admin/users/${id}/plan`, { plan: "FREE" }), "Plan changed.")}
        />
      )}
      {confirm === "delete" && (
        <ConfirmDialog
          title="Delete user?"
          subtitle={`Permanently delete ${u.email}? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          busy={busy}
          onClose={() => setConfirm(null)}
          onConfirm={() =>
            void act(async () => {
              await api.delete(`/v1/admin/users/${id}`);
              navigate("/admin/users");
            }, "User deleted.")
          }
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Plan" value={u.plan} hint={u.emailVerified ? "email verified" : "email unverified"} />
        <Stat
          label="Available credits"
          value={formatCredits(data.credits?.availableCredits ?? 0)}
          hint="same rules as /billing (expired daily grants dropped)"
        />
        <Stat
          label="Spent"
          value={formatCredits(data.credits?.spentCredits ?? 0)}
          hint={`charged ${usd(data.credits?.chargedCents ?? 0)}`}
        />
        <Stat
          label="Vendor cost"
          value={usd(data.credits?.vendorCents ?? 0)}
          hint={
            data.credits?.marginPct == null
              ? (data.subscription?.status ?? (u.plan !== "FREE" ? "active" : undefined))
              : `${data.credits.marginPct}% margin · ${data.subscription?.status ?? u.plan}`
          }
        />
      </div>

      {data.credits && data.credits.spentCredits > 0 && (
        <p className="mt-3 text-xs text-muted">
          {formatCredits(data.credits.byReason.agent_run?.credits ?? 0)} AI ·{" "}
          {formatCredits(data.credits.byReason.sandbox_runtime?.credits ?? 0)} sandbox ·{" "}
          {formatCredits((data.credits.byReason.hosting_overage?.credits ?? 0) + (data.credits.byReason.db_overage?.credits ?? 0))} hosting
          {" · "}
          <Link to="/admin/credits" className="text-fg hover:underline">
            Platform credits
          </Link>
        </p>
      )}

      <h2 className="mb-2 mt-6 text-sm font-semibold text-fg">Projects ({data.projects.length})</h2>
      <div className="space-y-2">
        {data.projects.map((p) => {
          const spend = spendByProject.get(p.id);
          return (
          <div key={p.id} className="rounded-[12px] border border-line p-3" style={{ background: CARD }}>
            <div className="flex items-center justify-between gap-3">
              <Link to={`/p/${p.id}`} className="font-medium text-fg hover:underline">
                {p.name}
              </Link>
              <span className="flex items-center gap-2 text-xs">
                {spend && (
                    <span className="text-muted">
                      {formatCredits(spend.totalCredits)} cr
                      {spend.agentCredits ? ` · ${formatCredits(spend.agentCredits)} AI` : ""}
                      {spend.sandboxCredits ? ` · ${formatCredits(spend.sandboxCredits)} sandbox` : ""}
                      {" · "}
                      {usd(spend.chargedCents)} charged · {usd(spend.vendorCents)} cost
                    </span>
                  )}
                {p.suspended && <Badge tone="red">suspended</Badge>}
                {p.hasDatabase && <Badge tone="zinc">db</Badge>}
                {p.hasStorage && <Badge tone="zinc">storage</Badge>}
                <Badge
                  tone={
                    p.sandboxStatus === "RUNNING" ? "emerald" : p.sandboxStatus === "PAUSED" ? "amber" : "zinc"
                  }
                >
                  {p.sandboxStatus}
                </Badge>
              </span>
            </div>
            {p.e2bUrl ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <a
                  href={p.e2bUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-fg hover:underline"
                >
                  {p.e2bUrl.replace(/^https:\/\//, "")}
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted" />
                </a>
                {p.sandboxId && <span className="font-mono text-muted">{p.sandboxId}</span>}
                <span className="text-muted">active {dt(p.lastActiveAt)}</span>
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted">No sandbox · last active {dt(p.lastActiveAt)}</p>
            )}
            {p.deployments.length > 0 && (
              <div className="mt-1 text-xs text-muted">
                {p.deployments.map((d) => (
                  <span key={d.id} className="mr-3">
                    {d.slug}: {d.status}
                  </span>
                ))}
              </div>
            )}
            {p.sessions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.sessions.map((s) => {
                  const to = s.lastRunId ? `/admin/runs/${s.lastRunId}` : `/p/${p.id}`;
                  return (
                  <Link
                    key={s.id}
                    to={to}
                    className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-fg-2 hover:bg-white/10 hover:text-fg"
                  >
                    {s.title}
                    {s.messageCount ? ` · ${s.messageCount}` : ""}
                    {s.costTokens ? ` · ${formatMillicredits(s.costTokens)} cr` : ""}
                  </Link>
                  );
                })}
              </div>
            )}
          </div>
          );
        })}
        {data.projects.length === 0 && (
          <EmptyState title="No projects" hint="This user hasn't created a project yet." />
        )}
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-fg">Workspaces ({data.workspaces.length})</h2>
      <div className="space-y-2">
        {data.workspaces.map((w) => (
          <div key={w.id} className="rounded-[12px] border border-line p-3" style={{ background: CARD }}>
            <div className="flex items-center justify-between">
              <span className="font-medium text-fg">{w.name}</span>
              <span className="text-xs text-muted">
                {w.role} · {w.projectCount} projects
                {w.members.length > 0 ? " · " : ""}
                {w.members.map((m, i) => (
                  <span key={m.userId}>
                    {i > 0 ? " · " : ""}
                    <Link to={`/admin/users/${m.userId}`} className="hover:underline">
                      {m.email}
                    </Link>
                  </span>
                ))}
              </span>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-fg">Credit ledger</h2>
      <Table head={["When", "Reason", "Credits", "Charged"]} emptyTitle="No ledger entries" emptyHint="Grants and charges will appear here.">
        {data.ledger.map((e) => (
          <tr key={e.id} className="hover:bg-white/[0.04]">
            <td className="px-4 py-2.5 text-muted">{new Date(e.createdAt).toLocaleString()}</td>
            <td className="px-4 py-2.5 text-fg-2">
              {REASON_LABEL[e.reason] ?? e.reason}
              {e.meta?.projectId ? (
                <>
                  {" · "}
                  <Link to={`/p/${e.meta.projectId}`} className="hover:underline">
                    project
                  </Link>
                </>
              ) : null}
            </td>
            <td className={`px-4 py-2.5 tabular-nums ${e.deltaTokens >= 0 ? "text-emerald-300" : "text-fg-2"}`}>
              {e.deltaTokens >= 0 ? "+" : "−"}
              {formatMillicredits(Math.abs(e.deltaTokens))}
            </td>
            <td className="px-4 py-2.5 tabular-nums text-muted">
              {e.deltaCents ? usd(Math.abs(e.deltaCents)) : "—"}
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

/* ── Workspaces ──────────────────────────────────────────────────────────── */

function Workspaces() {
  const [page, setPage] = useState(1);
  const { data, loading } = useAdminData<{
    total: number;
    page: number;
    pageSize: number;
    workspaces: Array<{ id: string; name: string; isDefault: boolean; owner: { id: string; email: string; name: string }; memberCount: number; projectCount: number; createdAt: string }>;
  }>(`/v1/admin/workspaces?page=${page}&pageSize=25`);

  return (
    <>
      <PageTitle sub={data ? `${data.total} workspaces` : undefined}>Workspaces</PageTitle>
      {loading || !data ? (
        <Loading />
      ) : (
        <>
          <Table head={["Workspace", "Owner", "Members", "Projects", "Created"]} emptyTitle="No workspaces" emptyHint="Workspaces appear as teams get created.">
            {data.workspaces.map((w) => (
              <tr key={w.id} className="hover:bg-white/[0.04]">
                <td className="px-4 py-2.5 font-medium text-fg">
                  {w.name} {w.isDefault && <Badge tone="zinc">default</Badge>}
                </td>
                <td className="px-4 py-2.5 text-fg-2">
                  <Link to={`/admin/users/${w.owner.id}`} className="hover:underline">
                    {w.owner.email}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-fg-2">{w.memberCount}</td>
                <td className="px-4 py-2.5 text-fg-2">{w.projectCount}</td>
                <td className="px-4 py-2.5 text-muted">{new Date(w.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </Table>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}

/* ── Subscribers ─────────────────────────────────────────────────────────── */

function Subscribers() {
  const [page, setPage] = useState(1);
  const toast = useToast();
  const { data, loading } = useAdminData<{
    mrrCents: number;
    activeCount: number;
    page: number;
    pageSize: number;
    total: number;
    subscribers: Array<{ id: string; email: string; name: string; since: string; status: string | null; currentPeriodEnd: number | null; cancelAtPeriodEnd: boolean }>;
    recentTopups: Array<{ email: string; tokens: number; amountCents: number; createdAt: string }>;
  }>(`/v1/admin/subscribers?page=${page}&pageSize=25`);

  return (
    <>
      <PageTitle
        sub="Pro subscriptions and recent top-ups."
        action={
          <button
            type="button"
            className="btn-secondary !py-1.5"
            onClick={() =>
              void apiDownload("/v1/admin/subscribers/export", "subscribers.csv").catch(() =>
                toast("error", "Export failed."),
              )
            }
          >
            Export CSV
          </button>
        }
      >
        Subscribers
      </PageTitle>
      {loading || !data ? (
        <Loading />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <Stat label="MRR" value={usd(data.mrrCents)} />
            <Stat label="Active subscribers" value={data.activeCount} />
          </div>
          <Table head={["User", "Status", "Renews", "Since"]} emptyTitle="No subscribers yet" emptyHint="Pro subscriptions will list here.">
            {data.subscribers.map((s) => (
              <tr key={s.id} className="hover:bg-white/[0.04]">
                <td className="px-4 py-2.5">
                  <Link to={`/admin/users/${s.id}`} className="font-medium text-fg hover:underline">
                    {s.email}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-fg-2">
                  {s.status ?? "—"} {s.cancelAtPeriodEnd && <Badge tone="amber">canceling</Badge>}
                </td>
                <td className="px-4 py-2.5 text-muted">{dt(s.currentPeriodEnd)}</td>
                <td className="px-4 py-2.5 text-muted">{new Date(s.since).toLocaleDateString()}</td>
              </tr>
            ))}
          </Table>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />

          <h2 className="mb-2 mt-6 text-sm font-semibold text-fg">Recent top-ups</h2>
          <Table head={["User", "Tokens", "Amount", "When"]} emptyTitle="No top-ups yet" emptyHint="Token purchases show up here.">
            {data.recentTopups.map((t, i) => (
              <tr key={i} className="hover:bg-white/[0.04]">
                <td className="px-4 py-2.5 text-fg-2">{t.email}</td>
                <td className="px-4 py-2.5 text-fg-2">{formatTokens(t.tokens)}</td>
                <td className="px-4 py-2.5 text-fg-2">{usd(t.amountCents)}</td>
                <td className="px-4 py-2.5 text-muted">{new Date(t.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </>
  );
}

/* ── Runs + inspector ────────────────────────────────────────────────────── */

interface RunRow {
  id: string;
  createdAt: string;
  userId?: string;
  userEmail: string;
  projectId?: string;
  projectName: string;
  threadId?: string;
  threadTitle?: string;
  costTokens: number;
  costCents: number;
  rawCostCents: number;
  marginPct: number | null;
  errored: boolean;
  snippet: string;
}

function Runs() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [errored, setErrored] = useState(false);
  const toast = useToast();
  const dq = useDebounced(q);
  const params = new URLSearchParams({ page: String(page), pageSize: "25" });
  if (dq) params.set("q", dq);
  if (errored) params.set("errored", "1");
  const { data, loading } = useAdminData<{ total: number; page: number; pageSize: number; runs: RunRow[] }>(
    `/v1/admin/runs?${params}`,
  );
  return (
    <>
      <PageTitle
        sub={data ? `${data.total} agent runs` : "Every agent run across all accounts."}
        action={
          <button
            type="button"
            className="btn-secondary !py-1.5"
            onClick={() =>
              void apiDownload("/v1/admin/runs/export", "runs.csv").catch(() => toast("error", "Export failed."))
            }
          >
            Export CSV
          </button>
        }
      >
        Runs
      </PageTitle>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
          placeholder="Filter by user email…"
          className="h-9 max-w-xs rounded-[10px] border border-line px-3 text-sm text-white outline-none placeholder:text-white/40"
          style={{ background: CARD }}
        />
        <Pill
          active={!errored}
          onClick={() => {
            setPage(1);
            setErrored(false);
          }}
        >
          All
        </Pill>
        <Pill
          active={errored}
          onClick={() => {
            setPage(1);
            setErrored(true);
          }}
        >
          Errors only
        </Pill>
      </div>
      {loading || !data ? (
        <Loading />
      ) : (
        <>
          <Table head={["When", "User", "Project", "Credits", "Charged", "Vendor", "Margin", ""]} emptyTitle="No agent runs yet" emptyHint="Runs appear here as users build with the agent.">
            {data.runs.map((r) => (
              <tr key={r.id} className="hover:bg-white/[0.04]">
                <td className="px-4 py-2.5 text-muted">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="px-4 py-2.5 text-fg-2">
                  {r.userId ? (
                    <Link to={`/admin/users/${r.userId}`} className="hover:underline">
                      {r.userEmail}
                    </Link>
                  ) : (
                    r.userEmail
                  )}
                </td>
                <td className="px-4 py-2.5 text-fg-2">
                  {r.projectId ? (
                    <Link to={`/p/${r.projectId}`} className="hover:underline">
                      {r.projectName}
                    </Link>
                  ) : (
                    r.projectName
                  )}
                  {r.threadTitle && <div className="text-xs text-muted">{r.threadTitle}</div>}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-fg-2">{formatMillicredits(r.costTokens)}</td>
                <td className="px-4 py-2.5 tabular-nums text-muted">{usd(r.costCents)}</td>
                <td className="px-4 py-2.5 tabular-nums text-muted">{usd(r.rawCostCents)}</td>
                <td className="px-4 py-2.5">
                  {r.errored ? (
                    <Badge tone="red">error</Badge>
                  ) : r.marginPct === null ? (
                    "—"
                  ) : (
                    <span className={r.marginPct < 0 ? "text-red-400" : "text-emerald-300"}>{r.marginPct}%</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link to={`/admin/runs/${r.id}`} className="text-fg hover:underline">
                    Inspect
                  </Link>
                </td>
              </tr>
            ))}
          </Table>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}

function RunInspector() {
  const { id = "" } = useParams();
  const { data, loading } = useAdminData<{
    thread: { id: string; title: string };
    project: { id: string; name: string; user: { id?: string; email: string } };
    messages: Array<{
      id: string;
      role: string;
      content: unknown;
      costTokens: number;
      rawCostCents: number;
      createdAt: string;
    }>;
  }>(`/v1/admin/runs/${id}`);

  if (loading || !data) return <Loading />;
  return (
    <>
      <Link to="/admin/runs" className="mb-3 inline-flex items-center gap-1.5 text-sm text-white/45 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Runs
      </Link>
      <PageTitle
        sub={
          <>
            <Link to={`/p/${data.project.id}`} className="hover:underline">
              {data.project.name}
            </Link>
            {" · "}
            {data.project.user.id ? (
              <Link to={`/admin/users/${data.project.user.id}`} className="hover:underline">
                {data.project.user.email}
              </Link>
            ) : (
              data.project.user.email
            )}
          </>
        }
      >
        {data.thread.title}
      </PageTitle>
      <div className="mx-auto flex w-full max-w-2xl flex-col space-y-5 pb-16">
        {data.messages.map((m) => {
          const user = m.role === "USER" || m.role === "user";
          return user ? (
            <UserChatBubble key={m.id} content={m.content} />
          ) : (
            <AssistantChatTurn
              key={m.id}
              content={m.content}
              meta={`${formatTokens(m.costTokens)} · ${usd(m.rawCostCents)} · ${new Date(m.createdAt).toLocaleString()}`}
            />
          );
        })}
      </div>
    </>
  );
}

type ChatBlock = { type?: string; text?: string; name?: string; input?: unknown };

function chatBlocks(content: unknown): ChatBlock[] {
  if (typeof content === "string") return content.trim() ? [{ type: "text", text: content }] : [];
  if (!Array.isArray(content)) return [];
  return content.filter((b): b is ChatBlock => !!b && typeof b === "object");
}

function UserChatBubble({ content }: { content: unknown }) {
  const text = chatBlocks(content)
    .filter((b) => b.type === "text" || (!b.type && b.text))
    .map((b) => b.text ?? "")
    .join("\n\n")
    .trim();
  return (
    <div
      className="rounded-[28px] border border-line px-4 py-2.5 text-left text-[15px] leading-[1.45] whitespace-pre-wrap text-white"
      style={{ background: CARD }}
    >
      {text || "—"}
    </div>
  );
}

type ActivityItem =
  | { kind: "thought"; text: string }
  | { kind: "tool"; name: string; input: unknown };

function activityItems(blocks: ChatBlock[]): ActivityItem[] {
  const out: ActivityItem[] = [];
  for (const b of blocks) {
    if (b.type === "thinking" && b.text?.trim()) {
      const last = out[out.length - 1];
      if (last?.kind === "thought") last.text += `\n\n${b.text.trim()}`;
      else out.push({ kind: "thought", text: b.text.trim() });
      continue;
    }
    if (b.type === "tool_use" && b.name) {
      out.push({ kind: "tool", name: b.name, input: b.input });
    }
  }
  return out;
}

function AssistantChatTurn({ content, meta }: { content: unknown; meta: string }) {
  const blocks = chatBlocks(content);
  const activity = activityItems(blocks);
  const texts = blocks.filter((b) => (b.type === "text" || (!b.type && b.text)) && b.text?.trim());
  return (
    <div className="space-y-1">
      {activity.length > 0 && (
        <WorkedRow>
          {activity.map((item, i) =>
            item.kind === "thought" ? (
              <ThoughtRow key={`t${i}`} text={item.text} />
            ) : (
              <ToolRow key={`k${i}`} name={item.name} input={item.input} />
            ),
          )}
        </WorkedRow>
      )}
      {texts.map((b, i) => (
        <ReplyText key={`x${i}`} text={b.text ?? ""} />
      ))}
      <p className="pt-1 text-[11px] text-white/35">{meta}</p>
    </div>
  );
}

function WorkedRow({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-md py-1 pr-1 text-left text-xs text-white/45 transition hover:text-white/70"
      >
        <Wrench className="size-3.5 shrink-0" />
        <span className="font-medium">Worked</span>
        <ChevronDown className={`ml-auto size-3.5 shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="mt-1 ml-5 flex flex-col border-l border-line pl-3">{children}</div>}
    </div>
  );
}

function ThoughtRow({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full min-w-0 items-center gap-1.5 py-0.5 text-left text-[11px] text-white/40 transition hover:text-white/65"
      >
        <span className="shrink-0 font-medium text-white/50">Thought</span>
        <ChevronDown className={`ml-auto size-3 shrink-0 text-white/25 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <p className="mb-1 max-h-40 overflow-y-auto py-0.5 text-xs leading-relaxed whitespace-pre-wrap text-white/40">
          {text}
        </p>
      )}
    </div>
  );
}

function ReplyText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <p className="py-1.5 text-[15px] leading-[1.55] whitespace-pre-wrap text-white">
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code key={i} className="rounded-md bg-white/[0.08] px-1 py-0.5 font-mono text-[13px]">
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

function toolDetail(name: string, input: unknown): string {
  if (typeof input === "string") return input;
  if (!input || typeof input !== "object") return "";
  const obj = input as Record<string, unknown>;
  for (const key of ["path", "file_path", "command", "query", "pattern", "url", "target", "glob"]) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) {
      const s = v.trim();
      return name === "Bash" || key === "command" ? s : s.replace(/^\/home\/user\/app\//, "").replace(/^\.\//, "");
    }
  }
  return "";
}

function ToolRow({ name, input }: { name: string; input: unknown }) {
  const [open, setOpen] = useState(false);
  const detail = toolDetail(name, input);
  const verb =
    name === "Bash" || name === "Shell"
      ? "Ran"
      : name === "Read"
        ? "Read"
        : name === "Write"
          ? "Wrote"
          : name === "Edit" || name === "MultiEdit"
            ? "Edited"
            : name;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full min-w-0 items-center gap-1.5 py-0.5 text-left text-[11px] text-white/40 transition hover:text-white/65"
      >
        <span className="shrink-0 font-medium text-white/50">{verb}</span>
        {detail ? <span className="min-w-0 truncate font-mono">{detail}</span> : null}
      </button>
      {open && (
        <pre className="mb-1 max-h-40 overflow-auto rounded-[8px] border border-line px-2 py-1.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-white/50" style={{ background: CARD }}>
          {typeof input === "string" ? input : JSON.stringify(input, null, 2)}
        </pre>
      )}
    </div>
  );
}

/* ── Capacity ────────────────────────────────────────────────────────────── */

function Capacity() {
  const { data, loading } = useAdminData<{
    runningSandboxes: number;
    pausedSandboxes: number;
    sandboxSource: "e2b" | "db";
    sandboxCap: number;
    sandboxUtilizationPct: number;
    liveDeployments: number;
    anthropicSpendCents30d: number;
    liveSandboxes: Array<{
      sandboxId: string;
      state: "running" | "paused";
      startedAt: string | null;
      e2bUrl: string | null;
      projectId: string | null;
      projectName: string | null;
      userId: string | null;
      userEmail: string | null;
    }>;
  }>("/v1/admin/capacity");
  const sub =
    data?.sandboxSource === "db"
      ? "Live infrastructure usage. (E2B unreachable — showing last-known status.)"
      : "Live infrastructure usage, straight from E2B.";

  const util = useMemo(() => {
    if (!data) return [];
    const used = data.runningSandboxes;
    const free = Math.max(0, data.sandboxCap - used);
    return [
      { name: "In use", value: used },
      { name: "Available", value: free },
    ];
  }, [data]);

  const stack = useMemo(() => {
    if (!data) return [];
    return [
      { name: "Running", value: data.runningSandboxes },
      { name: "Paused", value: data.pausedSandboxes },
      { name: "Live apps", value: data.liveDeployments },
    ];
  }, [data]);

  return (
    <>
      <PageTitle sub={sub}>Capacity</PageTitle>
      {loading || !data ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Active sandboxes"
              value={`${data.runningSandboxes} / ${data.sandboxCap}`}
              hint={`${data.sandboxUtilizationPct}% of cap · burning compute`}
            />
            <Stat label="Paused sandboxes" value={data.pausedSandboxes} hint="Idle — cheap storage only" />
            <Stat label="Live deployments" value={data.liveDeployments} />
            <Stat label="Anthropic spend (30d)" value={usd(data.anthropicSpendCents30d)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Sandbox utilization" sub={`${data.sandboxUtilizationPct}% of soft cap`}>
              <div className="relative flex h-64 items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={util} dataKey="value" nameKey="name" innerRadius={60} outerRadius={88} paddingAngle={2}>
                      <Cell fill="#6366f1" />
                      <Cell fill="rgba(148,163,184,0.25)" />
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div className="text-center">
                    <p className="text-3xl font-semibold text-fg">{data.sandboxUtilizationPct}%</p>
                    <p className="text-xs text-muted">utilized</p>
                  </div>
                </div>
              </div>
            </ChartCard>
            <ChartCard title="Workload mix" sub="Running vs paused vs published">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stack} barSize={36}>
                    <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" name="Count" radius={[8, 8, 0, 0]}>
                      {stack.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          <h2 className="text-sm font-semibold text-fg">Live sandboxes</h2>
          <p className="mb-2 text-xs text-muted">
            Direct E2B preview URLs. Open these to see what the user is building (branded{" "}
            <span className="font-mono">*.mythex.ai</span> previews require their session). Running first,
            then newest paused — max 50 rows.
          </p>
          <Table
            head={["State", "User", "Project", "E2B preview", "Started"]}
            emptyTitle="No live sandboxes"
            emptyHint="Nothing running or paused on E2B right now."
          >
            {(data.liveSandboxes ?? []).map((s) => (
              <tr key={s.sandboxId} className="hover:bg-white/[0.04]">
                <td className="px-4 py-2.5">
                  <Badge tone={s.state === "running" ? "emerald" : "amber"}>{s.state}</Badge>
                </td>
                <td className="px-4 py-2.5">
                  {s.userId ? (
                    <Link to={`/admin/users/${s.userId}`} className="text-fg hover:underline">
                      {s.userEmail}
                    </Link>
                  ) : (
                    <span className="text-muted">orphan</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-fg-2">{s.projectName ?? "—"}</td>
                <td className="px-4 py-2.5">
                  {s.e2bUrl ? (
                    <a
                      href={s.e2bUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-xs text-fg hover:underline"
                    >
                      {s.e2bUrl.replace(/^https:\/\//, "")}
                      <ExternalLink className="h-3 w-3 shrink-0 text-muted" />
                    </a>
                  ) : (
                    <span className="font-mono text-xs text-muted">{s.sandboxId}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted">{dt(s.startedAt)}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </>
  );
}

/* ── Alerts ──────────────────────────────────────────────────────────────── */

function Alerts() {
  const { data, loading } = useAdminData<{
    losingRuns: Array<{ id: string; createdAt: string; userEmail: string; projectName: string; costCents: number; rawCostCents: number; lossCents: number }>;
    negativeBalances: Array<{ id: string; email: string; plan: string; balanceTokens: number }>;
  }>("/v1/admin/alerts");
  return (
    <>
      <PageTitle sub="Runs losing money and accounts out of tokens.">Alerts</PageTitle>
      {loading || !data ? (
        <Loading />
      ) : (
        <>
          <h2 className="mb-2 text-sm font-semibold text-fg">Negative-margin runs</h2>
          <Table head={["When", "User", "Project", "Charged", "Cost", "Loss"]} emptyTitle="No losing runs" emptyHint="All recent runs are at a healthy margin.">
            {data.losingRuns.map((r) => (
              <tr key={r.id} className="hover:bg-white/[0.04]">
                <td className="px-4 py-2.5 text-muted">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="px-4 py-2.5 text-fg-2">{r.userEmail}</td>
                <td className="px-4 py-2.5 text-fg-2">{r.projectName}</td>
                <td className="px-4 py-2.5 text-fg-2">{usd(r.costCents)}</td>
                <td className="px-4 py-2.5 text-fg-2">{usd(r.rawCostCents)}</td>
                <td className="px-4 py-2.5 text-red-400">{usd(r.lossCents)}</td>
              </tr>
            ))}
          </Table>

          <h2 className="mb-2 mt-6 text-sm font-semibold text-fg">Zero / negative balances</h2>
          <Table head={["User", "Plan", "Balance"]} emptyTitle="No empty balances" emptyHint="Every account still has tokens.">
            {data.negativeBalances.map((u) => (
              <tr key={u.id} className="hover:bg-white/[0.04]">
                <td className="px-4 py-2.5">
                  <Link to={`/admin/users/${u.id}`} className="text-fg hover:underline">
                    {u.email}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-fg-2">{u.plan}</td>
                <td className="px-4 py-2.5 text-fg-2">{formatTokens(u.balanceTokens)}</td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </>
  );
}

/* ── Deployments ─────────────────────────────────────────────────────────── */

function Deployments() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("LIVE");
  const [killingId, setKillingId] = useState<string | null>(null);
  const [confirmKill, setConfirmKill] = useState<{ projectId: string; slug: string } | null>(null);
  const dq = useDebounced(q);
  const params = new URLSearchParams({ page: String(page), pageSize: "25", status });
  if (dq) params.set("q", dq);
  const { data, loading, reload } = useAdminData<{
    total: number;
    page: number;
    pageSize: number;
    deployments: Array<{
      id: string;
      slug: string;
      url: string | null;
      status: string;
      error: string | null;
      projectId: string;
      projectName: string;
      suspended: boolean;
      ownerEmail: string;
      ownerPlan: string;
      hostingCostCents: number;
      computeHours: number;
    }>;
  }>(`/v1/admin/deployments?${params}`);
  const toast = useToast();

  const suspend = async (projectId: string, slug: string) => {
    if (killingId) return;
    setConfirmKill(null);
    setKillingId(projectId);
    toast("info", `Killing ${slug}… (unpublish + sandbox can take a minute)`);
    try {
      await api.post(`/v1/admin/projects/${projectId}/suspend`);
      toast("success", `${slug} suspended and taken offline.`);
      reload();
    } catch {
      toast("error", `Couldn't kill ${slug}.`);
    } finally {
      setKillingId(null);
    }
  };

  const unsuspend = async (projectId: string, slug: string) => {
    if (killingId) return;
    setKillingId(projectId);
    try {
      await api.post(`/v1/admin/projects/${projectId}/unsuspend`);
      toast("success", `${slug} unsuspended.`);
      reload();
    } catch {
      toast("error", `Couldn't unsuspend ${slug}.`);
    } finally {
      setKillingId(null);
    }
  };

  return (
    <>
      <PageTitle
        sub="Published apps and hosting cost. Kill unpublishes the app and tears down the sandbox — can take up to a minute."
        action={
          <button
            type="button"
            className="btn-secondary !py-1.5"
            onClick={() =>
              void apiDownload("/v1/admin/deployments/export", "deployments.csv").catch(() =>
                toast("error", "Export failed."),
              )
            }
          >
            Export CSV
          </button>
        }
      >
        Deployments
      </PageTitle>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
          placeholder="Search slug, app, or owner…"
          className="h-9 max-w-xs rounded-[10px] border border-line px-3 text-sm text-white outline-none placeholder:text-white/40"
          style={{ background: CARD }}
        />
        {(["LIVE", "FAILED", "SUSPENDED", "STOPPED", "ALL"] as const).map((s) => (
          <Pill
            key={s}
            active={status === s}
            onClick={() => {
              setPage(1);
              setStatus(s);
            }}
          >
            {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
          </Pill>
        ))}
      </div>
      {loading || !data ? (
        <Loading />
      ) : (
        <>
          <Table head={["App", "Status", "Owner", "Compute", "Cost", ""]} emptyTitle="No deployments yet" emptyHint="Published apps and hosting cost will show up here.">
            {data.deployments.map((d) => {
              const busy = killingId === d.projectId;
              const tone =
                d.status === "LIVE"
                  ? "emerald"
                  : d.status === "FAILED" || d.status === "SUSPENDED"
                    ? "red"
                    : d.status === "STOPPED"
                      ? "zinc"
                      : "amber";
              return (
                <tr key={d.id} className="hover:bg-white/[0.04]">
                  <td className="px-4 py-2.5">
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noreferrer" className="font-medium text-fg hover:underline">
                        {d.slug}
                      </a>
                    ) : (
                      <span className="font-medium text-fg">{d.slug}</span>
                    )}
                    <div className="text-xs text-muted">
                      {d.projectName}
                      {d.suspended && (
                        <>
                          {" · "}
                          <Badge tone="red">suspended</Badge>
                        </>
                      )}
                    </div>
                    {d.error && d.status === "FAILED" && (
                      <div className="mt-1 max-w-xs truncate text-xs text-red-400" title={d.error}>
                        {d.error}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={tone}>{d.status.toLowerCase()}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-fg-2">
                    {d.ownerEmail} <span className="text-muted">({d.ownerPlan})</span>
                  </td>
                  <td className="px-4 py-2.5 text-fg-2">{d.computeHours} hrs</td>
                  <td className="px-4 py-2.5 text-fg-2">{usd(d.hostingCostCents)}</td>
                  <td className="px-4 py-2.5 text-right space-x-3">
                    {d.suspended ? (
                      <button
                        type="button"
                        disabled={Boolean(killingId)}
                        onClick={() => void unsuspend(d.projectId, d.slug)}
                        className="text-fg hover:underline disabled:cursor-wait disabled:opacity-50"
                      >
                        {busy ? <Spinner size={14} /> : "Unsuspend"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={Boolean(killingId)}
                        onClick={() => setConfirmKill({ projectId: d.projectId, slug: d.slug })}
                        className={`text-red-400 hover:underline disabled:cursor-wait disabled:opacity-50 ${busy ? "font-medium" : ""}`}
                      >
                        {busy ? <Spinner size={14} /> : "Kill"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
      {confirmKill && (
        <ConfirmDialog
          title="Kill deployment?"
          subtitle={`Unpublish “${confirmKill.slug}” and tear down its sandbox. This can take up to a minute.`}
          confirmLabel="Kill"
          danger
          busy={Boolean(killingId)}
          onClose={() => setConfirmKill(null)}
          onConfirm={() => void suspend(confirmKill.projectId, confirmKill.slug)}
        />
      )}
    </>
  );
}

/* ── Abuse ───────────────────────────────────────────────────────────────── */

function Abuse() {
  const [status, setStatus] = useState<"open" | "all" | "resolved" | "dismissed">("open");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data, loading, reload } = useAdminData<{
    reports: Array<{ id: string; projectId: string | null; reason: string; details: string | null; status: string; reporterEmail: string | null; createdAt: string }>;
    page: number;
    pageSize: number;
    total: number;
  }>(`/v1/admin/abuse?status=${status}&page=${page}&pageSize=25`);
  const toast = useToast();

  const resolve = async (id: string, next: string) => {
    try {
      await api.post(`/v1/admin/abuse/${id}/resolve`, { status: next });
      toast("success", "Report updated.");
      reload();
    } catch {
      toast("error", "Couldn't update the report.");
    }
  };

  const suspendProject = async (projectId: string, reportId: string) => {
    setBusyId(reportId);
    try {
      await api.post(`/v1/admin/projects/${projectId}/suspend`);
      await api.post(`/v1/admin/abuse/${reportId}/resolve`, { status: "resolved" });
      toast("success", "Project suspended and report resolved.");
      reload();
    } catch {
      toast("error", "Couldn't suspend the project.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageTitle
        sub="Abuse reports against published apps."
        action={
          <button
            type="button"
            className="btn-secondary !py-1.5"
            onClick={() =>
              void apiDownload(`/v1/admin/abuse/export?status=${status}`, "abuse.csv").catch(() =>
                toast("error", "Export failed."),
              )
            }
          >
            Export CSV
          </button>
        }
      >
        Abuse
      </PageTitle>
      <div className="mb-4 flex flex-wrap gap-2">
        {(["open", "resolved", "dismissed", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            className={status === s ? "btn-primary !py-1.5" : "btn-ghost !py-1.5"}
          >
            {s}
          </button>
        ))}
      </div>
      {loading || !data ? (
        <Loading />
      ) : data.reports.length === 0 ? (
        <EmptyState title="No reports" hint="Abuse reports will land here when someone flags a published app." icon={Flag} />
      ) : (
        <>
          <div className="space-y-2">
            {data.reports.map((r) => (
              <div key={r.id} className="rounded-[12px] border border-line p-4" style={{ background: CARD }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-fg">{r.reason}</p>
                    {r.details && <p className="mt-0.5 text-sm text-fg-2">{r.details}</p>}
                    <p className="mt-1 text-xs text-muted">
                      {new Date(r.createdAt).toLocaleString()}
                      {r.reporterEmail && ` · ${r.reporterEmail}`}
                      {r.projectId && (
                        <>
                          {" · "}
                          <Link to={`/admin/users`} className="text-fg hover:underline">
                            project {r.projectId}
                          </Link>
                        </>
                      )}
                      {" · "}
                      <Badge tone={r.status === "open" ? "amber" : "zinc"}>{r.status}</Badge>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    {r.projectId && r.status === "open" && (
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void suspendProject(r.projectId!, r.id)}
                        className="btn-secondary !py-1.5 text-red-400"
                      >
                        {busyId === r.id ? <Spinner size={14} /> : "Suspend"}
                      </button>
                    )}
                    {r.status === "open" && (
                      <>
                        <button onClick={() => void resolve(r.id, "resolved")} className="btn-secondary !py-1.5">
                          Resolve
                        </button>
                        <button onClick={() => void resolve(r.id, "dismissed")} className="btn-ghost !py-1.5">
                          Dismiss
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}

/* ── Audit log ───────────────────────────────────────────────────────────── */

/* ── Email log ───────────────────────────────────────────────────────────── */

const EMAIL_TYPES = [
  { value: "all", label: "All types" },
  { value: "verification", label: "Verification" },
  { value: "password_reset", label: "Password reset" },
  { value: "workspace_invite", label: "Workspace invite" },
  { value: "low_credits", label: "Low credits" },
  { value: "daily_refill", label: "Daily refill" },
  { value: "hosting_paused", label: "Hosting paused" },
  { value: "hosting_resumed", label: "Hosting resumed" },
  { value: "payment_failed", label: "Payment failed" },
  { value: "plan_ended", label: "Plan ended" },
  { value: "publish_failed", label: "Publish failed" },
  { value: "domain_purchased", label: "Domain purchased" },
  { value: "domain_failed", label: "Domain failed" },
  { value: "project_suspended", label: "Project suspended" },
  { value: "trial_offer", label: "Trial offer" },
  { value: "trial_offer_preview", label: "Trial offer preview" },
  { value: "credits_refresh", label: "Credits refresh" },
  { value: "credits_refresh_preview", label: "Credits refresh preview" },
  { value: "ops_alert", label: "Ops alert" },
];

interface EmailLogRow {
  id: string;
  to: string;
  type: string;
  subject: string;
  status: string;
  error: string | null;
  createdAt: string;
  user: { id: string; email: string; name: string } | null;
}

type MinVersions = { ios: string | null; android: string | null };

/**
 * The oldest store version of the iOS and Android apps still allowed. An app
 * older than it shows "Update required" over everything, with a button to its
 * store page, from its next launch or return to the foreground
 * (lib/force-update.ts). Empty: no minimum.
 */
function MobileApp() {
  const toast = useToast();
  const { data, reload } = useAdminData<MinVersions>("/v1/admin/app-min-version");
  const [draft, setDraft] = useState<MinVersions>({ ios: "", android: "" });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (data) setDraft({ ios: data.ios ?? "", android: data.android ?? "" });
  }, [data]);
  const valid = (v: string | null) => !v || /^\d+(\.\d+){0,2}$/.test(v.trim());
  const changed = !!data && ((draft.ios ?? "") !== (data.ios ?? "") || (draft.android ?? "") !== (data.android ?? ""));

  async function save() {
    setBusy(true);
    try {
      await api.patch("/v1/admin/app-min-version", { ios: draft.ios?.trim() ?? "", android: draft.android?.trim() ?? "" });
      toast("success", "Minimum versions saved.");
      reload();
    } catch {
      toast("error", "Request failed.");
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  const row = (platform: "ios" | "android", label: string, store: string) => (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-20 text-sm text-fg">{label}</span>
      <input
        value={draft[platform] ?? ""}
        onChange={(e) => setDraft((d) => ({ ...d, [platform]: e.target.value }))}
        placeholder="No minimum"
        inputMode="decimal"
        className="h-9 w-40 rounded-[10px] border border-line px-3 text-sm text-white tabular-nums outline-none placeholder:text-white/40"
        style={{ background: "#1c1c1c", borderColor: valid(draft[platform]) ? undefined : "rgb(248 113 113)" }}
      />
      <a href={store} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        Store page <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );

  return (
    <div>
      <PageTitle sub="The iOS and Android apps from the stores.">Mobile app</PageTitle>
      <div className="mb-6 max-w-2xl rounded-[12px] border border-line p-4" style={{ background: CARD }}>
        <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">Force update</p>
        <p className="mt-1 text-sm font-medium text-fg">Minimum store version</p>
        <p className="mt-1 text-xs text-muted">
          An app older than this shows “Update required” over everything, with a button to its store
          page, from its next launch or return to the app. Only set a version that is already live in
          that store. Leave empty for no minimum.
        </p>
        {!data ? (
          <p className="mt-4 text-xs text-muted">Loading…</p>
        ) : (
          <div className="mt-4 space-y-3">
            {row("ios", "iOS", "https://apps.apple.com/app/id6823479848")}
            {row("android", "Android", "https://play.google.com/store/apps/details?id=ai.mythex.app")}
            <div className="pt-1">
              <button
                type="button"
                className="btn-primary !py-1.5"
                disabled={busy || !changed || !valid(draft.ios) || !valid(draft.android)}
                onClick={() => setConfirm(true)}
              >
                {busy ? <Spinner size={14} /> : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
      {confirm && (
        <ConfirmDialog
          title="Change minimum app versions?"
          subtitle={`iOS: ${draft.ios?.trim() || "no minimum"} · Android: ${draft.android?.trim() || "no minimum"}. Anyone on an older app is blocked until they update.`}
          confirmLabel="Save"
          busy={busy}
          onConfirm={() => void save()}
          onClose={() => setConfirm(false)}
        />
      )}
    </div>
  );
}

interface TrialOfferCampaignData {
  trialDays: number;
  dPlusOneEnabled: boolean;
  eligibleCount: number;
  alreadySentCount: number;
}

function TrialOfferCampaign() {
  const toast = useToast();
  const { data, loading, reload } = useAdminData<TrialOfferCampaignData>(
    "/v1/admin/email-campaigns/trial-offer",
  );
  const [previewTo, setPreviewTo] = useState("");
  const [busy, setBusy] = useState<"preview" | "toggle" | "send" | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);

  async function run(kind: "preview" | "toggle" | "send", fn: () => Promise<unknown>, ok: string) {
    setBusy(kind);
    try {
      await fn();
      toast("success", ok);
      reload();
      return true;
    } catch {
      toast("error", "Request failed.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mb-6 rounded-[12px] border border-line p-4" style={{ background: CARD }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">Campaign</p>
          <p className="mt-1 text-sm font-medium text-fg">3-day Pro trial offer</p>
          <p className="mt-1 max-w-xl text-xs text-muted">
            Day-after signup to Free users who never started a trial. One-shot send is the same
            audience, minus anyone already emailed. Preview first — it does not count as sent.
          </p>
        </div>
        {data && (
          <button
            type="button"
            disabled={busy !== null}
            className={data.dPlusOneEnabled ? "btn-secondary !py-1.5" : "btn-primary !py-1.5"}
            onClick={() =>
              void run(
                "toggle",
                () =>
                  api.patch("/v1/admin/email-campaigns/trial-offer", {
                    dPlusOneEnabled: !data.dPlusOneEnabled,
                  }),
                data.dPlusOneEnabled ? "Day-after emails off." : "Day-after emails on.",
              )
            }
          >
            {busy === "toggle" ? <Spinner size={14} /> : data.dPlusOneEnabled ? "Day-after on" : "Day-after off"}
          </button>
        )}
      </div>
      {loading || !data ? (
        <p className="mt-4 text-xs text-muted">Loading audience…</p>
      ) : (
        <>
          <p className="mt-4 text-sm text-fg-2">
            <span className="text-fg font-medium">{data.eligibleCount.toLocaleString()}</span> eligible
            <span className="text-muted"> · </span>
            <span className="text-fg font-medium">{data.alreadySentCount.toLocaleString()}</span> already sent
            <span className="text-muted"> · </span>
            {data.trialDays}-day trial
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              value={previewTo}
              onChange={(e) => setPreviewTo(e.target.value)}
              placeholder="preview@email.com"
              className="h-9 min-w-56 flex-1 rounded-[10px] border border-line px-3 text-sm text-white outline-none placeholder:text-white/40"
              style={{ background: "#1c1c1c" }}
            />
            <button
              type="button"
              disabled={busy !== null || !previewTo.includes("@")}
              className="btn-secondary !py-1.5"
              onClick={() =>
                void run(
                  "preview",
                  () => api.post("/v1/admin/email-campaigns/trial-offer/preview", { to: previewTo.trim() }),
                  `Preview sent to ${previewTo.trim()}.`,
                )
              }
            >
              {busy === "preview" ? <Spinner size={14} /> : "Send preview"}
            </button>
            <button
              type="button"
              disabled={busy !== null || data.eligibleCount < 1}
              className="btn-primary !py-1.5"
              onClick={() => setConfirmSend(true)}
            >
              Email eligible…
            </button>
          </div>
        </>
      )}
      {confirmSend && data && (
        <ConfirmDialog
          title="Email eligible Free users?"
          subtitle={`This sends the 3-day trial offer to ${data.eligibleCount.toLocaleString()} verified Free accounts that never used a trial and didn’t unsubscribe. It will not email Pro, admins, or anyone already sent.`}
          confirmLabel={`Send to ${data.eligibleCount.toLocaleString()}`}
          danger
          busy={busy === "send"}
          onClose={() => setConfirmSend(false)}
          onConfirm={() =>
            void run(
              "send",
              () =>
                api.post("/v1/admin/email-campaigns/trial-offer/send", { confirm: "SEND_TRIAL_OFFER" }),
              "Campaign send started.",
            ).then((ok) => {
              if (ok) setConfirmSend(false);
            })
          }
        />
      )}
    </div>
  );
}

interface CreditsRefreshCampaignData {
  eligibleCount: number;
  alreadySentCount: number;
  running: boolean;
}

function CreditsRefreshCampaign() {
  const toast = useToast();
  const { data, loading, reload } = useAdminData<CreditsRefreshCampaignData>(
    "/v1/admin/email-campaigns/credits-refresh",
  );
  const [previewTo, setPreviewTo] = useState("");
  const [busy, setBusy] = useState<"preview" | "send" | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    if (!data?.running) return;
    const timer = window.setInterval(() => reloadRef.current(), 4000);
    return () => window.clearInterval(timer);
  }, [data?.running]);

  async function run(kind: "preview" | "send", fn: () => Promise<unknown>, ok: string) {
    setBusy(kind);
    try {
      await fn();
      toast("success", ok);
      reload();
      return true;
    } catch {
      toast("error", "Request failed.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mb-6 rounded-[12px] border border-line p-4" style={{ background: CARD }}>
      <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">Campaign</p>
      <p className="mt-1 text-sm font-medium text-fg">Your credits now do more</p>
      <p className="mt-1 max-w-xl text-xs text-muted">
        One send to verified Free accounts that still want product email. Pro, admins, and test
        inboxes are left out. Preview does not count as sent. A second send skips anyone already mailed.
      </p>
      {loading || !data ? (
        <p className="mt-4 text-xs text-muted">Loading audience…</p>
      ) : (
        <>
          <p className="mt-4 text-sm text-fg-2">
            <span className="text-fg font-medium">{data.eligibleCount.toLocaleString()}</span> eligible
            <span className="text-muted"> · </span>
            <span className="text-fg font-medium">{data.alreadySentCount.toLocaleString()}</span> already sent
            {data.running && <span className="text-muted"> · sending</span>}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              value={previewTo}
              onChange={(e) => setPreviewTo(e.target.value)}
              placeholder="preview@email.com"
              className="h-9 min-w-56 flex-1 rounded-[10px] border border-line px-3 text-sm text-white outline-none placeholder:text-white/40"
              style={{ background: "#1c1c1c" }}
            />
            <button
              type="button"
              disabled={busy !== null || !previewTo.includes("@")}
              className="btn-secondary !py-1.5"
              onClick={() =>
                void run(
                  "preview",
                  () => api.post("/v1/admin/email-campaigns/credits-refresh/preview", { to: previewTo.trim() }),
                  `Preview sent to ${previewTo.trim()}.`,
                )
              }
            >
              {busy === "preview" ? <Spinner size={14} /> : "Send preview"}
            </button>
            <button
              type="button"
              disabled={busy !== null || data.running || data.eligibleCount < 1}
              className="btn-primary !py-1.5"
              onClick={() => setConfirmSend(true)}
            >
              {data.running ? "Sending…" : "Email eligible…"}
            </button>
          </div>
        </>
      )}
      {confirmSend && data && (
        <ConfirmDialog
          title="Email eligible Free users?"
          subtitle={`This sends “Your credits now do more” to ${data.eligibleCount.toLocaleString()} verified Free accounts that didn’t unsubscribe. It will not email Pro, admins, test inboxes, or anyone already sent.`}
          confirmLabel={`Send to ${data.eligibleCount.toLocaleString()}`}
          danger
          busy={busy === "send"}
          onClose={() => setConfirmSend(false)}
          onConfirm={() =>
            void run(
              "send",
              () =>
                api.post("/v1/admin/email-campaigns/credits-refresh/send", { confirm: "SEND_CREDITS_REFRESH" }),
              "Campaign send started.",
            ).then((ok) => {
              if (ok) setConfirmSend(false);
            })
          }
        />
      )}
    </div>
  );
}

function EmailLogs() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const toast = useToast();
  const dq = useDebounced(q);
  const params = new URLSearchParams({ page: String(page), pageSize: "50" });
  if (dq) params.set("q", dq);
  if (type !== "all") params.set("type", type);
  if (status !== "all") params.set("status", status);
  const { data, loading } = useAdminData<{ total: number; page: number; pageSize: number; logs: EmailLogRow[] }>(
    `/v1/admin/email-logs?${params}`,
  );

  const resetPage = () => setPage(1);

  return (
    <>
      <PageTitle
        sub={data ? `${data.total} emails sent` : "Every transactional email the app has attempted to send."}
        action={
          <button
            type="button"
            className="btn-secondary !py-1.5"
            onClick={() =>
              void apiDownload("/v1/admin/email-logs/export", "email-logs.csv").catch(() =>
                toast("error", "Export failed."),
              )
            }
          >
            Export CSV
          </button>
        }
      >
        Emails
      </PageTitle>
      <TrialOfferCampaign />
      <CreditsRefreshCampaign />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => {
            resetPage();
            setQ(e.target.value);
          }}
          placeholder="Search recipient email…"
          className="h-9 max-w-xs rounded-[10px] border border-line px-3 text-sm text-white outline-none placeholder:text-white/40"
          style={{ background: CARD }}
        />
        <FilterSelect
          value={type}
          onChange={(v) => {
            resetPage();
            setType(v);
          }}
          options={EMAIL_TYPES}
        />
        <FilterSelect
          value={status}
          onChange={(v) => {
            resetPage();
            setStatus(v);
          }}
          options={[
            { value: "all", label: "Any status" },
            { value: "sent", label: "Sent" },
            { value: "failed", label: "Failed" },
          ]}
        />
      </div>
      {loading || !data ? (
        <Loading />
      ) : (
        <>
          <Table head={["When", "To", "Type", "Subject", "Status"]} emptyTitle="No emails sent yet" emptyHint="Transactional emails will appear here as they're sent.">
            {data.logs.map((l) => (
              <tr key={l.id} className="hover:bg-white/[0.04]">
                <td className="px-4 py-2.5 text-muted">{new Date(l.createdAt).toLocaleString()}</td>
                <td className="px-4 py-2.5">
                  {l.user ? (
                    <Link to={`/admin/users/${l.user.id}`} className="text-fg-2 hover:underline">
                      {l.to}
                    </Link>
                  ) : (
                    <span className="text-fg-2">{l.to}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-fg-2">{EMAIL_TYPES.find((t) => t.value === l.type)?.label ?? l.type}</td>
                <td className="px-4 py-2.5 text-fg-2">{l.subject}</td>
                <td className="px-4 py-2.5">
                  {l.status === "sent" ? (
                    <Badge tone="emerald">sent</Badge>
                  ) : (
                    <span title={l.error ?? undefined}>
                      <Badge tone="red">failed</Badge>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}

function Audit() {
  const [page, setPage] = useState(1);
  const toast = useToast();
  const { data, loading } = useAdminData<{
    total: number;
    page: number;
    pageSize: number;
    actions: Array<{ id: string; action: string; targetId: string | null; meta: unknown; createdAt: string; actor: { email: string; name: string } }>;
  }>(`/v1/admin/audit?page=${page}&pageSize=50`);

  return (
    <>
      <PageTitle
        sub="Every privileged admin action."
        action={
          <button
            type="button"
            className="btn-secondary !py-1.5"
            onClick={() =>
              void apiDownload("/v1/admin/audit/export", "audit.csv").catch(() => toast("error", "Export failed."))
            }
          >
            Export CSV
          </button>
        }
      >
        Audit log
      </PageTitle>
      {loading || !data ? (
        <Loading />
      ) : (
        <>
          <Table head={["When", "Admin", "Action", "Target", "Details"]} emptyTitle="No audit events" emptyHint="Privileged admin actions are logged here.">
            {data.actions.map((a) => (
              <tr key={a.id} className="hover:bg-white/[0.04]">
                <td className="px-4 py-2 text-muted">{new Date(a.createdAt).toLocaleString()}</td>
                <td className="px-4 py-2 text-fg-2">{a.actor.email}</td>
                <td className="px-4 py-2 text-fg-2">{a.action}</td>
                <td className="px-4 py-2 font-mono text-xs text-muted">{a.targetId ?? "—"}</td>
                <td className="px-4 py-2 text-xs text-muted">{a.meta ? JSON.stringify(a.meta) : "—"}</td>
              </tr>
            ))}
          </Table>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}

/* ── Small UI helpers ────────────────────────────────────────────────────── */

export function Badge({ children, tone }: { children: ReactNode; tone: "violet" | "red" | "amber" | "zinc" | "emerald" }) {
  const tones: Record<string, string> = {
    violet: "bg-violet-500/20 text-violet-300",
    red: "bg-red-500/20 text-red-300",
    amber: "bg-amber-500/20 text-amber-300",
    zinc: "bg-hover text-fg",
    emerald: "bg-emerald-500/20 text-emerald-300",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-sm text-muted">
      <span>
        {from}–{to} of {total.toLocaleString()}
      </span>
      {pages > 1 && (
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="btn-secondary py-1.5!">
            Previous
          </button>
          <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="btn-secondary py-1.5!">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
