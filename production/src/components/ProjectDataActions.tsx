/**
 * The Database and Storage tabs of project settings: what the project has, and
 * the owner's data, theirs to take — a backup of the database, its connection
 * string for any other tool, and the stored files one at a time or as a zip.
 *
 * Downloads are links straight to storage, never a blob in this page: a
 * database or a folder of uploads can be gigabytes, and a phone would hold all
 * of it in memory before saving it.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Database,
  Download,
  ExternalLink,
  HardDrive,
  Search,
  Trash2,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import { formatBytes } from "../lib/chat-files";
import { fill, pl, useT } from "../i18n/app";
import { ConfirmDialog, Spinner, useToast } from "./ui";
import { CopyButton } from "./CopyButton";
import { CARD_BG, surfaceRing } from "../lib/surfaces";
import { UpgradeRequiredBanner } from "../lib/upgrade";

type ExportKind = "database" | "files";
interface ExportState {
  state: "none" | "running" | "ready" | "failed";
  url?: string;
  error?: string;
}

/** Follow a signed link that answers with `attachment`: the browser saves it. */
function saveFromUrl(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
}

const POLL_MS = 2000;

/** Start an export and save it when ready. `busy` stays true until then. */
function useDataExport(projectId: string, kind: ExportKind, db?: "dev" | "live") {
  const toast = useToast();
  const p = useT().settings.project;
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  // Set on mount too, not only cleared on unmount: effects can run again on
  // the same component (hot reload does it), and a flag only ever cleared
  // stayed false, so the poll below never ran and the button spun forever over
  // a finished backup.
  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);

  const failed = (err?: unknown) => {
    const body = err instanceof ApiError ? (err.body as { error?: string; message?: string } | null) : null;
    if (body?.error === "too_large") toast("error", p.storageZipTooLarge);
    else if (body?.message && body.error !== "start_failed") toast("error", body.message);
    else toast("error", kind === "database" ? p.dbBackupFailed : p.storageZipFailed);
  };

  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/v1/projects/${projectId}/data-export`, { kind, ...(db ? { db } : {}) });
      // Keeps asking while this page is open. The export carries on without it,
      // and the next click picks up the one already running.
      while (alive.current) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const s = await api.get<ExportState>(`/v1/projects/${projectId}/data-export/${kind}`);
        if (s.state === "ready" && s.url) {
          saveFromUrl(s.url);
          toast("success", p.downloadStarted);
          return;
        }
        if (s.state !== "running") return failed();
      }
    } catch (err) {
      failed(err);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return { busy, start };
}

const secondaryBtn = "btn-secondary inline-flex items-center gap-2 !px-4 !py-2 text-sm disabled:opacity-60";
const primaryBtn = "btn-primary inline-flex items-center gap-2 !px-4 !py-2 text-sm disabled:opacity-60";

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[12px] p-4" style={{ background: CARD_BG, boxShadow: surfaceRing(CARD_BG) }}>
      {children}
    </div>
  );
}

/**
 * Nothing here yet. Plain on purpose: the database and storage turn up on their
 * own when the app needs them, so this is a note, not a call to action.
 */
function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <Card>
      <div className="flex flex-col items-center px-4 py-8 text-center">
        <span className="grid size-10 place-items-center rounded-full bg-white/[0.06] text-muted">{icon}</span>
        <h3 className="mt-3 text-sm font-semibold text-fg">{title}</h3>
        <p className="mt-1 max-w-xs text-sm text-muted">{text}</p>
      </div>
    </Card>
  );
}

export function DatabaseSettings({
  projectId,
  hasDatabase,
  hasLiveDatabase = false,
  canDatabase,
  canConnect,
  onUpgrade,
}: {
  projectId: string;
  hasDatabase: boolean;
  /** Published with its own database: everything below acts on the one picked. */
  hasLiveDatabase?: boolean;
  canDatabase: boolean;
  canConnect: boolean;
  onUpgrade: () => void;
}) {
  const t = useT();
  const p = t.settings.project;
  const toast = useToast();
  const [which, setWhich] = useState<"dev" | "live">("dev");
  const target = hasLiveDatabase ? which : undefined;
  const backup = useDataExport(projectId, "database", target);
  const [conn, setConn] = useState<string | null>(null);
  const [loadingConn, setLoadingConn] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  if (!canDatabase && !hasDatabase) {
    return (
      <Card>
        <UpgradeRequiredBanner feature={p.featureDatabase} onUpgrade={onUpgrade} />
      </Card>
    );
  }

  const resetPassword = async () => {
    setResetting(true);
    try {
      const r = await api.post<{ connectionString: string; liveUpdated: boolean | null }>(
        `/v1/projects/${projectId}/database/reset-password`,
        target ? { db: target } : undefined,
      );
      setConn(r.connectionString);
      setRevealed(false);
      setConfirmReset(false);
      if (r.liveUpdated === false) toast("error", p.dbResetLiveFailed);
      else toast("success", p.dbResetDone);
    } catch {
      toast("error", p.dbResetFailed);
    } finally {
      setResetting(false);
    }
  };

  const showConnection = async () => {
    setLoadingConn(true);
    try {
      const r = await api.get<{ connectionString: string }>(
        `/v1/projects/${projectId}/database/connection${target ? `?db=${target}` : ""}`,
      );
      setConn(r.connectionString);
      setRevealed(false);
    } catch {
      toast("error", p.dbConnectionFailed);
    } finally {
      setLoadingConn(false);
    }
  };

  if (!hasDatabase) {
    return (
      <EmptyState icon={<Database className="size-5" />} title={p.dbEmptyTitle} text={p.dbEmptyText} />
    );
  }

  const pick = (next: "dev" | "live") => {
    if (next === which) return;
    setWhich(next);
    // A connection string shown for one must not stay up under the other's name.
    setConn(null);
    setRevealed(false);
  };

  return (
    <div className="space-y-4">
      {hasLiveDatabase && (
        <div>
          <div role="radiogroup" aria-label={p.dbWhichLabel} className="inline-flex rounded-lg border border-line p-0.5">
            {(["dev", "live"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={which === k}
                onClick={() => pick(k)}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${which === k ? "bg-white/10 text-fg" : "text-muted hover:text-fg"}`}
              >
                {k === "dev" ? p.dbDev : p.dbLive}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">{which === "dev" ? p.dbDevHint : p.dbLiveHint}</p>
        </div>
      )}
      <Card>
        <h3 className="text-sm font-semibold text-fg">{p.dbDownloadBackup}</h3>
        <p className="mt-1.5 text-sm text-muted">{p.dbBackupText}</p>
        <button
          type="button"
          className={`${primaryBtn} mt-4`}
          disabled={backup.busy}
          onClick={() => void backup.start()}
        >
          {backup.busy ? <Spinner size={14} /> : <Download className="size-3.5" />}
          {backup.busy ? p.dbPreparingBackup : p.dbDownloadBackup}
        </button>
      </Card>
      <Card>
        <h3 className="text-sm font-semibold text-fg">{p.dbConnect}</h3>
        <p className="mt-1.5 text-sm text-muted">{p.dbConnectionHint}</p>
        {!canConnect ? (
          <div className="mt-4">
            <UpgradeRequiredBanner feature={p.dbConnect} onUpgrade={onUpgrade} />
          </div>
        ) : conn == null ? (
          <button
            type="button"
            className={`${secondaryBtn} mt-4`}
            disabled={loadingConn}
            onClick={() => void showConnection()}
          >
            {loadingConn ? <Spinner size={14} /> : null}
            {p.dbShowConnection}
          </button>
        ) : (
          <div className="mt-4">
            <div className="text-xs font-medium text-muted">{p.dbConnectionLabel}</div>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                readOnly
                dir="ltr"
                aria-label={p.dbConnectionLabel}
                value={revealed ? conn : conn.replace(/:\/\/([^:/@]+):[^@]*@/, "://$1:••••••••@")}
                onFocus={(e) => e.currentTarget.select()}
                className="input min-w-0 flex-1 font-mono text-xs"
              />
              <div className="flex gap-2">
                <button type="button" className={secondaryBtn} onClick={() => setRevealed((v) => !v)}>
                  {revealed ? p.hide : p.show}
                </button>
                <CopyButton text={conn} className={secondaryBtn}>
                  {(copied) => (copied ? t.common.copied : t.common.copy)}
                </CopyButton>
              </div>
            </div>
          </div>
        )}
        {canConnect && (
          <div className="mt-4 border-t border-line pt-3">
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="text-sm text-muted underline-offset-4 transition-colors hover:text-fg hover:underline"
            >
              {p.dbResetPassword}
            </button>
          </div>
        )}
      </Card>
      {confirmReset && (
        <ConfirmDialog
          title={p.dbResetTitle}
          subtitle={p.dbResetText}
          confirmLabel={p.dbResetPassword}
          danger
          busy={resetting}
          onConfirm={() => void resetPassword()}
          onClose={() => !resetting && setConfirmReset(false)}
        />
      )}
    </div>
  );
}

