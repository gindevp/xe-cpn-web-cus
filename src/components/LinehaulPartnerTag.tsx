import { cn } from "@/lib/utils";

/** Tag đơn giao qua đối tác linehaul (VEXERE/HTP…). */
export function LinehaulPartnerTag({
  code,
  className,
  title,
}: {
  code?: string | null;
  className?: string;
  /** Tooltip / title attribute. */
  title?: string;
}) {
  const c = (code ?? "").trim().toUpperCase();
  if (!c) return null;
  const label = `Giao qua ${c}`;
  return (
    <span className={cn("tag partner sm", className)} title={title ?? label}>
      <span className="ms" aria-hidden="true">
        handshake
      </span>
      {label}
    </span>
  );
}
