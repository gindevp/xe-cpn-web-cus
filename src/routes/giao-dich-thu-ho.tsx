import { Link, createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { M3Page } from "@/components/M3Page";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TablePagination } from "@/components/TablePagination";
import { ExportFormatButton } from "@/components/ExportFormatButton";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { downloadExcel, type ExportFormat } from "@/lib/csv";
import { formatVND } from "@/lib/mock-data";
import { isApiEnabled } from "@/lib/api/client";
import {
  listCollectionTransactions,
  type CollectionTransactionRow,
} from "@/lib/api/finance-config-api";
import { useServerPagedRows } from "@/lib/use-server-paged-rows";
import { toast } from "sonner";

export const Route = createFileRoute("/giao-dich-thu-ho")({
  head: () => ({
    meta: [
      { title: "Giao dịch thu hộ — X.E" },
      {
        name: "description",
        content:
          "Đối soát giao dịch tiền về từ OnePay / BIDV: mã GD, thu hộ, loại (đơn / phiếu thu), số tiền.",
      },
    ],
  }),
  component: () => (
    <ProtectedPage title="Giao dịch thu hộ" screen="giao-dich-thu-ho" hidePageTitle>
      <M3Page>
        <Page />
      </M3Page>
    </ProtectedPage>
  ),
});

const VN_TZ = "Asia/Ho_Chi_Minh";

function isoDay(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: VN_TZ });
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDay(d);
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleString("vi-VN", { hour12: false, timeZone: VN_TZ });
}

function fmtTransDate(raw?: string | null) {
  if (!raw?.trim()) return "—";
  const s = raw.trim();
  if (/^\d{14}$/.test(s)) {
    const y = s.slice(0, 4);
    const m = s.slice(4, 6);
    const d = s.slice(6, 8);
    const hh = s.slice(8, 10);
    const mm = s.slice(10, 12);
    const ss = s.slice(12, 14);
    return `${d}/${m}/${y} ${hh}:${mm}:${ss}`;
  }
  return s;
}

const PROVIDER_OPTIONS = [
  { value: "all", label: "Tất cả" },
  { value: "ONEPAY", label: "OnePay" },
  { value: "BIDV", label: "BIDV" },
];

const TARGET_OPTIONS = [
  { value: "all", label: "Tất cả" },
  { value: "ORDER", label: "Thu tiền đơn" },
  { value: "RECEIPT", label: "Nộp tiền phiếu" },
  { value: "TEST", label: "Test" },
];

function providerTagClass(provider: string) {
  if (provider === "ONEPAY") return "tag info";
  if (provider === "BIDV") return "tag ok";
  return "tag";
}

/** Minh họa ví tiền — design GiaoDichThuHo `.rev-ill`. */
function WalletIll() {
  return (
    <svg className="rev-ill" viewBox="0 0 150 104" aria-hidden="true">
      <ellipse className="ill-soft" cx="75" cy="97" rx="68" ry="6" />
      <rect className="ill-main" x="50" y="4" width="50" height="92" rx="8" />
      <rect className="ill-paper" x="55" y="13" width="40" height="72" rx="3" />
      <rect className="ill-main" x="60" y="24" width="11" height="11" rx="2" />
      <rect className="ill-main" x="79" y="24" width="11" height="11" rx="2" />
      <rect className="ill-main" x="60" y="43" width="11" height="11" rx="2" />
      <path className="ill-main" d="M79 43h4v4h-4zM86 43h4v8h-4zM79 50h4v4h-4zM84 54h6v-1h-6z" />
      <rect className="ill-mid" x="60" y="64" width="30" height="5" rx="2.5" />
      <rect className="ill-mid" x="60" y="73" width="20" height="5" rx="2.5" />
      <circle className="ill-box" cx="124" cy="68" r="15" />
      <circle className="ill-box2" cx="124" cy="68" r="9" />
      <path className="ill-handle thin" d="M18 44c6-12 16-16 26-14M38 22l7 8-9 5" />
      <path className="ill-handle thin" d="M108 42c6-3 12-3 18 2" />
    </svg>
  );
}

