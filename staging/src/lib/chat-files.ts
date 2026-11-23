import { api, fetchBlob } from "./api";
import { saveFile } from "./save-file";
import { formatNumber } from "../i18n/app";

/**
 * Chat files — attachments, generated images, plans and documents handed back
 * — as the chat's own copy keeps them (apps/api/src/routes/chat-files.ts).
 * Unlike a read from the sandbox, none of these wakes it, and they are still
 * there after it's gone. Links are signed and short-lived, so they're asked
 * for when needed and kept a little under their lifetime.
 */
export interface ChatFileLink {
  id: string;
  name: string;
  contentType: string;
  bytes: number;
  path: string;
  kind: string;
  url: string;
}

const LINK_TTL_MS = 8 * 60_000;
const links = new Map<string, { at: number; link: Promise<ChatFileLink | null> }>();

function cached(key: string, load: () => Promise<ChatFileLink | null>): Promise<ChatFileLink | null> {
  const hit = links.get(key);
  if (hit && Date.now() - hit.at < LINK_TTL_MS) return hit.link;
  const link = load().catch(() => null);
  links.set(key, { at: Date.now(), link });
  // A miss is asked again next time — the file may be on its way.
  void link.then((l) => {
    if (!l) links.delete(key);
  });
  return link;
}

/** The newest copy of what lived at `path` in the sandbox (.attachments/…, .mythex/…), or null. */
export function chatFileByPath(projectId: string, path: string, opts: { download?: boolean } = {}) {
  const q = `path=${encodeURIComponent(path)}${opts.download ? "&download=1" : ""}`;
  const key = `${projectId}|p|${path}|${opts.download ? 1 : 0}`;
  return opts.download
    ? api.get<ChatFileLink>(`/v1/projects/${projectId}/chat-files/by-path?${q}`).catch(() => null)
    : cached(key, () => api.get<ChatFileLink>(`/v1/projects/${projectId}/chat-files/by-path?${q}`));
}

export function chatFileById(projectId: string, fileId: string, opts: { download?: boolean } = {}) {
  const url = `/v1/projects/${projectId}/chat-files/${encodeURIComponent(fileId)}${opts.download ? "?download=1" : ""}`;
  return opts.download
    ? api.get<ChatFileLink>(url).catch(() => null)
    : cached(`${projectId}|i|${fileId}`, () => api.get<ChatFileLink>(url));
}

export async function chatFileText(projectId: string, ref: { fileId?: string; path?: string }): Promise<string | null> {
  const url = ref.fileId
    ? `/v1/projects/${projectId}/chat-files/${encodeURIComponent(ref.fileId)}/text`
    : `/v1/projects/${projectId}/chat-files/by-path/text?path=${encodeURIComponent(ref.path ?? "")}`;
  const r = await api.get<{ content: string }>(url).catch(() => null);
  return r ? r.content : null;
}

/**
 * Save a chat file under its own name. In the iOS/Android shell the signed
 * link opens outside the app, where the system handles the download.
 *
 * In a browser the bytes come through the API and are saved from here:
 * following the signed link (it says "attachment") made Safari on the iPhone
 * leave the chat for the bucket's page and show the PDF there.
 */
export async function downloadChatFile(
  projectId: string,
  ref: { fileId?: string; path?: string; name?: string },
): Promise<boolean> {
  const { isNative } = await import("./native");
  if (isNative()) {
    const link = ref.fileId
      ? await chatFileById(projectId, ref.fileId, { download: true })
      : await chatFileByPath(projectId, ref.path ?? "", { download: true });
    if (!link) return false;
    window.open(link.url, "_blank", "noopener,noreferrer");
    return true;
  }
  const name =
    ref.name ??
    (ref.fileId ? await chatFileById(projectId, ref.fileId) : await chatFileByPath(projectId, ref.path ?? ""))?.name ??
    (ref.path ?? "").split("/").pop() ??
    "download";
  const raw = ref.fileId
    ? `/v1/projects/${projectId}/chat-files/${encodeURIComponent(ref.fileId)}/raw`
    : `/v1/projects/${projectId}/chat-files/by-path/raw?path=${encodeURIComponent(ref.path ?? "")}`;
  const blob = await fetchBlob(raw).catch(() => null);
  if (!blob) return false;
  saveFile(blob, name);
  return true;
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  // Numbers in the app's language (1,5 MB in German); the units are the same everywhere.
  const num = (v: number, digits = 0) =>
    formatNumber(v, { useGrouping: false, minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (n < 1024) return `${num(n)} B`;
  if (n < 1024 * 1024) return `${num(Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${num(n / 1024 / 1024, n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${num(n / 1024 ** 3, 1)} GB`;
}

/** What the chat can show of a file without downloading it. */
export function previewKindFor(name: string, contentType = ""): "image" | "pdf" | "video" | "audio" | "text" | "none" {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (contentType.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"].includes(ext)) return "image";
  if (contentType === "application/pdf" || ext === "pdf") return "pdf";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType.startsWith("text/") || ["txt", "md", "csv", "json", "html", "log"].includes(ext)) return "text";
  return "none";
}

/** A presented file, from a PresentFile tool result. */
export interface PresentedFile {
  fileId: string;
  name: string;
  bytes: number;
  contentType: string;
  path: string;
  title?: string;
}

export function parsePresentedFile(detail: string | undefined | null): PresentedFile | null {
  if (!detail) return null;
  try {
    const j = JSON.parse(detail) as Partial<PresentedFile> & { presented?: boolean };
    if (!j?.presented || typeof j.fileId !== "string" || typeof j.name !== "string") return null;
    return {
      fileId: j.fileId,
      name: j.name,
      bytes: Number(j.bytes) || 0,
      contentType: typeof j.contentType === "string" ? j.contentType : "",
      path: typeof j.path === "string" ? j.path : "",
      ...(typeof j.title === "string" && j.title ? { title: j.title } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * A chat file as a same-origin blob: URL, streamed through the API — for
 * pictures the chat also saves or measures, which a signed S3 link can't be
 * read for without CORS on the bucket. Kept per project+file for the page's
 * life; null when the chat has no copy (yet).
 */
const objectUrls = new Map<string, Promise<string | null>>();
export function chatFileObjectUrl(projectId: string, ref: { fileId?: string; path?: string }): Promise<string | null> {
  const key = `${projectId}|${ref.fileId ?? `p:${ref.path}`}`;
  const hit = objectUrls.get(key);
  if (hit) return hit;
  const path = ref.fileId
    ? `/v1/projects/${projectId}/chat-files/${encodeURIComponent(ref.fileId)}/raw`
    : `/v1/projects/${projectId}/chat-files/by-path/raw?path=${encodeURIComponent(ref.path ?? "")}`;
  const p = fetchBlob(path)
    .then((b) => URL.createObjectURL(b))
    .catch(() => null);
  objectUrls.set(key, p);
  void p.then((u) => {
    if (!u) objectUrls.delete(key);
  });
  return p;
}
