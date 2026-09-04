/**
 * Terza prova: conviene spezzare la chiamata?
 *
 * `gpt-5` fa tutto in una volta, con 12 prezzi su 12 e 12 link validi su 12 —
 * ma ci mette 157 secondi. In una dimostrazione davanti a un investitore due
 * minuti e mezzo di rotella sono lunghissimi.
 *
 * Qui si misura l'alternativa: prima il menù e la lista SENZA prezzi (veloce,
 * si mostra subito), poi i prezzi in una seconda chiamata mentre l'utente
 * già guarda il piano.
 *
 * Uso:  node scripts/confronto-split.mjs
 */

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const P = { "gpt-5": { in: 1.25, out: 10, search: 0.01 } };
let spent = 0;

const PLAN_ONLY = `Sei l'assistente di un'app per la spesa. Bologna, Italia. 4 persone.
Budget 120 EUR a settimana. Stile mediterraneo. Rispondi in italiano.

Crea un menù di 7 giorni (colazione, pranzo, cena) e la lista della spesa che
ne deriva, raggruppata per reparto. Piatti italiani veri.

NON cercare prezzi: servono solo menù e lista.

Rispondi SOLO JSON:
{"menu":[{"giorno":"","colazione":"","pranzo":"","cena":""}],
 "lista":[{"nome":"","quantita":"","reparto":""}]}`;

const PRICES_ONLY = `Trova il PREZZO ATTUALE REALE di questi 12 prodotti in un
supermercato online italiano che consegna a Bologna, con il link diretto alla
pagina del prodotto.

Prodotti: passata di pomodoro, spaghetti, petto di pollo, mozzarella, latte UHT,
uova, olio extravergine di oliva, zucchine, patate, parmigiano, riso, pane.

REGOLE
- Prezzi da pagine consultate ORA, non dalla memoria.
- Se non trovi un prezzo, scrivi prezzo: null. NON stimarlo.
- Preferisci sempre lo stesso supermercato, così i prezzi sono confrontabili.

Rispondi SOLO JSON:
{"prezzi":[{"nome":"","prezzo":0,"valuta":"EUR","negozio":"","link":""}]}`;

function cost(u, s = 0) {
  return ((u?.input_tokens ?? 0) / 1e6) * P["gpt-5"].in +
    ((u?.output_tokens ?? 0) / 1e6) * P["gpt-5"].out + s * P["gpt-5"].search;
}

async function ask(prompt, tools) {
  const t0 = Date.now();
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-5",
      input: prompt,
      ...(tools ? { tools: [{ type: "web_search" }] } : {}),
      reasoning: { effort: "low" },
    }),
    signal: AbortSignal.timeout(600_000),
  });
  const j = await res.json();
  if (j.error) return { error: j.error.message, seconds: (Date.now() - t0) / 1000 };
  const text = j.output_text ?? (j.output ?? []).flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("");
  const searches = (j.output ?? []).filter((o) => o.type === "web_search_call").length;
  return { text, seconds: (Date.now() - t0) / 1000, cost: cost(j.usage, searches), searches, usage: j.usage };
}

function json(t) {
  const m = (t || "").match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
}

async function checkLink(url, name) {
  if (!url || !/^https?:\/\//.test(url)) return false;
  try {
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36" } });
    if (!r.ok) return false;
    const h = (await r.text()).toLowerCase().slice(0, 40_000);
    return !/(pagina non trovata|prodotto non (?:trovato|disponibile)|404 not found)/.test(h);
  } catch { return false; }
}

console.log("\nSPEZZARE LA CHIAMATA — conviene?\n");

console.log("═".repeat(66));
console.log("D. Solo menù e lista, senza ricerca prezzi");
const d = await ask(PLAN_ONLY, false);
if (d.error) console.log("  ERRORE:", d.error.slice(0, 130));
else {
  spent += d.cost;
  const j = json(d.text);
  console.log(`  ${d.seconds.toFixed(0)}s · $${d.cost.toFixed(4)}`);
  console.log(`  menù ${j?.menu?.length ?? 0} giorni · lista ${j?.lista?.length ?? 0} voci`);
  if (j?.menu?.[0]) console.log(`    esempio: ${j.menu[0].giorno} → ${j.menu[0].cena}`);
}

console.log("\n" + "═".repeat(66));
console.log("E. Solo i 12 prezzi, con ricerca web");
const e = await ask(PRICES_ONLY, true);
if (e.error) console.log("  ERRORE:", e.error.slice(0, 130));
else {
  spent += e.cost;
  const j = json(e.text);
  const rows = j?.prezzi ?? [];
  console.log(`  ${e.seconds.toFixed(0)}s · $${e.cost.toFixed(4)} · ${e.searches} ricerche`);
  let ok = 0, withPrice = 0;
  for (const p of rows) {
    if (p.prezzo != null) withPrice++;
    if (await checkLink(p.link, p.nome)) ok++;
  }
  for (const p of rows.slice(0, 8)) {
    console.log(`    ${String(p.nome).slice(0, 26).padEnd(28)}${p.prezzo != null ? String(p.prezzo).padStart(7) : "   null"}  ${String(p.negozio ?? "").slice(0, 22)}`);
  }
  console.log(`  prezzi ${withPrice}/${rows.length} · link validi ${ok}/${rows.length}`);
}

console.log("\n" + "═".repeat(66));
console.log("CONFRONTO CON LA CHIAMATA UNICA (gpt-5: 157s, $0.3222, 12/12, 12/12)\n");
if (!d.error && !e.error) {
  console.log(`  spezzata: primo risultato dopo ${d.seconds.toFixed(0)}s, completa dopo ${(d.seconds + e.seconds).toFixed(0)}s`);
  console.log(`  costo totale spezzata: $${(d.cost + e.cost).toFixed(4)}`);
}
console.log(`\n  SPESA IN QUESTO GIRO: $${spent.toFixed(3)}\n`);
