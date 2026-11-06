import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePagedRows } from "@/lib/use-paged-rows";
import { TablePagination } from "@/components/TablePagination";
import { ProtectedPage } from "@/components/AppShell";
import { M3Page } from "@/components/M3Page";
import { EmptyState, Section } from "@/components/PageBits";
import { StageTabButton, StageTabRow } from "@/components/StageTabs";
import { Button } from "@/components/ui/button";
import { StaffInfoPopover } from "@/components/StaffInfoPopover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store";
import { ExportFormatButton } from "@/components/ExportFormatButton";
import { downloadExcelSheets, type ExportFormat } from "@/lib/csv";
import {
  getAttendancePhoto,
  getAttendanceReport,
  type AttendanceReport,
  type AttendanceReportRecord,
  type AttendanceReportStaff,
} from "@/lib/api/attendance-api";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/cham-cong")({
  head: () => ({
    meta: [
      { title: "Chấm công — X.E" },
      { name: "description", content: "Xem và xuất bảng chấm công nhân viên theo văn phòng, cá nhân hoặc toàn hệ thống." },
    ],
  }),
  component: () => (
    <ProtectedPage title="Chấm công" screen="cham-cong">
      <M3Page>
        <Page />
      </M3Page>
    </ProtectedPage>
  ),
});

const VN_TZ = "Asia/Ho_Chi_Minh";
const ALL = "";

type Tab = "BANG_CONG" | "CHI_TIET";

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: VN_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: VN_TZ, hour: "2-digit", minute: "2-digit", hour12: false });

function dayOf(iso: string) {
  return dayFmt.format(new Date(iso));
}

function timeOf(iso: string) {
  return timeFmt.format(new Date(iso));
}

function viDay(day: string) {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end && out.length < 100) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function staffName(s: AttendanceReportStaff) {
  return s.displayName?.trim() || s.login;
}

/** "07:58 - 17:30"; một lượt thì chỉ giờ đó. */
function inOut(list: AttendanceReportRecord[] | undefined) {
  if (!list?.length) return "";
  const first = timeOf(list[0].checkedAt);
  const last = timeOf(list[list.length - 1].checkedAt);
  return list.length === 1 ? first : `${first} - ${last}`;
}

