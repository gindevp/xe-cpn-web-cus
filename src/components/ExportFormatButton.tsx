import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ExportFormat } from "@/lib/csv";
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

/** Nút xuất: chọn CSV (.csv) hoặc Excel (.xls). */
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
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
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[11rem]">
        <DropdownMenuItem
          className="gap-2"
          disabled={disabled || busy}
          onSelect={() => void onExport("csv")}
        >
          <FileText className="h-4 w-4" />
          CSV (.csv)
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2"
          disabled={disabled || busy}
          onSelect={() => void onExport("excel")}
        >
          <FileSpreadsheet className="h-4 w-4" />
          Excel (.xls)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
