import { officeName, orderReceiverOffice, type Order } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

/** Cột bảng: VP gửi + sub → VP nhận (đúng design M3). */
export function OfficeRouteCell({
  fromOffice,
  toOffice,
  order,
  className,
}: {
  fromOffice?: string | null;
  toOffice?: string | null;
  /** Nếu truyền order: VP nhận = finalToOffice || toOffice. */
  order?: Pick<Order, "fromOffice" | "toOffice" | "finalToOffice" | "address" | "homeDelivery"> & {
    hubOffice?: string;
  };
  className?: string;
}) {
  const from = officeName(order?.fromOffice ?? fromOffice ?? "") || "—";
  const to =
    officeName(order ? orderReceiverOffice(order) : (toOffice ?? "")) || "—";
  const door = order?.homeDelivery === false ? "" : order?.address?.trim() ?? "";
  const hub = order?.hubOffice?.trim() ?? "";
  return (
    <>
      <span className={className}>{from}</span>
      <span className="sub">→ {to}</span>
      {hub ? <TransitTag hubOffice={hub} /> : null}
      {door ? <span className="sub">{door}</span> : null}
    </>
  );
}

/** Tag đơn trung chuyển (tỉnh → tỉnh qua VP trung chuyển). */
export function TransitTag({ hubOffice, className }: { hubOffice: string; className?: string }) {
  const name = officeName(hubOffice) || hubOffice;
  return <span className={cn("sub", className)}>TC: {name}</span>;
}
