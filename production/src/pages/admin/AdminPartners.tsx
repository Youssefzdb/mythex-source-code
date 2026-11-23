import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { Spinner, useToast } from "../../components/ui";
import { Badge, CARD, PageTitle, Stat, Table, dt, usd, useAdminData } from "./AdminApp";

/**
 * Admin → Partners: approve applications (/partners), see what each partner
 * is owed, and record the payouts sent by hand (PayPal or Wise).
 * API: apps/api/src/routes/referrals.ts.
 */

type Application = {
  id: string;
  track: "expert" | "agency" | "creator";
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  website: string;
  country: string;
  companySize: string;
  description: string;
  goals: string;
  taxId: string | null;
  status: string;
  createdAt: string;
  account: { id: string; plan: string; planOk: boolean } | null;
};

type PartnerRow = {
  id: string;
  code: string;
  track: string;
  status: string;
  name: string;
  email: string;
  plan: string;
  planOk: boolean;
  clicks: number;
  signups: number;
  payingClients: number;
  payoutMethod: string | null;
  payoutEmail: string | null;
  pendingCents: number;
  payableCents: number;
  paidCents: number;
  readyToPay: boolean;
};

type PartnersResponse = { minPayoutCents: number; applications: Application[]; partners: PartnerRow[] };

const errText = (err: unknown) => {
  const b = err instanceof ApiError ? (err.body as { error?: string; plan?: string; needs?: string; email?: string; code?: string } | undefined) : undefined;
  switch (b?.error) {
    case "user_not_found":
      return `No Mythex account for ${b.email}. Ask them to sign up first, or enter the email they use.`;
    case "plan_required":
      return `They're on ${b.plan}; this track needs ${b.needs}. Approve anyway to let them in now (they earn nothing until they upgrade).`;
    case "code_taken":
      return `The link code "${b.code}" is taken. Choose another.`;
    case "already_partner":
      return "That account is already a partner.";
    case "below_minimum":
      return "Less than the minimum payout is owed. Pay anyway?";
    case "nothing_payable":
      return "Nothing is payable yet (commissions become payable 30 days after the payment).";
    default:
      return "Something went wrong.";
  }
};

