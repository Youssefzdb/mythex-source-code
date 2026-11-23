/**
 * Thin Monaco ↔ remote LSP client.
 *
 * Language servers run in the E2B sandbox; we speak JSON-RPC over the
 * orchestrator WebSocket. Supports diagnostics, hover, definition, and
 * completion — enough for VS Code–like Cmd+click without monaco-languageclient.
 */
import type { editor, IDisposable, languages } from "monaco-editor";
import { orch, type OrchClient } from "../../lib/orchestrator";

export const APP_ROOT = "/home/user/app";
export const ROOT_URI = `file://${APP_ROOT}`;

export type LspServerId =
  | "typescript"
  | "python"
  | "json"
  | "html"
  | "css"
  | "yaml"
  | "dockerfile"
  | "shell"
  | "vue"
  | "svelte"
  | "php"
  | "graphql"
  | "go"
  | "rust";

/** Monaco language ids each server handles. */
const SERVER_LANGUAGES: Record<LspServerId, string[]> = {
  typescript: ["typescript", "javascript"],
  python: ["python"],
  json: ["json", "jsonc"],
  html: ["html"],
  css: ["css", "scss", "less"],
  yaml: ["yaml"],
  dockerfile: ["dockerfile"],
  shell: ["shell", "shellscript"],
  vue: ["vue"],
  svelte: ["svelte"],
  php: ["php"],
  graphql: ["graphql"],
  go: ["go"],
  rust: ["rust"],
};

const EXT_TO_SERVER: Record<string, LspServerId> = {
  ts: "typescript",
  tsx: "typescript",
  js: "typescript",
  jsx: "typescript",
  mjs: "typescript",
  cjs: "typescript",
  py: "python",
  pyi: "python",
  json: "json",
  jsonc: "json",
  html: "html",
  htm: "html",
  css: "css",
  scss: "css",
  less: "css",
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
};

