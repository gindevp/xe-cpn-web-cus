import { isApiEnabled, setToken } from "./client";
import * as domain from "./domain-api";
import * as fin from "./finance-config-api";
import { useStore } from "../store";
import { foldOfficeKey, isPendingCancelRequest, officesMatchingPoint, preferredOfficeCodesForPoint, setOfficeDirectory } from "../mock-data";
import { clearRuntimePermissions } from "../rbac";
import { assignedOfficeCode, resolveViewOffice } from "../office-scope";
import { setOrdersLoadState } from "../orders-load-state";
import { vnDayOffset } from "../vn-day-range";

export async function syncMasterFromApi() {
  if (!isApiEnabled()) return;
  const [officesRaw, vehiclesRaw, driversRaw, routesRaw] = await Promise.all([
    domain.fetchOffices(),
    domain.fetchVehicles().catch(() => []),
    domain.fetchDrivers().catch(() => []),
    domain.fetchRoutes().catch(() => []),
  ]);
  const offices = domain.asArray(officesRaw).filter((o) => o.active !== false).map((o) => ({
    id: o.id,
    code: o.code,
    name: o.name,
    isHub: Boolean(o.isHub),
    sourceId: o.sourceId ?? undefined,
    address: o.address ?? undefined,
    latitude: o.latitude != null ? Number(o.latitude) : undefined,
    longitude: o.longitude != null ? Number(o.longitude) : undefined,
    itineraryPoint: o.itineraryPoint ?? undefined,
    customerVisible: o.customerVisible !== false,
  }));
  const vehicles = domain.asArray(vehiclesRaw).map((v) => ({
    id: v.id,
    bks: v.plateNumber,
    capacity: Number(v.capacityKg),
    vehicleType: v.vehicleType ?? undefined,
    volumeM3: v.volumeM3 != null ? Number(v.volumeM3) : undefined,
    note: v.note ?? undefined,
    officeCode: v.office?.code,
    driverName: v.defaultDriver?.fullName,
    active: v.active !== false,
    partnerTruck: v.partnerTruck === true,
  }));
  const drivers = domain
    .asArray(driversRaw)
    .filter((d) => d.active !== false)
    .map((d) => d.fullName);
  const routes = domain
    .asArray(routesRaw)
    .filter((r) => r.active !== false)
    .map((r) => r.name || r.code);
  setOfficeDirectory(offices);
  useStore.setState({
    offices,
    vehicles,
    drivers,
    routes,
  });
  await syncStaffFromApi().catch(() => undefined);
}

export async function syncStaffFromApi() {
  if (!isApiEnabled()) return;
  const { listStaffUsers } = await import("./staff-admin-api");
  const rows = await listStaffUsers();
  if (!Array.isArray(rows) || !rows.length) return;
  useStore.setState({
    users: rows.map((r) => ({
      username: r.username,
      role: (r.roleCode as any) || "DH",
      office: r.officeCode || "",
      officeId: r.officeId ?? undefined,
      active: r.active !== false,
      roleGroup: r.roleGroupCode || undefined,
      staffCode: r.staffCode || undefined,
      displayName: r.displayName || undefined,
      allowedOfficeIds: r.allowedOfficeIds ?? [],
    })),
  });
}

let ordersSyncInFlight: Promise<void> | null = null;

/** Boot, SSE và màn vừa mở có thể gọi cùng lúc — dùng chung một lượt tải thay vì kéo tập đơn nhiều lần. */
export function syncOrdersFromApi(): Promise<void> {
  if (!isApiEnabled()) return Promise.resolve();
  if (!ordersSyncInFlight) {
    ordersSyncInFlight = loadOrdersWorkingSet().finally(() => {
      ordersSyncInFlight = null;
    });
  }
  return ordersSyncInFlight;
}

/** Đơn mở trên pipeline kho — gồm tồn lâu (AT_DEST không cập nhật nhiều ngày) + chờ bàn giao. */
const OPEN_PIPELINE_STATUSES = [
  "DRAFT",
  "CONFIRMED",
  "WAITING",
  "IN_TRANSIT",
  "AT_DEST",
  "OUT_FOR_DELIVERY",
  "FAILED_DELIVERY",
  "RETURNING",
] as const;

const RECENT_TERMINAL_STATUSES = ["DELIVERED", "CANCELLED", "RETURNED"] as const;

