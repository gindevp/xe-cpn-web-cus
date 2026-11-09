import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePagedRows } from "@/lib/use-paged-rows";
import { TablePagination } from "@/components/TablePagination";
import { ProtectedPage } from "@/components/AppShell";
import { M3Page } from "@/components/M3Page";
import { StaffInfoPopover } from "@/components/StaffInfoPopover";
import { InventoryCheckDetail, formatDay } from "@/components/InventoryCheckDetail";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import {
  assignedOfficeCode,
  hasAllOfficeScope,
  resolveViewOffice,
  VIEW_ALL_OFFICES,
} from "@/lib/office-scope";
import { isApiEnabled } from "@/lib/api/client";
import {
  INVENTORY_STATUS_LABEL,
  listInventoryChecks,
  type InventoryCheckRow,
} from "@/lib/api/inventory-check-api";
import { officeName } from "@/lib/mock-data";
import { toast } from "sonner";

export const Route = createFileRoute("/kiem-ke")({
  head: () => ({
    meta: [
      { title: "Thông tin kiểm kê — X.E" },
      {
        name: "description",
        content: "Lịch sử kiểm kho theo văn phòng: tổng đơn, đã kiểm, thiếu.",
      },
      { property: "og:title", content: "Thông tin kiểm kê — X.E" },
      { property: "og:description", content: "Lịch sử kiểm kho của văn phòng." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Thông tin kiểm kê" screen="kiem-ke" hidePageTitle>
      <M3Page>
        <Page />
      </M3Page>
    </ProtectedPage>
  ),
});

function Page() {
  const { session } = useAuth();
  const viewOfficeRaw = useStore((s) => s.viewOffice);
  const offices = useStore((s) => s.offices);
  const officeNames = useMemo(() => new Map(offices.map((o) => [o.code, o.name])), [offices]);
  const scopeAll = hasAllOfficeScope(session);
  const officeCode = assignedOfficeCode(resolveViewOffice(session, viewOfficeRaw));

  const [rows, setRows] = useState<InventoryCheckRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<InventoryCheckRow | null>(null);
  const [showAbandoned, setShowAbandoned] = useState(false);

  const load = useCallback(async () => {
    if (!isApiEnabled()) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const office =
        scopeAll && (!officeCode || officeCode === VIEW_ALL_OFFICES)
          ? undefined
          : officeCode || undefined;
      setRows(await listInventoryChecks(office, showAbandoned));
    } catch (e) {
      setRows([]);
      toast.error(e instanceof Error ? e.message : "Không tải được lịch sử kiểm kho");
    } finally {
      setLoading(false);
    }
  }, [scopeAll, officeCode, showAbandoned]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return rows;
    return rows.filter((r) => {
      const hay = [
        r.checkedByName,
        r.checkedByUsername,
        r.officeCode,
        ...(r.missingCodes ?? []),
        ...(r.scannedCodes ?? []),
        ...(r.systemCodes ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(kw);
    });
  }, [rows, q]);
  const { pageRows, pager } = usePagedRows(filtered, "kiem-ke");

  const latest = filtered.find((r) => r.status === "COMPLETED") ?? null;
  if (detail) return <InventoryCheckDetail check={detail} onBack={() => setDetail(null)} />;

  const latestWho = latest?.checkedByName || latest?.checkedByUsername || "";
  const donePct =
    latest && latest.systemCount > 0
      ? Math.min(100, (latest.checkedCount / latest.systemCount) * 100)
      : 0;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="title-row">
        <div>
          <h1 className="page-title">Thông tin kiểm kê</h1>
          <div className="lab muted num">
            {latest
              ? `Kiểm kê gần nhất: ${formatDay(latest.checkedAt)}${latestWho ? ` · ${latestWho}` : ""}`
              : loading
                ? "Đang tải…"
                : "Chưa có lần kiểm kho nào tại VP này"}
          </div>
        </div>
        <label
          className="lab"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            minHeight: 40,
            cursor: "pointer",
          }}
        >
          <input
            className="check"
            type="checkbox"
            checked={showAbandoned}
            onChange={(e) => setShowAbandoned(e.target.checked)}
          />
          Hiện phiên bỏ dở
        </label>
      </div>

      {latest ? (
        <section className="sum-row num">
          <div className="sum-lead">
            <div style={{ minWidth: 0 }}>
              <div className="rev-vp lab">
                <span className="ms fill" aria-hidden="true">
                  inventory
                </span>
                Tổng số đơn
              </div>
              <div className="sum-hero">{latest.systemCount}</div>
            </div>
            <InventoryIllustration />
          </div>
          <div className="rev-tile card-tile">
            <svg
              className="rev-donut sm"
              viewBox="0 0 36 36"
              role="img"
              aria-label={`Đã kiểm ${latest.checkedCount} trên ${latest.systemCount} đơn`}
            >
              <circle className="donut-bg tint" cx="18" cy="18" r="15.5" pathLength="100" />
              <circle
                className="donut-val"
                cx="18"
                cy="18"
                r="15.5"
                pathLength="100"
                strokeDasharray={`${donePct} 100`}
              />
            </svg>
            <div>
              <div className="small muted">Số đơn đã kiểm</div>
              <div className="sum-val">{latest.checkedCount}</div>
            </div>
          </div>
          <div className="rev-tile card-tile bad">
            <span className="rev-ic" aria-hidden="true">
              <span className="ms fill">report</span>
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="small muted">Số đơn thiếu</div>
              <div className="sum-val">{latest.missingCount}</div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="card stack">
        <div className="title-row" style={{ alignItems: "center" }}>
          <h2 className="group-title sec-title num">
            <span className="sec-ic" aria-hidden="true">
              <span className="ms">history</span>
            </span>
            Lịch sử kiểm kê ({filtered.length})
          </h2>
          <label className="box input-box" style={{ flex: "0 1 260px", width: "auto" }}>
            <span className="ms muted" aria-hidden="true">
              search
            </span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm người kiểm, mã đơn"
              aria-label="Tìm người kiểm, mã đơn"
            />
          </label>
        </div>
        {filtered.length === 0 ? (
          <div className="empty" style={{ padding: "48px 16px" }}>
            <h2 className="group-title">{loading ? "Đang tải…" : "Không có lịch sử kiểm kê"}</h2>
          </div>
        ) : (
          <>
            <div className="scroller">
              <table className="tbl" style={{ ["--tbl-min" as string]: "860px" }}>
                <thead>
                  <tr>
                    <th>Người kiểm kê</th>
                    <th>Văn phòng</th>
                    <th>Ngày kiểm</th>
                    <th>Trạng thái</th>
                    <th className="r">Tổng số đơn</th>
                    <th className="r">Đã kiểm</th>
                    <th className="r">Thiếu</th>
                    <th className="r">Tác vụ</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => {
                    const name = r.checkedByName || r.checkedByUsername || "—";
                    return (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 500 }}>
                          <StaffInfoPopover staffKey={r.checkedByUsername}>{name}</StaffInfoPopover>
                          {r.participants.length > 1 ? (
                            <span className="sub">
                              Cùng kiểm:{" "}
                              {r.participants.map((p) => p.name || p.username).join(", ")}
                            </span>
                          ) : null}
                        </td>
                        <td>
                          {r.officeCode
                            ? (officeNames.get(r.officeCode) ?? officeName(r.officeCode))
                            : "—"}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>{formatDay(r.checkedAt)}</td>
                        <td>
                          <span className={STATUS_TAG[r.status]}>
                            {INVENTORY_STATUS_LABEL[r.status]}
                          </span>
                          {r.status === "OPEN" ? (
                            <span className="sub">{r.scanCount} kiện đã quét</span>
                          ) : r.reopenedAt ? (
                            <span className="sub">Đã mở lại</span>
                          ) : null}
                        </td>
                        <td className="r">{r.systemCount}</td>
                        <td className="r">{r.checkedCount}</td>
                        <td className="r main">{r.missingCount}</td>
                        <td>
                          <div className="act">
                            <button
                              type="button"
                              className="ok"
                              aria-label={`Xem chi tiết phiên của ${name}`}
                              onClick={() => setDetail(r)}
                            >
                              Xem chi tiết
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length > 10 ? <TablePagination pager={pager} /> : null}
          </>
        )}
      </section>
    </div>
  );
}

const STATUS_TAG: Record<InventoryCheckRow["status"], string> = {
  OPEN: "tag info",
  COMPLETED: "tag ok",
  ABANDONED: "tag",
};

function InventoryIllustration() {
  return (
    <svg className="rev-ill" viewBox="0 0 150 104" aria-hidden="true">
      <ellipse className="ill-soft" cx="75" cy="97" rx="68" ry="6" />
      <rect className="ill-main" x="34" y="10" width="66" height="86" rx="7" />
      <rect className="ill-paper" x="41" y="19" width="52" height="70" rx="3" />
      <rect className="ill-mid" x="53" y="4" width="28" height="13" rx="4" />
      <circle className="ill-main" cx="50" cy="32" r="4.5" />
      <path className="ill-tick" d="M47.8 32l1.6 1.7 3-3.2" />
      <rect className="ill-mid" x="59" y="29.5" width="28" height="5" rx="2.5" />
      <circle className="ill-main" cx="50" cy="48" r="4.5" />
      <path className="ill-tick" d="M47.8 48l1.6 1.7 3-3.2" />
      <rect className="ill-mid" x="59" y="45.5" width="28" height="5" rx="2.5" />
      <circle className="ill-main" cx="50" cy="64" r="4.5" />
      <path className="ill-tick" d="M47.8 64l1.6 1.7 3-3.2" />
      <rect className="ill-mid" x="59" y="61.5" width="28" height="5" rx="2.5" />
      <rect className="ill-box" x="104" y="68" width="30" height="28" rx="3" />
      <path className="ill-paper" d="M116 68h6v10h-6z" />
      <circle className="ill-lens" cx="112" cy="40" r="13" />
      <path className="ill-handle" d="M121 50l11 12" />
    </svg>
  );
}
