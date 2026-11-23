export type PreviewOverlayKind = "waking" | "updating" | "starting" | "booting" | null;

/**
 * Which full-pane cover to show over the preview iframe.
 *
 * After first paint, keep the live app on screen during a follow-up turn.
 * Cover only when health is actually down (SetRunConfig restart, host-block,
 * dead port) *and* the agent is still working — idle BrowserRun blips must
 * not overlay.
 */
export function previewOverlayKind(s: {
  hasUrl: boolean;
  running: boolean;
  healthy: boolean;
  sandboxReady: boolean;
  booted: boolean;
  agentBusy: boolean;
  /**
   * A start request is in flight.
   *
   * Between the sandbox coming up and the app answering there was no state for
   * "we asked it to start and are waiting", so this fell through to the empty
   * pane — which says the app will appear once you describe it, to someone
   * whose app is starting. It is a fact about a request we made, not a guess
   * about the project, so it holds for any stack and any framework.
   */
  startPending?: boolean;
  blocked?: "credits" | "failed" | null;
}): PreviewOverlayKind {
  if (!s.sandboxReady && !s.blocked) return "waking";
  // Refresh mid-turn: chat reconnects, but there is no preview URL yet
  // (boot skips /start so it doesn't fight SetRunConfig; `run` hasn't
  // replayed). Don't show the idle empty pane.
  if (!s.hasUrl || !s.running) {
    if ((s.agentBusy || s.startPending) && s.sandboxReady && !s.blocked) return "starting";
    return null;
  }
  if (s.booted && s.agentBusy && !s.healthy) return "updating";
  if (!s.healthy && s.sandboxReady && !s.booted) return "starting";
  if ((s.healthy || s.booted) && !s.booted) return "booting";
  return null;
}

/** Public preview port from an E2B-style URL (`https://3000-….e2b.app`). */
export function previewPortFromUrl(url: string): number | null {
  try {
    const u = new URL(url);
    if (u.port) {
      const n = Number(u.port);
      return Number.isInteger(n) && n > 0 ? n : null;
    }
    const m = u.hostname.match(/^(\d{2,5})-/);
    if (m) return Number(m[1]);
    return null;
  } catch {
    return null;
  }
}