async function loadOrderPages(
  take: (rows: Awaited<ReturnType<typeof domain.listOrders>>) => void,
  query: Parameters<typeof domain.listOrdersPage>[0],
  maxPages: number,
  onFirstPage?: () => void,
) {
  const first = await domain.listOrdersPage({ ...query, page: 0 });
  take(first.rows);
  onFirstPage?.();
  const pageCount = Math.min(maxPages, Math.ceil(first.total / WORKING_SET_PAGE_SIZE));
  if (first.rows.length < WORKING_SET_PAGE_SIZE || pageCount <= 1) return;
  const pages = Array.from({ length: pageCount - 1 }, (_, i) => i + 1);
  const worker = async () => {
    for (let page = pages.shift(); page != null; page = pages.shift()) {
      take((await domain.listOrdersPage({ ...query, page })).rows);
    }
  };
  await Promise.all(Array.from({ length: WORKING_SET_CONCURRENCY }, worker));
}

async function loadOrdersWorkingSet() {
  const st = useStore.getState();
  if (!st.orders.length) setOrdersLoadState({ firstPageReady: false, fullyLoaded: false });
  const officeCode = assignedOfficeCode(resolveViewOffice(st.session, st.viewOffice));
  // (1) Mọi đơn đang mở trên pipeline — không lọc theo ngày cập nhật, để đơn tồn kho lâu vẫn về.
  // (2) Đơn đã kết thúc trong N ngày gần (tab Giao thành công / đối soát nhanh).
  // Lịch sử cũ hơn: màn tra cứu tự gọi API theo trang. VP = gửi / đến / nhận.
  const pendingReq = domain
    .listOrdersAllPages({ cancelRequests: "only", size: 100, officeCode: officeCode || undefined }, 20)
    .catch(() => null);
  const keep = new Set<string>();
  const take = (rows: Awaited<ReturnType<typeof domain.listOrders>>) => {
    mergeRemoteOrders(rows);
    for (const o of rows) keep.add(o.code);
  };
  try {
    const openQuery = {
      size: WORKING_SET_PAGE_SIZE,
      sort: "id,asc",
      officeCode: officeCode || undefined,
      statuses: [...OPEN_PIPELINE_STATUSES],
    };
    await loadOrderPages(take, openQuery, WORKING_SET_OPEN_MAX_PAGES, () =>
      setOrdersLoadState({ firstPageReady: true }),
    );

    const recentQuery = {
      size: WORKING_SET_PAGE_SIZE,
      sort: "updatedAt,desc",
      officeCode: officeCode || undefined,
      statuses: [...RECENT_TERMINAL_STATUSES],
      updatedFrom: vnDayOffset(WORKING_SET_RECENT_DAYS),
    };
    await loadOrderPages(take, recentQuery, WORKING_SET_RECENT_MAX_PAGES);
  } finally {
    setOrdersLoadState({ firstPageReady: true, fullyLoaded: true });
  }
  lastFullOrdersSyncAt = Date.now();
  pruneStaleFinishedOrders(keep);
  const pending = await pendingReq;
  if (pending?.length) mergeRemoteOrders(pending);
}

/** Bỏ khỏi store đơn đã kết thúc quá cửa sổ làm việc (không còn trong kết quả server) để store không phình theo thời gian. */
function pruneStaleFinishedOrders(keep: Set<string>) {
  const cutoff = Date.now() - WORKING_SET_RECENT_DAYS * 86_400_000;
  useStore.setState((s) => {
    const next = s.orders.filter((o) => {
      if (keep.has(o.code)) return true;
      if (!["DELIVERED", "CANCELLED", "RETURNED"].includes(o.status)) return true;
      const t = Date.parse(o.updatedAt || o.createdAt || "") || 0;
      return t >= cutoff;
    });
    return next.length === s.orders.length ? s : { orders: next };
  });
}

/** Giảm bão request lên DB: SSE bổ sung đơn mới. Đơn mở tải đủ (tồn lâu); đơn xong chỉ N ngày. */
const WORKING_SET_PAGE_SIZE = 100;
/** Trần trang cho đơn đang mở (AT_DEST tồn lâu, hàng trên xe, …) — ~5000 đơn/VP. */
const WORKING_SET_OPEN_MAX_PAGES = 50;
/** Trần trang đơn đã giao/huỷ/hoàn trong cửa sổ ngày gần. */
const WORKING_SET_RECENT_MAX_PAGES = 20;
const WORKING_SET_CONCURRENCY = 2;
export const WORKING_SET_RECENT_DAYS = 7;
let lastFullOrdersSyncAt = 0;

