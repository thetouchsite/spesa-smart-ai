/**
 * I discount non hanno il catalogo online. Ma hanno il volantino.
 *
 * IL BUCO CHE VOGLIAMO TAPPARE
 * ----------------------------
 * In Italia le catene più economiche — Eurospin, Lidl, MD, In's, Todis — non
 * pubblicano un catalogo consultabile: chi cerca «passata di pomodoro
 * Eurospin» non trova una pagina prodotto, e infatti in tutte le prove fatte
 * non è mai comparsa nessuna di queste insegne. Restava Carrefour, che è fra
 * le più care.
 *
 * Per un'app che promette risparmio è il buco peggiore possibile: mancano
 * proprio i negozi dove si spende meno.
 *
 * L'IPOTESI
 * ---------
 * I prezzi però esistono: stanno nel VOLANTINO settimanale, che quelle catene
 * pubblicano online — in PDF, in pagine sfogliabili, o su siti che li
 * raccolgono. Sono prezzi veri di negozi fisici, con una data di validità.
 *
 * Se il modello con ricerca sa leggerli, l'app può dire «questa settimana
 * l'olio da Eurospin costa 3,99 fino a domenica» — che è esattamente ciò che
 * serve, e che nessun catalogo online potrebbe dare.
 *
 * COSA SI MISURA
 * --------------
 * Tre cose, in ordine di importanza:
 *   1. trova prezzi delle insegne discount? (oggi: zero, sempre)
 *   2. sono prezzi promozionali con una scadenza dichiarata?
 *   3. i link portano a una pagina che si apre davvero?
 *
 * Il terzo punto è quello che può far fallire l'idea: un volantino in PDF non
 * si verifica come una pagina prodotto.
 *
 * Uso:  node scripts/prova-volantini.mjs
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
const GROUNDING = 0.014;

const PRODOTTI = [
  "Passata di pomodoro 700 g",
  "Pasta di semola 500 g",
  "Latte parzialmente scremato 1 L",
  "Petto di pollo 500 g",
  "Olio extravergine di oliva 1 L",
  "Uova fresche 6 pezzi",
  "Mozzarella 125 g",
  "Tonno in scatola 3 x 80 g",
];

/** Come funziona oggi: cataloghi online, e i discount spariscono. */
const PROMPT_CATALOGHI = `Trova il PREZZO ATTUALE REALE di questi prodotti nei supermercati di Napoli, Italia.

PRODOTTI
${PRODOTTI.map((n, i) => `${i + 1}. ${n}`).join("\n")}

Cerca ogni prodotto su 3 catene diverse con listino online pubblico.
Per ogni prezzo: il nome sul sito, il prezzo, il negozio e il link alla pagina.
Se non trovi un prodotto in una catena, saltalo. Non stimare MAI un prezzo.

Rispondi SOLO con JSON:
{"prezzi":[{"prodotto":"","nome":"","prezzo":0,"negozio":"","link":"","valido_fino":""}]}`;

/** La proposta: i volantini dei discount, che hanno negozi fisici. */
const PROMPT_VOLANTINI = `Trova i prezzi di questi prodotti nei VOLANTINI in corso dei
supermercati discount di Napoli, Italia.

PRODOTTI
${PRODOTTI.map((n, i) => `${i + 1}. ${n}`).join("\n")}

Cerca nei volantini settimanali di EUROSPIN, LIDL, MD, IN'S MERCATO, TODIS,
CONAD e simili — catene con punti vendita fisici a Napoli. I loro prezzi non
stanno in un catalogo online ma nel volantino della settimana.

Per ogni prezzo trovato indica: il nome del prodotto come sta sul volantino,
il prezzo, l'insegna, fino a quando l'offerta è valida, e il link alla pagina
del volantino.
Se un prodotto non è in nessun volantino, saltalo. Non stimare MAI un prezzo.
Riporta solo prezzi che hai letto davvero in un volantino consultato ora.

Rispondi SOLO con JSON:
{"prezzi":[{"prodotto":"","nome":"","prezzo":0,"negozio":"","link":"","valido_fino":""}]}`;

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

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

async function apri(url) {
  if (!url || !/^https?:\/\//.test(url)) return "nessun link";
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": UA, Accept: "text/html" },
    });
    return r.ok ? "si apre" : `HTTP ${r.status}`;
  } catch {
    return "irraggiungibile";
  }
}

