/**
 * Il motore dell'app, in due fasi.
 *
 * PERCHÉ DUE CHIAMATE E NON UNA
 * -----------------------------
 * Perché è stato misurato che una sola non funziona. Chiedendo tutto insieme
 * — menù, ricette, lista e prezzi su tre catene, quattromila caratteri di
 * istruzioni — il modello smette di cercare sul web e risponde a memoria: la
 * risposta torna SENZA `groundingMetadata`, cioè con zero ricerche fatte.
 * Sembra un buon piano, ma i prezzi sono ricordati — ed è esattamente il
 * difetto da cui siamo partiti.
 *
 * Con un prompt corto e mirato ai soli prezzi, invece, cerca: dieci ricerche,
 * quattro catene, quattordici link validi su venti. Più piccola è la domanda,
 * più lavora davvero.
 *
 * Da qui la divisione:
 *
 *   FASE 1 — MENÙ, RICETTE E LISTA        senza ricerca, CHIAVE GRATUITA
 *   Il modello lo scrive da sé, come faceva il prototipo del cliente: non
 *   serve internet per sapere che il ragù vuole carne macinata. Niente
 *   ricerca significa niente tariffa di grounding — questa fase non costa.
 *
 *   FASE 2 — PREZZI E LINK                con ricerca, chiave a consumo
 *   Prompt corto, solo la lista della spesa: «quanto costano questi prodotti
 *   a Bologna, su due catene». Qui la ricerca serve, ed è l'unica cosa che si
 *   paga.
 *
 * MISURATO IL 4 SETTEMBRE 2026:
 *   Gemini 3 Flash + ricerca   28-36 s · ~0,027 $ · prezzi e link verificati
 *   GPT-5 + web_search            157 s ·  0,322 $ · stessa qualità
 * Cinque volte più veloce, dodici volte meno caro.
 *
 * IL VINCITORE NON LO SCEGLIE IL MODELLO
 * --------------------------------------
 * Ogni link viene aperto da questo server prima di rispondere. Serve perché
 * quando una catena ha il catalogo dietro login il modello *ricostruisce* gli
 * indirizzi a mano: dodici 404 su dodici, misurati. Sopravvive solo ciò che si
 * apre davvero, e fra le insegne rimaste vince la più economica.
 */

import { z } from "zod";

/** Fase 2: il modello che cerca. È quello che si paga. */
export const GROUNDED_MODEL = process.env.GEMINI_GROUNDED_MODEL ?? "gemini-3-flash-preview";

/**
 * Fase 1: il modello che scrive menù e ricette, senza cercare.
 * Leggero apposta — non deve sapere i prezzi, deve saper cucinare.
 */
export const MENU_MODEL = process.env.GEMINI_MENU_MODEL ?? "gemini-3.5-flash-lite";

/** Prezzi Gemini, settembre 2026, per milione di token. RADDOPPIANO L'1/1/2027. */
const TOKEN_PRICING: Record<string, { in: number; out: number }> = {
  "gemini-3-flash-preview": { in: 0.25, out: 1.5 },
  "gemini-3.5-flash": { in: 0.75, out: 3.75 },
  "gemini-3.5-flash-lite": { in: 0.1, out: 0.4 },
};

/**
 * Tariffa di ricerca, per chiamata.
 *
 * La documentazione promette 5.000 richieste gratuite al mese, ma il conto
 * reale del progetto non lo conferma: dieci chiamate hanno prodotto 0,29 € di
 * addebito, cioè circa 0,027 $ l'una, che torna solo contando il grounding.
 * Quindi qui si assume che si paghi sempre. Meglio una stima prudente che una
 * sorpresa in fattura — e se il credito gratuito poi si applica, il conto vero
 * sarà più basso di quello dichiarato al cliente.
 */
const GROUNDING_PER_CALL = 0.014;

/**
 * La chiave della fase 1.
 *
 * Il menù non consuma grounding, quindi può stare sul piano gratuito e non
 * costare niente. Se la chiave gratuita manca o ha finito la quota — il piano
 * free concede una ventina di richieste al giorno per modello, misurate — si
 * ricade su quella a consumo: senza ricerca la chiamata costa qualche
 * millesimo, e vale la pena spenderli piuttosto che lasciare l'utente senza
 * piano.
 */
