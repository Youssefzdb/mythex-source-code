import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { CARD_BG, surfaceRing, whiteBtnClass } from "../lib/surfaces";
import { Skeleton, Spinner, useToast } from "./ui";
import { fill, formatNumber, useT } from "../i18n/app";
import { rich } from "../i18n/app/rich";

interface KnowledgeResponse {
  limits: { project: number; workspace: number };
  project: { knowledge: string; canEdit: boolean };
  workspace: { id: string; name: string; isDefault: boolean; knowledge: string; canEdit: boolean } | null;
}

/**
 * Project settings → Knowledge.
 *
 * Text people write for the agent, given to it on every message: one block for
 * this project, one for the whole workspace. Written by people, never by the
 * agent — the same split Lovable, Bolt and Cursor rules make.
 */
export function KnowledgeSettings({ projectId }: { projectId: string }) {
  const toast = useToast();
  const t = useT();
  const k = t.settings.knowledge;
  const [data, setData] = useState<KnowledgeResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [projectDraft, setProjectDraft] = useState("");
  const [workspaceDraft, setWorkspaceDraft] = useState("");
  const [busy, setBusy] = useState<"project" | "workspace" | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<KnowledgeResponse>(`/v1/projects/${projectId}/knowledge`)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setProjectDraft(res.project.knowledge);
        setWorkspaceDraft(res.workspace?.knowledge ?? "");
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const save = async (which: "project" | "workspace") => {
    if (!data) return;
    setBusy(which);
    try {
      if (which === "project") {
        const res = await api.put<{ knowledge: string }>(`/v1/projects/${projectId}/knowledge`, {
          knowledge: projectDraft,
        });
        setData({ ...data, project: { ...data.project, knowledge: res.knowledge } });
        setProjectDraft(res.knowledge);
      } else if (data.workspace) {
        const res = await api.put<{ knowledge: string }>(`/v1/workspaces/${data.workspace.id}/knowledge`, {
          knowledge: workspaceDraft,
        });
        setData({ ...data, workspace: { ...data.workspace, knowledge: res.knowledge } });
        setWorkspaceDraft(res.knowledge);
      }
      toast("success", k.saved);
    } catch (err) {
      const msg = (err as { body?: { message?: unknown } })?.body?.message;
      toast("error", typeof msg === "string" ? msg : k.saveFailed);
    } finally {
      setBusy(null);
    }
  };

  if (failed) return <p className="mt-5 text-sm text-danger">{k.loadFailed}</p>;
  if (!data) {
    return (
      <div className="mt-5 space-y-3">
        <Skeleton className="h-40 w-full rounded-[12px]" />
      </div>
    );
  }

  const ws = data.workspace;
  return (
    <section className="mt-5 space-y-4" data-testid="knowledge-settings">
      <Block
        title={k.projectTitle}
        description={k.projectDescription}
        placeholder={k.projectPlaceholder}
        value={projectDraft}
        saved={data.project.knowledge}
        max={data.limits.project}
        canEdit={data.project.canEdit}
        busy={busy === "project"}
        onChange={setProjectDraft}
        onSave={() => void save("project")}
        testId="knowledge-project"
      />
      {ws && (
        <Block
          title={ws.isDefault ? k.personalTitle : fill(k.workspaceTitle, { name: ws.name })}
          description={ws.isDefault ? k.personalDescription : k.workspaceDescription}
          placeholder={k.workspacePlaceholder}
          value={workspaceDraft}
          saved={ws.knowledge}
          max={data.limits.workspace}
          canEdit={ws.canEdit}
          readOnlyNote={k.readOnlyNote}
          busy={busy === "workspace"}
          onChange={setWorkspaceDraft}
          onSave={() => void save("workspace")}
          testId="knowledge-workspace"
        />
      )}
      <p className="text-xs text-muted">
        {rich(k.memoryPointer, {
          em: (s) => <em>{s}</em>,
          link: (s) => (
            <Link to="/settings/memory" className="text-fg-2 underline hover:text-fg">
              {s}
            </Link>
          ),
        })}
      </p>
    </section>
  );
}

function Block(props: {
  title: string;
  description: string;
  placeholder: string;
  value: string;
  saved: string;
  max: number;
  canEdit: boolean;
  readOnlyNote?: string;
  busy: boolean;
  onChange: (v: string) => void;
  onSave: () => void;
  testId: string;
}) {
  const t = useT();
  const dirty = props.value.trim() !== props.saved.trim();
  return (
    <div className="rounded-[12px] p-4" style={{ background: CARD_BG, boxShadow: surfaceRing(CARD_BG) }}>
      <h3 className="text-sm font-semibold text-fg">{props.title}</h3>
      <p className="mt-1 text-[13px] text-muted">{props.description}</p>
      <textarea
        value={props.value}
        onChange={(e) => props.onChange(e.target.value.slice(0, props.max))}
        readOnly={!props.canEdit}
        rows={4}
        placeholder={props.canEdit ? props.placeholder : ""}
        data-testid={`${props.testId}-input`}
        className="input mt-3 w-full resize-y !py-2 text-sm read-only:opacity-60"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs text-muted">
          {props.canEdit
            ? fill(t.settings.charCount, {
                count: formatNumber(props.value.length),
                max: formatNumber(props.max),
              })
            : props.readOnlyNote}
        </span>
        {props.canEdit && (
          <button
            type="button"
            disabled={!dirty || props.busy}
            onClick={props.onSave}
            data-testid={`${props.testId}-save`}
            className={whiteBtnClass("lg")}
          >
            {props.busy ? <Spinner size={16} /> : t.common.save}
          </button>
        )}
      </div>
    </div>
  );
}
