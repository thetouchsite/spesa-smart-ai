import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * MealMint unified button system.
 * Every button: 44px min touch target, focus-visible ring, hover, pressed,
 * loading and disabled states inherited from tokens.
 */
const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-ui font-semibold tracking-tight",
    "rounded-full select-none cursor-pointer transition-all duration-200 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-55 disabled:cursor-not-allowed",
    "active:scale-[0.97] active:duration-75",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-soft hover:shadow-glow hover:bg-primary/95",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-soft",
        ghost:
          "bg-transparent text-foreground hover:bg-secondary/60",
        outline:
          "border border-border bg-background text-foreground hover:bg-secondary/40",
        success:
          "bg-success text-success-foreground shadow-soft hover:bg-success/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-soft hover:bg-destructive/90",
        icon:
          "bg-secondary/60 text-foreground hover:bg-secondary rounded-full",
        fab:
          "bg-gradient-primary text-primary-foreground shadow-glow hover:brightness-110 rounded-full",
        link:
          "text-primary underline-offset-4 hover:underline shadow-none",
        // legacy alias for older call sites
        default:
          "bg-primary text-primary-foreground shadow-soft hover:shadow-glow hover:bg-primary/95",
      },
      size: {
        sm: "h-9 px-4 text-sm min-w-[2.75rem]",
        md: "h-11 px-5 text-sm min-w-11", // 44px — default
        lg: "h-12 px-6 text-base min-w-12",
        xl: "h-14 px-8 text-base min-w-14",
        icon: "h-11 w-11 p-0",
        "icon-sm": "h-9 w-9 p-0",
        "icon-lg": "h-12 w-12 p-0",
        fab: "h-14 w-14 p-0 text-base",
        // legacy alias
        default: "h-11 px-5 text-sm min-w-11",
      },
      block: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      block: false,
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      block,
      asChild = false,
      loading = false,
      loadingText,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const isDisabled = disabled || loading;
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, block, className }))}
        ref={ref}
        aria-busy={loading || undefined}
        disabled={isDisabled}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            <span>{loadingText ?? children}</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