function menuKey(): string | undefined {
  return process.env.GEMINI_FREE_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

/** La chiave della fase 2: deve avere la fatturazione attiva per poter cercare. */
function pricesKey(): string | undefined {
  return process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

export interface GroundedPlanInput {
  city: string;
  country: string;
  household: string;
  budget: number;
  currency: string;
  frequency: "weekly" | "monthly";
  style: string;
  allergies: string[];
  dislikes: string;
  /** Codice lingua ISO: tutto il contenuto viene generato in questa lingua. */
  language: string;
  /** Con le ricette la risposta è più ricca ma più lenta. */
  withRecipes?: boolean;
}

/**
 * Estrae il JSON dalla risposta del modello, anche quando è imperfetto.
 *
 * Due difetti ricorrenti, entrambi visti:
 *   - il JSON incapsulato in un blocco markdown ```json ... ```
 *   - la risposta TRONCATA a metà, quando il modello esaurisce lo spazio di
 *     output: «Expected ',' or ']' after array element at position 8504»
 *
 * Il secondo è quello che fa male, perché arriva dopo aver già pagato la
 * generazione: un piano completo di menù, ricette e lista buttato via per
 * una parentesi mancante. Quindi se il testo non si legge così com'è, si
 * ricostruisce: si taglia all'ultimo elemento intero e si richiude tutto
 * quello che era rimasto aperto.
 *
 * Meglio sei ricette su sette che nessun piano.
 */
function parseJson(text: string): unknown {
  const clean = text.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "");
  const start = clean.indexOf("{");
  if (start === -1) throw new Error("nessun JSON nella risposta del modello");

  const body = clean.slice(start);
  try {
    return JSON.parse(body);
  } catch {
    const riparato = repairTruncatedJson(body);
    if (!riparato) throw new Error("JSON della risposta illeggibile anche dopo il recupero");
    console.warn("[json] risposta troncata dal modello, recuperata la parte completa");
    return JSON.parse(riparato);
  }
}

/**
 * Richiude un JSON interrotto a metà.
 *
 * Si percorre il testo tenendo conto delle stringhe e degli escape — una
 * parentesi dentro una stringa non conta — e si ricorda l'ultima posizione in
 * cui la struttura era in uno stato "pulito": subito dopo un elemento chiuso,
 * dentro un array o un oggetto. Da lì si taglia e si chiudono le parentesi
 * rimaste aperte, nell'ordine giusto.
 */
function repairTruncatedJson(body: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  /** Ultimo punto sicuro dove tagliare, e lo stack in quel momento. */
  let cut = -1;
  let cutStack: string[] = [];

  for (let i = 0; i < body.length; i++) {
    const c = body[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      // La fine di una stringa dentro un array è un punto di taglio valido.
      if (!inString && stack[stack.length - 1] === "[") {
        cut = i + 1;
        cutStack = [...stack];
      }
      continue;
    }
    if (inString) continue;

    if (c === "{" || c === "[") {
      stack.push(c);
      // Anche un contenitore appena aperto è un punto di taglio valido: dà un
      // array o un oggetto vuoto, che è sempre meglio della chiave sparita.
      // Senza questo, una risposta interrotta subito dopo `"lista":[` perdeva
      // l'intera chiave, e con essa il piano — perché lo schema la pretende.
      cut = i + 1;
      cutStack = [...stack];
    }
    else if (c === "}" || c === "]") {
      stack.pop();
      // Un elemento appena chiuso: da qui si può troncare senza rompere nulla.
      cut = i + 1;
      cutStack = [...stack];
    } else if (c === "," && stack.length) {
      // Prima della virgola l'elemento precedente era completo.
      cut = i;
      cutStack = [...stack];
    }
  }

  if (cut <= 0) return null;

  // Si chiude ciò che resta aperto, dal più interno al più esterno.
  const chiusure = cutStack
    .slice()
    .reverse()
    .map((c) => (c === "{" ? "}" : "]"))
    .join("");

  return body.slice(0, cut) + chiusure;
}

interface CallResult {
  text: string;
  seconds: number;
  searches: number;
  cost: number;
  /** Vero se il modello ha davvero interrogato il web. */
  grounded: boolean;
  tokens: { in: number; out: number; thoughts: number };
}

/**
 * Una chiamata a Gemini.
 *
 * `withSearch` decide tutto: senza, è una generazione normale e costa i soli
 * token; con, si attiva la ricerca Google e si aggiunge la tariffa di
 * grounding. Il campo `grounded` dice se il modello ha *effettivamente*
 * cercato, che è un'altra cosa dall'averglielo concesso — ed è proprio quella
 * differenza ad averci fatto scoprire il problema del prompt troppo lungo.
 *
 * ATTENZIONE AI TOKEN DI RAGIONAMENTO. `candidatesTokenCount` conta solo la
 * risposta visibile; il ragionamento interno sta in `thoughtsTokenCount`, è
 * escluso da quel numero e si paga come output. Su una chiamata reale erano
 * 2.448 token su 6.188 di risposta: ignorarli sottostimava il conto di quasi
 * il 40%, ed è esattamente l'errore che ha fatto sembrare un piano più
 * economico di quanto sia.
 */
async function callGemini(
  apiKey: string,
  modelId: string,
  prompt: string,
  withSearch: boolean,
  timeoutMs: number,
): Promise<CallResult> {
  const started = Date.now();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        ...(withSearch ? { tools: [{ google_search: {} }] } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );

  const body = (await res.json()) as {
    error?: { message?: string };
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: { webSearchQueries?: string[] };
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
    };
  };

  if (body.error) throw new Error(`Gemini ${modelId}: ${body.error.message ?? "errore sconosciuto"}`);

  const candidate = body.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  if (!text) throw new Error(`Gemini ${modelId} ha risposto senza contenuto`);

  const usage = body.usageMetadata ?? {};
  const pricing = TOKEN_PRICING[modelId] ?? TOKEN_PRICING["gemini-3-flash-preview"];
  const tokensIn = usage.promptTokenCount ?? 0;
  const tokensOut = usage.candidatesTokenCount ?? 0;
  const thoughts = usage.thoughtsTokenCount ?? 0;

  return {
    text,
    seconds: (Date.now() - started) / 1000,
    searches: candidate?.groundingMetadata?.webSearchQueries?.length ?? 0,
    grounded: candidate?.groundingMetadata !== undefined,
    tokens: { in: tokensIn, out: tokensOut, thoughts },
    cost:
      (tokensIn / 1e6) * pricing.in +
      // Il ragionamento si paga a tariffa di output, come il testo visibile.
      ((tokensOut + thoughts) / 1e6) * pricing.out +
      (withSearch ? GROUNDING_PER_CALL : 0),
  };
}

