/**
 * Real AI provider (STUB).
 *
 * Wires to the existing `generatePlan` server function (Lovable AI Gateway,
 * `google/gemini-3-flash-preview`). Disabled by default so the app stays
 * fully offline-capable. Toggle via `USE_AI_GATEWAY=true` once budgets,
 * prompts, and structured-output schema have been verified end-to-end.
 *
 * Input/output shape is identical to `mockAIProvider`.
 */

import { PlanSchema, type Plan } from "@/lib/models/plan-schema";
import type { AIMealPlanInput } from "./mock-provider";

export const REAL_AI_ENABLED = false;

export async function realAIProvider(_input: AIMealPlanInput): Promise<Plan> {
  if (!REAL_AI_ENABLED) {
    throw new Error("Real AI provider is disabled. Set REAL_AI_ENABLED=true after wiring generatePlan.");
  }
  // TODO: when enabling, call generatePlan and pass: city, country, household,
  //       budget, currency, frequency, style, allergies, dislikes, seed.
  //       Validate response with PlanSchema before returning.
  return PlanSchema.parse({} as Plan);
}
