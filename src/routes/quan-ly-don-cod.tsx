import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePagedRows } from "@/lib/use-paged-rows";
import { TablePagination } from "@/components/TablePagination";
import { ProtectedPage } from "@/components/AppShell";
import { M3Page } from "@/components/M3Page";
import { Section, EmptyState } from "@/components/PageBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { OfficeRouteCell } from "@/components/OfficeRouteCell";
import { ImageLightbox } from "@/components/ImageLightbox";
import { PodPhotoInput } from "@/components/PodPhotoInput";
import { formatVND, officeName, openIssueType, receiverOfficeName } from "@/lib/mock-data";
import { displayOrderNote, orderGoodsFare } from "@/lib/package-label";
import { useStore, type OrderX } from "@/lib/store";
import {
  fetchCodBillPhotos,
  fetchCodPaymentRequestHtml,
  listOrdersPage,
  markCodExported,
  uploadCodBillPhotos,
} from "@/lib/api/domain-api";
import { orderTabStatusLabel } from "@/lib/customer-track-status";
import { isApiEnabled } from "@/lib/api/client";
import { ExportFormatButton } from "@/components/ExportFormatButton";
import { downloadExcelRows, type ExportFormat } from "@/lib/csv";
import { guestBillPayLabel, printHtmlDocument, printImageBlob, renderGuestBillPng } from "@/lib/guest-bill-image";
import { Checkbox } from "@/components/ui/checkbox";
import { useBranchItineraryMaster } from "@/lib/use-branch-itinerary";
import { canWrite } from "@/lib/rbac";
import { useAuth } from "@/lib/auth";
import {
  Banknote,
  Building2,
  CheckCircle2,
  FileText,
  ImageIcon,
  Loader2,
  Package,
  Printer,
  RotateCcw,
  ShieldCheck,
  Upload,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/quan-ly-don-cod")({
  head: () => ({
    meta: [
      { title: "Quản lý đơn COD — X.E" },
      {
        name: "description",
        content: "Đơn có thu hộ COD: tra cứu, xuất Excel và xác nhận đã xử lý khi giao thành công.",
      },
      { property: "og:title", content: "Quản lý đơn COD — X.E" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Quản lý đơn COD" screen="quan-ly-don-cod">
      <M3Page>
        <Page />
      </M3Page>
    </ProtectedPage>
  ),
});

function isoDay(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 6);
  return { from: isoDay(from), to: isoDay(to) };
}

function processedAt(iso?: string) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function moneyCell(n?: number) {
  if (n == null || !Number.isFinite(n)) return "—";
  return formatVND(n).replace(/\s*VNĐ$/i, "").trim();
}

/** Cước vận chuyển = cước hàng (không gồm phí thu hộ — phí đó là cột riêng). Đơn cũ chưa tách thì vẫn là fare. */
function cuocShipping(o: OrderX) {
  return orderGoodsFare(o);
}

function bankBlock(o: OrderX) {
  const lines = [o.bankName, o.bankAccountNo, o.bankAccountName].filter((x) => (x ?? "").trim());
  return lines.length ? lines : null;
}

function Page() {
  const { session } = useAuth();
  const trips = useStore((s) => s.trips);
  const { branchNames, itinerariesForBranchName } = useBranchItineraryMaster();
  const defaults = useMemo(() => defaultRange(), []);

  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [route, setRoute] = useState("");
  const [itinerary, setItinerary] = useState("");
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(q.trim()), 400);
    return () => window.clearTimeout(t);
  }, [q]);
  const [rows, setRows] = useState<OrderX[]>([]);
  const [status, setStatus] = useState("");
  /** "" | DONE (đã xác nhận xử lý COD) | PENDING (chưa xử lý). */
  const [codHandled, setCodHandled] = useState("");
  const [loading, setLoading] = useState(false);
  const statusOptions = useMemo(() => {
    const labels = new Set(rows.map((o) => orderTabStatusLabel(o)));
    return [...labels].sort((a, b) => a.localeCompare(b, "vi"));
  }, [rows]);
  const shown = useMemo(() => {
    let list = rows;
    if (status) list = list.filter((o) => orderTabStatusLabel(o) === status);
    if (codHandled === "DONE") list = list.filter((o) => Boolean(o.codExportedAt));
    else if (codHandled === "PENDING") list = list.filter((o) => !o.codExportedAt);
    return list;
  }, [rows, status, codHandled]);
  useEffect(() => {
    if (status && !statusOptions.includes(status)) setStatus("");
  }, [status, statusOptions]);
  const { pageRows, pager } = usePagedRows(shown, "quan-ly-don-cod");
  const setPage = pager.setPage;
  const [confirmTarget, setConfirmTarget] = useState<OrderX | null>(null);
  const [markingCode, setMarkingCode] = useState<string | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [confirmPhotos, setConfirmPhotos] = useState<string[]>([]);
  const [docBusy, setDocBusy] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<OrderX | null>(null);
  const [uploadPhotos, setUploadPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [viewBusy, setViewBusy] = useState<string | null>(null);
  const [viewUrls, setViewUrls] = useState<string[]>([]);
  const [viewTitle, setViewTitle] = useState("");

  const canMark = canWrite(session?.role, "quan-ly-don-cod");

  const tripByCode = useMemo(() => {
    const m = new Map<string, { bks?: string; driver?: string }>();
    for (const t of trips) m.set(t.code, { bks: t.bks, driver: t.driver });
    return m;
  }, [trips]);

  const load = useCallback(async () => {
    if (!isApiEnabled()) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const query = {
        codOnly: true,
        keyword: qDebounced || undefined,
        createdFrom: from || undefined,
        createdTo: to || undefined,
        routeLabel: route || undefined,
        itineraryLabel: itinerary || undefined,
        size: 500,
        sort: "createdAt,desc",
      };
      const list: OrderX[] = [];
      for (let page = 0; page < 2_000; page++) {
        const { rows: chunk, total } = await listOrdersPage({ ...query, page });
        list.push(...chunk);
        if (chunk.length === 0 || list.length >= total) break;
      }
      setRows(
        list.filter(
          (o) =>
            (o.collectForm === "COD" || (o.codAmount ?? 0) > 0 || (o.codFeeRefund ?? 0) > 0) &&
            o.status !== "CANCELLED" &&
            openIssueType(o.issue) !== "EXCEPTION",
        ),
      );
      setPage(1);
    } catch (e: any) {
      toast.error(e?.message ?? "Không tải được danh sách COD");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [qDebounced, from, to, route, itinerary, setPage]);

  useEffect(() => {
    void load();
  }, [load]);

  const tripInfo = (o: OrderX) => {
    const code = o.tripCode ?? [...(o.legs ?? [])].reverse().find((l) => l.tripCode)?.tripCode;
    const fromApi = { plate: o.vehiclePlate, driver: o.driverName };
    const fromStore = code ? tripByCode.get(code) : undefined;
    return {
      plate: fromApi.plate || fromStore?.bks || "",
      driver: fromApi.driver || fromStore?.driver || "",
      code,
    };
  };

  const exportColumns = (list: OrderX[]) => [
    [
      "Mã đơn",
      "Người gửi",
      "SĐT gửi",
      "Người nhận",
      "SĐT nhận",
      "VP gửi",
      "VP nhận",
      "BKS",
      "Tài xế",
      "Cước",
      "COD",
      "Phí thu hộ",
      "Hoàn phí COD",
      "Ngân hàng",
      "Số TK",
      "Chủ TK",
    ],
    ...list.map((o) => {
      const t = tripInfo(o);
      return [
        o.code,
        o.senderName ?? "",
        o.senderPhone ?? "",
        o.receiverName ?? "",
        o.receiverPhone ?? "",
        officeName(o.fromOffice) || "",
        receiverOfficeName(o) || "",
        t.plate,
        t.driver,
        cuocShipping(o),
        o.codAmount ?? 0,
        (o.codFee ?? 0) > 0 ? (o.codFee ?? 0) : (o.codFeeRefund ?? 0),
        o.codFeeRefund ?? 0,
        o.bankName ?? "",
        o.bankAccountNo ?? "",
        o.bankAccountName ?? "",
      ];
    }),
  ];

  const exportPlain = (format: ExportFormat = "csv") => {
    if (!shown.length) {
      toast.message("Không có dữ liệu để xuất");
      return;
    }
    downloadExcelRows(`don-cod-${from}_${to}`, exportColumns(shown), "DonCOD", format);
  };

  const closeConfirm = () => {
    setConfirmTarget(null);
    setConfirmChecked(false);
    setConfirmPhotos([]);
  };

  const markProcessed = async (order: OrderX) => {
    if (!canMark || markingCode) return;
    if (!confirmPhotos.length && !order.hasCodBillPhoto) {
      toast.error("Cần upload ảnh bill COD trước khi xác nhận");
      return;
    }
    setMarkingCode(order.code);
    try {
      let hasPhoto = !!order.hasCodBillPhoto;
      if (confirmPhotos.length) {
        const uploaded = await uploadCodBillPhotos(order.code, confirmPhotos);
        hasPhoto = uploaded.hasCodBillPhoto !== false;
      }
      const res = await markCodExported([order.code]);
      if (!res?.updated) {
        toast.error(`Không xác nhận được ${order.code} (đơn không còn là đơn COD đã giao)`);
        return;
      }
      const at = new Date().toISOString();
      const by = session?.username;
      setRows((prev) =>
        prev.map((r) =>
          r.code === order.code
            ? { ...r, codExportedAt: at, codExportedBy: by, codExportedByName: undefined, hasCodBillPhoto: hasPhoto }
            : r,
        ),
      );
      toast.success(`Đã xác nhận xử lý COD đơn ${order.code}`);
      closeConfirm();
    } catch (e: any) {
      toast.error(e?.message ?? "Xác nhận thất bại");
    } finally {
      setMarkingCode(null);
    }
  };

  const printReceipt = async (order: OrderX) => {
    if (docBusy) return;
    setDocBusy(`bill:${order.code}`);
    try {
      const png = await renderGuestBillPng(order, guestBillPayLabel(order), { bankTransfer: true });
      await printImageBlob(png, `Biên nhận ${order.code}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Không in được biên nhận");
    } finally {
      setDocBusy(null);
    }
  };

  const printPaymentRequest = async (order: OrderX) => {
    if (docBusy) return;
    setDocBusy(`dntt:${order.code}`);
    try {
      await printHtmlDocument(await fetchCodPaymentRequestHtml(order.code));
    } catch (e: any) {
      toast.error(e?.message ?? "Không in được giấy đề nghị thanh toán");
    } finally {
      setDocBusy(null);
    }
  };

  const openUpload = (order: OrderX) => {
    setUploadTarget(order);
    setUploadPhotos([]);
  };

  const saveUpload = async () => {
    if (!uploadTarget || !uploadPhotos.length || uploading) return;
    setUploading(true);
    try {
      const res = await uploadCodBillPhotos(uploadTarget.code, uploadPhotos);
      setRows((prev) =>
        prev.map((r) =>
          r.code === uploadTarget.code ? { ...r, hasCodBillPhoto: res.hasCodBillPhoto !== false } : r,
        ),
      );
      toast.success(`Đã upload ${uploadPhotos.length} ảnh bill · ${uploadTarget.code}`);
      setUploadTarget(null);
      setUploadPhotos([]);
    } catch (e: any) {
      toast.error(e?.message ?? "Upload ảnh bill thất bại");
    } finally {
      setUploading(false);
    }
  };

  const viewBillPhotos = async (order: OrderX) => {
    if (viewBusy) return;
    setViewBusy(order.code);
    try {
      const images = await fetchCodBillPhotos(order.code);
      if (!images.length) {
        toast.message("Đơn chưa có ảnh bill");
        setRows((prev) =>
          prev.map((r) => (r.code === order.code ? { ...r, hasCodBillPhoto: false } : r)),
        );
        return;
      }
      setViewTitle(`Ảnh bill COD · ${order.code}`);
      setViewUrls(images);
      setRows((prev) =>
        prev.map((r) => (r.code === order.code ? { ...r, hasCodBillPhoto: true } : r)),
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Không tải được ảnh bill");
    } finally {
      setViewBusy(null);
    }
  };

  const clearFilters = () => {
    const d = defaultRange();
    setQ("");
    setRoute("");
    setItinerary("");
    setStatus("");
    setCodHandled("");
    setFrom(d.from);
    setTo(d.to);
    setQDebounced("");
  };

  const itineraryOpts = route ? itinerariesForBranchName(route) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Banknote className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold tracking-tight">Quản lý đơn COD</h1>
      </div>

      <Section>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-7">
          <div className="space-y-1.5 lg:col-span-1">
            <Label className="text-xs">Tìm kiếm</Label>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Mã đơn, tên KH, SĐT..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tuyến</Label>
            <SearchableSelect
              value={route}
              onValueChange={(v) => {
                setRoute(v);
                setItinerary("");
              }}
              placeholder="Tất cả"
              options={[{ value: "", label: "Tất cả" }, ...branchNames.map((r) => ({ value: r, label: r }))]}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Lộ trình</Label>
            <SearchableSelect
              value={itinerary}
              onValueChange={setItinerary}
              placeholder="Tất cả"
              options={[{ value: "", label: "Tất cả" }, ...itineraryOpts.map((it) => ({ value: it, label: it }))]}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Trạng thái đơn</Label>
            <SearchableSelect
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
              placeholder="Tất cả"
              options={[{ value: "", label: "Tất cả" }, ...statusOptions.map((s) => ({ value: s, label: s }))]}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Xử lý COD</Label>
            <SearchableSelect
              value={codHandled}
              onValueChange={(v) => {
                setCodHandled(v);
                setPage(1);
              }}
              placeholder="Tất cả"
              options={[
                { value: "", label: "Tất cả" },
                { value: "DONE", label: "Đã xử lý" },
                { value: "PENDING", label: "Chưa xử lý" },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Từ ngày</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Đến ngày</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={clearFilters}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Xoá bộ lọc
          </Button>
          <ExportFormatButton variant="outline" disabled={!shown.length} onExport={exportPlain} />
        </div>
      </Section>

      <Section title={loading ? "Đang tải…" : `${shown.length} đơn COD`}>
        {!shown.length ? (
          <EmptyState>Không có đơn COD trong khoảng lọc.</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[1260px] text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Mã đơn</th>
                  <th className="px-3 py-2 font-medium">Người gửi</th>
                  <th className="px-3 py-2 font-medium">Người nhận</th>
                  <th className="px-3 py-2 font-medium">VP gửi - VP nhận</th>
                  <th className="px-3 py-2 font-medium">Chuyến</th>
                  <th className="px-3 py-2 font-medium text-right">Cước</th>
                  <th className="px-3 py-2 font-medium text-right">COD</th>
                  <th className="px-3 py-2 font-medium text-right">Phí thu hộ</th>
                  <th className="px-3 py-2 font-medium">Thông tin tài khoản nhận COD</th>
                  <th className="px-3 py-2 font-medium">Chứng từ</th>
                  <th className="px-3 py-2 font-medium">Xử lý</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((o) => {
                  const t = tripInfo(o);
                  const bank = bankBlock(o);
                  const exported = Boolean(o.codExportedAt);
                  return (
                    <tr key={o.code} className="border-b last:border-0">
                      <td className="px-3 py-2 align-top">
                        <OrderCodeLink code={o.code} />
                        {(o.codFeeRefund ?? 0) > 0 ? (
                          <div className="mt-0.5">
                            <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Hoàn phí COD</Badge>
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div>{o.senderName || "—"}</div>
                        <div className="text-xs text-muted-foreground">{o.senderPhone}</div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div>{o.receiverName || "—"}</div>
                        <div className="text-xs text-muted-foreground">{o.receiverPhone}</div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <OfficeRouteCell order={o} />
                      </td>
                      <td className="px-3 py-2 align-top">
                        {t.plate || t.driver ? (
                          <>
                            <div>{t.plate || "—"}</div>
                            <div className="text-xs text-muted-foreground">{t.driver || "—"}</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 align-top text-right tabular-nums">{moneyCell(cuocShipping(o))}</td>
                      <td className="px-3 py-2 align-top text-right tabular-nums">{moneyCell(o.codAmount)}</td>
                      <td className="px-3 py-2 align-top text-right tabular-nums">
                        {moneyCell((o.codFee ?? 0) > 0 ? o.codFee : o.codFeeRefund)}
                      </td>
                      <td className="px-3 py-2 align-top text-xs leading-relaxed">
                        {bank ? (
                          bank.map((line) => <div key={line}>{line}</div>)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-col gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 justify-start gap-1 whitespace-nowrap px-2 text-xs"
                            disabled={!!docBusy}
                            onClick={() => void printReceipt(o)}
                          >
                            {docBusy === `bill:${o.code}` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Printer className="h-3.5 w-3.5" />
                            )}
                            In biên nhận
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 justify-start gap-1 whitespace-nowrap px-2 text-xs"
                            disabled={!!docBusy}
                            onClick={() => void printPaymentRequest(o)}
                          >
                            {docBusy === `dntt:${o.code}` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Printer className="h-3.5 w-3.5" />
                            )}
                            In đề nghị thanh toán
                          </Button>
                          {canMark && exported ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 justify-start gap-1 whitespace-nowrap px-2 text-xs"
                              disabled={!!uploading}
                              onClick={() => openUpload(o)}
                            >
                              <Upload className="h-3.5 w-3.5" />
                              Upload thêm ảnh bill
                            </Button>
                          ) : null}
                          {o.hasCodBillPhoto ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-7 justify-start gap-1 whitespace-nowrap px-2 text-xs"
                              disabled={viewBusy === o.code}
                              onClick={() => void viewBillPhotos(o)}
                            >
                              {viewBusy === o.code ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <ImageIcon className="h-3.5 w-3.5" />
                              )}
                              Xem ảnh bill
                            </Button>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        {exported ? (
                          <div className="space-y-0.5">
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Đã xử lý</Badge>
                            {o.codExportedByName || o.codExportedBy ? (
                              <div className="text-xs">
                                bởi {o.codExportedByName || o.codExportedBy}
                                {o.codExportedByName && o.codExportedBy ? (
                                  <span className="text-muted-foreground"> ({o.codExportedBy})</span>
                                ) : null}
                              </div>
                            ) : null}
                            <div className="text-xs text-muted-foreground">lúc {processedAt(o.codExportedAt)}</div>
                          </div>
                        ) : o.status === "DELIVERED" && canMark ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 whitespace-nowrap px-2 text-xs"
                            disabled={markingCode === o.code}
                            onClick={() => {
                              setConfirmTarget(o);
                              setConfirmChecked(false);
                              setConfirmPhotos([]);
                            }}
                          >
                            {markingCode === o.code ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )}
                            Xác nhận đã xử lý
                          </Button>
                        ) : (
                          <Badge variant="outline">{orderTabStatusLabel(o)}</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <TablePagination pager={pager} />
      </Section>

      <Dialog
        open={!!uploadTarget}
        onOpenChange={(open) => {
          if (!open && !uploading) {
            setUploadTarget(null);
            setUploadPhotos([]);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload ảnh bill COD · {uploadTarget?.code ?? ""}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Chọn ảnh chứng từ chuyển/trả COD (tối đa 5 ảnh / đơn, mỗi lần upload thêm ảnh mới).
          </p>
          <PodPhotoInput
            photos={uploadPhotos}
            onChange={setUploadPhotos}
            max={5}
            allowGallery
            allowPaste
            label="Chọn ảnh"
            disabled={uploading}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              onClick={() => {
                setUploadTarget(null);
                setUploadPhotos([]);
              }}
            >
              Hủy
            </Button>
            <Button type="button" disabled={uploading || !uploadPhotos.length} onClick={() => void saveUpload()}>
              {uploading ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Đang lưu…
                </>
              ) : (
                `Lưu ${uploadPhotos.length || ""} ảnh`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImageLightbox
        open={viewUrls.length > 0}
        onOpenChange={(open) => {
          if (!open) setViewUrls([]);
        }}
        urls={viewUrls}
        title={viewTitle}
      />

      <AlertDialog
        open={!!confirmTarget}
        onOpenChange={(open) => {
          if (!open && !markingCode) closeConfirm();
        }}
      >
        <AlertDialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-xl gap-5 overflow-x-hidden overflow-y-auto rounded-2xl border-0 p-6 shadow-xl sm:max-w-xl sm:rounded-2xl">
          <AlertDialogCancel
            disabled={!!markingCode}
            className="absolute right-4 top-4 mt-0 h-8 w-8 rounded-full border-0 bg-transparent p-0 text-muted-foreground shadow-none hover:bg-muted hover:text-foreground sm:mt-0"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </AlertDialogCancel>

          <AlertDialogHeader className="space-y-0 text-left">
            <div className="flex items-start gap-3 pr-8">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E8F0FF] text-[#3B6EF5]">
                <FileText className="h-5 w-5" strokeWidth={1.8} />
                <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#3B6EF5] text-white">
                  <ShieldCheck className="h-2.5 w-2.5" strokeWidth={2.5} />
                </span>
              </div>
              <div className="min-w-0 space-y-1">
                <AlertDialogTitle className="text-lg font-bold leading-snug text-[#1B2B4B]">
                  Xác nhận đã xử lý COD?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm text-muted-foreground">
                  Vui lòng kiểm tra thông tin đơn hàng trước khi xác nhận.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          {confirmTarget ? (
            <div className="min-w-0 space-y-2.5 rounded-xl bg-[#F3F7FF] px-3.5 py-3.5 text-sm text-[#1B2B4B]">
              <div className="flex min-w-0 items-start gap-2.5">
                <Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 break-words">
                  <span className="font-semibold">{confirmTarget.code}</span>
                  <span className="text-muted-foreground"> · </span>
                  <span className="font-semibold text-[#3B6EF5]">
                    COD {moneyCell(confirmTarget.codAmount)}
                  </span>
                </div>
              </div>
              <div className="flex min-w-0 items-start gap-2.5">
                <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 break-words font-medium">
                  {[confirmTarget.senderName, confirmTarget.senderPhone].filter(Boolean).join(" - ") || "—"}
                </div>
              </div>
              <div className="flex min-w-0 items-start gap-2.5">
                <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 break-all font-medium">
                  {[confirmTarget.bankName, confirmTarget.bankAccountNo, confirmTarget.bankAccountName]
                    .filter(Boolean)
                    .join(" - ") || "—"}
                </div>
              </div>
              <div className="flex min-w-0 items-start gap-2.5">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 whitespace-pre-wrap break-words text-muted-foreground">
                  {displayOrderNote(confirmTarget.note).trim() || "—"}
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm font-medium text-[#1B2B4B]">
              <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
              Ảnh bill COD
              {!confirmTarget?.hasCodBillPhoto ? <span className="text-destructive">*</span> : null}
              {confirmTarget?.hasCodBillPhoto ? (
                <span className="font-normal text-muted-foreground">(đã có ảnh, có thể thêm)</span>
              ) : null}
            </Label>
            <div
              className={cn(
                "rounded-xl border border-dashed border-[#B8CEFF] bg-[#F8FBFF] p-3",
                markingCode && "pointer-events-none opacity-60",
              )}
            >
              <PodPhotoInput
                photos={confirmPhotos}
                onChange={setConfirmPhotos}
                max={5}
                allowGallery
                allowPaste
                label="Nhấn để chọn ảnh hoặc kéo thả"
                disabled={!!markingCode}
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-[#EEF4FF] px-3.5 py-3 text-sm text-[#1B2B4B]">
            <Checkbox
              checked={confirmChecked}
              onCheckedChange={(v) => setConfirmChecked(v === true)}
              className="mt-0.5 border-[#3B6EF5] data-[state=checked]:border-[#3B6EF5] data-[state=checked]:bg-[#3B6EF5]"
              disabled={!!markingCode}
            />
            <span>Tôi xác nhận đã chuyển/trả đủ tiền COD cho người gửi.</span>
          </label>

          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel
              disabled={!!markingCode}
              className="mt-0 h-10 rounded-lg border-[#D0D5DD] px-5 text-[#344054] sm:mt-0"
            >
              Hủy
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={
                !confirmChecked ||
                !!markingCode ||
                (!confirmPhotos.length && !confirmTarget?.hasCodBillPhoto)
              }
              className="h-10 rounded-lg bg-[#3B6EF5] px-5 hover:bg-[#2F5FE0]"
              onClick={(e) => {
                e.preventDefault();
                if (confirmTarget) void markProcessed(confirmTarget);
              }}
            >
              {markingCode ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Đang lưu…
                </>
              ) : (
                "Xác nhận"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
