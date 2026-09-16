/**
 * spesa-smart-api — backend Node.js su Railway.
 *
 * Sostituisce le server function di TanStack Start, che in React Native non
 * esistono, e la dipendenza dal gateway Lovable.
 *
 * Fa tre cose:
 *   1. custodisce le chiavi API (da un .apk si estraggono in cinque minuti)
 *   2. tiene account e piani salvati su MongoDB, così non si perdono più
 *      cambiando telefono
 *   3. mette in cache le risposte AI fra TUTTI gli utenti — è ciò che porta
 *      il costo per piano da ~0,15 € a ~0,02 €
 *
 * Endpoint:
 *   GET  /health
 *   POST /auth/register      { email, password, displayName? } -> { token }
 *   POST /auth/login         { email, password }               -> { token }
 *   GET  /me                                                    (Bearer)
 *   GET  /plans                                                 (Bearer)
 *   POST /plans              salva un piano                     (Bearer)
 *   POST /plans/delete       { id }                             (Bearer)
 *   POST /ai/recipe          ricetta generata dal modello
 *   POST /ai/recipe-web      ricerca web + estrazione strutturata
 *   POST /ai/chef            rifinitura "da chef" (non tocca gli ingredienti)
 *   POST /ai/plan            piano alimentare completo
 *   POST /ai/lista           solo la lista della spesa (flusso "spesa-prima")
 *   POST /ai/menu-da-prodotti menu' costruito sui soli prodotti comprabili
 *   POST /product/amazon     prodotti Amazon veri per UNA voce, al tocco
 *   POST /ai/plan-full       piano + ricette + confronto supermercati + prezzi
 *                            veri, in UNA chiamata con ricerca Google
 */

import process from "node:process";
import { createHash } from "node:crypto";
import { generateText, Output } from "ai";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { createApp, HttpError } from "./base/http.js";
import { isConfigured, model, MODEL_ID } from "./app/gemini.js";
import { fetchPageContext, rankHits, searchProvider } from "./app/search.js";
import { cache, cacheVecchia, isDbConfigured, plans, users } from "./base/db.js";
import { hashPassword, issueToken, requireUser, verifyPassword } from "./app/auth.js";
import { isShoppingConfigured, searchShopping } from "./app/shopping.js";
import {
  type Blocco,
  budgetExhausted,
  perchePieno,
  quotaStatus,
  recordCost,
  recordUse,
  spendStatus,
} from "./base/quota.js";
import {
  flussoPredefinito,
  generateListaSpesa,
  generateMenu,
  generateMenuDaProdotti,
  generatePricesParallel,
  GROUNDED_MODEL,
  MENU_MODEL,
  chiamaMenu,
  parseJson,
} from "./app/plan-grounded.js";
import type { CheckedRow } from "./api/price-page.js";
import {
  groupByProduct,
  migliorePrezzoVerificato,
  pickBestStore,
  scartaImplausibili,
  togliOutlier,
  verifyPrices,
} from "./api/price-page.js";
import { generatePricesSerpapi } from "./app/prices-serpapi.js";
import { catalogoDisponibilePer, generatePricesCatalogo, type PrezzoGrezzo } from "./api/prices-catalogo.js";
import { cercaProdottoAmazon, isAmazonSearchConfigured } from "./app/amazon-search.js";
import { linkDiRipiego } from "./app/fallback-link.js";
import { isoDaPaese } from "./api/insegne-online.js";
import { FRESCHEZZA_MS, statoMagazzino } from "./api/prezzi-magazzino.js";
import { statoCataloghi } from "./api/catalogo-magazzino.js";
import { prezziDaiCataloghiIT } from "./api/catalogo-it.js";
import { annota } from "./base/diario.js";
import { statoVocabolario, quanteImparate } from "./api/vocabolario.js";
import { saluteIA } from "./base/salute-ia.js";
import { rispostaPrezziV1 } from "./api/contratto-v1.js";
import { collegaTraduttore } from "./api/aiuti-esterni.js";
import { consumoDiOggi, controllaChiave } from "./api/chiavi.js";
import { cercaNelCatalogo, statoCatalogo, svuotaCatalogo } from "./api/catalogo.js";
import { paesiConCatalogo } from "./api/catalogo-fonti.js";
import { negoziInCitta, statoNegozi, tuttiINegozi } from "./api/negozi.js";
import { aggiornaCatalogo, avviaCatalogoNotturno } from "./api/catalogo-notturno.js";
import {
  AiRecipeInput,
  ChefInput,
  ChefSchema,
  PlanInput,
  PlanSchema,
  RecipeSchema,
  WebRecipeInput,
  WebRecipeSchema,
} from "./base/schemas.js";
import {
  chefPrompt,
  planPrompt,
  recipePrompt,
  webExtractPrompt,
  webSynthesizePrompt,
} from "./app/prompts.js";

const app = createApp();

/** Valida l'input e trasforma un errore di schema in 400 anziché 500. */
function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse((body as { data?: unknown })?.data ?? body);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ");
    throw new HttpError(400, `Input non valido: ${detail}`);
  }
  return result.data;
}

/* ───────────────────────── Cache AI condivisa ───────────────────────── */

const CACHE_TTL_DAYS = 30;

/**
 * Cache in memoria, usata quando MongoDB non e' configurato.
 *
 * Serve a proteggere la quota: senza, ogni singola richiesta — comprese le
 * ripetizioni durante una dimostrazione — consuma una generazione. Con una
 * chiave gratuita si esaurisce in pochi minuti di prove.
 *
 * Vive quanto il processo e non e' condivisa fra istanze: e' un ripiego per
 * lo sviluppo, non un sostituto della cache su database.
 */
const memoryCache = new Map<string, { value: unknown; expires: number }>();
const MEMORY_CACHE_MAX = 500;

function memoryGet(key: string): unknown | undefined {
  const hit = memoryCache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    memoryCache.delete(key);
    return undefined;
  }
  /* `hit.value`, NON `hit`. Qui dentro c'e' l'involucro — il valore piu' la
     sua scadenza — e restituirlo intero vuol dire consegnare a chi chiama un
     oggetto che non assomiglia a niente: niente `prodotti`, niente `prezzi`,
     niente. Chi legge non va in errore, vede solo una risposta vuota.

     E' costato ore. La stessa lista dava ventitre offerte appena calcolata e
     zero un minuto dopo, e sembrava un motore che si rompe a intermittenza:
     ho riavviato, svuotato cache, rimisurato, sospettato i negozi. Era questa
     riga. L'ho scritta io stasera, con una sostituzione fatta troppo larga
     mentre sistemavo la cache del database.

     Da qui probabilmente venivano anche i «nessun negozio online ha questo
     prodotto» che Alberto vedeva nell'app: risposta servita dalla memoria,
     involucro al posto del contenuto, e l'app non aveva modo di accorgersene. */
  return hit.value;
}

function memorySet(key: string, value: unknown, durataMs?: number): void {
  // Sfratto la voce piu' vecchia: senza limite un processo lungo cresce
  // senza fine.
  if (memoryCache.size >= MEMORY_CACHE_MAX) {
    const oldest = memoryCache.keys().next().value;
    if (oldest) memoryCache.delete(oldest);
  }
  memoryCache.set(key, {
    value,
    expires: Date.now() + (durataMs ?? CACHE_TTL_DAYS * 86_400_000),
  });
}

/**
 * Cerca nella cache, e nel posto vecchio se nel nuovo non c'e'.
 *
 * La cache e' appena stata divisa in due collezioni — una dell'API e una
 * dell'app — e quella di prima e' ancora piena. Senza questo ripiego, il
 * giorno del passaggio ogni risposta salvata smetterebbe di valere e tutti
 * ripagherebbero un lavoro gia' fatto. Su un servizio che al risveglio ci mette
 * cinquantacinque secondi non e' un dettaglio.
 *
 * Le voci vecchie hanno una scadenza e Mongo le toglie da sola: fra qualche
 * giorno la collezione `cache` sara' vuota, questa funzione potra' tornare una
 * riga sola e `cacheVecchia` sparire.
 */
async function dallaCache(key: string): Promise<unknown | undefined> {
  const nella = await (await cache(key)).findOne({ _id: key });
  if (nella) return nella.value;
  const prima = await (await cacheVecchia()).findOne({ _id: key });
  return prima?.value;
}

function cacheKey(endpoint: string, payload: unknown): string {
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32);
  return `${endpoint}:${hash}`;
}

/**
 * Chiamata al modello con output strutturato, passando dalla cache.
 *
 * La cache è condivisa fra tutti gli utenti: due famiglie che ricevono
 * "Pasta al pomodoro" pagano una sola generazione. È il motivo per cui il
 * costo AI resta sostenibile quando gli utenti crescono.
 */
async function generate<T extends z.ZodTypeAny>(
  endpoint: string,
  schema: T,
  prompt: string,
  cacheOn: unknown,
): Promise<z.infer<T>> {
  if (!isConfigured()) throw new HttpError(503, "Servizio AI non configurato su questo ambiente");

  const key = cacheKey(endpoint, cacheOn);

  const local = memoryGet(key);
  if (local !== undefined) {
    console.info(`[cache] HIT memoria ${key}`);
    return local as z.infer<T>;
  }

  if (isDbConfigured()) {
    try {
      const hit = await dallaCache(key);
      if (hit !== undefined) {
        console.info(`[cache] HIT database ${key}`);
        memorySet(key, hit);
        return hit as z.infer<T>;
      }
    } catch (err) {
      // Una cache irraggiungibile non deve impedire la generazione.
      console.warn("[cache] lettura fallita, proseguo senza:", err);
    }
  }

  // Contata qui e non prima: le risposte servite dalla cache non consumano
  // quota, ed e' proprio quello il valore della cache.
  recordUse("gemini");
  const { experimental_output } = await generateText({
    model: model(),
    experimental_output: Output.object({ schema }),
    prompt,
  });

  // `generateText` non riesce a legare l'output allo schema quando lo schema
  // arriva come generico: il tipo torna `unknown` e va riaffermato qui.
  const output = experimental_output as z.infer<T>;
  memorySet(key, output);

  if (isDbConfigured()) {
    try {
      await (await cache(key)).insertOne({
        _id: key,
        value: output,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + CACHE_TTL_DAYS * 86_400_000),
      });
    } catch {
      /* chiave già presente per una richiesta concorrente: va bene così */
    }
  }
  return output;
}

