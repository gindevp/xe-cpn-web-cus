import type { ReactNode } from "react";
import { collectFormLabel, formatMoney, type Order } from "@/lib/mock-data";
import { orderGoodsFare, orderGoodsLabel, packageCount } from "@/lib/package-label";
import { cn } from "@/lib/utils";

/** Số cột phí của bảng đơn — cột COD riêng + cột cước phí. */
export const FEE_COL_COUNT = 2;

export function OrderFeeHeader({ className }: { className?: string }) {
  return (
    <>
      <th className={cn("r", className)}>COD</th>
      <th className={cn("r", className)}>Cước phí</th>
    </>
  );
}

/** Cột đơn hàng: số kiện và cân nặng. */
export function OrderCargoHeader({ className }: { className?: string }) {
  return <th className={className}>Đơn hàng</th>;
}

export function OrderCargoCell({
  order,
  count,
  className,
}: {
  order: Order;
  /** Tiến độ kiện (nhập kho). Không truyền thì hiện tổng số kiện + cân. */
  count?: ReactNode;
  className?: string;
}) {
  const goods = orderGoodsLabel(order);
  const weightLabel = `${(order.weightKg ?? 0).toFixed(1).replace(".", ",")} kg`;
  return (
    <td className={className}>
      {count != null ? (
        <>
          <div style={{ fontWeight: 500 }}>{count}</div>
          <span className="sub">{weightLabel}</span>
        </>
      ) : (
        <span style={{ fontWeight: 500 }}>
          {packageCount(order)} kiện · {weightLabel}
        </span>
      )}
      {goods && goods !== "—" ? <span className="sub">{goods}</span> : null}
    </td>
  );
}

/** Ô COD (tiền thu hộ) + ô cước phí; phí COD / phí tận nơi / KBGT chỉ hiện dòng khi có tiền. */
export function OrderFeeCell({
  order,
  className,
  children,
}: {
  order: Order;
  className?: string;
  children?: ReactNode;
}) {
  const cod = order.codAmount ?? 0;
  const codFee = order.codFee ?? 0;
  const pickup = order.pickupFee ?? 0;
  const delivery = order.deliveryFee ?? 0;
  const declared = order.declaredFee ?? 0;
  return (
    <>
      <td className={cn("r", className)}>
        {cod > 0 ? (
          <span className="main">{formatMoney(cod)}</span>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td className={cn("r", className)}>
        <span className="main">{formatMoney(orderGoodsFare(order))}</span>
        <span className="sub">{collectFormLabel(order.collectForm, order.onCredit)}</span>
        {codFee > 0 ? <span className="sub">Phí COD {formatMoney(codFee)}</span> : null}
        {pickup > 0 ? <span className="sub">Lấy TN {formatMoney(pickup)}</span> : null}
        {delivery > 0 ? <span className="sub">Giao TN {formatMoney(delivery)}</span> : null}
        {declared > 0 ? <span className="sub">KBGT {formatMoney(declared)}</span> : null}
        {children}
      </td>
    </>
  );
}
