/** Run after the browser is idle (or after a short timeout fallback). */
export function runWhenIdle(fn: () => void, timeoutMs = 3500): void {
  if (typeof window === "undefined") return;
  const ric = window.requestIdleCallback?.bind(window);
  if (ric) {
    ric(() => fn(), { timeout: timeoutMs });
    return;
  }
  window.setTimeout(fn, Math.min(timeoutMs, 2000));
}

export function isMarketingLanding(): boolean {
  if (typeof window === "undefined") return false;
  const p = window.location.pathname;
  return p === "/" || p === "/home";
}

/** Landing cold loads: defer until first interaction (PSI / TBT). */
export function runAfterInteraction(fn: () => void): void {
  if (typeof window === "undefined") return;
  const run = () => {
    window.removeEventListener("pointerdown", run);
    window.removeEventListener("keydown", run);
    fn();
  };
  window.addEventListener("pointerdown", run, { once: true, passive: true });
  window.addEventListener("keydown", run, { once: true });
}

/** Marketing → interaction; elsewhere → idle. */
export function deferNonCritical(fn: () => void, idleMs = 5000): void {
  if (isMarketingLanding()) runAfterInteraction(fn);
  else runWhenIdle(fn, idleMs);
}
