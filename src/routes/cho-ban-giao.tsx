import { createFileRoute } from "@tanstack/react-router";
import { askConfirm } from "@/components/m3/askConfirm";
import { Fragment, useMemo, useState } from "react";
import { usePagedRows } from "@/lib/use-paged-rows";
import { TablePagination } from "@/components/TablePagination";
import { ProtectedPage } from "@/components/AppShell";
import { M3PageHeader } from "@/components/M3Page";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { OfficeRouteCell } from "@/components/OfficeRouteCell";
import { OrderPackageListRow } from "@/components/OrderPackageListRow";
import { GoodsPhotoButton } from "@/components/GoodsPhotoButton";
import { PrintLabelDialog } from "@/components/PrintLabelDialog";
import { CancelOrderDialog, CANCEL_REASON_MIN_TRANSFER } from "@/components/CancelOrderDialog";
import { TransferPaidBadge, transferPaidNotice } from "@/components/TransferPaidBadge";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { StaffSenderTransferQrAction } from "@/components/StaffSenderTransferQrAction";
import { StageTabButton, StageTabRow, useJumpToMatchingTab } from "@/components/StageTabs";
import { useActivityFilters } from "@/lib/activity-filters";
import { formatDateTime, officeName } from "@/lib/mock-data";
import {
  FEE_COL_COUNT,
  OrderFeeCell,
  OrderCargoCell,
  OrderCargoHeader,
  OrderFeeHeader,
} from "@/components/OrderFeeCells";
import { useStore, type OrderX } from "@/lib/store";
import {
  AssignShipperDialog,
  type ExternalAssign,
  type InternalAssign,
} from "@/components/AssignShipperDialog";
import { AhamoveInfo } from "@/components/AhamoveInfo";
import { useAuth } from "@/lib/auth";
import { hasAllOfficeScope } from "@/lib/office-scope";
import { customerNotWarehouseReceived, pendingHandoverOrders } from "@/lib/pending-handover";
import { canWrite } from "@/lib/rbac";
import { orderEditableFields } from "@/lib/order-edit-policy";
import { usePackageActions } from "@/components/PackageActions";
import { useRefreshOrdersOnMount, refreshOrdersNow } from "@/lib/use-orders-poll";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
export const Route = createFileRoute("/cho-ban-giao")({
  head: () => ({
    meta: [
      { title: "Chờ bàn giao — X.E" },
      {
        name: "description",
        content:
          "Danh sách đơn khách chọn lấy tận nơi, nhân viên đang đến lấy hàng và chờ nhập kho.",
      },
      { property: "og:title", content: "Chờ bàn giao — X.E" },
      {
        property: "og:description",
        content: "Theo dõi đơn lấy tận nơi và nhập kho để chuyển sang Đơn chờ gán xe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Chờ bàn giao" screen="cho-ban-giao" hidePageTitle>
      <Page />
    </ProtectedPage>
  ),
});

type TabKey = "cho-lay" | "cho-nhan" | "dang-lay";

const TABS: { key: TabKey; label: string; hint: string }[] = [
  {
    key: "cho-nhan",
    label: "Chờ nhận hàng",
    hint: "Khách tạo đơn tự mang hàng đến bưu cục hoặc quét QR tại bưu cục, chờ xác nhận nhập kho",
  },
  {
    key: "cho-lay",
    label: "Chờ lấy hàng",
    hint: "Khách tạo đơn chọn lấy tận nơi, chờ shipper đến lấy hàng",
  },
  {
    key: "dang-lay",
    label: "Đang lấy hàng",
    hint: "Shipper đang trên đường lấy hàng",
  },
];

function Page() {
  const { session } = useAuth();
  const orders = useStore((s) => s.orders);
  const offices = useStore((s) => s.offices);
  const transitionOrder = useStore((s) => s.transitionOrder);
  useRefreshOrdersOnMount();

  const [tab, setTab] = useState<TabKey>("cho-nhan");
  const { from, to, q } = useActivityFilters();
  const [senderOffice, setSenderOffice] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [shipperCode, setShipperCode] = useState<string | null>(null);
  const [printTarget, setPrintTarget] = useState<{
    code: string;
    packageSeq?: number;
    batchPackages?: boolean;
  } | null>(null);

  const toggleOrderPkgs = (code: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const scopeAll = hasAllOfficeScope(session);

  const packageActions = usePackageActions();
  const packagesEditable = (o: (typeof orders)[number]) =>
    tab === "cho-nhan" &&
    canWrite(session?.role, "cho-ban-giao") &&
    orderEditableFields(o, session?.role).packages;

  const inTab = (o: (typeof orders)[number], key: TabKey) => {
    // Chờ nhận hàng: qrDropOff (khách mang đến / quét QR). Legacy DRAFT drop-off vẫn hiện.
    if (key === "cho-nhan") {
      return (
        Boolean(o.qrDropOff) ||
        (o.status === "DRAFT" && !o.homePickup) ||
        (customerNotWarehouseReceived(o) && !o.homePickup)
      );
    }
    if (!o.homePickup) return false;
    const picking = Boolean(o.pickupStaff || o.pickingAt);
    return key === "dang-lay" ? picking : !picking;
  };

  const base = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const inScope = pendingHandoverOrders(orders, {
      allOffices: scopeAll,
      office: session?.office,
    });
    return inScope.filter((o) => {
      if (from && new Date(o.createdAt) < new Date(from)) return false;
      if (to && new Date(o.createdAt) > new Date(to + "T23:59:59")) return false;
      if (senderOffice && o.fromOffice !== senderOffice) return false;
      if (kw) {
        const hay =
          `${o.code} ${o.senderPhone} ${o.senderName ?? ""} ${o.receiverPhone} ${o.receiverName ?? ""} ${o.pickupAddress ?? ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [orders, q, from, to, senderOffice, scopeAll, session]);

  const counts = useMemo(
    () =>
      TABS.reduce(
        (acc, t) => ({ ...acc, [t.key]: base.filter((o) => inTab(o, t.key)).length }),
        {} as Record<TabKey, number>,
      ),
    [base],
  );

  useJumpToMatchingTab(
    q,
    tab,
    counts,
    TABS.map((t) => t.key),
    (k) => {
      setTab(k);
      setSelected(new Set());
    },
  );

  const rows = useMemo(() => base.filter((o) => inTab(o, tab)), [base, tab]);
  const { pageRows, pager } = usePagedRows(rows, "cho-ban-giao");

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.code));
  const toggleAll = (v: boolean) => setSelected(v ? new Set(rows.map((r) => r.code)) : new Set());
  const toggle = (code: string, v: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (v) next.add(code);
      else next.delete(code);
      return next;
    });

  const receiveToWarehouse = async (codes: string[]) => {
    if (!codes.length) return;
    const transferred = codes.filter(
      (c) =>
        useStore.getState().orders.find((x) => x.code === c || x.draftCode === c)?.transferPaidAt,
    );
    if (
      transferred.length &&
      !(await askConfirm(`${transferPaidNotice(transferred)}.\n\nTiếp tục nhập kho?`))
    )
      return;
    const st = useStore.getState();
    const at = new Date().toISOString();
    let okCount = 0;
    for (const code of codes) {
      const o = st.orders.find((x) => x.code === code || x.draftCode === code);
      if (!o) continue;
      const base = o.homePickup
        ? `Đã lấy hàng tận nơi & nhập kho ${officeName(o.fromOffice)}`
        : `Đã nhận hàng tại bưu cục & nhập kho ${officeName(o.fromOffice)}`;
      const detail = o.transferPaidAt
        ? `${base} · Khách đã chuyển khoản, không thu cước người gửi`
        : base;

      st.updateOrder(
        o.code,
        {
          pickedUpAt: at,
          stage: "WH_IN",
          // Đơn nháp khách mang đến / quét QR — xác nhận cục bộ; BE warehouse-receive cũng confirm.
          ...(o.status === "DRAFT" ? { status: "CONFIRMED" as const } : {}),
        },
        {
          eventAction: "PICKUP_RECEIVED",
          eventDetail: detail,
        },
      );
      st.audit({
        action: "PICKUP_RECEIVED",
        entityType: "order",
        entityId: o.code,
        detail: "Nhập kho từ Chờ bàn giao",
      });
      okCount++;
    }
    setSelected(new Set());
    if (okCount) {
      toast.success(`Đã nhập kho ${okCount} đơn · chuyển sang Nhập kho gửi`);
      void refreshOrdersNow();
    }
  };

  const assignInternal = async (o: OrderX, { shipper, note }: InternalAssign) => {
    const st = useStore.getState();
    const at = new Date().toISOString();
    const who = `${shipper.fullName}${shipper.phone ? ` · ${shipper.phone}` : ""}`;
    st.updateOrder(
      o.code,
      { pickingAt: at, pickupStaff: who },
      {
        eventAction: "PICKUP_STARTED",
        eventDetail: `Bàn giao lấy hàng cho ${who}${note ? ` — ${note}` : ""}`,
      },
    );
    setSelected(new Set());
    setTab("dang-lay");
    toast.success(`Đã bàn giao ${o.code} cho ${who}`);
    void refreshOrdersNow();
    return true;
  };

  const assignExternal = async (o: OrderX, { feeActual, note }: ExternalAssign) => {
    const st = useStore.getState();
    const at = new Date().toISOString();
    const who = `Shipper ngoài · trả ${feeActual.toLocaleString("vi-VN")}đ`;
    st.updateOrder(
      o.code,
      { pickingAt: at, pickupStaff: who, partnerFee: feeActual, partnerCode: "EXTERNAL" },
      {
        eventAction: "PICKUP_STARTED",
        eventDetail: `Bàn giao lấy hàng ${who}${note ? ` — ${note}` : ""}`,
      },
    );
    setSelected(new Set());
    setTab("dang-lay");
    toast.success(`Đã bàn giao ${o.code} — ${who}`);
    void refreshOrdersNow();
    return true;
  };

  const canWarehouseIn = tab === "cho-nhan" || (tab === "dang-lay" && session?.role === "AD");

  const canCancelTab = tab === "cho-lay" || tab === "cho-nhan" || tab === "dang-lay";

  const [cancelCodes, setCancelCodes] = useState<string[]>([]);
  const cancelHasTransfer = cancelCodes.some(
    (c) => orders.find((o) => o.code === c)?.transferPaidAt,
  );

  const cancelOrders = (codes: string[], reason: string) => {
    if (!codes.length || !canCancelTab) return;
    const detail = `Huỷ từ Chờ bàn giao · ${reason}`.slice(0, 255);
    let ok = 0;
    for (const code of codes) {
      const res = transitionOrder(code, "CANCELLED", "CANCEL", detail);
      if (res.ok) ok++;
      else toast.error(res.error ?? `Không huỷ được ${code}`);
    }
    setSelected(new Set());
    if (ok) {
      toast.success(ok === 1 ? `Đã huỷ đơn ${codes[0]}` : `Đã huỷ ${ok} đơn`);
      void refreshOrdersNow();
    }
  };

  const activeTab = TABS.find((t) => t.key === tab)!;
  const tabIcons: Record<TabKey, string> = {
    "cho-nhan": "qr_code_scanner",
    "cho-lay": "pending_actions",
    "dang-lay": "delivery_dining",
  };

  return (
    <div className="m3-page stack" style={{ gap: 16 }}>
      <M3PageHeader
        title="Chờ bàn giao"
        description={activeTab.hint}
        actions={
          <div className="field" style={{ flex: "0 0 200px", minWidth: 160 }}>
            <span className="l">Văn phòng gửi</span>
            <SearchableSelect
              value={senderOffice || "all"}
              onValueChange={(v) => setSenderOffice(v === "all" ? "" : v)}
              placeholder="Tất cả văn phòng"
              options={[
                { value: "all", label: "Tất cả văn phòng" },
                ...offices.map((o) => ({ value: o.code, label: o.name })),
              ]}
            />
          </div>
        }
      />

      <StageTabRow>
        {TABS.map((t) => (
          <StageTabButton
            key={t.key}
            active={t.key === tab}
            onClick={() => {
              setTab(t.key);
              setSelected(new Set());
            }}
          >
            <span className="ms" aria-hidden="true">
              {tabIcons[t.key]}
            </span>
            {t.label}
            <span className="count num">{counts[t.key] ?? 0}</span>
          </StageTabButton>
        ))}
      </StageTabRow>

      <section className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {rows.length === 0 ? (
          <div className="empty">
            <span
              className="ms"
              aria-hidden="true"
              style={{ fontSize: 40, color: "var(--on-surface-variant)" }}
            >
              inbox
            </span>
            <h2 className="group-title" style={{ margin: "12px 0 4px" }}>
              Không có đơn nào
            </h2>
            <div className="muted lab">Tab này hiện chưa có đơn cần xử lý.</div>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px 16px",
                minHeight: 40,
              }}
            >
              <div style={{ fontSize: 15, lineHeight: "22px", fontWeight: 600 }}>
                {selected.size > 0
                  ? `Đã chọn ${selected.size} đơn`
                  : `${activeTab.label} (${rows.length})`}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
                {tab === "cho-lay" ? (
                  <button
                    type="button"
                    className="btn tonal"
                    disabled={selected.size !== 1}
                    title="Bàn giao từng đơn cho shipper nội bộ hoặc Ahamove"
                    onClick={() => setShipperCode([...selected][0])}
                  >
                    <span className="ms" aria-hidden="true">
                      directions_bike
                    </span>
                    Bàn giao shipper
                  </button>
                ) : null}
                {canCancelTab ? (
                  <button
                    type="button"
                    className="btn text"
                    disabled={selected.size === 0}
                    onClick={() => setCancelCodes([...selected])}
                  >
                    Huỷ đơn ({selected.size})
                  </button>
                ) : null}
                {canWarehouseIn ? (
                  <button
                    type="button"
                    className="btn"
                    disabled={selected.size === 0}
                    title={tab === "dang-lay" ? "Nhập bù khi Ahamove không báo về" : undefined}
                    onClick={() => receiveToWarehouse([...selected])}
                  >
                    {tab === "cho-nhan" ? "Xác nhận nhập kho" : "Nhập kho"} ({selected.size})
                  </button>
                ) : null}
              </div>
            </div>

            <div className="scroller">
              <table className="tbl" style={{ ["--tbl-min" as string]: "1280px" }}>
                <thead>
                  <tr>
                    <th style={{ width: 18 }}>
                      <input
                        className="check"
                        type="checkbox"
                        checked={allChecked}
                        onChange={(e) => toggleAll(e.target.checked)}
                        aria-label="Chọn tất cả"
                      />
                    </th>
                    <th>Mã đơn</th>
                    <th>Người gửi</th>
                    <th>Người nhận</th>
                    <th>VP gửi → VP nhận</th>
                    <OrderCargoHeader />
                    <th>Ảnh</th>
                    <OrderFeeHeader />
                    <th className="r">Tác vụ</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <Fragment key={r.code}>
                      <tr className={cn(selected.has(r.code) && "sel")}>
                        <td>
                          <input
                            className="check"
                            type="checkbox"
                            checked={selected.has(r.code)}
                            onChange={(e) => toggle(r.code, e.target.checked)}
                            aria-label={`Chọn ${r.code}`}
                          />
                        </td>
                        <td>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <button
                              type="button"
                              className="link"
                              style={{ display: "inline-flex", padding: 0, textDecoration: "none" }}
                              title={expandedOrders.has(r.code) ? "Ẩn kiện" : "Xem kiện"}
                              aria-expanded={expandedOrders.has(r.code)}
                              onClick={() => toggleOrderPkgs(r.code)}
                            >
                              <ChevronDown
                                className={cn(
                                  "h-4 w-4 shrink-0 transition-transform",
                                  expandedOrders.has(r.code) && "rotate-180",
                                )}
                                style={{ color: "var(--on-surface-variant)" }}
                              />
                            </button>
                            <OrderCodeLink code={r.code} className="code" />
                          </span>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                            <OrderStatusBadge status={r.status} issue={r.issue} order={r} />
                            <TransferPaidBadge order={r} className="ml-0" />
                          </div>
                          <span className="sub">
                            {r.qrDropOff
                              ? "Quét QR tại bưu cục"
                              : r.homePickup
                                ? "Lấy tận nơi"
                                : "Khách mang đến"}
                          </span>
                          <span className="sub">{formatDateTime(r.createdAt)}</span>
                          {(r.partnerCode === "AHAMOVE" || r.partnerCode === "GRAB") &&
                          r.partnerOrderId ? (
                            <AhamoveInfo order={r} />
                          ) : null}
                        </td>
                        <td>
                          <span className="main" style={{ fontWeight: 500 }}>
                            {r.senderName ?? "-"}
                          </span>
                          <span className="sub">{r.senderPhone}</span>
                          {!r.qrDropOff && (r.pickupAddress || r.address) ? (
                            <span className="sub">{r.pickupAddress ?? r.address}</span>
                          ) : null}
                        </td>
                        <td>
                          <span className="main" style={{ fontWeight: 500 }}>
                            {r.receiverName}
                          </span>
                          <span className="sub">{r.receiverPhone}</span>
                        </td>
                        <td>
                          <OfficeRouteCell order={r} />
                        </td>
                        <OrderCargoCell order={r} />
                        <td>
                          {r.hasGoodsPhoto ? (
                            <GoodsPhotoButton orderCode={r.code} />
                          ) : (
                            <span className="thumb" role="img" aria-label="Chưa có ảnh">
                              <span className="ms" aria-hidden="true">
                                image
                              </span>
                            </span>
                          )}
                        </td>
                        <OrderFeeCell order={r} />
                        <td>
                          <div className="act">
                            <StaffSenderTransferQrAction order={r} variant="button" />
                            {tab === "cho-lay" ? (
                              <button
                                type="button"
                                className="ok"
                                onClick={() => setShipperCode(r.code)}
                              >
                                Bàn giao
                              </button>
                            ) : null}
                            {canWarehouseIn ? (
                              <button
                                type="button"
                                className="ok"
                                onClick={() => receiveToWarehouse([r.code])}
                              >
                                {tab === "cho-nhan" ? "Nhập kho" : "Nhập kho"}
                              </button>
                            ) : null}
                            {canCancelTab ? (
                              <button
                                type="button"
                                className="no"
                                aria-label="Huỷ đơn"
                                title="Huỷ đơn"
                                onClick={() => setCancelCodes([r.code])}
                              >
                                <span className="ms" aria-hidden="true">
                                  delete
                                </span>
                              </button>
                            ) : null}
                          </div>
                          {tab !== "cho-nhan" && !r.qrDropOff ? (
                            <span className="sub">NV: {r.pickupStaff ?? "Chưa phân công"}</span>
                          ) : null}
                        </td>
                      </tr>
                      {expandedOrders.has(r.code) && (
                        <OrderPackageListRow
                          order={r}
                          layout="rows"
                          leadingCols={1}
                          feeCols={FEE_COL_COUNT + 1}
                          onPrintPackage={(code, seq) => setPrintTarget({ code, packageSeq: seq })}
                          {...(packagesEditable(r) ? packageActions.handlers : {})}
                        />
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination pager={pager} />
          </>
        )}
      </section>

      <AssignShipperDialog
        purpose="pickup"
        order={shipperCode ? (orders.find((o) => o.code === shipperCode) ?? null) : null}
        onOpenChange={(v) => !v && setShipperCode(null)}
        onInternal={assignInternal}
        onExternal={assignExternal}
        onDone={() => {
          setSelected(new Set());
          void refreshOrdersNow();
        }}
      />
      <PrintLabelDialog
        code={printTarget?.code ?? null}
        packageSeq={printTarget?.packageSeq}
        batchPackages={printTarget?.batchPackages}
        open={!!printTarget}
        onOpenChange={(v) => !v && setPrintTarget(null)}
      />
      <CancelOrderDialog
        open={cancelCodes.length > 0}
        codes={cancelCodes}
        onOpenChange={(v) => !v && setCancelCodes([])}
        onConfirm={cancelOrders}
        minReasonLength={cancelHasTransfer ? CANCEL_REASON_MIN_TRANSFER : undefined}
        description={
          cancelHasTransfer
            ? "có đơn khách đã chuyển khoản — cần ghi rõ lý do huỷ (và cách xử lý tiền với khách)."
            : "sẽ chuyển sang Đơn huỷ (khôi phục được ở màn Đơn huỷ)."
        }
      />
      {packageActions.dialogs}
    </div>
  );
}
