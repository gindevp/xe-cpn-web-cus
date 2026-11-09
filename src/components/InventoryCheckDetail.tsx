import { useEffect, useMemo, useState } from "react";
import { usePagedRows } from "@/lib/use-paged-rows";
import { TablePagination } from "@/components/TablePagination";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { ImageLightbox } from "@/components/ImageLightbox";
import { isApiEnabled } from "@/lib/api/client";
import { useStore } from "@/lib/store";
import {
  fetchInventoryCheckPhotos,
  fetchInventoryCheckScans,
  fetchInventoryCheckThumbnails,
  INVENTORY_STATUS_LABEL,
  type InventoryCheckPhoto,
  type InventoryCheckRow,
  type InventoryOrderScan,
} from "@/lib/api/inventory-check-api";
import { ExportFormatButton } from "@/components/ExportFormatButton";
import { downloadExcelRows, type ExportFormat } from "@/lib/csv";
import { officeName } from "@/lib/mock-data";
import { packageCode } from "@/lib/package-label";
import { toast } from "sonner";

type RowStatus = "checked" | "missing" | "extra";

const STATUS_LABEL: Record<RowStatus, string> = {
  checked: "Đã kiểm",
  missing: "Thiếu hàng",
  extra: "Kiểm dư",
};

const ROW_TAG: Record<RowStatus, string> = {
  checked: "tag ok",
  missing: "tag warn",
  extra: "tag info",
};

const SESSION_TAG: Record<InventoryCheckRow["status"], string> = {
  OPEN: "tag info",
  COMPLETED: "tag ok",
  ABANDONED: "tag",
};

const STATUS_ORDER: Record<RowStatus, number> = { missing: 0, extra: 1, checked: 2 };

type DetailRow = {
  code: string;
  status: RowStatus;
  photoCount: number;
  checker: string;
  checkedAt: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

export function formatDay(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatDay(iso)} - ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDateTimeShort(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${formatDay(iso)}`;
}

/** Mã phiên hiển thị: VP-yyyyMMdd-HHmmss theo giờ hoàn tất. */
function sessionLabel(check: InventoryCheckRow) {
  const d = new Date(check.checkedAt);
  if (Number.isNaN(d.getTime())) return check.officeCode || String(check.id);
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${check.officeCode}-${stamp}`;
}

function scannerLabel(s: InventoryOrderScan | undefined, fallback: string) {
  if (!s?.lastScannedBy) return fallback;
  const name = s.lastScannedByName || s.lastScannedBy;
  return s.lastScannedByCode ? `${s.lastScannedByCode} - ${name}` : name;
}

function buildRows(
  check: InventoryCheckRow,
  scans: Record<string, InventoryOrderScan>,
): DetailRow[] {
  const up = (c: string) => c.trim().toUpperCase();
  const system = new Set(check.systemCodes.map(up));
  const scanned = new Set(check.scannedCodes.map(up));
  if (check.status === "OPEN") for (const code of Object.keys(scans)) scanned.add(up(code));
  const missing = new Set(
    (check.missingCodes.length
      ? check.missingCodes.map(up)
      : [...system].filter((c) => !scanned.has(c))
    ).filter((c) => !scanned.has(c)),
  );
  const sessionChecker = check.checkedByName || check.checkedByUsername || "-";
  const rows: DetailRow[] = [];
  for (const code of scanned) {
    const s = scans[code];
    rows.push({
      code,
      status: system.size > 0 && !system.has(code) ? "extra" : "checked",
      photoCount: s?.count ?? 0,
      checker: scannerLabel(s, sessionChecker),
      checkedAt: s?.lastScannedAt || check.checkedAt,
    });
  }
  for (const code of missing) {
    rows.push({ code, status: "missing", photoCount: 0, checker: "-", checkedAt: check.checkedAt });
  }
  return rows.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      (Date.parse(b.checkedAt) || 0) - (Date.parse(a.checkedAt) || 0) ||
      a.code.localeCompare(b.code),
  );
}

