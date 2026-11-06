import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePagedRows } from "@/lib/use-paged-rows";
import { TablePagination } from "@/components/TablePagination";
import { ProtectedPage } from "@/components/AppShell";
import { M3Page } from "@/components/M3Page";
import { Section, EmptyState } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { InvoiceBackfillButton } from "@/components/InvoiceBackfillButton";
import { collectFormLabel, formatDateTime, formatVND } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { listInvoiceRows, markInvoicesPersonal, type InvoiceRow } from "@/lib/api/domain-api";
import { isApiEnabled } from "@/lib/api/client";
import { ExportFormatButton } from "@/components/ExportFormatButton";
import { downloadExcel, type ExportFormat } from "@/lib/csv";
import { canWrite } from "@/lib/rbac";
import { useAuth } from "@/lib/auth";
import {
  INVOICE_STATE_LABEL,
  INVOICE_TYPE_LABEL,
  invoiceOrderFlag,
  invoiceOrderFlagLabel,
  invoiceStateOf,
  isInvoiceAutoBlocked,
  isPastDeadline,
  type InvoiceOrderFlag,
  type InvoiceState,
} from "@/lib/invoice-policy";
import { cn } from "@/lib/utils";
import { CheckSquare, FileText, RotateCcw, Square } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/quan-ly-hoa-don")({
  head: () => ({
    meta: [
      { title: "Quản lý hoá đơn — X.E" },
      {
        name: "description",
        content: "Kế toán theo dõi đơn đã / chưa xuất hoá đơn điện tử, bỏ xuất tự động, xuất bù và xuất Excel.",
      },
      { property: "og:title", content: "Quản lý hoá đơn — X.E" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Quản lý hoá đơn" screen="quan-ly-hoa-don">
      <M3Page>
        <Page />
      </M3Page>
    </ProtectedPage>
  ),
});

function isoDay(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 6);
  return { from: isoDay(from), to: isoDay(to) };
}

function money(n?: number) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return formatVND(Number(n)).replace(/\s*VNĐ$/i, "").trim();
}

function dt(s?: string) {
  return s ? formatDateTime(s) : "";
}

const stateOf = (r: InvoiceRow) => invoiceStateOf(r.invoiceStatus, r.invoiceType);
const flagOf = (r: InvoiceRow) => invoiceOrderFlag(r);
/** Chưa từng xuất / chưa tích (gồm lần trước lỗi) → được tích bỏ xuất tự động. */
const notIssuedYet = (r: InvoiceRow) => {
  const s = stateOf(r);
  return s === "NOT_ISSUED" || s === "FAILED";
};
/** Cùng cổng với xuất tự động: đã giao hoặc đã hoàn, đã thu đủ (công nợ được nợ). Huỷ / ngoại lệ không xuất. */
const canBackfill = (r: InvoiceRow) =>
  notIssuedYet(r) &&
  !isInvoiceAutoBlocked(flagOf(r)) &&
  (r.orderStatus === "DELIVERED" || r.orderStatus === "RETURNED") &&
  (r.onCredit || Number(r.paidAmount ?? 0) >= Number(r.fareAmount ?? 0));

const FLAG_FILTERS: { value: "" | "NORMAL" | InvoiceOrderFlag; label: string }[] = [
  { value: "", label: "Tất cả" },
  { value: "NORMAL", label: "Đơn thường" },
  { value: "RETURNING", label: "Đơn hoàn" },
  { value: "CANCELLED", label: "Đơn huỷ" },
  { value: "EXCEPTION", label: "Ngoại lệ" },
];
const payerName = (r: InvoiceRow) => (r.payer === "SENDER" ? r.senderName : r.receiverName) ?? "";
const payerPhone = (r: InvoiceRow) => (r.payer === "SENDER" ? r.senderPhone : r.receiverPhone) ?? "";

