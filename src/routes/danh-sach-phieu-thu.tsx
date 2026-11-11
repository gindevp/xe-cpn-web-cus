import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ProtectedPage } from "@/components/AppShell";
import { M3Page } from "@/components/M3Page";
import { Section, EmptyState } from "@/components/PageBits";
import { StaffInfoPopover } from "@/components/StaffInfoPopover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatVND, officeName, canonicalOfficeCode } from "@/lib/mock-data";
import { useStore, type ReceiptRec } from "@/lib/store";
import { ExportFormatButton } from "@/components/ExportFormatButton";
import { downloadExcel, type ExportFormat } from "@/lib/csv";
import {
  CheckCircle2,
  RotateCcw,
  Clock,
  ImageIcon,
  ImagePlus,
  Loader2,
  QrCode,
  XCircle,
} from "lucide-react";
import {
  appendReceiptProofs,
  cancelReceipt,
  fetchReceiptProofImages,
  listReceiptsPage,
} from "@/lib/api/finance-config-api";
import { useServerPagedRows } from "@/lib/use-server-paged-rows";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { usePagedRows } from "@/lib/use-paged-rows";
import { TablePagination } from "@/components/TablePagination";
import { useAuth } from "@/lib/auth";
import {
  assignedOfficeCode,
  isViewAllOffices,
  resolveViewOffice,
  selectedViewOfficeCodes,
  VIEW_ALL_OFFICES,
} from "@/lib/office-scope";
import { isApiEnabled } from "@/lib/api/client";
import { syncOrdersByCodes } from "@/lib/api/sync";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { OrderCodeLink } from "@/components/OrderHistoryDialog";
import { OfficeRouteCell } from "@/components/OfficeRouteCell";
import { PodPhotoInput } from "@/components/PodPhotoInput";
import { ImageLightbox, isViewableImageUrl } from "@/components/ImageLightbox";
import { ReceiptPayQrDialog } from "@/components/ReceiptPayQrDialog";
import { RECEIPT_CONFIRMED_EVENT, type ReceiptConfirmedPayload } from "@/lib/use-realtime-sync";
import type { ReceiptTransferQr } from "@/lib/api/finance-config-api";

export const Route = createFileRoute("/danh-sach-phieu-thu")({
  validateSearch: (s: Record<string, unknown>): { code?: string } =>
    typeof s.code === "string" && s.code.trim() ? { code: s.code.trim() } : {},
  head: () => ({
    meta: [
      { title: "Danh sách phiếu thu — X.E" },
      {
        name: "description",
        content:
          "Tra cứu danh sách phiếu thu đã lập theo văn phòng, mã phiếu, nhân viên và người lập.",
      },
      { property: "og:title", content: "Danh sách phiếu thu — X.E" },
      {
        property: "og:description",
        content: "Danh sách phiếu thu theo văn phòng kèm bộ lọc và xuất Excel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ProtectedPage title="Danh sách phiếu thu" screen="danh-sach-phieu-thu" hidePageTitle>
      <M3Page>
        <Page />
      </M3Page>
    </ProtectedPage>
  ),
});

const VN_TZ = "Asia/Ho_Chi_Minh";

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", { hour12: false, timeZone: VN_TZ });
}

function localDayVn(iso?: string): string {
  if (!iso?.trim()) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", { timeZone: VN_TZ });
}

function fmtDayVn(day: string): string {
  if (!day || day.length < 10) return day || "—";
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

/** Giống cột «Ngày» màn Phiếu thu = ngày nhận tiền khách (customerPaidAt). */
function receiptMoneyDay(r: ReceiptRec): string {
  return localDayVn(r.customerPaidAt || r.createdAt);
}

/** Phiếu OnePay tự thu hộ — không cho hoàn tác (đã khớp GD ngân hàng). */
function isOnePayCollected(r: ReceiptRec): boolean {
  if (r.paidTransId?.trim()) return true;
  const by = (r.confirmedBy ?? "").trim().toUpperCase();
  return by === "ONEPAY";
}

/** Hoàn tác chỉ trong cùng ngày xác nhận (giờ VN); OnePay thu hộ thì không hoàn tác. */
function canUnconfirm(r: ReceiptRec): boolean {
  if (!r.confirmedAt || isOnePayCollected(r)) return false;
  const t = Date.parse(r.confirmedAt);
  if (!Number.isFinite(t)) return false;
  const dayOf = (ms: number) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: VN_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ms));
  return dayOf(t) === dayOf(Date.now());
}

function payerLabel(r: ReceiptRec): string {
  return r.payerName || r.payer;
}

function StaffNameCell({
  staffKey,
  name,
  account,
}: {
  staffKey: string;
  name?: string;
  account: string;
}) {
  return (
    <div className="min-w-0">
      <StaffInfoPopover staffKey={staffKey} className="font-medium">
        {name || account}
      </StaffInfoPopover>
      {name ? <div className="text-[11px] text-muted-foreground">{account}</div> : null}
    </div>
  );
}

function ConfirmCell({
  receipt,
  canConfirm,
  busy,
  onConfirm,
  onUnconfirm,
}: {
  receipt: ReceiptRec;
  canConfirm: boolean;
  busy: boolean;
  onConfirm: () => void;
  onUnconfirm: () => void;
}) {
  const confirmed = !!receipt.confirmedAt;
  const undoOk = canUnconfirm(receipt);

  if (confirmed) {
    return (
      <div className="flex min-w-[140px] flex-col gap-2">
        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-emerald-800">
          <CheckCircle2 className="h-3 w-3 shrink-0 opacity-80" />
          Đã thu
        </span>
        {canConfirm && undoOk ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-fit gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            disabled={busy}
            onClick={onUnconfirm}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {busy ? "Đang hoàn tác…" : "Hoàn tác"}
          </Button>
        ) : canConfirm && isOnePayCollected(receipt) ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            Thu hộ OnePay — không hoàn tác
          </span>
        ) : canConfirm && !undoOk ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            Quá ngày — không hoàn tác
          </span>
        ) : null}
      </div>
    );
  }

  if (!canConfirm) {
    return (
      <span className="inline-flex items-center rounded-full border border-dashed border-slate-300 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        Chưa thu
      </span>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      className={cn(
        "h-9 min-w-[148px] gap-1.5 rounded-md bg-emerald-600 px-3 font-semibold text-white shadow-sm",
        "hover:bg-emerald-700",
        busy && "opacity-70",
      )}
      disabled={busy}
      onClick={onConfirm}
    >
      <CheckCircle2 className="h-4 w-4" />
      {busy ? "Đang xác nhận…" : "Xác nhận thu"}
    </Button>
  );
}

