/**
 * Il motore Gemini con ricerca, visto dal lato app.
 *
 * Chiama `/ai/plan-full` e riceve in una volta il menù, le ricette, la lista
 * della spesa e — questa è la novità — i **prezzi reali con i link**, già
 * confrontati fra più supermercati e già verificati dal server aprendo le
 * pagine una per una.
 *
 * COSA CAMBIA RISPETTO A PRIMA
 * ----------------------------
 * Il prototipo mostrava prezzi stimati da un listino interno, gli stessi per
 * tutti. Qui i prezzi sono quelli veri di oggi nei negozi della città
 * dell'utente, con il link per andare a comprare. Dove il server non è
 * riuscito ad aprire la pagina, il prezzo semplicemente non c'è: meglio una
 * riga senza prezzo che un numero che nessuno può controllare.
 *
 * COMPATIBILITÀ
 * -------------
 * La risposta viene tradotta nella forma `Plan` che le schermate già usano,
 * così nessuna di esse va riscritta. Le informazioni in più — offerte per
 * prodotto, confronto fra insegne, promozioni in corso — viaggiano a parte in
 * `extra`, e le schermate le mostrano se ci sono.
 */

import { post } from "@/api/client";
import { PlanSchema, type Plan } from "@/lib/models/plan-schema";
import type { UserProfile } from "@/lib/models";
import { deviceDefaults } from "@/lib/format";

/** Un prezzo trovato in un negozio, già controllato dal server. */
export interface Offer {
  negozio: string;
  /** Il nome del prodotto come appare sul sito di quel negozio. */
  nome: string;
  prezzo: number;
  valuta: string;
  /** Vuoto se la pagina non si apriva: in quel caso non si mostra il link. */
  link: string;
  /** "verificato" = pagina aperta e prezzo letto lì; "pagina-ok" = solo la pagina. */
  verifica: "verificato" | "pagina-ok" | "non-raggiungibile";
  /** Presenti solo quando il prodotto è in promozione. */
  prezzoListino?: number;
  risparmio?: number;
  scontoPercento?: number;
  offertaFinoAl?: string;
}

/** Le offerte dello stesso prodotto nei vari negozi, dalla più economica. */
export interface ProductOffers {
  prodotto: string;
  offerte: Offer[];
  /** Quanto separa la più economica dalla più cara. */
  differenza: number | null;
}

export interface StoreTotal {
  negozio: string;
  totale: number;
  verificati: number;
  proposti: number;
  utilizzabile: boolean;
}

export interface Recipe {
  giorno: string;
  piatto: string;
  porzioni: number;
  ingredienti: Array<{ nome: string; quantita: string }>;
  passaggi: string[];
  prep_minuti: number;
  cottura_minuti: number;
}

export interface PlanMeta {
  motoreMenu: string;
  motorePrezzi: string;
  secondi: number;
  ricerche: number;
  /** Falso quando il modello non ha interrogato il web: prezzi meno affidabili. */
  ricercaEffettuata: boolean;
  costoStimatoUsd: number;
  prezziVerificati: number;
  prezziTotali: number;
  insegneConfrontate: number;
  prodottiConAlternative: number;
  prodottiInOfferta: number;
  generatoIl: string;
}

/** Tutto ciò che il motore restituisce oltre al piano. */
export interface PlanExtra {
  ricette: Recipe[];
  prodotti: ProductOffers[];
  catene: StoreTotal[];
  vincitore: StoreTotal | null;
  risparmioVsPiuCara: number | null;
  totali: {
    spesaAlMiglioPrezzo: number;
    budget: number;
    valuta: string;
    prodottiSenzaPrezzo: number;
    vociInLista: number;
  };
  meta: PlanMeta;
}

interface ServerResponse {
  menu: Array<{ giorno: string; colazione: string; pranzo: string; cena: string }>;
  ricette?: Recipe[];
  lista: Array<{ nome: string; quantita: string; reparto: string }>;
  prezzi: Array<Offer & { prodotto: string; alternative: number }>;
  prodotti: ProductOffers[];
  catene: StoreTotal[];
  vincitore: StoreTotal | null;
  risparmioVsPiuCara: number | null;
  totali: PlanExtra["totali"];
  consigli: string[];
  meta: PlanMeta;
}

/**
 * Quanto margine resta sul budget, e come si chiama.
 *
 * Le stesse soglie del prototipo, così le schermate colorano come prima.
 */
function statusOf(spent: number, budget: number): Plan["status"] {
  if (budget <= 0) return "critical";
  const ratio = spent / budget;
  if (ratio <= 0.8) return "comfortable";
  if (ratio <= 1) return "optimized";
  return "critical";
}

