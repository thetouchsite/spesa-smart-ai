/**
 * Saved Plans — localStorage persistence (MVP).
 *
 * La sincronizzazione remota passa da `api/client` verso il nostro backend.
 * La forma di `SavedPlan` resta il contratto fra le due parti.
 */

import type { Plan } from "./models/plan-schema";

const KEY = "spesa.savedPlans.v1";

export interface SavedPlanForm {
  city: string;
  country?: string;
  household: string;
  budget: string;
  currency: string;
  frequency: "weekly" | "monthly";
  style: string;
  allergies: string[];
  dislikes: string;
  zeroSpendDay: boolean;
}

export interface SavedPlan {
  id: string;
  createdAt: string;
  label: string;
  form: SavedPlanForm;
  plan: Plan;
  estimatedSpend: number;
  savings: number;
  score: number;
}

function read(): SavedPlan[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(plans: SavedPlan[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(plans));
}

export function listSavedPlans(): SavedPlan[] {
  return read().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getSavedPlan(id: string): SavedPlan | null {
  return read().find((p) => p.id === id) ?? null;
}

export function savePlan(p: Omit<SavedPlan, "id" | "createdAt">): SavedPlan {
  const all = read();
  const record: SavedPlan = {
    ...p,
    id: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
  all.push(record);
  write(all);
  return record;
}

export function deleteSavedPlan(id: string) {
  write(read().filter((p) => p.id !== id));
}
