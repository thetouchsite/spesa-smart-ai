/**
 * Gemini con ricerca contro GPT-5 con ricerca, sullo stesso identico compito.
 *
 * Il termine di paragone è già misurato: GPT-5 ha dato 12 prezzi su 12 e
 * 12 link validi su 12, in 157 secondi, per 0,32 $.
 *
 * La domanda è se Gemini regge quella qualità a un costo molto minore
 * (5.000 grounding gratuiti al mese, poi 14 $ ogni mille contro i 32 $ di
 * cento chiamate GPT-5). Se sì, la scelta si ribalta.
 *
 * Come sempre, il giudizio non è sul testo: si aprono i link e si conta
 * quanti esistono davvero.
 *
 * Uso:  node scripts/gemini-vs-gpt5.mjs
 */

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

/** Lo stesso compito dato a GPT-5, parola per parola. */
const PROMPT = `Sei l'assistente di un'app per la spesa alimentare.

CONTESTO
- Città: Bologna, Italia
- Persone: 4
- Budget settimanale: 120 EUR
- Stile alimentare: mediterraneo
- Allergie: nessuna
- Lingua: italiano

COMPITO
1. Un menù di 7 giorni: colazione, pranzo e cena per ogni giorno.
2. La lista della spesa che ne deriva, raggruppata per reparto.
3. Per 12 prodotti della lista, il PREZZO ATTUALE REALE in un negozio
   online italiano, con il link diretto alla pagina del prodotto.

REGOLE TASSATIVE
- I prezzi devono venire da pagine che hai consultato ORA, non dalla memoria.
- Se non trovi il prezzo, scrivi prezzo: null. NON stimarlo mai.
- I link devono essere quelli delle pagine consultate, non ricostruiti.
- Piatti italiani veri, non traduzioni di piatti stranieri.

Rispondi SOLO con JSON:
{"menu":[{"giorno":"","colazione":"","pranzo":"","cena":""}],
 "lista":[{"nome":"","quantita":"","reparto":""}],
 "prezzi":[{"nome":"","prezzo":0,"valuta":"EUR","negozio":"","link":""}]}`;

/**
 * Prezzi Gemini, settembre 2026, per milione di token.
 * Il grounding si paga a parte: 14 $ ogni mille richieste, dopo le 5.000
 * gratuite mensili.
 */
const GEMINI_PRICING = {
  "gemini-3-flash-preview": { in: 0.25, out: 1.5 },
  "gemini-3.5-flash": { in: 0.75, out: 3.75 },
  "gemini-3.5-flash-lite": { in: 0.1, out: 0.4 },
};
const GROUNDING_PER_CALL = 0.014;

function json(text) {
  if (!text) return null;
  // I modelli a volte incapsulano il JSON in un blocco markdown.
  const clean = text.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "");
  const m = clean.match(/\{[\s\S]*\}/);
  try {
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
}

/**
 * Il test decisivo. Gemini restituisce spesso URL di redirect Google
 * (`vertexaisearch...`): si seguono, perché è dove porta l'utente cliccando.
 */
async function checkLink(url, name) {
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
    const html = (await res.text()).toLowerCase().slice(0, 40_000);
    if (/(pagina non trovata|prodotto non (?:trovato|disponibile)|404 not found|page not found)/.test(html)) {
      return { ok: false, why: "404 mascherato da 200" };
    }
    const word = (name || "").toLowerCase().split(/\s+/).find((w) => w.length > 4);
    return { ok: true, why: !word || html.includes(word) ? "valida" : "valida, fuori tema" };
  } catch {
    return { ok: false, why: "irraggiungibile" };
  }
}

