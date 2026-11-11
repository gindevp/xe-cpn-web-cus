import type { ScreenKey } from "@/lib/rbac";

export type M3NavItem = {
  to: string;
  label: string;
  icon: string;
  screen: ScreenKey;
};

export type M3NavGroup = {
  title: string;
  short: string;
  icon: string;
  items: M3NavItem[];
};

/** Khớp design-ref AppNav.dc.html — lifecycle pills nằm AppHero. */
export const M3_NAV_GROUPS: M3NavGroup[] = [
  {
    title: "Vận hành",
    short: "Vận hành",
    icon: "local_shipping",
    items: [
      { to: "/dashboard", label: "Tổng quan", icon: "dashboard", screen: "dashboard" },
      { to: "/kiem-ke", label: "Thông tin kiểm kê", icon: "inventory", screen: "kiem-ke" },
      { to: "/bao-cao-gio", label: "Báo cáo theo giờ", icon: "schedule", screen: "bao-cao-gio" },
      { to: "/bao-gio-xe", label: "Báo giờ xe đến/đi", icon: "departure_board", screen: "bao-gio-xe" },
    ],
  },
  {
    title: "Tài chính",
    short: "Tài chính",
    icon: "account_balance_wallet",
    items: [
      { to: "/phieu-thu", label: "Phiếu thu", icon: "receipt", screen: "phieu-thu" },
      { to: "/danh-sach-phieu-thu", label: "Danh sách phiếu thu", icon: "receipt_long", screen: "danh-sach-phieu-thu" },
      { to: "/giao-dich-thu-ho", label: "Giao dịch thu hộ", icon: "swap_horiz", screen: "giao-dich-thu-ho" },
      { to: "/quan-ly-don-cod", label: "Quản lý đơn COD", icon: "payments", screen: "quan-ly-don-cod" },
      { to: "/quan-ly-hoa-don", label: "Quản lý hoá đơn", icon: "description", screen: "quan-ly-hoa-don" },
      { to: "/crm-sdt", label: "CRM SĐT - MST", icon: "contact_phone", screen: "crm-sdt" },
      { to: "/bao-cao-doanh-thu", label: "Báo cáo doanh thu", icon: "bar_chart", screen: "bao-cao-doanh-thu" },
    ],
  },
  {
    title: "Giá và dữ liệu",
    short: "Dữ liệu",
    icon: "database",
    items: [
      { to: "/bang-gia", label: "Bảng giá", icon: "sell", screen: "bang-gia" },
      { to: "/phu-phi", label: "Cài đặt phụ phí", icon: "price_change", screen: "phu-phi" },
      { to: "/master", label: "Master dữ liệu", icon: "database", screen: "master" },
    ],
  },
  {
    title: "Nhân sự và quyền",
    short: "Nhân sự",
    icon: "group",
    items: [
      { to: "/tai-khoan", label: "Tài khoản", icon: "person", screen: "tai-khoan" },
      { to: "/cham-cong", label: "Chấm công", icon: "event_available", screen: "cham-cong" },
      { to: "/nhom-quyen", label: "Nhóm quyền", icon: "admin_panel_settings", screen: "nhom-quyen" },
      { to: "/phien-dang-nhap", label: "Phiên đăng nhập & thiết bị", icon: "devices", screen: "phien-dang-nhap" },
    ],
  },
  {
    title: "Hệ thống",
    short: "Hệ thống",
    icon: "settings",
    items: [
      { to: "/tich-hop", label: "Tích hợp", icon: "hub", screen: "tich-hop" },
      { to: "/bao-tri", label: "Cấu hình", icon: "settings", screen: "bao-tri" },
    ],
  },
];

export function navActiveLabel(pathname: string): string {
  for (const g of M3_NAV_GROUPS) {
    for (const i of g.items) {
      if (pathname === i.to || (i.to !== "/dashboard" && pathname.startsWith(`${i.to}/`))) {
        return i.label;
      }
    }
  }
  return "";
}
