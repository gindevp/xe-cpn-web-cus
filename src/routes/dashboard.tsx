import { createFileRoute } from "@tanstack/react-router";
import { ProtectedPage } from "@/components/AppShell";
import { M3PageHeader } from "@/components/M3Page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, Download, Info } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { isAdminRole } from "@/lib/office-scope";
import { isReadOnlyRole } from "@/lib/rbac";
import {
  collectFormLabel,
  formatDateTime,
  officeName,
  orderReceiverOffice,
  isAutoException,
  isOtherGoodsGroup,
  openIssueType,
  OTHER_GOODS,
  ROLE_LABELS,
  type Order,
  type Role,
} from "@/lib/mock-data";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useStore, type OrderX } from "@/lib/store";
import { ExportFormatButton } from "@/components/ExportFormatButton";
import { downloadExcel, type ExportFormat } from "@/lib/csv";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isApiEnabled } from "@/lib/api/client";
import {
  fetchBusinessReport,
  type BusinessReport,
  type BusinessTotals,
} from "@/lib/api/finance-config-api";
import { resolveOfficeCode } from "@/lib/api/sync";
import { listOrdersPage } from "@/lib/api/domain-api";
import { orderTabStatusLabel } from "@/lib/customer-track-status";
import { goodsTypeLabel, orderGoodsKinds, packageRows, parseOrderNoteMeta } from "@/lib/package-label";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { RouteRevenueTable } from "@/components/RouteRevenueTable";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — X.E Việt Nam" },
      { name: "description", content: "KPI vận hành X.E Việt Nam." },
    ],
  }),
  component: () => <DashboardPage />,
});

const ALL_OFFICES = "Tất cả văn phòng";
const EXPORT_PAGE_SIZE = 500;
/** An toàn tuyệt đối — dừng sớm khi all.length >= total. */
const EXPORT_SAFETY_MAX_PAGES = 2_000;
/**
 * Trạng thái xuất CSV = tên tab vận hành (top bar), nhóm theo màn.
 * Chỉ các tab tính doanh thu: không có Chờ nhận hàng / Chờ lấy hàng / Đang lấy hàng / Đơn huỷ.
 */
const EXPORT_TAB_GROUPS: { group: string; tabs: string[] }[] = [
  {
    group: "Nhập kho - Luân chuyển - Đang giao",
    tabs: [
      "Lấy hàng thành công",
      "Nhập kho gửi",
      "Đợi trung chuyển giao",
      "Hàng trên xe",
      "Nhập kho giao",
      "Đang giao hàng",
      "Giao hàng không thành công",
      "Đang hoàn",
    ],
  },
  { group: "Thành công", tabs: ["Giao thành công", "Hoàn thành công"] },
  {
    group: "Ngoại lệ",
    tabs: ["Ngoại lệ", "Thất lạc", "Hư hỏng", "Chờ duyệt huỷ"],
  },
];
const EXPORT_TAB_OTHER = "Khác";
const EXPORT_TAB_KEYS = [...EXPORT_TAB_GROUPS.flatMap((g) => g.tabs), EXPORT_TAB_OTHER];
const EXPORT_TAB_SET = new Set(EXPORT_TAB_KEYS);
const NON_REVENUE_TABS = new Set(["Chờ nhận hàng", "Chờ lấy hàng", "Đang lấy hàng", "Đơn huỷ"]);

/**
 * Đơn tính doanh thu: không huỷ, không còn chờ bàn giao (đã có hàng).
 * Đơn khách đã chuyển khoản luôn tính; huỷ vẫn tính, trừ đơn test (OnePay SANDBOX).
 */
function countsAsRevenue(o: OrderX): boolean {
  if (o.transferPaidAt && (o.status !== "CANCELLED" || !o.transferSandbox)) return true;
  return o.status !== "CANCELLED" && o.status !== "DRAFT" && !NON_REVENUE_TABS.has(orderTabStatusLabel(o));
}

/** Tab đơn đang nằm — cùng rule nhãn trạng thái nội bộ; ngoại lệ tự động (quá hạn ở kho đích) như màn Ngoại lệ. */
function exportTabOf(o: OrderX): string {
  if (!openIssueType(o.issue) && isAutoException(o)) return "Ngoại lệ";
  const label = orderTabStatusLabel(o);
  if (o.status === "RETURNING" && !openIssueType(o.issue)) return "Đang hoàn";
  return EXPORT_TAB_SET.has(label) ? label : EXPORT_TAB_OTHER;
}

function isCustomerCreated(o: Order) {
  return (o.createdBy ?? "").trim().toLowerCase() === "customer";
}

/** Khách tự tạo hay nhân viên (kèm vai trò: Điều phối, Quầy…). */
function createdSource(o: Order) {
  if (!o.createdBy) return "";
  if (isCustomerCreated(o)) return "Khách hàng";
  const role = ROLE_LABELS[o.createdByRole as Role];
  return role ? `Nhân viên - ${role}` : "Nhân viên";
}

function createdByLabel(o: Order) {
  if (!o.createdBy) return "";
  if (isCustomerCreated(o)) return "Khách hàng";
  const name = o.createdByName?.trim();
  return name && name.toLowerCase() !== o.createdBy.toLowerCase()
    ? `${name} (${o.createdBy})`
    : o.createdBy;
}

type ExportField = {
  key: string;
  label: string;
  /** Giải thích khi rê chuột vào trường trong hộp Xuất CSV. */
  hint: string;
  get: (o: OrderX) => string | number | boolean;
};

const money = (v?: number | null) => (v ? v : "");
const dateTime = (iso?: string | null) => (iso ? formatDateTime(iso) : "");

/** Nhóm hàng (tên hàng) từng kiện. Tên SP tra bảng giá để lấy nhóm. */
function exportGoodsLabel(o: OrderX): string {
  const meta = parseOrderNoteMeta(o.note);
  const kinds = orderGoodsKinds(o);
  const pricing = useStore.getState().productPricing;
  const labels = kinds
    .map((kind, i) => {
      const k = kind.trim();
      const custom = (meta.goodsNames[i] ?? "").trim();
      if (isOtherGoodsGroup(k)) return custom ? `${OTHER_GOODS} (${custom})` : OTHER_GOODS;
      const hit = pricing.find((p) => p.name.trim().toLocaleLowerCase("vi") === k.toLocaleLowerCase("vi"));
      const group = hit?.group.trim() ?? "";
      if (group && !isOtherGoodsGroup(group)) return `${group} (${k})`;
      return custom ? `${k} (${custom})` : k;
    })
    .filter(Boolean);
  return labels.join(", ") || goodsTypeLabel(o.goodsType);
}

/** Ghi chú người nhập — bỏ thẻ kỹ thuật trong note. */
function exportNote(o: OrderX): string {
  const meta = parseOrderNoteMeta(o.note);
  const pkg = meta.packageNotes.map((s) => s.trim()).filter(Boolean);
  if (meta.body && pkg.length) return `${meta.body}; ${pkg.join(" | ")}`;
  return meta.body || pkg.join(" | ");
}

function exportDim(o: OrderX, axis: "d" | "r" | "c"): string {
  const vals = packageRows(o).map((row) => {
    const n = row.dims?.[axis];
    if (n == null || !Number.isFinite(n) || n <= 0) return "";
    return String(Number(Number(n).toFixed(1)));
  });
  return vals.some(Boolean) ? vals.join(" | ") : "";
}

