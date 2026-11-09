import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { M3Page } from "@/components/M3Page";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useStore } from "@/lib/store";
import { ExportFormatButton } from "@/components/ExportFormatButton";
import { downloadExcelRows, type ExportFormat } from "@/lib/csv";
import { toast } from "sonner";
import { TonKhoPanel } from "./ton-kho";
import { CountButton, OrderListDialog, type OrderListRow } from "@/components/OrderListDialog";

export const Route = createFileRoute("/bao-cao-gio")({
  head: () => ({
    meta: [
      { title: "Báo cáo theo giờ — X.E" },
      {
        name: "description",
        content:
          "Báo cáo số lượng đơn lấy, đơn giao - trả và đơn luân chuyển theo từng khung giờ trong ngày; kèm bảng tồn kho.",
      },
      { property: "og:title", content: "Báo cáo theo giờ — X.E" },
      {
        property: "og:description",
        content: "Thống kê đơn lấy, giao - trả, luân chuyển theo giờ và tồn kho theo bưu cục.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Báo cáo theo giờ" screen="bao-cao-gio" hidePageTitle>
      <M3Page>
        <Page />
      </M3Page>
    </ProtectedPage>
  ),
});

type MainTab = "GIO" | "TON";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const VN = "Asia/Ho_Chi_Minh";

function vnDayHour(iso: string): { day: string; hour: number } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VN,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour"));
  if (day.length !== 10 || Number.isNaN(hour)) return null;
  return { day, hour };
}

function todayVn(): string {
  return vnDayHour(new Date().toISOString())?.day ?? "";
}

function fmtDay(day: string): string {
  if (day.length < 10) return day;
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

function fmtN(n: number) {
  return n.toLocaleString("vi-VN");
}

const KINDS = [
  { key: "LAY", label: "Đơn lấy", hint: "Tính từ lúc tạo đơn thành công", icon: "move_to_inbox" },
  { key: "GIAO_TRA", label: "Đơn giao - trả", hint: "Tính từ khi nhập kho", icon: "local_shipping" },
  {
    key: "LUAN_CHUYEN",
    label: "Đơn luân chuyển",
    hint: "Tính từ lúc scan để đợi luân chuyển",
    icon: "sync_alt",
  },
] as const;

type KindKey = (typeof KINDS)[number]["key"];

function pointsOf(o: any): { kind: KindKey; at: string; office: string }[] {
  const out: { kind: KindKey; at: string; office: string }[] = [];
  if (o.status !== "DRAFT" && o.createdAt) out.push({ kind: "LAY", at: o.createdAt, office: o.fromOffice });
  const wh =
    ["WH_IN", "DEST_WH_IN", "DELIVERING", "FAILED"].includes(o.stage) ||
    ["RT_WH_IN", "RT_DELIVERING", "RT_FAILED", "RT_DONE"].includes(o.returnStage);
  if (wh)
    out.push({
      kind: "GIAO_TRA",
      at: o.warehouseInAt ?? o.updatedAt,
      office: o.returnStage ? o.fromOffice : (o.toOffice ?? o.fromOffice),
    });
  const lc =
    ["TRANSFER_PENDING", "TRANSFERRING", "DEST_WH_IN"].includes(o.stage) ||
    ["RT_TRANSFER_PENDING", "RT_TRANSFERRING"].includes(o.returnStage);
  if (lc)
    out.push({
      kind: "LUAN_CHUYEN",
      at: o.transferScanAt ?? o.updatedAt,
      office: o.fromOffice,
    });
  return out;
}

function buildMiniPaths(vals: number[]) {
  const max = Math.max(1, ...vals);
  const PLOT = 76;
  const Y = (v: number) => 100 - (v / max) * PLOT;
  const P = vals.map((v, i) => [(i + 0.5) * 10, Y(v)] as const);
  let line = `M${P[0][0]} ${P[0][1].toFixed(1)}`;
  for (let i = 0; i < P.length - 1; i++) {
    const [x1, y1] = P[i];
    const [x2, y2] = P[i + 1];
    const mx = (x1 + x2) / 2;
    line += ` C${mx} ${y1.toFixed(1)} ${mx} ${y2.toFixed(1)} ${x2} ${y2.toFixed(1)}`;
  }
  const area = `${line} L${P[P.length - 1][0]} 100 L${P[0][0]} 100 Z`;
  return { line, area, max };
}

function BaoCaoGioPanel({ tick }: { tick: number }) {
  const orders = useStore((s) => s.orders);
  const offices = useStore((s) => s.offices);
  const [office, setOffice] = useState("ALL");
  const [fromDay, setFromDay] = useState(todayVn);
  const [toDay, setToDay] = useState(todayVn);
  const [hv, setHv] = useState<{ s: number; i: number } | null>(null);
  const [detail, setDetail] = useState<{ title: string; rows: OrderListRow[] } | null>(null);

  const { data, lists } = useMemo(() => {
    void tick;
    const lists = KINDS.reduce(
      (acc, k) => {
        acc[k.key] = HOURS.map(() => [] as OrderListRow[]);
        return acc;
      },
      {} as Record<KindKey, OrderListRow[][]>,
    );

    orders.forEach((o: any) => {
      pointsOf(o).forEach((p) => {
        if (!p.at) return;
        if (office !== "ALL" && p.office !== office) return;
        const when = vnDayHour(p.at);
        if (!when) return;
        if (fromDay && when.day < fromDay) return;
        if (toDay && when.day > toDay) return;
        lists[p.kind][when.hour].push({ order: o, at: p.at });
      });
    });
    const data = KINDS.reduce(
      (acc, k) => {
        acc[k.key] = lists[k.key].map((l) => l.length);
        return acc;
      },
      {} as Record<KindKey, number[]>,
    );
    return { data, lists };
  }, [orders, office, fromDay, toDay, tick]);

  const openCell = (kind: (typeof KINDS)[number], hour?: number) => {
    const rows = hour === undefined ? lists[kind.key].flat() : lists[kind.key][hour];
    const sorted = [...rows].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
    const officeLabel = office === "ALL" ? "Tất cả kho" : (offices.find((o) => o.code === office)?.name ?? office);
    const range =
      fromDay && toDay ? (fromDay === toDay ? fmtDay(fromDay) : `${fmtDay(fromDay)} – ${fmtDay(toDay)}`) : "mọi ngày";
    setDetail({
      title: `${kind.label} · ${hour === undefined ? "cả ngày" : `${String(hour).padStart(2, "0")}h`} · ${range} · ${officeLabel}`,
      rows: sorted,
    });
  };

  return (
    <>
      <div className="filter-grid date-pair">
        <label className="field" style={{ flex: "none" }}>
          <span className="l">Từ ngày</span>
          <span className="box input-box">
            <input
              type="date"
              className="num"
              value={fromDay}
              max={toDay || undefined}
              onChange={(e) => setFromDay(e.target.value)}
            />
          </span>
        </label>
        <label className="field">
          <span className="l">Đến ngày</span>
          <span className="box input-box">
            <input
              type="date"
              className="num"
              value={toDay}
              min={fromDay || undefined}
              onChange={(e) => setToDay(e.target.value)}
            />
          </span>
        </label>
        <div className="field">
          <span className="l">Chọn kho</span>
          <SearchableSelect
            value={office}
            onValueChange={setOffice}
            options={[
              { value: "ALL", label: "Tất cả kho" },
              ...offices.map((o) => ({ value: o.code, label: o.name })),
            ]}
          />
        </div>
      </div>

      <div className="stack">
        <div className="hour-grid">
          {KINDS.map((k, si) => {
            const vals = data[k.key];
            const total = vals.reduce((a, b) => a + b, 0);
            const { line, area, max } = buildMiniPaths(vals);
            const peakI = vals.indexOf(Math.max(...vals));
            const gid = `mini-grad-${k.key}`;
            const PLOT = 76;
            return (
              <section key={k.key} className="card stack num" style={{ gap: 12 }}>
                <div>
                  <div className="who">
                    <span className="rev-ic sm" aria-hidden="true">
                      <span className="ms">{k.icon}</span>
                    </span>
                    <span className="lab muted">{k.label}</span>
                  </div>
                  <div className="kpi-val">{fmtN(total)}</div>
                  <div className="muted" style={{ fontSize: 12, lineHeight: "16px" }}>
                    {k.hint}
                  </div>
                </div>
                <div
                  className="mini-chart mini-area"
                  role="img"
                  aria-label={`${k.label} theo khung giờ, tổng ${fmtN(total)}`}
                >
                  <svg className="mini-svg" viewBox="0 0 240 100" preserveAspectRatio="none" aria-hidden="true">
                    <defs>
                      <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="var(--chart-recv)" stopOpacity=".32" />
                        <stop offset="1" stopColor="var(--chart-recv)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <g className="reveal">
                      <path d={area} fill={`url(#${gid})`} />
                      <path className="area-line recv-line" d={line} />
                    </g>
                  </svg>
                  <div className="mini-hits" onMouseLeave={() => setHv(null)}>
                    {vals.map((v, i) => {
                      const on = hv?.s === si && hv?.i === i;
                      const peak = !hv && i === peakI && v > 0;
                      const tipCls = `mini-tip num ${i < 5 ? "start" : i > 18 ? "end" : "mid"}`;
                      return (
                        <span
                          key={i}
                          className="mini-hit"
                          onMouseEnter={() => setHv({ s: si, i })}
                          onClick={() => openCell(k, i)}
                        >
                          {on ? (
                            <>
                              <span className="xhair" aria-hidden="true" />
                              <i className="pt recv" style={{ bottom: (v / max) * PLOT - 5 }} />
                              <span className={tipCls} aria-hidden="true">
                                <b>{String(i).padStart(2, "0")}h</b> · <b>{fmtN(v)}</b> đơn
                              </span>
                            </>
                          ) : null}
                          {peak ? (
                            <span className="peak num" style={{ bottom: (v / max) * PLOT + 8 }} aria-hidden="true">
                              Cao nhất {fmtN(v)}
                            </span>
                          ) : null}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="mini-axis muted">
                  <span>00h</span>
                  <span>06h</span>
                  <span>12h</span>
                  <span>18h</span>
                  <span>23h</span>
                </div>
              </section>
            );
          })}
        </div>

        <section className="card stack">
          <h2 className="group-title sec-title">
            <span className="sec-ic" aria-hidden="true">
              <span className="ms">table_chart</span>
            </span>
            Bảng chi tiết theo giờ
          </h2>
          <div className="scroller">
            <table className="tbl sticky-1 compact" style={{ ["--tbl-min" as string]: "1240px" }}>
              <thead>
                <tr>
                  <th>Loại</th>
                  <th className="r">Tổng</th>
                  {HOURS.map((h) => (
                    <th key={h} className="r">
                      {String(h).padStart(2, "0")}h
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {KINDS.map((k) => (
                  <tr key={k.key}>
                    <td className="main" style={{ whiteSpace: "nowrap" }}>
                      {k.label}
                    </td>
                    <td className="r main">
                      <CountButton value={data[k.key].reduce((a, b) => a + b, 0)} onClick={() => openCell(k)} />
                    </td>
                    {data[k.key].map((v, i) => (
                      <td key={i} className={v ? "r" : "r muted"}>
                        <CountButton value={v} onClick={() => openCell(k, i)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <OrderListDialog
        title={detail?.title ?? ""}
        timeLabel="Mốc tính giờ"
        rows={detail?.rows ?? null}
        onClose={() => setDetail(null)}
      />
    </>
  );
}

function Page() {
  const [tab, setTab] = useState<MainTab>("GIO");
  const [tick, setTick] = useState(0);
  const orders = useStore((s) => s.orders);
  const offices = useStore((s) => s.offices);

  const exportExcel = (format: ExportFormat = "csv") => {
    // Export uses same logic as panel for current store snapshot (all offices, today range approx).
    // Full filter export lives in panel — recompute lightly for toolbar export.
    const fromDay = todayVn();
    const toDay = fromDay;
    const lists = KINDS.reduce(
      (acc, k) => {
        acc[k.key] = HOURS.map(() => 0);
        return acc;
      },
      {} as Record<KindKey, number[]>,
    );
    orders.forEach((o: any) => {
      pointsOf(o).forEach((p) => {
        if (!p.at) return;
        const when = vnDayHour(p.at);
        if (!when) return;
        if (when.day < fromDay || when.day > toDay) return;
        lists[p.kind][when.hour] += 1;
      });
    });
    downloadExcelRows(
      `bao-cao-don-theo-gio-${fromDay}`,
      [
        ["Loại", "Tổng", ...HOURS.map((h) => `${String(h).padStart(2, "0")}h`)],
        ...KINDS.map((k) => [k.label, lists[k.key].reduce((a, b) => a + b, 0), ...lists[k.key]]),
      ],
      "TheoGio",
      format,
    );
    void offices;
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="title-row">
        <h1 className="page-title">Báo cáo theo giờ</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setTick((t) => t + 1);
              toast.success("Đã cập nhật dữ liệu");
            }}
          >
            <span className="ms" aria-hidden="true">
              refresh
            </span>
            Cập nhật dữ liệu
          </button>
          <ExportFormatButton className="btn tonal" variant="ghost" onExport={exportExcel} />
        </div>
      </div>

      <div className="seg" role="tablist" aria-label="Loại báo cáo" style={{ alignSelf: "flex-start" }}>
        <button
          type="button"
          role="tab"
          className={tab === "GIO" ? "on" : undefined}
          aria-selected={tab === "GIO"}
          onClick={() => setTab("GIO")}
        >
          Báo cáo theo giờ
        </button>
        <button
          type="button"
          role="tab"
          className={tab === "TON" ? "on" : undefined}
          aria-selected={tab === "TON"}
          onClick={() => setTab("TON")}
        >
          Tồn kho
        </button>
      </div>

      {tab === "GIO" ? <BaoCaoGioPanel tick={tick} /> : <TonKhoPanel />}
    </div>
  );
}
