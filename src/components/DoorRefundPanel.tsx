import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { OfficeRouteCell } from "@/components/OfficeRouteCell";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { usePagedRows } from "@/lib/use-paged-rows";
import { TablePagination } from "@/components/TablePagination";
import {
  fetchDoorRefundRequestHtml,
  listOrdersPage,
  markDoorRefundExported,
} from "@/lib/api/domain-api";
import { isApiEnabled } from "@/lib/api/client";
import { printHtmlDocument } from "@/lib/guest-bill-image";
import { formatVND } from "@/lib/mock-data";
import { orderTabStatusLabel } from "@/lib/customer-track-status";
import { canWrite } from "@/lib/rbac";
import { useAuth } from "@/lib/auth";
import { useStore, type OrderX } from "@/lib/store";

function isoDay(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function when(iso?: string) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Tab hoàn phí giao tận nơi trên màn Quản lý hoàn tiền. */
export function DoorRefundPanel() {
  const { session } = useAuth();
  const offices = useStore((s) => s.offices);
  const canMark = canWrite(session?.role, "quan-ly-don-cod");
  const defaults = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(1);
    return { from: isoDay(from), to: isoDay(to) };
  }, []);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [office, setOffice] = useState("");
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [tab, setTab] = useState<"pending" | "done" | "all">("pending");
  const [rows, setRows] = useState<OrderX[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(q.trim()), 400);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    if (!isApiEnabled()) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const { rows: chunk } = await listOrdersPage({
        doorRefundOnly: true,
        keyword: qDebounced || undefined,
        size: 500,
        sort: "updatedAt,desc",
      });
      setRows(chunk);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được danh sách hoàn phí");
    } finally {
      setLoading(false);
    }
  }, [qDebounced]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const fromMs = from ? new Date(from + "T00:00:00").getTime() : 0;
    const toMs = to ? new Date(to + "T23:59:59").getTime() : Number.POSITIVE_INFINITY;
    return rows.filter((o) => {
      if (office && o.fromOffice !== office) return false;
      const at = o.doorCancelAt ? new Date(o.doorCancelAt).getTime() : 0;
      if (at && (at < fromMs || at > toMs)) return false;
      if (tab === "pending" && o.doorRefundExportedAt) return false;
      if (tab === "done" && !o.doorRefundExportedAt) return false;
      return true;
    });
  }, [rows, office, from, to, tab]);

  const pendingSum = rows.filter((o) => !o.doorRefundExportedAt).reduce((s, o) => s + (o.doorFeeRefund ?? 0), 0);
  const doneSum = rows.filter((o) => o.doorRefundExportedAt).reduce((s, o) => s + (o.doorFeeRefund ?? 0), 0);
  const { pageRows, pager } = usePagedRows(shown, "hoan-phi-giao");

  const confirm = async (code: string) => {
    setBusy(code);
    try {
      await markDoorRefundExported([code]);
      toast.success("Đã xác nhận hoàn phí");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không xác nhận được");
    } finally {
      setBusy(null);
    }
  };

  const printReq = async (code: string) => {
    setBusy(code);
    try {
      await printHtmlDocument(await fetchDoorRefundRequestHtml(code));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không in được đề nghị thanh toán");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="sum-row tiles num">
        <div className="sum-lead">
          <div>
            <div className="lab">Phí giao tận nơi chờ hoàn</div>
            <div className="sum-hero">{formatVND(pendingSum)}</div>
            <div className="muted">{rows.filter((o) => !o.doorRefundExportedAt).length} đơn đã huỷ giao tận nơi, người gửi đã trả phí</div>
          </div>
        </div>
        <div className="rev-tile">
          <div className="lab">Đã hoàn</div>
          <div className="sum-val">{formatVND(doneSum)}</div>
        </div>
        <div className="rev-tile">
          <div className="lab">Đơn huỷ giao tận nơi</div>
          <div className="sum-val">{rows.length} đơn</div>
        </div>
      </section>

      <div className="filters" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
        <label className="field" style={{ flex: "1 1 220px" }}>
          <span className="l">Tìm kiếm</span>
          <span className="box input-box">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mã đơn, tên KH, SĐT" />
          </span>
        </label>
        <label className="field" style={{ flex: "0 0 200px" }}>
          <span className="l">VP gửi</span>
          <SearchableSelect
            value={office || "all"}
            onValueChange={(v) => setOffice(v === "all" ? "" : v)}
            options={[{ value: "all", label: "Tất cả" }, ...offices.map((o) => ({ value: o.code, label: o.name }))]}
          />
        </label>
        <label className="field" style={{ flex: "0 0 160px" }}>
          <span className="l">Huỷ từ ngày</span>
          <span className="box input-box">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </span>
        </label>
        <label className="field" style={{ flex: "0 0 160px" }}>
          <span className="l">Đến ngày</span>
          <span className="box input-box">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </span>
        </label>
      </div>

      <div className="seg" role="tablist">
        {(
          [
            ["pending", `Chờ hoàn (${rows.filter((o) => !o.doorRefundExportedAt).length})`],
            ["done", `Đã hoàn (${rows.filter((o) => o.doorRefundExportedAt).length})`],
            ["all", `Tất cả (${rows.length})`],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      <section className="card" style={{ overflow: "auto" }}>
        {loading ? <div className="empty">Đang tải…</div> : null}
        {!loading && pageRows.length === 0 ? <div className="empty">Không có đơn hoàn phí giao tận nơi</div> : null}
        {pageRows.length > 0 ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Người gửi</th>
                <th>VP gửi – VP nhận</th>
                <th>Huỷ lúc</th>
                <th>Lý do</th>
                <th>Phí hoàn</th>
                <th>Hoàn cho người gửi</th>
                <th>Trạng thái</th>
                <th>Xử lý</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((o) => (
                <tr key={o.code}>
                  <td>
                    <OrderCodeLink code={o.code} />
                    <div className="muted">{orderTabStatusLabel(o)}</div>
                  </td>
                  <td>
                    {o.senderName || "—"}
                    <div className="muted">{o.senderPhone}</div>
                  </td>
                  <td>
                    <OfficeRouteCell fromOffice={o.fromOffice} toOffice={o.finalToOffice || o.toOffice} />
                  </td>
                  <td>{when(o.doorCancelAt)}</td>
                  <td>{o.doorCancelReason || "—"}</td>
                  <td className="num">{formatVND(o.doorFeeRefund ?? 0)}</td>
                  <td>
                    {[o.doorRefundBankName, o.doorRefundAccountNo, o.doorRefundAccountName].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td>{o.doorRefundExportedAt ? "Đã hoàn" : "Chờ hoàn"}</td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <button type="button" className="btn tonal" disabled={busy === o.code} onClick={() => void printReq(o.code)}>
                        ĐNTT
                      </button>
                      {!o.doorRefundExportedAt && canMark ? (
                        <button type="button" className="btn" disabled={busy === o.code} onClick={() => void confirm(o.code)}>
                          Xác nhận đã hoàn
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <TablePagination pager={pager} />
      </section>
      <p className="muted">
        Đơn vào danh sách khi điều phối huỷ giao tận nơi và người gửi đã trả đủ phí giao. Đơn chưa thu phí chỉ tắt giao tận nơi, không vào tab này.
      </p>
    </div>
  );
}
