import type { ReactNode } from "react";

const GLYPHS: Record<string, ReactNode> = {
  pin: (
    <>
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />,
  pkg: (
    <>
      <path d="m21 8-9-5-9 5 9 5 9-5Z" />
      <path d="M3 8v8l9 5 9-5V8M12 13v8M7.5 5.5l9 5" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c.7-4.2 3.3-6 8-6s7.3 1.8 8 6" />
    </>
  ),
  send: <path d="m3 11 18-8-8 18-2-8-8-2Z" />,
  shield: (
    <>
      <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  split: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v9h9" />
    </>
  ),
  home: <path d="M3 11 12 4l9 7v9h-6v-6H9v6H3z" />,
  ruler: <path d="M3 17 17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2" />,
  scale: (
    <>
      <path d="M6 7h12l2 13H4z" />
      <circle cx="12" cy="5" r="2" />
    </>
  ),
  bank: <path d="M3 10h18M5 10v8m5-8v8m4-8v8m5-8v8M3 21h18M12 3l9 5H3l9-5Z" />,
  check: <path d="m5 12 5 5 9-10" />,
  arrow: <path d="m9 18 6-6-6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  truck: (
    <>
      <path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z" />
      <circle cx="7" cy="19" r="2" />
      <circle cx="18" cy="19" r="2" />
    </>
  ),
  download: <path d="M12 3v12m-5-5 5 5 5-5M5 21h14" />,
  printer: <path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z" />,
};

export function CfGlyph({ name, size = 20 }: { name: string; size?: number }) {
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
      {GLYPHS[name]}
    </svg>
  );
}

export function TruckArt() {
  return (
    <svg className="cf-art" viewBox="0 0 240 150" aria-hidden="true">
      <ellipse cx="120" cy="132" rx="100" ry="8" fill="rgba(255,255,255,.12)" />
      <path d="M18 60h40M8 76h36M22 92h30" stroke="rgba(255,255,255,.35)" strokeWidth="4" strokeLinecap="round" />
      <rect x="60" y="40" width="96" height="70" rx="10" fill="#fff" />
      <rect x="74" y="54" width="34" height="28" rx="4" fill="#dbe5fb" />
      <path d="M74 66h34M91 54v28" stroke="#274ea1" strokeWidth="2" />
      <path d="M156 62h30l22 24v24h-52Z" fill="#fff" />
      <path d="M164 70h20l14 16h-34Z" fill="#9db6ea" />
      <circle cx="90" cy="114" r="14" fill="#10192e" />
      <circle cx="90" cy="114" r="5" fill="#fff" />
      <circle cx="182" cy="114" r="14" fill="#10192e" />
      <circle cx="182" cy="114" r="5" fill="#fff" />
      <rect x="118" y="20" width="26" height="26" rx="5" fill="#f59e0b" />
      <path d="M118 33h26M131 20v26" stroke="#fff" strokeWidth="2" />
    </svg>
  );
}

export function SuccessArt() {
  return (
    <svg className="cf-success-art" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="#eafcf0" />
      <circle cx="60" cy="60" r="40" fill="#40ac67" />
      <path d="m42 61 12 12 24-26" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="14" cy="28" r="4" fill="#f59e0b" />
      <circle cx="104" cy="22" r="3" fill="#274ea1" />
      <circle cx="108" cy="92" r="5" fill="#f59e0b" />
      <circle cx="12" cy="90" r="3" fill="#274ea1" />
    </svg>
  );
}

/** Ô nhập của luồng tạo đơn; bỏ `icon` thì input không thụt lề trái. */
export function CfField({
  icon,
  label,
  children,
  wide,
  hint,
}: {
  icon?: string;
  label: string;
  children: ReactNode;
  wide?: boolean;
  hint?: ReactNode;
}) {
  return (
    <div className={`cf-field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      <div className={`cf-input ${icon ? "" : "noicon"}`}>
        {icon && <CfGlyph name={icon} />}
        {children}
      </div>
      {hint && <small className="cf-hint">{hint}</small>}
    </div>
  );
}

export function CfBlockTitle({
  icon,
  tone,
  title,
  sub,
  action,
}: {
  icon: string;
  tone: "blue" | "green" | "orange";
  title: string;
  sub?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="cf-block-title">
      <div className={`cf-badge ${tone}`}>
        <CfGlyph name={icon} />
      </div>
      <div>
        <strong>{title}</strong>
        {sub && <small>{sub}</small>}
      </div>
      {action}
    </div>
  );
}

const STEPS = [
  ["pin", "Chọn văn phòng", "Điểm gửi & điểm nhận"],
  ["pkg", "Thông tin đơn", "Người nhận, hàng hoá, thanh toán"],
  ["shield", "Hoàn tất", "Xác nhận đơn hàng"],
] as const;

export function CfRail({ step, tip }: { step: number; tip: string }) {
  return (
    <aside className="cf-rail">
      <div className="cf-rail-head">
        <span>Tạo đơn mới</span>
        <strong>Gửi hàng nhanh chóng, an toàn</strong>
      </div>
      <ol className="cf-steps">
        {STEPS.map(([icon, title, desc], i) => (
          <li key={title} className={i + 1 === step ? "current" : i + 1 < step ? "done" : ""}>
            <i>{i + 1 < step ? <CfGlyph name="check" size={16} /> : <CfGlyph name={icon} />}</i>
            <div>
              <strong>{title}</strong>
              <small>{desc}</small>
            </div>
          </li>
        ))}
      </ol>
      <TruckArt />
      <p className="cf-tip">
        <CfGlyph name="shield" />
        {tip}
      </p>
    </aside>
  );
}
