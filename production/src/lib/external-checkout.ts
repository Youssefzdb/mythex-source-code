const LEAVING_KEY = "mythex:leaving-checkout";

/** Path Stripe should send the user back to (project, billing, …). */
export function currentAppPath(): string {
  return `${window.location.pathname}${window.location.search}`;
}

/** Full-page Stripe (or portal) redirect. Pairs with `installCheckoutBackReset`. */
export function goToExternalCheckout(url: string) {
  try {
    sessionStorage.setItem(LEAVING_KEY, "1");
  } catch {
    /* private mode / disabled storage */
  }
  window.location.assign(url);
}

/**
 * Browser Back from Stripe restores this document from bfcache with React
 * still on the pre-navigation "busy" spinner. Reload that frozen snapshot.
 * Successful Stripe redirects are a new document — do not reload those.
 */
export function installCheckoutBackReset() {
  let recovering = false;

  window.addEventListener("pageshow", (event) => {
    let leaving = false;
    try {
      leaving = sessionStorage.getItem(LEAVING_KEY) === "1";
      if (leaving) sessionStorage.removeItem(LEAVING_KEY);
    } catch {
      return;
    }
    if (!leaving || recovering) return;
    if (!(event as PageTransitionEvent).persisted) return;
    recovering = true;
    window.location.reload();
  });
}
