import { PublicOrderForm } from "@/routes/tao-don";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import {
  fetchCustomerOrder,
  fetchCustomerOrders,
  fetchCustomerSummary,
  getCustomerSession,
  setCustomerSession,
  type CustomerGroup,
  type CustomerOrderDetail,
  type CustomerOrderRow,
  type CustomerSession,
  type CustomerSummary,
} from "@/lib/api/customer-portal-api";
import { downloadExcelRows, type ExportFormat } from "@/lib/csv";
import { officeOptionValue } from "@/lib/mock-data";
import { useStore } from "@/lib/store";

type Page = "overview" | "create" | "orders" | "bank" | "sender" | "defaults";

const Icon = ({ name, size = 20 }: { name: string; size?: number }) => {
  const paths: Record<string, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    box: (
      <>
        <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
        <path d="m3 8 9 5 9-5" />
        <path d="M12 13v8" />
      </>
    ),
    check: <path d="M20 6 9 17l-5-5" />,
    bank: (
      <>
        <path d="M3 21h18" />
        <path d="M5 21V10M10 21V10M14 21V10M19 21V10" />
        <path d="m12 3 9 5H3z" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    sliders: (
      <>
        <path d="M4 6h10M18 6h2" />
        <circle cx="16" cy="6" r="2" />
        <path d="M4 12h4M12 12h8" />
        <circle cx="10" cy="12" r="2" />
        <path d="M4 18h12M20 18h0" />
        <circle cx="18" cy="18" r="2" />
      </>
    ),
    truck: (
      <>
        <path d="M3 6h11v10H3z" />
        <path d="M14 9h4l3 3v4h-7" />
        <circle cx="7" cy="17.5" r="1.8" />
        <circle cx="17" cy="17.5" r="1.8" />
      </>
    ),
    wallet: (
      <>
        <path d="M3 7a2 2 0 0 1 2-2h13v4" />
        <path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2" />
        <path d="M16 14.5h.01" />
      </>
    ),
    coin: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M14.5 9.5a2.5 2 0 0 0-2.5-1.5c-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2a2.5 2 0 0 1-2.5-1.5" />
        <path d="M12 6.5v1.5M12 16v1.5" />
      </>
    ),
    arrow: <path d="m9 18 6-6-6-6" />,
    download: (
      <>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </>
    ),
    refresh: (
      <>
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        <path d="M8 16H3v5" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    flag: (
      <>
        <path d="M4 22V4" />
        <path d="M4 4h12l-2 4 2 4H4" />
      </>
    ),
    chevron: <path d="m6 9 6 6 6-6" />,
    pencil: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </>
    ),
    phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />,
    map: (
      <>
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </>
    ),
    x: (
      <>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
      </>
    ),
    receipt: (
      <>
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
        <path d="M9 8h6M9 12h6" />
      </>
    ),
    logout: (
      <>
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
        <path d="m10 17 5-5-5-5" />
        <path d="M15 12H3" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
};

const GROUP_TONE: Record<CustomerGroup, string> = {
  PENDING: "orange",
  SHIPPING: "blue",
  DELIVERED: "green",
  CANCELLED: "red",
};

const money = (n?: number | null) => `${Math.round(Number(n ?? 0)).toLocaleString("vi-VN")}đ`;

const dateTime = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const longTime = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const todayLabel = () => {
  const d = new Date();
  const wd = d.getDay() === 0 ? "Chủ Nhật" : `Thứ ${["", "Hai", "Ba", "Tư", "Năm", "Sáu", "Bảy"][d.getDay()]}`;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${wd}, ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const formatPhoneDisplay = (raw?: string | null) => {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  return raw?.trim() || "";
};

/** Thời gian hoạt động kiểu design: HH:mm | Hôm qua | dd/MM */
const activityTime = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startToday - startThat) / 86400000);
  if (dayDiff === 0) return `${p(d.getHours())}:${p(d.getMinutes())}`;
  if (dayDiff === 1) return "Hôm qua";
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}`;
};

const activityCopy = (o: CustomerOrderRow) => {
  if (o.group === "CANCELLED") return "Đơn đã huỷ";
  if (o.group === "DELIVERED") {
    const cod = Number(o.codAmount ?? 0);
    return cod > 0
      ? `Giao thành công, COD ${money(cod)} ${o.codRefunded ? "đã hoàn" : "chờ hoàn"}`
      : "Giao thành công";
  }
  if (o.group === "PENDING") return o.statusLabel || "Đã tạo đơn, chờ mang hàng tới VP";
  if (o.group === "SHIPPING") return o.statusLabel || "Đang vận chuyển";
  return o.statusLabel || "Cập nhật đơn";
};

const greeting = () => {
  const h = new Date().getHours();
  return h < 11 ? "Chào buổi sáng" : h < 14 ? "Chào buổi trưa" : h < 18 ? "Chào buổi chiều" : "Chào buổi tối";
};

const initials = (name?: string | null, phone?: string) => {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[words.length - 2][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (phone ?? "").slice(-2);
};

/** Cài đặt khách lưu trên trình duyệt theo SĐT (chưa đồng bộ BE). */
type CustomerSettings = Record<string, string>;
const settingsKey = (phone: string) => `xe-kh-settings:${phone}`;
function loadSettings(phone: string): CustomerSettings {
  try {
    return JSON.parse(localStorage.getItem(settingsKey(phone)) ?? "{}") as CustomerSettings;
  } catch {
    return {};
  }
}

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: "overview", label: "Tổng quan", icon: "grid" },
  { id: "create", label: "Tạo đơn mới", icon: "plus" },
  { id: "orders", label: "Quản lý đơn hàng", icon: "box" },
];
const SETTINGS: { id: Page; label: string; icon: string }[] = [
  { id: "bank", label: "Tài khoản ngân hàng", icon: "bank" },
  { id: "sender", label: "Thông tin người gửi", icon: "user" },
  { id: "defaults", label: "Cài đặt mặc định", icon: "sliders" },
];
const TITLES: Record<Page, string> = {
  overview: "Tổng quan",
  create: "Tạo đơn mới",
  orders: "Quản lý đơn hàng",
  bank: "Tài khoản ngân hàng",
  sender: "Thông tin người gửi",
  defaults: "Cài đặt mặc định",
};

export function CustomerCrm({ session, onLogout }: { session: CustomerSession; onLogout: () => void }) {
  const [page, setPage] = useState<Page>("overview");
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [orders, setOrders] = useState<CustomerOrderRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [name, setName] = useState(session.name ?? "");

  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        toast.error("Phiên đăng nhập đã hết hạn — vui lòng đăng nhập lại");
        onLogout();
        return;
      }
      toast.error(e instanceof Error ? e.message : "Không tải được dữ liệu");
    },
    [onLogout],
  );

  const reload = useCallback(() => {
    fetchCustomerSummary()
      .then((s) => {
        setSummary(s);
        if (s.name && !loadSettings(session.phone).senderName) setName(s.name);
      })
      .catch(handleError);
    fetchCustomerOrders()
      .then(setOrders)
      .catch((e) => {
        setOrders([]);
        handleError(e);
      });
  }, [handleError, session.phone]);

  useEffect(() => {
    const saved = loadSettings(session.phone).senderName;
    if (saved) setName(saved);
    reload();
  }, [reload, session.phone]);

  const go = (id: Page) => {
    setPage(id);
    if (id === "create") window.scrollTo({ top: 0 });
  };

  const displayName = name || session.phone;
  const settingsSub: Record<"bank" | "sender" | "defaults", string> = {
    bank: "Nơi nhận tiền thu hộ (COD)",
    sender: "Thông tin này được điền sẵn vào mỗi đơn mới",
    defaults: "Áp dụng cho các đơn bạn tạo từ bây giờ",
  };

  return (
    <div className="kh-crm">
      <div className="kh-shell">
        <aside className="kh-aside">
          <button type="button" className="kh-brand" onClick={() => setPage("overview")}>
            <span className="kh-brand-mark">
              <Icon name="truck" size={20} />
            </span>
            <span className="kh-brand-text">
              <strong>X.E Việt Nam</strong>
              <span>Chuyển phát nhanh</span>
            </span>
          </button>
          <nav className="kh-nav" aria-label="Điều hướng chính">
            <p className="kh-nav-label">VẬN CHUYỂN</p>
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`kh-nav-item ${page === item.id ? "active" : ""}`}
                onClick={() => go(item.id)}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </button>
            ))}
            <p className="kh-nav-label">CÀI ĐẶT</p>
            {SETTINGS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`kh-nav-item ${page === item.id ? "active" : ""}`}
                onClick={() => setPage(item.id)}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="kh-profile">
            <div className="kh-avatar">{initials(name, session.phone)}</div>
            <div>
              <strong>{displayName}</strong>
              <span>{formatPhoneDisplay(session.phone)}</span>
            </div>
            <button type="button" title="Đăng xuất" aria-label="Đăng xuất" onClick={onLogout}>
              <Icon name="logout" size={18} />
            </button>
          </div>
        </aside>
        <main className="kh-main">
          {page === "overview" && (
            <Overview name={name} summary={summary} orders={orders} onCreate={() => go("create")} onAll={() => setPage("orders")} />
          )}
          {page === "create" && (
            <>
              <div className="page-head">
                <div>
                  <h1>Tạo đơn mới</h1>
                  <p>Gửi hàng giữa các văn phòng X.E Việt Nam</p>
                </div>
              </div>
              <PublicOrderForm
                variant="crm"
                presetFromOffice={loadSettings(session.phone).preferredFromOffice}
                onHome={() => {
                  setPage("overview");
                  reload();
                }}
              />
            </>
          )}
          {page === "orders" && (
            <OrdersPage orders={orders} search={search} setSearch={setSearch} onCreate={() => go("create")} onReload={reload} />
          )}
          {(page === "bank" || page === "sender" || page === "defaults") && (
            <>
              <div className="page-head">
                <div>
                  <h1>{TITLES[page]}</h1>
                  <p>{settingsSub[page]}</p>
                </div>
              </div>
              <SettingsPage
                key={page}
                page={page}
                phone={session.phone}
                name={name}
                onSaved={(s) => {
                  if (page !== "sender") return;
                  const n = s.senderName?.trim() ?? "";
                  setName(n);
                  const cur = getCustomerSession();
                  if (cur) setCustomerSession({ ...cur, name: n || cur.name });
                }}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  unit,
  hint,
  primary,
}: {
  icon: string;
  label: string;
  value: string;
  unit?: string;
  hint: string;
  primary?: boolean;
}) {
  return (
    <div className={`stat-card${primary ? " accent" : ""}`}>
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon">
          <Icon name={icon} size={18} />
        </span>
      </div>
      <div className="stat-value">
        {value}
        {unit ? <span>{unit}</span> : null}
      </div>
      <div className="stat-hint">{hint}</div>
    </div>
  );
}

function Overview({
  name,
  summary,
  orders,
  onCreate,
  onAll,
}: {
  name: string;
  summary: CustomerSummary | null;
  orders: CustomerOrderRow[] | null;
  onCreate: () => void;
  onAll: () => void;
}) {
  const m = summary?.month;
  const shipping = m?.SHIPPING ?? 0;
  const pending = m?.PENDING ?? 0;
  const done = m?.DELIVERED ?? 0;
  const cancelled = m?.CANCELLED ?? 0;
  const total = m?.TOTAL ?? 0;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const firstName = (name.trim().split(/\s+/).filter(Boolean).pop() || "bạn").trim();
  const recent = (orders ?? []).slice(0, 5);
  const monthLabel = new Date().getMonth() + 1;
  const bar = (n: number, color: string) =>
    n > 0 ? <span key={color} style={{ flex: n, background: color }} /> : null;

  return (
    <>
      <section className="page-head">
        <div>
          <h1>
            {greeting()}, {firstName}
          </h1>
          <p>
            {todayLabel()} · Tình hình gửi hàng của bạn hôm nay
          </p>
        </div>
        <button type="button" className="kh-btn" onClick={onCreate}>
          <Icon name="plus" size={18} />
          Tạo đơn mới
        </button>
      </section>
      <section className="stats">
        <StatCard
          primary
          icon="truck"
          label="Đơn đang giao"
          value={String(summary?.shippingNow ?? "—")}
          unit="đơn"
          hint={`${pending} đơn đang chờ nhà xe lấy hàng`}
        />
        <StatCard
          icon="check"
          label="Giao thành công"
          value={String(done)}
          unit="đơn"
          hint={`Trong tháng ${monthLabel}`}
        />
        <StatCard
          icon="wallet"
          label="Chi tiêu tháng này"
          value={summary ? Math.round(summary.spendMonth).toLocaleString("vi-VN") : "—"}
          unit="đ"
          hint={`Tổng cước ${total} đơn`}
        />
        {(() => {
          const codOrders =
            orders?.filter((o) => o.group === "DELIVERED" && Number(o.codAmount ?? 0) > 0 && !o.codRefunded) ?? [];
          const codSum = codOrders.reduce((s, o) => s + Number(o.codAmount ?? 0), 0);
          return (
            <StatCard
              icon="coin"
              label="COD chờ hoàn"
              value={orders ? Math.round(codSum).toLocaleString("vi-VN") : "—"}
              unit="đ"
              hint={orders ? `Từ ${codOrders.length} đơn đã giao` : "—"}
            />
          );
        })()}
      </section>
      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Trạng thái đơn tháng {monthLabel}</h2>
              <p>Tính trên đơn tạo trong tháng</p>
            </div>
          </div>
          <div className="status-total">
            {total}
            <span>đơn</span>
          </div>
          <div
            className="status-bar kh-bar-anim"
            role="img"
            aria-label={
              total
                ? `${done} thành công, ${shipping} đang giao, ${pending} chờ lấy hàng, ${cancelled} huỷ hoặc hoàn`
                : "Chưa có đơn trong tháng"
            }
          >
            {bar(done, "#376934")}
            {bar(shipping, "#274ea1")}
            {bar(pending, "#b2c5ff")}
            {bar(cancelled, "#ba1a1a")}
            {!total ? <span className="status-bar-empty" /> : null}
          </div>
          <ul className="legend">
            {(
              [
                ["#376934", "Thành công", done],
                ["#274ea1", "Đang giao", shipping],
                ["#b2c5ff", "Chờ lấy hàng", pending],
                ["#ba1a1a", "Huỷ / hoàn", cancelled],
              ] as const
            ).map(([color, label, n]) => (
              <li key={label}>
                <i className="swatch" style={{ background: color }} />
                <span style={{ flex: 1 }}>{label}</span>
                <strong>{n}</strong>
                <em>{pct(n)}%</em>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Hoạt động gần đây</h2>
              <p>Cập nhật trạng thái mới nhất</p>
            </div>
          </div>
          {orders == null ? (
            <p className="activity-empty">Đang tải…</p>
          ) : recent.length === 0 ? (
            <p className="activity-empty">Chưa có đơn hàng nào</p>
          ) : (
            recent.slice(0, 4).map((o) => (
              <div className="activity-row" key={o.orderCode}>
                <span
                  className={`activity-icon ${
                    o.group === "DELIVERED" ? "green" : o.group === "CANCELLED" ? "red" : ""
                  }`}
                >
                  <Icon name={o.group === "DELIVERED" ? "check" : o.group === "SHIPPING" ? "truck" : o.group === "CANCELLED" ? "x" : "plus"} size={16} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{o.orderCode}</strong>
                  <p>{activityCopy(o)}</p>
                </div>
                <time>{activityTime(o.createdAt)}</time>
              </div>
            ))
          )}
        </div>
      </section>
      <section className="panel" style={{ flex: "1 1 100%" }}>
        <div className="panel-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2>Đơn gần đây</h2>
            <p>5 đơn tạo gần nhất</p>
          </div>
          <button type="button" className="kh-btn-text" onClick={onAll}>
            Xem tất cả
          </button>
        </div>
        <OrderTable rows={recent} loading={orders == null} />
      </section>
    </>
  );
}

const FILTERS: { id: CustomerGroup | "ALL"; label: string }[] = [
  { id: "ALL", label: "Tất cả" },
  { id: "PENDING", label: "Chờ lấy hàng" },
  { id: "SHIPPING", label: "Đang giao" },
  { id: "DELIVERED", label: "Thành công" },
  { id: "CANCELLED", label: "Huỷ / hoàn" },
];

const DATE_FILTERS = [
  { id: "today", label: "Hôm nay" },
  { id: "7d", label: "7 ngày qua" },
  { id: "month", label: "Tháng này" },
  { id: "prev", label: "Tháng trước" },
  { id: "all", label: "Tất cả thời gian" },
] as const;

function inDateFilter(iso: string | null | undefined, id: (typeof DATE_FILTERS)[number]["id"]) {
  if (id === "all" || !iso) return id === "all" ? true : false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (id === "today") return t >= startToday;
  if (id === "7d") return t >= startToday - 6 * 86400000;
  if (id === "month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (id === "prev") {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.getFullYear() === prev.getFullYear() && d.getMonth() === prev.getMonth();
  }
  return true;
}

function OrdersPage({
  orders,
  search,
  setSearch,
  onCreate,
  onReload,
}: {
  orders: CustomerOrderRow[] | null;
  search: string;
  setSearch: (s: string) => void;
  onCreate: () => void;
  onReload: () => void;
}) {
  const [filter, setFilter] = useState<CustomerGroup | "ALL">("ALL");
  const [dateId, setDateId] = useState<(typeof DATE_FILTERS)[number]["id"]>("month");
  const [vp, setVp] = useState("Tất cả văn phòng");
  const [spin, setSpin] = useState(false);
  const all = orders ?? [];
  const vpOptions = useMemo(() => {
    const set = new Set<string>();
    for (const o of all) {
      const n = (o.toOfficeName || o.deliveryAddress || "").trim();
      if (n) set.add(n);
    }
    return ["Tất cả văn phòng", ...[...set].sort((a, b) => a.localeCompare(b, "vi"))];
  }, [all]);

  const base = all.filter((o) => inDateFilter(o.createdAt, dateId) && (vp === "Tất cả văn phòng" || (o.toOfficeName || o.deliveryAddress || "") === vp));
  const q = search.trim().toLowerCase();
  const rows = base.filter(
    (o) =>
      (filter === "ALL" || o.group === filter) &&
      (!q ||
        [o.orderCode, o.receiverName, o.receiverPhone, o.senderName, o.senderPhone, o.toOfficeName]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))),
  );
  const count = (id: CustomerGroup | "ALL") => (id === "ALL" ? base.length : base.filter((o) => o.group === id).length);
  const dateLabel = DATE_FILTERS.find((d) => d.id === dateId)?.label ?? "Tháng này";

  const exportFile = (format: ExportFormat = "csv") => {
    if (!rows.length) {
      toast.message("Không có đơn để xuất");
      return;
    }
    downloadExcelRows(
      `don-hang-${new Date().toISOString().slice(0, 10)}`,
      [
        ["Mã đơn", "Ngày tạo", "Loại", "Người gửi", "Người nhận", "SĐT nhận", "Nơi nhận", "Cước", "Người trả", "COD", "Trạng thái"],
        ...rows.map((o) => [
          o.orderCode,
          dateTime(o.createdAt),
          o.direction === "SENT" ? "Đơn gửi" : "Đơn nhận",
          o.senderName ?? "",
          o.receiverName ?? "",
          o.receiverPhone ?? "",
          o.deliveryAddress || o.toOfficeName || "",
          String(o.fareAmount ?? 0),
          o.payer === "SENDER" ? "Người gửi trả" : "Người nhận trả",
          String(o.codAmount ?? 0),
          o.statusLabel ?? "",
        ]),
      ],
      "DonHang",
      format,
    );
    toast.success(`Đang tạo file ${format === "excel" ? "Excel" : "CSV"} cho ${rows.length} đơn`);
  };

  const refresh = () => {
    setSpin(true);
    onReload();
    window.setTimeout(() => setSpin(false), 700);
  };

  return (
    <>
      <section className="page-head">
        <div>
          <h1>Quản lý đơn hàng</h1>
          <p>Theo dõi tất cả đơn bạn đã gửi</p>
        </div>
        <button type="button" className="kh-btn" onClick={onCreate}>
          <Icon name="plus" size={18} />
          Tạo đơn mới
        </button>
      </section>
      <section className="full-panel">
        <div className="seg-tabs" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={`filter ${filter === f.id ? "active" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label} <b>{count(f.id)}</b>
            </button>
          ))}
        </div>
        <div className="filter-tools">
          <label className="search-field">
            <span>Tìm đơn</span>
            <div className="search-box">
              <Icon name="search" size={20} />
              <input
                placeholder="Mã đơn hoặc tên người nhận"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </label>
          <KhSelect
            label="Ngày tạo"
            icon="calendar"
            value={dateLabel}
            options={DATE_FILTERS.map((d) => d.label)}
            onPick={(label) => {
              const hit = DATE_FILTERS.find((d) => d.label === label);
              if (hit) setDateId(hit.id);
            }}
          />
          <KhSelect
            label="Văn phòng nhận"
            icon="flag"
            value={vp}
            options={vpOptions}
            onPick={setVp}
          />
          <div className="filter-actions">
            <button type="button" className="outline icon-only" aria-label="Tải lại" onClick={refresh}>
              <span className={spin ? "kh-spin" : undefined}>
                <Icon name="refresh" size={18} />
              </span>
            </button>
            <KhSelect
              label=""
              trigger={
                <>
                  <Icon name="download" size={18} />
                  Xuất file
                </>
              }
              value=""
              options={["Xuất CSV", "Xuất Excel"]}
              onPick={(opt) => exportFile(opt.includes("Excel") ? "excel" : "csv")}
              menuAlign="right"
            />
          </div>
        </div>
        <OrderTable rows={rows} detailed loading={orders == null} />
        <div className="orders-foot">
          <span>
            {rows.length
              ? `Hiển thị 1–${rows.length} trên ${rows.length} đơn`
              : orders == null
                ? "Đang tải…"
                : "Không có đơn"}
          </span>
        </div>
      </section>
    </>
  );
}

