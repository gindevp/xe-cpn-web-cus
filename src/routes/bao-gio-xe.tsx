import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePagedRows } from "@/lib/use-paged-rows";
import { TablePagination } from "@/components/TablePagination";
import { ProtectedPage } from "@/components/AppShell";
import { M3Page } from "@/components/M3Page";
import { EmptyState } from "@/components/PageBits";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useBranchItineraryMaster } from "@/lib/use-branch-itinerary";
import { ExportFormatButton } from "@/components/ExportFormatButton";
import { downloadExcel, downloadExcelRows, type ExportFormat } from "@/lib/csv";
import { toast } from "sonner";
import {
  getAllOfficeVehicleItineraries,
  getVehicleEventPhoto,
  getVehicleEventReport,
  getVehiclePhotoPolicy,
  getVehiclePlan,
  saveVehiclePhotoPolicy,
  type ItineraryOption,
  type VehicleEventReportItem,
  type VehiclePlanTrip,
} from "@/lib/api/vehicle-events-api";
import { VehicleTimesMark } from "@/components/VehicleTimesMark";
import { useAuth } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { useStore } from "@/lib/store";
import { assignedOfficeCode, hasAllOfficeScope, resolveViewOffice } from "@/lib/office-scope";
import { officeName } from "@/lib/mock-data";
import { ImageLightbox } from "@/components/ImageLightbox";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/bao-gio-xe")({
  head: () => ({
    meta: [
      { title: "Báo giờ xe đến/đi — X.E" },
      { name: "description", content: "Theo dõi giờ xe thực tế rời và đến văn phòng do nhân viên báo trên app." },
    ],
  }),
  component: () => (
    <ProtectedPage title="Báo giờ xe đến/đi" screen="bao-gio-xe" hidePageTitle>
      <M3Page>
        <Page />
      </M3Page>
    </ProtectedPage>
  ),
});

const VN_TZ = "Asia/Ho_Chi_Minh";
const ALL = "";
/** Rời VP trễ hơn giờ đón từ ngần này phút là MUỘN (app bắt nhập lý do). */
const LATE_MINUTES = 5;

type Tab = "CHAM" | "TONG_QUAN" | "CHUYEN" | "NHAT_KY";
type Ev = VehicleEventReportItem;

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: VN_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: VN_TZ, hour: "2-digit", minute: "2-digit", hour12: false });

function dayOf(iso: string) {
  return dayFmt.format(new Date(iso));
}

function timeOf(iso?: string | null) {
  return iso ? timeFmt.format(new Date(iso)) : "";
}

