import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ExportFormat } from "@/lib/csv";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type Props = {
  onExport: (format: ExportFormat) => void | Promise<void>;
  disabled?: boolean;
  busy?: boolean;
  /** Nhãn nút, mặc định «Xuất». */
  label?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
  title?: string;
};

/** Nút xuất: chọn CSV (.csv) hoặc Excel (.xls). Trigger dùng `.btn tonal` (design M3). */
export function ExportFormatButton({
  onExport,
  disabled,
  busy,
  label = "Xuất",
  size = "sm",
  variant = "outline",
  className,
  title = "Chọn định dạng xuất CSV hoặc Excel",
}: Props) {
  const { themeClass } = useTheme();
  const useM3 = !className?.includes("btn") && variant === "outline" && size === "sm";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {useM3 ? (
          <button
            type="button"
            className={cn("btn tonal", className)}
            disabled={disabled || busy}
            title={title}
          >
            <span className="ms" aria-hidden="true">
              download
            </span>
            {busy ? "Đang xuất…" : label}
            <span className="ms" aria-hidden="true">
              expand_more
            </span>
          </button>
        ) : (
          <Button
            type="button"
            size={size}
            variant={variant}
            disabled={disabled || busy}
            title={title}
            className={cn("gap-2", className)}
          >
            <Download className="h-4 w-4" />
            {busy ? "Đang xuất…" : label}
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn(
          themeClass,
          "min-w-[11rem] border-0 bg-[var(--lowest)] text-[var(--on-surface)] shadow-[0_1px_3px_rgba(0,0,0,.3),0_4px_8px_3px_rgba(0,0,0,.15)]",
        )}
      >
        <DropdownMenuItem
          className="gap-2 rounded-full"
          disabled={disabled || busy}
          onSelect={() => void onExport("csv")}
        >
          <span className="ms" aria-hidden="true">
            description
          </span>
          CSV (.csv)
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 rounded-full"
          disabled={disabled || busy}
          onSelect={() => void onExport("excel")}
        >
          <span className="ms" aria-hidden="true">
            table
          </span>
          Excel (.xls)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
