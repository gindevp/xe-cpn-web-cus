import { Link, createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { M3Page } from "@/components/M3Page";
import { EmptyState, Section } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { cn } from "@/lib/utils";
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
    <ProtectedPage title="Giao dịch thu hộ" screen="giao-dich-thu-ho">
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
  // OnePay/BIDV thường yyyyMMddHHmmss
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
  { value: "all", label: "Tất cả thu hộ" },
  { value: "ONEPAY", label: "OnePay" },
  { value: "BIDV", label: "BIDV" },
];

const TARGET_OPTIONS = [
  { value: "all", label: "Tất cả loại" },
  { value: "ORDER", label: "Thu cước đơn" },
  { value: "RECEIPT", label: "Thu phiếu thu" },
  { value: "TEST", label: "Test" },
];

function providerBadgeClass(provider: string) {
  if (provider === "ONEPAY") return "bg-sky-100 text-sky-800 border-sky-200";
  if (provider === "BIDV") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  return "bg-muted text-muted-foreground border-border";
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
      downloadExcel(
        `giao-dich-thu-ho-${from || "all"}_${to || "all"}`,
        headers,
        data,
        format,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Xuất Excel thất bại");
    }
  };

  const totalAmount = server.meta?.totalAmount ?? 0;
  const rows = server.pageRows;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Giao dịch thu hộ</h1>
            <p className="text-xs text-muted-foreground">
              Tiền về từ OnePay / BIDV — ghi rõ bên thu hộ để đối soát.
            </p>
          </div>
          <ExportFormatButton
            variant="outline"
            disabled={!apiOn || server.total === 0}
            onExport={exportExcel}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1">
            <Label className="text-xs">Từ ngày</Label>
            <Input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Đến ngày</Label>
            <Input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Thu hộ</Label>
            <SearchableSelect
              value={provider}
              onValueChange={setProvider}
              options={PROVIDER_OPTIONS}
              placeholder="Tất cả thu hộ"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Loại</Label>
            <SearchableSelect
              value={targetType}
              onValueChange={setTargetType}
              options={TARGET_OPTIONS}
              placeholder="Tất cả loại"
            />
          </div>
          <div className="space-y-1 lg:col-span-2">
            <Label className="text-xs">Tìm mã GD / đơn / phiếu / nội dung CK</Label>
            <div className="flex gap-2">
              <Input
                value={q}
                placeholder="VD: mã GD, CPN…, PT…"
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applySearch();
                }}
              />
              <Button type="button" variant="secondary" onClick={applySearch}>
                Tìm
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            {server.loading ? "Đang tải…" : `${server.total} giao dịch`}
          </span>
          <span className="font-medium">
            Tổng tiền: <span className="text-emerald-700">{formatVND(totalAmount)} đ</span>
          </span>
          {server.error ? <span className="text-destructive">{server.error}</span> : null}
        </div>
      </div>

      <Section title="Danh sách giao dịch">
        {!apiOn ? (
          <EmptyState>Bật API để xem giao dịch thu hộ.</EmptyState>
        ) : server.loading && !rows.length ? (
          <EmptyState>Đang tải…</EmptyState>
        ) : !rows.length ? (
          <EmptyState>Không có giao dịch trong bộ lọc.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Thu hộ</th>
                  <th className="px-2 py-2 font-medium">Loại</th>
                  <th className="px-2 py-2 font-medium">Mã đơn / phiếu</th>
                  <th className="px-2 py-2 font-medium">Kênh nộp tiền</th>
                  <th className="px-2 py-2 font-medium">Nội dung CK</th>
                  <th className="px-2 py-2 font-medium">Mã GD</th>
                  <th className="px-2 py-2 font-medium text-right">Số tiền</th>
                  <th className="px-2 py-2 font-medium">Thời gian GD</th>
                  <th className="px-2 py-2 font-medium">TK ảo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b align-top hover:bg-muted/20">
                    <td className="px-2 py-2">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold",
                          providerBadgeClass(r.provider),
                        )}
                      >
                        {r.providerLabel || r.provider}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-xs">{r.targetTypeLabel || r.targetType}</td>
                    <td className="px-2 py-2 font-mono text-xs">
                      {r.refCode ? (
                        r.targetType === "RECEIPT" ? (
                          <Link
                            to="/danh-sach-phieu-thu"
                            search={{ code: r.refCode }}
                            className="text-sky-700 underline-offset-2 hover:underline"
                          >
                            {r.refCode}
                          </Link>
                        ) : (
                          <OrderCodeLink code={r.refCode} />
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs whitespace-nowrap">
                      {r.payChannel?.trim() || "—"}
                    </td>
                    <td className="px-2 py-2 text-xs max-w-[160px] break-words">
                      {r.description?.trim() || "—"}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs break-all">{r.transId}</td>
                    <td className="px-2 py-2 text-right font-medium tabular-nums">
                      {formatVND(Number(r.amount ?? 0))}
                    </td>
                    <td className="px-2 py-2 text-xs whitespace-nowrap">
                      <div>{fmtTransDate(r.transDate)}</div>
                      <div className="text-muted-foreground">{fmtDateTime(r.createdAt)}</div>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">
                      <div>{r.accountNumber || "—"}</div>
                      {r.bankName ? (
                        <div className="text-muted-foreground">{r.bankName}</div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {apiOn && server.total > 0 ? (
          <div className="mt-3">
            <TablePagination pager={server.pager} />
          </div>
        ) : null}
      </Section>
    </div>
  );
}
