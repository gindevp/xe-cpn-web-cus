import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/PageBits";
import { useStore } from "@/lib/store";
import {
  findOfficeByToken,
  officeName,
  orderReceiverOffice,
  receiverOfficeName,
  type Order,
} from "@/lib/mock-data";
import {
  displayOrderNote,
  orderGoodsLabel,
  packageLabelCode,
  packageNameOf,
  packageNoteOf,
  packageRows,
  packageSeqList,
} from "@/lib/package-label";
import { customerCollectDue } from "@/lib/finance-debt";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";

/** Square label — 105 × 105 mm khi in. */
const SHEET_MM = 105;
/** On-screen only — print stays 105×105 mm. */
const PREVIEW_SCALE = 1.55;

/** Font mẫu: Arimo (Google Fonts, cùng họ Arial). */
const LABEL_FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Arimo:wght@400;700&display=block";

/**
 * Tem 105×105 — scoped `.xe-label` để không bị CSS M3 (`.sheet` gap/padding,
 * `.code` màu primary…) phá preview trên cus.
 */
const SHEET_CSS = `
.xe-label{
  box-sizing:border-box;
  width:${SHEET_MM}mm;
  height:${SHEET_MM}mm;
  max-width:${SHEET_MM}mm;
  max-height:${SHEET_MM}mm;
  aspect-ratio:1 / 1;
  overflow:hidden;
  background:#fff;
  color:#000;
  border:0.35mm solid #000;
  border-radius:0;
  box-shadow:none;
  gap:0;
  font-family:Arimo,Arial,Helvetica,sans-serif;
  padding:1.8mm 2.8mm 1.2mm;
  display:flex;
  flex-direction:column;
  line-height:1.05;
}
.xe-label .grow{flex:1;min-width:0}
.xe-label .b{font-weight:700}
.xe-label .sec{border-bottom:0.45mm dashed #000;flex-shrink:0}
.xe-label .clamp{
  overflow:hidden;
  word-break:break-word;
  display:-webkit-box;
  -webkit-box-orient:vertical;
  -webkit-line-clamp:2;
}
.xe-label .clamp1{
  overflow:hidden;
  white-space:nowrap;
  text-overflow:ellipsis;
}
.xe-label .head{
  display:flex;
  align-items:stretch;
  padding-bottom:0.5mm;
  gap:0;
}
.xe-label .hub-col{
  width:28mm;
  flex-shrink:0;
  border-right:0.45mm dashed #000;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:flex-start;
  gap:0;
  padding:0.2mm 1.2mm 0 0;
  box-sizing:border-box;
}
.xe-label .hub{
  flex:1;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:42.75pt;
  font-weight:700;
  line-height:0.85;
  letter-spacing:-0.04em;
  text-align:center;
  max-width:100%;
  overflow:hidden;
  word-break:break-all;
  color:#000;
}
.xe-label .hub-time{
  flex-shrink:0;
  margin-top:auto;
  padding-top:0.8mm;
  width:100%;
  font-size:5.5pt;
  font-weight:400;
  line-height:1.2;
  text-align:center;
  white-space:nowrap;
  color:#000;
}
.xe-label .code-col{
  flex:1;
  min-width:0;
  padding-left:1.5mm;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:flex-start;
  gap:0.4mm;
}
.xe-label .code{
  padding:0;
  border:0;
  background:none;
  color:#000;
  cursor:default;
  text-decoration:none;
  font-size:18.75pt;
  font-weight:700;
  line-height:1.05;
  text-align:center;
  letter-spacing:0.01em;
  max-width:100%;
  overflow:hidden;
  white-space:nowrap;
  text-overflow:ellipsis;
}
.xe-label .code-col img{width:28mm;height:28mm;flex-shrink:0}
.xe-label .route{
  font-size:8.25pt;
  font-weight:400;
  line-height:1.15;
  padding:0.35mm 0;
  color:#000;
}
.xe-label .pay-block{padding:0.35mm 0 0.25mm}
.xe-label .pay-row{
  display:flex;
  justify-content:space-between;
  align-items:baseline;
  gap:3mm;
}
.xe-label .pay-status{
  font-size:17.25pt;
  font-weight:700;
  line-height:1.05;
  letter-spacing:0.02em;
  flex-shrink:0;
  color:#000;
}
.xe-label .pay-fare{
  display:flex;
  align-items:baseline;
  gap:2.5mm;
  flex-shrink:0;
  padding-top:0;
}
.xe-label .pay-fare .lbl{font-size:8.25pt;font-weight:400;line-height:1.1;white-space:nowrap}
.xe-label .pay-fare .amt{font-size:9.75pt;font-weight:700;line-height:1.1;white-space:nowrap}
.xe-label .money{
  display:flex;
  justify-content:space-between;
  align-items:baseline;
  gap:2mm;
  padding:0.15mm 0 0.15mm;
}
.xe-label .money .lbl{font-size:8.25pt;font-weight:400;line-height:1.1}
.xe-label .money .amt{font-size:9.75pt;font-weight:700;line-height:1.1;white-space:nowrap}
.xe-label .total{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:2mm;
  padding-top:0.15mm;
  min-height:0;
}
.xe-label .total .lbl{font-size:9.75pt;font-weight:700;line-height:1.05}
.xe-label .total .amt{
  font-size:27.75pt;
  font-weight:700;
  line-height:0.95;
  letter-spacing:-0.02em;
  white-space:nowrap;
}
.xe-label .warn{
  font-size:8.25pt;
  font-weight:400;
  line-height:1.1;
  padding:0.3mm 0;
  text-transform:uppercase;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  color:#000;
}
.xe-label .recv-block{
  flex:0 1 auto;
  min-height:0;
  display:flex;
  flex-direction:column;
  align-items:flex-start;
  justify-content:flex-start;
  gap:0.25mm;
  padding:1.2mm 0 0.15mm;
  overflow:hidden;
  color:#000;
}
.xe-label .recv-block .name,
.xe-label .recv-block .phone,
.xe-label .recv-block .addr,
.xe-label .recv-block .note{
  flex-shrink:0;
  width:100%;
  max-width:100%;
  overflow:hidden;
  white-space:nowrap;
  text-overflow:ellipsis;
  color:#000;
}
.xe-label .recv-block .name{
  font-size:20pt;
  font-weight:700;
  line-height:1.15;
  text-transform:uppercase;
  padding-top:0.3mm;
}
.xe-label .recv-block .phone{
  font-size:20pt;
  font-weight:700;
  line-height:1.05;
  letter-spacing:0.04em;
}
.xe-label .recv-block .addr,
.xe-label .recv-block .note{
  display:block;
  font-weight:400;
  line-height:1.15;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.xe-label .recv-block .addr{font-size:8.25pt}
.xe-label .recv-block .note{font-size:7.75pt}
.xe-label .goods{
  display:flex;
  align-items:baseline;
  gap:2mm;
  padding-top:0.2mm;
  margin-top:0;
  flex-shrink:0;
  color:#000;
}
.xe-label .goods .txt{
  flex:1;
  min-width:0;
  font-size:9.75pt;
  font-weight:700;
  line-height:1.2;
  overflow:hidden;
  display:-webkit-box;
  -webkit-box-orient:vertical;
  -webkit-line-clamp:2;
  max-height:7.5mm;
}
.xe-label .goods .kg{font-size:9.75pt;font-weight:700;white-space:nowrap;flex-shrink:0}
.xe-label .foot{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:1.5mm;
  border-top:0.45mm dashed #000;
  margin-top:0.35mm;
  padding-top:0.45mm;
  flex-shrink:0;
  line-height:1.1;
  color:#000;
}
.xe-label .foot .hotline{font-size:8.75pt;font-weight:700;white-space:nowrap}
.xe-label .foot .confirm{flex:1;text-align:center;font-size:6.25pt;font-weight:400}
.xe-label .foot .stamp{font-size:6.25pt;font-weight:400;white-space:nowrap}
.xe-label img{display:block;max-width:100%}
`;

