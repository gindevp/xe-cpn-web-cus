import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, Clock, Copy, Loader2, X } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fetchReceiptTransferQr, type ReceiptTransferQr } from "@/lib/api/finance-config-api";
import { formatVND } from "@/lib/mock-data";
import {
  RECEIPT_CONFIRMED_EVENT,
  type ReceiptConfirmedPayload,
} from "@/lib/use-realtime-sync";
import { cn } from "@/lib/utils";

type Props = {
  receiptCode: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Khi OnePay/KT xác nhận — để màn danh sách phiếu thu reload realtime. */
  onPaid?: (pay: ReceiptTransferQr) => void;
};

function remainLabel(expiresAt?: string | null): string {
  if (!expiresAt) return "—";
  const end = new Date(expiresAt).getTime();
  if (Number.isNaN(end)) return "—";
  const ms = Math.max(0, end - Date.now());
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function moneyLabel(n?: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${formatVND(n).replace(/\s*VNĐ$/i, "").trim()} VNĐ`;
}

/** Giống BE StaffDepositService.vietQrUrl — dự phòng khi API không trả qrUrl. */
function buildVietQrUrl(transfer: NonNullable<ReceiptTransferQr["transfer"]>, amount?: number | null) {
  const bin = transfer.bankBin?.trim();
  const accountNo = transfer.accountNo?.trim();
  if (!bin || !accountNo) return null;
  const params = new URLSearchParams();
  const amt = Math.round(Number(amount) || 0);
  if (amt > 0) params.set("amount", String(amt));
  if (transfer.content?.trim()) params.set("addInfo", transfer.content.trim());
  if (transfer.accountName?.trim()) params.set("accountName", transfer.accountName.trim());
  const q = params.toString();
  return `https://img.vietqr.io/image/${bin}-${accountNo}-qr_only.png${q ? `?${q}` : ""}`;
}

/** Sau tạo phiếu thu: hiện QR chuyển khoản; KT xác nhận thu → màn thành công. */
export function ReceiptPayQrDialog({ receiptCode, open, onOpenChange, onPaid }: Props) {
  const [pay, setPay] = useState<ReceiptTransferQr | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [copied, setCopied] = useState<"account" | "content" | "code" | null>(null);
  const [qrImg, setQrImg] = useState<string | null>(null);
  const paidNotified = useRef(false);

  const paid = Boolean(pay?.confirmedAt);
  const transfer = pay?.transfer;
  const onePay = Boolean(transfer?.qrData?.trim());

  useEffect(() => {
    if (!open || !receiptCode) {
      setPay(null);
      setLoadError(null);
      paidNotified.current = false;
      return;
    }
    paidNotified.current = false;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        const r = await fetchReceiptTransferQr(receiptCode);
        if (!cancelled) setPay(r);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Không tải được QR thu");
          toast.error(e instanceof Error ? e.message : "Không tải được QR thu");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, receiptCode]);

  // Đếm ngược + poll dự phòng (SSE receipt-confirmed là đường chính khi có callback).
  useEffect(() => {
    if (!open || !receiptCode || paid) return;
    const id = window.setInterval(() => {
      setTick((t) => t + 1);
      void fetchReceiptTransferQr(receiptCode)
        .then((r) => {
          setPay(r);
          setLoadError(null);
        })
        .catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(id);
  }, [open, receiptCode, paid]);

  // IPN / xác nhận thu → SSE đẩy xuống ngay.
  useEffect(() => {
    if (!open || !receiptCode) return;
    const onConfirmed = (ev: Event) => {
      const detail = (ev as CustomEvent<ReceiptConfirmedPayload>).detail;
      if (!detail?.receiptCode || detail.receiptCode !== receiptCode) return;
      void fetchReceiptTransferQr(receiptCode)
        .then((r) => {
          setPay(r);
          setLoadError(null);
        })
        .catch(() => {
          setPay((prev) =>
            prev
              ? {
                  ...prev,
                  confirmedAt: detail.confirmedAt ?? prev.confirmedAt ?? new Date().toISOString(),
                  confirmNote: detail.confirmNote ?? prev.confirmNote,
                  paidTransId: detail.paidTransId ?? prev.paidTransId,
                  amount: detail.amount != null ? Number(detail.amount) : prev.amount,
                }
              : {
                  receiptCode,
                  amount: Number(detail.amount ?? 0),
                  confirmedAt: detail.confirmedAt ?? new Date().toISOString(),
                  confirmNote: detail.confirmNote,
                  paidTransId: detail.paidTransId,
                },
          );
        });
    };
    window.addEventListener(RECEIPT_CONFIRMED_EVENT, onConfirmed);
    return () => window.removeEventListener(RECEIPT_CONFIRMED_EVENT, onConfirmed);
  }, [open, receiptCode]);

  useEffect(() => {
    if (!paid || !pay || paidNotified.current) return;
    paidNotified.current = true;
    onPaid?.(pay);
  }, [paid, pay, onPaid]);

  const vietQrFallback = useMemo(
    () => (transfer && !onePay ? buildVietQrUrl(transfer, pay?.amount) : null),
    [transfer, onePay, pay?.amount],
  );
  const remoteQr = transfer?.qrUrl?.trim() || vietQrFallback || null;

  useEffect(() => {
    const data = transfer?.qrData?.trim();
    // Không có EMV OnePay → vẽ QR mã phiếu / nội dung CK để luôn còn «mã để quét».
    const fallbackText = (transfer?.content || receiptCode || "").trim();
    const payload = data || (!remoteQr ? fallbackText : "");
    if (!payload) {
      setQrImg(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(payload, { margin: 1, width: 280, errorCorrectionLevel: "M" })
      .then((url) => {
        if (!cancelled) setQrImg(url);
      })
      .catch(() => {
        if (!cancelled) setQrImg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [transfer?.qrData, transfer?.content, receiptCode, remoteQr]);

  const remain = useMemo(() => remainLabel(pay?.expiresAt), [pay?.expiresAt, tick]);
  // OnePay: ưu tiên ảnh vẽ từ qrData; TK nộp: ảnh VietQR (API hoặc tự dựng).
  const qrSrc = onePay ? qrImg || remoteQr : remoteQr || qrImg;

  const copyText = async (value: string, kind: "account" | "content" | "code", okMsg: string) => {
    const v = value.trim();
    if (!v) return;
    try {
      await navigator.clipboard.writeText(kind === "account" ? v.replace(/\s+/g, "") : v);
      setCopied(kind);
      toast.success(okMsg);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Không chép được");
    }
  };

  const code = pay?.receiptCode ?? receiptCode ?? "";
  const content = transfer?.content?.trim() || code;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "gap-0 overflow-hidden border-0 p-0 shadow-xl sm:rounded-2xl",
          paid ? "max-w-md" : "max-w-2xl",
          "[&>button.absolute]:hidden",
        )}
      >
        <DialogTitle className="sr-only">
          {paid ? "Thanh toán thành công" : "Quét QR để thanh toán"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {paid ? `Phiếu thu ${receiptCode}` : `QR chuyển khoản phiếu ${receiptCode}`}
        </DialogDescription>

        {paid ? (
          <div className="relative px-6 pb-6 pt-8 text-center">
            <button
              type="button"
              className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-muted"
              onClick={() => onOpenChange(false)}
              aria-label="Đóng"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
              <CheckCircle2 className="h-9 w-9 text-emerald-600 dark:text-emerald-400" strokeWidth={2.25} />
            </div>
            <h2 className="text-xl font-bold text-foreground">Đã nhận được tiền</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              OnePay đã xác nhận đã thu phiếu{" "}
              <span className="font-semibold text-foreground">{code}</span>.
            </p>
            <div className="mt-5 space-y-2.5 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Số tiền</span>
                <span className="font-bold tabular-nums text-orange-500">{moneyLabel(pay?.amount)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Trạng thái</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Đã thu</span>
              </div>
              {pay?.paidTransId ? (
                <div className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-muted-foreground">Mã GD</span>
                  <span className="break-all text-right font-mono text-xs font-semibold">{pay.paidTransId}</span>
                </div>
              ) : null}
              {pay?.confirmNote ? (
                <div className="flex items-start justify-between gap-3 border-t border-border pt-2">
                  <span className="shrink-0 text-muted-foreground">Ghi chú</span>
                  <span className="max-w-[70%] whitespace-pre-wrap break-words text-right text-xs text-foreground">
                    {pay.confirmNote}
                  </span>
                </div>
              ) : null}
            </div>
            <Button className="mt-6 h-11 w-full text-base" onClick={() => onOpenChange(false)}>
              Hoàn tất
            </Button>
          </div>
        ) : (
          <div className="relative px-5 pb-5 pt-5 sm:px-6">
            <button
              type="button"
              className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-muted"
              onClick={() => onOpenChange(false)}
              aria-label="Đóng"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="pr-8">
              <h2 className="text-lg font-bold text-foreground sm:text-xl">Quét QR để thanh toán</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Phiếu thu{" "}
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-semibold text-foreground hover:text-primary"
                  onClick={() => void copyText(code, "code", "Đã chép mã phiếu")}
                  title="Chép mã phiếu"
                >
                  {code || "—"}
                  {copied === "code" ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </p>
            </div>

            {loading && !pay ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Đang tạo mã QR…
              </div>
            ) : (
              <>
                <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,240px)_1fr] sm:items-start">
                  <div className="mx-auto flex aspect-square w-full max-w-[240px] items-center justify-center rounded-xl border border-border bg-card p-3">
                    {qrSrc ? (
                      <img src={qrSrc} alt={`QR ${code}`} className="h-full w-full object-contain bg-white" />
                    ) : (
                      <p className="px-2 text-center text-xs text-amber-800 dark:text-amber-200">
                        {loadError
                          ? loadError
                          : onePay
                            ? "OnePay chưa trả mã QR. Thử lại hoặc kiểm tra cấu hình thu hộ."
                            : "Chưa cấu hình tài khoản nhận tiền nộp (Bảo trì → Nộp tiền). Bật thu hộ phiếu thu (Tích hợp) hoặc cấu hình TK để có QR ngân hàng."}
                      </p>
                    )}
                  </div>

                  <div className="min-w-0 space-y-4">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Số tiền chuyển khoản
                      </div>
                      <div className="mt-1 text-2xl font-bold tabular-nums text-orange-500 sm:text-3xl">
                        {moneyLabel(pay?.amount)}
                      </div>
                    </div>
                    <dl className="space-y-2.5 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <dt className="text-muted-foreground">Ngân hàng</dt>
                        <dd className="font-medium text-right">
                          {transfer?.bankName || transfer?.bankBin || "—"}
                        </dd>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <dt className="text-muted-foreground">Số tài khoản</dt>
                        <dd className="flex items-center gap-1.5 font-mono font-semibold">
                          {transfer?.accountNo || "—"}
                          {transfer?.accountNo ? (
                            <button
                              type="button"
                              className="rounded p-0.5 text-primary hover:bg-muted"
                              onClick={() =>
                                void copyText(transfer.accountNo || "", "account", "Đã chép số tài khoản")
                              }
                              title="Chép số tài khoản"
                            >
                              {copied === "account" ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          ) : null}
                        </dd>
                      </div>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <dt className="text-muted-foreground">Nội dung</dt>
                        <dd className="flex max-w-[75%] items-start justify-end gap-1.5 text-right font-mono font-semibold">
                          <span className="break-all">{content || "—"}</span>
                          {content ? (
                            <button
                              type="button"
                              className="mt-0.5 shrink-0 rounded p-0.5 text-primary hover:bg-muted"
                              onClick={() => void copyText(content, "content", "Đã chép nội dung CK")}
                              title="Chép nội dung"
                            >
                              {copied === "content" ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          ) : null}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-2 text-sm text-orange-600">
                  <Clock className="h-4 w-4 shrink-0" />
                  <span>
                    Mã QR có hiệu lực trong <span className="font-semibold tabular-nums">{remain}</span>
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {onePay
                    ? "Thu hộ OnePay: chuyển đúng số tiền — hệ thống tự xác nhận đã thu."
                    : transfer?.accountNo
                      ? "QR tài khoản nhận tiền nộp (Bảo trì). Sau khi CK, kế toán xác nhận thu trên Danh sách phiếu thu."
                      : "Đóng popup vẫn mở lại QR từ Danh sách phiếu thu → nút QR thanh toán."}
                </p>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