function viDay(day: string) {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

function dayTime(iso?: string | null) {
  return iso ? `${timeOf(iso)} ${viDay(dayOf(iso)).slice(0, 5)}` : "";
}

function today() {
  return dayFmt.format(new Date());
}

function monthStart(day: string) {
  return `${day.slice(0, 7)}-01`;
}

/** Giờ đón tại VP (giờ xuất bến ± phút lệch lộ trình); bản ghi cũ chưa có thì lấy giờ xuất bến. */
function pickupOf(e?: Ev | null) {
  return e ? e.pickupAt || e.plannedDepartAt || null : null;
}

/** Phút lệch giờ rời thực tế so với giờ đón (âm = sớm), làm tròn về 0 như BE. */
function deviationOf(e?: Ev | null): number | null {
  if (!e || e.eventType !== "DEPART") return null;
  const p = pickupOf(e);
  if (!p) return null;
  return Math.trunc((Date.parse(e.eventAt) - Date.parse(p)) / 60000);
}

type Punctuality = "SOM" | "DUNG" | "MUON";

function punctualityOf(d: number | null): Punctuality | null {
  if (d == null) return null;
  if (d < 0) return "SOM";
  return d >= LATE_MINUTES ? "MUON" : "DUNG";
}

const PUNCTUALITY_LABEL: Record<Punctuality, string> = { SOM: "SỚM", DUNG: "ĐÚNG GIỜ", MUON: "MUỘN" };

function fmtMinutes(min: number) {
  const a = Math.abs(min);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m} phút`;
}

/** "MUỘN 7 phút" / "SỚM 3 phút" / "ĐÚNG GIỜ (2 phút)". */
function delayText(e?: Ev | null): string {
  const d = deviationOf(e);
  const p = punctualityOf(d);
  if (d == null || !p) return "";
  if (p === "DUNG") return d ? `${PUNCTUALITY_LABEL.DUNG} (${fmtMinutes(d)})` : PUNCTUALITY_LABEL.DUNG;
  return `${PUNCTUALITY_LABEL[p]} ${fmtMinutes(d)}`;
}

function tripLabel(e: Ev) {
  return e.tripCode || (e.source === "CRM" ? "Limousine" : e.tripKey);
}

function reporter(e: Ev) {
  return e.reportedByName || e.reportedBy || "";
}

function routeKey(s?: string | null) {
  return (s ?? "").normalize("NFC").replace(/\s+/g, "").toUpperCase();
}

function plateKey(s?: string | null) {
  return (s ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

function planMatches(t: VehiclePlanTrip, q: string, route: string, branchRoutes: Set<string> | null) {
  if (route && routeKey(t.routeLabel) !== route) return false;
  if (branchRoutes && !branchRoutes.has(routeKey(t.routeLabel))) return false;
  if (!q) return true;
  return [t.vehiclePlate, t.externalTripId, t.driverName, t.routeLabel].filter(Boolean).some((v) => v!.toLowerCase().includes(q));
}

type PlateRow = {
  key: string;
  plate: string;
  drivers: string[];
  arrive: number;
  depart: number;
  planned: number;
  late: number;
  early: number;
  onTime: number;
};

type OfficeRow = {
  key: string;
  name: string;
  arrive: number;
  depart: number;
  planned: number;
  late: number;
  early: number;
  onTime: number;
  lateByReason: { reason: string; count: number }[];
};

function matches(e: Ev, q: string, route = "", branchRoutes: Set<string> | null = null) {
  if (route && routeKey(e.routeLabel) !== route) return false;
  if (branchRoutes && !branchRoutes.has(routeKey(e.routeLabel))) return false;
  if (!q) return true;
  return [e.vehiclePlate, e.tripCode, e.externalTripId, e.driverName, e.routeLabel]
    .filter(Boolean)
    .some((v) => v!.toLowerCase().includes(q));
}

function TypeBadge({ type }: { type: Ev["eventType"] }) {
  return <span className={type === "DEPART" ? "tag info" : "tag ok"}>{type === "DEPART" ? "Rời VP" : "Đến VP"}</span>;
}

function DelayCell({ e }: { e?: Ev | null }) {
  const d = deviationOf(e);
  const p = punctualityOf(d);
  if (d == null || !p) return <span className="muted">—</span>;
  const tag = p === "MUON" ? "tag err" : p === "SOM" ? "tag info" : "tag ok";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      <span className={tag}>{PUNCTUALITY_LABEL[p]}</span>
      <span className={cn("num", p === "MUON" ? "main" : "muted")}>{fmtMinutes(d)}</span>
    </span>
  );
}

function PhotoButton({ e, onOpen }: { e?: Ev | null; onOpen: (e: Ev) => void }) {
  if (!e?.hasPhoto) return null;
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label="Xem ảnh xe rời"
      title="Xem ảnh xe rời VP"
      onClick={() => onOpen(e)}
    >
      <span className="ms" aria-hidden="true" style={{ fontSize: 18 }}>
        photo_camera
      </span>
    </button>
  );
}

const CHAM_ILL = (
  <svg className="rev-ill cham-ill" viewBox="0 0 150 104" aria-hidden="true">
    <ellipse className="ill-soft" cx="75" cy="97" rx="68" ry="6" />
    <rect className="ill-main" x="10" y="22" width="84" height="58" rx="5" />
    <rect className="ill-paper" x="20" y="34" width="44" height="6" rx="3" />
    <rect className="ill-mid" x="20" y="46" width="28" height="6" rx="3" />
    <path className="ill-mid" d="M96 40h24l18 20v20H96z" />
    <path className="ill-paper" d="M104 47h13l11 13h-24z" />
    <circle className="ill-dark" cx="36" cy="84" r="11" />
    <circle className="ill-paper" cx="36" cy="84" r="4.5" />
    <circle className="ill-dark" cx="114" cy="84" r="11" />
    <circle className="ill-paper" cx="114" cy="84" r="4.5" />
    <rect className="ill-box" x="72" y="8" width="20" height="14" rx="2" />
    <rect className="ill-box2" x="52" y="8" width="18" height="14" rx="2" />
  </svg>
);

function Page() {
  const { session } = useAuth();
  const canMark =
    canWrite(session?.role, "bao-gio-xe") ||
    canWrite(session?.role, "hang-cho-len-xe") ||
    canWrite(session?.role, "quet-nhap");
  const canConfigure = canWrite(session?.role, "bao-tri");
  const [photoRequired, setPhotoRequired] = useState(true);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const master = useBranchItineraryMaster();
  const viewOffice = useStore((s) => s.viewOffice);
  const wide = hasAllOfficeScope(session);
  const officeCode = wide ? assignedOfficeCode(resolveViewOffice(session, viewOffice)) : assignedOfficeCode(session?.office);
  const [officeItineraries, setOfficeItineraries] = useState<ItineraryOption[] | null>(null);
  const [photoView, setPhotoView] = useState<{ title: string; url: string } | null>(null);
  const openPhoto = useCallback(async (e: Ev) => {
    try {
      const r = await getVehicleEventPhoto(e.id);
      setPhotoView({
        title: `Ảnh xe rời ${e.officeName} — ${e.vehiclePlate || tripLabel(e)} lúc ${dayTime(e.eventAt)}`,
        url: r.photo,
      });
    } catch (err: any) {
      toast.error(err?.message || "Không tải được ảnh");
    }
  }, []);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [branch, setBranch] = useState(ALL);
  const [status, setStatus] = useState<"" | Punctuality>("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("CHAM");
  const [showRule, setShowRule] = useState(false);
  const [route, setRoute] = useState("");
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [loaded, setLoaded] = useState<{ from: string; to: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<{ key: string; trips: VehiclePlanTrip[]; warning?: string | null } | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [tripPlan, setTripPlan] = useState<{ key: string; trips: VehiclePlanTrip[]; warning?: string | null } | null>(null);
  const [tripPlanLoading, setTripPlanLoading] = useState(false);
  /** Mã VP → mã lộ trình VP báo giờ (chỉ VP đã cấu hình). */
  const [officeItineraryMap, setOfficeItineraryMap] = useState<Record<string, string[]> | null>(null);
  const [overviewEvents, setOverviewEvents] = useState<Ev[] | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

  useEffect(() => {
    if (tab !== "TONG_QUAN" || officeItineraryMap) return;
    let alive = true;
    void getAllOfficeVehicleItineraries()
      .then((m) => {
        if (alive) setOfficeItineraryMap(m ?? {});
      })
      .catch(() => {
        if (alive) setOfficeItineraryMap({});
      });
    return () => {
      alive = false;
    };
  }, [tab, officeItineraryMap]);

  useEffect(() => {
    if (tab !== "TONG_QUAN" || !loaded) return;
    const key = `${loaded.from}|${loaded.to}`;
    if (plan?.key === key) return;
    let alive = true;
    setPlanLoading(true);
    void getVehiclePlan({ from: loaded.from, to: loaded.to })
      .then((r) => {
        if (alive) setPlan({ key, trips: r.trips ?? [], warning: r.warning });
      })
      .catch((e) => {
        if (alive) setPlan({ key, trips: [], warning: e instanceof Error ? e.message : "Không tải được bảng tài CRM" });
      })
      .finally(() => {
        if (alive) setPlanLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, loaded]);

  useEffect(() => {
    if (tab !== "CHUYEN" || !loaded) return;
    const key = `${loaded.from}|${loaded.to}|${officeCode}`;
    if (tripPlan?.key === key) return;
    let alive = true;
    setTripPlanLoading(true);
    void getVehiclePlan({ from: loaded.from, to: loaded.to, officeCode: officeCode || undefined })
      .then((r) => {
        if (!alive) return;
        setTripPlan({ key, trips: r.trips ?? [], warning: r.warning });
      })
      .catch((e) => {
        if (!alive) return;
        setTripPlan({ key, trips: [], warning: e instanceof Error ? e.message : "Không tải được bảng tài" });
      })
      .finally(() => {
        if (alive) setTripPlanLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, loaded, officeCode]);

  useEffect(() => {
    if (tab !== "TONG_QUAN" || !loaded) {
      setOverviewEvents(null);
      setOverviewLoading(false);
      return;
    }
    if (!officeCode) {
      setOverviewEvents(events);
      setOverviewLoading(false);
      return;
    }
    let alive = true;
    setOverviewLoading(true);
    void getVehicleEventReport({ from: loaded.from, to: loaded.to })
      .then((r) => {
        if (alive) setOverviewEvents(r.events);
      })
      .catch((e) => {
        if (alive) {
          setOverviewEvents([]);
          toast.error(e instanceof Error ? e.message : "Không tải được giờ xe của văn phòng");
        }
      })
      .finally(() => {
        if (alive) setOverviewLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [tab, loaded, officeCode, events]);

  useEffect(() => {
    let alive = true;
    void getVehiclePhotoPolicy()
      .then((p) => {
        if (alive) setPhotoRequired(p.departPhotoRequired !== false);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const togglePhoto = async (on: boolean) => {
    if (!canConfigure || savingPolicy) return;
    setSavingPolicy(true);
    const prev = photoRequired;
    setPhotoRequired(on);
    try {
      const saved = await saveVehiclePhotoPolicy(on);
      setPhotoRequired(saved.departPhotoRequired !== false);
      toast.success(saved.departPhotoRequired ? "App bắt buộc chụp ảnh khi báo xe rời" : "App không bắt chụp ảnh khi báo xe rời");
    } catch (e) {
      setPhotoRequired(prev);
      toast.error(e instanceof Error ? e.message : "Không lưu được cấu hình");
    } finally {
      setSavingPolicy(false);
    }
  };

  const load = useCallback(
    async (range?: { from: string; to: string }) => {
      const f = range?.from ?? from;
      const t = range?.to ?? to;
      if (!f || !t || t < f) return;
      setLoading(true);
      try {
        const r = await getVehicleEventReport({ from: f, to: t, officeCode: officeCode || undefined });
        setEvents(r.events);
        setOfficeItineraries(officeCode ? (r.itineraries ?? []) : null);
        setLoaded({ from: f, to: t });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không tải được dữ liệu báo giờ xe");
      } finally {
        setLoading(false);
      }
    },
    [from, to, officeCode],
  );

  useEffect(() => {
    if (!from || !to || to < from) return;
    void load();
    // Đổi ngày hoặc VP đang xem thì tải lại. Tuyến, lộ trình, trạng thái, ô tìm lọc ngay trên dữ liệu đã tải.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, officeCode]);

  const quick = (f: string, t: string) => {
    setFrom(f);
    setTo(t);
  };

  const q = search.trim().toLowerCase();

  /** null = xem toàn hệ thống. Có VP thì chỉ lộ trình báo giờ của VP đó. */
  const scopedItineraries = useMemo(() => {
    if (!officeItineraries) return master.itineraries;
    const codes = new Set(officeItineraries.map((it) => it.code));
    const names = new Set(officeItineraries.map((it) => it.name));
    return master.itineraries.filter((it) => (it.code && codes.has(it.code)) || (it.name && names.has(it.name)));
  }, [officeItineraries, master.itineraries]);

  const branchOptions = useMemo(() => {
    const ids = new Set(scopedItineraries.map((it) => it.branch?.id).filter((id): id is number => id != null));
    const branches = officeItineraries ? master.branches.filter((b) => ids.has(b.id)) : master.branches;
    return [...branches]
      .sort((a, b) => a.name.localeCompare(b.name, "vi"))
      .map((b) => ({ value: String(b.id), label: b.name }));
  }, [master.branches, scopedItineraries, officeItineraries]);

  /** Lộ trình thuộc tuyến đang chọn (tên + mã, dạng routeKey) — null = mọi tuyến. */
  const branchRoutes = useMemo(() => {
    if (!branch) return null;
    const keys = new Set<string>();
    for (const it of scopedItineraries) {
      if (String(it.branch?.id ?? "") !== branch) continue;
      if (it.name) keys.add(routeKey(it.name));
      if (it.code) keys.add(routeKey(it.code));
    }
    return keys;
  }, [branch, scopedItineraries]);

  /** Mọi lộ trình trong danh mục (lọc theo tuyến nếu chọn) + tên tuyến có trong dữ liệu mà danh mục không có. */
  const routeOptions = useMemo(() => {
    const names = scopedItineraries
      .filter((it) => !branch || String(it.branch?.id ?? "") === branch)
      .map((it) => it.name)
      .filter((n): n is string => !!n?.trim());
    if (!officeItineraries && !branch) {
      for (const e of events ?? []) if (e.routeLabel?.trim()) names.push(e.routeLabel.trim());
    }
    if (officeItineraries && !branch) {
      for (const it of officeItineraries) if (it.name?.trim()) names.push(it.name.trim());
    }
    const byKey = new Map<string, string>();
    for (const n of names) if (!byKey.has(routeKey(n))) byKey.set(routeKey(n), n);
    return [...byKey.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], "vi"))
      .map(([value, label]) => ({ value, label }));
  }, [scopedItineraries, officeItineraries, branch, events]);

  useEffect(() => {
    if (branch && !branchOptions.some((o) => o.value === branch)) setBranch("");
  }, [branch, branchOptions]);

  useEffect(() => {
    if (route && !routeOptions.some((o) => o.value === route)) setRoute("");
  }, [route, routeOptions]);

  const logRows = useMemo(() => {
    if (!events || !loaded) return [];
    return events
      .filter((e) => {
        const d = dayOf(e.eventAt);
        return (
          d >= loaded.from &&
          d <= loaded.to &&
          (!status || punctualityOf(deviationOf(e)) === status) &&
          matches(e, q, route, branchRoutes)
        );
      })
      .sort((a, b) => b.eventAt.localeCompare(a.eventAt));
  }, [events, loaded, status, q, route, branchRoutes]);

  /** Mỗi xe tại mỗi VP một dòng: giờ đến → giờ rời VP đó. */
  const tripRows = useMemo(() => {
    if (!events || !loaded) return [];
    const groups = new Map<string, Ev[]>();
    for (const e of events) {
      const d = dayOf(e.eventAt);
      if (d < loaded.from || d > loaded.to) continue;
      const k = `${e.officeCode}|${e.tripKey}`;
      groups.set(k, [...(groups.get(k) ?? []), e]);
    }
    const out: {
      key: string;
      head: Ev;
      arrive?: Ev;
      depart?: Ev;
      pickup: string | null;
      sortAt: string;
      plan?: VehiclePlanTrip;
    }[] = [...groups.entries()].map(([key, list]) => {
      const arrive = list.find((e) => e.eventType === "ARRIVE");
      const depart = list.find((e) => e.eventType === "DEPART");
      const head = list.find((e) => pickupOf(e)) ?? list[0];
      return {
        key,
        head,
        arrive,
        depart,
        pickup: pickupOf(depart) ?? pickupOf(head),
        sortAt: arrive?.eventAt ?? pickupOf(head) ?? list[0].eventAt,
      };
    });
    const marked = new Set<string>();
    for (const list of groups.values()) {
      for (const e of list) {
        if (e.tripKey) marked.add(e.tripKey);
        if (e.externalTripId) marked.add(e.externalTripId.startsWith("C:") ? e.externalTripId : `C:${e.externalTripId}`);
      }
    }
    const planKey = `${loaded.from}|${loaded.to}|${officeCode}`;
    if (tripPlan?.key === planKey) {
      const officeLabel = officeCode ? officeName(officeCode) || officeCode : "";
      for (const t of tripPlan.trips) {
        if (!t.departAt || !t.externalTripId) continue;
        const d = dayOf(t.departAt);
        if (d < loaded.from || d > loaded.to) continue;
        const tripKey = t.externalTripId.startsWith("C:") ? t.externalTripId : `C:${t.externalTripId}`;
        if (marked.has(tripKey)) continue;
        marked.add(tripKey);
        out.push({
          key: `plan|${officeCode}|${tripKey}|${d}`,
          head: {
            id: 0,
            officeCode,
            officeName: officeLabel,
            eventType: "ARRIVE",
            source: "CRM",
            tripKey,
            externalTripId: t.externalTripId,
            vehiclePlate: t.vehiclePlate,
            driverName: t.driverName,
            routeLabel: t.routeLabel,
            plannedDepartAt: t.departAt,
            eventAt: t.departAt,
            pickupAt: t.departAt,
          },
          pickup: t.departAt,
          sortAt: t.departAt,
          plan: t,
        });
      }
    }
    return out
      .filter((t) => {
        if (status && punctualityOf(deviationOf(t.depart)) !== status) return false;
        if (t.plan) return planMatches(t.plan, q, route, branchRoutes);
        return matches(t.head, q, route, branchRoutes);
      })
      .sort((a, b) => b.sortAt.localeCompare(a.sortAt));
  }, [events, loaded, tripPlan, officeCode, status, q, route, branchRoutes]);
  /** Mỗi biển số một dòng. Tổng quan luôn cộng mọi VP, không theo VP đang xem. */
  const plateRows = useMemo(() => {
    const source = overviewEvents;
    if (!source || !loaded) return [];
    const rows = new Map<string, PlateRow>();
    const rowOf = (plate?: string | null) => {
      const key = plateKey(plate);
      let r = rows.get(key);
      if (!r) {
        r = { key, plate: plate?.trim() || "", drivers: [], arrive: 0, depart: 0, planned: 0, late: 0, early: 0, onTime: 0 };
        rows.set(key, r);
      }
      return r;
    };
    const addDriver = (r: PlateRow, name?: string | null) => {
      const n = name?.trim();
      if (n && !r.drivers.includes(n)) r.drivers.push(n);
    };
    for (const e of source) {
      const d = dayOf(e.eventAt);
      if (d < loaded.from || d > loaded.to || !matches(e, q, route, branchRoutes)) continue;
      const r = rowOf(e.vehiclePlate);
      addDriver(r, e.driverName);
      if (e.eventType === "ARRIVE") r.arrive++;
      else {
        r.depart++;
        const tone = punctualityOf(deviationOf(e));
        if (tone === "MUON") r.late++;
        else if (tone === "SOM") r.early++;
        else if (tone === "DUNG") r.onTime++;
      }
    }
    if (plan?.key === `${loaded.from}|${loaded.to}`) {
      for (const t of plan.trips) {
        if (!t.departAt) continue;
        const d = dayOf(t.departAt);
        if (d < loaded.from || d > loaded.to || !planMatches(t, q, route, branchRoutes)) continue;
        const r = rowOf(t.vehiclePlate);
        addDriver(r, t.driverName);
        r.planned++;
      }
    }
    return [...rows.values()]
      .filter((r) => {
        if (status === "MUON") return r.late > 0;
        if (status === "SOM") return r.early > 0;
        if (status === "DUNG") return r.onTime > 0;
        return true;
      })
      .sort((a, b) => {
        if (!a.key !== !b.key) return a.key ? -1 : 1;
        return a.plate.localeCompare(b.plate, "vi");
      });
  }, [overviewEvents, loaded, plan, q, route, branchRoutes, status]);
  const plateTotals = useMemo(
    () =>
      plateRows.reduce(
        (s, r) => ({ arrive: s.arrive + r.arrive, depart: s.depart + r.depart, planned: s.planned + r.planned, late: s.late + r.late }),
        { arrive: 0, depart: 0, planned: 0, late: 0 },
      ),
    [plateRows],
  );
  const officeRows = useMemo(() => {
    const source = overviewEvents;
    if (!source || !loaded) return [];
    const rows = new Map<string, OfficeRow & { reasons: Map<string, number> }>();
    const rowOf = (key: string, name: string) => {
      let r = rows.get(key);
      if (!r) {
        r = {
          key,
          name,
          arrive: 0,
          depart: 0,
          planned: 0,
          late: 0,
          early: 0,
          onTime: 0,
          lateByReason: [],
          reasons: new Map(),
        };
        rows.set(key, r);
      }
      return r;
    };
    /** VP → tên tuyến đã báo (dùng gán bảng tài khi VP chưa cấu hình lộ trình). */
    const routesByOffice = new Map<string, Set<string>>();
    for (const e of source) {
      const d = dayOf(e.eventAt);
      if (d < loaded.from || d > loaded.to || !matches(e, q, route, branchRoutes)) continue;
      const key = (e.officeCode ?? "").trim().toUpperCase() || "-";
      const r = rowOf(key, e.officeName?.trim() || e.officeCode?.trim() || "Không rõ VP");
      if (e.eventType === "ARRIVE") r.arrive++;
      else {
        r.depart++;
        const tone = punctualityOf(deviationOf(e));
        if (tone === "MUON") {
          r.late++;
          const reason = e.reason?.trim() || "Không ghi lý do";
          r.reasons.set(reason, (r.reasons.get(reason) ?? 0) + 1);
        } else if (tone === "SOM") r.early++;
        else if (tone === "DUNG") r.onTime++;
      }
      const rk = routeKey(e.routeLabel);
      if (rk) {
        let set = routesByOffice.get(key);
        if (!set) {
          set = new Set();
          routesByOffice.set(key, set);
        }
        set.add(rk);
      }
    }
    /** Mã lộ trình → danh sách VP cấu hình báo giờ lộ trình đó. */
    const officesByItinerary = new Map<string, string[]>();
    if (officeItineraryMap) {
      for (const [office, codes] of Object.entries(officeItineraryMap)) {
        const oc = office.trim().toUpperCase();
        if (!oc) continue;
        for (const code of codes) {
          const c = code?.trim();
          if (!c) continue;
          const list = officesByItinerary.get(c) ?? [];
          list.push(oc);
          officesByItinerary.set(c, list);
        }
      }
    }
    if (plan?.key === `${loaded.from}|${loaded.to}`) {
      for (const t of plan.trips) {
        if (!t.departAt) continue;
        const d = dayOf(t.departAt);
        if (d < loaded.from || d > loaded.to || !planMatches(t, q, route, branchRoutes)) continue;
        const code = t.itineraryCode?.trim();
        const targets = new Set<string>();
        if (code) {
          for (const oc of officesByItinerary.get(code) ?? []) targets.add(oc);
        }
        const rk = routeKey(t.routeLabel);
        if (rk) {
          for (const [oc, routes] of routesByOffice) {
            if (routes.has(rk)) targets.add(oc);
          }
        }
        for (const oc of targets) {
          rowOf(oc, officeName(oc) || oc).planned++;
        }
      }
    }
    return [...rows.values()]
      .map((r) => ({
        ...r,
        lateByReason: [...r.reasons.entries()]
          .map(([reason, count]) => ({ reason, count }))
          .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, "vi")),
      }))
      .filter((r) => {
        if (status === "MUON") return r.late > 0;
        if (status === "SOM") return r.early > 0;
        if (status === "DUNG") return r.onTime > 0;
        return r.arrive > 0 || r.depart > 0 || r.planned > 0;
      })
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [overviewEvents, loaded, plan, officeItineraryMap, q, route, branchRoutes, status]);
  const officeTotals = useMemo(
    () =>
      officeRows.reduce(
        (s, r) => ({
          arrive: s.arrive + r.arrive,
          depart: s.depart + r.depart,
          planned: s.planned + r.planned,
          late: s.late + r.late,
        }),
        { arrive: 0, depart: 0, planned: 0, late: 0 },
      ),
    [officeRows],
  );
  const platePage = usePagedRows(plateRows, "bao-gio-xe.plates");
  const officePage = usePagedRows(officeRows, "bao-gio-xe.offices");
  const tripPage = usePagedRows(tripRows, "bao-gio-xe.trips");
  const logPage = usePagedRows(logRows, "bao-gio-xe.logs");

  const exportExcel = (format: ExportFormat = "csv") => {
    if (!loaded) return;
    const scope = branchOptions.find((b) => b.value === branch)?.label || "toan-he-thong";
    const base = `bao-gio-xe_${scope}_${loaded.from}_${loaded.to}`;

    if (tab === "TONG_QUAN") {
      // Một file: bảng theo biển số + bảng theo VP (đúng tab đang xem).
      const rows: (string | number)[][] = [];
      if (plateRows.length) {
        rows.push(["Tổng quan theo biển số"]);
        rows.push(["STT", "Biển số", "Tài xế", "Lượt đến", "Lượt đi", "Lượt chạy theo bảng tài", "Số lần đi muộn"]);
        plateRows.forEach((r, i) =>
          rows.push([
            i + 1,
            r.plate || "Không rõ BKS",
            r.drivers.join(", "),
            r.arrive,
            r.depart,
            r.planned,
            r.late,
          ]),
        );
      }
      if (officeRows.length) {
        if (rows.length) rows.push([]);
        rows.push(["Tổng quan theo VP"]);
        rows.push(["STT", "Văn phòng", "Lượt đến", "Lượt đi", "Lượt chạy theo bảng tài", "Đi muộn theo lý do"]);
        officeRows.forEach((r, i) =>
          rows.push([
            i + 1,
            r.name,
            r.arrive,
            r.depart,
            r.planned,
            r.lateByReason.map((x) => `${x.reason} (${x.count})`).join(", "),
          ]),
        );
      }
      if (!rows.length) {
        toast.error("Tab Tổng quan chưa có dữ liệu để xuất");
        return;
      }
      downloadExcelRows(`${base}_tong-quan`, rows, "TongQuan", format);
      return;
    }

    if (tab === "CHUYEN") {
      if (!tripRows.length) {
        toast.error("Tab Theo xe tại VP chưa có dữ liệu để xuất");
        return;
      }
      downloadExcel(
        `${base}_theo-xe`,
        [
          "STT",
          "Ngày",
          "Văn phòng",
          "Biển số",
          "Tài xế",
          "Tuyến",
          "Giờ xuất bến KH",
          "Giờ đến VP",
          "Người báo đến",
          "Giờ rời VP",
          "Người báo rời",
          "Thời gian dừng (lệch giờ đón)",
          "Lý do muộn",
        ],
        tripRows.map((t, i) => [
          i + 1,
          viDay(dayOf(t.sortAt)),
          t.head.officeName,
          t.head.vehiclePlate ?? "",
          t.head.driverName ?? "",
          t.head.routeLabel ?? "",
          dayTime(t.pickup),
          dayTime(t.arrive?.eventAt),
          t.arrive ? reporter(t.arrive) : "",
          dayTime(t.depart?.eventAt),
          t.depart ? reporter(t.depart) : "",
          delayText(t.depart),
          t.depart?.reason ?? "",
        ]),
        format,
      );
      return;
    }

    if (tab === "NHAT_KY") {
      if (!logRows.length) {
        toast.error("Tab Nhật ký báo chưa có dữ liệu để xuất");
        return;
      }
      downloadExcel(
        `${base}_nhat-ky`,
        [
          "STT",
          "Ngày",
          "Giờ báo",
          "Văn phòng",
          "Loại",
          "Chuyến",
          "Biển số",
          "Tài xế",
          "Tuyến",
          "Giờ xuất bến KH",
          "Chênh giờ",
          "Người báo",
          "Lý do muộn",
        ],
        logRows.map((e, i) => [
          i + 1,
          viDay(dayOf(e.eventAt)),
          timeOf(e.eventAt),
          e.officeName,
          e.eventType === "DEPART" ? "Rời VP" : "Đến VP",
          tripLabel(e),
          e.vehiclePlate ?? "",
          e.driverName ?? "",
          e.routeLabel ?? "",
          dayTime(pickupOf(e)),
          delayText(e),
          reporter(e),
          e.reason ?? "",
        ]),
        format,
      );
      return;
    }

    toast.error("Chuyển sang tab Tổng quan / Theo xe / Nhật ký để xuất CSV");
  };

  const canExportTab =
    tab === "TONG_QUAN"
      ? plateRows.length > 0 || officeRows.length > 0
      : tab === "CHUYEN"
        ? tripRows.length > 0
        : tab === "NHAT_KY"
          ? logRows.length > 0
          : false;

  const departCount = logRows.filter((e) => e.eventType === "DEPART").length;
  const arriveCount = logRows.length - departCount;
  const lateCount = logRows.filter((e) => punctualityOf(deviationOf(e)) === "MUON").length;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="title-row">
        <div>
          <h1 className="page-title">Báo giờ xe đến/đi</h1>
          <div className="lab muted">
            Giờ do nhân viên báo trên app.{" "}
            <button type="button" className="link-plain" style={{ fontSize: 13, textDecoration: "underline" }} onClick={() => setShowRule((v) => !v)}>
              Cách tính
            </button>
          </div>
        </div>
        {tab !== "CHAM" ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" className="pill" onClick={() => quick(today(), today())} disabled={loading}>
              Hôm nay
            </button>
            <button type="button" className="pill" onClick={() => quick(monthStart(today()), today())} disabled={loading}>
              Tháng này
            </button>
            <ExportFormatButton
              className="btn tonal"
              variant="ghost"
              disabled={!loaded || !canExportTab}
              onExport={(format) => exportExcel(format)}
            />
          </div>
        ) : null}
      </div>

      {showRule ? (
        <div className="note" style={{ background: "var(--lowest)" }}>
          Xuất bến KH là giờ đón tại VP, bằng giờ xuất bến của xe cộng trừ phút lệch cài ở lộ trình áp dụng của VP. Thời gian
          dừng là chênh giữa giờ rời VP thực tế và Xuất bến KH: rời trước là Sớm, trễ 0–{LATE_MINUTES - 1} phút là Đúng giờ,
          từ {LATE_MINUTES} phút là Muộn (bắt buộc nhập lý do khi báo rời). Báo xe rời trên app bắt buộc chụp ảnh xe.
        </div>
      ) : null}

      <div className="seg" role="tablist" aria-label="Kiểu xem" style={{ alignSelf: "flex-start" }}>
        {(
          [
            ["CHAM", "departure_board", "Chấm xe đến/đi"],
            ["TONG_QUAN", "insights", "Tổng quan"],
            ["CHUYEN", "local_shipping", "Theo xe tại VP"],
            ["NHAT_KY", "history", "Nhật ký báo"],
          ] as const
        ).map(([id, icon, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            className={tab === id ? "on" : undefined}
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            <span className="ms" aria-hidden="true">
              {icon}
            </span>
            {label}
          </button>
        ))}
      </div>

      {tab === "CHAM" ? (
        <section className="card stack" style={{ gap: 16 }}>
          <div className="hr-head">
            <div style={{ minWidth: 0 }}>
              <h2 className="group-title sec-title">
                <span className="sec-ic" aria-hidden="true">
                  <span className="ms">departure_board</span>
                </span>
                Chấm xe đến/đi
              </h2>
              <p className="lab muted" style={{ margin: "4px 0 0" }}>
                Cùng danh sách và quy tắc với app: bấm tab lộ trình, báo xe đến rồi mới báo xe rời. Rời muộn từ {LATE_MINUTES}{" "}
                phút so với giờ đón phải nhập lý do. Web không chụp ảnh — ảnh văn phòng sẽ lấy từ camera sau.
              </p>
            </div>
            <div className="cham-side">{CHAM_ILL}</div>
          </div>
          {canConfigure ? (
            <label className="toggle">
              <input
                className="switch"
                type="checkbox"
                checked={photoRequired}
                disabled={savingPolicy}
                onChange={(e) => void togglePhoto(e.target.checked)}
              />
              <span>App bắt buộc chụp ảnh khi báo xe rời</span>
            </label>
          ) : null}
          <VehicleTimesMark readOnly={!canMark} />
        </section>
      ) : null}

      {tab !== "CHAM" ? (
        <div className="stack" style={{ gap: 16 }}>
          <div className="kpis num">
            <section className="card" style={{ background: "var(--primary)", color: "var(--on-primary)" }}>
              <div className="lab">Lượt xe</div>
              <div className="kpi-val">{loaded ? tripRows.length : "—"}</div>
            </section>
            <section className="card">
              <div className="lab muted">Lượt đến</div>
              <div className="kpi-val">{loaded ? arriveCount : "—"}</div>
            </section>
            <section className="card">
              <div className="lab muted">Lượt rời</div>
              <div className="kpi-val">{loaded ? departCount : "—"}</div>
            </section>
            <section className="card">
              <div className="lab muted">Lượt rời muộn</div>
              <div className="kpi-val" style={{ color: lateCount ? "var(--error)" : undefined }}>
                {loaded ? lateCount : "—"}
              </div>
            </section>
          </div>

          <div className="filter-grid">
            <label className="field">
              <span className="l">Từ ngày</span>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="field">
              <span className="l">Đến ngày</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label className="field">
              <span className="l">Tuyến</span>
              <SearchableSelect
                value={branch}
                onValueChange={setBranch}
                options={[{ value: ALL, label: "Tất cả tuyến" }, ...branchOptions]}
              />
            </label>
            <label className="field">
              <span className="l">Lộ trình</span>
              <SearchableSelect
                value={route}
                onValueChange={setRoute}
                options={[{ value: "", label: "Tất cả lộ trình" }, ...routeOptions]}
              />
            </label>
            <label className="field">
              <span className="l">Trạng thái</span>
              <SearchableSelect
                value={status}
                onValueChange={(v) => setStatus(v as "" | Punctuality)}
                options={[
                  { value: "", label: "Tất cả trạng thái" },
                  { value: "SOM", label: "Sớm" },
                  { value: "DUNG", label: "Đúng giờ" },
                  { value: "MUON", label: "Muộn" },
                ]}
              />
            </label>
            <label className="field">
              <span className="l">Tìm</span>
              <span className="box input-box">
                <input
                  type="search"
                  placeholder="Biển số, chuyến, tài xế, tuyến"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </span>
            </label>
          </div>

          {tab === "TONG_QUAN" ? (
            <div className="stack" style={{ gap: 16 }}>
              <section className="card stack">
                <div>
                  <h2 className="group-title sec-title num">
                    <span className="sec-ic" aria-hidden="true">
                      <span className="ms">local_shipping</span>
                    </span>
                    Tổng quan theo biển số ({plateRows.length})
                  </h2>
                  <div className="lab muted" style={{ maxWidth: 860 }}>
                    Lượt đến / lượt đi = số lần NV báo xe đến / rời trong khoảng ngày. Đi muộn = lượt rời VP trễ từ{" "}
                    {LATE_MINUTES} phút so với giờ đón.
                  </div>
                </div>
                {plan?.warning ? <p className="lab" style={{ color: "var(--warning)" }}>{plan.warning}</p> : null}
                {plateRows.length === 0 ? (
                  <EmptyState>{loading || planLoading || overviewLoading ? "Đang tải…" : "Chưa có xe nào"}</EmptyState>
                ) : (
                  <>
                    <div className="scroller">
                      <table className="tbl" style={{ ["--tbl-min" as string]: "760px" }}>
                        <thead>
                          <tr>
                            <th>Biển số</th>
                            <th>Tài xế</th>
                            <th className="r">Lượt đến</th>
                            <th className="r">Lượt đi</th>
                            <th className="r">Lượt chạy theo bảng tài</th>
                            <th className="r">Số lần đi muộn</th>
                          </tr>
                        </thead>
                        <tbody>
                          {platePage.pageRows.map((r) => (
                            <tr key={r.key || "-"}>
                              <td className="main">{r.plate || "Không rõ BKS"}</td>
                              <td>{r.drivers.join(", ") || "—"}</td>
                              <td className="r">{r.arrive}</td>
                              <td className="r">{r.depart}</td>
                              <td className="r">{planLoading ? "…" : r.planned}</td>
                              <td className={r.late ? "r main" : "r muted"}>{r.late}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td className="main" colSpan={2}>
                              Tổng
                            </td>
                            <td className="r">{plateTotals.arrive}</td>
                            <td className="r">{plateTotals.depart}</td>
                            <td className="r">{planLoading ? "…" : plateTotals.planned}</td>
                            <td className="r">{plateTotals.late}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <TablePagination pager={platePage.pager} />
                  </>
                )}
              </section>

              <section className="card stack">
                <h2 className="group-title sec-title">
                  <span className="sec-ic" aria-hidden="true">
                    <span className="ms">store</span>
                  </span>
                  Tổng quan theo văn phòng ({officeRows.length})
                </h2>
                {officeRows.length === 0 ? (
                  <EmptyState>{loading || overviewLoading || planLoading ? "Đang tải…" : "Chưa có văn phòng nào"}</EmptyState>
                ) : (
                  <>
                    <div className="scroller">
                      <table className="tbl" style={{ ["--tbl-min" as string]: "760px" }}>
                        <thead>
                          <tr>
                            <th>Văn phòng</th>
                            <th className="r">Lượt đến</th>
                            <th className="r">Lượt đi</th>
                            <th className="r">Lượt chạy theo bảng tài</th>
                            <th>Đi muộn theo lý do</th>
                          </tr>
                        </thead>
                        <tbody>
                          {officePage.pageRows.map((r) => (
                            <tr key={r.key}>
                              <td style={{ fontWeight: 500 }}>{r.name}</td>
                              <td className="r">{r.arrive}</td>
                              <td className="r">{r.depart}</td>
                              <td className="r">{planLoading ? "…" : r.planned}</td>
                              <td className="muted">
                                {r.lateByReason.length === 0
                                  ? "—"
                                  : r.lateByReason.map((x) => (
                                      <span key={x.reason} style={{ marginRight: 8, whiteSpace: "nowrap" }}>
                                        {x.reason} <span className="main num">({x.count})</span>
                                      </span>
                                    ))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td className="main">Tổng</td>
                            <td className="r">{officeTotals.arrive}</td>
                            <td className="r">{officeTotals.depart}</td>
                            <td className="r">{planLoading ? "…" : officeTotals.planned}</td>
                            <td className="num">{officeTotals.late}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <TablePagination pager={officePage.pager} />
                  </>
                )}
              </section>
            </div>
          ) : tab === "CHUYEN" ? (
            <section className="card stack">
              <div>
                <h2 className="group-title sec-title num">
                  <span className="sec-ic" aria-hidden="true">
                    <span className="ms">local_shipping</span>
                  </span>
                  Theo xe tại VP ({tripRows.length})
                </h2>
                <div className="lab muted">
                  Gồm xe đã báo đến hoặc rời, và xe có trong bảng tài nhưng chưa báo lần nào.
                </div>
              </div>
              {tripPlan?.warning ? <p className="lab" style={{ color: "var(--warning)" }}>{tripPlan.warning}</p> : null}
              {tripRows.length === 0 ? (
                <EmptyState>{loading || tripPlanLoading ? "Đang tải…" : "Chưa có xe trong bảng tài hoặc báo giờ"}</EmptyState>
              ) : (
                <>
                  <div className="scroller">
                    <table className="tbl" style={{ ["--tbl-min" as string]: "900px" }}>
                      <thead>
                        <tr>
                          <th>Văn phòng</th>
                          <th>Xe / Tài xế</th>
                          <th>Tuyến</th>
                          <th className="r">Xuất bến KH</th>
                          <th className="r">Giờ đến VP</th>
                          <th className="r">Giờ rời VP</th>
                          <th className="r">Thời gian dừng</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tripPage.pageRows.map((t) => (
                          <tr key={t.key}>
                            <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{t.head.officeName}</td>
                            <td>
                              <span className="main">{t.head.vehiclePlate || "—"}</span>
                              {t.head.driverName ? <span className="sub">{t.head.driverName}</span> : null}
                            </td>
                            <td>{t.head.routeLabel || "—"}</td>
                            <td className="r num">{dayTime(t.pickup) || "—"}</td>
                            <td className="r">
                              {t.arrive ? (
                                <>
                                  <span className="num main">{dayTime(t.arrive.eventAt)}</span>
                                  <span className="sub">{reporter(t.arrive)}</span>
                                </>
                              ) : (
                                <span className="muted">Chưa báo đến</span>
                              )}
                            </td>
                            <td className="r">
                              {t.depart ? (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                                  <span className="num main">{dayTime(t.depart.eventAt)}</span>
                                  <PhotoButton e={t.depart} onOpen={(e) => void openPhoto(e)} />
                                  <span className="sub">{reporter(t.depart)}</span>
                                </span>
                              ) : (
                                <span className="muted">Chưa báo rời</span>
                              )}
                            </td>
                            <td className="r" style={{ whiteSpace: "nowrap" }}>
                              <DelayCell e={t.depart} />
                              {t.depart?.reason ? <span className="sub">Lý do: {t.depart.reason}</span> : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <TablePagination pager={tripPage.pager} />
                </>
              )}
            </section>
          ) : (
            <section className="card stack">
              <h2 className="group-title sec-title num">
                <span className="sec-ic" aria-hidden="true">
                  <span className="ms">history</span>
                </span>
                Nhật ký báo ({logRows.length})
              </h2>
              {logRows.length === 0 ? (
                <EmptyState>{loading ? "Đang tải…" : "Chưa có lượt báo nào"}</EmptyState>
              ) : (
                <>
                  <div className="scroller">
                    <table className="tbl" style={{ ["--tbl-min" as string]: "1040px" }}>
                      <thead>
                        <tr>
                          <th>Giờ báo</th>
                          <th>Văn phòng</th>
                          <th>Loại</th>
                          <th>Chuyến</th>
                          <th>Xe / Tài xế</th>
                          <th>Tuyến</th>
                          <th className="r">Xuất bến KH</th>
                          <th className="r">Chênh giờ</th>
                          <th>Người báo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logPage.pageRows.map((e) => (
                          <tr key={e.id}>
                            <td className="num" style={{ whiteSpace: "nowrap" }}>
                              {dayTime(e.eventAt)}
                              <PhotoButton e={e} onOpen={(x) => void openPhoto(x)} />
                            </td>
                            <td style={{ whiteSpace: "nowrap" }}>{e.officeName}</td>
                            <td>
                              <TypeBadge type={e.eventType} />
                            </td>
                            <td className="muted">{tripLabel(e)}</td>
                            <td>
                              <span className="main">{e.vehiclePlate || "—"}</span>
                              {e.driverName ? <span className="sub">{e.driverName}</span> : null}
                            </td>
                            <td>{e.routeLabel || "—"}</td>
                            <td className="r num">{dayTime(pickupOf(e)) || "—"}</td>
                            <td className="r main">
                              <DelayCell e={e} />
                              {e.reason ? <span className="sub">Lý do: {e.reason}</span> : null}
                            </td>
                            <td>{reporter(e) || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <TablePagination pager={logPage.pager} />
                </>
              )}
            </section>
          )}
        </div>
      ) : null}

      <ImageLightbox
        open={!!photoView}
        onOpenChange={(v) => !v && setPhotoView(null)}
        urls={photoView ? [photoView.url] : []}
        title={photoView?.title}
      />
    </div>
  );
}
