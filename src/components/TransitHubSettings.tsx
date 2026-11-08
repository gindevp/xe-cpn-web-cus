import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { apiRequest } from "@/lib/api/client";
import { OFFICE_ITINERARY_POINTS, officeSelectLabel, type OfficeRec } from "@/lib/mock-data";
import {
  DEFAULT_TRANSIT_POLICY,
  loadTransitHubPolicy,
  rememberTransitHubPolicy,
  type TransitHubPolicy,
} from "@/lib/transit-hub";

/** Master: chọn VP trung chuyển cho nhóm NB/NĐ/TB và cho các tuyến tỉnh còn lại. */
export function TransitHubSettings({
  offices,
  writable,
}: {
  offices: OfficeRec[];
  writable: boolean;
}) {
  const [policy, setPolicy] = useState<TransitHubPolicy>(DEFAULT_TRANSIT_POLICY);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void loadTransitHubPolicy().then(setPolicy);
  }, []);
  const points = new Set(
    policy.groupPoints
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );
  const officeOptions = offices.map((o) => ({
    value: o.code,
    label: officeSelectLabel(o),
    keywords: `${o.code} ${o.address ?? ""}`,
  }));
  const togglePoint = (code: string, on: boolean) => {
    const next = new Set(points);
    if (on) next.add(code);
    else next.delete(code);
    setPolicy({ ...policy, groupPoints: [...next].join(",") });
  };
  const save = async () => {
    if (!points.size) {
      toast.error("Chọn ít nhất một điểm trong nhóm");
      return;
    }
    setSaving(true);
    try {
      const saved = await apiRequest<TransitHubPolicy>("/api/transit-hub-policy", {
        method: "PUT",
        body: {
          groupPoints: [...points].join(","),
          groupHubOfficeCode: policy.groupHubOfficeCode ?? "",
          defaultHubOfficeCode: policy.defaultHubOfficeCode ?? "",
        },
      });
      rememberTransitHubPolicy(saved);
      setPolicy(saved);
      toast.success("Đã lưu VP trung chuyển");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Không lưu được cấu hình");
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <div>
        <h2 className="group-title sec-title">
          <span className="sec-ic" aria-hidden="true">
            <span className="ms">sync_alt</span>
          </span>
          Trung chuyển tỉnh đi tỉnh
        </h2>
        <div
          className="lab muted"
          title="Để trống VP thì hệ thống tìm theo tên 72 Trần Nhân Tông và 31A Nguyễn Quốc Trị."
        >
          Hai VP tỉnh giao cho nhau trong nhóm bên dưới thì qua VP nhóm. Các cặp tỉnh còn lại qua VP
          mặc định.
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {OFFICE_ITINERARY_POINTS.province.map((p) => (
          <label
            key={p.value}
            className={points.has(p.value) ? "choice on" : "choice"}
            title={p.label}
          >
            <input
              className="check"
              type="checkbox"
              checked={points.has(p.value)}
              disabled={!writable}
              onChange={(e) => togglePoint(p.value, e.target.checked)}
            />
            {p.value}
          </label>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
        <div className="field" style={{ flex: "1 1 240px", minWidth: 0 }}>
          <span className="l">VP trung chuyển của nhóm</span>
          <SearchableSelect
            value={policy.groupHubOfficeCode ?? ""}
            onValueChange={(v) => setPolicy({ ...policy, groupHubOfficeCode: v })}
            options={officeOptions}
            placeholder="72 Trần Nhân Tông"
            disabled={!writable}
          />
        </div>
        <div className="field" style={{ flex: "1 1 240px", minWidth: 0 }}>
          <span className="l">VP trung chuyển các tuyến tỉnh còn lại</span>
          <SearchableSelect
            value={policy.defaultHubOfficeCode ?? ""}
            onValueChange={(v) => setPolicy({ ...policy, defaultHubOfficeCode: v })}
            options={officeOptions}
            placeholder="31A Nguyễn Quốc Trị"
            disabled={!writable}
          />
        </div>
        {writable ? (
          <button type="button" className="btn tonal" disabled={saving} onClick={() => void save()}>
            {saving ? "Đang lưu…" : "Lưu cấu hình"}
          </button>
        ) : null}
      </div>
    </>
  );
}
