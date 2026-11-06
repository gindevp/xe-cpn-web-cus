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
import { orderTabStatusLabel } from "@/lib/customer-track-status";

/** Soft badge = container sáng + chữ mực đậm (M3). Tránh text-*-foreground (màu sáng) trên nền nhạt. */
const ORDER_STYLES: Record<OrderStatus, string> = {
  DRAFT: "border-transparent bg-[var(--low)] text-[var(--on-surface-variant)]",
  CONFIRMED: "border-transparent bg-[var(--primary-container)] text-[var(--on-primary-container)]",
  WAITING: "border-transparent bg-[var(--warning-container)] text-[var(--on-warning-container)]",
  IN_TRANSIT: "border-transparent bg-[var(--primary-container)] text-[var(--on-primary-container)]",
  AT_DEST: "border-transparent bg-[var(--secondary-container)] text-[var(--on-secondary-container)]",
  OUT_FOR_DELIVERY: "border-transparent bg-[var(--warning-container)] text-[var(--on-warning-container)]",
  DELIVERED: "border-transparent bg-[var(--success-container)] text-[var(--on-success-container)]",
  FAILED_DELIVERY: "border-transparent bg-[var(--error-container)] text-[var(--on-error-container)]",
  CANCELLED: "border-transparent bg-[var(--low)] text-[var(--on-surface-variant)]",
  RETURNING: "border-transparent bg-[var(--warning-container)] text-[var(--on-warning-container)]",
  RETURNED: "border-transparent bg-[var(--low)] text-[var(--on-surface-variant)]",
};

const TRIP_STYLES: Record<TripStatus, string> = {
  CREATED: "border-transparent bg-[var(--low)] text-[var(--on-surface-variant)]",
  LOADING: "border-transparent bg-[var(--warning-container)] text-[var(--on-warning-container)]",
  DEPARTED: "border-transparent bg-[var(--primary-container)] text-[var(--on-primary-container)]",
  UNLOADING: "border-transparent bg-[var(--secondary-container)] text-[var(--on-secondary-container)]",
  CLOSED: "border-transparent bg-[var(--success-container)] text-[var(--on-success-container)]",
  CANCELLED: "border-transparent bg-[var(--error-container)] text-[var(--on-error-container)]",
};

const ISSUE_STYLES: Record<OrderIssueType, string> = {
  EXCEPTION: "border-transparent bg-[var(--warning-container)] text-[var(--on-warning-container)]",
  LOST: "border-transparent bg-[var(--error-container)] text-[var(--on-error-container)]",
  DAMAGED: "border-transparent bg-[var(--error-container)] text-[var(--on-error-container)]",
  CANCEL_REQUEST: "border-transparent bg-[var(--low)] text-[var(--on-surface-variant)]",
};

export function OrderStatusBadge({
  status,
  issue,
  order,
}: {
  status: OrderStatus;
  issue?: { type: OrderIssueType; resolvedAt?: string } | null;
  /** Có đơn → hiện tên tab vận hành đơn đang ở thay vì trạng thái BE. */
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
  return (
    <Badge variant="outline" className={cn("font-medium", ORDER_STYLES[status])}>
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