export function InventoryCheckDetail({
  check,
  onBack,
}: {
  check: InventoryCheckRow;
  onBack: () => void;
}) {
  const [scans, setScans] = useState<Record<string, InventoryOrderScan>>({});
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | RowStatus>("all");
  const [photoOrder, setPhotoOrder] = useState<string | null>(null);
  const offices = useStore((s) => s.offices);
  const officeLabel =
    offices.find((o) => o.code === check.officeCode)?.name ?? officeName(check.officeCode);

  useEffect(() => {
    setScans({});
    setThumbs({});
    if (!isApiEnabled()) return;
    let cancelled = false;
    fetchInventoryCheckScans(check.id)
      .then((m) => !cancelled && setScans(m))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [check.id]);

  const allRows = useMemo(() => buildRows(check, scans), [check, scans]);
  const counts = useMemo(() => {
    const c = { checked: 0, missing: 0, extra: 0 };
    for (const r of allRows) c[r.status] += 1;
    return c;
  }, [allRows]);

  const rows = useMemo(() => {
    const kw = q.trim().toUpperCase();
    return allRows.filter(
      (r) => (status === "all" || r.status === status) && (!kw || r.code.includes(kw)),
    );
  }, [allRows, q, status]);
  const { pageRows, pager } = usePagedRows(rows, "kiem-ke-detail");

  const pageKey = pageRows
    .filter((r) => r.photoCount > 0)
    .map((r) => r.code)
    .join(",");
  useEffect(() => {
    if (!pageKey || !isApiEnabled()) return;
    const need = pageKey.split(",").filter((c) => !(c in thumbs));
    if (!need.length) return;
    let cancelled = false;
    fetchInventoryCheckThumbnails(check.id, need)
      .then((m) => {
        if (cancelled) return;
        setThumbs((prev) => {
          const next = { ...prev, ...m };
          for (const c of need) if (!(c in next)) next[c] = "";
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check.id, pageKey]);

  const exportRows = (format: ExportFormat = "csv") => {
    if (!rows.length) {
      toast.message("Không có dữ liệu để xuất");
      return;
    }
    downloadExcelRows(
      `kiem-ke-${sessionLabel(check)}`,
      [
        ["Mã đơn", "Trạng thái", "Số ảnh", "Người kiểm kê cuối", "Thời gian kiểm kê"],
        ...rows.map((r) => [
          r.code,
          STATUS_LABEL[r.status],
          r.photoCount,
          r.checker,
          formatDateTime(r.checkedAt),
        ]),
      ],
      "KiemKe",
      format,
    );
  };

  const meta = [
    officeLabel || check.officeCode,
    check.status === "COMPLETED"
      ? `Người hoàn tất: ${check.checkedByName || check.checkedByUsername || "—"} · ${formatDateTime(check.checkedAt)}`
      : null,
    check.openedAt
      ? `Mở phiên: ${check.openedByName || "—"} · ${formatDateTime(check.openedAt)}`
      : null,
    check.reopenedAt ? `Mở lại: ${formatDateTime(check.reopenedAt)}` : null,
    check.participants.length
      ? `Người kiểm: ${check.participants
          .map((p) => `${p.name || p.username} (${p.scanCount} kiện)`)
          .join(", ")}`
      : null,
    `Mã phiên: ${sessionLabel(check)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const filterTabs: ["all" | RowStatus, string, number][] = [
    ["all", "Tất cả", allRows.length],
    ["checked", STATUS_LABEL.checked, counts.checked],
    ["missing", STATUS_LABEL.missing, counts.missing],
    ["extra", STATUS_LABEL.extra, counts.extra],
  ];

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="title-row">
        <div style={{ minWidth: 0, flex: "1 1 480px" }}>
          <button
            type="button"
            className="text-act"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              margin: "0 0 8px -10px",
            }}
            onClick={onBack}
          >
            <span className="ms" aria-hidden="true" style={{ fontSize: 18 }}>
              arrow_back
            </span>
            Quay lại
          </button>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px" }}>
            <h1 className="page-title">Chi tiết phiên kiểm kê</h1>
            <span className={SESSION_TAG[check.status]}>
              {INVENTORY_STATUS_LABEL[check.status]}
            </span>
          </div>
          <div className="lab muted num">{meta}</div>
        </div>
        <ExportFormatButton label="Tải về danh sách" onExport={exportRows} />
      </div>

      <section className="sum-row tiles num">
        <div className="rev-tile card-tile">
          <span className="rev-ic" aria-hidden="true">
            <span className="ms fill">fact_check</span>
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="small muted">Tổng đơn đã kiểm</div>
            <div className="sum-val">
              {counts.checked + counts.extra} <span className="sum-unit">đơn</span>
            </div>
          </div>
        </div>
        <div className="rev-tile card-tile bad">
          <span className="rev-ic" aria-hidden="true">
            <span className="ms fill">report</span>
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="small muted">Số đơn thiếu hàng</div>
            <div className="sum-val">
              {counts.missing} <span className="sum-unit">đơn</span>
            </div>
          </div>
        </div>
        <div className="rev-tile card-tile">
          <span className="rev-ic" aria-hidden="true">
            <span className="ms fill">library_add</span>
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="small muted">Số đơn kiểm dư</div>
            <div className="sum-val">
              {counts.extra} <span className="sum-unit">đơn</span>
            </div>
          </div>
        </div>
      </section>

      <section className="card stack">
        <div className="title-row" style={{ alignItems: "center" }}>
          <div
            className="seg"
            role="tablist"
            aria-label="Lọc đơn"
            style={{ background: "var(--low)" }}
          >
            {filterTabs.map(([id, label, n]) => (
              <button
                key={id}
                type="button"
                role="tab"
                className={status === id ? "on" : undefined}
                aria-selected={status === id}
                onClick={() => setStatus(id)}
              >
                {label}
                <span className="count num">{n}</span>
              </button>
            ))}
          </div>
          <label className="box input-box" style={{ flex: "0 1 260px", width: "auto" }}>
            <span className="ms muted" aria-hidden="true">
              search
            </span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nhập mã đơn"
              aria-label="Nhập mã đơn"
            />
          </label>
        </div>

        {rows.length === 0 ? (
          <div className="empty" style={{ padding: "48px 16px" }}>
            <h2 className="group-title">Không có đơn phù hợp</h2>
          </div>
        ) : (
          <div className="stack">
            <div className="scroller">
              <table className="tbl" style={{ ["--tbl-min" as string]: "720px" }}>
                <thead>
                  <tr>
                    <th>Mã đơn</th>
                    <th>Hình ảnh</th>
                    <th>Trạng thái</th>
                    <th>Thông tin kiểm kê</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => {
                    const thumb = thumbs[r.code];
                    return (
                      <tr key={r.code}>
                        <td>
                          <OrderCodeLink code={r.code} />
                        </td>
                        <td className="muted">
                          {r.photoCount > 0 ? (
                            <button
                              type="button"
                              className="kk-thumb"
                              onClick={() => setPhotoOrder(r.code)}
                              title={`Xem ${r.photoCount} ảnh kiện`}
                              aria-label={`Xem ${r.photoCount} ảnh kiện của ${r.code}`}
                            >
                              {thumb ? <img src={thumb} alt="" loading="lazy" /> : null}
                              {r.photoCount > 1 ? (
                                <span className="num">{r.photoCount}</span>
                              ) : null}
                            </button>
                          ) : (
                            "Không có hình ảnh"
                          )}
                        </td>
                        <td>
                          <span className={ROW_TAG[r.status]}>{STATUS_LABEL[r.status]}</span>
                        </td>
                        <td>
                          Người kiểm kê cuối: {r.checker}
                          <span className="sub">
                            Thời gian kiểm kê: {formatDateTime(r.checkedAt)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination pager={pager} />
          </div>
        )}
      </section>

      <InventoryPhotoDialog
        checkId={check.id}
        checkedAt={check.checkedAt}
        orderCode={photoOrder}
        onClose={() => setPhotoOrder(null)}
      />
    </div>
  );
}

/** Ảnh từng kiện của một đơn chụp lúc quét kiểm kho — bằng chứng đối soát. */
function InventoryPhotoDialog({
  checkId,
  checkedAt,
  orderCode,
  onClose,
}: {
  checkId: number | null;
  checkedAt?: string;
  orderCode: string | null;
  onClose: () => void;
}) {
  const [photos, setPhotos] = useState<InventoryCheckPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    setPhotos([]);
    setLightboxIndex(null);
    if (checkId == null || !orderCode) return;
    let cancelled = false;
    setLoading(true);
    fetchInventoryCheckPhotos(checkId, orderCode)
      .then((rows) => {
        if (!cancelled) setPhotos(rows);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Không tải được ảnh"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [checkId, orderCode]);

  const groups = useMemo(() => {
    const m = new Map<number, { photo: InventoryCheckPhoto; index: number }[]>();
    photos.forEach((p, index) => {
      const list = m.get(p.packageSeq) ?? [];
      list.push({ photo: p, index });
      m.set(p.packageSeq, list);
    });
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [photos]);

  return (
    <>
      <Dialog open={!!orderCode} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ảnh kiện đã quét · {orderCode}</DialogTitle>
          </DialogHeader>
          <p className="-mt-2 text-xs text-muted-foreground">
            Ảnh chụp tự động lúc quét tem kiện khi kiểm kho
            {checkedAt ? ` ngày ${formatDay(checkedAt)}` : ""}. Một kiện quét nhiều lần sẽ có nhiều
            ảnh, sắp theo giờ quét.
          </p>
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Đang tải ảnh…</p>
          ) : groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Đơn này không có ảnh.</p>
          ) : (
            <div className="space-y-4">
              {groups.map(([seq, items]) => (
                <div key={seq} className="rounded-lg border p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold">Kiện {seq}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {packageCode(orderCode ?? "", seq)}
                    </span>
                    {items.length > 1 ? (
                      <Badge variant="secondary" className="font-normal">
                        Quét {items.length} lần
                      </Badge>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {items.map(({ photo, index }) => (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => setLightboxIndex(index)}
                        className="group overflow-hidden rounded-md border text-left hover:border-primary"
                      >
                        <img
                          src={photo.photo}
                          alt={`Kiện ${seq} lúc ${formatDateTimeShort(photo.capturedAt)}`}
                          className="aspect-[4/3] w-full bg-muted object-cover"
                          loading="lazy"
                        />
                        <div className="px-2 py-1 text-[11px] leading-tight text-muted-foreground">
                          <div className="font-medium text-foreground">
                            {formatDateTimeShort(photo.capturedAt)}
                          </div>
                          <div>{photo.capturedBy}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ImageLightbox
        open={lightboxIndex != null}
        onOpenChange={(o) => !o && setLightboxIndex(null)}
        urls={photos.map((p) => p.photo)}
        index={lightboxIndex ?? 0}
        title={
          lightboxIndex != null && photos[lightboxIndex]
            ? `${packageCode(orderCode ?? "", photos[lightboxIndex].packageSeq)} · ${formatDateTimeShort(photos[lightboxIndex].capturedAt)}`
            : undefined
        }
      />
    </>
  );
}
