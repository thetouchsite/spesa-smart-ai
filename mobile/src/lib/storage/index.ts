/**
 * Selettore dell'archivio dei piani.
 *
 * I piani vivono LOCALMENTE finché l'utente non ha un account, e SUL NOSTRO
 * BACKEND quando ce l'ha. Le schermate non lo sanno: chiamano `getPlanStore()`
 * e ricevono quello giusto. La domanda «sono dentro?» si fa qui, una volta
 * sola — sparpagliarla per le schermate è il modo sicuro di dimenticarla in
 * una.
 */

import { cloudPlanStore } from "./cloud-plan-store";
import { localPlanStore } from "./local-plan-store";
import { tokenCorrente } from "../state/utente";
import type { PlanStore } from "./plan-store";

export function getPlanStore(): PlanStore {
  return tokenCorrente() ? cloudPlanStore : localPlanStore;
}

/**
 * Porta di sopra i piani fatti prima di registrarsi.
 *
 * PERCHE' SERVE. Chi usa l'app senza account accumula piani sul telefono. Nel
 * momento in cui si registra, `getPlanStore()` comincia a rispondere con
 * l'archivio remoto — che è vuoto. Senza questo passaggio l'utente vedrebbe
 * sparire tutto proprio mentre fa la cosa che gli avevamo promesso servisse a
 * non perdere niente.
 *
 * I piani locali NON si cancellano dopo il travaso: se il caricamento fallisce
 * a metà, o l'utente esce e ritorna senza account, deve ritrovarli. Occupano
 * poco e non danno fastidio a nessuno.
 *
 * Torna quanti ne ha portati su. Un errore non si propaga: la registrazione è
 * andata a buon fine comunque, e fallire il travaso non deve far sembrare
 * fallito l'accesso.
 */
export async function portaSuIPianiLocali(): Promise<number> {
  try {
    if (!tokenCorrente()) return 0;

    const locali = await localPlanStore.list();
    if (locali.length === 0) return 0;

    /* Non si ricaricano quelli che ci sono già: se qualcuno si registra, esce e
       rientra, senza questo controllo si ritroverebbe ogni piano in due copie.
       L'etichetta con la data di creazione è abbastanza per riconoscerli. */
    const remoti = await cloudPlanStore.list();
    const gia = new Set(remoti.map((p) => `${p.label}|${p.createdAt.slice(0, 10)}`));

    let portati = 0;
    for (const p of locali) {
      if (gia.has(`${p.label}|${p.createdAt.slice(0, 10)}`)) continue;
      const { id: _id, createdAt: _createdAt, ...resto } = p;
      await cloudPlanStore.save(resto);
      portati++;
    }
    return portati;
  } catch {
    return 0;
  }
}

export type { PlanStore, SavedPlan } from "./plan-store";
