import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ExportFormatButton } from "@/components/ExportFormatButton";
import { SearchableSelect } from "@/components/SearchableSelect";
import { M3Page } from "@/components/layout/M3Page";
import { ProtectedPage } from "@/components/ProtectedPage";
import { downloadExcelRows, type ExportFormat } from "@/lib/csv";
import { useAuthStore } from "@/store/auth";
import { useOrdersStore } from "@/store/orders";
import { useOrgStore } from "@/store/org";

export const Route = createFileRoute("/ton-kho")({
  component: TonKhoPage,
});

function TonKhoPage() {
  return (
    <ProtectedPage screenKey="BAO_CAO_GIO" title="Tồn kho" hidePageTitle>
      <M3Page>
        <TonKhoPanel />
      </M3Page>
    </ProtectedPage>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
type KindKey = "NHAP" | "XUAT" | "TON";
const KINDS: Array<{ key: KindKey; label: string }> = [
  { key: "NHAP", label: "Nhập" },
  { key: "XUAT", label: "Xuất" },
  { key: "TON", label: "Tồn" },
];

function ageHours(iso?: string | null) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const h = Math.floor((Date.now() - t) / 3_600_000);
  if (!Number.isFinite(h) || h < 0) return 0;
  return Math.min(23, h);
}

function officeLabel(o: { code?: string | null; name?: string | null; id: string }) {
  return o.name?.trim() || o.code?.trim() || o.id;
}

/** Bảng tồn kho theo giờ — bố cục cũ, UI M3. `embedded` = tab trong Báo cáo theo giờ. */
export function TonKhoPanel({ embedded = false }: { embedded?: boolean } = {}) {
  const me = useAuthStore((s) => s.currentUser);
  const offices = useOrgStore((s) => s.offices);
  const packages = useOrdersStore((s) => s.packages);

  const allScope = me?.role === "ADMIN" || me?.role === "KE_TOAN";
  const [officeId, setOfficeId] = useState(() => (allScope ? "all" : me?.officeId || "all"));
  const [tick, setTick] = useState(0);

  const officeOptions = useMemo(() => {
    const base = offices
      .slice()
      .sort((a, b) => officeLabel(a).localeCompare(officeLabel(b), "vi"))
      .map((o) => ({ value: o.id, label: officeLabel(o) }));
    return allScope ? [{ value: "all", label: "Tất cả kho" }, ...base] : base;
  }, [offices, allScope]);

  const selectedOffices = useMemo(() => {
    const list =
      officeId === "all"
        ? offices.slice().sort((a, b) => officeLabel(a).localeCompare(officeLabel(b), "vi"))
        : offices.filter((o) => o.id === officeId);
    return list;
  }, [offices, officeId]);

  const matrix = useMemo(() => {
    void tick;
    const byOffice = new Map<string, Record<KindKey, number[]>>();
    for (const o of selectedOffices) {
      byOffice.set(o.id, {
        NHAP: Array.from({ length: 24 }, () => 0),
        XUAT: Array.from({ length: 24 }, () => 0),
        TON: Array.from({ length: 24 }, () => 0),
      });
    }
    for (const p of packages) {
      if (officeId !== "all" && p.currentOfficeId !== officeId) continue;
      if (officeId === "all" && !byOffice.has(p.currentOfficeId || "")) continue;
      const h = ageHours(p.updatedAt || p.createdAt);
      if (h == null) continue;
      const cell = byOffice.get(p.currentOfficeId || "");
      if (!cell) continue;
      if (p.status === "DA_NHAP_KHO" || p.status === "CHO_NHAP_KHO" || p.status === "DANG_VAN_CHUYEN") {
        cell.NHAP[h] += 1;
        cell.TON[h] += 1;
      } else if (p.status === "DA_XUAT_KHO" || p.status === "DA_GIAO") {
        cell.XUAT[h] += 1;
      } else {
        cell.TON[h] += 1;
      }
    }
    return byOffice;
  }, [packages, selectedOffices, officeId, tick]);

  const exportExcel = (format: ExportFormat) => {
    const rows: Array<Array<string | number>> = [
      ["Bưu cục", "Loại", "Tổng", ...HOURS.map((h) => `${String(h).padStart(2, "0")}h`)],
    ];
    for (const o of selectedOffices) {
      const cell = matrix.get(o.id);
      if (!cell) continue;
      for (const k of KINDS) {
        const arr = cell[k.key];
        rows.push([officeLabel(o), k.label, arr.reduce((a, b) => a + b, 0), ...arr]);
      }
    }
    downloadExcelRows(`ton-kho-${new Date().toISOString().slice(0, 10)}`, rows, "TonKho", format);
  };

  const filters = (
    <div className="filter-grid" style={{ alignItems: "end" }}>
      <div className="field vp-field">
        <span className="l">Chọn kho</span>
        <SearchableSelect
          value={officeId}
          onValueChange={setOfficeId}
          disabled={!allScope}
          placeholder="Chọn kho"
          options={officeOptions}
        />
      </div>
      <div className="field" style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            setTick((t) => t + 1);
            toast.success("Đã cập nhật tồn kho");
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
  );

  return (
    <div className="stack" style={{ gap: 16 }}>
      {!embedded ? (
        <div className="title-row">
          <div style={{ minWidth: 0 }}>
            <h1 className="page-title">Tồn kho</h1>
            <div className="lab muted">Theo bưu cục và số giờ đã tồn</div>
          </div>
        </div>
      ) : null}

      {filters}

      <section className="card stack" style={{ gap: 12 }}>
        <div className="title-row" style={{ marginBottom: 0 }}>
          <h2 className="group-title" style={{ margin: 0 }}>
            Bảng tồn kho theo số giờ đã tồn
          </h2>
        </div>

        {!selectedOffices.length ? (
          <div className="empty">
            <h3 className="group-title">Chưa có bưu cục</h3>
          </div>
        ) : (
          <div className="tbl sticky">
            <table>
              <thead>
                <tr>
                  <th>Bưu cục</th>
                  <th>Loại</th>
                  <th className="num">Tổng</th>
                  {HOURS.map((h) => (
                    <th key={h} className="num">
                      {String(h).padStart(2, "0")}h
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedOffices.map((o) => {
                  const cell = matrix.get(o.id)!;
                  return KINDS.map((k, idx) => {
                    const arr = cell[k.key];
                    const total = arr.reduce((a, b) => a + b, 0);
                    return (
                      <tr key={`${o.id}-${k.key}`}>
                        {idx === 0 ? (
                          <td rowSpan={KINDS.length} style={{ verticalAlign: "middle", fontWeight: 600 }}>
                            {officeLabel(o)}
                          </td>
                        ) : null}
                        <td>{k.label}</td>
                        <td className="num" style={{ fontWeight: 600 }}>
                          {total}
                        </td>
                        {arr.map((n, i) => (
                          <td key={i} className="num">
                            {n || "—"}
                          </td>
                        ))}
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
