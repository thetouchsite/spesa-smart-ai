import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Branded skeleton for a meal / recipe card. */
export function MealCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-border bg-card p-4 shadow-soft space-y-3",
        className,
      )}
      role="status"
      aria-label="Loading meal"
    >
      <Skeleton className="h-40 w-full rounded-2xl" />
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}

export function RecipeSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("space-y-4", className)}
      role="status"
      aria-label="Loading recipe"
    >
      <Skeleton className="h-56 w-full rounded-3xl" />
      <Skeleton className="h-7 w-2/3" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-9/12" />
      </div>
    </div>
  );
}

export function ShoppingListSkeleton({
  rows = 5,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("space-y-2", className)}
      role="status"
      aria-label="Loading shopping list"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-soft"
        >
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-12" />
        </div>
      ))}
    </div>
  );
}

export function StoreCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft",
        className,
      )}
      role="status"
      aria-label="Loading store"
    >
      <Skeleton className="h-14 w-14 rounded-2xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

export function BudgetSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-border bg-gradient-hero p-5 shadow-card space-y-3",
        className,
      )}
      role="status"
      aria-label="Loading budget"
    >
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-3 w-full rounded-full" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
    </div>
  );
}
