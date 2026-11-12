import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS, officeName } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import {
  resolveViewOffice,
  viewOfficeDisplayLabel,
} from "@/lib/office-scope";
import { ThemeModeSeg } from "@/components/ThemeToggle";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { openSiblingUi, SIBLING_UI_LABEL } from "@/lib/sibling-ui";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Tài khoản + theme + chuyển giao diện — đáy navbar. */
export function NavAccountMenu({
  compact,
  onNavigate,
}: {
  /** Rail hẹp: chỉ avatar. */
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const { themeClass } = useTheme();
  const offices = useStore((s) => s.offices);
  const viewOffice = useStore((s) => s.viewOffice);
  const [openPw, setOpenPw] = useState(false);

  if (!session) return null;

  const officeScope = resolveViewOffice(session, viewOffice);
  const officeLabel = viewOfficeDisplayLabel(officeScope, offices, officeName);
  const roleLabel = ROLE_LABELS[session.role] ?? session.role;
  const initial = (session.username.trim()[0] || "?").toLocaleUpperCase("vi-VN");
  const sub = `${roleLabel} · ${officeLabel}`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "m3-nav-account",
              compact ? "m3-nav-account-compact" : "m3-nav-account-wide",
            )}
            title={`${session.username} · ${sub}`}
            aria-label={`Tài khoản ${session.username}`}
          >
            <span className="m3-nav-account-avatar" aria-hidden>
              {initial}
            </span>
            {!compact ? (
              <span className="m3-nav-account-meta">
                <span className="m3-nav-account-name">{session.username}</span>
                <span className="m3-nav-account-sub">{sub}</span>
              </span>
            ) : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="right"
          align="end"
          sideOffset={10}
          className={cn("w-[min(92vw,17.5rem)] p-2", themeClass)}
        >
          <div className="mb-2 flex items-center gap-2.5 px-1 py-1">
            <span className="m3-nav-account-avatar" aria-hidden>
              {initial}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{session.username}</div>
              <div className="truncate text-xs text-muted-foreground">{sub}</div>
            </div>
          </div>
          <ThemeModeSeg className="mb-2 px-0.5" />
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              onNavigate?.();
              openSiblingUi();
            }}
          >
            <span className="ms mr-2" aria-hidden="true">
              swap_horiz
            </span>
            {SIBLING_UI_LABEL}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              onNavigate?.();
              setOpenPw(true);
            }}
          >
            <span className="ms mr-2" aria-hidden="true">
              key
            </span>
            Đổi mật khẩu
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => {
              logout();
              // Hard redirect sau khi JWT đã clear sync — tránh navigate SPA rồi hydrate lại.
              if (typeof window !== "undefined") window.location.assign("/login");
              else navigate({ to: "/login" });
            }}
          >
            <span className="ms mr-2" aria-hidden="true">
              logout
            </span>
            Đăng xuất
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={openPw} onOpenChange={setOpenPw} />
    </>
  );
}
