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

/** Nút nhanh cạnh avatar — xoay Sáng → Tối → Hệ thống. */
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

/** Mục menu user: chọn Sáng / Tối / Theo hệ thống. */
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
