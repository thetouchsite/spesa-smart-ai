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
  if (isDbConfigured()) {
    try {
      const hit = await (await cache()).findOne({ _id: key });
      if (hit) {
        console.info(`[cache] HIT ${key}`);
        return hit.value as z.infer<T>;
      }
    } catch (err) {
      // Una cache irraggiungibile non deve impedire la generazione.
      console.warn("[cache] lettura fallita, proseguo senza:", err);
    }
  }

  const { experimental_output } = await generateText({
    model: model(),
    experimental_output: Output.object({ schema }),
    prompt,
  });

  // `generateText` non riesce a legare l'output allo schema quando lo schema
  // arriva come generico: il tipo torna `unknown` e va riaffermato qui.
  const output = experimental_output as z.infer<T>;

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
  // Dichiara la verità: se manca una chiave lo deve sapere il monitoraggio,
  // non l'utente che riceve un errore.
  aiConfigured: isConfigured(),
  dbConfigured: isDbConfigured(),
  searchProvider: searchProvider().id,
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

/* ─────────────────────────────── Avvio ─────────────────────────────── */

const port = Number(process.env.PORT ?? 3000);
if (!isConfigured()) console.warn("ATTENZIONE: GOOGLE_GENERATIVE_AI_API_KEY assente — /ai/* risponde 503.");
if (!isDbConfigured()) console.warn("ATTENZIONE: MONGODB_URI assente — account, piani e cache non disponibili.");
app.listen(port);
