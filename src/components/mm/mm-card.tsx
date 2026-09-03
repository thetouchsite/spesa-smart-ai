import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * MealMint Card System
 * One shadow, one radius, one border. Variants change tone + accent only.
 *
 * Variants:
 *  - primary   → default surface card
 *  - secondary → mint tinted card
 *  - savings   → gradient savings card with gold accents
 *  - recipe    → editorial recipe card
 *  - shopping  → shopping list row card
 *  - store     → nearby store card
 *  - budget    → budget summary card
 */
const cardVariants = cva(
  [
    "group relative rounded-3xl border transition-all duration-300 ease-out",
    "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-card border-border shadow-soft hover:shadow-card",
        secondary:
          "bg-secondary/60 border-border/60 shadow-soft hover:shadow-card",
        savings:
          "bg-gradient-savings text-primary-foreground border-transparent shadow-glow",
        recipe:
          "bg-card border-border shadow-card hover:-translate-y-0.5 hover:shadow-glow overflow-hidden",
        shopping:
          "bg-card border-border shadow-soft hover:bg-secondary/40",
        store:
          "bg-card border-border shadow-soft hover:shadow-card hover:-translate-y-0.5",
        budget:
          "bg-gradient-hero border-border shadow-card",
      },
      interactive: {
        true: "cursor-pointer",
        false: "",
      },
      padded: {
        none: "p-0",
        sm: "p-4",
        md: "p-5",
        lg: "p-6",
      },
    },
    defaultVariants: {
      variant: "primary",
      interactive: false,
      padded: "md",
    },
  },
);

export interface MMCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  asChild?: boolean;
}

export const MMCard = React.forwardRef<HTMLDivElement, MMCardProps>(
  ({ className, variant, interactive, padded, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        cardVariants({ variant, interactive, padded }),
        "animate-mm-appear",
        className,
      )}
      {...props}
    />
  ),
);
MMCard.displayName = "MMCard";

export function MMCardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-start justify-between gap-3 mb-3", className)}
      {...props}
    />
  );
}

export function MMCardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "font-serif-display text-lg font-bold tracking-tight text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function MMCardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-sm text-muted-foreground leading-relaxed", className)}
      {...props}
    />
  );
}

export function MMCardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mt-4 flex items-center justify-between gap-3 pt-3 border-t border-border/60",
        className,
      )}
      {...props}
    />
  );
}