/* ────────────────────────────── Salute ────────────────────────────── */

/**
 * Il freno, prima di spendere.
 *
 * UN TETTO VINCOLA SOLO DOVE QUALCUNO LO GUARDA, e questa e' stata la scoperta
 * della prova: con l'app limitata a mezzo centesimo, tre generazioni di menu
 * sono passate lo stesso e ne hanno spesi tre quarti in piu'. Il controllo
 * stava su `/ai/plan-full` e su `/ai/prices`, e gli altri tre punti che
 * chiamano il modello — menu, lista, menu-da-prodotti — spendevano senza
 * chiedere il permesso a nessuno. Non sforavano solo il tetto dell'app: anche
 * quello complessivo.
 *
 * Adesso il freno e' uno solo e si chiama da tutte le parti, cosi' il prossimo
 * punto che spende non puo' dimenticarselo per distrazione — c'e' una riga
 * sola da copiare, ed e' quella giusta.
 */
function fermatiSePieno(blocco: Blocco): void {
  if (!budgetExhausted(blocco)) return;
  throw new HttpError(
    402,
    `Spesa: ${perchePieno(blocco)}. ` +
      (blocco === "app"
        ? "Alza SPESA_MAX_USD_APP o riavvia il servizio per ripartire."
        : "Alza SPESA_MAX_USD o riavvia il servizio per ripartire."),
  );
}

app.get("/health", async () => ({
  ok: true,
  model: MODEL_ID,
  // Il motore vero dell'app: il modello con ricerca Google.
  menuModel: MENU_MODEL,
  groundedModel: GROUNDED_MODEL,
  // Quale delle due strade e' attiva: si cambia con FLUSSO nell'ambiente.
  flusso: flussoPredefinito(),
  /* IL MODELLO FUNZIONA DAVVERO — che e' un'altra domanda.
     `aiConfigured` risponde «la chiave e' scritta nell'ambiente», ed e' vero
     anche quando la quota Google e' finita e il modello non risponde piu'. Ci
     ha ingannati due volte in una sera: tutto verde, e meta' della spesa
     spariva. Resta perche' qualcuno lo legge, ma la verita' sta qui sotto, e
     `funziona: null` vuol dire che nessuno ha ancora chiamato — che e'
     un'informazione vera, a differenza di un «si» ottimista. */
  ia: saluteIA(),
  aiConfigured: isConfigured(),
  dbConfigured: isDbConfigured(),
  shoppingConfigured: isShoppingConfigured(),
  searchProvider: searchProvider().id,
  // Consumo delle chiavi gratuite: l'app lo legge e avvisa a schermo prima
  // che la quota finisca a meta' di una dimostrazione.
  quota: quotaStatus(),
  // Quanto e' costato finora questo processo, e quanto manca al tetto.
  spesa: spendStatus(),
}));

/* ───────────────────────────── Account ───────────────────────────── */

const Credentials = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  displayName: z.string().max(80).optional(),
});

app.post("/auth/register", async (body) => {
  const { email, password, displayName } = parse(Credentials, body);
  const col = await users();
  const normalized = email.toLowerCase().trim();

  if (await col.findOne({ email: normalized })) {
    throw new HttpError(409, "Esiste già un account con questa email");
  }
  const doc = {
    email: normalized,
    passwordHash: await hashPassword(password),
    displayName,
    createdAt: new Date(),
  };
  const { insertedId } = await col.insertOne(doc);
  return { token: issueToken(String(insertedId)), email: normalized, displayName };
});

app.post("/auth/login", async (body) => {
  const { email, password } = parse(Credentials.omit({ displayName: true }), body);
  const col = await users();
  const user = await col.findOne({ email: email.toLowerCase().trim() });

  // Stesso messaggio per email inesistente e password errata: distinguerli
  // permetterebbe di scoprire quali indirizzi sono registrati.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new HttpError(401, "Email o password non corretti");
  }
  return {
    token: issueToken(String(user._id)),
    email: user.email,
    displayName: user.displayName,
  };
});

app.get("/me", async (_body, req) => {
  const userId = requireUser(req as never);
  const user = await (await users()).findOne({ _id: new ObjectId(userId) });
  if (!user) throw new HttpError(404, "Utente non trovato");
  return { email: user.email, displayName: user.displayName, createdAt: user.createdAt };
});

/* ─────────────────────────── Piani salvati ─────────────────────────── */

const SavePlan = z.object({
  label: z.string().min(1).max(120),
  profile: z.record(z.string(), z.unknown()),
  plan: z.record(z.string(), z.unknown()),
  estimatedSpend: z.number().default(0),
  savings: z.number().default(0),
  score: z.number().default(0),
});

app.get("/plans", async (_body, req) => {
  const userId = requireUser(req as never);
  const rows = await (await plans())
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();
  return { plans: rows.map(({ _id, ...rest }) => ({ id: String(_id), ...rest })) };
});

app.post("/plans", async (body, req) => {
  const userId = requireUser(req as never);
  const data = parse(SavePlan, body);
  const now = new Date();
  const { insertedId } = await (await plans()).insertOne({
    userId,
    ...data,
    createdAt: now,
    updatedAt: now,
  });
  return { id: String(insertedId) };
});

app.post("/plans/delete", async (body, req) => {
  const userId = requireUser(req as never);
  const { id } = parse(z.object({ id: z.string().min(1) }), body);
  // Il filtro include userId: senza, un id indovinato cancellerebbe il piano
  // di un altro utente.
  const res = await (await plans()).deleteOne({ _id: new ObjectId(id), userId });
  if (res.deletedCount === 0) throw new HttpError(404, "Piano non trovato");
  return { ok: true };
});

/* ─────────────────────────────── AI ─────────────────────────────── */

app.post("/ai/recipe", async (body) => {
  const data = parse(AiRecipeInput, body);
  return generate("recipe", RecipeSchema, recipePrompt(data), data);
});

app.post("/ai/chef", async (body) => {
  const data = parse(ChefInput, body);
  return generate("chef", ChefSchema, chefPrompt(data), data);
});

app.post("/ai/plan", async (body) => {
  const data = parse(PlanInput, body);
  const budgetDisplay = new Intl.NumberFormat("en", {
    style: "currency",
    currency: data.currency,
  }).format(data.budget);
  return generate("plan", PlanSchema, planPrompt(data, budgetDisplay), data);
});

/**
 * Ricerca web + estrazione.
 *
 * Due esiti, e la differenza è dichiarata al client:
 *   "extracted"   → una pagina reale è stata letta, sourceUrl punta a quella
 *   "ai-assisted" → nessuna pagina leggibile, ricetta generata, sourceUrl ""
 *
 * Il prototipo, nel secondo caso, metteva comunque l'URL del primo risultato
 * di ricerca: l'utente cliccava e trovava una ricetta diversa da quella
 * mostrata. Con DuckDuckGo oggi bloccato, quel caso era diventato la regola.
 */
app.post("/ai/recipe-web", async (body) => {
  const data = parse(WebRecipeInput, body);

  const parts = [data.dishName.trim(), "recipe", "ingredients", "instructions"];
  if (data.cuisine) parts.unshift(data.cuisine);
  if (data.mealType && !data.dishName.toLowerCase().includes(data.mealType)) parts.push(data.mealType);
  const query = parts.join(" ");

  const hits = rankHits(await searchProvider().search(query));

  for (const hit of hits.slice(0, 3)) {
    const page = await fetchPageContext(hit.url);
    if (page.length < 1500) continue;
    try {
      const host = new URL(hit.url).hostname.replace(/^www\./, "");
      const out = await generate(
        "recipe-web",
        WebRecipeSchema,
        webExtractPrompt(data, hit.url, host, page),
        { url: hit.url, lang: data.language, servings: data.servings, allergies: data.allergies },
      );
      if (out.ingredients.length >= 3 && out.steps.length >= 3) return out;
    } catch (err) {
      console.warn("[recipe-web] estrazione fallita, provo il prossimo risultato:", err);
    }
  }

  console.info(`[recipe-web] nessuna pagina utilizzabile per "${data.dishName}" — ricetta generata`);
  return generate("recipe-syn", WebRecipeSchema, webSynthesizePrompt(data), data);
});

/* ──────────────── Piano completo con ricerca (il motore) ──────────────── */

const GroundedInput = z.object({
  city: z.string().max(80).default(""),
  country: z.string().max(40).default("Italia"),
  household: z.string().max(40).default("2 persone"),
  budget: z.number().min(1).max(100_000).default(100),
  currency: z.string().min(3).max(3).default("EUR"),
  frequency: z.enum(["weekly", "monthly"]).default("weekly"),
  style: z.string().max(80).default("mediterraneo"),
  allergies: z.array(z.string().max(40)).max(20).default([]),
  dislikes: z.string().max(200).default(""),
  language: z.string().max(5).default("it"),
  withRecipes: z.boolean().default(true),
  /**
   * Da dove prendere i prezzi.
   *
   *   "ai"       il motore con ricerca: lo stesso prodotto della lista nei
   *              supermercati della città, con ogni pagina aperta e verificata
   *   "serpapi"  Google Shopping su tutta la lista, come si aspettava il
   *              prototipo del cliente: copertura più alta, pertinenza più
   *              bassa, e consuma la quota SerpAPI (una ricerca per prodotto)
   *
   * Esiste per poter confrontare le due strade sugli stessi dati prima di
   * decidere cosa promettere. Il valore predefinito si imposta con
   * PRICE_SOURCE nell'ambiente; il client può forzarlo per singola richiesta.
   */
  priceSource: z.enum(["ai", "serpapi", "catalogo"]).optional(),
});

/** La strada predefinita, se il client non ne chiede una. */
/** Le tre strade per arrivare a un prezzo. */
type FontePrezzi = "ai" | "serpapi" | "catalogo";

/**
 * La strada predefinita, se il client non ne chiede una.
 *
 *   ai         il modello cerca sul web; copre ovunque, ma a volte inventa
 *              gli indirizzi e costa sei centesimi a piano
 *   catalogo   dalle sitemap dei negozi: link garantiti e costo zero, ma solo
 *              nei paesi censiti — fuori, ricade su "ai" da sola
 *   serpapi    Google Shopping, come il prototipo: consuma una quota che in
 *              produzione non abbiamo
 */
