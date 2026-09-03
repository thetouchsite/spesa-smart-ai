/**
 * Supabase-backed PlanStore (STUB).
 *
 * Activate by enabling Lovable Cloud, applying
 * `supabase/migrations/0001_init.sql`, and switching `getPlanStore()` to
 * return this implementation. The shape and async signatures already match.
 *
 * Implementation sketch (do not enable until Cloud is on):
 *   const supabase = createBrowserSupabaseClient();
 *   const { data } = await supabase.from("saved_plans").select(...);
 */

import type { PlanStore } from "./plan-store";
import { AppError } from "@/lib/errors";

export const supabasePlanStore: PlanStore = {
  async list() { throw new AppError("STORAGE_UNAVAILABLE", "Supabase plan store not configured."); },
  async get() { throw new AppError("STORAGE_UNAVAILABLE", "Supabase plan store not configured."); },
  async save() { throw new AppError("STORAGE_UNAVAILABLE", "Supabase plan store not configured."); },
  async delete() { throw new AppError("STORAGE_UNAVAILABLE", "Supabase plan store not configured."); },
};
