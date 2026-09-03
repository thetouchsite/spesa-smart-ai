/**
 * Selettore dell'archivio dei piani.
 *
 * Il prototipo prevedeva Supabase tramite Lovable Cloud; quello stub non
 * esiste più. I piani vivono localmente finché l'utente non ha un account,
 * e sul nostro backend quando ce l'ha — la sincronizzazione passa da
 * `api/plans`, non da qui.
 */

import { localPlanStore } from "./local-plan-store";
import type { PlanStore } from "./plan-store";

export function getPlanStore(): PlanStore {
  return localPlanStore;
}

export type { PlanStore, SavedPlan } from "./plan-store";
