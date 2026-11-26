import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { askConfirm } from "@/components/m3/askConfirm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NameInput } from "@/components/NameInput";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStore } from "@/lib/store";
import { useBranchItineraryMaster } from "@/lib/use-branch-itinerary";
import { isApiEnabled } from "@/lib/api/client";
import type { AvailableTrip } from "@/lib/api/domain-api";
import { toast } from "sonner";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { isValidVnPlate, normalizePlate } from "@/lib/vehicle-plate";
import {
  createLinehaulPartnerVehicle,
  fetchLinehaulPartnerVehicles,
  LINEHAUL_PARTNER_LABEL,
  LINEHAUL_PARTNER_VEXERE,
  type LinehaulPartnerVehicle,
} from "@/lib/api/linehaul-api";

function formatTripClock(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Khớp BE VthkTripSearchClient: cửa sổ gửi CRM = [now-2h, now+3h] (giờ VN). */
const VTHK_BEFORE_HOURS = 2;
const VTHK_AFTER_HOURS = 3;

function vthkSearchWindow(now = new Date()) {
  const from = new Date(now.getTime() - VTHK_BEFORE_HOURS * 3_600_000);
  const to = new Date(now.getTime() + VTHK_AFTER_HOURS * 3_600_000);
  return { from, to };
}

const GIO_CHAY_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  const m = i % 2 === 0 ? "00" : "30";
  const v = `${h}:${m}`;
  return { value: v, label: v };
});

const TAI_TRONG_OPTIONS = ["1.5 tấn", "2.5 tấn", "5 tấn", "8 tấn", "10 tấn", "15 tấn"];

function truckTypeFromTaiTrong(taiTrong: string): { vehicleType: string; capacity: number } {
  const n = Number.parseFloat(taiTrong.replace(",", "."));
  const tons = Number.isFinite(n) ? n : 5;
  return {
    vehicleType: `Xe tải ${taiTrong}`,
    capacity: Math.round(tons * 1000),
  };
}

/** Giờ chạy lấy mốc gần hiện tại nhất: đã qua dưới 12 tiếng là hôm nay (gán muộn), còn lại là ngày mai. */
const LATE_DEPART_GRACE_MS = 12 * 60 * 60_000;

function departAtFromGioChay(gioChay: string): string {
  const [hh, mm] = gioChay.split(":").map((x) => Number(x));
  const d = new Date();
  d.setHours(hh || 0, mm || 0, 0, 0);
  if (d.getTime() < Date.now() - LATE_DEPART_GRACE_MS) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString();
}