const PRINT_CSS = `
@page{size:${SHEET_MM}mm ${SHEET_MM}mm;margin:0}
html,body{margin:0!important;padding:0!important;background:#fff}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
${SHEET_CSS}
@media print{
  html,body{width:${SHEET_MM}mm;margin:0;padding:0}
  .xe-label{
    page-break-inside:avoid;
    break-inside:avoid;
    page-break-after:always;
    break-after:page;
  }
  .xe-label:last-child{
    page-break-after:auto;
    break-after:auto;
  }
}
`;

const VND = new Intl.NumberFormat("vi-VN");

/** Chờ Arimo tải xong trong iframe in (tối đa 3 s). */
function labelFontReady(doc: Document): Promise<void> {
  const loaded = new Promise<void>((resolve) => {
    const link = doc.getElementById("label-font") as HTMLLinkElement | null;
    if (!link) return resolve();
    const done = () => {
      void Promise.all(["400", "700"].map((w) => doc.fonts.load(`${w} 10pt Arimo`, "ĐÃ THU Cước")))
        .catch(() => undefined)
        .finally(() => resolve());
    };
    if (link.sheet) done();
    else {
      link.onload = done;
      link.onerror = () => resolve();
    }
  });
  return Promise.race([loaded, new Promise<void>((r) => window.setTimeout(r, 3000))]);
}

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mmToPx(mm: number): number {
  return Math.round((mm / 25.4) * 96);
}

