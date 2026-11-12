import { Link, useRouterState } from "@tanstack/react-router";
import { askConfirm } from "@/components/m3/askConfirm";
import { useEffect, useState } from "react";
import { changeActiveOffice, useAuth } from "@/lib/auth";
import { useAllowedOffices } from "@/lib/allowed-offices";
import { officeName } from "@/lib/mock-data";
import { canRead, useRbacVersion } from "@/lib/rbac";
import { useStore } from "@/lib/store";
import {
  canPickViewOffices,
  encodeViewOffices,
  isViewAllOffices,
  resolveViewOffice,
  selectedViewOfficeCodes,
  VIEW_ALL_OFFICES,
  viewOfficeDisplayLabel,
} from "@/lib/office-scope";
import { pendingHandoverOrders } from "@/lib/pending-handover";
import { isNativeWebView } from "@/lib/native-shell";
import { ACTIVITY_TOP_NAV } from "@/lib/activity-nav";
import { GlobalHeaderSearch } from "@/components/GlobalTopBar";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { useTheme } from "@/lib/theme";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Thanh đầu trang: search + lifecycle pills + lọc VP (theme/user ở đáy navbar). */
export function AppHero({ hideLifecycle }: { hideLifecycle?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { session } = useAuth();
  const { themeClass } = useTheme();
  useRbacVersion();
  const offices = useStore((s) => s.offices);
  const viewOffice = useStore((s) => s.viewOffice);
  const setViewOffice = useStore((s) => s.setViewOffice);
  const orders = useStore((s) => s.orders);
  const canPickOffices = canPickViewOffices(session);
  const officeScope = resolveViewOffice(session, viewOffice);
  const selectedOfficeCodes = selectedViewOfficeCodes(officeScope);
  const allowed = useAllowedOffices((s) => s.offices);
  const activeOfficeId = useAllowedOffices((s) => s.activeId);
  const pendingOffline = useStore((s) => s.offlineQueue.length);
  const [switching, setSwitching] = useState(false);

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
  const canSwitchOffice = !canPickOffices && !isNativeWebView() && allowed.length > 1;

  const switchOffice = async (token: string) => {
    const id = Number(token.replace(/^id:/, ""));
    if (!Number.isFinite(id) || id === activeOfficeId) return;
    if (pendingOffline > 0) {
      toast.error(
        `Còn ${pendingOffline} thao tác chưa gửi lên máy chủ — chờ có mạng rồi hãy chuyển VP`,
      );
      return;
    }
    const target = allowed.find((o) => o.id === id);
    if (
      !(await askConfirm(
        `Chuyển sang làm việc tại ${target?.name ?? "VP này"}?\nTrang sẽ tải lại, chỉ hiện đơn của VP này.`,
      ))
    ) {
      return;
    }
    setSwitching(true);
    try {
      await changeActiveOffice(id);
    } catch (e) {
      setSwitching(false);
      toast.error(e instanceof Error && e.message ? e.message : "Không chuyển được văn phòng");
    }
  };

  const officeLabel = viewOfficeDisplayLabel(officeScope, offices, officeName);

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
        {canPickOffices ? (
          <div className="pill m3-scope-pill" title="Chọn một hoặc nhiều văn phòng để xem">
            <SearchableMultiSelect
              values={selectedOfficeCodes}
              allSelected={isViewAllOffices(officeScope)}
              onValuesChange={(codes) => setViewOffice(encodeViewOffices(codes))}
              options={offices.map((o) => ({ value: o.code, label: o.name, keywords: o.code }))}
              allValue={VIEW_ALL_OFFICES}
              allLabel="Toàn hệ thống"
              placeholder="Toàn hệ thống"
              className="m3-scope-select"
              contentClassName="w-80 min-w-[18rem]"
            />
          </div>
        ) : canSwitchOffice ? (
          <div className="pill m3-scope-pill">
            <SearchableSelect
              value={activeOfficeId != null ? `id:${activeOfficeId}` : ""}
              onValueChange={(v) => void switchOffice(v)}
              options={allowed.map((o) => ({
                value: `id:${o.id}`,
                label: o.name || o.code,
                keywords: o.code,
              }))}
              placeholder={officeLabel}
              searchPlaceholder="Tìm văn phòng…"
              disabled={switching}
              className="m3-scope-select"
              contentClassName="w-72 min-w-[16rem]"
            />
          </div>
        ) : (
          <button type="button" className="pill" title={officeLabel}>
            {officeLabel}
            <span className="ms" aria-hidden="true">
              expand_more
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