const STATE_FILTERS: { value: "" | InvoiceState; label: string }[] = [
  { value: "", label: "Tất cả" },
  { value: "NOT_ISSUED", label: "Chưa xuất" },
  { value: "COMPANY", label: "Đã xuất DN" },
  { value: "PERSONAL", label: "Đã xuất cá nhân" },
  { value: "MANUAL", label: "Bỏ xuất tự động" },
  { value: "FAILED", label: "Lỗi" },
];

function Page() {
  const { session } = useAuth();
  const offices = useStore((s) => s.offices);
  const defaults = useMemo(() => defaultRange(), []);
  const canEdit = canWrite(session?.role, "quan-ly-hoa-don");

  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [q, setQ] = useState("");
  const [office, setOffice] = useState("");
  const [state, setState] = useState<"" | InvoiceState>("");
  const [flag, setFlag] = useState<"" | "NORMAL" | InvoiceOrderFlag>("");
  const [onlyBackfill, setOnlyBackfill] = useState(false);
  const [all, setAll] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    if (!isApiEnabled()) {
      setAll([]);
      return;
    }
    if (!from || !to) return;
    setLoading(true);
    try {
      setAll(await listInvoiceRows(from, to));
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được danh sách hoá đơn");
      setAll([]);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const tokens = kw.split(/[\s,;]+/).filter(Boolean);
    const codeList = tokens.length > 1 ? new Set(tokens) : null;
    return all.filter((r) => {
      if (state && stateOf(r) !== state) return false;
      if (flag && (flagOf(r) ?? "NORMAL") !== flag) return false;
      if (onlyBackfill && !canBackfill(r)) return false;
      if (office && r.fromOfficeCode !== office && r.toOfficeCode !== office) return false;
      if (codeList) {
        if (!codeList.has(r.orderCode.toLowerCase())) return false;
      } else if (kw) {
        const hay =
          `${r.orderCode} ${r.senderName ?? ""} ${r.senderPhone ?? ""} ${r.receiverName ?? ""} ${r.receiverPhone ?? ""} ${r.invoiceTaxCode ?? ""} ${r.invoiceCompanyName ?? ""} ${r.invoiceNo ?? ""} ${r.pendingReason ?? ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [all, q, state, flag, office, onlyBackfill]);

  const { pageRows, pager } = usePagedRows(rows, "quan-ly-hoa-don");

  const counts = useMemo(() => {
    const c: Record<InvoiceState, number> = { NOT_ISSUED: 0, COMPANY: 0, PERSONAL: 0, MANUAL: 0, FAILED: 0, PENDING: 0 };
    for (const r of rows) c[stateOf(r)] += 1;
    return c;
  }, [rows]);
  const flagCounts = useMemo(() => {
    const c: Record<InvoiceOrderFlag, number> = { CANCELLED: 0, EXCEPTION: 0, RETURNING: 0 };
    for (const r of rows) {
      const f = flagOf(r);
      if (f) c[f] += 1;
    }
    return c;
  }, [rows]);

  const selectedRows = rows.filter((r) => selected.has(r.orderCode));
  // Đơn công nợ không tự xuất: chỉ xuất khi kế toán chọn đích danh.
  const backfillTargets = selectedRows.length
    ? selectedRows.filter(canBackfill)
    : rows.filter((r) => canBackfill(r) && !r.onCredit);
  const backfillCodes = backfillTargets.map((r) => r.orderCode);
  const lateCount = backfillTargets.filter((r) => isPastDeadline(r.deadlineAt)).length;
  const markable = selectedRows.filter(notIssuedYet);
  const unmarkable = selectedRows.filter((r) => stateOf(r) === "MANUAL");

  const toggle = (code: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.orderCode));
  const togglePage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of pageRows) {
        if (allOnPageSelected) next.delete(r.orderCode);
        else next.add(r.orderCode);
      }
      return next;
    });

  const mark = async (list: InvoiceRow[], marked: boolean) => {
    if (!list.length) return;
    const verb = marked
      ? "BỎ XUẤT TỰ ĐỘNG (hệ thống sẽ không tự xuất / xuất bù HĐ)"
      : "Bỏ tích bỏ xuất tự động (đơn về Chưa xuất)";
    if (!window.confirm(`${verb} cho ${list.length} đơn?`)) return;
    setMarking(true);
    try {
      const res = await markInvoicesPersonal(
        list.map((r) => r.orderCode),
        marked,
      );
      const failed = Object.entries(res).filter(([, v]) => v !== "OK");
      if (failed.length) {
        toast.error(`${failed.length} đơn không cập nhật được: ${failed.slice(0, 5).map(([k, v]) => `${k} (${v})`).join("; ")}`);
      } else {
        toast.success(marked ? `Đã tích ${list.length} đơn` : `Đã bỏ tích ${list.length} đơn`);
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không cập nhật được");
    } finally {
      setMarking(false);
    }
  };

  const exportExcel = (format: ExportFormat = "csv") => {
    if (!rows.length) {
      toast.message("Không có dữ liệu để xuất");
      return;
    }
    const headers = [
      "Mã đơn",
      "Loại đơn",
      "Mốc thanh toán",
      "Hạn yêu cầu HĐ công ty",
      "HTTT",
      "Công nợ",
      "Người trả",
      "Tên người trả",
      "SĐT người trả",
      "VP gửi",
      "VP nhận",
      "Người gửi",
      "SĐT gửi",
      "Người nhận",
      "SĐT nhận",
      "Tổng tiền HĐ (gồm VAT)",
      "Trạng thái HĐ",
      "Loại HĐ",
      "Xuất muộn",
      "Số HĐ",
      "Ký hiệu",
      "Ngày xuất / tích",
      "MST",
      "Tên công ty",
      "Lỗi",
      "Lý do chưa xuất",
    ];
    const data = rows.map((r) => [
      r.orderCode,
      (() => {
        const f = flagOf(r);
        return f ? invoiceOrderFlagLabel(f, r.openIssueType).text : "";
      })(),
      dt(r.paidAt),
      dt(r.deadlineAt),
      collectFormLabel(r.paymentTerm),
      r.onCredit ? "Có" : "",
      r.payer === "SENDER" ? "Người gửi" : "Người nhận",
      payerName(r),
      payerPhone(r),
      r.fromOfficeName ?? "",
      r.toOfficeName ?? "",
      r.senderName ?? "",
      r.senderPhone ?? "",
      r.receiverName ?? "",
      r.receiverPhone ?? "",
      Number(r.invoiceAmount ?? 0),
      INVOICE_STATE_LABEL[stateOf(r)].text,
      r.invoiceType && stateOf(r) !== "MANUAL" ? INVOICE_TYPE_LABEL[r.invoiceType] : "",
      r.late ? "Có" : "",
      r.invoiceNo ?? "",
      r.invoiceSeries ?? "",
      dt(r.invoiceIssuedAt),
      r.invoiceTaxCode ?? "",
      r.invoiceCompanyName ?? "",
      r.invoiceError ?? "",
      r.pendingReason ?? "",
    ]);
    downloadExcel(`hoa-don-${from}_${to}`, headers, data, format);
  };

  const clearFilters = () => {
    const d = defaultRange();
    setFrom(d.from);
    setTo(d.to);
    setQ("");
    setOffice("");
    setState("");
    setFlag("");
    setOnlyBackfill(false);
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="title-row" style={{ marginTop: 0 }}>
        <div style={{ flex: "1 1 480px", minWidth: 0 }}>
          <h1 className="page-title">Quản lý hoá đơn</h1>
          <div className="lab muted" style={{ maxWidth: 760 }}>
            Lọc theo mốc thanh toán: gửi trả là lúc nhập kho gửi, nhận trả và COD là lúc giao thành công. Hệ thống tự xuất
            khi đơn đã giao thành công và quá 3 tiếng kể từ mốc này.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn ghost" onClick={clearFilters}>
            Xoá bộ lọc
          </button>
          <ExportFormatButton variant="outline" disabled={!rows.length} onExport={exportExcel} />
        </div>
      </div>

      <section className="sum-row num">
        <div className="sum-lead">
          <div style={{ minWidth: 0 }}>
            <div className="rev-vp lab">
              <span className="ms fill" aria-hidden="true">
                pending_actions
              </span>
              Chưa xuất
            </div>
            <div className="sum-hero">{counts.NOT_ISSUED.toLocaleString("vi-VN")}</div>
          </div>
        </div>
        <div className="rev-tile card-tile">
          <span className="rev-ic" aria-hidden="true">
            <span className="ms fill">domain</span>
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="small muted">Đã xuất doanh nghiệp</div>
            <div className="sum-val">{counts.COMPANY.toLocaleString("vi-VN")}</div>
          </div>
        </div>
        <div className="rev-tile card-tile">
          <span className="rev-ic" aria-hidden="true">
            <span className="ms fill">person</span>
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="small muted">Đã xuất cá nhân</div>
            <div className="sum-val">{counts.PERSONAL.toLocaleString("vi-VN")}</div>
          </div>
        </div>
      </section>

      <div className="filter-grid">
        <label className="field">
          <span className="l">Tìm kiếm</span>
          <span className="box input-box">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (!/[\r\n]/.test(text)) return;
                e.preventDefault();
                setQ(text.split(/[\s,;]+/).filter(Boolean).join(" "));
              }}
              placeholder="Mã đơn, tên, SĐT, MST, số HĐ..."
            />
          </span>
        </label>
        <div className="field">
          <span className="l">VP gửi / nhận</span>
          <SearchableSelect
            value={office || "all"}
            onValueChange={(v) => setOffice(v === "all" ? "" : v)}
            placeholder="Tất cả"
            options={[{ value: "all", label: "Tất cả" }, ...offices.map((o) => ({ value: o.code, label: o.name }))]}
          />
        </div>
        <div className="field">
          <span className="l">Trạng thái HĐ</span>
          <SearchableSelect
            value={state || "all"}
            onValueChange={(v) => setState(v === "all" ? "" : (v as InvoiceState))}
            placeholder="Tất cả"
            options={STATE_FILTERS.map((f) => ({ value: f.value || "all", label: f.label }))}
          />
        </div>
        <div className="field">
          <span className="l">Loại đơn</span>
          <SearchableSelect
            value={flag || "all"}
            onValueChange={(v) => setFlag(v === "all" ? "" : (v as "NORMAL" | InvoiceOrderFlag))}
            placeholder="Tất cả"
            options={FLAG_FILTERS.map((f) => ({ value: f.value || "all", label: f.label }))}
          />
        </div>
        <label className="field">
          <span className="l">Thanh toán từ ngày</span>
          <span className="box input-box">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </span>
        </label>
        <label className="field">
          <span className="l">Đến ngày</span>
          <span className="box input-box">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </span>
        </label>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <label className="lab" style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input
            className="check"
            type="checkbox"
            checked={onlyBackfill}
            onChange={(e) => setOnlyBackfill(e.target.checked)}
          />
          Chỉ đơn cần / có thể xuất bù ({all.filter(canBackfill).length})
        </label>
        <div style={{ flex: 1 }} />
        {canEdit ? (
          <>
            <button
              type="button"
              className="btn tonal"
              style={{ height: 36 }}
              disabled={marking || !markable.length}
              onClick={() => void mark(markable, true)}
            >
              Bỏ xuất tự động ({markable.length})
            </button>
            {unmarkable.length ? (
              <button type="button" className="btn ghost" disabled={marking} onClick={() => void mark(unmarkable, false)}>
                Bỏ tích ({unmarkable.length})
              </button>
            ) : null}
            <InvoiceBackfillButton
              orderCodes={backfillCodes}
              lateCount={lateCount}
              label={`Xuất bù HĐ ${selectedRows.length ? "đơn đã chọn" : "tất cả đơn chưa xuất"} (${backfillCodes.length})`}
              onDone={() => void load()}
            />
          </>
        ) : null}
      </div>

      <section className="card stack">
        {!rows.length ? (
          <EmptyState>{loading ? "Đang tải…" : "Không có đơn trong khoảng lọc."}</EmptyState>
        ) : (
          <div className="scroller">
            <table className="tbl sticky-1" style={{ ["--tbl-min" as string]: "1300px" }}>
              <thead>
                <tr>
                  <th style={{ width: 18 }}>
                    <button type="button" className="no-btn" onClick={togglePage} aria-label="Chọn cả trang">
                      {allOnPageSelected ? (
                        <span className="ms fill" aria-hidden="true">
                          check_box
                        </span>
                      ) : (
                        <span className="ms" aria-hidden="true">
                          check_box_outline_blank
                        </span>
                      )}
                    </button>
                  </th>
                  <th>Mã đơn</th>
                  <th>Mốc thanh toán</th>
                  <th>HTTT</th>
                  <th>Người trả</th>
                  <th>VP gửi → VP nhận</th>
                  <th className="r">Tiền HĐ</th>
                  <th>Trạng thái HĐ</th>
                  <th>Lý do chưa xuất</th>
                  <th>Số HĐ</th>
                  <th>Công ty / MST</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const st = stateOf(r);
                  const label = INVOICE_STATE_LABEL[st];
                  const f = flagOf(r);
                  const flagLabel = f ? invoiceOrderFlagLabel(f, r.openIssueType) : null;
                  const needsBackfill = Boolean(r.pendingReason && canBackfill(r));
                  return (
                    <tr
                      key={r.orderCode}
                      className={cn(
                        "border-b last:border-0 hover:bg-muted/30",
                        needsBackfill && "bg-amber-50/60",
                      )}
                    >
                      <td className="px-2 py-2 align-top">
                        <button type="button" onClick={() => toggle(r.orderCode)} aria-label={`Chọn ${r.orderCode}`}>
                          {selected.has(r.orderCode) ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      </td>
                      <td className="px-2 py-2 align-top">
                        <OrderCodeLink code={r.orderCode} />
                        {flagLabel ? (
                          <div className="mt-0.5">
                            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", flagLabel.cls)}>
                              {flagLabel.text}
                            </span>
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 align-top whitespace-nowrap">
                        <div>{dt(r.paidAt) || "—"}</div>
                      </td>
                      <td className="px-2 py-2 align-top whitespace-nowrap">
                        <div>{collectFormLabel(r.paymentTerm)}</div>
                        {r.onCredit ? <div className="text-[11px] font-medium text-amber-700">Công nợ</div> : null}
                      </td>
                      <td className="px-2 py-2 align-top">
                        <div>{payerName(r) || "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {payerPhone(r)} · {r.payer === "SENDER" ? "người gửi" : "người nhận"}
                        </div>
                      </td>
                      <td className="px-2 py-2 align-top text-xs">
                        {r.fromOfficeName || "—"} → {r.toOfficeName || "—"}
                      </td>
                      <td className="px-2 py-2 align-top text-right tabular-nums">{money(r.invoiceAmount)}</td>
                      <td className="px-2 py-2 align-top">
                        <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", label.cls)}>
                          {label.text}
                        </span>
                        {r.late ? (
                          <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                            Muộn
                          </span>
                        ) : null}
                        {r.invoiceRequested && st === "NOT_ISSUED" ? (
                          <div className="mt-0.5 text-[11px] text-sky-700">Có yêu cầu HĐ công ty</div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 align-top text-xs">
                        {r.pendingReason ? (
                          <div
                            className={cn(
                              "max-w-[280px] leading-snug",
                              needsBackfill
                                ? "font-medium text-amber-800"
                                : st === "FAILED"
                                  ? "text-red-700"
                                  : "text-muted-foreground",
                            )}
                          >
                            {r.pendingReason}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 align-top whitespace-nowrap text-xs">
                        <div>{r.invoiceNo || "—"}</div>
                        {r.invoiceIssuedAt ? (
                          <div className="text-muted-foreground">{dt(r.invoiceIssuedAt)}</div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 align-top text-xs">
                        <div>{r.invoiceCompanyName || "—"}</div>
                        <div className="text-muted-foreground">{r.invoiceTaxCode}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <TablePagination pager={pager} />
      </section>
    </div>
  );
}
