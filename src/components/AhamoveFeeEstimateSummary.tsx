import type { ReactNode } from "react";
import { resolveAhamoveFeeParts } from "@/lib/api/ahamove-api";

/** Khối ước tính phí Aha: KM + phí trước/sau mã (nếu có voucher). */
export function AhamoveFeeEstimateSummary({
  km,
  fee,
  feeBefore,
  promoCode,
  voucherDiscount,
  brand = "Ahamove",
  hint,
  extra,
}: {
  km?: number | null;
  fee?: number | null;
  feeBefore?: number | null;
  promoCode?: string | null;
  voucherDiscount?: number | null;
  brand?: string;
  /** Ví dụ "(theo địa chỉ)". */
  hint?: string | null;
  extra?: ReactNode;
}) {
  const { before, after, code, discount } = resolveAhamoveFeeParts({
    fee,
    feeBefore,
    promoCode,
    voucherDiscount,
  });
  const hasPromo = Boolean(code && discount > 0 && before != null && after != null && before > after);

  return (
    <div className="space-y-1">
      {km != null && !Number.isNaN(km) ? (
        <div>
          Khoảng cách: <strong>{km.toFixed(2)} km</strong>
          {hint ? <span className="ml-2 text-xs text-muted-foreground">{hint}</span> : null}
        </div>
      ) : null}
      {hasPromo ? (
        <>
          <div className="text-muted-foreground">
            Phí trước mã: <span className="line-through">{before!.toLocaleString("vi-VN")}đ</span>
          </div>
          <div>
            Mã giảm: <strong className="text-emerald-700">{code}</strong>
            <span className="text-muted-foreground"> (−{discount.toLocaleString("vi-VN")}đ)</span>
          </div>
          <div>
            Phí sau mã: <strong>{after!.toLocaleString("vi-VN")}đ</strong>
            <span className="ml-1 text-xs text-muted-foreground">({brand})</span>
          </div>
        </>
      ) : after != null ? (
        <div>
          Phí {brand} ~<strong>{after.toLocaleString("vi-VN")}đ</strong>
          {code ? (
            <span className="ml-1 text-xs text-muted-foreground">(voucher {code})</span>
          ) : null}
        </div>
      ) : null}
      {extra}
    </div>
  );
}
