/**
 * Confronto OpenAI contro Gemini per il compito che conta davvero:
 * "dammi il piano della spesa con prezzi e link REALI".
 *
 * La domanda non è quale modello scrive meglio — su quello si equivalgono.
 * È se i prezzi e i link che restituisce **esistono**. Stanotte Gemini senza
 * ricerca web ha risposto "la Mutti su Sole365 costa 1,45 €" con un
 * indirizzo che risponde 404: numero inventato, link inventato, tono
 * assolutamente sicuro.
 *
 * Quindi ogni prova qui finisce con la stessa verifica: si aprono i link
 * uno per uno e si guarda cosa c'è dentro.
 *
 * SPESA: ogni chiamata stampa il costo stimato dai token consumati, e lo
 * script si ferma da solo al tetto impostato.
 *
 * Uso:  node scripts/confronto-ai.mjs
 */

import { readFileSync } from "node:fs";

/* ────────────────────────── Configurazione ────────────────────────── */

const BUDGET_USD = 1.5;
let spent = 0;

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const OPENAI = env.OPENAI_API_KEY;
const GEMINI = env.GOOGLE_GENERATIVE_AI_API_KEY;

/**
 * Prezzi per milione di token, settembre 2026.
 * La ricerca web si paga a parte, per chiamata: è la voce indicata a fianco.
 */
const PRICING = {
  "gpt-4o-mini-search-preview": { in: 0.15, out: 0.6, search: 0.0275 },
  "gpt-4o-search-preview": { in: 2.5, out: 10, search: 0.035 },
  "gpt-5-mini": { in: 0.25, out: 2.0, search: 0.01 },
  "gpt-5": { in: 1.25, out: 10, search: 0.01 },
};

/** Lo stesso identico compito per tutti: cambia solo chi lo esegue. */
const PROMPT = `Sei un assistente per la spesa alimentare.

CONTESTO
- Città: Bologna, Italia
- Persone: 2
- Budget settimanale: 60 EUR
- Stile: mediterraneo
- Lingua delle risposte: italiano

COMPITO
Proponi 3 cene per questa settimana. Poi, per 5 prodotti della lista della
spesa che ne deriva, trova il PREZZO ATTUALE REALE in un negozio online
italiano, con il link diretto alla pagina del prodotto.

REGOLE TASSATIVE
- I prezzi devono venire da pagine che hai davvero consultato ORA.
- Se non trovi il prezzo di un prodotto, scrivi prezzo: null. NON stimarlo.
- I link devono essere quelli delle pagine consultate, non ricostruiti.

Rispondi SOLO con JSON:
{"cene":["...","...","..."],
 "prodotti":[{"nome":"","prezzo":0,"valuta":"EUR","negozio":"","link":""}]}`;

/* ──────────────────────────── Utilità ──────────────────────────── */

function cost(model, usage, searches = 0) {
  const p = PRICING[model];
  if (!p || !usage) return 0;
  const inTok = usage.input_tokens ?? usage.prompt_tokens ?? 0;
  const outTok = usage.output_tokens ?? usage.completion_tokens ?? 0;
  return (inTok / 1e6) * p.in + (outTok / 1e6) * p.out + searches * p.search;
}

function extractJson(text) {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/** Il test decisivo: il link esiste, e la pagina parla di quel prodotto? */
async function checkLink(url, productName) {
  if (!url || !/^https?:\/\//.test(url)) return { ok: false, why: "nessun link" };
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      },
    });
    if (!res.ok) return { ok: false, why: `HTTP ${res.status}` };

    const html = (await res.text()).toLowerCase();
    // Molti siti rispondono 200 anche su "prodotto non trovato": si guarda
    // dentro, non solo lo status.
    const soft404 = /(pagina non trovata|prodotto non (?:trovato|disponibile)|404 not found|page not found)/.test(
      html.slice(0, 40_000),
    );
    if (soft404) return { ok: false, why: "pagina 404 mascherata da 200" };

    const word = (productName || "").toLowerCase().split(/\s+/).find((w) => w.length > 4);
    const onTopic = !word || html.includes(word);
    return { ok: true, why: onTopic ? "pagina valida" : "valida ma fuori tema" };
  } catch (err) {
    return { ok: false, why: `irraggiungibile (${String(err).slice(0, 40)})` };
  }
}

/* ─────────────────────────── I fornitori ─────────────────────────── */

async function openaiSearchModel(model) {
  const started = Date.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: PROMPT }],
      web_search_options: {
        user_location: {
          type: "approximate",
          approximate: { country: "IT", city: "Bologna" },
        },
      },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const json = await res.json();
  if (json.error) return { error: json.error.message, seconds: (Date.now() - started) / 1000 };

  const text = json.choices?.[0]?.message?.content ?? "";
  return {
    text,
    usage: json.usage,
    seconds: (Date.now() - started) / 1000,
    cost: cost(model, json.usage, 1),
  };
}

