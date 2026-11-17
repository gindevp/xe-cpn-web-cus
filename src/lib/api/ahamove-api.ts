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

/** Dòng phí Aha ước tính / sau book — hiện rõ voucher nếu có. */
export function formatAhamoveFeeLine(opts: {
  fee?: number | null;
  feeBefore?: number | null;
  promoCode?: string | null;
  voucherDiscount?: number | null;
  brand?: string;
}): string {
  const brand = opts.brand ?? "Ahamove";
  if (opts.fee == null || Number.isNaN(opts.fee)) return "";
  const feeStr = opts.fee.toLocaleString("vi-VN");
  const code = opts.promoCode?.trim();
  const disc =
    opts.voucherDiscount != null && opts.voucherDiscount > 0
      ? opts.voucherDiscount
      : opts.feeBefore != null && opts.feeBefore > opts.fee
        ? opts.feeBefore - opts.fee
        : 0;
  if (code && disc > 0) {
    const before =
      opts.feeBefore != null && opts.feeBefore > opts.fee
        ? opts.feeBefore.toLocaleString("vi-VN")
        : null;
    return before
      ? `Phí ${brand} ~${feeStr}đ (gốc ${before}đ · voucher ${code} −${disc.toLocaleString("vi-VN")}đ)`
      : `Phí ${brand} ~${feeStr}đ (voucher ${code} −${disc.toLocaleString("vi-VN")}đ)`;
  }
  if (code) return `Phí ${brand} ~${feeStr}đ (voucher ${code})`;
  return `Phí ${brand} ~${feeStr}đ`;
}
