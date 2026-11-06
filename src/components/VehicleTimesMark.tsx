import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { M3ConfirmActions, M3Sheet, M3SheetTitle } from "@/components/m3/M3Sheet";
import {
  getVehicleDayTrips,
  getVehicleItineraries,
  reportVehicleEvent,
  type ItineraryOption,
  type VehicleDayItem,
} from "@/lib/api/vehicle-events-api";
import { useStore } from "@/lib/store";
import { assignedOfficeCode, hasAllOfficeScope, resolveViewOffice } from "@/lib/office-scope";

const ITINERARY_KEY = "vehicleTimes.itinerary";
const LATE_MINUTES = 5;
const DWELL_REASONS = [
  "Không rõ nguyên nhân",
  "Tắc đường",
  "Xe tuyến về muộn",
  "Đợi khách",
  "Chờ phát sinh khách",
  "Tránh công an",
  "Bị công an bắt",
  "Lái xe thu tiền",
  "Lái xe ăn trưa",
  "VPHH bốc hàng",
] as const;

function pickupOf(it: VehicleDayItem) {
  return it.pickupAt || it.plannedDepartAt || null;
}

function lateMinutes(pickupAt?: string | null, nowMs = Date.now()): number | null {
  if (!pickupAt) return null;
  const t = Date.parse(pickupAt);
  return Number.isNaN(t) ? null : Math.trunc((nowMs - t) / 60000);
}

