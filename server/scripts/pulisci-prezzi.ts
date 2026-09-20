/**
 * Spazio su Mongo: quello che si puo' buttare senza perdere niente.
 *
 * PERCHE' ADESSO CONTA
 * --------------------
 * Restano 1.426.885 indirizzi da aprire e servono circa 387 MB. Liberi ce ne
 * sono 249. Il lettore arriverebbe a poco piu' di meta' strada e poi si
 * fermerebbe con il database pieno — e un database pieno non e' un errore che
 * si legge da qualche parte: e' l'app che smette di funzionare.
 *
 * DUE COSE DA BUTTARE, E TUTTE E DUE SONO GIA' MORTE
 * --------------------------------------------------
 *   LE RIGHE DEL VECCHIO FORMATO. Ottomilaottocentosessantaquattro righe
 *   portano ancora `scadeIl` e `visto` invece di `t`. Il codice interroga `t`,
 *   quindi nessuna query le trova: occupano posto e non rispondono a nessuno.
 *   Le stesse schede verranno riaperte e riscritte nel formato nuovo.
 *
 *   I DUE INDICI CHE LE SERVIVANO. `scadeIl_1` e `visto_-1`, undici megabyte
 *   per ordinare campi che dopo questa pulizia non esistono piu' in nessun
 *   documento. Un indice non usato non e' gratis: pesa, e rallenta ogni
 *   scrittura perche' va aggiornato lo stesso.
 *
 *   npx tsx --env-file-if-exists=.env scripts/pulisci-prezzi.ts           (mostra)
 *   npx tsx --env-file-if-exists=.env scripts/pulisci-prezzi.ts --scrivi  (fa)
 */

import { prezzi } from "../src/base/db.js";

const scrivi = process.argv.includes("--scrivi");
const n = (v: number) => v.toLocaleString("it-IT");
const P = await prezzi();

const spazio = async () => {
  const s = (await (P as unknown as { s: { db: { command: (c: object) => Promise<Record<string, number>> } } }).s.db.command({
    collStats: "prezzi",
    scale: 1024 * 1024,
  })) as { size: number; totalIndexSize: number };
  return { dati: Math.round(s.size), indici: Math.round(s.totalIndexSize) };
};

const prima = await spazio();
const vecchie = await P.countDocuments({ t: { $exists: false } });
const nuove = await P.countDocuments({ t: { $exists: true } });

console.log("");
console.log(`  righe nel formato nuovo (t)      ${n(nuove).padStart(10)}`);
console.log(`  righe nel formato vecchio        ${n(vecchie).padStart(10)}   <- nessuna query le trova`);
console.log("");
console.log(`  dati    ${prima.dati} MB`);
console.log(`  indici  ${prima.indici} MB`);
console.log("");

const indici = await P.indexes();
const morti = indici
  .map((i) => String(i.name))
  .filter((nome) => nome === "scadeIl_1" || nome === "visto_-1");

console.log(`  indici da togliere: ${morti.length > 0 ? morti.join(", ") : "nessuno"}`);
console.log("");

if (!scrivi) {
  console.log("  Niente e' stato toccato. Per farlo davvero:  ... pulisci-prezzi.ts --scrivi");
  console.log("");
  process.exit(0);
}

/* PRIMA LE RIGHE, POI GLI INDICI.
   Al contrario si cancellerebbero ottomila righe senza l'indice che le trova:
   una scansione dell'intera collezione invece di una lettura mirata. */
if (vecchie > 0) {
  const esito = await P.deleteMany({ t: { $exists: false } });
  console.log(`  cancellate ${n(esito.deletedCount)} righe del vecchio formato`);
}

for (const nome of morti) {
  await P.dropIndex(nome);
  console.log(`  tolto l'indice ${nome}`);
}

const dopo = await spazio();
console.log("");
console.log(`  dati    ${prima.dati} MB  →  ${dopo.dati} MB`);
console.log(`  indici  ${prima.indici} MB  →  ${dopo.indici} MB`);
console.log(`  liberati ${prima.dati + prima.indici - dopo.dati - dopo.indici} MB`);
console.log("");
process.exit(0);