/** Thời điểm tải đủ tập đơn làm việc gần nhất (ms) — màn mở lại trong vài chục giây không cần tải lại (SSE đã cập nhật). */
export function lastOrdersSyncAt() {
  return lastFullOrdersSyncAt;
}

/** Tải lại đúng các đơn server báo vừa đổi (SSE) — BE vẫn áp phạm vi văn phòng. */
export async function syncOrdersByCodes(codes: string[]) {
  if (!isApiEnabled()) return;
  const unique = [...new Set(codes.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    mergeRemoteOrders(await domain.listOrders({ codes: chunk, size: chunk.length }));
  }
}

function mergeRemoteOrders(remote: Awaited<ReturnType<typeof domain.listOrders>>) {
  if (!remote.length) return;
  // Merge — không replace toàn bộ: tránh poll đè mất chuyển stage/returnStage mới local.
  useStore.setState((s) => {
    const byCode = new Map(s.orders.map((o) => [o.code, o]));
    for (const r of remote) {
      if (!r.code) continue;
      if (isPendingCancelRequest(r)) {
        byCode.delete(r.code);
        continue;
      }
      const prev = byCode.get(r.code);
      if (!prev) {
        byCode.set(r.code, r);
        continue;
      }
      const localT = Date.parse(prev.updatedAt || "") || 0;
      const remoteT = Date.parse(r.updatedAt || "") || 0;
      if (localT > remoteT) {
        // Optimistic local còn mới hơn BE — giữ status/stage/returnStage local.
        byCode.set(r.code, {
          ...r,
          ...prev,
          events: prev.events?.length ? prev.events : r.events,
        });
        continue;
      }
      const terminal = ["DELIVERED", "CANCELLED", "RETURNED"].includes(r.status);
      const mergedIssue =
        r.issue != null
          ? {
              ...r.issue,
              photos:
                r.issue.photos?.length
                  ? r.issue.photos
                  : prev.issue &&
                      !prev.issue.resolvedAt &&
                      prev.issue.type === r.issue.type &&
                      prev.issue.photos?.length
                    ? prev.issue.photos
                    : r.issue.photos,
            }
          : undefined;
      byCode.set(r.code, {
        ...prev,
        ...r,
        issue: mergedIssue,
        events: r.events?.length ? r.events : prev.events,
        stage:
          r.stage != null
            ? r.stage
            : terminal
              ? undefined
              : prev.stage,
        returnStage:
          r.returnStage != null
            ? r.returnStage
            : r.status === "RETURNING" || r.status === "RETURNED"
              ? prev.returnStage
              : terminal
                ? undefined
                : prev.returnStage,
      });
    }
    return { orders: [...byCode.values()] };
  });
}

/** Tải đủ mọi trang chuyến tối đa 1 lần / khoảng này; giữa các lần chỉ làm mới trang mới nhất. */
const TRIPS_FULL_MAX_AGE_MS = 5 * 60_000;
const TRIPS_RECENT_SIZE = 200;
/** SSE báo quá nhiều chuyến cũ ngoài trang mới nhất → tải đủ thay vì gọi lẻ từng chuyến. */
const TRIPS_BY_CODE_MAX = 10;
let lastFullTripsSyncAt = 0;
let tripsSyncInFlight: Promise<void> | null = null;

function upsertTrips(rows: Awaited<ReturnType<typeof domain.listTrips>>) {
  if (!rows.length) return;
  useStore.setState((s) => {
    const fresh = new Map(rows.map((t) => [t.code, t]));
    const kept = s.trips.filter((t) => !fresh.has(t.code));
    return { trips: [...rows, ...kept] };
  });
}

async function syncAllTripPages() {
  // Không lọc office trên FE: BE đã scope theo staff VP; admin (ALL) cần đủ chuyến để map biển số.
  const trips = await domain.listTripsAllPages({ size: TRIPS_RECENT_SIZE }, 25);
  lastFullTripsSyncAt = Date.now();
  useStore.setState({ trips });
}

/** Trang chuyến mới nhất (BE sort id desc, đã scope VP) — gồm chuyến vừa tạo / đang chạy. */
async function syncRecentTrips() {
  const { rows } = await domain.listTripsPage({ page: 0, size: TRIPS_RECENT_SIZE });
  upsertTrips(rows);
  return rows;
}

/**
 * Mọi màn / đối soát định kỳ / sau thao tác gọi chung: lần đầu (hoặc quá {@link TRIPS_FULL_MAX_AGE_MS}) tải đủ trang,
 * còn lại chỉ 1 request trang mới nhất — mỗi trình duyệt không kéo lại ~25 trang chuyến mỗi lượt.
 */
export function syncTripsFromApi(): Promise<void> {
  if (!isApiEnabled()) return Promise.resolve();
  if (!tripsSyncInFlight) {
    const full = Date.now() - lastFullTripsSyncAt >= TRIPS_FULL_MAX_AGE_MS;
    tripsSyncInFlight = (full ? syncAllTripPages() : syncRecentTrips().then(() => undefined)).finally(() => {
      tripsSyncInFlight = null;
    });
  }
  return tripsSyncInFlight;
}

/** SSE báo chuyến đổi: làm mới trang mới nhất + lẻ từng chuyến cũ đang có trong store. */
export async function syncTripsByCodes(codes: string[]) {
  if (!isApiEnabled()) return;
  const wanted = new Set(codes.filter(Boolean));
  if (!wanted.size) return;
  const recent = await syncRecentTrips();
  for (const t of recent) wanted.delete(t.code);
  const known = new Set(useStore.getState().trips.map((t) => t.code));
  const older = [...wanted].filter((c) => known.has(c));
  if (!older.length) return;
  if (older.length > TRIPS_BY_CODE_MAX) {
    await syncAllTripPages();
    return;
  }
  const rows = await Promise.all(older.map((c) => domain.getTrip(c).catch(() => null)));
  upsertTrips(rows.filter((t): t is NonNullable<typeof t> => t != null));
}

export async function syncFinanceFromApi() {
  if (!isApiEnabled()) return;
  const st = useStore.getState();
  const officeCode = assignedOfficeCode(resolveViewOffice(st.session, st.viewOffice));
  // Phiếu 14 ngày gần + phân trang; màn danh sách phiếu thu vẫn tự gọi API theo lọc.
  const dayFrom = vnDayOffset(14);
  const size = 200;
  const maxPages = 15;
  const first = await fin.listReceiptsPage({
    officeCode: officeCode || undefined,
    dayFrom,
    page: 0,
    size,
  });
  const receipts = [...first.rows];
  const pageCount = Math.min(maxPages, Math.max(1, Math.ceil(first.total / size)));
  for (let page = 1; page < pageCount; page++) {
    const next = await fin.listReceiptsPage({
      officeCode: officeCode || undefined,
      dayFrom,
      page,
      size,
    });
    receipts.push(...next.rows);
    if (next.rows.length < size) break;
  }
  useStore.setState({ receipts });
}

/** Master tối thiểu cho tạo đơn công khai: chỉ VP (không kéo xe / tài xế / tuyến / user). */
export async function syncPublicOfficesFromApi() {
  if (!isApiEnabled()) return;
  let lastErr: unknown;
  // Mạng 4G/QR tại VP hay timeout lần đầu — thử lại trước khi báo lỗi.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const officesRaw = await domain.fetchOffices();
      const offices = domain
        .asArray(officesRaw)
        .filter((o) => o.active !== false)
        .map((o) => ({
          id: o.id,
          code: o.code,
          name: o.name,
          isHub: Boolean(o.isHub),
          sourceId: o.sourceId ?? undefined,
          address: o.address ?? undefined,
          latitude: o.latitude != null ? Number(o.latitude) : undefined,
          longitude: o.longitude != null ? Number(o.longitude) : undefined,
          itineraryPoint: o.itineraryPoint ?? undefined,
          customerVisible: o.customerVisible !== false,
        }));
      setOfficeDirectory(offices);
      useStore.setState({ offices });
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? "fetchOffices failed"));
}