export interface PhaseResult<T> {
  data: T;
  seconds: number;
  cost: number;
  model: string;
}

/* ═════════════ FASE 1 — menù, ricette e lista (senza ricerca) ═════════════ */

/**
 * Un passaggio della ricetta, comunque il modello decida di scriverlo.
 *
 * Chiesto un elenco di stringhe, a volte risponde con oggetti — `{"passo": 1,
 * "testo": "..."}` o `{"descrizione": "..."}` — e uno schema rigido rifiutava
 * l'intero piano per questo: Spagna e Paesi Bassi sono cadute così, con menù,
 * ricette e prezzi già pagati e pronti, persi per la forma di un campo.
 *
 * Meglio accettare entrambe le forme e normalizzare. La regola vale in
 * generale: essere severi sui prezzi, dove un errore inganna l'utente, ed
 * elastici sulla forma del testo, dove non inganna nessuno.
 */
const StepSchema = z.union([
  z.string(),
  z
    .object({})
    .passthrough()
    .transform((o) => {
      const r = o as Record<string, unknown>;
      const testo = r.testo ?? r.descrizione ?? r.passo ?? r.step ?? r.text ?? r.description;
      if (typeof testo === "string" && testo.trim()) return testo.trim();
      // Ultima risorsa: il primo valore testuale utile dell'oggetto.
      const primo = Object.values(r).find((v) => typeof v === "string" && v.trim().length > 3);
      return typeof primo === "string" ? primo.trim() : "";
    }),
]);

/** Un ingrediente, tollerante allo stesso modo. */
const IngredientSchema = z.union([
  z.string().transform((nome) => ({ nome, quantita: "" })),
  z
    .object({ nome: z.string().optional(), quantita: z.union([z.string(), z.number()]).optional() })
    .passthrough()
    .transform((o) => {
      const r = o as Record<string, unknown>;
      return {
        nome: String(r.nome ?? r.ingrediente ?? r.name ?? "").trim(),
        quantita: String(r.quantita ?? r.quantità ?? r.quantity ?? r.dose ?? "").trim(),
      };
    }),
]);

