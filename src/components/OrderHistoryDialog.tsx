import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { DialogDescription } from "@/components/ui/dialog";
import { M3Sheet, M3SheetClose, M3SheetTitle } from "@/components/m3/M3Sheet";
import { StaffInfoPopover } from "@/components/StaffInfoPopover";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { ChangePaymentTermDialog, canChangePayTerm } from "@/components/ChangePaymentTermDialog";
import { ChangeDestOfficeDialog, canRerouteDest } from "@/components/ChangeDestOfficeDialog";
import { OrderInvoicePanel } from "@/components/OrderInvoicePanel";
import { AutoCallMini, useLatestAutoCalls } from "@/components/OrderAutoCalls";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  COLLECT_FORMS,
  OTHER_GOODS,
  isOtherGoodsGroup,
  formatDateTime,
  formatVND,
  officeName,
  orderReceiverOffice,
  receiverOfficeName,
  allOfficeSelectOptions,
  findOfficeByToken,
  officeOptionValue,
  type OfficeRec,
} from "@/lib/mock-data";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useStore, type OrderX } from "@/lib/store";
import { isApiEnabled } from "@/lib/api/client";
import { getOrder } from "@/lib/api/domain-api";
import {
  customerCollectDue,
  orderEventContent,
  isVisibleOrderEvent,
  senderFareTreatedCollected,
} from "@/lib/finance-debt";
import { GoodsPhotoButton } from "@/components/GoodsPhotoButton";
import { OrderTransferQrDialog } from "@/components/OrderTransferQrDialog";
import { TransferPaidBadge } from "@/components/TransferPaidBadge";
import { canStaffSenderTransferQr } from "@/components/StaffSenderTransferQrAction";
import {
  buildOrderNote,
  dimsLabel,
  displayOrderNote,
  driverSignsForEvents,
  goodsLabelOf,
  type PackageDims,
  packageCode,
  packageRows,
  parseOrderNoteMeta,
  warehouseInSeqs,
} from "@/lib/package-label";
import {
  calcCodFee,
  calcDeclaredValueFee,
  calcFare,
  calcHomeDoorFees,
  VAGUE_DOOR_FEE,
  computeGoodsLineFare,
  sumPackageChargeKg,
} from "@/lib/pricing";
import { useOrderFareRoutes } from "@/lib/use-order-fare-routes";
import { TransitTag } from "@/components/OfficeRouteCell";
import { estimatePickupKm } from "@/lib/api/ahamove-api";
import { isShortGoogleMapsLink, latLngFromGoogleMapsLink, resolveGoogleMapsLink } from "@/lib/google-maps-link";
import { toUpperName } from "@/lib/vn-name";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { canWrite, isReadOnlyRole, useRbacVersion } from "@/lib/rbac";
import {
  orderStatusAllowsFieldEdit,
  orderEditableFields,
  canEditReceiverOffice,
} from "@/lib/order-edit-policy";
import { isPendingHandover } from "@/lib/pending-handover";
import { NameInput } from "@/components/NameInput";
import { PhoneInput } from "@/components/PhoneInput";
import { MoneyInput } from "@/components/MoneyInput";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { PrintLabelDialog } from "@/components/PrintLabelDialog";

type HistoryCtx = {
  openOrderHistory: (code: string) => void;
};

const OrderHistoryContext = createContext<HistoryCtx | null>(null);

export function useOrderHistory() {
  const ctx = useContext(OrderHistoryContext);
  if (!ctx) {
    throw new Error("useOrderHistory must be used within OrderHistoryProvider");
  }
  return ctx;
}

export function useOrderHistoryOptional() {
  return useContext(OrderHistoryContext);
}

export function OrderHistoryProvider({ children }: { children: ReactNode }) {
  const [code, setCode] = useState<string | null>(null);
  const openOrderHistory = useCallback((c: string) => {
    const t = c?.trim();
    if (t) setCode(t);
  }, []);
  const value = useMemo(() => ({ openOrderHistory }), [openOrderHistory]);

  return (
    <OrderHistoryContext.Provider value={value}>
      {children}
      <OrderHistoryDialog
        code={code}
        open={Boolean(code)}
        onOpenChange={(v) => {
          if (!v) setCode(null);
        }}
      />
    </OrderHistoryContext.Provider>
  );
}

export function OrderCodeLink({
  code,
  className,
  children,
}: {
  code: string;
  className?: string;
  children?: ReactNode;
}) {
  const ctx = useOrderHistoryOptional();
  const label = children ?? code;

  if (!code?.trim()) return <span className={className}>{label}</span>;

  if (!ctx) {
    return <span className={cn("code", className)}>{label}</span>;
  }

  return (
    <button
      type="button"
      className={cn("code", className)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        ctx.openOrderHistory(code);
      }}
    >
      {label}
    </button>
  );
}

type OrderEvent = { at: string; by?: string; action: string; detail?: string };

/** Detail BE: `mã phiếu · số tiền` — mã phiếu mở Danh sách phiếu thu lọc sẵn phiếu đó. */
function ReceiptEventContent({
  detail,
  onOpen,
  label = "Lập phiếu thu",
}: {
  detail: string;
  onOpen: () => void;
  label?: string;
}) {
  const navigate = useNavigate();
  const [receiptCode, ...rest] = detail.split(" · ");
  return (
    <>
      {label}{" "}
      <button
        type="button"
        className="font-semibold text-primary underline-offset-2 hover:underline"
        onClick={() => {
          onOpen();
          void navigate({ to: "/danh-sach-phieu-thu", search: { code: receiptCode.trim() } });
        }}
      >
        {receiptCode.trim()}
      </button>
      {rest.length ? ` · ${rest.join(" · ")}` : null}
    </>
  );
}

type EditPkg = {
  seq: number;
  kind: string;
  goodsName: string;
  itemQty: number;
  weightKg: number;
  dims: PackageDims | null;
  fare: number;
  /** Giá trị hàng khai báo (VND). */
  value: number;
  note: string;
  inboundStatus: "IN" | "MISSING";
};

type EditForm = {
  note: string;
  codAmount: number;
  codFee: number;
  senderName: string;
  senderPhone: string;
  receiverName: string;
  receiverPhone: string;
  /** Token/code VP nhận (CK = toOffice; GTN = hub/receiver). */
  toOffice: string;
  pickupAddress: string;
  address: string;
  homePickup: boolean;
  homeDelivery: boolean;
  returnName: string;
  returnPhone: string;
  returnAddress: string;
  packages: EditPkg[];
  /**
   * Đã có [PKGVAL] trên note hoặc user vừa sửa giá trị kiện → tính phí khai giá từ tổng value.
   * Đơn cũ chưa lưu value: giữ declaredFee đã lưu tới khi user sửa.
   */
  declaredValueDirty: boolean;
};

/** Cước kiện: giống EditPackageDialog — giá SP × SL, không thì theo cân/tuyến. */
/** "tài khoản - mã NV - họ tên"; sự kiện vừa thao tác (chưa đồng bộ) tra theo danh sách tài khoản. */
function actorLabel(
  e: { by?: string; byStaffCode?: string; byName?: string },
  users: { username: string; staffCode?: string; displayName?: string }[],
): string {
  const login = e.by?.trim() ?? "";
  if (!login) return "";
  const u = e.byStaffCode || e.byName ? undefined : users.find((x) => x.username.toLowerCase() === login.toLowerCase());
  const code = (e.byStaffCode ?? u?.staffCode ?? "").trim();
  const rawName = (e.byName ?? u?.displayName ?? "").trim();
  const name = rawName.toLowerCase() === login.toLowerCase() ? "" : rawName;
  return [login, code, name].filter(Boolean).join(" - ");
}