async function qrDataUrl(code: string): Promise<string> {
  try {
    return await QRCode.toDataURL(code, {
      margin: 1,
      width: 480,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch {
    return "";
  }
}

function useQrImage(code: string | null) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    if (!code) {
      setQr("");
      return;
    }
    let alive = true;
    void qrDataUrl(code).then((url) => alive && setQr(url));
    return () => {
      alive = false;
    };
  }, [code]);
  return qr;
}

/** Mã VP nhận — góc trái tem: bỏ tiền tố VP_ và hậu tố _XX. */
function destOfficeCode(order: Order): string {
  const toToken = orderReceiverOffice(order) || order.toOffice;
  const office = findOfficeByToken(toToken);
  const raw = (office?.code || toToken || "").trim();
  if (!raw) return "—";
  const short = raw
    .replace(/^VP[_-]?/i, "")
    .replace(/_[A-Za-z0-9]+$/i, "")
    .trim();
  return (short || raw).toUpperCase();
}

/** Tuyến trên tem: tên VP gửi → tên VP nhận. */
function routeNamesLabel(order: Order): string {
  const from = (order.fromOffice ? officeName(order.fromOffice) : "") || order.fromOffice || "—";
  const toToken = orderReceiverOffice(order) || order.toOffice;
  const to =
    receiverOfficeName(order) ||
    (toToken ? officeName(toToken) : "") ||
    toToken ||
    "—";
  return `${from} → ${to}`;
}

function formatPrintStamp(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  const time = d.toLocaleTimeString("vi-VN", { hour12: false });
  return `${time} ${dd}/${mm}/${yyyy}`;
}

function formatIsoStamp(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : formatPrintStamp(d);
}

