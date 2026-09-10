/**
 * Contenuti: prima il backend, poi il ripiego locale.
 *
 * PERCHÉ ESISTE QUESTO FILE
 * -------------------------
 * L'app deve funzionare in tre situazioni diverse, senza che le schermate
 * sappiano in quale si trovano:
 *
 *   1. backend raggiungibile (sul portatile in sviluppo, o su Railway domani)
 *      → ricette e piani generati dall'AI, di qualità nettamente superiore
 *   2. backend spento o irraggiungibile
 *      → motore deterministico locale, lo stesso che il prototipo usa oggi
 *   3. backend raggiungibile ma senza chiave AI
 *      → risponde 503, e si ricade sul locale come sopra
 *
 * Il ripiego non è un caso d'errore: è il comportamento normale finché il
 * backend non è pubblicato. Per questo non si mostra nessun avviso rosso —
 * l'utente riceve comunque un piano completo.
 *
 * TEMPO DI ATTESA
 * ---------------
 * Breve di proposito. Su una rete lenta un utente preferisce un piano
 * deterministico in due secondi a un piano AI in trenta, e chi sta guardando
 * una dimostrazione ancora di più.
 */

import { post } from "../api/client";
import { generateMealPlan } from "./meal-engine";
import { getRecipe } from "./recipes";
import { buildDeterministicRecipe } from "./recipes/deterministic-recipe";
import type { Recipe } from "./recipes/types";
import type { Plan } from "./models/plan-schema";
import type { UserProfile } from "./models";
import { fetchPlanFull, ProdottiInsufficientiError, type PlanExtra } from "./plan-full";
import { deviceDefaults } from "./format";

/** Oltre questo tempo si smette di aspettare e si usa il locale. */
const AI_TIMEOUT_MS = 12_000;

/** Da dove è arrivato il contenuto: le schermate lo mostrano all'utente. */
export type ContentSource = "ai" | "locale";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);
}

/* ─────────────────────────────── Ricette ─────────────────────────────── */

export interface RecipeResult {
  recipe: Recipe;
  source: ContentSource;
}

/**
 * Ricetta di un piatto. Prova il backend, ricade sul deterministico.
 *
 * Il risultato del backend ha ingredienti e passaggi reali in italiano; il
 * ripiego ha una struttura corretta ma generica. Entrambi sono `Recipe`, così
 * la schermata non cambia — cambia solo l'etichetta della fonte.
 */
export async function fetchRecipe(
  dishName: string,
  opts: {
    servings?: number;
    mealType?: "breakfast" | "lunch" | "dinner" | "snack";
    language?: string;
    country?: string;
    city?: string;
    allergies?: string[];
    /** La lista della spesa del piano: la ricetta deve starci dentro. */
    dispensa?: string[];
  } = {},
): Promise<RecipeResult> {
  const servings = opts.servings ?? 4;
  const mealType = opts.mealType ?? "dinner";
  const language = opts.language ?? "it";

  try {
    // `getRecipe` E' la cascata del prototipo, portata senza modifiche:
    //   1. archivio locale di 52 ricette (solo per utenti in inglese: i nomi
    //      degli ingredienti non sono traducibili dal passaggio "chef")
    //   2. ricerca web + estrazione dalla pagina reale
    //   3. generazione AI
    //   4. ricetta di ripiego
    // I livelli 2 e 3 passano dal nostro backend; se e' spento falliscono in
    // silenzio e la cascata scende da sola fino al quarto.
    const recipe = await withTimeout(
      getRecipe(dishName, {
        servings,
        mealType,
        language,
        country: opts.country ?? "",
        city: opts.city ?? "",
        allergies: opts.allergies ?? [],
        dispensa: opts.dispensa ?? [],
      }),
      AI_TIMEOUT_MS,
    );

    // `source` dice quale livello ha risposto: "local" | "web" | "web-ai" |
    // "ai" | "fallback". Solo l'ultimo e' contenuto costruito dall'app.
    const fromNetwork = recipe.source && recipe.source !== "fallback";
    return { recipe, source: fromNetwork ? "ai" : "locale" };
  } catch (err) {
    // Scaduto il tempo o cascata interrotta: si consegna comunque qualcosa.
    console.info("[contenuti] ricetta dal motore locale:", (err as Error).message);
    return {
      recipe: buildDeterministicRecipe(dishName, { servings, mealType, language }),
      source: "locale",
    };
  }
}

