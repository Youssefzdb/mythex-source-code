import { useEffect, useState } from "react";
import { Code2, Download, FileText, X } from "lucide-react";
import { orch, type OrchClient } from "../lib/orchestrator";
import { mediaKindFor, type MediaKind } from "../lib/file-kind";
import { downloadImage } from "../lib/download-image";
import { LightboxSurface } from "./ImageLightbox";
import { FileViewer } from "./editor/FileViewer";
import { Spinner } from "./ui";
import { fill, useT } from "../i18n/app";
import { chatFileById, chatFileByPath, chatFileText, downloadChatFile, formatBytes, previewKindFor } from "../lib/chat-files";
import { saveFile } from "../lib/save-file";
import { fetchBlob } from "../lib/api";
import { browserShowsPdf, PdfPages } from "./PdfPages";

type Loaded =
  | { kind: "text"; text: string }
  | { kind: MediaKind; dataUrl: string }
  | { kind: "error" };

/** A file kept with the chat (the bucket), not read from the sandbox. */
export type ChatFileRef = { projectId: string; fileId?: string; path?: string; name: string };

/**
 * A project file opened from a link in a reply, over the chat — the way a
 * picture in a reply opens, not by switching the pane to Code and away from
 * what you were reading. Pictures show large; a PDF, video or sound plays in
 * its viewer; text is shown to read; anything else offers the download. "Open
 * in Code" is there for when the editor is what you want.
 */
export function FilePreviewLightbox(props: {
  client?: OrchClient;
  path: string;
  chatFile?: ChatFileRef;
  /** `confirmed`: this button is the choice, so the workspace doesn't ask again. */
  onOpenInCode?: (path: string, opts?: { confirmed?: boolean }) => void;
  onClose: () => void;
}) {
  return props.chatFile ? (
    <ChatFilePreview file={props.chatFile} onClose={props.onClose} />
  ) : (
    <SandboxFilePreview {...props} />
  );
}

