import { isNative } from "./native";

/**
 * Haptics, in the app only — nothing on the web, and nothing if the shell has
 * no haptics. Kept to moments that mean something, so each one still does:
 * never on a fold, a scroll or a streamed word.
 */
const lastFired = new Map<string, number>();
/**
 * The plugin, once per kind within 400ms: one moment can reach two places that
 * each mark it — a failed publish also shows an error toast — and two buzzes
 * for one thing read as two things.
 */
function haptics(kind: string) {
  if (!isNative()) return Promise.reject();
  const now = Date.now();
  if (now - (lastFired.get(kind) ?? 0) < 400) return Promise.reject();
  lastFired.set(kind, now);
  return import("@capacitor/haptics");
}

/**
 * A light tap under the finger — what a native chat app does when a message
 * goes, a drawer opens or shuts, a screen slides to the next, something is
 * copied, or the microphone starts or stops listening.
 */
export function tapHaptic(): void {
  void haptics("tap")
    .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }))
    .catch(() => {});
}

/** A firmer tap, for an action that changes what is happening: Stop. */
export function mediumHaptic(): void {
  void haptics("medium")
    .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Medium }))
    .catch(() => {});
}

/** Something finished well: the agent's turn, a publish. */
export function successHaptic(): void {
  void haptics("success")
    .then(({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Success }))
    .catch(() => {});
}

/** Something failed: a publish, a message that did not send, an error shown. */
export function errorHaptic(): void {
  void haptics("error")
    .then(({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Error }))
    .catch(() => {});
}

/** The tick of a picker moving to another option (Build ↔ Plan). */
export function selectionHaptic(): void {
  void haptics("selection")
    .then(async ({ Haptics }) => {
      await Haptics.selectionStart();
      await Haptics.selectionChanged();
      await Haptics.selectionEnd();
    })
    .catch(() => {});
}
