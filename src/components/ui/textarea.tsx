import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[60px] w-full rounded-lg border border-[var(--secondary-container)] bg-[var(--lowest)] px-3 py-2 text-base placeholder:text-[var(--on-surface-variant)] hover:border-[var(--inverse-primary)] focus-visible:outline-none focus-visible:border-[var(--primary)] focus-visible:shadow-[inset_0_0_0_1px_var(--primary)] disabled:cursor-not-allowed disabled:border-[var(--on-surface)]/12 disabled:bg-[var(--on-surface)]/4 disabled:text-[var(--on-surface)]/38 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
