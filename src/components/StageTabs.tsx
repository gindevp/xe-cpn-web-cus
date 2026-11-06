import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Tab giai đoạn — khớp design `.seg button` / `.seg button.on`. */
export function stageTabClass(active: boolean) {
  return cn(active && "on");
}

/** Hàng tab = `.seg` Material 3. */
export function StageTabRow({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("seg", className)} role="tablist" style={{ alignSelf: "flex-start" }}>
      {children}
    </div>
  );
}

export function StageTabButton({
  active,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean; children: ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={active} className={cn(stageTabClass(active), className)} {...props}>
      {children}
    </button>
  );
}

/** Bộ lọc ngày + tìm kiếm — design `.filters` + `.field` + `.box`. */
export function StageTabFilters({
  from,
  to,
  q,
  onFrom,
  onTo,
  onQ,
  placeholder,
}: {
  from: string;
  to: string;
  q: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  onQ: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="filters" style={{ alignItems: "flex-end", flexWrap: "wrap", marginLeft: "auto" }}>
      <label className="field" style={{ flex: "0 0 160px" }}>
        <span className="l">Từ ngày</span>
        <span className="box input-box">
          <input
            type="date"
            className="num"
            aria-label="Từ ngày"
            value={from}
            onChange={(e) => onFrom(e.target.value)}
          />
          <span className="ms" aria-hidden="true">
            calendar_today
          </span>
        </span>
      </label>
      <label className="field" style={{ flex: "0 0 160px" }}>
        <span className="l">Đến ngày</span>
        <span className="box input-box">
          <input
            type="date"
            className="num"
            aria-label="Đến ngày"
            value={to}
            onChange={(e) => onTo(e.target.value)}
          />
          <span className="ms" aria-hidden="true">
            calendar_today
          </span>
        </span>
      </label>
      <label className="field" style={{ flex: "1 1 220px", minWidth: 180 }}>
        <span className="l">Tìm kiếm</span>
        <span className="box input-box">
          <span className="ms" aria-hidden="true">
            search
          </span>
          <input
            type="search"
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
          />
        </span>
      </label>
    </div>
  );
}

/** Có từ khoá mà tab đang mở không còn đơn khớp → nhảy sang tab đầu tiên có đơn khớp. */
export function useJumpToMatchingTab<K extends string>(
  q: string,
  tab: K,
  counts: Partial<Record<K, number>>,
  keys: readonly K[],
  setTab: (k: K) => void,
) {
  useEffect(() => {
    if (!q.trim() || (counts[tab] ?? 0) > 0) return;
    const next = keys.find((k) => (counts[k] ?? 0) > 0);
    if (next) setTab(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ nhảy khi từ khoá/kết quả đổi, không chặn bấm tay sang tab rỗng
  }, [q, counts]);
}
