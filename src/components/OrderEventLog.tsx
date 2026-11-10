import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ImageLightbox } from "@/components/ImageLightbox";
import { StaffInfoPopover } from "@/components/StaffInfoPopover";
import { fetchOrderGoodsPhoto } from "@/lib/api/domain-api";
import { orderEventParts } from "@/lib/finance-debt";

export type OrderLogEvent = {
  at: string;
  by?: string;
  byStaffCode?: string;
  byName?: string;
  action: string;
  detail?: string;
};

type Tone = "ok" | "warn" | "bad" | "";
type Change = { field: string; from: string; to: string };

const ICONS: Array<[RegExp, string]> = [
  [/^(CREATED?|DRAFT_CREATE)$/, "add_circle"],
  [/^CONFIRM(ED)?$/, "check_circle"],
  [/^GOODS_PHOTO$/, "photo_camera"],
  [/^(WH_IN|WAREHOUSE_RECEIVE|HUB_IN|TRANSIT_HUB_IN)$/, "inventory_2"],
  [/^PICKUP_START(ED)?$/, "directions_run"],
  [/^PICKUP_RECEIVED$/, "inventory"],
  [/^(ASSIGN_TRIP|SCAN_OUT)$/, "local_shipping"],
  [/^REASSIGN_TRIP$/, "swap_horiz"],
  [/^(SCAN_REMOVE|UNLOAD_BACK)$/, "move_down"],
  [/^(SCAN_IN|DEST_WH_IN|AT_DEST|REDELIVER_IN|STALE_DEST_REVERT)$/, "warehouse"],
  [/^AUTO_CALL_ERROR$/, "phone_disabled"],
  [/^AUTO_CALL/, "phone_in_talk"],
  [/^ZNS/, "chat"],
  [/^(HANDOVER|HANDOVER_DRIVER|KY_BAN_GIAO_TAI_XE)$/, "draw"],
  [/^PAYMENT_TERM_CHANGE$/, "currency_exchange"],
  [/^COD_FEE_REFUND$/, "undo"],
  [/^DECLARED_FEE_KEEP$/, "price_change"],
  [/^RECEIPT_CANCEL$/, "cancel"],
  [/^RECEIPT_CONFIRM/, "fact_check"],
  [/^(RECEIPT_CREATED?|ONEPAY_RECEIPT)$/, "receipt"],
  [/^ONEPAY/, "qr_code_2"],
  [/^DEST_REROUTE$/, "edit_location"],
  [/^(OUT_FOR_DELIVERY|DELIVERING|TAKE_JOB)$/, "delivery_dining"],
  [/^(PUSH_SHIP|AHAMOVE_BOOK|AHAMOVE_PICKUP|AHAMOVE_SHIP_CONFIRM)$/, "two_wheeler"],
  [/^POD_OWNER$/, "badge"],
  [/^(POD|POD_QUAY|POD_HOME|DELIVERED|RT_DONE)$/, "task_alt"],
  [/^(FAIL|FAIL_48H|FAIL_MAX|FAILED|STALE_DEST)$/, "assignment_late"],
  [/^REDELIVER_WAIT$/, "schedule"],
  [/^CANCEL_REQUEST$/, "contract_delete"],
  [/^CANCEL_REJECT$/, "undo"],
  [/^(CANCELLED|CANCEL|AUTO_CANCEL)$/, "cancel"],
  [/^(RESTORE|ISSUE_RESTORE_WH)$/, "verified"],
  [/^ISSUE_/, "report"],
  [/^PRINT$/, "print"],
  [/^(ORDER_EDIT|PATCH|PACKAGE_)/, "edit"],
  [/^LEG_/, "alt_route"],
  [/^RETURN_START$/, "assignment_return"],
  [/^RETURN_CANCEL$/, "undo"],
  [/^(PAYMENT|AHAMOVE_FEE)$/, "payments"],
  [/^(PAYMENT_FIX|PAID_FIX)$/, "price_change"],
  [/^(ROUTE_FIX|STATUS_FIX)$/, "build"],
  [/^GUEST_FARE_SYNC$/, "sync"],
  [/^INVOICE_/, "description"],
];

function iconOf(key: string): string {
  return ICONS.find(([re]) => re.test(key))?.[1] ?? "history";
}

