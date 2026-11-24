/** Khoảng ngày lịch Việt Nam (yyyy-MM-dd) ↔ Instant ISO — tránh `new Date("yyyy-MM-dd")` = UTC. */

/** yyyy-MM-dd lịch VN, lùi `daysAgo` ngày từ hôm nay. */
export function vnDayOffset(daysAgo: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(Date.now() - daysAgo * 86_400_000));
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

export function vnDayStartMs(day: string): number {
  const t = Date.parse(`${day}T00:00:00+07:00`);
  return Number.isFinite(t) ? t : NaN;
}

export function vnDayEndMs(day: string): number {
  const t = Date.parse(`${day}T23:59:59.999+07:00`);
  return Number.isFinite(t) ? t : NaN;
}

/** `iso` nằm trong [from, to] (ngày VN, gồm hai đầu). from/to trống = không chặn phía đó. */
export function isoInVnDayRange(iso: string | null | undefined, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return false;
  if (from) {
    const a = vnDayStartMs(from);
    if (Number.isFinite(a) && t < a) return false;
  }
  if (to) {
    const b = vnDayEndMs(to);
    if (Number.isFinite(b) && t > b) return false;
  }
  return true;
}
