import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Khối nội dung trang — mặc định stack; bọc card khi cần (bảng/form). */
export function M3Page({
  children,
  className,
  card,
  bare,
}: {
  children: ReactNode;
  className?: string;
  /** Bọc toàn bộ trong .card design. */
  card?: boolean;
  /** Không thêm class trang — dùng cho form full-bleed (Tạo đơn…). */
  bare?: boolean;
}) {
  if (bare) {
    return <div className={className}>{children}</div>;
  }
  if (card) {
    return <div className={cn("card m3-surface", className)}>{children}</div>;
  }
  return <div className={cn("m3-page stack", className)}>{children}</div>;
}

export function M3PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="title-row" style={{ alignItems: "flex-end" }}>
      <div style={{ flex: "1 1 360px", minWidth: 0 }}>
        <h1 className="page-title">{title}</h1>
        {description ? (
          <div className="muted" style={{ fontSize: 13, lineHeight: "20px", marginTop: 4 }}>
            {description}
          </div>
        ) : null}
      </div>
      {actions ? <div className="m3-title-extra">{actions}</div> : null}
    </div>
  );
}

export function M3Seg({
  children,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <div className="seg" role="tablist" aria-label={ariaLabel} style={{ alignSelf: "flex-start" }}>
      {children}
    </div>
  );
}
