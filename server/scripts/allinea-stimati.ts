/**
 * Allinea `stimati` e `resa` delle fonti ai conteggi misurati. Sul database.
 *
 * PERCHE'
 * -------
 * `stimati` e' quanti indirizzi un'insegna pubblica davvero. Finche' e' stato
 * scritto a mano, ha detto altro: il 16 settembre 2026 l'elenco dichiarava
 * 1.902.334 prodotti dove il magazzino ne serviva 1.716.324, e dentro c'era
 * Carrefour Brasile a 80.000 prodotti mentre il suo catalogo non esisteva
 * nemmeno.
 *
 * Un elenco che sovrastima manda il lavoro notturno a cercare cose che non
 * esistono, e fa promettere a noi una copertura che non abbiamo.
 *
 * SCRIVE SUL DATABASE, NON NEL CODICE
 * -----------------------------------
 * Prima questo script riscriveva `catalogo-fonti.ts`, e per vedere l'effetto
 * bisognava rilasciare. Adesso le fonti stanno su Mongo e il lavoro notturno
 * le rilegge a ogni giro: una resa corretta stanotte vale stanotte.
 *
 * COSA NON TOCCA, E PERCHE'
 * -------------------------
 * `daUnaFonte` si ferma a 50.000 voci per insegna. Per chi arriva a quel tetto
 * il numero misurato non e' un conteggio: e' il tetto. Naturitas pubblica
 * 108.646 schede e la misura dice 50.000 — abbassarla sarebbe scrivere una
 * bugia piu' piccola al posto di una verita' scomoda.
 *
 * Non tocca nemmeno chi ha misurato ZERO ma prima aveva un numero: puo' essere
 * il negozio che quel giorno non ha risposto. Va guardato a mano — e quando e'
 * vero va TOLTO, non azzerato, perche' una fonte a zero occupa un posto lo
 * stesso. Di quattro guardate a mano il 16 settembre, tre puntavano alla
 * sitemap sbagliata e una sola era davvero inutilizzabile.
 *
 * Uso:
 *   npx tsx --env-file-if-exists=.env scripts/allinea-stimati.ts          mostra
 *   npx tsx --env-file-if-exists=.env scripts/allinea-stimati.ts --vai    scrive
 */

import { readFileSync } from "node:fs";
import { fonti } from "../src/base/db.js";
import { caricaFontiDalDb, tutteLeFonti } from "../src/api/catalogo-fonti.js";

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

const n = (x: number) => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

async function main() {
  const vai = process.argv.includes("--vai");
  const conteggi: Conteggio[] = JSON.parse(readFileSync("diario/conteggio.json", "utf8"));

  if ((await caricaFontiDalDb()) === 0) {
    console.error("  il database non ha insegne: non c'e' niente da allineare");
    process.exit(1);
  }
  const elenco = tutteLeFonti();
  const c = await fonti();

  const daCambiare: Array<{ x: Conteggio; vecchio: number }> = [];
  const alTetto: Conteggio[] = [];
  const azzerate: Conteggio[] = [];
  const nonInElenco: Conteggio[] = [];

  for (const x of conteggi) {
    const f = elenco.find((y) => y.paese === x.paese && y.insegna === x.insegna);
    if (!f) {
      nonInElenco.push(x);
      continue;
    }
    if (x.link >= TETTO_INSEGNA) {
      alTetto.push(x);
      continue;
    }
    if (x.link === 0 && f.stimati > 0) {
      azzerate.push(x);
      continue;
    }
    /* Sotto il cinque per cento e' rumore: un negozio aggiunge e toglie
       prodotti ogni giorno, e riscrivere per quello e' solo chiasso. */
    if (Math.abs(x.link - f.stimati) < Math.max(100, f.stimati * 0.05)) continue;
    daCambiare.push({ x, vecchio: f.stimati });
  }

  console.log(`\n  DA CORREGGERE (${daCambiare.length})`);
  let saldo = 0;
  for (const { x, vecchio } of daCambiare.sort(
    (a, b) => Math.abs(b.x.link - b.vecchio) - Math.abs(a.x.link - a.vecchio),
  )) {
    const d = x.link - vecchio;
    saldo += d;
    console.log(
      `    ${x.paese}  ${x.insegna.padEnd(24).slice(0, 24)} ` +
        `${n(vecchio).padStart(8)} → ${n(x.link).padStart(8)}  ${d > 0 ? "+" : ""}${n(d)}`,
    );
  }
  console.log(`    saldo ${saldo > 0 ? "+" : ""}${n(saldo)}`);

  console.log(`\n  AL TETTO, NON SI TOCCANO (${alTetto.length}) — il misurato e' il tetto, non il catalogo`);
  for (const x of alTetto) console.log(`    ${x.paese}  ${x.insegna}`);

  console.log(`\n  MISURATE A ZERO, DA GUARDARE A MANO (${azzerate.length})`);
  for (const x of azzerate) {
    console.log(`    ${x.paese}  ${x.insegna.padEnd(24).slice(0, 24)} scritte ${n(x.stimatiPrima)}`);
  }

  if (nonInElenco.length) {
    console.log(
      `\n  contate ma non piu' in elenco (${nonInElenco.length}): ` +
        nonInElenco.map((x) => `${x.paese} ${x.insegna}`).join(", "),
    );
  }

  if (!vai) {
    console.log("\n  PROVA A VUOTO. Per scrivere: --vai\n");
    process.exit(0);
  }

  let scritte = 0;
  for (const { x } of daCambiare) {
    const esito = await c.updateOne(
      { _id: `${x.paese}|${x.insegna}` },
      { $set: { stimati: x.link, aggiornato: new Date() } },
    );
    if (esito.matchedCount > 0) scritte++;
    else console.log(`    ! non trovata sul database: ${x.paese} ${x.insegna}`);
  }
  console.log(`\n  ${scritte} fonti aggiornate sul database\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
