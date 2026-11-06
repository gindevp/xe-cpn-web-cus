import { useRouterState } from "@tanstack/react-router";
import { useState, useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/mock-data";
import { canRead, useRbacVersion, type ScreenKey } from "@/lib/rbac";
import { MaintenanceGate } from "@/components/MaintenanceGate";
import { AppNav } from "@/components/shell/AppNav";
import { AppHero } from "@/components/shell/AppHero";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { TaoDonDialog } from "@/components/TaoDonDialog";
import { isNativeWebView } from "@/lib/native-shell";
import { OrderHistoryProvider } from "@/components/OrderHistoryDialog";
import { getToken } from "@/lib/api/client";
import { cn } from "@/lib/utils";

function NativeSyncing() {
  return (
    <div className="flex h-full min-h-screen items-center justify-center bg-[var(--low)] text-sm text-[var(--on-surface-variant)]">
      Đang đồng bộ đăng nhập…
    </div>
  );
}

function useNativeAuthWait() {
  const [readyToRedirect, setReadyToRedirect] = useState(!isNativeWebView());
  useEffect(() => {
    if (!isNativeWebView()) return;
    const t = window.setTimeout(() => setReadyToRedirect(true), 5000);
    return () => window.clearTimeout(t);
  }, []);
  return readyToRedirect;
}

export function AppShell({
  title,
  headerExtra,
  hideGlobalTopBarOnMobile,
  hidePageTitle,
  children,
}: {
  title: string;
  headerExtra?: ReactNode;
  hideGlobalTopBarOnMobile?: boolean;
  /** Khi trang tự render page-title (đúng design). */
  hidePageTitle?: boolean;
  children: ReactNode;
}) {
  const { session, hydrated } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hideLifecycle = hideGlobalTopBarOnMobile || pathname === "/tac-vu";
  const scanImmersive = pathname === "/quet-nhap";
  const [nativeShell, setNativeShell] = useState(false);
  const nativeAuthWaitDone = useNativeAuthWait();

  useEffect(() => {
    const w = window as Window & { ReactNativeWebView?: { postMessage: (msg: string) => void } };
    const native = !!w.ReactNativeWebView;
    setNativeShell(native);
    document.documentElement.classList.toggle("xe-native-shell", native);
    document.documentElement.classList.toggle("xe-scan-immersive", scanImmersive);
    if (native) {
      w.ReactNativeWebView?.postMessage(JSON.stringify({ type: "SCAN_LAYOUT", immersive: false }));
    }
    return () => {
      document.documentElement.classList.remove("xe-scan-immersive");
      if (native) {
        w.ReactNativeWebView?.postMessage(JSON.stringify({ type: "SCAN_LAYOUT", immersive: false }));
      }
    };
  }, [scanImmersive]);

  if (!hydrated) {
    return <div className="min-h-screen bg-[var(--low)]" />;
  }
  if (!session) {
    if (isNativeWebView() && (!nativeAuthWaitDone || getToken())) {
      return <NativeSyncing />;
    }
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    return null;
  }

  return (
    <div
      className={cn(
        "shell theme-light m3-app-shell",
        nativeShell ? "m3-native" : "",
        scanImmersive && "m3-scan-immersive",
      )}
    >
      {!nativeShell ? (
        <div className="m3-nav-slot">
          <AppNav />
        </div>
      ) : null}

      {nativeShell && mobileOpen ? (
        <div className="m3-nav-drawer">
          <div className="m3-nav-scrim" onClick={() => setMobileOpen(false)} />
          <div className="m3-nav-panel">
            <AppNav mobile onNavigate={() => setMobileOpen(false)} />
            <button
              type="button"
              className="m3-nav-close"
              aria-label="Đóng menu"
              onClick={() => setMobileOpen(false)}
            >
              <span className="ms" aria-hidden="true">
                close
              </span>
            </button>
          </div>
        </div>
      ) : null}

      <main
        className={cn(
          "page pad m3-main",
          scanImmersive && "m3-main-immersive",
          nativeShell && "m3-main-native",
        )}
      >
        {!scanImmersive ? (
          <>
            <AppHero hideLifecycle={hideLifecycle} />
            {!hidePageTitle ? (
              <div className="title-row m3-title-row">
                <div>
                  <h1 className="page-title">{title}</h1>
                </div>
                {headerExtra ? <div className="m3-title-extra">{headerExtra}</div> : null}
              </div>
            ) : null}
          </>
        ) : null}

        <div className={cn("m3-page-body", scanImmersive && "m3-page-body-immersive")}>{children}</div>
      </main>

      {nativeShell && !scanImmersive ? (
        <MobileBottomNav
          onCreateOrder={() => setOpenCreate(true)}
          onOpenMenu={() => setMobileOpen(true)}
        />
      ) : null}
      <TaoDonDialog open={openCreate} onOpenChange={setOpenCreate} />
    </div>
  );
}

export function ProtectedPage({
  title,
  screen,
  headerExtra,
  hideGlobalTopBarOnMobile,
  hidePageTitle,
  children,
}: {
  title: string;
  screen: ScreenKey;
  headerExtra?: ReactNode;
  hideGlobalTopBarOnMobile?: boolean;
  hidePageTitle?: boolean;
  children: ReactNode;
}) {
  const { session, hydrated } = useAuth();
  const nativeAuthWaitDone = useNativeAuthWait();
  useRbacVersion();
  if (!hydrated) return <div className="min-h-screen bg-[var(--low)]" />;
  if (!session) {
    if (isNativeWebView() && (!nativeAuthWaitDone || getToken())) {
      return <NativeSyncing />;
    }
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }
  if (!canRead(session.role, screen)) {
    return (
      <AppShell title={title}>
        <div className="card empty">
          <h2 className="group-title">Không có quyền truy cập</h2>
          <p className="lab muted" style={{ marginTop: 8 }}>
            Vai trò {ROLE_LABELS[session.role]} không thể xem màn này.
          </p>
        </div>
      </AppShell>
    );
  }
  const adminBypass = session.role === "AD";
  return (
    <MaintenanceGate channel="WEB_STAFF" bypass={adminBypass}>
      <OrderHistoryProvider>
        <AppShell
          title={title}
          headerExtra={headerExtra}
          hideGlobalTopBarOnMobile={hideGlobalTopBarOnMobile}
          hidePageTitle={hidePageTitle}
        >
          {children}
        </AppShell>
      </OrderHistoryProvider>
    </MaintenanceGate>
  );
}
