import { useEffect, useRef, useState } from "react";
import { isPaidPlan } from "../lib/plan-tiers";
import {
  ArrowUpRight,
  BookOpen,
  Database,
  Download,
  Eye,
  Gauge,
  EyeOff,
  GitBranch,
  HardDrive,
  KeyRound,
  Plus,
  Settings2,
  Upload,
  Waypoints,
  Smartphone,
} from "lucide-react";
import {
  api,
  apiDownload,
  fileToBase64,
  githubAuthUrl,
  ApiError,
  type ProjectPlanLimits,
} from "../lib/api";
import { useUpgrade, UpgradeRequiredBanner } from "../lib/upgrade";
import { useAuth } from "../lib/auth";
import { DeleteProjectDialog } from "./ProjectManage";
import { ConfirmDialog, Dialog, Skeleton, Spinner, useToast } from "./ui";
import { openConnectors } from "../lib/connectors";
import { DescribedSelect } from "./ui/DescribedSelect";
import { CARD_BG, FG, FG_SECONDARY, surfaceRing } from "../lib/surfaces";
import { ListRowsSkeleton } from "./loading";
import { SlidingPillSwitch } from "./PricingPlans";
import { KnowledgeSettings } from "./KnowledgeSettings";
import { MobileAppSettings } from "./publish/MobileAppSettings";
import { DatabaseSettings, StorageSettings } from "./ProjectDataActions";
import { ProjectOverview } from "./ProjectOverview";
import { ProjectUsageSettings } from "./billing/ProjectUsageSettings";
import { appT, fill, pl, useT } from "../i18n/app";
import { rich } from "../i18n/app/rich";
import { ProjectPrivacyCard } from "./ProjectPrivacyCard";

/** Inline code inside a translated sentence. */
const codeTag = (s: string) => <code className="text-[11px]">{s}</code>;

interface EnvVarRow {
  key: string;
  value: string;
}

export type SettingsTab =
  | "general"
  | "usage"
  | "knowledge"
  | "secrets"
  | "database"
  | "storage"
  | "export"
  | "github"
  | "mobile";

interface GithubState {
  connected: boolean;
  login: string | null;
  repo: string | null;
  baseBranch: string;
  branch: string;
  autoSync: boolean;
  oauthConfigured: boolean;
}

