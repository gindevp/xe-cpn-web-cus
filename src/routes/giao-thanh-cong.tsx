import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { usePagedRows, type Pager } from "@/lib/use-paged-rows";
import { useServerPagedRows } from "@/lib/use-server-paged-rows";
import { TablePagination } from "@/components/TablePagination";
import { ProtectedPage } from "@/components/AppShell";
import { M3PageHeader } from "@/components/M3Page";
import { Section, EmptyState } from "@/components/PageBits";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { OfficeRouteCell } from "@/components/OfficeRouteCell";
import { AhamoveInfo, InternalShipperInfo } from "@/components/AhamoveInfo";
import {
  OrderCargoCell,
  OrderCargoHeader,
  OrderFeeCell,
  OrderFeeHeader,
} from "@/components/OrderFeeCells";
import {
  formatVND,
  formatMoney,
  formatDateTime,
  officeName,
  orderReceiverOffice,
  canonicalOfficeCode,
} from "@/lib/mock-data";
import { useStore, type OrderX } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { getOrder, listOrdersPage } from "@/lib/api/domain-api";
import { isApiEnabled } from "@/lib/api/client";
import { assignedOfficeCode, hasAllOfficeScope, resolveViewOffice } from "@/lib/office-scope";
import { orderGoodsLabel, packageCount, packageRows } from "@/lib/package-label";
import { useActivityFilters } from "@/lib/activity-filters";
import { ImageLightbox, isViewableImageUrl } from "@/components/ImageLightbox";
import { podMomentLabel } from "@/lib/ahamove";
import { INVOICE_STATE_LABEL, INVOICE_STATE_TAG_CLASS, invoiceStateOf } from "@/lib/invoice-policy";
import { toast } from "sonner";

function podSlides(photos: OrderX["podPhotos"]): { urls: string[]; labels: string[] } {
  const urls: string[] = [];
  const labels: string[] = [];
  for (const p of photos ?? []) {
    if (p.url && isViewableImageUrl(p.url)) {
      urls.push(p.url);
      labels.push(podMomentLabel(p.label));
    }
  }
  return { urls, labels };
}

function officeCodeEq(a?: string | null, b?: string | null): boolean {
  const x = canonicalOfficeCode(a) || (a ?? "").trim();
  const y = canonicalOfficeCode(b) || (b ?? "").trim();
  if (!x || !y) return false;
  return x === y || x.toUpperCase() === y.toUpperCase();
}