export function pathToUri(path: string): string {
  const rel = path.replace(/^\.\//, "").replace(/^\/+/, "");
  return `${ROOT_URI}/${rel}`;
}

export function uriToPath(uri: string): string | null {
  const prefixes = [`${ROOT_URI}/`, "file:///home/user/app/", "file://home/user/app/"];
  for (const p of prefixes) {
    if (uri.startsWith(p)) return uri.slice(p.length);
  }
  if (uri.startsWith("file:///")) {
    const rest = uri.slice("file:///".length);
    if (rest.startsWith("home/user/app/")) return rest.slice("home/user/app/".length);
  }
  return null;
}

export function serverForLanguage(languageId: string): LspServerId | null {
  if (languageId === "typescriptreact" || languageId === "javascriptreact") return "typescript";
  if (languageId === "shellscript") return "shell";
  for (const [id, langs] of Object.entries(SERVER_LANGUAGES) as [LspServerId, string[]][]) {
    if (langs.includes(languageId)) return id;
  }
  return null;
}

export function serverForPath(path: string): LspServerId | null {
  const base = path.split("/").pop()?.toLowerCase() ?? "";
  if (base === "dockerfile" || base.startsWith("dockerfile.")) return "dockerfile";
  const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
  return EXT_TO_SERVER[ext] ?? null;
}

function lspLanguageId(monacoLang: string): string {
  if (monacoLang === "shellscript") return "shellscript";
  return monacoLang;
}

type JsonRpcId = number | string;
type JsonRpcMessage = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

type Monaco = typeof import("monaco-editor");

type OpenDoc = {
  uri: string;
  languageId: string;
  version: number;
  path: string;
};

export type LspSession = {
  openDocument: (path: string, languageId: string, text: string) => void;
  changeDocument: (path: string, text: string) => void;
  saveDocument: (path: string) => void;
  closeDocument: (path: string) => void;
  dispose: () => void;
};

/**
 * Disable Monaco's built-in TS/JS semantic features so remote LSP (+ our
 * relative-import fallback) owns diagnostics / go-to-definition.
 */
export function disableBuiltinTsValidation(monaco: Monaco) {
  const opts = {
    noSemanticValidation: true,
    noSyntaxValidation: true,
    noSuggestionDiagnostics: true,
  };
  monaco.typescript.typescriptDefaults.setDiagnosticsOptions(opts);
  monaco.typescript.javascriptDefaults.setDiagnosticsOptions(opts);
  // Prevent built-in worker go-to-def competing with ours (word-only underline + "2 definitions").
  const mode = {
    definitions: false,
    references: false,
    documentHighlights: false,
  };
  monaco.typescript.typescriptDefaults.setModeConfiguration(mode);
  monaco.typescript.javascriptDefaults.setModeConfiguration(mode);
}

export function createLspWorkspace(opts: {
  client: OrchClient;
  monaco: Monaco;
  /** Open (or focus) a project-relative path at an optional 1-based line. */
  openPath: (path: string, line?: number, column?: number) => void;
}): { ensureServer: (serverId: LspServerId) => Promise<LspSession>; dispose: () => void } {
  const sessions = new Map<LspServerId, LspSession>();
  const starting = new Map<LspServerId, Promise<LspSession>>();
  let disposed = false;

  const opener = opts.monaco.editor.registerEditorOpener({
    openCodeEditor(_source, resource, selection) {
      let path = uriToPath(resource.toString());
      if (!path) {
        const p = resource.path.replace(/^\//, "");
        path = p.startsWith("home/user/app/") ? p.slice("home/user/app/".length) : p;
      }
      // @monaco-editor/react models use file:///src/... (no /home/user/app)
      if (!path && resource.scheme === "file") {
        path = resource.path.replace(/^\//, "");
      }
      if (!path) return false;
      let line: number | undefined;
      let column: number | undefined;
      if (selection) {
        if ("startLineNumber" in selection) {
          line = selection.startLineNumber;
          column = selection.startColumn;
        } else if ("lineNumber" in selection) {
          line = selection.lineNumber;
          column = selection.column;
        }
      }
      opts.openPath(path, line, column);
      return true;
    },
  });

  // Instant Cmd+click for relative imports — works before remote LS is ready.
  // Important: do NOT openPath here. Monaco calls provideDefinition on Cmd+hover
  // (to show the underline); opening on that would navigate without a click.
  const relativeImportDef = opts.monaco.languages.registerDefinitionProvider(
    [
      { language: "typescript", scheme: "*" },
      { language: "javascript", scheme: "*" },
      { language: "typescriptreact", scheme: "*" },
      { language: "javascriptreact", scheme: "*" },
    ],
    {
      provideDefinition(model, position) {
        const hit = relativeImportAt(model, position);
        if (!hit) return null;
        // originSelectionRange controls the Cmd+hover underline span (defaults to
        // the word at the cursor, e.g. only "components" inside a path).
        return [
          {
            uri: opts.monaco.Uri.parse(pathToUri(hit.resolved)),
            range: {
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: 1,
              endColumn: 1,
            },
            originSelectionRange: {
              startLineNumber: position.lineNumber,
              startColumn: hit.range.startCol,
              endLineNumber: position.lineNumber,
              endColumn: hit.range.endCol + 1, // Monaco ranges are end-exclusive
            },
          },
        ];
      },
    },
  );
  const ensureServer = (serverId: LspServerId): Promise<LspSession> => {
    if (disposed) return Promise.reject(new Error("lsp disposed"));
    const existing = sessions.get(serverId);
    if (existing) return Promise.resolve(existing);
    const inflight = starting.get(serverId);
    if (inflight) return inflight;

    const promise = startSession(serverId)
      .then((session) => {
        sessions.set(serverId, session);
        starting.delete(serverId);
        return session;
      })
      .catch((err) => {
        starting.delete(serverId);
        throw err;
      });
    starting.set(serverId, promise);
    return promise;
  };

  async function startSession(serverId: LspServerId): Promise<LspSession> {
    const monaco = opts.monaco;
    const socket = new WebSocket(orch.lspUrl(opts.client, serverId), orch.lspProtocols(opts.client));
    socket.binaryType = "arraybuffer";

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("lsp websocket timeout")), 30_000);
      socket.onopen = () => {
        clearTimeout(t);
        resolve();
      };
      socket.onerror = () => {
        clearTimeout(t);
        reject(new Error("lsp websocket error"));
      };
    });

    let nextId = 1;
    const pending = new Map<JsonRpcId, Pending>();
    const docs = new Map<string, OpenDoc>(); // path → doc
    const disposables: IDisposable[] = [];

    const send = (msg: JsonRpcMessage) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(msg));
      }
    };

    const request = <T = unknown>(method: string, params?: unknown): Promise<T> => {
      const id = nextId++;
      return new Promise<T>((resolve, reject) => {
        pending.set(id, {
          resolve: (v) => resolve(v as T),
          reject,
        });
        send({ jsonrpc: "2.0", id, method, params });
      });
    };

    const notify = (method: string, params?: unknown) => {
      send({ jsonrpc: "2.0", method, params });
    };

    const applyDiagnostics = (uri: string, diagnostics: LspDiagnostic[]) => {
      const path = uriToPath(uri);
      if (!path) return;
      const model = monaco.editor.getModels().find((m) => {
        const p = m.uri.path.replace(/^\//, "");
        return p === path || m.uri.toString() === uri || pathToUri(path) === uri;
      });
      // Also match by @monaco-editor/react path models (file:///path)
      const model2 =
        model ??
        monaco.editor.getModels().find((m) => {
          const s = m.uri.toString();
          return s.endsWith("/" + path) || s.endsWith(path);
        });
      if (!model2) return;
      const markers: editor.IMarkerData[] = diagnostics.map((d) => ({
        severity: toMonacoSeverity(monaco, d.severity),
        message: d.message,
        startLineNumber: d.range.start.line + 1,
        startColumn: d.range.start.character + 1,
        endLineNumber: d.range.end.line + 1,
        endColumn: d.range.end.character + 1,
        source: d.source,
        code: typeof d.code === "string" || typeof d.code === "number" ? String(d.code) : undefined,
      }));
      monaco.editor.setModelMarkers(model2, `lsp:${serverId}`, markers);
    };

    socket.onmessage = (event) => {
      const text = typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);
      let msg: JsonRpcMessage;
      try {
        msg = JSON.parse(text) as JsonRpcMessage;
      } catch {
        return;
      }

      if (msg.id != null && (msg.result !== undefined || msg.error)) {
        const p = pending.get(msg.id);
        if (p) {
          pending.delete(msg.id);
          if (msg.error) p.reject(new Error(msg.error.message));
          else p.resolve(msg.result);
        }
        return;
      }

      if (msg.method === "textDocument/publishDiagnostics" && msg.params) {
        const params = msg.params as { uri: string; diagnostics: LspDiagnostic[] };
        applyDiagnostics(params.uri, params.diagnostics ?? []);
        return;
      }

      // Respond to server→client requests we don't implement
      if (msg.id != null && msg.method) {
        send({ jsonrpc: "2.0", id: msg.id, result: null });
      }
    };

    socket.onclose = () => {
      for (const [, p] of pending) p.reject(new Error("lsp closed"));
      pending.clear();
    };

    const docSelector = (SERVER_LANGUAGES[serverId] ?? [serverId]).flatMap((language) => [
      { language, scheme: "file" as const },
      { language, scheme: "inmemory" as const },
    ]);

    await request("initialize", {
      processId: null,
      clientInfo: { name: "mythex", version: "0.1.0" },
      rootUri: ROOT_URI,
      rootPath: APP_ROOT,
      workspaceFolders: [{ uri: ROOT_URI, name: "app" }],
      capabilities: {
        textDocument: {
          synchronization: { dynamicRegistration: false, willSave: false, didSave: true, willSaveWaitUntil: false },
          completion: {
            dynamicRegistration: false,
            completionItem: { snippetSupport: false },
          },
          hover: { dynamicRegistration: false, contentFormat: ["markdown", "plaintext"] },
          definition: { dynamicRegistration: false, linkSupport: true },
          publishDiagnostics: { relatedInformation: false },
        },
        workspace: {
          workspaceFolders: true,
        },
      },
    });
    notify("initialized", {});

    // Editor opener is registered once on the workspace (see createLspWorkspace).

    disposables.push(
      monaco.languages.registerDefinitionProvider(docSelector, {
        provideDefinition: async (model, position) => {
          // Relative imports are handled by the workspace-level provider (full-string underline).
          if (relativeImportAt(model, position)) return null;
          const path = modelPath(model);
          if (!path || !docs.has(path)) return null;
          try {
            const result = await request<LspLocation | LspLocation[] | LspLocationLink[] | null>(
              "textDocument/definition",
              {
                textDocument: { uri: pathToUri(path) },
                position: { line: position.lineNumber - 1, character: position.column - 1 },
              },
            );
            return locationsToMonaco(monaco, result);
          } catch {
            return null;
          }
        },
      }),
    );

    disposables.push(
      monaco.languages.registerHoverProvider(docSelector, {
        provideHover: async (model, position) => {
          const path = modelPath(model);
          if (!path || !docs.has(path)) return null;
          try {
            const result = await request<LspHover | null>("textDocument/hover", {
              textDocument: { uri: pathToUri(path) },
              position: { line: position.lineNumber - 1, character: position.column - 1 },
            });
            if (!result?.contents) return null;
            return {
              contents: hoverToMarkdown(monaco, result.contents),
              range: result.range
                ? {
                    startLineNumber: result.range.start.line + 1,
                    startColumn: result.range.start.character + 1,
                    endLineNumber: result.range.end.line + 1,
                    endColumn: result.range.end.character + 1,
                  }
                : undefined,
            };
          } catch {
            return null;
          }
        },
      }),
    );

    disposables.push(
      monaco.languages.registerCompletionItemProvider(docSelector, {
        triggerCharacters: [".", "'", "\"", "/", "@"],
        provideCompletionItems: async (model, position, _ctx, token) => {
          const path = modelPath(model);
          if (!path || !docs.has(path) || token.isCancellationRequested) {
            return { suggestions: [] };
          }
          try {
            const result = await request<LspCompletionList | LspCompletionItem[] | null>(
              "textDocument/completion",
              {
                textDocument: { uri: pathToUri(path) },
                position: { line: position.lineNumber - 1, character: position.column - 1 },
              },
            );
            const items = Array.isArray(result) ? result : result?.items ?? [];
            const word = model.getWordUntilPosition(position);
            const range = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endColumn: word.endColumn,
            };
            return {
              suggestions: items.slice(0, 100).map((item) => completionToMonaco(monaco, item, range)),
            };
          } catch {
            return { suggestions: [] };
          }
        },
      }),
    );

    const session: LspSession = {
      openDocument(path, languageId, text) {
        const uri = pathToUri(path);
        const prev = docs.get(path);
        if (prev) {
          docs.set(path, { ...prev, version: prev.version + 1 });
          notify("textDocument/didChange", {
            textDocument: { uri, version: prev.version + 1 },
            contentChanges: [{ text }],
          });
          return;
        }
        const lang = lspLanguageId(languageId);
        docs.set(path, { uri, languageId: lang, version: 1, path });
        notify("textDocument/didOpen", {
          textDocument: { uri, languageId: lang, version: 1, text },
        });
      },
      changeDocument(path, text) {
        const doc = docs.get(path);
        if (!doc) return;
        const version = doc.version + 1;
        docs.set(path, { ...doc, version });
        notify("textDocument/didChange", {
          textDocument: { uri: doc.uri, version },
          contentChanges: [{ text }],
        });
      },
      saveDocument(path) {
        const doc = docs.get(path);
        if (!doc) return;
        notify("textDocument/didSave", {
          textDocument: { uri: doc.uri },
        });
      },
      closeDocument(path) {
        const doc = docs.get(path);
        if (!doc) return;
        docs.delete(path);
        notify("textDocument/didClose", { textDocument: { uri: doc.uri } });
        const model = monaco.editor.getModels().find((m) => modelPath(m) === path);
        if (model) monaco.editor.setModelMarkers(model, `lsp:${serverId}`, []);
      },
      dispose() {
        for (const d of disposables) d.dispose();
        disposables.length = 0;
        try {
          void request("shutdown", null).finally(() => {
            notify("exit");
            socket.close();
          });
        } catch {
          socket.close();
        }
        sessions.delete(serverId);
      },
    };

    return session;
  }

  return {
    ensureServer,
    dispose() {
      disposed = true;
      opener.dispose();
      relativeImportDef.dispose();
      for (const s of sessions.values()) s.dispose();
      sessions.clear();
    },
  };
}