const ORDER_EXPORT_FIELDS: ExportField[] = [
  {
    key: "code",
    label: "Mã đơn",
    hint: "Mã vận đơn in trên tem và biên nhận.",
    get: (o) => o.code,
  },
  {
    key: "status",
    label: "Trạng thái",
    hint: "Tên tab vận hành đơn đang nằm (Nhập kho gửi, Hàng trên xe, Nhập kho giao, Giao thành công, Ngoại lệ, Đơn huỷ…) — giống bộ lọc trạng thái khi xuất.",
    get: (o) => exportTabOf(o as OrderX),
  },
  {
    key: "createdAt",
    label: "Ngày tạo",
    hint: "Thời điểm tạo đơn (giờ Việt Nam).",
    get: (o) => dateTime(o.createdAt),
  },
  {
    key: "createdSource",
    label: "Nguồn tạo",
    hint: "Khách tự tạo trên app/web, hay nhân viên tạo (kèm vai trò: Điều phối, Quầy…).",
    get: createdSource,
  },
  {
    key: "createdBy",
    label: "Người tạo",
    hint: 'Họ tên và tài khoản nhân viên tạo đơn; ghi "Khách hàng" nếu khách tự tạo.',
    get: createdByLabel,
  },
  {
    key: "senderName",
    label: "Người gửi",
    hint: "Tên người gửi hàng.",
    get: (o) => o.senderName ?? "",
  },
  {
    key: "senderPhone",
    label: "SĐT gửi",
    hint: "Số điện thoại người gửi.",
    get: (o) => o.senderPhone,
  },
  {
    key: "receiverName",
    label: "Người nhận",
    hint: "Tên người nhận hàng.",
    get: (o) => o.receiverName,
  },
  {
    key: "receiverPhone",
    label: "SĐT nhận",
    hint: "Số điện thoại người nhận.",
    get: (o) => o.receiverPhone,
  },
  {
    key: "fromOffice",
    label: "VP gửi",
    hint: "Văn phòng nhận hàng từ người gửi.",
    get: (o) => officeName(o.fromOffice) || o.fromOffice,
  },
  {
    key: "toOffice",
    label: "VP nhận",
    hint: "Văn phòng trả hàng cho người nhận. Nếu đơn đã đổi điểm nhận thì là văn phòng mới.",
    get: (o) => officeName(orderReceiverOffice(o)) || orderReceiverOffice(o),
  },
  {
    key: "address",
    label: "Địa chỉ giao",
    hint: "Địa chỉ giao tận nơi (chỉ có khi khách chọn giao tận nơi).",
    get: (o) => o.address ?? "",
  },
  {
    key: "goodsType",
    label: "Loại hàng",
    hint: "Nhóm hàng, trong ngoặc là tên hàng. Nhiều kiện cách nhau bởi dấu phẩy.",
    get: (o) => exportGoodsLabel(o),
  },
  {
    key: "quantity",
    label: "Số kiện",
    hint: "Số kiện hàng của đơn.",
    get: (o) => o.quantity ?? "",
  },
  {
    key: "weightKg",
    label: "Cân nặng (kg)",
    hint: "Tổng cân nặng khai/cân của đơn.",
    get: (o) => o.weightKg ?? "",
  },
  {
    key: "lengthCm",
    label: "Dài (cm)",
    hint: "Chiều dài từng kiện, cm. Nhiều kiện cách nhau bởi dấu |, cùng thứ tự với Rộng và Cao.",
    get: (o) => exportDim(o, "d"),
  },
  {
    key: "widthCm",
    label: "Rộng (cm)",
    hint: "Chiều rộng từng kiện, cm.",
    get: (o) => exportDim(o, "r"),
  },
  {
    key: "heightCm",
    label: "Cao (cm)",
    hint: "Chiều cao từng kiện, cm.",
    get: (o) => exportDim(o, "c"),
  },
  {
    key: "collectForm",
    label: "Hình thức thu",
    hint: "Ai trả cước: Công nợ, người gửi trả, người nhận trả, hoặc chia % (30–70, 50–50, 70–30). Đơn ghi nợ xuất «Công nợ» (không lẫn Người gửi trả).",
    get: (o) => collectFormLabel(o.collectForm, o.onCredit),
  },
  {
    key: "goodsFare",
    label: "Cước hàng",
    hint: "Cước vận chuyển theo bảng giá, chưa gồm phí lấy/giao tận nơi, khai giá, COD.",
    get: (o) => money(o.goodsFare),
  },
  {
    key: "pickupFee",
    label: "Phí lấy tận nơi",
    hint: "Phí đến địa chỉ khách lấy hàng.",
    get: (o) => money(o.pickupFee),
  },
  {
    key: "deliveryFee",
    label: "Phí giao tận nơi",
    hint: "Phí giao hàng đến địa chỉ người nhận.",
    get: (o) => money(o.deliveryFee),
  },
  {
    key: "declaredFee",
    label: "Phí khai giá",
    hint: "Phí bảo hiểm theo giá trị hàng khách khai.",
    get: (o) => money(o.declaredFee),
  },
  {
    key: "codFee",
    label: "Phí COD",
    hint: "Phí dịch vụ thu hộ tiền hàng.",
    get: (o) => money(o.codFee),
  },
  {
    key: "discountAmount",
    label: "Giảm giá",
    hint: "Số tiền được giảm trên đơn.",
    get: (o) => money(o.discountAmount),
  },
  {
    key: "fare",
    label: "Tổng cước",
    hint: "Tổng tiền cước khách phải trả = cước hàng + phí lấy/giao tận nơi + phí khai giá + phí COD − giảm giá. Không gồm tiền COD thu hộ.",
    get: (o) => o.fare ?? 0,
  },
  {
    key: "paidAmount",
    label: "Đã thu",
    hint: "Số tiền cước đã thu của khách.",
    get: (o) => o.paidAmount ?? 0,
  },
  {
    key: "dueAmount",
    label: "Còn thu",
    hint: "Tiền cước còn phải thu = Tổng cước − Đã thu.",
    get: (o) => Math.max(0, (o.fare ?? 0) - (o.paidAmount ?? 0)),
  },
  {
    key: "paidTransId",
    label: "Mã giao dịch",
    hint: "Mã GD OnePay khi đơn thu hộ chuyển khoản. Đơn tiền mặt / chưa CK để trống.",
    get: (o) => o.paidTransId ?? "",
  },
  {
    key: "codAmount",
    label: "Tiền COD",
    hint: "Tiền hàng thu hộ người gửi khi giao cho người nhận (không phải cước).",
    get: (o) => money(o.codAmount),
  },
  {
    key: "ahamoveFee",
    label: "Phí giao/lấy Ahamove",
    hint: "Tiền phải trả Ahamove (ví hoặc tiền mặt). Đơn không book Ahamove hoặc đã hủy để trống. Không cộng vào tổng cước khách trả.",
    get: (o) =>
      (o.partnerCode === "AHAMOVE" || o.partnerCode === "GRAB") && (o.partnerStatus ?? "").toUpperCase() !== "CANCELLED"
        ? money(o.partnerFee)
        : "",
  },
  {
    key: "ahamovePayMethod",
    label: "Thanh toán Ahamove",
    hint: "Hình thức trả phí Ahamove lúc book: ví hoặc tiền mặt.",
    get: (o) =>
      o.partnerCode !== "AHAMOVE" && o.partnerCode !== "GRAB"
        ? ""
        : o.partnerPayMethod === "CASH"
          ? "Tiền mặt"
          : o.partnerPayMethod === "BALANCE"
            ? "Ví"
            : "",
  },
  {
    key: "internalDeliveryFee",
    label: "Phí giao nội bộ",
    hint: "Phí giao tận nơi khi giao nội bộ. Đơn book Ahamove/Grab để trống.",
    get: (o) => (o.partnerCode === "AHAMOVE" || o.partnerCode === "GRAB" ? "" : money(o.deliveryFee)),
  },
  {
    key: "internalShipperName",
    label: "Tên NV giao lấy nội bộ",
    hint: "Shipper nội bộ được gán giao/lấy hàng. Đơn book Ahamove/Grab để trống.",
    get: (o) =>
      o.partnerCode === "AHAMOVE" || o.partnerCode === "GRAB" ? "" : (o.shipperName ?? "").trim(),
  },
  {
    key: "vehiclePlate",
    label: "Biển số xe",
    hint: "Xe chở đơn (khi đã lên xe).",
    get: (o) => o.vehiclePlate ?? "",
  },
  {
    key: "driverName",
    label: "Tài xế",
    hint: "Tài xế của xe chở đơn.",
    get: (o) => o.driverName ?? "",
  },
  { key: "note", label: "Ghi chú", hint: "Ghi chú nhập khi tạo đơn, không gồm dữ liệu kỹ thuật.", get: (o) => exportNote(o) },
  {
    key: "invoiceRequested",
    label: "Yêu cầu hoá đơn",
    hint: "Khách có yêu cầu xuất hoá đơn VAT cho đơn này không.",
    get: (o) => (o.invoiceRequested ? "Có" : "Không"),
  },
  {
    key: "invoiceNo",
    label: "Số hoá đơn",
    hint: "Số hoá đơn điện tử đã xuất (nếu có).",
    get: (o) => o.invoiceNo ?? "",
  },
];

