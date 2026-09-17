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
import type { PlanExtra } from "@/lib/plan-full";

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
  /**
   * Ciò che il motore con ricerca restituisce oltre al piano: offerte per
   * prodotto, confronto fra supermercati, ricette e promozioni in corso.
   *
   * Nullo quando il piano viene dal motore locale o da quello AI senza
   * prezzi: le schermate lo controllano e mostrano quel che c'è.
   */
  planExtra: PlanExtra | null;
  /**
   * Quale voce dell'archivio si sta guardando.
   *
   * PERCHE' UN PUNTATORE E NON UNA COPIA
   * ------------------------------------
   * Prima c'erano due magazzini: il piano in corso qui dentro, e i piani
   * salvati in un archivio a parte che si riempiva solo premendo «Salva
   * questo piano». Da fuori erano due cose che si chiamavano uguale e non si
   * parlavano — si cancellavano tutti i piani salvati e quello in corso
   * restava li', perche' non era mai stato nell'archivio.
   *
   * Adesso ogni piano generato entra nell'archivio da solo, e questo campo
   * dice qual e' quello attivo. `null` vuol dire «generato ma non ancora
   * archiviato», che dura i pochi secondi fra l'elaborazione e i risultati.
   */
  pianoAttivoId: string | null;
  variantSeed: number;
  status: SessionStatus;
  error: string | null;
  updateProfile: (patch: Partial<UserProfile>) => void;
  resetProfile: () => void;
  setPlan: (plan: Plan | null, extra?: PlanExtra | null) => void;
  /** Collega il piano in corso alla sua voce d'archivio. */
  setPianoAttivoId: (id: string | null) => void;
  setStatus: (status: SessionStatus, error?: string | null) => void;
  bumpSeed: () => number;
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      profile: DEFAULT_PROFILE,
      currentPlan: null,
      planExtra: null,
      pianoAttivoId: null,
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
        set({
          profile: DEFAULT_PROFILE,
          currentPlan: null,
          planExtra: null,
          pianoAttivoId: null,
          variantSeed: 1,
          status: "idle",
          error: null,
        });
      },
      /* Un piano nuovo non e' ancora nessuna voce d'archivio: chi lo
         archivia — `/risultati`, appena ha i numeri veri — chiama poi
         `setPianoAttivoId`. Dimenticare di azzerarlo qui vorrebbe dire che il
         piano nuovo si spaccia per quello vecchio, e riaprendo l'archivio si
         vedrebbe «in corso» sulla riga sbagliata. */
      setPlan: (plan, extra = null) =>
        set({ currentPlan: plan, planExtra: extra, pianoAttivoId: null }),
      setPianoAttivoId: (id) => set({ pianoAttivoId: id }),
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
      /**
       * Cosa sopravvive alla chiusura dell'app.
       *
       * `planExtra` sta qui accanto a `currentPlan` e non è un ripensamento:
       * sono la stessa cosa divisa in due. Salvando il piano senza i suoi
       * prezzi, alla riapertura le schermate trovavano una lista orfana e
       * ricadevano sul catalogo interno — che per la Svizzera non ha listini,
       * e mostrava "prezzi non disponibili" e 0,00 CHF su un piano che i
       * prezzi li aveva avuti eccome.
       *
       * Succedeva anche solo ricaricando l'app durante lo sviluppo, il che
       * rendeva il difetto difficile da attribuire: sembrava che il motore
       * funzionasse a intermittenza.
       */
      partialize: (s) => ({
        profile: s.profile,
        currentPlan: s.currentPlan,
        planExtra: s.planExtra,
        variantSeed: s.variantSeed,
        pianoAttivoId: s.pianoAttivoId,
      }),
    },
  ),
);