function Page() {
  const offices = useStore((s) => s.offices);
  const currentMonth = dayFmt.format(new Date()).slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [from, setFrom] = useState(() => monthRange(currentMonth).from);
  const [to, setTo] = useState(() => monthRange(currentMonth).to);
  const [office, setOffice] = useState(ALL);
  const [login, setLogin] = useState(ALL);
  const [tab, setTab] = useState<Tab>("BANG_CONG");
  const [data, setData] = useState<AttendanceReport | null>(null);
  const [loaded, setLoaded] = useState<{ from: string; to: string; office: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<{ staff: AttendanceReportStaff; day: string; items: AttendanceReportRecord[] } | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!from || !to || to < from) {
      toast.error("Khoảng ngày không hợp lệ");
      return;
    }
    setLoading(true);
    try {
      setData(await getAttendanceReport({ from, to, officeCode: office || undefined }));
      setLoaded({ from, to, office });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được dữ liệu chấm công");
    } finally {
      setLoading(false);
    }
  }, [from, to, office]);

  useEffect(() => {
    void load();
    // Chỉ tải lần đầu — sau đó bấm "Xem".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const view = useMemo(() => {
    if (!data || !loaded) return null;
    const days = daysBetween(loaded.from, loaded.to);
    const byLogin = new Map<string, Map<string, AttendanceReportRecord[]>>();
    for (const r of data.records) {
      const key = r.login.toLowerCase();
      const perDay = byLogin.get(key) ?? new Map<string, AttendanceReportRecord[]>();
      const day = dayOf(r.checkedAt);
      perDay.set(day, [...(perDay.get(day) ?? []), r]);
      byLogin.set(key, perDay);
    }
    const known = new Set(data.staff.map((s) => s.login.toLowerCase()));
    const orphans: AttendanceReportStaff[] = [...byLogin.keys()]
      .filter((k) => !known.has(k))
      .map((k) => {
        const any = data.records.find((r) => r.login.toLowerCase() === k)!;
        return { login: any.login, officeCode: any.officeCode, officeName: any.officeName, active: false };
      });
    const allStaff = [...data.staff, ...orphans];
    const staff = login ? allStaff.filter((s) => s.login.toLowerCase() === login) : allStaff;
    const rows = staff.map((s) => {
      const perDay = byLogin.get(s.login.toLowerCase()) ?? new Map<string, AttendanceReportRecord[]>();
      const workDays = days.filter((d) => perDay.has(d)).length;
      const total = [...perDay.values()].reduce((n, l) => n + l.length, 0);
      return { staff: s, perDay, workDays, total };
    });
    return { days, allStaff, rows };
  }, [data, loaded, login]);

  const staffOptions = useMemo(
    () => [
      { value: ALL, label: "Tất cả nhân viên" },
      ...(view?.allStaff ?? []).map((s) => ({
        value: s.login.toLowerCase(),
        label: `${staffName(s)} (${s.login})${s.officeName ? ` — ${s.officeName}` : ""}`,
      })),
    ],
    [view],
  );

  const detailRows = useMemo(() => {
    if (!view) return [];
    const out: { staff: AttendanceReportStaff; day: string; items: AttendanceReportRecord[] }[] = [];
    for (const day of view.days) {
      for (const r of view.rows) {
        const items = r.perDay.get(day);
        if (items?.length) out.push({ staff: r.staff, day, items });
      }
    }
    return out;
  }, [view]);
  const staffPage = usePagedRows(view?.rows ?? [], "cham-cong.bang-cong");
  const detailPage = usePagedRows(detailRows, "cham-cong.chi-tiet");

  const exportExcel = (format: ExportFormat = "csv") => {
    if (!view || !loaded) return;
    const scope = login || loaded.office || "toan-he-thong";
    const dayHeaders = view.days.map((d) => d.slice(8, 10) + "/" + d.slice(5, 7));
    downloadExcelSheets(
      `cham-cong_${scope}_${loaded.from}_${loaded.to}`,
      [
      {
        name: "Bảng công",
        headers: ["STT", "Mã NV", "Tài khoản", "Họ tên", "Văn phòng", ...dayHeaders, "Số ngày công", "Tổng lượt chấm"],
        rows: view.rows.map((r, i) => [
          i + 1,
          r.staff.staffCode ?? "",
          r.staff.login,
          staffName(r.staff),
          r.staff.officeName ?? r.staff.officeCode ?? "",
          ...view.days.map((d) => inOut(r.perDay.get(d))),
          r.workDays,
          r.total,
        ]),
      },
      {
        name: "Chi tiết",
        headers: ["STT", "Ngày", "Mã NV", "Tài khoản", "Họ tên", "VP chấm", "Giờ vào", "Giờ ra", "Số lượt", "Các lượt", "IP"],
        rows: detailRows.map((d, i) => [
          i + 1,
          viDay(d.day),
          d.staff.staffCode ?? "",
          d.staff.login,
          staffName(d.staff),
          d.items[0].officeName,
          timeOf(d.items[0].checkedAt),
          d.items.length > 1 ? timeOf(d.items[d.items.length - 1].checkedAt) : "",
          d.items.length,
          d.items.map((x) => timeOf(x.checkedAt)).join(", "),
          [...new Set(d.items.map((x) => x.clientIp).filter(Boolean))].join(", "),
        ]),
      },
      ],
      format,
    );
  };

  const checkedStaff = view?.rows.filter((r) => r.total > 0).length ?? 0;
  const totalChecks = view?.rows.reduce((n, r) => n + r.total, 0) ?? 0;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <h1 className="page-title">Chấm công</h1>
      <section className="card stack">
        <div className="filter-grid">
          <label className="field">
            <span className="l">Tháng</span>
            <span className="box input-box">
              <input
                className="num"
                type="month"
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  if (e.target.value) {
                    const r = monthRange(e.target.value);
                    setFrom(r.from);
                    setTo(r.to);
                  }
                }}
              />
              <span className="ms" aria-hidden="true">
                calendar_month
              </span>
            </span>
          </label>
          <label className="field">
            <span className="l">Từ ngày</span>
            <span className="box input-box">
              <input className="num" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <span className="ms" aria-hidden="true">
                calendar_today
              </span>
            </span>
          </label>
          <label className="field">
            <span className="l">Đến ngày</span>
            <span className="box input-box">
              <input className="num" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              <span className="ms" aria-hidden="true">
                calendar_today
              </span>
            </span>
          </label>
          <div className="field">
            <span className="l">Văn phòng</span>
            <SearchableSelect
              value={office}
              onValueChange={(v) => {
                setOffice(v);
                setLogin(ALL);
              }}
              options={[
                { value: ALL, label: "Toàn hệ thống" },
                ...[...offices]
                  .sort((a, b) => a.name.localeCompare(b.name, "vi"))
                  .map((o) => ({ value: o.code, label: o.name })),
              ]}
            />
          </div>
          <div className="field">
            <span className="l">Nhân viên</span>
            <SearchableSelect value={login} onValueChange={setLogin} options={staffOptions} />
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div className="lab muted">
            {view
              ? `${view.rows.length} nhân viên · ${checkedStaff} người có chấm công · ${totalChecks} lượt chấm`
              : loading
                ? "Đang tải…"
                : "Chưa có dữ liệu"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" className="btn tonal" onClick={() => void load()} disabled={loading}>
              <span className="ms" aria-hidden="true">
                refresh
              </span>
              Xem
            </button>
            <ExportFormatButton disabled={!view || view.rows.length === 0} onExport={exportExcel} />
          </div>
        </div>
        <p className="lab muted">
          Xuất theo đúng bộ lọc đang xem: chọn văn phòng để xuất theo VP, chọn nhân viên để xuất cá nhân, để trống để
          xuất toàn hệ thống. CSV: 2 file (Bảng công + Chi tiết). Excel: 1 file .xls gồm 2 sheet.
        </p>
      </section>

      <StageTabRow className="gap-2.5 md:gap-3">
        <StageTabButton active={tab === "BANG_CONG"} onClick={() => setTab("BANG_CONG")}>
          Bảng công
        </StageTabButton>
        <StageTabButton active={tab === "CHI_TIET"} onClick={() => setTab("CHI_TIET")}>
          Chi tiết theo ngày
        </StageTabButton>
      </StageTabRow>

      {!view || view.rows.length === 0 ? (
        <Section>
          <EmptyState>{loading ? "Đang tải…" : "Không có nhân viên nào trong phạm vi lọc"}</EmptyState>
        </Section>
      ) : tab === "BANG_CONG" ? (
        <section className="card stack">
          <h2 className="group-title sec-title">
            <span className="sec-ic" aria-hidden="true">
              <span className="ms">calendar_month</span>
            </span>
            Bảng công {viDay(loaded!.from)} – {viDay(loaded!.to)}
          </h2>
          <div className="scroller">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-[200px] bg-muted px-2 py-2">Nhân viên</th>
                  <th className="px-2 py-2 text-right">Ngày công</th>
                  {view.days.map((d) => (
                    <th key={d} className="min-w-[64px] px-1 py-2 text-center">
                      {d.slice(8, 10)}/{d.slice(5, 7)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staffPage.pageRows.map((r) => (
                  <tr key={r.staff.login} className="border-b hover:bg-muted/30">
                    <td className="sticky left-0 z-10 bg-card px-2 py-1.5">
                      <div className="font-medium">
                        <StaffInfoPopover staffKey={r.staff.login}>{staffName(r.staff)}</StaffInfoPopover>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {r.staff.login}
                        {r.staff.officeName ? ` · ${r.staff.officeName}` : ""}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{r.workDays}</td>
                    {view.days.map((d) => {
                      const items = r.perDay.get(d);
                      return (
                        <td key={d} className="px-1 py-1.5 text-center tabular-nums">
                          {items ? (
                            <button
                              type="button"
                              className="rounded px-1 text-primary hover:bg-primary/10"
                              onClick={() => setDetail({ staff: r.staff, day: d, items })}
                            >
                              {inOut(items)}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination pager={staffPage.pager} />
        </section>
      ) : (
        <section className="card stack">
          <h2 className="group-title sec-title">
            <span className="sec-ic" aria-hidden="true">
              <span className="ms">list</span>
            </span>
            Chi tiết theo ngày ({detailRows.length})
          </h2>
          {detailRows.length === 0 ? (
            <EmptyState>Chưa có lượt chấm công nào</EmptyState>
          ) : (
            <div className="scroller">
              <table className="tbl" style={{ ["--tbl-min" as string]: "900px" }}>
                <thead>
                  <tr>
                    <th>Ngày</th>
                    <th>Nhân viên</th>
                    <th>VP chấm</th>
                    <th>Giờ vào</th>
                    <th>Giờ ra</th>
                    <th className="r">Số lượt</th>
                    <th className="r" />
                  </tr>
                </thead>
                <tbody>
                  {detailPage.pageRows.map((d) => (
                    <tr key={`${d.day}-${d.staff.login}`} className="border-b hover:bg-muted/40">
                      <td className="px-2 py-2 whitespace-nowrap tabular-nums">{viDay(d.day)}</td>
                      <td className="px-2 py-2">
                        <div className="font-medium">
                          <StaffInfoPopover staffKey={d.staff.login}>{staffName(d.staff)}</StaffInfoPopover>
                        </div>
                        <div className="text-[11px] text-muted-foreground">{d.staff.login}</div>
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">{d.items[0].officeName}</td>
                      <td className="px-2 py-2 tabular-nums">{timeOf(d.items[0].checkedAt)}</td>
                      <td className="px-2 py-2 tabular-nums">
                        {d.items.length > 1 ? timeOf(d.items[d.items.length - 1].checkedAt) : "—"}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{d.items.length}</td>
                      <td className="px-2 py-2 text-right">
                        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setDetail(d)}>
                          Chi tiết
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination pager={detailPage.pager} />
            </div>
          )}
        </section>
      )}

      <DetailDialog detail={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function DetailDialog({
  detail,
  onClose,
}: {
  detail: { staff: AttendanceReportStaff; day: string; items: AttendanceReportRecord[] } | null;
  onClose: () => void;
}) {
  const [photos, setPhotos] = useState<Record<number, string | null>>({});

  useEffect(() => {
    if (!detail) return;
    let alive = true;
    setPhotos({});
    for (const it of detail.items) {
      getAttendancePhoto(it.id)
        .then((r) => alive && setPhotos((p) => ({ ...p, [it.id]: r.photo })))
        .catch(() => alive && setPhotos((p) => ({ ...p, [it.id]: null })));
    }
    return () => {
      alive = false;
    };
  }, [detail]);

  return (
    <Dialog open={!!detail} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {detail ? `${staffName(detail.staff)} — ${viDay(detail.day)}` : ""}
          </DialogTitle>
          <DialogDescription>{detail ? `${detail.items.length} lượt chấm công` : ""}</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[70vh] gap-3 overflow-y-auto sm:grid-cols-2">
          {detail?.items.map((it) => {
            const photo = photos[it.id];
            return (
              <div key={it.id} className="rounded-lg border p-2">
                <div className="mb-2 flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-semibold tabular-nums">{timeOf(it.checkedAt)}</span>
                  <span className="text-xs text-muted-foreground">{it.officeName}</span>
                </div>
                <div className="flex aspect-square items-center justify-center overflow-hidden rounded bg-muted">
                  {photo === undefined ? (
                    <span className="text-xs text-muted-foreground">Đang tải ảnh…</span>
                  ) : photo ? (
                    <img src={photo} alt={`Ảnh chấm công ${timeOf(it.checkedAt)}`} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-muted-foreground">Không có ảnh</span>
                  )}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">IP: {it.clientIp || "—"}</div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
