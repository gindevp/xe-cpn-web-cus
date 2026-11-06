import type { ReactNode } from "react";
import { M3ConfirmActions, M3Sheet, M3SheetTitle } from "@/components/m3/M3Sheet";

/** Confirm sheet Material 3 — thay AlertDialog shadcn khi design dùng `.sheet.confirm`. */
export function M3Confirm({
  open,
  onOpenChange,
  title,
  body,
  cancelLabel = "Đóng",
  confirmLabel = "Xác nhận",
  confirmDanger,
  onConfirm,
  confirmDisabled,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  body?: ReactNode;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmDanger?: boolean;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <M3Sheet open={open} onOpenChange={onOpenChange} variant="confirm">
      <M3SheetTitle>{title}</M3SheetTitle>
      {body ? (
        <p className="lab muted" style={{ margin: 0 }}>
          {body}
        </p>
      ) : null}
      {children}
      <M3ConfirmActions>
        <button type="button" className="btn ghost" onClick={() => onOpenChange(false)}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={confirmDanger ? "btn danger" : "btn"}
          disabled={confirmDisabled}
          onClick={() => {
            onConfirm();
            onOpenChange(false);
          }}
        >
          {confirmLabel}
        </button>
      </M3ConfirmActions>
    </M3Sheet>
  );
}
