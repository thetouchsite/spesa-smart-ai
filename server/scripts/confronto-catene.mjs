/**
 * Il piano lo sa fare. Ma trova il prezzo PIÙ BASSO, o solo il primo?
 *
 * Nella prova di stanotte tutti i prezzi venivano da Carrefour, perché il
 * prompt diceva «usa sempre lo stesso supermercato». Erano prezzi veri, ma
 * non erano i migliori: nessun confronto fra catene era mai avvenuto.
 *
 * Per un'app che promette risparmio la differenza è tutto. Qui si misura
 * se il confronto è sostenibile:
 *
 *   A) UN NEGOZIO   — quello che facciamo oggi, come riferimento
 *   B) TRE CATENE   — stesso paniere prezzato su tre insegne, vince il totale
 *
 * L'ipotesi da verificare è che B costi quasi come A, perché il grounding
 * si paga A CHIAMATA (0,014 $) e non a ricerca: se il confronto avviene
 * dentro la stessa richiesta, la tariffa non si moltiplica e crescono solo
 * i token. Se è vero, il confronto fra catene è praticamente gratis.
 *
 * Uso:  node scripts/confronto-catene.mjs
 */

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const MODEL = "gemini-3-flash-preview";
const PRICING = { in: 0.25, out: 1.5 };
const GROUNDING_PER_CALL = 0.014;

const CONTESTO = `- Città: Bologna, Italia
- Persone: 4
- Budget settimanale: 120 EUR
- Stile alimentare: mediterraneo
- Allergie: nessuna
- Lingua: italiano`;

/** A) Come funziona oggi: un negozio solo. */
const PROMPT_SINGOLO = `Sei l'assistente di un'app per la spesa alimentare.

CONTESTO
${CONTESTO}

COMPITO
1. Un menù di 7 giorni: colazione, pranzo e cena.
2. La lista della spesa che ne deriva, raggruppata per reparto.
3. Per 12 prodotti della lista, il PREZZO ATTUALE REALE in un negozio
   online italiano, con il link diretto alla pagina del prodotto.
   Usa SEMPRE LO STESSO supermercato, così i prezzi sono confrontabili.

REGOLE TASSATIVE
- I prezzi devono venire da pagine consultate ORA, non dalla memoria.
- Se non trovi il prezzo, scrivi prezzo: null. NON stimarlo mai.
- I link devono essere quelli delle pagine consultate, non ricostruiti.

Rispondi SOLO con JSON:
{"menu":[{"giorno":"","colazione":"","pranzo":"","cena":""}],
 "lista":[{"nome":"","quantita":"","reparto":""}],
 "prezzi":[{"nome":"","prezzo":0,"valuta":"EUR","negozio":"","link":""}]}`;

/** B) Stesso paniere su tre catene, vince il totale più basso. */
const PROMPT_CONFRONTO = `Sei l'assistente di un'app per la spesa alimentare.
Il tuo scopo è far RISPARMIARE: non basta un prezzo vero, serve il migliore.

CONTESTO
${CONTESTO}

COMPITO
1. Un menù di 7 giorni: colazione, pranzo e cena.
2. La lista della spesa che ne deriva, raggruppata per reparto.
3. CONFRONTO FRA CATENE. Scegli TRE insegne diverse presenti a Bologna con
   listino online consultabile (per esempio Esselunga, Carrefour, Conad,
   Coop, Bennet, Tigre, Pam). Per ognuna prezza LO STESSO paniere di 12
   prodotti equivalenti e calcola il TOTALE.
4. Indica quale catena costa meno e quanto si risparmia rispetto alla più
   cara. Per la catena VINCENTE riporta i 12 prezzi con i link diretti.

REGOLE TASSATIVE
- I prezzi devono venire da pagine consultate ORA, non dalla memoria.
- Confronta prodotti EQUIVALENTI (stesso formato), non tagli diversi.
- Se per una catena non trovi un prodotto, scrivi prezzo: null e dillo
  nel campo "mancanti". NON stimare mai un prezzo.
- I link devono essere quelli delle pagine consultate, non ricostruiti.

Rispondi SOLO con JSON:
{"menu":[{"giorno":"","colazione":"","pranzo":"","cena":""}],
 "lista":[{"nome":"","quantita":"","reparto":""}],
 "catene":[{"nome":"","totale":0,"mancanti":0}],
 "vincitore":{"catena":"","totale":0,"risparmio_vs_piu_cara":0},
 "prezzi":[{"nome":"","prezzo":0,"valuta":"EUR","negozio":"","link":""}]}`;

function json(text) {
  if (!text) return null;
  const clean = text.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "");
  const m = clean.match(/\{[\s\S]*\}/);
  try {
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
}

/** Il giudizio non è sul testo: si aprono i link e si conta. */
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

