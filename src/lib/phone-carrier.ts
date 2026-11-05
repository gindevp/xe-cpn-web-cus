/** Nhà mạng gốc theo đầu số SĐT VN 10 số. Không tra cứu chuyển mạng giữ số. */
export type PhoneCarrierCode =
  | "VIETTEL"
  | "VINAPHONE"
  | "MOBIFONE"
  | "VIETNAMOBILE"
  | "GMOBILE"
  | "ITEL"
  | "REDDI"
  | "KHAC";

const LABEL: Record<PhoneCarrierCode, string> = {
  VIETTEL: "Viettel",
  VINAPHONE: "Vinaphone",
  MOBIFONE: "Mobifone",
  VIETNAMOBILE: "Vietnamobile",
  GMOBILE: "Gmobile",
  ITEL: "iTel",
  REDDI: "Reddi",
  KHAC: "Khác",
};

function prefix3(raw?: string | null): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("84") && d.length >= 11) d = `0${d.slice(2)}`;
  if (d.length < 3) return null;
  if (!d.startsWith("0")) d = `0${d}`;
  return d.slice(0, 3);
}

export function phoneCarrierCode(phone?: string | null): PhoneCarrierCode {
  const p = prefix3(phone);
  if (!p) return "KHAC";
  if (/^03[2-9]$/.test(p) || p === "086" || /^09[6-8]$/.test(p)) return "VIETTEL";
  if (/^08[1-5]$/.test(p) || p === "088" || p === "091" || p === "094") return "VINAPHONE";
  if (p === "070" || /^07[6-9]$/.test(p) || p === "089" || p === "090" || p === "093") return "MOBIFONE";
  if (p === "052" || p === "056" || p === "058" || p === "092") return "VIETNAMOBILE";
  if (p === "059" || p === "099") return "GMOBILE";
  if (p === "087") return "ITEL";
  if (p === "055") return "REDDI";
  return "KHAC";
}

export function phoneCarrierLabel(phone?: string | null, fromApi?: string | null): string {
  if (fromApi && fromApi.trim()) return fromApi.trim();
  return LABEL[phoneCarrierCode(phone)];
}

const BIG3: PhoneCarrierCode[] = ["VIETTEL", "VINAPHONE", "MOBIFONE"];

/** Cấu hình ước tính cước Auto Call (tab Kết nối). */
export type AutoCallRateConfig = {
  /** Viettel / Vinaphone / Mobifone: đồng / phút đã bắt đầu. */
  big3PerMin: number;
  /** Nhà mạng còn lại: số giây block đầu. */
  otherFirstSec: number;
  /** Nhà mạng còn lại: đồng cho block đầu. */
  otherFirstFee: number;
  /** Nhà mạng còn lại: đồng mỗi giây sau block đầu. */
  otherPerSec: number;
};

export const DEFAULT_AUTOCALL_RATES: AutoCallRateConfig = {
  big3PerMin: 420,
  otherFirstSec: 6,
  otherFirstFee: 102,
  otherPerSec: 17,
};

export function resolveAutoCallRates(raw?: Partial<AutoCallRateConfig> | null): AutoCallRateConfig {
  const n = (v: unknown, fallback: number, min: number, max: number) => {
    const x = Math.round(Number(v));
    if (!Number.isFinite(x)) return fallback;
    return Math.min(max, Math.max(min, x));
  };
  return {
    big3PerMin: n(raw?.big3PerMin, DEFAULT_AUTOCALL_RATES.big3PerMin, 1, 100_000),
    otherFirstSec: n(raw?.otherFirstSec, DEFAULT_AUTOCALL_RATES.otherFirstSec, 1, 60),
    otherFirstFee: n(raw?.otherFirstFee, DEFAULT_AUTOCALL_RATES.otherFirstFee, 1, 100_000),
    otherPerSec: n(raw?.otherPerSec, DEFAULT_AUTOCALL_RATES.otherPerSec, 1, 100_000),
  };
}

/**
 * Ước tính cước theo thời lượng nghe (giây) và cấu hình tab Kết nối.
 * Viettel / Vinaphone / Mobifone: đ / phút đã bắt đầu (dưới 1 phút = 1 phút).
 * Nhà mạng khác: đ / N giây đầu, mỗi giây sau cộng thêm.
 * Chưa nghe (0 giây) = 0đ.
 */
export function estimateAutoCallVnd(
  phone?: string | null,
  durationSec?: number | null,
  carrierCode?: string | null,
  rates?: Partial<AutoCallRateConfig> | null,
): number {
  const sec = Math.floor(Number(durationSec) || 0);
  if (sec <= 0) return 0;
  const r = resolveAutoCallRates(rates);
  const code = (carrierCode && carrierCode.trim()
    ? carrierCode.trim().toUpperCase()
    : phoneCarrierCode(phone)) as PhoneCarrierCode;
  if (BIG3.includes(code)) {
    return Math.ceil(sec / 60) * r.big3PerMin;
  }
  if (sec <= r.otherFirstSec) return r.otherFirstFee;
  return r.otherFirstFee + r.otherPerSec * (sec - r.otherFirstSec);
}