/** Dialog lồng — Radix quản lý focus; tránh portal custom bị parent Dialog chặn thao tác. */
function NestedFormOverlay({
  open,
  title,
  onClose,
  children,
  onSave,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="z-[60] max-w-lg gap-4">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 max-h-[min(60vh,420px)] overflow-y-auto">{children}</div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="button" onClick={onSave}>
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type VthkPick = {
  tab: "vthk";
  trip: AvailableTrip;
  branchName: string;
  itineraryName?: string;
};

export type VthhPick = {
  tab: "vthh";
  /** Chỉ để audit: xe limo nhập tay hay xe tải master. */
  source: "MANUAL_LIMO" | "TRUCK";
  plate: string;
  vehicleId?: number;
  driver: string;
  route: string;
  /** VTHK branch name — matched to master Route by name, not a hub code. */
  branchName?: string;
  departAt: string;
};

export type AssignVehiclePick = VthkPick | VthhPick | null;

export function tripItineraryLabel(pick: AssignVehiclePick): string {
  if (!pick) return "";
  if (pick.tab === "vthk") {
    const parts = [pick.branchName?.trim(), pick.itineraryName?.trim()].filter(Boolean) as string[];
    const uniq: string[] = [];
    for (const p of parts) {
      if (!uniq.includes(p)) uniq.push(p);
    }
    return uniq.join(" · ").slice(0, 160);
  }
  return (pick.route || "").trim().slice(0, 160);
}

export function vthkTripKey(t: AvailableTrip): string {
  return [
    String(t.externalTripId ?? ""),
    t.departAt ?? "",
    t.vehiclePlate || "",
    t.timeSlot || "",
  ].join("|");
}

export function realVehiclePlate(raw?: string | null): string {
  const p = raw?.trim() ?? "";
  if (!p) return "";
  if (/^CH[0-9A-Z]+$/i.test(p)) return "";
  if (/^chưa gán/i.test(p)) return "";
  return p;
}

/** Trường audit gửi kèm `POST /api/trips`. */
export function tripAuditFields(pick: AssignVehiclePick): {
  vehicleSource?: string;
  externalTripId?: string;
} {
  if (!pick) return {};
  if (pick.tab === "vthk") {
    return { vehicleSource: "VTHK", externalTripId: pick.trip.externalTripId || undefined };
  }
  return { vehicleSource: pick.source };
}

export function realDriverName(raw?: string | null): string {
  const d = raw?.trim() ?? "";
  if (!d) return "";
  if (/^chưa gán/i.test(d)) return "";
  return d;
}

const OPEN_TRIP = new Set(["CREATED", "LOADING", "DEPARTED", "UNLOADING"]);

const vnDay = (ms: number) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);

/** Giờ xuất phát dùng để so chuyến: xe tải không chọn giờ → chỉ so ngày. */
export function pickDepartMatch(pick: AssignVehiclePick): {
  departAt?: string;
  exactTime: boolean;
} {
  if (!pick) return { exactTime: false };
  if (pick.tab === "vthk")
    return { departAt: pick.trip.departAt, exactTime: Boolean(pick.trip.departAt) };
  return { departAt: pick.departAt, exactTime: pick.source === "MANUAL_LIMO" };
}

/** Cùng xe nhưng khác ngày / giờ xuất bến là chuyến khác — không gán nhầm vào chuyến cũ. */
export function findOpenTripByPlate<T extends { bks: string; status: string; departAt?: string }>(
  trips: T[],
  plate: string,
  match: { departAt?: string; exactTime: boolean },
): T | undefined {
  const p = normalizePlate(realVehiclePlate(plate));
  if (!p) return undefined;
  const want = match.departAt ? new Date(match.departAt).getTime() : NaN;
  const wantDay = vnDay(Number.isNaN(want) ? Date.now() : want);
  return trips.find((t) => {
    if (!OPEN_TRIP.has(t.status) || normalizePlate(realVehiclePlate(t.bks)) !== p) return false;
    const got = t.departAt ? new Date(t.departAt).getTime() : NaN;
    if (Number.isNaN(got) || vnDay(got) !== wantDay) return false;
    return !match.exactTime || Number.isNaN(want) || Math.abs(got - want) < 60_000;
  });
}

function TripCard({
  active,
  headline,
  plate,
  driver,
  loadKg,
  loadCount,
  onClick,
}: {
  active: boolean;
  headline: string;
  plate: string;
  driver: string;
  loadKg: number;
  loadCount: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "box-border flex h-[96px] w-[168px] shrink-0 flex-col overflow-hidden rounded-lg border bg-background px-3 py-2.5 text-left transition",
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "hover:border-primary/40 hover:bg-accent/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 truncate text-sm font-semibold leading-snug">{headline}</div>
        {active && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
      </div>
      <div className="mt-1 truncate text-sm font-medium">{plate}</div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">{driver}</div>
      <div className="mt-auto truncate pt-1 text-xs text-muted-foreground">
        {loadKg.toFixed(0)}kg - {loadCount} đơn
      </div>
    </button>
  );
}

function AddManualCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="box-border flex h-[96px] w-[140px] shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-dashed border-muted-foreground/40 px-3 py-2.5 text-primary transition hover:border-primary/50 hover:bg-primary/5"
    >
      <Plus className="h-6 w-6 shrink-0" />
      <span className="text-center text-xs font-medium leading-tight">Thêm xe thủ công</span>
    </button>
  );
}

/** Hàng thẻ 1 dòng, cuộn ngang — scrollbar nằm dưới thẻ, không che mép. */
function VehicleRow({ children }: { children: ReactNode }) {
  return (
    <div className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:auto]">
      <div className="mb-2 flex w-max flex-nowrap items-stretch gap-2">{children}</div>
    </div>
  );
}