function toneOf(key: string): Tone {
  if (/^(POD|POD_QUAY|POD_HOME|DELIVERED|RT_DONE|PAYMENT|ONEPAY_PAID|ONEPAY_ORDER_PAID)$/.test(key) || key.startsWith("RECEIPT_CONFIRM")) {
    return "ok";
  }
  if (/^(FAIL|FAIL_48H|FAIL_MAX|FAILED|STALE_DEST|CANCEL_REQUEST|RETURN_START|RECEIPT_CANCEL)$/.test(key)) return "warn";
  if (/^(CANCELLED|CANCEL|AUTO_CANCEL|ISSUE_EXCEPTION|ISSUE_LOST|ISSUE_DAMAGED)$/.test(key) || key.endsWith("_ERROR")) {
    return "bad";
  }
  return "";
}

const CHANGE_RE = /^([^:→]{1,48}):\s(.*?)\s→\s(.*)$/;

/** Sửa đơn (BE `OrderEditDiff`): `Trường: cũ → mới; …` + `· ghi chú km` ở cuối. */
function parseEditDetail(raw: string): { changes: Change[]; rest: string[] } {
  const changes: Change[] = [];
  const rest: string[] = [];
  const segs = raw.split("; ");
  segs.forEach((seg, i) => {
    let s = seg.trim();
    if (i === segs.length - 1) {
      const arrow = s.indexOf(" → ");
      const tail = s.lastIndexOf(" · ");
      if (arrow >= 0 && tail > arrow) {
        rest.push(s.slice(tail + 3).trim());
        s = s.slice(0, tail).trim();
      }
    }
    const m = CHANGE_RE.exec(s);
    if (m) changes.push({ field: m[1].trim(), from: m[2].trim(), to: m[3].trim() });
    else if (s) rest.push(s);
  });
  return { changes, rest };
}

function describe(e: OrderLogEvent): { title: string; detail: string; changes: Change[] } | null {
  const key = e.action.trim().toUpperCase();
  const parts = orderEventParts(e.action, e.detail);
  if (!parts) return null;
  const raw = (e.detail ?? "").trim();
  if ((key === "ORDER_EDIT" || key === "PATCH" || key === "PACKAGE_EDIT") && raw.includes(" → ")) {
    const { changes, rest } = parseEditDetail(raw);
    if (changes.length) {
      return { title: parts.title, detail: [`Sửa ${changes.length} mục`, ...rest].join(" · "), changes };
    }
  }
  if (key === "REASSIGN_TRIP") {
    const m = /^(.*?)\s→\s(.*)$/.exec(raw);
    if (m) return { title: parts.title, detail: "", changes: [{ field: "Chuyến", from: m[1].trim(), to: m[2].trim() }] };
  }
  if (key === "DEST_REROUTE") {
    const m = /^Đổi VP nhận (.*?)\s→\s(.*?)(?: \(hàng chuyển tay\))?(?: · (.*))?$/.exec(raw);
    if (m) {
      return {
        title: parts.title,
        detail: (m[3] ?? "").trim(),
        changes: [{ field: "VP nhận", from: m[1].trim(), to: m[2].trim() }],
      };
    }
  }
  return { title: parts.title, detail: parts.detail, changes: [] };
}

function isSystemActor(by?: string) {
  const s = (by ?? "").trim().toLowerCase();
  return !s || s === "system" || s === "anonymoususer";
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** `HH:mm dd/MM/yyyy`. */
export function formatLogTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Detail BE: `mã phiếu · số tiền` — mã phiếu mở Danh sách phiếu thu lọc sẵn phiếu đó. */
function ReceiptDetail({ detail, onLeave }: { detail: string; onLeave: () => void }) {
  const navigate = useNavigate();
  const [receiptCode, ...rest] = detail.split(" · ");
  return (
    <span className="od-log-detail">
      <button
        type="button"
        className="code"
        onClick={() => {
          onLeave();
          void navigate({ to: "/danh-sach-phieu-thu", search: { code: receiptCode.trim() } });
        }}
      >
        {receiptCode.trim()}
      </button>
      {rest.length ? ` · ${rest.join(" · ")}` : null}
    </span>
  );
}

function PhotoTile({ label, src, onOpen }: { label: string; src?: string; onOpen: () => void }) {
  return (
    <button type="button" className="od-ph" title={label} aria-label={label} onClick={onOpen}>
      {src ? <img src={src} alt="" /> : <span className="ms" aria-hidden="true">image</span>}
    </button>
  );
}

export function GoodsPhotoTile({ orderCode }: { orderCode: string }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const image = await fetchOrderGoodsPhoto(orderCode);
      if (!image) toast.error("Đơn không có ảnh");
      else setUrl(image);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không tải được ảnh");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PhotoTile label={busy ? "Đang tải ảnh…" : "Xem ảnh đơn hàng"} onOpen={() => void open()} />
      <ImageLightbox
        open={!!url}
        onOpenChange={(o) => {
          if (!o) setUrl(null);
        }}
        urls={url ? [url] : []}
        title={`Ảnh đơn hàng · ${orderCode}`}
      />
    </>
  );
}