async function askGemini(model) {
  const t0 = Date.now();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GOOGLE_GENERATIVE_AI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }] }],
        tools: [{ google_search: {} }],
      }),
      signal: AbortSignal.timeout(600_000),
    },
  );
  const j = await res.json();
  if (j.error) return { error: j.error.message, seconds: (Date.now() - t0) / 1000 };

  const c = j.candidates?.[0];
  const text = (c?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  const gm = c?.groundingMetadata ?? {};
  const u = j.usageMetadata ?? {};
  const p = GEMINI_PRICING[model] ?? GEMINI_PRICING["gemini-3-flash-preview"];

  return {
    text,
    seconds: (Date.now() - t0) / 1000,
    searches: (gm.webSearchQueries ?? []).length,
    sources: (gm.groundingChunks ?? []).length,
    // Il grounding è una tariffa per chiamata, non per ricerca interna.
    cost:
      ((u.promptTokenCount ?? 0) / 1e6) * p.in +
      ((u.candidatesTokenCount ?? 0) / 1e6) * p.out +
      GROUNDING_PER_CALL,
    usage: u,
    chunks: gm.groundingChunks ?? [],
  };
}

async function run(model) {
  console.log(`\n${"═".repeat(70)}\nGemini · ${model} · con ricerca Google`);
  const r = await askGemini(model);

  if (r.error) {
    console.log(`  ERRORE: ${r.error.slice(0, 160)}`);
    return null;
  }

  console.log(
    `  ${r.seconds.toFixed(0)}s · $${r.cost.toFixed(4)} · ${r.searches} ricerche · ` +
      `${r.sources} fonti · ${r.usage.promptTokenCount ?? 0} token in / ${r.usage.candidatesTokenCount ?? 0} out`,
  );

  const d = json(r.text);
  if (!d) {
    console.log(`  RISPOSTA NON STRUTTURATA (primi 200): ${(r.text || "").slice(0, 200)}`);
    return { model, ...r, parsed: false };
  }

  const menu = d.menu ?? [];
  const lista = d.lista ?? [];
  const prezzi = d.prezzi ?? [];
  console.log(`  menù ${menu.length} giorni · lista ${lista.length} voci · prezzi ${prezzi.length}`);
  if (menu[0]) console.log(`    esempio: ${menu[0].giorno} → ${menu[0].cena}`);

  let ok = 0;
  let withPrice = 0;
  for (const p of prezzi) {
    if (p.prezzo != null) withPrice++;
    const c = await checkLink(p.link, p.nome);
    if (c.ok) ok++;
    console.log(
      `    ${c.ok ? "OK " : "KO "} ${String(p.nome).slice(0, 30).padEnd(32)}` +
        `${p.prezzo != null ? String(p.prezzo).padStart(7) : "   null"}  ` +
        `${String(p.negozio ?? "").slice(0, 18).padEnd(20)} ${c.why}`,
    );
  }
  const n = prezzi.length || 1;
  console.log(`  prezzi ${withPrice}/${n} · link validi ${ok}/${n}`);

  return { model, ...r, days: menu.length, items: lista.length, priced: withPrice, linksOk: ok, total: n };
}

console.log("\nGEMINI CON RICERCA vs GPT-5 CON RICERCA\n");
console.log("Riferimento GPT-5 (misurato): 157s · $0.3222 · prezzi 12/12 · link 12/12");

const results = [];
results.push(await run("gemini-3-flash-preview"));
results.push(await run("gemini-3.5-flash"));

console.log(`\n${"═".repeat(70)}\nRIEPILOGO\n`);
console.log(`  ${"GPT-5 + web_search".padEnd(30)} 157s  $0.3222  prezzi 12/12  link 12/12`);
for (const r of results.filter(Boolean)) {
  console.log(
    `  ${r.model.padEnd(30)} ${String(Math.round(r.seconds)).padStart(3)}s  ` +
      `$${r.cost.toFixed(4)}  prezzi ${r.priced ?? 0}/${r.total ?? 0}  link ${r.linksOk ?? 0}/${r.total ?? 0}`,
  );
}
const spent = results.filter(Boolean).reduce((s, r) => s + r.cost, 0);
console.log(`\n  Speso su Gemini in questo giro: $${spent.toFixed(3)}\n`);