type KhOption = string | { value: string; label: string; sub?: string };

function normalizeKhOptions(options: KhOption[]) {
  return options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
}

function KhSelect({
  label,
  icon,
  value,
  options,
  onPick,
  trigger,
  menuAlign = "left",
  searchable = false,
  searchPlaceholder = "Tìm…",
  displayLabel,
}: {
  label: string;
  icon?: string;
  value: string;
  options: KhOption[];
  onPick: (v: string) => void;
  trigger?: ReactNode;
  menuAlign?: "left" | "right";
  searchable?: boolean;
  searchPlaceholder?: string;
  displayLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const opts = useMemo(() => normalizeKhOptions(options), [options]);
  const selected = opts.find((o) => o.value === value || o.label === value);
  const shown = displayLabel ?? selected?.label ?? value;
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return opts;
    return opts.filter(
      (o) =>
        o.label.toLowerCase().includes(needle) ||
        o.value.toLowerCase().includes(needle) ||
        (o.sub ?? "").toLowerCase().includes(needle),
    );
  }, [opts, q]);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  return (
    <div className={`kh-select${label ? "" : " bare"}`}>
      {label ? <span className="kh-select-label">{label}</span> : null}
      <div className="kh-select-wrap">
        <button
          type="button"
          className={`kh-select-btn${trigger ? " pill" : ""}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={label || undefined}
          onClick={() => setOpen((v) => !v)}
        >
          {trigger ? (
            trigger
          ) : (
            <>
              {icon ? <Icon name={icon} size={20} /> : null}
              <span className="kh-select-value">{shown || "Chọn…"}</span>
            </>
          )}
          <Icon name="chevron" size={16} />
        </button>
        {open ? (
          <>
            <button type="button" className="kh-select-scrim" aria-label="Đóng" onClick={() => setOpen(false)} />
            <div className={`kh-select-menu ${menuAlign}`} role="listbox">
              {searchable ? (
                <label className="kh-select-search">
                  <Icon name="search" size={18} />
                  <input
                    autoFocus
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={searchPlaceholder}
                    aria-label={searchPlaceholder}
                  />
                </label>
              ) : null}
              {filtered.length === 0 ? (
                <p className="kh-select-empty">Không tìm thấy kết quả phù hợp</p>
              ) : (
                filtered.map((opt) => {
                  const on = opt.value === value || opt.label === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={on}
                      className={on ? "on" : ""}
                      onClick={() => {
                        onPick(opt.value);
                        setOpen(false);
                      }}
                    >
                      <span className="opt-main">
                        <span>{opt.label}</span>
                        {opt.sub ? <span className="opt-sub">{opt.sub}</span> : null}
                      </span>
                      {on ? <Icon name="check" size={18} /> : null}
                    </button>
                  );
                })
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function OrderTable({ rows, detailed = false, loading = false }: { rows: CustomerOrderRow[]; detailed?: boolean; loading?: boolean }) {
  const [viewing, setViewing] = useState<CustomerOrderRow | null>(null);
  const cols = detailed ? 6 : 5;
  return (
    <>
      <div className="table-scroll">
        <table className={detailed ? "detailed" : ""}>
          <thead>
            <tr>
              <th>Mã đơn</th>
              <th>Người nhận</th>
              <th className="r">Phí vận chuyển</th>
              <th className="r">Tiền COD</th>
              <th>Trạng thái</th>
              {detailed && <th className="c">Xem</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={cols}>{loading ? "Đang tải…" : "Chưa có đơn hàng"}</td>
              </tr>
            ) : (
              rows.map((o) => (
                <tr key={o.orderCode} className="clickable" onClick={() => setViewing(o)}>
                  <td>
                    <div className="id-wrap">
                      <button type="button" className="order-id" onClick={() => setViewing(o)}>
                        {o.orderCode}
                      </button>
                      {o.direction === "RECEIVED" && <span className="direction-tag">Nhận</span>}
                    </div>
                    <span className="subline">{dateTime(o.createdAt)}</span>
                  </td>
                  <td>
                    <strong className="cell-strong">{o.receiverName || o.receiverPhone || "—"}</strong>
                    <span className="subline">{o.deliveryAddress || o.toOfficeName || ""}</span>
                  </td>
                  <td className="r">
                    <strong className="cell-fare">{money(o.fareAmount)}</strong>
                    <span className="subline">{o.payer === "SENDER" ? "Người gửi trả" : "Người nhận trả"}</span>
                  </td>
                  <td className="r">{o.codAmount ? money(o.codAmount) : "-"}</td>
                  <td>
                    <span className={`badge ${GROUP_TONE[o.group]}`}>{o.statusLabel || "—"}</span>
                  </td>
                  {detailed && (
                    <td className="c" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="row-btn"
                        aria-label={`Xem đơn ${o.orderCode}`}
                        title="Xem chi tiết"
                        onClick={() => setViewing(o)}
                      >
                        <Icon name="eye" size={16} />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {viewing && <OrderDrawer row={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

function OrderDrawer({ row, onClose }: { row: CustomerOrderRow; onClose: () => void }) {
  const [detail, setDetail] = useState<CustomerOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchCustomerOrder(row.orderCode)
      .then((d) => alive && setDetail(d))
      .catch(() => alive && setDetail(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [row.orderCode]);

  const steps = (detail?.journey ?? []).filter((s) => s.at);
  const cod = Number(detail?.codAmount ?? row.codAmount ?? 0);
  const codRefunded = detail?.codRefundPaid ?? row.codRefunded;
  const invoiced = detail ? detail.invoiceState === "ISSUED" : row.invoiced;

  const copy = () => {
    void navigator.clipboard?.writeText(row.orderCode).then(
      () => toast.success(`Đã sao chép ${row.orderCode}`),
      () => toast.error("Không sao chép được"),
    );
  };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-label={`Chi tiết đơn ${row.orderCode}`} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <p>Chi tiết đơn hàng</p>
            <h2>{row.orderCode}</h2>
            <div className="detail-meta" style={{ marginTop: 10 }}>
              <span className={`badge ${GROUP_TONE[row.group]}`}>{detail?.statusLabel || row.statusLabel}</span>
              <span className={`badge ${invoiced ? "green" : "orange"}`}>
                {invoiced ? `Đã xuất hoá đơn${detail?.invoiceNo ? ` · ${detail.invoiceNo}` : ""}` : "Chưa xuất hoá đơn"}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="kh-btn-sec" onClick={copy}>
              <Icon name="copy" size={16} />
              Sao chép
            </button>
            <button type="button" className="row-btn" aria-label="Đóng" onClick={onClose}>
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>
        <section className="detail-card">
          <h3>Thông tin đơn</h3>
          <div className="route-strip">
            <span className="mark">
              <Icon name="truck" size={18} />
            </span>
            <div>
              <strong style={{ fontWeight: 600 }}>
                {row.fromOfficeName || "—"} → {row.toOfficeName || "—"}
              </strong>
              <span className="subline">Ngày tạo {dateTime(row.createdAt)}</span>
            </div>
          </div>
          <dl>
            {detail?.note ? (
              <div>
                <dt>Ghi chú</dt>
                <dd>{detail.note}</dd>
              </div>
            ) : null}
          </dl>
        </section>
        <section className="detail-card">
          <h3>Người gửi / nhận</h3>
          <dl>
            <div>
              <dt>Người gửi</dt>
              <dd>
                {row.senderName || "—"}
                <small>{row.senderPhone}</small>
              </dd>
            </div>
            <div>
              <dt>Người nhận</dt>
              <dd>
                {row.receiverName || "—"}
                <small>{row.receiverPhone}</small>
              </dd>
            </div>
            <div>
              <dt>Địa chỉ nhận</dt>
              <dd>{row.deliveryAddress || row.toOfficeName || "—"}</dd>
            </div>
          </dl>
        </section>
        <section className="detail-card">
          <h3>Thanh toán</h3>
          <dl>
            <div>
              <dt>Tiền cước</dt>
              <dd>
                {money(row.fareAmount)}
                <small>{row.payer === "SENDER" ? "Người gửi trả" : "Người nhận trả"}</small>
              </dd>
            </div>
            <div>
              <dt>Đã thanh toán</dt>
              <dd>{money(detail?.paidAmount ?? row.paidAmount)}</dd>
            </div>
            <div>
              <dt>Tiền COD</dt>
              <dd>{cod ? money(cod) : "—"}</dd>
            </div>
            {cod > 0 && (
              <div>
                <dt>Hoàn COD</dt>
                <dd>
                  <span className={`badge ${codRefunded ? "green" : "orange"}`}>
                    {codRefunded ? "Đã hoàn" : "Chưa hoàn"}
                  </span>
                </dd>
              </div>
            )}
          </dl>
        </section>
        <section className="detail-card order-log">
          <h3>Hành trình</h3>
          {loading ? (
            <p className="drawer-loading">Đang tải hành trình…</p>
          ) : steps.length === 0 ? (
            <p className="drawer-loading">Chưa có mốc hành trình công khai cho đơn này.</p>
          ) : (
            <ol>
              {steps.map((s, i) => (
                <li key={`${s.key}-${i}`} className={i === steps.length - 1 ? "current" : ""}>
                  <strong>{s.label}</strong>
                  <time>{longTime(s.at)}</time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </div>
  );
}

const BANKS = [
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
  "Khác",
];

function SettingsPage({
  page,
  phone,
  name,
  onSaved,
}: {
  page: "bank" | "sender" | "defaults";
  phone: string;
  name: string;
  onSaved: (s: CustomerSettings) => void;
}) {
  const initial = useMemo(() => {
    const s = loadSettings(phone);
    return {
      bankName: "",
      bankAccount: "",
      bankHolder: "",
      senderName: name,
      senderAddress: "",
      preferredFromOffice: "",
      defaultWeight: "1",
      defaultGoods: "",
      defaultNote: "",
      defaultPayer: "SENDER",
      defaultHomeDelivery: "0",
      defaultHomePickup: "0",
      ...s,
      senderPhone: phone,
    };
  }, [phone, name]);
  const [values, setValues] = useState<CustomerSettings>(initial);
  const [editingBank, setEditingBank] = useState(false);
  const [otherBank, setOtherBank] = useState(() => {
    const n = initial.bankName ?? "";
    return !!n && !BANKS.includes(n);
  });
  const offices = useStore((s) => s.offices);

  useEffect(() => {
    setValues(initial);
    setEditingBank(false);
    const n = initial.bankName ?? "";
    setOtherBank(!!n && !BANKS.includes(n));
  }, [initial]);

  useEffect(() => {
    if (page !== "sender" || offices.length > 0) return;
    void import("@/lib/api/sync").then((m) => m.syncPublicOfficesFromApi().catch(() => undefined));
  }, [page, offices.length]);

  const officeOpts = useMemo(
    () =>
      offices
        .filter((o) => o.customerVisible !== false)
        .map((o) => ({
          value: officeOptionValue(o),
          label: o.name,
          sub: [o.code, o.address].filter(Boolean).join(" · ") || undefined,
        })),
    [offices],
  );

  const preferredOfficeLabel = useMemo(() => {
    const raw = (values.preferredFromOffice ?? "").trim();
    if (!raw) return "Chọn văn phòng";
    const hit = officeOpts.find((o) => o.value === raw || o.label === raw);
    return hit?.label ?? raw;
  }, [values.preferredFromOffice, officeOpts]);

  const set = (key: string, val: string) => setValues((v) => ({ ...v, [key]: val }));

  const save = () => {
    const merged = { ...loadSettings(phone), ...values, senderPhone: phone };
    localStorage.setItem(settingsKey(phone), JSON.stringify(merged));
    onSaved(merged);
    setEditingBank(false);
    toast.success("Đã lưu thay đổi");
  };

  const cancel = () => {
    setValues(initial);
    setEditingBank(false);
    const n = initial.bankName ?? "";
    setOtherBank(!!n && !BANKS.includes(n));
  };

  const bankSelectValue = otherBank ? "Khác" : values.bankName && BANKS.includes(values.bankName) ? values.bankName : "";

  if (page === "bank") {
    return (
      <section className="form-shell">
        <div className="form-card settings-card">
          <div className="settings-card-head">
            <div>
              <h2>Tài khoản nhận tiền COD</h2>
              <p>Tiền thu hộ của các đơn giao thành công sẽ được chuyển về tài khoản này</p>
            </div>
            {!editingBank ? (
              <button type="button" className="kh-btn-sec" onClick={() => setEditingBank(true)}>
                <Icon name="pencil" size={16} />
                Sửa
              </button>
            ) : null}
          </div>
          {!editingBank ? (
            <div className="bank-view">
              <span className="form-icon">
                <Icon name="bank" />
              </span>
              <div className="bank-view-grid">
                <div>
                  <span>Ngân hàng</span>
                  <strong>{values.bankName || "—"}</strong>
                </div>
                <div>
                  <span>Số tài khoản</span>
                  <strong className="mono">{values.bankAccount || "—"}</strong>
                </div>
                <div>
                  <span>Chủ tài khoản</span>
                  <strong>{values.bankHolder || "—"}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="settings-form">
              <div className="field-stack">
                <span className="field-label">Ngân hàng</span>
                <KhSelect
                  label=""
                  value={bankSelectValue}
                  displayLabel={bankSelectValue || "Chọn ngân hàng"}
                  options={BANKS}
                  searchable
                  searchPlaceholder="Tìm ngân hàng"
                  onPick={(v) => {
                    if (v === "Khác") {
                      setOtherBank(true);
                      set("bankName", "");
                      return;
                    }
                    setOtherBank(false);
                    set("bankName", v);
                  }}
                />
                {otherBank ? (
                  <input
                    className="mt-field"
                    placeholder="Nhập tên ngân hàng"
                    value={values.bankName ?? ""}
                    onChange={(e) => set("bankName", e.target.value)}
                  />
                ) : null}
              </div>
              <label>
                <span>Số tài khoản</span>
                <input
                  inputMode="numeric"
                  value={values.bankAccount ?? ""}
                  onChange={(e) => set("bankAccount", e.target.value.replace(/\D/g, ""))}
                />
              </label>
              <label>
                <span>Tên chủ tài khoản</span>
                <input
                  value={values.bankHolder ?? ""}
                  onChange={(e) => set("bankHolder", e.target.value.toUpperCase())}
                />
                <em className="field-hint">Viết in hoa, không dấu, đúng như trên thẻ</em>
              </label>
              <div className="form-actions">
                <button type="button" className="kh-btn-sec" onClick={cancel}>
                  Huỷ
                </button>
                <button type="button" className="kh-btn" onClick={save}>
                  Lưu thay đổi
                </button>
              </div>
            </div>
          )}
          <div className="form-note with-icon">
            <Icon name="info" size={18} />
            <span>Đổi tài khoản chỉ áp dụng cho các khoản COD hoàn sau thời điểm lưu.</span>
          </div>
        </div>
      </section>
    );
  }

  if (page === "sender") {
    return (
      <section className="form-shell">
        <div className="form-card settings-card">
          <div className="settings-card-head">
            <div>
              <h2>Thông tin người gửi</h2>
              <p>Tự điền khi bạn tạo đơn mới</p>
            </div>
          </div>
          <div className="settings-form">
            <label>
              <span>Tên cửa hàng hoặc người gửi</span>
              <input value={values.senderName ?? ""} onChange={(e) => set("senderName", e.target.value)} />
            </label>
            <label>
              <span>Số điện thoại</span>
              <div className="field-box">
                <Icon name="phone" size={20} />
                <input value={formatPhoneDisplay(values.senderPhone)} readOnly />
              </div>
            </label>
            <label className="wide">
              <span>Địa chỉ lấy hàng</span>
              <div className="field-box">
                <Icon name="map" size={20} />
                <input
                  value={values.senderAddress ?? ""}
                  placeholder="Số nhà, đường, phường/xã…"
                  onChange={(e) => set("senderAddress", e.target.value)}
                />
              </div>
              <em className="field-hint">Dùng khi bạn chọn lấy hàng tận nơi</em>
            </label>
            <div className="field-stack wide">
              <span className="field-label">VP gửi hay dùng</span>
              <KhSelect
                label=""
                icon="flag"
                value={values.preferredFromOffice ?? ""}
                displayLabel={preferredOfficeLabel}
                options={officeOpts}
                searchable
                searchPlaceholder="Tìm tên hoặc địa chỉ VP"
                onPick={(v) => set("preferredFromOffice", v)}
              />
            </div>
            <div className="form-actions">
              <button type="button" className="kh-btn-sec" onClick={cancel}>
                Huỷ
              </button>
              <button type="button" className="kh-btn" onClick={save}>
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const payerLabel = values.defaultPayer === "RECEIVER" ? "Người nhận trả" : "Người gửi trả";
  return (
    <section className="form-shell">
      <div className="form-card settings-card">
        <div className="settings-card-head">
          <div>
            <h2>Cài đặt tạo đơn mặc định</h2>
            <p>Điền sẵn các tuỳ chọn bạn hay dùng để tạo đơn nhanh hơn</p>
          </div>
        </div>
        <div className="settings-form">
          <label>
            <span>Khối lượng mặc định</span>
            <div className="field-box unit">
              <input
                inputMode="numeric"
                value={values.defaultWeight ?? "1"}
                onChange={(e) => set("defaultWeight", e.target.value)}
              />
              <em>kg</em>
            </div>
          </label>
          <label>
            <span>Tên hàng thường gửi</span>
            <input value={values.defaultGoods ?? ""} onChange={(e) => set("defaultGoods", e.target.value)} />
          </label>
          <div className="field-stack">
            <span className="field-label">Người trả cước mặc định</span>
            <KhSelect
              label=""
              value={payerLabel}
              options={["Người gửi trả", "Người nhận trả"]}
              onPick={(v) => set("defaultPayer", v.includes("nhận") ? "RECEIVER" : "SENDER")}
            />
          </div>
          <label className="wide">
            <span>Ghi chú giao hàng</span>
            <input value={values.defaultNote ?? ""} onChange={(e) => set("defaultNote", e.target.value)} />
          </label>
          <div className="switch-list">
            <button
              type="button"
              role="switch"
              aria-checked={values.defaultHomeDelivery === "1"}
              className={`kh-switch${values.defaultHomeDelivery === "1" ? " on" : ""}`}
              onClick={() => set("defaultHomeDelivery", values.defaultHomeDelivery === "1" ? "0" : "1")}
            >
              <span>
                <strong>Giao hàng tận nơi</strong>
                <small>Bật sẵn cho mọi đơn mới</small>
              </span>
              <span className="track">
                <span className="knob" />
              </span>
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={values.defaultHomePickup === "1"}
              className={`kh-switch${values.defaultHomePickup === "1" ? " on" : ""}`}
              onClick={() => set("defaultHomePickup", values.defaultHomePickup === "1" ? "0" : "1")}
            >
              <span>
                <strong>Lấy hàng tận nơi</strong>
                <small>Bật sẵn cho mọi đơn mới</small>
              </span>
              <span className="track">
                <span className="knob" />
              </span>
            </button>
          </div>
          <div className="form-actions">
            <button type="button" className="kh-btn-sec" onClick={cancel}>
              Huỷ
            </button>
            <button type="button" className="kh-btn" onClick={save}>
              Lưu thay đổi
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