function localDay(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Ngày 30 của tháng (hoặc ngày cuối nếu tháng ngắn hơn). */
function monthDay30(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const day = Math.min(30, last);
  return `${iso.slice(0, 8)}${String(day).padStart(2, "0")}`;
}

/** Giờ tạo đơn theo Asia/Ho_Chi_Minh (cùng múi giờ báo cáo BE). */
function vnCreatedHour(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  return Number.isFinite(h) ? ((h % 24) + 24) % 24 : 0;
}

function vnHourSlot(iso: string) {
  return Math.min(11, Math.max(0, Math.floor(vnCreatedHour(iso) / 2)));
}

/** Ngày VN (yyyy-MM-dd) của mốc thời gian. */
function vnDay(iso?: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** Mốc nhập kho gửi (ưu tiên warehouseInAt / pickedUpAt). */
function warehouseInAtOf(o: OrderX) {
  return o.warehouseInAt || o.pickedUpAt || "";
}

/** Mốc nhập kho giao. */
function destWarehouseInAtOf(o: OrderX) {
  return o.destWarehouseInAt || "";
}

type HourDrillKind = "gui" | "nhan";
type HourDrillRow = { order: OrderX; at: string; kind: HourDrillKind };

function DashboardPage() {
  const { session } = useAuth();
  const offices = useStore((s) => s.offices);
  const today = localDay(new Date());
  const [from, setFrom] = useState(() => `${today.slice(0, 8)}01`);
  const [to, setTo] = useState(() => monthDay30(today));
  /** Ngày riêng cho biểu đồ / bảng khung giờ (1 ngày, nhẹ). */
  const [hourDate, setHourDate] = useState(today);
  const [office, setOffice] = useState<string>(ALL_OFFICES);
  const [mainTab, setMainTab] = useState<"business" | "route">("business");
  const [report, setReport] = useState<BusinessReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [hourReport, setHourReport] = useState<BusinessReport | null>(null);
  const [hourLoading, setHourLoading] = useState(false);
  /** Cache đơn gửi khi bấm xem chi tiết khung giờ (không tải sẵn cả tháng). */
  const [hourDrillCache, setHourDrillCache] = useState<HourDrillRow[] | null>(null);
  const [hourDrillCacheKey, setHourDrillCacheKey] = useState("");
  const [hourDrillLoading, setHourDrillLoading] = useState(false);
  const readOnly = isReadOnlyRole(session?.role);
  const isAdmin = isAdminRole(session?.role);
  /** AD + KT được xuất file đơn hàng từ dashboard. */
  const canExportOrders = isAdmin || session?.role === "KT";

  const [exportOpen, setExportOpen] = useState(false);
  const [exportOffice, setExportOffice] = useState<string>(ALL_OFFICES);
  const [exportFrom, setExportFrom] = useState(from);
  const [exportTo, setExportTo] = useState(to);
  const [exportKeys, setExportKeys] = useState<Set<string>>(
    () => new Set(ORDER_EXPORT_FIELDS.map((f) => f.key)),
  );

  useEffect(() => {
    if (!isApiEnabled() || !from || !to || from > to) return;
    let cancelled = false;
    const officeCode = office === ALL_OFFICES ? undefined : resolveOfficeCode(office);
    setReportLoading(true);
    fetchBusinessReport(from, to, officeCode)
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch((e) => {
        if (!cancelled) {
          setReport(null);
          toast.error(e instanceof Error ? e.message : "Không tải được báo cáo kinh doanh");
        }
      })
      .finally(() => {
        if (!cancelled) setReportLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, office]);

  /** Khung giờ: báo cáo 1 ngày (nhẹ), cùng API business — không kéo cả tháng. */
  useEffect(() => {
    if (!isApiEnabled() || !hourDate) {
      setHourReport(null);
      return;
    }
    let cancelled = false;
    const officeCode = office === ALL_OFFICES ? undefined : resolveOfficeCode(office);
    setHourLoading(true);
    fetchBusinessReport(hourDate, hourDate, officeCode)
      .then((r) => {
        if (!cancelled) setHourReport(r);
      })
      .catch((e) => {
        if (!cancelled) {
          setHourReport(null);
          toast.error(e instanceof Error ? e.message : "Không tải được đơn theo khung giờ");
        }
      })
      .finally(() => {
        if (!cancelled) setHourLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hourDate, office]);

  // Đổi ngày/VP khung giờ → bỏ cache danh sách chi tiết.
  useEffect(() => {
    setHourDrillCache(null);
    setHourDrillCacheKey("");
  }, [hourDate, office]);

  const officeNameByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of offices) {
      if (o.code) m.set(o.code.toUpperCase(), o.name);
    }
    return m;
  }, [offices]);

  const officeNameOf = (raw: string) => {
    const named = offices.find((x) => x.code === raw || x.name === raw);
    return named?.name ?? (raw || "—");
  };
  const officeOf = (o: { code?: string; fromOffice?: string }) => officeNameOf(o.fromOffice || "");
  const toOfficeOf = (o: OrderX) => officeNameOf(orderReceiverOffice(o));
  const drillOfficeOf = (r: HourDrillRow) =>
    r.kind === "gui" ? officeOf(r.order) : toOfficeOf(r.order);

  const stat = useMemo(() => {
    const hours = hourReport?.hours ?? [];
    const OFFICES_ONLY = offices.map((o) => o.name);
    const buckets = Array.from({ length: 12 }, (_, i) => {
      const h = hours.find((x) => x.slot === i);
      const label = h?.label ?? `${String(i * 2).padStart(2, "0")}-${String(i * 2 + 2).padStart(2, "0")}h`;
      const perOffice: Record<string, number> = {};
      for (const name of OFFICES_ONLY) perOffice[name] = 0;
      const raw = h?.perOffice ?? {};
      for (const [code, n] of Object.entries(raw)) {
        const name = officeNameByCode.get(code.toUpperCase()) ?? (code || "—");
        perOffice[name] = (perOffice[name] || 0) + Number(n || 0);
      }
      return { label, slot: i, count: Number(h?.count ?? 0), perOffice };
    });
    const perOfficeTotals: Record<string, number> = {};
    for (const b of buckets) {
      for (const [k, v] of Object.entries(b.perOffice)) {
        perOfficeTotals[k] = (perOfficeTotals[k] || 0) + v;
      }
    }
    const totalOrders = buckets.reduce((s, b) => s + b.count, 0);
    const day0 = hourReport?.days?.[0];
    const daySent = Number(day0?.sent ?? 0);
    const dayReceived = Number(day0?.received ?? 0);
    return {
      totalOrders,
      daySent,
      dayReceived,
      buckets,
      perOfficeTotals,
      officesShown: OFFICES_ONLY.filter((o) => office === ALL_OFFICES || o === office),
    };
  }, [hourReport, office, offices, officeNameByCode]);

  const maxBucket = Math.max(1, ...stat.buckets.map((b) => b.count));
  const [hourDrill, setHourDrill] = useState<{ title: string; rows: HourDrillRow[] } | null>(null);

  const fetchOrdersWindow = async (officeFilter: {
    fromOfficeCode?: string;
    toOfficeCode?: string;
  }): Promise<OrderX[]> => {
    const from = new Date(`${hourDate}T12:00:00+07:00`);
    from.setDate(from.getDate() - 45);
    const createdFrom = from.toISOString().slice(0, 10);
    const all: OrderX[] = [];
    for (let page = 0; page < EXPORT_SAFETY_MAX_PAGES; page++) {
      const { rows, total } = await listOrdersPage({
        createdFrom,
        createdTo: hourDate,
        fromOfficeCode: officeFilter.fromOfficeCode,
        toOfficeCode: officeFilter.toOfficeCode,
        cancelRequests: "include",
        size: EXPORT_PAGE_SIZE,
        page,
        sort: "createdAt,asc",
      });
      all.push(...rows);
      if (rows.length === 0 || all.length >= total) break;
    }
    return all;
  };

  const ensureHourOrders = async (): Promise<HourDrillRow[]> => {
    const officeCode =
      office === ALL_OFFICES
        ? undefined
        : (offices.find((x) => x.name === office)?.code ?? resolveOfficeCode(office));
    const key = `${hourDate}|${officeCode ?? ""}`;
    if (hourDrillCache && hourDrillCacheKey === key) return hourDrillCache;
    if (!isApiEnabled() || !hourDate) return [];
    setHourDrillLoading(true);
    try {
      // Gửi: theo VP gửi; nhận: theo VP nhận. Cùng ngày sự kiện nhập kho (VN).
      const byCode = new Map<string, OrderX>();
      const sentPool = await fetchOrdersWindow(
        officeCode ? { fromOfficeCode: officeCode } : {},
      );
      const recvPool = officeCode
        ? await fetchOrdersWindow({ toOfficeCode: officeCode })
        : sentPool;
      for (const o of sentPool) byCode.set(o.code, o);
      for (const o of recvPool) byCode.set(o.code, o);

      const events: HourDrillRow[] = [];
      for (const o of byCode.values()) {
        if (!countsAsRevenue(o)) continue;
        const wh = warehouseInAtOf(o);
        if (wh && vnDay(wh) === hourDate) {
          if (!officeCode || (o.fromOffice || "").toUpperCase() === officeCode.toUpperCase()) {
            events.push({ order: o, at: wh, kind: "gui" });
          }
        }
        const dest = destWarehouseInAtOf(o);
        if (dest && vnDay(dest) === hourDate) {
          const recvCode = orderReceiverOffice(o);
          if (!officeCode || recvCode.toUpperCase() === officeCode.toUpperCase()) {
            events.push({ order: o, at: dest, kind: "nhan" });
          }
        }
      }
      setHourDrillCache(events);
      setHourDrillCacheKey(key);
      return events;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được danh sách đơn");
      return [];
    } finally {
      setHourDrillLoading(false);
    }
  };

  const openHourDrill = async (
    title: string,
    opts: { slot?: number; officeName?: string; all?: boolean },
  ) => {
    const list = await ensureHourOrders();
    let rows = list;
    if (opts.slot != null) {
      rows = rows.filter((r) => r.at && vnHourSlot(r.at) === opts.slot);
    }
    if (opts.officeName) rows = rows.filter((r) => drillOfficeOf(r) === opts.officeName);
    if (!rows.length) {
      toast.message("Không có đơn trong khung này");
      return;
    }
    setHourDrill({
      title,
      rows: [...rows].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
    });
  };

  const openExportDialog = () => {
    setExportOffice(office);
    setExportFrom(from);
    setExportTo(to);
    setExportKeys(new Set(ORDER_EXPORT_FIELDS.map((f) => f.key)));
    setExportOpen(true);
  };

  const toggleExportKey = (key: string, on: boolean) => {
    setExportKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const allFieldsSelected = exportKeys.size === ORDER_EXPORT_FIELDS.length;
  const toggleAllFields = (on: boolean) => {
    setExportKeys(on ? new Set(ORDER_EXPORT_FIELDS.map((f) => f.key)) : new Set());
  };

  const [exporting, setExporting] = useState(false);
  /** Đơn trong khoảng ngày/VP (mọi tab) — tải một lần khi đổi bộ lọc, lọc tab tại chỗ. */
  const [exportPool, setExportPool] = useState<OrderX[] | null>(null);
  const [exportPoolLoading, setExportPoolLoading] = useState(false);
  const [exportTabs, setExportTabs] = useState<Set<string>>(() => new Set(EXPORT_TAB_KEYS));
  const allTabsSelected = exportTabs.size === EXPORT_TAB_KEYS.length;
  const [exportTabsOpen, setExportTabsOpen] = useState(false);
  const toggleExportTab = (t: string, on: boolean) =>
    setExportTabs((prev) => {
      const next = new Set(prev);
      if (on) next.add(t);
      else next.delete(t);
      return next;
    });

  const loadExportPool = useCallback(async (): Promise<OrderX[]> => {
    if (!isApiEnabled()) throw new Error("Chưa kết nối máy chủ — không xuất được");
    if (exportFrom > exportTo) throw new Error("Từ ngày không được sau Đến ngày");
    const officeCode =
      exportOffice === ALL_OFFICES
        ? undefined
        : (offices.find((x) => x.name === exportOffice)?.code ?? resolveOfficeCode(exportOffice));
    const all: OrderX[] = [];
    for (let page = 0; page < EXPORT_SAFETY_MAX_PAGES; page++) {
      const { rows, total } = await listOrdersPage({
        createdFrom: exportFrom,
        createdTo: exportTo,
        fromOfficeCode: officeCode || undefined,
        cancelRequests: "include",
        size: EXPORT_PAGE_SIZE,
        page,
        sort: "createdAt,asc",
      });
      all.push(...rows);
      if (rows.length === 0 || all.length >= total) break;
    }
    return all.filter(countsAsRevenue);
  }, [exportFrom, exportTo, exportOffice, offices]);

  useEffect(() => {
    if (!exportOpen || !isApiEnabled() || exportFrom > exportTo) {
      setExportPool(null);
      setExportPoolLoading(false);
      return;
    }
    let cancelled = false;
    setExportPoolLoading(true);
    const timer = setTimeout(() => {
      void loadExportPool()
        .then((all) => {
          if (!cancelled) setExportPool(all);
        })
        .catch((e) => {
          if (!cancelled) {
            setExportPool(null);
            toast.error(e instanceof Error ? e.message : "Không tải được danh sách đơn");
          }
        })
        .finally(() => {
          if (!cancelled) setExportPoolLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [exportOpen, exportFrom, exportTo, loadExportPool]);

  const exportTabCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of exportPool ?? []) {
      const t = exportTabOf(o);
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    return m;
  }, [exportPool]);

  const exportRows = useMemo(
    () => (exportPool ?? []).filter((o) => exportTabs.has(exportTabOf(o))),
    [exportPool, exportTabs],
  );

  const doExportExcel = async (format: ExportFormat = "csv") => {
    if (!exportKeys.size) {
      toast.error("Chọn ít nhất một trường để xuất");
      return;
    }
    if (exportFrom > exportTo) {
      toast.error("Từ ngày không được sau Đến ngày");
      return;
    }
    if (!isApiEnabled()) {
      toast.error("Chưa kết nối máy chủ — không xuất được");
      return;
    }
    if (!exportTabs.size) {
      toast.error("Chưa chọn trạng thái nào");
      return;
    }
    const fields = ORDER_EXPORT_FIELDS.filter((f) => exportKeys.has(f.key));

    setExporting(true);
    try {
      let pool = exportPool;
      if (!pool) {
        setExportPoolLoading(true);
        try {
          pool = await loadExportPool();
          setExportPool(pool);
        } finally {
          setExportPoolLoading(false);
        }
      }
      const rows = pool.filter((o) => exportTabs.has(exportTabOf(o)));
      if (!rows.length) {
        toast.error("Không có đơn nào thuộc các trạng thái đã chọn");
        return;
      }
      downloadExcel(
        `don-hang-${exportFrom}_${exportTo}`,
        fields.map((f) => f.label),
        rows.map((o) => fields.map((f) => f.get(o))),
        format,
      );
      toast.success(`Đã xuất ${rows.length} đơn · ${fields.length} cột`);
      setExportOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được danh sách đơn để xuất");
    } finally {
      setExporting(false);
    }
  };

  const cur = report?.current;
  const prev = report?.previous;
  const pctOf = (a?: number | null, b?: number | null) =>
    a != null && b != null && b !== 0 ? ((a - b) / Math.abs(b)) * 100 : null;
  const fmtPct = (p: number | null) =>
    p == null ? "—" : `${Math.abs(p).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
  const fmtNum = (n?: number | null) =>
    n == null ? "—" : n.toLocaleString("vi-VN");
  const revCollectedPct =
    cur && cur.totalRevenue > 0 ? (cur.receiptRevenue / cur.totalRevenue) * 100 : null;
  const deliveredPct =
    cur && cur.totalOrders > 0 ? (cur.deliveredCount / cur.totalOrders) * 100 : null;

  return (
    <ProtectedPage title="Tổng quan" screen="dashboard" hidePageTitle>
      <div className="m3-page stack" style={{ gap: 16 }}>
        <M3PageHeader
          title="Tổng quan"
          description="Hoạt động kinh doanh"
          actions={
            <div className="filters" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
              <label className="field" style={{ flex: "0 0 160px" }}>
                <span className="l">Từ ngày</span>
                <span className="box input-box">
                  <input
                    type="date"
                    className="num"
                    value={from}
                    max={to}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                  <span className="ms" aria-hidden="true">
                    calendar_today
                  </span>
                </span>
              </label>
              <label className="field" style={{ flex: "0 0 160px" }}>
                <span className="l">Đến ngày</span>
                <span className="box input-box">
                  <input
                    type="date"
                    className="num"
                    value={to}
                    min={from}
                    onChange={(e) => setTo(e.target.value)}
                  />
                  <span className="ms" aria-hidden="true">
                    calendar_today
                  </span>
                </span>
              </label>
              <div className="field" style={{ flex: "0 0 180px" }}>
                <span className="l">Văn phòng gửi</span>
                <SearchableSelect
                  value={office}
                  onValueChange={setOffice}
                  options={[
                    { value: ALL_OFFICES, label: ALL_OFFICES },
                    ...offices.map((o) => ({ value: o.name, label: o.name })),
                  ]}
                />
              </div>
              {canExportOrders && mainTab === "business" ? (
                <button type="button" className="btn tonal" onClick={openExportDialog}>
                  <span className="ms" aria-hidden="true">
                    download
                  </span>
                  Xuất CSV
                </button>
              ) : null}
            </div>
          }
        />

        {from > to ? (
          <div className="login-alert" role="alert">
            Từ ngày không được sau Đến ngày.
          </div>
        ) : null}

        <div className="seg" role="tablist" aria-label="Loại báo cáo" style={{ alignSelf: "flex-start" }}>
          <button
            type="button"
            role="tab"
            className={cn(mainTab === "business" && "on")}
            aria-selected={mainTab === "business"}
            onClick={() => setMainTab("business")}
          >
            Báo cáo kinh doanh
          </button>
          <button
            type="button"
            role="tab"
            className={cn(mainTab === "route" && "on")}
            aria-selected={mainTab === "route"}
            onClick={() => setMainTab("route")}
          >
            Doanh thu theo tuyến
          </button>
        </div>

        {mainTab === "route" ? (
          <section className="card">
            <RouteRevenueTable
              from={from}
              to={to}
              officeCode={
                office === ALL_OFFICES
                  ? undefined
                  : (offices.find((o) => o.name === office)?.code ?? resolveOfficeCode(office))
              }
            />
          </section>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: 16 }}>
            <div
              style={{
                flex: "999 1 640px",
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: 16,
                opacity: reportLoading ? 0.6 : 1,
              }}
            >
              <div className="kpi-groups">
                <section className="card kg">
                  <div className="kg-head">
                    <h2 className="group-title sec-title">
                      <span className="sec-ic" aria-hidden="true">
                        <span className="ms">payments</span>
                      </span>
                      Doanh thu
                    </h2>
                    <span className="kg-note small muted">% so với tháng trước</span>
                  </div>
                  <div className="kg-grid">
                    <KgCell
                      lead
                      label="Tổng doanh thu"
                      value={fmtNum(cur?.totalRevenue)}
                      unit="VND"
                      pct={pctOf(cur?.totalRevenue, prev?.totalRevenue)}
                      fmtPct={fmtPct}
                    />
                    <KgCell
                      label="Đã thu"
                      value={fmtNum(cur?.receiptRevenue)}
                      unit="VND"
                      pct={pctOf(cur?.receiptRevenue, prev?.receiptRevenue)}
                      fmtPct={fmtPct}
                    />
                    <KgCell
                      label="Còn phải thu"
                      value={fmtNum(cur?.backlogRevenue)}
                      unit="VND"
                      pct={pctOf(cur?.backlogRevenue, prev?.backlogRevenue)}
                      fmtPct={fmtPct}
                      downIsGood
                    />
                  </div>
                  <div className="kg-bar">
                    <div
                      className="meter"
                      role="img"
                      aria-label={
                        revCollectedPct == null
                          ? "Chưa có tỷ lệ đã thu"
                          : `Đã thu ${revCollectedPct.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`
                      }
                    >
                      <i
                        style={{
                          width: `${Math.min(100, Math.max(0, revCollectedPct ?? 0))}%`,
                          background: "var(--primary)",
                        }}
                      />
                      <i style={{ flex: 1, background: "var(--low)" }} />
                    </div>
                    <span className="small muted num">
                      Đã thu{" "}
                      {revCollectedPct == null
                        ? "—"
                        : `${revCollectedPct.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`}
                    </span>
                  </div>
                </section>

                <section className="card kg">
                  <div className="kg-head">
                    <h2 className="group-title sec-title">
                      <span className="sec-ic" aria-hidden="true">
                        <span className="ms">inventory_2</span>
                      </span>
                      Đơn hàng
                    </h2>
                    <span className="kg-note small muted">% so với tháng trước</span>
                  </div>
                  <div className="kg-grid">
                    <KgCell
                      lead
                      label="Tổng số đơn"
                      value={fmtNum(cur?.totalOrders)}
                      unit="đơn"
                      pct={pctOf(cur?.totalOrders, prev?.totalOrders)}
                      fmtPct={fmtPct}
                    />
                    <KgCell
                      label="Giao thành công"
                      value={fmtNum(cur?.deliveredCount)}
                      unit="đơn"
                      pct={pctOf(cur?.deliveredCount, prev?.deliveredCount)}
                      fmtPct={fmtPct}
                    />
                    <KgCell
                      label="Đơn tồn"
                      value={fmtNum(cur?.backlogCount)}
                      unit="đơn"
                      pct={pctOf(cur?.backlogCount, prev?.backlogCount)}
                      fmtPct={fmtPct}
                      badWhenUp
                    />
                  </div>
                  <div className="kg-bar">
                    <div
                      className="meter"
                      role="img"
                      aria-label={
                        deliveredPct == null
                          ? "Chưa có tỷ lệ giao thành công"
                          : `Giao thành công ${deliveredPct.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`
                      }
                    >
                      <i
                        style={{
                          width: `${Math.min(100, Math.max(0, deliveredPct ?? 0))}%`,
                          background: "var(--primary)",
                        }}
                      />
                      <i style={{ flex: 1, background: "var(--low)" }} />
                    </div>
                    <span className="small muted num">
                      Giao thành công{" "}
                      {deliveredPct == null
                        ? "—"
                        : `${deliveredPct.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`}
                    </span>
                  </div>
                </section>
              </div>

              <OfficeOrdersChart report={report} loading={reportLoading} />
            </div>

            <section className="card stack" style={{ flex: "1 1 100%", minWidth: 0, gap: 16 }}>
              <div className="hr-head">
                <div style={{ minWidth: 0 }}>
                  <h2 className="card-title sec-title">
                    <span className="sec-ic" aria-hidden="true">
                      <span className="ms">schedule</span>
                    </span>
                    Số lượng đơn hàng theo khung giờ
                  </h2>
                  <div className="lab muted" style={{ marginTop: 4 }}>
                    {hourLoading
                      ? "Đang tải…"
                      : `Trong ngày: ${stat.daySent} gửi + ${stat.dayReceived} nhận · biểu đồ khung giờ = tổng sự kiện nhập kho (API chưa tách gửi/nhận theo slot).`}
                  </div>
                </div>
                <div className="hr-tools">
                  <div className="field" style={{ flex: "0 0 150px", minWidth: 0 }}>
                    <span className="l">Ngày</span>
                    <span className="box input-box">
                      <input
                        type="date"
                        className="num"
                        value={hourDate}
                        onChange={(e) => setHourDate(e.target.value)}
                      />
                      <span className="ms" aria-hidden="true">
                        calendar_today
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {hourLoading && !hourReport?.hours?.length ? (
                <div className="empty">
                  <h3 className="group-title">Đang tải…</h3>
                </div>
              ) : (
                <div className="scroller" style={{ opacity: hourLoading ? 0.6 : 1 }}>
                  <div className="hr-plot">
                    {stat.buckets.map((b) => {
                      const h = b.count ? Math.max(4, Math.round((b.count / maxBucket) * 170)) : 0;
                      return (
                        <div key={b.label} className="hr-col">
                          <div className="hr-bars">
                            <div className="hr-bar">
                              <button
                                type="button"
                                className="hr-num num"
                                disabled={!b.count || hourDrillLoading}
                                aria-label={`${b.label}: ${b.count} đơn, xem danh sách`}
                                onClick={() =>
                                  void openHourDrill(`Tất cả văn phòng · ${b.label}`, { slot: b.slot })
                                }
                              >
                                {b.count ? b.count.toLocaleString("vi-VN") : "—"}
                              </button>
                              <i className="recv" style={{ height: h }} />
                            </div>
                          </div>
                          <span className="hr-tick num">{b.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            <section className="card stack" style={{ flex: "1 1 100%", minWidth: 0, gap: 16 }}>
              <div>
                <h2 className="card-title sec-title">
                  <span className="sec-ic" aria-hidden="true">
                    <span className="ms">store</span>
                  </span>
                  Số đơn theo văn phòng / khung giờ
                </h2>
              </div>
              <div className="scroller">
                <table className="tbl compact vp-hours" style={{ ["--tbl-min" as string]: "1000px" }}>
                  <thead>
                    <tr>
                      <th>Văn phòng</th>
                      {stat.buckets.map((b) => (
                        <th key={b.label} className="r">
                          {b.label}
                        </th>
                      ))}
                      <th className="r">Tổng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stat.officesShown.map((name) => (
                      <tr key={name}>
                        <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{name}</td>
                        {stat.buckets.map((b) => {
                          const n = b.perOffice[name] || 0;
                          return (
                            <td key={b.label} className="r">
                              <button
                                type="button"
                                className="vp-num num"
                                disabled={!n || hourDrillLoading}
                                aria-label={`${name}, ${b.label}: ${n} đơn`}
                                onClick={() =>
                                  void openHourDrill(`${name} · ${b.label}`, {
                                    slot: b.slot,
                                    officeName: name,
                                  })
                                }
                              >
                                {n ? n.toLocaleString("vi-VN") : "—"}
                              </button>
                            </td>
                          );
                        })}
                        <td className="r main">
                          <button
                            type="button"
                            className="vp-num num"
                            disabled={!(stat.perOfficeTotals[name] || 0) || hourDrillLoading}
                            onClick={() => void openHourDrill(`${name} · cả khoảng`, { officeName: name })}
                          >
                            {(stat.perOfficeTotals[name] || 0).toLocaleString("vi-VN")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Tổng</td>
                      {stat.buckets.map((b) => (
                        <td key={b.label} className="r">
                          {b.count ? b.count.toLocaleString("vi-VN") : "—"}
                        </td>
                      ))}
                      <td className="r">{stat.totalOrders.toLocaleString("vi-VN")}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            {readOnly ? (
              <div className="lab muted">Chế độ chỉ xem (Ban lãnh đạo) — mọi nút ghi đã ẩn.</div>
            ) : null}
          </div>
        )}

      <Dialog open={!!hourDrill} onOpenChange={(open) => !open && setHourDrill(null)}>
        <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>{hourDrill?.title}</DialogTitle>
            <DialogDescription>
              {hourDrillLoading
                ? "Đang tải danh sách đơn…"
                : `${hourDrill?.rows.length ?? 0} sự kiện (nhập kho gửi / nhập kho giao trong khung giờ).`}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto px-5 py-3">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-2 font-medium">Mã đơn</th>
                  <th className="py-2 pr-2 font-medium">Loại</th>
                  <th className="py-2 pr-2 font-medium">Giờ sự kiện</th>
                  <th className="py-2 pr-2 font-medium">Trạng thái</th>
                  <th className="py-2 pr-2 font-medium">Người gửi</th>
                  <th className="py-2 font-medium">Người nhận</th>
                </tr>
              </thead>
              <tbody>
                {hourDrill?.rows.map((r) => (
                  <tr key={`${r.kind}-${r.order.code}-${r.at}`} className="border-b last:border-0">
                    <td className="py-2 pr-2">
                      <OrderCodeLink code={r.order.code} />
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap text-xs">
                      {r.kind === "gui" ? "Đơn gửi" : "Đơn nhận"}
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap text-xs">{formatDateTime(r.at)}</td>
                    <td className="py-2 pr-2">{orderTabStatusLabel(r.order)}</td>
                    <td className="py-2 pr-2">
                      <div>{r.order.senderName || "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.order.senderPhone}</div>
                    </td>
                    <td className="py-2">
                      <div>{r.order.receiverName || "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.order.receiverPhone}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>Xuất đơn hàng</DialogTitle>
            <DialogDescription>
              Lọc theo văn phòng và khoảng ngày tạo đơn, chọn các trường cần xuất, rồi chọn CSV hoặc Excel. Admin và kế toán.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-1">
                <Label className="text-xs">Văn phòng</Label>
                <SearchableSelect
                  value={exportOffice}
                  onValueChange={setExportOffice}
                  className="h-9"
                  options={[
                    { value: ALL_OFFICES, label: ALL_OFFICES },
                    ...offices.map((o) => ({ value: o.name, label: o.name })),
                  ]}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Từ ngày</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={exportFrom}
                  onChange={(e) => setExportFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Đến ngày</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={exportTo}
                  onChange={(e) => setExportTo(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-1.5 text-left text-sm font-medium"
                  onClick={() => setExportTabsOpen((v) => !v)}
                  aria-expanded={exportTabsOpen}
                >
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      !exportTabsOpen && "-rotate-90",
                    )}
                  />
                  Trạng thái theo tab
                  <span className="truncate font-normal text-muted-foreground">
                    ·{" "}
                    {allTabsSelected
                      ? "Tất cả"
                      : `Đã chọn ${exportTabs.size}/${EXPORT_TAB_KEYS.length}`}
                  </span>
                </button>
                {exportTabsOpen ? (
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={allTabsSelected}
                      onCheckedChange={(v) =>
                        setExportTabs(v ? new Set(EXPORT_TAB_KEYS) : new Set())
                      }
                    />
                    Chọn tất cả
                  </label>
                ) : (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => setExportTabsOpen(true)}
                  >
                    Lọc trạng thái
                  </button>
                )}
              </div>
              {exportTabsOpen &&
                [
                  ...EXPORT_TAB_GROUPS,
                  ...((exportTabCounts.get(EXPORT_TAB_OTHER) ?? 0) > 0
                    ? [{ group: "Khác", tabs: [EXPORT_TAB_OTHER] }]
                    : []),
                ].map((g) => {
                  const groupOn = g.tabs.every((t) => exportTabs.has(t));
                  return (
                    <div key={g.group} className="rounded-md border px-3 py-2">
                      <label className="mb-1.5 flex cursor-pointer items-center gap-2 text-xs font-semibold text-muted-foreground">
                        <Checkbox
                          checked={groupOn}
                          onCheckedChange={(v) =>
                            g.tabs.forEach((t) => toggleExportTab(t, Boolean(v)))
                          }
                        />
                        {g.group}
                      </label>
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {g.tabs.map((t) => (
                          <label
                            key={t}
                            className="flex cursor-pointer items-center gap-1.5 text-sm"
                          >
                            <Checkbox
                              checked={exportTabs.has(t)}
                              onCheckedChange={(v) => toggleExportTab(t, Boolean(v))}
                            />
                            {t}
                            {exportPool ? (
                              <span className="text-xs tabular-nums text-muted-foreground">
                                ({(exportTabCounts.get(t) ?? 0).toLocaleString("vi-VN")})
                              </span>
                            ) : null}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="rounded-md border border-info/30 bg-info/10 px-3 py-2 text-xs text-info">
              <div className="text-sm font-semibold">
                {exportFrom > exportTo
                  ? "Khoảng ngày không hợp lệ"
                  : exportPoolLoading
                    ? "Đang tải danh sách đơn…"
                    : !exportPool
                      ? "Chưa tải được danh sách đơn"
                      : exportTabs.size === 0
                        ? "Chưa chọn trạng thái nào"
                        : `Sẽ tải về ${exportRows.length.toLocaleString("vi-VN")} / ${exportPool.length.toLocaleString("vi-VN")} đơn`}
              </div>
              <div className="mt-1">
                Gồm đơn{" "}
                <b>
                  {allTabsSelected
                    ? "mọi tab tính doanh thu"
                    : EXPORT_TAB_KEYS.filter((t) => exportTabs.has(t)).join(", ") || "—"}
                </b>
                , <b>tạo</b> trong khoảng ngày trên
                {exportOffice === ALL_OFFICES
                  ? ", trên toàn hệ thống."
                  : `, có VP gửi là ${exportOffice}.`}{" "}
                Không gồm đơn huỷ và đơn còn chờ nhận / chờ lấy / đang lấy hàng (chưa tính doanh
                thu). Trạng thái = tab đơn đang nằm lúc xuất (cột “Trạng thái” trong file ghi đúng tên
                tab này).
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-b pb-2">
              <div className="text-sm font-medium">
                Trường thông tin đơn ({ORDER_EXPORT_FIELDS.length})
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox
                  checked={allFieldsSelected}
                  onCheckedChange={(v) => toggleAllFields(Boolean(v))}
                />
                Chọn tất cả
              </label>
            </div>

            <TooltipProvider delayDuration={200}>
              <div className="grid max-h-[40vh] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {ORDER_EXPORT_FIELDS.map((f) => (
                  <Tooltip key={f.key}>
                    <TooltipTrigger asChild>
                      <label className="flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 text-sm hover:bg-muted/40">
                        <Checkbox
                          className="mt-0.5"
                          checked={exportKeys.has(f.key)}
                          onCheckedChange={(v) => toggleExportKey(f.key, Boolean(v))}
                        />
                        <span className="flex-1">{f.label}</span>
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </label>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs leading-relaxed">
                      {f.hint}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
          </div>

          <DialogFooter className="border-t px-5 py-3">
            <Button type="button" variant="outline" onClick={() => setExportOpen(false)}>
              Huỷ
            </Button>
            <ExportFormatButton
              busy={exporting}
              label={`Xuất (${exportKeys.size} cột)`}
              onExport={(format) => void doExportExcel(format)}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </ProtectedPage>
  );
}

function KgCell({
  lead,
  label,
  value,
  unit,
  pct,
  fmtPct,
  badWhenUp,
  downIsGood,
}: {
  lead?: boolean;
  label: string;
  value: string;
  unit: string;
  pct: number | null;
  fmtPct: (p: number | null) => string;
  /** Tăng là xấu (vd đơn tồn). */
  badWhenUp?: boolean;
  /** Giảm vẫn hiện up-style (vd còn phải thu giảm). */
  downIsGood?: boolean;
}) {
  const up = pct != null && pct >= 0;
  const bad = pct == null ? false : badWhenUp ? up : downIsGood ? false : !up;
  const icon = up ? "north_east" : "south_east";
  return (
    <div className={cn("kg-cell", lead && "lead")}>
      <div className="lab muted">{label}</div>
      <div className="num">
        <span className={lead ? "hero kg-main" : "val"}>{value}</span>{" "}
        <span className="small muted">{unit}</span>
      </div>
      <div className="kg-delta">
        {pct == null ? (
          <span className="small muted">— so với tháng trước</span>
        ) : (
          <>
            <span className={cn("delta num", bad ? "bad" : "up")}>
              <span className="ms" aria-hidden="true" style={{ fontSize: 16 }}>
                {icon}
              </span>
              {fmtPct(pct)}
            </span>
            <span className="small muted">so với tháng trước</span>
          </>
        )}
      </div>
    </div>
  );
}

function fmtDayRevenue(n: number) {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}tr`;
  }
  if (n >= 1_000) return `${Math.round(n / 1000)}k`;
  return n.toLocaleString("vi-VN");
}

function buildDayCurve(
  values: number[],
  max: number,
  base = 256,
  plot = 190,
) {
  const P = values.map((v, i) => [(i + 0.5) * 10, base - (v / max) * plot] as const);
  if (!P.length) return { line: "", area: "" };
  let line = `M${P[0][0]} ${P[0][1].toFixed(1)}`;
  for (let i = 0; i < P.length - 1; i++) {
    const [x1, y1] = P[i];
    const [x2, y2] = P[i + 1];
    const mx = (x1 + x2) / 2;
    line += ` C${mx} ${y1.toFixed(1)} ${mx} ${y2.toFixed(1)} ${x2} ${y2.toFixed(1)}`;
  }
  const area = `${line} L${P[P.length - 1][0]} ${base} L${P[0][0]} ${base} Z`;
  return { line, area };
}

function OfficeOrdersChart({
  report,
  loading,
}: {
  report: BusinessReport | null;
  loading: boolean;
}) {
  const rows = report?.days ?? [];
  const [showSent, setShowSent] = useState(true);
  const [showRecv, setShowRecv] = useState(true);
  const [view, setView] = useState<"chart" | "table">("chart");
  const [sel, setSel] = useState<number | null>(null);

  const MAX = Math.max(1, ...rows.map((r) => Math.max(r.sent, r.received)), 10);
  const BASE = 256;
  const PLOT = 190;
  const sentCurve = buildDayCurve(
    rows.map((r) => r.sent),
    MAX,
    BASE,
    PLOT,
  );
  const recvCurve = buildDayCurve(
    rows.map((r) => r.received),
    MAX,
    BASE,
    PLOT,
  );
  const tickVals = [MAX, Math.round(MAX / 2), 0];
  const fmt = (d?: string) => (d ? d.split("-").reverse().join("/") : "");
  const fmtN = (n: number) => n.toLocaleString("vi-VN");

  return (
    <section className="card" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 className="card-title sec-title">
            <span className="sec-ic" aria-hidden="true">
              <span className="ms">calendar_month</span>
            </span>
            Số lượng đơn hàng theo ngày
          </h2>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            className={`legend${showSent ? "" : " off"}`}
            aria-pressed={showSent}
            onClick={() => setShowSent((v) => !v)}
          >
            <span className="dot sent" aria-hidden="true" />
            Đơn gửi
          </button>
          <button
            type="button"
            className={`legend${showRecv ? "" : " off"}`}
            aria-pressed={showRecv}
            onClick={() => setShowRecv((v) => !v)}
          >
            <span className="dot recv" aria-hidden="true" />
            Đơn nhận
          </button>
          <button type="button" className="pill sm" onClick={() => setView((v) => (v === "chart" ? "table" : "chart"))}>
            <span className="ms" aria-hidden="true">
              {view === "chart" ? "table_rows" : "bar_chart"}
            </span>
            {view === "chart" ? "Bảng" : "Biểu đồ"}
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <h3 className="group-title">{loading ? "Đang tải…" : "Không có đơn trong khoảng ngày này"}</h3>
        </div>
      ) : view === "table" ? (
        <div className="scroller" style={{ maxHeight: 280, overflowY: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Đơn gửi</th>
                <th>Đơn nhận</th>
                <th>Cước</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date}>
                  <td>{fmt(r.date)}</td>
                  <td>{fmtN(r.sent)}</td>
                  <td>{fmtN(r.received)}</td>
                  <td>{Number(r.revenue) ? fmtDayRevenue(Number(r.revenue)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="scroller">
          <div className="plot" style={{ minWidth: Math.max(640, rows.length * 36) }}>
            {tickVals.map((v) => (
              <div key={v} className="gl" style={{ top: BASE - Math.round((v / MAX) * PLOT) }}>
                <span className="small muted num">{fmtN(v)}</span>
              </div>
            ))}
            <div className="fee-band" aria-hidden="true">
              <span className="ms">payments</span>Cước
            </div>
            <svg className="area-svg" viewBox="0 0 310 256" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="grad-recv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--chart-recv)" stopOpacity=".32" />
                  <stop offset="1" stopColor="var(--chart-recv)" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="grad-sent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--chart-sent)" stopOpacity=".32" />
                  <stop offset="1" stopColor="var(--chart-sent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {showRecv ? (
                <g className="reveal">
                  <path d={recvCurve.area} fill="url(#grad-recv)" />
                  <path className="area-line recv-line" d={recvCurve.line} />
                </g>
              ) : null}
              {showSent ? (
                <g className="reveal d2">
                  <path d={sentCurve.area} fill="url(#grad-sent)" />
                  <path className="area-line sent-line" d={sentCurve.line} />
                </g>
              ) : null}
            </svg>
            <div className="days" onMouseLeave={() => setSel(null)}>
              {rows.map((r, i) => {
                const day = Number(r.date.slice(8, 10));
                const on = sel === i;
                return (
                  <button
                    key={r.date}
                    type="button"
                    className={`day${on ? " on" : ""}`}
                    aria-label={`Ngày ${fmt(r.date)}: gửi ${fmtN(r.sent)}, nhận ${fmtN(r.received)}, cước ${fmtDayRevenue(Number(r.revenue) || 0)}`}
                    onMouseEnter={() => setSel(i)}
                    onFocus={() => setSel(i)}
                    onClick={() => setSel(i)}
                  >
                    {on ? (
                      <>
                        <span className="xhair" aria-hidden="true" />
                        {showRecv ? (
                          <i className="pt recv" style={{ bottom: 24 + (r.received / MAX) * PLOT - 5 }} />
                        ) : null}
                        {showSent ? (
                          <i className="pt sent" style={{ bottom: 24 + (r.sent / MAX) * PLOT - 5 }} />
                        ) : null}
                      </>
                    ) : null}
                    <span className="pl-fee num" aria-hidden="true">
                      {Number(r.revenue) ? fmtDayRevenue(Number(r.revenue)) : ""}
                    </span>
                    {showRecv ? (
                      <span className="pl pl-r num" style={{ bottom: 24 + (r.received / MAX) * PLOT + 7 }} aria-hidden="true">
                        {fmtN(r.received)}
                      </span>
                    ) : null}
                    {showSent ? (
                      <span className="pl pl-s num" style={{ bottom: 24 + (r.sent / MAX) * PLOT + 7 }} aria-hidden="true">
                        {fmtN(r.sent)}
                      </span>
                    ) : null}
                    <span className="d num">{day}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

