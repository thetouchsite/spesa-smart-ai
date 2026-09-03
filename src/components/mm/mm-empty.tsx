import * as React from "react";
import { Button } from "@/components/ui/button";
import { MMIcon, type MMIconName } from "./mm-icon";
import { cn } from "@/lib/utils";

export interface MMEmptyStateProps {
  icon?: MMIconName;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  secondaryAction?: {
    label: string;
    onClick?: () => void;
  };
  className?: string;
}

/**
 * Branded empty / offline / error state.
 * One layout, one visual language across every screen.
 */
export function MMEmptyState({
  icon = "search",
  title,
  description,
  action,
  secondaryAction,
  className,
}: MMEmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "mx-auto flex max-w-md flex-col items-center justify-center rounded-3xl border border-border bg-card px-6 py-10 text-center shadow-soft animate-mm-appear",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="relative mb-5 grid h-20 w-20 place-items-center rounded-full bg-secondary/70 shadow-soft"
      >
        <span className="absolute inset-0 rounded-full bg-gradient-primary opacity-10" />
        <MMIcon name={icon} size="xl" className="text-primary" />
      </div>
      <h3 className="font-serif-display text-xl font-bold tracking-tight text-foreground">
        {title}
      </h3>
      {description ? (
        <p className="mt-2 max-w-sm text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      ) : null}
      {(action || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {action ? (
            action.href ? (
              <Button asChild variant="primary">
                <a href={action.href}>{action.label}</a>
              </Button>
            ) : (
              <Button variant="primary" onClick={action.onClick}>
                {action.label}
              </Button>
            )
          ) : null}
          {secondaryAction ? (
            <Button variant="ghost" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Preset shortcuts for common empty states. */
export const MMEmpty = {
  NoStores: (props: Partial<MMEmptyStateProps>) => (
    <MMEmptyState
      icon="store"
      title="No nearby stores found"
      description="We couldn't find grocery stores near your location. Try widening the search radius."
      {...props}
    />
  ),
  NoRecipes: (props: Partial<MMEmptyStateProps>) => (
    <MMEmptyState
      icon="recipe"
      title="No recipes yet"
      description="Generate your first plan to see personalized recipes here."
      {...props}
    />
  ),
  NoGroceries: (props: Partial<MMEmptyStateProps>) => (
    <MMEmptyState
      icon="basket"
      title="Your grocery list is empty"
      description="Create a plan and we'll build the shopping list for you."
      {...props}
    />
  ),
  Offline: (props: Partial<MMEmptyStateProps>) => (
    <MMEmptyState
      icon="offline"
      title="You're offline"
      description="Reconnect to the internet to load fresh prices and stores."
      {...props}
    />
  ),
  SearchFailed: (props: Partial<MMEmptyStateProps>) => (
    <MMEmptyState
      icon="warning"
      title="Search didn't work"
      description="Something went wrong on our side. Please try again in a moment."
      {...props}
    />
  ),
};