const PRICE_SOURCE_DEFAULT: FontePrezzi =
  process.env.PRICE_SOURCE === "serpapi"
    ? "serpapi"
    : process.env.PRICE_SOURCE === "catalogo"
      ? "catalogo"
      : "ai";

/**
 * Da nome di paese a codice ISO, per Google Shopping.
 *
 * L'app manda "Italia" o "Svizzera", SerpAPI vuole "it" e "ch": senza la
 * conversione una ricerca italiana torna con risultati americani in dollari.
 * L'elenco copre i paesi provati; per gli altri si passa il testo cosi' com'e'
 * quando sono gia' due lettere, altrimenti si ripiega sull'Italia.
 */
/**
 * Il codice del paese, con l'elenco completo che sta in `insegne-online`.
 *
 * Qui c'era una mappa di una dozzina di paesi che fuori da quella dozzina
 * rispondeva `"it"`: la Grecia diventava Italia, e ad Atene si cercava su
 * Amazon.it senza che nulla segnalasse l'errore. Ora i paesi sconosciuti
 * restano sconosciuti, e l'Italia e' una scelta dichiarata per chi non ha
 * detto dove sta.
 */
function paeseIso(paese: string): string {
  return (isoDaPaese(paese) || "IT").toLowerCase();
}

/**
 * Il motore dell'app: una chiamata, tutto il piano.
 *
 * Menù, ricette, lista della spesa, confronto fra supermercati e prezzi reali
 * con link. Misurato: 28-40 secondi, 0,018 $, prezzi e link verificati uno
 * per uno. Sostituisce /ai/plan + /ai/recipe-web + /product/shopping.
 *
 * DUE GARANZIE, ED È QUI CHE STA IL VALORE
 *
 * 1. I prezzi sono cercati sul web durante la generazione, non ricordati.
 *    Senza ricerca il modello inventa numeri plausibili con link inesistenti:
 *    è stato misurato, non temuto.
 *
 * 2. Ogni link viene APERTO da questo server prima di rispondere. Quelli che
 *    non si aprono perdono prezzo e link. Serve perché il modello, quando una
 *    catena ha il catalogo dietro login, ricostruisce gli indirizzi a mano —
 *    ed è successo: dodici 404 su dodici in una prova.
 *
 * La cache è condivisa fra tutti gli utenti: due famiglie con lo stesso
 * profilo pagano una generazione sola. È ciò che tiene il costo sostenibile
 * quando gli utenti crescono.
 */
/**
 * Prezza una lista della spesa: cerca, verifica, confronta.
 *
 * Condivisa dai due endpoint — `/ai/prices` per l'app, `/ai/plan-full` per gli
 * script di prova — cosi' la logica sta in un posto solo e le due strade non
 * possono divergere.
 */