export function AssignVehiclePicker({
  open,
  onPick,
  presetBranch,
  presetItinerary,
  partnerMode = false,
  partnerCodeHint,
}: {
  open: boolean;
  onPick: (pick: AssignVehiclePick) => void;
  /** Tự fill từ lộ trình đơn đã chọn — ẩn dropdown chọn tay. */
  presetBranch?: string;
  presetItinerary?: string;
  /** Đơn giao qua đối tác: chỉ tab xe tải đối tác. */
  partnerMode?: boolean;
  /** Mã đối tác suy ra từ đơn đã chọn (khi thêm xe thủ công). */
  partnerCodeHint?: string;
}) {
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const [tab, setTab] = useState<"vthk" | "vthh">(partnerMode ? "vthh" : "vthk");
  const [branch, setBranch] = useState("");
  const [itinerary, setItinerary] = useState("");
  const lockRoute = Boolean(presetBranch?.trim() && presetItinerary?.trim());
  const [pickedVthkKey, setPickedVthkKey] = useState("");
  const [vthk, setVthk] = useState<AvailableTrip[]>([]);
  const [loadingVthk, setLoadingVthk] = useState(false);
  /** Cửa sổ giờ vừa gửi sang CRM khi tải list xe — để note trên UI khớp payload thật. */
  const [vthkWindow, setVthkWindow] = useState<{ from: Date; to: Date } | null>(null);

  const [manualLimo, setManualLimo] = useState<{
    plate: string;
    vehicleId?: number;
    driver: string;
    gioChay: string;
    departAt: string;
  } | null>(null);
  const [limoDlgOpen, setLimoDlgOpen] = useState(false);
  const [limoBks, setLimoBks] = useState("");
  const [limoVehicleId, setLimoVehicleId] = useState<number | null>(null);
  const [limoDriver, setLimoDriver] = useState("");
  const [limoGioChay, setLimoGioChay] = useState("");

  const [truckDlgOpen, setTruckDlgOpen] = useState(false);
  const [truckEditId, setTruckEditId] = useState<number | null>(null);
  const [truckBks, setTruckBks] = useState("");
  const [truckDriver, setTruckDriver] = useState("");
  const [truckPhone, setTruckPhone] = useState("");
  const [truckTaiTrong, setTruckTaiTrong] = useState("");
  const [truckList, setTruckList] = useState<
    {
      id: number;
      bks: string;
      capacity: number;
      vehicleType?: string;
      driverName?: string;
      active: boolean;
      partnerTruck?: boolean;
      /** Xe khai báo ở Master → Xe đối tác (không có id Vehicle). */
      linehaulCode?: string;
    }[]
  >([]);
  const [loadingTrucks, setLoadingTrucks] = useState(false);

  useEffect(() => {
    if (open && partnerMode) setTab("vthh");
  }, [partnerMode, open]);

  const drivers = useStore((s) => s.drivers);
  const routes = useStore((s) => s.routes);
  const trips = useStore((s) => s.trips);
  const orders = useStore((s) => s.orders);
  const [pickedPlate, setPickedPlate] = useState("");

  const { branchNames, itinerariesForBranchName } = useBranchItineraryMaster();

  const loadByPlate = useMemo(() => {
    const map = new Map<string, { kg: number; count: number }>();
    for (const t of trips) {
      if (["CLOSED", "CANCELLED"].includes(t.status)) continue;
      const assigned = orders.filter((o) => o.tripCode === t.code);
      const kg = assigned.reduce((s, o) => s + (o.weightKg ?? 0), 0);
      const cur = map.get(t.bks) ?? { kg: 0, count: 0 };
      map.set(t.bks, { kg: cur.kg + kg, count: cur.count + assigned.length });
    }
    return map;
  }, [trips, orders]);

  const truckVehicles = useMemo(
    () =>
      truckList.filter((v) => {
        if (!v.active || /limousine/i.test(v.vehicleType ?? "")) return false;
        if (partnerMode) return v.partnerTruck === true;
        return v.partnerTruck !== true;
      }),
    [truckList, partnerMode],
  );

  const limoPlateSuggestions = useMemo(() => {
    const q = normalizePlate(limoBks);
    if (q.length < 3) return [];
    return truckList
      .filter((v) => v.active && isValidVnPlate(v.bks) && normalizePlate(v.bks).includes(q))
      .slice(0, 8);
  }, [truckList, limoBks]);

  const mapLinehaulVehicle = (v: LinehaulPartnerVehicle) => ({
    id: -v.id,
    bks: (v.plate || v.code || "").trim(),
    capacity: 0,
    vehicleType: `Xe đối tác · ${v.partnerCode}`,
    driverName: v.driverName,
    active: v.active !== false,
    partnerTruck: true as const,
    linehaulCode: v.code,
  });

  const reloadTrucks = async () => {
    if (!isApiEnabled()) {
      setTruckList([]);
      return;
    }
    setLoadingTrucks(true);
    try {
      const domain = await import("@/lib/api/domain-api");
      const list = await domain.listVehiclesMaster();
      if (partnerMode) {
        const linehaul = await fetchLinehaulPartnerVehicles(true).catch(() => [] as LinehaulPartnerVehicle[]);
        const fromMaster = linehaul.filter((v) => v.active !== false).map(mapLinehaulVehicle);
        const fromVehicle = list.filter((v) => v.active && v.partnerTruck === true);
        // Ưu tiên xe Master đối tác; bỏ trùng BKS/ký hiệu đã có.
        const seen = new Set(fromMaster.map((v) => normalizePlate(v.bks) || v.linehaulCode || String(v.id)));
        const merged = [
          ...fromMaster,
          ...fromVehicle.filter((v) => {
            const key = normalizePlate(v.bks) || String(v.id);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          }),
        ];
        setTruckList(merged);
      } else {
        setTruckList(list);
      }
    } catch (e: any) {
      setTruckList([]);
      toast.error(e?.message || "Không tải được danh sách xe tải từ máy chủ");
    } finally {
      setLoadingTrucks(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setTab(partnerMode ? "vthh" : "vthk");
    setPickedVthkKey("");
    setPickedPlate("");
    setBranch(presetBranch?.trim() || "");
    setItinerary(presetItinerary?.trim() || "");
    setVthk([]);
    setVthkWindow(null);
    setManualLimo(null);
    setLimoDlgOpen(false);
    setTruckDlgOpen(false);
    setTruckEditId(null);
    onPickRef.current(null);
  }, [open, presetBranch, presetItinerary, partnerMode]);

  useEffect(() => {
    if (!open || tab !== "vthh") return;
    void reloadTrucks();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload khi mở tab xe tải / đối tác
  }, [open, tab, partnerMode]);

  useEffect(() => {
    if (!open || tab !== "vthk" || partnerMode) return;
    if (!isApiEnabled() || !itinerary) {
      setVthk([]);
      setVthkWindow(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingVthk(true);
      const window = vthkSearchWindow();
      setVthkWindow(window);
      try {
        const domain = await import("@/lib/api/domain-api");
        const items = await domain.searchAvailableTrips({ itineraryCode: itinerary });
        if (!cancelled) setVthk(items);
      } catch (e: any) {
        if (!cancelled) {
          setVthk([]);
          toast.error(e?.message || "Không tải được xe Limousine");
        }
      } finally {
        if (!cancelled) setLoadingVthk(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tab, branch, itinerary, partnerMode]);

  useEffect(() => {
    if (tab !== "vthk" || partnerMode) return;
    if (manualLimo) {
      const routeVal = itinerary || branch;
      onPickRef.current(
        routeVal
          ? {
              tab: "vthh",
              source: "MANUAL_LIMO",
              plate: manualLimo.plate,
              vehicleId: manualLimo.vehicleId,
              driver: manualLimo.driver,
              route: routeVal,
              branchName: branch || undefined,
              departAt: manualLimo.departAt,
            }
          : null,
      );
      return;
    }
    const trip = vthk.find((t) => vthkTripKey(t) === pickedVthkKey);
    onPickRef.current(
      trip ? { tab: "vthk", trip, branchName: branch, itineraryName: itinerary } : null,
    );
  }, [tab, vthk, pickedVthkKey, branch, itinerary, manualLimo]);

  useEffect(() => {
    if (tab !== "vthh") return;
    const v = truckVehicles.find(
      (x) => x.bks === pickedPlate || x.linehaulCode === pickedPlate,
    );
    if (!v) {
      onPickRef.current(null);
      return;
    }
    onPickRef.current({
      tab: "vthh",
      source: "TRUCK",
      // Xe Master đối tác có thể không có biển — dùng ký hiệu.
      plate: v.bks || v.linehaulCode || "",
      vehicleId: v.id > 0 ? v.id : undefined,
      driver: v.driverName?.trim() || "",
      // Hint only — confirmAssign resolves real Route.code from orders/master
      route: partnerMode ? LINEHAUL_PARTNER_LABEL : routes[0] ?? "",
      branchName: partnerMode ? LINEHAUL_PARTNER_LABEL : undefined,
      departAt: new Date().toISOString(),
    });
  }, [tab, pickedPlate, truckVehicles, routes, partnerMode]);

  const emitTab = (next: "vthk" | "vthh") => {
    setTab(next);
    setPickedVthkKey("");
    setPickedPlate("");
    setManualLimo(null);
    onPickRef.current(null);
  };

  const openTruckCreate = () => {
    setTruckEditId(null);
    setTruckBks("");
    setTruckDriver("");
    setTruckPhone("");
    setTruckTaiTrong("");
    setTruckDlgOpen(true);
  };

  const openTruckEdit = (v: {
    id: number;
    bks: string;
    capacity: number;
    vehicleType?: string;
    driverName?: string;
    linehaulCode?: string;
  }) => {
    if (v.id < 0 || v.linehaulCode) {
      toast.message("Sửa xe Master đối tác ở Master dữ liệu → Xe đối tác");
      return;
    }
    setTruckEditId(v.id);
    setTruckBks(v.bks);
    setTruckDriver(v.driverName ?? "");
    setTruckPhone("");
    const tons = v.capacity > 0 ? v.capacity / 1000 : 0;
    const label =
      TAI_TRONG_OPTIONS.find((o) => Math.abs(Number.parseFloat(o) - tons) < 0.01) ??
      (tons > 0 ? `${tons} tấn` : "");
    setTruckTaiTrong(label);
    setTruckDlgOpen(true);
  };

  const saveLimoDlg = () => {
    const typed = limoBks.trim();
    const drv = limoDriver.trim();
    if (!typed) return toast.error("Nhập biển kiểm soát");
    const picked =
      (limoVehicleId != null ? truckList.find((v) => v.id === limoVehicleId) : undefined) ??
      truckList.find(
        (v) => v.active && isValidVnPlate(v.bks) && normalizePlate(v.bks) === normalizePlate(typed),
      );
    if (!picked && !isValidVnPlate(typed)) {
      return toast.error(
        limoPlateSuggestions.length
          ? "Biển chưa đủ — chọn xe trong danh sách gợi ý"
          : "Biển không đúng định dạng (vd 29H88524 hoặc 29H-885.24)",
      );
    }
    if (!drv) return toast.error("Nhập tên tài xế");
    if (!limoGioChay) return toast.error("Chọn giờ chạy");
    const routeVal = itinerary || branch;
    if (!routeVal) return toast.error("Chọn tuyến / lộ trình trước");

    setManualLimo({
      plate: picked?.bks ?? normalizePlate(typed),
      vehicleId: picked?.id,
      driver: drv,
      gioChay: limoGioChay,
      departAt: departAtFromGioChay(limoGioChay),
    });
    setPickedVthkKey("");
    setLimoDlgOpen(false);
    toast.success("Đã thêm xe limousine");
  };

  const saveTruckDlg = async () => {
    const plate = truckBks.trim().toUpperCase();
    const drv = truckDriver.trim();
    const phone = truckPhone.replace(/\s/g, "");
    if (!plate) return toast.error(partnerMode ? "Nhập BKS" : "Nhập biển kiểm soát");
    if (!drv) return toast.error("Nhập tên tài xế");
    if (partnerMode && !/^0\d{9}$/.test(phone)) {
      return toast.error("SĐT lái xe gồm 10 số, bắt đầu bằng 0");
    }
    if (!partnerMode && !truckTaiTrong.trim()) return toast.error("Chọn tải trọng");
    if (!isApiEnabled()) return toast.error("API chưa cấu hình");

    const { vehicleType, capacity } = truckTypeFromTaiTrong(
      truckTaiTrong.trim() || (partnerMode ? "5 tấn" : ""),
    );
    try {
      if (partnerMode) {
        if (truckEditId != null && truckEditId < 0) {
          toast.message("Sửa xe Master đối tác ở Master dữ liệu → Xe đối tác");
          return;
        }
        if (truckEditId != null && truckEditId > 0) {
          const domain = await import("@/lib/api/domain-api");
          await domain.updateVehicleApi(truckEditId, {
            bks: plate,
            capacity,
            vehicleType: "Xe đối tác",
            driverName: drv,
            active: true,
            partnerTruck: true,
          });
          toast.success("Đã cập nhật xe đối tác");
          setPickedPlate(plate);
        } else {
          // Thêm vào Master xe đối tác — một trường BKS (code = plate).
          const partnerCode = (partnerCodeHint || LINEHAUL_PARTNER_VEXERE).trim().toUpperCase();
          const created = await createLinehaulPartnerVehicle({
            code: plate,
            plate,
            partnerCode,
            driverName: drv,
            driverPhone: phone,
            appAccount: null,
          });
          toast.success("Đã thêm xe đối tác");
          const pickKey = (created.plate || created.code || plate).trim();
          await reloadTrucks();
          setPickedPlate(pickKey);
          setTruckDlgOpen(false);
          setTruckEditId(null);
          return;
        }
      } else if (truckEditId != null && truckEditId > 0) {
        const domain = await import("@/lib/api/domain-api");
        await domain.updateVehicleApi(truckEditId, {
          bks: plate,
          capacity,
          vehicleType,
          driverName: drv,
          active: true,
        });
        toast.success("Đã cập nhật xe tải");
        setPickedPlate(plate);
      } else if (truckEditId != null && truckEditId < 0) {
        toast.message("Sửa xe Master đối tác ở Master dữ liệu → Xe đối tác");
        return;
      } else {
        const domain = await import("@/lib/api/domain-api");
        await domain.createVehicleApi({
          bks: plate,
          capacity,
          vehicleType,
          driverName: drv,
          active: true,
          partnerTruck: false,
        });
        toast.success("Đã thêm xe tải");
        setPickedPlate(plate);
      }
      await reloadTrucks();
      const { syncMasterFromApi } = await import("@/lib/api/sync");
      await syncMasterFromApi().catch(() => undefined);
      setTruckDlgOpen(false);
      setTruckEditId(null);
    } catch (e: any) {
      toast.error(e?.message || "Không lưu được xe tải");
    }
  };

  const deleteTruck = async (v: { id: number; bks: string; linehaulCode?: string }) => {
    if (v.id < 0 || v.linehaulCode) {
      toast.message("Xoá xe Master đối tác ở Master dữ liệu → Xe đối tác");
      return;
    }
    if (!(await askConfirm(`Xóa xe ${v.bks}?`))) return;
    if (!isApiEnabled()) return toast.error("API chưa cấu hình");
    try {
      const domain = await import("@/lib/api/domain-api");
      await domain.deleteVehicleApi(v.id);
      if (pickedPlate === v.bks) setPickedPlate("");
      await reloadTrucks();
      const { syncMasterFromApi } = await import("@/lib/api/sync");
      await syncMasterFromApi().catch(() => undefined);
      toast.success("Đã xóa xe tải");
    } catch (e: any) {
      toast.error(e?.message || "Không xóa được xe tải");
    }
  };

  return (
    <div className="min-w-0 max-w-full space-y-3 overflow-hidden">
      <Tabs value={partnerMode ? "vthh" : tab} onValueChange={(v) => !partnerMode && emitTab(v as "vthk" | "vthh")}>
        <TabsList className="h-9">
          {!partnerMode ? <TabsTrigger value="vthk">Xe Limousine</TabsTrigger> : null}
          <TabsTrigger value="vthh">{partnerMode ? "Xe tải đối tác" : "Xe tải"}</TabsTrigger>
        </TabsList>
        {partnerMode ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Đơn giao qua đối tác — chỉ hiện xe đối tác. Thêm xe tại đây mặc định là xe đối tác.
          </p>
        ) : null}

        <TabsContent value="vthk" className="mt-3 min-w-0 space-y-3">
          {lockRoute ? (
            <p className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Tuyến / lộ trình theo đơn:{" "}
              <span className="font-medium text-foreground">
                {[branch, itinerary].filter(Boolean).join(" · ")}
              </span>
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Tuyến</Label>
                <SearchableSelect
                  value={branch}
                  onValueChange={(v) => {
                    setBranch(v);
                    setItinerary(itinerariesForBranchName(v)[0] ?? "");
                    setPickedVthkKey("");
                    setManualLimo(null);
                  }}
                  placeholder="Chọn"
                  options={branchNames.map((r) => ({ value: r, label: r }))}
                />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Lộ trình</Label>
                <SearchableSelect
                  value={itinerary}
                  onValueChange={(v) => {
                    setItinerary(v);
                    setPickedVthkKey("");
                    setManualLimo(null);
                  }}
                  placeholder="Chọn"
                  options={itinerariesForBranchName(branch).map((it) => ({ value: it, label: it }))}
                />
              </div>
            </div>
          )}

          {itinerary && vthkWindow ? (
            <p className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              Đang lấy xe từ portal theo khung giờ{" "}
              <span className="font-semibold text-foreground">
                {formatTripClock(vthkWindow.from.toISOString())} →{" "}
                {formatTripClock(vthkWindow.to.toISOString())}
              </span>{" "}
              (xe đã chạy {VTHK_BEFORE_HOURS} tiếng trước đến {VTHK_AFTER_HOURS} tiếng tới)
              {loadingVthk ? " — đang tải…" : ` — có ${vthk.length} xe trong khung này.`}
            </p>
          ) : null}

          <VehicleRow>
            {!itinerary ? (
              <div className="w-[min(100%,420px)] rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                {lockRoute
                  ? "Đơn chưa có lộ trình — không tải được xe Limousine"
                  : "Chọn tuyến và lộ trình để xem xe Limousine"}
              </div>
            ) : loadingVthk ? (
              <div className="w-[min(100%,420px)] py-6 text-center text-sm text-muted-foreground">
                Đang tải xe…
              </div>
            ) : (
              <>
                {vthk.map((t) => {
                  const key = vthkTripKey(t);
                  const plate = t.vehiclePlate?.trim() || "Chưa gán biển";
                  const drv = t.driverName?.trim() || "Chưa gán tài";
                  const load = plate !== "Chưa gán biển" ? loadByPlate.get(plate) : undefined;
                  return (
                    <TripCard
                      key={key}
                      active={!manualLimo && pickedVthkKey === key}
                      headline={formatTripClock(t.departAt)}
                      plate={plate}
                      driver={drv}
                      loadKg={Number(t.usedKg ?? load?.kg ?? 0)}
                      loadCount={Number(t.usedOrderCount ?? load?.count ?? 0)}
                      onClick={() => {
                        setPickedVthkKey(key);
                        setManualLimo(null);
                      }}
                    />
                  );
                })}
                {manualLimo && (
                  <TripCard
                    active
                    headline={manualLimo.gioChay}
                    plate={manualLimo.plate}
                    driver={manualLimo.driver}
                    loadKg={loadByPlate.get(manualLimo.plate)?.kg ?? 0}
                    loadCount={loadByPlate.get(manualLimo.plate)?.count ?? 0}
                    onClick={() => setPickedVthkKey("")}
                  />
                )}
                {vthk.length === 0 && !manualLimo && (
                  <div className="flex h-[96px] w-[180px] shrink-0 items-center rounded-lg border border-dashed px-3 text-xs text-muted-foreground">
                    Không có chuyến từ {VTHK_BEFORE_HOURS} tiếng trước đến {VTHK_AFTER_HOURS} tiếng
                    tới
                  </div>
                )}
                <AddManualCard
                  onClick={() => {
                    setLimoBks("");
                    setLimoVehicleId(null);
                    setLimoDriver("");
                    setLimoGioChay("");
                    setLimoDlgOpen(true);
                    if (truckList.length === 0) void reloadTrucks();
                  }}
                />
              </>
            )}
          </VehicleRow>
        </TabsContent>

        <TabsContent value="vthh" className="mt-3 min-w-0 space-y-3">
          {loadingTrucks ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Đang tải xe tải từ máy chủ…
            </div>
          ) : (
            <VehicleRow>
              {truckVehicles.map((v) => {
                const pickKey = v.bks || v.linehaulCode || "";
                const active = pickedPlate === pickKey;
                const load = loadByPlate.get(pickKey) ?? (v.bks ? loadByPlate.get(v.bks) : undefined);
                const fromMaster = v.id < 0 || !!v.linehaulCode;
                return (
                  <div key={v.linehaulCode ? `lh-${v.linehaulCode}` : v.id} className="relative shrink-0">
                    <TripCard
                      active={active}
                      headline={v.vehicleType || "Xe tải"}
                      plate={pickKey || "—"}
                      driver={v.driverName || "Chưa gán tài"}
                      loadKg={load?.kg ?? 0}
                      loadCount={load?.count ?? 0}
                      onClick={() => setPickedPlate(pickKey)}
                    />
                    {!fromMaster ? (
                      <div className="absolute right-1 top-1 flex gap-0.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-6 w-6 p-0"
                          title="Sửa"
                          onClick={(e) => {
                            e.stopPropagation();
                            openTruckEdit(v);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-6 w-6 p-0 text-destructive"
                          title="Xóa"
                          onClick={(e) => {
                            e.stopPropagation();
                            void deleteTruck(v);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {truckVehicles.length === 0 && (
                <div className="flex h-[96px] w-[180px] shrink-0 items-center rounded-lg border border-dashed px-3 text-xs text-muted-foreground">
                  Chưa có xe tải — thêm thủ công
                </div>
              )}
              <AddManualCard onClick={openTruckCreate} />
            </VehicleRow>
          )}
        </TabsContent>
      </Tabs>

      <NestedFormOverlay
        open={limoDlgOpen}
        title="Thêm xe limousine"
        onClose={() => setLimoDlgOpen(false)}
        onSave={saveLimoDlg}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Biển kiểm soát</Label>
            <Input
              placeholder="Nhập BKS, vd 29H88524..."
              value={limoBks}
              onChange={(e) => {
                setLimoBks(e.target.value.toUpperCase());
                setLimoVehicleId(null);
              }}
            />
            {limoVehicleId == null && limoPlateSuggestions.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-md border bg-background text-sm shadow-sm">
                {limoPlateSuggestions.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-muted"
                    onClick={() => {
                      setLimoBks(v.bks);
                      setLimoVehicleId(v.id);
                      if (!limoDriver.trim() && v.driverName) setLimoDriver(v.driverName);
                    }}
                  >
                    <span className="font-medium">{v.bks}</span>
                    {v.driverName ? (
                      <span className="truncate text-xs text-muted-foreground">{v.driverName}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
            {limoBks.trim() && limoVehicleId == null && !isValidVnPlate(limoBks) && (
              <p className="text-xs text-destructive">
                Biển chưa đúng định dạng (vd 29H88524)
                {limoPlateSuggestions.length ? " — chọn xe gợi ý ở trên" : ""}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tên tài xế</Label>
            <NameInput
              preserveCase
              placeholder="Nhập tên tài xế..."
              value={limoDriver}
              onChange={setLimoDriver}
              list="limo-driver-suggestions"
            />
            <datalist id="limo-driver-suggestions">
              {drivers.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Giờ chạy</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={limoGioChay}
              onChange={(e) => setLimoGioChay(e.target.value)}
            >
              <option value="">Chọn</option>
              {GIO_CHAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </NestedFormOverlay>

      <NestedFormOverlay
        open={truckDlgOpen}
        title={
          truckEditId != null
            ? partnerMode
              ? "Sửa xe đối tác"
              : "Sửa xe tải"
            : partnerMode
              ? "Thêm xe đối tác"
              : "Thêm xe tải"
        }
        onClose={() => {
          setTruckDlgOpen(false);
          setTruckEditId(null);
        }}
        onSave={() => void saveTruckDlg()}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">{partnerMode ? "BKS *" : "Biển kiểm soát"}</Label>
            <Input
              placeholder={partnerMode ? "VD: 37C-000.01 hoặc HTP-04" : "Nhập BKS..."}
              value={truckBks}
              onChange={(e) => setTruckBks(e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tên tài xế *</Label>
            <NameInput
              preserveCase
              placeholder="Nhập tên tài xế..."
              value={truckDriver}
              onChange={setTruckDriver}
              list="truck-driver-suggestions"
            />
            <datalist id="truck-driver-suggestions">
              {drivers.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </div>
          {partnerMode ? (
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">SĐT lái xe *</Label>
              <Input
                inputMode="tel"
                placeholder="VD: 0901234567"
                value={truckPhone}
                onChange={(e) => setTruckPhone(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Không cần tài khoản app điều phối. Có thể khai báo thêm ở Master → Xe đối tác.
              </p>
            </div>
          ) : null}
          {!partnerMode ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Tải trọng</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={truckTaiTrong}
                onChange={(e) => setTruckTaiTrong(e.target.value)}
              >
                <option value="">Chọn</option>
                {[
                  ...TAI_TRONG_OPTIONS,
                  ...(truckTaiTrong && !TAI_TRONG_OPTIONS.includes(truckTaiTrong)
                    ? [truckTaiTrong]
                    : []),
                ].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      </NestedFormOverlay>
    </div>
  );
}
