import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Trễ khi rời chuột để còn kịp di từ nút sang menu. */
const CLOSE_DELAY_MS = 160;

/** Menu tác vụ "…" của dòng (design `.act .no` + more_vert). */
export function RowActionsMenu({
  children,
  title = "Tác vụ",
  /** Mặc định trái: không đè lên nút "…" / thao tác của dòng bên dưới. */
  side = "left",
  align = "start",
  contentClassName = "w-48",
  buttonClassName = "no",
}: {
  children: ReactNode;
  title?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  contentClassName?: string;
  buttonClassName?: string;
}) {
  const { themeClass } = useTheme();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const clearCloseTimer = () => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  useEffect(() => clearCloseTimer, []);

  const openByHover = () => {
    clearCloseTimer();
    setOpen(true);
  };

  const closeSoon = () => {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(v) => {
        clearCloseTimer();
        setOpen(v);
      }}
      modal={false}
    >
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className={buttonClassName}
          title={title}
          aria-label={title}
          onMouseEnter={openByHover}
          onMouseLeave={closeSoon}
          onPointerDown={(e) => {
            if (open) e.preventDefault();
          }}
          onClick={openByHover}
        >
          <span className="ms" aria-hidden="true">
            more_vert
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={side}
        align={align}
        sideOffset={6}
        className={cn(
          themeClass,
          "border-0 bg-[var(--lowest)] text-[var(--on-surface)] shadow-[0_1px_3px_rgba(0,0,0,.3),0_4px_8px_3px_rgba(0,0,0,.15)]",
          contentClassName,
        )}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={closeSoon}
        onPointerDownOutside={(e) => {
          if (triggerRef.current?.contains(e.target as Node)) e.preventDefault();
        }}
        onFocusOutside={(e) => {
          if (triggerRef.current?.contains(e.target as Node)) e.preventDefault();
        }}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
