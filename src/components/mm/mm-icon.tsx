import * as React from "react";
import {
  PiggyBank,
  Coins,
  ShoppingBasket,
  Store,
  Map,
  MapPin,
  ChefHat,
  Users,
  Truck,
  Wallet,
  Leaf,
  Sparkles,
  Search,
  Heart,
  Clock,
  Star,
  Check,
  X,
  ArrowRight,
  ArrowLeft,
  Plus,
  Minus,
  Info,
  AlertTriangle,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * MealMint unified icon language.
 * One size scale, one stroke, one accent system — no rogue emoji.
 */
export const MM_ICONS = {
  savings: PiggyBank,
  piggy: PiggyBank,
  coins: Coins,
  basket: ShoppingBasket,
  store: Store,
  map: Map,
  location: MapPin,
  recipe: ChefHat,
  family: Users,
  delivery: Truck,
  budget: Wallet,
  leaf: Leaf,
  sparkle: Sparkles,
  search: Search,
  favorite: Heart,
  time: Clock,
  star: Star,
  check: Check,
  close: X,
  next: ArrowRight,
  back: ArrowLeft,
  add: Plus,
  remove: Minus,
  info: Info,
  warning: AlertTriangle,
  offline: WifiOff,
} satisfies Record<string, LucideIcon>;

export type MMIconName = keyof typeof MM_ICONS;

export const ICON_SIZES = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
  "2xl": 40,
} as const;
export type MMIconSize = keyof typeof ICON_SIZES;

export interface MMIconProps
  extends Omit<React.SVGAttributes<SVGSVGElement>, "name"> {
  name: MMIconName;
  size?: MMIconSize;
  label?: string;
}

/** Unified icon renderer. Provide `label` to expose an accessible name. */
export function MMIcon({
  name,
  size = "md",
  label,
  className,
  ...props
}: MMIconProps) {
  const Icon = MM_ICONS[name];
  const px = ICON_SIZES[size];
  return (
    <Icon
      width={px}
      height={px}
      strokeWidth={1.75}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      focusable="false"
      className={cn("shrink-0", className)}
      {...props}
    />
  );
}
