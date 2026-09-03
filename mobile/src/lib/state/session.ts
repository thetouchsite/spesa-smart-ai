/**
 * Global session store — onboarding inputs + current plan + status.
 *
 * Persisted to `localStorage` (`spesa.session.v1`) so a refresh keeps the
 * user's progress and last result. Replaces the per-component useState
 * scattered through `index.tsx`.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { UserProfile } from "@/lib/models";
import type { Plan } from "@/lib/models/plan-schema";

export type SessionStatus = "idle" | "generating" | "ready" | "error";

export const DEFAULT_PROFILE: UserProfile = {
  city: "",
  country: "UK",
  household: "",
  budget: "",
  currency: "EUR",
  frequency: "weekly",
  style: "",
  allergies: [],
  dislikes: "",
  zeroSpendDay: false,
};

interface SessionState {
  profile: UserProfile;
  currentPlan: Plan | null;
  variantSeed: number;
  status: SessionStatus;
  error: string | null;
  updateProfile: (patch: Partial<UserProfile>) => void;
  resetProfile: () => void;
  setPlan: (plan: Plan | null) => void;
  setStatus: (status: SessionStatus, error?: string | null) => void;
  bumpSeed: () => number;
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      profile: DEFAULT_PROFILE,
      currentPlan: null,
      variantSeed: 1,
      status: "idle",
      error: null,
      updateProfile: (patch) =>
        set((s) => ({ profile: { ...s.profile, ...patch } })),
      resetProfile: () => {
        // Best-effort cache wipe so a brand-new plan never inherits stale
        // pricing or recipe payloads from the previous session.
        if (typeof localStorage !== "undefined") {
          try {
            const keys: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k && (k.startsWith("spesa.recipe.") || k.startsWith("spesa.price.") || k.startsWith("spesa.product."))) {
                keys.push(k);
              }
            }
            keys.forEach((k) => localStorage.removeItem(k));
          } catch { /* quota / private mode — ignore */ }
        }
        set({ profile: DEFAULT_PROFILE, currentPlan: null, variantSeed: 1, status: "idle", error: null });
      },
      setPlan: (plan) => set({ currentPlan: plan }),
      setStatus: (status, error = null) => set({ status, error }),
      bumpSeed: () => {
        const next = get().variantSeed + 1;
        set({ variantSeed: next });
        return next;
      },
    }),
    {
      name: "spesa.session.v1",
      version: 2,
      // Merge any rehydrated profile over DEFAULT_PROFILE so partially-shaped
      // persisted state (e.g. missing `city` after a schema change) can never
      // crash render paths that assume every field is defined.
      migrate: (persisted: unknown) => {
        const p = (persisted ?? {}) as Partial<SessionState> & {
          profile?: Partial<UserProfile>;
        };
        return {
          ...p,
          profile: { ...DEFAULT_PROFILE, ...(p.profile ?? {}) },
        } as SessionState;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SessionState> & {
          profile?: Partial<UserProfile>;
        };
        return {
          ...current,
          ...p,
          profile: { ...DEFAULT_PROFILE, ...(p.profile ?? {}) },
        };
      },
      storage: createJSONStorage(() => (typeof window !== "undefined" ? window.localStorage : (undefined as never))),
      partialize: (s) => ({ profile: s.profile, currentPlan: s.currentPlan, variantSeed: s.variantSeed }),
    },
  ),
);
