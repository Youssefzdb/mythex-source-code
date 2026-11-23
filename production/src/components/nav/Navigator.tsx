import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  ChevronsUpDown,
  Crown,
  Mail,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Pin,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import {
  api,
  type ProjectSummary,
  type WorkspaceMembers,
  type WorkspaceSummary,
} from "../../lib/api";
import { createProject } from "../../lib/create-project";
import { useUpgrade } from "../../lib/upgrade";
import {
  fetchWorkspaces,
  fetchWorkspaceProjects,
  invalidateWorkspaceCatalog,
} from "../../lib/workspaceCatalog";
import { MythexMark } from "../mythex-mark";
import { DeleteProjectDialog, RenameProjectDialog } from "../ProjectManage";
import { Dialog, Skeleton, Spinner, useToast, ConfirmDialog } from "../ui";
import { AccountMenu } from "./AccountMenu";
import { fill, formatDate, pl, useT } from "../../i18n/app";

const WS_KEY = "mythex_ws";

export interface NavigatorProps {
  activeProjectId?: string;
  onNavigateProject: (id: string, opts?: { prompt?: string }) => void;
  pinned: boolean;
  onTogglePin: () => void;
}

export function Navigator({
  activeProjectId,
  onNavigateProject,
  pinned,
  onTogglePin,
}: NavigatorProps) {
  const t = useT();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | undefined>(
    () => localStorage.getItem(WS_KEY) ?? undefined,
  );
  const [showNewWorkspace, setShowNewWorkspace] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [creating, setCreating] = useState(false);
  const toast = useToast();
  const openUpgrade = useUpgrade();

  const workspace =
    workspaces?.find((w) => w.id === workspaceId) ??
    workspaces?.find((w) => w.isDefault) ??
    workspaces?.[0];

  const loadWorkspaces = useCallback(() => {
    void fetchWorkspaces()
      .then(setWorkspaces)
      .catch(() => setWorkspaces([]));
  }, []);

  useEffect(loadWorkspaces, [loadWorkspaces]);

  const reloadProjects = useCallback(() => {
    if (!workspace) return;
    void fetchWorkspaceProjects(workspace.id)
      .then(setProjects)
      .catch(() => setProjects([]));
  }, [workspace?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!workspace) return;
    setProjects(null);
    reloadProjects();
  }, [workspace?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectWorkspace = (id: string) => {
    setWorkspaceId(id);
    localStorage.setItem(WS_KEY, id);
  };

  const startBlank = async () => {
    if (!workspace || creating) return;
    setCreating(true);
    try {
      const { id } = await createProject({ workspaceId: workspace.id });
      reloadProjects();
      onNavigateProject(id);
    } catch (err: unknown) {
      const body = (err as { body?: { error?: string; limit?: number } }).body;
      if (body?.error === "project_limit") {
        toast("error", fill(t.shell.navigator.projectLimit, { limit: body.limit ?? "" }));
        openUpgrade("plans");
      } else {
        toast("error", t.shell.navigator.createProjectFailed);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-e border-line bg-bg">
      {/* Workspace switcher */}
      <div className="flex items-center gap-1 px-2 py-2">
        <WorkspaceSwitcher
          workspaces={workspaces}
          current={workspace}
          onSelect={selectWorkspace}
          onCreate={() => setShowNewWorkspace(true)}
        />
        <button
          onClick={onTogglePin}
          className="rounded-lg p-1.5 text-muted transition hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
          title={pinned ? t.shell.navigator.unpin : t.shell.navigator.pin}
          aria-label={pinned ? t.shell.navigator.unpin : t.shell.navigator.pin}
        >
          {pinned ? <PanelLeftClose className="h-4 w-4 rtl:-scale-x-100" /> : <Pin className="h-4 w-4" />}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {/* Projects */}
        <div className="mb-1 flex items-center justify-between px-1.5">
          <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">{t.shell.navigator.projects}</span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setShowMembers(true)}
              className="rounded-md p-1 text-muted transition hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
              title={t.shell.navigator.workspaceMembers}
              aria-label={t.shell.navigator.workspaceMembers}
            >
              <Users className="h-3.5 w-3.5" />
              {workspace && workspace.memberCount > 1 && (
                <span className="sr-only">{pl(t.shell.sidebar.members, workspace.memberCount)}</span>
              )}
            </button>
            <button
              onClick={() => void startBlank()}
              disabled={creating || !workspace}
              className="rounded-md p-1 text-muted transition hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
              title={t.shell.navigator.newProject}
              aria-label={t.shell.navigator.newProject}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {projects === null ? (
          <div className="space-y-1 px-1">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : projects.length === 0 ? (
          <p className="px-1.5 py-2 text-xs text-muted">{t.shell.navigator.noProjects}</p>
        ) : (
          <ul className="space-y-0.5">
            {projects.map((p) => (
              <ProjectRow
                key={p.id}
                project={p}
                active={p.id === activeProjectId}
                onOpen={() => onNavigateProject(p.id)}
                onChanged={reloadProjects}
              />
            ))}
          </ul>
        )}

      </div>

      <AccountMenu />

      {showNewWorkspace && (
        <NewWorkspaceDialog
          onClose={() => setShowNewWorkspace(false)}
          onCreated={(id) => {
            setShowNewWorkspace(false);
            loadWorkspaces();
            selectWorkspace(id);
          }}
        />
      )}
      {showMembers && workspace && (
        <MembersDialog
          workspace={workspace}
          isOwner={workspace.role === "OWNER" || workspace.role === "ADMIN"}
          onClose={() => {
            setShowMembers(false);
            loadWorkspaces();
          }}
        />
      )}
    </div>
  );
}

function ProjectRow({
  project,
  active,
  onOpen,
  onChanged,
}: {
  project: ProjectSummary;
  active: boolean;
  onOpen: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <li ref={ref} className="group relative">
      <button
        onClick={onOpen}
        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm transition focus-visible:ring-2 focus-visible:ring-white/20 ${
          active ? "bg-active text-fg" : "text-fg-2 hover:bg-hover hover:text-fg"
        }`}
      >
        <span dir="auto" className="min-w-0 flex-1 truncate text-start rtl:text-right">{project.name}</span>
      </button>
      <button
        onClick={() => setMenuOpen((o) => !o)}
        className={`absolute top-1/2 end-1 -translate-y-1/2 rounded-md p-1 text-muted transition hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent ${
          menuOpen ? "" : "md:opacity-0 md:group-hover:opacity-100"
        }`}
        title={t.shell.navigator.projectOptions}
        aria-label={t.shell.navigator.projectOptions}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {menuOpen && (
        <div className="fade-up absolute top-full end-1 z-30 mt-0.5 w-36 rounded-lg border border-line bg-panel p-1 shadow-2xl shadow-black/50">
          <button
            onClick={() => {
              setMenuOpen(false);
              setRenaming(true);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-sm text-fg-2 transition hover:bg-hover hover:text-fg"
          >
            <Pencil className="h-3.5 w-3.5" /> {t.common.rename}
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              setConfirmDelete(true);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-sm text-red-400 transition hover:bg-red-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> {t.common.delete}
          </button>
        </div>
      )}
      {renaming && (
        <RenameProjectDialog
          projectId={project.id}
          projectName={project.name}
          onClose={() => setRenaming(false)}
          onRenamed={() => {
            setRenaming(false);
            onChanged();
          }}
        />
      )}
      {confirmDelete && (
        <DeleteProjectDialog
          projectId={project.id}
          projectName={project.name}
          onClose={() => setConfirmDelete(false)}
          onDeleted={() => {
            setConfirmDelete(false);
            onChanged();
          }}
        />
      )}
    </li>
  );
}

function WorkspaceSwitcher({
  workspaces,
  current,
  onSelect,
  onCreate,
}: {
  workspaces: WorkspaceSummary[] | null;
  current?: WorkspaceSummary;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-fg transition hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent"
      >
        <MythexMark size={18} />
        <span dir="auto" className="min-w-0 flex-1 truncate text-start rtl:text-right">{current?.name ?? <Skeleton className="h-4 w-24" />}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted" />
      </button>
      {open && (
        <div className="fade-up absolute top-full start-0 z-40 mt-1.5 w-60 rounded-xl border border-line bg-panel p-1.5 shadow-2xl shadow-black/50">
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">{t.shell.navigator.workspaces}</p>
          {(workspaces ?? []).map((w) => (
            <button
              key={w.id}
              onClick={() => {
                onSelect(w.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-sm text-fg-2 transition hover:bg-hover hover:text-fg"
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-hover text-xs font-semibold text-fg-2">
                {w.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{w.name}</span>
                <span className="block text-[11px] text-muted">
                  {pl(t.shell.sidebar.members, w.memberCount)} · {pl(t.shell.navigator.projectsCount, w.projectCount)}
                </span>
              </span>
              {w.id === current?.id && <Check className="h-4 w-4 shrink-0 text-fg" />}
            </button>
          ))}
          <div className="my-1 border-t border-line" />
          <button
            onClick={() => {
              onCreate();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-sm text-fg-2 transition hover:bg-hover hover:text-fg"
          >
            <span className="grid h-6 w-6 place-items-center rounded-md border border-dashed border-line">
              <Plus className="h-3.5 w-3.5" />
            </span>
            {t.shell.navigator.newWorkspace}
          </button>
        </div>
      )}
    </div>
  );
}

export function NewWorkspaceDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const ws = await api.post<{ id: string }>("/v1/workspaces", { name: name.trim() });
      invalidateWorkspaceCatalog();
      toast("success", fill(t.shell.newWorkspace.created, { name: name.trim() }));
      onCreated(ws.id);
    } catch {
      toast("error", t.shell.newWorkspace.failed);
      setBusy(false);
    }
  };

  return (
    <Dialog title={t.shell.newWorkspace.title} subtitle={t.shell.newWorkspace.subtitle} onClose={onClose}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void create()}
        placeholder={t.shell.newWorkspace.namePlaceholder}
        className="input mt-4"
      />
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">
          {t.common.cancel}
        </button>
        <button onClick={() => void create()} disabled={busy || !name.trim()} className="btn-primary">
          {busy ? <Spinner size={16} /> : t.common.create}
        </button>
      </div>
    </Dialog>
  );
}

export function MembersDialog({
  workspace,
  isOwner,
  onClose,
}: {
  workspace: WorkspaceSummary;
  isOwner: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const [data, setData] = useState<WorkspaceMembers | null>(null);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<{ userId: string; name: string } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<{ id: string; email: string } | null>(null);
  const toast = useToast();

  const load = useCallback(() => {
    void api
      .get<WorkspaceMembers>(`/v1/workspaces/${workspace.id}/members`)
      .then(setData)
      .catch(() => setData({ members: [], invitations: [] }));
  }, [workspace.id]);

  useEffect(load, [load]);

  const invite = async () => {
    if (!email.trim()) return;
    setInviting(true);
    try {
      await api.post(`/v1/workspaces/${workspace.id}/invitations`, { email: email.trim() });
      toast("success", fill(t.shell.members.invited, { email: email.trim() }));
      setEmail("");
      load();
    } catch (err: unknown) {
      const body = (err as { body?: { error?: string } }).body;
      toast("error", body?.error === "already_member" ? t.shell.members.alreadyMember : t.shell.members.inviteFailed);
    } finally {
      setInviting(false);
    }
  };

  const revoke = async (invitationId: string) => {
    await api.delete(`/v1/workspaces/${workspace.id}/invitations/${invitationId}`).catch(() => {});
    setConfirmRevoke(null);
    load();
  };

  const remove = async (userId: string) => {
    try {
      await api.delete(`/v1/workspaces/${workspace.id}/members/${userId}`);
      toast("success", t.shell.members.removed);
      setConfirmRemove(null);
      load();
    } catch {
      toast("error", t.shell.members.removeFailed);
    }
  };

  return (
    <Dialog title={t.shell.members.title} subtitle={fill(t.shell.members.subtitle, { workspace: workspace.name })} onClose={onClose}>
      {isOwner && (
        <div className="mt-4 flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void invite()}
            placeholder="teammate@company.com"
            autoComplete="off"
            name="mythex-invite-email"
            className="input flex-1"
          />
          <button onClick={() => void invite()} disabled={inviting || !email.includes("@")} className="btn-primary shrink-0">
            {inviting ? <Spinner size={16} /> : <UserPlus className="h-4 w-4" />}
            {t.shell.members.invite}
          </button>
        </div>
      )}

      <div className="mt-4 max-h-80 space-y-1 overflow-y-auto">
        {data === null ? (
          <>
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </>
        ) : (
          <>
            {data.members.map((m) => (
              <div key={m.userId} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.03]">
                {m.avatarUrl ? (
                  <img src={m.avatarUrl} alt="" className="h-8 w-8 rounded-full border border-line" referrerPolicy="no-referrer" />
                ) : (
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-subtle text-sm font-semibold text-brand-300">
                    {m.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{m.name}</p>
                  <p className="truncate text-xs text-muted"><span dir="ltr">{m.email}</span></p>
                </div>
                {m.role === "OWNER" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                    <Crown className="h-3 w-3" />
                    {t.shell.members.owner}
                  </span>
                ) : (
                  <>
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-fg-2">{(t.teams.roles as Record<string, string>)[m.role] ?? t.shell.members.member}</span>
                    {isOwner && (workspace.role === "OWNER" || m.role !== "ADMIN") && (
                      <button
                        onClick={() => setConfirmRemove({ userId: m.userId, name: m.name })}
                        className="btn-ghost !p-1.5 text-muted hover:!text-red-400"
                        title={t.shell.members.removeMember}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}

            {data.invitations.length > 0 && (
              <>
                <p className="px-2 pt-3 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">{t.shell.members.pending}</p>
                {data.invitations.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.03]">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-dashed border-line text-muted">
                      <Mail className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-fg-2"><span dir="ltr">{inv.email}</span></p>
                      <p className="text-xs text-muted">{fill(t.shell.members.invitedOn, { date: formatDate(inv.createdAt, {}) })}</p>
                    </div>
                    {isOwner && (
                      <button
                        onClick={() => setConfirmRevoke({ id: inv.id, email: inv.email })}
                        className="btn-ghost !px-2 !py-1 text-xs text-muted hover:!text-red-400"
                      >
                        {t.shell.members.revoke}
                      </button>
                    )}
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
      <Link
        to={`/settings/team?workspace=${workspace.id}`}
        onClick={onClose}
        className="mt-3 block text-center text-xs text-muted underline-offset-2 hover:text-fg hover:underline"
        data-testid="members-manage-team"
      >
        {isOwner ? t.teams.membersDialog.manageTeam : t.teams.membersDialog.teamSettings}
      </Link>
      {confirmRemove && (
        <ConfirmDialog
          title={t.shell.members.removeTitle}
          subtitle={fill(t.shell.members.removeBody, { name: confirmRemove.name })}
          confirmLabel={t.common.remove}
          danger
          onClose={() => setConfirmRemove(null)}
          onConfirm={() => void remove(confirmRemove.userId)}
        />
      )}
      {confirmRevoke && (
        <ConfirmDialog
          title={t.shell.members.revokeTitle}
          subtitle={fill(t.shell.members.revokeBody, { email: confirmRevoke.email })}
          confirmLabel={t.shell.members.revoke}
          danger
          onClose={() => setConfirmRevoke(null)}
          onConfirm={() => void revoke(confirmRevoke.id)}
        />
      )}
    </Dialog>
  );
}

