import type { InvoiceBuyerProfile } from "@/lib/api/domain-api";
import { cn } from "@/lib/utils";

/** SĐT có nhiều MST đã dùng: bấm để chọn xuất theo MST nào. */
export function BuyerProfileChips({
  phone,
  profiles,
  selectedTaxCode,
  disabled,
  onPick,
}: {
  phone: string;
  profiles: InvoiceBuyerProfile[];
  selectedTaxCode: string;
  disabled?: boolean;
  onPick: (p: InvoiceBuyerProfile) => void;
}) {
  if (profiles.length < 2) return null;
  const current = selectedTaxCode.trim();
  return (
    <div className="space-y-1">
      <div className="text-[11px] text-muted-foreground">
        SĐT {phone} đã dùng {profiles.length} MST — chọn MST xuất hoá đơn:
      </div>
      <div className="flex flex-wrap gap-1.5">
        {profiles.map((p) => {
          const active = p.taxCode === current;
          return (
            <button
              key={p.taxCode}
              type="button"
              disabled={disabled}
              onClick={() => onPick(p)}
              title={[p.companyName, p.address].filter(Boolean).join(" · ")}
              className={cn(
                "max-w-full rounded-md border px-2 py-1 text-left text-[11px] leading-tight transition-colors",
                active
                  ? "border-primary/50 bg-primary/15 text-foreground"
                  : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted",
              )}
            >
              <div className="font-mono font-semibold">{p.taxCode}</div>
              <div className="max-w-[220px] truncate text-muted-foreground">{p.companyName || "—"}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