function hhmm(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function plateKey(s?: string | null) {
  return (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

type Confirm = { item: VehicleDayItem; type: "ARRIVE" | "DEPART" };

/** Chấm xe đến/rời đúng như app, không chụp ảnh. */
export function VehicleTimesMark({ readOnly = false }: { readOnly?: boolean }) {
  const session = useStore((s) => s.session);
  const viewOffice = useStore((s) => s.viewOffice);
  const wide = hasAllOfficeScope(session);
  const officeCode = wide ? assignedOfficeCode(resolveViewOffice(session, viewOffice)) : "";
  const waitingForOffice = wide && !officeCode;
  const [itineraries, setItineraries] = useState<ItineraryOption[]>([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [itinerary, setItinerary] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<VehicleDayItem[]>([]);
  const [officeName, setOfficeName] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  /** Cập nhật để tính muộn khi chấm rời (lý do lưu trú). */
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setItinerary("");
    setItems([]);
    setOfficeName("");
    if (waitingForOffice) {
      setItineraries([]);
      setRoutesLoading(false);
      return;
    }
    let alive = true;
    setRoutesLoading(true);
    void (async () => {
      try {
        const rows = await getVehicleItineraries(officeCode);
        if (!alive) return;
        const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name, "vi"));
        setItineraries(sorted);
        const saved = localStorage.getItem(`${ITINERARY_KEY}.${officeCode}`);
        const pick = sorted.find((it) => it.code === saved) ?? sorted[0];
        setItinerary(pick?.code ?? "");
      } catch (e) {
        if (alive) {
          setItineraries([]);
          setItinerary("");
          toast.error(e instanceof Error ? e.message : "Không tải được lộ trình");
        }
      } finally {
        if (alive) setRoutesLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [officeCode, waitingForOffice]);

  const load = useCallback(async () => {
    if (!itinerary) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const board = await getVehicleDayTrips(itinerary, officeCode);
      setItems(board.items);
      setOfficeName(board.officeName || board.officeCode || "");
    } catch (e) {
      setItems([]);
      toast.error(e instanceof Error ? e.message : "Không tải được danh sách xe");
    } finally {
      setLoading(false);
    }
  }, [itinerary, officeCode]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const q = plateKey(query);
    if (!q) return items;
    return items.filter((it) => plateKey(it.vehiclePlate).includes(q));
  }, [items, query]);

  const late = confirm?.type === "DEPART" ? lateMinutes(pickupOf(confirm.item), nowMs) : null;
  const needReason = late != null && late >= LATE_MINUTES;
  const canSubmit = !needReason || !!reason.trim();

  const openConfirm = (item: VehicleDayItem, type: Confirm["type"]) => {
    setReason("");
    setConfirm({ item, type });
  };

  const pickItinerary = (code: string) => {
    setItinerary(code);
    localStorage.setItem(`${ITINERARY_KEY}.${officeCode}`, code);
  };

  const submit = async () => {
    if (!confirm || busy || !canSubmit) return;
    const { item, type } = confirm;
    setBusy(true);
    try {
      const saved = await reportVehicleEvent({
        eventType: type,
        externalTripId: item.externalTripId,
        vehiclePlate: item.vehiclePlate,
        driverName: item.driverName,
        routeLabel: item.routeLabel,
        plannedDepartAt: item.plannedDepartAt,
        itineraryCode: itinerary,
        officeCode,
        ...(needReason ? { reason: reason.trim() } : {}),
      });
      setItems((prev) =>
        prev.map((it) =>
          it.externalTripId !== item.externalTripId
            ? it
            : type === "ARRIVE"
              ? { ...it, arrivedAt: saved.reportedAt, arrivedBy: saved.reportedBy }
              : { ...it, departedAt: saved.reportedAt, departedBy: saved.reportedBy },
        ),
      );
      toast.success(
        `${item.vehiclePlate || "Xe"} ${type === "ARRIVE" ? "đã đến" : "đã rời"} văn phòng lúc ${hhmm(saved.reportedAt)}`,
      );
      setConfirm(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không ghi nhận được");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      {itineraries.length > 0 ? (
        <div className="seg lo" role="tablist" aria-label="Lộ trình" style={{ alignSelf: "flex-start" }}>
          {itineraries.map((it) => (
            <button
              key={it.code}
              type="button"
              role="tab"
              className={it.code === itinerary ? "on" : undefined}
              aria-selected={it.code === itinerary}
              onClick={() => pickItinerary(it.code)}
            >
              {it.name}
            </button>
          ))}
        </div>
      ) : routesLoading || waitingForOffice ? null : (
        <p className="lab muted">Không có lộ trình nào đi hoặc đến văn phòng của bạn.</p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <label className="box input-box" style={{ flex: "1 1 240px", maxWidth: 420 }}>
          <span className="ms muted" aria-hidden="true">
            search
          </span>
          <input
            type="search"
            aria-label="Tìm biển số"
            placeholder="Tìm biển số"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ textTransform: "uppercase" }}
          />
        </label>
        <button type="button" className="btn tonal" onClick={() => void load()} disabled={loading || !itinerary}>
          <span className="ms" aria-hidden="true">
            refresh
          </span>
          Tải lại
        </button>
      </div>

      <h3 className="group-title num">
        Danh sách xe hôm nay{officeName ? ` · ${officeName}` : ""}
        {shown.length ? ` (${shown.length})` : ""}
      </h3>

      {loading ? (
        <p className="lab muted" style={{ padding: "32px 0", textAlign: "center" }}>
          Đang tải…
        </p>
      ) : waitingForOffice ? (
        <p className="lab muted" style={{ padding: "32px 0", textAlign: "center" }}>
          Chọn một văn phòng ở góc trên để chấm xe của VP đó.
        </p>
      ) : !itinerary ? (
        <p className="lab muted" style={{ padding: "32px 0", textAlign: "center" }}>
          Chọn lộ trình để xem danh sách xe.
        </p>
      ) : shown.length === 0 ? (
        <div className="empty">
          <h3 className="group-title">{query ? "Không tìm thấy biển số phù hợp" : "Không có xe nào hôm nay"}</h3>
        </div>
      ) : (
        <div className="cham-grid">
          {shown.map((it) => {
            const meta = [it.driverName, pickupOf(it) ? `Xuất bến ${hhmm(pickupOf(it))}` : ""]
              .filter(Boolean)
              .join(" • ");
            const depLate =
              it.departedAt && pickupOf(it)
                ? (lateMinutes(pickupOf(it), Date.parse(it.departedAt)) ?? 0) >= LATE_MINUTES
                : false;
            return (
              <article key={it.externalTripId} className="cham-card">
                <div className="who">
                  <span className="rev-ic sm" aria-hidden="true">
                    <span className="ms fill">local_shipping</span>
                  </span>
                  <span className="cham-plate num">{it.vehiclePlate || "Chưa có biển số"}</span>
                </div>
                {meta ? <div className="lab muted num">{meta}</div> : null}
                {it.arrivedAt ? (
                  <div className="cham-ok num">
                    <span className="ms" aria-hidden="true">
                      check_circle
                    </span>
                    <span>Đã đến lúc {hhmm(it.arrivedAt)}</span>
                  </div>
                ) : null}
                {it.departedAt ? (
                  <div className={depLate ? "cham-late num" : "cham-ok num"}>
                    <span className="ms" aria-hidden="true">
                      {depLate ? "schedule" : "check_circle"}
                    </span>
                    <span>Đã rời lúc {hhmm(it.departedAt)}</span>
                  </div>
                ) : null}
                {readOnly ? null : !it.arrivedAt ? (
                  <button type="button" className="btn cham-btn" onClick={() => openConfirm(it, "ARRIVE")}>
                    Xe đến VP
                  </button>
                ) : !it.departedAt ? (
                  <button type="button" className="btn cham-btn" onClick={() => openConfirm(it, "DEPART")}>
                    Xe rời VP
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <M3Sheet
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirm(null);
        }}
        variant="confirm"
      >
        <M3SheetTitle>
          {needReason
            ? `Xe rời muộn ${late ?? 0} phút`
            : confirm?.type === "ARRIVE"
              ? "Xác nhận xe đã đến văn phòng?"
              : "Xác nhận xe đã rời văn phòng?"}
        </M3SheetTitle>
        {needReason ? (
          <p className="lab muted num" style={{ margin: 0 }}>
            {confirm?.item.vehiclePlate || "Xe"} — giờ đón {hhmm(pickupOf(confirm!.item)) || "—"}. Rời muộn từ{" "}
            {LATE_MINUTES} phút phải nhập lý do.
          </p>
        ) : confirm?.item.vehiclePlate ? (
          <p className="lab muted" style={{ margin: 0, fontWeight: 600 }}>
            {confirm.item.vehiclePlate}
          </p>
        ) : null}
        {needReason ? (
          <>
            <label className="field cfg-field">
              <span className="l">Lý do *</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {DWELL_REASONS.map((r) => {
                  const on = reason.trim() === r;
                  return (
                    <button key={r} type="button" className={on ? "pill on" : "pill sm"} onClick={() => setReason(r)}>
                      {r}
                    </button>
                  );
                })}
              </div>
            </label>
            <label className="field cfg-field">
              <span className="l">Ghi chú / lý do khác</span>
              <textarea
                className="area"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Chọn nhanh ở trên hoặc tự nhập"
                maxLength={500}
              />
            </label>
          </>
        ) : null}
        <M3ConfirmActions>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => setConfirm(null)}>
            {needReason ? "Đóng" : "Quay lại"}
          </button>
          <button type="button" className="btn" disabled={busy || !canSubmit} onClick={() => void submit()}>
            {busy ? "Đang ghi…" : needReason ? "Lưu giờ rời" : "Xác nhận"}
          </button>
        </M3ConfirmActions>
      </M3Sheet>
    </div>
  );
}
