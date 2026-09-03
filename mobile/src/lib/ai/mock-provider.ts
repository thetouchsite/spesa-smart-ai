/**
 * Mock AI provider — delegates to the deterministic meal engine.
 *
 * Returned shape matches what `realAIProvider` will eventually receive from
 * the AI gateway, so swapping providers is a one-line change in `meal-ai.ts`.
 */

import { generateMealPlan } from "@/lib/meal-engine";
import { PlanSchema, type Plan } from "@/lib/models/plan-schema";
import type { UserProfile } from "@/lib/models";

export interface AIMealPlanInput {
  profile: UserProfile;
  seed: number;
  quantityScale?: number;
  /** Target UI language for meal names + AI explanations (BCP-47 short code). */
  language?: string;
}

export async function mockAIProvider(input: AIMealPlanInput): Promise<Plan> {
  // Simulate latency so the UI loading state behaves like a real network call.
  await new Promise((r) => setTimeout(r, 250));
  const { plan } = generateMealPlan({
    profile: input.profile,
    seed: input.seed,
    quantityScale: input.quantityScale,
  });
  // Validate so a real-AI swap can't silently change the contract.
  return PlanSchema.parse(plan);
}