async function prezzaLista(
  items: string[],
  city: string,
  country: string,
  currency: string,
  fonte: FontePrezzi,
) {
  /* Le voci che un candidato ce l'avevano e di cui non si e' aperta nessuna
     pagina. Serve a non dire «nessun negozio ha questo prodotto» quando la
     verita' e' «non siamo riusciti ad aprirlo»: sono due cose diverse e si
     rimediano in due modi — la prima e' definitiva, la seconda invita a
     riprovare. */
  let nonRaggiungibili: string[] = [];
  let prezziGrezzi: Array<{
    prodotto?: string;
    nome: string;
    prezzo: number | null;
    valuta: string;
    negozio: string;
    link: string;
  }> = [];
  let secondi = 0;
  let costo = 0;
  let ricerche = 0;
  let hacercato = false;

  try {
    if (fonte === "catalogo") {
      /* LE DUE STRADE INSIEME, NON IN FILA.
         Il catalogo da' link garantiti dal negozio ma copre otto voci su
         diciassette; il motore copre tutto ma ogni tanto inventa un indirizzo.
         Servono entrambi.

         In fila costavano 70 SECONDI — venti il catalogo piu' trentotto il
         motore — e l'app molla a cinquantacinque, perche' iOS chiude ogni
         connessione a sessanta. Sul telefono sarebbe fallito sempre.

         Insieme costano il tempo del piu' lento, una quarantina di secondi. E
         non costano di piu' in denaro: il grounding si paga A CHIAMATA, non a
         prodotto, quindi chiedere al motore diciassette voci o nove e' lo
         stesso prezzo. Chiederle tutte, e preferire il catalogo dove c'e', e'
         gratis in confronto.

         Se il paese non e' censito non si finge: resta il solo motore. */
      const iso = paeseIso(country);
      const conCatalogo = catalogoDisponibilePer(iso);
      if (!conCatalogo) {
        console.info(`[prezzi] nessun catalogo per ${country}: solo motore con ricerca`);
      }

      const t0 = Date.now();

      /* SOLO LA NOSTRA API. IL MODELLO NON TOCCA I PREZZI.
         Il giro e' questo, e non ha eccezioni:

           1. l'AI scrive la LISTA della spesa, dall'onboarding
           2. il NOSTRO catalogo le attacca prezzi e negozi, dove riesce
           3. l'AI costruisce il MENU' su quello che si compra davvero

         Il modello non cerca prezzi e non produce indirizzi. E' la ragione per
         cui quel giro esiste: quando glieli chiedevamo, li inventava — Ocado
         con la scheda che non c'e', «Amazon (Morrisons)» che non e' un
         negozio, Cortilia 0 pagine aperte su 12.

         Il motore resta raggiungibile con PRICE_SOURCE=ai per confrontare le
         due strade, ma da qui dentro non parte mai: dove il catalogo non
         arriva, la voce resta senza prezzo e l'app lo dice. Meglio una riga
         vuota e onesta di un link che non porta da nessuna parte.

         Se il paese non e' censito, il risultato e' una lista senza prezzi:
         e' il limite della copertura, ed e' dichiarato invece che nascosto
         dietro a numeri inventati. */
      const inizio = Date.now();

      /* I DUE CATALOGHI INSIEME, NON IN FILA.
         Il nostro e quello italiano non si parlano e non dipendono l'uno
         dall'altro: uno legge le sitemap censite, l'altro cerca su EBSN e nei
         volantini. Aspettare che il primo finisca per far partire il secondo
         costava nove secondi buoni a ogni piano italiano, per niente.

         `Promise.all` non fa fallire nessuno dei due: entrambi hanno gia' il
         loro `catch` e restituiscono vuoto invece di alzare le mani. */
      const [cat, dallItalia] = await Promise.all([
        conCatalogo
          ? generatePricesCatalogo(items, iso, currency).catch((err) => {
              console.warn("[prezzi] catalogo fallito:", err);
              return null;
            })
          : Promise.resolve(null),
        prezziDaiCataloghiIT(items, iso.toUpperCase(), currency, city).catch((err) => {
          console.warn("[catalogo] italiano non disponibile:", err);
          return [] as PrezzoGrezzo[];
        }),
      ]);

      prezziGrezzi = cat?.prezzi ?? [];
      nonRaggiungibili = cat?.nonRaggiungibili ?? [];

      /* QUELLO ITALIANO AGGIUNGE, NON RIFA'.
         Le sue righe servono al confronto fra insegne — Eurospin, Cortilia,
         Unicoop, che nel nostro catalogo non ci sono — ma per le voci che
         abbiamo GIA' risolto con un prezzo letto dalla pagina non aggiungono
         niente di necessario, e ognuna costa un'apertura di pagina in fase di
         verifica. Misurato: ventidue secondi su una richiesta da cinquanta,
         per arricchire voci che erano gia' complete.

         Quindi entrano tutte quelle su voci scoperte, e delle altre solo
         quelle che il prezzo ce l'hanno gia' — che sono alternative vere e
         non costano nulla da mostrare. */
      if (dallItalia.length) {
        const risolte = new Set(
          prezziGrezzi.filter((r) => r.prezzo != null).map((r) => r.prodotto),
        );
        const utili = dallItalia.filter((r) => !risolte.has(r.prodotto) || r.prezzo != null);
        if (utili.length < dallItalia.length) {
          console.info(
            `[catalogo] italiano: ${utili.length}/${dallItalia.length} righe tenute, ` +
              `le altre erano su voci gia' risolte`,
          );
        }
        prezziGrezzi = [...utili, ...prezziGrezzi];
      }
      secondi = (Date.now() - inizio) / 1000;
      costo = 0;
      ricerche = cat?.pagineAperte ?? 0;
      // Le pagine le abbiamo aperte noi, una per una: e' la forma piu' forte
      // di «ha cercato davvero».
      hacercato = prezziGrezzi.length > 0;

      console.info(
        `[prezzi] solo catalogo: ${secondi.toFixed(0)}s, ` +
          `${new Set(prezziGrezzi.map((p) => p.prodotto)).size}/${items.length} voci, ` +
          `${ricerche} pagine aperte, $0`,
      );
    } else if (fonte === "serpapi") {
      // La strada del prototipo: una ricerca per prodotto su Google Shopping.
      if (!isShoppingConfigured()) {
        throw new HttpError(503, "SERPAPI_KEY non configurata: la strada 'serpapi' non e' disponibile");
      }
      const t0 = Date.now();
      const serp = await generatePricesSerpapi(items, paeseIso(country));
      for (let i = 0; i < serp.ricerche; i++) recordUse("serpapi");
      prezziGrezzi = serp.prezzi;
      secondi = (Date.now() - t0) / 1000;
      ricerche = serp.ricerche;
      // Google Shopping cerca sempre davvero: non ha il rischio di rispondere
      // a memoria che ha il modello.
      hacercato = true;
      console.info(
        `[prezzi] Google Shopping: ${secondi.toFixed(0)}s, ${serp.ricerche} ricerche SerpAPI, ` +
          `${prezziGrezzi.length} prezzi, ${serp.senzaPrezzo} prodotti senza risultati`,
      );
    } else {
      recordUse("gemini");
      recordUse("grounding");
      const fase2 = await generatePricesParallel(items, city, country, currency);
      prezziGrezzi = fase2.data.prezzi;
      secondi = fase2.seconds;
      costo = fase2.cost;
      ricerche = fase2.data.searches;
      recordCost(fase2.cost, "api");
      hacercato = fase2.data.grounded;
      console.info(
        `[prezzi] ${fase2.model}: ${fase2.seconds.toFixed(0)}s, $${fase2.cost.toFixed(4)}, ` +
          `${ricerche} ricerche, ${prezziGrezzi.length} prezzi`,
      );
    }
  } catch (err) {
    // Senza prezzi la lista resta utile: molto meglio di un errore.
    console.warn("[prezzi] ricerca fallita, restituisco la lista senza prezzi:", err);
  }

  /* IL CATALOGO, ACCANTO AL MOTORE E NON AL SUO POSTO.
     -------------------------------------------------
     Il motore cerca su tutto il web e trova insegne che noi non conosciamo; il
     catalogo conosce poche insegne ma i suoi indirizzi vengono dalle sitemap
     che i negozi pubblicano, quindi ESISTONO — non c'e' modo che diano 404.
     Sono due forze diverse e si sommano: nessuna delle due esclude l'altra, e
     il confronto fra insegne che viene dopo le mette in fila per prezzo senza
     sapere da dove arrivano.

     Misurato il 15 settembre sulla lista vera di diciotto voci, solo Carrefour:
     quattordici prodotti con link e prezzo veri, zero indirizzi morti.

     Non lancia mai: se la sitemap non si scarica, si prosegue con quello che
     il motore ha trovato, che e' esattamente il comportamento di prima. */
  /* Solo per le altre strade: con `fonte=catalogo` il catalogo italiano e'
     gia' girato insieme al nostro, li' sopra, e rifarlo qui lo raddoppierebbe. */
  if (fonte !== "catalogo") {
    try {
      const dalCatalogo = await prezziDaiCataloghiIT(items, paeseIso(country).toUpperCase(), currency, city);
      if (dalCatalogo.length) {
        prezziGrezzi = [...dalCatalogo, ...prezziGrezzi];
      }
    } catch (err) {
      console.warn("[catalogo] non disponibile, proseguo col solo motore:", err);
    }
  }

  /* AMAZON NON SI CERCA QUI
     Un credito per prodotto: su una lista da diciotto voci sarebbero diciotto
     crediti a generazione, e i cento gratuiti finirebbero in cinque piani.
     Cercarlo per tutta la lista significa pagare anche i prodotti che nessuno
     guardera' mai.

     Sta invece su /product/amazon, che l'app chiama quando l'utente apre un
     prodotto: un credito per prodotto guardato davvero, e la cache fa si' che
     lo stesso prodotto non si paghi due volte. */

  // Prima del controllo dei link: via cio' che non puo' essere la spesa di una
  // famiglia. Vale per entrambe le strade, perche' il difetto e' lo stesso —
  // un prezzo vero di qualcosa che non e' il prodotto della lista. Farlo qui
  // risparmia anche le richieste HTTP di verifica su righe da buttare.
  const { tenute, scartate } = scartaImplausibili(prezziGrezzi);
  if (scartate > 0) console.info(`[prezzi] ${scartate} righe scartate perche' implausibili`);

  /* LE RIGHE SENZA LINK, QUANDO I LINK LI COSTRUIAMO NOI
     Con LINK_COSTRUITI al modello non chiediamo affatto gli indirizzi: da'
     prodotto, prezzo e negozio, e l'indirizzo lo mette insieme questo server
     dal dominio censito. Quelle righe non hanno niente da aprire, e mandarle
     al verificatore sarebbe assurdo: finirebbero "non raggiungibili" e il
     totale crollerebbe a zero.

     Diventano `pagina-ok`, che e' esattamente cio' che sono: la destinazione
     e' buona — l'abbiamo costruita noi da un dominio verificato — e il prezzo
     e' quello che il modello ha letto cercando, non confermato aprendo la
     scheda. La stessa etichetta che portano da sempre le pagine che si aprono
     ma non dichiarano il prezzo in modo leggibile. */
  const daCostruire = tenute.filter((r) => !r.link);

  /* LE PAGINE GIA' APERTE NON SI RIAPRONO.
     Le righe che vengono dal catalogo hanno il prezzo LETTO dalla loro pagina:
     riaprirla per verificarla significa rifare, uno per uno, un lavoro appena
     fatto — ed era meta' del tempo di quella strada. Passano direttamente come
     "verificato", che e' esattamente cio' che sono. */
  const giaAperte: CheckedRow[] = tenute
    .filter((r) => r.link && (r as { giaVerificato?: boolean }).giaVerificato)
    .map((r) => ({ ...r, verifica: "verificato" as const }));
  if (giaAperte.length > 0) {
    console.info(`[prezzi] ${giaAperte.length} righe gia' verificate dal catalogo: non le riapro`);
  }

  const daAprire = tenute.filter(
    (r) => r.link && !(r as { giaVerificato?: boolean }).giaVerificato,
  );

  const costruite: CheckedRow[] = daCostruire.flatMap((r) => {
    const rip = linkDiRipiego(r.prodotto || r.nome, r.negozio, country);
    if (!rip) return [];
    return [{ ...r, link: "", linkRicerca: rip.url, ricercaSu: rip.negozio, verifica: "pagina-ok" as const }];
  });
  if (costruite.length > 0) {
    console.info(`[prezzi] ${costruite.length} righe con link costruito da noi, senza chiederlo al modello`);
  }

  // Il controllo dei link: gratis, e trasforma "il modello dice" in "l'abbiamo
  // aperto". Dieci per volta, con trenta o quaranta pagine da aprire.
  const aperte = await verifyPrices(daAprire, 10);
  const checked = {
    rows: [...aperte.rows, ...giaAperte, ...costruite],
    verificati: aperte.verificati + giaAperte.length + costruite.length,
    totali: aperte.totali + giaAperte.length + costruite.length,
  };
  console.info(`[prezzi] pagine aperte con esito ${aperte.verificati}/${aperte.totali}`);

  /* NESSUN PRODOTTO SENZA UN POSTO DOVE ANDARE
     Le righe il cui link non si e' aperto tenevano il prezzo ma perdevano il
     modo di comprare: meta' lista senza sbocco. Ora prendono l'indirizzo di
     RICERCA di quel prodotto — sul sito del negozio se lo conosciamo,
     altrimenti su Amazon. Un indirizzo di ricerca si costruisce e non puo'
     dare 404, quindi si apre sempre. */
  let ripieghi = 0;
  const conRipiego = checked.rows.map((r) => {
    if (r.verifica !== "non-raggiungibile") return r;
    const rip = linkDiRipiego(r.prodotto || r.nome, r.negozio, country);
    if (!rip) return r;
    ripieghi++;
    // Il prezzo torna: la riga non e' piu' un vicolo cieco. Resta dichiarata
    // non verificata, perche' la pagina del prodotto non l'abbiamo aperta.
    return { ...r, prezzo: r.prezzo, linkRicerca: rip.url, ricercaSu: rip.negozio };
  });
  if (ripieghi > 0) console.info(`[prezzi] ${ripieghi} righe salvate con la ricerca di ripiego`);

  const righeComplete = conRipiego;

  // Le offerte dello stesso prodotto affiancate, la piu' economica in testa.
  // Le alternative fuori scala si tolgono DOPO il raggruppamento, perche' si
  // giudicano rispetto al prezzo piu' basso dello stesso prodotto.
  const prodotti = togliOutlier(groupByProduct(righeComplete));
  const conAlternative = prodotti.filter((p) => p.offerte.length > 1).length;

  const migliori = prodotti.map((p) => ({
    ...p.offerte[0],
    prodotto: p.prodotto,
    alternative: p.offerte.length - 1,
  }));

  // Vince il negozio piu' economico FRA QUELLI VERIFICABILI: il modello
  // propone, la scelta si fa sui prezzi controllati.
  const confronto = pickBestStore(righeComplete);
  for (const c of confronto.catene) {
    console.info(
      `[prezzi]   ${c.negozio}: ${c.totale} (${c.verificati}/${c.proposti} verificati)` +
        `${c.utilizzabile ? "" : " — scartata, troppi link rotti"}`,
    );
  }

  /* QUANTI PRODOTTI SONO IN PROMOZIONE.
     Contava solo `risparmio`, che e' l'importo risparmiato, e lo scrive solo
     chi legge lo sconto dalla pagina. Le insegne interrogate via API la
     promozione la dichiarano in un altro modo — listino barrato e percentuale —
     e quelle righe non venivano contate: la risposta conteneva uno sconto del
     30% e il riepilogo diceva "0 in promozione". Chi legge solo il riepilogo
     concludeva che non ci fossero offerte, e ce n'erano.
     Ora si guarda la promozione da qualunque parte arrivi. */
  const inPromozione = (r: { risparmio?: number; scontoPercento?: number; prezzoListino?: number; prezzo?: number | null }) =>
    (r.risparmio ?? 0) > 0 ||
    (r.scontoPercento ?? 0) > 0 ||
    (r.prezzoListino != null && r.prezzo != null && r.prezzoListino > r.prezzo);

  const offerte = migliori.filter(inPromozione).length;

  // Nel totale entrano SOLO i prezzi verificati: sommare cio' che non si e'
  // potuto controllare da' un numero sbagliato con l'aria di essere esatto.
  // Il totale prende, per ogni prodotto, il prezzo piu' basso FRA QUELLI
  // VERIFICATI — che puo' non essere quello mostrato in cima all'elenco. I
  // prodotti dove nessun prezzo si e' potuto controllare restano fuori, e
  // l'app dice quanti sono: un conto parziale dichiarato vale piu' di uno
  // completo e inventato.
  const contati = prodotti
    .map((p) => migliorePrezzoVerificato(p))
    .filter((o): o is NonNullable<typeof o> => o !== null);
  // `migliorePrezzoVerificato` restituisce solo righe con un prezzo: il
  // fallback a zero e' per il verificatore di tipi, non per i conti.
  const totale = Math.round(contati.reduce((s, o) => s + (o.prezzo ?? 0), 0) * 100) / 100;

  console.info(
    `[prezzi] ${prodotti.length} prodotti, ${conAlternative} con alternative, ` +
      `${offerte} in promozione — totale al meglio ${totale} ${currency}`,
  );

  annota("prezzi", {
    citta: city,
    paese: country,
    valuta: currency,
    fonte,
    richiesti: items,
    totale,
    secondi: Math.round(secondi),
    costoUsd: Number(costo.toFixed(4)),
    verificati: checked.verificati,
    proposti: checked.totali,
    catene: confronto.catene,
    // Tutte le offerte per prodotto: e' la parte che serve a capire cosa ha
    // visto davvero l'utente.
    prodotti: prodotti.map((p) => ({
      prodotto: p.prodotto,
      differenza: p.differenza,
      offerte: p.offerte.map((o) => ({
        negozio: o.negozio,
        nome: o.nome,
        prezzo: o.prezzo,
        verifica: o.verifica,
        link: o.link || null,
        linkRicerca: o.linkRicerca ?? null,
        sconto: o.scontoPercento ?? null,
      })),
    })),
  });

  return {
    prezzi: migliori,
    prodotti,
    nonRaggiungibili,
    catene: confronto.catene,
    vincitore: confronto.vincitore,
    risparmioVsPiuCara: confronto.risparmio,
    totali: {
      spesaAlMiglioPrezzo: totale,
      valuta: currency,
      prodottiSenzaPrezzo: Math.max(0, items.length - contati.length),
      prodottiPrezzoVerificato: contati.length,
      vociInLista: items.length,
    },
    meta: {
      /* CHI HA TROVATO QUESTI PREZZI, DAVVERO.
         Con il catalogo nostro il modello non c'entra niente: gli indirizzi
         vengono dalle sitemap dei negozi e i prezzi si leggono aprendo la
         pagina. Dichiarare il nome del modello era comodo — c'era una riga
         sola — ma diceva una cosa falsa proprio nel campo che si guarda per
         sapere di chi fidarsi. */
      motorePrezzi:
        fonte === "catalogo"
          ? "catalogo proprietario (sitemap + lettura della pagina)"
          : fonte === "serpapi"
            ? "Google Shopping (SerpAPI)"
            : GROUNDED_MODEL,
      fontePrezzi: fonte,
      secondiPrezzi: Math.round(secondi),
      ricerche,
      // Se e' falso, i prezzi vengono dalla memoria del modello: va detto.
      ricercaEffettuata: hacercato,
      costoStimatoUsd: Number(costo.toFixed(4)),
      prezziVerificati: checked.verificati,
      prezziTotali: checked.totali,
      insegneConfrontate: confronto.catene.length,
      prodottiConAlternative: conAlternative,
      prodottiInOfferta: offerte,
      generatoIl: new Date().toISOString(),
    },
  };
}

