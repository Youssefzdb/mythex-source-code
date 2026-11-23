/** Survives full-page OAuth redirects where React Router state is lost. */
const KEY = "mythex_pending_prompt";

export function setPendingPrompt(prompt: string | undefined | null) {
  try {
    const t = prompt?.trim();
    if (t) sessionStorage.setItem(KEY, t);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode / disabled storage */
  }
}

export function peekPendingPrompt(): string | undefined {
  try {
    return sessionStorage.getItem(KEY)?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** Read and clear — call once when seeding the dashboard composer. */
export function takePendingPrompt(): string | undefined {
  const value = peekPendingPrompt();
  setPendingPrompt(null);
  return value;
}
