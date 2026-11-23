/**
 * Errors thrown by scripts that are not ours.
 *
 * An in-app browser (the Google app on iOS, and others) injects its own script
 * into the page. When that script throws — a `RangeError: Maximum call stack
 * size exceeded` recursing over a DOM that translation keeps rewriting — the
 * browser reports it against our origin, so it lands in our project looking
 * like our bug. Its frames give it away: they point at the *document* URL
 * (`/dashboard/projects`, `/p/cmu9…`), because the script was injected rather
 * than loaded from a file. Nothing we ship is ever attributed that way — our
 * frames are files (`/assets/index-*.js`, or a source-mapped module path).
 *
 * Matched by where the code came from, not by the error's name: ignoring
 * "Maximum call stack size exceeded" by text would also hide a real infinite
 * loop of ours.
 */

interface MinimalFrame {
  filename?: string | null;
}
interface MinimalEvent {
  exception?: { values?: Array<{ stacktrace?: { frames?: MinimalFrame[] } | null }> | null } | null;
}

/**
 * Schemes that are never ours, whatever the file is called. A browser extension
 * ships real .js files — one threw `Cannot read properties of undefined
 * (reading 'M_ID')` from `ion://eppiocemhmnlbhjplcgkofciiegomcon/executors/200.js`
 * inside someone's workspace — and matching on the extension alone would call
 * that ours. `capacitor:` is deliberately absent: that is our own native shell's
 * origin, and its crashes are exactly the ones we must keep.
 */
const FOREIGN_SCHEME = /^(chrome|moz|safari(-web)?|ms-browser|webkit-masked-url|ion)[-a-z]*:/i;

/** A frame that came from a file we shipped (bundle, chunk, or source-mapped module). */
export function frameIsOurs(filename: string | null | undefined): boolean {
  if (!filename) return false;
  // The SDK prefixes every frame with `app:///` on its way out, so a scheme is
  // never at the start of the string by the time this sees it — the reason an
  // extension's frames slipped through the first version of this.
  const f = filename.trim().replace(/^app:\/{3}/i, "");
  if (!f || f === "[native code]" || f === "<anonymous>") return false;
  if (FOREIGN_SCHEME.test(f)) return false;
  if (f.includes("node_modules")) return true;
  return /\.(m?[jt]sx?|css)(\?.*)?$/i.test(f.split("#")[0]);
}

/**
 * True when the event has a stack and not one frame is ours. Something with no
 * stack at all is left alone — that is a different kind of report, and dropping
 * it blind is how a real regression goes unnoticed.
 */
export function isForeignScriptEvent(event: MinimalEvent): boolean {
  const frames = (event.exception?.values ?? [])
    .flatMap((v) => v?.stacktrace?.frames ?? [])
    .filter(Boolean);
  if (frames.length === 0) return false;
  return !frames.some((f) => frameIsOurs(f.filename));
}
