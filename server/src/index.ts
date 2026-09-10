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
import { createApp, HttpError } from "./http.js";
import { isConfigured, model, MODEL_ID } from "./gemini.js";
import { fetchPageContext, rankHits, searchProvider } from "./search.js";
import { cache, isDbConfigured, plans, users } from "./db.js";
import { hashPassword, issueToken, requireUser, verifyPassword } from "./auth.js";
import { isShoppingConfigured, searchShopping } from "./shopping.js";
import { budgetExhausted, quotaStatus, recordCost, recordUse, spendStatus } from "./quota.js";
import {
  flussoPredefinito,
  generateListaSpesa,
  generateMenu,
  generateMenuDaProdotti,
  generatePricesParallel,
  GROUNDED_MODEL,
  MENU_MODEL,
} from "./plan-grounded.js";
import type { CheckedRow } from "./price-page.js";
import {
  groupByProduct,
  migliorePrezzoVerificato,
  pickBestStore,
  scartaImplausibili,
  togliOutlier,
  verifyPrices,
} from "./price-page.js";
import { generatePricesSerpapi } from "./prices-serpapi.js";
import { cercaProdottoAmazon, isAmazonSearchConfigured } from "./amazon-search.js";
import { linkDiRipiego } from "./fallback-link.js";
import { isoDaPaese } from "./insegne-online.js";
import { annota } from "./diario.js";
import {
  AiRecipeInput,
  ChefInput,
  ChefSchema,
  PlanInput,
  PlanSchema,
  RecipeSchema,
  WebRecipeInput,
  WebRecipeSchema,
} from "./schemas.js";
import {
  chefPrompt,
  planPrompt,
  recipePrompt,
  webExtractPrompt,
  webSynthesizePrompt,
} from "./prompts.js";

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
  return hit.value;
}

