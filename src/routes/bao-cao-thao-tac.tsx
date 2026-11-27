import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { usePagedRows } from "@/lib/use-paged-rows";
import { TablePagination } from "@/components/TablePagination";
import { ProtectedPage } from "@/components/AppShell";
import { M3Page } from "@/components/M3Page";
import { EmptyState, Section } from "@/components/PageBits";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useStore } from "@/lib/store";
import { ExportFormatButton } from "@/components/ExportFormatButton";
import { downloadExcelSheets, type ExportFormat } from "@/lib/csv";
import {
  countsTotal,
  getDispatcherOpsReport,
  type DispatcherOpsDayCounts,
  type DispatcherOpsReport,
  type DispatcherOpsStaff,
  type DispatcherOpsStaffRow,
} from "@/lib/api/dispatcher-ops-api";
import { toast } from "sonner";

export const Route = createFileRoute("/bao-cao-thao-tac")({
  head: () => ({
    meta: [
      { title: "Báo cáo thao tác — X.E" },
      {
        name: "description",
        content:
          "Đếm thao tác điều phối theo ngày (nhập kho, lên/xuống hàng, bàn giao…) để tính lương theo thao tác.",
      },
    ],
  }),
  component: () => (
    <ProtectedPage title="Báo cáo thao tác" screen="bao-cao-thao-tac" hidePageTitle>
      <M3Page>
        <Page />
      </M3Page>
    </ProtectedPage>
  ),
});

const VN_TZ = "Asia/Ho_Chi_Minh";
const ALL = "";

type Tab = "TONG" | "NGAY" | "ACTION";

const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: VN_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function todayVn() {
  return dayFmt.format(new Date());
}

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

