/**
 * Storage abstraction for saved plans.
 *
 * The UI calls `getPlanStore()` and never touches `localStorage` or any
 * Supabase client directly. To migrate to Cloud, swap the default impl in
 * `index.ts` — no UI changes.
 */

import type { SavedPlan } from "@/lib/saved-plans";

export interface PlanStore {
  list(): Promise<SavedPlan[]>;
  get(id: string): Promise<SavedPlan | null>;
  save(plan: Omit<SavedPlan, "id" | "createdAt">): Promise<SavedPlan>;
  delete(id: string): Promise<void>;
}

export type { SavedPlan } from "@/lib/saved-plans";
