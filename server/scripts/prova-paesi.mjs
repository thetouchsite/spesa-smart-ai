/**
 * L'app deve funzionare ovunque, non solo in Italia.
 *
 * Il cliente viaggia e vuole presentarla all'estero, quindi «funziona anche
 * in Francia» non può restare una speranza: va provato. Per ogni paese si
 * guarda se il motore
 *
 *   1. scrive nella lingua giusta, TUTTO — giorni compresi
 *   2. propone piatti di QUEL paese, non italiani tradotti
 *   3. trova supermercati che esistono davvero LÌ
 *   4. produce link che si aprono
 *
 * Il punto 3 è quello che può far crollare tutto: i prezzi online dipendono
 * da quali catene pubblicano il listino, e cambia da paese a paese.
 *
 * Uso:  node scripts/prova-paesi.mjs
 * Richiede il backend avviato su localhost:3000.
 */

import { writeFileSync } from "node:fs";

const API = process.env.API_URL ?? "http://localhost:3000";

const PAESI = [
  {
    etichetta: "Italia",
    body: { city: "Bologna", country: "Italia", household: "4 persone", budget: 120,
      currency: "EUR", frequency: "weekly", style: "mediterraneo", allergies: [],
      dislikes: "funghi", language: "it", withRecipes: true },
    /** Parole che devono comparire se la lingua è giusta. */
    spia: ["lunedì", "martedì", "mercoledì", "giovedì"],
  },
  {
    etichetta: "Francia",
    body: { city: "Lyon", country: "France", household: "3 personnes", budget: 110,
      currency: "EUR", frequency: "weekly", style: "équilibré", allergies: [],
      dislikes: "", language: "fr", withRecipes: true },
    spia: ["lundi", "mardi", "mercredi", "jeudi"],
  },
  {
    etichetta: "Spagna",
    body: { city: "Valencia", country: "España", household: "4 personas", budget: 100,
      currency: "EUR", frequency: "weekly", style: "mediterránea", allergies: [],
      dislikes: "", language: "es", withRecipes: true },
    spia: ["lunes", "martes", "miércoles", "jueves"],
  },
  {
    etichetta: "Paesi Bassi",
    body: { city: "Amsterdam", country: "Nederland", household: "2 personen", budget: 90,
      currency: "EUR", frequency: "weekly", style: "gebalanceerd", allergies: [],
      dislikes: "", language: "nl", withRecipes: true },
    spia: ["maandag", "dinsdag", "woensdag", "donderdag"],
  },
  {
    etichetta: "Germania",
    body: { city: "Berlin", country: "Deutschland", household: "3 Personen", budget: 110,
      currency: "EUR", frequency: "weekly", style: "ausgewogen", allergies: ["Laktose"],
      dislikes: "", language: "de", withRecipes: true },
    spia: ["montag", "dienstag", "mittwoch", "donnerstag"],
  },
];

async function prova(p) {
  const t0 = Date.now();
  let d;
  try {
    const res = await fetch(`${API}/ai/plan-full`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p.body),
      signal: AbortSignal.timeout(300_000),
    });
    d = await res.json();
  } catch (err) {
    return { ...p, errore: String(err).slice(0, 120), secondi: (Date.now() - t0) / 1000 };
  }
  if (d.error) return { ...p, errore: d.error, secondi: (Date.now() - t0) / 1000 };

  // La lingua si controlla sui giorni della settimana: se sono nella lingua
  // giusta, è quasi certo che lo sia tutto il resto.
  const giorni = (d.menu ?? []).map((m) => String(m.giorno).toLowerCase());
  const linguaOk = p.spia.filter((g) => giorni.some((x) => x.includes(g))).length;

  const prodotti = d.prodotti ?? [];
  const conPrezzo = prodotti.length;
  const negozi = [...new Set(prodotti.flatMap((x) => x.offerte.map((o) => o.negozio)))];
  const conAlternative = prodotti.filter((x) => x.offerte.length > 1).length;

  return {
    ...p,
    secondi: (Date.now() - t0) / 1000,
    meta: d.meta,
    giorniMenu: (d.menu ?? []).length,
    ricette: (d.ricette ?? []).length,
    lista: (d.lista ?? []).length,
    linguaOk,
    linguaSu: p.spia.length,
    esempioGiorno: d.menu?.[0],
    esempioRicetta: d.ricette?.[0]?.piatto,
    conPrezzo,
    negozi,
    conAlternative,
    totale: d.totali?.spesaAlMiglioPrezzo,
    valuta: d.totali?.valuta,
    senzaPrezzo: d.totali?.prodottiSenzaPrezzo,
    catene: d.catene,
    offerteEsempio: prodotti.slice(0, 4).map((x) => ({
      prodotto: x.prodotto,
      offerte: x.offerte.map((o) => `${o.negozio} ${o.prezzo}`),
    })),
  };
}