export const Route = createFileRoute("/giao-thanh-cong")({
  head: () => ({
    meta: [
      { title: "Thành công — X.E" },
      {
        name: "description",
        content:
          "Đơn giao thành công và đơn hoàn thành công: shipper hoặc điều phối xác nhận tại bưu cục.",
      },
      { property: "og:title", content: "Thành công — X.E" },
      {
        property: "og:description",
        content: "Theo dõi đơn giao thành công và hoàn thành công theo ngày, văn phòng.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Thành công" screen="giao-thanh-cong" hidePageTitle>
      <Page />
    </ProtectedPage>
  ),
});

function isReturned(o: OrderX): boolean {
  return (
    o.status === "RETURNED" || (o as OrderX & { returnStage?: string }).returnStage === "RT_DONE"
  );
}

function deliveredBy(o: OrderX): "SHIPPER" | "OFFICE" {
  const ev = [...(o.events ?? [])]
    .reverse()
    .find((e) => e.action === "DELIVERED" || e.action === "POD" || e.action === "POD_QUAY");
  const detail = `${ev?.detail ?? ""}`.toLowerCase();
  if (o.homeDelivery || detail.includes("shipper") || ev?.action === "POD") return "SHIPPER";
  return "OFFICE";
}

function deliveredAt(o: OrderX): string {
  const ev = [...(o.events ?? [])]
    .reverse()
    .find((e) => e.action === "DELIVERED" || e.action === "POD" || e.action === "POD_QUAY");
  return ev?.at ?? o.updatedAt ?? o.createdAt;
}

function returnedBy(o: OrderX): "SHIPPER" | "OFFICE" {
  const ev = [...(o.events ?? [])]
    .reverse()
    .find(
      (e) =>
        e.action === "RT_DONE" ||
        e.action === "RETURNED" ||
        e.action === "RETURN_DONE" ||
        e.action === "POD",
    );
  const detail = `${ev?.detail ?? ""}`.toLowerCase();
  if (detail.includes("shipper") || detail.includes("hoàn tận")) return "SHIPPER";
  return "OFFICE";
}

function returnedAt(o: OrderX): string {
  const ev = [...(o.events ?? [])]
    .reverse()
    .find(
      (e) =>
        e.action === "RT_DONE" ||
        e.action === "RETURNED" ||
        e.action === "RETURN_DONE" ||
        e.action === "POD",
    );
  return ev?.at ?? o.updatedAt ?? o.createdAt;
}

/** VP thao tác hoàn thành công — từ event (`VP=XX`), không có thì fallback VP gửi. */
function returnedAtOffice(o: OrderX): string {
  const ev = [...(o.events ?? [])]
    .reverse()
    .find(
      (e) =>
        e.action === "RT_DONE" ||
        e.action === "RETURNED" ||
        e.action === "RETURN_DONE" ||
        e.action === "POD",
    );
  const detail = `${ev?.detail ?? ""}`;
  const m = detail.match(/VP\s*=\s*([A-Za-z0-9]+)/i);
  if (m?.[1]) return m[1].toUpperCase();
  return (o.fromOffice ?? "").trim();
}

function successAt(o: OrderX): string {
  return isReturned(o) ? returnedAt(o) : deliveredAt(o);
}

function successBy(o: OrderX): "SHIPPER" | "OFFICE" {
  return isReturned(o) ? returnedBy(o) : deliveredBy(o);
}

function successOffice(o: OrderX): string {
  return isReturned(o) ? returnedAtOffice(o) : orderReceiverOffice(o);
}

/** Đơn giao thành công chưa từng xuất HĐ / chưa được kế toán tích (lần trước lỗi cũng tính) — không gồm công nợ. */
function Page() {
  const { session } = useAuth();
  const storeOrders = useStore((s) => s.orders);
  const offices = useStore((s) => s.offices);
  const viewOfficeRaw = useStore((s) => s.viewOffice);

  const { from, to, q } = useActivityFilters();
  const [office, setOffice] = useState("");
  const [mode, setMode] = useState("");
  const [kind, setKind] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{
    urls: string[];
    labels: string[];
    index: number;
    title: string;
  } | null>(null);
  const [loadingPodCode, setLoadingPodCode] = useState<string | null>(null);

  const scopeAll = hasAllOfficeScope(session);
  const officeCode = assignedOfficeCode(resolveViewOffice(session, viewOfficeRaw));

  const apiMode = isApiEnabled();
  const [kwDebounced, setKwDebounced] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setKwDebounced(q.trim()), 350);
    return () => window.clearTimeout(t);
  }, [q]);

  // Server: thời điểm thành công = updatedAt, hình thức = giao tận nơi (đơn tóm tắt không kèm lịch sử sự kiện).
  const scopedOffice = !scopeAll && officeCode ? officeCode : "";
  const actedOffice = scopedOffice || office;
  const officeConflict = !!scopedOffice && !!office && !officeCodeEq(scopedOffice, office);
  const server = useServerPagedRows<OrderX>(
    "giao-thanh-cong",
    JSON.stringify([from, to, actedOffice, officeConflict, mode, kind, kwDebounced]),
    async (page, size) => {
      if (officeConflict) return { rows: [], total: 0 };
      const statuses =
        kind === "GIAO" || mode === "SHIPPER"
          ? ["DELIVERED"]
          : kind === "HOAN"
            ? ["RETURNED"]
            : ["DELIVERED", "RETURNED"];
      return listOrdersPage({
        statuses,
        updatedFrom: from || undefined,
        updatedTo: to || undefined,
        successOfficeCode: actedOffice || undefined,
        homeDelivery: mode === "SHIPPER" ? true : mode === "OFFICE" ? false : undefined,
        keyword: kwDebounced || undefined,
        sort: "updatedAt,desc",
        page,
        size,
      });
    },
    apiMode,
  );
  useEffect(() => {
    if (server.error) toast.error(server.error);
  }, [server.error]);
  const loading = apiMode && server.loading;

  const source = useMemo(
    () => (apiMode ? [] : storeOrders.filter((o) => o.status === "DELIVERED" || isReturned(o))),
    [apiMode, storeOrders],
  );

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return source
      .filter((o) => {
        const ret = isReturned(o);
        if (kind === "GIAO" && ret) return false;
        if (kind === "HOAN" && !ret) return false;
        const acted = successOffice(o);
        if (!scopeAll && officeCode && !officeCodeEq(acted, officeCode)) return false;
        const at = successAt(o);
        if (from && new Date(at) < new Date(from)) return false;
        if (to && new Date(at) > new Date(to + "T23:59:59")) return false;
        if (office && !officeCodeEq(acted, office)) return false;
        if (mode && successBy(o) !== mode) return false;
        if (kw) {
          const hay =
            `${o.code} ${o.senderPhone} ${o.senderName ?? ""} ${o.receiverPhone} ${o.receiverName ?? ""} ${orderGoodsLabel(o)}`.toLowerCase();
          if (!hay.includes(kw)) return false;
        }
        return true;
      })
      .sort((a, b) => (successAt(a) < successAt(b) ? 1 : -1));
  }, [source, q, from, to, office, mode, kind, scopeAll, officeCode]);

  return (
    <div className="m3-page stack" style={{ gap: 16 }}>
      <M3PageHeader
        title="Thành công"
        description={
          loading
            ? "Danh sách chung giao thành công và hoàn thành công. Đang tải…"
            : "Danh sách chung giao thành công và hoàn thành công."
        }
        actions={
          <div className="filters" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="field" style={{ flex: "0 0 150px" }}>
              <span className="l">VP</span>
              <SearchableSelect
                value={office || "all"}
                onValueChange={(v) => setOffice(v === "all" ? "" : v)}
                placeholder="Tất cả"
                options={[
                  { value: "all", label: "Tất cả" },
                  ...offices.map((o) => ({ value: o.code, label: o.name })),
                ]}
              />
            </div>
            <div className="field" style={{ flex: "0 0 150px" }}>
              <span className="l">Loại</span>
              <SearchableSelect
                value={kind || "all"}
                onValueChange={(v) => setKind(v === "all" ? "" : v)}
                placeholder="Tất cả"
                options={[
                  { value: "all", label: "Tất cả" },
                  { value: "GIAO", label: "Giao thành công" },
                  { value: "HOAN", label: "Hoàn thành công" },
                ]}
              />
            </div>
            <div className="field" style={{ flex: "0 0 150px" }}>
              <span className="l">Hình thức</span>
              <SearchableSelect
                value={mode || "all"}
                onValueChange={(v) => setMode(v === "all" ? "" : v)}
                placeholder="Tất cả"
                options={[
                  { value: "all", label: "Tất cả" },
                  { value: "SHIPPER", label: "Shipper" },
                  { value: "OFFICE", label: "Tại bưu cục" },
                ]}
              />
            </div>
          </div>
        }
      />

      <SuccessOrderTable
        rows={rows}
        server={apiMode ? { pageRows: server.pageRows, pager: server.pager } : undefined}
        loading={loading}
        emptyText="Chưa có đơn thành công"
        sectionTitle={`Danh sách thành công (${apiMode ? server.total : rows.length})`}
        expanded={expanded}
        setExpanded={setExpanded}
        lightbox={lightbox}
        setLightbox={setLightbox}
        loadingPodCode={loadingPodCode}
        onViewPod={async (order) => {
          const ret = isReturned(order);
          const photoLabel = ret ? "Ảnh hoàn" : "Ảnh POD";
          const syncAhamove =
            !ret &&
            (order.partnerCode === "AHAMOVE" || order.partnerCode === "GRAB") &&
            !!order.partnerOrderId;
          const local = podSlides(order.podPhotos);
          if (local.urls.length && !syncAhamove) {
            setLightbox({ ...local, index: 0, title: `${photoLabel} · ${order.code}` });
            return;
          }
          if (!isApiEnabled()) {
            if (local.urls.length) {
              setLightbox({ ...local, index: 0, title: `${photoLabel} · ${order.code}` });
              return;
            }
            toast.error("Không có ảnh để xem");
            return;
          }
          setLoadingPodCode(order.code);
          try {
            const detail = await getOrder(order.code, { ahamovePhotos: syncAhamove });
            const slides = podSlides(detail.podPhotos);
            useStore.setState((st) => ({
              orders: st.orders.map((o) =>
                o.code === order.code ? { ...o, podPhotos: detail.podPhotos ?? o.podPhotos } : o,
              ),
            }));
            if (!slides.urls.length) {
              toast.error(`Không có ${photoLabel.toLowerCase()}`);
              return;
            }
            setLightbox({ ...slides, index: 0, title: `${photoLabel} · ${order.code}` });
          } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Không tải được ảnh");
          } finally {
            setLoadingPodCode(null);
          }
        }}
      />
    </div>
  );
}

