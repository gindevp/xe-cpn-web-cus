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
  const systemIcons: Record<string, string> = {
    grid: "/kh/d3d25.svg",
    search: "/kh/6dc96.svg",
    user: "/kh/13cde.svg",
    bell: "/kh/fed54.svg",
    box: "/kh/5839f.svg",
    plus: "/kh/8f186.svg",
    check: "/kh/80615.svg",
  };
  if (systemIcons[name]) {
    return <span className={`ds-icon ds-icon-${size}`} role="img" aria-hidden="true" data-src={systemIcons[name]} />;
  }
  const paths: Record<string, ReactNode> = {
    bank: <path d="M3 10h18M5 10v8m5-8v8m4-8v8m5-8v8M3 21h18M12 3l9 5H3l9-5Z" />,
    sliders: (
      <>
        <path d="M4 6h9m4 0h3M4 12h3m4 0h9M4 18h7m4 0h5" />
        <circle cx="15" cy="6" r="2" />
        <circle cx="9" cy="12" r="2" />
        <circle cx="13" cy="18" r="2" />
      </>
    ),
    truck: (
      <>
        <path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z" />
        <circle cx="7" cy="19" r="2" />
        <circle cx="18" cy="19" r="2" />
      </>
    ),
    wallet: (
      <>
        <path d="M3 6h16v14H3z" />
        <path d="M3 9h16M15 14h6v4h-6a2 2 0 0 1 0-4Z" />
      </>
    ),
    arrow: <path d="m9 18 6-6-6-6" />,
    download: <path d="M12 3v12m-5-5 5 5 5-5M5 21h14" />,
    x: <path d="M6 6l12 12M18 6 6 18" />,
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
    logout: <path d="M10 17l5-5-5-5M15 12H3M14 3h7v18h-7" />,
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

const relativeTime = (iso?: string | null) => {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "Vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} ngày trước` : dateTime(iso).slice(0, 10);
};

const todayLabel = () => {
  const d = new Date();
  const wd = d.getDay() === 0 ? "Chủ Nhật" : `Thứ ${["", "Hai", "Ba", "Tư", "Năm", "Sáu", "Bảy"][d.getDay()]}`;
  return `${wd}, ${d.getDate()} tháng ${d.getMonth() + 1}, ${d.getFullYear()}`;
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

const deltaText = (cur: number, prev: number) => {
  if (!prev) return cur ? "Mới" : "0%";
  const pct = ((cur - prev) / prev) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
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

  const shippingCount = orders?.filter((o) => o.group === "SHIPPING").length ?? 0;
  const displayName = name || session.phone;

  return (
    <div className="kh-crm">
      <div className="app">
        <aside className="sidebar">
          <button className="brand" onClick={() => setPage("overview")}>
            <img className="brand-logo" src="/kh/xe-vietnam-logo.png" alt="X.E Việt Nam" />
          </button>
          <nav className="sidebar-nav">
            <p className="nav-title">VẬN CHUYỂN</p>
            {NAV.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${page === item.id ? "active" : ""}`}
                onClick={() => go(item.id)}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {item.id === "orders" && shippingCount > 0 && <b>{shippingCount}</b>}
              </button>
            ))}
            <p className="nav-title settings-title">CÀI ĐẶT</p>
            {SETTINGS.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${page === item.id ? "active" : ""}`}
                onClick={() => setPage(item.id)}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="profile-mini">
            <div className="avatar">{initials(name, session.phone)}</div>
            <div>
              <strong>{displayName}</strong>
              <span>{session.phone}</span>
            </div>
            <button type="button" title="Đăng xuất" aria-label="Đăng xuất" onClick={onLogout}>
              <Icon name="logout" size={16} />
            </button>
          </div>
        </aside>
        <main>
          <header className="topbar">
            <div>
              <h1>{TITLES[page]}</h1>
              <p>{todayLabel()}</p>
            </div>
            <div className="top-actions">
              <label className="search">
                <Icon name="search" size={18} />
                <input
                  placeholder="Tìm kiếm đơn hàng..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    if (e.target.value.trim()) setPage("orders");
                  }}
                />
              </label>
              <div className="header-avatar">{initials(name, session.phone)}</div>
            </div>
          </header>
          <div className="content">
            {page === "overview" && (
              <Overview name={name} summary={summary} orders={orders} onCreate={() => go("create")} onAll={() => setPage("orders")} />
            )}
            {page === "create" && (
              <PublicOrderForm
                variant="crm"
                onHome={() => {
                  setPage("overview");
                  reload();
                }}
              />
            )}
            {page === "orders" && (
              <OrdersPage orders={orders} search={search} setSearch={setSearch} onCreate={() => go("create")} onReload={reload} />
            )}
            {(page === "bank" || page === "sender" || page === "defaults") && (
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
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, delta, tone }: { icon: string; label: string; value: string; delta: string; tone: string }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>
        <Icon name={icon} size={23} />
      </div>
      <div className="stat-top">
        <span>{label}</span>
      </div>
      <div className="stat-value">{value}</div>
      <div className={`delta ${delta.startsWith("-") ? "down" : delta.startsWith("+") || delta === "Mới" ? "up" : "neutral"}`}>
        <strong>{delta}</strong>
        <span> so với tháng trước</span>
      </div>
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
  const p = summary?.prevMonth;
  const active = (m?.SHIPPING ?? 0) + (m?.PENDING ?? 0);
  const done = m?.DELIVERED ?? 0;
  const cancelled = m?.CANCELLED ?? 0;
  const total = m?.TOTAL ?? 0;
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  const a = pct(active);
  const b = a + pct(done);
  const donutBg = total
    ? `conic-gradient(#274ea1 0 ${a}%, #40ac67 ${a}% ${b}%, #de3a3a ${b}% 100%)`
    : undefined;
  const firstName = name.trim().split(/\s+/).pop() || "bạn";
  const recent = (orders ?? []).slice(0, 4);

  return (
    <>
      <section className="welcome">
        <div>
          <h2>
            {greeting()}, {firstName}!
          </h2>
          <p>Đây là tình hình vận chuyển của bạn hôm nay.</p>
        </div>
        <button className="primary" onClick={onCreate}>
          <Icon name="plus" size={19} />
          Tạo đơn mới
        </button>
      </section>
      <section className="stats">
        <StatCard
          icon="truck"
          label="Đơn đang giao"
          value={String(summary?.shippingNow ?? "—")}
          delta={deltaText(m?.SHIPPING ?? 0, p?.SHIPPING ?? 0)}
          tone="blue"
        />
        <StatCard
          icon="check"
          label="Giao thành công"
          value={String(m?.DELIVERED ?? "—")}
          delta={deltaText(m?.DELIVERED ?? 0, p?.DELIVERED ?? 0)}
          tone="green"
        />
        <StatCard
          icon="wallet"
          label="Tổng chi tiêu tháng này"
          value={summary ? money(summary.spendMonth) : "—"}
          delta={deltaText(summary?.spendMonth ?? 0, summary?.spendPrevMonth ?? 0)}
          tone="purple"
        />
      </section>
      <section className="dashboard-grid">
        <div className="panel status-panel">
          <div className="panel-head">
            <div>
              <h3>Trạng thái đơn hàng</h3>
              <p>Thống kê đơn tạo trong tháng {new Date().getMonth() + 1}</p>
            </div>
          </div>
          <div className="chart-wrap">
            <div className="donut-shell">
              <div className={`donut ${total ? "" : "empty"}`} style={donutBg ? { background: donutBg } : undefined}>
                <div>
                  <span>Tổng đơn</span>
                  <strong>{total}</strong>
                  <small>Tháng này</small>
                </div>
              </div>
            </div>
            <div className="legend">
              {(
                [
                  ["blue", "Đang giao", "Chờ lấy / đang vận chuyển", active],
                  ["green", "Giao thành công", "Đã giao đến người nhận", done],
                  ["red", "Huỷ / hoàn", "Đơn đã huỷ hoặc hoàn về", cancelled],
                ] as const
              ).map(([tone, label, sub, n]) => (
                <div className="legend-item" key={label}>
                  <i className={`dot ${tone}`}></i>
                  <span>
                    {label}
                    <small>{sub}</small>
                  </span>
                  <strong>{n}</strong>
                  <em>{pct(n).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</em>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="panel activity">
          <div className="panel-head">
            <div>
              <h3>Hoạt động gần đây</h3>
              <p>Cập nhật trạng thái mới nhất</p>
            </div>
          </div>
          {orders == null ? (
            <p className="activity-empty">Đang tải…</p>
          ) : recent.length === 0 ? (
            <p className="activity-empty">Chưa có đơn hàng nào</p>
          ) : (
            recent.map((o) => (
              <div className="activity-row" key={o.orderCode}>
                <span className={`activity-icon ${GROUP_TONE[o.group] === "red" ? "orange" : GROUP_TONE[o.group] === "orange" ? "purple" : GROUP_TONE[o.group]}`}>
                  <Icon name={o.group === "DELIVERED" ? "check" : o.group === "SHIPPING" ? "truck" : "box"} size={17} />
                </span>
                <div>
                  <strong>Đơn {o.orderCode}</strong>
                  <p>{o.statusLabel}</p>
                </div>
                <time>{relativeTime(o.createdAt)}</time>
              </div>
            ))
          )}
        </div>
      </section>
      <section className="panel orders-panel">
        <div className="panel-head">
          <div>
            <h3>Đơn hàng gần đây</h3>
            <p>Các đơn hàng được tạo gần nhất</p>
          </div>
          <button className="text-btn" onClick={onAll}>
            Xem tất cả <Icon name="arrow" size={16} />
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
    <section className="panel full-panel">
      <div className="panel-head">
        <div>
          <h2>Quản lý đơn hàng</h2>
          <p>Theo dõi tất cả đơn bạn gửi và nhận</p>
        </div>
        <button className="primary" onClick={onCreate}>
          <Icon name="plus" size={18} />
          Tạo đơn mới
        </button>
      </div>
      <div className="filter-row">
        {FILTERS.map((f) => (
          <button key={f.id} className={`filter ${filter === f.id ? "active" : ""}`} onClick={() => setFilter(f.id)}>
            {f.label} <b>{count(f.id)}</b>
          </button>
        ))}
        <input
          className="search-filter"
          placeholder="Mã đơn, tên, SĐT…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginLeft: "auto" }}
        />
        <button className="outline" onClick={onReload}>
          Tải lại
        </button>
        <button
          className="outline"
          style={{ marginLeft: 0 }}
          type="button"
          title="Xuất CSV"
          onClick={() => exportFile("csv")}
        >
          <Icon name="download" size={17} />
          CSV
        </button>
        <button
          className="outline"
          style={{ marginLeft: 0 }}
          type="button"
          title="Xuất Excel"
          onClick={() => exportFile("excel")}
        >
          <Icon name="download" size={17} />
          Excel
        </button>
      </div>
      <OrderTable rows={rows} detailed loading={orders == null} />
    </section>
  );
}

function OrderTable({ rows, detailed = false, loading = false }: { rows: CustomerOrderRow[]; detailed?: boolean; loading?: boolean }) {
  const [viewing, setViewing] = useState<CustomerOrderRow | null>(null);
  const cols = detailed ? 7 : 5;
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
              <th>MÃ ĐƠN</th>
              {detailed && <th>NGÀY TẠO</th>}
              <th>NGƯỜI NHẬN</th>
              <th>PHÍ VẬN CHUYỂN</th>
              <th>TIỀN COD</th>
              <th>TRẠNG THÁI</th>
              {detailed && <th>TÁC VỤ</th>}
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
                      <strong className="order-id order-id-strong">{o.orderCode}</strong>
                      {detailed && (
                        <span
                          className={`invoice-flag ${o.invoiced ? "done" : ""}`}
                          title={o.invoiced ? "Đã xuất hoá đơn" : "Chưa xuất hoá đơn"}
                        >
                          <Icon name="receipt" size={16} />
                        </span>
                      )}
                      {o.direction === "RECEIVED" && <span className="direction-tag">Nhận</span>}
                    </div>
                  </td>
                  {detailed && <td className="created">{dateTime(o.createdAt)}</td>}
                  <td>
                    <div className="customer">
                      <strong>{o.receiverName || o.receiverPhone || "—"}</strong>
                      <span>{o.deliveryAddress || o.toOfficeName || ""}</span>
                    </div>
                  </td>
                  <td>
                    <div className="customer">
                      <strong>{money(o.fareAmount)}</strong>
                      {detailed && <span>{o.payer === "SENDER" ? "Người gửi trả" : "Người nhận trả"}</span>}
                    </div>
                  </td>
                  <td>{o.codAmount ? money(o.codAmount) : "0đ"}</td>
                  <td>
                    <span className={`badge ${GROUP_TONE[o.group]}`}>
                      <i></i>
                      {o.statusLabel || "—"}
                    </span>
                  </td>
                  {detailed && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="row-actions">
                        <button className="row-btn" title="Xem chi tiết" onClick={() => setViewing(o)}>
                          <Icon name="eye" size={16} />
                        </button>
                        <button className="row-btn" title="Sao chép mã đơn" onClick={() => copy(o.orderCode)}>
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

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-label={`Chi tiết đơn ${row.orderCode}`} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <p>Chi tiết đơn hàng</p>
            <h2>{row.orderCode}</h2>
          </div>
          <button className="row-btn" aria-label="Đóng" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="detail-meta">
          <span className={`badge ${GROUP_TONE[row.group]}`}>
            <i></i>
            {detail?.statusLabel || row.statusLabel}
          </span>
          <span className={`badge ${invoiced ? "green" : "orange"}`}>
            <i></i>
            {invoiced ? `Đã xuất hoá đơn${detail?.invoiceNo ? ` · ${detail.invoiceNo}` : ""}` : "Chưa xuất hoá đơn"}
          </span>
        </div>
        <section className="detail-section">
          <h3>Thông tin đơn</h3>
          <dl>
            <div>
              <dt>Mã đơn</dt>
              <dd>{row.orderCode}</dd>
            </div>
            <div>
              <dt>Ngày tạo</dt>
              <dd>{dateTime(row.createdAt)}</dd>
            </div>
            <div>
              <dt>Hành trình</dt>
              <dd>
                {row.fromOfficeName || "—"} → {row.toOfficeName || "—"}
              </dd>
            </div>
            {detail?.note ? (
              <div>
                <dt>Ghi chú</dt>
                <dd>{detail.note}</dd>
              </div>
            ) : null}
          </dl>
        </section>
        <section className="detail-section">
          <h3>{row.direction === "SENT" ? "Người nhận" : "Người gửi"}</h3>
          <dl>
            <div>
              <dt>Tên</dt>
              <dd>{(row.direction === "SENT" ? row.receiverName : row.senderName) || "—"}</dd>
            </div>
            <div>
              <dt>Số điện thoại</dt>
              <dd>{(row.direction === "SENT" ? row.receiverPhone : row.senderPhone) || "—"}</dd>
            </div>
            {row.direction === "SENT" && (
              <div>
                <dt>Địa chỉ</dt>
                <dd>{row.deliveryAddress || row.toOfficeName || "—"}</dd>
              </div>
            )}
          </dl>
        </section>
        <section className="detail-section">
          <h3>Thông tin thanh toán</h3>
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
              <dt>Tiền COD thu hộ</dt>
              <dd>{cod ? money(cod) : "Không có"}</dd>
            </div>
            {cod > 0 && (
              <div>
                <dt>Hoàn COD</dt>
                <dd>
                  <span className={`badge ${codRefunded ? "green" : "orange"}`}>
                    <i></i>
                    {codRefunded ? "Đã hoàn cho người gửi" : "Chưa hoàn"}
                  </span>
                </dd>
              </div>
            )}
          </dl>
        </section>
        <section className="order-log">
          <h3>
            <Icon name="box" size={20} />
            Trạng thái đơn
          </h3>
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
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => setValues(initial)}>
              Hủy
            </button>
            <button type="submit" className="primary">
              Lưu thay đổi
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
