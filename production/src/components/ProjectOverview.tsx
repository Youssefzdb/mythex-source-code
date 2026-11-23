/**
 * The facts about a project, under its name in General: what to quote to
 * support or paste into a tool (its ID), when it began, when it was last
 * worked on, where it lives, and whose it is.
 */
import { useEffect, useState, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { api } from "../lib/api";
import { formatDate, formatRelative, useT } from "../i18n/app";
import { CopyButton } from "./CopyButton";
import { Skeleton } from "./ui";
import { CARD_BG, surfaceRing } from "../lib/surfaces";

interface Overview {
  id: string;
  createdAt: string;
  lastActiveAt: string | null;
  liveUrl: string | null;
  workspace: { name: string; isDefault: boolean } | null;
}

export function ProjectOverview({ projectId }: { projectId: string }) {
  const p = useT().settings.project;
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .get<Overview>(`/v1/projects/${projectId}/overview`)
      .then((r) => live && setData(r))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [projectId]);

  const row = (label: string, value: ReactNode) => (
    <div className="flex min-h-9 items-center justify-between gap-4 border-b border-line py-2 last:border-b-0">
      <dt className="shrink-0 text-sm text-muted">{label}</dt>
      <dd className="flex min-w-0 items-center justify-end gap-1.5 text-end text-sm text-fg">{value}</dd>
    </div>
  );

  return (
    <div className="rounded-[12px] p-4" style={{ background: CARD_BG, boxShadow: surfaceRing(CARD_BG) }}>
      <h3 className="text-sm font-semibold text-fg">{p.detailsTitle}</h3>
      {error ? (
        <p className="mt-3 text-sm text-muted">{p.detailsLoadFailed}</p>
      ) : !data ? (
        <div className="mt-3 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : (
        <dl className="mt-1">
          {row(
            p.detailProjectId,
            <>
              <code dir="ltr" className="truncate font-mono text-xs">
                {data.id}
              </code>
              <CopyButton
                text={data.id}
                label={p.detailProjectId}
                className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-hover hover:text-fg"
              />
            </>,
          )}
          {row(p.detailCreated, formatDate(data.createdAt))}
          {data.lastActiveAt && row(p.detailLastActive, formatRelative(data.lastActiveAt))}
          {row(
            p.detailLiveUrl,
            data.liveUrl ? (
              <a
                href={data.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                dir="ltr"
                className="inline-flex min-w-0 items-center gap-1 text-fg hover:underline"
              >
                <span className="truncate">{data.liveUrl.replace(/^https?:\/\//, "")}</span>
                <ExternalLink className="size-3.5 shrink-0 opacity-60" />
              </a>
            ) : (
              <span className="text-muted">{p.detailNotPublished}</span>
            ),
          )}
          {data.workspace &&
            row(
              p.detailWorkspace,
              <span className="truncate">{data.workspace.isDefault ? p.detailPersonalWorkspace : data.workspace.name}</span>,
            )}
        </dl>
      )}
    </div>
  );
}
