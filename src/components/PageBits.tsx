import type { ReactNode } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Khối nội dung bảng/form — khớp design `.card` + toolbar tiêu đề. */
export function Section({
  title,
  icon,
  right,
  children,
  className,
}: {
  title?: ReactNode;
  /** Material Symbol — hiện `.sec-title` có `.sec-ic` như design. */
  icon?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const showHeader = title != null || right != null;
  return (
    <section
      className={cn("card", className)}
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      {showHeader ? (
        <div
          className="th-row"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px 16px",
            minHeight: 40,
          }}
        >
          {title != null && icon ? (
            <h2 className="group-title sec-title">
              <span className="sec-ic" aria-hidden="true">
                <span className="ms">{icon}</span>
              </span>
              {title}
            </h2>
          ) : title != null ? (
            <div style={{ fontSize: 15, lineHeight: "22px", fontWeight: 600 }}>{title}</div>
          ) : (
            <span />
          )}
          {right ? (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
              {right}
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="field view-field">
      <span className="l">{label}</span>
      <div className="view-val">{value}</div>
    </div>
  );
}

export function EmptyState({ children = "Chưa có dữ liệu" }: { children?: ReactNode }) {
  return (
    <div className="empty">
      <span
        className="ms"
        aria-hidden="true"
        style={{ fontSize: 40, color: "var(--on-surface-variant)" }}
      >
        inbox
      </span>
      <h2 className="group-title" style={{ margin: "12px 0 4px" }}>
        Không có dữ liệu
      </h2>
      <div className="muted lab">{children}</div>
    </div>
  );
}

export function OfflineBadge() {
  const online = useStore((s) => s.online);
  const queued = useStore((s) => s.offlineQueue.length);
  if (online && queued === 0) return null;
  return (
    <div className="tag warn" style={{ gap: 6 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 9999,
          background: "currentColor",
          flex: "none",
        }}
      />
      {online ? `Đồng bộ ${queued} thao tác…` : `Chế độ offline${queued ? ` · ${queued} chờ` : ""}`}
    </div>
  );
}
