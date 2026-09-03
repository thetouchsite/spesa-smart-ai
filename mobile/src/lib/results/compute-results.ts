/**
 * Compute every number shown on the Results page from `(profile, plan,
 * pricingResult)`. The UI must do zero math — all derived values live here.
 *
 * Inputs:
 *   - profile         user onboarding inputs
 *   - plan            output of the meal engine / AI provider (no prices)
 *   - pricingResult   output of the Price Engine (single source of $)
 *
 * Output: `ComputedResults`.
 */

import type { UserProfile } from "@/lib/models";
import type { Plan } from "@/lib/models/plan-schema";
import type { PricingResult } from "@/lib/price-data";
import { compareSupermarkets, type SupermarketBasket } from "@/lib/price-data/supermarkets";
import { buildInsights, type Insight } from "@/lib/insights";
import { minimumBudget, recommendedBudget } from "@/lib/meal-engine/tiers";

export type BudgetStatus = "comfortable" | "optimized" | "over" | "too_low" | "unavailable";

export interface ScoreBreakdownRow { label: string; value: number }
export interface ComputedScore { total: number; breakdown: ScoreBreakdownRow[] }

export interface ZeroSpendMetrics {
  enabled: boolean;
  extraSavingsPerWeek: number;
  ingredientsReused: number;
  wastePreventedKg: number;
  annualSavings: number;
}

export interface WasteMetrics {
  ingredientsReused: number;
  leftoverMeals: number;
  wasteAvoidedKg: number;
  wasteReductionPct: number;
}

export interface ComputedResults {
  budget: number;
  /** True only when every grocery-list item has a usable price. */
  savingsAvailable: boolean;
  /** The actual priced basket total for the selected period; null when incomplete. */
  basketTotal: number | null;
  /** Missing or unpriced grocery items that make savings unavailable. */
  missingPrices: string[];
  pricingCoverage: number;
  estimatedSpend: number;
  weeklySpend: number;
  savings: number;
  overBudgetAmount: number;
  ratio: number;
  status: BudgetStatus;
  costPerPersonPerDay: number;
  annualSavings: number;
  familySize: number;
  periodDays: number;
  score: ComputedScore;
  supermarkets: SupermarketBasket[];
  cheapestSupermarket: SupermarketBasket | null;
  zeroSpendDay: ZeroSpendMetrics;
  waste: WasteMetrics;
  insights: Insight[];
  /** Populated only when status === "too_low". */
  recommendedBudget: number | null;
  minimumBudget: number | null;
}

function parseHousehold(h: string): number {
  return Math.max(1, parseInt((h || "4").replace("+", ""), 10) || 4);
}

export interface ComputeInput {
  profile: UserProfile;
  plan: Plan;
  pricing: PricingResult | null;
}