/**
 * Traduce la risposta del server nella forma `Plan` delle schermate.
 *
 * Il prezzo di ogni voce della lista è il **migliore fra i negozi**: è la
 * scelta che l'app suggerisce, e le alternative restano consultabili in
 * `extra.prodotti`.
 *
 * Le voci per cui nessun prezzo è stato verificato prendono 0. Il totale però
 * viene dal server, che conta solo i prezzi veri, e `prodottiSenzaPrezzo` dice
 * quante voci mancano all'appello: così un totale parziale non passa mai per
 * un totale completo.
 */
function toPlan(r: ServerResponse): Plan {
  const bestByProduct = new Map<string, number>();
  for (const p of r.prodotti ?? []) {
    const best = p.offerte?.[0]?.prezzo;
    if (typeof best === "number") bestByProduct.set(p.prodotto.trim().toLowerCase(), best);
  }

  const groceryList = (r.lista ?? []).map((v) => {
    const key = `${v.nome} ${v.quantita}`.trim().toLowerCase();
    return {
      name: v.nome,
      quantity: v.quantita,
      estimatedCost: bestByProduct.get(key) ?? bestByProduct.get(v.nome.trim().toLowerCase()) ?? 0,
      category: v.reparto,
    };
  });

  const spent = r.totali?.spesaAlMiglioPrezzo ?? 0;
  const budget = r.totali?.budget ?? 0;
  const mancanti = r.totali?.prodottiSenzaPrezzo ?? 0;

  // Il testo dell'analisi dichiara sempre quanti prodotti non hanno prezzo:
  // senza quella riga un conto parziale sembrerebbe un affare.
  const analisi = [
    `${spent.toFixed(2)} ${r.totali?.valuta ?? "EUR"} sui ${budget} di budget`,
    r.meta?.insegneConfrontate > 1
      ? `prezzi confrontati fra ${r.meta.insegneConfrontate} supermercati`
      : null,
    mancanti > 0 ? `${mancanti} prodotti senza prezzo verificato` : null,
    r.meta?.prodottiInOfferta ? `${r.meta.prodottiInOfferta} in offerta` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return PlanSchema.parse({
    budgetAnalysis: analisi,
    estimatedCost: spent,
    safetyMargin: Math.max(0, Math.round((budget - spent) * 100) / 100),
    status: statusOf(spent, budget),
    recommendedBudget: null,
    minimumBudget: null,
    mealPlan: (r.menu ?? []).map((m) => ({
      day: m.giorno,
      breakfast: m.colazione,
      lunch: m.pranzo,
      dinner: m.cena,
    })),
    groceryList,
    savingTips: r.consigli ?? [],
  });
}

export interface PlanFullResult {
  plan: Plan;
  extra: PlanExtra;
}

/**
 * Il tempo massimo di attesa.
 *
 * Due chiamate al modello, di cui una con una ventina di ricerche web, più
 * l'apertura di trenta pagine prodotto: misurato fra 50 e 75 secondi. Il
 * limite sta largo perché una generazione riuscita in 80 secondi vale più di
 * un errore a 60 — è il momento in cui l'app fa la cosa che nessun'altra fa.
 */
const TIMEOUT_MS = 150_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`tempo scaduto dopo ${ms} ms`)), ms),
    ),
  ]);
}

/**
 * Genera il piano completo con prezzi reali.
 *
 * Lancia in caso di errore: chi chiama decide come ricadere: `fetchPlan`
 * prova prima questo, poi il piano AI senza prezzi, poi il motore locale.
 */
export async function fetchPlanFull(
  profile: UserProfile,
  language: string,
): Promise<PlanFullResult> {
  const defaults = deviceDefaults();

  const response = await withTimeout(
    post<ServerResponse>("/ai/plan-full", {
      city: profile.city || "",
      country: profile.country || defaults.country,
      household: profile.household || "2",
      budget: Number(profile.budget) || 100,
      currency: profile.currency || defaults.currency,
      frequency: profile.frequency === "monthly" ? "monthly" : "weekly",
      style: profile.style || "equilibrato",
      allergies: profile.allergies ?? [],
      dislikes: profile.dislikes ?? "",
      language,
      withRecipes: true,
    }),
    TIMEOUT_MS,
  );

  if (!response?.menu?.length || !response?.lista?.length) {
    throw new Error("il motore ha risposto senza menù o senza lista");
  }

  return {
    plan: toPlan(response),
    extra: {
      ricette: response.ricette ?? [],
      prodotti: response.prodotti ?? [],
      catene: response.catene ?? [],
      vincitore: response.vincitore ?? null,
      risparmioVsPiuCara: response.risparmioVsPiuCara ?? null,
      totali: response.totali,
      meta: response.meta,
    },
  };
}
