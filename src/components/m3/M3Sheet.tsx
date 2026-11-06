import type { CSSProperties, ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

/** Overlay + sheet Material 3 (design `.scrim` / `.sheet`). Giữ Radix a11y/focus. */
export function M3Sheet({
  open,
  onOpenChange,
  children,
  className,
  variant = "sheet",
  alignTop,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: ReactNode;
  className?: string;
  /** confirm | sheet | order-sheet | form-sheet */
  variant?: "confirm" | "sheet" | "order-sheet" | "form-sheet" | "tem-sheet";
  /** order sheets thường align top + scroll */
  alignTop?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <div
          className={cn(
            /* Portal gắn body — phải mang theme-light nếu không --lowest/--on-surface bị undefined → sheet trong suốt */
            "scrim theme-light",
            alignTop && "m3-scrim-top",
          )}
          style={alignTop ? { alignItems: "flex-start", overflowY: "auto" } : undefined}
        >
          <DialogPrimitive.Overlay className="absolute inset-0" style={{ background: "transparent" }} />
          <DialogPrimitive.Content
            className={cn(
              "sheet relative z-[1] outline-none",
              variant === "confirm" && "confirm",
              variant !== "confirm" && variant !== "sheet" && variant,
              className,
            )}
            onOpenAutoFocus={(e) => {
              if (variant === "confirm") e.preventDefault();
            }}
            onPointerDownOutside={(e) => {
              /* Cho phép đóng khi bấm vùng tối; chặn khi bấm combo portaled */
              const t = e.target as HTMLElement | null;
              if (t?.closest?.("[data-radix-popper-content-wrapper], .m3-combo-portal")) {
                e.preventDefault();
              }
            }}
          >
            {children}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function M3SheetTitle({
  children,
  className,
  id,
  style,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  style?: CSSProperties;
}) {
  return (
    <DialogPrimitive.Title id={id} className={cn("confirm-title", className)} style={style}>
      {children}
    </DialogPrimitive.Title>
  );
}

export function M3SheetClose({
  className,
  "aria-label": ariaLabel = "Đóng",
}: {
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <DialogPrimitive.Close type="button" className={cn("no-btn", className)} aria-label={ariaLabel}>
      <span className="ms" aria-hidden="true">
        close
      </span>
    </DialogPrimitive.Close>
  );
}

export function M3ConfirmActions({ children }: { children: ReactNode }) {
  return <div className="confirm-acts">{children}</div>;
}
