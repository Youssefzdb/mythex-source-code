export interface EditorSettings {
  wordWrap: boolean;
  fontSize: number;
  minimap: boolean;
  autoSave: boolean;
  tabSize: number;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  wordWrap: false,
  fontSize: 13,
  minimap: false,
  autoSave: false,
  tabSize: 2,
};

const STORAGE_KEY = "mythex.editorSettings";

export function loadEditorSettings(): EditorSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_EDITOR_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<EditorSettings>;
    return {
      wordWrap: Boolean(parsed.wordWrap),
      fontSize: clamp(Number(parsed.fontSize) || DEFAULT_EDITOR_SETTINGS.fontSize, 10, 24),
      minimap: Boolean(parsed.minimap),
      autoSave: Boolean(parsed.autoSave),
      tabSize: clamp(Number(parsed.tabSize) || DEFAULT_EDITOR_SETTINGS.tabSize, 1, 8),
    };
  } catch {
    return { ...DEFAULT_EDITOR_SETTINGS };
  }
}

export function saveEditorSettings(settings: EditorSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Simple fuzzy score for Quick Open — higher is better; -1 = no match. */
export function fuzzyScore(query: string, path: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const p = path.toLowerCase();
  const name = p.includes("/") ? p.slice(p.lastIndexOf("/") + 1) : p;
  if (name === q) return 10_000;
  if (name.startsWith(q)) return 5_000 - name.length;
  if (name.includes(q)) return 2_000 - name.indexOf(q);
  if (p.includes(q)) return 1_000 - p.indexOf(q);
  // Subsequence match
  let qi = 0;
  let score = 0;
  let last = -2;
  for (let i = 0; i < p.length && qi < q.length; i++) {
    if (p[i] !== q[qi]) continue;
    score += i === last + 1 ? 5 : 1;
    if (i === 0 || p[i - 1] === "/" || p[i - 1] === "-" || p[i - 1] === "_" || p[i - 1] === ".") {
      score += 8;
    }
    last = i;
    qi++;
  }
  return qi === q.length ? score : -1;
}

export function fuzzyFilter(query: string, paths: string[], limit = 50): string[] {
  const q = query.trim();
  if (!q) return paths.slice(0, limit);
  return paths
    .map((path) => ({ path, score: fuzzyScore(q, path) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit)
    .map((x) => x.path);
}

export const isMod = (e: { metaKey: boolean; ctrlKey: boolean }) => e.metaKey || e.ctrlKey;

export const MOD_LABEL = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
