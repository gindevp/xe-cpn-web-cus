import type { Role } from "./mock-data";
import { canonicalOfficeCode } from "./mock-data";

export const VIEW_ALL_OFFICES = "ALL";

/**
 * Role được chọn VP xem (góc phải) kể cả khi tài khoản gán 1 VP.
 * Thêm role vào mảng này khi cần mở quyền cho nhóm khác — không phải sửa UI.
 * Tài khoản `office = ALL` (scope toàn hệ thống trên BE) vẫn luôn được chọn VP.
 */
export const VIEW_OFFICE_PICKER_ROLES: readonly Role[] = ["AD", "KT"];

export function isAdminRole(role?: Role) {
  return role === "AD";
}

/** Được mở bộ chọn VP xem (single/multi). */
export function canPickViewOffices(session?: { role?: Role; office?: string | null } | null) {
  if (!session) return false;
  if (session.office === VIEW_ALL_OFFICES) return true;
  const role = session.role;
  return !!role && (VIEW_OFFICE_PICKER_ROLES as readonly string[]).includes(role);
}

/**
 * Toàn hệ thống hay bó theo VP (đọc dữ liệu ngoài VP gán):
 * cùng tập quyền với picker — giữ tương thích chỗ gọi cũ.
 */
export function hasAllOfficeScope(session?: { role?: Role; office?: string | null } | null) {
  return canPickViewOffices(session);
}

/** Danh sách mã VP đang chọn; rỗng = Toàn hệ thống. */
export function selectedViewOfficeCodes(office?: string | null): string[] {
  const c = office?.trim() ?? "";
  if (!c || c === VIEW_ALL_OFFICES) return [];
  return [...new Set(c.split(",").map((s) => s.trim()).filter(Boolean))];
}

export function isViewAllOffices(office?: string | null) {
  const c = office?.trim() ?? "";
  return !c || c === VIEW_ALL_OFFICES;
}

/** Encode lựa chọn: ALL | một mã | "A,B,C" (đã sort). */
export function encodeViewOffices(codes: string[]): string {
  const uniq = [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
  if (!uniq.length) return VIEW_ALL_OFFICES;
  if (uniq.length === 1) return uniq[0]!;
  return uniq.sort((a, b) => a.localeCompare(b, "vi")).join(",");
}

/**
 * Một mã VP khi đang chọn đúng 1 VP; multi/ALL → "".
 * Dùng cho API/sync cần đúng 1 officeCode.
 */
export function assignedOfficeCode(office?: string | null) {
  const codes = selectedViewOfficeCodes(office);
  return codes.length === 1 ? codes[0]! : "";
}

/** VP thuộc phạm vi đang xem? */
export function officeInViewScope(
  viewOffice: string | null | undefined,
  officeCode: string | null | undefined,
) {
  if (isViewAllOffices(viewOffice)) return true;
  const codes = selectedViewOfficeCodes(viewOffice);
  if (!codes.length) return true;
  const target = (officeCode ?? "").trim();
  if (!target) return false;
  const targetCanon = canonicalOfficeCode(target) || target;
  return codes.some((c) => {
    const cc = canonicalOfficeCode(c) || c;
    return c === target || cc === target || cc === targetCanon;
  });
}

/** True nếu bất kỳ mã nào trong list thuộc phạm vi xem. */
export function anyOfficeInViewScope(
  viewOffice: string | null | undefined,
  officeCodes: Array<string | null | undefined>,
) {
  if (isViewAllOffices(viewOffice)) return true;
  return officeCodes.some((c) => officeInViewScope(viewOffice, c));
}

/** Mã VP nhân viên: session, native shell, user master, hoặc VP đang xem (1 VP). */
export function resolveAssignedOffice(opts: {
  sessionOffice?: string | null;
  viewOffice?: string | null;
  nativeOffice?: string | null;
  userOffice?: string | null;
}): string {
  for (const raw of [opts.sessionOffice, opts.nativeOffice, opts.userOffice, opts.viewOffice]) {
    const code = canonicalOfficeCode(assignedOfficeCode(raw));
    if (code) return code;
    const fallback = assignedOfficeCode(raw);
    if (fallback) return fallback;
  }
  return "";
}

/** VP đang xem: tài khoản bó VP = VP được gán; tài khoản được picker = chuỗi ALL / mã / multi. */
export function resolveViewOffice(
  session: { role: Role; office: string } | null | undefined,
  viewOffice?: string | null,
): string {
  if (!hasAllOfficeScope(session)) {
    return assignedOfficeCode(session?.office) || (session?.office?.trim() ?? "");
  }
  if (isViewAllOffices(viewOffice)) return VIEW_ALL_OFFICES;
  const codes = selectedViewOfficeCodes(viewOffice);
  if (codes.length) return encodeViewOffices(codes);
  return VIEW_ALL_OFFICES;
}

export function adminOfficeSelectOptions(offices: { code: string; name: string }[]) {
  return [
    { value: VIEW_ALL_OFFICES, label: "Toàn hệ thống" },
    ...offices.map((o) => ({ value: o.code, label: o.name })),
  ];
}

export function viewOfficeDisplayLabel(
  viewOffice: string | null | undefined,
  offices: { code: string; name: string }[],
  officeNameFn?: (code: string) => string,
): string {
  if (isViewAllOffices(viewOffice)) return "Toàn hệ thống";
  const codes = selectedViewOfficeCodes(viewOffice);
  if (codes.length === 1) {
    const code = codes[0]!;
    return offices.find((o) => o.code === code)?.name || officeNameFn?.(code) || code;
  }
  if (codes.length <= 3) {
    return codes
      .map((code) => offices.find((o) => o.code === code)?.name || officeNameFn?.(code) || code)
      .join(", ");
  }
  return `${codes.length} văn phòng`;
}
