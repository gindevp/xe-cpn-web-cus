import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ColorMode = "light" | "dark" | "system";
export type ResolvedColorMode = "light" | "dark";

const STORAGE_KEY = "cpn-color-mode";

type ThemeContextValue = {
  mode: ColorMode;
  resolved: ResolvedColorMode;
  /** Class token cho shell / portal M3 (`theme-light` | `theme-dark`). */
  themeClass: "theme-light" | "theme-dark";
  setMode: (mode: ColorMode) => void;
  cycleMode: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredMode(): ColorMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    /* ignore */
  }
  return "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveMode(mode: ColorMode): ResolvedColorMode {
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  return systemPrefersDark() ? "dark" : "light";
}

/** Gắn class lên <html> — gọi sớm (script head) và khi đổi mode. */
export function applyDomTheme(resolved: ResolvedColorMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("theme-dark", resolved === "dark");
  root.classList.toggle("theme-light", resolved === "light");
  root.style.colorScheme = resolved;
}

/** Script chặn flash sáng/tối trước hydrate — nhúng trong <head>. */
export const THEME_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(STORAGE_KEY)};var m=localStorage.getItem(k)||"system";var d=m==="dark"||(m!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.classList.toggle("theme-dark",d);r.classList.toggle("theme-light",!d);r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ColorMode>(() =>
    typeof window === "undefined" ? "system" : readStoredMode(),
  );
  const [resolved, setResolved] = useState<ResolvedColorMode>(() =>
    typeof window === "undefined" ? "light" : resolveMode(readStoredMode()),
  );

  const setMode = useCallback((next: ColorMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    const r = resolveMode(next);
    setResolved(r);
    applyDomTheme(r);
  }, []);

  const cycleMode = useCallback(() => {
    setMode(mode === "light" ? "dark" : mode === "dark" ? "system" : "light");
  }, [mode, setMode]);

  useEffect(() => {
    applyDomTheme(resolved);
  }, [resolved]);

  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const r = resolveMode("system");
      setResolved(r);
      applyDomTheme(r);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolved,
      themeClass: resolved === "dark" ? "theme-dark" : "theme-light",
      setMode,
      cycleMode,
    }),
    [mode, resolved, setMode, cycleMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}

export function themeModeLabel(mode: ColorMode): string {
  if (mode === "dark") return "Tối";
  if (mode === "light") return "Sáng";
  return "Theo hệ thống";
}
