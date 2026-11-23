/**
 * What a file in the project is, going by its name: text the editor can show,
 * or something that needs a viewer. A PDF read as text showed "%PDF-1.4" and
 * mangled bytes in the editor, and saving that tab wrote the mangled text back.
 */
export type MediaKind = "image" | "pdf" | "video" | "audio" | "binary";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  pdf: "application/pdf",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  ogv: "video/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
};

/** Files with no useful text form. SVG is text, so it stays in the editor. */
const BINARY = new Set([
  "heic", "heif", "tif", "tiff", "psd",
  "zip", "gz", "tgz", "bz2", "xz", "7z", "rar", "tar", "jar",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "key", "numbers", "pages",
  "woff", "woff2", "ttf", "otf", "eot",
  "exe", "dll", "so", "dylib", "bin", "wasm", "class", "o", "a",
  "sqlite", "sqlite3", "db", "pyc", "avi", "mkv", "wmv",
]);

function extOf(path: string): string {
  const base = path.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function mediaKindFor(path: string): { kind: MediaKind; mime: string } | null {
  const ext = extOf(path);
  const mime = MIME[ext];
  if (mime) {
    const kind: MediaKind = mime === "application/pdf" ? "pdf" : (mime.split("/")[0] as MediaKind);
    return { kind, mime };
  }
  if (BINARY.has(ext)) return { kind: "binary", mime: "application/octet-stream" };
  return null;
}
