import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import xeLogo from "@/assets/logo-xe.png";
import { useAuth } from "@/lib/auth";
import { canRead, useRbacVersion } from "@/lib/rbac";
import { TaoDonDialog } from "@/components/TaoDonDialog";
import { M3_NAV_GROUPS, navActiveLabel } from "@/components/shell/nav-config";
import { cn } from "@/lib/utils";

type Props = {
  onNavigate?: () => void;
  /** Mobile: luôn hiện trong drawer */
  mobile?: boolean;
};

export function AppNav({ onNavigate, mobile }: Props) {
  const { session } = useAuth();
  useRbacVersion();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeLabel = navActiveLabel(pathname);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const cancelClose = () => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  useEffect(() => () => cancelClose(), []);

  const closeSoon = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpenIdx(null), 180);
  };

  const groups = M3_NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => canRead(session?.role, i.screen)),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <nav
        className={cn("side rail theme-light", mobile && "m3-rail-mobile")}
        aria-label="Điều hướng chính"
      >
        <Link
          to="/dashboard"
          className="brand"
          aria-label="X.E Việt Nam, về Tổng quan"
          onClick={onNavigate}
        >
          <img src={xeLogo} alt="X.E Việt Nam" />
        </Link>

        <button
          type="button"
          className="create-btn"
          aria-label="Tạo đơn hàng"
          onClick={() => setCreateOpen(true)}
        >
          <span className="ms" aria-hidden="true">
            add
          </span>
          <span className="side-text">Tạo đơn hàng</span>
        </button>

        {openIdx !== null ? (
          <div className="menu-back nav-back" onClick={() => setOpenIdx(null)} aria-hidden />
        ) : null}

        {groups.map((g, i) => {
          const hasActive = g.items.some((x) => x.label === activeLabel);
          const isOpen = openIdx === i;
          return (
            <div
              key={g.title}
              className="nav-group"
              onMouseEnter={() => {
                if (window.innerWidth > 760) {
                  cancelClose();
                  if (openIdx !== i) setOpenIdx(i);
                }
              }}
              onMouseLeave={() => {
                if (window.innerWidth > 760) closeSoon();
              }}
              onFocus={() => {
                cancelClose();
                setOpenIdx(i);
              }}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) closeSoon();
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpenIdx(null);
              }}
            >
              <button
                type="button"
                className={cn("nav-head", hasActive && "on", isOpen && "open")}
                aria-haspopup="true"
                aria-expanded={isOpen}
                aria-label={g.title}
                onClick={() => {
                  /* Desktop: hover đã mở — click trái không được đóng (khớp design-ref).
                     Chỉ mở nhóm khác; đóng bằng mouseleave / Escape / chọn mục / menu-back. */
                  cancelClose();
                  if (openIdx !== i) setOpenIdx(i);
                }}
              >
                <span className="nav-pill" aria-hidden="true">
                  <span className={cn("ms", hasActive && "fill")}>{g.icon}</span>
                </span>
                <span className="nav-short">{g.short}</span>
              </button>
              {isOpen ? (
                <div className="nav-fly">
                  <div className="nav-fly-title">{g.title}</div>
                  {g.items.map((l) => {
                    const on = l.label === activeLabel;
                    return (
                      <Link
                        key={l.to}
                        to={l.to}
                        className={cn("nav-item", on && "on")}
                        aria-current={on ? "page" : undefined}
                        onClick={() => {
                          setOpenIdx(null);
                          onNavigate?.();
                        }}
                      >
                        <span className={cn("ms", on && "fill")} aria-hidden="true">
                          {l.icon}
                        </span>
                        <span>{l.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
      <TaoDonDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