/** Bảng giá / phụ phí — đọc được cả khi chưa đăng nhập (tạo đơn KH tạm tính cước như NV). */
export async function syncPublicPricingFromApi() {
  if (!isApiEnabled()) return;
  const [surcharges, pricingRules, doorFees, fareDiscountRules, fareDiscountCodes, productPricing] = await Promise.all([
    fin.fetchSurchargePolicy().catch(() => useStore.getState().surcharges),
    fin.fetchPricingRules().catch(() => useStore.getState().pricingRules),
    fin.fetchDoorFeeRules().catch(() => useStore.getState().doorFees),
    fin.fetchFareDiscountRules().catch(() => useStore.getState().fareDiscountRules),
    fin.fetchFareDiscountCodes().catch(() => useStore.getState().fareDiscountCodes),
    fin.fetchProductPriceRules().catch(() => useStore.getState().productPricing),
  ]);
  useStore.setState({
    surcharges,
    pricingRules,
    doorFees,
    fareDiscountRules,
    fareDiscountCodes,
    productPricing,
  });
}

/** Tất cả dữ liệu công khai cần cho wizard tạo đơn KH. */
export async function syncPublicCreateOrderFromApi() {
  if (!isApiEnabled()) return;
  // VP trước (mở combobox), bảng giá chạy nền — không để pricing treo «Đang tải văn phòng».
  await syncPublicOfficesFromApi();
  void syncPublicPricingFromApi().catch(() => undefined);
}

