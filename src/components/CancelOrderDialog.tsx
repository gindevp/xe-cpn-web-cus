import { useEffect, useState } from "react";
import { M3ConfirmActions, M3Sheet, M3SheetTitle } from "@/components/m3/M3Sheet";
import { toast } from "sonner";

/** Độ dài tối thiểu lý do huỷ đơn khách đã chuyển khoản — khớp BE. */
export const CANCEL_REASON_MIN_TRANSFER = 10;

/** Xác nhận huỷ đơn — bắt buộc nhập lý do (design `.sheet.confirm`). */
export function CancelOrderDialog({
  open,
  codes,
  onOpenChange,
  onConfirm,
  title = "Huỷ đơn?",
  description,
  confirmLabel = "Huỷ đơn",
  minReasonLength = 1,
}: {
  open: boolean;
  codes: string[];
  onOpenChange: (v: boolean) => void;
  onConfirm: (codes: string[], reason: string) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  minReasonLength?: number;
}) {
  const [reason, setReason] = useState("");
  const tooShort = reason.trim().length < minReasonLength;

  useEffect(() => {
    if (open) setReason("");
  }, [open, codes]);

  const submit = () => {
    const r = reason.trim();
    if (!r) return toast.error("Nhập lý do huỷ đơn");
    if (r.length < minReasonLength) return toast.error(`Ghi rõ lý do huỷ (ít nhất ${minReasonLength} ký tự)`);
    onConfirm(codes, r);
    onOpenChange(false);
  };

  const body =
    description ??
    "Đơn sẽ chuyển sang mục Đơn huỷ. Bạn có thể khôi phục ở màn Ngoại lệ - Huỷ.";

  return (
    <M3Sheet open={open} onOpenChange={onOpenChange} variant="confirm">
      <M3SheetTitle>{title}</M3SheetTitle>
      <p className="lab muted" style={{ margin: 0 }}>
        {codes.length === 1 ? `Đơn ${codes[0]}` : `${codes.length} đơn`} {body}
      </p>
      <label className="field" style={{ flex: "none", width: "100%", minWidth: 0 }}>
        <span className="l">Lý do huỷ *</span>
        <span className="box input-box" style={{ height: "auto", minHeight: 88, alignItems: "flex-start", paddingTop: 10 }}>
          <textarea
            rows={3}
            maxLength={200}
            placeholder="VD: Khách không gửi nữa / tạo nhầm đơn…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
            style={{
              flex: 1,
              width: "100%",
              border: 0,
              outline: 0,
              resize: "vertical",
              background: "transparent",
              font: "inherit",
              color: "inherit",
            }}
          />
        </span>
        {minReasonLength > 1 && tooShort ? (
          <span className="err-msg">Ít nhất {minReasonLength} ký tự.</span>
        ) : null}
      </label>
      <M3ConfirmActions>
        <button type="button" className="btn ghost" onClick={() => onOpenChange(false)}>
          Đóng
        </button>
        <button type="button" className="btn danger" onClick={submit} disabled={tooShort}>
          {confirmLabel}
        </button>
      </M3ConfirmActions>
    </M3Sheet>
  );
}
