import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import { Spinner } from "./ui";

/**
 * A PDF drawn page by page, the width of its box.
 *
 * The browser's own viewer in an <iframe> was the preview, and on a phone it
 * isn't one: Chrome on Android shows nothing there at all, and Safari on the
 * iPhone draws the page at its own size, its right side cut off. pdf.js draws
 * the pages here instead, the same on every browser. It loads with the first
 * PDF anyone opens; the legacy build, for the older phones.
 */
/**
 * A desktop browser's own viewer is the better one — zoom, search, selecting
 * text — and every desktop browser has one. Phones and tablets get the pages.
 */
export function browserShowsPdf(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: fine) and (min-width: 768px)").matches;
}

let pdfjs: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;
function loadPdfjs() {
  pdfjs ??= Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  });
  // A failed load (offline for a moment) is tried again next time.
  pdfjs.catch(() => {
    pdfjs = null;
  });
  return pdfjs;
}

export function PdfPages({
  load,
  onFail,
  className = "",
}: {
  /** The PDF's bytes. */
  load: () => Promise<ArrayBuffer>;
  /** It could not be drawn; the caller shows something else. */
  onFail?: () => void;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [ratio, setRatio] = useState(1.414);
  const [width, setWidth] = useState(0);
  const failRef = useRef(onFail);
  failRef.current = onFail;

  useEffect(() => {
    let live = true;
    let opened: PDFDocumentProxy | null = null;
    void (async () => {
      try {
        const [lib, data] = await Promise.all([loadPdfjs(), load()]);
        if (!live) return;
        opened = await lib.getDocument({ data: new Uint8Array(data) }).promise;
        if (!live) return void opened.destroy();
        const first = (await opened.getPage(1)).getViewport({ scale: 1 });
        if (!live) return;
        setRatio(first.height / first.width);
        setDoc(opened);
      } catch {
        if (live) failRef.current?.();
      }
    })();
    return () => {
      live = false;
      void opened?.destroy();
    };
    // `load` is a new function each render; the document is chosen once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.clientWidth - 16));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={scroller}
      // Left to right whatever the app's language: a canvas takes the page's
      // direction for its text, and pdf.js places every glyph itself. Right to
      // left (the app in Arabic), each run was drawn from the wrong end —
      // "A hm ad Z ra iq", letters lost under their neighbours.
      dir="ltr"
      className={`overflow-y-auto overscroll-contain bg-neutral-200 p-2 dark:bg-neutral-800 ${className}`}
      data-testid="pdf-pages"
      data-pages={doc?.numPages ?? 0}
    >
      {!doc || width <= 0 ? (
        <div className="grid h-full place-items-center text-muted">
          <Spinner size={20} />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          {Array.from({ length: doc.numPages }, (_, i) => (
            <PdfPage key={i} doc={doc} number={i + 1} width={width} ratio={ratio} root={scroller} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One page, drawn when it comes near the screen and let go when it is far
 * off: a phone has room for a few pages' canvases, not a long document's.
 */
function PdfPage({
  doc,
  number,
  width,
  ratio,
  root,
}: {
  doc: PDFDocumentProxy;
  number: number;
  width: number;
  ratio: number;
  root: React.RefObject<HTMLDivElement | null>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(number <= 2);
  const [height, setHeight] = useState(Math.round(width * ratio));

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), {
      root: root.current,
      rootMargin: "150% 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    if (!near) {
      // Let the memory go; the box keeps its height, so nothing moves.
      c.width = 0;
      c.height = 0;
      return;
    }
    let task: RenderTask | null = null;
    let live = true;
    void (async () => {
      const page = await doc.getPage(number);
      if (!live) return;
      const base = page.getViewport({ scale: 1 });
      const scale = width / base.width;
      const vp = page.getViewport({ scale });
      // Sharp on a phone's screen, without the canvas outgrowing what Safari allows.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.floor(vp.width * dpr);
      c.height = Math.floor(vp.height * dpr);
      c.style.width = `${Math.floor(vp.width)}px`;
      c.style.height = `${Math.floor(vp.height)}px`;
      setHeight(Math.floor(vp.height));
      task = page.render({ canvas: c, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      await task.promise.catch(() => {});
    })();
    return () => {
      live = false;
      task?.cancel();
    };
  }, [doc, number, width, near]);

  return (
    <div
      ref={box}
      className="relative shrink-0 bg-white shadow-sm"
      style={{ width, height }}
      data-testid="pdf-page"
      data-page={number}
    >
      <canvas ref={canvas} className="block" aria-hidden />
    </div>
  );
}
