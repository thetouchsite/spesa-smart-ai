/**
 * I piani salvati sul nostro backend, per chi ha un account.
 *
 * PERCHE' DIETRO LA STESSA PORTA
 * ------------------------------
 * `PlanStore` esisteva gia' con una sola implementazione, quella locale. Qui
 * c'e' la seconda, e le schermate non se ne accorgono: chiamano `getPlanStore()`
 * e ricevono quella giusta a seconda che ci sia un account o no. Nessuna
 * schermata deve chiedersi «sono dentro?» prima di elencare dei piani — quella
 * domanda si fa in un posto solo.
 *
 * LA FORMA DEL PIANO NON CAMBIA
 * -----------------------------
 * Il server conserva `profile` e `plan` come oggetti opachi: non li interpreta,
 * non li valida oltre il minimo. Quindi un piano scritto dal telefono torna
 * identico, e la `SavedPlan` dell'app resta l'unica definizione di cosa sia un
 * piano. Se un giorno la forma cambia, cambia in un file solo.
 *
 * E QUANDO LA RETE NON C'E'
 * -------------------------
 * Si propaga l'errore invece di restituire un elenco vuoto. Un elenco vuoto
 * vorrebbe dire «non hai piani», che e' una bugia e per giunta spaventosa:
 * l'utente crede di averli persi. Chi chiama mostrera' «non riesco a
 * caricarli», che e' la verita' e si risolve da sola.
 */

import { pianiApi, type PianoSalvato } from "../api/cliente";
import { tokenCorrente } from "../state/utente";
import type { PlanStore, SavedPlan } from "./plan-store";
import type { SavedPlanForm } from "@/lib/saved-plans";

function serve(): string {
  const token = tokenCorrente();
  /* Non dovrebbe mai capitare: `getPlanStore()` sceglie questo archivio solo
     se il token c'e'. Se succede e' un errore di programmazione, e va detto
     forte invece di restituire in silenzio un elenco vuoto. */
  if (!token) throw new Error("Archivio remoto usato senza account");
  return token;
}

/** Dalla riga del server alla forma che conoscono le schermate. */
function versoApp(r: PianoSalvato): SavedPlan {
  return {
    id: r.id,
    createdAt: r.createdAt,
    label: r.label,
    form: r.profile as unknown as SavedPlanForm,
    plan: r.plan as SavedPlan["plan"],
    estimatedSpend: r.estimatedSpend,
    savings: r.savings,
    score: r.score,
  };
}

export const cloudPlanStore: PlanStore = {
  async list() {
    const { plans } = await pianiApi.elenco(serve());
    return plans.map(versoApp);
  },

  async get(id) {
    /* Il server non ha una rotta per il singolo piano, e non vale la pena
       aggiungerla: i piani sono al massimo un centinaio e arrivano gia' tutti
       in una richiesta. Una rotta in piu' sarebbe una rotta in piu' da
       mantenere per risparmiare qualche kilobyte. */
    const { plans } = await pianiApi.elenco(serve());
    const trovato = plans.find((p) => p.id === id);
    return trovato ? versoApp(trovato) : null;
  },

  async save(plan) {
    const token = serve();
    const { id } = await pianiApi.salva(token, {
      label: plan.label,
      profile: plan.form as unknown as Record<string, unknown>,
      plan: plan.plan as unknown as Record<string, unknown>,
      estimatedSpend: plan.estimatedSpend,
      savings: plan.savings,
      score: plan.score,
    });
    return { ...plan, id, createdAt: new Date().toISOString() };
  },

  async delete(id) {
    await pianiApi.cancella(serve(), id);
  },
};
