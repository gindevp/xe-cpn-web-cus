import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Ban } from "lucide-react";
import { toast } from "sonner";

/** Độ dài tối thiểu lý do huỷ đơn khách đã chuyển khoản — khớp BE. */
export const CANCEL_REASON_MIN_TRANSFER = 10;

/** Xác nhận huỷ đơn — bắt buộc nhập lý do. */
export function CancelOrderDialog({
  open,
  codes,
  onOpenChange,
  onConfirm,
  title = "Xác nhận huỷ đơn",
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {codes.length === 1 ? `Đơn ${codes[0]}` : `${codes.length} đơn`}{" "}
            {description ??
              "sẽ chuyển sang Đơn huỷ (khôi phục được ở màn Đơn huỷ). Tiền đã thu chưa nộp của đơn sẽ tự hủy nộp khỏi phiếu thu (coi như đã hoàn khách, ghi vào lịch sử phiếu thu)."}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-order-reason">Lý do huỷ *</Label>
            <Textarea
              id="cancel-order-reason"
              rows={3}
              maxLength={200}
              placeholder="VD: Khách không gửi nữa / tạo nhầm đơn…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
            {minReasonLength > 1 && tooShort ? (
              <p className="text-xs text-muted-foreground">Ít nhất {minReasonLength} ký tự.</p>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Quay lại
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="gap-2"
            onClick={submit}
            disabled={tooShort}
          >
            <Ban className="h-4 w-4" />
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