/**
 * Fase 1 da sola: menu', ricette e lista della spesa.
 *
 * PERCHE' DUE ENDPOINT E NON UNO
 * ------------------------------
 * Perche' iOS chiude ogni richiesta di rete dopo SESSANTA SECONDI, e nessun
 * timeout applicativo puo' allungarli. Il piano completo, quando la ricerca
 * prezzi e' lenta, ne impiega 63-65: il telefono taglia la connessione, l'app
 * ripiega sul motore senza prezzi e l'utente vede una lista di trattini —
 * mentre il server, ignaro, finisce il lavoro e risponde a nessuno.
 *
 * Spezzando in due, nessuna delle due richieste si avvicina al muro: il menu'
 * arriva in una decina di secondi, i prezzi in venti o trenta.
 *
 * C'e' un guadagno oltre alla robustezza: l'app puo' mostrare il menu' appena
 * arriva, invece di tenere l'utente su una schermata di attesa per un minuto.
 */
app.post("/ai/menu", async (body) => {
  const data = parse(GroundedInput, body);
  if (!isConfigured()) throw new HttpError(503, "Servizio AI non configurato su questo ambiente");

  const key = cacheKey("menu", data);
  const local = memoryGet(key);
  if (local !== undefined) {
    console.info(`[cache] HIT memoria ${key}`);
    return local;
  }
  if (isDbConfigured()) {
    try {
      const hit = await dallaCache(key);
      if (hit !== undefined) {
        memorySet(key, hit);
        return hit;
      }
    } catch {
      /* cache irraggiungibile: si prosegue */
    }
  }

  fermatiSePieno("app");
  recordUse("gemini");
  const fase1 = await generateMenu(data);
  recordCost(fase1.cost, "app");
  console.info(
    `[menu] ${fase1.model}: ${fase1.seconds.toFixed(0)}s, $${fase1.cost.toFixed(4)}, ` +
      `${fase1.data.menu.length} giorni, ${fase1.data.lista.length} voci`,
  );

  annota("menu", {
    richiesta: data,
    giorni: fase1.data.menu.length,
    lista: fase1.data.lista,
    secondi: Math.round(fase1.seconds),
  });

  const result = {
    ...fase1.data,
    meta: {
      motoreMenu: fase1.model,
      secondiMenu: Math.round(fase1.seconds),
      costoStimatoUsd: Number(fase1.cost.toFixed(4)),
      generatoIl: new Date().toISOString(),
    },
  };

  memorySet(key, result);
  if (isDbConfigured()) {
    try {
      await (await cache(key)).insertOne({
        _id: key,
        value: result,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + CACHE_TTL_DAYS * 86_400_000),
      });
    } catch {
      /* gia' presente */
    }
  }
  return result;
});

/**
 * FLUSSO ALTERNATIVO, primo passo: la sola lista della spesa.
 *
 * Serve alla strada "spesa-prima", quella che il cliente ha chiesto in
 * riunione: prima si guarda cosa si puo' comprare, poi si decide cosa
 * cucinare. Qui si produce solo la lista, senza menu'.
 */
app.post("/ai/lista", async (body) => {
  const data = parse(GroundedInput, body);
  if (!isConfigured()) throw new HttpError(503, "Servizio AI non configurato su questo ambiente");

  const key = cacheKey("lista", data);
  const local = memoryGet(key);
  if (local !== undefined) {
    console.info(`[cache] HIT memoria ${key}`);
    return local;
  }

  fermatiSePieno("app");
  recordUse("gemini");
  const fase = await generateListaSpesa(data);
  recordCost(fase.cost, "app");
  console.info(
    `[lista] ${fase.model}: ${fase.seconds.toFixed(0)}s, $${fase.cost.toFixed(4)}, ` +
      `${fase.data.lista.length} voci`,
  );

  annota("lista", { richiesta: data, lista: fase.data.lista, secondi: Math.round(fase.seconds) });

  const result = {
    ...fase.data,
    meta: {
      motoreMenu: fase.model,
      secondiMenu: Math.round(fase.seconds),
      costoStimatoUsd: Number(fase.cost.toFixed(4)),
      generatoIl: new Date().toISOString(),
    },
  };
  memorySet(key, result);
  return result;
});

const MenuDaProdottiInput = GroundedInput.extend({
  /** I prodotti che hanno superato la verifica: il menù nasce solo da questi. */
  disponibili: z.array(z.string().max(160)).min(1).max(40),
});

/**
 * FLUSSO ALTERNATIVO, terzo passo: il menu' costruito sui prodotti comprabili.
 *
 * Riceve solo cio' che ha superato la verifica — prezzo trovato e pagina che
 * si apre — e ci costruisce sopra i pasti. Il vincolo e' severo di proposito:
 * e' tutto il senso di questa strada. Se il modello potesse aggiungere
 * ingredienti, il piano tornerebbe a contenere cose non comprabili e le due
 * strade diventerebbero la stessa.
 */
app.post("/ai/menu-da-prodotti", async (body) => {
  const data = parse(MenuDaProdottiInput, body);
  if (!isConfigured()) throw new HttpError(503, "Servizio AI non configurato su questo ambiente");

  const key = cacheKey("menu-da-prodotti", data);
  const local = memoryGet(key);
  if (local !== undefined) {
    console.info(`[cache] HIT memoria ${key}`);
    return local;
  }

  fermatiSePieno("app");
  recordUse("gemini");
  const fase = await generateMenuDaProdotti(data, data.disponibili);
  recordCost(fase.cost, "app");
  console.info(
    `[menu-da-prodotti] ${fase.model}: ${fase.seconds.toFixed(0)}s, $${fase.cost.toFixed(4)}, ` +
      `${fase.data.menu.length} giorni da ${data.disponibili.length} prodotti comprabili`,
  );

  annota("menu-da-prodotti", {
    richiesta: { ...data, disponibili: undefined },
    disponibili: data.disponibili,
    giorni: fase.data.menu.length,
    secondi: Math.round(fase.seconds),
  });

  const result = {
    ...fase.data,
    meta: {
      motoreMenu: fase.model,
      secondiMenu: Math.round(fase.seconds),
      costoStimatoUsd: Number(fase.cost.toFixed(4)),
      generatoIl: new Date().toISOString(),
    },
  };
  memorySet(key, result);
  return result;
});

const PricesInput = z.object({
  // UN CARATTERE BASTA. In giapponese `塩` e' il sale e `卵` sono le uova:
  // pretendere due caratteri faceva rifiutare l'intera lista di Tokyo con un
  // 400, dopo che il modello l'aveva gia' scritta bene.
  items: z.array(z.string().min(1).max(160)).min(1).max(24),
  city: z.string().max(80).default(""),
  country: z.string().max(40).default("Italia"),
  currency: z.string().min(3).max(3).default("EUR"),
  priceSource: z.enum(["ai", "serpapi", "catalogo"]).optional(),
});

/**
 * Fase 2 da sola: prezzi, verifica dei link e confronto fra negozi.
 *
 * Riceve la lista della spesa gia' fatta e restituisce le offerte raggruppate
 * per prodotto, con la piu' economica in testa. E' l'unica fase che si paga.
 */
/**
 * I prezzi di una lista, con la cache.
 *
 * Stava dentro `/ai/prices`. E' uscita perche' adesso la chiamano in due —
 * `/ai/prices`, che risponde come ha sempre risposto, e `/v1/prezzi`, che
 * risponde nella forma del contratto. Sono gli stessi dati: duplicarli
 * vorrebbe dire pagarli due volte e, peggio, vederli divergere il giorno che
 * qualcuno sistema una sola delle due copie.
 *
 * La chiave della cache NON include la forma: chi chiede la stessa lista su
 * `/v1/prezzi` riusa quel che ha gia' pagato `/ai/prices`, e viceversa.
 */