export const MenuSchema = z.object({
  menu: z.array(
    z.object({
      giorno: z.string(),
      colazione: z.string(),
      pranzo: z.string(),
      cena: z.string(),
    }),
  ),
  ricette: z
    .array(
      z.object({
        giorno: z.string(),
        piatto: z.string(),
        porzioni: z.number().default(2),
        ingredienti: z.array(IngredientSchema).default([]),
        passaggi: z.array(StepSchema).default([]),
        prep_minuti: z.number().default(0),
        cottura_minuti: z.number().default(0),
      }),
    )
    .default([]),
  lista: z.array(
    z.object({
      nome: z.string(),
      // Numeri e campi assenti capitano: si normalizzano invece di rifiutare.
      quantita: z.union([z.string(), z.number()]).default("").transform(String),
      reparto: z.string().default(""),
    }),
  ),
  consigli: z.array(z.string()).default([]),
});

export type MenuResult = z.infer<typeof MenuSchema>;

export function menuPrompt(d: GroundedPlanInput): string {
  const days = d.frequency === "monthly" ? 14 : 7;

  const recipeBlock = d.withRecipes
    ? `
3. RICETTE — per le ${days} cene: ingredienti con dosi per ${d.household},
   procedimento in 4-8 passaggi, minuti di preparazione e di cottura.
   Le dosi devono essere realistiche per quel numero di persone: mezzo chilo
   di carne per una persona sola sarebbe assurdo.
`
    : "";

  return `Sei il pianificatore alimentare di un'app per la spesa.

## CONTESTO
- Città: ${d.city || "non specificata"}
- Paese: ${d.country}
- Persone in casa: ${d.household}
- Budget: ${d.budget} ${d.currency} ${d.frequency === "monthly" ? "al mese" : "a settimana"}
- Stile alimentare: ${d.style}
- Allergie e diete: ${d.allergies.length ? d.allergies.join(", ") : "nessuna"}
- Non gradito: ${d.dislikes || "niente in particolare"}

## LINGUA — REGOLA ASSOLUTA
Scrivi OGNI parola in lingua "${d.language}": nomi dei giorni, piatti,
ingredienti, reparti, consigli. Nessun campo in un'altra lingua.

## COSA DEVI PRODURRE

1. MENÙ — ${days} giorni con colazione, pranzo e cena.
   Piatti che una famiglia cucinerebbe davvero IN ${d.country.toUpperCase()},
   non traduzioni di piatti stranieri. Varia le proteine lungo la settimana e
   non ripetere lo stesso piatto due volte.

2. LISTA DELLA SPESA — aggregata da tutti i pasti, raggruppata per reparto.
   Quantità arrotondate ai formati d'acquisto reali: "1 confezione da 500 g",
   non "370 g". Nomi generici e comprensibili, come li si cercherebbe al
   supermercato: "Passata di pomodoro 700 g", non "passata bio artigianale".
   Fra 12 e 18 voci: è la base su cui verranno cercati i prezzi.
${recipeBlock}
${d.withRecipes ? "4" : "3"}. CONSIGLI — 3 o 4 modi concreti per spendere meno con questa lista.

## VINCOLO DI BUDGET
La spesa deve poter stare entro ${d.budget} ${d.currency}. Scegli tagli e
formati coerenti con quella cifra.

## FORMATO
Rispondi SOLO con questo JSON, senza testo né blocchi di codice attorno:
{"menu":[{"giorno":"","colazione":"","pranzo":"","cena":""}],
${d.withRecipes ? ' "ricette":[{"giorno":"","piatto":"","porzioni":0,"ingredienti":[{"nome":"","quantita":""}],"passaggi":[""],"prep_minuti":0,"cottura_minuti":0}],\n' : ""} "lista":[{"nome":"","quantita":"","reparto":""}],
 "consigli":[""]}`;
}

/** Menù, ricette e lista della spesa. Nessuna ricerca, nessun costo di grounding. */
export async function generateMenu(input: GroundedPlanInput): Promise<PhaseResult<MenuResult>> {
  const key = menuKey();
  if (!key) throw new Error("nessuna chiave Gemini configurata");

  const r = await callGemini(key, MENU_MODEL, menuPrompt(input), false, 120_000);
  const data = MenuSchema.parse(parseJson(r.text));

  // La normalizzazione puo' lasciare stringhe vuote dove un oggetto non aveva
  // nessun campo testuale: si tolgono, un passaggio vuoto nella ricetta si
  // vede subito.
  for (const ricetta of data.ricette) {
    ricetta.passaggi = ricetta.passaggi.filter((p) => p.trim().length > 0);
    ricetta.ingredienti = ricetta.ingredienti.filter((i) => i.nome.trim().length > 0);
  }

  return {
    data,
    seconds: r.seconds,
    cost: r.cost,
    model: MENU_MODEL,
  };
}

