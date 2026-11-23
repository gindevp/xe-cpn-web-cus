import { useEffect, useState } from "react";
import { M3ConfirmActions, M3Sheet, M3SheetTitle } from "@/components/m3/M3Sheet";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cancelHomeDelivery } from "@/lib/api/domain-api";
import { officeName } from "@/lib/mock-data";
import { senderPaidDoorFee } from "@/lib/order-edit-policy";
import type { OrderX } from "@/lib/store";
import { toast } from "sonner";

const REASON_OPTIONS = [
  "Người nhận muốn tự đến VP lấy",
  "Địa chỉ ngoài vùng giao tận nơi",
  "Không liên lạc được người nhận",
].map((r) => ({ value: r, label: r }));

const BANK_OPTIONS = [
  "Vietcombank",
  "VietinBank",
  "BIDV",
  "Agribank",
  "Techcombank",
  "MB Bank",
  "ACB",
  "VPBank",
  "TPBank",
  "Sacombank",
  "SHB",
  "HDBank",
  "VIB",
  "MSB",
  "OCB",
].map((b) => ({ value: b, label: b }));

export { senderPaidDoorFee };

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
  const officeLabel = officeName(order.finalToOffice || order.toOffice) || "văn phòng";
  const [reason, setReason] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [accountName, setAccountName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setBankName(order.bankName ?? "");
    setAccountNo(order.bankAccountNo ?? "");
    setAccountName(order.bankAccountName ?? "");
    setBusy(false);
  }, [open, order.code, order.bankName, order.bankAccountNo, order.bankAccountName]);

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
    <M3Sheet open={open} onOpenChange={onOpenChange} variant="confirm">
      <M3SheetTitle>Huỷ giao tận nơi?</M3SheetTitle>
      <p className="lab muted" style={{ margin: 0 }}>
        Đơn chuyển sang nhận tại <strong style={{ color: "var(--on-surface)" }}>{officeLabel}</strong>.
        {refund ? (
          <>
            {" "}
            Hoàn {fee.toLocaleString("vi-VN")} đ phí giao tận nơi cho người gửi.{" "}
            <span style={{ color: "var(--error)", fontWeight: 500 }}>Không hoàn tác được.</span>
          </>
        ) : (
          " Chưa thu phí giao — chỉ tắt giao tận nơi, không tạo hoàn."
        )}
      </p>

      <label className="field" style={{ flex: "none", width: "100%", minWidth: 0 }}>
        <span className="l">Lý do huỷ *</span>
        <SearchableSelect
          value={reason}
          onValueChange={setReason}
          placeholder="Chọn lý do"
          options={REASON_OPTIONS}
        />
      </label>

      {refund ? (
        <fieldset className="refund-box">
          <legend>Tài khoản nhận tiền hoàn</legend>
          <p className="lab muted" style={{ margin: 0 }}>
            Điền sẵn theo tài khoản nhận COD, sửa nếu khách muốn nhận vào tài khoản khác.
          </p>
          <label className="field" style={{ flex: "none", width: "100%", minWidth: 0 }}>
            <span className="l">Ngân hàng *</span>
            <SearchableSelect
              value={bankName}
              onValueChange={setBankName}
              placeholder="Chọn ngân hàng"
              options={BANK_OPTIONS}
            />
          </label>
          <div className="refund-box-row">
            <label className="field" style={{ flex: 1, minWidth: 0 }}>
              <span className="l">Số tài khoản *</span>
              <span className="box input-box">
                <input
                  inputMode="numeric"
                  value={accountNo}
                  onChange={(e) => setAccountNo(e.target.value)}
                  aria-label="Số tài khoản"
                />
              </span>
            </label>
            <label className="field" style={{ flex: 1, minWidth: 0 }}>
              <span className="l">Tên tài khoản *</span>
              <span className="box input-box">
                <input
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  aria-label="Tên tài khoản"
                />
              </span>
            </label>
          </div>
        </fieldset>
      ) : null}

      <M3ConfirmActions>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => onOpenChange(false)}>
          Đóng
        </button>
        <button type="button" className="btn danger" disabled={busy} onClick={() => void submit()}>
          {busy ? "Đang huỷ…" : "Huỷ giao tận nơi"}
        </button>
      </M3ConfirmActions>
    </M3Sheet>
  );
}