async function prezziDiLista(data: z.infer<typeof PricesInput>) {
  const fonte = data.priceSource ?? PRICE_SOURCE_DEFAULT;

  /* LA RISPOSTA NON PUO' VIVERE PIU' A LUNGO DEL PREZZO CHE CONTIENE.
     La cache delle risposte si guarda PRIMA del magazzino, quindi una lista
     gia' chiesta tornava identica per giorni — con i prezzi di allora e
     scavalcando del tutto la regola di freschezza del magazzino. Su un'app che
     promette prezzi veri e' la bugia peggiore, perche' e' invisibile: la
     risposta e' ben formata, i link funzionano, solo le cifre sono di un'altra
     settimana. Ora scade insieme ai prezzi. */
  /* NELLA CHIAVE VA ANCHE COME E' STATA CALCOLATA.
     Senza, la stessa lista chiesta con la scelta del modello accesa e spenta
     divide la stessa voce di cache — e la seconda riceve la risposta della
     prima. Si e' visto misurando: due servizi identici tranne
     `SCELTA_MODELLO` davano risultati identici su tutte e ottanta le prove,
     errore per errore. Sembrava una scoperta, ed era la cache.

     In produzione e' peggio che in una prova: vuol dire servire sotto
     un'impostazione una risposta calcolata sotto un'altra. */
  const key = cacheKey("prices", {
    ...data,
    priceSource: fonte,
    sceltaModello: process.env.SCELTA_MODELLO !== "no",
  });
  const local = memoryGet(key);
  if (local !== undefined) {
    console.info(`[cache] HIT memoria ${key}`);
    return local;
  }
  if (isDbConfigured()) {
    try {
      const hit = await dallaCache(key);
      if (hit !== undefined) {
        /* SI DICE ANCHE QUANDO ARRIVA DAL DATABASE.
           Questa riga non c'era, e quella di memoria si': una risposta che
           arriva dal database non lasciava traccia. Misurando due strade
           diverse sembravano dare lo stesso risultato ottanta volte su
           ottanta — ed era la cache che rispondeva per tutte e due, senza
           dirlo. Una cache silenziosa e' il modo piu' facile di misurare
           una cosa e crederne un'altra. */
        console.info(`[cache] HIT database ${key}`);
        memorySet(key, hit);
        return hit;
      }
    } catch {
      /* cache irraggiungibile */
    }
  }

  /* L'API cede per ultima: se si ferma lei si e' fermato il prodotto. Quindi
     qui pesa solo il tetto complessivo, non quello dell'app. */
  fermatiSePieno("api");

  const esito = await prezzaLista(data.items, data.city, data.country, data.currency, fonte);

  /* UNA RISPOSTA VUOTA NON SI SALVA.
     Il catalogo di un paese sono duecentomila prodotti che si caricano dal
     database, e nei primi secondi dopo un riavvio non c'e' ancora. Chi chiede
     in quel momento riceve una risposta ben formata e vuota — e' voluto, si
     preferisce rispondere magri che far aspettare un minuto.
     Quello che NON era voluto e' che quella risposta finisse in cache per
     ventiquattro ore: un attimo di freddo avvelenava un giorno intero, e
     ogni richiesta successiva per quella lista continuava a dire «nessun
     negozio ha questo prodotto» mentre il catalogo era li', pieno.

     Misurato: lanciando una misura diciotto secondi dopo un riavvio, Italia,
     Regno Unito e Germania davano zero su quaranta. Non era la ricerca, non
     era il modello: era la cache che ripeteva un vuoto di diciotto secondi
     prima.

     Su Render conta il doppio, perche' il piano gratuito si spegne e riparte
     di continuo: e' esattamente la condizione in cui questo succede. */
  /* SI GUARDA QUELLO CHE L'UTENTE RICEVE, non quello che abbiamo raccolto.
     La prima versione di questa guardia controllava `prezzi`, cioe' le righe
     grezze. Ma fra quelle e la risposta c'e' il raggruppamento, che ne scarta
     — una riga senza prezzo e senza un link che si apra non e' un'offerta — e
     quando ne scartava TUTTE la risposta usciva vuota con `prezzi` pieno: la
     guardia la lasciava passare e il vuoto finiva in cache per ventiquattro
     ore.

     Si e' visto sbattendoci contro per un'ora: la stessa lista di venti voci
     dava ottanta offerte appena calcolata e zero un minuto dopo, e sembrava
     che il motore si rompesse a intermittenza. Era la cache che ripeteva un
     vuoto di prima.

     Adesso si guarda `prodotti`, che e' cio' che diventa la risposta. */
  const utile = (esito.prodotti?.length ?? 0) > 0;

  if (utile) {
    /* Scade insieme ai prezzi che contiene — ventiquattro ore, la stessa
       soglia del magazzino. Erano sette giorni, ed erano sette di troppo: la
       risposta salvata si serve PRIMA del magazzino, quindi quella durata piu'
       lunga non aggiungeva velocita', copriva soltanto la freschezza. */
    memorySet(key, esito, FRESCHEZZA_MS);
    if (isDbConfigured()) {
      try {
        await (await cache(key)).insertOne({
          _id: key,
          value: esito,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + FRESCHEZZA_MS),
        });
      } catch {
        /* gia' presente */
      }
    }
  } else {
    console.warn(
      `[cache] risposta vuota per ${data.items.length} voci in ${data.country}: ` +
        `NON la salvo, cosi' la prossima richiesta riprova invece di ripetere il vuoto`,
    );
  }

  return esito;
}

app.post("/ai/prices", async (body) => prezziDiLista(parse(PricesInput, body)));

/**
 * Piano completo in una richiesta sola: menu' + prezzi.
 *
 * Comodo per gli script di prova e per chi non ha il limite dei sessanta
 * secondi di iOS. L'app usa invece `/ai/menu` e `/ai/prices` separati, perche'
 * su telefono una richiesta lunga viene tagliata dal sistema.
 */
app.post("/ai/plan-full", async (body) => {
  const data = parse(GroundedInput, body);
  if (!isConfigured()) throw new HttpError(503, "Servizio AI non configurato su questo ambiente");

  const fonte = data.priceSource ?? PRICE_SOURCE_DEFAULT;
  // La fonte entra nella chiave: le due strade non devono servirsi a vicenda
  // le risposte dalla cache.
  const key = cacheKey("plan-full", { ...data, priceSource: fonte });

  const local = memoryGet(key);
  if (local !== undefined) {
    console.info(`[cache] HIT memoria ${key}`);
    return local;
  }
  if (isDbConfigured()) {
    try {
      const hit = await dallaCache(key);
      if (hit !== undefined) {
        console.info(`[cache] HIT database ${key}`);
        memorySet(key, hit);
        return hit;
      }
    } catch (err) {
      console.warn("[cache] lettura fallita, proseguo senza:", err);
    }
  }

  fermatiSePieno("app");
  recordUse("gemini");
  const fase1 = await generateMenu(data);
  recordCost(fase1.cost, "app");
  console.info(
    `[plan-full] fase 1 ${fase1.model}: ${fase1.seconds.toFixed(0)}s, ` +
      `$${fase1.cost.toFixed(4)}, ${fase1.data.menu.length} giorni, ` +
      `${fase1.data.lista.length} voci in lista`,
  );

  const items = fase1.data.lista.map((v) => `${v.nome} ${v.quantita}`.trim()).slice(0, 18);
  const prezzi = await prezzaLista(items, data.city, data.country, data.currency, fonte);

  const result = {
    ...fase1.data,
    ...prezzi,
    totali: { ...prezzi.totali, budget: data.budget },
    meta: {
      ...prezzi.meta,
      motoreMenu: fase1.model,
      secondiMenu: Math.round(fase1.seconds),
      secondi: Math.round(fase1.seconds + prezzi.meta.secondiPrezzi),
      costoStimatoUsd: Number((fase1.cost + prezzi.meta.costoStimatoUsd).toFixed(4)),
    },
  };

  memorySet(key, result);
  if (isDbConfigured()) {
    try {
      await (await cache(key)).insertOne({
        _id: key,
        value: result,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      });
    } catch {
      /* chiave gia' presente per una richiesta concorrente: va bene cosi' */
    }
  }
  return result;
});

/* ─────────────────── Amazon, su richiesta dell'utente ─────────────────── */

const AmazonInput = z.object({
  query: z.string().min(2).max(140),
  country: z.string().max(40).default("Italia"),
  limit: z.number().min(1).max(6).default(3),
});

/**
 * Prodotti Amazon veri per UN prodotto, quando l'utente lo chiede.
 *
 * PERCHE' AL TOCCO E NON SU TUTTA LA LISTA
 * Si paga un credito per ricerca. Su una lista da diciotto voci sarebbero
 * diciotto crediti a generazione, e i cento gratuiti finirebbero in cinque
 * piani — pagando anche i prodotti che nessuno guardera' mai. Al tocco invece
 * gli stessi cento crediti valgono cento consultazioni, ed e' l'utente a
 * decidere quali gli interessano.
 *
 * La cache e' condivisa fra tutti: due persone che aprono "passata di
 * pomodoro" in Italia consumano un credito solo. Con un catalogo che cambia
 * poco di giorno in giorno e' cio' che rende sostenibile l'intera funzione.
 */
app.post("/product/amazon", async (body) => {
  const data = parse(AmazonInput, body);
  if (!isAmazonSearchConfigured()) {
    // 503 e non 500: e' uno stato di configurazione previsto, e il client lo
    // traduce in "non disponibile" invece che in un errore.
    throw new HttpError(503, "Ricerca Amazon non configurata su questo ambiente");
  }

  const paese = paeseIso(data.country).toUpperCase();
  const key = cacheKey("amazon", { q: data.query.toLowerCase().trim(), paese, n: data.limit });

  const local = memoryGet(key);
  if (local !== undefined) {
    console.info(`[cache] HIT memoria ${key} — nessun credito consumato`);
    return local;
  }
  if (isDbConfigured()) {
    try {
      const hit = await dallaCache(key);
      if (hit !== undefined) {
        memorySet(key, hit);
        console.info(`[cache] HIT database ${key} — nessun credito consumato`);
        return hit;
      }
    } catch {
      /* cache irraggiungibile: si prosegue */
    }
  }

  const t0 = Date.now();
  const offerte = await cercaProdottoAmazon(data.query, paese, data.limit);
  console.info(
    `[amazon] "${data.query.slice(0, 40)}" — ${offerte.length} offerte in ` +
      `${((Date.now() - t0) / 1000).toFixed(0)}s, 1 credito`,
  );

  const risultato = { ok: offerte.length > 0, offerte };

  // Si mette in cache solo un esito positivo: un "niente trovato" oggi puo'
  // diventare un risultato domani, e il credito e' comunque gia' speso.
  if (offerte.length > 0) {
    memorySet(key, risultato);
    if (isDbConfigured()) {
      try {
        await (await cache(key)).insertOne({
          _id: key,
          value: risultato,
          createdAt: new Date(),
          // Tre giorni: i prezzi Amazon cambiano spesso, ma non ogni ora.
          expiresAt: new Date(Date.now() + 3 * 86_400_000),
        });
      } catch {
        /* chiave gia' presente */
      }
    }
  }
  return risultato;
});