function SuccessOrderTable({
  rows,
  server,
  loading,
  emptyText,
  sectionTitle,
  expanded,
  setExpanded,
  lightbox,
  setLightbox,
  loadingPodCode,
  onViewPod,
}: {
  rows: OrderX[];
  /** Phân trang phía server — có thì bỏ qua {@code rows}. */
  server?: { pageRows: OrderX[]; pager: Pager };
  loading: boolean;
  emptyText: string;
  sectionTitle: string;
  expanded: string | null;
  setExpanded: (v: string | null) => void;
  lightbox: { urls: string[]; labels: string[]; index: number; title: string } | null;
  setLightbox: (
    v: { urls: string[]; labels: string[]; index: number; title: string } | null,
  ) => void;
  loadingPodCode: string | null;
  onViewPod: (order: OrderX) => void | Promise<void>;
}) {
  const local = usePagedRows(rows, "giao-thanh-cong");
  const pageRows = server ? server.pageRows : local.pageRows;
  const pager = server ? server.pager : local.pager;
  return (
    <>
      <Section
        title={
          <span className="group-title sec-title num">
            <span className="sec-ic" aria-hidden="true">
              <span className="ms">task_alt</span>
            </span>
            {sectionTitle}
          </span>
        }
      >
        {pager.total === 0 ? (
          <EmptyState>{loading ? "Đang tải…" : emptyText}</EmptyState>
        ) : (
          <div className="scroller">
            <table className="tbl" style={{ ["--tbl-min" as string]: "1120px" }}>
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Ảnh</th>
                  <th>Thời gian</th>
                  <th>Hình thức</th>
                  <th>Người gửi</th>
                  <th>Người nhận</th>
                  <th>VP gửi → VP nhận</th>
                  <OrderCargoHeader />
                  <OrderFeeHeader />
                  <th className="r">Đã thu</th>
                  <th>Hoá đơn</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const ret = isReturned(r);
                  const pkgs = packageCount(r);
                  const open = expanded === r.code;
                  const shipper = successBy(r) === "SHIPPER";
                  const photoLabel = ret ? "Xem ảnh hoàn" : "Xem POD";
                  const busy = loadingPodCode === r.code;
                  const invState = invoiceStateOf(r.invoiceStatus, r.invoiceType);
                  return (
                    <Fragment key={r.code}>
                      <tr>
                        <td>
                          <div className="flex flex-wrap items-center gap-2">
                            <OrderCodeLink code={r.code} className="code" />
                            {ret ? <span className="tag warn">HOÀN</span> : null}
                          </div>
                          <button
                            type="button"
                            className="link"
                            style={{ display: "block", marginTop: 2 }}
                            onClick={() => setExpanded(open ? null : r.code)}
                          >
                            {open ? "Ẩn kiện" : `Xem ${pkgs} kiện`}
                          </button>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="link"
                            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                            disabled={busy}
                            onClick={() => void onViewPod(r)}
                          >
                            <span className="ms" aria-hidden="true">
                              photo_camera
                            </span>
                            {busy ? "Đang tải…" : photoLabel}
                          </button>
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>{formatDateTime(successAt(r))}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <span style={{ fontWeight: 500 }}>
                            {ret
                              ? shipper
                                ? "Shipper hoàn"
                                : "Hoàn tại bưu cục"
                              : shipper
                                ? "Shipper giao"
                                : "Nhận tại bưu cục"}
                          </span>
                          {(r.partnerCode === "AHAMOVE" || r.partnerCode === "GRAB") &&
                          r.partnerOrderId ? (
                            <span className="sub" style={{ display: "block" }}>
                              <AhamoveInfo order={r} />
                            </span>
                          ) : shipper ? (
                            <span className="sub" style={{ display: "block" }}>
                              <InternalShipperInfo order={r} />
                            </span>
                          ) : null}
                        </td>
                        <td>
                          <span style={{ fontWeight: 500 }}>{r.senderName ?? "-"}</span>
                          <span className="sub">{r.senderPhone}</span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 500 }}>{r.receiverName}</span>
                          <span className="sub">{r.receiverPhone}</span>
                          {r.receiverActualName ? (
                            <span className="sub" style={{ display: "block" }}>
                              Thực nhận: {r.receiverActualName}
                              {r.receiverActualPhone ? ` · ${r.receiverActualPhone}` : ""}
                            </span>
                          ) : null}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <OfficeRouteCell order={r} />
                        </td>
                        <OrderCargoCell order={r} />
                        <OrderFeeCell order={r} />
                        <td className="r main">{formatMoney(r.paidAmount ?? 0)}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {ret ? (
                            <span className="muted">—</span>
                          ) : (
                            <span className={INVOICE_STATE_TAG_CLASS[invState]}>
                              {INVOICE_STATE_LABEL[invState].text}
                            </span>
                          )}
                        </td>
                      </tr>
                      {open ? (
                        <tr>
                          <td
                            colSpan={13}
                            style={{ background: "var(--surface-variant)", padding: "8px 12px" }}
                          >
                            <div className="mb-1 text-xs font-medium text-muted-foreground">
                              Chi tiết kiện
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left text-muted-foreground">
                                    <th className="py-1 pr-3">STT</th>
                                    <th className="py-1 pr-3">Mã kiện</th>
                                    <th className="py-1 pr-3">Hàng hóa</th>
                                    <th className="py-1 pr-3 text-right">SL</th>
                                    <th className="py-1 text-right">KL (kg)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {packageRows(r).map((p) => (
                                    <tr key={p.code} className="border-t border-border/50">
                                      <td className="py-1 pr-3">{p.seq}</td>
                                      <td className="py-1 pr-3 font-medium">{p.code}</td>
                                      <td className="py-1 pr-3">{p.label || "—"}</td>
                                      <td className="py-1 pr-3 text-right">{p.itemQty}</td>
                                      <td className="py-1 text-right">
                                        {(p.weightKg ?? 0).toFixed(1)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            <TablePagination pager={pager} />
          </div>
        )}
      </Section>

      <ImageLightbox
        open={!!lightbox}
        onOpenChange={(o) => {
          if (!o) setLightbox(null);
        }}
        urls={lightbox?.urls ?? []}
        labels={lightbox?.labels}
        index={lightbox?.index ?? 0}
        title={lightbox?.title}
      />
    </>
  );
}