/* ═════════════════ FASE 2 — prezzi e link (con ricerca) ═════════════════ */

export const PricesSchema = z.object({
  prezzi: z.array(
    z.object({
      /** La voce della lista: uguale fra le insegne, è la chiave del confronto. */
      prodotto: z.string().default(""),
      /** Il nome commerciale sullo scaffale, diverso da negozio a negozio. */
      nome: z.string(),
      prezzo: z.number().nullable(),
      valuta: z.string().default("EUR"),
      negozio: z.string(),
      link: z.string(),
    }),
  ),
});

/**
 * Il prompt dei prezzi: corto per costruzione.
 *
 * La brevità qui non è stile, è un requisito misurato. Con quattromila
 * caratteri il modello ha smesso di cercare; con seicento ha fatto dieci
 * ricerche. Ogni riga che si aggiunge va pesata contro quel rischio.
 */
export function pricesPrompt(
  items: string[],
  city: string,
  country: string,
  currency: string,
  /**
   * Quante insegne interrogare. Tre e non due: quando una ha il catalogo
   * dietro login i suoi link cadono tutti alla verifica, e con due di partenza
   * si resta con un solo negozio e nessun confronto da mostrare. È successo
   * a ogni prova — Esselunga, poi Conad, poi EasyCoop: quale cade cambia ogni
   * volta, che ne cada una è la regola.
   */
  stores = 3,
): string {
  const where = city ? `${city}, ${country}` : country;
  return `Trova il PREZZO ATTUALE REALE di questi prodotti nei supermercati online di ${where}.

PRODOTTI
${items.map((n, i) => `${i + 1}. ${n}`).join("\n")}

Cerca ogni prodotto su ${stores} catene diverse con listino online pubblico,
così i prezzi si possono confrontare.

Conta soprattutto una cosa: che il LINK SI APRA e mostri QUEL prodotto.
Scegli quindi negozi alimentari online le cui pagine si aprono senza login,
senza registrazione e senza scegliere prima un punto vendita — molte grandi
catene mostrano i prezzi solo dopo l'accesso, e da quelle non ricavi niente.
Fra i negozi consultabili preferisci i supermercati generalisti, dove una
famiglia fa la spesa di tutti i giorni, perché i prezzi siano confrontabili.
Ma per completare la lista va bene qualunque negozio che venda davvero quel
prodotto alimentare, compresi i grandi marketplace come Amazon o eBay: hanno
le pagine aperte a tutti ed è lì che spesso si trova ciò che le catene non
mostrano. Meglio un prezzo vero su un marketplace che nessun prezzo.
Per ogni prezzo: "prodotto" è la voce qui sopra scritta IDENTICA, "nome" è il
nome sul sito del negozio, poi prezzo, negozio e link alla pagina.
Se non trovi un prodotto in una catena, saltalo. Non stimare MAI un prezzo.
Il link deve essere una pagina che hai davvero aperto: verranno controllati
uno per uno.

Rispondi SOLO con JSON:
{"prezzi":[{"prodotto":"","nome":"","prezzo":0,"valuta":"${currency}","negozio":"","link":""}]}`;
}

export interface PricesResult {
  prezzi: z.infer<typeof PricesSchema>["prezzi"];
  /** Ricerche web davvero eseguite. Se è 0, il modello ha risposto a memoria. */
  searches: number;
  grounded: boolean;
}

/** Prezzi e link reali per una lista della spesa. È l'unica fase che si paga. */
export async function generatePrices(
  items: string[],
  city: string,
  country: string,
  currency: string,
  stores = 3,
): Promise<PhaseResult<PricesResult>> {
  const key = pricesKey();
  if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY non configurata");

  const r = await callGemini(
    key,
    GROUNDED_MODEL,
    pricesPrompt(items, city, country, currency, stores),
    true,
    180_000,
  );

  // Zero ricerche non è un errore da bloccare, ma va detto: significa che i
  // prezzi vengono dalla memoria del modello e non dal web.
  if (!r.grounded) {
    console.warn("[prezzi] il modello NON ha cercato sul web: prezzi da trattare con cautela");
  }

  const parsed = PricesSchema.parse(parseJson(r.text));
  return {
    data: { prezzi: parsed.prezzi, searches: r.searches, grounded: r.grounded },
    seconds: r.seconds,
    cost: r.cost,
    model: GROUNDED_MODEL,
  };
}
