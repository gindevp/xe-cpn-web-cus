import { apiRequest } from "./client";

const BASE = "/api/integration-config/onepay";

export type OnePayConfig = {
  enabled: boolean;
  /** Bật thu hộ VA cho phiếu thu (web + app); IPN đủ tiền tự xác nhận đã thu. */
  receiptCollectEnabled: boolean;
  /** QR thu cước đơn theo kênh — tắt thì kênh đó không hiện QR (luồng cũ). */
  orderCollectApp: boolean;
  orderCollectCustomer: boolean;
  orderCollectGuest: boolean;
  environment: "SANDBOX" | "PRODUCTION";
  baseUrl: string;
  partnerId?: string | null;
  partnerKeyConfigured: boolean;
  ipnUrl?: string | null;
  invoiceTtlHours: number;
  signatureRequired: boolean;
  insecureSsl: boolean;
  updatedAt?: string | null;
};

/** Trường không gửi = giữ nguyên; partnerKey rỗng = giữ key cũ. */
export type OnePayConfigUpdate = {
  enabled?: boolean;
  receiptCollectEnabled?: boolean;
  orderCollectApp?: boolean;
  orderCollectCustomer?: boolean;
  orderCollectGuest?: boolean;
  environment?: "SANDBOX" | "PRODUCTION";
  partnerId?: string;
  partnerKey?: string;
  ipnUrl?: string;
  invoiceTtlHours?: number;
  signatureRequired?: boolean;
  insecureSsl?: boolean;
};

export type OnePayInvoiceState = "UNPAID" | "PAID" | "EXPIRED" | "AMOUNT_MISMATCH";

export type OnePayInvoice = {
  id: number;
  purpose: string;
  userReference: string;
  invoiceReference: string;
  payerName: string;
  amount: number;
  description?: string | null;
  state: OnePayInvoiceState;
  accountNumber?: string | null;
  bankName?: string | null;
  qrData?: string | null;
  vaState?: string | null;
  expiresAt?: string | null;
  paidTransId?: string | null;
  paidAmount?: number | null;
  paidAt?: string | null;
  lastError?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type OnePayCallLog = {
  id: number;
  calledAt: string;
  direction: "IN" | "OUT";
  action: string;
  httpStatus?: number | null;
  result: string;
  message?: string | null;
  reference?: string | null;
  transId?: string | null;
  amount?: number | null;
  clientIp?: string | null;
  durationMs?: number | null;
  requestBody?: string | null;
  responseBody?: string | null;
};

export type OnePaySampleIpn = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
};

export type OnePayTestResult = {
  ok: boolean;
  message: string;
  httpStatus?: number | null;
  response?: string | null;
};

/** Phân trang server — page 0-based. */
export type OnePayPage<T> = {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
};

export type OnePayRefreshUnpaidResult = {
  checked: number;
  paid: number;
  expired: number;
  unchanged: number;
  failed: number;
  unpaidRemaining: number;
  errors: string[];
};

export const fetchOnePayConfig = () => apiRequest<OnePayConfig>(BASE);

export const putOnePayConfig = (body: OnePayConfigUpdate) =>
  apiRequest<OnePayConfig>(BASE, { method: "PUT", body });

export const testOnePayConnection = () =>
  apiRequest<OnePayTestResult>(`${BASE}/test-connection`, { method: "POST" });

export type OnePayListFilter = {
  q?: string;
  state?: string;
  /** yyyy-MM-dd (VN) */
  from?: string;
  /** yyyy-MM-dd (VN) */
  to?: string;
};

function listQuery(page: number, size: number, filter?: OnePayListFilter) {
  const p = new URLSearchParams();
  p.set("page", String(page));
  p.set("size", String(size));
  const q = filter?.q?.trim();
  const state = filter?.state?.trim();
  const from = filter?.from?.trim();
  const to = filter?.to?.trim();
  if (q) p.set("q", q);
  if (state) p.set("state", state);
  if (from) p.set("from", from);
  if (to) p.set("to", to);
  return p.toString();
}

export const fetchOnePayInvoices = (page = 0, size = 20, filter?: OnePayListFilter) =>
  apiRequest<OnePayPage<OnePayInvoice>>(`${BASE}/invoices?${listQuery(page, size, filter)}`);

export const createOnePayInvoice = (body: {
  payerName: string;
  amount: number;
  description?: string;
}) => apiRequest<OnePayInvoice>(`${BASE}/invoices`, { method: "POST", body });

export const refreshOnePayInvoice = (id: number) =>
  apiRequest<OnePayInvoice>(`${BASE}/invoices/${id}/refresh`, { method: "POST" });

/** Hỏi OnePay mọi hoá đơn còn UNPAID (tối đa max/lần). */
export const refreshOnePayUnpaidInvoices = (max = 100) =>
  apiRequest<OnePayRefreshUnpaidResult>(`${BASE}/invoices/refresh-unpaid?max=${max}`, {
    method: "POST",
    timeoutMs: 180_000,
  });

export const setOnePayAccountState = (id: number, active: boolean) =>
  apiRequest<OnePayInvoice>(`${BASE}/invoices/${id}/account-state?active=${active}`, {
    method: "POST",
  });

export const deleteOnePayInvoice = (id: number) =>
  apiRequest<void>(`${BASE}/invoices/${id}`, { method: "DELETE" });

export const buildOnePaySampleIpn = (body: {
  invoiceId: number;
  amount?: number;
  apiBase?: string;
}) => apiRequest<OnePaySampleIpn>(`${BASE}/sample-ipn`, { method: "POST", body });

export const fetchOnePayLogs = (page = 0, size = 20, filter?: OnePayListFilter) =>
  apiRequest<OnePayPage<OnePayCallLog>>(`${BASE}/logs?${listQuery(page, size, filter)}`);
