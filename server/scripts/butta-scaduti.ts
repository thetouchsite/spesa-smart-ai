/**
 * Butta le righe di prezzo troppo vecchie. Prende il posto di un indice.
 *
 * PERCHE' NON LO FA PIU' MONGO DA SOLO
 * ------------------------------------
 * Lo faceva un indice TTL su `t`: una riga compiva trenta giorni e spariva,
 * senza che nessuno se ne occupasse. Comodissimo, e costava
 * SETTANTAQUATTRO BYTE PER RIGA — piu' dei settantasei dei dati veri. Su un
 * milione di righe sono sessantasette megabyte; su due milioni sarebbero
 * centoquarantotto, e il piano gratuito ne da' cinquecentododici in tutto.
 *
 * Misurato il 20 settembre, riga per riga:
 *
 *     dati              76 byte
 *     indice _id        63
 *     indice t_1        74      <- solo per la scadenza
 *     indice c_1_t_-1   41
 *     totale           253
 *
 * Togliendo quell'indice si scende a 179 byte. Due milioni di prodotti
 * passano da 506 a 358 megabyte: la differenza fra non starci e starci.
 *
 * IL PREZZO DA PAGARE, DETTO CHIARO
 * ---------------------------------
 * Senza indice, cercare le righe vecchie vuol dire scorrerle tutte. Su un
 * milione e' questione di secondi, una volta al giorno, e nessuno sta
 * aspettando. Ma se questo comando non gira, le righe vecchie non se ne vanno
 * piu' da sole: il TTL era una garanzia, questo e' un promemoria. Per questo
 * `installa-servizi.sh` lo mette nel timer settimanale insieme al rinfresco
 * dei cataloghi.
 *
 *   npx tsx --env-file-if-exists=.env scripts/butta-scaduti.ts           (mostra)
 *   npx tsx --env-file-if-exists=.env scripts/butta-scaduti.ts --scrivi
 *   npx tsx --env-file-if-exists=.env scripts/butta-scaduti.ts --giorni 45 --scrivi
 */

import { prezzi } from "../src/base/db.js";

const scrivi = process.argv.includes("--scrivi");
const arg = (nome: string) =>
  process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : undefined;

/** Trenta giorni: quanto valeva il vecchio indice TTL. */
const GIORNI = Number(arg("--giorni") ?? 30);

const n = (v: number) => v.toLocaleString("it-IT");
const P = await prezzi();
const soglia = new Date(Date.now() - GIORNI * 24 * 60 * 60 * 1000);

const vecchie = await P.countDocuments({ t: { $lt: soglia } } as never);
const tutte = await P.countDocuments({});

console.log("");
console.log(`  righe in magazzino     ${n(tutte).padStart(10)}`);
console.log(`  piu' vecchie di ${String(GIORNI).padStart(3)}gg   ${n(vecchie).padStart(10)}`);
console.log(`  spazio che liberano    ${String(Math.round((vecchie * 179) / 1048576)).padStart(10)} MB circa`);
console.log("");

if (!scrivi) {
  console.log("  Niente e' stato cancellato. Per farlo:  ... butta-scaduti.ts --scrivi");
  console.log("");
  process.exit(0);
}

if (vecchie === 0) {
  console.log("  Niente da buttare.");
  console.log("");
  process.exit(0);
}

const esito = await P.deleteMany({ t: { $lt: soglia } } as never);
console.log(`  cancellate ${n(esito.deletedCount)} righe.`);
console.log("");
process.exit(0);
