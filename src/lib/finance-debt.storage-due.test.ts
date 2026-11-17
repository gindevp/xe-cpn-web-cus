import { describe, expect, it } from "vitest";
import {
  customerCollectBadge,
  customerCollectDue,
  customerCollectKind,
  fareBalanceDue,
  orderDueAmount,
  receiverDueAmount,
} from "./finance-debt";

/** PV271078TD-style: đã thu 30k, phí tồn +3k → app thu thêm 3k; web không được ghi đã thu đủ 33k. */
describe("storage fee after sender prepaid", () => {
  const base = {
    fare: 33000,
    paidAmount: 30000,
    onCredit: false as const,
    collectForm: "GUI_TRA" as const,
    storageFee: 3000,
    status: "AT_DEST" as const,
    stage: "DEST_WH_IN" as const,
  };

  it("fareBalanceDue keeps real unpaid 3k", () => {
    expect(fareBalanceDue(base)).toBe(3000);
  });

  it("orderDueAmount stays 0 for GUI_TRA phiếu thu VP gửi", () => {
    expect(orderDueAmount(base)).toBe(0);
  });

  it("receiverDueAmount / customerCollectDue = phí tồn 3k", () => {
    expect(receiverDueAmount(base)).toBe(3000);
    expect(customerCollectDue(base)).toBe(3000);
  });

  it("UI badge is thu tiền lưu kho — not Đã thu", () => {
    expect(customerCollectKind(base)).toBe("storage");
    expect(customerCollectBadge(base)).toEqual({
      kind: "storage",
      due: 3000,
      label: "Thu tiền lưu kho",
    });
  });

  it("fully paid shows Đã thu", () => {
    const o = { ...base, paidAmount: 33000 };
    expect(customerCollectKind(o)).toBe("paid");
    expect(customerCollectBadge(o).label).toBe("Đã thu");
  });

  it("NHAN_TRA partial after fare bump shows full unpaid", () => {
    const o = { ...base, collectForm: "NHAN_TRA" as const, storageFee: 0 };
    expect(orderDueAmount(o)).toBe(3000);
    expect(receiverDueAmount(o)).toBe(3000);
    expect(customerCollectDue(o)).toBe(3000);
    expect(customerCollectKind(o)).toBe("unpaid");
  });
});
