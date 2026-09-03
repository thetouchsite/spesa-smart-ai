/**
 * Session store for the Import flow. Kept intentionally minimal —
 * no persistence beyond the tab. The imported plan is READ-ONLY:
 * patches and approved swaps live in separate maps and are applied
 * downstream, never mutated back into `plan`.
 */

import type { ImportedPlan, MealPatches } from "./imported-plan-schema";

interface ImportSession {
  plan: ImportedPlan | null;
  patches: MealPatches;
  context: {
    city: string;
    country: string;
    household: string;
    currency: string;
    frequency: "weekly" | "monthly";
  };
  approvedSwaps: Record<string, string>; // originalName -> alternativeName
}

const initial: ImportSession = {
  plan: null,
  patches: {},
  context: {
    city: "",
    country: "UK",
    household: "4",
    currency: "EUR",
    frequency: "weekly",
  },
  approvedSwaps: {},
};

let state: ImportSession = { ...initial };
const listeners = new Set<() => void>();

export const importStore = {
  get(): ImportSession {
    return state;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  setPlan(plan: ImportedPlan) {
    state = { ...state, plan, patches: {}, approvedSwaps: {} };
    listeners.forEach((f) => f());
  },
  setPatch(dayIdx: number, mealIdx: number, meal: ImportSession["plan"] extends null ? never : any) {
    state = {
      ...state,
      patches: { ...state.patches, [`${dayIdx}:${mealIdx}`]: meal },
    };
    listeners.forEach((f) => f());
  },
  setContext(ctx: Partial<ImportSession["context"]>) {
    state = { ...state, context: { ...state.context, ...ctx } };
    listeners.forEach((f) => f());
  },
  approveSwap(from: string, to: string) {
    state = { ...state, approvedSwaps: { ...state.approvedSwaps, [from]: to } };
    listeners.forEach((f) => f());
  },
  clearSwap(from: string) {
    const next = { ...state.approvedSwaps };
    delete next[from];
    state = { ...state, approvedSwaps: next };
    listeners.forEach((f) => f());
  },
  reset() {
    state = { ...initial };
    listeners.forEach((f) => f());
  },
};
