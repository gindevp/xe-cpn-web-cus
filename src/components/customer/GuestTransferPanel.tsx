import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { CheckCircle2, Copy, Download, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatVND } from "@/lib/mock-data";
import { guestCollect, type GuestCollect } from "@/lib/api/domain-api";
import type { OrderX } from "@/lib/store";

const PAY_POLL_MS = 8_000;

/** Số người gửi cần chuyển, ước lượng trước khi API trả — cùng luật app / BE (senderVaDue). */
export function expectedGuestDue(order: Pick<OrderX, "collectForm" | "fare" | "paidAmount" | "note">): number {
  const fare = Math.max(0, Number(order.fare ?? 0) - Number(order.paidAmount ?? 0));
  if (order.collectForm === "GUI_TRA") return fare;
  const m = /\[XVN_PREPAID:(\d+)\]/.exec(order.note ?? "");
  return m ? Math.min(fare, Number(m[1])) : 0;
}

/**
 * QR chuyển khoản OnePay sau khi khách tạo đơn trên web (đã / chưa đăng nhập) — như app.
 * Tự hỏi lại trạng thái để bắt lúc tiền về (chuyển từ web hay app đều được) rồi hiện popup.
 */
export function GuestTransferPanel({ order, initial }: { order: OrderX; initial?: GuestCollect | null }) {
  const expected = expectedGuestDue(order);
  const [collect, setCollect] = useState<GuestCollect | null>(initial ?? null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!initial?.qrData && !initial?.accountNumber && expected > 0);
  const [refreshing, setRefreshing] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [paidOpen, setPaidOpen] = useState(false);
  const [paid, setPaid] = useState(false);
  const watchedUnpaid = useRef(Number(initial?.amountDue ?? 0) > 0);
  const paidNotified = useRef(false);

  const apply = useCallback((c: GuestCollect) => {
    setCollect(c);
    setError("");
    const due = Number(c.amountDue ?? 0);
    if (due > 0) {
      watchedUnpaid.current = true;
      return;
    }
    if (watchedUnpaid.current && Number(c.paidAmount ?? 0) > 0 && !paidNotified.current) {
      paidNotified.current = true;
      setPaid(true);
      setPaidOpen(true);
    }
  }, []);

  const load = useCallback(
    (refresh = false) => guestCollect(order.code, order.senderPhone, refresh),
    [order.code, order.senderPhone],
  );

  useEffect(() => {
    if (expected <= 0) return;
    if (initial?.qrData || initial?.accountNumber) {
      apply(initial);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    load()
      .then((c) => alive && apply(c))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : "Không lấy được thông tin chuyển khoản"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [expected, initial, load, apply]);

  const collectOn = collect?.enabled !== false;
  const due = Number(collect?.amountDue ?? expected);
  const waiting = collectOn && (due > 0 || (watchedUnpaid.current && !paidNotified.current));

  useEffect(() => {
    if (!waiting) return;
    let alive = true;
    const tick = async () => {
      try {
        const c = await load();
        if (alive) apply(c);
      } catch {
        /* giữ bản cũ */
      }
    };
    const id = window.setInterval(() => void tick(), PAY_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [waiting, load, apply]);

  useEffect(() => {
    const data = collect?.qrData;
    if (!data) {
      setQrUrl(null);
      return;
    }
    let alive = true;
    void QRCode.toDataURL(data, { margin: 1, width: 220, errorCorrectionLevel: "M" })
      .then((url) => alive && setQrUrl(url))
      .catch(() => alive && setQrUrl(null));
    return () => {
      alive = false;
    };
  }, [collect?.qrData]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      apply(await load(true));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tạo được mã mới");
    } finally {
      setRefreshing(false);
    }
  };

  const copyAccount = () => {
    if (!collect?.accountNumber) return;
    void navigator.clipboard
      ?.writeText(collect.accountNumber)
      .then(() => toast.success("Đã copy số tài khoản"))
      .catch(() => undefined);
  };

  const saveQr = () => {
    if (!qrUrl) return;
    const a = document.createElement("a");
    a.href = qrUrl;
    a.download = `qr-${order.code}.png`;
    a.click();
  };

  const paidAmountLabel = formatVND(Number(collect?.lastPaidAmount ?? collect?.paidAmount ?? 0));
  const paidDialog = (
    <Dialog open={paidOpen} onOpenChange={() => undefined}>
      <DialogContent className="max-w-sm [&>button]:hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Đã nhận được tiền
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">OnePay đã ghi nhận chuyển khoản và xác nhận đã thu cước.</p>
          <div className="rounded-xl bg-emerald-50 px-3 py-2.5">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Số tiền</span>
              <span className="font-bold tabular-nums text-emerald-700">{paidAmountLabel}</span>
            </div>
            {collect?.paidTransId ? (
              <div className="mt-1.5 flex justify-between gap-2">
                <span className="text-muted-foreground">Mã GD</span>
                <span className="break-all font-mono text-xs font-semibold">{collect.paidTransId}</span>
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={() => setPaidOpen(false)}>
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (paid) {
    return (
      <>
        <div className="mt-4 space-y-1 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> Đã nhận được tiền · {paidAmountLabel}
          </div>
          {collect?.paidTransId ? (
            <p className="pl-6 text-xs font-medium text-emerald-800/80">
              Mã GD OnePay: <span className="font-mono">{collect.paidTransId}</span>
            </p>
          ) : null}
        </div>
        {paidDialog}
      </>
    );
  }

  const show =
    expected > 0 &&
    collectOn === true &&
    (loading || (collect?.enabled === true && collect.qrAllowed === true && due > 0) || Boolean(error));
  if (!show) return paidDialog;

  return (
    <>
      <div className="mt-4 space-y-3 rounded-2xl border border-[#E5EAF2] bg-white p-4 shadow-sm print:hidden">
        <div className="text-center">
          <div className="text-sm text-muted-foreground">Số tiền cần thanh toán</div>
          <div className="text-3xl font-extrabold text-orange-500">{formatVND(due)}</div>
        </div>
        {loading && !collect?.accountNumber ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : null}
        {collect?.accountNumber ? (
          <>
            <TransferField label="Ngân hàng" value={collect.bankName || "—"} />
            <TransferField label="Chủ tài khoản" value={collect.accountHolder || "—"} />
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <div className="text-xs text-muted-foreground">Số tài khoản</div>
                <div className="text-base font-extrabold tracking-wide">{collect.accountNumber}</div>
              </div>
              <button type="button" onClick={copyAccount} className="text-muted-foreground hover:text-foreground" title="Copy">
                <Copy className="h-4 w-4" />
              </button>
            </div>
            {qrUrl ? (
              <div className="flex justify-center py-2">
                <img src={qrUrl} alt={`QR thanh toán ${order.code}`} className="h-56 w-56" />
              </div>
            ) : null}
            <div className="flex justify-center">
              <Button type="button" variant="outline" size="sm" className="gap-2 rounded-full" disabled={!qrUrl} onClick={saveQr}>
                <Download className="h-4 w-4" /> Lưu mã QR
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Quét mã bằng app ngân hàng. Trang tự cập nhật khi nhận được tiền.
            </p>
          </>
        ) : null}
        {error ? <p className="text-center text-sm text-amber-700">{error}</p> : null}
        {collect?.canRefresh || error ? (
          <Button type="button" variant="outline" className="w-full gap-2" disabled={refreshing || loading} onClick={() => void refresh()}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {collect?.canRefresh ? "Làm mới mã" : "Thử lại"}
          </Button>
        ) : null}
      </div>
      {paidDialog}
    </>
  );
}

function TransferField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  );
}
