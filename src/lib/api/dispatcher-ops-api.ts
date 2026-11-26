import { apiRequest } from "./client";

export type DispatcherOpsDayCounts = {
  nhanHang: number;
  xepXe: number;
  lenHang: number;
  xuongHang: number;
  xuongHangKien: number;
  dieuPhoiGiao: number;
  ngoaiLe: number;
};

export type DispatcherOpsStaff = {
  login: string;
  staffCode?: string | null;
  displayName?: string | null;
  officeCode?: string | null;
  officeName?: string | null;
  active: boolean;
};

export type DispatcherOpsDayRow = {
  login: string;
  day: string;
  counts: DispatcherOpsDayCounts;
};

export type DispatcherOpsStaffRow = {
  staff: DispatcherOpsStaff;
  totals: DispatcherOpsDayCounts;
  days: DispatcherOpsDayRow[];
};

export type DispatcherOpsAction = {
  login: string;
  day: string;
  action: string;
  bucket: string;
  distinctOrders: number;
  eventCount: number;
};

export type DispatcherOpsReport = {
  from: string;
  to: string;
  staff: DispatcherOpsStaffRow[];
  actions: DispatcherOpsAction[];
  bucketLabels: string[];
};

/** from/to: YYYY-MM-DD (giờ VN). officeCode / login bỏ trống = toàn hệ thống. */
export function getDispatcherOpsReport(params: {
  from: string;
  to: string;
  officeCode?: string;
  login?: string;
}): Promise<DispatcherOpsReport> {
  const q = new URLSearchParams({ from: params.from, to: params.to });
  if (params.officeCode) q.set("officeCode", params.officeCode);
  if (params.login) q.set("login", params.login);
  return apiRequest<DispatcherOpsReport>(`/api/reports/dispatcher-ops?${q.toString()}`);
}

export function countsTotal(c: DispatcherOpsDayCounts): number {
  return (
    (c.nhanHang ?? 0) +
    (c.xepXe ?? 0) +
    (c.lenHang ?? 0) +
    (c.xuongHang ?? 0) +
    (c.dieuPhoiGiao ?? 0) +
    (c.ngoaiLe ?? 0)
  );
}
