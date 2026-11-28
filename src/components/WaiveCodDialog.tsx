import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { waiveCod } from "@/lib/api/domain-api";
import { formatVND } from "@/lib/mock-data";
import type { OrderX } from "@/lib/store";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

/** Admin: bỏ COD khi khách tự chuyển tiền cho nhau — hết nợ COD người giao, không hoàn người gửi. */
export function canWaiveCod(
  o: Pick<OrderX, "status" | "codAmount" | "codExportedAt"> | null | undefined,
  isAdmin: boolean,
): boolean {
  if (!isAdmin || !o) return false;
  if (o.status !== "DELIVERED") return false;
  if (o.codExportedAt) return false;
  return Math.round(Number(o.codAmount) || 0) > 0;
}

export function WaiveCodDialog({
  order,
  open,
  onOpenChange,
  onDone,
}: {
  order: OrderX;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("Khách tự chuyển COD cho nhau");
  const [busy, setBusy] = useState(false);
  const fee = Math.round(Number(order.codAmount) || 0);

  useEffect(() => {
    if (!open) return;
    setReason("Khách tự chuyển COD cho nhau");
    setBusy(false);
  }, [open, order.code]);

  const submit = async () => {
    const text = reason.trim();
    if (text.length < 3) {
      toast.error("Nhập lý do bỏ COD");
      return;
    }
    setBusy(true);
    try {
      await waiveCod(order.code, text);
      toast.success(`Đã bỏ COD đơn ${order.code} · hết nợ COD người giao`);
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bỏ COD thất bại");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!busy) onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bỏ COD · {order.code}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <p>
            COD <b>{formatVND(fee)}</b> sẽ về 0: không hoàn cho người gửi và xoá nợ COD của người giao
            khách tại quầy.
          </p>
          <p className="text-muted-foreground">
            Dùng khi người gửi và người nhận tự chuyển tiền COD cho nhau. Cước và phí thu hộ giữ nguyên.
            Số COD cũ ghi vào lịch sử đơn.
          </p>
        </div>
        <div className="space-y-1">
          <Label>Lý do</Label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={150}
            disabled={busy}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || reason.trim().length < 3}
            onClick={() => void submit()}
          >
            {busy ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Đang lưu…
              </>
            ) : (
              "Bỏ COD"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