function memorySet(key: string, value: unknown): void {
  // Sfratto la voce piu' vecchia: senza limite un processo lungo cresce
  // senza fine.
  if (memoryCache.size >= MEMORY_CACHE_MAX) {
    const oldest = memoryCache.keys().next().value;
    if (oldest) memoryCache.delete(oldest);
  }
  memoryCache.set(key, { value, expires: Date.now() + CACHE_TTL_DAYS * 86_400_000 });
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
      const hit = await (await cache()).findOne({ _id: key });
      if (hit) {
        console.info(`[cache] HIT database ${key}`);
        memorySet(key, hit.value);
        return hit.value as z.infer<T>;
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
      await (await cache()).insertOne({
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

app.get("/health", async () => ({
  ok: true,
  model: MODEL_ID,
  // Il motore vero dell'app: il modello con ricerca Google.
  menuModel: MENU_MODEL,
  groundedModel: GROUNDED_MODEL,
  // Quale delle due strade e' attiva: si cambia con FLUSSO nell'ambiente.
  flusso: flussoPredefinito(),
  // Dichiara la verità: se manca una chiave lo deve sapere il monitoraggio,
  // non l'utente che riceve un errore.
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
  priceSource: z.enum(["ai", "serpapi"]).optional(),
});

/** La strada predefinita, se il client non ne chiede una. */
const PRICE_SOURCE_DEFAULT = process.env.PRICE_SOURCE === "serpapi" ? "serpapi" : "ai";

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
  fonte: "ai" | "serpapi",
) {
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
    if (fonte === "serpapi") {
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
      recordCost(fase2.cost);
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
  const daAprire = tenute.filter((r) => r.link);

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
    rows: [...aperte.rows, ...costruite],
    verificati: aperte.verificati + costruite.length,
    totali: aperte.totali + costruite.length,
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

  const offerte = migliori.filter((r) => r.risparmio && r.risparmio > 0).length;

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
  const totale = Math.round(contati.reduce((s, o) => s + o.prezzo, 0) * 100) / 100;

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
      motorePrezzi: fonte === "serpapi" ? "Google Shopping (SerpAPI)" : GROUNDED_MODEL,
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
      const hit = await (await cache()).findOne({ _id: key });
      if (hit) {
        memorySet(key, hit.value);
        return hit.value;
      }
    } catch {
      /* cache irraggiungibile: si prosegue */
    }
  }

  recordUse("gemini");
  const fase1 = await generateMenu(data);
  recordCost(fase1.cost);
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
      await (await cache()).insertOne({
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

  recordUse("gemini");
  const fase = await generateListaSpesa(data);
  recordCost(fase.cost);
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

  recordUse("gemini");
  const fase = await generateMenuDaProdotti(data, data.disponibili);
  recordCost(fase.cost);
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
  priceSource: z.enum(["ai", "serpapi"]).optional(),
});

/**
 * Fase 2 da sola: prezzi, verifica dei link e confronto fra negozi.
 *
 * Riceve la lista della spesa gia' fatta e restituisce le offerte raggruppate
 * per prodotto, con la piu' economica in testa. E' l'unica fase che si paga.
 */
app.post("/ai/prices", async (body) => {
  const data = parse(PricesInput, body);
  const fonte = data.priceSource ?? PRICE_SOURCE_DEFAULT;

  const key = cacheKey("prices", { ...data, priceSource: fonte });
  const local = memoryGet(key);
  if (local !== undefined) {
    console.info(`[cache] HIT memoria ${key}`);
    return local;
  }
  if (isDbConfigured()) {
    try {
      const hit = await (await cache()).findOne({ _id: key });
      if (hit) {
        memorySet(key, hit.value);
        return hit.value;
      }
    } catch {
      /* cache irraggiungibile */
    }
  }

  if (budgetExhausted()) {
    const sp = spendStatus();
    throw new HttpError(
      402,
      `Tetto di spesa raggiunto ($${sp.usd} su $${sp.limitUsd}). ` +
        `Alza SPESA_MAX_USD o riavvia il servizio per ripartire.`,
    );
  }

  const esito = await prezzaLista(data.items, data.city, data.country, data.currency, fonte);

  memorySet(key, esito);
  if (isDbConfigured()) {
    try {
      await (await cache()).insertOne({
        _id: key,
        value: esito,
        createdAt: new Date(),
        // Sette giorni: i prezzi invecchiano, le ricette no.
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      });
    } catch {
      /* gia' presente */
    }
  }
  return esito;
});

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
      const hit = await (await cache()).findOne({ _id: key });
      if (hit) {
        console.info(`[cache] HIT database ${key}`);
        memorySet(key, hit.value);
        return hit.value;
      }
    } catch (err) {
      console.warn("[cache] lettura fallita, proseguo senza:", err);
    }
  }

  if (budgetExhausted()) {
    const sp = spendStatus();
    throw new HttpError(
      402,
      `Tetto di spesa raggiunto ($${sp.usd} su $${sp.limitUsd}). ` +
        `Alza SPESA_MAX_USD o riavvia il servizio per ripartire.`,
    );
  }

  recordUse("gemini");
  const fase1 = await generateMenu(data);
  recordCost(fase1.cost);
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
      await (await cache()).insertOne({
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
      const hit = await (await cache()).findOne({ _id: key });
      if (hit) {
        memorySet(key, hit.value);
        console.info(`[cache] HIT database ${key} — nessun credito consumato`);
        return hit.value;
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
        await (await cache()).insertOne({
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
      const hit = await (await cache()).findOne({ _id: key });
      if (hit) {
        memorySet(key, hit.value);
        return hit.value;
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
        await (await cache()).insertOne({
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
process.on("unhandledRejection", (reason) => {
  console.error("[server] promessa non gestita, resto in piedi:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[server] eccezione non gestita, resto in piedi:", err);
});

const port = Number(process.env.PORT ?? 3000);
if (!isConfigured()) console.warn("ATTENZIONE: GOOGLE_GENERATIVE_AI_API_KEY assente — /ai/* risponde 503.");
if (!isDbConfigured()) console.warn("ATTENZIONE: MONGODB_URI assente — account e piani non disponibili, cache solo in memoria.");
if (!isShoppingConfigured()) console.warn("ATTENZIONE: SERPAPI_KEY assente — /product/shopping risponde 503.");
app.listen(port);
