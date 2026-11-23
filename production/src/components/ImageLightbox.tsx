import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Download, X } from "lucide-react";
import { downloadImage } from "../lib/download-image";
import { useT } from "../i18n/app";
import { useBackCloses } from "../lib/native-back";

/**
 * Full-bleed image preview.
 *
 * Its own module rather than a local in ChatPanel: the chat's tool cards live
 * in their own files and ChatPanel imports them, so anything they share has to
 * sit outside it or the import cycles.
 *
 * Every picture in the chat opens here — generated images, app-test
 * screenshots, attachments, stock photos, pictures in a reply — so Download
 * lives here once rather than on each of them.
 */
export function ImageLightbox({
  src,
  alt,
  downloadName,
  onClose,
}: {
  src: string;
  alt: string;
  /** File name to save as (extension is fixed from the bytes). Defaults to the alt text. */
  downloadName?: string;
  onClose: () => void;
}) {
  const t = useT();
  const [saving, setSaving] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; y0: number; lastY: number; lastT: number; v: number } | null>(null);

  /**
   * Swipe down to close — the Photos app's gesture, on a touch screen.
   *
   * The picture follows the finger and shrinks a little as it goes, and the
   * dark around it thins out with the distance, so a drag reads as carrying
   * the picture away. Let go far enough, or with a flick, and it keeps going
   * and the viewer closes; short of that it settles back. Up is resisted: there
   * is nothing up there.
   *
   * Styles are written straight to the elements for the length of the drag —
   * a frame-rate gesture, not a React render per pointer move.
   */
  const follow = (dy: number, settle: boolean) => {
    const img = imgRef.current;
    const bd = backdropRef.current;
    const chrome = chromeRef.current;
    const down = Math.max(0, dy);
    const p = Math.min(down / 320, 1);
    const ease = "cubic-bezier(0.22, 1, 0.36, 1)";
    const t = settle ? `transform 300ms ${ease}, opacity 300ms ${ease}` : "none";
    if (img) {
      img.style.transition = t;
      img.style.transform = `translateY(${dy < 0 ? dy * 0.25 : dy}px) scale(${1 - p * 0.15})`;
    }
    if (bd) {
      bd.style.transition = settle ? `opacity 300ms ${ease}` : "none";
      bd.style.opacity = String(1 - p * 0.85);
    }
    if (chrome) {
      chrome.style.transition = t;
      chrome.style.opacity = String(1 - Math.min(p * 2, 1));
    }
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLImageElement>) => {
    if (e.pointerType !== "touch" || drag.current) return;
    drag.current = { id: e.pointerId, y0: e.clientY, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLImageElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.v = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    follow(e.clientY - d.y0, false);
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLImageElement>, close: () => void) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    const dy = e.clientY - d.y0;
    // Far enough, or a flick downward (px per ms).
    if (dy > 110 || (dy > 24 && d.v > 0.5)) {
      const img = imgRef.current;
      const bd = backdropRef.current;
      if (img) {
        img.style.transition = "transform 240ms cubic-bezier(0.4, 0, 1, 1), opacity 240ms";
        img.style.transform = `translateY(${dy + window.innerHeight * 0.35}px) scale(0.8)`;
        img.style.opacity = "0";
      }
      // The backdrop's inline opacity would outrank the closing fade.
      if (bd) {
        bd.style.transition = "opacity 240ms";
        bd.style.opacity = "0";
      }
      close();
      return;
    }
    follow(0, true);
  };

  const btn =
    "grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-60";

  return (
    <LightboxSurface
      onClose={onClose}
      label={alt || t.workspace.lightbox.imagePreview}
      className="items-center justify-center p-4 sm:p-8"
      backdropRef={backdropRef}
    >
      {(close) => (
        <>
          <div ref={chromeRef} className="absolute top-4 end-4 flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setSaving(true);
                void downloadImage(src, downloadName || alt || "image").finally(() => setSaving(false));
              }}
              className={btn}
              aria-label={t.workspace.lightbox.downloadImage}
              title={t.common.download}
              data-testid="lightbox-download"
            >
              <Download className="h-4 w-4" />
            </button>
            <button type="button" onClick={close} className={btn} aria-label={t.common.close} title={t.common.close}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => onPointerEnd(e, close)}
            onPointerCancel={(e) => onPointerEnd(e, close)}
            draggable={false}
            // touch-action: none — the finger drives the picture, not a page
            // scroll or a browser gesture.
            className="max-h-[min(90vh,900px)] max-w-[min(96vw,1100px)] touch-none rounded-lg object-contain select-none"
          />
        </>
      )}
    </LightboxSurface>
  );
}

/**
 * The full-screen layer the image and diagram viewers sit in: a Base UI
 * Dialog, like every other modal, so it fades and grows in, fades back out
 * before `onClose` runs, holds focus and locks the page's scroll. A press on
 * the dark area around the content closes it; one on the content does not.
 *
 * Mounted while open, like the viewers it wraps; `children` gets the animated
 * close for its own ✕.
 */
export function LightboxSurface({
  onClose,
  label,
  className = "",
  backdropRef,
  children,
}: {
  onClose: () => void;
  label: string;
  className?: string;
  /** The dark layer behind, for a gesture that fades it (swipe to close). */
  backdropRef?: Ref<HTMLDivElement>;
  children: (close: () => void) => ReactNode;
}) {
  // Opened a frame after mounting: Base UI plays the entrance only on a change.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const close = () => setOpen(false);
  // Android's back closes the viewer, not the screen behind it.
  useBackCloses(open, close);
  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(next) => !next && close()}
      onOpenChangeComplete={(next) => !next && onCloseRef.current()}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop forceRender ref={backdropRef} className="mx-fade fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm" />
        <BaseDialog.Popup
          aria-label={label}
          data-testid="lightbox"
          // Full-screen, so "outside" is never pressed: the empty area is the
          // popup itself, and a press that lands on it rather than on the
          // content is the backdrop click.
          onClick={(e) => e.target === e.currentTarget && close()}
          className={`mx-popup fixed inset-0 z-[80] flex outline-none ${className}`}
        >
          {children(close)}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
