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

/**
 * Mỗi key một cặp bg/text riêng — không dùng chung giữa
 * nhập kho / chờ bàn giao / ngoại lệ / huỷ / hoàn.
 */
const TONE: Record<string, string> = {
  // Chờ bàn giao
  PENDING_PICKUP: "border-transparent bg-[#e8eef7] text-[#3b4a63]",
  PENDING_RECEIVE: "border-transparent bg-[#ebe6df] text-[#5c5346]",
  PICKING: "border-transparent bg-[#cffafe] text-[#155e75]",

  // Pipeline nhập kho
  PICKED: "border-transparent bg-[#bae6fd] text-[#0369a1]",
  WH_IN: "border-transparent bg-[#dbeafe] text-[#1e40af]",
  TRANSFER_PENDING: "border-transparent bg-[#fef3c7] text-[#92400e]",
  TRANSFERRING: "border-transparent bg-[#e0e7ff] text-[#3730a3]",
  DEST_WH_IN: "border-transparent bg-[#ccfbf1] text-[#0f766e]",
  DELIVERING: "border-transparent bg-[#ffedd5] text-[#9a3412]",
  FAILED: "border-transparent bg-[#fecaca] text-[#7f1d1d]",
  REDELIVER_WAIT: "border-transparent bg-[#fce7f3] text-[#9d174d]",

  // Terminal
  DELIVERED: "border-transparent bg-[#d1fae5] text-[#065f46]",
  RETURNED: "border-transparent bg-[#ecfccb] text-[#3f6212]",
  CANCELLED: "border-transparent bg-[#d4d4d8] text-[#27272a]",
  DRAFT: "border-transparent bg-[#f4f4f5] text-[#71717a]",

  // Hoàn (tím / fuchsia / hồng — khác pipeline thuận)
  RETURNING: "border-transparent bg-[#f3e8ff] text-[#6b21a8]",
  RETURN_PICKED: "border-transparent bg-[#ddd6fe] text-[#4c1d95]",
  RETURN_WH_IN: "border-transparent bg-[#ede9fe] text-[#5b21b6]",
  RETURN_TRANSFER_PENDING: "border-transparent bg-[#fae8ff] text-[#a21caf]",
  RETURN_TRANSFERRING: "border-transparent bg-[#f5d0fe] text-[#86198f]",
  RETURN_DEST_WH_IN: "border-transparent bg-[#fbcfe8] text-[#be185d]",
  RETURN_DELIVERING: "border-transparent bg-[#f9a8d4] text-[#831843]",
  RETURN_FAILED: "border-transparent bg-[#fda4af] text-[#881337]",

  // Ngoại lệ / huỷ — không trùng FAILED / DELIVERING / amber pipeline
  ISSUE_EXCEPTION: "border-transparent bg-[#fef08a] text-[#713f12]",
  ISSUE_LOST: "border-transparent bg-[#fecdd3] text-[#9f1239]",
  ISSUE_DAMAGED: "border-transparent bg-[#fdba74] text-[#7c2d12]",
  ISSUE_CANCEL_REQUEST: "border-transparent bg-[#a5b4fc] text-[#1e1b4b]",

  // Alias BE status
  CONFIRMED: "border-transparent bg-[#dbeafe] text-[#1e40af]",
  WAITING: "border-transparent bg-[#fef3c7] text-[#92400e]",
  IN_TRANSIT: "border-transparent bg-[#e0e7ff] text-[#3730a3]",
  AT_DEST: "border-transparent bg-[#ccfbf1] text-[#0f766e]",
  OUT_FOR_DELIVERY: "border-transparent bg-[#ffedd5] text-[#9a3412]",
  FAILED_DELIVERY: "border-transparent bg-[#fecaca] text-[#7f1d1d]",
};

const ORDER_STYLES: Record<OrderStatus, string> = {
  DRAFT: TONE.DRAFT,
  CONFIRMED: TONE.CONFIRMED,
  WAITING: TONE.WAITING,
  IN_TRANSIT: TONE.IN_TRANSIT,
  AT_DEST: TONE.AT_DEST,
  OUT_FOR_DELIVERY: TONE.OUT_FOR_DELIVERY,
  DELIVERED: TONE.DELIVERED,
  FAILED_DELIVERY: TONE.FAILED_DELIVERY,
  CANCELLED: TONE.CANCELLED,
  RETURNING: TONE.RETURNING,
  RETURNED: TONE.RETURNED,
};

const TRIP_STYLES: Record<TripStatus, string> = {
  CREATED: "border-transparent bg-[#f1f5f9] text-[#475569]",
  LOADING: "border-transparent bg-[#fde68a] text-[#854d0e]",
  DEPARTED: "border-transparent bg-[#c7d2fe] text-[#312e81]",
  UNLOADING: "border-transparent bg-[#99f6e4] text-[#134e4a]",
  CLOSED: "border-transparent bg-[#86efac] text-[#14532d]",
  CANCELLED: "border-transparent bg-[#fca5a5] text-[#7f1d1d]",
};

const ISSUE_STYLES: Record<OrderIssueType, string> = {
  EXCEPTION: TONE.ISSUE_EXCEPTION,
  LOST: TONE.ISSUE_LOST,
  DAMAGED: TONE.ISSUE_DAMAGED,
  CANCEL_REQUEST: TONE.ISSUE_CANCEL_REQUEST,
};

export function OrderStatusBadge({
  status,
  issue,
  order,
}: {
  status: OrderStatus;
  issue?: { type: OrderIssueType; resolvedAt?: string } | null;
  /** Có đơn → hiện tên tab vận hành + màu theo bước pipeline / ngoại lệ. */
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
  const tone = order ? (TONE[orderTabStatusToneKey(order)] ?? ORDER_STYLES[status]) : ORDER_STYLES[status];
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
