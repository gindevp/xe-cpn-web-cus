import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import type { OfficeRec } from "@/lib/mock-data";
import { findOfficeByToken } from "@/lib/mock-data";
import {
  DEFAULT_TRANSIT_POLICY,
  loadTransitHubPolicy,
  resolveProvinceTransit,
  type TransitHubPolicy,
} from "@/lib/transit-hub";

/** Cảnh báo đơn tỉnh đi tỉnh phải qua VP trung chuyển. */
export function TransitHubNotice({
  fromOffice,
  toOffice,
  offices,
}: {
  fromOffice?: string | null;
  toOffice?: string | null;
  offices: OfficeRec[];
}) {
  const [policy, setPolicy] = useState<TransitHubPolicy>(DEFAULT_TRANSIT_POLICY);
  useEffect(() => {
    void loadTransitHubPolicy().then(setPolicy);
  }, []);
  const from = findOfficeByToken(fromOffice, offices);
  const to = findOfficeByToken(toOffice, offices);
  const hit = resolveProvinceTransit(from, to, offices, policy);
  if (!hit) return null;
  return (
    <div className="mt-3 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-950 dark:text-amber-100">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="font-semibold">Đơn hàng trung chuyển</div>
        <p className="leading-snug text-amber-900/90 dark:text-amber-100/90">
          Tuyến tỉnh đi tỉnh cần trung chuyển qua văn phòng <span className="font-medium">{hit.hubName}</span> trước
          khi đến VP nhận.
        </p>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-medium">
          <span className="rounded bg-card/80 px-1.5 py-0.5 text-foreground">{hit.fromName}</span>
          <span className="text-amber-600 dark:text-amber-300">→</span>
          <span className="rounded border border-amber-500/40 bg-card px-1.5 py-0.5 text-foreground">{hit.hubName}</span>
          <span className="text-amber-600 dark:text-amber-300">→</span>
          <span className="rounded bg-card/80 px-1.5 py-0.5 text-foreground">{hit.toName}</span>
        </div>
      </div>
    </div>
  );
}
