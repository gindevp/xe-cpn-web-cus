import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouterState } from "@tanstack/react-router";
import { useStore } from "@/lib/store";

export type ColorMode = "light" | "dark" | "system";
export type ResolvedColorMode = "light" | "dark";

/** Bản nháp trước đăng nhập / migrate cũ — không dùng làm SoT sau khi có tài khoản. */
const PRELOGIN_KEY = "cpn-color-mode";
/** Map username → mode — dùng chung cus + web cũ. */
const BY_USER_KEY = "cpn-color-mode-by-user";
const ZUSTAND_KEYS = ["xe-m3-vthh-v1", "xe-vthh-v1"] as const;

type ThemeContextValue = {
  mode: ColorMode;
  resolved: ResolvedColorMode;
  /** Class token cho shell / portal M3 (`theme-light` | `theme-dark`). */
  themeClass: "theme-light" | "theme-dark";
  setMode: (mode: ColorMode) => void;
  cycleMode: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function accountKey(username: string | null | undefined): string {
  return (username ?? "").trim().toLowerCase();
}

function parseMode(raw: unknown): ColorMode | null {
  return raw === "light" || raw === "dark" || raw === "system" ? raw : null;
}

function readByUserMap(): Record<string, ColorMode> {
  try {
    const raw = localStorage.getItem(BY_USER_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (!obj || typeof obj !== "object") return {};
    const out: Record<string, ColorMode> = {};
    for (const [k, v] of Object.entries(obj)) {
      const m = parseMode(v);
      if (m) out[k] = m;
    }
    return out;
  } catch {
    return {};
  }
}

function writeByUser(username: string, mode: ColorMode) {
  const key = accountKey(username);
  if (!key) return;
  try {
    const map = readByUserMap();
    map[key] = mode;
    localStorage.setItem(BY_USER_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function readPreloginMode(): ColorMode | null {
  try {
    return parseMode(localStorage.getItem(PRELOGIN_KEY));
  } catch {
    return null;
  }
}

/** Mode gắn tài khoản NV; chưa đăng nhập → nháp máy / mặc định sáng. */
export function readStoredMode(username?: string | null): ColorMode {
  const key = accountKey(username);
  if (key) {
    const mapped = readByUserMap()[key];
    if (mapped) return mapped;
    const legacy = readPreloginMode();
    if (legacy) {
      writeByUser(key, legacy);
      return legacy;
    }
    return "light";
  }
  return readPreloginMode() ?? "light";
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

/** Màn khách / QR / tạo đơn công khai — luôn sáng, không theo dark NV. */
export function isCustomerFacingPath(pathname: string): boolean {
  const p = (pathname || "/").replace(/\/+$/, "") || "/";
  if (p === "/") return true;
  if (p === "/tra-cuu" || p.startsWith("/tra-cuu/")) return true;
  if (p === "/lay-hang" || p.startsWith("/lay-hang/")) return true;
  if (p.startsWith("/man-hinh-qr")) return true;
  if (p.startsWith("/tao-don/")) return true;
  if (/^\/\d+$/.test(p)) return true;
  return false;
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

function bootUsername(): string {
  try {
    for (const k of ZUSTAND_KEYS) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const j = JSON.parse(raw) as { state?: { session?: { username?: string } } };
      const u = j?.state?.session?.username;
      if (typeof u === "string" && u.trim()) return u.trim();
    }
  } catch {
    /* ignore */
  }
  return "";
}

/** Script chặn flash sáng/tối trước hydrate — nhúng trong <head>. */
export const THEME_BOOT_SCRIPT = `(function(){try{var path=location.pathname||"/";var cust=path==="/"||path.indexOf("/tra-cuu")===0||path.indexOf("/lay-hang")===0||path.indexOf("/man-hinh-qr")===0||path.indexOf("/tao-don/")===0||/^\\/\\d+$/.test(path.replace(/\\/+$/,"")||"/");if(cust){var r=document.documentElement;r.classList.remove("dark","theme-dark");r.classList.add("theme-light");r.style.colorScheme="light";return;}var user="";try{var keys=["xe-m3-vthh-v1","xe-vthh-v1"];for(var i=0;i<keys.length;i++){var raw=localStorage.getItem(keys[i]);if(!raw)continue;var j=JSON.parse(raw);var u=j&&j.state&&j.state.session&&j.state.session.username;if(typeof u==="string"&&u.trim()){user=u.trim();break;}}}catch(e){}var m="light";if(user){try{var map=JSON.parse(localStorage.getItem(${JSON.stringify(BY_USER_KEY)})||"{}");var k=String(user).trim().toLowerCase();if(map[k]==="light"||map[k]==="dark"||map[k]==="system")m=map[k];}catch(e){}}else{try{var leg=localStorage.getItem(${JSON.stringify(PRELOGIN_KEY)});if(leg==="light"||leg==="dark"||leg==="system")m=leg;}catch(e){}}var d=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var root=document.documentElement;root.classList.toggle("dark",d);root.classList.toggle("theme-dark",d);root.classList.toggle("theme-light",!d);root.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const username = useStore((s) => s.session?.username ?? null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const customerSurface = isCustomerFacingPath(pathname);

  const [mode, setModeState] = useState<ColorMode>(() =>
    typeof window === "undefined" ? "light" : readStoredMode(bootUsername()),
  );
  const [resolved, setResolved] = useState<ResolvedColorMode>(() => {
    if (typeof window === "undefined") return "light";
    if (isCustomerFacingPath(window.location.pathname)) return "light";
    return resolveMode(readStoredMode(bootUsername()));
  });

  const applyEffective = useCallback(
    (nextMode: ColorMode, forceLight: boolean) => {
      const r = forceLight ? "light" : resolveMode(nextMode);
      setResolved(r);
      applyDomTheme(r);
    },
    [],
  );

  const setMode = useCallback(
    (next: ColorMode) => {
      setModeState(next);
      const key = accountKey(username);
      try {
        if (key) writeByUser(key, next);
        else localStorage.setItem(PRELOGIN_KEY, next);
      } catch {
        /* ignore */
      }
      applyEffective(next, customerSurface);
    },
    [username, customerSurface, applyEffective],
  );

  const cycleMode = useCallback(() => {
    setMode(mode === "light" ? "dark" : mode === "dark" ? "system" : "light");
  }, [mode, setMode]);

  /** Đổi tài khoản → nạp preference của user đó. */
  useEffect(() => {
    const next = readStoredMode(username);
    setModeState(next);
    applyEffective(next, customerSurface);
  }, [username, customerSurface, applyEffective]);

  useEffect(() => {
    if (customerSurface || mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyEffective("system", false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode, customerSurface, applyEffective]);

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
