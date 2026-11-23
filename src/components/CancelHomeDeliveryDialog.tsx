import { useState } from "react";
import { toast } from "sonner";
import { cancelHomeDelivery } from "@/lib/api/domain-api";
import type { OrderX } from "@/lib/store";

const REASONS = [
  "Người nhận muốn tự đến VP lấy",
  "Địa chỉ ngoài vùng giao tận nơi",
  "Không liên lạc được người nhận",
];

export function senderPaidDoorFee(order: Pick<OrderX, "paidAmount" | "deliveryFee">): boolean {
  const fee = Math.round(Number(order.deliveryFee) || 0);
  const paid = Math.round(Number(order.paidAmount) || 0);
  return fee > 0 && paid >= fee;
}

export function CancelHomeDeliveryDialog({
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
  const refund = senderPaidDoorFee(order);
  const fee = Math.round(Number(order.deliveryFee) || 0);
  const [reason, setReason] = useState("");
  const [bankName, setBankName] = useState(order.bankName ?? "");
  const [accountNo, setAccountNo] = useState(order.bankAccountNo ?? "");
  const [accountName, setAccountName] = useState(order.bankAccountName ?? "");
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const office = order.finalToOffice || order.toOffice;
  const submit = async () => {
    if (!reason) {
      toast.error("Chọn lý do huỷ");
      return;
    }
    if (refund && (!bankName.trim() || !accountNo.trim() || !accountName.trim())) {
      toast.error("Nhập tài khoản nhận tiền hoàn");
      return;
    }
    setBusy(true);
    try {
      await cancelHomeDelivery(order.code, {
        reason,
        bankName: refund ? bankName.trim() : undefined,
        bankAccountNo: refund ? accountNo.trim() : undefined,
        bankAccountName: refund ? accountName.trim() : undefined,
      });
      toast.success(refund ? "Đã huỷ giao tận nơi và tạo hoàn phí" : "Đã huỷ giao tận nơi");
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không huỷ được giao tận nơi");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="scrim" role="presentation" onMouseDown={() => !busy && onOpenChange(false)}>
      <div
        className="sheet"
        role="dialog"
        aria-labelledby="cancel-door-title"
        style={{ width: "min(100%, 480px)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="cancel-door-title" style={{ margin: 0 }}>
          Huỷ giao tận nơi?
        </h2>
        <p className="muted" style={{ margin: "8px 0 0" }}>
          Đơn chuyển sang nhận tại {office || "văn phòng"}.
          {refund
            ? ` Hoàn ${fee.toLocaleString("vi-VN")} đ phí giao tận nơi cho người gửi. Không hoàn tác được.`
            : " Chưa thu phí giao — chỉ tắt giao tận nơi, không tạo hoàn."}
        </p>
        <label className="field" style={{ marginTop: 12 }}>
          <span className="l">Lý do huỷ *</span>
          <span className="box sel-box">
            <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Lý do huỷ">
              <option value="">Chọn lý do</option>
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <span className="ms" aria-hidden="true">
              expand_more
            </span>
          </span>
        </label>
        {refund ? (
          <div className="stack" style={{ gap: 8, marginTop: 8 }}>
            <div className="l">Tài khoản nhận tiền hoàn</div>
            <p className="muted" style={{ margin: 0 }}>
              Điền sẵn theo tài khoản nhận COD, sửa nếu khách muốn nhận vào tài khoản khác.
            </p>
            <label className="field">
              <span className="l">Ngân hàng *</span>
              <span className="box input-box">
                <input value={bankName} onChange={(e) => setBankName(e.target.value)} />
              </span>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <label className="field" style={{ flex: 1 }}>
                <span className="l">Số tài khoản *</span>
                <span className="box input-box">
                  <input value={accountNo} onChange={(e) => setAccountNo(e.target.value)} />
                </span>
              </label>
              <label className="field" style={{ flex: 1 }}>
                <span className="l">Tên tài khoản *</span>
                <span className="box input-box">
                  <input value={accountName} onChange={(e) => setAccountName(e.target.value)} />
                </span>
              </label>
            </div>
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Đóng
          </button>
          <button type="button" className="btn danger" disabled={busy} onClick={() => void submit()}>
            {busy ? "Đang huỷ…" : "Huỷ giao tận nơi"}
          </button>
        </div>
      </div>
    </div>
  );
}
