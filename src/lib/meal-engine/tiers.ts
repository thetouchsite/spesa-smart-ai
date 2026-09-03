import type { Frequency } from "@/lib/models";

export type Tier = "low" | "medium" | "premium";

/**
 * Maps the user's budget to a basket tier using absolute monthly bands
 * (£150-300 low, £300-500 medium, £500+ premium), scaled by household
 * size relative to a 4-person baseline so a 2-person £250/month basket
 * still reads as "medium" rather than "low".
 *
 * Budget is the PRIMARY driver of plan composition — a different tier
 * means different meals, different grocery basket, different totals.
 */
export function tierFor(budget: number, household: number, frequency: Frequency): Tier {
  if (!Number.isFinite(budget) || budget <= 0) return "medium";
  const monthly = budget * (frequency === "monthly" ? 1 : 30 / 7);
  const householdScale = Math.max(0.5, Math.min(2, household / 4));
  const adjusted = monthly / householdScale;
  if (adjusted < 300) return "low";
  if (adjusted < 500) return "medium";
  return "premium";
}

/** Minimum weekly budget per person for a viable plan. */
export const MIN_PER_PERSON_PER_WEEK = 14; // ~£2/day
export const RECOMMENDED_PER_PERSON_PER_WEEK = 28; // ~£4/day

export function minimumBudget(household: number, frequency: Frequency): number {
  const periodScale = frequency === "monthly" ? 30 / 7 : 1;
  return Math.round(MIN_PER_PERSON_PER_WEEK * household * periodScale);
}

export function recommendedBudget(household: number, frequency: Frequency): number {
  const periodScale = frequency === "monthly" ? 30 / 7 : 1;
  return Math.round(RECOMMENDED_PER_PERSON_PER_WEEK * household * periodScale);
}
