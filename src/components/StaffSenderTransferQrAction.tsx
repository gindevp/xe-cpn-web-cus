import { useState } from "react";
import { QrCode } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { OrderTransferQrDialog } from "@/components/OrderTransferQrDialog";
import { isApiEnabled } from "@/lib/api/client";
import { refreshOrdersNow } from "@/lib/use-orders-poll";
import type { OrderX } from "@/lib/store";

/**
 * Đơn người gửi trả còn nợ cước thực (paidAmount), chưa CK OnePay — tạo / tạo lại VA.
 * Dùng fare − paidAmount (không dùng orderDueAmount: nhập kho gửi coi đã thu nghiệp vụ nhưng vẫn cần QR).
 */
export function canStaffSenderTransferQr(o: Pick<
  OrderX,
  "collectForm" | "onCredit" | "transferPaidAt" | "status" | "fare" | "paidAmount"
> | null | undefined): boolean {
  if (!o || !isApiEnabled()) return false;
  if (o.collectForm !== "GUI_TRA" || o.onCredit) return false;
  if (o.transferPaidAt) return false;
  if (["CANCELLED", "DELIVERED", "RETURNED"].includes(o.status)) return false;
  return Math.max(0, (o.fare ?? 0) - (o.paidAmount ?? 0)) > 0;
}

type Props = {
  order: OrderX;
  /** `menu` = mục trong RowActionsMenu; `button` = nút riêng trên hàng. */
  variant?: "menu" | "button";
  onPaid?: () => void;
};

/** Tác vụ tạo / tạo lại QR CK OnePay — mọi đơn GUI_TRA còn nợ (không cần từng tích checkbox lúc tạo). */
export function StaffSenderTransferQrAction({ order, variant = "menu", onPaid }: Props) {
  const [open, setOpen] = useState(false);
  if (!canStaffSenderTransferQr(order)) return null;

  const openQr = () => setOpen(true);

  return (
    <>
      {variant === "button" ? (
        <Button type="button" size="sm" variant="ghost" className="gap-1" onClick={openQr}>
          <QrCode className="h-3.5 w-3.5" /> QR CK
        </Button>
      ) : (
        <DropdownMenuItem onClick={openQr}>
          <QrCode className="mr-2 h-4 w-4" /> Tạo QR chuyển khoản
        </DropdownMenuItem>
      )}
      <OrderTransferQrDialog
        open={open}
        orderCode={order.code}
        onOpenChange={setOpen}
        onPaid={() => {
          void refreshOrdersNow().catch(() => undefined);
          onPaid?.();
        }}
      />
    </>
  );
}
