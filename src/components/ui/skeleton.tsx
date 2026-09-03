import { cn } from "@/lib/utils";

/**
 * MealMint branded skeleton — mint shimmer over surface tone.
 * Use for meal cards, recipes, shopping items, stores and budget widgets.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-secondary/50 mm-shimmer",
        className,
      )}
      aria-hidden="true"
      {...props}
    />
  );
}
