import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { isApiEnabled } from "@/lib/api/client";
import {
  fetchRouteRevenueReport,
  type RouteRevenueCell,
  type RouteRevenueReport,
} from "@/lib/api/finance-config-api";
import { ExportFormatButton } from "@/components/ExportFormatButton";
import { downloadExcel, type ExportFormat } from "@/lib/csv";
import { formatVND } from "@/lib/mock-data";
import { toast } from "sonner";

const EMPTY: RouteRevenueCell = { bills: 0, shipFee: 0, paid: 0, unpaid: 0, revenue: 0 };

function money(n: number) {
  if (!n) return "—";
  return formatVND(n);
}

function fmtDay(iso: string) {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

type Props = {
  from: string;
  to: string;
  officeCode?: string;
};

export function RouteRevenueTable({ from, to, officeCode }: Props) {
  const [report, setReport] = useState<RouteRevenueReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isApiEnabled() || !from || !to || from > to) {
      setReport(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchRouteRevenueReport(from, to, officeCode)
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch((e) => {
        if (!cancelled) {
          setReport(null);
          toast.error(e instanceof Error ? e.message : "Không tải được doanh thu theo tuyến");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, officeCode]);

  const routes = report?.routes ?? [];
  const days = report?.days ?? [];
  const grand = report?.grandTotal ?? EMPTY;

  const exportCsv = (format: ExportFormat = "csv") => {
    if (!report || !routes.length) {
      toast.error("Chưa có dữ liệu để xuất");
      return;
    }
    const headers = ["STT", "Ngày đi"];
    for (const r of routes) {
      headers.push(
        `${r} · Lượt`,
        `${r} · Tiền ship`,
        `${r} · Đã thanh toán`,
        `${r} · Chưa thanh toán`,
        `${r} · Doanh thu`,
      );
    }
    headers.push("Tổng · Lượt", "Tổng · Tiền ship", "Tổng · Đã TT", "Tổng · Chưa TT", "Tổng · Doanh thu");
    const data: (string | number)[][] = days.map((row, i) => {
      const line: (string | number)[] = [i + 1, fmtDay(row.date)];
      for (const r of routes) {
        const c = row.byRoute[r] ?? EMPTY;
        line.push(c.bills, c.shipFee, c.paid, c.unpaid, c.revenue);
      }
      const t = row.total ?? EMPTY;
      line.push(t.bills, t.shipFee, t.paid, t.unpaid, t.revenue);
      return line;
    });
    const totalLine: (string | number)[] = ["", "Tổng"];
    for (const r of routes) {
      let bills = 0,
        ship = 0,
        paid = 0,
        unpaid = 0,
        rev = 0;
      for (const day of days) {
        const c = day.byRoute[r] ?? EMPTY;
        bills += c.bills;
        ship += c.shipFee;
        paid += c.paid;
        unpaid += c.unpaid;
        rev += c.revenue;
      }
      totalLine.push(bills, ship, paid, unpaid, rev);
    }
    totalLine.push(grand.bills, grand.shipFee, grand.paid, grand.unpaid, grand.revenue);
    data.push(totalLine);
    downloadExcel(`doanh-thu-theo-tuyen-${from}_${to}`, headers, data, format);
  };

  const routeColTotals = useMemo(() => {
    const out: Record<string, RouteRevenueCell> = {};
    for (const r of routes) {
      let cell = EMPTY;
      for (const day of days) {
        const c = day.byRoute[r] ?? EMPTY;
        cell = {
          bills: cell.bills + c.bills,
          shipFee: cell.shipFee + c.shipFee,
          paid: cell.paid + c.paid,
          unpaid: cell.unpaid + c.unpaid,
          revenue: cell.revenue + c.revenue,
        };
      }
      out[r] = cell;
    }
    return out;
  }, [routes, days]);

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">Doanh thu theo tuyến</div>
            <p className="text-xs text-muted-foreground">
              Theo ngày tạo đơn · cột tuyến = điểm nhận (VP đích).{" "}
              <b>Lượt</b> = số bill · <b>Tiền ship</b> = phí lấy + phí giao tận nơi ·{" "}
              <b>Đã / chưa TT</b> theo cước net (đã trừ phí đối tác).
            </p>
          </div>
          <ExportFormatButton
            className="h-8"
            disabled={loading || !routes.length}
            onExport={exportCsv}
          />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tổng hợp…
          </div>
        ) : !report || routes.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Không có đơn trong khoảng lọc.
          </div>
        ) : (
          <div className="overflow-auto rounded-md border">
            <table className="w-max min-w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th rowSpan={2} className="sticky left-0 z-[2] border-r bg-muted/80 px-2 py-2 text-left font-semibold">
                    STT
                  </th>
                  <th
                    rowSpan={2}
                    className="sticky left-[40px] z-[2] border-r bg-muted/80 px-2 py-2 text-left font-semibold"
                  >
                    Ngày đi
                  </th>
                  {routes.map((r) => (
                    <th
                      key={r}
                      colSpan={5}
                      className="border-r border-b px-2 py-1.5 text-center font-semibold text-primary"
                    >
                      {r}
                    </th>
                  ))}
                  <th colSpan={5} className="px-2 py-1.5 text-center font-semibold">
                    Tổng
                  </th>
                </tr>
                <tr className="border-b bg-muted/30 text-[10px] text-muted-foreground">
                  {routes.map((r) => (
                    <SubHeads key={r} />
                  ))}
                  <SubHeads />
                </tr>
              </thead>
              <tbody>
                {days
                  .filter((row) => {
                    if (days.length <= 14) return true;
                    return (row.total?.bills ?? 0) > 0;
                  })
                  .map((row, i) => {
                    const t = row.total ?? EMPTY;
                    return (
                      <tr key={row.date} className="border-b hover:bg-muted/20">
                        <td className="sticky left-0 z-[1] border-r bg-background px-2 py-1 text-muted-foreground">
                          {i + 1}
                        </td>
                        <td className="sticky left-[40px] z-[1] border-r bg-background px-2 py-1 font-medium whitespace-nowrap">
                          {fmtDay(row.date)}
                        </td>
                        {routes.map((r) => (
                          <CellTds key={r} cell={row.byRoute[r] ?? EMPTY} />
                        ))}
                        <CellTds cell={t} strong />
                      </tr>
                    );
                  })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-muted/50 font-semibold">
                  <td className="sticky left-0 z-[1] border-r bg-muted/80 px-2 py-1.5" colSpan={2}>
                    Tổng
                  </td>
                  {routes.map((r) => (
                    <CellTds key={r} cell={routeColTotals[r] ?? EMPTY} strong />
                  ))}
                  <CellTds cell={grand} strong />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SubHeads() {
  return (
    <>
      <th className="border-r px-1.5 py-1 font-medium">Lượt</th>
      <th className="border-r px-1.5 py-1 font-medium">Tiền ship</th>
      <th className="border-r px-1.5 py-1 font-medium">Đã TT</th>
      <th className="border-r px-1.5 py-1 font-medium">Chưa TT</th>
      <th className="border-r px-1.5 py-1 font-medium">Doanh thu</th>
    </>
  );
}

function CellTds({ cell, strong }: { cell: RouteRevenueCell; strong?: boolean }) {
  const cls = strong ? "font-semibold tabular-nums" : "tabular-nums";
  return (
    <>
      <td className={`border-r px-1.5 py-1 text-right ${cls}`}>{cell.bills || "—"}</td>
      <td className={`border-r px-1.5 py-1 text-right ${cls}`}>{money(cell.shipFee)}</td>
      <td className={`border-r px-1.5 py-1 text-right ${cls}`}>{money(cell.paid)}</td>
      <td className={`border-r px-1.5 py-1 text-right ${cls}`}>{money(cell.unpaid)}</td>
      <td className={`border-r px-1.5 py-1 text-right ${cls}`}>{money(cell.revenue)}</td>
    </>
  );
}
