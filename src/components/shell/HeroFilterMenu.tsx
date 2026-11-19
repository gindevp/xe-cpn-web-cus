import { useEffect, useMemo, useRef, useState } from "react";
import { changeActiveOffice, useAuth } from "@/lib/auth";
import { useAllowedOffices } from "@/lib/allowed-offices";
import { useActivityFilters } from "@/lib/activity-filters";
import { ACTIVITY_TOP_NAV } from "@/lib/activity-nav";
import { officeName } from "@/lib/mock-data";
import { isNativeWebView } from "@/lib/native-shell";
import {
  canPickViewOffices,
  encodeViewOffices,
  isViewAllOffices,
  resolveViewOffice,
  selectedViewOfficeCodes,
  VIEW_ALL_OFFICES,
  viewOfficeDisplayLabel,
} from "@/lib/office-scope";
import { useStore } from "@/lib/store";
import { askConfirm } from "@/components/m3/askConfirm";
import { useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Nút Lọc — sổ panel (kiểu nav-fly): ngày + mã đơn + văn phòng. */
export function HeroFilterMenu() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { session } = useAuth();
  const offices = useStore((s) => s.offices);
  const viewOffice = useStore((s) => s.viewOffice);
  const setViewOffice = useStore((s) => s.setViewOffice);
  const pendingOffline = useStore((s) => s.offlineQueue.length);
  const canPickOffices = canPickViewOffices(session);
  const officeScope = resolveViewOffice(session, viewOffice);
  const selectedOfficeCodes = selectedViewOfficeCodes(officeScope);
  const allowed = useAllowedOffices((s) => s.offices);
  const activeOfficeId = useAllowedOffices((s) => s.activeId);
  const filters = useActivityFilters();
  const onActivityScreen = ACTIVITY_TOP_NAV.some((i) => pathname === i.to);
  const canSwitchOffice = !canPickOffices && !isNativeWebView() && allowed.length > 1;

  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [officeQ, setOfficeQ] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
    setOfficeQ("");
  }, [pathname]);

  const officeLabel = viewOfficeDisplayLabel(officeScope, offices, officeName);

  const officeOpts = useMemo(() => {
    const q = officeQ.trim().toLocaleLowerCase("vi-VN");
    const list = canPickOffices
      ? offices.map((o) => ({ value: o.code, label: o.name, keywords: o.code }))
      : allowed.map((o) => ({
          value: `id:${o.id}`,
          label: o.name || o.code,
          keywords: o.code,
        }));
    if (!q) return list;
    return list.filter(
      (o) =>
        o.label.toLocaleLowerCase("vi-VN").includes(q) ||
        (o.keywords ?? "").toLocaleLowerCase("vi-VN").includes(q),
    );
  }, [canPickOffices, offices, allowed, officeQ]);

  const officeActive = canPickOffices && !isViewAllOffices(officeScope);
  const badge =
    (onActivityScreen && (filters.from || filters.to) ? 1 : 0) +
    (onActivityScreen && filters.q.trim() ? 1 : 0) +
    (officeActive ? 1 : 0);

  const clearAll = () => {
    filters.setFrom("");
    filters.setTo("");
    filters.setQ("");
    if (canPickOffices) setViewOffice(VIEW_ALL_OFFICES);
  };

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

  const toggleOfficeCode = (code: string) => {
    if (isViewAllOffices(officeScope) || selectedOfficeCodes.length === 0) {
      setViewOffice(encodeViewOffices([code]));
      return;
    }
    const set = new Set(selectedOfficeCodes);
    if (set.has(code)) set.delete(code);
    else set.add(code);
    setViewOffice(encodeViewOffices([...set]));
  };

  return (
    <div className="m3-filter-wrap" ref={wrapRef}>
      <button
        type="button"
        className={cn("pill", open && "on", badge > 0 && !open && "m3-filter-active")}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Bộ lọc"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ms" aria-hidden="true">
          filter_list
        </span>
        Lọc
        {badge > 0 ? <span className="count num">{badge}</span> : null}
        <span className="ms" aria-hidden="true">
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>

      {open ? (
        <div className="m3-filter-fly" role="dialog" aria-label="Bộ lọc">
          <div className="nav-fly-title">Bộ lọc</div>

          {onActivityScreen ? (
            <>
              <label className="field">
                <span className="l">Từ ngày</span>
                <span
                  className="box input-box date-box"
                  onClick={(e) => {
                    const input = e.currentTarget.querySelector("input") as HTMLInputElement | null;
                    input?.showPicker?.();
                  }}
                >
                  <input
                    type="date"
                    className="num"
                    aria-label="Từ ngày"
                    value={filters.from}
                    onChange={(e) => filters.setFrom(e.target.value)}
                  />
                </span>
              </label>
              <label className="field">
                <span className="l">Đến ngày</span>
                <span
                  className="box input-box date-box"
                  onClick={(e) => {
                    const input = e.currentTarget.querySelector("input") as HTMLInputElement | null;
                    input?.showPicker?.();
                  }}
                >
                  <input
                    type="date"
                    className="num"
                    aria-label="Đến ngày"
                    value={filters.to}
                    onChange={(e) => filters.setTo(e.target.value)}
                  />
                </span>
              </label>
              <label className="field">
                <span className="l">Mã đơn / SĐT</span>
                <span className="box input-box">
                  <span className="ms" aria-hidden="true">
                    search
                  </span>
                  <input
                    type="search"
                    value={filters.q}
                    onChange={(e) => filters.setQ(e.target.value)}
                    placeholder="Mã đơn, SĐT…"
                    aria-label="Mã đơn, SĐT"
                  />
                </span>
              </label>
            </>
          ) : null}

          <div className="field">
            <span className="l">Văn phòng</span>
            {canPickOffices ? (
              <>
                <span className="box input-box">
                  <span className="ms" aria-hidden="true">
                    search
                  </span>
                  <input
                    type="search"
                    value={officeQ}
                    onChange={(e) => setOfficeQ(e.target.value)}
                    placeholder="Tìm văn phòng…"
                    aria-label="Tìm văn phòng"
                  />
                </span>
                <div className="m3-filter-office-list">
                  <button
                    type="button"
                    className={cn("m3-filter-office-item", isViewAllOffices(officeScope) && "on")}
                    onClick={() => setViewOffice(VIEW_ALL_OFFICES)}
                  >
                    <span className="ms" aria-hidden="true">
                      {isViewAllOffices(officeScope) ? "check_box" : "check_box_outline_blank"}
                    </span>
                    Toàn hệ thống
                  </button>
                  {officeOpts.map((o) => {
                    const on =
                      !isViewAllOffices(officeScope) && selectedOfficeCodes.includes(o.value);
                    return (
                      <button
                        key={o.value}
                        type="button"
                        className={cn("m3-filter-office-item", on && "on")}
                        onClick={() => toggleOfficeCode(o.value)}
                      >
                        <span className="ms" aria-hidden="true">
                          {on ? "check_box" : "check_box_outline_blank"}
                        </span>
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : canSwitchOffice ? (
              <>
                <span className="box input-box">
                  <span className="ms" aria-hidden="true">
                    search
                  </span>
                  <input
                    type="search"
                    value={officeQ}
                    onChange={(e) => setOfficeQ(e.target.value)}
                    placeholder="Tìm văn phòng…"
                    aria-label="Tìm văn phòng"
                    disabled={switching}
                  />
                </span>
                <div className="m3-filter-office-list">
                  {officeOpts.map((o) => {
                    const on = activeOfficeId != null && o.value === `id:${activeOfficeId}`;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        className={cn("m3-filter-office-item", on && "on")}
                        disabled={switching}
                        onClick={() => void switchOffice(o.value)}
                      >
                        <span className="ms" aria-hidden="true">
                          {on ? "radio_button_checked" : "radio_button_unchecked"}
                        </span>
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="box input-box m3-filter-office-ro" title={officeLabel}>
                <span className="ms" aria-hidden="true">
                  store
                </span>
                <span className="m3-filter-office-ro-label">{officeLabel}</span>
              </div>
            )}
          </div>

          {badge > 0 ? (
            <button type="button" className="btn tonal m3-filter-clear" onClick={clearAll}>
              Xóa lọc
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
