import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { M3Page } from "@/components/M3Page";
import { TablePagination } from "@/components/TablePagination";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { usePagedRows } from "@/lib/use-paged-rows";
import { isApiEnabled } from "@/lib/api/client";
import {
  getRevenueReport,
  type RevenueKind,
  type RevenueReport,
  type RevenueRow,
} from "@/lib/api/revenue-api";
import { assignedOfficeCode, hasAllOfficeScope } from "@/lib/office-scope";
import { ExportFormatButton } from "@/components/ExportFormatButton";
import { downloadExcel, type ExportFormat } from "@/lib/csv";
import { toast } from "sonner";

export const Route = createFileRoute("/bao-cao-doanh-thu")({
  head: () => ({
    meta: [
      { title: "Báo cáo doanh thu — X.E" },
      {
        name: "description",
        content: "Doanh thu theo ngày tạo đơn, tính cho văn phòng gửi.",
      },
      { property: "og:title", content: "Báo cáo doanh thu — X.E" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Báo cáo doanh thu" screen="bao-cao-doanh-thu" hidePageTitle>
      <M3Page>
        <Page />
      </M3Page>
    </ProtectedPage>
  ),
});

const KIND_OPTIONS: { value: RevenueKind; label: string }[] = [
  { value: "ALL", label: "Tất cả" },
  { value: "RECEIPT", label: "Đã thu (phiếu thu)" },
  { value: "BACKLOG", label: "Đơn tồn" },
];

const COST_COLS: { key: "shippingFee"; label: string }[] = [{ key: "shippingFee", label: "Phí giao" }];

function uniqueShippingFee(rows: RevenueRow[]) {
  const seen = new Set<string>();
  let sum = 0;
  for (const r of rows) {
    if (seen.has(r.orderCode)) continue;
    seen.add(r.orderCode);
    sum += Number(r.shippingFee ?? 0);
  }
  return sum;
}

const MONEY_COLS: { key: keyof RevenueReport["totals"]; label: string }[] = [
  { key: "goodsFare", label: "Cước giao hàng" },
  { key: "deliveryFee", label: "Giao tận nơi" },
  { key: "pickupFee", label: "Phí lấy hàng" },
  { key: "codFee", label: "Thu hộ COD" },
  { key: "declaredFee", label: "Phí KBGT" },
  { key: "storageFee", label: "Lưu kho" },
  { key: "returnFee", label: "Phí hoàn" },
  { key: "total", label: "Tổng doanh thu" },
];

const MIX_META: { key: keyof RevenueReport["totals"] | "shippingFee"; name: string; icon: string; minus?: boolean }[] = [
  { key: "goodsFare", name: "Cước giao hàng", icon: "local_shipping" },
  { key: "deliveryFee", name: "Giao tận nơi", icon: "home" },
  { key: "pickupFee", name: "Phí lấy hàng", icon: "move_to_inbox" },
  { key: "declaredFee", name: "Phí KBGT", icon: "verified_user" },
  { key: "storageFee", name: "Lưu kho", icon: "warehouse" },
  { key: "returnFee", name: "Phí hoàn", icon: "undo" },
  { key: "shippingFee", name: "Trừ phí giao", icon: "do_not_disturb_on", minus: true },
];

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function vnDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function money(n?: number) {
  return `${Math.round(Number(n ?? 0)).toLocaleString("vi-VN")} đ`;
}

function fmtRev(n: number) {
  const a = Math.abs(n);
  if (a >= 1_000_000) {
    return `${(a / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}tr`;
  }
  if (a >= 1_000) return `${Math.round(a / 1000)}k`;
  return Math.round(a).toLocaleString("vi-VN");
}

function pctText(x: number) {
  return `${(x * 100).toFixed(1).replace(".", ",")}%`;
}

function OfficeIll() {
  return (
    <svg className="rev-ill" viewBox="0 0 150 104" aria-hidden="true">
      <ellipse className="ill-soft" cx="78" cy="97" rx="70" ry="6" />
      <rect className="ill-mid" x="26" y="26" width="84" height="70" rx="4" />
      <rect className="ill-main" x="20" y="12" width="96" height="18" rx="4" />
      <rect className="ill-paper" x="50" y="17" width="36" height="8" rx="4" />
      <path className="ill-main" d="M26 30h14v7a7 7 0 0 1-14 0zM54 30h14v7a7 7 0 0 1-14 0zM82 30h14v7a7 7 0 0 1-14 0z" />
      <path className="ill-paper" d="M40 30h14v7a7 7 0 0 1-14 0zM68 30h14v7a7 7 0 0 1-14 0zM96 30h14v7a7 7 0 0 1-14 0z" />
      <rect className="ill-paper" x="36" y="54" width="28" height="22" rx="3" />
      <rect className="ill-main" x="74" y="54" width="24" height="42" rx="3" />
      <circle className="ill-paper" cx="93" cy="76" r="1.8" />
      <rect className="ill-box" x="116" y="72" width="24" height="24" rx="2" />
      <rect className="ill-box2" x="122" y="54" width="18" height="18" rx="2" />
      <path className="ill-paper" d="M126 72h4v8h-4zM129.5 54h3v6h-3z" />
    </svg>
  );
}

type OfficeBar = { code: string; name: string; total: number; orders: number };

function buildOfficeBars(offices: { code: string; name: string }[], rows: RevenueRow[]): OfficeBar[] {
  const byCode = new Map<string, { total: number; orders: Set<string> }>();
  for (const r of rows) {
    const code = (r.officeCode || "").toUpperCase();
    const cur = byCode.get(code) ?? { total: 0, orders: new Set<string>() };
    cur.total += Number(r.total ?? 0);
    cur.orders.add(r.orderCode);
    byCode.set(code, cur);
  }
  const list: OfficeBar[] = offices.map((o) => {
    const hit = byCode.get(o.code.toUpperCase());
    return { code: o.code, name: o.name, total: hit?.total ?? 0, orders: hit?.orders.size ?? 0 };
  });
  for (const [code, hit] of byCode) {
    if (!list.some((c) => c.code.toUpperCase() === code)) {
      list.push({
        code,
        name: rows.find((r) => (r.officeCode || "").toUpperCase() === code)?.officeName || code || "Chưa rõ VP",
        total: hit.total,
        orders: hit.orders.size,
      });
    }
  }
  return list.filter((b) => b.total > 0).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "vi"));
}

const sourceLabel = (r: RevenueRow) => (r.source === "RECEIPT" ? "Đã thu" : "Đơn tồn · còn phải thu");

function VpRevenueIntro() {
  const [show, setShow] = useState(false);
  return (
    <>
      <div>
        <h2 className="group-title sec-title">
          <span className="sec-ic" aria-hidden="true">
            <span className="ms">store</span>
          </span>
          Doanh thu theo văn phòng
        </h2>
        <button type="button" className="link-plain" onClick={() => setShow((v) => !v)}>
          <span className="ms" aria-hidden="true" style={{ fontSize: 16 }}>
            info
          </span>
          Cách tính
        </button>
      </div>
      {show ? (
        <div className="note">
          Cùng cách tính với Báo cáo kinh doanh. Doanh thu = tổng cước các đơn tạo trong khoảng ngày (trừ đơn huỷ và đơn
          còn chờ nhận, chờ lấy, đang lấy hàng), tính cho VP gửi. Không gồm tiền thu hộ COD. Cột Phí giao hiện một trong
          ba: phí Ahamove/Grab, phí giao ngoài hoặc phí ship nội bộ, đã trừ khỏi tổng doanh thu.
        </div>
      ) : null}
    </>
  );
}

function Page() {
  const { session } = useAuth();
  const offices = useStore((s) => s.offices);
  const allScope = hasAllOfficeScope(session);
  const ownOffice = assignedOfficeCode(session?.office);
  const today = useMemo(() => isoDay(new Date()), []);

  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [office, setOffice] = useState(allScope ? "" : ownOffice);
  const [kind, setKind] = useState<RevenueKind>("ALL");
  const [report, setReport] = useState<RevenueReport | null>(null);
  const [chartReport, setChartReport] = useState<RevenueReport | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusOffice, setFocusOffice] = useState("");

  useEffect(() => {
    if (!isApiEnabled() || !from || !to) return;
    let alive = true;
    setLoading(true);
    getRevenueReport({ from, to, officeCode: office || undefined, kind })
      .then((r) => alive && setReport(r))
      .catch((e) => {
        if (!alive) return;
        toast.error(e instanceof Error ? e.message : "Không tải được báo cáo doanh thu");
        setReport(null);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [from, to, office, kind]);

  useEffect(() => {
    if (!isApiEnabled() || !allScope || !from || !to) {
      setChartReport(null);
      setChartLoading(false);
      return;
    }
    let alive = true;
    setChartLoading(true);
    getRevenueReport({ from, to, kind })
      .then((r) => alive && setChartReport(r))
      .catch(() => alive && setChartReport(null))
      .finally(() => alive && setChartLoading(false));
    return () => {
      alive = false;
    };
  }, [allScope, from, to, kind]);

  const rows = report?.rows ?? [];
  const { pageRows, pager } = usePagedRows(rows, "bao-cao-doanh-thu");

  const chartRows = (allScope ? chartReport : report)?.rows ?? [];
  const bars = useMemo(() => buildOfficeBars(offices, chartRows), [offices, chartRows]);
  const allTotal = bars.reduce((a, b) => a + b.total, 0);

  const focusBar = focusOffice ? bars.find((b) => b.code === focusOffice) : null;
  const focusRows = focusBar
    ? chartRows.filter((r) => (r.officeCode || "").toUpperCase() === focusBar.code.toUpperCase())
    : [];
  const focusTotals = useMemo(() => {
    if (!focusBar) return null;
    const t: Record<string, number> = {};
    for (const c of MONEY_COLS) t[c.key] = 0;
    t.shippingFee = 0;
    for (const r of focusRows) {
      for (const c of MONEY_COLS) t[c.key] += Number(r[c.key] ?? 0);
    }
    t.shippingFee = uniqueShippingFee(focusRows);
    return t;
  }, [focusBar, focusRows]);

  const exportExcel = (format: ExportFormat = "csv") => {
    if (!report || !rows.length) {
      toast.message("Không có dữ liệu để xuất");
      return;
    }
    const headers = [
      "STT",
      "Mã đơn",
      "Ngày tạo",
      "Văn phòng",
      "Nguồn",
      ...MONEY_COLS.map((c) => c.label),
      ...COST_COLS.map((c) => c.label),
    ];
    const data = rows.map((r, i) => [
      i + 1,
      r.orderCode,
      vnDate(r.createdAt),
      r.officeName,
      sourceLabel(r),
      ...MONEY_COLS.map((c) => Number(r[c.key] ?? 0)),
      ...COST_COLS.map((c) => Number(r[c.key] ?? 0)),
    ]);
    data.push([
      "",
      "Tổng",
      "",
      "",
      "",
      ...MONEY_COLS.map((c) => Number(report.totals[c.key] ?? 0)),
      ...COST_COLS.map(() => uniqueShippingFee(rows)),
    ]);
    downloadExcel(`bao-cao-doanh-thu-${from}_${to}${office ? `-${office}` : ""}`, headers, data, format);
  };

  const officeOptions = allScope
    ? [{ value: "all", label: "Tất cả VP" }, ...offices.map((o) => ({ value: o.code, label: o.name }))]
    : offices.filter((o) => o.code === ownOffice).map((o) => ({ value: o.code, label: o.name }));

  const pickOffice = (code: string) => {
    setFocusOffice(code);
    if (allScope && code) setOffice(code);
    if (allScope && !code) setOffice("");
  };

  const goodsBase = focusTotals ? Math.max(1, Number(focusTotals.goodsFare ?? 0)) : 1;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="title-row">
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title">Báo cáo doanh thu</h1>
          <div className="lab muted">Doanh thu theo đơn</div>
        </div>
        <ExportFormatButton className="btn tonal" variant="ghost" disabled={!rows.length} onExport={exportExcel} />
      </div>

      <div className="filter-grid">
        <label className="field">
          <span className="l">Từ ngày</span>
          <span className="box input-box">
            <input type="date" className="num" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </span>
        </label>
        <label className="field">
          <span className="l">Đến ngày</span>
          <span className="box input-box">
            <input type="date" className="num" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </span>
        </label>
        <div className="field vp-field">
          <span className="l">Văn phòng</span>
          <SearchableSelect
            value={office || "all"}
            onValueChange={(v) => {
              const next = v === "all" ? "" : v;
              setOffice(next);
              setFocusOffice(next);
            }}
            disabled={!allScope}
            placeholder="Tất cả VP"
            options={officeOptions}
          />
        </div>
        <div className="field">
          <span className="l">Loại đơn</span>
          <SearchableSelect
            value={kind}
            onValueChange={(v) => setKind(v as RevenueKind)}
            placeholder="Tất cả"
            options={KIND_OPTIONS}
          />
        </div>
      </div>

      <section className="card stack">
        <VpRevenueIntro />

        {(allScope ? chartLoading : loading) && !bars.length ? (
          <div className="empty">
            <h3 className="group-title">Đang tải…</h3>
          </div>
        ) : !bars.length ? (
          <div className="empty">
            <h3 className="group-title">Chưa có doanh thu theo văn phòng</h3>
          </div>
        ) : !focusBar ? (
          <>
            <div className="rev-total num">
              <span className="hero">{fmtRev(allTotal)}</span>
              <span className="lab muted">tổng {bars.length} văn phòng</span>
            </div>
            <div className="rev-list num">
              {bars.map((b, i) => (
                <button
                  key={b.code || b.name}
                  type="button"
                  className="rev-row"
                  aria-label={`Xem ${b.name}: ${fmtRev(b.total)}`}
                  onClick={() => pickOffice(b.code)}
                >
                  <span className="rev-rank">{i + 1}</span>
                  <span className="rev-name">{b.name}</span>
                  <span className="rev-val">
                    <b>{fmtRev(b.total)}</b>
                    <span className="muted">{pctText(b.total / allTotal)}</span>
                  </span>
                  <span className="rev-track" aria-hidden="true">
                    <i style={{ width: `${((b.total / bars[0].total) * 100).toFixed(1)}%` }} />
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="rev-one num">
            <div className="rev-sum">
              <div className="rev-hero">
                <div style={{ minWidth: 0 }}>
                  <div className="rev-vp lab">
                    <span className="ms fill" aria-hidden="true">
                      location_on
                    </span>
                    {focusBar.name}
                  </div>
                  <div className="hero">{fmtRev(focusBar.total)}</div>
                  <div className="small muted">doanh thu trong kỳ</div>
                </div>
                <OfficeIll />
              </div>
              <div className="rev-donut-row">
                <svg
                  className="rev-donut"
                  viewBox="0 0 36 36"
                  role="img"
                  aria-label={`Chiếm ${pctText(focusBar.total / allTotal)} doanh thu toàn hệ thống`}
                >
                  <circle className="donut-bg" cx="18" cy="18" r="15.5" pathLength={100} />
                  <circle
                    className="donut-val"
                    cx="18"
                    cy="18"
                    r="15.5"
                    pathLength={100}
                    strokeDasharray={`${((focusBar.total / allTotal) * 100).toFixed(1)} 100`}
                  />
                </svg>
                <div>
                  <div className="rev-stat">{pctText(focusBar.total / allTotal)}</div>
                  <div className="small muted">doanh thu toàn hệ thống</div>
                </div>
              </div>
              <div className="rev-tiles">
                <div className="rev-tile">
                  <span className="rev-ic" aria-hidden="true">
                    <span className="ms fill">emoji_events</span>
                  </span>
                  <div>
                    <div className="small muted">Xếp hạng</div>
                    <div className="rev-stat">
                      {bars.findIndex((b) => b.code === focusBar.code) + 1}
                      <span className="muted">/{bars.length}</span>
                    </div>
                  </div>
                </div>
                <div className="rev-tile">
                  <span className="rev-ic" aria-hidden="true">
                    <span className="ms fill">inventory_2</span>
                  </span>
                  <div>
                    <div className="small muted">Số đơn</div>
                    <div className="rev-stat">{focusBar.orders.toLocaleString("vi-VN")}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="rev-mix">
              <div className="rev-mix-head">
                <h3 className="lab" style={{ margin: 0, fontWeight: 600 }}>
                  Cơ cấu doanh thu
                </h3>
                <button type="button" className="link-plain" onClick={() => pickOffice("")}>
                  <span className="ms" aria-hidden="true" style={{ fontSize: 16 }}>
                    arrow_back
                  </span>
                  Xem tất cả VP
                </button>
              </div>
              {focusTotals
                ? MIX_META.map((m) => {
                    const raw = Number(focusTotals[m.key] ?? 0);
                    const val = m.minus ? -Math.abs(raw) : raw;
                    const share = Math.abs(val) / goodsBase;
                    return (
                      <div key={m.key} className={`rev-row static${m.minus ? " minus" : ""}`}>
                        <span className="rev-ic sm" aria-hidden="true">
                          <span className="ms">{m.icon}</span>
                        </span>
                        <span className="rev-name">{m.name}</span>
                        <span className="rev-val">
                          <b>
                            {val < 0 ? "−" : ""}
                            {fmtRev(val)}
                          </b>
                          <span className="muted">{pctText(share)}</span>
                        </span>
                        <span className="rev-track" aria-hidden="true">
                          <i style={{ width: `${Math.min(100, share * 100).toFixed(1)}%` }} />
                        </span>
                      </div>
                    );
                  })
                : null}
            </div>
          </div>
        )}
      </section>

      <section className="card stack">
        <h2 className="group-title sec-title">
          <span className="sec-ic" aria-hidden="true">
            <span className="ms">receipt_long</span>
          </span>
          Doanh thu theo đơn
        </h2>

        {!rows.length ? (
          <div className="empty">
            <h3 className="group-title">{loading ? "Đang tải…" : "Không có doanh thu trong khoảng lọc."}</h3>
          </div>
        ) : (
          <>
            <div className="scroller">
              <table className="tbl sticky-1 sticky-last" style={{ ["--tbl-min" as string]: "1360px" }}>
                <thead>
                  <tr>
                    <th>Mã đơn</th>
                    <th>Ngày tạo</th>
                    <th>Văn phòng</th>
                    {MONEY_COLS.filter((c) => c.key !== "total").map((c) => (
                      <th key={c.key} className="r">
                        {c.label}
                      </th>
                    ))}
                    {COST_COLS.map((c) => (
                      <th key={c.key} className="r">
                        {c.label}
                      </th>
                    ))}
                    <th className="r">Tổng doanh thu</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr key={`${r.orderCode}-${r.source}-${r.receiptCode ?? ""}`}>
                      <td>
                        <OrderCodeLink code={r.orderCode} className="code" />
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{vnDate(r.createdAt)}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <div>{r.officeName}</div>
                        <div className="muted" style={{ fontSize: 11 }}>
                          {sourceLabel(r)}
                        </div>
                      </td>
                      {MONEY_COLS.filter((c) => c.key !== "total").map((c) => (
                        <td key={c.key} className={`r${Number(r[c.key] ?? 0) ? "" : " muted"}`}>
                          {Number(r[c.key] ?? 0) ? money(r[c.key]) : "—"}
                        </td>
                      ))}
                      {COST_COLS.map((c) => (
                        <td key={c.key} className={`r${Number(r[c.key] ?? 0) ? "" : " muted"}`}>
                          {Number(r[c.key] ?? 0) ? money(r[c.key]) : "—"}
                        </td>
                      ))}
                      <td className="r main">{money(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <TablePagination pager={pager} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
