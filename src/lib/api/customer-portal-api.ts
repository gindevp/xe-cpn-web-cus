import { apiRequest } from "./client";

/** Phiên khách (đăng nhập SĐT + OTP) — tách biệt JWT nhân viên `xe-m3-jwt`. */
const SESSION_KEY = "xe-m3-kh-session";
export const CUSTOMER_TOKEN_HEADER = "X-Customer-Token";
const TOKEN_HEADER = CUSTOMER_TOKEN_HEADER;

export type CustomerSession = {
  token: string;
  phone: string;
  name?: string | null;
  expiresAt: string;
};

export function getCustomerSession(): CustomerSession | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as CustomerSession;
    if (!s?.token || !s.phone) return null;
    if (s.expiresAt && new Date(s.expiresAt).getTime() < Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function setCustomerSession(s: CustomerSession | null) {
  if (typeof localStorage === "undefined") return;
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
}

/** 0xxxxxxxxx hợp lệ (đầu số di động VN) hoặc null. */
export function normalizeCustomerPhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("84") && d.length === 11) d = `0${d.slice(2)}`;
  return /^0[35789]\d{8}$/.test(d) ? d : null;
}

export type OtpSendResult = { phone: string; resendAfterSeconds: number; expiresInSeconds: number };

export function sendCustomerOtp(phone: string) {
  return apiRequest<OtpSendResult>("/api/public/customer/otp/send", {
    method: "POST",
    body: { phone },
    auth: false,
  });
}

export function verifyCustomerOtp(phone: string, otp: string) {
  return apiRequest<CustomerSession>("/api/public/customer/otp/verify", {
    method: "POST",
    body: { phone, otp },
    auth: false,
  });
}

function customerGet<T>(path: string) {
  const s = getCustomerSession();
  return apiRequest<T>(path, {
    auth: false,
    headers: s ? { [TOKEN_HEADER]: s.token } : {},
  });
}

export type CustomerGroup = "PENDING" | "SHIPPING" | "DELIVERED" | "CANCELLED";

export type CustomerOrderRow = {
  orderCode: string;
  createdAt?: string | null;
  direction: "SENT" | "RECEIVED";
  senderName?: string | null;
  senderPhone?: string | null;
  receiverName?: string | null;
  receiverPhone?: string | null;
  deliveryAddress?: string | null;
  fromOfficeName?: string | null;
  toOfficeName?: string | null;
  fareAmount?: number | null;
  paidAmount?: number | null;
  codAmount?: number | null;
  payer: "SENDER" | "RECEIVER";
  status?: string | null;
  statusLabel?: string | null;
  group: CustomerGroup;
  invoiced: boolean;
  codRefunded: boolean;
};

type GroupCounts = Record<CustomerGroup | "TOTAL", number>;

export type CustomerSummary = {
  phone: string;
  name?: string | null;
  totalOrders: number;
  shippingNow: number;
  month: GroupCounts;
  prevMonth: GroupCounts;
  spendMonth: number;
  spendPrevMonth: number;
};

export type CustomerOrderDetail = {
  found: boolean;
  orderCode: string;
  statusLabel?: string | null;
  receiverName?: string | null;
  receiverPhone?: string | null;
  deliveryAddress?: string | null;
  fromOfficeName?: string | null;
  toOfficeName?: string | null;
  fareAmount?: number | null;
  paidAmount?: number | null;
  codAmount?: number | null;
  codRefundPaid?: boolean | null;
  invoiceState?: string | null;
  invoiceNo?: string | null;
  note?: string | null;
  journey: Array<{ key: string; label: string; at?: string | null }>;
};

export const fetchCustomerSummary = () => customerGet<CustomerSummary>("/api/public/customer/summary");
export const fetchCustomerOrders = () => customerGet<CustomerOrderRow[]>("/api/public/customer/orders");
export const fetchCustomerOrder = (code: string) =>
  customerGet<CustomerOrderDetail>(`/api/public/customer/orders/${encodeURIComponent(code)}`);
