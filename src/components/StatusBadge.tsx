import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ORDER_ISSUE_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  TRIP_STATUS_LABEL,
  isAutoException,
  openIssueType,
  type OrderIssueType,
  type OrderStatus,
  type TripStatus,
} from "@/lib/mock-data";
import { orderTabStatusLabel, orderTabStatusToneKey } from "@/lib/customer-track-status";

/** Soft badge = container sáng + chữ mực đậm (M3). Mỗi trạng thái / bước pipeline một màu riêng. */
const ORDER_STYLES: Record<OrderStatus, string> = {
  DRAFT: "border-transparent bg-[var(--low)] text-[var(--on-surface-variant)]",
  CONFIRMED: "border-transparent bg-[#dbeafe] text-[#1e40af]",
  WAITING: "border-transparent bg-[#fef3c7] text-[#92400e]",
  IN_TRANSIT: "border-transparent bg-[#e0e7ff] text-[#3730a3]",
  AT_DEST: "border-transparent bg-[#ccfbf1] text-[#115e59]",
  OUT_FOR_DELIVERY: "border-transparent bg-[#ffedd5] text-[#9a3412]",
  DELIVERED: "border-transparent bg-[var(--success-container)] text-[var(--on-success-container)]",
  FAILED_DELIVERY: "border-transparent bg-[var(--error-container)] text-[var(--on-error-container)]",
  CANCELLED: "border-transparent bg-[#e2e8f0] text-[#334155]",
  RETURNING: "border-transparent bg-[#f3e8ff] text-[#6b21a8]",
  RETURNED: "border-transparent bg-[#ecfccb] text-[#3f6212]",
};

/** Màu theo tab vận hành (nhập kho luân chuyển / chờ bàn giao) — không trùng nhau. */
const TAB_TONES: Record<string, string> = {
  PENDING_PICKUP: "border-transparent bg-[#f1f5f9] text-[#334155]",
  PENDING_RECEIVE: "border-transparent bg-[#e2e8f0] text-[#1e293b]",
  PICKING: "border-transparent bg-[#cffafe] text-[#155e75]",
  PICKED: "border-transparent bg-[#a5f3fc] text-[#0e7490]",
  WH_IN: "border-transparent bg-[#dbeafe] text-[#1e40af]",
  TRANSFER_PENDING: "border-transparent bg-[#fef3c7] text-[#92400e]",
  TRANSFERRING: "border-transparent bg-[#e0e7ff] text-[#3730a3]",
  DEST_WH_IN: "border-transparent bg-[#ccfbf1] text-[#115e59]",
  DELIVERING: "border-transparent bg-[#ffedd5] text-[#9a3412]",
  FAILED: "border-transparent bg-[var(--error-container)] text-[var(--on-error-container)]",
  REDELIVER_WAIT: "border-transparent bg-[#fce7f3] text-[#9d174d]",
  DELIVERED: "border-transparent bg-[var(--success-container)] text-[var(--on-success-container)]",
  RETURNED: "border-transparent bg-[#ecfccb] text-[#3f6212]",
  CANCELLED: "border-transparent bg-[#e2e8f0] text-[#334155]",
  RETURNING: "border-transparent bg-[#f3e8ff] text-[#6b21a8]",
  RETURN_WH_IN: "border-transparent bg-[#ede9fe] text-[#5b21b6]",
  RETURN_TRANSFER_PENDING: "border-transparent bg-[#fae8ff] text-[#86198f]",
  RETURN_TRANSFERRING: "border-transparent bg-[#f5d0fe] text-[#86198f]",
  RETURN_DEST_WH_IN: "border-transparent bg-[#fbcfe8] text-[#9d174d]",
  RETURN_DELIVERING: "border-transparent bg-[#f9a8d4] text-[#9d174d]",
  RETURN_FAILED: "border-transparent bg-[#fecdd3] text-[#9f1239]",
  RETURN_PICKED: "border-transparent bg-[#e9d5ff] text-[#6b21a8]",
  ISSUE_EXCEPTION: "border-transparent bg-[var(--warning-container)] text-[var(--on-warning-container)]",
  ISSUE_LOST: "border-transparent bg-[var(--error-container)] text-[var(--on-error-container)]",
  ISSUE_DAMAGED: "border-transparent bg-[#ffedd5] text-[#9a3412]",
  ISSUE_CANCEL_REQUEST: "border-transparent bg-[var(--low)] text-[var(--on-surface-variant)]",
};

const TRIP_STYLES: Record<TripStatus, string> = {
  CREATED: "border-transparent bg-[var(--low)] text-[var(--on-surface-variant)]",
  LOADING: "border-transparent bg-[#fef3c7] text-[#92400e]",
  DEPARTED: "border-transparent bg-[#e0e7ff] text-[#3730a3]",
  UNLOADING: "border-transparent bg-[#ccfbf1] text-[#115e59]",
  CLOSED: "border-transparent bg-[var(--success-container)] text-[var(--on-success-container)]",
  CANCELLED: "border-transparent bg-[var(--error-container)] text-[var(--on-error-container)]",
};

const ISSUE_STYLES: Record<OrderIssueType, string> = {
  EXCEPTION: TAB_TONES.ISSUE_EXCEPTION,
  LOST: TAB_TONES.ISSUE_LOST,
  DAMAGED: TAB_TONES.ISSUE_DAMAGED,
  CANCEL_REQUEST: TAB_TONES.ISSUE_CANCEL_REQUEST,
};

export function OrderStatusBadge({
  status,
  issue,
  order,
}: {
  status: OrderStatus;
  issue?: { type: OrderIssueType; resolvedAt?: string } | null;
  /** Có đơn → hiện tên tab vận hành + màu theo bước pipeline. */
  order?: Parameters<typeof orderTabStatusLabel>[0] & { updatedAt?: string; createdAt?: string };
}) {
  const tabLabel = order ? orderTabStatusLabel(order) : null;
  const openIssue = openIssueType(issue) ?? (order && isAutoException(order) ? "EXCEPTION" : null);
  if (openIssue) {
    return (
      <Badge
        variant="outline"
        className={cn("font-medium", ISSUE_STYLES[openIssue])}
        title={ORDER_STATUS_LABEL[status]}
      >
        {ORDER_ISSUE_STATUS_LABEL[openIssue]}
      </Badge>
    );
  }
  const tone = order
    ? (TAB_TONES[orderTabStatusToneKey(order)] ?? ORDER_STYLES[status])
    : ORDER_STYLES[status];
  return (
    <Badge variant="outline" className={cn("font-medium", tone)}>
      {tabLabel ?? ORDER_STATUS_LABEL[status]}
    </Badge>
  );
}

export function TripStatusBadge({ status }: { status: TripStatus }) {
  return (
    <Badge variant="outline" className={cn("font-medium", TRIP_STYLES[status])}>
      {TRIP_STATUS_LABEL[status]}
    </Badge>
  );
}
