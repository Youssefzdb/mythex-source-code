/**
 * Chat attachment limits, shared by the project chat and the landing/dashboard
 * composer. The upload route and the agent's file reader enforce the same
 * numbers (apps/orchestrator/src/routes/project.ts, file-reader.ts).
 */
import { appT, fill } from "../i18n/app";
export const MAX_ATTACHMENTS = 20;
export const IMAGE_MAX_MB = 20;
export const FILE_MAX_MB = 50;

/**
 * The formats the agent reads as images (it converts the ones the model
 * refuses) — the same list as agent/attachments.mjs. Decides the size limit.
 */
const IMAGE_EXT = /\.(png|jpe?g|jfif|gif|webp|avif|heic|heif|bmp|tiff?)$/i;

/** Browsers leave `type` empty for HEIC, so the name decides too. */
export function isImageFile(file: { name: string; type: string }): boolean {
  return IMAGE_EXT.test(file.name) || (/^image\/(png|jpeg|gif|webp|avif|heic|heif|bmp|tiff)$/).test(file.type);
}

/**
 * Shown as a picture (a square thumbnail) rather than a file chip — in the
 * composer before sending AND in the message after, so an attachment never
 * changes shape on send. Only formats every browser can draw: TIFF and HEIC
 * are images to the agent, but Chrome can't show them, so they stay chips.
 */
const PREVIEWABLE_EXT = /\.(png|jpe?g|jfif|gif|webp|avif|bmp|svg)$/i;
const NOT_PREVIEWABLE_EXT = /\.(tiff?|heic|heif)$/i;

export function isPreviewableImage(name: string, type = ""): boolean {
  if (NOT_PREVIEWABLE_EXT.test(name)) return false;
  return PREVIEWABLE_EXT.test(name) || /^image\/(png|jpeg|gif|webp|avif|bmp|svg\+xml)$/.test(type);
}

/** Why a file can't be attached, or null when it can. */
export function attachmentSizeError(file: { name: string; type: string; size: number }): string | null {
  // An empty file was taken, refused by the upload route, and left off the
  // message without a word (2026-11-14). Say so before it is attached.
  if (file.size === 0) return fill(appT().chat.attachments.empty, { name: file.name });
  const image = isImageFile(file);
  const maxMb = image ? IMAGE_MAX_MB : FILE_MAX_MB;
  if (file.size <= maxMb * 1024 * 1024) return null;
  const t = appT().chat.attachments;
  return fill(image ? t.imageTooLarge : t.tooLarge, { name: file.name, mb: maxMb });
}
