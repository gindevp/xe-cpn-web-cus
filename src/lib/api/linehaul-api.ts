import { apiRequest } from "@/lib/api/client";

export type LinehaulAgency = {
  id: number;
  code: string;
  name: string;
  active: boolean;
  contactName?: string | null;
  phone?: string | null;
  note?: string | null;
};

export type LinehaulPartnerVehicle = {
  id: number;
  code: string;
  plate?: string | null;
  partnerCode: string;
  driverName: string;
  driverPhone: string;
  /** Tuỳ chọn — không bắt buộc khi tạo xe đối tác. */
  appAccount?: string | null;
  active: boolean;
};

export type LinehaulProvince = {
  id: number;
  provinceName: string;
  areaName?: string | null;
  scope: "CA_TINH" | "KHU_VUC" | string;
  partnerCode: string;
  /** Tên đầy đủ đối tác (theo danh mục). */
  partnerName?: string | null;
  /** Mã viết tắt in tem (vd. NA, HT, VINH). */
  shortCode?: string | null;
  active: boolean;
  displayName: string;
  createOrderLabel: string;
  wardTotal: number;
  wardMapped: number;
  canCreateOrder: boolean;
};

/** Gợi ý mã viết tắt từ tên: Nghệ An → NA, TP Vinh → TV. */
export function suggestProvinceShortCode(name: string): string {
  const parts = name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/Đ/g, "D")
    .split(/[\s\-/]+/)
    .map((p) => p.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0].slice(0, 4).toUpperCase();
  return parts
    .map((p) => p[0])
    .join("")
    .slice(0, 6)
    .toUpperCase();
}

export type LinehaulZone = {
  id: number;
  provinceId: number;
  code: string;
  name: string;
  sortOrder: number;
  active: boolean;
};

export type LinehaulWard = {
  id?: number;
  zoneId: number;
  wardCode: string;
  wardName: string;
};

export type LinehaulBand = {
  id?: number;
  partnerCode?: string;
  kgFrom: number;
  kgTo: number;
  dimLCm?: number | null;
  dimWCm?: number | null;
  dimHCm?: number | null;
  effectiveFrom?: string | null;
  active?: boolean;
  sortOrder?: number;
};

export type LinehaulBandsPayload = {
  bands: LinehaulBand[];
  cells: { id: number; bandId: number; zoneId: number; amount: number }[];
  amountsByBand: Record<string, Record<string, number>>;
};

export type LinehaulQuote = {
  provinceId: number;
  zoneId: number;
  zoneName: string;
  bandId: number;
  amount: number;
  wardCode: string;
  wardName: string;
};

export async function fetchLinehaulAgencies(activeOnly = false) {
  return apiRequest<LinehaulAgency[]>(`/api/linehaul/partners?activeOnly=${activeOnly}`, {
    auth: false,
  });
}

export async function createLinehaulAgency(body: {
  code: string;
  name: string;
  contactName?: string;
  phone?: string;
  note?: string;
  active?: boolean;
}) {
  return apiRequest<LinehaulAgency>(`/api/linehaul/partners`, {
    method: "POST",
    body: {
      code: body.code.trim().toUpperCase(),
      name: body.name.trim(),
      contactName: body.contactName?.trim() || null,
      phone: body.phone?.trim() || null,
      note: body.note?.trim() || null,
      active: body.active ?? true,
    },
  });
}

export async function updateLinehaulAgency(
  id: number,
  body: {
    code: string;
    name: string;
    contactName?: string;
    phone?: string;
    note?: string;
    active?: boolean;
  },
) {
  return apiRequest<LinehaulAgency>(`/api/linehaul/partners/${id}`, {
    method: "PUT",
    body: {
      id,
      code: body.code.trim().toUpperCase(),
      name: body.name.trim(),
      contactName: body.contactName?.trim() || null,
      phone: body.phone?.trim() || null,
      note: body.note?.trim() || null,
      active: body.active ?? true,
    },
  });
}

export async function setLinehaulAgencyActive(id: number, active: boolean) {
  return apiRequest<LinehaulAgency>(`/api/linehaul/partners/${id}/active?active=${active}`, {
    method: "PATCH",
  });
}

export async function deleteLinehaulAgency(id: number) {
  return apiRequest<void>(`/api/linehaul/partners/${id}`, { method: "DELETE" });
}

export async function fetchLinehaulPartnerVehicles(activeOnly = false) {
  return apiRequest<LinehaulPartnerVehicle[]>(`/api/linehaul/partner-vehicles?activeOnly=${activeOnly}`, {
    auth: false,
  });
}

export async function createLinehaulPartnerVehicle(body: {
  code: string;
  plate?: string;
  partnerCode: string;
  driverName: string;
  driverPhone: string;
  appAccount?: string | null;
  active?: boolean;
}) {
  const acc = (body.appAccount ?? "").trim().toLowerCase();
  return apiRequest<LinehaulPartnerVehicle>(`/api/linehaul/partner-vehicles`, {
    method: "POST",
    body: {
      code: body.code.trim().toUpperCase(),
      plate: body.plate?.trim() || null,
      partnerCode: body.partnerCode.trim().toUpperCase(),
      driverName: body.driverName.trim(),
      driverPhone: body.driverPhone.trim(),
      appAccount: acc || null,
      active: body.active ?? true,
    },
  });
}

