import { useEffect, useState } from "react";
import { File, X } from "lucide-react";
import { isPreviewableImage } from "../lib/attachment-limits";
import { ImageLightbox } from "./ImageLightbox";
import { fill } from "../i18n/app";
import { usePageT } from "../i18n/usePageT";

export type HeroLocalAttachment = {
  id: string;
  file: File;
  /** Object URL for images; revoke on remove / clear. */
  previewUrl?: string;
};

export { MAX_ATTACHMENTS as HERO_MAX_ATTACHMENTS } from "../lib/attachment-limits";

export function isHeroImageFile(file: File): boolean {
  return isPreviewableImage(file.name, file.type);
}

export function makeHeroAttachment(file: File): HeroLocalAttachment {
  const isImage = isHeroImageFile(file);
  return {
    id: crypto.randomUUID(),
    file,
    previewUrl: isImage ? URL.createObjectURL(file) : undefined,
  };
}

export function revokeHeroAttachment(att: HeroLocalAttachment) {
  if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
}

/** Material icons load on demand — keeps marketing off the icon pack. */
function LazyFileGlyph({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let cancelled = false;
    void import("./FileTypeIcon").then(({ loadMaterialFileIconUrl }) =>
      loadMaterialFileIconUrl(name).then((url) => {
        if (!cancelled && url) setSrc(url);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [name]);
  if (!src) return <File className={className} strokeWidth={1.75} aria-hidden />;
  return (
    <img
      src={src}
      alt=""
      className={`block shrink-0 object-contain ${className}`}
      draggable={false}
      aria-hidden
    />
  );
}

/** Image thumbs + file tiles for dashboard / landing PromptBar header. */
export function HeroAttachStrip({
  items,
  onRemove,
}: {
  items: HeroLocalAttachment[];
  onRemove: (id: string) => void;
}) {
  const t = usePageT();
  if (items.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {items.map((att) =>
        att.previewUrl ? (
          <HeroImageThumb key={att.id} att={att} onRemove={() => onRemove(att.id)} />
        ) : (
          <div
            key={att.id}
            className="group relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-white/5 ring-1 ring-white/10"
            title={att.file.name}
          >
            <div className="grid h-full w-full place-items-center">
              <LazyFileGlyph name={att.file.name} className="h-4 w-4" />
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(att.id);
              }}
              className="absolute top-0.5 end-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/65 text-white transition md:opacity-0 md:group-hover:opacity-100"
              aria-label={fill(t.chat.attachments.remove, { name: att.file.name })}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ),
      )}
    </div>
  );
}

function HeroImageThumb({
  att,
  onRemove,
}: {
  att: HeroLocalAttachment;
  onRemove: () => void;
}) {
  const t = usePageT();
  const [open, setOpen] = useState(false);
  const src = att.previewUrl!;
  return (
    <>
      <div
        className="group relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-white/5 ring-1 ring-white/10"
        title={att.file.name}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-full w-full cursor-zoom-in"
          aria-label={fill(t.chat.attachments.preview, { name: att.file.name })}
        >
          <img src={src} alt="" className="h-full w-full object-cover" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute top-0.5 end-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/65 text-white transition md:opacity-0 md:group-hover:opacity-100"
          aria-label={fill(t.chat.attachments.remove, { name: att.file.name })}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {open && (
        <ImageLightbox src={src} alt={att.file.name} downloadName={att.file.name} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
