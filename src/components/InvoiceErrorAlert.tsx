import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
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
import { formatDateTime } from "@/lib/mock-data";
import { apiRequest, isApiEnabled } from "@/lib/api/client";
import { INVOICE_ERROR_EVENT, type InvoiceErrorPayload } from "@/lib/use-realtime-sync";

const MAX_ITEMS = 20;
const MUTE_KEY_PREFIX = "cpn:invoice-alert-muted:";

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

/**
 * Popup khi xuất HĐ MISA hết 3 lần — giống Auto Call.
 * - SSE realtime khi admin đang mở web
 * - Tải lại lỗi gần đây khi mở app (bù sự kiện đã lỡ)
 * Đóng popup → không báo lại trong ngày (theo tài khoản / trình duyệt).
 */
export function InvoiceErrorAlert() {
  const navigate = useNavigate();
  const session = useAuth().session;
  const username = session?.username ?? "";
  const role = session?.role ?? "";
  const [items, setItems] = useState<InvoiceErrorPayload[]>([]);
  const [open, setOpen] = useState(false);

  const pushItem = useCallback((detail: InvoiceErrorPayload) => {
    if (!detail?.orderCode) return;
    setItems((prev) => {
      const rest = prev.filter((x) => x.orderCode !== detail.orderCode);
      return [detail, ...rest].slice(0, MAX_ITEMS);
    });
    setOpen(true);
  }, []);

  useEffect(() => {
    const onError = (e: Event) => {
      const detail = (e as CustomEvent<InvoiceErrorPayload>).detail;
      if (!detail?.orderCode || !username || mutedToday(username)) return;
      pushItem(detail);
    };
    window.addEventListener(INVOICE_ERROR_EVENT, onError);
    return () => window.removeEventListener(INVOICE_ERROR_EVENT, onError);
  }, [username, pushItem]);

  /** Admin (AD) mở web: nếu chưa mute hôm nay thì lấy lỗi FAILED gần đây. */
  useEffect(() => {
    if (!username || role !== "AD" || !isApiEnabled() || mutedToday(username)) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await apiRequest<InvoiceErrorPayload[]>("/api/invoices/alerts");
        if (cancelled || !rows?.length || mutedToday(username)) return;
        setItems((prev) => {
          const map = new Map<string, InvoiceErrorPayload>();
          for (const x of [...rows, ...prev]) {
            if (x?.orderCode && !map.has(x.orderCode)) map.set(x.orderCode, x);
          }
          return [...map.values()].slice(0, MAX_ITEMS);
        });
        setOpen(true);
      } catch {
        /* 403 = không phải AD/Tích hợp; mạng lỗi thì bỏ — SSE vẫn bắt realtime */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username, role]);

  const close = () => {
    if (username) muteToday(username);
    setOpen(false);
    setItems([]);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-destructive">Xuất hoá đơn MISA đang lỗi</DialogTitle>
          <DialogDescription>
            {items.length} đơn không xuất được hoá đơn điện tử (đã thử đủ 3 lần). Giống cảnh báo Auto
            Call — đóng thì hôm nay không báo lại.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
          {items.map((x) => (
            <li key={x.orderCode} className="rounded-md border p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono font-medium">{x.orderCode}</span>
                <span className="text-xs text-muted-foreground">{x.at ? formatDateTime(x.at) : ""}</span>
              </div>
              {x.message ? <div className="mt-1 text-xs">{x.message}</div> : null}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Đóng popup thì hôm nay sẽ không báo lại cho tài khoản này. Đơn lỗi vẫn xem ở Quản lý hoá đơn
          → lọc “Lỗi”.
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Đóng
          </Button>
          <Button
            type="button"
            onClick={() => {
              close();
              void navigate({ to: "/quan-ly-hoa-don" });
            }}
          >
            Xem hoá đơn
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