function SandboxFilePreview({
  client,
  path,
  onOpenInCode,
  onClose,
}: {
  client?: OrchClient;
  path: string;
  onOpenInCode?: (path: string, opts?: { confirmed?: boolean }) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [file, setFile] = useState<Loaded | null>(null);
  const name = path.split("/").pop() ?? path;

  useEffect(() => {
    if (!client) {
      setFile({ kind: "error" });
      return;
    }
    let live = true;
    void (async () => {
      // The same routing as the Code tab's viewer (CodeView's readTabFile):
      // by name, or by NUL bytes in what reads back as text.
      const known = mediaKindFor(path);
      // An SVG is text to the editor, but a preview is for looking at it.
      if (/\.svg$/i.test(path)) {
        const svg = await orch.readFile(client, path).catch(() => null);
        if (!live) return;
        setFile(
          svg
            ? { kind: "image", dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.content)}` }
            : { kind: "error" },
        );
        return;
      }
      if (!known) {
        const text = await orch.readFile(client, path).catch(() => null);
        if (!live) return;
        if (text && !text.content.includes("\u0000")) {
          setFile({ kind: "text", text: text.content });
          return;
        }
      }
      const dataUrl = await orch.readFileDataUrl(client, path).catch(() => null);
      if (!live) return;
      if (!dataUrl) {
        setFile({ kind: "error" });
        return;
      }
      const typed = known ? dataUrl.replace(/^data:[^;]*;/, `data:${known.mime};`) : dataUrl;
      setFile({ kind: known?.kind ?? "binary", dataUrl: typed });
    })();
    return () => {
      live = false;
    };
  }, [client, path]);

  const btn =
    "grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-60";

  const download = () => {
    if (!file || file.kind === "error") return;
    if (file.kind === "text") {
      saveFile(new Blob([file.text]), name);
      return;
    }
    void downloadImage(file.dataUrl, name);
  };

  return (
    <LightboxSurface onClose={onClose} label={name} className="flex-col items-center justify-center p-4 pt-16 sm:p-8 sm:pt-16">
      {(close) => (
        <>
          <div className="absolute inset-x-4 top-4 flex items-center gap-2">
            <p dir="ltr" className="min-w-0 flex-1 truncate text-start text-[14px] text-white/80" title={path}>
              {path}
            </p>
            {onOpenInCode && (
              <button
                type="button"
                onClick={() => {
                  close();
                  onOpenInCode(path, { confirmed: true });
                }}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-[13px] text-white transition hover:bg-white/20"
                data-testid="file-preview-open-code"
              >
                <Code2 className="size-4" />
                {t.workspace.filePreview.openInCode}
              </button>
            )}
            <button
              type="button"
              onClick={download}
              disabled={!file || file.kind === "error"}
              className={btn}
              aria-label={t.workspace.filePreview.downloadFile}
              title={t.common.download}
            >
              <Download className="h-4 w-4" />
            </button>
            <button type="button" onClick={close} className={btn} aria-label={t.common.close} title={t.common.close}>
              <X className="h-4 w-4" />
            </button>
          </div>

          {!file ? (
            <div className="grid place-items-center text-white/70" data-testid="file-preview" data-kind="loading">
              <Spinner size={20} />
            </div>
          ) : file.kind === "error" ? (
            <p className="text-sm text-white/70" data-testid="file-preview" data-kind="error">
              {fill(t.workspace.filePreview.couldntOpen, { name })}
            </p>
          ) : file.kind === "image" ? (
            <img
              src={file.dataUrl}
              alt={name}
              data-testid="file-preview"
              data-kind="image"
              className="max-h-[min(84vh,900px)] max-w-[min(96vw,1100px)] rounded-lg object-contain"
            />
          ) : file.kind === "text" ? (
            <pre
              data-testid="file-preview"
              data-kind="text"
              dir="auto"
              className="h-[min(84vh,900px)] w-[min(96vw,960px)] overflow-auto rounded-xl bg-panel p-4 font-mono text-[13px] leading-[1.6] whitespace-pre-wrap text-fg-2 mx-ring [overflow-wrap:anywhere]"
            >
              {file.text || t.workspace.filePreview.empty}
            </pre>
          ) : file.kind === "video" || file.kind === "audio" ? (
            // Straight on the dark, like a picture — a panel round a player was
            // a grey box with a strip of video floating in the middle of it.
            <Player kind={file.kind} dataUrl={file.dataUrl} name={name} />
          ) : (
            // A PDF (its viewer needs the page) or a file that can't be shown:
            // the Code tab's own viewer, in a panel sized for what it holds.
            <div
              data-testid="file-preview"
              data-kind={file.kind}
              className={`overflow-hidden rounded-xl bg-panel mx-ring ${
                file.kind === "pdf" ? "h-[min(84vh,1000px)] w-[min(96vw,960px)]" : "h-64 w-[min(96vw,520px)]"
              }`}
            >
              <FileViewer path={path} kind={file.kind} dataUrl={file.dataUrl} hideFooter />
            </div>
          )}
        </>
      )}
    </LightboxSurface>
  );
}

type ChatLoaded =
  | { kind: "image" | "pdf" | "video" | "audio"; url: string; bytes: number; id?: string }
  | { kind: "text"; text: string; bytes: number }
  | { kind: "none"; bytes: number }
  | { kind: "error" };

/**
 * A chat file — a document handed back, an attachment, a generated picture —
 * from the chat's own copy. Shown straight from its signed link: an <img>,
 * <iframe> or player needs no CORS, where reading the bytes into a blob would.
 * Word, Excel and slides have no browser viewer; they offer the download.
 */
function ChatFilePreview({ file: ref, onClose }: { file: ChatFileRef; onClose: () => void }) {
  const t = useT();
  const [file, setFile] = useState<ChatLoaded | null>(null);
  const [saving, setSaving] = useState(false);
  const [pdfFallback, setPdfFallback] = useState(browserShowsPdf);
  useEffect(() => {
    let live = true;
    void (async () => {
      const link = ref.fileId
        ? await chatFileById(ref.projectId, ref.fileId)
        : await chatFileByPath(ref.projectId, ref.path ?? "");
      if (!live) return;
      if (!link) return setFile({ kind: "error" });
      const kind = previewKindFor(link.name || ref.name, link.contentType);
      if (kind === "text") {
        const text = await chatFileText(ref.projectId, { fileId: link.id });
        if (!live) return;
        return setFile(text == null ? { kind: "none", bytes: link.bytes } : { kind: "text", text, bytes: link.bytes });
      }
      setFile(kind === "none" ? { kind: "none", bytes: link.bytes } : { kind, url: link.url, bytes: link.bytes, id: link.id });
    })();
    return () => {
      live = false;
    };
  }, [ref.projectId, ref.fileId, ref.path, ref.name]);

  const save = async () => {
    setSaving(true);
    await downloadChatFile(ref.projectId, { fileId: ref.fileId, path: ref.path }).catch(() => false);
    setSaving(false);
  };
  const btn =
    "grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-60";

  return (
    <LightboxSurface onClose={onClose} label={ref.name} className="flex-col items-center justify-center p-4 pt-16 sm:p-8 sm:pt-16">
      {(close) => (
        <>
          <div className="absolute inset-x-4 top-4 flex items-center gap-2">
            <p dir="auto" className="min-w-0 flex-1 truncate text-start text-[14px] text-white/80 rtl:text-right" title={ref.name}>
              {ref.name}
            </p>
            <button
              type="button"
              onClick={save}
              disabled={saving || file?.kind === "error"}
              className={btn}
              aria-label={t.workspace.filePreview.downloadFile}
              title={t.common.download}
              data-testid="chat-file-download"
            >
              {saving ? <Spinner size={14} /> : <Download className="h-4 w-4" />}
            </button>
            <button type="button" onClick={close} className={btn} aria-label={t.common.close} title={t.common.close}>
              <X className="h-4 w-4" />
            </button>
          </div>
          {!file ? (
            <div className="grid place-items-center text-white/70" data-testid="file-preview" data-kind="loading">
              <Spinner size={20} />
            </div>
          ) : file.kind === "error" ? (
            <p className="text-sm text-white/70" data-testid="file-preview" data-kind="error">
              {fill(t.workspace.filePreview.couldntOpen, { name: ref.name })}
            </p>
          ) : file.kind === "image" ? (
            <img
              src={file.url}
              alt={ref.name}
              data-testid="file-preview"
              data-kind="image"
              className="max-h-[min(84vh,900px)] max-w-[min(96vw,1100px)] rounded-lg object-contain"
            />
          ) : file.kind === "pdf" && !pdfFallback ? (
            // Drawn here: the bucket's link in an <iframe> shows nothing on
            // Android and a cut-off page on the iPhone. The bytes come through
            // the API — the bucket answers no browser's fetch.
            <div data-testid="file-preview" data-kind="pdf" className="contents">
              <PdfPages
                load={() =>
                  fetchBlob(`/v1/projects/${ref.projectId}/chat-files/${encodeURIComponent(file.id ?? "")}/raw`).then((b) =>
                    b.arrayBuffer(),
                  )
                }
                onFail={() => setPdfFallback(true)}
                className="h-[min(84vh,1000px)] w-[min(96vw,960px)] rounded-xl"
              />
            </div>
          ) : file.kind === "pdf" ? (
            <iframe
              title={ref.name}
              src={file.url}
              data-testid="file-preview"
              data-kind="pdf"
              className="h-[min(84vh,1000px)] w-[min(96vw,960px)] rounded-xl border-0 bg-white"
            />
          ) : file.kind === "video" ? (
            <video src={file.url} controls data-testid="file-preview" data-kind="video" className="max-h-[min(84vh,900px)] max-w-[min(96vw,1100px)] rounded-lg bg-black" />
          ) : file.kind === "audio" ? (
            <audio src={file.url} controls data-testid="file-preview" data-kind="audio" className="w-[min(92vw,480px)]" />
          ) : file.kind === "text" ? (
            <pre
              data-testid="file-preview"
              data-kind="text"
              dir="auto"
              className="h-[min(84vh,900px)] w-[min(96vw,960px)] overflow-auto rounded-xl bg-panel p-4 font-mono text-[13px] leading-[1.6] whitespace-pre-wrap text-fg-2 mx-ring [overflow-wrap:anywhere]"
            >
              {file.text || t.workspace.filePreview.empty}
            </pre>
          ) : (
            <div data-testid="file-preview" data-kind="none" className="flex w-[min(92vw,420px)] flex-col items-center gap-3 rounded-xl bg-panel p-8 text-center mx-ring">
              <FileText className="size-9 text-muted" />
              <p dir="auto" className="text-[15px] font-medium text-fg">{ref.name}</p>
              <p className="text-[13px] text-muted">
                {[formatBytes(file.bytes), t.workspace.filePreview.openOnDevice].filter(Boolean).join(" · ")}
              </p>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="mt-1 inline-flex h-9 items-center gap-2 rounded-full bg-accent px-4 text-[13px] font-medium text-accent-fg hover:bg-accent-hover transition hover:opacity-90 disabled:opacity-60"
              >
                {saving ? <Spinner size={14} /> : <Download className="size-4" />}
                {t.common.download}
              </button>
            </div>
          )}
        </>
      )}
    </LightboxSurface>
  );
}

/**
 * A video or a sound, played from a blob: URL — Chrome won't play a long data:
 * URL reliably, and it is copied on every render (FileViewer does the same).
 */
function Player({ kind, dataUrl, name }: { kind: "video" | "audio"; dataUrl: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let gone = false;
    let made: string | null = null;
    void fetch(dataUrl)
      .then((r) => r.blob())
      .then((b) => {
        if (gone) return;
        made = URL.createObjectURL(b);
        setUrl(made);
      })
      .catch(() => {});
    return () => {
      gone = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [dataUrl]);
  if (!url) {
    return (
      <div className="grid place-items-center text-white/70" data-testid="file-preview" data-kind="loading">
        <Spinner size={20} />
      </div>
    );
  }
  return kind === "video" ? (
    <video
      src={url}
      controls
      aria-label={name}
      data-testid="file-preview"
      data-kind="video"
      className="max-h-[min(84vh,900px)] max-w-[min(96vw,1100px)] rounded-lg bg-black"
    />
  ) : (
    <audio
      src={url}
      controls
      aria-label={name}
      data-testid="file-preview"
      data-kind="audio"
      className="w-[min(92vw,480px)]"
    />
  );
}

/*
 * One preview for the whole app, opened by a call rather than owned by the
 * link. A reply's links are rebuilt whenever the reply re-renders — the
 * sandbox waking, a new message arriving — and a preview held in the link's
 * own state closed with it, mid-load.
 */
type Request = {
  path: string;
  client?: OrchClient;
  chatFile?: ChatFileRef;
  onOpenInCode?: (path: string, opts?: { confirmed?: boolean }) => void;
};
let current: Request | null = null;
const listeners = new Set<() => void>();

export function openFilePreview(request: Request) {
  current = request;
  listeners.forEach((l) => l());
}

/** Mounted once, at the app's root. */
export function FilePreviewHost() {
  const [request, setRequest] = useState<Request | null>(current);
  useEffect(() => {
    const l = () => setRequest(current);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  if (!request) return null;
  return (
    <FilePreviewLightbox
      // A new file is a new viewer, not the old one reloading in place.
      key={request.chatFile ? `chat:${request.chatFile.fileId ?? request.chatFile.path}` : request.path}
      client={request.client}
      path={request.path}
      chatFile={request.chatFile}
      onOpenInCode={request.onOpenInCode}
      onClose={() => {
        current = null;
        setRequest(null);
      }}
    />
  );
}
