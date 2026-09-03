/**
 * Price Engine entry point used by the Results page.
 *
 * Accepts a meal-engine `Plan` (or any list of shopping items) and returns a
 * `PricingResult`. Callers MUST pass a real city/country pair — the engine
 * no longer silently defaults to London/UK. When the caller doesn't yet know
 * the location it should ask the user via the onboarding flow instead of
 * calling this function.
 */

import type { Plan } from "@/lib/models/plan-schema";
import { getPricesForShoppingList } from "./index";
import type { PricingResult, ShoppingListItem } from "./types";
import { trackFallbackUsage } from "@/lib/telemetry/global";

export async function pricePlan(
  plan: Plan,
  city: string,
  country: string,
): Promise<PricingResult> {
  if (!city || !country) {
    trackFallbackUsage({ where: "price-engine.pricePlan", from: `${city}|${country}`, to: "empty" });
  }
  const list: ShoppingListItem[] = plan.groceryList.map((g) => ({
    name: g.name,
    category: g.category as ShoppingListItem["category"],
    quantity: g.quantity,
  }));
  return getPricesForShoppingList(list, city, country);
}

