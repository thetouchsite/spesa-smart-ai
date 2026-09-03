/**
 * AI Food Budget Copilot — placeholder types.
 *
 * The actual model call is NOT wired. This file defines the contract so
 * the future implementation can be dropped in without touching callers.
 */

export type CopilotIntent =
  | "chat"
  | "recipe_change"
  | "alternatives"
  | "reduce_budget"
  | "cheaper_ingredients"
  | "healthier_swaps";

export interface CopilotRequest {
  intent: CopilotIntent;
  message: string;
  context?: {
    city?: string;
    budget?: number;
    currency?: string;
    grocery?: string[];
  };
}

export interface CopilotResponse {
  ok: boolean;
  message: string;
  suggestions?: string[];
}
