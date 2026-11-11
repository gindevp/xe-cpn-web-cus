import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { M3Page } from "@/components/M3Page";
import { Section } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useStore } from "@/lib/store";
import { openIssueType } from "@/lib/mock-data";
import { ExportFormatButton } from "@/components/ExportFormatButton";
import { downloadExcelRows, type ExportFormat } from "@/lib/csv";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { CountButton, OrderListDialog, type OrderListRow } from "@/components/OrderListDialog";

export const Route = createFileRoute("/ton-kho")({
  head: () => ({
    meta: [
      { title: "Tồn kho — X.E" },
      {
        name: "description",
        content: "Theo dõi tồn kho theo bưu cục và số giờ tồn: lấy, giao, trả, tồn luân chuyển.",
      },
      { property: "og:title", content: "Tồn kho — X.E" },
      { property: "og:description", content: "Bảng tồn kho theo bưu cục và khung giờ tồn kho." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Tồn kho" screen="ton-kho">
      <M3Page>
        <TonKhoPanel />
      </M3Page>
    </ProtectedPage>
  ),
});

const BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "00 - 06", min: 0, max: 6 },
  { label: "06 - 12", min: 6, max: 12 },
  { label: "12 - 24", min: 12, max: 24 },
  { label: "24 - 36", min: 24, max: 36 },
  { label: "36 - 48", min: 36, max: 48 },
  { label: "48 - 72", min: 48, max: 72 },
  { label: "72 - 96", min: 72, max: 96 },
  { label: "96 - 120", min: 96, max: 120 },
  { label: "120 - 192", min: 120, max: 192 },
  { label: "192+", min: 192, max: Infinity },
];

const KINDS = [
  { key: "LAY", label: "Lấy" },
  { key: "GIAO", label: "Giao" },
  { key: "TRA", label: "Trả" },
  { key: "TON_LC_GIAO", label: "Tồn luân chuyển giao" },
  { key: "TON_LC_TRA", label: "Tồn luân chuyển trả" },
] as const;

type KindKey = (typeof KINDS)[number]["key"];

function classify(o: any): { kind: KindKey; office: string } | null {
  const rs = o.returnStage as string | undefined;
  if (rs) {
    if (rs === "RETURN_PENDING" || rs === "RT_DELIVERING" || rs === "RT_ORIGIN_WH_IN")
      return { kind: "TRA", office: o.fromOffice };
    return { kind: "TON_LC_TRA", office: o.toOffice ?? o.fromOffice };
  }
  const st = o.stage as string | undefined;
  if (!st) {
    if (o.homePickup && !o.pickedUpAt) return { kind: "LAY", office: o.fromOffice };
    return null;
  }
  if (st === "PICKED") return { kind: "LAY", office: o.fromOffice };
  if (st === "WH_IN" || st === "TRANSFER_PENDING" || st === "TRANSFERRING")
    return { kind: "TON_LC_GIAO", office: o.fromOffice };
  if (st === "DEST_WH_IN" || st === "DELIVERING" || st === "FAILED")
    return { kind: "GIAO", office: o.toOffice };
  return null;
}

/** Mốc bắt đầu tồn theo loại — không dùng updatedAt (STORAGE_FEE / sửa đơn làm reset giờ tồn). */
function stockSince(o: any, kind: KindKey): string {
  const earliestEvent = (...actions: string[]) => {
    let best: string | undefined;
    for (const e of o.events ?? []) {
      if (!e?.at || !e?.action || !actions.includes(e.action)) continue;
      if (!best || e.at < best) best = e.at;
    }
    return best;
  };
  switch (kind) {
    case "LAY":
      return o.pickingAt ?? o.createdAt;
    case "TON_LC_GIAO":
      return (
        o.warehouseInAt ??
        earliestEvent("WAREHOUSE_RECEIVE", "WH_IN", "CONFIRM", "TRANSIT_HUB_IN") ??
        o.pickedUpAt ??
        o.createdAt
      );
    case "GIAO":
      return (
        o.destWarehouseInAt ??
        earliestEvent("SCAN_IN", "HUB_IN", "DEST_WH_IN", "REDELIVER_IN", "LEG_ARRIVE_DEST") ??
        o.pickedUpAt ??
        o.createdAt
      );
    case "TRA":
      return (
        earliestEvent("RETURN_PENDING", "RT_ORIGIN_WH_IN", "RT_DELIVERING", "FAIL_MAX", "FAIL_48H") ??
        o.updatedAt ??
        o.createdAt
      );
    case "TON_LC_TRA":
      return (
        earliestEvent("RT_TRANSFER_PENDING", "RT_TRANSFERRING", "RT_WH_IN") ??
        o.destWarehouseInAt ??
        o.updatedAt ??
        o.createdAt
      );
  }
}

function hoursAged(o: any, kind: KindKey) {
  const base = stockSince(o, kind);
  const t = Date.parse(base);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (Date.now() - t) / 3600000);
}

