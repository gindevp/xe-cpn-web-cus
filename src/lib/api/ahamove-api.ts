import { apiRequest } from "./client";

export type AhamovePickupKmResult = {
  serviceId?: string;
  distanceMeters?: number | null;
  distanceKm?: number | null;
  /** Phí Ahamove ước tính sau voucher (nếu có) — chi phí đối tác, không phải cước khách. */
  totalPrice?: number | null;
  /** Phí trước khi áp voucher (cùng payment lúc book). */
  totalPriceBeforePromo?: number | null;
  /** Mã voucher Aha được chọn (giảm nhiều nhất). */
  promoCode?: string | null;
  /** Số tiền giảm voucher (VND). */
  voucherDiscount?: number | null;
  /** TIER_2..TIER_4 khi phí đã cộng hàng cồng kềnh theo kích thước/cân nặng của đơn. */
  bulkyTier?: string | null;
  tipUnits?: number | null;
  services?: Array<{ id?: string; _id?: string; name?: string }>;
};

export async function estimatePickupKm(body: {
  officeLat: number;
  officeLng: number;
  officeAddress?: string;
  /** Bỏ trống → Ahamove ước tính theo {@link pinAddress}. */
  pinLat?: number;
  pinLng?: number;
  pinAddress?: string;
  /** Có mã đơn thì ước tính kèm kích thước và cân nặng của đơn. */
  orderCode?: string;
  /** "" = tiêu chuẩn. TIER_2/3/4 = phụ phí NV chọn. Bỏ trống field = tự xét theo kiện. */
  bulkyTier?: string;
  /** Số suất tip, 0–6. Mỗi suất 5.000đ, cộng vào phí đối tác. */
  tipUnits?: number;
}): Promise<AhamovePickupKmResult> {
  return apiRequest<AhamovePickupKmResult>("/api/ahamove/estimate-pickup-km", {
    method: "POST",
    body,
  });
}

export async function estimateGrab(body: {
  officeLat: number;
  officeLng: number;
  officeAddress?: string;
  pinLat?: number;
  pinLng?: number;
  pinAddress?: string;
  orderCode?: string;
  bulkyTier?: string;
}): Promise<AhamovePickupKmResult> {
  return apiRequest<AhamovePickupKmResult>("/api/grab/estimate", {
    method: "POST",
    body,
  });
}

/** Chuẩn hoá phí trước / sau / mã từ estimate (Aha đôi khi giữ total_price = gốc + voucher_discount riêng). */
export function resolveAhamoveFeeParts(opts: {
  fee?: number | null;
  feeBefore?: number | null;
  promoCode?: string | null;
  voucherDiscount?: number | null;
}): {
  before: number | null;
  after: number | null;
  code: string | null;
  discount: number;
} {
  const code = opts.promoCode?.trim() || null;
  const rawAfter = opts.fee != null && !Number.isNaN(opts.fee) ? opts.fee : null;
  const rawBefore =
    opts.feeBefore != null && !Number.isNaN(opts.feeBefore) ? opts.feeBefore : null;
  let discount =
    opts.voucherDiscount != null && opts.voucherDiscount > 0
      ? Math.round(opts.voucherDiscount)
      : rawBefore != null && rawAfter != null && rawBefore > rawAfter
        ? Math.round(rawBefore - rawAfter)
        : 0;
  let before = rawBefore ?? rawAfter;
  let after = rawAfter;
  // total_price chưa trừ voucher nhưng có voucher_discount → tự tính phí sau.
  if (code && discount > 0 && before != null && (after == null || after >= before)) {
    after = Math.max(0, Math.round(before - discount));
  }
  if (before != null && after != null && before > after && discount <= 0) {
    discount = Math.round(before - after);
  }
  return { before, after, code, discount };
}

/** Dòng phí Aha ước tính / sau book — hiện rõ voucher nếu có. */
export function formatAhamoveFeeLine(opts: {
  fee?: number | null;
  feeBefore?: number | null;
  promoCode?: string | null;
  voucherDiscount?: number | null;
  brand?: string;
}): string {
  const brand = opts.brand ?? "Ahamove";
  const { before, after, code, discount } = resolveAhamoveFeeParts(opts);
  if (after == null) return "";
  const feeStr = after.toLocaleString("vi-VN");
  if (code && discount > 0 && before != null && before > after) {
    return `Phí ${brand} ~${feeStr}đ (gốc ${before.toLocaleString("vi-VN")}đ · voucher ${code} −${discount.toLocaleString("vi-VN")}đ)`;
  }
  if (code && discount > 0) {
    return `Phí ${brand} ~${feeStr}đ (voucher ${code} −${discount.toLocaleString("vi-VN")}đ)`;
  }
  if (code) return `Phí ${brand} ~${feeStr}đ (voucher ${code})`;
  return `Phí ${brand} ~${feeStr}đ`;
}
