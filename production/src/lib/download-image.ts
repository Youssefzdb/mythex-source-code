import { isNative } from "./native";
import { saveFile } from "./save-file";

/**
 * Save a picture shown in the chat to the person's device.
 *
 * The chat's pictures come from three kinds of `src`: a data URL (generated
 * images, read from the sandbox), a blob URL (app-test screenshots,
 * attachments) and a plain https URL (a picture the model linked, a stock
 * photo). `<a download>` is ignored for a cross-origin URL — the browser just
 * navigates to it — so every source is read into a blob first, which also
 * tells us the real type for the file extension. A host that refuses CORS
 * can't be read that way; the picture opens in a new tab instead, where
 * saving it is one long-press or right-click away.
 *
 * In the iOS/Android shell a download link goes nowhere, so the file goes to
 * the share sheet, whose "Save Image" is the native way to keep a picture.
 */
export async function downloadImage(src: string, name: string): Promise<void> {
  let blob: Blob;
  try {
    const res = await fetch(src, src.startsWith("http") ? { mode: "cors", credentials: "omit" } : undefined);
    if (!res.ok) throw new Error(String(res.status));
    blob = await res.blob();
  } catch {
    // Only a web picture is worth a new tab. A blob: or data: URL that cannot
    // be read is gone — the tab it opened was a browser error page.
    if (/^https?:/i.test(src)) window.open(src, "_blank", "noopener,noreferrer");
    return;
  }

  const filename = imageFileName(name, blob.type);

  if (isNative()) {
    const file = new File([blob], filename, { type: blob.type || "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
      } catch {
        /* dismissed the sheet */
      }
      return;
    }
  }

  saveFile(blob, filename);
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/avif": "avif",
};

/** A readable file name with the extension the bytes actually have. */
export function imageFileName(name: string, type: string): string {
  const base =
    (name.split(/[\\/]/).pop() || "")
      .split("?")[0]
      .replace(/\.[a-z0-9]{2,5}$/i, "")
      .replace(/[^\p{L}\p{N}._ -]+/gu, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 60) || "image";
  const ext = EXT_BY_TYPE[type.split(";")[0].trim()] ?? (name.match(/\.([a-z0-9]{2,5})(?:\?|$)/i)?.[1]?.toLowerCase() || "png");
  return `${base}.${ext}`;
}