console.log("\nL'APP FUNZIONA ANCHE FUORI DALL'ITALIA?\n");
console.log("Per ogni paese: lingua, piatti locali, supermercati reali, link che si aprono.\n");

const esiti = [];
for (const p of PAESI) {
  process.stdout.write(`${p.etichetta.padEnd(14)} ... `);
  const r = await prova(p);
  esiti.push(r);

  if (r.errore) {
    console.log(`ERRORE dopo ${r.secondi.toFixed(0)}s: ${r.errore}`);
    continue;
  }

  console.log(`${r.secondi.toFixed(0)}s`);
  console.log(`   lingua        ${r.linguaOk}/${r.linguaSu} giorni riconosciuti` +
    (r.linguaOk === r.linguaSu ? "  OK" : "  <-- DA CONTROLLARE"));
  console.log(`   menù          ${r.giorniMenu} giorni, ${r.ricette} ricette, ${r.lista} voci in lista`);
  if (r.esempioGiorno) {
    console.log(`     ${r.esempioGiorno.giorno}: ${String(r.esempioGiorno.cena).slice(0, 60)}`);
  }
  console.log(`   supermercati  ${r.negozi.join(", ") || "nessuno"}`);
  console.log(`   prezzi        ${r.conPrezzo} prodotti, ${r.conAlternative} con più negozi a confronto`);
  console.log(`   totale        ${r.totale} ${r.valuta} (${r.senzaPrezzo} voci senza prezzo)`);
  console.log(`   ricerche      ${r.meta?.ricerche} · verificati ${r.meta?.prezziVerificati}/${r.meta?.prezziTotali} · $${r.meta?.costoStimatoUsd}`);
  for (const o of r.offerteEsempio ?? []) {
    console.log(`     ${String(o.prodotto).slice(0, 34).padEnd(36)} ${o.offerte.join("  |  ")}`);
  }
  console.log();
}

/* ─────────────────────────── Riepilogo ─────────────────────────── */

console.log("=".repeat(76));
console.log("\nRIEPILOGO\n");
console.log(
  `  ${"Paese".padEnd(14)} ${"tempo".padStart(6)} ${"lingua".padStart(7)} ` +
    `${"prezzi".padStart(7)} ${"negozi".padStart(7)} ${"totale".padStart(9)} ${"costo".padStart(8)}`,
);
for (const r of esiti) {
  if (r.errore) {
    console.log(`  ${r.etichetta.padEnd(14)} ERRORE: ${String(r.errore).slice(0, 50)}`);
    continue;
  }
  console.log(
    `  ${r.etichetta.padEnd(14)} ${(Math.round(r.secondi) + "s").padStart(6)} ` +
      `${`${r.linguaOk}/${r.linguaSu}`.padStart(7)} ${String(r.conPrezzo).padStart(7)} ` +
      `${String(r.negozi.length).padStart(7)} ${`${r.totale} ${r.valuta}`.padStart(9)} ` +
      `${("$" + (r.meta?.costoStimatoUsd ?? 0)).padStart(8)}`,
  );
}

const buoni = esiti.filter((r) => !r.errore);
const speso = buoni.reduce((s, r) => s + (r.meta?.costoStimatoUsd ?? 0), 0);
console.log(`\n  Paesi riusciti: ${buoni.length}/${esiti.length}`);
console.log(`  Lingua corretta ovunque: ${buoni.every((r) => r.linguaOk === r.linguaSu) ? "sì" : "NO"}`);
console.log(`  Speso in questo giro: $${speso.toFixed(3)}\n`);

const out = new URL("../../prova-paesi.json", import.meta.url);
writeFileSync(out, JSON.stringify(esiti, null, 2), "utf8");
console.log(`  Dati completi in prova-paesi.json\n`);
