import { useCallback, useEffect, useState } from "react";
import { PlanBadge, planUrl } from "./ui/PlanBadge";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { api, ApiError, type WorkspaceMembers } from "../lib/api";
import { Spinner, useToast } from "./ui";
import { DescribedSelect } from "./ui/DescribedSelect";
import { btnClass, CARD_BG, surfaceRing, whiteBtnClass } from "../lib/surfaces";
import { appT, fill, useT } from "../i18n/app";
import { rich } from "../i18n/app/rich";

/**
 * Settings → General: who can see this project (Business). Workspace: every
 * member. Private: its creator, workspace admins, and the people it's shared
 * with. Strings: t.teams.projectPrivacy (i18n/app/en/teams.ts).
 */
interface AccessInfo {
  visibility: "workspace" | "private";
  sharedWith: Array<{ id: string; name: string; email: string }>;
  workspaceId: string | null;
  creatorId: string;
  available: boolean;
  canManage: boolean;
}

function errMessage(err: unknown, fallback: string): string {
  const body = err instanceof ApiError ? (err.body as { message?: unknown } | null) : null;
  return typeof body?.message === "string" ? body.message : fallback;
}

export function ProjectPrivacyCard({ projectId }: { projectId: string }) {
  const toast = useToast();
  const t = useT();
  const tp = t.teams.projectPrivacy;
  const [info, setInfo] = useState<AccessInfo | null>(null);
  const [members, setMembers] = useState<WorkspaceMembers["members"]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const a = await api.get<AccessInfo>(`/v1/projects/${projectId}/access`);
      setInfo(a);
      if (a.workspaceId && a.canManage && a.available) {
        const m = await api.get<WorkspaceMembers>(`/v1/workspaces/${a.workspaceId}/members`).catch(() => null);
        setMembers(m?.members ?? []);
      }
    } catch {
      setInfo(null);
    }
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!info || !info.workspaceId) return null;

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      await load();
    } catch (err) {
      toast("error", errMessage(err, appT().teams.notSaved));
    } finally {
      setBusy(null);
    }
  };

  const shared = new Set(info.sharedWith.map((u) => u.id));
  // Admins and the owner see private projects anyway; only Editors and Viewers need sharing.
  const candidates = members.filter((m) => !shared.has(m.userId) && m.userId !== info.creatorId && (m.role === "EDITOR" || m.role === "VIEWER"));

  return (
    <div className="rounded-[12px] p-4" style={{ background: CARD_BG, boxShadow: surfaceRing(CARD_BG) }} data-testid="project-privacy">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
        {tp.title}
        {!info.available && <PlanBadge plan="Business" />}
      </h3>
      {/* Locked, unless it's already private (the plan went down): then it can
          still be opened to the workspace or shared — never stuck hidden. */}
      {!info.available && info.visibility !== "private" ? (
        <p className="mt-1.5 text-[13px] text-muted">
          {rich(tp.locked, {
            link: (text) => (
              <Link to={planUrl("Business")} className="text-white underline underline-offset-2">
                {text}
              </Link>
            ),
          })}
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-fg-2">
              {info.visibility === "private" ? tp.privateLine : tp.everyone}
            </p>
            <DescribedSelect
              ariaLabel={tp.title}
              value={info.visibility}
              disabled={!info.canManage || busy !== null}
              align="right"
              onChange={(v) => void run("visibility", () => api.patch(`/v1/projects/${projectId}/visibility`, { visibility: v }))}
              options={[
                { id: "workspace", label: tp.workspace, description: tp.everyone },
                { id: "private", label: tp.private, description: tp.privateHint },
              ]}
            />
          </div>
          {info.visibility === "private" && (
            <div className="mt-3 space-y-2">
              {info.sharedWith.map((u) => (
                <div key={u.id} className="flex items-center gap-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate text-fg">
                    <bdi>{u.name}</bdi> <span className="text-muted" dir="ltr">{u.email}</span>
                  </span>
                  {info.canManage && (
                    <button
                      type="button"
                      aria-label={fill(tp.stopSharing, { name: u.name })}
                      className={`${btnClass("md", "ghost")} !w-7 !px-0 text-muted hover:!text-red-400`}
                      disabled={busy !== null}
                      onClick={() => void run(`rm:${u.id}`, () => api.delete(`/v1/projects/${projectId}/access/${u.id}`))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {info.canManage && candidates.length > 0 && (
                <div className="flex gap-2">
                  <DescribedSelect
                    ariaLabel={tp.shareWith}
                    value={pick || null}
                    placeholder={tp.sharePlaceholder}
                    onChange={setPick}
                    fullWidth
                    className="min-w-0 flex-1"
                    options={candidates.map((m) => ({ id: m.userId, label: m.name, description: m.email }))}
                  />
                  <button
                    type="button"
                    className={whiteBtnClass("lg")}
                    disabled={!pick || busy !== null}
                    onClick={() =>
                      void run("share", async () => {
                        await api.post(`/v1/projects/${projectId}/access`, { userId: pick });
                        setPick("");
                      })
                    }
                  >
                    {busy === "share" ? <Spinner size={12} /> : t.common.share}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
