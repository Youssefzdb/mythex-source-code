import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import {
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Eye,
  FileCode2,
  FilePlus,
  Files,
  Folder as FolderIcon,
  FolderPlus,
  Pencil,
  RotateCw,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { orch, type FileEntry, type OrchClient } from "../lib/orchestrator";
import { useTheme } from "../lib/theme";
import { ConfirmDialog, useToast } from "./ui";
import { AnchoredPopover } from "./ui/Popover";
import { proTrialCta, SlidingPillSwitch } from "./PricingPlans";
import { TerminalPane } from "./TerminalPane";
import { FileTypeIcon, FolderTypeIcon } from "./FileTypeIcon";
import { markdownCodeComponents } from "./MermaidBlock";
import { EditorPalette, type CommandItem, type PaletteMode } from "./editor/EditorPalette";
import { SearchSidebar, type SearchOptions } from "./editor/SearchSidebar";
import { useUpgrade } from "../lib/upgrade";
import { importOrReload } from "../lib/lazy-route";
import { mediaKindFor, type MediaKind } from "../lib/file-kind";
import { FileViewer } from "./editor/FileViewer";
import {
  MOD_LABEL,
  isMod,
  loadEditorSettings,
  saveEditorSettings,
  type EditorSettings,
} from "./editor/editorSettings";
import {
  createLspWorkspace,
  disableBuiltinTsValidation,
  serverForPath,
} from "./editor/lspClient";
import { appT, fill, pl, useT } from "../i18n/app";

interface TreeNode extends FileEntry {
  children?: TreeNode[];
  expanded?: boolean;
}

interface Tab {
  path: string;
  content: string;
  savedContent: string;
  dirty: boolean;
  /** Not text: shown in a viewer, never in the editor, never saved. */
  media?: { kind: MediaKind; dataUrl: string };
}

/** A tab's file: text for the editor, or bytes for the viewer when the name
 *  says it isn't text — or when the text read comes back with NUL bytes. */
async function readTabFile(client: OrchClient, path: string): Promise<{ content: string; media?: Tab["media"] } | null> {
  const known = mediaKindFor(path);
  if (!known) {
    const file = await orch.readFile(client, path).catch(() => null);
    if (!file || !file.content.includes("\u0000")) return file;
  }
  const dataUrl = await orch.readFileDataUrl(client, path).catch(() => null);
  if (!dataUrl) return null;
  const kind = known?.kind ?? "binary";
  // The server only names image types; the rest come back octet-stream.
  const typed = known ? dataUrl.replace(/^data:[^;]*;/, `data:${known.mime};`) : dataUrl;
  return { content: "", media: { kind, dataUrl: typed } };
}

type MonacoEditor = Parameters<OnMount>[0];
type MonacoApi = Parameters<OnMount>[1];
type SideView = "files" | "search";
type InlineEdit =
  | { kind: "create"; parentDir: string; dir: boolean }
  | { kind: "rename"; path: string; name: string }
  | null;

const langFor = (path: string): string => {
  const base = path.split("/").pop() ?? "";
  if (/^dockerfile$/i.test(base) || /^dockerfile\./i.test(base)) return "dockerfile";
  const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
  return (
    {
      js: "javascript",
      mjs: "javascript",
      cjs: "javascript",
      jsx: "javascript",
      ts: "typescript",
      tsx: "typescript",
      json: "json",
      jsonc: "json",
      html: "html",
      htm: "html",
      css: "css",
      scss: "css",
      less: "css",
      py: "python",
      pyi: "python",
      md: "markdown",
      mdx: "markdown",
      yml: "yaml",
      yaml: "yaml",
      sh: "shell",
      bash: "shell",
      zsh: "shell",
      vue: "vue",
      svelte: "svelte",
      php: "php",
      graphql: "graphql",
      gql: "graphql",
      go: "go",
      rs: "rust",
      dockerfile: "dockerfile",
    }[ext] ?? "plaintext"
  );
};

const baseName = (path: string) => path.split("/").pop() ?? path;
/** A tab's label. Uploads are stored as `.attachments/<ms>-<name>` so two
 *  files of one name can't collide; the tab shows the name the person gave it. */
const tabLabel = (path: string) =>
  /(^|\/)\.attachments\//.test(path) ? baseName(path).replace(/^\d{12,}-/, "") : baseName(path);
const isMarkdownPath = (path: string) => /\.md$/i.test(path);

function normalizePath(path: string): string {
  return path.replace(/^\.\//, "").replace(/^\/home\/user\/app\//, "");
}

/** When opening a path, try exact file first, then common TS/JS / index variants. */
function importPathCandidates(path: string): string[] {
  // TypeScript ESM imports often use `.js` while the source file is `.ts`/`.tsx`.
  const extSwap: Record<string, string[]> = {
    ".js": [".ts", ".tsx", ".jsx", ".js"],
    ".jsx": [".tsx", ".jsx"],
    ".mjs": [".mts", ".ts", ".mjs"],
    ".cjs": [".cts", ".ts", ".cjs"],
  };
  for (const [from, tos] of Object.entries(extSwap)) {
    if (path.endsWith(from)) {
      const base = path.slice(0, -from.length);
      return tos.map((ext) => `${base}${ext}`);
    }
  }
  if (/\.[a-zA-Z0-9]+$/.test(path)) return [path];
  // Extensionless names (Dockerfile, Makefile, LICENSE) — exact path first.
  return [
    path,
    `${path}.tsx`,
    `${path}.ts`,
    `${path}.jsx`,
    `${path}.js`,
    `${path}/index.tsx`,
    `${path}/index.ts`,
    `${path}/index.jsx`,
    `${path}/index.js`,
  ];
}

/**
 * Monaco from our own build (editor/monaco-setup.ts), fetched the first time a
 * file opens in the editor — not from the CDN, and not in the workspace bundle.
 */
let monacoSetup: Promise<void> | null = null;
let monacoLoaded = false;
function loadMonaco(): Promise<void> {
  monacoSetup ??= importOrReload(() => import("./editor/monaco-setup")).then(
    () => {
      monacoLoaded = true;
    },
    (err) => {
      monacoSetup = null;
      throw err;
    },
  );
  return monacoSetup;
}

export function CodeView({
  client,
  ready,
  openPath,
  openLine,
  onOpenPathConsumed,
  filesSyncToken,
  changedPaths,
  canEditCode = true,
}: {
  client: OrchClient;
  ready: boolean;
  openPath?: string | null;
  openLine?: number | null;
  onOpenPathConsumed?: () => void;
  filesSyncToken?: number;
  changedPaths?: string[] | null;
  /** Free plan: view files only — no edit / create / rename / delete. */
  canEditCode?: boolean;
}) {
  const i18n = useT();
  const cv = i18n.workspace.codeView;
  const openUpgrade = useUpgrade();
  const { theme } = useTheme();
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
  type CtxMenu =
    | { kind: "tree"; x: number; y: number; node: TreeNode }
    | { kind: "tab"; x: number; y: number; path: string };
  const [menu, setMenu] = useState<CtxMenu | null>(null);
  const [mdPreviewByPath, setMdPreviewByPath] = useState<Record<string, boolean>>({});
  const [palette, setPalette] = useState<PaletteMode | null>(null);
  const [settings, setSettings] = useState<EditorSettings>(() => loadEditorSettings());
  const [fileIndex, setFileIndex] = useState<string[]>([]);
  const [closedStack, setClosedStack] = useState<string[]>([]);
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [sideView, setSideView] = useState<SideView>("files");
  const [searchFocusToken, setSearchFocusToken] = useState(0);
  const [inlineEdit, setInlineEdit] = useState<InlineEdit>(null);
  const [lspReady, setLspReady] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<Tab[]>(tabs);
  tabsRef.current = tabs;
  const activePathRef = useRef(activePath);
  activePathRef.current = activePath;
  const openingRef = useRef<Map<string, Promise<void>>>(new Map());
  const editorRef = useRef<MonacoEditor | null>(null);
  const monacoRef = useRef<MonacoApi | null>(null);
  const lspRef = useRef<ReturnType<typeof createLspWorkspace> | null>(null);
  const lspChangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLineRef = useRef<number | null>(null);
  const pendingColumnRef = useRef<number | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncToken = useRef<number | undefined>(undefined);
  const toast = useToast();
  const [pendingDelete, setPendingDelete] = useState<TreeNode | null>(null);

  const active = tabs.find((t) => t.path === activePath) ?? null;
  const activeIsMd = Boolean(active && isMarkdownPath(active.path));
  const showMdPreview = activeIsMd && (mdPreviewByPath[active!.path] ?? true);
  const needsEditor = Boolean(active && !active.media && !showMdPreview);
  const [monacoReady, setMonacoReady] = useState(monacoLoaded);
  const [monacoFailed, setMonacoFailed] = useState(false);
  useEffect(() => {
    if (!needsEditor || monacoReady) return;
    let live = true;
    setMonacoFailed(false);
    loadMonaco().then(
      () => live && setMonacoReady(true),
      () => live && setMonacoFailed(true),
    );
    return () => {
      live = false;
    };
  }, [needsEditor, monacoReady]);

  const loadRoot = useCallback(async () => {
    if (!ready) return;
    const entries = await orch.listFiles(client).catch(() => []);
    setTree(sortEntries(entries.map((e) => ({ ...e }))));
  }, [client, ready]);

  const refreshFileIndex = useCallback(async () => {
    if (!ready) return;
    const res = await orch.listAllFiles(client).catch(() => ({ files: [] as string[] }));
    setFileIndex(res.files);
  }, [client, ready]);

  useEffect(() => {
    void loadRoot();
    void refreshFileIndex();
  }, [loadRoot, refreshFileIndex]);

  // Kept through the menu's exit, so it shrinks away with its items in it.
  const shownMenuRef = useRef<CtxMenu | null>(null);
  if (menu) shownMenuRef.current = menu;
  const shownMenu = menu ?? shownMenuRef.current;

  const persistSettings = useCallback((next: EditorSettings) => {
    setSettings(next);
    saveEditorSettings(next);
  }, []);

  const revealLine = useCallback((line: number, column?: number) => {
    const ed = editorRef.current;
    if (!ed || !Number.isFinite(line) || line < 1) return;
    const col = column != null && column > 0 ? column : 1;
    ed.revealPositionInCenter({ lineNumber: line, column: col });
    ed.setPosition({ lineNumber: line, column: col });
    ed.focus();
  }, []);

  const rememberRecent = useCallback((path: string) => {
    setRecentPaths((prev) => [path, ...prev.filter((p) => p !== path)].slice(0, 30));
  }, []);

  const ensureDirExpanded = useCallback(
    async (dirPath: string) => {
      if (!dirPath) return;
      const parts = dirPath.split("/");
      let cur = "";
      for (const part of parts) {
        cur = cur ? `${cur}/${part}` : part;
        const path = cur;
        const children = await orch.listFiles(client, path).catch(() => []);
        setTree((t) =>
          updateNode(t, path, {
            expanded: true,
            children: sortEntries(children.map((c) => ({ ...c }))),
          }),
        );
      }
    },
    [client],
  );

  const startCreate = useCallback(
    async (parentDir: string, dir: boolean) => {
      if (!canEditCode) {
        openUpgrade("plans");
        return;
      }
      setSideView("files");
      if (parentDir) await ensureDirExpanded(parentDir);
      setInlineEdit({ kind: "create", parentDir, dir });
    },
    [ensureDirExpanded, canEditCode, openUpgrade],
  );

  const startRename = useCallback(
    (node: TreeNode) => {
      if (!canEditCode) {
        openUpgrade("plans");
        return;
      }
      setSideView("files");
      setInlineEdit({ kind: "rename", path: node.path, name: node.name });
    },
    [canEditCode, openUpgrade],
  );

  const commitInlineEdit = useCallback(
    async (value: string) => {
      const edit = inlineEdit;
      setInlineEdit(null);
      if (!edit) return;
      const name = value.trim();
      if (!name || name.includes("/")) {
        if (name.includes("/")) toast("error", appT().workspace.codeView.nameHasSlash);
        return;
      }
      if (edit.kind === "create") {
        const path = `${edit.parentDir ? edit.parentDir + "/" : ""}${name}`;
        try {
          await orch.createFile(client, path, edit.dir);
          await loadRoot();
          void refreshFileIndex();
          if (!edit.dir) void openRef.current?.(path);
        } catch {
          toast("error", appT().workspace.codeView.createFailed);
        }
        return;
      }
      if (name === baseName(edit.path)) return;
      const parent = edit.path.includes("/") ? edit.path.slice(0, edit.path.lastIndexOf("/")) : "";
      const to = `${parent ? parent + "/" : ""}${name}`;
      try {
        await orch.renameFile(client, edit.path, to);
        if (tabsRef.current.some((t) => t.path === edit.path)) closeTabRef.current?.(edit.path);
        await loadRoot();
        void refreshFileIndex();
      } catch {
        toast("error", appT().workspace.codeView.renameFailed);
      }
    },
    [inlineEdit, client, loadRoot, refreshFileIndex, toast],
  );

  const openRef = useRef<((path: string, line?: number, column?: number) => Promise<void>) | null>(null);
  const closeTabRef = useRef<((path: string) => void) | null>(null);

  const toggleDir = useCallback(
    async (node: TreeNode) => {
      // Collapse is always local — keep children cached for instant re-expand.
      if (node.expanded) {
        setTree((t) => updateNode(t, node.path, { expanded: false }));
        return;
      }
      // Already fetched once — just flip expanded (no network).
      if (node.children) {
        setTree((t) => updateNode(t, node.path, { expanded: true }));
        return;
      }
      // First open: expand immediately, then fill children.
      setTree((t) => updateNode(t, node.path, { expanded: true, children: [] }));
      const children = await orch.listFiles(client, node.path).catch(() => []);
      setTree((t) =>
        updateNode(t, node.path, {
          expanded: true,
          children: sortEntries(children.map((c) => ({ ...c }))),
        }),
      );
    },
    [client],
  );

  const open = useCallback(
    async (path: string, line?: number, column?: number) => {
      const normalized = normalizePath(path);
      if (!normalized) return;
      if (line != null && line > 0) {
        pendingLineRef.current = line;
        pendingColumnRef.current = column != null && column > 0 ? column : 1;
      }

      const candidates = importPathCandidates(normalized);
      const existing =
        tabsRef.current.find((t) => t.path === normalized)?.path ??
        tabsRef.current.find((t) => candidates.includes(t.path))?.path;
      if (existing) {
        rememberRecent(existing);
        setActivePath(existing);
        if (isMarkdownPath(existing)) {
          setMdPreviewByPath((m) => ({ ...m, [existing]: m[existing] ?? true }));
        }
        if (line != null && line > 0) requestAnimationFrame(() => revealLine(line, column));
        return;
      }
      rememberRecent(normalized);

      const inflight = openingRef.current.get(normalized);
      if (inflight) {
        await inflight;
        const opened =
          tabsRef.current.find((t) => t.path === normalized)?.path ??
          tabsRef.current.find((t) => candidates.includes(t.path))?.path ??
          normalized;
        setActivePath(opened);
        if (line != null && line > 0) requestAnimationFrame(() => revealLine(line, column));
        return;
      }
      const promise = (async () => {
        let file: { content: string; media?: Tab["media"] } | null = null;
        let openedPath = normalized;
        for (const candidate of candidates) {
          file = await readTabFile(client, candidate);
          if (file) {
            openedPath = candidate;
            break;
          }
        }
        if (!file) {
          toast("error", fill(appT().workspace.codeView.openFailed, { path: normalized }));
          return;
        }
        const opened: Tab = {
          path: openedPath,
          content: file.content,
          savedContent: file.content,
          dirty: false,
          media: file.media,
        };
        setTabs((t) => {
          if (t.some((x) => x.path === openedPath)) return t;
          return [...t, opened];
        });
        setActivePath(openedPath);
        if (isMarkdownPath(openedPath)) {
          setMdPreviewByPath((m) => ({ ...m, [openedPath]: true }));
        }
      })();
      openingRef.current.set(normalized, promise);
      try {
        await promise;
      } finally {
        openingRef.current.delete(normalized);
      }
      if (line != null && line > 0) requestAnimationFrame(() => revealLine(line, column));
    },
    [client, toast, revealLine, rememberRecent],
  );
  openRef.current = open;

  useEffect(() => {
    if (!openPath || !ready) return;
    let cancelled = false;
    void open(openPath, openLine ?? undefined).finally(() => {
      if (!cancelled) onOpenPathConsumed?.();
    });
    return () => {
      cancelled = true;
    };
  }, [openPath, openLine, ready, open, onOpenPathConsumed]);

  useEffect(() => {
    if (filesSyncToken == null) return;
    if (lastSyncToken.current === undefined) {
      lastSyncToken.current = filesSyncToken;
      return;
    }
    if (lastSyncToken.current === filesSyncToken) return;
    lastSyncToken.current = filesSyncToken;

    void loadRoot();
    void refreshFileIndex();

    const targets = (changedPaths ?? []).map(normalizePath).filter(Boolean);
    const shouldReload = (path: string) => targets.length === 0 || targets.includes(path);

    void (async () => {
      const current = tabsRef.current;
      let dirtyHits = 0;
      const next: Tab[] = [];
      for (const tab of current) {
        if (!shouldReload(tab.path)) {
          next.push(tab);
          continue;
        }
        if (tab.dirty) {
          dirtyHits++;
          next.push(tab);
          continue;
        }
        const file = await readTabFile(client, tab.path);
        if (!file) {
          next.push(tab);
          continue;
        }
        next.push({ ...tab, content: file.content, savedContent: file.content, dirty: false, media: file.media });
      }
      setTabs(next);
      if (dirtyHits > 0) {
        toast(
          "info",
          pl(appT().workspace.codeView.changedOnDisk, dirtyHits),
        );
      }
    })();
  }, [filesSyncToken, changedPaths, client, loadRoot, refreshFileIndex, toast]);

  const closeTab = (path: string) => {
    const serverId = serverForPath(path);
    if (serverId) {
      void lspRef.current?.ensureServer(serverId).then((s) => s.closeDocument(path)).catch(() => {});
    }
    setClosedStack((s) => [path, ...s.filter((p) => p !== path)].slice(0, 20));
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.path === path);
      const next = prev.filter((t) => t.path !== path);
      if (path === activePathRef.current) {
        const neighbor = next[idx] ?? next[idx - 1] ?? null;
        setActivePath(neighbor?.path ?? null);
      }
      return next;
    });
  };
  closeTabRef.current = closeTab;

  const closeTabsWhere = useCallback((keep: (tab: Tab, index: number) => boolean) => {
    setTabs((prev) => {
      const closing = prev.filter((t, i) => !keep(t, i));
      if (closing.length === 0) return prev;
      setClosedStack((s) => [...closing.map((t) => t.path), ...s].filter((p, i, a) => a.indexOf(p) === i).slice(0, 20));
      const next = prev.filter((t, i) => keep(t, i));
      if (!next.some((t) => t.path === activePathRef.current)) {
        setActivePath(next[next.length - 1]?.path ?? null);
      }
      return next;
    });
  }, []);

  const closeOtherTabs = useCallback(
    (path: string) => closeTabsWhere((t) => t.path === path),
    [closeTabsWhere],
  );
  const closeTabsToRight = useCallback(
    (path: string) => {
      const idx = tabsRef.current.findIndex((t) => t.path === path);
      if (idx < 0) return;
      closeTabsWhere((_t, i) => i <= idx);
    },
    [closeTabsWhere],
  );
  const closeSavedTabs = useCallback(() => closeTabsWhere((t) => t.dirty), [closeTabsWhere]);
  const closeAllTabs = useCallback(() => closeTabsWhere(() => false), [closeTabsWhere]);

  const copyTabPath = useCallback(async (path: string, relative: boolean) => {
    const text = relative ? path : `/home/user/app/${path}`;
    try {
      await navigator.clipboard.writeText(text);
      toast("success", relative ? appT().workspace.codeView.relativePathCopied : appT().workspace.codeView.pathCopied);
    } catch {
      toast("error", appT().workspace.codeView.copyPathFailed);
    }
  }, [toast]);

  const updateActive = (value: string) => {
    if (!canEditCode) {
      openUpgrade("plans");
      return;
    }
    setTabs((t) =>
      t.map((x) => (x.path === activePath ? { ...x, content: value, dirty: value !== x.savedContent } : x)),
    );
    const path = activePathRef.current;
    if (!path) return;
    const serverId = serverForPath(path);
    if (!serverId) return;
    if (lspChangeTimer.current) clearTimeout(lspChangeTimer.current);
    lspChangeTimer.current = setTimeout(() => {
      void lspRef.current?.ensureServer(serverId).then((s) => s.changeDocument(path, value)).catch(() => {});
    }, 200);
  };

  const save = useCallback(async () => {
    if (!canEditCode) {
      openUpgrade("plans");
      return;
    }
    const cur = tabsRef.current.find((t) => t.path === activePathRef.current);
    if (!cur || !cur.dirty || cur.media) return;
    setSaveState("saving");
    await orch.writeFile(client, cur.path, cur.content).catch(() => {});
    setTabs((t) => t.map((x) => (x.path === cur.path ? { ...x, savedContent: x.content, dirty: false } : x)));
    const serverId = serverForPath(cur.path);
    if (serverId) {
      void lspRef.current?.ensureServer(serverId).then((s) => s.saveDocument(cur.path)).catch(() => {});
    }
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 1500);
  }, [client, canEditCode, openUpgrade]);

  useEffect(() => {
    if (!settings.autoSave || !active?.dirty) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      void save();
    }, 900);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [settings.autoSave, active?.dirty, active?.content, active?.path, save]);

  const reopenClosed = useCallback(() => {
    const path = closedStack[0];
    if (!path) return;
    setClosedStack((s) => s.slice(1));
    void open(path);
  }, [closedStack, open]);

  const showExplorer = useCallback(() => {
    setSideView("files");
  }, []);

  const revealTabInExplorer = useCallback(
    async (path: string) => {
      showExplorer();
      const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      if (parent) await ensureDirExpanded(parent);
      setActivePath(path);
    },
    [ensureDirExpanded, showExplorer],
  );

  const showSearch = useCallback(() => {
    setSideView("search");
    setSearchFocusToken((n) => n + 1);
    setMobileTreeOpen(true);
  }, []);

  const runSearch = useCallback(
    async (q: string, opts: SearchOptions) => {
      const res = await orch.searchFiles(client, q, {
        caseInsensitive: !opts.caseSensitive,
        wholeWord: opts.wholeWord,
        regex: opts.regex,
        include: opts.include || undefined,
        exclude: opts.exclude || undefined,
        max: 200,
      });
      return res.matches;
    },
    [client],
  );

  const commands: CommandItem[] = useMemo(
    () => [
      { id: "save", label: cv.commands.saveFile, shortcut: `${MOD_LABEL}+S`, run: () => void save() },
      {
        id: "quickOpen",
        label: cv.commands.goToFile,
        shortcut: `${MOD_LABEL}+P`,
        run: () => {
          void refreshFileIndex();
          setPalette("quickOpen");
        },
      },
      {
        id: "search",
        label: cv.commands.searchInFiles,
        shortcut: `${MOD_LABEL}+Shift+F`,
        run: () => showSearch(),
      },
      {
        id: "toggleTerminal",
        label: cv.commands.toggleTerminal,
        shortcut: `${MOD_LABEL}+\``,
        run: () => setShowTerminal((s) => !s),
      },
      {
        id: "newFile",
        label: cv.commands.newFile,
        run: () => void startCreate("", false),
      },
      {
        id: "newFolder",
        label: cv.commands.newFolder,
        run: () => void startCreate("", true),
      },
      {
        id: "reopen",
        label: cv.commands.reopenClosedTab,
        shortcut: `${MOD_LABEL}+Shift+T`,
        run: () => reopenClosed(),
      },
      {
        id: "closeOthers",
        label: cv.commands.closeOtherTabs,
        shortcut: `⌥${MOD_LABEL}+T`,
        run: () => {
          if (activePathRef.current) closeOtherTabs(activePathRef.current);
        },
      },
      {
        id: "closeSaved",
        label: cv.commands.closeSavedTabs,
        run: () => closeSavedTabs(),
      },
      {
        id: "closeAll",
        label: cv.commands.closeAllTabs,
        run: () => closeAllTabs(),
      },
      {
        id: "focusFiles",
        label: cv.explorer,
        run: () => {
          showExplorer();
          setMobileTreeOpen(true);
        },
      },
      { id: "settings", label: cv.commands.editorSettings, run: () => setPalette("settings") },
      { id: "cheatsheet", label: cv.keyboardShortcuts, shortcut: "?", run: () => setPalette("cheatsheet") },
      {
        id: "refreshTree",
        label: cv.commands.refreshFiles,
        run: () => {
          void loadRoot();
          void refreshFileIndex();
        },
      },
    ],
    [
      save,
      refreshFileIndex,
      reopenClosed,
      loadRoot,
      showSearch,
      showExplorer,
      startCreate,
      closeOtherTabs,
      closeSavedTabs,
      closeAllTabs,
      cv,
    ],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (inlineEdit) {
        if (e.key === "Escape") {
          e.preventDefault();
          setInlineEdit(null);
        }
        return;
      }
      if (palette) {
        if (e.key === "Escape") {
          e.preventDefault();
          setPalette(null);
        }
        return;
      }

      const root = rootRef.current;
      if (!root) return;
      const t = e.target as HTMLElement | null;
      const inCode = Boolean(t && root.contains(t));
      const typingElsewhere =
        Boolean(t) &&
        !inCode &&
        (t!.tagName === "INPUT" || t!.tagName === "TEXTAREA" || t!.isContentEditable);
      if (typingElsewhere) return;

      const mod = isMod(e);

      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
        return;
      }
      if (mod && e.key.toLowerCase() === "w" && activePathRef.current) {
        e.preventDefault();
        closeTab(activePathRef.current);
        return;
      }
      // Close Others — ⌥⌘T (mac) / Alt+Ctrl+T (win)
      if (mod && e.altKey && e.key.toLowerCase() === "t" && activePathRef.current) {
        e.preventDefault();
        closeOtherTabs(activePathRef.current);
        return;
      }
      if (mod && e.altKey && e.key.toLowerCase() === "c" && activePathRef.current) {
        e.preventDefault();
        void copyTabPath(activePathRef.current, e.shiftKey);
        return;
      }
      if (mod && e.key.toLowerCase() === "p" && !e.shiftKey) {
        e.preventDefault();
        void refreshFileIndex();
        setPalette("quickOpen");
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        showSearch();
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPalette("command");
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        reopenClosed();
        return;
      }
      if (mod && (e.key === "`" || e.code === "Backquote")) {
        e.preventDefault();
        setShowTerminal((s) => !s);
        return;
      }
      if (
        !mod &&
        e.key === "?" &&
        t &&
        t.tagName !== "INPUT" &&
        t.tagName !== "TEXTAREA" &&
        !t.isContentEditable &&
        !t.closest(".monaco-editor")
      ) {
        e.preventDefault();
        setPalette("cheatsheet");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette, inlineEdit, save, refreshFileIndex, reopenClosed, showSearch, closeOtherTabs, copyTabPath]);

  const deleteEntry = async (node: TreeNode) => {
    if (!canEditCode) {
      openUpgrade("plans");
      return;
    }
    setPendingDelete(null);
    try {
      await orch.deleteFile(client, node.path);
      if (tabsRef.current.some((t) => t.path === node.path)) closeTab(node.path);
      await loadRoot();
      void refreshFileIndex();
    } catch {
      toast("error", appT().workspace.codeView.deleteFailed);
    }
  };

  const requestDelete = (node: TreeNode) => setPendingDelete(node);

  const onEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    disableBuiltinTsValidation(monaco);

    if (!lspRef.current) {
      lspRef.current = createLspWorkspace({
        client,
        monaco,
        openPath: (path, line, column) => {
          void openRef.current?.(path, line, column);
        },
      });
    }
    setLspReady((n) => n + 1);

    const line = pendingLineRef.current;
    const col = pendingColumnRef.current;
    if (line != null) {
      pendingLineRef.current = null;
      pendingColumnRef.current = null;
      requestAnimationFrame(() => revealLine(line, col ?? undefined));
    }
  };

  // Keep the language server in sync with the active tab.
  useEffect(() => {
    if (!activePath || !lspRef.current || showMdPreview || !lspReady) return;
    const tab = tabsRef.current.find((t) => t.path === activePath);
    if (!tab) return;
    const serverId = serverForPath(tab.path);
    if (!serverId) return;
    let cancelled = false;
    const path = tab.path;
    const content = tab.content;
    const language = langFor(path);
    void lspRef.current
      .ensureServer(serverId)
      .then((session) => {
        if (cancelled) return;
        session.openDocument(path, language, content);
      })
      .catch(() => {
        // Sandbox may still be waking / first install of language servers
      });
    return () => {
      cancelled = true;
    };
  }, [activePath, ready, showMdPreview, client, lspReady]);

  useEffect(() => {
    return () => {
      if (lspChangeTimer.current) clearTimeout(lspChangeTimer.current);
      lspRef.current?.dispose();
      lspRef.current = null;
    };
  }, [client]);

  const onTreeContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    setMenu({ kind: "tree", x: e.clientX, y: e.clientY, node });
  }, []);

  const onTabContextMenu = useCallback((e: React.MouseEvent, path: string) => {
    e.preventDefault();
    e.stopPropagation();
    setActivePath(path);
    setMenu({ kind: "tab", x: e.clientX, y: e.clientY, path });
  }, []);

  const onCommitInline = useCallback(
    (v: string) => {
      void commitInlineEdit(v);
    },
    [commitInlineEdit],
  );

  const onCancelInline = useCallback(() => setInlineEdit(null), []);

  const treeProps = {
    nodes: tree,
    depth: 0,
    onFile: open,
    onDir: toggleDir,
    activePath,
    inlineEdit,
    onCommitInline,
    onCancelInline,
    onContextMenu: onTreeContextMenu,
  };

  const FileToolbar = (
    <div className="flex items-center">
      {canEditCode && (
        <>
          <button
            type="button"
            onClick={() => void startCreate("", false)}
            className="rounded p-0.5 text-muted hover:bg-hover hover:text-fg"
            title={cv.newFile}
          >
            <FilePlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void startCreate("", true)}
            className="rounded p-0.5 text-muted hover:bg-hover hover:text-fg"
            title={cv.newFolder}
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
        </>
      )}
      <button
        type="button"
        onClick={() => {
          void loadRoot();
          void refreshFileIndex();
        }}
        className="rounded p-0.5 text-muted hover:bg-hover hover:text-fg"
        title={cv.refresh}
      >
        <RotateCw className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  const sidebarInner = (
    <>
      {/* Cursor-style top activity icons — Files + Search */}
      <div className="flex h-8 items-center justify-center gap-0.5 border-b border-line">
        <button
          type="button"
          title={cv.explorer}
          onClick={() => showExplorer()}
          className={`rounded-md p-1 transition ${
            sideView === "files" ? "bg-hover text-fg" : "text-muted hover:bg-hover/60 hover:text-fg-2"
          }`}
        >
          <Files className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title={fill(cv.searchWithKeys, { keys: `${MOD_LABEL}+Shift+F` })}
          onClick={() => showSearch()}
          className={`rounded-md p-1 transition ${
            sideView === "search" ? "bg-hover text-fg" : "text-muted hover:bg-hover/60 hover:text-fg-2"
          }`}
        >
          <Search className="h-3.5 w-3.5" />
        </button>
      </div>
      {sideView === "files" ? (
        <>
          <div className="flex h-7 items-center justify-between px-2">
            <span className="text-[11px] font-semibold tracking-wide text-fg-2 uppercase">{cv.explorer}</span>
            {FileToolbar}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pb-2">
            {inlineEdit?.kind === "create" && inlineEdit.parentDir === "" && (
              <InlineNameRow
                dir={inlineEdit.dir}
                depth={0}
                onCommit={(v) => void commitInlineEdit(v)}
                onCancel={() => setInlineEdit(null)}
              />
            )}
            <Tree {...treeProps} />
          </div>
        </>
      ) : (
        <SearchSidebar
          onSearch={runSearch}
          onOpenFile={(path, line) => void open(path, line)}
          focusToken={searchFocusToken}
        />
      )}
    </>
  );

  return (
    <div ref={rootRef} dir="ltr" className="relative flex h-full min-h-0 flex-col" tabIndex={-1}>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 flex-col border-e border-line md:flex">{sidebarInner}</aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center border-b border-line bg-panel">
            <button
              onClick={() => setMobileTreeOpen(true)}
              className="shrink-0 px-2.5 text-muted hover:text-fg md:hidden"
              title={cv.sidebar}
              aria-label={cv.sidebar}
            >
              <FolderIcon className="h-3.5 w-3.5" />
            </button>
            <div className="flex min-w-0 flex-1 overflow-x-auto">
              {tabs.length === 0 ? (
                <span className="px-3 py-2 text-xs text-disabled">{cv.noFilesOpen}</span>
              ) : (
                tabs.map((t) => {
                  const isActive = t.path === activePath;
                  return (
                    <div
                      key={t.path}
                      onClick={() => setActivePath(t.path)}
                      onContextMenu={(e) => onTabContextMenu(e, t.path)}
                      onMouseDown={(e) => {
                        if (e.button === 1) {
                          e.preventDefault();
                          closeTab(t.path);
                        }
                      }}
                      className={`group flex shrink-0 cursor-pointer items-center gap-1.5 border-e border-line px-3 py-1.5 text-xs transition ${
                        isActive ? "bg-panel text-fg" : "text-muted hover:text-fg-2"
                      }`}
                      title={t.path}
                    >
                      <FileTypeIcon name={t.path} />
                      <span className="max-w-32 truncate">{tabLabel(t.path)}</span>
                      {/* VS Code-style: X always on active; dirty dot → X on hover */}
                      <span className="relative grid h-3.5 w-3.5 shrink-0 place-items-center">
                        {t.dirty && (
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 transition group-hover:opacity-0" />
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            closeTab(t.path);
                          }}
                          title={i18n.common.close}
                          aria-label={fill(cv.closeNamed, { name: tabLabel(t.path) })}
                          className={`absolute inset-0 grid place-items-center rounded text-disabled transition hover:bg-hover hover:text-fg ${
                            isActive && !t.dirty
                              ? "opacity-100"
                              : "md:opacity-0 md:group-hover:opacity-100"
                          }`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5 px-2">
              {activeIsMd && active && (
                <SlidingPillSwitch
                  size="sm"
                  aria-label={cv.markdownView}
                  value={showMdPreview ? "preview" : "code"}
                  onChange={(v) =>
                    setMdPreviewByPath((m) => ({ ...m, [active.path]: v === "preview" }))
                  }
                  options={[
                    {
                      value: "preview",
                      label: (
                        <>
                          <Eye className="size-3" />
                          {cv.preview}
                        </>
                      ),
                    },
                    {
                      value: "code",
                      label: (
                        <>
                          <FileCode2 className="size-3" />
                          {cv.code}
                        </>
                      ),
                    },
                  ]}
                />
              )}
              <button
                type="button"
                onClick={() => {
                  void refreshFileIndex();
                  setPalette("quickOpen");
                }}
                className="rounded p-1 text-muted hover:bg-hover hover:text-fg"
                title={fill(cv.goToFileWithKeys, { keys: `${MOD_LABEL}+P` })}
              >
                <Search className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPalette("settings")}
                className="rounded p-1 text-muted hover:bg-hover hover:text-fg"
                title={cv.editorSettings}
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPalette("cheatsheet")}
                className="rounded p-1 text-muted hover:bg-hover hover:text-fg"
                title={cv.keyboardShortcuts}
              >
                <CircleHelp className="h-3.5 w-3.5" />
              </button>
              <span className="text-xs text-disabled">
                {saveState === "saving"
                  ? cv.savingState
                  : saveState === "saved"
                    ? cv.savedState
                    : active?.dirty
                      ? fill(cv.saveHint, { keys: `${MOD_LABEL}+S` })
                      : ""}
              </span>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            {!canEditCode && (
              <div className="flex items-center justify-between gap-2 border-b border-line bg-bg-muted/30 px-3 py-1.5 text-xs text-fg-muted">
                <span>{cv.readOnlyFree}</span>
                <button
                  type="button"
                  data-testid="code-readonly-upgrade"
                  className="shrink-0 font-medium text-accent hover:underline"
                  onClick={() => openUpgrade("plans")}
                >
                  {proTrialCta()}
                </button>
              </div>
            )}
            {active ? (
              active.media ? (
                <FileViewer path={active.path} kind={active.media.kind} dataUrl={active.media.dataUrl} />
              ) : showMdPreview ? (
                <div className="h-full overflow-y-auto px-5 py-4">
                  <div className="markdown mx-auto max-w-3xl">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeHighlight]}
                      components={markdownCodeComponents}
                    >
                      {active.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ) : !monacoReady ? (
                <div className="grid h-full place-items-center px-6 text-center text-[13px] text-muted">
                  {monacoFailed ? i18n.common.somethingWentWrong : i18n.common.loading}
                </div>
              ) : (
                <Editor
                  theme={theme === "light" ? "light" : "vs-dark"}
                  path={active.path}
                  language={langFor(active.path)}
                  value={active.content}
                  onChange={(v) => updateActive(v ?? "")}
                  onMount={onEditorMount}
                  options={{
                    readOnly: !canEditCode,
                    fontSize: settings.fontSize,
                    minimap: { enabled: settings.minimap },
                    wordWrap: settings.wordWrap ? "on" : "off",
                    tabSize: settings.tabSize,
                    scrollBeyondLastLine: false,
                    padding: { top: 8 },
                    automaticLayout: true,
                    formatOnPaste: canEditCode,
                    // Cmd/Ctrl+click go-to-definition (backed by remote LSP + relative-import fallback)
                    links: true,
                    // Keep Cmd/Ctrl for go-to-definition; Option/Alt adds cursors
                    multiCursorModifier: "alt",
                    gotoLocation: {
                      multiple: "goto",
                      multipleDefinitions: "goto",
                    },
                  }}
                />
              )
            ) : (
              <div className="grid h-full place-items-center gap-2 text-sm text-disabled">
                <span>{cv.openFromExplorer}</span>
                <span className="text-xs">
                  {fill(cv.emptyShortcuts, { mod: MOD_LABEL })}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-line">
        <button
          onClick={() => setShowTerminal((s) => !s)}
          className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-muted hover:text-fg"
        >
          {showTerminal ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} {cv.terminal}
        </button>
        {showTerminal && ready && (
          <div className="h-52">
            <TerminalPane client={client} />
          </div>
        )}
      </div>

      {mobileTreeOpen && (
        <div className="absolute inset-0 z-40 md:hidden" onClick={() => setMobileTreeOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <aside
            className="absolute inset-y-0 start-0 flex w-[min(20rem,85%)] flex-col border-e border-line bg-bg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex h-8 items-center justify-center border-b border-line">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  title={cv.explorer}
                  onClick={() => showExplorer()}
                  className={`rounded-md p-1 transition ${
                    sideView === "files" ? "bg-hover text-fg" : "text-muted hover:bg-hover/60 hover:text-fg-2"
                  }`}
                >
                  <Files className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title={i18n.common.search}
                  onClick={() => showSearch()}
                  className={`rounded-md p-1 transition ${
                    sideView === "search" ? "bg-hover text-fg" : "text-muted hover:bg-hover/60 hover:text-fg-2"
                  }`}
                >
                  <Search className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setMobileTreeOpen(false)}
                className="absolute end-1 rounded p-1 text-muted hover:bg-hover hover:text-fg"
                title={i18n.common.close}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {sideView === "files" ? (
              <>
                <div className="flex h-7 items-center justify-between px-2">
                  <span className="text-[11px] font-semibold tracking-wide text-fg-2 uppercase">{cv.explorer}</span>
                  {FileToolbar}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto pb-2">
                  {inlineEdit?.kind === "create" && inlineEdit.parentDir === "" && (
                    <InlineNameRow
                      dir={inlineEdit.dir}
                      depth={0}
                      onCommit={(v) => void commitInlineEdit(v)}
                      onCancel={() => setInlineEdit(null)}
                    />
                  )}
                  <Tree
                    {...treeProps}
                    onFile={(path) => {
                      void open(path);
                      setMobileTreeOpen(false);
                    }}
                  />
                </div>
              </>
            ) : (
              <SearchSidebar
                onSearch={runSearch}
                onOpenFile={(path, line) => {
                  void open(path, line);
                  setMobileTreeOpen(false);
                }}
                focusToken={searchFocusToken}
              />
            )}
          </aside>
        </div>
      )}

      {/* A right-click menu: it grows from the point clicked, as a popover hung
          from a zero-size box there. Mounted throughout — Base UI plays the
          entrance only on a change from closed to open. */}
      <AnchoredPopover
        open={!!menu}
        onClose={() => setMenu(null)}
        anchorRef={() => ({
          getBoundingClientRect: () =>
            DOMRect.fromRect({ x: shownMenu?.x ?? 0, y: shownMenu?.y ?? 0, width: 0, height: 0 }),
        })}
        side="bottom"
        align="start"
        sideOffset={2}
        testId="code-context-menu"
        className={`rounded-lg border border-line bg-panel p-1 text-sm shadow-2xl shadow-black/50 ${
          shownMenu?.kind === "tab" ? "w-56" : "w-40"
        }`}
      >
        {shownMenu && (
          <>
            {shownMenu.kind === "tab" && (
              <>
                <MenuItem
                  label={i18n.common.close}
                  shortcut={`${MOD_LABEL}+W`}
                  onClick={() => {
                    const p = shownMenu.path;
                    setMenu(null);
                    closeTab(p);
                  }}
                />
                <MenuItem
                  label={cv.menu.closeOthers}
                  shortcut={`⌥${MOD_LABEL}+T`}
                  onClick={() => {
                    const p = shownMenu.path;
                    setMenu(null);
                    closeOtherTabs(p);
                  }}
                />
                <MenuItem
                  label={cv.menu.closeToRight}
                  onClick={() => {
                    const p = shownMenu.path;
                    setMenu(null);
                    closeTabsToRight(p);
                  }}
                />
                <MenuItem
                  label={cv.menu.closeSaved}
                  onClick={() => {
                    setMenu(null);
                    closeSavedTabs();
                  }}
                />
                <MenuItem
                  label={cv.menu.closeAll}
                  onClick={() => {
                    setMenu(null);
                    closeAllTabs();
                  }}
                />
                <div className="my-1 border-t border-line" />
                <MenuItem
                  label={cv.menu.copyPath}
                  shortcut={`⌥${MOD_LABEL}+C`}
                  onClick={() => {
                    const p = shownMenu.path;
                    setMenu(null);
                    void copyTabPath(p, false);
                  }}
                />
                <MenuItem
                  label={cv.menu.copyRelativePath}
                  shortcut={`⇧⌥${MOD_LABEL}+C`}
                  onClick={() => {
                    const p = shownMenu.path;
                    setMenu(null);
                    void copyTabPath(p, true);
                  }}
                />
                <div className="my-1 border-t border-line" />
                <MenuItem
                  label={cv.menu.revealInExplorer}
                  onClick={() => {
                    const p = shownMenu.path;
                    setMenu(null);
                    void revealTabInExplorer(p);
                  }}
                />
              </>
            )}
            {shownMenu.kind === "tree" && shownMenu.node.type === "dir" && canEditCode && (
              <>
                <MenuItem
                  icon={<FilePlus className="h-3.5 w-3.5" />}
                  label={cv.newFile}
                  onClick={() => {
                    const n = shownMenu.node;
                    setMenu(null);
                    void startCreate(n.path, false);
                  }}
                />
                <MenuItem
                  icon={<FolderPlus className="h-3.5 w-3.5" />}
                  label={cv.newFolder}
                  onClick={() => {
                    const n = shownMenu.node;
                    setMenu(null);
                    void startCreate(n.path, true);
                  }}
                />
              </>
            )}
            {shownMenu.kind === "tree" && canEditCode && (
              <>
                <MenuItem
                  icon={<Pencil className="h-3.5 w-3.5" />}
                  label={i18n.common.rename}
                  onClick={() => {
                    const n = shownMenu.node;
                    setMenu(null);
                    startRename(n);
                  }}
                />
                <MenuItem
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  label={i18n.common.delete}
                  danger
                  onClick={() => {
                    const n = shownMenu.node;
                    setMenu(null);
                    requestDelete(n);
                  }}
                />
              </>
            )}
            {shownMenu.kind === "tree" && !canEditCode && (
              <MenuItem
                label={cv.menu.upgradeToEdit}
                onClick={() => {
                  setMenu(null);
                  openUpgrade("plans");
                }}
              />
            )}
          </>
        )}
      </AnchoredPopover>

      {palette && (
        <EditorPalette
          mode={palette}
          onClose={() => setPalette(null)}
          commands={commands}
          fileIndex={fileIndex}
          recentPaths={recentPaths}
          onOpenFile={(path, line) => void open(path, line)}
          settings={settings}
          onSettingsChange={persistSettings}
        />
      )}
      {pendingDelete && (
        <ConfirmDialog
          title={fill(cv.deleteTitle, { name: baseName(pendingDelete.path) })}
          subtitle={cv.deleteSubtitle}
          confirmLabel={i18n.common.delete}
          danger
          onClose={() => setPendingDelete(null)}
          onConfirm={() => void deleteEntry(pendingDelete)}
        />
      )}
    </div>
  );
}

function InlineNameRow({
  dir,
  depth,
  initial = "",
  onCommit,
  onCancel,
}: {
  dir: boolean;
  depth: number;
  initial?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-0.5"
      style={{ paddingInlineStart: `${12 + depth * 14}px` }}
    >
      <span className="grid size-3.5 shrink-0 place-items-center">
        {dir ? (
          <FolderTypeIcon name="folder" expanded className="size-3.5" />
        ) : (
          <FileTypeIcon name={value || "file.txt"} className="size-3.5" />
        )}
      </span>
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit(value);
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => {
          if (value.trim()) onCommit(value);
          else onCancel();
        }}
        placeholder={dir ? t.workspace.codeView.folderName : t.workspace.codeView.fileName}
        className="min-w-0 flex-1 rounded border border-accent bg-bg px-1.5 py-0.5 text-[12px] text-fg outline-none"
      />
    </div>
  );
}

function MenuItem({
  icon,
  label,
  shortcut,
  onClick,
  danger,
}: {
  icon?: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start transition hover:bg-hover ${
        danger ? "text-red-400 hover:bg-red-500/10" : "text-fg-2 hover:text-fg"
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut && (
        <kbd dir="ltr" className="shrink-0 font-mono text-[10px] text-disabled">{shortcut}</kbd>
      )}
    </button>
  );
}

function sortEntries<T extends { type: string; name: string }>(entries: T[]): T[] {
  return [...entries].sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1,
  );
}

function updateNode(nodes: TreeNode[], path: string, patch: Partial<TreeNode>): TreeNode[] {
  return nodes.map((n) => {
    if (n.path === path) return { ...n, ...patch };
    if (n.children && path.startsWith(n.path + "/")) return { ...n, children: updateNode(n.children, path, patch) };
    return n;
  });
}

const Tree = memo(function Tree({
  nodes,
  depth,
  onFile,
  onDir,
  activePath,
  inlineEdit,
  onCommitInline,
  onCancelInline,
  onContextMenu,
}: {
  nodes: TreeNode[];
  depth: number;
  onFile: (path: string) => void;
  onDir: (node: TreeNode) => void;
  activePath: string | null;
  inlineEdit: InlineEdit;
  onCommitInline: (value: string) => void;
  onCancelInline: () => void;
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void;
}) {
  // Children are sorted when loaded — avoid re-sorting on every expand/collapse paint.
  return (
    <div>
      {nodes.map((node) => {
        const renaming = inlineEdit?.kind === "rename" && inlineEdit.path === node.path;
        const creatingHere =
          inlineEdit?.kind === "create" && inlineEdit.parentDir === node.path && node.expanded;
        return (
          <div key={node.path}>
            {renaming ? (
              <InlineNameRow
                dir={node.type === "dir"}
                depth={depth}
                initial={inlineEdit.name}
                onCommit={onCommitInline}
                onCancel={onCancelInline}
              />
            ) : (
              <button
                onClick={() => (node.type === "dir" ? void onDir(node) : void onFile(node.path))}
                onContextMenu={(e) => onContextMenu(e, node)}
                className={`flex w-full items-center gap-1.5 px-3 py-1 text-start text-[13px] transition hover:bg-hover ${
                  activePath === node.path ? "bg-accent-subtle text-fg" : "text-muted"
                }`}
                style={{ paddingInlineStart: `${12 + depth * 14}px` }}
              >
                <span className="grid w-3.5 shrink-0 place-items-center text-disabled">
                  {node.type === "dir" ? (
                    node.expanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )
                  ) : null}
                </span>
                <span className="grid size-3.5 shrink-0 place-items-center leading-none">
                  {node.type === "dir" ? (
                    <FolderTypeIcon name={node.name} expanded={!!node.expanded} className="size-3.5" />
                  ) : (
                    <FileTypeIcon name={node.name} className="size-3.5" />
                  )}
                </span>
                <span className="truncate leading-snug">{node.name}</span>
              </button>
            )}
            {node.expanded && (
              <>
                {creatingHere && (
                  <InlineNameRow
                    dir={inlineEdit.dir}
                    depth={depth + 1}
                    onCommit={onCommitInline}
                    onCancel={onCancelInline}
                  />
                )}
                {node.children && node.children.length > 0 && (
                  <Tree
                    nodes={node.children}
                    depth={depth + 1}
                    onFile={onFile}
                    onDir={onDir}
                    activePath={activePath}
                    inlineEdit={inlineEdit}
                    onCommitInline={onCommitInline}
                    onCancelInline={onCancelInline}
                    onContextMenu={onContextMenu}
                  />
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
});
