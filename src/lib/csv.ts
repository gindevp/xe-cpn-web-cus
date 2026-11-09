// CSV + Excel (SpreadsheetML .xls) — không cần thêm thư viện.

type CsvCell = string | number | boolean | null | undefined;
export type ExcelSheet = { name: string; headers: string[]; rows: CsvCell[][] };
export type ExportFormat = "csv" | "excel";

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  // SĐT / MST / số dài / ngày giờ: ép Excel mở CSV giữ dạng chữ → ="..."
  // (ngày ≤12 Excel hay đảo MM/DD nếu để auto-parse).
  if (
    s !== "" &&
    (/^0\d/.test(s) ||
      /^\d{10,}$/.test(s) ||
      /^\d{1,2}\/\d{1,2}\/\d{4}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/.test(s))
  ) {
    return `"=""${s.replace(/"/g, '""')}"""`;
  }
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function xmlEscape(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cellType(v: unknown): "Number" | "String" {
  return typeof v === "number" && Number.isFinite(v) ? "Number" : "String";
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function baseName(filename: string) {
  return filename.replace(/\.(csv|xlsx|xls)$/i, "");
}

function sheetFileSuffix(name: string) {
  return name.replace(/[:\\/?*[\]]/g, "_").replace(/\s+/g, "-").slice(0, 40) || "sheet";
}

function safeSheetName(name: string, index: number) {
  const cleaned = (name || `Sheet${index + 1}`).replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31);
  return cleaned || `Sheet${index + 1}`;
}

function rowsToCsv(rows: CsvCell[][]): string {
  return "\uFEFF" + rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}

function sheetToXmlTable(headers: string[] | undefined, rows: CsvCell[][]): string {
  const all = [...(headers?.length ? [headers] : []), ...(rows ?? [])];
  const xmlRows = all
    .map((row) => {
      const cells = (row ?? [])
        .map((c) => {
          const t = cellType(c);
          const raw = t === "Number" ? String(c) : xmlEscape(c);
          return `<Cell><Data ss:Type="${t}">${raw}</Data></Cell>`;
        })
        .join("");
      return `<Row>${cells}</Row>`;
    })
    .join("");
  return `<Table>${xmlRows}</Table>`;
}

/** Workbook SpreadsheetML — Excel / LibreOffice mở được (.xls). */
function sheetsToSpreadsheetMl(sheets: ExcelSheet[]): string {
  const used = new Set<string>();
  const parts = sheets.map((s, i) => {
    let name = safeSheetName(s.name, i);
    if (used.has(name)) name = `${name.slice(0, 28)}_${i + 1}`;
    used.add(name);
    return `<Worksheet ss:Name="${xmlEscape(name)}">${sheetToXmlTable(s.headers, s.rows)}</Worksheet>`;
  });
  return (
    `<?xml version="1.0"?>\n` +
    `<?mso-application progid="Excel.Sheet"?>\n` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
    `xmlns:o="urn:schemas-microsoft-com:office:office" ` +
    `xmlns:x="urn:schemas-microsoft-com:office:excel" ` +
    `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" ` +
    `xmlns:html="http://www.w3.org/TR/REC-html40">` +
    parts.join("") +
    `</Workbook>`
  );
}

/** Xuất một file CSV (UTF-8 BOM). */
export function downloadCSV(filename: string, rows: CsvCell[][]) {
  const blob = new Blob([rowsToCsv(rows)], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, `${baseName(filename)}.csv`);
}

function downloadSpreadsheet(filename: string, sheets: ExcelSheet[]) {
  const list = sheets.filter((s) => s && (s.headers?.length || s.rows?.length));
  if (!list.length) return;
  const xml = sheetsToSpreadsheetMl(list);
  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  triggerDownload(blob, `${baseName(filename)}.xls`);
}

/** Một bảng → CSV hoặc Excel (.xls). */
export function downloadExcel(
  filename: string,
  headers: string[],
  rows: CsvCell[][],
  format: ExportFormat = "csv",
) {
  if (format === "excel") {
    downloadSpreadsheet(filename, [{ name: "Sheet1", headers, rows }]);
    return;
  }
  downloadCSV(filename, [headers, ...rows]);
}

/** Xuất đúng các dòng đã dựng (dòng đầu thường là tiêu đề). */
export function downloadExcelRows(
  filename: string,
  rows: CsvCell[][],
  sheetName = "Sheet1",
  format: ExportFormat = "csv",
) {
  if (format === "excel") {
    // Giữ nguyên mọi dòng (kể cả tiêu đề mục) — không tách header.
    downloadSpreadsheet(filename, [{ name: sheetName, headers: [], rows }]);
    return;
  }
  downloadCSV(filename, rows);
}

/**
 * Nhiều sheet.
 * - excel: một file .xls nhiều worksheet
 * - csv: mỗi sheet một file (bỏ sheet không có dòng dữ liệu)
 */
export function downloadExcelSheets(
  filename: string,
  sheets: ExcelSheet[],
  format: ExportFormat = "csv",
) {
  const withData = sheets.filter((s) => s && Array.isArray(s.rows) && s.rows.length > 0);
  if (!withData.length) return;

  if (format === "excel") {
    downloadSpreadsheet(filename, withData);
    return;
  }

  const base = baseName(filename);
  withData.forEach((s, i) => {
    const rows: CsvCell[][] = [s.headers ?? [], ...s.rows];
    const name = withData.length === 1 ? base : `${base}_${sheetFileSuffix(s.name || `sheet${i + 1}`)}`;
    window.setTimeout(() => downloadCSV(name, rows), i * 250);
  });
}