function sheetHtml(
  order: Order,
  qr: string,
  packageSeq: number | undefined,
  printedAt: Date,
  reprintCount?: number,
) {
  const stamp = formatPrintStamp(printedAt);
  const createdStamp = formatIsoStamp(order.createdAt) || stamp;
  const reprint =
    reprintCount != null && reprintCount > 0 ? ` · In lại #${reprintCount}` : "";
  const routeLine = routeNamesLabel(order);
  const hub = destOfficeCode(order);
  const cod = Math.max(0, order.codAmount ?? 0);
  const isPackage = packageSeq != null && packageSeq >= 1;
  const senderNote = [packageNoteOf(order, isPackage ? packageSeq : undefined), displayOrderNote(order.note).trim()]
    .filter(Boolean)
    .join(" · ");
  const shelf = order.shelf != null ? String(order.shelf) : "";
  // Khớp «Còn phải thu» chi tiết đơn (OrderHistoryDialog.remaining).
  const fareDue = customerCollectDue(order);
  const remaining = fareDue > 0 ? fareDue : cod > 0 ? cod : 0;
  const collected = remaining <= 0;
  const payStatus = collected ? "ĐÃ THU" : "CHƯA THU";
  const codFeeDue = fareDue > 0 && cod > 0 ? Math.min(Math.max(0, order.codFee ?? 0), fareDue) : 0;
  // Cước hàng: còn nợ → phần cước còn thu; đã thu đủ → vẫn in cước đơn (fare).
  const fareLine = fareDue > 0
    ? Math.max(0, fareDue - codFeeDue)
    : Math.max(0, order.fare ?? 0);
  const totalDue = remaining;
  // Cước hàng nằm bên phải cùng hàng ĐÃ THU / CHƯA THU (theo mẫu).
  const fareRight =
    fareLine > 0
      ? `<div class="pay-fare"><span class="lbl">Cước hàng</span><span class="amt">${esc(VND.format(fareLine))} đ</span></div>`
      : "";
  const feeLines: string[] = [];
  if (cod > 0) {
    feeLines.push(
      `<div class="money"><span class="lbl">Thu hộ</span><span class="amt">${esc(VND.format(cod))} đ</span></div>`,
    );
  }
  if (codFeeDue > 0) {
    feeLines.push(
      `<div class="money"><span class="lbl">Phí thu hộ</span><span class="amt">${esc(VND.format(codFeeDue))} đ</span></div>`,
    );
  }
  const pkg = isPackage ? packageRows(order)[packageSeq - 1] : undefined;
  const weightNum = pkg?.weightKg ?? order.weightKg ?? 0;
  const weight = Number.isFinite(weightNum) ? Number(weightNum).toFixed(1) : "0.0";
  const content = isPackage ? packageNameOf(order, packageSeq!) : orderGoodsLabel(order);
  const titleCode = isPackage ? packageLabelCode(order, packageSeq) : order.code;
  const phone = (order.receiverPhone ?? "").trim();
  const name = (order.receiverName ?? "").trim();
  const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
  const addr = order.homeDelivery ? oneLine(order.address ?? "") : "";
  const addrLine = addr
    ? addr
    : order.homeDelivery
      ? "Địa chỉ giao tận nơi (nếu có)"
      : "";
  const noteLine = senderNote ? oneLine(senderNote) : "";

  return `<div class="xe-label">
    <div class="head sec">
      <div class="hub-col">
        <div class="hub">${esc(hub)}</div>
        <div class="hub-time">Ngày tạo: ${esc(createdStamp)}</div>
      </div>
      <div class="code-col">
        <div class="code">${esc(titleCode)}</div>
        ${qr ? `<img src="${qr}" alt="QR"/>` : `<div style="width:28mm;height:28mm"></div>`}
      </div>
    </div>
    <div class="route sec clamp1">${esc(routeLine)}</div>
    <div class="pay-block sec">
      <div class="pay-row">
        <div class="pay-status">${esc(payStatus)}${
          shelf ? `<span style="font-size:9.35pt;font-weight:700;margin-left:2mm">Kệ ${esc(shelf)}</span>` : ""
        }</div>
        ${fareRight}
      </div>
      ${feeLines.join("")}<div class="total"><span class="lbl">Tổng cần thu</span><span class="amt">${esc(VND.format(totalDue))} đ</span></div>
    </div>
    <div class="warn sec">KHÔNG CHO XEM HÀNG, KIỂM TRA KĨ NGOẠI QUAN TRƯỚC KHI NHẬN</div>
    <div class="recv-block">
      <div class="name">${esc(name || "—")}</div>
      ${phone ? `<div class="phone">${esc(phone)}</div>` : ""}
      ${addrLine ? `<div class="addr">${esc(addrLine)}</div>` : ""}
      ${noteLine ? `<div class="note"><span class="b">Ghi chú:</span> ${esc(noteLine)}</div>` : ""}
    </div>
    <div class="goods">
      <div class="txt">Nội dung: ${esc(content)}</div>
      <div class="kg">${esc(weight)} KG</div>
    </div>
    <div class="foot">
      <span class="hotline">1900 1155</span>
      <span class="confirm">Xác nhận đã nhận hàng nguyên vẹn</span>
      <span class="stamp">In: ${esc(stamp)}${esc(reprint)}</span>
    </div>
  </div>`;
}

