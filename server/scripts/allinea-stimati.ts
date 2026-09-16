/**
 * Allinea il campo `stimati` di `catalogo-fonti.ts` ai conteggi misurati.
 *
 * PERCHE'
 * -------
 * `stimati` e' scritto a mano, e a fine giornata i tre numeri che dovrebbero
 * dire la stessa cosa non si assomigliavano nemmeno:
 *
 *   elenco (`stimati`, a mano)   1.902.334
 *   misurato da `conta-tutto`    1.422.018
 *   servibile dal database       1.764.033
 *
 * Il primo e' il piu' alto ed e' il meno affidabile: dentro c'e' Carrefour
 * Brasile scritto a 80.000 prodotti che oggi ne pubblica ZERO. Un elenco che
 * sovrastima manda il lavoro notturno a cercare cose che non esistono e fa
 * promettere a noi una copertura che non abbiamo.
 *
 * COSA NON SI TOCCA, E PERCHE'
 * ----------------------------
 * `daUnaFonte` si ferma a 50.000 voci per insegna. Quindi per chi arriva a
 * quel tetto il numero misurato non e' un conteggio: e' il tetto. Naturitas
 * pubblica 108.646 schede e la misura dice 50.000 — abbassarla a 50.000
 * sarebbe scrivere una bugia piu' piccola al posto di una verita' scomoda.
 * Quelle righe restano come sono, e vengono elencate a parte.
 *
 * Non si tocca nemmeno chi ha misurato ZERO ma prima aveva un numero: puo'
 * essere il negozio che quel giorno non ha risposto. Va guardato a mano — e
 * quando e' vero (Carrefour Brasile) va tolto, non azzerato, perche' una
 * fonte a zero occupa comunque un posto nell'elenco.
 *
 * Uso:
 *   npx tsx scripts/allinea-stimati.ts          mostra e basta
 *   npx tsx scripts/allinea-stimati.ts --vai    scrive nel file
 */

import { readFileSync, writeFileSync } from "node:fs";
import { FONTI } from "../src/api/catalogo-fonti.js";

/** Lo stesso tetto di `daUnaFonte`: oltre, il conteggio non e' un conteggio. */
const TETTO_INSEGNA = 50_000;

interface Conteggio {
  paese: string;
  insegna: string;
  link: number;
  stimatiPrima: number;
  campione: number;
  conPrezzo: number;
}

const conteggi: Conteggio[] = JSON.parse(readFileSync("diario/conteggio.json", "utf8"));
const percorso = "src/api/catalogo-fonti.ts";
let file = readFileSync(percorso, "utf8");

const n = (x: number) => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const daCambiare: Array<{ c: Conteggio; vecchio: number }> = [];
const alTetto: Conteggio[] = [];
const azzerate: Conteggio[] = [];
const nonInElenco: Conteggio[] = [];

for (const c of conteggi) {
  const f = FONTI.find((x) => x.paese === c.paese && x.insegna === c.insegna);
  if (!f) {
    nonInElenco.push(c);
    continue;
  }
  if (c.link >= TETTO_INSEGNA) {
    alTetto.push(c);
    continue;
  }
  if (c.link === 0 && f.stimati > 0) {
    azzerate.push(c);
    continue;
  }
  /* Sotto il cinque per cento e' rumore: un negozio aggiunge e toglie
     prodotti ogni giorno, e riscrivere il file per quello e' solo chiasso. */
  if (Math.abs(c.link - f.stimati) < Math.max(100, f.stimati * 0.05)) continue;
  daCambiare.push({ c, vecchio: f.stimati });
}

console.log(`\n  DA CORREGGERE (${daCambiare.length})`);
let saldo = 0;
for (const { c, vecchio } of daCambiare.sort((a, b) => Math.abs(b.c.link - b.vecchio) - Math.abs(a.c.link - a.vecchio))) {
  const d = c.link - vecchio;
  saldo += d;
  console.log(`    ${c.paese}  ${c.insegna.padEnd(24).slice(0, 24)} ${n(vecchio).padStart(8)} → ${n(c.link).padStart(8)}  ${d > 0 ? "+" : ""}${n(d)}`);
}
console.log(`    saldo ${saldo > 0 ? "+" : ""}${n(saldo)}`);

console.log(`\n  AL TETTO, NON SI TOCCANO (${alTetto.length}) — il numero misurato e' il tetto, non il catalogo`);
for (const c of alTetto) console.log(`    ${c.paese}  ${c.insegna}`);

console.log(`\n  MISURATE A ZERO, DA GUARDARE A MANO (${azzerate.length})`);
for (const c of azzerate) console.log(`    ${c.paese}  ${c.insegna.padEnd(24).slice(0, 24)} scritte ${n(c.stimatiPrima)}`);

if (nonInElenco.length) {
  console.log(`\n  contate ma non piu' in elenco (${nonInElenco.length}): ${nonInElenco.map((c) => `${c.paese} ${c.insegna}`).join(", ")}`);
}

if (!process.argv.includes("--vai")) {
  console.log("\n  PROVA A VUOTO. Per scrivere: --vai\n");
  process.exit(0);
}

let scritte = 0;
for (const { c } of daCambiare) {
  /* Si cerca la riga per paese e insegna, e si cambia SOLO `stimati`. Una
     sostituzione piu' larga rischierebbe di toccare la resa, che e' misurata
     in un altro modo e non c'entra niente. */
  const cerca = new RegExp(
    `(\\{ paese: "${c.paese}", insegna: "${c.insegna.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^\\n]*?stimati: )(\\d+)( \\})`,
  );
  if (!cerca.test(file)) {
    console.log(`    ! non trovata nel file: ${c.paese} ${c.insegna}`);
    continue;
  }
  file = file.replace(cerca, `$1${c.link}$3`);
  scritte++;
}
writeFileSync(percorso, file, "utf8");
console.log(`\n  ${scritte} righe riscritte in ${percorso}\n`);