function Page() {
  const today = useMemo(() => isoDay(new Date()), []);
  const [from, setFrom] = useState(() => daysAgo(30));
  const [to, setTo] = useState(today);
  const [provider, setProvider] = useState("all");
  const [targetType, setTargetType] = useState("all");
  const [q, setQ] = useState("");
  const [qApplied, setQApplied] = useState("");

  const filterKey = `${from}|${to}|${provider}|${targetType}|${qApplied}`;
  const apiOn = isApiEnabled();

  const fetchPage = useCallback(
    async (page: number, size: number) => {
      const res = await listCollectionTransactions({
        page,
        size,
        from: from || undefined,
        to: to || undefined,
        provider: provider === "all" ? undefined : provider,
        targetType: targetType === "all" ? undefined : targetType,
        q: qApplied || undefined,
      });
      return {
        rows: res.content ?? [],
        total: res.totalElements ?? 0,
        meta: { totalAmount: Number(res.totalAmount ?? 0) },
      };
    },
    [from, to, provider, targetType, qApplied],
  );

  const server = useServerPagedRows<CollectionTransactionRow, { totalAmount: number }>(
    "giao-dich-thu-ho",
    filterKey,
    fetchPage,
    apiOn,
  );

  const applySearch = () => setQApplied(q.trim());

  const exportExcel = async (format: ExportFormat = "csv") => {
    if (!apiOn) {
      toast.message("Cần kết nối API");
      return;
    }
    try {
      const res = await listCollectionTransactions({
        page: 0,
        size: 500,
        from: from || undefined,
        to: to || undefined,
        provider: provider === "all" ? undefined : provider,
        targetType: targetType === "all" ? undefined : targetType,
        q: qApplied || undefined,
      });
      const rows = res.content ?? [];
      if (!rows.length) {
        toast.message("Không có dữ liệu để xuất");
        return;
      }
      const headers = [
        "STT",
        "Thu hộ",
        "Loại",
        "Mã đơn / phiếu",
        "Kênh nộp tiền",
        "Nội dung CK",
        "Mã GD",
        "Số tiền",
        "Thời gian GD NH",
        "Ghi nhận",
        "Chủ TK VA",
        "TK ảo",
        "Ngân hàng",
        "Mã HĐ OnePay",
      ];
      const data = rows.map((r, i) => [
        i + 1,
        r.providerLabel || r.provider,
        r.targetTypeLabel || r.targetType,
        r.refCode ?? "",
        r.payChannel ?? "",
        r.description ?? "",
        r.transId,
        Number(r.amount ?? 0),
        fmtTransDate(r.transDate),
        fmtDateTime(r.createdAt),
        r.payerName ?? "",
        r.accountNumber ?? "",
        r.bankName ?? "",
        r.invoiceReference ?? "",
      ]);
      data.push([
        "",
        "Tổng",
        "",
        "",
        "",
        "",
        "",
        Number(res.totalAmount ?? 0),
        "",
        "",
        "",
        "",
        "",
        "",
      ]);
      downloadExcel(`giao-dich-thu-ho-${from || "all"}_${to || "all"}`, headers, data, format);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Xuất Excel thất bại");
    }
  };

  const totalAmount = server.meta?.totalAmount ?? 0;
  const rows = server.pageRows;
  const sumText = formatVND(totalAmount)
    .replace(/\s*₫?$/, "")
    .trim();

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="title-row">
        <div>
          <h1 className="page-title">Giao dịch thu hộ</h1>
          <div className="lab muted">Tiền về từ OnePay / BIDV, ghi rõ bên thu hộ để đối soát.</div>
        </div>
        <ExportFormatButton
          className="btn tonal"
          variant="ghost"
          disabled={!apiOn || server.total === 0}
          onExport={exportExcel}
        />
      </div>

      <section className="sum-row num">
        <div className="sum-lead">
          <div style={{ minWidth: 0 }}>
            <div className="rev-vp lab">
              <span className="ms fill" aria-hidden="true">
                account_balance_wallet
              </span>
              Tổng tiền thu hộ
            </div>
            <div className="sum-hero">
              {server.loading && !rows.length ? "…" : sumText} <span className="sum-unit">VNĐ</span>
            </div>
          </div>
          <WalletIll />
        </div>
        <div className="rev-tile card-tile">
          <span className="rev-ic" aria-hidden="true">
            <span className="ms fill">swap_horiz</span>
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="small muted">Số giao dịch</div>
            <div className="sum-val">
              {server.loading ? "…" : server.total.toLocaleString("vi-VN")}
            </div>
          </div>
        </div>
      </section>

      <div className="filter-grid">
        <label className="field">
          <span className="l">Từ ngày</span>
          <span className="box input-box">
            <input
              type="date"
              className="num"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </span>
        </label>
        <label className="field">
          <span className="l">Đến ngày</span>
          <span className="box input-box">
            <input
              type="date"
              className="num"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </span>
        </label>
        <div className="field">
          <span className="l">Thu hộ</span>
          <SearchableSelect
            value={provider}
            onValueChange={setProvider}
            options={PROVIDER_OPTIONS}
            placeholder="Tất cả"
          />
        </div>
        <div className="field">
          <span className="l">Loại</span>
          <SearchableSelect
            value={targetType}
            onValueChange={setTargetType}
            options={TARGET_OPTIONS}
            placeholder="Tất cả"
          />
        </div>
        <label className="field gd-q">
          <span className="l">Tìm mã GD / đơn / phiếu / nội dung</span>
          <span className="box input-box">
            <input
              type="search"
              placeholder="Nhập từ khoá"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applySearch();
              }}
              onBlur={applySearch}
            />
          </span>
        </label>
      </div>

      {server.error ? (
        <div className="note" role="alert" style={{ color: "var(--error)" }}>
          {server.error}
        </div>
      ) : null}

      <section className="card stack">
        <h2 className="group-title sec-title num">
          <span className="sec-ic" aria-hidden="true">
            <span className="ms">receipt_long</span>
          </span>
          <span>Danh sách giao dịch ({server.total.toLocaleString("vi-VN")})</span>
        </h2>

        {!apiOn ? (
          <div className="empty">
            <h3 className="group-title">Bật API để xem giao dịch thu hộ</h3>
          </div>
        ) : server.loading && !rows.length ? (
          <div className="empty">
            <h3 className="group-title">Đang tải…</h3>
          </div>
        ) : !rows.length ? (
          <div className="empty">
            <h3 className="group-title">Không có giao dịch phù hợp</h3>
          </div>
        ) : (
          <div className="stack">
            <div className="scroller">
              <table className="tbl compact sticky-1" style={{ ["--tbl-min" as string]: "1100px" }}>
                <thead>
                  <tr>
                    <th>Thu hộ</th>
                    <th>Loại</th>
                    <th>Mã đơn / phiếu</th>
                    <th>Kênh nộp tiền</th>
                    <th>Nội dung CK</th>
                    <th>Mã GD</th>
                    <th className="r">Số tiền</th>
                    <th>Thời gian GD</th>
                    <th>TK ảo</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className={providerTagClass(r.provider)}>
                          {r.providerLabel || r.provider}
                        </span>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{r.targetTypeLabel || r.targetType}</td>
                      <td>
                        {r.refCode ? (
                          r.targetType === "RECEIPT" ? (
                            <Link
                              to="/danh-sach-phieu-thu"
                              search={{ code: r.refCode }}
                              className="code"
                            >
                              {r.refCode}
                            </Link>
                          ) : (
                            <OrderCodeLink code={r.refCode} className="code" />
                          )
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{r.payChannel?.trim() || "—"}</td>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>
                        {r.description?.trim() || "—"}
                      </td>
                      <td className="num" style={{ whiteSpace: "nowrap" }}>
                        {r.transId}
                      </td>
                      <td className="r main">{formatVND(Number(r.amount ?? 0))}</td>
                      <td className="num" style={{ whiteSpace: "nowrap" }}>
                        <div>{fmtTransDate(r.transDate)}</div>
                        <div className="muted" style={{ fontSize: 11 }}>
                          {fmtDateTime(r.createdAt)}
                        </div>
                      </td>
                      <td className="num" style={{ whiteSpace: "nowrap" }}>
                        <div>{r.accountNumber || "—"}</div>
                        {r.bankName ? <div className="muted">{r.bankName}</div> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination pager={server.pager} />
          </div>
        )}
      </section>
    </div>
  );
}
