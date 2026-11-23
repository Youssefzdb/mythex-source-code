import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  type ReactNode,
} from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "mythex_theme";

function applyTheme(theme: Theme) {
  const effective = forceThemeLock ?? theme;
  document.documentElement.dataset.theme = effective;
  document.documentElement.classList.toggle("dark", effective === "dark");
  document.documentElement.classList.toggle("light", effective === "light");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", effective === "dark" ? "#1f1f1e" : "#fafafa");
  }
}

/** Marketing / force surfaces — wins over user preference until released. */
let forceThemeLock: Theme | null = null;

export function lockDocumentTheme(theme: Theme | null) {
  forceThemeLock = theme;
  if (theme) applyTheme(theme);
  else applyTheme("dark");
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Product is dark-only — light preference is ignored. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    applyTheme("dark");
    try {
      localStorage.setItem(STORAGE_KEY, "dark");
    } catch {
      /* ignore */
    }
  }, []);

  const setTheme = useCallback((_t: Theme) => {
    applyTheme("dark");
  }, []);
  const toggleTheme = useCallback(() => {
    applyTheme("dark");
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: "dark", setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/** Inline script-friendly bootstrap — product is always dark. */
export function getInitialTheme(): Theme {
  return "dark";
}
