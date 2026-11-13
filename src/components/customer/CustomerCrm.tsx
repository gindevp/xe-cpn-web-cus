import { PublicOrderForm } from "@/routes/tao-don";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
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
    sender: "Tự điền khi bạn tạo đơn mới",
    defaults: "Rút ngắn thời gian bằng các tùy chọn thường dùng",
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
          <div className="status-bar grow" role="img" aria-label="Phân bố trạng thái">
            {bar(done, "#376934")}
            {bar(shipping, "#274ea1")}
            {bar(pending, "#b2c5ff")}
            {bar(cancelled, "#ba1a1a")}
            {!total ? <span style={{ flex: 1, background: "#e2e2e9" }} /> : null}
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
  const all = orders ?? [];
  const q = search.trim().toLowerCase();
  const rows = all.filter(
    (o) =>
      (filter === "ALL" || o.group === filter) &&
      (!q ||
        [o.orderCode, o.receiverName, o.receiverPhone, o.senderName, o.senderPhone, o.toOfficeName]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))),
  );
  const count = (id: CustomerGroup | "ALL") => (id === "ALL" ? all.length : all.filter((o) => o.group === id).length);

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
          <button type="button" className="outline icon-only" aria-label="Tải lại" onClick={onReload}>
            <Icon name="refresh" size={18} />
          </button>
          <button type="button" className="outline" title="Xuất file Excel" onClick={() => exportFile("excel")}>
            <Icon name="download" size={18} />
            Xuất file
          </button>
        </div>
        <OrderTable rows={rows} detailed loading={orders == null} />
      </section>
    </>
  );
}

function OrderTable({ rows, detailed = false, loading = false }: { rows: CustomerOrderRow[]; detailed?: boolean; loading?: boolean }) {
  const [viewing, setViewing] = useState<CustomerOrderRow | null>(null);
  const cols = detailed ? 6 : 5;
  const copy = (code: string) => {
    void navigator.clipboard?.writeText(code).then(
      () => toast.success(`Đã sao chép ${code}`),
      () => toast.error("Không sao chép được"),
    );
  };
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
              {detailed && <th />}
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
                      <span className="order-id">{o.orderCode}</span>
                      {o.direction === "RECEIVED" && <span className="direction-tag">Nhận</span>}
                    </div>
                    <span className="subline">{dateTime(o.createdAt)}</span>
                  </td>
                  <td>
                    <strong style={{ fontWeight: 500 }}>{o.receiverName || o.receiverPhone || "—"}</strong>
                    <span className="subline">{o.deliveryAddress || o.toOfficeName || ""}</span>
                  </td>
                  <td className="r">
                    <strong style={{ fontWeight: 600 }}>{money(o.fareAmount)}</strong>
                    <span className="subline">{o.payer === "SENDER" ? "Người gửi trả" : "Người nhận trả"}</span>
                  </td>
                  <td className="r">{o.codAmount ? money(o.codAmount) : "-"}</td>
                  <td>
                    <span className={`badge ${GROUP_TONE[o.group]}`}>{o.statusLabel || "—"}</span>
                  </td>
                  {detailed && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="row-actions">
                        <button type="button" className="row-btn" title="Xem chi tiết" onClick={() => setViewing(o)}>
                          <Icon name="eye" size={16} />
                        </button>
                        <button type="button" className="row-btn" title="Sao chép mã đơn" onClick={() => copy(o.orderCode)}>
                          <Icon name="copy" size={16} />
                        </button>
                      </div>
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

const SETTING_FORMS: Record<
  "bank" | "sender" | "defaults",
  { title: string; sub: string; icon: string; fields: [key: string, label: string, placeholder: string, type: string][] }
> = {
  bank: {
    title: "Tài khoản nhận tiền COD",
    sub: "Tiền thu hộ sẽ được chuyển về tài khoản này",
    icon: "bank",
    fields: [
      ["bankName", "Ngân hàng", "Ví dụ: Vietcombank", "text"],
      ["bankAccount", "Số tài khoản", "Nhập số tài khoản", "text"],
      ["bankHolder", "Tên chủ tài khoản", "NGUYEN VAN A", "text"],
    ],
  },
  sender: {
    title: "Thông tin người gửi",
    sub: "Tự điền khi bạn tạo đơn mới",
    icon: "user",
    fields: [
      ["senderName", "Tên cửa hàng / người gửi", "Nguyễn Văn A", "text"],
      ["senderPhone", "Số điện thoại", "", "tel"],
      ["senderAddress", "Địa chỉ lấy hàng", "Số nhà, đường, phường/xã, tỉnh/thành", "text"],
    ],
  },
  defaults: {
    title: "Cài đặt tạo đơn mặc định",
    sub: "Rút ngắn thời gian bằng các tùy chọn thường dùng",
    icon: "sliders",
    fields: [
      ["defaultWeight", "Khối lượng mặc định (kg)", "1", "number"],
      ["defaultGoods", "Tên hàng thường gửi", "Ví dụ: Quần áo", "text"],
      ["defaultNote", "Ghi chú giao hàng", "Cho khách xem hàng, không cho thử", "text"],
    ],
  },
};

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
  const cfg = SETTING_FORMS[page];
  const initial = useMemo(() => {
    const s = loadSettings(phone);
    return { senderName: name, ...s, senderPhone: phone };
  }, [phone, name]);
  const [values, setValues] = useState<CustomerSettings>(initial);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const merged = { ...loadSettings(phone), ...values, senderPhone: phone };
    localStorage.setItem(settingsKey(phone), JSON.stringify(merged));
    onSaved(merged);
    toast.success("Đã lưu thay đổi");
  };

  return (
    <section className="form-shell">
      <div className="form-card">
        <div className="form-heading">
          <span className="form-icon">
            <Icon name={cfg.icon} />
          </span>
          <div>
            <h2>{cfg.title}</h2>
            <p>{cfg.sub}</p>
          </div>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            {cfg.fields.map(([key, label, placeholder, type], i) => (
              <label className={i === 2 && page !== "bank" ? "wide" : ""} key={key}>
                <span>{label}</span>
                <input
                  type={type}
                  placeholder={placeholder}
                  value={values[key] ?? ""}
                  readOnly={key === "senderPhone"}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          {page === "bank" ? (
            <p className="form-note">Tiền COD thu hộ sẽ được chuyển về tài khoản này sau khi đơn giao thành công.</p>
          ) : null}
          {page === "defaults" ? (
            <p className="form-note">Các giá trị mặc định chỉ lưu trên trình duyệt của bạn và tự điền khi tạo đơn.</p>
          ) : null}
          <div className="form-actions">
            <button type="button" className="kh-btn-sec" onClick={() => setValues(initial)}>
              Huỷ
            </button>
            <button type="submit" className="kh-btn">
              Lưu thay đổi
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
