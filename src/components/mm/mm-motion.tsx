import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Motion primitives. CSS-driven, GPU-friendly, respects prefers-reduced-motion.
 * Use to wrap any element that should appear/fade/slide on mount.
 */
type MotionProps = React.HTMLAttributes<HTMLDivElement> & {
  as?: keyof React.JSX.IntrinsicElements;
  delay?: number; // ms
};

function withDelay(style: React.CSSProperties | undefined, delay?: number) {
  if (!delay) return style;
  return { ...style, animationDelay: `${delay}ms` };
}

export function Appear({
  as: Tag = "div",
  className,
  style,
  delay,
  ...props
}: MotionProps) {
  const Comp = Tag as React.ElementType;
  return (
    <Comp
      className={cn("animate-mm-appear", className)}
      style={withDelay(style, delay)}
      {...props}
    />
  );
}

export function Fade({
  as: Tag = "div",
  className,
  style,
  delay,
  ...props
}: MotionProps) {
  const Comp = Tag as React.ElementType;
  return (
    <Comp
      className={cn("animate-mm-fade", className)}
      style={withDelay(style, delay)}
      {...props}
    />
  );
}

export function Slide({
  as: Tag = "div",
  className,
  style,
  delay,
  ...props
}: MotionProps) {
  const Comp = Tag as React.ElementType;
  return (
    <Comp
      className={cn("animate-mm-slide", className)}
      style={withDelay(style, delay)}
      {...props}
    />
  );
}

/** Stagger children by index using CSS delay. */
export function Stagger({
  children,
  step = 60,
  className,
}: {
  children: React.ReactNode;
  step?: number;
  className?: string;
}) {
  const items = React.Children.toArray(children);
  return (
    <div className={className}>
      {items.map((child, i) => (
        <Appear key={i} delay={i * step}>
          {child}
        </Appear>
      ))}
    </div>
  );
}

/** Animated progress bar honoring token colors. */
export function MMProgress({
  value,
  className,
  label,
}: {
  value: number;
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-secondary/70",
        className,
      )}
    >
      <div
        className="h-full rounded-full bg-gradient-primary transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Coin spinner — brand-consistent inline loading affordance. */
export function CoinSpinner({
  size = 20,
  className,
  label = "Loading",
}: {
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn("inline-flex items-center justify-center", className)}
    >
      <span
        className="animate-coin block rounded-full"
        style={{
          width: size,
          height: size,
          background:
            "radial-gradient(circle at 30% 30%, var(--gold), oklch(0.62 0.14 85))",
          boxShadow: "0 2px 6px oklch(0.42 0.11 158 / 0.25)",
        }}
      />
    </span>
  );
}
