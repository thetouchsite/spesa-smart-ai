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
import { generateMenu, generatePrices, GROUNDED_MODEL, MENU_MODEL } from "./plan-grounded.js";
import { groupByProduct, pickBestStore, verifyPrices } from "./price-page.js";
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
});

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
app.post("/ai/plan-full", async (body) => {
  const data = parse(GroundedInput, body);
  if (!isConfigured()) throw new HttpError(503, "Servizio AI non configurato su questo ambiente");

  const key = cacheKey("plan-full", data);

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

  // Il freno a mano: sopra il tetto si smette di chiamare invece di consumare
  // il credito fino all'ultimo centesimo. 402 e non 500: non e' un guasto, e'
  // una scelta, e il client puo' spiegarla all'utente.
  if (budgetExhausted()) {
    const s = spendStatus();
    throw new HttpError(
      402,
      `Tetto di spesa raggiunto ($${s.usd} su $${s.limitUsd}). ` +
        `Alza SPESA_MAX_USD o riavvia il servizio per ripartire.`,
    );
  }

  /* FASE 1 — menu', ricette e lista. Nessuna ricerca, quindi nessun costo di
     grounding: puo' girare sulla chiave gratuita. */
  recordUse("gemini");
  const fase1 = await generateMenu(data);
  recordCost(fase1.cost);
  console.info(
    `[plan-full] fase 1 ${fase1.model}: ${fase1.seconds.toFixed(0)}s, ` +
      `$${fase1.cost.toFixed(4)}, ${fase1.data.menu.length} giorni, ` +
      `${fase1.data.lista.length} voci in lista`,
  );

  /* FASE 2 — prezzi. Prompt corto sulla sola lista della spesa: e' l'unico modo
     perche' il modello cerchi davvero, ed e' l'unica fase che si paga. */
  const items = fase1.data.lista.map((v) => `${v.nome} ${v.quantita}`.trim()).slice(0, 18);

  let prezziGrezzi: Awaited<ReturnType<typeof generatePrices>>["data"]["prezzi"] = [];
  let fase2Secondi = 0;
  let fase2Costo = 0;
  let ricerche = 0;
  let hacercato = false;

  try {
    recordUse("gemini");
    recordUse("grounding");
    const fase2 = await generatePrices(items, data.city, data.country, data.currency);
    prezziGrezzi = fase2.data.prezzi;
    fase2Secondi = fase2.seconds;
    fase2Costo = fase2.cost;
    ricerche = fase2.data.searches;
    recordCost(fase2.cost);
    hacercato = fase2.data.grounded;
    console.info(
      `[plan-full] fase 2 ${fase2.model}: ${fase2.seconds.toFixed(0)}s, ` +
        `$${fase2.cost.toFixed(4)}, ${ricerche} ricerche, ${prezziGrezzi.length} prezzi`,
    );
  } catch (err) {
    // Senza prezzi il piano resta utile: menu', ricette e lista ci sono. Molto
    // meglio di un errore che lascia l'utente a mani vuote.
    console.warn("[plan-full] fase 2 fallita, restituisco il piano senza prezzi:", err);
  }

  // Il controllo dei link: gratis, e trasforma "il modello dice" in "l'abbiamo
  // aperto". Sei per volta: con due catene ci sono trenta o quaranta pagine.
  const checked = await verifyPrices(prezziGrezzi, 6);
  console.info(`[plan-full] pagine aperte con esito ${checked.verificati}/${checked.totali}`);

  // Le offerte dello stesso prodotto affiancate, come nel prototipo del cliente:
  // non un supermercato imposto, ma le alternative con la piu' economica in
  // testa. I prezzi delle altre insegne sono gia' stati pagati in questa stessa
  // chiamata: tenerne uno solo sarebbe uno spreco.
  const prodotti = groupByProduct(checked.rows);
  const conAlternative = prodotti.filter((p) => p.offerte.length > 1).length;

  // Il piu' economico per ogni prodotto: e' quello che la lista mostra.
  // `groupByProduct` mette in testa i verificati, quindi offerte[0] e' il
  // migliore fra quelli di cui abbiamo aperto la pagina, quando ce n'e' uno.
  const migliori = prodotti.map((p) => ({
    ...p.offerte[0],
    prodotto: p.prodotto,
    alternative: p.offerte.length - 1,
  }));

  // Il confronto per insegna, per chi preferisce fare tutta la spesa in un posto
  // solo. Vince la piu' economica FRA QUELLE VERIFICABILI: il modello propone,
  // la scelta si fa sui prezzi controllati.
  const confronto = pickBestStore(checked.rows);
  for (const c of confronto.catene) {
    console.info(
      `[plan-full]   ${c.negozio}: ${c.totale} (${c.verificati}/${c.proposti} verificati)` +
        `${c.utilizzabile ? "" : " — scartata, troppi link rotti"}`,
    );
  }

  const offerte = migliori.filter((r) => r.risparmio && r.risparmio > 0).length;

  // Nel totale entrano SOLO i prezzi verificati. Un prezzo che non abbiamo
  // potuto controllare resta visibile come alternativa, ma non deve finire in
  // una somma che l'utente prende per buona: sommare cio' che non si e'
  // verificato e' il modo piu' rapido per dare un numero sbagliato con l'aria
  // di essere esatto.
  const contati = migliori.filter((r) => r.verifica !== "non-raggiungibile");
  const totaleMigliore =
    Math.round(contati.reduce((s, r) => s + (r.prezzo ?? 0), 0) * 100) / 100;

  console.info(
    `[plan-full] ${prodotti.length} prodotti prezzati, ${conAlternative} con alternative, ` +
      `${offerte} in promozione — totale al meglio ${totaleMigliore} ${data.currency}`,
  );

  const result = {
    ...fase1.data,
    // Il piu' economico per ogni prodotto: la lista della spesa.
    prezzi: migliori,
    // Tutte le offerte per prodotto: l'utente tocca una voce e vede dove altro
    // si trova e a quanto.
    prodotti,
    // Il confronto per insegna: la prova che il risparmio esiste.
    catene: confronto.catene,
    vincitore: confronto.vincitore,
    risparmioVsPiuCara: confronto.risparmio,
    totali: {
      spesaAlMiglioPrezzo: totaleMigliore,
      budget: data.budget,
      valuta: data.currency,
      // Dichiarato apertamente: senza, un totale parziale sembrerebbe un
      // affare e sarebbe solo un conto incompleto.
      // Le voci che nessun negozio ha saputo prezzare in modo controllabile.
      prodottiSenzaPrezzo: Math.max(0, fase1.data.lista.length - contati.length),
      prodottiPrezzoVerificato: contati.length,
      vociInLista: fase1.data.lista.length,
    },
    meta: {
      motoreMenu: fase1.model,
      motorePrezzi: GROUNDED_MODEL,
      secondi: Math.round(fase1.seconds + fase2Secondi),
      secondiMenu: Math.round(fase1.seconds),
      secondiPrezzi: Math.round(fase2Secondi),
      ricerche,
      // Se e' falso, i prezzi vengono dalla memoria del modello: va detto.
      ricercaEffettuata: hacercato,
      costoStimatoUsd: Number((fase1.cost + fase2Costo).toFixed(4)),
      prezziVerificati: checked.verificati,
      prezziTotali: checked.totali,
      insegneConfrontate: confronto.catene.length,
      prodottiConAlternative: conAlternative,
      prodottiInOfferta: offerte,
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
        // Sette giorni e non trenta: i prezzi invecchiano, le ricette no.
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      });
    } catch {
      /* chiave gia' presente per una richiesta concorrente: va bene cosi' */
    }
  }
  return result;
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
