import { Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { themeModeLabel, useTheme, type ColorMode } from "@/lib/theme";

function ModeIcon({ mode, className }: { mode: ColorMode; className?: string }) {
  if (mode === "dark") return <Moon className={className} />;
  if (mode === "system") return <Monitor className={className} />;
  return <Sun className={className} />;
}

const MODE_OPTS: { value: ColorMode; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Sáng", Icon: Sun },
  { value: "dark", label: "Tối", Icon: Moon },
  { value: "system", label: "Hệ thống", Icon: Monitor },
];

/** Segmented Sáng / Tối / Hệ thống — dùng trong menu đáy navbar. */
export function ThemeModeSeg({ className }: { className?: string }) {
  const { mode, setMode } = useTheme();
  return (
    <div className={cn("w-full", className)}>
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">Giao diện</div>
      <div
        className="flex gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5"
        role="radiogroup"
        aria-label="Giao diện"
      >
        {MODE_OPTS.map(({ value, label, Icon }) => {
          const on = mode === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={on}
              title={label}
              onClick={() => setMode(value)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-[11px] font-medium transition-colors",
                on
                  ? "bg-background text-primary shadow-sm ring-1 ring-primary/25"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Nút nhanh — chỉ còn dùng ở login (không có navbar). */
export function ThemeCycleButton({ className }: { className?: string }) {
  const { mode, cycleMode } = useTheme();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-9 w-9 shrink-0 text-muted-foreground", className)}
      title={`Giao diện: ${themeModeLabel(mode)} (bấm để đổi)`}
      aria-label={`Giao diện ${themeModeLabel(mode)}`}
      onClick={cycleMode}
    >
      <ModeIcon mode={mode} className="h-4 w-4" />
    </Button>
  );
}

/** Mục menu user (legacy) — ưu tiên ThemeModeSeg ở đáy nav. */
export function ThemeMenuItems() {
  const { mode, setMode } = useTheme();
  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <ModeIcon mode={mode} className="mr-2 h-4 w-4" />
          Giao diện · {themeModeLabel(mode)}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup value={mode} onValueChange={(v) => setMode(v as ColorMode)}>
            <DropdownMenuRadioItem value="light">
              <Sun className="mr-2 h-4 w-4" /> Sáng
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon className="mr-2 h-4 w-4" /> Tối
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <Monitor className="mr-2 h-4 w-4" /> Theo máy (chỉ NV)
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <p className="px-2 pb-1.5 pt-1 text-[11px] text-muted-foreground">
            Lưu theo tài khoản · không áp dụng màn khách
          </p>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
    </>
  );
}

export function ThemeMenuCycleItem() {
  const { mode, cycleMode } = useTheme();
  return (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault();
        cycleMode();
      }}
    >
      <ModeIcon mode={mode} className="mr-2 h-4 w-4" />
      Giao diện · {themeModeLabel(mode)}
    </DropdownMenuItem>
  );
}