function viDay(day: string) {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

function staffName(s: DispatcherOpsStaff) {
  return s.displayName?.trim() || s.login;
}

function fmtN(n: number) {
  return (n ?? 0).toLocaleString("vi-VN", { maximumFractionDigits: 1 });
}

function emptyCounts(): DispatcherOpsDayCounts {
  return {
    nhanHang: 0,
    xepXe: 0,
    lenHang: 0,
    lenHangKg: 0,
    xuongHang: 0,
    xuongHangKien: 0,
    xuongHangKg: 0,
    dieuPhoiGiao: 0,
    ngoaiLe: 0,
    suaIn: 0,
  };
}

const COLS: { key: keyof DispatcherOpsDayCounts; label: string; hint: string }[] = [
  { key: "nhanHang", label: "Nhận hàng", hint: "Tạo / nhập kho gửi / lấy hàng" },
  { key: "xepXe", label: "Xếp xe", hint: "Gán / chuyển xe" },
  { key: "lenHang", label: "Lên hàng", hint: "Quét lên / gỡ / unload" },
  { key: "lenHangKg", label: "KL lên (kg)", hint: "Tổng cân nặng các đơn lên hàng" },
  { key: "xuongHang", label: "Xuống hàng", hint: "Quét nhập đủ kiện (theo đơn)" },
  { key: "xuongHangKien", label: "Ước tính kiện", hint: "Tổng quantity đơn xuống hàng" },
  { key: "xuongHangKg", label: "KL xuống (kg)", hint: "Tổng cân nặng các đơn xuống hàng" },
  {
    key: "dieuPhoiGiao",
    label: "Điều phối giao",
    hint: "Giao tại quầy / shipper nhận việc / đặt + quét bàn giao Ahamove, Grab",
  },
  { key: "ngoaiLe", label: "Ngoại lệ", hint: "Sự cố / hoàn / yêu cầu huỷ / đổi VP nhận" },
  { key: "suaIn", label: "Sửa đơn / In tem", hint: "Sửa đơn, sửa kiện, đổi HTTT, in tem / phiếu" },
];

function Page() {
  const offices = useStore((s) => s.offices);
  const defaults = monthRange(todayVn().slice(0, 7));
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [office, setOffice] = useState(ALL);
  const [login, setLogin] = useState(ALL);
  const [tab, setTab] = useState<Tab>("TONG");
  const [data, setData] = useState<DispatcherOpsReport | null>(null);
  const [loaded, setLoaded] = useState<{ from: string; to: string; office: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // NV lọc client-side; ngày/VP đổi → gọi API luôn (debounce nhẹ khi gõ ngày).
  useEffect(() => {
    if (!from || !to) return;
    if (to < from) {
      toast.error("Khoảng ngày không hợp lệ");
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const report = await getDispatcherOpsReport({
          from,
          to,
          officeCode: office || undefined,
        });
        if (cancelled) return;
        setData(report);
        setLoaded({ from, to, office });
      } catch (e) {
        if (cancelled) return;
        toast.error(e instanceof Error ? e.message : "Không tải được báo cáo thao tác");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [from, to, office]);

  const staffOptions = useMemo(
    () => [
      { value: ALL, label: "Tất cả nhân viên" },
      ...(data?.staff ?? []).map((r) => ({
        value: r.staff.login.toLowerCase(),
        label: `${staffName(r.staff)} (${r.staff.login})${r.staff.officeName ? ` — ${r.staff.officeName}` : ""}`,
      })),
    ],
    [data],
  );

  const viewStaff: DispatcherOpsStaffRow[] = useMemo(() => {
    if (!data) return [];
    if (!login) return data.staff;
    return data.staff.filter((r) => r.staff.login.toLowerCase() === login);
  }, [data, login]);

  const dayRows = useMemo(() => {
    const out: { staff: DispatcherOpsStaff; day: string; counts: DispatcherOpsDayCounts }[] = [];
    for (const r of viewStaff) {
      for (const d of r.days) {
        out.push({ staff: r.staff, day: d.day, counts: d.counts });
      }
    }
    out.sort((a, b) => a.day.localeCompare(b.day) || a.staff.login.localeCompare(b.staff.login));
    return out;
  }, [viewStaff]);

  const actionRows = useMemo(() => {
    if (!data) return [];
    const set = login ? new Set([login]) : null;
    return data.actions.filter((a) => !set || set.has(a.login.toLowerCase()));
  }, [data, login]);

  const grand = useMemo(() => {
    return viewStaff.reduce((acc, r) => {
      const t = r.totals ?? emptyCounts();
      const next = { ...acc };
      for (const c of COLS) next[c.key] = (acc[c.key] ?? 0) + (t[c.key] ?? 0);
      return next;
    }, emptyCounts());
  }, [viewStaff]);

  const tongPage = usePagedRows(viewStaff, "bao-cao-thao-tac.tong");
  const ngayPage = usePagedRows(dayRows, "bao-cao-thao-tac.ngay");
  const actionPage = usePagedRows(actionRows, "bao-cao-thao-tac.action");

  const exportExcel = (format: ExportFormat = "csv") => {
    if (!data || !loaded) return;
    const scope = login || loaded.office || "toan-he-thong";
    downloadExcelSheets(
      `thao-tac-dp_${scope}_${loaded.from}_${loaded.to}`,
      [
        {
          name: "Tổng NV",
          headers: [
            "STT",
            "Mã NV",
            "Tài khoản",
            "Họ tên",
            "Văn phòng",
            ...COLS.map((c) => c.label),
            "Tổng (đơn)",
          ],
          rows: viewStaff.map((r, i) => [
            i + 1,
            r.staff.staffCode ?? "",
            r.staff.login,
            staffName(r.staff),
            r.staff.officeName ?? r.staff.officeCode ?? "",
            ...COLS.map((c) => r.totals[c.key] ?? 0),
            countsTotal(r.totals),
          ]),
        },
        {
          name: "Theo ngày",
          headers: [
            "STT",
            "Ngày",
            "Mã NV",
            "Tài khoản",
            "Họ tên",
            "Văn phòng",
            ...COLS.map((c) => c.label),
            "Tổng (đơn)",
          ],
          rows: dayRows.map((r, i) => [
            i + 1,
            viDay(r.day),
            r.staff.staffCode ?? "",
            r.staff.login,
            staffName(r.staff),
            r.staff.officeName ?? r.staff.officeCode ?? "",
            ...COLS.map((c) => r.counts[c.key] ?? 0),
            countsTotal(r.counts),
          ]),
        },
        {
          name: "Chi tiết action",
          headers: ["STT", "Ngày", "Tài khoản", "Bucket", "Action", "Số đơn", "Số event"],
          rows: actionRows.map((a, i) => [
            i + 1,
            viDay(a.day),
            a.login,
            a.bucket,
            a.action,
            a.distinctOrders,
            a.eventCount,
          ]),
        },
      ],
      format,
    );
    toast.success("Đã xuất file");
  };

  return (
    <div className="space-y-4">
      <Section title="Báo cáo thao tác điều phối">
        <p className="mb-3 text-sm text-muted-foreground leading-relaxed">
          Đếm từ lịch sử đơn (<code>order_event</code>, giờ VN). Mỗi ô = số đơn distinct / người / ngày trong
          bucket — dùng tính lương theo thao tác (chưa gắn đơn giá).
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>Từ ngày</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" />
          </div>
          <div className="space-y-1">
            <Label>Đến ngày</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" />
          </div>
          <div className="space-y-1 min-w-[180px]">
            <Label>Văn phòng</Label>
            <SearchableSelect
              value={office}
              onValueChange={setOffice}
              options={[
                { value: ALL, label: "Tất cả VP" },
                ...offices.map((o) => ({ value: o.code, label: `${o.code} — ${o.name}` })),
              ]}
            />
          </div>
          <div className="space-y-1 min-w-[220px]">
            <Label>Nhân viên</Label>
            <SearchableSelect value={login} onValueChange={setLogin} options={staffOptions} />
          </div>
          <ExportFormatButton disabled={!data || !viewStaff.length || loading} onExport={exportExcel} />
          {loading ? <span className="text-xs text-muted-foreground pb-2">Đang tải…</span> : null}
        </div>

        <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
          <b>Nhận hàng</b> gồm tạo đơn / xác nhận / nhập kho gửi / bắt đầu lấy. <b>Xuống hàng</b> đếm theo đơn
          (app chỉ ghi event khi quét đủ kiện); cột kiện = tổng số kiện trên đơn. <b>KL lên / KL xuống</b> = tổng
          cân nặng ghi trên đơn. <b>Ngoại lệ</b> chỉ gồm sự cố / hoàn / yêu cầu huỷ / đổi VP nhận; sửa đơn và in
          tem tách sang cột riêng. Không gồm POD shipper, Auto Call, hoá đơn.
        </p>
      </Section>

      {data && loaded && (
        <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
          {COLS.map((c) => (
            <div key={c.key} className="rounded-xl border bg-card px-3 py-2" title={c.hint}>
              <div className="text-[11px] text-muted-foreground truncate">{c.label}</div>
              <div className="text-lg font-semibold tabular-nums">{fmtN(grand[c.key])}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 border-b">
        {(
          [
            ["TONG", "Tổng theo NV"],
            ["NGAY", "Theo ngày"],
            ["ACTION", "Chi tiết action"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${
              tab === k ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {!data && !loading && <EmptyState>Chọn khoảng ngày để xem thao tác.</EmptyState>}

      {tab === "TONG" && (
        <div className="rounded-xl border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left p-2 w-10">#</th>
                <th className="text-left p-2">Nhân viên</th>
                <th className="text-left p-2">VP</th>
                {COLS.map((c) => (
                  <th key={c.key} className="text-right p-2 whitespace-nowrap" title={c.hint}>
                    {c.label}
                  </th>
                ))}
                <th className="text-right p-2">Tổng</th>
              </tr>
            </thead>
            <tbody>
              {tongPage.pageRows.map((r, i) => (
                <tr key={r.staff.login} className="border-t">
                  <td className="p-2 text-muted-foreground">{tongPage.pager.start + i + 1}</td>
                  <td className="p-2">
                    <div className="font-medium">{staffName(r.staff)}</div>
                    <div className="text-xs text-muted-foreground">{r.staff.login}</div>
                  </td>
                  <td className="p-2 text-muted-foreground">{r.staff.officeCode ?? "—"}</td>
                  {COLS.map((c) => (
                    <td key={c.key} className="p-2 text-right tabular-nums">
                      {fmtN(r.totals[c.key] ?? 0)}
                    </td>
                  ))}
                  <td className="p-2 text-right font-medium tabular-nums">{fmtN(countsTotal(r.totals))}</td>
                </tr>
              ))}
              {!tongPage.pageRows.length && (
                <tr>
                  <td colSpan={3 + COLS.length + 1} className="p-6 text-center text-muted-foreground">
                    {loading ? "Đang tải…" : "Không có thao tác trong kỳ."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <TablePagination pager={tongPage.pager} />
        </div>
      )}

      {tab === "NGAY" && (
        <div className="rounded-xl border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left p-2">Ngày</th>
                <th className="text-left p-2">Nhân viên</th>
                {COLS.map((c) => (
                  <th key={c.key} className="text-right p-2 whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
                <th className="text-right p-2">Tổng</th>
              </tr>
            </thead>
            <tbody>
              {ngayPage.pageRows.map((r) => (
                <tr key={`${r.staff.login}-${r.day}`} className="border-t">
                  <td className="p-2 whitespace-nowrap">{viDay(r.day)}</td>
                  <td className="p-2">
                    {staffName(r.staff)}{" "}
                    <span className="text-xs text-muted-foreground">({r.staff.login})</span>
                  </td>
                  {COLS.map((c) => (
                    <td key={c.key} className="p-2 text-right tabular-nums">
                      {fmtN(r.counts[c.key] ?? 0)}
                    </td>
                  ))}
                  <td className="p-2 text-right font-medium tabular-nums">{fmtN(countsTotal(r.counts))}</td>
                </tr>
              ))}
              {!ngayPage.pageRows.length && (
                <tr>
                  <td colSpan={2 + COLS.length + 1} className="p-6 text-center text-muted-foreground">
                    {loading ? "Đang tải…" : "Không có dòng theo ngày."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <TablePagination pager={ngayPage.pager} />
        </div>
      )}

      {tab === "ACTION" && (
        <div className="rounded-xl border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left p-2">Ngày</th>
                <th className="text-left p-2">TK</th>
                <th className="text-left p-2">Bucket</th>
                <th className="text-left p-2">Action</th>
                <th className="text-right p-2">Đơn</th>
                <th className="text-right p-2">Event</th>
              </tr>
            </thead>
            <tbody>
              {actionPage.pageRows.map((a, i) => (
                <tr key={`${a.login}-${a.day}-${a.action}-${i}`} className="border-t">
                  <td className="p-2 whitespace-nowrap">{viDay(a.day)}</td>
                  <td className="p-2">{a.login}</td>
                  <td className="p-2 text-muted-foreground">{a.bucket}</td>
                  <td className="p-2 font-mono text-xs">{a.action}</td>
                  <td className="p-2 text-right tabular-nums">{fmtN(a.distinctOrders)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtN(a.eventCount)}</td>
                </tr>
              ))}
              {!actionPage.pageRows.length && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    {loading ? "Đang tải…" : "Không có chi tiết action."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <TablePagination pager={actionPage.pager} />
        </div>
      )}
    </div>
  );
}