interface StoredFile {
  key: string;
  path: string;
  name: string;
  size: number;
  lastModified: string | null;
  url: string;
  downloadUrl: string;
}

export function StorageSettings({
  projectId,
  hasStorage,
  canStorage,
  onUpgrade,
}: {
  projectId: string;
  hasStorage: boolean;
  canStorage: boolean;
  onUpgrade: () => void;
}) {
  const p = useT().settings.project;
  if (!canStorage && !hasStorage) {
    return (
      <Card>
        <UpgradeRequiredBanner feature={p.featureStorage} onUpgrade={onUpgrade} />
      </Card>
    );
  }
  if (!hasStorage) {
    return (
      <EmptyState icon={<HardDrive className="size-5" />} title={p.storageEmptyTitle} text={p.storageEmptyText} />
    );
  }
  return <StoredFiles projectId={projectId} />;
}

type FileSort = "newest" | "oldest" | "name" | "size";
const PAGE_SIZE = 25;

interface FilesPage {
  items: StoredFile[];
  total: number;
  page: number;
  pageSize: number;
  totalFiles: number;
  totalBytes: number;
}

function StoredFiles({ projectId }: { projectId: string }) {
  const p = useT().settings.project;
  const toast = useToast();
  const zip = useDataExport(projectId, "files");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<FileSort>("newest");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<FilesPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [deleting, setDeleting] = useState<StoredFile | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Search as they type, once they pause.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(false);
    const qs = new URLSearchParams({ sort, page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) qs.set("q", search);
    api
      .get<FilesPage>(`/v1/projects/${projectId}/storage/objects?${qs}`)
      .then((r) => {
        if (!live) return;
        // Deleting the last file of the last page leaves nothing to show: go back one.
        if (r.items.length === 0 && r.page > 1) setPage(r.page - 1);
        else setData(r);
      })
      .catch(() => live && setError(true))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [projectId, search, sort, page, reload]);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/v1/projects/${projectId}/storage/objects`, { key: deleting.key });
      toast("success", p.fileDeleted);
      setDeleting(null);
      setReload((n) => n + 1);
    } catch {
      toast("error", p.fileDeleteFailed);
    } finally {
      setDeleteBusy(false);
    }
  };

  const dateFmt = new Intl.DateTimeFormat(document.documentElement.lang || undefined, { dateStyle: "medium" });
  const iconBtn =
    "grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-fg";
  const hasAny = (data?.totalFiles ?? 0) > 0;
  const from = data && data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0;
  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  /** A column heading that sorts by it; modified flips between newest and oldest. */
  const sortHead = (label: string, keys: FileSort[], className = "") => {
    const active = keys.includes(sort);
    const next = keys.length > 1 && sort === keys[0] ? keys[1] : keys[0];
    const Arrow = active && (sort === "oldest" || sort === "name") ? ChevronUp : ChevronDown;
    return (
      <th
        key={label}
        scope="col"
        className={`px-2 py-2 font-medium ${className}`}
        aria-sort={active ? (sort === "oldest" || sort === "name" ? "ascending" : "descending") : "none"}
      >
        <button
          type="button"
          onClick={() => {
            setSort(next);
            setPage(1);
          }}
          className={`inline-flex items-center gap-1 transition-colors hover:text-fg ${active ? "text-fg" : ""}`}
        >
          {label}
          <Arrow className={`size-3.5 ${active ? "" : "opacity-0"}`} />
        </button>
      </th>
    );
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-fg">{p.filesTitle}</h3>
          {hasAny && data && (
            <p className="mt-1.5 text-sm text-muted">
              {pl(p.filesSummary, data.totalFiles, { size: formatBytes(data.totalBytes) || "0 B" })}
            </p>
          )}
        </div>
        {hasAny && (
          <button type="button" className={secondaryBtn} disabled={zip.busy} onClick={() => void zip.start()}>
            {zip.busy ? <Spinner size={14} /> : <Download className="size-3.5" />}
            {zip.busy ? p.storagePreparingZip : p.storageDownloadAll}
          </button>
        )}
      </div>

      {hasAny && (
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={p.filesSearch}
            aria-label={p.filesSearch}
            className="input w-full !ps-9 text-sm"
          />
        </div>
      )}

      <div className="mt-3">
        {data == null ? (
          <div className="grid place-items-center py-8">
            {error ? <p className="text-sm text-muted">{p.filesLoadFailed}</p> : <Spinner size={18} />}
          </div>
        ) : !hasAny ? (
          <div className="flex flex-col items-center px-4 py-8 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-white/[0.06] text-muted">
              <HardDrive className="size-5" />
            </span>
            <h4 className="mt-3 text-sm font-semibold text-fg">{p.storageNoFiles}</h4>
            <p className="mt-1 max-w-xs text-sm text-muted">{p.filesEmptyText}</p>
          </div>
        ) : data.total === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{fill(p.filesNoMatch, { q: search })}</p>
        ) : (
          <div className={`-mx-2 overflow-x-auto transition-opacity ${loading ? "opacity-60" : ""}`}>
            <table className="w-full table-fixed text-start text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-line text-start">
                  {sortHead(p.filesColName, ["name"], "text-start")}
                  {sortHead(p.filesColSize, ["size"], "hidden w-24 text-start sm:table-cell")}
                  {sortHead(p.filesColModified, ["newest", "oldest"], "hidden w-32 text-start sm:table-cell")}
                  <th scope="col" className="w-[7.5rem]">
                    <span className="sr-only">{p.fileOpen}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((f) => (
                  <tr key={f.key} className="border-b border-line last:border-b-0 hover:bg-white/[0.03]">
                    <td className="px-2 py-2">
                      <div className="truncate text-fg" dir="auto" title={f.path}>
                        {f.path}
                      </div>
                      {/* On a phone the size and date columns are hidden; they ride under the name. */}
                      <div className="mt-0.5 text-xs text-muted sm:hidden">
                        {[formatBytes(f.size), f.lastModified ? dateFmt.format(new Date(f.lastModified)) : ""]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </td>
                    <td className="hidden px-2 py-2 text-muted tabular-nums sm:table-cell">{formatBytes(f.size) || "0 B"}</td>
                    <td className="hidden px-2 py-2 text-muted sm:table-cell">
                      {f.lastModified ? dateFmt.format(new Date(f.lastModified)) : ""}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex justify-end">
                        <a
                          href={f.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={iconBtn}
                          aria-label={`${p.fileOpen} ${f.name}`}
                          title={p.fileOpen}
                        >
                          <ExternalLink className="size-4" />
                        </a>
                        <button
                          type="button"
                          onClick={() => saveFromUrl(f.downloadUrl)}
                          className={iconBtn}
                          aria-label={`${p.fileDownload} ${f.name}`}
                          title={p.fileDownload}
                        >
                          <Download className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(f)}
                          className={`${iconBtn} hover:!text-danger`}
                          aria-label={`${p.fileDelete} ${f.name}`}
                          title={p.fileDelete}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > data.pageSize && (
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
            <span className="tabular-nums">{fill(p.filesRange, { from, to, total: data.total })}</span>
            <div className="flex gap-1">
              <button
                type="button"
                className={iconBtn}
                disabled={page <= 1 || loading}
                onClick={() => setPage((n) => n - 1)}
                aria-label={p.filesPrev}
                title={p.filesPrev}
              >
                <ChevronLeft className="size-4 rtl:rotate-180" />
              </button>
              <button
                type="button"
                className={iconBtn}
                disabled={page >= lastPage || loading}
                onClick={() => setPage((n) => n + 1)}
                aria-label={p.filesNext}
                title={p.filesNext}
              >
                <ChevronRight className="size-4 rtl:rotate-180" />
              </button>
            </div>
          </div>
        )}
      </div>

      {deleting && (
        <ConfirmDialog
          title={p.fileDeleteTitle}
          subtitle={fill(p.fileDeleteText, { name: deleting.name })}
          confirmLabel={p.fileDelete}
          danger
          busy={deleteBusy}
          onConfirm={() => void confirmDelete()}
          onClose={() => setDeleting(null)}
        />
      )}
    </Card>
  );
}