export function TonKhoPanel() {
  const orders = useStore((s) => s.orders);
  const offices = useStore((s) => s.offices);
  const [office, setOffice] = useState("ALL");
  const [tick, setTick] = useState(0);

  const [detail, setDetail] = useState<{ title: string; rows: OrderListRow[] } | null>(null);

  const data = useMemo(() => {
    void tick;
    const emptyLists = (): Record<KindKey, OrderListRow[][]> =>
      KINDS.reduce((acc, k) => {
        acc[k.key] = BUCKETS.map(() => [] as OrderListRow[]);
        return acc;
      }, {} as Record<KindKey, OrderListRow[][]>);
    const map = new Map<string, Record<KindKey, OrderListRow[][]>>();
    orders.forEach((o) => {
      // Đơn thất lạc đang mở nằm tab Ngoại lệ — không tính vào tồn kho.
      if (openIssueType(o.issue) === "LOST") return;
      const c = classify(o);
      if (!c || !c.office) return;
      if (office !== "ALL" && c.office !== office) return;
      const since = stockSince(o, c.kind);
      const h = hoursAged(o, c.kind);
      const idx = BUCKETS.findIndex((b) => h >= b.min && h < b.max);
      if (idx < 0) return;
      let row = map.get(c.office);
      if (!row) {
        row = emptyLists();
        map.set(c.office, row);
      }
      row[c.kind][idx].push({ order: o, at: since });
    });
    const codes = office === "ALL" ? offices.map((o) => o.code) : [office];
    return codes.map((c) => {
      const lists = map.get(c) ?? emptyLists();
      const rows = KINDS.reduce((acc, k) => {
        acc[k.key] = lists[k.key].map((l) => l.length);
        return acc;
      }, {} as Record<KindKey, number[]>);
      return {
        code: c,
        name: offices.find((o) => o.code === c)?.name ?? c,
        rows,
        lists,
      };
    });
  }, [orders, offices, office, tick]);

  const openCell = (g: (typeof data)[number], kind: (typeof KINDS)[number], bucket?: number) => {
    const rows = bucket === undefined ? g.lists[kind.key].flat() : g.lists[kind.key][bucket];
    // Tồn lâu nhất lên đầu.
    const sorted = [...rows].sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
    setDetail({
      title: `${g.code} – ${g.name} · ${kind.label} · ${bucket === undefined ? "tất cả" : `${BUCKETS[bucket].label} giờ`}`,
      rows: sorted,
    });
  };

  const exportExcel = (format: ExportFormat = "csv") => {
    const head = ["Bưu cục", "Loại", "Tổng", ...BUCKETS.map((b) => b.label)];
    const body: (string | number)[][] = [];
    data.forEach((g) => {
      KINDS.forEach((k) => {
        const cells = g.rows[k.key];
        body.push([
          `${g.code} - ${g.name}`,
          k.label,
          cells.reduce((a, b) => a + b, 0),
          ...cells,
        ]);
      });
    });
    downloadExcelRows(`ton-kho-${new Date().toISOString().slice(0, 10)}`, [head, ...body], "TonKho", format);
  };

  return (
    <div className="space-y-4">
      <Section>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64 space-y-1.5">
            <Label className="text-xs">Chọn kho</Label>
            <SearchableSelect
              value={office}
              onValueChange={setOffice}
              options={[
                { value: "ALL", label: "Tất cả kho" },
                ...offices.map((o) => ({ value: o.code, label: o.name })),
              ]}
            />
          </div>
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                setTick((t) => t + 1);
                toast.success("Đã cập nhật dữ liệu");
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Cập nhật dữ liệu
            </Button>
            <ExportFormatButton disabled={data.length === 0} onExport={exportExcel} />
          </div>
        </div>
      </Section>

      <Section title="Bảng tồn kho theo số giờ đã tồn">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-sm font-bold uppercase text-muted-foreground">
                <th className="px-3 py-2 w-56">Bưu cục</th>
                <th className="px-3 py-2 w-56">Loại</th>
                {BUCKETS.map((b) => (
                  <th key={b.label} className="px-3 py-2 text-right whitespace-nowrap">{b.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={2 + BUCKETS.length} className="px-3 py-8 text-center text-muted-foreground">
                    Không có dữ liệu tồn kho
                  </td>
                </tr>
              ) : (
                data.map((g) => (
                  KINDS.map((k, i) => {
                    const cells = g.rows[k.key];
                    const total = cells.reduce((a, b) => a + b, 0);
                    return (
                      <tr key={g.code + k.key} className={`border-b ${i === KINDS.length - 1 ? "border-b-2" : ""}`}>
                        {i === 0 && (
                          <td rowSpan={KINDS.length} className="px-3 py-2 align-middle font-medium border-r">
                            {g.code} – {g.name}
                          </td>
                        )}
                        <td className="px-3 py-2 font-medium text-primary">
                          {k.label} (
                          {total === 0 ? 0 : <CountButton value={total} onClick={() => openCell(g, k)} />})
                        </td>
                        {cells.map((v, ci) => (
                          <td key={ci} className="px-3 py-2 text-right tabular-nums">
                            <CountButton value={v} onClick={() => openCell(g, k, ci)} />
                          </td>
                        ))}
                      </tr>
                    );
                  })
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <OrderListDialog
        title={detail?.title ?? ""}
        description="Sắp xếp theo thời gian tồn lâu nhất trước."
        timeLabel="Bắt đầu tồn"
        rows={detail?.rows ?? null}
        onClose={() => setDetail(null)}
      />
    </div>
  );
}