/* ──────────────────────────── Piano alimentare ───────────────────────── */

export interface PlanResult {
  plan: Plan;
  source: ContentSource;
  /**
   * Presente solo quando ha risposto il motore con ricerca: offerte per
   * prodotto, confronto fra supermercati, ricette e promozioni.
   */
  extra?: PlanExtra;
}

/**
 * Piano settimanale. Prova il backend, ricade sul motore deterministico.
 *
 * Il piano AI contiene piatti locali veri ("pasta e ceci", "parmigiana")
 * invece dei nomi generici dei panieri; per una dimostrazione la differenza
 * si vede subito.
 */
export async function fetchPlan(
  profile: UserProfile,
  seed = 1,
  language = "en",
  /** Vedi `fetchPlanFull`: serve a chiedere il piano lo stesso, di proposito. */
  forzaFlusso?: "menu-prima" | "spesa-prima",
): Promise<PlanResult> {
  const local = () => ({ plan: generateMealPlan({ profile, seed }).plan, source: "locale" as const });

  const budget = Number(profile.budget);
  if (!Number.isFinite(budget) || budget <= 0) return local();

  // Prima scelta: il motore con ricerca web. E' l'unico che porta prezzi VERI
  // dei negozi della citta' dell'utente, con il link per comprare, e li ha
  // gia' confrontati fra piu' supermercati. Costa una trentina di secondi in
  // piu' degli altri, e li vale: e' la cosa che distingue l'app da un
  // generatore di menu'.
  try {
    const { plan, extra } = await fetchPlanFull(profile, language, forzaFlusso);
    return { plan, source: "ai", extra };
  } catch (err) {
    /* QUESTO ERRORE NON SI RIPIEGA.
       Tutti gli altri sì: se il backend non risponde, un piano stimato dal
       listino interno è meglio di una schermata vuota. Ma "in questa città non
       ci sono abbastanza prodotti comprabili" è una RISPOSTA, non un guasto —
       e ripiegando la si trasformerebbe nel suo contrario: un piano dall'aria
       normale, costruito su prodotti che l'utente non può comprare. Sarebbe la
       bugia peggiore che l'app possa dire, perché non si vede. */
    if (err instanceof ProdottiInsufficientiError) throw err;
    console.info("[contenuti] motore con ricerca non disponibile:", (err as Error).message);
  }

  // Ripiego: il piano AI senza prezzi reali. Il menu' e' buono, la spesa e'
  // stimata dal listino interno come faceva il prototipo.
  try {
    const plan = await withTimeout(
      post<Plan>("/ai/plan", {
        city: profile.city || "",
        country: profile.country || deviceDefaults().country,
        language,
        household: profile.household || "4",
        budget,
        currency: profile.currency || deviceDefaults().currency,
        frequency: profile.frequency,
        style: profile.style || "Family Budget",
        allergies: profile.allergies ?? [],
        dislikes: profile.dislikes ?? "",
      }),
      // Un piano intero richiede più lavoro di una ricetta: si concede il
      // doppio, ma resta un limite.
      AI_TIMEOUT_MS * 2,
    );

    // Difesa minima: un piano senza giorni o senza spesa non è mostrabile,
    // meglio il deterministico che una schermata vuota.
    if (!plan?.mealPlan?.length || !plan?.groceryList?.length) return local();
    return { plan, source: "ai" };
  } catch (err) {
    console.info("[contenuti] piano dal motore locale:", (err as Error).message);
    return local();
  }
}