async function chiedi(prompt) {
  const t0 = Date.now();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.GOOGLE_GENERATIVE_AI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      }),
      signal: AbortSignal.timeout(300_000),
    },
  );
  const j = await res.json();
  if (j.error) return { errore: j.error.message };

  const c = j.candidates?.[0];
  const u = j.usageMetadata ?? {};
  return {
    testo: (c?.content?.parts ?? []).map((p) => p.text ?? "").join(""),
    secondi: (Date.now() - t0) / 1000,
    ricerche: (c?.groundingMetadata?.webSearchQueries ?? []).length,
    costo:
      ((u.promptTokenCount ?? 0) / 1e6) * PRICING.in +
      (((u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)) / 1e6) * PRICING.out +
      GROUNDING,
  };
}

/** Le insegne discount con punti vendita fisici: sono quelle che cerchiamo. */
const DISCOUNT = ["eurospin", "lidl", "md", "in's", "ins mercato", "todis", "penny", "aldi", "dpiu", "dpiù"];

async function esegui(etichetta, prompt) {
  console.log(`\n${"=".repeat(74)}\n${etichetta}`);
  const r = await chiedi(prompt);
  if (r.errore) {
    console.log(`  ERRORE: ${r.errore.slice(0, 160)}`);
    return null;
  }
  console.log(`  ${r.secondi.toFixed(0)}s · $${r.costo.toFixed(4)} · ${r.ricerche} ricerche`);

  const d = json(r.testo);
  const righe = d?.prezzi ?? [];
  if (righe.length === 0) {
    console.log(`  nessun prezzo restituito`);
    return { etichetta, ...r, righe: [], discount: 0, aperti: 0, conScadenza: 0 };
  }

  let aperti = 0;
  let discount = 0;
  let conScadenza = 0;

  console.log();
  for (const p of righe) {
    const negozio = String(p.negozio ?? "").toLowerCase();
    const isDiscount = DISCOUNT.some((d) => negozio.includes(d));
    if (isDiscount) discount++;
    if (p.valido_fino) conScadenza++;

    const esito = await apri(p.link);
    if (esito === "si apre") aperti++;

    console.log(
      `  ${isDiscount ? "DISCOUNT" : "        "} ${String(p.negozio ?? "?").slice(0, 16).padEnd(18)}` +
        `${String(p.prodotto ?? p.nome ?? "").slice(0, 30).padEnd(32)}` +
        `${String(p.prezzo ?? "—").padStart(6)}  ` +
        `${(p.valido_fino ? "fino " + p.valido_fino : "").padEnd(18)}${esito}`,
    );
  }

  const n = righe.length;
  console.log(
    `\n  ${n} prezzi · ${discount} da discount · ${conScadenza} con scadenza · ${aperti} link che si aprono`,
  );
  return { etichetta, ...r, righe, discount, aperti, conScadenza, totale: n };
}

console.log("\nI DISCOUNT NON HANNO IL CATALOGO. HANNO IL VOLANTINO.\n");
console.log("Domanda: il motore sa leggere i volantini delle catene con negozi fisici?");
console.log("Se sì, entrano nel confronto proprio le insegne dove si spende meno.\n");

const a = await esegui("A) COME FUNZIONA OGGI — cataloghi online", PROMPT_CATALOGHI);
const b = await esegui("B) LA PROPOSTA — volantini dei discount", PROMPT_VOLANTINI);

console.log(`\n${"=".repeat(74)}\nVERDETTO\n`);
if (a && b) {
  console.log(`  ${"".padEnd(28)} ${"prezzi".padStart(7)} ${"discount".padStart(9)} ${"scadenza".padStart(9)} ${"link ok".padStart(8)}`);
  for (const r of [a, b]) {
    console.log(
      `  ${r.etichetta.slice(0, 28).padEnd(28)} ${String(r.totale ?? 0).padStart(7)} ` +
        `${String(r.discount).padStart(9)} ${String(r.conScadenza).padStart(9)} ${String(r.aperti).padStart(8)}`,
    );
  }
  console.log(`\n  Speso in questo giro: $${(a.costo + b.costo).toFixed(3)}`);

  if (b.discount > a.discount) {
    console.log(`\n  I volantini portano ${b.discount - a.discount} prezzi discount che i cataloghi non davano.`);
  } else {
    console.log(`\n  I volantini NON hanno aggiunto insegne discount: la strada non paga.`);
  }
}
console.log();
