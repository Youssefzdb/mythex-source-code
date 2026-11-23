import { useEffect, useState } from "react";
import { Download, FileQuestion } from "lucide-react";
import type { MediaKind } from "../../lib/file-kind";
import { rich } from "../../i18n/app/rich";
import { useT } from "../../i18n/app";
import { saveFile } from "../../lib/save-file";
import { browserShowsPdf, PdfPages } from "../PdfPages";

/**
 * A file the editor can't show as text: an image, a PDF, a video or a sound
 * in its own player, anything else as a download. Never editable — there is
 * nothing to save.
 */
export function FileViewer({
  path,
  kind,
  dataUrl,
  hideFooter = false,
}: {
  path: string;
  kind: MediaKind;
  dataUrl: string;
  /** Leave out the Download bar under a picture or player — for a host with its own Download. */
  hideFooter?: boolean;
}) {
  // A blob: URL rather than the data: one — Chrome won't show a PDF from a
  // data: URL, and a long data: URL is copied on every render.
  const [url, setUrl] = useState<string | null>(null);
  const [pdfFallback, setPdfFallback] = useState(browserShowsPdf);
  useEffect(() => {
    let revoked = false;
    let made: string | null = null;
    void fetch(dataUrl)
      .then((r) => r.blob())
      .then((b) => {
        if (revoked) return;
        made = URL.createObjectURL(b);
        setUrl(made);
      })
      .catch(() => {});
    return () => {
      revoked = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [dataUrl]);

  const t = useT();
  const name = path.split("/").pop() ?? path;
  const download = url ? (
    <a
      href={url}
      download={name}
      onClick={(e) => {
        // Saved from here: a link to a typed blob only opens it in Safari on the iPhone.
        e.preventDefault();
        void fetch(url)
          .then((r) => r.blob())
          .then((b) => saveFile(b, name))
          .catch(() => {});
      }}
      data-testid="file-viewer-download"
      className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-[13px] text-fg-2 ring-1 ring-line transition hover:bg-hover hover:text-fg"
    >
      <Download className="size-3.5" /> {t.common.download}
    </a>
  ) : null;

  if (!url) return <div className="h-full" data-testid="file-viewer" data-kind={kind} />;

  return (
    <div data-testid="file-viewer" data-kind={kind} className="flex h-full min-h-0 flex-col">
      {kind === "pdf" ? (
        pdfFallback ? (
          <iframe title={name} src={url} className="min-h-0 w-full flex-1 border-0 bg-white" />
        ) : (
          <PdfPages
            load={() => fetch(dataUrl).then((r) => r.arrayBuffer())}
            onFail={() => setPdfFallback(true)}
            className="min-h-0 w-full flex-1"
          />
        )
      ) : kind === "binary" ? (
        <div className="grid flex-1 place-items-center p-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <FileQuestion className="size-8 text-disabled" />
            <p className="text-sm text-fg-2">{rich(t.workspace.fileViewer.cantShow, { name: <span dir="auto">{name}</span> })}</p>
            {download}
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center overflow-auto p-6">
          {kind === "image" ? (
            <img src={url} alt={name} className="max-h-full max-w-full object-contain" />
          ) : kind === "video" ? (
            <video src={url} controls className="max-h-full max-w-full" />
          ) : (
            <audio src={url} controls />
          )}
        </div>
      )}
      {kind !== "binary" && !hideFooter && <div className="flex justify-end border-t border-line px-3 py-2">{download}</div>}
    </div>
  );
}
