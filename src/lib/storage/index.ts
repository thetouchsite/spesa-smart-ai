/**
 * PlanStore resolver. Swap to `supabasePlanStore` once Lovable Cloud is on.
 */

import { localPlanStore } from "./local-plan-store";
import { supabasePlanStore } from "./supabase-plan-store";
import type { PlanStore } from "./plan-store";

const USE_SUPABASE = false; // flip once tables + auth are live.

export function getPlanStore(): PlanStore {
  return USE_SUPABASE ? supabasePlanStore : localPlanStore;
}

export type { PlanStore, SavedPlan } from "./plan-store";
