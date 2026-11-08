import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-[13px] font-medium cursor-pointer transition-[background-color,box-shadow,filter] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--primary)] text-[var(--on-primary,#fff)] hover:shadow-[0_1px_3px_1px_rgba(0,0,0,.15),0_1px_2px_rgba(0,0,0,.3)] disabled:bg-[var(--on-surface)]/12 disabled:text-[var(--on-surface)]/38",
        destructive:
          "bg-[var(--error)] text-[var(--lowest,#fff)] hover:shadow-[0_1px_3px_1px_rgba(0,0,0,.15),0_1px_2px_rgba(0,0,0,.3)] disabled:bg-[var(--on-surface)]/12 disabled:text-[var(--on-surface)]/38",
        outline:
          "bg-[var(--secondary-container)] text-[var(--on-secondary-container)] hover:brightness-95 disabled:bg-[var(--on-surface)]/12 disabled:text-[var(--on-surface)]/38",
        secondary:
          "bg-[var(--secondary-container)] text-[var(--on-secondary-container)] hover:brightness-95 disabled:bg-[var(--on-surface)]/12 disabled:text-[var(--on-surface)]/38",
        ghost:
          "bg-transparent text-[var(--on-surface-variant)] hover:bg-[var(--on-surface)]/8 disabled:text-[var(--on-surface)]/38",
        link: "text-[var(--primary)] underline-offset-4 hover:underline disabled:opacity-50",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