export async function syncConfigFromApi() {
  if (!isApiEnabled()) return;
  const [integrations] = await Promise.all([
    fin.fetchIntegrationConfig().catch(() => useStore.getState().integrations),
    syncPublicPricingFromApi(),
  ]);
  useStore.setState({ integrations });
}

export async function syncAllFromApi() {
  if (!isApiEnabled()) return;
  const results = await Promise.allSettled([
    syncMasterFromApi(),
    syncOrdersFromApi(),
    syncTripsFromApi(),
    syncFinanceFromApi(),
    syncConfigFromApi(),
  ]);
  // Master + đơn là bắt buộc sau F5; trips/finance/config fail không được làm trang “trống đơn”.
  const critical = [results[0], results[1]];
  const failed = critical.find((r) => r.status === "rejected");
  if (failed && failed.status === "rejected") throw failed.reason;
}

export function clearApiSession() {
  setToken(null);
  clearRuntimePermissions();
}

/** Resolve FE office name/code to BE office code (best-effort; may return raw label). */
export function resolveOfficeCode(nameOrCode: string | undefined): string {
  return resolveOfficeCodeStrict(nameOrCode) ?? nameOrCode?.trim() ?? "";
}

/** Map UI office label → BE code; null when master not loaded or no match. */
export function resolveOfficeCodeStrict(nameOrCode: string | undefined): string | null {
  const raw = nameOrCode?.trim();
  if (!raw) return null;
  const offices = useStore.getState().offices;
  if (!offices.length) return null;

  const byToken = offices.find((o) => {
    if (raw.startsWith("id:") && o.id != null) return `id:${o.id}` === raw;
    if (raw.startsWith("sid:") && o.sourceId != null) return `sid:${o.sourceId}` === raw;
    return false;
  });
  if (byToken) return byToken.code;

  const byCode = offices.find((o) => o.code === raw);
  if (byCode) return byCode.code;

  const byExactName = offices.find((o) => o.name === raw);
  if (byExactName) return byExactName.code;

  const matched = officesMatchingPoint(offices, raw);
  if (matched.length === 1) return matched[0].code;
  if (matched.length > 1) {
    const folded = foldOfficeKey(raw);
    const preferred = preferredOfficeCodesForPoint(folded);
    const byPref = preferred.map((c) => matched.find((o) => o.code.toUpperCase() === c)).find(Boolean);
    if (byPref) return byPref.code;
    const exact = matched.find((o) => o.name === raw);
    return (exact ?? matched[0]).code;
  }

  const folded = foldOfficeKey(raw);
  if (folded) {
    const byFold = offices.find((o) => foldOfficeKey(o.name) === folded || foldOfficeKey(o.code) === folded);
    if (byFold) return byFold.code;
    for (const code of preferredOfficeCodesForPoint(folded)) {
      const hit = offices.find((o) => o.code.toUpperCase() === code);
      if (hit) return hit.code;
    }
  }

  return null;
}