async function ask(prompt) {
  const t0 = Date.now();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.GOOGLE_GENERATIVE_AI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }),
      signal: AbortSignal.timeout(600_000),
    },
  );
  const j = await res.json();
  if (j.error) return { error: j.error.message, seconds: (Date.now() - t0) / 1000 };

  const c = j.candidates?.[0];
  const u = j.usageMetadata ?? {};
  const costTokens =
    ((u.promptTokenCount ?? 0) / 1e6) * PRICING.in + ((u.candidatesTokenCount ?? 0) / 1e6) * PRICING.out;

  return {
    text: (c?.content?.parts ?? []).map((p) => p.text ?? "").join(""),
    seconds: (Date.now() - t0) / 1000,
    searches: (c?.groundingMetadata?.webSearchQueries ?? []).length,
    tokensIn: u.promptTokenCount ?? 0,
    tokensOut: u.candidatesTokenCount ?? 0,
    // I token si pagano a consumo, il grounding è una tariffa fissa per chiamata.
    costTokens,
    cost: costTokens + GROUNDING_PER_CALL,
  };
}

async function run(label, prompt) {
  console.log(`\n${"=".repeat(72)}\n${label}`);
  const r = await ask(prompt);
  if (r.error) {
    console.log(`  ERRORE: ${r.error.slice(0, 200)}`);
    return null;
  }

  console.log(
    `  ${r.seconds.toFixed(0)}s | $${r.cost.toFixed(4)} totale ` +
      `(token $${r.costTokens.toFixed(4)} + grounding $${GROUNDING_PER_CALL})`,
  );
  console.log(`  ${r.searches} ricerche | ${r.tokensIn} token in / ${r.tokensOut} out`);

  const d = json(r.text);
  if (!d) {
    console.log(`  RISPOSTA NON STRUTTURATA: ${(r.text || "").slice(0, 200)}`);
    return { label, ...r, parsed: false };
  }

  console.log(`  menù ${(d.menu ?? []).length} giorni | lista ${(d.lista ?? []).length} voci`);

  if (d.catene?.length) {
    console.log(`\n  CONFRONTO CATENE:`);
    for (const c of d.catene) {
      console.log(
        `    ${String(c.nome).padEnd(18)} ${String(c.totale).padStart(8)} EUR` +
          `${c.mancanti ? `  (${c.mancanti} senza prezzo)` : ""}`,
      );
    }
    if (d.vincitore) {
      console.log(
        `    -> vince ${d.vincitore.catena}: ${d.vincitore.totale} EUR, ` +
          `risparmio ${d.vincitore.risparmio_vs_piu_cara} EUR`,
      );
    }
  }

  const prezzi = d.prezzi ?? [];
  let ok = 0;
  let withPrice = 0;
  let somma = 0;
  console.log(`\n  PREZZI:`);
  for (const p of prezzi) {
    if (p.prezzo != null) {
      withPrice++;
      somma += Number(p.prezzo) || 0;
    }
    const c = await checkLink(p.link, p.nome);
    if (c.ok) ok++;
    console.log(
      `    ${c.ok ? "OK" : "KO"} ${String(p.nome).slice(0, 30).padEnd(32)}` +
        `${p.prezzo != null ? String(p.prezzo).padStart(7) : "   null"}  ` +
        `${String(p.negozio ?? "").slice(0, 16).padEnd(18)}${c.why}`,
    );
  }
  const n = prezzi.length || 1;
  console.log(`  prezzi ${withPrice}/${n} | link validi ${ok}/${n} | somma ${somma.toFixed(2)} EUR`);

  return { label, ...r, priced: withPrice, linksOk: ok, total: n, somma, catene: d.catene, vincitore: d.vincitore };
}

console.log("\nIL PREZZO È VERO, MA È IL MIGLIORE?\n");
console.log("Ipotesi: il confronto fra catene costa quasi quanto un negozio solo,");
console.log("perché il grounding si paga a chiamata e non a ricerca.\n");

const a = await run("A) UN NEGOZIO SOLO  (come funziona oggi)", PROMPT_SINGOLO);
const b = await run("B) TRE CATENE A CONFRONTO  (la proposta)", PROMPT_CONFRONTO);

console.log(`\n${"=".repeat(72)}\nVERDETTO\n`);
if (a && b) {
  console.log(
    `  ${"".padEnd(24)} ${"tempo".padStart(7)} ${"costo".padStart(9)} ` +
      `${"ricerche".padStart(9)} ${"prezzi".padStart(8)} ${"link".padStart(7)}`,
  );
  for (const r of [a, b]) {
    console.log(
      `  ${r.label.slice(0, 24).padEnd(24)} ${(Math.round(r.seconds) + "s").padStart(7)} ` +
        `${("$" + r.cost.toFixed(4)).padStart(9)} ${String(r.searches).padStart(9)} ` +
        `${`${r.priced}/${r.total}`.padStart(8)} ${`${r.linksOk}/${r.total}`.padStart(7)}`,
    );
  }
  const delta = b.cost - a.cost;
  console.log(`\n  Il confronto fra catene costa $${delta.toFixed(4)} in più (+${((delta / a.cost) * 100).toFixed(0)}%)`);
  console.log(`  di cui grounding: $0.0000 — tariffa fissa per chiamata, non per ricerca`);
  console.log(`  la differenza è tutta token: $${(b.costTokens - a.costTokens).toFixed(4)}`);
  if (b.vincitore) {
    console.log(`\n  E in cambio: la catena più economica, ${b.vincitore.risparmio_vs_piu_cara} EUR di risparmio dichiarato.`);
  }
}
console.log(`\n  Speso in questo giro: $${[a, b].filter(Boolean).reduce((s, r) => s + r.cost, 0).toFixed(3)}\n`);