function SignTile({ src }: { src: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PhotoTile label="Chữ ký tài xế" src={src} onOpen={() => setOpen(true)} />
      <ImageLightbox open={open} onOpenChange={setOpen} urls={[src]} title="Chữ ký tài xế" />
    </>
  );
}

/** Nhật ký tác động trong popup đơn — mới nhất ở trên, mỗi dòng icon theo thao tác. */
export function OrderEventLog({
  events,
  signs,
  orderCode,
  actorOf,
  onLeave,
}: {
  /** Thứ tự cũ → mới. */
  events: OrderLogEvent[];
  /** Ảnh chữ ký tài xế cùng chỉ số với `events`. */
  signs: Array<string | null | undefined>;
  orderCode?: string;
  /** "tài khoản · mã NV · họ tên". */
  actorOf: (e: OrderLogEvent) => string;
  /** Đóng popup trước khi chuyển màn. */
  onLeave: () => void;
}) {
  const rows = events
    .map((e, i) => ({ e, sign: signs[i] ?? null, info: describe(e) }))
    .filter((r): r is { e: OrderLogEvent; sign: string | null; info: NonNullable<ReturnType<typeof describe>> } => !!r.info)
    .reverse();

  return (
    <section className="order-box stack" aria-labelledby="od-log-title">
      <h2 id="od-log-title" className="group-title sec-title">
        <span className="sec-ic" aria-hidden="true">
          <span className="ms">history</span>
        </span>
        Nhật ký tác động ({rows.length})
      </h2>
      {rows.length === 0 ? (
        <div className="lab muted" style={{ padding: "8px 0" }}>
          Chưa có nhật ký tác động
        </div>
      ) : (
        <ol className="od-log">
          {rows.map(({ e, sign, info }, i) => {
            const key = e.action.trim().toUpperCase();
            const tone = toneOf(key);
            const system = isSystemActor(e.by);
            const who = system ? "Hệ thống" : actorOf(e) || (e.by ?? "");
            let detail: ReactNode = info.detail ? <span className="od-log-detail">{info.detail}</span> : null;
            if ((key === "RECEIPT_CREATE" || key === "RECEIPT_CONFIRM") && e.detail) {
              detail = <ReceiptDetail detail={e.detail} onLeave={onLeave} />;
            }
            const hasPhotos = (key === "GOODS_PHOTO" && !!orderCode) || !!sign;
            return (
              <li
                key={`${e.at}-${e.action}-${i}`}
                className={["od-log-row", tone, i === 0 ? "latest" : ""].filter(Boolean).join(" ")}
              >
                <span className="od-log-ic" aria-hidden="true">
                  <span className="ms">{iconOf(key)}</span>
                </span>
                <div className="od-log-body">
                  <div className="od-log-what">
                    <b>{info.title}</b>
                    {detail}
                  </div>
                  {info.changes.length ? (
                    <ul className="od-log-ch">
                      {info.changes.map((c, ci) => (
                        <li key={`${c.field}-${ci}`}>
                          <span className="od-ch-f">{c.field}</span>
                          <s>{c.from}</s>
                          <span className="ms" aria-hidden="true">
                            arrow_forward
                          </span>
                          <b>{c.to}</b>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {hasPhotos ? (
                    <div className="od-log-ph">
                      {key === "GOODS_PHOTO" && orderCode ? <GoodsPhotoTile orderCode={orderCode} /> : null}
                      {sign ? <SignTile src={sign} /> : null}
                    </div>
                  ) : null}
                  <div className="od-log-meta num">
                    <span>
                      <span className="ms" aria-hidden="true">
                        schedule
                      </span>
                      {formatLogTime(e.at)}
                    </span>
                    {who ? (
                      <span>
                        <span className="ms" aria-hidden="true">
                          person
                        </span>
                        {system ? who : <StaffInfoPopover staffKey={e.by}>{who}</StaffInfoPopover>}
                      </span>
                    ) : null}
                    {system ? <span className="od-chan">Hệ thống</span> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