export async function updateLinehaulPartnerVehicle(
  id: number,
  body: {
    code: string;
    plate?: string;
    partnerCode: string;
    driverName: string;
    driverPhone: string;
    appAccount?: string | null;
    active?: boolean;
  },
) {
  const acc = (body.appAccount ?? "").trim().toLowerCase();
  return apiRequest<LinehaulPartnerVehicle>(`/api/linehaul/partner-vehicles/${id}`, {
    method: "PUT",
    body: {
      id,
      code: body.code.trim().toUpperCase(),
      plate: body.plate?.trim() || null,
      partnerCode: body.partnerCode.trim().toUpperCase(),
      driverName: body.driverName.trim(),
      driverPhone: body.driverPhone.trim(),
      appAccount: acc || null,
      active: body.active ?? true,
    },
  });
}

export async function setLinehaulPartnerVehicleActive(id: number, active: boolean) {
  return apiRequest<LinehaulPartnerVehicle>(`/api/linehaul/partner-vehicles/${id}/active?active=${active}`, {
    method: "PATCH",
  });
}

export async function deleteLinehaulPartnerVehicle(id: number) {
  return apiRequest<void>(`/api/linehaul/partner-vehicles/${id}`, { method: "DELETE" });
}

export async function fetchLinehaulProvinces(activeOnly = false) {
  return apiRequest<LinehaulProvince[]>(`/api/linehaul/provinces?activeOnly=${activeOnly}`, {
    auth: false,
  });
}

export async function fetchXeProvinces() {
  return apiRequest<string[]>(`/api/linehaul/xe-provinces`, { auth: false });
}

export async function createLinehaulProvince(
  body: Partial<LinehaulProvince> & { provinceName: string; scope: string; partnerCode: string },
) {
  return apiRequest<LinehaulProvince>(`/api/linehaul/provinces`, {
    method: "POST",
    body: {
      provinceName: body.provinceName,
      areaName: body.areaName ?? null,
      scope: body.scope,
      partnerCode: body.partnerCode,
      shortCode: body.shortCode ?? null,
      active: body.active ?? true,
    },
  });
}

export async function updateLinehaulProvince(
  id: number,
  body: Partial<LinehaulProvince> & { provinceName: string; scope: string; partnerCode: string },
) {
  return apiRequest<LinehaulProvince>(`/api/linehaul/provinces/${id}`, {
    method: "PUT",
    body: {
      id,
      provinceName: body.provinceName,
      areaName: body.areaName ?? null,
      scope: body.scope,
      partnerCode: body.partnerCode,
      shortCode: body.shortCode ?? null,
      active: body.active ?? true,
    },
  });
}

export async function setLinehaulProvinceActive(id: number, active: boolean) {
  return apiRequest<LinehaulProvince>(`/api/linehaul/provinces/${id}/active?active=${active}`, {
    method: "PATCH",
  });
}

export async function deleteLinehaulProvince(id: number) {
  return apiRequest<void>(`/api/linehaul/provinces/${id}`, { method: "DELETE" });
}

export async function fetchLinehaulZones(provinceId?: number) {
  const q = provinceId != null ? `?provinceId=${provinceId}` : "";
  return apiRequest<LinehaulZone[]>(`/api/linehaul/zones${q}`, { auth: false });
}

export async function saveLinehaulZone(zone: Partial<LinehaulZone> & { provinceId: number; code: string; name: string }) {
  if (zone.id != null) {
    return apiRequest<LinehaulZone>(`/api/linehaul/zones/${zone.id}`, { method: "PUT", body: zone });
  }
  return apiRequest<LinehaulZone>(`/api/linehaul/zones`, { method: "POST", body: zone });
}

export async function fetchLinehaulProvinceWards(provinceId: number) {
  return apiRequest<LinehaulWard[]>(`/api/linehaul/provinces/${provinceId}/wards`, { auth: false });
}

export async function fetchLinehaulZoneWards(zoneId: number) {
  return apiRequest<LinehaulWard[]>(`/api/linehaul/zones/${zoneId}/wards`, { auth: false });
}

export async function replaceLinehaulZoneWards(zoneId: number, wards: { wardCode: string; wardName: string }[]) {
  return apiRequest<LinehaulWard[]>(`/api/linehaul/zones/${zoneId}/wards`, {
    method: "PUT",
    body: wards.map((w) => ({ zoneId, wardCode: w.wardCode, wardName: w.wardName })),
  });
}

export async function fetchLinehaulBands(partnerCode: string) {
  return apiRequest<LinehaulBandsPayload>(`/api/linehaul/bands?partnerCode=${encodeURIComponent(partnerCode)}`, {
    auth: false,
  });
}

export async function saveLinehaulBand(
  band: LinehaulBand & { partnerCode: string },
  amounts: Record<number, number>,
) {
  const body = {
    band: {
      ...band,
      partnerCode: band.partnerCode,
      kgFrom: band.kgFrom,
      kgTo: band.kgTo,
    },
    amounts,
  };
  if (band.id != null) {
    return apiRequest<LinehaulBand>(`/api/linehaul/bands/${band.id}`, { method: "PUT", body });
  }
  return apiRequest<LinehaulBand>(`/api/linehaul/bands`, { method: "POST", body });
}

export async function deleteLinehaulBand(id: number) {
  return apiRequest<void>(`/api/linehaul/bands/${id}`, { method: "DELETE" });
}

export async function quoteLinehaul(body: { provinceId: number; wardCode: string; weightKg: number }) {
  return apiRequest<LinehaulQuote>(`/api/linehaul/quote`, {
    method: "POST",
    body,
    auth: false,
  });
}
