/**
 * LocalStorage-backed PlanStore. Default for MVP.
 *
 * Wraps the existing `src/lib/saved-plans.ts` so all reads/writes share the
 * same key (`spesa.savedPlans.v1`). All methods are async to match the
 * Supabase implementation.
 */

import {
  listSavedPlans,
  getSavedPlan,
  savePlan,
  deleteSavedPlan,
} from "@/lib/saved-plans";
import type { PlanStore, SavedPlan } from "./plan-store";

export const localPlanStore: PlanStore = {
  async list() {
    return listSavedPlans();
  },
  async get(id) {
    return getSavedPlan(id);
  },
  async save(plan) {
    return savePlan(plan);
  },
  async delete(id) {
    deleteSavedPlan(id);
  },
};

export type { SavedPlan };
