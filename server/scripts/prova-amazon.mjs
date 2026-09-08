/**
 * Le credenziali Amazon funzionano?
 *
 * La Product Advertising API non ha un ambiente di prova: o si hanno le chiavi
 * vere di un account Associates, o non si può chiamare. Questo script serve a
 * scoprire in dieci secondi se le chiavi che hai sono buone, invece di
 * accorgersene quando l'app non mostra offerte e non si capisce perché.
 *
 * Prova quattro prodotti scelti apposta: due di dispensa, che Amazon vende
 * quasi sempre, e due di fresco, che quasi mai. Serve a misurare la copertura
 * reale, non solo che la chiamata passi.
 *
 * Uso:  npx tsx scripts/prova-amazon.mjs [PAESE]
 *       npx tsx scripts/prova-amazon.mjs IT
 *
 * Serve `tsx` e non `node` perche' il modulo importato e' TypeScript.
 */

import { readFileSync } from "node:fs";

// Le variabili si leggono dal .env come fa il server.
const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
for (const [k, v] of Object.entries(env)) if (v) process.env[k] = v;

const paese = (process.argv[2] ?? "IT").toUpperCase();

const { isAmazonConfigured, cercaSuAmazon } = await import("../src/amazon.ts");

console.log(`\nAMAZON PRODUCT ADVERTISING API — prova su ${paese}\n`);

if (!isAmazonConfigured()) {
  console.log("  Credenziali assenti. Servono tre valori nel file server/.env:\n");
  for (const k of ["AMAZON_ACCESS_KEY", "AMAZON_SECRET_KEY", "AMAZON_PARTNER_TAG"]) {
    console.log(`    ${k.padEnd(22)} ${process.env[k] ? "presente" : "MANCA"}`);
  }
  console.log(`
  Come ottenerle:
    1. Iscriviti ad Amazon Associates del paese
       https://programma-affiliazione.amazon.it
    2. Servono un sito o un'app da dichiarare, dati fiscali e IBAN
    3. Ad approvazione: Strumenti -> Product Advertising API -> aggiungi credenziali

  NON esiste un ambiente di prova: le chiavi sono quelle vere.
  E Amazon sospende l'accesso se non arrivano TRE VENDITE entro 180 giorni.
`);
  process.exit(1);
}

/** Due di dispensa e due di fresco: è la differenza che conta davvero. */
const PRODOTTI = [
  { nome: "Pasta di semola 500 g", tipo: "dispensa" },
  { nome: "Tonno in scatola 3 x 80 g", tipo: "dispensa" },
  { nome: "Petto di pollo 500 g", tipo: "fresco" },
  { nome: "Mozzarella 125 g", tipo: "fresco" },
];

let trovati = 0;
const perTipo = { dispensa: 0, fresco: 0 };

for (const p of PRODOTTI) {
  const t0 = Date.now();
  let offerte = [];
  let errore = null;
  try {
    offerte = await cercaSuAmazon(p.nome, paese, 2);
  } catch (e) {
    errore = e.message;
  }
  const secondi = ((Date.now() - t0) / 1000).toFixed(1);

  if (errore) {
    console.log(`  ${p.tipo.padEnd(10)} ${p.nome.slice(0, 30).padEnd(32)} ERRORE: ${errore.slice(0, 60)}`);
    continue;
  }

  if (offerte.length === 0) {
    console.log(`  ${p.tipo.padEnd(10)} ${p.nome.slice(0, 30).padEnd(32)} nessuna offerta  (${secondi}s)`);
    continue;
  }

  trovati++;
  perTipo[p.tipo]++;
  console.log(`  ${p.tipo.padEnd(10)} ${p.nome.slice(0, 30).padEnd(32)} ${offerte.length} offerte  (${secondi}s)`);
  for (const o of offerte) {
    console.log(
      `             ${String(o.prezzo).padStart(7)} ${o.valuta}  ${String(o.nome).slice(0, 52)}`,
    );
    console.log(`             ${String(o.link).slice(0, 78)}`);
  }
}

console.log(`\n  ${trovati}/${PRODOTTI.length} prodotti con almeno un'offerta`);
console.log(`  dispensa ${perTipo.dispensa}/2 · fresco ${perTipo.fresco}/2`);

if (trovati === 0) {
  console.log(`
  Nessuna offerta su nulla. Le cause tipiche, in ordine:
    - le chiavi non sono ancora attive (dopo l'iscrizione ci vuole qualche ora)
    - l'accesso e' stato sospeso per mancanza delle tre vendite
    - il PARTNER_TAG e' di un paese diverso da ${paese}
`);
} else if (perTipo.fresco === 0) {
  console.log(`
  Nota: zero offerte sul fresco. E' il comportamento atteso — Amazon vende la
  dispensa, non carne e latticini. Per quelli restano i supermercati trovati
  dal motore, ed e' il motivo per cui Amazon si AGGIUNGE invece di sostituire.
`);
}
console.log();
