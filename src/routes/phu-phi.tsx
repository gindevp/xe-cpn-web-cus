import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { M3Page } from "@/components/M3Page";
import {
  useStore,
  DEFAULT_SURCHARGES,
  DEFAULT_COD_TIERS,
  type SurchargeConfig,
  type DoorFeeRule,
  type CodFeeTier,
  type DoorOverageSide,
} from "@/lib/store";
import { formatVND, parseVndInput } from "@/lib/mock-data";
import { MoneyInput } from "@/components/MoneyInput";
import { NumberInput } from "@/components/NumberInput";
import { toast } from "sonner";
import { isApiEnabled } from "@/lib/api/client";
import {
  fetchSurchargePolicy,
  putSurchargePolicy,
  fetchDoorFeeRules,
  persistDoorFeeRules,
} from "@/lib/api/finance-config-api";
import { useAuth } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";

export const Route = createFileRoute("/phu-phi")({
  head: () => ({
    meta: [
      { title: "Cài đặt phụ phí — X.E" },
      {
        name: "description",
        content:
          "Thiết lập các loại phụ phí: giao tận nơi, thu hộ COD, ship giao lại, bảo hiểm hàng hóa, hoàn đơn.",
      },
      { property: "og:title", content: "Cài đặt phụ phí — X.E" },
      { property: "og:description", content: "Thiết lập các loại phụ phí áp dụng cho đơn hàng." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Cài đặt phụ phí" screen="phu-phi" hidePageTitle>
      <M3Page>
        <Page />
      </M3Page>
    </ProtectedPage>
  ),
});

/** Ô nhập số có hậu tố đơn vị */
function NumBox({
  value,
  onChange,
  suffix,
  disabled,
  className = "w-40",
  money = false,
  name,
}: {
  value: number;
  onChange: (v: number) => void;
  suffix: string;
  disabled?: boolean;
  className?: string;
  money?: boolean;
  name?: string;
}) {
  const isMoney = money || suffix === "VNĐ";
  if (isMoney) {
    return (
      <MoneyInput
        name={name}
        value={value}
        onChange={onChange}
        suffix={suffix}
        disabled={disabled}
        className={className}
      />
    );
  }
  return (
    <div className={`relative ${className}`}>
      <NumberInput
        name={name}
        decimal
        min={0}
        disabled={disabled}
        className={suffix ? "h-9 pr-12 text-right" : "h-9 text-right"}
        value={Number.isFinite(value) ? value : 0}
        onChange={onChange}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        {suffix}
      </span>
    </div>
  );
}

/** Card phụ phí: tiêu đề `.sec-title` + công tắc áp dụng; tắt thì ẩn nội dung, hiện ghi chú. */
function FeeCard({
  icon,
  label,
  desc,
  enabled,
  onToggle,
  hint,
  gap,
  children,
}: {
  icon: string;
  label: string;
  desc?: React.ReactNode;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  hint?: string;
  gap?: number;
  children?: React.ReactNode;
}) {
  return (
    <section className="card stack" style={gap ? { gap } : undefined}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 className="group-title sec-title">
            <span className="sec-ic" aria-hidden="true">
              <span className="ms">{icon}</span>
            </span>
            {label}
          </h2>
          {desc && enabled ? <div className="lab muted">{desc}</div> : null}
        </div>
        <input
          className="switch"
          type="checkbox"
          aria-label={`Áp dụng ${label.toLowerCase()}`}
          title={enabled ? "Đang áp dụng" : "Đang tắt"}
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          style={{ marginTop: 6 }}
        />
      </div>
      {enabled ? children : hint ? <div className="lab muted">{hint}</div> : null}
    </section>
  );
}

function CodTiersEditor({
  tiers,
  onChange,
}: {
  tiers: CodFeeTier[];
  onChange: (tiers: CodFeeTier[]) => void;
}) {
  const rows = tiers.length ? tiers : DEFAULT_COD_TIERS;

  const patchAt = (idx: number, patch: Partial<CodFeeTier>) => {
    const next = rows.map((t, i) => (i === idx ? { ...t, ...patch } : { ...t }));
    // Giữ chuỗi bậc liền nhau: Đến mức i = Trên mức i+1
    if (patch.maxAmount != null && idx + 1 < next.length) {
      next[idx + 1] = { ...next[idx + 1], minAmount: Number(patch.maxAmount) || 0 };
    }
    if (patch.minAmount != null && idx > 0) {
      next[idx - 1] = { ...next[idx - 1], maxAmount: Number(patch.minAmount) || 0 };
    }
    onChange(next);
  };

  const addFixedBeforeLast = () => {
    const last = rows[rows.length - 1];
    const prev = rows[rows.length - 2] ?? rows[0];
    const min = Number(prev?.maxAmount ?? prev?.minAmount ?? 0);
    const mid = min + 5_000_000;
    const fixed: CodFeeTier = {
      minAmount: min,
      maxAmount: mid,
      feeAmount: 0,
      feePercent: null,
    };
    const open: CodFeeTier = {
      minAmount: mid,
      maxAmount: null,
      feeAmount: null,
      feePercent: last?.feePercent ?? 1,
    };
    const body = rows.slice(0, -1);
    if (body.length) body[body.length - 1] = { ...body[body.length - 1], maxAmount: min };
    onChange([...body, fixed, open]);
  };

  const removeAt = (idx: number) => {
    if (rows.length <= 2) {
      toast.error("Cần ít nhất 1 bậc cố định và 1 bậc %");
      return;
    }
    if (idx === rows.length - 1) {
      toast.error("Không xoá bậc % cuối — sửa % hoặc thêm bậc cố định phía trên");
      return;
    }
    const next = rows.filter((_, i) => i !== idx);
    if (idx > 0 && next[idx]) {
      next[idx] = { ...next[idx], minAmount: next[idx - 1].maxAmount ?? next[idx].minAmount };
    }
    onChange(next);
  };

  return (
    <>
      <div className="scroller">
        <table className="tbl" style={{ ["--tbl-min" as string]: "520px" }}>
          <thead>
            <tr>
              <th>Mức</th>
              <th>Từ / Trên (VND)</th>
              <th>Đến (VND)</th>
              <th>Phí thu hộ</th>
              <th aria-label="Tác vụ" />
            </tr>
          </thead>
          <tbody>
            {rows.map((t, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === rows.length - 1;
              const isPercent = isLast || (t.feePercent != null && t.feeAmount == null);
              return (
                <tr key={idx}>
                  <td className="main" style={{ whiteSpace: "nowrap", verticalAlign: "middle" }}>
                    Mức {idx + 1}
                  </td>
                  <td>
                    <MoneyInput
                      suffix=""
                      aria-label={`Mức ${idx + 1} ${isFirst ? "từ" : "trên"}`}
                      value={t.minAmount}
                      onChange={(v) => patchAt(idx, { minAmount: v })}
                      disabled={isFirst}
                    />
                  </td>
                  <td>
                    {isPercent ? (
                      <span className="muted" style={{ lineHeight: "36px" }}>
                        Không giới hạn
                      </span>
                    ) : (
                      <MoneyInput
                        suffix=""
                        aria-label={`Mức ${idx + 1} đến`}
                        value={t.maxAmount ?? 0}
                        onChange={(v) => patchAt(idx, { maxAmount: v })}
                      />
                    )}
                  </td>
                  <td>
                    <span className="unit-input">
                      {isPercent ? (
                        <NumBox
                          className="w-full"
                          value={t.feePercent ?? 0}
                          onChange={(v) =>
                            patchAt(idx, { feePercent: v, feeAmount: null, maxAmount: null })
                          }
                          suffix=""
                        />
                      ) : (
                        <MoneyInput
                          suffix=""
                          aria-label={`Mức ${idx + 1} phí thu hộ`}
                          value={t.feeAmount ?? 0}
                          onChange={(v) => patchAt(idx, { feeAmount: v, feePercent: null })}
                        />
                      )}
                      <span className="muted">{isPercent ? "%" : "VND"}</span>
                    </span>
                  </td>
                  <td style={{ verticalAlign: "middle" }}>
                    <div className="act">
                      <button
                        type="button"
                        className="no"
                        aria-label={`Xoá mức ${idx + 1}`}
                        title="Xoá mức"
                        disabled={isFirst || isLast}
                        style={isFirst || isLast ? { visibility: "hidden" } : undefined}
                        onClick={() => removeAt(idx)}
                      >
                        <span className="ms" aria-hidden="true">
                          delete
                        </span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="btn tonal"
        style={{ alignSelf: "flex-start" }}
        onClick={addFixedBeforeLast}
      >
        <span className="ms" aria-hidden="true">
          add
        </span>
        Thêm mức cố định
      </button>
    </>
  );
}

function normalizeSurcharge(raw?: SurchargeConfig | null): SurchargeConfig {
  return {
    ...DEFAULT_SURCHARGES,
    ...(raw ?? {}),
    cod: {
      ...DEFAULT_SURCHARGES.cod,
      ...(raw?.cod ?? {}),
      tiers: raw?.cod?.tiers?.length
        ? raw.cod.tiers.map((t) => ({ ...t }))
        : DEFAULT_COD_TIERS.map((t) => ({ ...t })),
    },
    doorOverage: {
      pickup: { ...DEFAULT_SURCHARGES.doorOverage.pickup, ...(raw?.doorOverage?.pickup ?? {}) },
      delivery: {
        ...DEFAULT_SURCHARGES.doorOverage.delivery,
        ...(raw?.doorOverage?.delivery ?? {}),
      },
    },
  };
}

function Page() {
  const { session } = useAuth();
  const writable = canWrite(session?.role, "phu-phi");
  const [f, setF] = useState<SurchargeConfig>(() =>
    normalizeSurcharge(useStore.getState().surcharges),
  );
  const overageRef = useRef(f.doorOverage ?? DEFAULT_SURCHARGES.doorOverage);
  const [doorDraft, setDoorDraft] = useState<DoorFeeRule[]>(() => [
    ...(useStore.getState().doorFees ?? []),
  ]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (isApiEnabled()) {
          const [s, d] = await Promise.all([fetchSurchargePolicy(), fetchDoorFeeRules()]);
          if (cancelled) return;
          useStore.setState({ surcharges: s, doorFees: d });
          setF(normalizeSurcharge(s));
          overageRef.current = s.doorOverage ?? DEFAULT_SURCHARGES.doorOverage;
          setDoorDraft(d.map((r) => ({ ...r })));
        } else {
          setF(normalizeSurcharge(useStore.getState().surcharges));
          setDoorDraft([...(useStore.getState().doorFees ?? [])]);
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Không tải được cài đặt phụ phí từ máy chủ");
        setF(normalizeSurcharge(useStore.getState().surcharges));
        setDoorDraft([...(useStore.getState().doorFees ?? [])]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = <K extends keyof SurchargeConfig>(k: K, v: Partial<SurchargeConfig[K]>) =>
    setF((s) => ({ ...s, [k]: { ...(s[k] as object), ...v } }) as SurchargeConfig);

  const captureOverageFromInputs = () => {
    const side = document.getElementById("door-overage")?.getAttribute("data-over-side");
    if (side !== "pickup" && side !== "delivery") return;
    const readStep = (key: string) => {
      const el = document.querySelector<HTMLInputElement>(`input[name="over-${side}-${key}"]`);
      if (!el) return undefined;
      const n = Number(el.value.trim().replace(",", "."));
      return Number.isFinite(n) ? n : 0;
    };
    const readFee = (key: string) => {
      const el = document.querySelector<HTMLInputElement>(`input[name="over-${side}-${key}"]`);
      if (!el) return undefined;
      return parseVndInput(el.value);
    };
    const current = {
      pickup: { ...DEFAULT_SURCHARGES.doorOverage.pickup, ...overageRef.current?.pickup },
      delivery: { ...DEFAULT_SURCHARGES.doorOverage.delivery, ...overageRef.current?.delivery },
    };
    current[side] = {
      kgStep: readStep("kgStep") ?? current[side].kgStep,
      kgFee: readFee("kgFee") ?? current[side].kgFee,
      kmStep: readStep("kmStep") ?? current[side].kmStep,
      kmFee: readFee("kmFee") ?? current[side].kmFee,
    };
    overageRef.current = current;
  };

  const save = async () => {
    if (!writable) {
      toast.error("Tài khoản không có quyền ghi màn này");
      return;
    }
    setSaving(true);
    try {
      if (!isApiEnabled()) throw new Error("API chưa cấu hình — không lưu được lên máy chủ");
      captureOverageFromInputs();
      const payload: SurchargeConfig = {
        ...f,
        doorOverage: {
          pickup: { ...DEFAULT_SURCHARGES.doorOverage.pickup, ...overageRef.current?.pickup },
          delivery: { ...DEFAULT_SURCHARGES.doorOverage.delivery, ...overageRef.current?.delivery },
        },
      };
      const prevDoors = useStore.getState().doorFees ?? [];
      const saved = await putSurchargePolicy(payload);
      const echo = saved.doorOverage ?? payload.doorOverage;
      const mismatch =
        echo.pickup.kgStep !== payload.doorOverage.pickup.kgStep ||
        echo.pickup.kgFee !== payload.doorOverage.pickup.kgFee ||
        echo.pickup.kmStep !== payload.doorOverage.pickup.kmStep ||
        echo.pickup.kmFee !== payload.doorOverage.pickup.kmFee ||
        echo.delivery.kgStep !== payload.doorOverage.delivery.kgStep ||
        echo.delivery.kgFee !== payload.doorOverage.delivery.kgFee ||
        echo.delivery.kmStep !== payload.doorOverage.delivery.kmStep ||
        echo.delivery.kmFee !== payload.doorOverage.delivery.kmFee;
      if (mismatch) {
        throw new Error(
          "Máy chủ không ghi được vượt cân/km. Kiểm tra API đã cập nhật rồi tải lại trang.",
        );
      }
      const doors = await persistDoorFeeRules(doorDraft, prevDoors);
      useStore.setState({ surcharges: saved, doorFees: doors });
      overageRef.current = saved.doorOverage ?? payload.doorOverage;
      setF(normalizeSurcharge({ ...saved, doorOverage: overageRef.current }));
      setDoorDraft(doors.map((r) => ({ ...r })));
      toast.success("Đã lưu cài đặt phụ phí");
    } catch (e: any) {
      toast.error(e?.message ?? "Lưu phụ phí thất bại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="title-row" style={{ marginTop: 0 }}>
        <div>
          <h1 className="page-title">Cài đặt phụ phí</h1>
          {f.updatedAt ? (
            <div className="lab muted num">
              Cập nhật lần cuối: {new Date(f.updatedAt).toLocaleString("vi-VN")}
            </div>
          ) : loading ? (
            <div className="lab muted">Đang tải cài đặt từ máy chủ…</div>
          ) : null}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            className="btn ghost"
            disabled={saving || loading}
            onClick={() => setF(normalizeSurcharge(DEFAULT_SURCHARGES))}
          >
            Khôi phục mặc định
          </button>
          <button
            type="button"
            className="btn"
            disabled={saving || loading || !writable}
            onMouseDown={captureOverageFromInputs}
            onClick={() => void save()}
          >
            {saving ? "Đang lưu…" : "Lưu cài đặt"}
          </button>
        </div>
      </div>

      <div className="fee-layout">
        <FeeCard
          icon="payments"
          label="Phí thu hộ COD"
          desc={
            'Mức 1 gồm biên trên. Từ mức 2 là trên mức dưới. Mức cuối không có "Đến": phí = % x tiền thu hộ.'
          }
          enabled={f.cod.enabled}
          onToggle={(v) => patch("cod", { enabled: v })}
          hint="Không thu phí thu hộ."
        >
          <CodTiersEditor
            tiers={f.cod.tiers?.length ? f.cod.tiers : DEFAULT_COD_TIERS}
            onChange={(tiers) => {
              const last = tiers[tiers.length - 1];
              patch("cod", {
                tiers,
                percent: last?.feePercent ?? f.cod.percent,
              });
            }}
          />
        </FeeCard>

        <div className="stack">
          <FeeCard
            icon="warehouse"
            label="Phí tồn kho tại kho giao"
            enabled={f.storage.enabled}
            onToggle={(v) => patch("storage", { enabled: v })}
            hint="Không thu phí tồn kho."
            gap={12}
          >
            <div className="sentence num">
              Miễn phí
              <NumBox
                className="w-24"
                value={f.storage.freeDays}
                onChange={(v) => patch("storage", { freeDays: v })}
                suffix=""
              />
              ngày kể từ ngày hàng đến kho giao, sau đó thu
              <MoneyInput
                className="w-28"
                suffix=""
                aria-label="Phí mỗi ngày"
                value={f.storage.feePerDay}
                onChange={(v) => patch("storage", { feePerDay: v })}
              />
              VND/ngày
            </div>
          </FeeCard>
          <FeeCard
            icon="verified_user"
            label="Hàng hoá khai báo giá trị"
            enabled={f.insurance.enabled}
            onToggle={(v) => patch("insurance", { enabled: v })}
            hint="Kèm hoá đơn, chứng từ thể hiện giá trị khai báo."
            gap={12}
          >
            <div className="sentence num">
              Giá trị khai báo dưới
              <MoneyInput
                className="w-28"
                suffix=""
                aria-label="Ngưỡng giá trị khai báo"
                value={f.insurance.threshold}
                onChange={(v) => patch("insurance", { threshold: v })}
              />
              VND thu
              <NumBox
                className="w-16"
                value={f.insurance.percentUnder}
                onChange={(v) => patch("insurance", { percentUnder: v })}
                suffix=""
              />
              % x giá trị khai báo
            </div>
            <div className="sentence num">
              Giá trị khai báo trên {formatVND(f.insurance.threshold).replace(/\s*₫?$/, "")} VND thu
              <NumBox
                className="w-16"
                value={f.insurance.percentOver}
                onChange={(v) => patch("insurance", { percentOver: v })}
                suffix=""
              />
              % x giá trị khai báo
            </div>
          </FeeCard>
          <FeeCard
            icon="undo"
            label="Phí hoàn đơn"
            enabled={f.refund.enabled}
            onToggle={(v) => patch("refund", { enabled: v })}
            hint="Không thu phí hoàn đơn."
            gap={12}
          >
            <div className="sentence num">
              <NumBox
                className="w-16"
                value={f.refund.percent}
                onChange={(v) => patch("refund", { percent: v })}
                suffix=""
              />
              % x Phí vận chuyển
            </div>
          </FeeCard>
        </div>
      </div>

      <DoorFeeTable
        rows={doorDraft}
        onChange={setDoorDraft}
        overage={f.doorOverage ?? DEFAULT_SURCHARGES.doorOverage}
        onOverage={(side, p) => {
          const next = {
            pickup: { ...DEFAULT_SURCHARGES.doorOverage.pickup, ...overageRef.current?.pickup },
            delivery: {
              ...DEFAULT_SURCHARGES.doorOverage.delivery,
              ...overageRef.current?.delivery,
            },
          };
          next[side] = { ...next[side], ...p };
          overageRef.current = next;
          patch("doorOverage", next);
        }}
        disabled={!writable || loading || saving}
      />
    </div>
  );
}

/** Bảng phí lấy / giao hàng tận nơi theo khoảng cân × khoảng cách — chỉ sửa local, lưu cùng nút Lưu cài đặt */
function DoorFeeTable({
  rows: doorFees,
  onChange,
  overage,
  onOverage,
  disabled,
}: {
  rows: DoorFeeRule[];
  onChange: (rows: DoorFeeRule[]) => void;
  overage: { pickup: DoorOverageSide; delivery: DoorOverageSide };
  onOverage: (side: "pickup" | "delivery", p: Partial<DoorOverageSide>) => void;
  disabled?: boolean;
}) {
  const [kind, setKind] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const side = kind === "DELIVERY" ? "delivery" : "pickup";
  const band = overage[side];
  const rows = doorFees.filter((r) => r.kind === kind);

  const patchRow = (id: string, p: Partial<DoorFeeRule>) =>
    onChange(doorFees.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const addRow = () =>
    onChange([
      ...doorFees,
      { id: `${kind}-${Date.now()}`, kind, minKg: 0, maxKg: 5, minKm: 0, maxKm: 3, fee: 20000 },
    ]);

  return (
    <section className="card stack">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <h2 className="group-title sec-title">
          <span className="sec-ic" aria-hidden="true">
            <span className="ms">local_shipping</span>
          </span>
          Bảng phí lấy / giao hàng tận nơi
        </h2>
        <div
          className="seg"
          role="tablist"
          aria-label="Loại phí tận nơi"
          style={{ background: "var(--low)" }}
        >
          <button
            type="button"
            role="tab"
            className={kind === "PICKUP" ? "on" : undefined}
            aria-selected={kind === "PICKUP"}
            onClick={() => setKind("PICKUP")}
          >
            Lấy tận nơi
          </button>
          <button
            type="button"
            role="tab"
            className={kind === "DELIVERY" ? "on" : undefined}
            aria-selected={kind === "DELIVERY"}
            onClick={() => setKind("DELIVERY")}
          >
            Giao tận nơi
          </button>
        </div>
      </div>
      <div className="scroller">
        <table className="tbl" style={{ ["--tbl-min" as string]: "620px" }}>
          <thead>
            <tr>
              <th>Khoảng cân (kg)</th>
              <th>Khoảng cách (km)</th>
              <th className="r">Phí (VND)</th>
              <th className="r">Tác vụ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="sentence num" style={{ flexWrap: "nowrap" }}>
                    <NumBox
                      value={r.minKg}
                      onChange={(v) => patchRow(r.id, { minKg: v })}
                      suffix=""
                      className="w-20"
                      disabled={disabled}
                    />
                    <span className="muted">–</span>
                    <NumBox
                      value={r.maxKg}
                      onChange={(v) => patchRow(r.id, { maxKg: v })}
                      suffix=""
                      className="w-20"
                      disabled={disabled}
                    />
                  </span>
                </td>
                <td>
                  <span className="sentence num" style={{ flexWrap: "nowrap" }}>
                    <NumBox
                      value={r.minKm}
                      onChange={(v) => patchRow(r.id, { minKm: v })}
                      suffix=""
                      className="w-20"
                      disabled={disabled}
                    />
                    <span className="muted">–</span>
                    <NumBox
                      value={r.maxKm}
                      onChange={(v) => patchRow(r.id, { maxKm: v })}
                      suffix=""
                      className="w-20"
                      disabled={disabled}
                    />
                  </span>
                </td>
                <td className="r">
                  <MoneyInput
                    className="ml-auto w-32"
                    suffix=""
                    aria-label="Phí"
                    value={r.fee}
                    onChange={(v) => patchRow(r.id, { fee: v })}
                    disabled={disabled}
                  />
                </td>
                <td style={{ verticalAlign: "middle" }}>
                  <div className="act">
                    <button
                      type="button"
                      className="no"
                      aria-label="Xoá dòng"
                      title="Xoá"
                      disabled={disabled}
                      onClick={() => onChange(doorFees.filter((x) => x.id !== r.id))}
                    >
                      <span className="ms" aria-hidden="true">
                        delete
                      </span>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="btn tonal"
        style={{ alignSelf: "flex-start" }}
        onClick={addRow}
        disabled={disabled}
      >
        <span className="ms" aria-hidden="true">
          add
        </span>
        Thêm dòng
      </button>
      <div id="door-overage" data-over-side={side} className="stack" style={{ gap: 12 }}>
        <div className="sentence num">
          Vượt cân bậc cuối: mỗi
          <NumBox
            name={`over-${side}-kgStep`}
            value={band.kgStep}
            onChange={(v) => onOverage(side, { kgStep: v })}
            suffix=""
            className="w-16"
            disabled={disabled}
          />
          kg cộng thêm
          <NumBox
            name={`over-${side}-kgFee`}
            value={band.kgFee}
            onChange={(v) => onOverage(side, { kgFee: v })}
            suffix=""
            money
            className="w-28"
            disabled={disabled}
          />
          VND
        </div>
        <div className="sentence num">
          Vượt km bậc cuối: mỗi
          <NumBox
            name={`over-${side}-kmStep`}
            value={band.kmStep}
            onChange={(v) => onOverage(side, { kmStep: v })}
            suffix=""
            className="w-16"
            disabled={disabled}
          />
          km cộng thêm
          <NumBox
            name={`over-${side}-kmFee`}
            value={band.kmFee}
            onChange={(v) => onOverage(side, { kmFee: v })}
            suffix=""
            money
            className="w-28"
            disabled={disabled}
          />
          VND
        </div>
      </div>
      <div className="note">
        Khớp đúng khoảng cân và km thì lấy phí dòng đó. Vượt bậc cuối chỉ áp dụng cho tab đang chọn.
        Bước bằng 0 thì không cộng. Lưu cùng nút Lưu cài đặt.
      </div>
    </section>
  );
}