/* ───────────────────── Prezzo reale del prodotto ───────────────────── */

const ShoppingInput = z.object({
  query: z.string().min(2).max(120),
  country: z.string().max(2).default("IT"),
  // Il client filtra severamente (prezzo plausibile, titolo, venditore
  // riconosciuto): servono righe grezze in abbondanza per averne abbastanza
  // di buone dopo gli sbarramenti.
  limit: z.number().min(1).max(20).default(10),
});

/**
 * Prezzo e link reali di UN prodotto, su richiesta dell'utente.
 *
 * Si paga a ricerca, quindi passa dalla stessa cache degli endpoint AI: due
 * utenti che cercano lo stesso prodotto nello stesso paese consumano una
 * ricerca sola. Con la chiave gratuita (250/mese) questo e' cio' che rende
 * l'endpoint utilizzabile in una dimostrazione.
 */
app.post("/product/shopping", async (body) => {
  const data = parse(ShoppingInput, body);
  if (!isShoppingConfigured()) {
    // 503 e non 500: e' uno stato di configurazione previsto, e il client
    // lo traduce in "prezzo non verificabile" invece che in un errore.
    throw new HttpError(503, "Ricerca prodotti non configurata su questo ambiente");
  }

  const key = cacheKey("shopping", data);
  const local = memoryGet(key);
  if (local !== undefined) {
    console.info(`[cache] HIT memoria ${key}`);
    return local;
  }
  if (isDbConfigured()) {
    try {
      const hit = await dallaCache(key);
      if (hit !== undefined) {
        memorySet(key, hit);
        return hit;
      }
    } catch {
      /* cache irraggiungibile: si prosegue */
    }
  }

  recordUse("serpapi");
  const result = await searchShopping(data.query, data.country, data.limit);

  // Si mette in cache solo un esito positivo: un "nessun risultato" oggi puo'
  // diventare un risultato domani, e non vale la pena congelarlo per 30 giorni.
  if (result.ok) {
    memorySet(key, result);
    if (isDbConfigured()) {
      try {
        await (await cache(key)).insertOne({
          _id: key,
          value: result,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
        });
      } catch {
        /* chiave gia' presente */
      }
    }
  }
  return result;
});

/* ─────────────────────────────── Avvio ─────────────────────────────── */

/**
 * Rete di sicurezza.
 *
 * Un errore non gestito da qualche parte nel codice asincrono fa terminare il
 * processo Node, e con esso il backend: durante una sessione di prove significa
 * che la prima richiesta strana fa cadere tutte quelle dopo, che falliscono con
 * "connessione rifiutata" senza spiegazione. E' successo provando i paesi
 * stranieri, dove il piano francese ha portato giu' anche Spagna, Olanda e
 * Germania, che non sono nemmeno partite.
 *
 * Meglio annotare e restare in piedi: una singola richiesta persa e' molto meno
 * grave di un servizio spento.
 */

/* ═══════════════════ IL CATALOGO DEI PRODOTTI ═══════════════════ */

/**
 * Il catalogo che ci costruiamo noi, esposto come API.
 *
 * DA DOVE VIENE. I supermercati pubblicano l'elenco completo delle loro schede
 * prodotto in `sitemap.xml`, per farsi trovare dai motori di ricerca. Noi lo
 * scarichiamo una volta al giorno e lo teniamo indicizzato: indirizzi VERI,
 * scritti dal negozio, che non possono essere sbagliati.
 *
 * A COSA SERVE. A togliere al modello il lavoro in cui e' incapace. Finora gli
 * chiedevamo due cose insieme — quale prodotto e a quale indirizzo — e la
 * seconda se la inventava: Cortilia 0 pagine aperte su 12, Eataly 0 su 4.
 * Con il catalogo l'indirizzo non glielo chiediamo piu'.
 *
 * QUESTE ROTTE NON COSTANO NIENTE: nessuna chiamata al modello, nessuna quota.
 */

/** Cosa copriamo, e cosa e' pronto adesso. */
app.get("/catalogo/stato", async () => ({
  ...statoCatalogo(),
  quantiPaesi: paesiConCatalogo().length,
  /* Quante schede abbiamo gia' letto e quante valgono ancora.
     Serve a vedere il magazzino riempirsi: finche' `fresche` e' zero ogni
     richiesta riapre le pagine, e la lentezza ha una spiegazione invece di
     essere un mistero. */
  magazzinoPrezzi: await statoMagazzino(),
  magazzinoCataloghi: await statoCataloghi(),
  /* Il dizionario della spesa: quante parole conosce a memoria e quante ne ha
     imparate strada facendo. Se le imparate crescono in fretta vuol dire che
     manca qualcosa in `vocabolario.ts`, ed e' li' che bisogna guardare. */
  vocabolario: { ...statoVocabolario(), imparate: quanteImparate() },
}));


/* ══════════════════════════════════════════════════════════════════════════
   /v1 — L'API, con un contratto

   PERCHE' UN NUMERO DI VERSIONE
   -----------------------------
   Senza, il giorno che cambiamo la forma di una risposta si rompe chi ci sta
   sopra, e non ha modo di restare indietro mentre si adegua. Con, ha due
   scelte: adeguarsi quando vuole, o restare su `/v1` finche' gli pare. E noi
   possiamo riordinare tutto quel che c'e' dentro senza chiedere permesso a
   nessuno — che e' esattamente cio' che stiamo per fare.

   E I NOMI DICONO COSA DANNO, NON COME SONO FATTI DENTRO
   ------------------------------------------------------
   `/ai/prices` raccontava l'implementazione: che ci fosse un modello sotto era
   un dettaglio nostro, e infatti sta per non essere piu' vero. `/v1/prezzi`
   dice cosa serve a chi chiama.

   LE VECCHIE RESTANO
   ------------------
   Ogni rotta di prima continua a rispondere esattamente come prima. L'app in
   preview non si accorge di niente, e si sposta quando le conviene. Il giorno
   che non le chiama piu' nessuno — lo dira' il conteggio per chiave — si
   tolgono.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * La porta dell'API.
 *
 * Si chiama in cima a ogni rotta `/v1`. Le rotte VECCHIE restano aperte: e'
 * l'unico modo perche' la preview e l'app che gira adesso non si accorgano di
 * niente. Si chiuderanno quando l'app sara' passata a `/v1`, e a dire che e'
 * passata sara' il conteggio per chiave, non un'impressione.
 *
 * `costa` distingue le rotte che consumano — i prezzi, che aprono pagine e
 * pagano il modello — da quelle che leggono e basta. Solo le prime pretendono
 * una chiave segreta: una chiave dentro un'app non e' segreta, e i prezzi sono
 * la cosa che vendiamo.
 */
async function apriLaPorta(
  req: unknown,
  costa: boolean,
  /** Lo stato non pesa sul tetto: serve proprio a chi il tetto l'ha finito. */
  pesaSulTetto = true,
): Promise<void> {
  /* DUE POSTI DOVE GUARDARE, e non e' un vezzo.
     `Authorization` nell'app di MealMint porta gia' il token dell'UTENTE, che
     serve alle liste salvate. Se ci mettesse anche la chiave dell'API una
     delle due dovrebbe sloggiare, e sarebbe l'utente a perderci.

     Quindi la chiave si accetta anche da `X-Api-Key`. Chi chiama da un server
     — che utenti non ne ha — continua a usare `Authorization: Bearer`, che e'
     la forma che si aspetta chiunque. */
  const h = (req as { headers?: Record<string, unknown> })?.headers ?? {};
  const daHeader = (nome: string) => (typeof h[nome] === "string" ? (h[nome] as string) : undefined);
  const esito = await controllaChiave(
    daHeader("x-api-key") ?? daHeader("authorization"),
    costa,
    pesaSulTetto,
  );
  if (!esito.ok) throw new HttpError(esito.stato ?? 401, esito.motivo ?? "Chiave richiesta");
}

app.post("/v1/prezzi", async (body, req) => {
  await apriLaPorta(req, true);
  const data = parse(PricesInput, body);
  const iso = paeseIso(data.country).toUpperCase();

  /* Si riusa la stessa strada di `/ai/prices`, cache compresa: sono gli stessi
     dati, e farne due copie vorrebbe dire pagarli due volte e vederli
     divergere. Cambia solo la forma in cui escono. */
  const dentro = (await prezziDiLista(data)) as Parameters<typeof rispostaPrezziV1>[0];

  return rispostaPrezziV1(
    dentro,
    data.items,
    iso,
    data.currency,
    paesiConCatalogo().includes(iso),
  );
});

app.post("/v1/prodotti", async (body, req) => {
  await apriLaPorta(req, false);
  const data = parse(CercaCatalogo, body);
  const iso = paeseIso(data.paese).toUpperCase();
  const trovati = await cercaNelCatalogo(iso, data.q, data.quanti);
  return {
    richiesta: data.q,
    paese: iso,
    coperto: paesiConCatalogo().includes(iso),
    prodotti: trovati.map((t) => ({
      insegna: t.insegna,
      nome: t.nome,
      link: t.url,
    })),
  };
});

app.post("/v1/negozi", async (body, req) => {
  await apriLaPorta(req, false);
  const data = parse(NegoziInput, body);
  const iso = paeseIso(data.paese).toUpperCase();
  const negozi = data.citta ? await negoziInCitta(iso, data.citta) : await tuttiINegozi(iso);
  return {
    paese: iso,
    citta: data.citta || null,
    negozi,
  };
});

/**
 * Cosa copriamo, detto per intero — anche quando e' brutto.
 *
 * Chi valuta se comprare l'API deve poterlo sapere prima, non scoprirlo con
 * una lista della spesa che torna mezza vuota. La Germania oggi ha sei fonti
 * su undici che non sono supermercati, e sta scritto qui.
 */