function computePackageFare(opts: {
  group?: string;
  /** Đơn trung chuyển có 2 tuyến: cước = tổng. */
  routes: string[];
  kind: string;
  goodsName: string;
  itemQty: number;
  weightKg: number;
  dims: PackageDims | null;
}): number {
  return opts.routes.reduce(
    (sum, route) =>
      sum +
      computeGoodsLineFare({
        group: opts.group,
        kind: opts.kind,
        name: opts.goodsName,
        sl: opts.itemQty,
        weight: opts.weightKg,
        route,
        d: opts.dims?.d,
        r: opts.dims?.r,
        c: opts.dims?.c,
      }),
    0,
  );
}

function samePackages(a: EditPkg[], b: EditPkg[]): boolean {
  const key = (p: EditPkg) =>
    [
      p.kind.trim(),
      p.goodsName.trim(),
      p.itemQty,
      Number(p.weightKg) || 0,
      dimsLabel(p.dims),
      Math.round(p.fare),
      Math.round(Number(p.value) || 0),
    ].join("|");
  return a.length === b.length && a.every((p, i) => key(p) === key(b[i]));
}

function declaredFeeOf(o: OrderX, form?: EditForm | null): number {
  if (!form) return o.declaredFee ?? 0;
  if (!form.declaredValueDirty) return o.declaredFee ?? 0;
  const sum = form.packages.reduce((s, p) => s + (Number(p.value) || 0), 0);
  return calcDeclaredValueFee(sum);
}

function routeShortLabel(o: OrderX): string {
  const label = (o.itinerary || o.route || "").trim();
  if (label) return label;
  const from = o.fromOffice || "—";
  const to = orderReceiverOffice(o) || o.toOffice || "—";
  return `${from} → ${to}`;
}

function payMethodLabel(o: OrderX): string {
  const paid = o.paidAmount ?? 0;
  const fare = o.fare ?? 0;
  if (o.onCredit) return "Công nợ";
  if (paid > 0 && paid < fare) return "Thu cước 1 phần";
  if (o.collectForm === "NHAN_TRA") return "Người nhận thanh toán";
  if (o.collectForm === "GUI_TRA" || paid >= fare) return "Người gửi thanh toán";
  return COLLECT_FORMS.find((c) => c.value === o.collectForm)?.label ?? o.collectForm ?? "—";
}

function formFromOrder(o: OrderX, offices: OfficeRec[] = []): EditForm {
  const meta = parseOrderNoteMeta(o.note);
  const recv = orderReceiverOffice(o);
  const toRec = findOfficeByToken(recv, offices);
  const pkgs = packageRows(o);
  const valuesKnown = meta.packageValues.length === pkgs.length && pkgs.length > 0;
  return {
    note: displayOrderNote(o.note),
    codAmount: o.codAmount ?? 0,
    codFee: o.codFee ?? 0,
    senderName: o.senderName ?? "",
    senderPhone: o.senderPhone ?? "",
    receiverName: o.receiverName ?? "",
    receiverPhone: o.receiverPhone ?? "",
    toOffice: toRec ? officeOptionValue(toRec) : recv || "",
    pickupAddress: o.pickupAddress ?? "",
    address: o.address ?? "",
    homePickup: Boolean(o.homePickup),
    homeDelivery: Boolean(o.homeDelivery),
    returnName: meta.returnName || o.senderName || "",
    returnPhone: meta.returnPhone || o.senderPhone || "",
    returnAddress: meta.returnAddress || o.pickupAddress || "",
    declaredValueDirty: valuesKnown,
    packages: pkgs.map((p) => ({
      seq: p.seq,
      kind: p.kind,
      goodsName: p.goodsName,
      itemQty: p.itemQty,
      weightKg: p.weightKg ?? 0,
      dims: p.dims,
      fare: p.fare,
      value: p.value ?? 0,
      note: p.note,
      inboundStatus: p.inboundStatus === "IN" ? "IN" : "MISSING",
    })),
  };
}

function FieldShell({
  label,
  action,
  className,
  children,
}: {
  label: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("field cfg-field view-field", className)}>
      <span className="l" title={label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        {label}
        {action}
      </span>
      {children}
    </div>
  );
}

function ViewValue({ value }: { value: string }) {
  return <div className="view-val">{value || "—"}</div>;
}

/** Ô đang sửa mở hộp thoại đổi riêng (VP nhận chuyển tay, hình thức thanh toán). */
function EditPickButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="box input-box"
      style={{ width: "100%", textAlign: "left", cursor: "pointer" }}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 truncate">{children}</span>
      <span className="ms" aria-hidden="true" style={{ color: "var(--primary)" }}>
        edit
      </span>
    </button>
  );
}

function FeeRow({ label, amount, hideZero }: { label: string; amount: number; hideZero?: boolean }) {
  if (hideZero && !(amount > 0)) return null;
  return (
    <div className="fee-line num">
      <span>{label}</span>
      <span>{formatVND(amount)}</span>
    </div>
  );
}

function SecTitle({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <h2 className="group-title sec-title">
      <span className="sec-ic" aria-hidden="true">
        <span className="ms">{icon}</span>
      </span>
      {children}
    </h2>
  );
}

function moneyOf(o: OrderX, form?: EditForm | null, deliveryOverride?: number | null) {
  const pickup = form && !form.homePickup ? 0 : (o.pickupFee ?? 0);
  const delivery = deliveryOverride != null ? deliveryOverride : (o.deliveryFee ?? 0);
  const declared = declaredFeeOf(o, form);
  const discount = o.discountAmount ?? 0;
  const storage = o.storageFee ?? 0;
  const returnFee = o.returnFee ?? 0;
  const codFee = form ? form.codFee : (o.codFee ?? 0);
  const codGoods = form ? form.codAmount : (o.codAmount ?? 0);
  const goodsFare = form
    ? form.packages.reduce((s, p) => s + (Number(p.fare) || 0), 0)
    : o.goodsFare != null
      ? Number(o.goodsFare)
      : Math.max(0, (o.fare ?? 0) - pickup - delivery - (o.codFee ?? 0) - declared - storage - returnFee + discount);
  const summed = goodsFare + pickup + delivery + (codGoods > 0 ? codFee : 0) + declared + storage + returnFee - discount;
  // Cước đã hạ theo phí giao mới thì còn phải thu theo số mới, không giữ phần chênh cũ.
  const fare = form
    ? summed
    : summed > 0 && (o.fare ?? 0) > summed
      ? summed
      : (o.fare ?? 0);
  const paidRaw = o.paidAmount ?? 0;
  const treatedSenderCollected = senderFareTreatedCollected(o);
  const balanceDue = Math.max(0, fare - paidRaw);
  const storageUnpaid =
    o.collectForm === "GUI_TRA" ? Math.min(balanceDue, Math.max(0, storage)) : 0;
  // Hiện đúng số đã thu thật. Chỉ «bơm» = cước khi chờ CK OnePay (paid còn 0) và không còn phí tồn.
  const paid =
    treatedSenderCollected && o.onePayAwaitingTransfer && paidRaw < fare && storageUnpaid <= 0
      ? Math.max(paidRaw, fare)
      : paidRaw;
  // Còn thu khách: phí tồn / phần người nhận; không gộp nợ VP gửi đã vào phiếu thu.
  const fareDue = customerCollectDue({ ...o, fare, paidAmount: paidRaw, storageFee: storage });
  const shippingPaid = fareDue <= 0;
  const paidByLabel =
    o.collectForm === "GUI_TRA"
      ? treatedSenderCollected && o.onePayAwaitingTransfer && paidRaw < fare
        ? "nhập kho gửi · chờ CK OnePay"
        : paidRaw > 0 && balanceDue > 0
          ? "người gửi đã trả một phần"
          : "người gửi đã trả"
      : o.collectForm === "NHAN_TRA"
        ? paidRaw > 0 && balanceDue > 0
          ? "đã thu một phần · còn thu người nhận"
          : "người nhận đã trả"
        : o.collectForm?.startsWith("P")
          ? "người gửi + người nhận đã trả"
          : "đã thanh toán";
  const remaining = fareDue > 0 ? fareDue : codGoods > 0 ? codGoods : 0;
  const remainingHint =
    fareDue <= 0 && o.onePayAwaitingTransfer && o.collectForm === "GUI_TRA"
      ? "Nhập kho gửi đã thu nghiệp vụ — đang chờ tiền về OnePay"
      : fareDue > 0 && storageUnpaid > 0 && storageUnpaid >= fareDue
        ? "Phí tồn kho giao — người nhận trả khi nhận hàng"
        : fareDue > 0
          ? "Cước vận chuyển còn lại"
          : codGoods > 0
            ? "Thu hộ COD từ người nhận"
            : "Không có khoản nào cần thu thêm";
  return {
    goodsFare,
    pickup,
    delivery,
    codFee: codGoods > 0 ? codFee : 0,
    declared,
    storage,
    returnFee,
    discount,
    codGoods,
    paid,
    fare,
    fareDue,
    shippingPaid,
    paidByLabel,
    remaining,
    remainingHint,
  };
}

