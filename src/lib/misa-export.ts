import type { MisaLine } from "@/lib/api/finance-config-api";

type Cell = string | number;

const GUIDE = [
  "Hướng dẫn:",
  "- Điền dữ liệu vào các cột tương ứng trên file này",
  "- Các cột có dấu (*) là những cột bắt buộc",
  "- Nếu muốn nhập nhiều thông tin hơn người dùng có thể tải mẫu đầy đủ/hoặc tự thêm cột trên mẫu cơ bản",
  "- Các dòng dữ liệu phía dưới chỉ là ví dụ minh họa",
];

/** Cột mẫu cơ bản AMIS «Phiếu thu tiền gửi» — tiêu đề dòng 8. */
const DEPOSIT_HEADERS = [
  "Ngày hạch toán (*)",
  "Ngày chứng từ (*)",
  "Số chứng từ (*)",
  "Mã đối tượng ",
  "Tên đối tượng",
  "Nộp vào TK",
  "Mở tại ngân hàng",
  "Lý do thu",
  "Diễn giải lý do thu",
  "Diễn giải (hạch toán)",
  "TK Nợ (*)",
  "TK Có (*)",
  "Số tiền",
  "Mã đối tượng (hạch toán)",
];

/** Cột mẫu cơ bản AMIS «Phiếu thu tiền mặt». */
const CASH_HEADERS = [
  "Ngày hạch toán (*)",
  "Ngày chứng từ (*)",
  "Số chứng từ (*)",
  "Mã đối tượng",
  "Tên đối tượng",
  "Địa chỉ",
  "Người nộp",
  "Lý do nộp",
  "Diễn giải lý do nộp",
  "Kèm theo",
  "Diễn giải (hạch toán)",
  "TK Nợ (*)",
  "TK Có (*)",
  "Số tiền",
  "Mã đối tượng (hạch toán)",
];

const SOURCE_LABEL: Record<string, string> = {
  ONEPAY_RECEIPT: "OnePay - phiếu thu",
  ONEPAY_ORDER: "OnePay - cước đơn",
  CK: "Chuyển khoản (ảnh CK)",
  TIEN_MAT: "Tiền mặt",
};

/** dd/MM/yyyy dạng chữ — tránh Excel đảo ngày/tháng. */
function vnDate(ymd: string) {
  const [y, m, d] = ymd.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

const s = (v?: string | null) => v?.trim() ?? "";

function depositRow(l: MisaLine): Cell[] {
  const d = vnDate(l.date);
  return [d, d, "", "", s(l.objectName), s(l.bankAccount), s(l.bankName), "", s(l.reason), s(l.memo), l.debitAccount, l.creditAccount, Number(l.amount), ""];
}

function cashRow(l: MisaLine): Cell[] {
  const d = vnDate(l.date);
  return [d, d, "", "", s(l.objectName), "", "", "", s(l.reason), "", s(l.memo), l.debitAccount, l.creditAccount, Number(l.amount), ""];
}

function reviewRow(l: MisaLine): Cell[] {
  return [
    l.voucher === "TIEN_GUI" ? "Tiền gửi" : "Tiền mặt",
    SOURCE_LABEL[l.source] ?? l.source,
    vnDate(l.date),
    s(l.refCode),
    s(l.transId),
    s(l.bankAccount),
    s(l.officeCode),
    s(l.objectName),
    l.creditAccount,
    Number(l.amount),
  ];
}

/** File nhập MISA: sheet tiền gửi + tiền mặt theo mẫu AMIS, kèm sheet đối chiếu để kế toán rà. */
export async function downloadMisaWorkbook(filename: string, lines: MisaLine[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const templateSheet = (title: string, headers: string[], rows: Cell[][], detailFrom: number) => {
    const aoa: Cell[][] = [[title], ...GUIDE.map((g) => [g])];
    const group: Cell[] = headers.map(() => "");
    group[detailFrom] = "Chi tiết hạch toán";
    aoa.push(group, headers, ...rows);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = [{ s: { r: 6, c: detailFrom }, e: { r: 6, c: headers.length - 1 } }];
    ws["!cols"] = headers.map((h) => ({ wch: /Diễn giải/.test(h) ? 48 : /Tên|Lý do/.test(h) ? 28 : 16 }));
    for (let r = 8; r < aoa.length; r++) {
      const ref = XLSX.utils.encode_cell({ r, c: headers.indexOf("Số tiền") });
      if (ws[ref]) ws[ref].z = "#,##0";
    }
    return ws;
  };

  const deposit = lines.filter((l) => l.voucher === "TIEN_GUI");
  const cash = lines.filter((l) => l.voucher === "TIEN_MAT");

  XLSX.utils.book_append_sheet(
    wb,
    templateSheet("FILE MẪU PHIẾU THU TIỀN GỬI ĐỂ NHẬP VÀO PHẦN MỀM AMIS ACCOUNTING", DEPOSIT_HEADERS, deposit.map(depositRow), 9),
    "Phieu thu tien gui",
  );
  XLSX.utils.book_append_sheet(
    wb,
    templateSheet("FILE MẪU PHIẾU THU TIỀN MẶT ĐỂ NHẬP VÀO PHẦN MỀM AMIS ACCOUNTING", CASH_HEADERS, cash.map(cashRow), 10),
    "Phieu thu tien mat",
  );

  const reviewHeaders = ["Loại phiếu", "Nguồn tiền", "Ngày tiền về", "Mã phiếu / đơn", "Mã GD OnePay", "TK ảo", "Mã VP", "Tên đối tượng", "TK Có", "Số tiền"];
  const review = XLSX.utils.aoa_to_sheet([reviewHeaders, ...lines.map(reviewRow)]);
  review["!cols"] = reviewHeaders.map((h) => ({ wch: h === "Tên đối tượng" ? 32 : 20 }));
  XLSX.utils.book_append_sheet(wb, review, "Doi chieu");

  XLSX.writeFile(wb, `${filename}.xlsx`, { compression: true });
}
