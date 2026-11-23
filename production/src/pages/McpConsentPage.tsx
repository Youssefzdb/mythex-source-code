import { useEffect, useMemo, useState } from "react";
import { isPaidPlan, planLabel } from "../lib/plan-tiers";
import { useNativeBleedTop } from "../lib/native-bleed-top";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { lockDocumentTheme } from "../lib/theme";
import { MythexMark } from "../components/mythex-mark";
import { BILLING_CARD } from "../components/billing/BillingShell";
import { Spinner, useToast } from "../components/ui";
import { useT } from "../i18n/app";
import { FG_MUTED, PAGE_BG } from "./auth/AuthLayout";

export function McpConsentPage() {
  // Paints its own background, a step off <body>'s — so it takes the status
  // bar inset itself rather than leaving a seam across the top.
  useNativeBleedTop();
  const [params] = useSearchParams();
  const pending = params.get("pending") ?? "";
  const { user } = useAuth();
  const toast = useToast();
  const t = useT();
  const c = t.auth.mcpConsent;
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null);
  const isPro = isPaidPlan(user?.plan);

  const valid = useMemo(() => pending.length > 20, [pending]);

  useEffect(() => {
    lockDocumentTheme("dark");
    return () => lockDocumentTheme(null);
  }, []);

  const decide = async (approve: boolean) => {
    if (!valid) {
      toast("error", c.invalidRequest);
      return;
    }
    setBusy(approve ? "allow" : "deny");
    try {
      const res = await api.post<{ redirect: string }>("/oauth/consent", { pending, approve });
      if (res.redirect) {
        window.location.assign(res.redirect);
        return;
      }
      toast("error", c.noRedirect);
    } catch (err) {
      const msg =
        (err instanceof ApiError && (err.body as { message?: string })?.message) ||
        c.failed;
      toast("error", msg);
    }
    setBusy(null);
  };

  return (
    <div className="native-inset-top flex min-h-dvh flex-col items-center justify-center px-4 py-12 text-white" style={{ background: PAGE_BG }}>
      <div className="w-full max-w-[400px]">
        <MythexMark size={36} />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-white">{c.title}</h1>
        <p className="mt-1.5 text-sm leading-relaxed" style={{ color: FG_MUTED }}>
          {c.intro}
        </p>
        {user && (
          <p className="mt-3 text-sm text-white">
            <span dir="ltr">{user.email}</span>
            <span className="text-white/45"> · {planLabel(user?.plan)}</span>
          </p>
        )}

        <div
          className="mt-6 space-y-3 rounded-xl border border-line px-5 py-5 text-sm text-white/70"
          style={{ background: BILLING_CARD }}
        >
          <p>{c.grants}</p>
          <p className="text-white/45">{c.safety}</p>
          {!isPro && (
            <p className="text-amber-200/90">
              {c.notPro}
            </p>
          )}
          {!valid && (
            <p className="text-red-300/90">{c.invalidLink}</p>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy != null || !valid}
            onClick={() => void decide(true)}
            className="btn-primary inline-flex !h-10 !rounded-lg items-center justify-center gap-2 px-5 text-sm"
          >
            {busy === "allow" ? <Spinner size={16} /> : c.allow}
          </button>
          <button
            type="button"
            disabled={busy != null || !valid}
            onClick={() => void decide(false)}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-line px-5 text-sm text-white/70 hover:bg-white/[0.04] disabled:opacity-60"
          >
            {busy === "deny" ? <Spinner size={16} /> : c.deny}
          </button>
        </div>
      </div>
    </div>
  );
}