function Page() {
  const { session } = useAuth();
  const receipts = useStore((s) => s.receipts);
  const confirmReceipt = useStore((s) => s.confirmReceipt);
  const unconfirmReceipt = useStore((s) => s.unconfirmReceipt);
  const viewOfficeRaw = useStore((s) => s.viewOffice);
  const viewOffice = resolveViewOffice(session, viewOfficeRaw);
  const officeScope = assignedOfficeCode(viewOffice);
  const canConfirm = session?.role === "AD" || session?.role === "KT";
  const isAdmin = session?.role === "AD";
  const [cancelTarget, setCancelTarget] = useState<ReceiptRec | null>(null);

  const { code: searchCode } = Route.useSearch();
  const [code, setCode] = useState(searchCode ?? "");
  useEffect(() => {
    if (searchCode) setCode(searchCode);
  }, [searchCode]);
  const [staffCode, setStaffCode] = useState("");
  const [creator, setCreator] = useState("");
  const [dayFrom, setDayFrom] = useState("");
  const [dayTo, setDayTo] = useState("");
  const [status, setStatus] = useState<"" | "CONFIRMED" | "PENDING">("");
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReceiptRec | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ReceiptRec | null>(null);
  /** Bổ sung ảnh sau khi thu hộ/KT đã xác nhận (hoặc chưa có ảnh). */
  const [appendProofTarget, setAppendProofTarget] = useState<ReceiptRec | null>(null);
  /** Mở lại QR thanh toán sau khi đóng popup lúc tạo phiếu. */
  const [payQrCode, setPayQrCode] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number; title: string } | null>(
    null,
  );
  const [loadingProof, setLoadingProof] = useState<string | null>(null);
  const proofCache = useRef(new Map<string, string[]>());
  const openProof = async (code: string, known?: string) => {
    const show = (urls: string[]) =>
      setLightbox({ urls, index: 0, title: `Ảnh giao dịch · ${code}` });
    const cached = proofCache.current.get(code) ?? (known && !isApiEnabled() ? [known] : undefined);
    if (cached) return show(cached);
    setLoadingProof(code);
    try {
      const urls = (await fetchReceiptProofImages(code)).filter(isViewableImageUrl);
      if (!urls.length) return void toast.error("Phiếu thu chưa có ảnh giao dịch");
      proofCache.current.set(code, urls);
      show(urls);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Không tải được ảnh giao dịch");
    } finally {
      setLoadingProof(null);
    }
  };
  const busyRef = useRef<string | null>(null);
  const apiMode = isApiEnabled();

  const [debounced, setDebounced] = useState({
    code: searchCode ?? "",
    staffCode: "",
    creator: "",
  });
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced({ code, staffCode, creator }), 350);
    return () => window.clearTimeout(t);
  }, [code, staffCode, creator]);
  const serverFilterKey = JSON.stringify([officeScope, debounced, dayFrom, dayTo, status]);
  const server = useServerPagedRows<ReceiptRec, number>(
    "danh-sach-phieu-thu",
    serverFilterKey,
    async (page, size) => {
      const res = await listReceiptsPage({
        officeCode: officeScope || undefined,
        code: debounced.code,
        payer: debounced.staffCode,
        creator: debounced.creator,
        dayFrom: dayFrom || undefined,
        dayTo: dayTo || undefined,
        status: status || undefined,
        page,
        size,
      });
      return { rows: res.rows, total: res.total, meta: res.totalAmount };
    },
    apiMode,
  );
  useEffect(() => {
    if (server.error) toast.error(server.error);
  }, [server.error]);

  /** Store action xác nhận / hoàn tác tìm phiếu trong store — phiếu ở trang server có thể chưa có. */
  const ensureInStore = (r: ReceiptRec) =>
    useStore.setState((s) =>
      s.receipts.some((x) => x.code === r.code) ? s : { receipts: [r, ...s.receipts] },
    );

  const rows = useMemo(() => {
    const created = (r: ReceiptRec) => {
      const t = Date.parse(r.createdAt);
      return Number.isFinite(t) ? t : 0;
    };
    const [dayLo, dayHi] =
      dayFrom && dayTo && dayTo < dayFrom ? [dayTo, dayFrom] : [dayFrom, dayTo];
    return receipts
      .filter((r) => {
        if (officeScope) {
          const recOffice = canonicalOfficeCode(r.office) || (r.office ?? "").trim().toUpperCase();
          const scope = canonicalOfficeCode(officeScope) || officeScope.toUpperCase();
          if (!recOffice || recOffice !== scope) return false;
        }
        if (code && !r.code.toLowerCase().includes(code.trim().toLowerCase())) return false;
        if (
          staffCode &&
          !(r.payerCode ?? r.payer).toLowerCase().includes(staffCode.trim().toLowerCase())
        )
          return false;
        if (creator && !r.createdBy.toLowerCase().includes(creator.trim().toLowerCase()))
          return false;
        if (dayLo && receiptMoneyDay(r) < dayLo) return false;
        if (dayHi && receiptMoneyDay(r) > dayHi) return false;
        if (status === "CONFIRMED" && !r.confirmedAt) return false;
        if (status === "PENDING" && r.confirmedAt) return false;
        return true;
      })
      .sort((a, b) => created(b) - created(a) || b.code.localeCompare(a.code));
  }, [receipts, officeScope, code, staffCode, creator, dayFrom, dayTo, status]);

  const local = usePagedRows(rows, "danh-sach-phieu-thu");
  const pageRows = apiMode ? server.pageRows : local.pageRows;
  const pager = apiMode ? server.pager : local.pager;
  const rowCount = apiMode ? server.total : rows.length;
  const total = apiMode ? (server.meta ?? 0) : rows.reduce((a, r) => a + r.total, 0);

  const withStoreRow = (receiptCode: string) => {
    const r = pageRows.find((x) => x.code === receiptCode);
    if (r) ensureInStore(r);
  };

  const applyPaidOnList = (code: string, patch: Partial<ReceiptRec>) => {
    useStore.setState((s) => ({
      receipts: s.receipts.map((r) => (r.code === code ? { ...r, ...patch } : r)),
    }));
    if (apiMode) server.reload();
    setDetail((d) => (d?.code === code ? { ...d, ...patch } : d));
  };

  // OnePay IPN / xác nhận thu → SSE cập nhật danh sách ngay (không chờ F5).
  useEffect(() => {
    const onConfirmed = (ev: Event) => {
      const detail = (ev as CustomEvent<ReceiptConfirmedPayload>).detail;
      const code = detail?.receiptCode?.trim();
      if (!code) return;
      applyPaidOnList(code, {
        confirmedAt: detail.confirmedAt ?? new Date().toISOString(),
        confirmedBy: detail.confirmedBy ?? "ONEPAY",
        confirmNote: detail.confirmNote?.trim() || undefined,
        paidTransId:
          detail.paidTransId?.trim() || paidTransIdFromNote(detail.confirmNote) || undefined,
        // Thu hộ OnePay tự xác nhận không kèm ảnh — không đánh dấu đã có ảnh.
        hasConfirmProof: false,
      });
    };
    window.addEventListener(RECEIPT_CONFIRMED_EVENT, onConfirmed);
    return () => window.removeEventListener(RECEIPT_CONFIRMED_EVENT, onConfirmed);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload theo trang hiện tại
  }, [apiMode, server.reload]);

  const onPayQrPaid = (pay: ReceiptTransferQr) => {
    applyPaidOnList(pay.receiptCode, {
      confirmedAt: pay.confirmedAt ?? new Date().toISOString(),
      confirmedBy: "ONEPAY",
      confirmNote: pay.confirmNote?.trim() || undefined,
      paidTransId: pay.paidTransId?.trim() || paidTransIdFromNote(pay.confirmNote) || undefined,
      hasConfirmProof: false,
    });
  };

  const onConfirmWithProof = async (receiptCode: string, proofImage: string[], note: string) => {
    if (!canConfirm || busyRef.current) return false;
    busyRef.current = receiptCode;
    setBusyCode(receiptCode);
    try {
      withStoreRow(receiptCode);
      const res = await confirmReceipt(receiptCode, proofImage, note);
      if (res.ok) {
        toast.success(`Đã xác nhận thu ${receiptCode}`);
        server.reload();
        return true;
      }
      toast.error(res.error);
      return false;
    } finally {
      busyRef.current = null;
      setBusyCode(null);
    }
  };

  const onAppendProofs = async (receiptCode: string, proofImage: string[], note: string) => {
    if (!canConfirm || busyRef.current) return false;
    busyRef.current = receiptCode;
    setBusyCode(receiptCode);
    try {
      const updated = await appendReceiptProofs(receiptCode, proofImage, note);
      proofCache.current.delete(receiptCode);
      applyPaidOnList(receiptCode, {
        hasConfirmProof: true,
        confirmProofImage: updated.confirmProofImage,
        confirmNote: updated.confirmNote ?? undefined,
      });
      toast.success(`Đã bổ sung ảnh ${receiptCode}`);
      server.reload();
      return true;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Không bổ sung được ảnh");
      return false;
    } finally {
      busyRef.current = null;
      setBusyCode(null);
    }
  };

  const onUnconfirm = async (receiptCode: string) => {
    if (!canConfirm || busyRef.current) return;
    busyRef.current = receiptCode;
    setBusyCode(receiptCode);
    try {
      withStoreRow(receiptCode);
      const res = await unconfirmReceipt(receiptCode);
      if (res.ok) {
        toast.success(`Đã hoàn tác xác nhận ${receiptCode}`);
        server.reload();
      } else toast.error(res.error);
    } finally {
      busyRef.current = null;
      setBusyCode(null);
    }
  };

  const onCancelReceipt = async (receipt: ReceiptRec, reason: string) => {
    if (!isAdmin || busyRef.current) return false;
    busyRef.current = receipt.code;
    setBusyCode(receipt.code);
    try {
      await cancelReceipt(receipt.code, reason);
      useStore.setState((s) => ({ receipts: s.receipts.filter((x) => x.code !== receipt.code) }));
      toast.success(`Đã hủy phiếu thu ${receipt.code}`);
      server.reload();
      void syncOrdersByCodes(receipt.orderCodes).catch(() => undefined);
      return true;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Không hủy được phiếu thu");
      return false;
    } finally {
      busyRef.current = null;
      setBusyCode(null);
    }
  };

  const [exporting, setExporting] = useState(false);
  /** API: xuất toàn bộ phiếu khớp lọc (tải theo lô), không chỉ trang đang xem. */
  const loadAllForExport = async (): Promise<ReceiptRec[]> => {
    if (!apiMode) return rows;
    const all: ReceiptRec[] = [];
    const seen = new Set<string>();
    for (let page = 0; page < 2_000; page++) {
      const res = await listReceiptsPage({
        officeCode: officeScope || undefined,
        code: debounced.code,
        payer: debounced.staffCode,
        creator: debounced.creator,
        dayFrom: dayFrom || undefined,
        dayTo: dayTo || undefined,
        status: status || undefined,
        page,
        size: 500,
      });
      for (const r of res.rows) {
        const key = (r.code || "").trim().toUpperCase();
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        all.push(r);
      }
      if (res.rows.length === 0 || all.length >= res.total) break;
    }
    return all;
  };

  const exportExcel = async (format: ExportFormat = "csv") => {
    setExporting(true);
    let data: ReceiptRec[];
    try {
      data = await loadAllForExport();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Không tải được dữ liệu xuất");
      return;
    } finally {
      setExporting(false);
    }
    downloadExcel(
      `danh-sach-phieu-thu-${new Date().toISOString().slice(0, 10)}`,
      [
        "STT",
        "Mã phiếu thu",
        "Văn phòng",
        "CB điều phối (người lập)",
        "Người nộp tiền",
        "Mã NV nộp tiền",
        "Ngày thu tiền",
        "Thời gian lập phiếu",
        "Thời gian khách trả tiền",
        "Số đơn",
        "Mã đơn",
        "Tiền COD mã đơn",
        "Tổng tiền",
        "Nội dung chuyển khoản",
        "Mã giao dịch",
        "Ảnh chứng từ",
        "Đã xác nhận",
        "Người xác nhận",
        "Thời gian xác nhận",
        "Nội dung xác nhận",
      ],
      data.map((r, i) => [
        i + 1,
        r.code,
        r.office ? officeName(r.office) : "",
        r.createdByName ? `${r.createdByName} (${r.createdBy})` : r.createdBy,
        r.payerName ? `${r.payerName} (${r.payer})` : r.payer,
        r.payerCode || r.payer || "",
        fmtDayVn(receiptMoneyDay(r)),
        fmtDateTime(r.createdAt),
        r.customerPaidAt ? fmtDateTime(r.customerPaidAt) : "",
        r.orderCodes.length,
        r.orderCodes.join(", "),
        formatReceiptCodColumn(r),
        r.total,
        r.transferContent ?? "",
        r.paidTransId?.trim() || paidTransIdFromNote(r.confirmNote) || "",
        r.hasTransferProof || r.hasConfirmProof || r.confirmProofImage ? "Có" : "Không",
        r.confirmedAt ? "Có" : "Không",
        r.confirmedBy ?? "",
        r.confirmedAt ? fmtDateTime(r.confirmedAt) : "",
        r.confirmNote ?? "",
      ]),
      format,
    );
  };

  const scopeHint = officeScope
    ? `Theo văn phòng ${officeName(officeScope)} — chỉ phiếu thu của VP này.`
    : isViewAllOffices(viewOffice)
      ? "Đang xem toàn hệ thống — chọn một hoặc nhiều VP trên thanh điều hướng để lọc."
      : selectedViewOfficeCodes(viewOffice).length > 1
        ? `Đang xem ${selectedViewOfficeCodes(viewOffice).length} văn phòng — lọc theo VP đã chọn.`
        : "Chưa xác định văn phòng.";

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="title-row">
        <div>
          <h1 className="page-title">Danh sách phiếu thu</h1>
          <div className="lab muted">{scopeHint}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setCode("");
              setStaffCode("");
              setCreator("");
              setDayFrom("");
              setDayTo("");
              setStatus("");
            }}
          >
            Xoá lọc
          </button>
          <ExportFormatButton
            busy={exporting}
            disabled={rowCount === 0}
            onExport={(format) => void exportExcel(format)}
          />
        </div>
      </div>

      <section className="sum-row num">
        <div className="sum-lead">
          <div style={{ minWidth: 0 }}>
            <div className="rev-vp lab">
              <span className="ms fill" aria-hidden="true">
                account_balance_wallet
              </span>
              Tổng tiền
            </div>
            <div className="sum-hero">
              {formatVND(total).replace(/\s*₫?$/, "")} <span className="sum-unit">VNĐ</span>
            </div>
          </div>
          <svg className="rev-ill" viewBox="0 0 150 104" aria-hidden="true">
            <ellipse className="ill-soft" cx="75" cy="97" rx="68" ry="6" />
            <rect
              className="ill-mid"
              x="28"
              y="24"
              width="60"
              height="70"
              rx="5"
              transform="rotate(-8 58 59)"
            />
            <rect className="ill-main" x="44" y="14" width="62" height="80" rx="5" />
            <rect className="ill-paper" x="50" y="21" width="50" height="66" rx="3" />
            <rect className="ill-main" x="56" y="29" width="24" height="5" rx="2.5" />
            <rect className="ill-mid" x="56" y="41" width="38" height="5" rx="2.5" />
            <rect className="ill-mid" x="56" y="52" width="38" height="5" rx="2.5" />
            <rect className="ill-mid" x="56" y="63" width="38" height="5" rx="2.5" />
            <rect className="ill-box" x="88" y="62" width="50" height="30" rx="5" />
            <circle className="ill-paper" cx="113" cy="77" r="8" />
            <circle className="ill-box2" cx="113" cy="77" r="4" />
          </svg>
        </div>
        <div className="rev-tile card-tile">
          <span className="rev-ic" aria-hidden="true">
            <span className="ms fill">receipt_long</span>
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="small muted">Số phiếu thu</div>
            <div className="sum-val">{rowCount.toLocaleString("vi-VN")}</div>
          </div>
        </div>
      </section>

      <div className="filter-grid">
        <label className="field">
          <span className="l">Mã phiếu thu</span>
          <span className="box input-box">
            <input
              type="search"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="PT..."
            />
          </span>
        </label>
        <label className="field">
          <span className="l">Mã nhân viên</span>
          <span className="box input-box">
            <input
              type="search"
              value={staffCode}
              onChange={(e) => setStaffCode(e.target.value)}
              placeholder="Mã / tên NV nộp tiền"
            />
          </span>
        </label>
        <label className="field">
          <span className="l">CB điều phối</span>
          <span className="box input-box">
            <input
              type="search"
              value={creator}
              onChange={(e) => setCreator(e.target.value)}
              placeholder="Tài khoản lập phiếu"
            />
          </span>
        </label>
        <label className="field">
          <span className="l">Thu tiền từ ngày</span>
          <span className="box input-box">
            <input
              type="date"
              value={dayFrom}
              max={dayTo || undefined}
              onChange={(e) => setDayFrom(e.target.value)}
            />
          </span>
        </label>
        <label className="field">
          <span className="l">Đến ngày</span>
          <span className="box input-box">
            <input
              type="date"
              value={dayTo}
              min={dayFrom || undefined}
              onChange={(e) => setDayTo(e.target.value)}
            />
          </span>
        </label>
        <div className="field">
          <span className="l">Trạng thái thu</span>
          <SearchableSelect
            value={status || "all"}
            onValueChange={(v) => setStatus(v === "CONFIRMED" || v === "PENDING" ? v : "")}
            placeholder="Tất cả"
            options={[
              { value: "all", label: "Tất cả" },
              { value: "PENDING", label: "Chưa thu" },
              { value: "CONFIRMED", label: "Đã thu" },
            ]}
          />
        </div>
      </div>

      <section className="card stack">
        {rowCount === 0 ? (
          <EmptyState>
            {apiMode && server.loading ? "Đang tải…" : "Chưa có phiếu thu nào"}
          </EmptyState>
        ) : (
          <>
            <div className="scroller">
              <table className="tbl sticky-1" style={{ ["--tbl-min" as string]: "1380px" }}>
                <thead>
                  <tr>
                    <th>Mã phiếu thu</th>
                    <th>Văn phòng</th>
                    <th>CB điều phối</th>
                    <th>Người nộp tiền</th>
                    <th>Ngày thu</th>
                    <th>Lập phiếu</th>
                    <th className="r">Tổng tiền</th>
                    <th>Ảnh giao dịch</th>
                    <th>Trạng thái thu</th>
                    <th className="r">Đã thu</th>
                    <th>Mã giao dịch</th>
                    {isAdmin ? <th className="r">Thao tác</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => {
                    const proof = r.confirmProofImage?.trim();
                    return (
                      <tr key={r.code}>
                        <td>
                          <button type="button" className="code" onClick={() => setDetail(r)}>
                            {r.code}
                          </button>
                          <span className="sub">{r.orderCodes.length} đơn</span>
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {r.office ? officeName(r.office) : "—"}
                        </td>
                        <td>
                          <StaffNameCell
                            staffKey={r.createdBy}
                            name={r.createdByName}
                            account={r.createdBy}
                          />
                        </td>
                        <td>
                          <StaffNameCell
                            staffKey={r.payerCode || r.payer}
                            name={r.payerName}
                            account={r.payer}
                          />
                        </td>
                        <td style={{ whiteSpace: "nowrap" }} className="num">
                          {fmtDayVn(receiptMoneyDay(r))}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(r.createdAt)}</td>
                        <td className="r main">{formatVND(r.total)}</td>
                        <td>
                          <div className="act" style={{ justifyContent: "flex-start" }}>
                            {(proof && isViewableImageUrl(proof)) ||
                            (!proof && (r.hasConfirmProof || r.hasTransferProof)) ? (
                              <button
                                type="button"
                                className="text-act"
                                disabled={loadingProof === r.code}
                                onClick={() => void openProof(r.code, proof)}
                              >
                                {loadingProof === r.code ? "Đang tải…" : "Xem ảnh"}
                              </button>
                            ) : null}
                            {canConfirm ? (
                              <button
                                type="button"
                                className="text-act"
                                disabled={busyCode === r.code}
                                onClick={() => setAppendProofTarget(r)}
                              >
                                Thêm ảnh
                              </button>
                            ) : !proof && !r.hasConfirmProof && !r.hasTransferProof ? (
                              <span className="muted">—</span>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <ConfirmCell
                            receipt={r}
                            canConfirm={canConfirm}
                            busy={busyCode === r.code}
                            onConfirm={() => setConfirmTarget(r)}
                            onUnconfirm={() => void onUnconfirm(r.code)}
                          />
                          {!r.confirmedAt && isApiEnabled() ? (
                            <button
                              type="button"
                              className="text-act"
                              style={{ marginTop: 4 }}
                              disabled={busyCode === r.code}
                              onClick={() => setPayQrCode(r.code)}
                            >
                              QR thanh toán
                            </button>
                          ) : null}
                        </td>
                        <td className="r">
                          {r.confirmedAt ? (
                            <div className="min-w-[120px]">
                              <div className="main">{formatVND(r.total)}</div>
                              <div className="sub" style={{ whiteSpace: "nowrap" }}>
                                {r.confirmedBy ?? "—"}
                                <span style={{ margin: "0 4px", opacity: 0.5 }}>·</span>
                                {fmtDateTime(r.confirmedAt)}
                              </div>
                              {r.confirmNote ? (
                                <div
                                  className="sub"
                                  style={{
                                    marginTop: 4,
                                    maxWidth: 220,
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-word",
                                  }}
                                >
                                  {r.confirmNote}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          {(() => {
                            const txn =
                              r.paidTransId?.trim() || paidTransIdFromNote(r.confirmNote) || "";
                            return txn ? (
                              <span className="num" style={{ wordBreak: "break-all" }}>
                                {txn}
                              </span>
                            ) : (
                              <span className="muted">—</span>
                            );
                          })()}
                        </td>
                        {isAdmin ? (
                          <td>
                            <div className="act">
                              <button
                                type="button"
                                className="text-act danger"
                                disabled={busyCode === r.code}
                                onClick={() => setCancelTarget(r)}
                              >
                                Huỷ phiếu
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination pager={pager} />
          </>
        )}
      </section>

      <ReceiptOrdersDialog receipt={detail} onClose={() => setDetail(null)} />
      <ConfirmReceiptDialog
        receipt={confirmTarget}
        busy={busyCode === confirmTarget?.code}
        onClose={() => setConfirmTarget(null)}
        onSubmit={async (proof, note) => {
          if (!confirmTarget) return;
          const ok = await onConfirmWithProof(confirmTarget.code, proof, note);
          if (ok) setConfirmTarget(null);
        }}
      />
      <AppendProofDialog
        receipt={appendProofTarget}
        busy={busyCode === appendProofTarget?.code}
        onClose={() => setAppendProofTarget(null)}
        onSubmit={async (proof, note) => {
          if (!appendProofTarget) return;
          const ok = await onAppendProofs(appendProofTarget.code, proof, note);
          if (ok) setAppendProofTarget(null);
        }}
      />
      <CancelReceiptDialog
        receipt={cancelTarget}
        busy={busyCode === cancelTarget?.code}
        onClose={() => setCancelTarget(null)}
        onSubmit={async (reason) => {
          if (!cancelTarget) return;
          const ok = await onCancelReceipt(cancelTarget, reason);
          if (ok) setCancelTarget(null);
        }}
      />
      <ImageLightbox
        open={!!lightbox}
        onOpenChange={(o) => {
          if (!o) setLightbox(null);
        }}
        urls={lightbox?.urls ?? []}
        index={lightbox?.index ?? 0}
        title={lightbox?.title}
      />
      <ReceiptPayQrDialog
        receiptCode={payQrCode}
        open={Boolean(payQrCode)}
        onOpenChange={(v) => {
          if (!v) setPayQrCode(null);
        }}
        onPaid={onPayQrPaid}
      />
    </div>
  );
}

function CancelReceiptDialog({
  receipt,
  busy,
  onClose,
  onSubmit,
}: {
  receipt: ReceiptRec | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (receipt) setReason("");
  }, [receipt]);
  const trimmed = reason.trim();

  return (
    <Dialog
      open={!!receipt}
      onOpenChange={(o) => {
        if (!o && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Hủy phiếu thu {receipt?.code ?? ""}</DialogTitle>
          <DialogDescription>
            {receipt
              ? `${receipt.orderCodes.length} đơn · ${formatVND(receipt.total)} · người nộp ${payerLabel(receipt)}.`
              : ""}{" "}
            Tiền phiếu đã ghi vào đơn sẽ được gỡ, các đơn quay lại "Đơn cần nộp".
            {receipt?.confirmedAt ? " Phiếu này đã được xác nhận thu." : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label className="text-xs">Lý do hủy *</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Nhập lý do hủy phiếu"
            rows={3}
            maxLength={255}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Đóng
          </Button>
          <Button
            variant="destructive"
            disabled={busy || !trimmed}
            onClick={() => void onSubmit(trimmed)}
          >
            {busy ? "Đang hủy…" : "Hủy phiếu thu"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const MAX_CONFIRM_PROOFS = 5;

function AppendProofDialog({
  receipt,
  busy,
  onClose,
  onSubmit,
}: {
  receipt: ReceiptRec | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (proofImages: string[], note: string) => Promise<void>;
}) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!receipt) return;
    setPhotos([]);
    setNote("");
  }, [receipt?.code]);

  const proofs = photos.map((p) => p.trim()).filter(Boolean);

  return (
    <Dialog
      open={!!receipt}
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bổ sung ảnh {receipt?.code ?? ""}</DialogTitle>
          <DialogDescription>
            {receipt
              ? `${formatVND(receipt.total)} · ${payerLabel(receipt)} · Thêm ảnh giao dịch kể cả khi phiếu đã thu hộ/xác nhận.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Ảnh giao dịch</Label>
            <PodPhotoInput
              photos={photos}
              onChange={setPhotos}
              max={MAX_CONFIRM_PROOFS}
              allowGallery
              allowPaste
              disabled={busy}
              label="Thêm ảnh giao dịch"
            />
            {!proofs.length ? (
              <p className="text-[11px] text-amber-700">Chọn hoặc Ctrl+V dán ảnh để bổ sung.</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Ghi chú (tuỳ chọn)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: ảnh CK bổ sung sau thu hộ OnePay…"
              rows={2}
              maxLength={1000}
              disabled={busy}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Huỷ
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={busy || !proofs.length}
              onClick={() => void onSubmit(proofs, note.trim())}
            >
              {busy ? "Đang lưu…" : "Lưu ảnh"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmReceiptDialog({
  receipt,
  busy,
  onClose,
  onSubmit,
}: {
  receipt: ReceiptRec | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (proofImages: string[], note: string) => Promise<void>;
}) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [loadingStaffProof, setLoadingStaffProof] = useState(false);

  useEffect(() => {
    if (!receipt) return;
    setPhotos([]);
    setNote("");
    if (!receipt.hasTransferProof) return;
    let alive = true;
    setLoadingStaffProof(true);
    fetchReceiptProofImages(receipt.code)
      .then((imgs) => {
        if (alive && imgs.length) setPhotos(imgs.slice(0, MAX_CONFIRM_PROOFS));
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoadingStaffProof(false);
      });
    return () => {
      alive = false;
    };
  }, [receipt?.code]);

  const proofs = photos.map((p) => p.trim()).filter(Boolean);
  const proof = proofs[0] ?? "";

  return (
    <Dialog
      open={!!receipt}
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Xác nhận thu {receipt?.code ?? ""}</DialogTitle>
          <DialogDescription>
            {receipt
              ? `${formatVND(receipt.total)} · ${payerLabel(receipt)} · Bắt buộc thêm ảnh giao dịch (chuyển khoản / biên lai).`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Ảnh giao dịch</Label>
            {receipt?.hasTransferProof ? (
              <p className="text-[11px] text-emerald-700">
                {loadingStaffProof
                  ? "Đang tải ảnh chuyển khoản nhân viên gửi từ app…"
                  : "Đã điền sẵn ảnh chuyển khoản nhân viên gửi từ app — kiểm tra, thêm ảnh khác nếu cần rồi xác nhận."}
              </p>
            ) : null}
            <PodPhotoInput
              photos={photos}
              onChange={setPhotos}
              max={MAX_CONFIRM_PROOFS}
              allowGallery
              allowPaste
              disabled={busy}
              label="Thêm ảnh giao dịch"
            />
            {!proof ? (
              <p className="text-[11px] text-amber-700">
                Chưa có ảnh — chọn file, hoặc Ctrl+V dán ảnh để xác nhận thu.
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Nội dung</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: cấn trừ 50.000đ đơn PV0410..., thiếu tiền lẻ…"
              rows={3}
              maxLength={1000}
              disabled={busy}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Huỷ
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={busy || loadingStaffProof || !proof}
              onClick={() => void onSubmit(proofs, note.trim())}
            >
              {busy ? "Đang xác nhận…" : "Xác nhận thu"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function paidTransIdFromNote(note?: string | null): string {
  const m = note?.match(/\bGD\s+(\S+)/i);
  return m?.[1]?.trim() || "";
}

/** Cột xuất: `MÃĐƠN: sốCOD` (chỉ đơn có COD > 0). */
function formatReceiptCodColumn(r: ReceiptRec): string {
  return r.orderCodes
    .map((code) => {
      const cod = Number(r.lineCodAmounts?.[code] ?? 0);
      if (!(cod > 0)) return null;
      return `${code}: ${cod}`;
    })
    .filter(Boolean)
    .join("; ");
}

function ReceiptOrdersDialog({
  receipt,
  onClose,
}: {
  receipt: ReceiptRec | null;
  onClose: () => void;
}) {
  const orders = useStore((s) => s.orders);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!receipt) setQ("");
  }, [receipt]);
  const lines = useMemo(() => {
    if (!receipt) return [];
    return receipt.orderCodes.map((code) => {
      const o = orders.find((x) => x.code === code || x.draftCode === code);
      const amount = receipt.lineAmounts?.[code];
      const cod =
        receipt.lineCodAmounts?.[code] ??
        (o?.codAmount != null && Number.isFinite(Number(o.codAmount))
          ? Number(o.codAmount)
          : undefined);
      return { code, order: o, amount, cod };
    });
  }, [receipt, orders]);
  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return lines;
    return lines.filter(
      (l) =>
        l.code.toLowerCase().includes(k) ||
        (l.order?.receiverName || "").toLowerCase().includes(k) ||
        (l.order?.receiverPhone || "").includes(k) ||
        (l.order?.senderName || "").toLowerCase().includes(k) ||
        (l.order?.senderPhone || "").includes(k),
    );
  }, [lines, q]);

  return (
    <Dialog
      open={!!receipt}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Đơn trong phiếu {receipt?.code ?? ""}</DialogTitle>
          <DialogDescription>
            {receipt
              ? `${fmtDayVn(receiptMoneyDay(receipt))} · ${payerLabel(receipt)} · ${receipt.orderCodes.length} đơn · ${formatVND(receipt.total)}`
              : ""}
          </DialogDescription>
        </DialogHeader>
        {!receipt ? null : lines.length === 0 ? (
          <EmptyState>Phiếu này chưa có đơn</EmptyState>
        ) : (
          <div className="space-y-3">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm nhanh mã đơn, SĐT, tên gửi/nhận…"
              autoFocus
            />
            <div className="max-h-[55vh] overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="w-12 px-2 py-2">STT</th>
                    <th className="px-2 py-2">Mã đơn</th>
                    <th className="px-2 py-2">VP gửi → VP nhận</th>
                    <th className="px-2 py-2">Người nhận</th>
                    <th className="px-2 py-2 text-right">COD</th>
                    <th className="px-2 py-2 text-right">Tiền trên phiếu</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">
                        Không có đơn khớp «{q.trim()}»
                      </td>
                    </tr>
                  ) : (
                    filtered.map((l, i) => (
                      <tr key={l.code} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-2 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-2 py-2 font-medium">
                          <OrderCodeLink code={l.code} />
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                          {l.order ? <OfficeRouteCell order={l.order} /> : "—"}
                        </td>
                        <td className="px-2 py-2">
                          {l.order?.receiverName ?? "—"}
                          {l.order?.receiverPhone ? (
                            <div className="text-xs text-muted-foreground">
                              {l.order.receiverPhone}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                          {l.cod != null && l.cod > 0 ? formatVND(l.cod) : "—"}
                        </td>
                        <td className="px-2 py-2 text-right font-medium">
                          {l.amount != null ? formatVND(l.amount) : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
