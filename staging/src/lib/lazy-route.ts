import { createElement, lazy, type ComponentType, type LazyExoticComponent } from "react";
import { isNative } from "./native";

/**
 * A route whose code survives a deploy landing under it.
 *
 * Every page here is a separate file with a content hash in its name, and a
 * deploy replaces the whole set. Anyone with the app already open is holding an
 * index.html that names the old files — so the moment they open a page they had
 * not visited yet, the browser asks for a chunk that no longer exists and the
 * import rejects. They got the crash screen, and we got a Sentry issue: 23 of
 * them in three days, all on pages people navigate to rather than land on.
 *
 * Nothing is actually broken. The app is one reload away from correct, because
 * a reload fetches the new index.html and with it the new names. So do that,
 * rather than telling someone their work is saved and asking them to press a
 * button.
 *
 * Two rules keep this from hiding real problems. It only acts on the browser's
 * own words for a module that would not load — a genuine error inside a page's
 * code still reaches the boundary untouched. And it reloads at most once in a
 * short window: if the chunk is still missing after a fresh index.html then the
 * deploy is broken, and a crash screen is the honest answer to that, far better
 * than a page that reloads for ever.
 */

/** Every browser's way of saying the module would not load. */
const CHUNK_LOAD_MESSAGES = [
  "failed to fetch dynamically imported module", // Chrome
  "error loading dynamically imported module", // Firefox
  "importing a module script failed", // Safari
  "expected a javascript module script", // host answered a missing asset with index.html
  // Chrome's wording for the same thing, and the one seen in the wild: someone
  // opened /signup holding an index.html from before a deploy, the browser asked
  // for a chunk that was gone, and our own index.html came back as text/html.
  // Missing from this list, it reached the crash screen instead of reloading.
  "is not a valid javascript mime type",
  // Chrome (especially mobile) wording for a lazy CSS chunk that did not land.
  // Same class as a missing JS chunk: a deploy just replaced hashed assets, or
  // the preload of Workspace-*.css flaked. One reload fetches the new names.
  "unable to preload css",
];

const RELOAD_MARK = "mythex:chunk-reload";
/** Long enough to cover the reload, short enough that a later deploy is free to try again. */
const RELOAD_WINDOW_MS = 15_000;

export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const name = (err as { name?: string }).name ?? "";
  if (name === "ChunkLoadError") return true;
  const message = String((err as { message?: string }).message ?? err).toLowerCase();
  return CHUNK_LOAD_MESSAGES.some((m) => message.includes(m));
}

/**
 * Have we already reloaded for this, moments ago?
 *
 * sessionStorage because it is per-tab and does not outlive the session: two
 * tabs recovering at once should not talk each other out of it. Wrapped because
 * a locked-down browser throws on the accessor itself, and failing to read a
 * marker is not a reason to refuse to recover.
 */
function reloadedRecently(): boolean {
  try {
    const at = Number(sessionStorage.getItem(RELOAD_MARK) ?? 0);
    return Number.isFinite(at) && Date.now() - at < RELOAD_WINDOW_MS;
  } catch {
    return false;
  }
}

function markReloaded(): void {
  try {
    sessionStorage.setItem(RELOAD_MARK, String(Date.now()));
  } catch {
    /* Private mode. The reload still happens; only the loop guard is lost. */
  }
}

/**
 * A dynamic import that turns a missing chunk into a reload instead of an
 * error — for code loaded on demand outside `lazy` (the code editor).
 *
 * The returned promise is left pending on the reload path on purpose: the
 * document is going away, and resolving it would paint a flash of error UI
 * first.
 */
export async function importOrReload<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (err) {
    if (!isChunkLoadError(err) || reloadedRecently()) throw err;
    markReloaded();
    window.location.reload();
    return await new Promise<T>(() => {});
  }
}

/**
 * Wraps `lazy` so a missing chunk becomes a reload instead of a crash. Use it
 * for every `lazy` component, not only routes: a plain `lazy` whose chunk a
 * deploy removed takes the whole page down (MYTHEX-WEB-17, the home page's
 * Meet Mythex section).
 */
export function lazyRoute<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
): LazyExoticComponent<T> & { preload: () => Promise<void> } {
  // Once a screen's code is in memory it renders straight away, with no
  // Suspense fallback — so a screen fetched ahead (`.preload`, or in the app
  // warmAppRoutes, since there every screen's code is on the phone) never
  // flashes a skeleton. Forgot password, Sign up, Settings all did.
  let loaded: T | null = null;
  let pending: Promise<{ default: T }> | null = null;
  const fetchOnce = () => {
    pending ??= importOrReload(load).then(
      (m) => {
        loaded = m.default;
        return m;
      },
      (err: unknown) => {
        // Not remembered: a failed fetch (a network blip) must be retried the
        // next time the screen is wanted, not fail forever.
        pending = null;
        throw err;
      },
    );
    return pending;
  };
  if (isNative()) appRouteFetchers.push(fetchOnce);
  const Lazy = lazy(fetchOnce);
  const Route = (props: object) => createElement((loaded ?? Lazy) as ComponentType<object>, props);
  return Object.assign(Route, { preload: () => fetchOnce().then(() => undefined) }) as unknown as LazyExoticComponent<T> & {
    preload: () => Promise<void>;
  };
}

const appRouteFetchers: Array<() => Promise<unknown>> = [];

/**
 * The app only: load every screen's code in the background, a few at a time,
 * once the first screen is showing (native-shell.ts). Local files, so it takes
 * moments, and after it no screen ever waits on its code.
 */
export async function warmAppRoutes(): Promise<void> {
  const queue = [...appRouteFetchers];
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) await f().catch(() => {});
  };
  await Promise.all([worker(), worker(), worker()]);
}

/**
 * A lazy route that renders straight away once its code is in memory: no
 * Suspense fallback, so a page whose code was fetched before the first render
 * (main.tsx, for the page someone lands on) or on hover never flashes a
 * skeleton. `preload` starts the fetch and is safe to call any number of times.
 */
export function preloadableRoute<P extends object>(
  load: () => Promise<{ default: ComponentType<P> }>,
): ComponentType<P> & { preload: () => Promise<void> } {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<{ default: ComponentType<P> }> | null = null;
  const fetchOnce = () => {
    pending ??= load().then((m) => {
      loaded = m.default;
      return m;
    });
    return pending;
  };
  const Lazy = lazyRoute(fetchOnce);
  const Route = (props: P) => (loaded ? createElement(loaded, props) : createElement(Lazy as unknown as ComponentType<P>, props));
  return Object.assign(Route, { preload: () => fetchOnce().then(() => undefined) });
}
