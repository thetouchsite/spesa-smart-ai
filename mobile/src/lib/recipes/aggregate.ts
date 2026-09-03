/** Recipe ingredient aggregation.
 *
 *  Takes the ingredient lists from every recipe in a plan, normalises units,
 *  merges duplicates, rounds to realistic shopping units, and returns a
 *  master grocery list. This is what makes the grocery list TRUE — every row
 *  traces back to one or more recipes. */

import type { Plan } from "@/lib/models/plan-schema";
import type { Recipe } from "./types";
import { resolveIngredientKey } from "@/lib/price-data/resolve-ingredient";
import { CATALOG_BY_KEY } from "@/lib/price-data/sources/manual/catalog";

interface ParsedQty {
  amount: number;
  unitClass: "g" | "ml" | "pcs" | "raw";
  unitLabel: string;
}

const UNIT_NORMALISE: Record<string, { factor: number; cls: ParsedQty["unitClass"]; label: string }> = {
  g: { factor: 1, cls: "g", label: "g" },
  gram: { factor: 1, cls: "g", label: "g" },
  grams: { factor: 1, cls: "g", label: "g" },
  kg: { factor: 1000, cls: "g", label: "g" },
  ml: { factor: 1, cls: "ml", label: "ml" },
  l: { factor: 1000, cls: "ml", label: "ml" },
  litre: { factor: 1000, cls: "ml", label: "ml" },
  litres: { factor: 1000, cls: "ml", label: "ml" },
  liter: { factor: 1000, cls: "ml", label: "ml" },
  tsp: { factor: 5, cls: "ml", label: "ml" },
  tbsp: { factor: 15, cls: "ml", label: "ml" },
};

const PIECE_WORDS = new Set([
  "", "pcs", "piece", "pieces", "unit", "units", "loaf", "loaves", "slice", "slices",
  "can", "cans", "tin", "tins", "jar", "jars", "bottle", "bottles", "pack", "packs",
  "clove", "cloves", "leaf", "leaves", "sprig", "sprigs", "bunch", "bunches",
  "head", "heads", "stalk", "stalks", "sheet", "sheets", "shot", "shots",
]);

function parseQty(raw: string): ParsedQty | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (/to taste|to serve/.test(trimmed)) return { amount: 0, unitClass: "raw", unitLabel: trimmed };
  const m = trimmed.match(/^([\d.,]+)\s*(.*)$/);
  if (!m) return { amount: 0, unitClass: "raw", unitLabel: trimmed };
  const n = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] || "").trim();
  const norm = UNIT_NORMALISE[unit];
  if (norm) return { amount: n * norm.factor, unitClass: norm.cls, unitLabel: norm.label };
  if (PIECE_WORDS.has(unit)) return { amount: n, unitClass: "pcs", unitLabel: unit };
  return { amount: n, unitClass: "raw", unitLabel: unit };
}

function ceilTo(n: number, step: number): number {
  return Math.ceil(n / step) * step;
}

function formatQty(p: ParsedQty): string {
  if (p.amount === 0) return p.unitLabel || "to taste";
  if (p.unitClass === "g") {
    if (p.amount >= 1000) {
      const kg = Math.round((p.amount / 1000) * 4) / 4; // 0.25 kg steps
      return `${kg} kg`;
    }
    return `${ceilTo(p.amount, 50)} g`;
  }
  if (p.unitClass === "ml") {
    if (p.amount >= 1000) {
      const l = Math.round((p.amount / 1000) * 4) / 4;
      return `${l} l`;
    }
    return `${ceilTo(p.amount, 50)} ml`;
  }
  if (p.unitClass === "pcs") {
    const n = Math.max(1, Math.ceil(p.amount));
    return p.unitLabel ? `${n} ${p.unitLabel}` : `${n}`;
  }
  return `${Math.round(p.amount * 10) / 10}${p.unitLabel ? " " + p.unitLabel : ""}`;
}

function normaliseName(name: string): string {
  return name.toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/\b(fresh|dried|chopped|ground|sliced|grated|whole|baby|raw|cooked|extra virgin)\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function categorise(name: string): string {
  // Le regole a parole chiave sotto sono in inglese: su una lista italiana
  // finivano quasi tutte nella categoria di riserva, pasta compresa.
  const key = resolveIngredientKey(name);
  if (key) {
    const item = CATALOG_BY_KEY[key];
    if (item) return item.category;
  }

  const n = name.toLowerCase();
  if (/(chicken|beef|pork|lamb|turkey|fish|salmon|tuna|cod|prawn|shrimp|egg|tofu|lentil|bean|chickpea|tempeh|guanciale|bacon|sausage)/.test(n)) return "Proteins";
  if (/(tomato|onion|garlic|carrot|celery|pepper|zucchini|cucumber|spinach|cabbage|salad|greens|lettuce|broccoli|cauliflower|mushroom|asparagus|potato|avocado|berry|berries|banana|fruit|herb|basil|parsley|mint|spring onion|leek|bok choy|ginger|chilli|chili)/.test(n)) return "Vegetables";
  if (/(pasta|rice|bread|toast|flour|oat|noodle|pita|wrap|tortilla|cornetto|panko|bulgur|quinoa|cous|grain)/.test(n)) return "Carbohydrates";
  return "Healthy Fats";
}

const SKIP = /^(salt|black pepper|pepper|water|ice|to taste)$/;

export interface AggregateOptions {
  servingsScale: number; // multiplier (e.g. household/4 * weekIfMonthly)
}

export function aggregateRecipesToGrocery(
  recipes: Recipe[],
  opts: AggregateOptions,
): Plan["groceryList"] {
  const scale = Math.max(0.25, opts.servingsScale);
  const merged = new Map<string, { parsed: ParsedQty; displayName: string; recipes: number }>();

  for (const recipe of recipes) {
    for (const ing of recipe.ingredients) {
      const key = normaliseName(ing.name);
      if (!key || SKIP.test(key)) continue;
      const parsed = parseQty(ing.quantity);
      if (!parsed) continue;
      const scaled: ParsedQty = { ...parsed, amount: parsed.amount * scale };
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { parsed: scaled, displayName: ing.name, recipes: 1 });
      } else if (existing.parsed.unitClass === scaled.unitClass) {
        existing.parsed.amount += scaled.amount;
        existing.recipes += 1;
      } else {
        // Mismatched units (e.g. one recipe says "1 clove", another "5 g")
        // — keep the larger-scoped record, fall back to count.
        existing.recipes += 1;
      }
    }
  }

  const out: Plan["groceryList"] = [];
  for (const { parsed, displayName } of merged.values()) {
    out.push({
      name: displayName.charAt(0).toUpperCase() + displayName.slice(1),
      quantity: formatQty(parsed),
      estimatedCost: 0,
      category: categorise(displayName),
    });
  }

  // Sort by category then name for stable UI grouping.
  const order = ["Proteins", "Vegetables", "Carbohydrates", "Healthy Fats"];
  out.sort((a, b) => {
    const ca = order.includes(a.category) ? order.indexOf(a.category) : order.length;
    const cb = order.includes(b.category) ? order.indexOf(b.category) : order.length;
    if (ca !== cb) return ca - cb;
    return a.name.localeCompare(b.name);
  });

  return out;
}
