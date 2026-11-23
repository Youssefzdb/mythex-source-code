/**
 * Riding out a deploy.
 *
 * A production deploy replaces the API and the orchestrator one instance at a
 * time. For some seconds on each, the balancer answers for them: a refused
 * connection, or 502/503/504 with its own HTML page instead of our JSON. None of
 * that is an answer from Mythex — the request never reached anything that could
 * say yes or no — and treating it as one logged people out, lost the message
 * they had just sent, emptied the chat they opened, and told them Mythex was
 * "at capacity".
 *
 * So those answers are waited out, for about as long as a rolling deploy takes.
 * Anything the server itself said — a JSON error, a 4xx, a 500 — is still final.
 */

/** A little over two instances' worth of drain and boot. */
export const DEPLOY_WINDOW_MS = 45_000;

/**
 * Is this an answer the balancer gave instead of us?
 *
 * `status` 0 is a connection that never completed. A 503 counts only without a
 * JSON `error` of our own: the API says "at capacity" with a 503 too, and that
 * one is a real answer.
 */
export function isDeployBlip(status: number, body?: unknown): boolean {
  if (status === 0 || status === 502 || status === 504) return true;
  if (status !== 503) return false;
  const code = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
  return typeof code !== "string";
}

/** 0.5s, 1s, 2s, then every 4s. */
export function deployRetryDelay(attempt: number): number {
  return Math.min(4_000, 500 * 2 ** Math.max(0, attempt));
}

export interface RetryOptions {
  budgetMs?: number;
  signal?: AbortSignal;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/**
 * Run `attempt` until it succeeds, throws something that is not a blip, or the
 * deploy window is spent — in which case the last blip is thrown as it was.
 */
export async function retryThroughDeploy<T>(
  attempt: () => Promise<T>,
  isBlip: (err: unknown) => boolean,
  opts: RetryOptions = {},
): Promise<T> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? defaultSleep;
  const budget = opts.budgetMs ?? DEPLOY_WINDOW_MS;
  const start = now();
  for (let n = 0; ; n++) {
    try {
      return await attempt();
    } catch (err) {
      if (!isBlip(err)) throw err;
      const delay = deployRetryDelay(n);
      if (now() - start + delay > budget) throw err;
      await sleep(delay, opts.signal);
    }
  }
}
