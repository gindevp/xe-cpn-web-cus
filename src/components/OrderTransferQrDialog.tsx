import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { CheckCircle2, Copy, Download, Loader2, QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatVND } from "@/lib/mock-data";
import {
  getOrder,
  staffOrderCollect,
  staffOrderCollectRefresh,
  type GuestCollect,
} from "@/lib/api/domain-api";
import { useStore } from "@/lib/store";

const PAY_POLL_MS = 5_000;

type Props = {
  open: boolean;
  orderCode: string | null;
  /** Collect từ lúc tạo đơn — nếu có thì khỏi gọi API lần đầu. */
  initial?: GuestCollect | null;
  onOpenChange: (open: boolean) => void;
  /** Sau khi OnePay báo đã thu — đơn đã sync paidAmount / transferPaidAt. */
  onPaid?: (code: string) => void;
};

/**
 * Popup QR chuyển khoản OnePay cho điều phối (tạo đơn / tác vụ đơn người gửi trả).
 * Tắt popup không đóng VA — giữ đến hết hạn; mở lại hiện lại cùng mã; hết hạn mới tạo mới.
 */
export function OrderTransferQrDialog({ open, orderCode, initial, onOpenChange, onPaid }: Props) {
  const [collect, setCollect] = useState<GuestCollect | null>(initial ?? null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const watchedUnpaid = useRef(false);
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
      toast.success("Đã nhận được tiền chuyển khoản");
    }
  }, []);

  const load = useCallback(
    async (refresh = false) => {
      if (!orderCode) throw new Error("Thiếu mã đơn");
      return refresh ? staffOrderCollectRefresh(orderCode) : staffOrderCollect(orderCode);
    },
    [orderCode],
  );

  useEffect(() => {
    if (!open || !orderCode) return;
    paidNotified.current = false;
    setPaid(false);
    setError("");
    if (initial?.qrData || initial?.accountNumber) {
      apply(initial);
      watchedUnpaid.current = Number(initial.amountDue ?? 0) > 0;
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setCollect(null);
    const boot = async () => {
      try {
        let c = await load(false);
        // Invoice cũ đã đóng: BE cũ trả canRefresh mà thiếu STK — gọi refresh để tạo VA.
        if (alive && c.canRefresh && !c.accountNumber && Number(c.amountDue ?? 0) > 0) {
          c = await load(true);
        }
        if (alive) apply(c);
      } catch (e: unknown) {
        if (alive) setError(e instanceof Error ? e.message : "Không lấy được thông tin chuyển khoản");
      } finally {
        if (alive) setLoading(false);
      }
    };
    void boot();
    return () => {
      alive = false;
    };
  }, [open, orderCode, initial, load, apply]);

  const collectOn = collect?.enabled !== false;
  const due = Number(collect?.amountDue ?? 0);
  const waiting = open && collectOn && (due > 0 || (watchedUnpaid.current && !paidNotified.current));

  useEffect(() => {
    if (!waiting || !orderCode) return;
    let alive = true;
    const tick = async () => {
      try {
        const c = await load();
        if (!alive) return;
        apply(c);
        if (Number(c.amountDue ?? 0) <= 0 && Number(c.paidAmount ?? 0) > 0 && !paidNotified.current) {
          /* apply đã set paid */
        }
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
  }, [waiting, orderCode, load, apply]);

  useEffect(() => {
    if (!paid || !orderCode || !paidNotified.current) return;
    let alive = true;
    void getOrder(orderCode)
      .then((o) => {
        if (!alive) return;
        useStore.setState((st) => ({
          orders: [o, ...st.orders.filter((x) => x.code !== o.code)],
        }));
        onPaid?.(orderCode);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [paid, orderCode, onPaid]);

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
    if (!orderCode) return;
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
    if (!qrUrl || !orderCode) return;
    const a = document.createElement("a");
    a.href = qrUrl;
    a.download = `qr-${orderCode}.png`;
    a.click();
  };

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
  };

  const paidAmountLabel = formatVND(Number(collect?.lastPaidAmount ?? collect?.paidAmount ?? 0));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {paid ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Đã nhận được tiền
              </>
            ) : (
              <>
                <QrCode className="h-5 w-5 text-primary" /> Chuyển khoản · {orderCode}
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {paid ? (
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              OnePay đã ghi nhận chuyển khoản. Đơn được gắn đã thu — tiền cần nộp điều phối đã trừ khoản OnePay.
            </p>
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
        ) : (
          <div className="space-y-3">
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Số tiền cần chuyển</div>
              <div className="text-3xl font-extrabold text-orange-500">{formatVND(due || Number(initial?.amountDue ?? 0))}</div>
            </div>
            {loading && !collect?.accountNumber ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : null}
            {collect?.accountNumber ? (
              <>
                <Field label="Ngân hàng" value={collect.bankName || "—"} />
                <Field label="Chủ tài khoản" value={collect.accountHolder || "—"} />
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
                  <div className="flex justify-center py-1">
                    <img src={qrUrl} alt={`QR ${orderCode}`} className="h-52 w-52" />
                  </div>
                ) : null}
                <div className="flex justify-center gap-2">
                  <Button type="button" variant="outline" size="sm" className="gap-2" disabled={!qrUrl} onClick={saveQr}>
                    <Download className="h-4 w-4" /> Lưu QR
                  </Button>
                  {collect.canRefresh || error ? (
                    <Button type="button" variant="outline" size="sm" className="gap-2" disabled={refreshing} onClick={() => void refresh()}>
                      {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Làm mới
                    </Button>
                  ) : null}
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  Đưa khách quét QR. Popup tự cập nhật khi nhận tiền. Tắt popup vẫn giữ VA đến hết hạn —
                  mở lại hiện cùng mã.
                </p>
              </>
            ) : null}
            {error ? <p className="text-center text-sm text-amber-700">{error}</p> : null}
            {!loading && !collect?.accountNumber && !error && collect?.enabled === false ? (
              <p className="text-center text-sm text-muted-foreground">Thu hộ OnePay đang tắt — bật cấu hình rồi thử lại.</p>
            ) : null}
            {!loading && !collect?.accountNumber && !error && collect?.canRefresh ? (
              <Button type="button" variant="outline" className="w-full gap-2" disabled={refreshing} onClick={() => void refresh()}>
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Tạo mã chuyển khoản
              </Button>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant={paid ? "default" : "outline"} onClick={() => handleOpenChange(false)}>
            {paid ? "OK" : "Đóng"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  );
}
