import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { formatDateTime, formatVND } from "@/lib/mock-data";
import { ONEPAY_ERROR_EVENT, type OnePayErrorPayload } from "@/lib/use-realtime-sync";

const MAX_ITEMS = 20;
const MUTE_KEY_PREFIX = "cpn:onepay-alert-muted:";

function todayVn() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

function mutedToday(username: string) {
  try {
    return localStorage.getItem(MUTE_KEY_PREFIX + username) === todayVn();
  } catch {
    return false;
  }
}

function muteToday(username: string) {
  try {
    localStorage.setItem(MUTE_KEY_PREFIX + username, todayVn());
  } catch {
    /* trình duyệt chặn localStorage — popup sẽ hiện lại, chấp nhận được */
  }
}

function itemKey(x: OnePayErrorPayload) {
  return `${x.kind}:${x.code ?? ""}:${x.orderCode ?? x.receiptCode ?? x.reference ?? x.transId ?? ""}`;
}

function kindLabel(kind?: string | null) {
  if (kind === "ipn") return "IPN / nhận tiền";
  if (kind === "receipt") return "Xác nhận phiếu thu";
  return "API tạo VA / hoá đơn";
}

/**
 * Popup khi tích hợp thu hộ OnePay lỗi — giống Auto Call.
 * Admin đóng → không báo lại trong ngày (theo tài khoản / trình duyệt).
 */
export function OnePayErrorAlert() {
  const navigate = useNavigate();
  const username = useAuth().session?.username ?? "";
  const [items, setItems] = useState<OnePayErrorPayload[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onError = (e: Event) => {
      const detail = (e as CustomEvent<OnePayErrorPayload>).detail;
      if (!detail || !username || mutedToday(username)) return;
      setItems((prev) => {
        const key = itemKey(detail);
        const rest = prev.filter((x) => itemKey(x) !== key);
        return [detail, ...rest].slice(0, MAX_ITEMS);
      });
      setOpen(true);
    };
    window.addEventListener(ONEPAY_ERROR_EVENT, onError);
    return () => window.removeEventListener(ONEPAY_ERROR_EVENT, onError);
  }, [username]);

  const close = () => {
    if (username) muteToday(username);
    setOpen(false);
    setItems([]);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-destructive">Thu hộ OnePay đang có lỗi</DialogTitle>
          <DialogDescription>
            {items.length} sự kiện lỗi tích hợp thu hộ. Kiểm tra Partner ID / key / URL IPN trong Tích
            hợp → Thu hộ, hoặc đối soát giao dịch chưa khớp hoá đơn.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
          {items.map((x, i) => (
            <li key={`${itemKey(x)}-${i}`} className="rounded-md border p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {kindLabel(x.kind)}
                  {x.code ? ` · ${x.code}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">{x.at ? formatDateTime(x.at) : ""}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {x.orderCode ? <span className="font-mono">{x.orderCode}</span> : null}
                {x.receiptCode ? (
                  <span className="font-mono">
                    {x.orderCode ? " · " : ""}
                    {x.receiptCode}
                  </span>
                ) : null}
                {x.transId ? (
                  <span className="font-mono">
                    {x.orderCode || x.receiptCode ? " · " : ""}
                    GD {x.transId}
                  </span>
                ) : null}
                {x.amount != null ? (
                  <span>
                    {(x.orderCode || x.receiptCode || x.transId) ? " · " : ""}
                    {formatVND(Number(x.amount) || 0)}
                  </span>
                ) : null}
              </div>
              {x.message ? <div className="mt-1 text-xs">{x.message}</div> : null}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Đóng popup thì hôm nay sẽ không báo lại — nhật ký / hoá đơn OnePay vẫn xem được ở Tích hợp →
          Thu hộ.
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Đóng
          </Button>
          <Button
            type="button"
            onClick={() => {
              close();
              void navigate({ to: "/tich-hop", search: { tab: "thu-ho" } });
            }}
          >
            Xem Thu hộ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