function printSheet(html: string, title: string) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    toast.error("Không mở được cửa sổ in");
    return;
  }
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(title)}</title><link id="label-font" rel="stylesheet" href="${LABEL_FONT_HREF}"/><style>${PRINT_CSS}</style></head><body>${html}</body></html>`,
  );
  doc.close();

  const cleanup = () => {
    win.onafterprint = null;
    iframe.remove();
  };
  win.onafterprint = cleanup;
  window.setTimeout(cleanup, 60_000);

  const run = () => {
    win.focus();
    win.print();
  };
  const imgs = Array.from(doc.images);
  Promise.all([
    labelFontReady(doc),
    ...imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) resolve();
          else {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }
        }),
    ),
  ]).then(() => window.setTimeout(run, 80));
}

/** Ghép mọi tem kiện thành một job in (mỗi kiện 1 trang 105×105). */
async function buildBatchSheetsHtml(
  order: Order,
  seqs: number[],
  printedAt: Date,
  reprintCount?: number,
): Promise<string> {
  const parts: string[] = [];
  for (const seq of seqs) {
    const scan = packageLabelCode(order, seq);
    const qr = await qrDataUrl(scan);
    if (!qr) continue;
    parts.push(sheetHtml(order, qr, seq, printedAt, reprintCount));
  }
  return parts.join("");
}

function SheetPreview({ html, px, scale }: { html: string; px: string; scale: number }) {
  return (
    <div className="shrink-0 overflow-hidden rounded-sm bg-white shadow-md" style={{ width: px, height: px }}>
      <div
        style={{
          width: `${SHEET_MM}mm`,
          height: `${SHEET_MM}mm`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <style>{SHEET_CSS}</style>
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}

export function PrintLabelDialog({
  code,
  packageSeq,
  /** In hàng loạt mọi kiện của đơn — một lần in tất cả trang. */
  batchPackages,
  /** Mở dialog là in luôn tất cả kiện (Tạo và in). */
  autoPrint,
  open,
  onOpenChange,
}: {
  code: string | null;
  /** In tem kiện lẻ — mã quét = mã đơn_STT */
  packageSeq?: number | null;
  batchPackages?: boolean;
  autoPrint?: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const orders = useStore((s) => s.orders);
  const logOrderEvent = useStore((s) => s.logOrderEvent);
  const order = code ? orders.find((o) => o.code === code) : null;
  const batchSeqs = useMemo(
    () => (batchPackages && order ? packageSeqList(order) : []),
    [batchPackages, order],
  );
  const batchKey = batchSeqs.join(",");
  /** QR từng kiện cho danh sách xem trước dọc (tạo một lần mỗi khi mở / đổi số kiện). */
  const [batchQrs, setBatchQrs] = useState<Record<number, string>>({});
  useEffect(() => {
    if (!open || !batchPackages || !order) {
      setBatchQrs({});
      return;
    }
    let alive = true;
    void (async () => {
      const out: Record<number, string> = {};
      for (const seq of batchSeqs) {
        const scan = packageLabelCode(order, seq);
        out[seq] = await qrDataUrl(scan);
      }
      if (alive) setBatchQrs(out);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, batchPackages, order?.code, batchKey]);

  const activeSeq = !batchPackages && packageSeq != null && packageSeq >= 1 ? packageSeq : null;
  const scanCode =
    order && activeSeq != null && activeSeq >= 1
      ? packageLabelCode(order, activeSeq)
      : order?.code ?? null;
  const isPackageLabel = activeSeq != null && activeSeq >= 1;
  const qr = useQrImage(scanCode);
  /** Preview uses live clock; actual print regenerates stamp at press time. */
  const [previewClock, setPreviewClock] = useState(() => new Date());
  useEffect(() => {
    if (!open) return;
    setPreviewClock(new Date());
    const id = window.setInterval(() => setPreviewClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [open, code, activeSeq]);

  const html = useMemo(
    () =>
      order && qr
        ? sheetHtml(order, qr, isPackageLabel ? activeSeq! : undefined, previewClock, undefined)
        : "",
    [order, qr, isPackageLabel, activeSeq, previewClock],
  );

  const printOne = (seq: number | null, qrImg: string) => {
    if (!order || !qrImg) return;
    const printedAt = new Date();
    const reprint =
      order.labelPrintedAt != null ? (order.labelReprintCount ?? 0) + 1 : 0;
    const printHtml = sheetHtml(
      order,
      qrImg,
      seq != null && seq >= 1 ? seq : undefined,
      printedAt,
      reprint > 0 ? reprint : undefined,
    );
    const pkgLabel = seq != null && seq >= 1 ? packageLabelCode(order, seq) : order.code;
    const label = seq ? `Kiện ${pkgLabel}` : `Hóa đơn ${order.code}`;
    printSheet(printHtml, label);
    const stamp = formatPrintStamp(printedAt);
    const detail =
      seq != null && seq >= 1
        ? `Kiện ${pkgLabel} · ${stamp}${reprint > 0 ? ` · In lại #${reprint}` : ""}`
        : `${stamp}${reprint > 0 ? ` · In lại #${reprint}` : ""}`;
    logOrderEvent(order.code, "PRINT", detail);
    toast.success(`Đang in tem 105×105 mm · ${label}`);
  };
  const doPrint = () => printOne(isPackageLabel ? activeSeq : null, qr);

  const [printingAll, setPrintingAll] = useState(false);
  const autoPrintedFor = useRef<string | null>(null);

  const doPrintAllPackages = async () => {
    if (!order || !batchSeqs.length) return;
    setPrintingAll(true);
    try {
      const printedAt = new Date();
      const reprint =
        order.labelPrintedAt != null ? (order.labelReprintCount ?? 0) + 1 : 0;
      const html = await buildBatchSheetsHtml(
        order,
        batchSeqs,
        printedAt,
        reprint > 0 ? reprint : undefined,
      );
      if (!html) {
        toast.error("Không tạo được tem kiện");
        return;
      }
      printSheet(html, `Tem kiện ${order.code} (${batchSeqs.length})`);
      const stamp = formatPrintStamp(printedAt);
      for (const seq of batchSeqs) {
        const pkgLabel = packageLabelCode(order, seq);
        logOrderEvent(
          order.code,
          "PRINT",
          `Kiện ${pkgLabel} · ${stamp}${reprint > 0 ? ` · In lại #${reprint}` : ""} · hàng loạt`,
        );
      }
      toast.success(`Đang in ${batchSeqs.length} tem kiện · ${order.code}`);
    } catch (e: any) {
      toast.error(e?.message || "Không in được hàng loạt");
    } finally {
      setPrintingAll(false);
    }
  };

  /** Tạo và in: mở dialog → in một lần tất cả kiện (không next từng tờ). */
  useEffect(() => {
    if (!open) {
      autoPrintedFor.current = null;
      return;
    }
    if (!autoPrint || !batchPackages || !order || batchSeqs.length < 1) return;
    if (autoPrintedFor.current === order.code) return;
    autoPrintedFor.current = order.code;
    const t = window.setTimeout(() => {
      void doPrintAllPackages();
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoPrint, batchPackages, order?.code, batchSeqs.length]);

  // Callback ref: khung xem trước nằm trong portal của Dialog, mount sau effect của component.
  const [previewBox, previewBoxRef] = useState<HTMLDivElement | null>(null);
  const [previewBoxW, setPreviewBoxW] = useState(0);
  useEffect(() => {
    if (!previewBox) return;
    const update = () => setPreviewBoxW(previewBox.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(previewBox);
    return () => ro.disconnect();
  }, [previewBox]);
  const sheetPx = mmToPx(SHEET_MM);
  const previewScale =
    previewBoxW > 0 ? Math.max(0.5, Math.min(PREVIEW_SCALE, (previewBoxW - 16) / sheetPx)) : PREVIEW_SCALE;
  const previewPx = `${Math.floor(sheetPx * previewScale)}px`;
  const batchTotal = batchSeqs.length;
  const inBatch = batchPackages && batchTotal > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[92vh] sm:w-[min(96vw,740px)] sm:max-w-[740px] sm:rounded-lg">
        <DialogHeader className="shrink-0 space-y-1 border-b px-4 py-3 pr-11 text-left sm:border-b-0 sm:px-6 sm:pb-2 sm:pt-6">
          <DialogTitle className="text-base leading-snug sm:text-lg">
            {inBatch
              ? `In tem kiện · ${order?.code ?? ""} (${batchTotal} kiện)`
              : activeSeq
                ? `In tem kiện · ${order ? packageLabelCode(order, activeSeq) : ""}`
                : `In hóa đơn ${order ? `· ${order.code}` : ""}`}
          </DialogTitle>
          <p className="text-xs text-muted-foreground sm:text-sm">
            <span className="sm:hidden">Tem vuông 105 × 105 mm{inBatch && batchTotal > 1 ? " — cuộn để xem từng kiện" : ""}.</span>
            <span className="hidden sm:inline">
              {inBatch
                ? "Tất cả tem kiện xếp dọc — cuộn để xem. In một lần tất cả (mỗi kiện một trang 105×105 mm) hoặc in lẻ từng tem."
                : "Khổ vuông 105 × 105 mm — 1 trang. Trong hộp thoại in chọn 105×105 mm (hoặc Custom), lề Không."}
            </span>
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 sm:px-6 sm:py-2">
        {!order ? (
          <EmptyState>Không tìm thấy đơn</EmptyState>
        ) : inBatch ? (
          <div ref={previewBoxRef} className="space-y-4 rounded-md bg-muted/40 p-2 sm:p-5">
            {batchSeqs.map((seq, i) => {
              const qrImg = batchQrs[seq];
              return (
                <div key={seq} className="flex flex-col items-center gap-2">
                  <div className="flex w-full items-center justify-between gap-2 text-xs text-muted-foreground" style={{ maxWidth: previewPx }}>
                    <span>
                      <span className="font-mono font-medium text-foreground">{packageLabelCode(order, seq)}</span> ({i + 1}/{batchTotal})
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className={batchTotal > 1 ? "h-7 gap-1.5 text-xs" : "hidden"}
                      disabled={!qrImg || printingAll}
                      onClick={() => qrImg && printOne(seq, qrImg)}
                    >
                      <Printer className="h-3.5 w-3.5" /> In tem này
                    </Button>
                  </div>
                  <SheetPreview
                    html={qrImg ? sheetHtml(order, qrImg, seq, previewClock) : ""}
                    px={previewPx}
                    scale={previewScale}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div ref={previewBoxRef} className="flex justify-center rounded-md bg-muted/40 p-2 sm:p-5">
            <SheetPreview html={html} px={previewPx} scale={previewScale} />
          </div>
        )}
        </div>

        <DialogFooter className="shrink-0 flex-wrap gap-2 border-t bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:justify-between sm:space-x-0 sm:border-t-0 sm:px-6 sm:pb-6">
          <Button variant="outline" className="h-11 sm:h-10" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
            {inBatch ? (
              <>
                <Button
                  type="button"
                  className="col-span-2 h-11 gap-2 sm:h-10"
                  onClick={() => void doPrintAllPackages()}
                  disabled={!order || batchTotal < 1 || printingAll}
                >
                  <Printer className="h-4 w-4" />
                  {printingAll ? "Đang in…" : batchTotal > 1 ? `In tất cả ${batchTotal} kiện` : "In tem"}
                </Button>
              </>
            ) : (
              <Button className="col-span-2 h-11 gap-2 sm:h-10" onClick={doPrint} disabled={!order || !html}>
                <Printer className="h-4 w-4" /> In tem
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
