import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { canRead, useRbacVersion } from "@/lib/rbac";
import { useStore } from "@/lib/store";
import {
  canPickViewOffices,
  resolveViewOffice,
  VIEW_ALL_OFFICES,
} from "@/lib/office-scope";
import { pendingHandoverOrders } from "@/lib/pending-handover";
import { ACTIVITY_TOP_NAV } from "@/lib/activity-nav";
import { GlobalHeaderSearch } from "@/components/GlobalTopBar";
import { HeroFilterMenu } from "@/components/shell/HeroFilterMenu";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Thanh đầu trang: search + lifecycle pills + nút Lọc (ngày/mã/VP). */
export function AppHero({ hideLifecycle }: { hideLifecycle?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { session } = useAuth();
  const { themeClass } = useTheme();
  useRbacVersion();
  const viewOffice = useStore((s) => s.viewOffice);
  const setViewOffice = useStore((s) => s.setViewOffice);
  const orders = useStore((s) => s.orders);
  const canPickOffices = canPickViewOffices(session);

  useEffect(() => {
    if (!session) return;
    if (!canPickOffices) {
      const assigned = resolveViewOffice(session, "");
      if (assigned && viewOffice !== assigned) setViewOffice(assigned);
      return;
    }
    if (!viewOffice) setViewOffice(VIEW_ALL_OFFICES);
  }, [session, canPickOffices, viewOffice, setViewOffice]);

  const handoverCount = pendingHandoverOrders(orders, {
    allOffices: canPickOffices,
    office: session?.office,
  }).length;

  const quickNav = ACTIVITY_TOP_NAV.filter((i) => canRead(session?.role, i.screen));

  if (!session) return null;

  return (
    <div className={cn("m3-hero", themeClass)}>
      <div className="search-wrap m3-hero-search">
        <GlobalHeaderSearch />
      </div>

      {!hideLifecycle && quickNav.length > 0 ? (
        <nav className="hero-links" aria-label="Lối tắt đơn hàng">
          {quickNav.map((i) => {
            const active =
              pathname === i.to || (i.to !== "/dashboard" && pathname.startsWith(`${i.to}/`));
            const badge = i.to === "/cho-ban-giao" ? handoverCount : 0;
            const label = i.shortLabel ?? i.label;
            return (
              <Link key={i.to} to={i.to} title={i.label} className={cn("pill", active && "on")}>
                {label}
                {badge > 0 ? <span className="count num">{badge > 99 ? "99+" : badge}</span> : null}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <div className="m3-hero-right">
        <HeroFilterMenu />
      </div>
    </div>
  );
}
