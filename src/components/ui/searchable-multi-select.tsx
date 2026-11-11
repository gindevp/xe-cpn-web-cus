"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { useTheme } from "@/lib/theme";
import { vnCmdkFilter } from "@/lib/vn-search";
import type { SearchableSelectOption } from "@/components/ui/searchable-select";

export type SearchableMultiSelectProps = {
  /** Giá trị đang chọn (không gồm allValue). */
  values: string[];
  onValuesChange: (values: string[]) => void;
  options: SearchableSelectOption[];
  /** Giá trị đặc biệt = chọn hết / bỏ lọc. */
  allValue?: string;
  allLabel?: string;
  /** true khi đang chọn "all". */
  allSelected?: boolean;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  id?: string;
};

/**
 * Combobox chọn nhiều: checkbox từng dòng + mục "Toàn hệ thống".
 * Chọn ALL → xóa các mã; chọn mã → tắt ALL.
 */
export function SearchableMultiSelect({
  values,
  onValuesChange,
  options,
  allValue = "ALL",
  allLabel = "Toàn hệ thống",
  allSelected = false,
  placeholder = "Chọn…",
  emptyText = "Không tìm thấy kết quả",
  disabled,
  className,
  contentClassName,
  id,
}: SearchableMultiSelectProps) {
  const { themeClass } = useTheme();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const anchorRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const selectedSet = React.useMemo(() => new Set(values), [values]);

  const displayLabel = React.useMemo(() => {
    if (allSelected || values.length === 0) return allLabel;
    if (values.length === 1) {
      return options.find((o) => o.value === values[0])?.label ?? values[0]!;
    }
    if (values.length <= 2) {
      return values.map((v) => options.find((o) => o.value === v)?.label ?? v).join(", ");
    }
    return `${values.length} văn phòng`;
  }, [allSelected, values, options, allLabel]);

  React.useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.stopPropagation();
      if (el.scrollHeight <= el.clientHeight) return;
      e.preventDefault();
      el.scrollTop += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open, options.length]);

  const openList = () => {
    if (disabled || open) return;
    setSearch("");
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setSearch("");
  };

  const pickAll = () => {
    onValuesChange([]);
  };

  const toggle = (v: string) => {
    if (v === allValue) {
      pickAll();
      return;
    }
    const next = new Set(selectedSet);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onValuesChange([...next]);
  };

  return (
    <Command filter={vnCmdkFilter} shouldFilter className="contents">
      <Popover open={open} onOpenChange={(o) => (o ? openList() : close())} modal={false}>
        <PopoverAnchor asChild>
          <div
            ref={anchorRef}
            className={cn(
              "box input-box m3-combo-trigger",
              disabled && "opacity-50",
              className
                ?.split(/\s+/)
                .filter((c) => c && !/^(h-|min-h-|max-h-|py-|pt-|pb-)/.test(c))
                .join(" "),
            )}
            onMouseDown={(e) => {
              if (disabled || e.target === inputRef.current) return;
              e.preventDefault();
              inputRef.current?.focus();
              if (open) close();
              else openList();
            }}
          >
            <CommandPrimitive.Input
              ref={inputRef}
              id={id}
              disabled={disabled}
              role="combobox"
              aria-expanded={open}
              aria-multiselectable
              autoComplete="off"
              value={open ? search : displayLabel}
              onValueChange={(v) => {
                setSearch(v);
                if (!open) setOpen(true);
              }}
              placeholder={displayLabel || placeholder}
              onFocus={openList}
              onClick={openList}
              onBlur={close}
              onKeyDown={(e) => {
                if (e.key === "Escape" && open) {
                  e.preventDefault();
                  e.stopPropagation();
                  close();
                } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) {
                  openList();
                }
              }}
              className={cn(
                "min-w-0 flex-1 truncate bg-transparent outline-none disabled:cursor-not-allowed",
                open ? "placeholder:text-foreground/60" : undefined,
              )}
            />
            <span className="ms" aria-hidden="true" style={{ fontSize: 18, color: "var(--on-surface-variant)" }}>
              expand_more
            </span>
          </div>
        </PopoverAnchor>
        <PopoverContent
          className={cn(
            "z-[100] w-[var(--radix-popover-trigger-width)] min-w-[var(--radix-popper-anchor-width)] overflow-hidden border-0 bg-transparent p-0 shadow-none",
            contentClassName,
          )}
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (anchorRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
          onMouseDown={(e) => e.preventDefault()}
          onWheel={(e) => e.stopPropagation()}
        >
          <div
            className={cn("combo-list m3-combo-portal", themeClass)}
            role="listbox"
            aria-multiselectable
            style={{ position: "relative", top: 0, left: 0, right: 0, background: "var(--lowest)" }}
          >
            <CommandList ref={listRef} className="max-h-[280px] overflow-y-auto overscroll-contain">
              <CommandEmpty>
                <div className="combo-none">{emptyText}</div>
              </CommandEmpty>
              <CommandGroup className="p-0">
                <CommandItem
                  value={allValue}
                  keywords={[allLabel]}
                  onSelect={() => pickAll()}
                  className="m3-combo-item"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      allSelected || values.length === 0 ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="whitespace-normal font-medium leading-tight">{allLabel}</span>
                </CommandItem>
                {options.map((opt) => {
                  const on = selectedSet.has(opt.value);
                  return (
                    <CommandItem
                      key={opt.value}
                      value={opt.value}
                      keywords={[opt.label, opt.keywords ?? "", opt.value]}
                      disabled={opt.disabled}
                      onSelect={() => toggle(opt.value)}
                      className="m3-combo-item"
                    >
                      <Check className={cn("mr-2 h-4 w-4 shrink-0", on ? "opacity-100" : "opacity-0")} />
                      <span className="whitespace-normal leading-tight">{opt.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </div>
        </PopoverContent>
      </Popover>
    </Command>
  );
}
