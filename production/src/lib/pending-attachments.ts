/**
 * Hold files picked on dashboard / landing (+ attach) across the
 * createProject → `/p/:id` navigation until ChatPanel uploads + sends them.
 * In-memory only (File objects aren't sessionStorage-friendly).
 *
 * Seed is module-locked so React remounts (Strict Mode / Workspace churn)
 * cannot take-and-lose the files before upload finishes.
 */

let pending: File[] = [];
/** True after setPendingAttachments with files — survive hero unmount cleanup. */
let retainAcrossNavigation = false;
/** Prevents a second ChatPanel mount from starting a parallel empty seed. */
let seedInFlight: Promise<void> | null = null;

export function setPendingAttachments(files: File[] | FileList | null | undefined) {
  if (!files) {
    pending = [];
    retainAcrossNavigation = false;
    return;
  }
  pending = Array.from(files);
  retainAcrossNavigation = pending.length > 0;
}

export function peekPendingAttachments(): File[] {
  return pending.slice();
}

export function shouldRetainPendingAttachments(): boolean {
  return retainAcrossNavigation && pending.length > 0;
}

/** Read and clear — prefer finishPendingAttachmentSeed after a successful send. */
export function takePendingAttachments(): File[] {
  const out = pending.slice();
  pending = [];
  retainAcrossNavigation = false;
  return out;
}

export function clearPendingAttachments() {
  pending = [];
  retainAcrossNavigation = false;
}

/**
 * Run the landing/dashboard → first-turn upload+send exactly once.
 * Concurrent/remount callers await the same promise instead of re-taking files.
 */
export function runPendingAttachmentSeed(task: (files: File[]) => Promise<void>): Promise<void> {
  if (seedInFlight) return seedInFlight;
  const files = pending.slice();
  seedInFlight = (async () => {
    try {
      await task(files);
      // Only clear after the seed task finishes (success or handled failure).
      pending = [];
      retainAcrossNavigation = false;
    } finally {
      seedInFlight = null;
    }
  })();
  return seedInFlight;
}