export function OrderHistoryDialog({
  code,
  open,
  onOpenChange,
}: {
  code: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { session } = useAuth();
  useRbacVersion();
  const updateOrder = useStore((s) => s.updateOrder);
  const offices = useStore((s) => s.offices);
  const users = useStore((s) => s.users);
  const officeOptions = useMemo(() => allOfficeSelectOptions(offices), [offices]);
  const productPricing = useStore((s) => s.productPricing);
  const goodsKindOptions = useMemo(() => {
    const byName = new Map<string, string>();
    for (const p of productPricing) {
      const name = p.name.trim();
      if (name && !isOtherGoodsGroup(name) && !byName.has(name)) byName.set(name, p.group.trim());
    }
    const named = [...byName.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "vi"))
      .map(([name, group]) => ({ value: name, label: group ? `${name} (${group})` : name }));
    return [{ value: OTHER_GOODS, label: `${OTHER_GOODS} (nhập tên hàng)` }, ...named];
  }, [productPricing]);
  const kindOptionsFor = (kind: string) =>
    !kind.trim() || goodsKindOptions.some((x) => x.value === kind)
      ? goodsKindOptions
      : [{ value: kind, label: kind }, ...goodsKindOptions];
  const storeOrder = useStore((s) =>
    code ? s.orders.find((o) => o.code === code || o.draftCode === code) : undefined,
  );
  const [order, setOrder] = useState<OrderX | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [doorQuote, setDoorQuote] = useState<{ price: number | null; km: number | null; loading: boolean; error: string }>({
    price: null,
    km: null,
    loading: false,
    error: "",
  });
  const [payTermOpen, setPayTermOpen] = useState(false);
  const [rerouteOpen, setRerouteOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [transferQrOpen, setTransferQrOpen] = useState(false);
  const shownEvents = useMemo(
    () => events.filter((e) => isVisibleOrderEvent(e.action, e.detail)),
    [events],
  );

  /** Quyền màn vận hành (không gồm Thành công / Hoàn / Ngoại lệ — khóa thêm theo trạng thái đơn). */
  const canEditRole =
    !!session &&
    !isReadOnlyRole(session.role) &&
    (canWrite(session.role, "van-don") ||
      canWrite(session.role, "dieu-chinh") ||
      canWrite(session.role, "kiem-ke") ||
      canWrite(session.role, "cho-ban-giao") ||
      canWrite(session.role, "nhap-kho-luan-chuyen"));
  /** Xuất HĐĐT MISA: quyền ghi màn Giao thành công hoặc Quản lý hoá đơn (BE chặn cùng screen key). */
  const canIssueInvoice =
    !!session &&
    !isReadOnlyRole(session.role) &&
    (canWrite(session.role, "giao-thanh-cong") || canWrite(session.role, "quan-ly-hoa-don"));

  const reload = useCallback(
    async (orderCode: string) => {
      setLoading(true);
      try {
        if (isApiEnabled()) {
          const detail = await getOrder(orderCode);
          setOrder(detail);
          useStore.setState((st) => {
            const i = st.orders.findIndex((o) => o.code === detail.code);
            if (i < 0) return { orders: [...st.orders, detail] };
            const next = st.orders.slice();
            next[i] = {
              ...next[i],
              ...detail,
              events: detail.events?.length ? detail.events : next[i].events,
            };
            return { orders: next };
          });
          setEvents(
            [...(detail.events ?? [])].sort(
              (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
            ),
          );
        } else {
          const local = useStore
            .getState()
            .orders.find((o) => o.code === orderCode || o.draftCode === orderCode);
          setOrder(local ?? null);
          setEvents(
            [...(local?.events ?? [])].sort(
              (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
            ),
          );
        }
      } catch {
        const local = useStore
          .getState()
          .orders.find((o) => o.code === orderCode || o.draftCode === orderCode);
        setOrder(local ?? null);
        setEvents(
          [...(local?.events ?? [])].sort(
            (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
          ),
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!open || !code) {
      setOrder(null);
      setEvents([]);
      setEditing(false);
      setForm(null);
      setDoorQuote({ price: null, km: null, loading: false, error: "" });
      return;
    }
    void reload(code);
  }, [open, code, reload]);

  const o = order ?? storeOrder ?? null;
  const fareRoutes = useOrderFareRoutes(o);
  const canEditFields = canEditRole && orderStatusAllowsFieldEdit(o, session?.role);
  const editFields = orderEditableFields(canEditFields ? o : null, session?.role);
  /** AD / DH sửa VP nhận chỉ khi đơn đang nhập kho gửi. */
  const canEditToOffice =
    canEditReceiverOffice(o, session?.role) && (session?.role === "AD" || canEditRole);
  /** Đổi VP nhận (hàng chuyển tay) / hình thức thanh toán: bấm vào ô tương ứng khi đang sửa đơn. */
  const canReroute = !!o && isApiEnabled() && !canEditToOffice && canRerouteDest(o, session?.role, session?.office);
  const canPayTerm = !!o && isApiEnabled() && canChangePayTerm(o, session?.role, session?.office);
  const canEdit = canEditFields || canEditToOffice || canReroute || canPayTerm;
  const doorChanged =
    !!editing &&
    !!form &&
    !!o &&
    (form.homeDelivery !== Boolean(o.homeDelivery) || form.address.trim() !== (o.address ?? "").trim());
  /** Đổi địa chỉ/GTN, hoặc đơn GTN phí đang 0 (lỗi tạo cũ) → hỏi lại Ahamove / áp mức tối thiểu. */
  const needDoorQuote =
    !!editing &&
    !!form?.homeDelivery &&
    !!o &&
    (doorChanged || ((o.deliveryFee ?? 0) <= 0 && form.address.trim().length > 0));
  const doorFeeRules = useStore((s) => s.doorFees);
  /** Phí giao tận nơi theo bảng Phụ phí (cân × km), km lấy từ Ahamove — giống máy chủ tính khi lưu. */
  const previewDelivery = useMemo(() => {
    if (!editing || !form || !o) return null;
    if (!form.homeDelivery) return 0;
    if (doorQuote.km != null && doorQuote.km > 0) {
      const kg = sumPackageChargeKg(form.packages, o.weightKg ?? 0);
      return calcHomeDoorFees({ chargeKg: kg || 1, homeDelivery: true, deliveryKm: doorQuote.km }).deliveryFee;
    }
    const existing = o.deliveryFee ?? 0;
    if (!doorChanged && existing > 0 && !needDoorQuote) return existing;
    if (!form.address.trim()) return doorChanged ? 0 : existing;
    // Chưa ra km (hoặc đơn cũ phí 0) → tạm 50k như tạo đơn NV/khách.
    return Math.max(existing, VAGUE_DOOR_FEE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, form, o, doorChanged, needDoorQuote, doorQuote.km, doorFeeRules]);
  useEffect(() => {
    if (!editing || !form?.homeDelivery || !o || !needDoorQuote) {
      setDoorQuote({ price: null, km: null, loading: false, error: "" });
      return;
    }
    const text = form.address.trim();
    const dest = findOfficeByToken(form.toOffice || orderReceiverOffice(o), offices);
    const officeLat = dest?.latitude != null ? Number(dest.latitude) : NaN;
    const officeLng = dest?.longitude != null ? Number(dest.longitude) : NaN;
    if (!text) {
      setDoorQuote({ price: null, km: null, loading: false, error: "" });
      return;
    }
    if (!Number.isFinite(officeLat) || !Number.isFinite(officeLng)) {
      setDoorQuote({
        price: null,
        km: null,
        loading: false,
        error: "Văn phòng nhận chưa có tọa độ — không hỏi được giá Ahamove.",
      });
      return;
    }
    let cancelled = false;
    setDoorQuote({ price: null, km: null, loading: true, error: "" });
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const looksLikeLink =
            isShortGoogleMapsLink(text) || latLngFromGoogleMapsLink(text) != null || /google\.|goo\.gl|maps\.app/i.test(text);
          const pin = looksLikeLink ? await resolveGoogleMapsLink(text) : null;
          if (looksLikeLink && !pin) {
            throw new Error("Không lấy được vị trí từ link. Dán link maps.app.goo.gl hoặc link có tọa độ.");
          }
          const quote = await estimatePickupKm({
            officeLat,
            officeLng,
            officeAddress: dest?.address,
            ...(pin ? { pinLat: pin.lat, pinLng: pin.lng } : { pinAddress: text }),
            orderCode: o.code,
          });
          if (cancelled) return;
          const price = quote.totalPrice != null ? Number(quote.totalPrice) : NaN;
          const km = quote.distanceKm != null ? Number(quote.distanceKm) : null;
          if (km == null || !Number.isFinite(km) || km <= 0) {
            setDoorQuote({ price: null, km: null, loading: false, error: "Ahamove không trả khoảng cách." });
            return;
          }
          setDoorQuote({ price: Number.isFinite(price) ? price : null, km, loading: false, error: "" });
        } catch (e) {
          if (cancelled) return;
          setDoorQuote({
            price: null,
            km: null,
            loading: false,
            error: e instanceof Error ? e.message : "Không lấy được giá Ahamove.",
          });
        }
      })();
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [editing, form?.homeDelivery, form?.address, form?.toOffice, needDoorQuote, o, offices]);

  const money = useMemo(
    () => (o ? moneyOf(o, editing ? form : null, previewDelivery) : null),
    [o, editing, form, previewDelivery],
  );
  const returnMeta = useMemo(() => (o ? parseOrderNoteMeta(o.note) : null), [o]);
  const autoCalls = useLatestAutoCalls(open ? o?.code : null, o?.senderPhone, o?.receiverPhone);

  const headerMeta = o
    ? [
        o.receiverName?.trim() || null,
        receiverOfficeName(o),
        routeShortLabel(o),
        o.vehiclePlate ? `BKS: ${o.vehiclePlate}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const startEdit = () => {
    if (!o) return;
    setForm(formFromOrder(o, offices));
    setDoorQuote({ price: null, km: null, loading: false, error: "" });
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setForm(null);
    setDoorQuote({ price: null, km: null, loading: false, error: "" });
  };

  const saveEdit = async () => {
    if (!o || !form) return;
    setSaving(true);
    try {
      const fields = orderEditableFields(canEditFields ? o : null, session?.role);
      if (!canEditFields && !canEditToOffice) {
        setEditing(false);
        setForm(null);
        return;
      }
      const basePkgs = formFromOrder(o, offices).packages;
      const pkgsEdited = fields.packages && !samePackages(form.packages, basePkgs);
      const pkgsToSave = pkgsEdited ? form.packages : basePkgs;
      if (pkgsEdited) {
        const missingKind = pkgsToSave.find((p) => !p.kind.trim());
        if (missingKind) {
          toast.error(`Kiện ${missingKind.seq}: chọn loại hàng`);
          return;
        }
        const missingName = pkgsToSave.find((p) => isOtherGoodsGroup(p.kind) && !p.goodsName.trim());
        if (missingName) {
          toast.error(`Kiện ${missingName.seq}: nhập tên hàng`);
          return;
        }
      }
      const goodsFare = pkgsToSave.reduce((s, p) => s + (Number(p.fare) || 0), 0);
      const pickup = fields.homePickup && !form.homePickup ? 0 : (o.pickupFee ?? 0);
      const delivery = previewDelivery != null ? previewDelivery : (o.deliveryFee ?? 0);
      const canEditPkgValue = isPendingHandover(o);
      const declared =
        pkgsEdited && canEditPkgValue && form.declaredValueDirty
          ? calcDeclaredValueFee(pkgsToSave.reduce((s, p) => s + (Number(p.value) || 0), 0))
          : (o.declaredFee ?? 0);
      const discount = o.discountAmount ?? 0;
      const storage = o.storageFee ?? 0;
      const returnFee = o.returnFee ?? 0;
      const codAmount = fields.cod
        ? Math.max(0, Math.round(Number(form.codAmount) || 0))
        : Math.max(0, Math.round(Number(o.codAmount) || 0));
      const codFee = fields.cod
        ? codAmount > 0
          ? Math.max(0, Math.round(Number(form.codFee) || 0))
          : 0
        : Math.max(0, Math.round(Number(o.codFee) || 0));
      const totalFare = goodsFare + pickup + delivery + codFee + declared + storage + returnFee - discount;
      const totalWeight = pkgsEdited
        ? pkgsToSave.reduce((s, p) => s + (Number(p.weightKg) || 0), 0)
        : (o.weightKg ?? 0);
      const quantity = Math.max(1, pkgsToSave.length);
      const prevMeta = parseOrderNoteMeta(o.note);
      const noteBody = fields.note ? form.note.trim() || prevMeta.body : prevMeta.body;
      const returnName = fields.returnContact
        ? toUpperName(form.returnName)
        : prevMeta.returnName;
      const returnPhone = fields.returnContact ? form.returnPhone.trim() : prevMeta.returnPhone;
      const returnAddress = fields.returnContact
        ? form.returnAddress.trim()
        : prevMeta.returnAddress;
      let note = o.note;
      if (pkgsEdited || fields.note || fields.returnContact) {
        note = buildOrderNote({
          ...prevMeta,
          goodsKinds: pkgsEdited ? pkgsToSave.map((p) => p.kind) : prevMeta.goodsKinds,
          goodsName: pkgsEdited ? "" : prevMeta.goodsName,
          goodsNames: pkgsEdited ? pkgsToSave.map((p) => p.goodsName) : prevMeta.goodsNames,
          warehouseInSeqs: pkgsEdited
            ? pkgsToSave.flatMap((p, i) => (p.inboundStatus === "IN" ? [i + 1] : []))
            : prevMeta.warehouseInSeqs,
          packageFares: pkgsEdited
            ? pkgsToSave.map((p) => Math.round(Number(p.fare) || 0))
            : prevMeta.packageFares,
          packageItemQtys: pkgsEdited
            ? pkgsToSave.map((p) => Math.max(1, Math.round(Number(p.itemQty) || 1)))
            : prevMeta.packageItemQtys,
          packageWeightsKg: pkgsEdited
            ? pkgsToSave.map((p) => Math.max(0, Number(p.weightKg) || 0))
            : prevMeta.packageWeightsKg,
          packageDims: pkgsEdited ? pkgsToSave.map((p) => p.dims) : prevMeta.packageDims,
          // Không còn nhập ghi chú kiện trên UI — giữ tag cũ nếu có.
          packageNotes: prevMeta.packageNotes,
          packageValues:
            pkgsEdited && canEditPkgValue && form.declaredValueDirty
              ? pkgsToSave.map((p) => Math.max(0, Math.round(Number(p.value) || 0)))
              : prevMeta.packageValues,
          returnName,
          returnPhone,
          returnAddress,
          body: noteBody,
        });
      }
      const senderName = fields.sender ? toUpperName(form.senderName) : o.senderName;
      const receiverName = fields.receiver ? toUpperName(form.receiverName) : o.receiverName;
      const senderPhone = fields.sender ? form.senderPhone.trim() : o.senderPhone;
      const receiverPhone = fields.receiver ? form.receiverPhone.trim() : o.receiverPhone;

      const patch: Partial<OrderX> = {};
      if (pkgsEdited || fields.note || fields.returnContact) {
        patch.note = note;
      }
      if (pkgsEdited) {
        patch.weightKg = totalWeight;
        patch.quantity = quantity;
        patch.fare = totalFare;
        patch.goodsFare = goodsFare;
        if (canEditPkgValue && form.declaredValueDirty) {
          patch.declaredFee = declared;
        }
      } else if (
        fields.cod ||
        doorChanged ||
        (form.homeDelivery && Math.round(delivery) !== Math.round(Number(o.deliveryFee) || 0))
      ) {
        const baseGoods = o.goodsFare ?? Math.max(0, (o.fare ?? 0) - (o.pickupFee ?? 0) - (o.deliveryFee ?? 0) - (o.codFee ?? 0) - (o.declaredFee ?? 0) - (o.storageFee ?? 0) - (o.returnFee ?? 0) + (o.discountAmount ?? 0));
        const nextFare = baseGoods + pickup + delivery + codFee + declared + storage + returnFee - discount;
        patch.fare = nextFare;
        patch.deliveryFee = delivery;
      }
      if (fields.cod) {
        patch.codAmount = codAmount;
        patch.codFee = codFee;
        if (o.collectForm === "COD" && codAmount <= 0) patch.collectForm = "GUI_TRA";
      }
      if (fields.sender) {
        patch.senderName = senderName || undefined;
        patch.senderPhone = senderPhone;
      }
      if (fields.receiver) {
        patch.receiverName = receiverName;
        patch.receiverPhone = receiverPhone;
      }
      if (fields.senderAddress) {
        patch.pickupAddress = form.pickupAddress.trim() || undefined;
      }
      if (fields.receiverAddress) {
        patch.address = form.address.trim() || undefined;
      }
      if (fields.homePickup && form.homePickup !== Boolean(o.homePickup)) {
        patch.homePickup = form.homePickup;
      }
      if (fields.homeDelivery && form.homeDelivery !== Boolean(o.homeDelivery)) {
        patch.homeDelivery = form.homeDelivery;
      }

      if (canEditToOffice && form.toOffice.trim()) {
        const { resolveOfficeCodeStrict } = await import("@/lib/api/sync");
        const toCode = resolveOfficeCodeStrict(form.toOffice) ?? form.toOffice.trim();
        if (!toCode) {
          toast.error("Không xác định được VP nhận. Chọn lại trong danh sách.");
          return;
        }
        // VP nhận luôn ghi toOffice + finalToOffice; VP trung chuyển do máy chủ tự tính lại.
        patch.toOffice = toCode;
        patch.finalToOffice = toCode;
      }

      const saved = await updateOrder(o.code, patch, {
        eventAction: "ORDER_EDIT",
        eventDetail: "Sửa trong popup thông tin đơn",
      });
      if (!saved) {
        await reload(o.code);
        return;
      }

      setOrder({
        ...o,
        ...patch,
        updatedAt: new Date().toISOString(),
      });
      setEditing(false);
      setForm(null);
      toast.success(`Đã cập nhật đơn ${o.code}`);
      await reload(o.code);
    } finally {
      setSaving(false);
    }
  };

  const pkgs = editing && form ? form.packages : o ? formFromOrder(o, offices).packages : [];
  /** Trạng thái quét nhập kho giao chỉ có nghĩa khi đơn đang dỡ xuống VP nhận. */
  const showPkgInbound =
    o?.status === "AT_DEST" ||
    (o?.status === "IN_TRANSIT" && pkgs.some((p) => p.inboundStatus === "IN"));

  const setPkgList = (fn: (list: EditPkg[]) => EditPkg[]) =>
    setForm((prev) =>
      prev ? { ...prev, packages: fn(prev.packages).map((p, i) => ({ ...p, seq: i + 1 })) } : prev,
    );
  const addPkg = () =>
    setPkgList((list) => [
      ...list,
      {
        seq: list.length + 1,
        kind: "",
        goodsName: "",
        itemQty: 1,
        weightKg: 0,
        dims: null,
        fare: 0,
        value: 0,
        note: "",
        inboundStatus: "MISSING",
      },
    ]);
  const duplicatePkg = (seq: number) =>
    setPkgList((list) => {
      const i = list.findIndex((p) => p.seq === seq);
      if (i < 0) return list;
      return [...list.slice(0, i + 1), { ...list[i], inboundStatus: "MISSING" }, ...list.slice(i + 1)];
    });
  const removePkg = (seq: number) =>
    setPkgList((list) => (list.length <= 1 ? list : list.filter((p) => p.seq !== seq)));

  const canEditPkgValue = !!o && isPendingHandover(o);

  const patchPkg = (seq: number, patch: Partial<EditPkg>) => {
    setForm((prev) => {
      if (!prev) return prev;
      const valueTouched = patch.value !== undefined;
      return {
        ...prev,
        declaredValueDirty: prev.declaredValueDirty || valueTouched,
        packages: prev.packages.map((p) => {
          if (p.seq !== seq) return p;
          const next = { ...p, ...patch };
          if (
            patch.weightKg !== undefined ||
            patch.kind !== undefined ||
            patch.itemQty !== undefined ||
            patch.goodsName !== undefined ||
            patch.dims !== undefined
          ) {
            next.fare = computePackageFare({
              routes: fareRoutes,
              kind: next.kind,
              goodsName: next.goodsName,
              itemQty: next.itemQty,
              weightKg: next.weightKg,
              dims: next.dims,
            });
          }
          return next;
        }),
      };
    });
  };

  return (
    <>
    <M3Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setEditing(false);
          setForm(null);
        }
        onOpenChange(v);
      }}
      variant="order-sheet"
      alignTop
    >
          <div className="dlg-head" style={{ flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px", minWidth: 0 }}>
              <M3SheetTitle
                id="od-title"
                className="page-title num"
                style={{ fontSize: 24, lineHeight: "32px", margin: 0 }}
              >
                {code || "—"}
              </M3SheetTitle>
              {o && !editing ? <OrderStatusBadge status={o.status} issue={o.issue} order={o} /> : null}
              {headerMeta ? <span className="lab muted num">{headerMeta}</span> : null}
              <DialogDescription className="sr-only">
                Thông tin đơn hàng, thanh toán và lịch sử tác động
              </DialogDescription>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginLeft: "auto" }}>
              {!editing && o ? (
                <>
                  {canEdit ? (
                    <button type="button" className="btn tonal" onClick={startEdit}>
                      <span className="ms" aria-hidden="true">
                        edit
                      </span>
                      Sửa đơn
                    </button>
                  ) : null}
                  <button type="button" className="btn" onClick={() => setPrintOpen(true)}>
                    <span className="ms" aria-hidden="true">
                      print
                    </span>
                    In đơn
                  </button>
                  {canEditRole && canStaffSenderTransferQr(o) ? (
                    <button
                      type="button"
                      className="btn tonal"
                      onClick={() => setTransferQrOpen(true)}
                      title="Tạo QR chuyển khoản OnePay"
                    >
                      QR CK
                    </button>
                  ) : null}
                  {o.transferPaidAt ? <TransferPaidBadge order={o} /> : null}
                </>
              ) : null}
              <M3SheetClose />
            </div>
          </div>

        {loading && !o ? (
          <div className="bg-white px-6 py-16 text-center text-sm text-muted-foreground">
            Đang tải thông tin đơn…
          </div>
        ) : !o || !money ? (
          <div className="bg-white px-6 py-16 text-center text-sm text-muted-foreground">
            Không tìm thấy đơn hàng
          </div>
        ) : (
          <div className="order-layout">
            {/* LEFT */}
            <div className="stack" style={{ minWidth: 0 }}>
              <div className="party-grid">
                <section className="order-box stack">
                  <SecTitle icon="person">Người gửi</SecTitle>
                  <FieldShell label="Tuyến">
                    <ViewValue value={routeShortLabel(o)} />
                    {o.hubOffice ? <TransitTag hubOffice={o.hubOffice} className="mt-1" /> : null}
                  </FieldShell>
                  <FieldShell label="BKS xe">
                    <ViewValue value={o.vehiclePlate || "—"} />
                  </FieldShell>
                  <FieldShell label="SĐT người gửi">
                    {editing && form && editFields.sender ? (
                      <PhoneInput
                        className="h-10"
                        value={form.senderPhone}
                        onChange={(v) => setForm({ ...form, senderPhone: v })}
                      />
                    ) : (
                      <ViewValue value={o.senderPhone} />
                    )}
                  </FieldShell>
                  <FieldShell label="Tên người gửi">
                    {editing && form && editFields.sender ? (
                      <NameInput
                        className="h-10"
                        value={form.senderName}
                        onChange={(v) => setForm({ ...form, senderName: v })}
                      />
                    ) : (
                      <ViewValue value={o.senderName ?? ""} />
                    )}
                  </FieldShell>
                  <FieldShell label="VP gửi">
                    <ViewValue value={officeName(o.fromOffice)} />
                  </FieldShell>
                  {(editing && editFields.senderAddress) || o.pickupAddress ? (
                    <FieldShell label="Địa chỉ lấy hàng">
                      {editing && form && editFields.senderAddress ? (
                        <Input
                          className="h-10"
                          value={form.pickupAddress}
                          onChange={(e) => setForm({ ...form, pickupAddress: e.target.value })}
                        />
                      ) : (
                        <ViewValue value={o.pickupAddress ?? ""} />
                      )}
                    </FieldShell>
                  ) : null}
                  {editing && form && editFields.homePickup ? (
                    <label
                      className="lab"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        minHeight: 40,
                        cursor: "pointer",
                      }}
                    >
                      <span className="ms" aria-hidden="true">
                        location_on
                      </span>
                      Lấy tận nơi
                      <Switch
                        checked={form.homePickup}
                        onCheckedChange={(v) => setForm({ ...form, homePickup: v })}
                      />
                    </label>
                  ) : o.homePickup ? (
                    <div className="view-val" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span className="ms" aria-hidden="true">
                        location_on
                      </span>
                      Lấy tận nơi
                      {money.pickup > 0 ? ` · ${formatVND(money.pickup)}` : ""}
                    </div>
                  ) : null}
                  <AutoCallMini call={autoCalls.sender} />
                </section>

                <section className="order-box stack">
                  <SecTitle icon="person_pin_circle">Người nhận</SecTitle>
                  <FieldShell label="SĐT người nhận">
                    {editing && form && editFields.receiver ? (
                      <PhoneInput
                        className="h-10"
                        value={form.receiverPhone}
                        onChange={(v) => setForm({ ...form, receiverPhone: v })}
                      />
                    ) : (
                      <ViewValue value={o.receiverPhone} />
                    )}
                  </FieldShell>
                  <FieldShell label="Tên người nhận">
                    {editing && form && editFields.receiver ? (
                      <NameInput
                        className="h-10"
                        value={form.receiverName}
                        onChange={(v) => setForm({ ...form, receiverName: v })}
                      />
                    ) : (
                      <ViewValue value={o.receiverName} />
                    )}
                  </FieldShell>
                  <FieldShell label="VP nhận">
                    {editing && form && canEditToOffice ? (
                      <SearchableSelect
                        value={form.toOffice}
                        onValueChange={(v) => setForm({ ...form, toOffice: v })}
                        className="h-10"
                        placeholder="Chọn VP nhận"
                        options={officeOptions}
                      />
                    ) : editing && canReroute ? (
                      <EditPickButton onClick={() => setRerouteOpen(true)} title="Bấm để đổi VP nhận">
                        {receiverOfficeName(o) || "—"}
                      </EditPickButton>
                    ) : (
                      <ViewValue value={receiverOfficeName(o)} />
                    )}
                    <ChangeDestOfficeDialog
                      order={o}
                      open={rerouteOpen}
                      onOpenChange={setRerouteOpen}
                      onChanged={() => void reload(o.code)}
                    />
                  </FieldShell>
                  {(editing && editFields.receiverAddress) || o.address ? (
                    <FieldShell label="Địa chỉ giao hàng">
                      {editing && form && editFields.receiverAddress ? (
                        <Input
                          className="h-10"
                          value={form.address}
                          placeholder="Địa chỉ hoặc link Google Maps"
                          onChange={(e) => setForm({ ...form, address: e.target.value })}
                        />
                      ) : (
                        <ViewValue value={o.address ?? ""} />
                      )}
                    </FieldShell>
                  ) : null}
                  {editing && form && editFields.homeDelivery ? (
                    <label
                      className="lab"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        minHeight: 40,
                        cursor: "pointer",
                      }}
                    >
                      <span className="ms" aria-hidden="true">
                        location_on
                      </span>
                      Giao tận nơi
                      <Switch
                        checked={form.homeDelivery}
                        onCheckedChange={(v) => setForm({ ...form, homeDelivery: v })}
                      />
                    </label>
                  ) : o.homeDelivery ? (
                    <div className="view-val" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span className="ms" aria-hidden="true">
                        location_on
                      </span>
                      Giao tận nơi
                      {money.delivery > 0 ? ` · ${formatVND(money.delivery)}` : ""}
                    </div>
                  ) : null}
                  <AutoCallMini call={autoCalls.receiver} />
                </section>
              </div>

              {(editing && editFields.returnContact) ||
              returnMeta?.returnName ||
              returnMeta?.returnPhone ||
              returnMeta?.returnAddress ? (
                <section className="order-box stack">
                  <SecTitle icon="undo">Người nhận hàng hoàn</SecTitle>
                  <FieldShell label="SĐT nhận hoàn">
                    {editing && form && editFields.returnContact ? (
                      <PhoneInput
                        className="h-10"
                        value={form.returnPhone}
                        onChange={(v) => setForm({ ...form, returnPhone: v })}
                      />
                    ) : (
                      <ViewValue value={returnMeta?.returnPhone ?? ""} />
                    )}
                  </FieldShell>
                  <FieldShell label="Tên nhận hoàn">
                    {editing && form && editFields.returnContact ? (
                      <NameInput
                        className="h-10"
                        value={form.returnName}
                        onChange={(v) => setForm({ ...form, returnName: v })}
                      />
                    ) : (
                      <ViewValue value={returnMeta?.returnName ?? ""} />
                    )}
                  </FieldShell>
                  <FieldShell label="Địa chỉ trả hàng">
                    {editing && form && editFields.returnContact ? (
                      <Input
                        className="h-10"
                        value={form.returnAddress}
                        onChange={(e) => setForm({ ...form, returnAddress: e.target.value })}
                      />
                    ) : (
                      <ViewValue value={returnMeta?.returnAddress ?? ""} />
                    )}
                  </FieldShell>
                </section>
              ) : null}

              <section className="order-box stack">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <SecTitle icon="inventory_2">
                    <span>Danh sách hàng hoá ({pkgs.length} kiện)</span>
                  </SecTitle>
                  {editing && editFields.packages ? (
                    <button type="button" className="btn tonal" style={{ height: 36 }} onClick={addPkg}>
                      <span className="ms" aria-hidden="true">
                        add
                      </span>
                      Thêm kiện
                    </button>
                  ) : null}
                </div>
                {pkgs.map((p) => (
                  <div key={p.seq} className="pack">
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div className="title-small" style={{ fontWeight: 600 }}>
                        Kiện {p.seq}
                        <span className="lab muted num" style={{ marginLeft: 8, fontWeight: 400 }}>
                          {packageCode(o.code, p.seq)}
                        </span>
                      </div>
                      <div className="act">
                        {!showPkgInbound ? null : p.inboundStatus === "IN" ? (
                          <span className="tag ok">Đã nhập kho giao</span>
                        ) : o.status === "IN_TRANSIT" ? (
                          <span className="tag info">Còn trên xe</span>
                        ) : (
                          <span className="tag warn">Chưa quét nhập kho giao</span>
                        )}
                        {editing && editFields.packages ? (
                          <>
                            <button type="button" className="text-act" onClick={() => duplicatePkg(p.seq)}>
                              Nhân bản
                            </button>
                            <button
                              type="button"
                              className="no"
                              aria-label={`Xoá kiện ${p.seq}`}
                              title={pkgs.length <= 1 ? "Đơn phải còn ít nhất 1 kiện" : "Xóa kiện"}
                              disabled={pkgs.length <= 1}
                              onClick={() => removePkg(p.seq)}
                            >
                              <span className="ms" aria-hidden="true">
                                delete
                              </span>
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="pack-grid">
                      <FieldShell label="Loại hàng">
                        {editing && editFields.packages ? (
                          <SearchableSelect
                            value={p.kind}
                            onValueChange={(v) =>
                              patchPkg(p.seq, { kind: v, goodsName: isOtherGoodsGroup(v) ? p.goodsName : "" })
                            }
                            options={kindOptionsFor(p.kind)}
                            placeholder="Chọn loại hàng"
                          />
                        ) : (
                          <ViewValue value={goodsLabelOf(p.kind, p.goodsName)} />
                        )}
                      </FieldShell>
                      <FieldShell label="Số lượng">
                        {editing && editFields.packages ? (
                          <Input
                            className="h-10"
                            inputMode="numeric"
                            value={String(p.itemQty)}
                            onChange={(e) =>
                              patchPkg(p.seq, {
                                itemQty: Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1),
                              })
                            }
                          />
                        ) : (
                          <ViewValue value={String(p.itemQty)} />
                        )}
                      </FieldShell>
                      {editing && editFields.packages && isOtherGoodsGroup(p.kind) ? (
                        <FieldShell label="Tên hàng" className="pack-wide">
                          <Input
                            className="h-10"
                            value={p.goodsName}
                            onChange={(e) => patchPkg(p.seq, { goodsName: e.target.value })}
                          />
                        </FieldShell>
                      ) : null}
                      <FieldShell label="Cân nặng (kg)">
                        {editing && editFields.packages ? (
                          <Input
                            className="h-10"
                            inputMode="decimal"
                            value={String(p.weightKg)}
                            onChange={(e) => {
                              const raw = e.target.value.replace(",", ".");
                              const n = Number(raw);
                              patchPkg(p.seq, {
                                weightKg: Number.isFinite(n) ? n : 0,
                              });
                            }}
                          />
                        ) : (
                          <ViewValue value={p.weightKg != null ? Number(p.weightKg).toFixed(1) : "—"} />
                        )}
                      </FieldShell>
                      <FieldShell label="Kích thước D×R×C (cm)">
                        {editing && editFields.packages ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            {(["d", "r", "c"] as const).map((k) => (
                              <Input
                                key={k}
                                className="h-10 px-2"
                                inputMode="decimal"
                                placeholder={k === "d" ? "D" : k === "r" ? "R" : "C"}
                                value={p.dims?.[k] ? String(p.dims[k]) : ""}
                                onChange={(e) => {
                                  const n = Number(e.target.value.replace(",", "."));
                                  const base = p.dims ?? { d: 0, r: 0, c: 0 };
                                  patchPkg(p.seq, {
                                    dims: { ...base, [k]: Number.isFinite(n) && n > 0 ? n : 0 },
                                  });
                                }}
                              />
                            ))}
                          </div>
                        ) : (
                          <ViewValue value={dimsLabel(p.dims) || "—"} />
                        )}
                      </FieldShell>
                      <FieldShell label="Cước hàng">
                        <ViewValue value={formatVND(p.fare)} />
                      </FieldShell>
                      {editing && editFields.packages && canEditPkgValue ? (
                        <FieldShell label="Giá trị hàng">
                          <MoneyInput
                            value={Number(p.value) || 0}
                            onChange={(value) => patchPkg(p.seq, { value: Math.max(0, Math.round(value) || 0) })}
                          />
                        </FieldShell>
                      ) : (Number(p.value) || 0) > 0 ? (
                        <FieldShell label="Giá trị hàng">
                          <ViewValue value={formatVND(p.value)} />
                        </FieldShell>
                      ) : null}
                    </div>
                  </div>
                ))}
              </section>

              <section className="order-box stack">
                <SecTitle icon="history">Lịch sử tác động</SecTitle>
                {shownEvents.length === 0 ? (
                  <p className="py-3 text-center text-sm text-muted-foreground">
                    Chưa có lịch sử tác động
                  </p>
                ) : (
                  <ol className="relative ml-1.5 space-y-0 border-l border-[#D8DEE8] pl-5">
                    {(() => {
                      const visible = shownEvents;
                      const signs = driverSignsForEvents(order, visible);
                      return visible.map((e, i, list) => {
                      const last = i === list.length - 1;
                      return (
                        <li key={`${e.at}-${e.action}-${i}`} className="relative pb-3.5 last:pb-0">
                          <span
                            className={cn(
                              "absolute -left-[1.35rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 bg-white",
                              last ? "border-primary bg-primary" : "border-[#B8C2D1]",
                            )}
                          />
                          <div className="text-sm font-medium text-foreground">
                            {e.action === "RECEIPT_CREATE" && e.detail ? (
                              <ReceiptEventContent
                                detail={e.detail}
                                onOpen={() => onOpenChange(false)}
                              />
                            ) : e.action === "RECEIPT_CONFIRM" && e.detail ? (
                              <ReceiptEventContent
                                detail={e.detail}
                                onOpen={() => onOpenChange(false)}
                                label="Xác nhận đã thu"
                              />
                            ) : (
                              orderEventContent(e.action, e.detail)
                            )}
                          </div>
                          {e.action === "GOODS_PHOTO" && order ? (
                            <GoodsPhotoButton orderCode={order.code} className="mt-1.5" />
                          ) : null}
                          {(() => {
                            const sign = signs[i];
                            if (!sign) return null;
                            return (
                              <div className="mt-2 overflow-hidden rounded-md border border-[#E5EAF2] bg-[#FAFBFD] p-2">
                                <img
                                  src={sign}
                                  alt="Chữ ký tài xế"
                                  className="mx-auto h-16 w-auto max-w-full object-contain"
                                />
                              </div>
                            );
                          })()}
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {formatDateTime(e.at)}
                            {(() => {
                              const who = actorLabel(e, users);
                              return who ? (
                                <>
                                  {" · "}
                                  <StaffInfoPopover staffKey={e.by}>{who}</StaffInfoPopover>
                                </>
                              ) : null;
                            })()}
                          </div>
                        </li>
                      );
                    });
                    })()}
                  </ol>
                )}
              </section>
            </div>

            {/* RIGHT */}
            <aside className="order-box stack order-side">
              <SecTitle icon="payments">Thanh toán và ghi chú</SecTitle>

              <FieldShell label="Hình thức thanh toán">
                {editing && canPayTerm ? (
                  <EditPickButton onClick={() => setPayTermOpen(true)} title="Bấm để đổi hình thức thanh toán">
                    {payMethodLabel(o)}
                  </EditPickButton>
                ) : (
                  <ViewValue value={payMethodLabel(o)} />
                )}
              </FieldShell>
              <ChangePaymentTermDialog
                order={o}
                role={session?.role}
                open={payTermOpen}
                onOpenChange={setPayTermOpen}
                onChanged={() => void reload(o.code)}
              />
              <PrintLabelDialog code={o.code} batchPackages open={printOpen} onOpenChange={setPrintOpen} />
              <OrderTransferQrDialog
                open={transferQrOpen}
                orderCode={o.code}
                onOpenChange={setTransferQrOpen}
                onPaid={() => {
                  void getOrder(o.code).then((fresh) => {
                    setOrder(fresh);
                    useStore.setState((st) => ({
                      orders: [fresh, ...st.orders.filter((x) => x.code !== fresh.code)],
                    }));
                  });
                }}
              />

              {(editing ? (form?.codAmount ?? 0) > 0 || editFields.cod : money.codGoods > 0) ||
              (editing && editFields.cod) ? (
                <div className="view-opt">
                  <div className="field view-field only-label">
                    <span className="l l-ic">
                      <span className="ms" aria-hidden="true">
                        account_balance
                      </span>
                      Nhận tiền COD qua tài khoản
                    </span>
                  </div>
                  <FieldShell label="Tiền hàng thu hộ">
                    {editing && form && editFields.cod ? (
                      <Input
                        className="h-10 text-right"
                        inputMode="numeric"
                        value={String(form.codAmount)}
                        onChange={(e) => {
                          const codAmount = Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0);
                          const cfg = useStore.getState().surcharges?.cod;
                          setForm({
                            ...form,
                            codAmount,
                            codFee: codAmount > 0 ? calcCodFee(codAmount, cfg) : 0,
                          });
                        }}
                      />
                    ) : (
                      <ViewValue value={formatVND(money.codGoods)} />
                    )}
                  </FieldShell>
                  <FieldShell label="Phí thu hộ">
                    <ViewValue
                      value={formatVND(editing && form && editFields.cod ? form.codFee : money.codFee)}
                    />
                  </FieldShell>
                  {o.bankName || o.bankAccountNo || o.bankAccountName ? (
                    <>
                      <FieldShell label="Ngân hàng">
                        <ViewValue value={o.bankName || "—"} />
                      </FieldShell>
                      <FieldShell label="Số tài khoản">
                        <ViewValue value={o.bankAccountNo || "—"} />
                      </FieldShell>
                      <FieldShell label="Chủ tài khoản">
                        <ViewValue value={o.bankAccountName || "—"} />
                      </FieldShell>
                    </>
                  ) : (
                    <div className="lab muted">
                      Chưa nhập — người gửi nhận tiền mặt hoặc chưa cung cấp tài khoản.
                    </div>
                  )}
                </div>
              ) : (
                <div className="view-opt">
                  <div className="field view-field only-label">
                    <span className="l l-ic">
                      <span className="ms" aria-hidden="true">
                        account_balance
                      </span>
                      Nhận tiền COD qua tài khoản
                    </span>
                    <div className="view-val">Không</div>
                  </div>
                </div>
              )}

              <FieldShell label="Ghi chú đơn hàng">
                {editing && form && editFields.note ? (
                  <Textarea
                    className="area"
                    style={{ minHeight: 80 }}
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                  />
                ) : (
                  <ViewValue value={displayOrderNote(o.note) || "—"} />
                )}
              </FieldShell>

              {editing && form?.homeDelivery && needDoorQuote ? (
                <p className={`lab ${doorQuote.error ? "err-sum" : "muted"}`}>
                  {!form.address.trim()
                    ? "Nhập địa chỉ hoặc dán link Google Maps để hỏi giá Ahamove."
                    : doorQuote.loading
                      ? "Đang hỏi giá Ahamove…"
                      : doorQuote.km != null
                        ? `Theo bảng phí tận nơi · ${doorQuote.km.toFixed(2)} km (khoảng cách Ahamove)`
                        : doorQuote.error
                          ? `${doorQuote.error} — tạm ${VAGUE_DOOR_FEE.toLocaleString("vi-VN")}đ`
                          : `Chưa ra km — tạm ${VAGUE_DOOR_FEE.toLocaleString("vi-VN")}đ`}
                </p>
              ) : null}

              {isApiEnabled() ? (
                <OrderInvoicePanel
                  order={o}
                  canIssue={canIssueInvoice}
                  canEditInfo={canEditRole || canIssueInvoice}
                  onChanged={() => void reload(o.code)}
                />
              ) : o.invoiceRequested ? (
                <div className="view-opt">
                  <div className="field view-field only-label">
                    <span className="l l-ic">
                      <span className="ms" aria-hidden="true">
                        receipt_long
                      </span>
                      Xuất hoá đơn
                    </span>
                  </div>
                  <FieldShell label="Người">
                    <ViewValue value={o.invoiceBuyerName || "—"} />
                  </FieldShell>
                  {o.invoiceBuyerIdNumber ? (
                    <FieldShell label="CCCD">
                      <ViewValue value={o.invoiceBuyerIdNumber} />
                    </FieldShell>
                  ) : null}
                  {o.invoiceBuyerPhone ? (
                    <FieldShell label="SĐT HĐ">
                      <ViewValue value={o.invoiceBuyerPhone} />
                    </FieldShell>
                  ) : null}
                  <FieldShell label="MST">
                    <ViewValue value={o.invoiceTaxCode || "—"} />
                  </FieldShell>
                  <FieldShell label="Công ty">
                    <ViewValue value={o.invoiceCompanyName || "—"} />
                  </FieldShell>
                  <FieldShell label="Email">
                    <ViewValue value={o.invoiceEmail || "—"} />
                  </FieldShell>
                  <FieldShell label="Địa chỉ">
                    <ViewValue value={o.invoiceCompanyAddress || "—"} />
                  </FieldShell>
                </div>
              ) : (
                <div className="view-opt">
                  <div className="field view-field only-label">
                    <span className="l l-ic">
                      <span className="ms" aria-hidden="true">
                        receipt_long
                      </span>
                      Xuất hoá đơn
                    </span>
                    <div className="view-val">Không</div>
                  </div>
                </div>
              )}

              <div className="side-foot stack">
                <div className="total-box num">
                  <div className="fee-lines lab" style={{ marginBottom: 8 }}>
                    <FeeRow label="Cước hàng" amount={money.goodsFare} />
                    <FeeRow label="Cước lấy tận nơi" amount={money.pickup} hideZero />
                    <FeeRow
                      label="Cước giao tận nơi"
                      amount={money.delivery}
                      hideZero={!(editing && form?.homeDelivery)}
                    />
                    {(o.codFeeRefund ?? 0) > 0 ? (
                      <FeeRow label="Tiền hoàn phí COD" amount={o.codFeeRefund || money.codFee} />
                    ) : (
                      <FeeRow label="Phí thu hộ COD" amount={money.codFee} hideZero />
                    )}
                    {(o.codFeeRefund ?? 0) > 0 && money.codFee > 0 ? (
                      <FeeRow label="Phí thu hộ (cần hoàn)" amount={money.codFee} />
                    ) : null}
                    <FeeRow label="Phí khai giá" amount={money.declared} hideZero />
                    <FeeRow label="Phí tồn kho giao" amount={money.storage} hideZero />
                    <FeeRow label="Phí hoàn đơn" amount={money.returnFee} hideZero />
                    {money.discount > 0 ? <FeeRow label="Giảm giá" amount={-money.discount} /> : null}
                    {money.paid > 0 ? (
                      <FeeRow
                        label={money.shippingPaid ? `Tổng đã thu (${money.paidByLabel})` : "Đã thu"}
                        amount={money.paid}
                      />
                    ) : null}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span className="lab">Tổng phải thu</span>
                    <span className="kpi-val" style={{ fontSize: 24 }}>
                      {formatVND(money.remaining)}{" "}
                      <span style={{ fontSize: 12, fontWeight: 400 }}>VNĐ</span>
                    </span>
                  </div>
                  {money.remainingHint ? (
                    <div className="lab" style={{ marginTop: 4, opacity: 0.9 }}>
                      {money.remainingHint}
                    </div>
                  ) : null}
                </div>
                {editing ? (
                  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
                    <button type="button" className="btn ghost" disabled={saving} onClick={cancelEdit}>
                      Huỷ sửa
                    </button>
                    <button type="button" className="btn" disabled={saving} onClick={saveEdit}>
                      {saving ? "Đang lưu…" : "Lưu thay đổi"}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button type="button" className="btn ghost" onClick={() => onOpenChange(false)}>
                      Đóng
                    </button>
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
    </M3Sheet>
    </>
  );
}