/** Resolve `./x` / `../x` from a project-relative file path to another project path. */
function resolveRelativeImport(fromPath: string, spec: string): string | null {
  if (!spec.startsWith("./") && !spec.startsWith("../")) return null;
  const parts = fromPath.split("/");
  parts.pop(); // drop filename
  for (const seg of spec.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  // If no extension, leave bare — CodeView tries .tsx/.ts/index.*
  return parts.join("/");
}

/**
 * Find a relative import under the cursor — either the "./path" string or the
 * default import binding (`import Home from "./pages/Home"`).
 */
function relativeImportAt(
  model: editor.ITextModel,
  position: { lineNumber: number; column: number },
): { resolved: string; range: { startCol: number; endCol: number } } | null {
  const fromPath = modelPath(model);
  if (!fromPath) return null;
  const line = model.getLineContent(position.lineNumber);
  const col = position.column;

  // 1) Cursor on "./foo" / '../foo'
  const pathRe = /['"]((?:\.\.?\/)[^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = pathRe.exec(line))) {
    const startCol = match.index + 1;
    const endCol = match.index + match[0].length;
    if (col < startCol || col > endCol) continue;
    const resolved = resolveRelativeImport(fromPath, match[1]);
    if (!resolved) return null;
    return { resolved, range: { startCol, endCol } };
  }

  // 2) Cursor on default import name: import Home from "./pages/Home"
  const defRe =
    /\bimport\s+(?:type\s+)?([A-Za-z_$][\w$]*)\s+from\s+['"]((?:\.\.?\/)[^'"]+)['"]/g;
  while ((match = defRe.exec(line))) {
    const name = match[1];
    const spec = match[2];
    const nameStart = match.index + match[0].indexOf(name);
    const nameEnd = nameStart + name.length;
    // 1-based columns
    if (col < nameStart + 1 || col > nameEnd + 1) continue;
    const resolved = resolveRelativeImport(fromPath, spec);
    if (!resolved) return null;
    return { resolved, range: { startCol: nameStart + 1, endCol: nameEnd } };
  }

  return null;
}

function modelPath(model: editor.ITextModel): string | null {
  // @monaco-editor/react path → file:///src/App.tsx or similar
  const u = model.uri;
  if (u.scheme === "file") {
    let p = u.path;
    if (p.startsWith("/home/user/app/")) return p.slice("/home/user/app/".length);
    if (p.startsWith("/")) p = p.slice(1);
    return p || null;
  }
  // inmemory://model/N — fall back to nothing useful
  return null;
}

type LspPosition = { line: number; character: number };
type LspRange = { start: LspPosition; end: LspPosition };
type LspLocation = { uri: string; range: LspRange };
type LspLocationLink = {
  targetUri: string;
  targetRange: LspRange;
  targetSelectionRange?: LspRange;
};
type LspDiagnostic = {
  range: LspRange;
  message: string;
  severity?: number;
  source?: string;
  code?: string | number;
};
type LspHover = {
  contents: unknown;
  range?: LspRange;
};
type LspCompletionItem = {
  label: string | { label: string };
  kind?: number;
  detail?: string;
  insertText?: string;
  documentation?: string | { value: string };
};
type LspCompletionList = { items: LspCompletionItem[]; isIncomplete?: boolean };

function toMonacoSeverity(monaco: Monaco, severity?: number) {
  // LSP: 1 Error, 2 Warning, 3 Info, 4 Hint
  switch (severity) {
    case 1:
      return monaco.MarkerSeverity.Error;
    case 2:
      return monaco.MarkerSeverity.Warning;
    case 3:
      return monaco.MarkerSeverity.Info;
    default:
      return monaco.MarkerSeverity.Hint;
  }
}

function locationsToMonaco(
  monaco: Monaco,
  result: LspLocation | LspLocation[] | LspLocationLink[] | null,
): languages.Definition | null {
  if (!result) return null;
  const list = Array.isArray(result) ? result : [result];
  const defs: languages.Location[] = [];

  for (const item of list) {
    const uri = "targetUri" in item ? item.targetUri : item.uri;
    const range = "targetSelectionRange" in item && item.targetSelectionRange
      ? item.targetSelectionRange
      : "targetRange" in item
        ? item.targetRange
        : item.range;
    const path = uriToPath(uri);
    if (!path) continue;

    defs.push({
      uri: monaco.Uri.parse(pathToUri(path)),
      range: {
        startLineNumber: range.start.line + 1,
        startColumn: range.start.character + 1,
        endLineNumber: range.end.line + 1,
        endColumn: range.end.character + 1,
      },
    });
  }
  return defs.length ? defs : null;
}

function hoverToMarkdown(_monaco: Monaco, contents: unknown): { value: string }[] {
  const out: { value: string }[] = [];
  const push = (value: string) => out.push({ value });
  if (typeof contents === "string") push(contents);
  else if (contents && typeof contents === "object" && "value" in (contents as object)) {
    push(String((contents as { value: string }).value));
  } else if (Array.isArray(contents)) {
    for (const c of contents) {
      if (typeof c === "string") push(c);
      else if (c && typeof c === "object" && "value" in c) push(String((c as { value: string }).value));
    }
  }
  return out.length ? out : [{ value: "" }];
}

function completionToMonaco(
  monaco: Monaco,
  item: LspCompletionItem,
  range: languages.CompletionItem["range"],
): languages.CompletionItem {
  const label = typeof item.label === "string" ? item.label : item.label.label;
  return {
    label,
    kind: (item.kind ?? monaco.languages.CompletionItemKind.Text) as languages.CompletionItemKind,
    insertText: item.insertText ?? label,
    detail: item.detail,
    range,
  };
}