export function computeResults({ profile, plan, pricing }: ComputeInput): ComputedResults {
  const parsedBudget = Number(profile.budget);
  const budget = Number.isFinite(parsedBudget) && parsedBudget > 0 ? parsedBudget : 0;
  const familySize = parseHousehold(profile.household);
  const periodDays = profile.frequency === "monthly" ? 30 : 7;
  const periodScale = profile.frequency === "monthly" ? 30 / 7 : 1;
  const householdMultiplier = Math.max(0.7, Math.min(1.8, familySize / 4));

  // Pricing is the ONLY source of money values. The basket quantities
  // already account for household size + period (weekly/monthly), so
  // `pricing.totalCost` IS the period spend — do NOT multiply again.
  const coverage = pricing?.coverage ?? 0;
  const pricedItems = pricing?.items ?? [];
  const missingPrices = pricing
    ? Array.from(new Set([
        ...pricedItems
          .filter((item) => !item.matchedPrice || item.estimatedCost <= 0)
          .map((item) => item.name),
        ...pricing.missing,
      ]))
    : [];
  /**
   * REGOLA DEI PREZZI PARZIALI
   *
   * Prima bastava UN prodotto senza prezzo per azzerare tutto: spesa 0,00 EUR,
   * punteggio 0, "prezzi non disponibili". Con i piani generati dall'AI capita
   * regolarmente, perche' produce voci composte come "Frutta di stagione
   * (Arance, Mele, Melone)" che il catalogo non riconosce.
   *
   * Un totale su 21 voci di 23 e' molto piu' utile di uno zero, purche' sia
   * dichiarato per quello che e'. Sotto il 60% di copertura invece il numero
   * sarebbe fuorviante e si torna a non mostrarlo.
   *
   * `savingsAvailable` resta il segnale di copertura piena: l'interfaccia lo
   * usa per decidere se scrivere "totale" o "totale parziale".
   */
  const MIN_COVERAGE = 0.6;
  const priceCoverage = pricing && pricedItems.length > 0
    ? pricedItems.filter((i) => i.estimatedCost > 0).length / pricedItems.length
    : 0;
  const hasUsableTotal =
    !!pricing &&
    pricedItems.length > 0 &&
    priceCoverage >= MIN_COVERAGE &&
    Number.isFinite(pricing.totalCost) &&
    pricing.totalCost > 0;

  const savingsAvailable = hasUsableTotal && missingPrices.length === 0;
  const basketTotal = hasUsableTotal ? Math.round(pricing.totalCost * 100) / 100 : null;
  const estimatedSpend = basketTotal ?? 0;
  const weeklySpend =
    Math.round((estimatedSpend / periodScale) * 100) / 100; // per-week view
  const monthlyCost =
    Math.round((weeklySpend * (30 / 7)) * 100) / 100;
  const rawSavings = hasUsableTotal ? Math.round((budget - estimatedSpend) * 100) / 100 : 0;
  const savings = hasUsableTotal ? Math.max(0, rawSavings) : 0;
  const overBudgetAmount = hasUsableTotal ? Math.max(0, Math.round((estimatedSpend - budget) * 100) / 100) : 0;
  const ratio = hasUsableTotal && budget > 0 ? estimatedSpend / budget : 0;

  // eslint-disable-next-line no-console
  console.log("[compute-results]", {
    frequency: profile.frequency,
    familySize,
    householdMultiplier,
    periodScale,
    totalBasketCost: basketTotal,
    coverage,
    savingsAvailable,
    weeklyCost: weeklySpend,
    monthlyCost,
    finalEstimatedSpend: estimatedSpend,
    budget,
    savings,
    overBudgetAmount,
    missingPrices,
    ratio: Math.round(ratio * 1000) / 1000,
  });

  if (pricing && !hasUsableTotal) {
    // eslint-disable-next-line no-console
    console.warn("[compute-results] savings unavailable: incomplete basket pricing", {
      coverage,
      missingPrices,
    });
  }

  const minB = minimumBudget(familySize, profile.frequency);
  const recB = recommendedBudget(familySize, profile.frequency);

  let status: BudgetStatus;
  if (!savingsAvailable) status = "unavailable";
  else if (estimatedSpend > budget) status = "over";
  else if (budget > 0 && budget < minB) status = "too_low";
  else if (ratio >= 0.9) status = "optimized";
  else status = "comfortable";

  const annualSavings = Math.max(0, savings) * (profile.frequency === "monthly" ? 12 : 52);
  const costPerPersonPerDay = familySize > 0 && periodDays > 0
    ? estimatedSpend / familySize / periodDays
    : 0;

  // ─── Zero Spend Day ──
  const zsdEnabled = profile.zeroSpendDay;
  const zsdExtra = zsdEnabled && savingsAvailable ? Math.round((weeklySpend / 7) * 100) / 100 : 0;
  const zsdReused = zsdEnabled ? Math.min(6, Math.max(3, Math.round(plan.groceryList.length * 0.25))) : 0;
  const zsdWaste = zsdEnabled ? Math.round(0.6 * familySize * 10) / 10 : 0;

  // ─── Waste prevented ──
  const ingredientsReused = Math.max(zsdReused, Math.min(plan.groceryList.length, 12));
  const leftoverMeals = zsdEnabled ? 4 : 2;
  const wasteAvoidedKg = Math.round((1.4 * familySize + zsdWaste) * 10) / 10;
  const wasteReductionPct = 28 + (zsdEnabled ? 12 : 0);

  // ─── Supermarket comparison (uses live priced basket for the period) ──
  // No UK fallback — pass whatever the profile carries; the supermarket
  // helper returns an empty list when the country is unknown, which the
  // UI already handles.
  const supermarkets = savingsAvailable ? compareSupermarkets(estimatedSpend, profile.country) : [];
  const cheapest = supermarkets.find((s) => s.isCheapest) ?? null;

  // ─── Score ──
  // Budget Efficiency MUST stay in [0, 100]. Negative values mean a
  // calculation bug upstream — clamp defensively.
  const rawEfficiency = savingsAvailable && budget > 0
    ? estimatedSpend <= budget
      ? Math.round(100 - Math.max(0, ratio - 0.85) * 120)
      : Math.round(Math.max(0, 100 - (ratio - 1) * 300))
    : 0;
  const budgetEfficiency = Math.max(0, Math.min(100, rawEfficiency));
  const wasteScore = savingsAvailable ? Math.min(100, 70 + wasteReductionPct / 2) : 0;
  const nutritionScore = savingsAvailable ? (profile.style === "Healthy Lifestyle" ? 92 : 84) : 0;
  const simplicityScore = savingsAvailable ? 85 : 0;
  const score: ComputedScore = {
    total: savingsAvailable
      ? Math.min(
          99,
          Math.round(
            budgetEfficiency * 0.55 +
              wasteScore * 0.2 +
              nutritionScore * 0.15 +
              simplicityScore * 0.1 +
              (zsdEnabled ? 4 : 0),
          ),
        )
      : 0,
    breakdown: [
      { label: "Budget Efficiency", value: budgetEfficiency },
      { label: "Waste Reduction", value: wasteScore },
      { label: "Nutrition Balance", value: nutritionScore },
      { label: "Simplicity", value: simplicityScore },
    ],
  };

  const insights = buildInsights({
    city: profile.city || "your area",
    currency: profile.currency,
    frequency: profile.frequency,
    estimatedSpend,
    budget,
    ingredientsReused,
    zeroSpendDay: zsdEnabled,
    familySize,
  });

  return {
    budget,
    savingsAvailable,
    basketTotal,
    missingPrices,
    pricingCoverage: coverage,
    estimatedSpend,
    weeklySpend,
    savings,
    overBudgetAmount,
    ratio,
    status,
    costPerPersonPerDay,
    annualSavings,
    familySize,
    periodDays,
    score,
    supermarkets,
    cheapestSupermarket: cheapest,
    zeroSpendDay: {
      enabled: zsdEnabled,
      extraSavingsPerWeek: zsdExtra,
      ingredientsReused: zsdReused,
      wastePreventedKg: zsdWaste,
      annualSavings: Math.round(zsdExtra * 52),
    },
    waste: {
      ingredientsReused,
      leftoverMeals,
      wasteAvoidedKg,
      wasteReductionPct,
    },
    insights,
    recommendedBudget: status === "too_low" ? recB : null,
    minimumBudget: status === "too_low" ? minB : null,
  };
}
