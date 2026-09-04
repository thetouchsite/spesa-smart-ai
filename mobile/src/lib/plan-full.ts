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
import type { PricedItem, PricingResult } from "@/lib/price-data/types";

/** Un prezzo trovato in un negozio, già controllato dal server. */
export interface Offer {
  negozio: string;
  /** Il nome del prodotto come appare sul sito di quel negozio. */
  nome: string;
  prezzo: number;
  valuta: string;
  /** Vuoto se la pagina non si apriva: in quel caso non si mostra il link. */
  link: string;
  /**
   * Quanto ci si può fidare del prezzo.
   *
   *   "verificato"  pagina aperta e prezzo letto lì dentro
   *   "pagina-ok"   pagina aperta, prezzo non leggibile dal codice
   *   "bloccato"    il sito rifiuta le richieste automatiche: la pagina esiste
   *                 e dal telefono si apre, ma il prezzo non è confermato
   */
  verifica: "verificato" | "pagina-ok" | "bloccato" | "non-raggiungibile";
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


/* ─────────── Abbinare le voci della lista alle offerte trovate ─────────── */

/** Toglie accenti, punteggiatura e doppi spazi: resta solo la sostanza. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Trova le offerte di una voce della lista.
 *
 * L'abbinamento non può essere un confronto esatto. Al modello viene chiesto
 * di riscrivere il nome del prodotto identico a come gli è stato dato, e per
 * lo più lo fa — ma basta una virgola, un accento o un "1 confezione da"
 * diventato "1 conf. da" perché il prezzo, trovato e verificato, non arrivi
 * mai alla riga a cui appartiene. Il risultato è una lista di trattini con i
 * prezzi giusti a pochi centimetri di distanza in memoria.
 *
 * Tre tentativi, dal più severo al più permissivo: uguaglianza, contenimento,
 * e infine le parole in comune. L'ultimo scatta solo con una sovrapposizione
 * ampia, perché abbinare il prezzo sbagliato a un prodotto è peggio che non
 * abbinarne nessuno.
 */
export function findOffers(
  prodotti: ProductOffers[],
  name: string,
  quantity = "",
): ProductOffers | null {
  if (!prodotti?.length) return null;

  const full = normalize(`${name} ${quantity}`);
  const bare = normalize(name);
  if (!bare) return null;

  const indexed = prodotti.map((p) => ({ p, key: normalize(p.prodotto) }));

  const exact = indexed.find((x) => x.key === full || x.key === bare);
  if (exact) return exact.p;

  const contained = indexed.find(
    (x) => x.key.includes(bare) || bare.includes(x.key) || x.key.includes(full),
  );
  if (contained) return contained.p;

  // Ultima risorsa: le parole significative in comune. Le parole corte —
  // "da", "di", "kg", "1" — non contano, altrimenti "1 kg di mele" e
  // "1 kg di pane" sembrerebbero lo stesso prodotto.
  const words = new Set(bare.split(" ").filter((w) => w.length > 3));
  if (words.size === 0) return null;

  let best: { p: ProductOffers; score: number } | null = null;
  for (const { p, key } of indexed) {
    const other = key.split(" ").filter((w) => w.length > 3);
    if (!other.length) continue;
    const shared = other.filter((w) => words.has(w)).length;
    const score = shared / Math.max(words.size, other.length);
    if (score > (best?.score ?? 0)) best = { p, score };
  }
  // Sotto i due terzi di parole in comune non è un abbinamento, è una
  // somiglianza: meglio nessun prezzo che il prezzo di un altro prodotto.
  return best && best.score >= 0.67 ? best.p : null;
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
  const groceryList = (r.lista ?? []).map((v) => ({
    name: v.nome,
    quantity: v.quantita,
    estimatedCost: findOffers(r.prodotti ?? [], v.nome, v.quantita)?.offerte?.[0]?.prezzo ?? 0,
    category: v.reparto,
  }));

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
 * l'apertura di trenta pagine prodotto: misurato fra 45 e 85 secondi. Il
 * limite sta largo perché una generazione riuscita in 90 secondi vale più di
 * un errore a 60 — è il momento in cui l'app fa la cosa che nessun'altra fa.
 *
 * Va passato anche al client HTTP, non solo tenuto qui: il client ha un
 * limite suo di 45 secondi e taglia la connessione per primo. È già successo
 * a Zurigo — il server aveva finito in 57 secondi con dieci prezzi verificati,
 * ma l'app aveva chiuso e ripiegato sul motore senza prezzi.
 */
const TIMEOUT_MS = 180_000;

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
    post<ServerResponse>(
      "/ai/plan-full",
      {
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
      },
      TIMEOUT_MS,
    ),
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

/* ─────────── Dal motore con ricerca alla forma che l'app conosce ─────────── */

/**
 * Traduce i prezzi veri nella forma `PricingResult` del motore interno.
 *
 * Serve perché la schermata dei risultati calcola tutto — spesa prevista,
 * punteggio, quanto resta del budget — a partire da quella struttura. Senza
 * questo raccordo mostrava «Prezzi non disponibili» e 0,00 anche con i prezzi
 * reali già in memoria: è successo a Zurigo, con 58,85 CHF trovati e uno zero
 * a schermo, perché il catalogo interno non ha listini svizzeri.
 *
 * Il punto è che il catalogo interno **non deve nemmeno essere interrogato**
 * quando i prezzi veri ci sono: sono migliori sotto ogni aspetto, e per i
 * paesi che il catalogo non copre sono gli unici che esistono.
 *
 * `resolutionTier: "city"` è la corsia di massima fiducia del motore interno,
 * e qui è meritata: questi prezzi vengono dai negozi di quella città, non da
 * una media nazionale.
 */
export function pricingFromOffers(
  extra: PlanExtra,
  groceryList: Array<{ name: string; quantity: string; category: string }>,
): PricingResult {
  const items: PricedItem[] = groceryList.map((g) => {
    const found = findOffers(extra.prodotti, g.name, g.quantity);
    const best = found?.offerte?.[0];

    // Un prezzo che la pagina ha confermato vale più di uno solo dichiarato:
    // la differenza finisce nella confidenza, che l'app usa per decidere quanto
    // esporsi con i numeri.
    const confidence = !best
      ? 0
      : best.verifica === "verificato"
        ? 1
        : best.verifica === "pagina-ok"
          ? 0.85
          : // "bloccato": il link è buono ma il prezzo lo dice solo il modello.
            0.6;

    return {
      name: g.name,
      quantity: g.quantity,
      category: g.category,
      estimatedCost: best?.prezzo ?? 0,
      matchedPrice: null,
      confidence,
      resolutionTier: best ? "city" : "missing",
      packQuantity: g.quantity,
    } as PricedItem;
  });

  const conPrezzo = items.filter((i) => i.estimatedCost > 0);

  return {
    items,
    totalCost: Math.round(conPrezzo.reduce((s, i) => s + i.estimatedCost, 0) * 100) / 100,
    currency: extra.totali.valuta as PricingResult["currency"],
    coverage: items.length ? conPrezzo.length / items.length : 0,
    averageConfidence: conPrezzo.length
      ? conPrezzo.reduce((s, i) => s + i.confidence, 0) / conPrezzo.length
      : 0,
    missing: items.filter((i) => i.estimatedCost <= 0).map((i) => i.name),
    tierCounts: {
      city: conPrezzo.length,
      country: 0,
      region: 0,
      global: 0,
      missing: items.length - conPrezzo.length,
    },
  };
}
