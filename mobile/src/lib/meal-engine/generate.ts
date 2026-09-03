/**
 * Deterministic meal-plan generator.
 *
 * Pure function: same `(profile, seed)` → same `Plan`. The generator returns
 * a Plan with `estimatedCost: 0` on every grocery row — pricing is the Price
 * Engine's job, not the meal engine's. UI numbers come from
 * `computeResults({ profile, plan, pricing })`.
 */

import type { UserProfile } from "@/lib/models";
import type { Plan } from "@/lib/models/plan-schema";
import { tierFor, type Tier } from "./tiers";
import { getMealPool, getGroceryTemplate } from "./style-catalog";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function pick<T>(arr: T[], rand: () => number, offset = 0): T {
  return arr[(Math.floor(rand() * arr.length) + offset) % arr.length];
}

function parseHousehold(h: string): number {
  return Math.max(1, parseInt((h || "4").replace("+", ""), 10) || 4);
}

function dislikedSet(dislikes: string): Set<string> {
  return new Set(
    dislikes
      .toLowerCase()
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function filterByDislikes(meals: string[], dislikes: Set<string>): string[] {
  if (dislikes.size === 0) return meals;
  const ok = meals.filter((m) => {
    const lower = m.toLowerCase();
    for (const d of dislikes) if (lower.includes(d)) return false;
    return true;
  });
  return ok.length > 0 ? ok : meals;
}

function filterTemplateByAllergies(
  rows: ReturnType<typeof getGroceryTemplate>,
  allergies: string[],
) {
  const set = new Set(allergies);
  return rows.filter((r) => {
    const n = r.name.toLowerCase();
    if (set.has("Vegan") && /(chicken|salmon|tuna|beef|feta|yogurt|butter|egg|parmesan)/.test(n)) return false;
    if (set.has("Vegetarian") && /(chicken|salmon|tuna|beef)/.test(n)) return false;
    if (set.has("Lactose Free") && /(yogurt|butter|feta|parmesan)/.test(n)) return false;
    if (set.has("Gluten Free") && /(bread|pasta|flour|sourdough)/.test(n)) return false;
    return true;
  });
}

/** Scale a quantity string ("1.5 kg", "12", "3 cans") by a multiplier.
 *  Whole-unit items (cans, tins, eggs, loaves, packs, plain counts) round
 *  to integers — never "9.6 cans". Mass/volume rounds to sensible
 *  shopping increments (50 g/ml, 0.1 kg/l, 0.5 kg above 2). */
const WHOLE_UNITS = new Set([
  "", "can", "cans", "tin", "tins", "loaf", "loaves", "pack", "packs",
  "bottle", "bottles", "jar", "jars", "unit", "units", "pcs",
  "piece", "pieces", "head", "heads", "bunch", "bunches",
]);
function scaleQuantity(qty: string, mul: number): string {
  const m = qty.match(/^([\d.]+)\s*(.*)$/);
  if (!m) return qty;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return qty;
  const unit = (m[2] || "").trim();
  const unitLc = unit.toLowerCase();
  const scaled = n * mul;

  if (WHOLE_UNITS.has(unitLc)) {
    const r = Math.max(1, Math.round(scaled));
    return unit ? `${r} ${unit}` : `${r}`;
  }
  if (unitLc === "g" || unitLc === "ml") {
    const r = Math.max(50, Math.round(scaled / 50) * 50);
    return `${r} ${unit}`;
  }
  if (unitLc === "kg" || unitLc === "l") {
    const r = scaled >= 2 ? Math.round(scaled * 2) / 2 : Math.max(0.1, Math.round(scaled * 10) / 10);
    return `${r} ${unit}`;
  }
  const r = scaled >= 10 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
  return `${r}${unit ? " " + unit : ""}`;
}

export interface GenerateInput {
  profile: UserProfile;
  seed?: number;
  /** Multiplier applied on top of the household/period scale (default 1).
   *  Used by the auto-optimizer to shrink the basket when priced output
   *  exceeds the user's budget. Floor 0.4 so the plan stays viable. */
  quantityScale?: number;
}

export interface GenerateMeta {
  tier: Tier;
  zeroSpendDayIndex: number | null;
}

export interface GenerateOutput {
  plan: Plan;
  meta: GenerateMeta;
}

export function generateMealPlan({ profile, seed = 1, quantityScale = 1 }: GenerateInput): GenerateOutput {
  const budget = Number(profile.budget) || 0;
  const household = parseHousehold(profile.household);
  const tier = tierFor(budget || 100, household, profile.frequency);
  const rand = rng(seed * 2654435761);
  const periodScale = profile.frequency === "monthly" ? 30 / 7 : 1;
  const householdScale = Math.max(0.7, Math.min(1.8, household / 4));
  const downscale = Math.max(0.4, Math.min(1, quantityScale));
  // eslint-disable-next-line no-console
  console.log("[meal-engine]", { household, householdMultiplier: householdScale, periodScale, downscale, tier, seed });

  // ─── Grocery list (no prices — Price Engine populates) ─────────────
  const template = filterTemplateByAllergies(
    getGroceryTemplate(profile.style, tier),
    profile.allergies,
  );

  const skipIdx = new Set<number>();
  const drops = Math.min(2, Math.floor(template.length * 0.12));
  for (let k = 0; k < drops; k++) skipIdx.add(Math.floor(rand() * template.length));

  const groceryList = template
    .filter((_, i) => !skipIdx.has(i))
    .map((row) => ({
      category: row.category,
      name: row.name,
      quantity: scaleQuantity(row.quantity, householdScale * periodScale * downscale),
      estimatedCost: 0, // Price Engine only.
    }));

  // ─── Meal plan ─────────────────────────────────────────────────────
  const pool = getMealPool(profile.style, tier);
  const dislikes = dislikedSet(profile.dislikes);
  const breakfasts = filterByDislikes(pool.breakfast, dislikes);
  const lunches = filterByDislikes(pool.lunch, dislikes);
  const dinners = filterByDislikes(pool.dinner, dislikes);

  const zsdIndex = profile.zeroSpendDay ? 3 + Math.floor(rand() * 2) : -1;
  const mealPlan = DAYS.map((day, i) => {
    if (i === zsdIndex) {
      return {
        day,
        breakfast: "Pantry oats & fruit",
        lunch: "Leftovers reheated",
        dinner: "Zero Spend Day — leftovers & pantry staples",
      };
    }
    return {
      day,
      breakfast: pick(breakfasts, rand, i),
      lunch: pick(lunches, rand, i + 1),
      dinner: pick(dinners, rand, i + 2),
    };
  });

  // ─── Narrative — totals are filled in by computeResults ──────────────
  const tierLabel = tier === "low" ? "value-focused" : tier === "medium" ? "balanced" : "premium quality";
  const budgetAnalysis = `Your plan is a ${tierLabel} basket for ${household} ${
    household === 1 ? "person" : "people"
  }${profile.zeroSpendDay ? ", with one Zero Spend Day using leftovers." : "."}`;

  const savingTips = [
    "Ingredient reuse: staples appear across multiple meals to stretch every purchase.",
    "Reduced food waste: leftovers become tomorrow's lunch — nothing sits in the fridge.",
    `Lower cost ingredients: this plan is tuned to a ${tierLabel} basket for your budget tier.`,
    "Better planning: a fixed list eliminates impulse buys, the biggest cause of overspending.",
  ];

  return {
    plan: {
      budgetAnalysis,
      estimatedCost: 0,
      safetyMargin: 0,
      status: "comfortable",
      recommendedBudget: null,
      minimumBudget: null,
      mealPlan,
      groceryList,
      savingTips,
    },
    meta: { tier, zeroSpendDayIndex: zsdIndex >= 0 ? zsdIndex : null },
  };
}