export function SettingsDialog({
  projectId,
  projectName,
  hasDatabase,
  hasLiveDatabase = false,
  hasStorage,
  planLimits,
  onClose,
  onImported,
  onRenamed,
  onDeleted,
  initialTab = "secrets",
  /** Body only (no Dialog chrome). */
  embedded = false,
  /** Controlled section when embedded. */
  section,
  onRequestSection,
}: {
  projectId: string;
  projectName?: string;
  hasDatabase: boolean;
  /** Published with its own database (Fly projects). */
  hasLiveDatabase?: boolean;
  hasStorage: boolean;
  planLimits?: ProjectPlanLimits;
  onClose: () => void;
  initialTab?: SettingsTab;
  embedded?: boolean;
  section?: SettingsTab;
  onRequestSection?: (tab: SettingsTab) => void;
  onRenamed?: (name: string) => void;
  onDeleted?: () => void;
  /** Called after import so workspace can refresh preview / boot. */
  onImported?: (result: {
    started: boolean;
    previewUrl?: string;
    healthy?: boolean;
    services?: Array<{ name: string; port: number; url: string; web: boolean; healthy: boolean }>;
  }) => void;
}) {
  const openUpgrade = useUpgrade();
  const toast = useToast();
  const t = useT();
  const p = t.settings.project;
  const { user } = useAuth();
  const goUpgrade = () => {
    onClose();
    queueMicrotask(() => openUpgrade("plans"));
  };
  const isPro = isPaidPlan(user?.plan) || planLimits?.canExportCode === true;
  const canExport = planLimits?.canExportCode ?? isPro;
  const canGitHub = planLimits?.canGitHub ?? isPro;
  const canDatabase = planLimits?.canAttachDatabase ?? isPro;
  const canStorage = planLimits?.canEnableStorage ?? isPro;
  const [tab, setTab] = useState<SettingsTab>(section ?? initialTab);
  const activeTab: SettingsTab = section ?? tab;
  const goTab = (next: SettingsTab) => {
    setTab(next);
    onRequestSection?.(next);
  };

  useEffect(() => {
    if (section == null) setTab(initialTab);
  }, [initialTab, section]);
  const [displayName, setDisplayName] = useState(projectName ?? p.untitled);
  const [nameDraft, setNameDraft] = useState(projectName ?? p.untitled);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const next = projectName ?? appT().settings.project.untitled;
    setDisplayName(next);
    setNameDraft(next);
  }, [projectName]);

  const saveRename = async () => {
    const next = nameDraft.trim();
    if (!next || next === displayName) return;
    setBusy("rename");
    try {
      await api.patch(`/v1/projects/${projectId}`, { name: next });
      setDisplayName(next);
      setNameDraft(next);
      onRenamed?.(next);
      toast("success", p.renamed);
    } catch {
      toast("error", p.renameFailed);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (section) setTab(section);
  }, [section]);
  const [vars, setVars] = useState<EnvVarRow[]>([]);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const [gh, setGh] = useState<GithubState | null>(null);
  const [repoInput, setRepoInput] = useState("");
  /** Branch to pull code from (e.g. main). */
  const [baseBranchInput, setBaseBranchInput] = useState("main");
  /** Branch Mythex pushes agent commits to (never overwrites base). */
  const [workingBranchInput, setWorkingBranchInput] = useState("mythex");
  // Default false: picking an existing repo should pull into the sandbox, not push.
  const [createRepo, setCreateRepo] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [repos, setRepos] = useState<Array<{ fullName: string; private: boolean; defaultBranch: string }>>([]);
  const [reposLoading, setReposLoading] = useState(false);

  useEffect(() => {
    void api.get<Array<{ key: string; value: string }>>(`/v1/projects/${projectId}/env`).then((rows) => {
      setVars(rows.length ? rows : [{ key: "", value: "" }]);
      setSavedKeys(new Set(rows.map((r) => r.key).filter(Boolean)));
    });
  }, [projectId]);

  const refreshGithub = async () => {
    const s = await api.get<GithubState>(`/v1/projects/${projectId}/github`);
    setGh(s);
    if (s.repo) setRepoInput(s.repo);
    setBaseBranchInput(s.baseBranch || "main");
    setWorkingBranchInput(s.branch || "mythex");
    if (s.connected) {
      setReposLoading(true);
      try {
        const { repos: list } = await api.get<{
          repos: Array<{ fullName: string; private: boolean; defaultBranch: string }>;
        }>("/v1/account/github/repos");
        setRepos(list);
      } catch {
        setRepos([]);
      } finally {
        setReposLoading(false);
      }
    } else {
      setRepos([]);
    }
  };

  useEffect(() => {
    if (activeTab !== "github") return;
    void refreshGithub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, projectId]);

  // Popup OAuth: child window posts when GitHub connect finishes.
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.data?.type !== "mythex:github-connected") return;
      toast("success", appT().settings.project.githubConnected);
      goTab("github");
      void refreshGithub();
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const connectGithubOAuth = () => {
    const url = githubAuthUrl("/github-connected.html");
    const w = window.open(url, "mythex-github-oauth", "width=600,height=720");
    if (!w) {
      toast("error", p.popupBlocked);
      return;
    }
    toast("info", p.githubAuthInWindow);
  };

  const disconnectGithub = async () => {
    setBusy("gh-disconnect");
    try {
      if (gh?.repo) {
        await api.delete(`/v1/projects/${projectId}/github`);
      }
      await api.delete("/v1/account/github");
      setGh((cur) =>
        cur
          ? {
              ...cur,
              connected: false,
              login: null,
              repo: null,
              branch: "mythex",
              autoSync: true,
            }
          : cur,
      );
      setRepoInput("");
      setRepos([]);
      toast("success", p.githubDisconnected);
    } catch {
      toast("error", p.githubDisconnectFailed);
    } finally {
      setBusy(null);
    }
  };

  const toggleReveal = (i: number) =>
    setRevealed((r) => {
      const next = new Set(r);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const removedKeys = [...savedKeys].filter((k) => !vars.some((v) => v.key.trim() === k));

  const saveVars = async () => {
    setBusy("vars");
    setConfirmSave(false);
    const next = vars.filter((v) => v.key.trim()).map((v) => ({ key: v.key.trim(), value: v.value }));
    try {
      await api.put(`/v1/projects/${projectId}/env`, { vars: next });
    } catch (err) {
      // A refused save said nothing and left the button spinning.
      const body = err instanceof ApiError ? (err.body as { message?: unknown } | null) : null;
      toast("error", typeof body?.message === "string" ? body.message : p.envSaveFailed);
      setBusy(null);
      return;
    }
    setSavedKeys(new Set(next.map((v) => v.key)));
    setBusy(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const onSaveClick = () => {
    if (removedKeys.length > 0) setConfirmSave(true);
    else void saveVars();
  };

  const exportProject = async () => {
    setBusy("export");
    try {
      await apiDownload(`/v1/projects/${projectId}/export`, `${projectName ?? "project"}-mythex.tar.gz`);
      toast("success", p.downloadStarted);
    } catch {
      toast("error", p.exportFailed);
    } finally {
      setBusy(null);
    }
  };

  const importIntoProject = async (file: File) => {
    setBusy("import");
    try {
      const data = await fileToBase64(file);
      const format = file.name.endsWith(".zip") ? "zip" : file.name.includes(".tar") ? "tar.gz" : "auto";
      const result = await api.post<{
        ok: true;
        filesTouched: number;
        started?: boolean;
        reason?: string;
        message?: string;
        previewUrl?: string;
        healthy?: boolean;
        services?: Array<{ name: string; port: number; url: string; web: boolean; healthy: boolean }>;
      }>(`/v1/projects/${projectId}/import`, { data, format });
      onImported?.({
        started: result.started === true,
        previewUrl: result.previewUrl,
        healthy: result.healthy,
        services: result.services,
      });
      toast("success", p.imported);
      // newChat: true → Workspace opens a fresh thread with the prompt seeded
      // (visible in history). Do not use the in-place event: boot/remount races
      // drop it and leave the chat looking empty while the agent still runs.
      window.dispatchEvent(
        new CustomEvent("mythex:agent-prompt", {
          detail: { text: p.importBootstrapPrompt, newChat: true },
        }),
      );
      onClose();
    } catch (err) {
      const msg =
        err instanceof ApiError ? ((err.body as { message?: string })?.message ?? p.importFailed) : p.importFailed;
      toast("error", msg);
    } finally {
      setBusy(null);
    }
  };

  const connectWithToken = async () => {
    setBusy("gh-token");
    try {
      await api.post("/v1/account/github/connect-token", { accessToken: tokenInput.trim() });
      setTokenInput("");
      await refreshGithub();
      toast("success", p.githubConnected);
    } catch {
      toast("error", p.tokenFailed);
    } finally {
      setBusy(null);
    }
  };

  const linkRepo = async () => {
    setBusy("gh-link");
    try {
      const result = await api.post<{
        repo: string;
        baseBranch?: string;
        branch: string;
        autoSync: boolean;
        mode?: "pull" | "push";
        sha?: string;
        filesTouched?: number;
        empty?: boolean;
      }>(`/v1/projects/${projectId}/github/link`, {
        repo: repoInput.trim(),
        baseBranch: baseBranchInput.trim() || "main",
        branch: workingBranchInput.trim() || "mythex",
        // Never create/push when updating an already-linked project — always pull.
        createRepo: gh?.repo ? false : createRepo,
        private: true,
      });
      setGh((g) =>
        g
          ? {
              ...g,
              repo: result.repo,
              baseBranch: result.baseBranch || baseBranchInput.trim() || "main",
              branch: result.branch,
              autoSync: result.autoSync,
            }
          : g,
      );
      if (result.mode === "pull") {
        onImported?.({ started: false });
        if (result.empty || (result.filesTouched ?? 0) === 0) {
          toast("error", p.linkedEmpty);
        } else {
          toast("success", p.repoPulled);
          window.dispatchEvent(
            new CustomEvent("mythex:agent-prompt", {
              detail: { text: p.importBootstrapPrompt, newChat: true },
            }),
          );
        }
      } else {
        toast("success", p.repoLinkedPushed);
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? ((err.body as { message?: string })?.message ?? p.linkFailed)
          : p.linkFailed;
      toast("error", msg);
    } finally {
      setBusy(null);
    }
  };

  const syncNow = async () => {
    setBusy("gh-sync");
    try {
      await api.post(`/v1/projects/${projectId}/github/sync`, {});
      toast("success", p.pushed);
    } catch {
      toast("error", p.syncFailed);
    } finally {
      setBusy(null);
    }
  };

  const pullRemote = async () => {
    setBusy("gh-pull");
    try {
      const result = await api.post<{
        ok?: boolean;
        sha?: string;
        filesTouched?: number;
        empty?: boolean;
        message?: string;
      }>(`/v1/projects/${projectId}/github/pull`, {});
      onImported?.({ started: false });
      if (result.empty || (result.filesTouched ?? 0) === 0) {
        toast(
          "error",
          result.message ?? p.pulledEmpty,
        );
      } else {
        toast("success", p.pulled);
        window.dispatchEvent(
          new CustomEvent("mythex:agent-prompt", {
            detail: { text: p.importBootstrapPrompt, newChat: true },
          }),
        );
      }
    } catch {
      toast("error", p.pullFailed);
    } finally {
      setBusy(null);
    }
  };

  const openPr = async () => {
    try {
      const { url } = await api.get<{ url: string }>(`/v1/projects/${projectId}/github/pr-url`);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast("error", p.prFailed);
    }
  };

  const tabs: { id: SettingsTab; label: string; icon: typeof KeyRound }[] = [
    { id: "general", label: p.tabGeneral, icon: Settings2 },
    { id: "usage", label: p.usage, icon: Gauge },
    { id: "knowledge", label: p.tabKnowledge, icon: BookOpen },
    { id: "database", label: p.database, icon: Database },
    { id: "storage", label: p.fileStorage, icon: HardDrive },
    { id: "secrets", label: p.tabSecrets, icon: KeyRound },
    { id: "export", label: p.tabExport, icon: Download },
    { id: "github", label: "GitHub", icon: GitBranch },
    { id: "mobile", label: t.publish.mobile.settingsTab, icon: Smartphone },
  ];

  /**
   * The rail, mirroring the connectors modal.
   *
   * Connectors is not a section — it opens its own modal — but this is the
   * panel people open when they want the project to reach something outside
   * it, next to Secrets and GitHub, so it is where they go looking.
   */
  const rail = (
    <>
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => goTab(id)}
          // Below `sm` the label is hidden and only the glyph is left, so the
          // name has to survive somewhere: without this the tabs are five
          // unlabelled icons, to a screen reader and to anyone guessing.
          aria-label={label}
          title={label}
          aria-current={activeTab === id}
          className={`flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-start text-[14px] leading-[21px] transition-colors ${
            activeTab === id ? "bg-white/[0.04] font-medium" : "hover:bg-white/[0.03]"
          }`}
          style={{ color: activeTab === id ? FG : FG_SECONDARY }}
        >
          <Icon className="size-4 shrink-0 opacity-70" />
          <span className="hidden truncate sm:inline">{label}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={() => openConnectors()}
        data-testid="settings-connectors"
        aria-label={p.connectors}
        title={p.connectors}
        className="mt-1 flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-start text-[14px] leading-[21px] transition-colors hover:bg-white/[0.03]"
        style={{ color: FG_SECONDARY }}
      >
        <Waypoints className="size-4 shrink-0 opacity-70" />
        <span className="hidden truncate sm:inline">{p.connectors}</span>
        <ArrowUpRight className="ms-auto hidden size-3.5 shrink-0 opacity-50 sm:block" />
      </button>
    </>
  );

  const content = (
    <>
      {/* No rail on a phone, so the sections ride here — with the connectors
          shortcut beside them, since it is not one of them. */}
      {!embedded && (
        <div className="mb-1 flex items-center gap-2 sm:hidden">
          <button
            type="button"
            onClick={() => openConnectors()}
            aria-label={p.connectors}
            data-testid="settings-connectors-mobile"
            className="grid size-8 shrink-0 place-items-center rounded-full text-white/70 transition hover:bg-white/[0.06] hover:text-white"
          >
            <Waypoints className="size-4" />
          </button>
          <SlidingPillSwitch
            fullWidth
            size="sm"
            bareTrack
            aria-label={p.sectionAria}
            value={activeTab}
            onChange={(v) => goTab(v as SettingsTab)}
            options={tabs.map(({ id, label, icon: Icon }) => ({
              value: id,
              label: (
                <>
                  <Icon className="size-3.5" strokeWidth={2.25} />
                  <span className="hidden sm:inline">{label}</span>
                </>
              ),
            }))}
          />
        </div>
      )}

      {activeTab === "general" && (
        <section className={`${embedded ? "" : "mt-5 "}space-y-4`}>
          <div className="rounded-[12px] p-4" style={{ background: CARD_BG, boxShadow: surfaceRing(CARD_BG) }}>
            <h3 className="text-sm font-semibold text-fg">{p.projectName}</h3>
            <div className="mt-3 flex items-center gap-2">
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void saveRename();
                  }
                }}
                className="input min-w-0 flex-1 !py-2 text-sm"
                dir="auto"
                aria-label={p.projectName}
              />
              <button
                type="button"
                disabled={busy === "rename" || !nameDraft.trim() || nameDraft.trim() === displayName}
                onClick={() => void saveRename()}
                className="btn-primary shrink-0 !px-4 !py-2 text-sm"
              >
                {busy === "rename" ? <Spinner size={16} /> : t.common.save}
              </button>
            </div>
          </div>
          <ProjectOverview projectId={projectId} />
          <ProjectPrivacyCard projectId={projectId} />
          {deleting && (
            <DeleteProjectDialog
              projectId={projectId}
              projectName={displayName}
              onClose={() => setDeleting(false)}
              onDeleted={() => {
                setDeleting(false);
                onClose();
                onDeleted?.();
              }}
            />
          )}
          {/* Quiet by design: a red block with a red button made deleting the
              project look like one of General's main actions, sitting above
              the things people actually come here to read. */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-[13px] text-muted">
              {p.deleteHint}
            </p>
            <button
              type="button"
              onClick={() => setDeleting(true)}
              className="shrink-0 text-[13px] text-red-400 underline-offset-2 transition hover:text-red-300 hover:underline"
            >
              {p.deleteProject}
            </button>
          </div>
        </section>
      )}

      {activeTab === "usage" && (
        <section className={embedded ? "" : "mt-5"}>
          <ProjectUsageSettings projectId={projectId} onUpgrade={goUpgrade} />
        </section>
      )}

      {activeTab === "knowledge" && <KnowledgeSettings projectId={projectId} />}

      {activeTab === "mobile" && (
        <section className={embedded ? "" : "mt-5"}>
          <MobileAppSettings projectId={projectId} />
        </section>
      )}

      {activeTab === "database" && (
        <section className={embedded ? "" : "mt-5"}>
          <DatabaseSettings
            projectId={projectId}
            hasDatabase={hasDatabase}
            hasLiveDatabase={hasLiveDatabase}
            canDatabase={canDatabase}
            canConnect={canExport}
            onUpgrade={goUpgrade}
          />
        </section>
      )}

      {activeTab === "storage" && (
        <section className={embedded ? "" : "mt-5"}>
          <StorageSettings
            projectId={projectId}
            hasStorage={hasStorage}
            canStorage={canStorage}
            onUpgrade={goUpgrade}
          />
        </section>
      )}

      {activeTab === "export" && (
        <section className={`${embedded ? "" : "mt-5 "}space-y-4`}>
          {!canExport ? (
            <UpgradeRequiredBanner feature={p.featureExport} onUpgrade={goUpgrade} />
          ) : (
            <>
          <div className="rounded-[12px] p-4" style={{ background: CARD_BG, boxShadow: surfaceRing(CARD_BG) }}>
            <h3 className="text-sm font-semibold text-fg">{p.exportTitle}</h3>
            <p className="mt-1.5 text-sm text-muted">
              {rich(p.exportText, { code: codeTag })}
            </p>
            <button
              type="button"
              disabled={busy === "export"}
              onClick={() => void exportProject()}
              className="btn-primary mt-4 inline-flex items-center gap-2 !px-4 !py-2 text-sm"
            >
              <Download className="size-3.5" />
              {busy === "export" ? p.preparing : p.downloadExport}
            </button>
          </div>
          <div className="rounded-[12px] p-4" style={{ background: CARD_BG, boxShadow: surfaceRing(CARD_BG) }}>
            <h3 className="text-sm font-semibold text-fg">{p.importTitle}</h3>
            <p className="mt-1.5 text-sm text-muted">
              {rich(p.importText, { code: codeTag })}
            </p>
            <input
              ref={importRef}
              type="file"
              accept=".tar.gz,.tgz,.zip,application/gzip,application/zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void importIntoProject(f);
              }}
            />
            <button
              type="button"
              disabled={busy === "import"}
              onClick={() => importRef.current?.click()}
              className="btn-secondary mt-4 inline-flex items-center gap-2 !px-4 !py-2 text-sm"
            >
              <Upload className="size-3.5" />
              {busy === "import" ? p.importing : p.chooseArchive}
            </button>
          </div>
            </>
          )}
        </section>
      )}

      {activeTab === "github" && (
        <section className={`${embedded ? "" : "mt-5 "}space-y-4`}>
          {!canGitHub ? (
            <UpgradeRequiredBanner feature={p.featureGithub} onUpgrade={goUpgrade} />
          ) : !gh ? (
            <div className="space-y-3" aria-hidden>
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          ) : (
            <>
              <div className="rounded-[12px] p-4" style={{ background: CARD_BG, boxShadow: surfaceRing(CARD_BG) }}>
                <h3 className="text-sm font-semibold text-fg">{p.connectGithub}</h3>
                {gh.connected ? (
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-muted">
                      {rich(p.connectedAs, {
                        login: (
                          <bdi dir="ltr" className="font-medium text-fg">
                            @{gh.login}
                          </bdi>
                        ),
                      })}
                    </p>
                    <button
                      type="button"
                      disabled={busy === "gh-disconnect"}
                      onClick={() => void disconnectGithub()}
                      className="btn-ghost !px-3 !py-1.5 text-xs text-red-400 hover:text-red-300"
                    >
                      {busy === "gh-disconnect" ? p.disconnecting : t.common.disconnect}
                    </button>
                  </div>
                ) : gh.oauthConfigured ? (
                  <>
                    <p className="mt-1.5 text-sm text-muted">
                      {p.connectGithubText}
                    </p>
                    <button
                      type="button"
                      onClick={connectGithubOAuth}
                      className="btn-primary mt-4 inline-flex items-center gap-2 !px-4 !py-2 text-sm"
                    >
                      <GitBranch className="size-3.5" />
                      {p.connectGithub}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="mt-1.5 text-sm text-muted">
                      {rich(p.noOauth, { code: codeTag })}
                    </p>
                    <input
                      type="password"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder="ghp_…"
                      className="input mt-3 w-full !py-2 font-mono text-xs"
                    />
                    <button
                      type="button"
                      disabled={!tokenInput.trim() || busy === "gh-token"}
                      onClick={() => void connectWithToken()}
                      className="btn-primary mt-3 !px-4 !py-2 text-sm"
                    >
                      {busy === "gh-token" ? p.connecting : p.saveToken}
                    </button>
                  </>
                )}
              </div>

              {gh.connected && (
                <div className="rounded-[12px] p-4" style={{ background: CARD_BG, boxShadow: surfaceRing(CARD_BG) }}>
                  <h3 className="text-sm font-semibold text-fg">{p.linkTitle}</h3>
                  <p className="mt-1.5 text-sm text-muted">
                    {p.linkText}
                  </p>
                  {reposLoading ? (
                    <div className="mt-3">
                      <ListRowsSkeleton rows={4} />
                    </div>
                  ) : repos.length > 0 ? (
                    <div className="mt-3">
                      <p className="mb-1 text-xs font-medium text-muted">{p.yourRepos}</p>
                      {/* The app's own select, not a native one: a native
                          control brings the browser's chevron and the OS popup,
                          neither of which can be styled to match. */}
                      <DescribedSelect
                        value={repos.some((r) => r.fullName === repoInput) ? repoInput : ""}
                        emptyValue=""
                        placeholder={p.selectRepo}
                        ariaLabel={p.yourRepos}
                        wide
                        className="w-full [&>button]:!h-9 [&>button]:!w-full"
                        options={repos.map((r) => ({
                          id: r.fullName,
                          label: r.private ? fill(p.repoPrivate, { name: r.fullName }) : r.fullName,
                        }))}
                        onChange={(full) => {
                          if (!full) return;
                          setRepoInput(full);
                          setCreateRepo(false);
                          const match = repos.find((r) => r.fullName === full);
                          if (match?.defaultBranch) setBaseBranchInput(match.defaultBranch);
                        }}
                      />
                    </div>
                  ) : null}
                  <label className="mt-3 block text-xs font-medium text-muted">
                    {p.repoLabel}
                    <input
                      value={repoInput}
                      onChange={(e) => setRepoInput(e.target.value)}
                      placeholder={`${gh.login ?? "owner"}/my-app`}
                      className="input mt-1 w-full !py-2 font-mono text-xs"
                    />
                  </label>
                  <label className="mt-3 block text-xs font-medium text-muted">
                    {p.baseBranchLabel}
                    <input
                      value={baseBranchInput}
                      onChange={(e) => setBaseBranchInput(e.target.value)}
                      placeholder="main"
                      className="input mt-1 w-full !py-2 font-mono text-xs"
                    />
                  </label>
                  <label className="mt-3 block text-xs font-medium text-muted">
                    {p.workingBranchLabel}
                    <input
                      value={workingBranchInput}
                      onChange={(e) => setWorkingBranchInput(e.target.value)}
                      placeholder="mythex"
                      className="input mt-1 w-full !py-2 font-mono text-xs"
                    />
                  </label>
                  <p className="mt-1.5 text-[11px] text-muted">
                    {p.branchHint}
                  </p>
                  {!gh.repo && (
                    <label className="mt-3 flex items-center gap-2 text-sm text-fg">
                      <input
                        type="checkbox"
                        checked={createRepo}
                        onChange={(e) => setCreateRepo(e.target.checked)}
                      />
                      {p.createRepo}
                    </label>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!repoInput.includes("/") || busy === "gh-link"}
                      onClick={() => void linkRepo()}
                      className="btn-primary !px-4 !py-2 text-sm"
                    >
                      {busy === "gh-link"
                        ? createRepo
                          ? p.linking
                          : p.pulling
                        : gh.repo
                          ? p.updateLink
                          : createRepo
                            ? p.linkPush
                            : p.linkPull}
                    </button>
                    {gh.repo && (
                      <>
                        <button
                          type="button"
                          disabled={busy === "gh-sync"}
                          onClick={() => void syncNow()}
                          className="btn-secondary !px-4 !py-2 text-sm"
                        >
                          {busy === "gh-sync" ? p.syncing : p.syncNow}
                        </button>
                        <button
                          type="button"
                          disabled={busy === "gh-pull"}
                          onClick={() => void pullRemote()}
                          className="btn-secondary !px-4 !py-2 text-sm"
                        >
                          {busy === "gh-pull" ? p.pulling : p.pull}
                        </button>
                        <button type="button" onClick={() => void openPr()} className="btn-ghost !px-3 !py-2 text-sm">
                          {p.openPr}
                        </button>
                      </>
                    )}
                  </div>
                  {gh.repo && (
                    <p className="mt-3 text-xs text-muted">
                      {rich(p.linkedTo, {
                        repo: (
                          <a
                            dir="ltr"
                            className="text-fg hover:underline"
                            href={`https://github.com/${gh.repo}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {gh.repo}
                          </a>
                        ),
                        base: (
                          <code dir="ltr" className="text-[11px]">
                            {gh.baseBranch || "main"}
                          </code>
                        ),
                        branch: (
                          <code dir="ltr" className="text-[11px]">
                            {gh.branch}
                          </code>
                        ),
                      })}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {activeTab === "secrets" && (
        <section className={embedded ? undefined : "mt-5"}>
          <p className="mb-3 text-sm leading-relaxed" style={{ color: "oklch(72.34% 0.002 107)" }}>
            {rich(p.secretsIntro, { code: codeTag })}
          </p>
          <form
            className="space-y-2"
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault();
              onSaveClick();
            }}
          >
            {vars.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={row.key}
                  onChange={(e) => setVars((v) => v.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))}
                  placeholder="KEY"
                  name={`env-key-${i}`}
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
                  className="input min-w-0 flex-1 !py-2 font-mono text-xs"
                />
                <div className="relative min-w-0 flex-[1.2]">
                  <input
                    type={revealed.has(i) ? "text" : "password"}
                    value={row.value}
                    onChange={(e) =>
                      setVars((v) => v.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))
                    }
                    placeholder={p.valuePlaceholder}
                    name={`env-value-${i}`}
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                    className="input w-full !py-2 pe-9 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => toggleReveal(i)}
                    className="absolute top-1/2 end-2 -translate-y-1/2 text-muted transition hover:text-fg"
                    title={revealed.has(i) ? p.hideValue : p.showValue}
                  >
                    {revealed.has(i) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setVars((v) => v.filter((_, j) => j !== i))}
                  className="shrink-0 rounded-md px-1.5 py-1 text-muted transition hover:bg-danger hover:text-white"
                  aria-label={p.removeVariable}
                >
                  ✕
                </button>
              </div>
            ))}
            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setVars((v) => [...v, { key: "", value: "" }])}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-fg transition hover:opacity-80"
              >
                <Plus className="size-3.5" />
                {p.addVariable}
              </button>
              <div className="flex items-center gap-2">
                {!embedded && (
                  <button type="button" onClick={onClose} className="btn-ghost !px-3 !py-2 text-sm">
                    {t.common.close}
                  </button>
                )}
                <button type="submit" disabled={busy === "vars"} className="btn-primary !px-4 !py-2 text-sm">
                  {busy === "vars" ? t.common.saving : saved ? t.common.saved : t.common.save}
                </button>
              </div>
            </div>
          </form>
        </section>
      )}
      {confirmSave && (
        <ConfirmDialog
          title={p.confirmSaveTitle}
          subtitle={
            removedKeys.length === 1
              ? fill(p.confirmRemoveOne, { key: removedKeys[0] })
              : pl(p.confirmRemoveMany, removedKeys.length)
          }
          confirmLabel={t.common.save}
          danger
          busy={busy === "vars"}
          onClose={() => setConfirmSave(false)}
          onConfirm={() => void saveVars()}
        />
      )}
    </>
  );

  if (embedded) return content;

  return (
    <Dialog
      title={p.dialogTitle}
      subtitle={p.dialogSubtitle}
      onClose={onClose}
      sidebar={rail}
      sheet
    >
      {content}
    </Dialog>
  );
}
