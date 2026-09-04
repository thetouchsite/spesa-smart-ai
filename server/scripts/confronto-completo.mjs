/**
 * Secondo giro del confronto: il carico REALE dell'app.
 *
 * La prima prova ha risposto alla domanda "i link esistono?" — sì, 5 su 5.
 * Questa risponde alle due che decidono se conviene: quanto costa e quanto
 * ci mette a fare quello che l'app deve fare davvero, cioè una settimana
 * intera con la lista della spesa valorizzata.
 *
 * Si prova anche la ripetibilità: due chiamate identiche devono dare prezzi
 * confrontabili. Se variano molto, non sono affidabili.
 *
 * Uso:  node scripts/confronto-completo.mjs
 */

import { readFileSync } from "node:fs";

const BUDGET_USD = 1.3; // già spesi ~0,04 nel primo giro
let spent = 0;

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const PRICING = {
  "gpt-5-mini": { in: 0.25, out: 2.0, search: 0.01 },
  "gpt-5": { in: 1.25, out: 10, search: 0.01 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6, search: 0.025 },
};

/** Il compito che l'app deve svolgere davvero. */
const FULL_PROMPT = `Sei l'assistente di un'app per la spesa alimentare.

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

function cost(model, usage, searches = 0) {
  const p = PRICING[model];
  if (!p || !usage) return 0;
  return (
    ((usage.input_tokens ?? 0) / 1e6) * p.in +
    ((usage.output_tokens ?? 0) / 1e6) * p.out +
    searches * p.search
  );
}

function extractJson(text) {
  const m = (text || "").match(/\{[\s\S]*\}/);
  try {
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
}

async function checkLink(url, name) {
  if (!url || !/^https?:\/\//.test(url)) return { ok: false, why: "nessun link" };
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      },
    });
    if (!res.ok) return { ok: false, why: `HTTP ${res.status}` };
    const html = (await res.text()).toLowerCase().slice(0, 40_000);
    if (/(pagina non trovata|prodotto non (?:trovato|disponibile)|404 not found|page not found)/.test(html)) {
      return { ok: false, why: "404 mascherato" };
    }
    const word = (name || "").toLowerCase().split(/\s+/).find((w) => w.length > 4);
    return { ok: true, why: !word || html.includes(word) ? "valida" : "valida, fuori tema" };
  } catch {
    return { ok: false, why: "irraggiungibile" };
  }
}

async function ask(model, prompt, effort = "low") {
  const started = Date.now();
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      input: prompt,
      tools: [{ type: "web_search" }],
      reasoning: { effort },
    }),
    signal: AbortSignal.timeout(600_000),
  });
  const json = await res.json();
  if (json.error) return { error: json.error.message, seconds: (Date.now() - started) / 1000 };

  const text =
    json.output_text ??
    (json.output ?? []).flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("");
  const searches = (json.output ?? []).filter((o) => o.type === "web_search_call").length;
  return {
    text,
    seconds: (Date.now() - started) / 1000,
    cost: cost(model, json.usage, searches),
    searches,
    usage: json.usage,
  };
}

async function report(label, model, prompt, effort) {
  if (spent >= BUDGET_USD) {
    console.log(`\n${label}: SALTATO — tetto raggiunto`);
    return null;
  }
  console.log(`\n${"═".repeat(68)}\n${label}`);
  const r = await ask(model, prompt, effort);

  if (r.error) {
    console.log(`  ERRORE: ${r.error.slice(0, 140)}`);
    return { label, error: true };
  }

  spent += r.cost;
  console.log(
    `  ${r.seconds.toFixed(0)}s · $${r.cost.toFixed(4)} · ${r.searches} ricerche · ` +
      `${r.usage?.input_tokens ?? 0} token in / ${r.usage?.output_tokens ?? 0} out`,
  );
  console.log(`  speso finora: $${spent.toFixed(3)}`);

  const d = extractJson(r.text);
  if (!d) {
    console.log(`  RISPOSTA NON STRUTTURATA: ${(r.text || "").slice(0, 160)}`);
    return { label, seconds: r.seconds, cost: r.cost, parsed: false };
  }

  const menu = d.menu ?? [];
  const lista = d.lista ?? [];
  const prezzi = d.prezzi ?? [];
  console.log(`  menù ${menu.length} giorni · lista ${lista.length} voci · prezzi ${prezzi.length}`);
  if (menu[0]) console.log(`    esempio: ${menu[0].giorno} → ${menu[0].cena}`);

  let ok = 0;
  let withPrice = 0;
  const checked = [];
  for (const p of prezzi) {
    if (p.prezzo != null) withPrice++;
    const c = await checkLink(p.link, p.nome);
    if (c.ok) ok++;
    checked.push({ ...p, check: c });
  }
  for (const p of checked.slice(0, 6)) {
    console.log(
      `    ${p.check.ok ? "OK " : "KO "} ${String(p.nome).slice(0, 28).padEnd(30)}` +
        `${p.prezzo != null ? String(p.prezzo).padStart(7) : "   null"}  ` +
        `${String(p.negozio ?? "").slice(0, 20).padEnd(22)} ${p.check.why}`,
    );
  }
  const n = prezzi.length || 1;
  console.log(`  prezzi ${withPrice}/${n} · link validi ${ok}/${n}`);

  return {
    label,
    seconds: r.seconds,
    cost: r.cost,
    searches: r.searches,
    days: menu.length,
    items: lista.length,
    priced: withPrice,
    linksOk: ok,
    total: n,
    rows: checked,
  };
}

const out = [];
console.log(`\nCARICO REALE — tetto $${BUDGET_USD}\n`);

out.push(await report("A. gpt-5-mini · settimana intera + 12 prezzi", "gpt-5-mini", FULL_PROMPT, "low"));
out.push(await report("B. gpt-5-mini · ripetizione, per la costanza", "gpt-5-mini", FULL_PROMPT, "low"));
out.push(await report("C. gpt-5 · stesso compito, modello pieno", "gpt-5", FULL_PROMPT, "low"));

console.log(`\n${"═".repeat(68)}\nRIEPILOGO\n`);
for (const r of out.filter(Boolean)) {
  if (r.error) {
    console.log(`  ${r.label.padEnd(46)} ERRORE`);
    continue;
  }
  console.log(
    `  ${r.label.slice(0, 44).padEnd(46)} ${String(Math.round(r.seconds)).padStart(3)}s  ` +
      `$${r.cost.toFixed(4)}  ${r.days ?? 0}gg  ${r.items ?? 0} voci  ` +
      `prezzi ${r.priced ?? 0}/${r.total ?? 0}  link ${r.linksOk ?? 0}/${r.total ?? 0}`,
  );
}

// Costanza fra le due chiamate identiche
const [a, b] = out;
if (a?.rows && b?.rows) {
  const mapB = new Map(b.rows.map((r) => [String(r.nome).toLowerCase().slice(0, 12), r.prezzo]));
  const pairs = a.rows
    .map((r) => [r.nome, r.prezzo, mapB.get(String(r.nome).toLowerCase().slice(0, 12))])
    .filter(([, p1, p2]) => p1 != null && p2 != null);
  if (pairs.length) {
    console.log(`\n  COSTANZA fra le due chiamate (${pairs.length} prodotti in comune):`);
    for (const [nome, p1, p2] of pairs.slice(0, 6)) {
      const delta = Math.abs(p1 - p2);
      console.log(
        `    ${String(nome).slice(0, 26).padEnd(28)} ${String(p1).padStart(6)} vs ${String(p2).padStart(6)}` +
          `  ${delta < 0.3 ? "coerente" : "SCOSTAMENTO " + delta.toFixed(2)}`,
      );
    }
  }
}

console.log(`\n  SPESA IN QUESTO GIRO: $${spent.toFixed(3)}\n`);
