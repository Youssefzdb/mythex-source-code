/**
 * Surviving a page that is being machine-translated while React renders.
 *
 * Google Translate rewrites the page under the app: every text node becomes
 * `<font>…</font>`. React still holds the node it put there, so its next update
 * asks the browser to insert next to — or remove — a node that is no longer the
 * child it was. The browser refuses ("The object can not be found here" in
 * WebKit, "not a child of this node" in Chrome), the render throws, and the
 * error boundary replaces the workspace with "Something went wrong". Seen on an
 * iPhone reading a translated workspace, and on Android and Windows Chrome —
 * fifteen crashes in one day — and reproduced by wrapping the text nodes the
 * way Translate does and tapping the chat/preview switch.
 *
 * React cannot be taught about this: the DOM changed behind its back. So the
 * two operations are made total — insert at the end when the reference node was
 * taken away, treat removing an already-detached node as done — but ONLY while
 * the page shows translation's fingerprint. An untranslated page keeps the
 * browser's strict behaviour, so a genuine bug of ours (inserting relative to a
 * node that is not a child) still throws where it always did, instead of
 * quietly appending in the wrong place for the rest of the app's life.
 */

/** The reference node is not where React left it. */
export function referenceNodeLost(parent: Node, reference: Node | null | undefined): boolean {
  return Boolean(reference) && (reference as Node).parentNode !== parent;
}

/** The child React wants gone is already off this parent. */
export function childAlreadyGone(parent: Node, child: Node | null | undefined): boolean {
  return Boolean(child) && (child as Node).parentNode !== parent;
}

/**
 * Translation's fingerprint: the `translated-*` class Google puts on <html>, or
 * the `<font>` wrappers it leaves around every text node. Nothing we ship uses
 * `<font>` — it has been obsolete since HTML 4 — so it is a reliable tell.
 */
export function pageLooksTranslated(doc: Pick<Document, "documentElement" | "querySelector">): boolean {
  const cls = doc.documentElement?.classList;
  if (cls?.contains("translated-ltr") || cls?.contains("translated-rtl")) return true;
  return Boolean(doc.querySelector("font"));
}

/** Checked only on the failure path, and latched: a translated page stays translated. */
function makeTranslationCheck(doc?: Pick<Document, "documentElement" | "querySelector">) {
  let seen = false;
  return (): boolean => {
    if (seen) return true;
    if (!doc) return false;
    seen = pageLooksTranslated(doc);
    return seen;
  };
}

let installed = false;

/**
 * @param onFallback reported once per session, so how often this happens is
 * visible rather than silently absorbed.
 */
export function installTranslationResilience(onFallback?: (op: string) => void): void {
  if (installed || typeof Node === "undefined") return;
  installed = true;
  const translated = makeTranslationCheck(typeof document === "undefined" ? undefined : document);
  let reported = false;
  const report = (op: string) => {
    if (reported) return;
    reported = true;
    try {
      onFallback?.(op);
    } catch {
      // Reporting must never be the thing that breaks a render.
    }
  };

  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, node: T, child: Node | null): T {
    if (referenceNodeLost(this, child) && translated()) {
      report("insertBefore");
      return insertBefore.call(this, node, null) as T;
    }
    return insertBefore.call(this, node, child) as T;
  };

  const removeChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (childAlreadyGone(this, child) && translated()) {
      report("removeChild");
      return child;
    }
    return removeChild.call(this, child) as T;
  };
}
