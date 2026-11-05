import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatVND } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type TransferOrder = {
  transferPaidAt?: string;
  paidAmount?: number;
  onePayAwaitingTransfer?: boolean;
};

/** Khách đã chuyển khoản OnePay đủ cước — VP không thu tiền người gửi nữa. */
export function TransferPaidBadge({ order, className }: { order: TransferOrder; className?: string }) {
  if (order.transferPaidAt) {
    return (
      <Badge
        className={cn(
          "ml-1.5 border-transparent bg-emerald-100 font-normal text-emerald-700 hover:bg-emerald-100",
          className,
        )}
        title={`Khách đã chuyển khoản ${formatVND(order.paidAmount ?? 0)} lúc ${formatDateTime(order.transferPaidAt)} — không thu cước người gửi`}
      >
        Đã chuyển khoản
      </Badge>
    );
  }
  if (order.onePayAwaitingTransfer) {
    return (
      <Badge
        className={cn(
          "ml-1.5 border-transparent bg-amber-100 font-normal text-amber-800 hover:bg-amber-100",
          className,
        )}
        title="Đã tạo QR OnePay — đang chờ khách chuyển khoản; chưa ghi thu tiền mặt / chưa vào cần nộp như TM"
      >
        Chờ CK OnePay
      </Badge>
    );
  }
  return null;
}

/** Ghi chú cho điều phối khi nhập kho đơn đã chuyển khoản. */
export function transferPaidNotice(codes: string[]): string {
  return codes.length === 1
    ? `Đơn ${codes[0]} khách đã chuyển khoản — KHÔNG thu cước người gửi nữa`
    : `${codes.length} đơn khách đã chuyển khoản (${codes.join(", ")}) — KHÔNG thu cước người gửi nữa`;
}