async function openaiResponses(model) {
  const started = Date.now();
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI}` },
    body: JSON.stringify({
      model,
      input: PROMPT,
      tools: [{ type: "web_search" }],
      reasoning: { effort: "low" },
    }),
    signal: AbortSignal.timeout(300_000),
  });
  const json = await res.json();
  if (json.error) return { error: json.error.message, seconds: (Date.now() - started) / 1000 };

  const text =
    json.output_text ??
    (json.output ?? [])
      .flatMap((o) => o.content ?? [])
      .map((c) => c.text ?? "")
      .join("");
  const searches = (json.output ?? []).filter((o) => o.type === "web_search_call").length;
  return {
    text,
    usage: json.usage,
    seconds: (Date.now() - started) / 1000,
    cost: cost(model, json.usage, searches),
    searches,
  };
}

async function geminiGrounded() {
  const started = Date.now();
  const model = env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }] }],
        tools: [{ google_search: {} }],
      }),
      signal: AbortSignal.timeout(180_000),
    },
  );
  const json = await res.json();
  if (json.error) return { error: json.error.message, seconds: (Date.now() - started) / 1000 };

  const c = json.candidates?.[0];
  const text = (c?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  return {
    text,
    seconds: (Date.now() - started) / 1000,
    cost: 0, // dentro la quota gratuita, quando disponibile
    searches: c?.groundingMetadata?.webSearchQueries?.length ?? 0,
  };
}

/* ──────────────────────────── Esecuzione ──────────────────────────── */

async function run(label, fn) {
  if (spent >= BUDGET_USD) {
    console.log(`\n${label}: SALTATO — tetto di spesa raggiunto`);
    return null;
  }
  console.log(`\n${"═".repeat(66)}\n${label}`);
  const r = await fn();

  if (r.error) {
    console.log(`  ERRORE: ${r.error.slice(0, 150)}`);
    console.log(`  tempo: ${r.seconds.toFixed(1)}s`);
    return { label, error: r.error, seconds: r.seconds, cost: 0 };
  }

  spent += r.cost ?? 0;
  console.log(`  tempo ${r.seconds.toFixed(1)}s · costo ~$${(r.cost ?? 0).toFixed(4)} · speso finora $${spent.toFixed(3)}`);
  if (r.searches !== undefined) console.log(`  ricerche web effettuate: ${r.searches}`);

  const data = extractJson(r.text);
  if (!data) {
    console.log(`  RISPOSTA NON STRUTTURATA (primi 200 caratteri): ${r.text.slice(0, 200)}`);
    return { label, seconds: r.seconds, cost: r.cost, parsed: false };
  }

  console.log(`  cene: ${(data.cene ?? []).length} · prodotti: ${(data.prodotti ?? []).length}`);

  let linksOk = 0;
  let withPrice = 0;
  const rows = [];
  for (const p of data.prodotti ?? []) {
    if (p.prezzo != null) withPrice++;
    const check = await checkLink(p.link, p.nome);
    if (check.ok) linksOk++;
    rows.push({ ...p, check });
    console.log(
      `    ${check.ok ? "OK " : "KO "} ${String(p.nome).slice(0, 26).padEnd(28)}` +
        `${p.prezzo != null ? String(p.prezzo).padStart(7) : "  null"} ${p.valuta ?? ""}  ` +
        `${String(p.negozio ?? "").slice(0, 18).padEnd(20)} ${check.why}`,
    );
  }

  const total = (data.prodotti ?? []).length || 1;
  console.log(`  prezzi forniti ${withPrice}/${total} · link validi ${linksOk}/${total}`);

  return {
    label,
    seconds: r.seconds,
    cost: r.cost,
    parsed: true,
    products: total,
    withPrice,
    linksOk,
    rows,
  };
}

const results = [];

console.log(`\nCONFRONTO OPENAI / GEMINI — tetto di spesa $${BUDGET_USD}\n`);

results.push(await run("1. OpenAI · gpt-4o-mini-search-preview (ricerca inclusa)", () =>
  openaiSearchModel("gpt-4o-mini-search-preview"),
));
results.push(await run("2. OpenAI · gpt-5-mini + strumento web_search", () =>
  openaiResponses("gpt-5-mini"),
));
results.push(await run("3. Gemini · con ricerca Google", geminiGrounded));

console.log(`\n${"═".repeat(66)}\nRIEPILOGO\n`);
for (const r of results.filter(Boolean)) {
  if (r.error) {
    console.log(`  ${r.label.padEnd(52)} ERRORE`);
    continue;
  }
  console.log(
    `  ${r.label.slice(0, 50).padEnd(52)} ${r.seconds.toFixed(0)}s  ` +
      `$${(r.cost ?? 0).toFixed(4)}  prezzi ${r.withPrice ?? 0}/${r.products ?? 0}  link ${r.linksOk ?? 0}/${r.products ?? 0}`,
  );
}
console.log(`\n  SPESA TOTALE: $${spent.toFixed(3)} su $${BUDGET_USD} disponibili\n`);
