/**
 * Warm a Solutions page's code before it is opened (hovering its menu link),
 * so it renders without a fallback. App.tsx registers the real loader; this
 * module exists so the menu can call it without importing App.
 */
let loader: (path: string) => Promise<void> = () => Promise.resolve();

export function registerSolutionsPreload(fn: (path: string) => Promise<void>): void {
  loader = fn;
}

export function preloadSolution(path: string): void {
  void loader(path).catch(() => undefined);
}
