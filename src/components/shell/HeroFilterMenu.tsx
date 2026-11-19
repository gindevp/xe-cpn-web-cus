import { useEffect, useRef, useState } from "react";
import { useActivityFilters } from "@/lib/activity-filters";
import { ACTIVITY_TOP_NAV } from "@/lib/activity-nav";
import { usePageFilterSlot } from "@/lib/page-filter-slot";
import { useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/** Nút Lọc dưới topbar — ngày + mã đơn + lọc riêng của trang. */
export function HeroFilterMenu() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const filters = useActivityFilters();
  const pageSlot = usePageFilterSlot((s) => s.slot);
  const onActivityScreen = ACTIVITY_TOP_NAV.some((i) => pathname === i.to);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (wrapRef.current?.contains(el as Node)) return;
      // Combobox/select portal ra body — không đóng panel Lọc
      if (
        el?.closest?.(
          '[data-radix-popper-content-wrapper], [data-radix-select-content], [role="listbox"], [cmdk-root]',
        )
      ) {
        return;
      }
      setOpen(false);
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
  }, [pathname]);

  if (!onActivityScreen) return null;

  const dateActive = Boolean(filters.from || filters.to);
  const qActive = Boolean(filters.q.trim());
  const pageActive = pageSlot?.activeCount ?? 0;
  const badge = (dateActive ? 1 : 0) + (qActive ? 1 : 0) + pageActive;

  const clearAll = () => {
    filters.setFrom("");
    filters.setTo("");
    filters.setQ("");
    pageSlot?.clear?.();
  };

  return (
    <div className="m3-filter-bar">
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

            {pageSlot?.node ? <div className="m3-filter-page-slot">{pageSlot.node}</div> : null}

            {badge > 0 ? (
              <button type="button" className="btn tonal m3-filter-clear" onClick={clearAll}>
                Xóa lọc
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
