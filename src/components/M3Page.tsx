import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Khung nội dung theo design M3 (card 28px, page stack). */
export function M3Page({
  children,
  className,
  bare,
}: {
  children: ReactNode;
  className?: string;
  /** Không bọc card — dùng cho form/full-bleed. */
  bare?: boolean;
}) {
  if (bare) {
    return <div className={cn("m3-page stack gap-5", className)}>{children}</div>;
  }
  return (
    <div className={cn("m3-page stack gap-5", className)}>
      <div className="card m3-surface shadow-none border-0">{children}</div>
    </div>
  );
}

export function M3SectionTitle({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="title-row mb-4">
      <h2 className="page-title" style={{ fontSize: 22, lineHeight: "28px" }}>
        {children}
      </h2>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
