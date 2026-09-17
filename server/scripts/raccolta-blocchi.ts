/**
 * Riempie il magazzino usando le API che rispondono a blocchi.
 *
 * Il conto sta in `src/api/prezzi-blocchi.ts`: cento prodotti prezzati per
 * chiamata invece di uno per pagina. Qui si sceglie con quali parole cercare —
 * le voci della spesa di base, nella lingua del negozio.
 *
 * Uso:
 *   npx tsx --env-file-if-exists=.env scripts/raccolta-blocchi.ts
 *   npx tsx --env-file-if-exists=.env scripts/raccolta-blocchi.ts --solo Consum
 */

import { LETTORI_A_BLOCCHI, raccogliABlocchi } from "../src/api/prezzi-blocchi.js";
import { paroleDellaSpesa } from "../src/api/prezzi-notturni.js";
import { statoMagazzino } from "../src/api/prezzi-magazzino.js";

const n = (x: number) => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

async function main() {
  const solo = process.argv.includes("--solo")
    ? process.argv[process.argv.indexOf("--solo") + 1]
    : null;

  console.log("prima:", await statoMagazzino());
  const inizio = Date.now();
  let totChiamate = 0;
  let totPrezzi = 0;

  for (const l of LETTORI_A_BLOCCHI) {
    if (solo && l.insegna !== solo) continue;
    const parole = paroleDellaSpesa(l.paese);
    if (parole.length === 0) {
      console.log(`${l.insegna}  nessuna parola per ${l.paese}`);
      continue;
    }
    process.stdout.write(`${l.insegna} (${l.paese})  ${parole.length} parole... `);
    const esito = await raccogliABlocchi(l, parole);
    totChiamate += esito.chiamate;
    totPrezzi += esito.prezzi;
    console.log(`${esito.chiamate} chiamate → ${n(esito.prezzi)} prezzi`);
  }

  const secondi = (Date.now() - inizio) / 1000;
  console.log(
    `\n  ${totChiamate} chiamate → ${n(totPrezzi)} prezzi in ${secondi.toFixed(0)}s ` +
      `(${(totPrezzi / Math.max(1, totChiamate)).toFixed(0)} prezzi per chiamata)`,
  );
  console.log("dopo:", await statoMagazzino());
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
