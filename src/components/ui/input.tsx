import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // h-10 + leading-normal: đủ chỗ cho dấu thanh phía trên chữ hoa tiếng Việt (Ế, Ồ, …)
          "flex h-10 w-full rounded-lg border border-[var(--secondary-container)] bg-[var(--lowest)] px-3 py-2 text-base leading-normal transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-[var(--on-surface-variant)] hover:border-[var(--inverse-primary)] focus-visible:outline-none focus-visible:border-[var(--primary)] focus-visible:shadow-[inset_0_0_0_1px_var(--primary)] disabled:cursor-not-allowed disabled:border-[var(--on-surface)]/12 disabled:bg-[var(--on-surface)]/4 disabled:text-[var(--on-surface)]/38 md:text-sm",
          // Ẩn mũi tên tăng/giảm trên input type=number (mọi trình duyệt).
          type === "number" &&
            "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