export function AdminPartners() {
  const { data, loading, reload } = useAdminData<PartnersResponse>("/v1/admin/partners");
  const [showAll, setShowAll] = useState(false);
  if (loading && !data) return <Spinner size={20} />;
  if (!data) return <p className="text-sm text-muted">Couldn't load partners.</p>;
  const apps = data.applications.filter((a) => showAll || a.status === "new");
  const owed = data.partners.reduce((s, p) => s + p.payableCents, 0);
  return (
    <div>
      <PageTitle
        sub="The partner program (creators for now: $50 for each new Pro subscriber, $100 for Business or Enterprise, once per person): applications, partners, and what they're owed. Payout day is the 1st: the partners feed in Telegram gets the list."
        action={<PayoutPreviewButton />}
      >
        Partners
      </PageTitle>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="New applications" value={data.applications.filter((a) => a.status === "new").length} />
        <Stat label="Partners" value={data.partners.length} />
        <Stat label="Paying clients" value={data.partners.reduce((s, p) => s + p.payingClients, 0)} />
        <Stat label="To pay now" value={usd(owed)} hint={`Payouts from ${usd(data.minPayoutCents)}`} />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">Applications</h2>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show decided
        </label>
      </div>
      <div className="mb-8 space-y-3">
        {apps.length === 0 && <p className="rounded-[12px] border border-line p-4 text-sm text-muted" style={{ background: CARD }}>No applications waiting.</p>}
        {apps.map((a) => (
          <ApplicationCard key={a.id} a={a} onDone={reload} />
        ))}
      </div>

      <h2 className="mb-3 text-sm font-semibold text-fg">Partners</h2>
      <Table head={["Partner", "Track", "Link", "Clicks", "Sign-ups", "Paying", "Waiting", "To pay", "Paid", ""]} emptyTitle="No partners yet" emptyHint="Approve an application to create one.">
        {data.partners.map((p) => (
          <tr key={p.id}>
            <td className="px-4 py-3">
              <p className="font-medium">{p.name}</p>
              <p className="text-xs text-muted">
                {p.email} · {p.plan}
                {!p.planOk && <span className="ms-1 text-amber-300">(below track plan)</span>}
              </p>
            </td>
            <td className="px-4 py-3 capitalize">{p.track}</td>
            <td className="px-4 py-3 font-mono text-xs">?ref={p.code}</td>
            <td className="px-4 py-3">{p.clicks}</td>
            <td className="px-4 py-3">{p.signups}</td>
            <td className="px-4 py-3">{p.payingClients}</td>
            <td className="px-4 py-3">{usd(p.pendingCents)}</td>
            <td className="px-4 py-3">{p.readyToPay ? <Badge tone="emerald">{usd(p.payableCents)}</Badge> : usd(p.payableCents)}</td>
            <td className="px-4 py-3">{usd(p.paidCents)}</td>
            <td className="px-4 py-3 text-end">
              <Link to={`/admin/partners/${p.id}`} className="text-sm underline underline-offset-2">
                Open
              </Link>
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

/** Post this month's payout list to the partners feed now (as the 1st will; nobody is emailed). */
function PayoutPreviewButton() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ due: number }>("/v1/admin/partners/payout-reminder", {});
      toast("success", r.due ? `Sent to Telegram: ${r.due} partner${r.due === 1 ? "" : "s"} to pay.` : "Sent to Telegram: nobody to pay right now.");
    } catch {
      toast("error", "Couldn't send it. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" disabled={busy} onClick={() => void run()} className="btn-ghost !py-1.5" title="Posts who to pay to the partners Telegram feed, as on the 1st. Nobody is emailed.">
      {busy ? <Spinner size={12} /> : "Preview payout alert"}
    </button>
  );
}

function ApplicationCard({ a, onDone }: { a: Application; onDone: () => void }) {
  const toast = useToast();
  const [track, setTrack] = useState(a.track);
  const [code, setCode] = useState(
    (a.company || `${a.firstName}-${a.lastName}`)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40),
  );
  const [userEmail, setUserEmail] = useState(a.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needForce, setNeedForce] = useState(false);

  const approve = async (force = false) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ link: string }>(`/v1/admin/partner-applications/${a.id}/approve`, { track, code, userEmail, force });
      toast("success", `Approved: ${r.link} (emailed to them)`);
      onDone();
    } catch (err) {
      setError(errText(err));
      setNeedForce(err instanceof ApiError && (err.body as { error?: string })?.error === "plan_required");
    } finally {
      setBusy(false);
    }
  };
  const decline = async () => {
    setBusy(true);
    try {
      await api.post(`/v1/admin/partner-applications/${a.id}/decline`, {});
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[12px] border border-line p-4" style={{ background: CARD }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-fg">
            {a.firstName} {a.lastName} {a.company && <span className="text-muted">· {a.company}</span>}
          </p>
          <p className="text-xs text-muted">
            {[a.email, a.website, a.country, `${a.companySize}${a.track === "creator" ? " audience" : " people"}`, a.taxId ? `tax ID ${a.taxId}` : "", `applied ${dt(a.createdAt)}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={a.status === "new" ? "violet" : a.status === "approved" ? "emerald" : "zinc"}>{a.status}</Badge>
          {a.account ? (
            <Badge tone={a.account.planOk ? "emerald" : "amber"}>Account: {a.account.plan}</Badge>
          ) : (
            <Badge tone="red">No account with this email</Badge>
          )}
        </div>
      </div>
      {/* Creators apply with a short form: these can be empty. */}
      {a.description && <p className="mt-3 text-sm text-fg">{a.description}</p>}
      {a.goals && <p className="mt-1 text-sm text-muted">{a.track === "creator" ? "Note" : "Wants"}: {a.goals}</p>}
      {a.status === "new" && <ApplicationChecks id={a.id} />}
      {a.status === "new" && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted">
            Track
            <select value={track} onChange={(e) => setTrack(e.target.value as "expert" | "agency" | "creator")} className="mt-1 block h-9 rounded-[8px] border border-line bg-transparent px-2 text-sm text-fg">
              <option value="expert">Expert (needs Pro)</option>
              <option value="agency">Agency (needs Business)</option>
              <option value="creator">Creator ($50 Pro / $100 Business, no plan needed)</option>
            </select>
          </label>
          <label className="text-xs text-muted">
            Link code
            <input value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 block h-9 w-44 rounded-[8px] border border-line bg-transparent px-2 font-mono text-sm text-fg" />
          </label>
          <label className="text-xs text-muted">
            Their Mythex account email
            <input value={userEmail} onChange={(e) => setUserEmail(e.target.value)} className="mt-1 block h-9 w-64 rounded-[8px] border border-line bg-transparent px-2 text-sm text-fg" />
          </label>
          <button type="button" disabled={busy} onClick={() => void approve(false)} className="btn-primary !py-1.5">
            {busy ? <Spinner size={12} /> : "Approve"}
          </button>
          <button type="button" disabled={busy} onClick={() => void decline()} className="btn-ghost !py-1.5">
            Decline
          </button>
        </div>
      )}
      {error && (
        <p className="mt-3 text-sm text-amber-300">
          {error}{" "}
          {needForce && (
            <button type="button" className="underline" onClick={() => void approve(true)}>
              Approve anyway
            </button>
          )}
        </p>
      )}
    </div>
  );
}

type Check = { key: string; status: "pass" | "warn" | "fail" | "unknown"; label: string; detail?: string };

const CHECK_ICON: Record<Check["status"], { mark: string; cls: string }> = {
  pass: { mark: "✓", cls: "text-emerald-300" },
  warn: { mark: "!", cls: "text-amber-300" },
  fail: { mark: "✕", cls: "text-red-300" },
  unknown: { mark: "?", cls: "text-muted" },
};

/**
 * What the account and the web say about the applicant, before Approve
 * (API lib/partner-checks.ts, Lovable's gates). Loaded per card: it visits
 * their site and, for agencies, the EU's VAT check.
 */
function ApplicationChecks({ id }: { id: string }) {
  const [data, setData] = useState<{ overall: Check["status"]; checks: Check[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setData(null);
    setFailed(false);
    api
      .get<{ overall: Check["status"]; checks: Check[] }>(`/v1/admin/partner-applications/${id}/checks`)
      .then((d) => live && setData(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [id, n]);
  if (failed)
    return (
      <p className="mt-3 text-xs text-amber-300">
        Couldn't run the checks.{" "}
        <button type="button" className="underline" onClick={() => setN((x) => x + 1)}>
          Try again
        </button>
      </p>
    );
  if (!data)
    return (
      <p className="mt-3 flex items-center gap-2 text-xs text-muted">
        <Spinner size={12} /> Checking the account and their site…
      </p>
    );
  return (
    <div className="mt-3 rounded-[10px] border border-line p-3" data-testid="partner-checks">
      <p className="mb-2 text-xs font-medium text-fg">
        Checks:{" "}
        <span className={CHECK_ICON[data.overall].cls}>
          {data.overall === "pass" ? "all good" : data.overall === "fail" ? "something's wrong" : data.overall === "warn" ? "look before approving" : "open what we couldn't check"}
        </span>
        <button type="button" className="ms-2 text-muted underline" onClick={() => setN((x) => x + 1)}>
          Recheck
        </button>
      </p>
      <ul className="grid gap-1 text-xs sm:grid-cols-2">
        {data.checks.map((c) => (
          <li key={c.key} className="flex gap-2" data-check={c.key} data-status={c.status}>
            <span className={`w-3 shrink-0 text-center font-semibold ${CHECK_ICON[c.status].cls}`}>{CHECK_ICON[c.status].mark}</span>
            <span className="min-w-0">
              <span className="text-fg">{c.label}</span>
              {c.detail && <span className="text-muted"> — {c.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Detail = {
  id: string;
  code: string;
  link: string;
  track: string;
  status: string;
  clicks: number;
  payoutMethod: string | null;
  payoutEmail: string | null;
  note: string | null;
  owner: { id: string; name: string; email: string; plan: string };
  planOk: boolean;
  signups: number;
  payingClients: number;
  pendingCents: number;
  payableCents: number;
  paidCents: number;
  heldCents: number;
  readyToPay: boolean;
  rates: { minPayoutCents: number };
  clients: { id: string; name: string; email: string; plan: string; signedUpAt: string; paying: boolean }[];
  commissions: {
    id: string;
    client: { name: string; email: string } | null;
    plan: string;
    amountCents: number;
    ratePct: number;
    commissionCents: number;
    invoicePaidAt: string;
    status: string;
    voidReason: string | null;
    heldReason: string | null;
    stripeInvoiceId: string;
  }[];
  payouts: { id: string; amountCents: number; method: string; reference: string | null; createdAt: string }[];
};

const HELD_TEXT: Record<string, string> = {
  same_fingerprint: "The client signed up from the partner's browser.",
  same_device: "The client signs in from the partner's device.",
  same_ip: "The client signs in from the partner's IP.",
};

/** A held commission: the client looks like the partner's own account. Release it to be paid, or void it. */
function HeldActions({ id, reason, onDone }: { id: string; reason: string | null; onDone: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const act = async (action: "release" | "void") => {
    setBusy(true);
    try {
      await api.post(`/v1/admin/partner-commissions/${id}/${action}`, {});
      toast("success", action === "release" ? "Released: it will be paid with the rest." : "Voided.");
      onDone();
    } catch {
      toast("error", "Couldn't change it. Reload and try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="mt-1 block text-xs">
      <span className="text-amber-300">{(reason && HELD_TEXT[reason]) ?? "Held for review."}</span>{" "}
      <button type="button" disabled={busy} className="underline" onClick={() => void act("release")}>
        Release
      </button>{" "}
      ·{" "}
      <button type="button" disabled={busy} className="underline" onClick={() => void act("void")}>
        Void
      </button>
    </span>
  );
}

export function AdminPartnerDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { data: p, loading, reload } = useAdminData<Detail>(id ? `/v1/admin/partners/${id}` : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  if (loading && !p) return <Spinner size={20} />;
  if (!p) return <p className="text-sm text-muted">Partner not found.</p>;

  const run = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key);
    try {
      const msg = await fn();
      if (msg) toast("success", msg);
      reload();
    } catch (err) {
      toast("error", errText(err));
    } finally {
      setBusy(null);
    }
  };

  const pay = (force = false) =>
    run("pay", async () => {
      const r = await api.post<{ amountCents: number; commissions: number }>(`/v1/admin/partners/${p.id}/payouts`, {
        method: p.payoutMethod ?? "other",
        reference: reference || undefined,
        force,
      });
      setReference("");
      return `Recorded ${usd(r.amountCents)} paid (${r.commissions} commissions).`;
    });

  return (
    <div>
      <Link to="/admin/partners" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Partners
      </Link>
      <PageTitle
        sub={
          <>
            {p.owner.email} · {p.owner.plan} · <span className="capitalize">{p.track}</span> · {p.link}
          </>
        }
        action={
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy != null}
              onClick={() =>
                void run("recheck", async () => {
                  const r = await api.post<{ invoices: number; created: number; updated: number }>(`/v1/admin/partners/${p.id}/recheck`, {});
                  return `Checked ${r.invoices} paid invoices: ${r.created} new, ${r.updated} corrected.`;
                })
              }
              className="btn-ghost !py-1.5"
            >
              {busy === "recheck" ? <Spinner size={12} /> : <RefreshCw className="h-4 w-4" />} Recheck from Stripe
            </button>
            <button
              type="button"
              disabled={busy != null}
              onClick={() =>
                void run("status", async () => {
                  await api.post(`/v1/admin/partners/${p.id}`, { status: p.status === "active" ? "paused" : "active" });
                  return p.status === "active" ? "Paused" : "Active again";
                })
              }
              className="btn-ghost !py-1.5"
            >
              {p.status === "active" ? "Pause" : "Resume"}
            </button>
          </div>
        }
      >
        {p.owner.name} <span className="text-base text-muted">?ref={p.code}</span>{" "}
        {p.status !== "active" && <Badge tone="amber">paused</Badge>}
        {!p.planOk && <Badge tone="amber">below track plan</Badge>}
      </PageTitle>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Clicks" value={p.clicks} />
        <Stat label="Sign-ups" value={p.signups} hint={`${p.payingClients} paying`} />
        <Stat label="Waiting" value={usd(p.pendingCents)} hint="Under 30 days" />
        <Stat label="To pay" value={usd(p.payableCents)} hint={p.readyToPay ? "Ready to pay" : `From ${usd(p.rates.minPayoutCents)}`} />
        <Stat label="Paid" value={usd(p.paidCents)} />
      </div>

      <div className="mb-8 rounded-[12px] border border-line p-4" style={{ background: CARD }}>
        <h2 className="text-sm font-semibold text-fg">Record a payout</h2>
        <p className="mt-1 text-sm text-muted">
          Send {usd(p.payableCents)} by {p.payoutMethod ? (p.payoutMethod === "wise" ? "Wise" : "PayPal") : "PayPal or Wise"} to{" "}
          <span className="text-fg">{p.payoutEmail ?? "— they haven't added payout details yet"}</span>, then record it here: every payable commission becomes paid.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Transfer reference (optional)"
            className="h-9 w-72 rounded-[8px] border border-line bg-transparent px-2 text-sm text-fg"
          />
          <button type="button" disabled={busy != null || p.payableCents <= 0} onClick={() => void pay(false)} className="btn-primary !py-1.5">
            {busy === "pay" ? <Spinner size={12} /> : `Mark ${usd(p.payableCents)} as paid`}
          </button>
          {p.payableCents > 0 && !p.readyToPay && (
            <button type="button" disabled={busy != null} onClick={() => void pay(true)} className="btn-ghost !py-1.5">
              Pay below minimum
            </button>
          )}
        </div>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-fg">Commissions</h2>
      <div className="mb-8">
        <Table head={["Paid on", "Client", "Plan", "Payment", "Rate", "Commission", "Status", "Invoice"]} emptyTitle="No commissions yet">
          {p.commissions.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-3">{dt(c.invoicePaidAt)}</td>
              <td className="px-4 py-3">{c.client ? `${c.client.name} (${c.client.email})` : "—"}</td>
              <td className="px-4 py-3">{c.plan}</td>
              <td className="px-4 py-3">{usd(c.amountCents)}</td>
              <td className="px-4 py-3">{c.ratePct ? `${c.ratePct}%` : "flat"}</td>
              <td className="px-4 py-3 font-medium">{usd(c.commissionCents)}</td>
              <td className="px-4 py-3">
                <Badge tone={c.status === "paid" ? "emerald" : c.status === "payable" ? "violet" : c.status === "void" ? "zinc" : c.status === "held" ? "red" : "amber"}>{c.status}</Badge>
                {c.voidReason && <span className="ms-1 text-xs text-muted">{c.voidReason}</span>}
                {c.status === "held" && <HeldActions id={c.id} reason={c.heldReason} onDone={reload} />}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-muted">{c.stripeInvoiceId}</td>
            </tr>
          ))}
        </Table>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-fg">Clients</h2>
      <div className="mb-8">
        <Table head={["Client", "Plan", "Signed up", "Paying"]} emptyTitle="No sign-ups yet">
          {p.clients.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-3">
                <Link to={`/admin/users/${c.id}`} className="underline underline-offset-2">
                  {c.name}
                </Link>{" "}
                <span className="text-xs text-muted">{c.email}</span>
              </td>
              <td className="px-4 py-3">{c.plan}</td>
              <td className="px-4 py-3">{dt(c.signedUpAt)}</td>
              <td className="px-4 py-3">{c.paying ? "Yes" : "—"}</td>
            </tr>
          ))}
        </Table>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-fg">Payouts</h2>
      <Table head={["Date", "Amount", "Method", "Reference"]} emptyTitle="No payouts yet">
        {p.payouts.map((x) => (
          <tr key={x.id}>
            <td className="px-4 py-3">{dt(x.createdAt)}</td>
            <td className="px-4 py-3 font-medium">{usd(x.amountCents)}</td>
            <td className="px-4 py-3">{x.method}</td>
            <td className="px-4 py-3 text-muted">{x.reference ?? "—"}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
