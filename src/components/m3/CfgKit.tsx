import type { InputHTMLAttributes, ReactNode } from "react";
import { toast } from "sonner";

/** Bộ khối cấu hình theo design TichHop/CauHinh (`.card.stack` + `.cfg-grid`). */

export type CfgTag = { label: string; tone: "ok" | "warn" | "err" | "info" };

/** Mục con dùng chung cho tab Thu hộ (OnePay + BIDV). */
export type CollectSub = "ket-noi" | "hoa-don" | "nhat-ky";

export function CfgCard({
  icon,
  title,
  tags,
  desc,
  acts,
  grid = true,
  children,
}: {
  icon: string;
  title: ReactNode;
  tags?: (CfgTag | null | undefined | false)[];
  desc?: ReactNode;
  acts?: ReactNode;
  /** false: children render trực tiếp (bảng/panel), không bọc `.cfg-grid`. */
  grid?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className="card stack">
      <CfgHeader icon={icon} title={title} tags={tags} desc={desc} />
      {children ? grid ? <div className="cfg-grid">{children}</div> : children : null}
      {acts ? <CfgActs>{acts}</CfgActs> : null}
    </section>
  );
}

/** Tiêu đề card cấu hình: `.sec-title` + tag + mô tả. */
export function CfgHeader({
  icon,
  title,
  tags,
  desc,
}: {
  icon: string;
  title: ReactNode;
  tags?: (CfgTag | null | undefined | false)[];
  desc?: ReactNode;
}) {
  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px" }}>
        <h2 className="group-title sec-title">
          <span className="sec-ic" aria-hidden="true">
            <span className="ms">{icon}</span>
          </span>
          {title}
        </h2>
        {(tags ?? []).map((t) =>
          t ? (
            <span key={t.label} className={`tag ${t.tone}`}>
              {t.label}
            </span>
          ) : null,
        )}
      </div>
      {desc ? (
        <div className="lab muted" style={{ maxWidth: 860, marginTop: -8 }}>
          {desc}
        </div>
      ) : null}
    </>
  );
}

export function CfgSubTabs<T extends string>({
  tabs,
  value,
  onChange,
  label = "Mục con",
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="sub-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          className={t.id === value ? "on" : undefined}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function CfgField({
  label,
  saved,
  wide,
  children,
}: {
  label: ReactNode;
  saved?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? "field cfg-field cfg-wide" : "field cfg-field"}>
      <span className="l">
        {label}{" "}
        {saved ? (
          <span className="tag ok" style={{ height: 20 }}>
            Đã lưu
          </span>
        ) : null}
      </span>
      {children}
    </div>
  );
}

export function CfgInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className="box input-box">
      <input {...props} />
    </span>
  );
}

export function CfgSeg<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="field cfg-field cfg-wide">
      <span className="l">{label}</span>
      <div
        className="seg"
        role="radiogroup"
        aria-label={label}
        style={{ background: "var(--low)", alignSelf: "flex-start" }}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={o.value === value ? "on" : undefined}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CfgUrl({
  label,
  url,
  emptyText,
  copiedText = "Đã copy URL",
}: {
  label: string;
  url: string | null | undefined;
  emptyText: string;
  copiedText?: string;
}) {
  return (
    <div className="field cfg-field cfg-wide">
      <span className="l">{label}</span>
      <div
        className="box input-box"
        style={{ background: "var(--low)", borderColor: "transparent" }}
      >
        <span
          className={url ? "num" : "muted"}
          title={url || undefined}
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {url || emptyText}
        </span>
        {url ? (
          <button
            type="button"
            className="text-act"
            onClick={() => {
              void navigator.clipboard.writeText(url).then(
                () => toast.success(copiedText),
                () => toast.message(url),
              );
            }}
          >
            Copy
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function CfgActs({
  updatedAt,
  meta,
  children,
}: {
  updatedAt?: string | null;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      {updatedAt !== undefined ? (
        <span className="lab muted num">
          Cập nhật gần nhất: {updatedAt ? new Date(updatedAt).toLocaleString("vi-VN") : "—"}
        </span>
      ) : null}
      {meta ? <span className="lab muted num">{meta}</span> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginLeft: "auto" }}>
        {children}
      </div>
    </div>
  );
}

export function CfgToggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className="toggle cfg-wide"
      style={disabled ? { opacity: 0.38, cursor: "not-allowed" } : undefined}
    >
      <input
        className="switch"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export function CfgCheck({
  label,
  checked,
  onChange,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="choice">
      <input
        className="check"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export function CfgNote({ children }: { children: ReactNode }) {
  return <div className="note cfg-wide">{children}</div>;
}

export function CfgHead({ children }: { children: ReactNode }) {
  return (
    <div className="title-small cfg-wide" style={{ fontWeight: 600, marginTop: 4 }}>
      {children}
    </div>
  );
}

export function CfgSentence({ children }: { children: ReactNode }) {
  return <div className="sentence cfg-wide num">{children}</div>;
}