app.get("/v1/copertura", async (_body, req) => {
  await apriLaPorta(req, false);
  return ({
  paesi: paesiConCatalogo(),
  quantiPaesi: paesiConCatalogo().length,
  catalogo: statoCatalogo(),
  magazzinoPrezzi: await statoMagazzino(),
  magazzinoCataloghi: await statoCataloghi(),
  vocabolario: { ...statoVocabolario(), imparate: quanteImparate() },
  });
});

app.get("/v1/stato", async (_body, req) => {
  await apriLaPorta(req, false, false);
  return ({
  ok: true,
  /* La verita' sul modello, non «c'e' una chiave scritta». Resta qui anche
     quando l'IA sara' uscita dalla strada dei prezzi: serve a sapere se il
     servizio accanto e' vivo. */
  ia: saluteIA(),
  database: isDbConfigured(),
  spesa: spendStatus(),
  quota: quotaStatus(),
  // Quante chiamate ha fatto oggi ogni chiave: e' quel che serve a fatturare.
  consumo: consumoDiOggi(),
  });
});

/* ─────────────────────────── I punti vendita ─────────────────────────── */

/**
 * Dove si compra: i negozi, non i prezzi.
 *
 * Tenuti separati dai prezzi di proposito. Il listino e' dell'INSEGNA — sei
 * Eurospin da Milano a Palermo danno tutti 1,19 € sullo stesso prodotto — e il
 * negozio e' il TUO. Mescolarli porterebbe ad attaccare lo sconto di un punto
 * vendita all'indirizzo di un altro, che e' un prezzo vero nel posto sbagliato.
 *
 * Con `citta` risponde anche a una domanda piu' utile: QUALI INSEGNE ti servono
 * davvero li'. E' cio' che permette di non mostrare a chi sta a Milano il
 * listino di una cooperativa toscana, che sullo stesso limone biologico
 * differisce del 55%.
 */
const NegoziInput = z.object({
  paese: z.string().max(40).default("Italia"),
  citta: z.string().max(80).default(""),
});

app.post("/negozi", async (body) => {
  const data = parse(NegoziInput, body);
  const iso = paeseIso(data.paese).toUpperCase();

  if (!data.citta) {
    const negozi = await tuttiINegozi(iso);
    return {
      paese: iso,
      citta: null,
      insegne: [...new Set(negozi.map((n) => n.insegna))],
      quanti: negozi.length,
      negozi,
    };
  }

  const esito = await negoziInCitta(iso, data.citta);
  return {
    paese: iso,
    citta: esito.citta,
    insegne: esito.insegne,
    quanti: esito.negozi.length,
    negozi: esito.negozi,
  };
});

/** Quanti punti vendita conosciamo, insegna per insegna. */
app.get("/negozi/stato", async () => statoNegozi("IT"));

const CercaCatalogo = z.object({
  q: z.string().min(1).max(160),
  paese: z.string().max(40).default("Italia"),
  quanti: z.number().int().min(1).max(20).default(5),
});

/**
 * Cerca un prodotto nel catalogo di un paese.
 *
 * La prima richiesta per un paese scarica il suo catalogo e puo' prendere
 * qualche decina di secondi; le successive rispondono in millisecondi.
 */
app.post("/catalogo/cerca", async (body) => {
  const data = parse(CercaCatalogo, body);
  const iso = paeseIso(data.paese).toUpperCase();

  const trovati = await cercaNelCatalogo(iso, data.q, data.quanti);
  return {
    paese: iso,
    richiesta: data.q,
    trovati,
    // Se e' vuoto, chi chiama deve sapere se e' perche' non copriamo quel
    // paese o perche' li' quel prodotto non c'e': sono due cose diverse.
    paeseCoperto: paesiConCatalogo().includes(iso),
  };
});

/** Rifa' il catalogo adesso, senza aspettare mezzanotte. */
app.post("/catalogo/aggiorna", async (body) => {
  const data = parse(z.object({ svuota: z.boolean().default(false) }), body ?? {});
  if (data.svuota) svuotaCatalogo();
  // Non si aspetta: il lavoro sono decine di megabyte e chi chiama non deve
  // restare appeso. Lo stato si guarda da /catalogo/stato.
  void aggiornaCatalogo("richiesto a mano");
  return { avviato: true, stato: statoCatalogo() };
});

process.on("unhandledRejection", (reason) => {
  console.error("[server] promessa non gestita, resto in piedi:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[server] eccezione non gestita, resto in piedi:", err);
});


/* ══════════════════════════════════════════════════════════════════════════
   DOVE I DUE BLOCCHI SI DANNO LA MANO

   `api/` non importa niente da `app/` — lo verifica il build, e da oggi e'
   vero senza eccezioni. Ma l'API una cosa dall'app la vorrebbe: quando il
   dizionario della spesa incontra una parola che non conosce, qualcuno che
   gliela traduca.

   Invece di andarsela a prendere, la dichiara e aspetta. Qui gliela diamo.

   E' l'unico punto del programma in cui i due blocchi si toccano, ed e' in
   radice — cioe' fuori da tutti e due. Staccando `api/` questo file non parte
   con lei, e l'API funziona lo stesso: senza traduttore, con il dizionario da
   solo, che copre la stragrande maggioranza delle liste.
   ══════════════════════════════════════════════════════════════════════════ */

collegaTraduttore(async (parole, lingua) => {
  const prompt =
    `Come si chiamano queste cose al supermercato in ${lingua}? Il nome ` +
    `commerciale, quello scritto sullo scaffale, non la traduzione letterale: ` +
    `«funghi» in inglese e' "mushrooms", non "fungi".
` +
    `Una parola o due per voce, minuscolo, stesso ordine, stessa lunghezza. ` +
    `Solo JSON:
{"tradotte":["...","..."]}

${JSON.stringify(parole)}`;

  try {
    const r = await chiamaMenu(MENU_MODEL, prompt, 45_000);
    recordCost(r.cost, "api");
    const dati = parseJson(r.text) as { tradotte?: unknown };
    const fuori = dati.tradotte;
    if (!Array.isArray(fuori) || fuori.length !== parole.length) return null;
    return fuori.map((x) => (typeof x === "string" ? x : ""));
  } catch (err) {
    /* Non si rilancia: chi ha chiesto sta gia' rispondendo a qualcuno, e una
       traduzione mancata non deve spegnere il catalogo. `null` vuol dire «non
       ce l'ho fatta», e di la' sanno cosa farne. */
    console.warn("[traduttore] non riuscito, il dizionario fa da solo:", err);
    return null;
  }
});

/* Il selettore NON si collega, ed e' una decisione presa con dei numeri: su
   duecento prove il modello sceglieva 151 volte giusto contro le 157 della
   classifica. Il posto resta perche' il confronto va rifatto quando la ricerca
   cambiera' — si scrive una riga qui e torna com'era. */

const port = Number(process.env.PORT ?? 3000);
if (!isConfigured()) console.warn("ATTENZIONE: GOOGLE_GENERATIVE_AI_API_KEY assente — /ai/* risponde 503.");
if (!isDbConfigured()) console.warn("ATTENZIONE: MONGODB_URI assente — account e piani non disponibili, cache solo in memoria.");
if (!isShoppingConfigured()) console.warn("ATTENZIONE: SERPAPI_KEY assente — /product/shopping risponde 503.");
console.info(`[catalogo] ${paesiConCatalogo().length} paesi con catalogo disponibile`);
avviaCatalogoNotturno();

/**
 * Il servizio si tiene sveglio da solo.
 *
 * PERCHE'
 * -------
 * Render sul piano gratuito spegne un servizio dopo quindici minuti senza
 * traffico. Riaccenderlo e ricaricare duecentomila prodotti dal database costa
 * cinquantacinque secondi misurati — e per chi usa l'app cinquantacinque
 * secondi vuol dire che non funziona niente: la richiesta scade e la lista
 * torna vuota.
 *
 * PERCHE' QUI E NON SU GITHUB
 * ---------------------------
 * C'e' anche un lavoro programmato su GitHub che fa la stessa cosa
 * (`.github/workflows/tieni-sveglio.yml`), ed e' rimasto li' — ma in
 * ottantaquattro minuti non e' mai partito da solo. E' un comportamento noto:
 * i cron appena aggiunti su repo poco trafficati finiscono in fondo alla coda.
 * Su qualcosa che non parte non si costruisce.
 *
 * Questo invece dipende solo da noi: finche' il processo e' vivo, si chiama da
 * solo e resta vivo. Una richiesta al proprio indirizzo pubblico e' traffico
 * in entrata a tutti gli effetti, e il conto dei quindici minuti riparte.
 *
 * COSA NON RISOLVE, E VA DETTO
 * ----------------------------
 * Se il servizio si spegne davvero — un deploy, un riavvio di Render, un
 * momento di rete — non puo' risvegliarsi: un processo spento non chiama
 * nessuno. Li' serve che arrivi qualcuno da fuori, e il primo che arriva
 * aspetta il minuto. Per quello l'unica cura vera sono i sette dollari al mese
 * del piano Starter, che non si spegne affatto.
 *
 * Gira solo su Render, che `RENDER_EXTERNAL_URL` la mette lei: in locale non
 * serve e non parte.
 */
const MIO_INDIRIZZO = process.env.RENDER_EXTERNAL_URL;
if (MIO_INDIRIZZO) {
  /* Dieci minuti: la finestra di Render e' quindici, e cinque di margine
     bastano a coprire una risposta lenta senza raddoppiare le richieste. */
  const OGNI_MS = 10 * 60 * 1000;
  setInterval(() => {
    /* `/health` non apre pagine, non legge prezzi, non costa niente: serve
       solo a far girare il processo. Un errore non si rilancia — se la rete
       balla si riprova fra dieci minuti, e intanto il servizio fa il suo. */
    fetch(`${MIO_INDIRIZZO}/health`, { signal: AbortSignal.timeout(20_000) }).catch(
      (err) => console.warn("[sveglio] il ping a me stesso non e' riuscito:", err?.message ?? err),
    );
  }, OGNI_MS).unref();
  console.info(`[sveglio] mi tengo sveglio da solo ogni 10 minuti (${MIO_INDIRIZZO})`);
}

app.listen(port);
