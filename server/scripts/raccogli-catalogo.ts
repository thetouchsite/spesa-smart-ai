/**
 * Rifa' il catalogo di un paese, insegna per insegna.
 *
 * PERCHE' NON BASTA CARICARE IL PAESE
 * -----------------------------------
 * Perche' caricare un paese serve a RISPONDERE a un utente, e per quello c'e'
 * un tetto: duecentomila voci, oltre le quali il caricamento si ferma a meta'
 * per non far cadere il server. Ottima regola quando qualcuno aspetta; pessima
 * quando il lavoro e' proprio raccogliere — le insegne in coda non verrebbero
 * prese mai, e si concluderebbe che non hanno catalogo.
 *
 * Qui non c'e' nessuno che aspetta. Si va una insegna per volta, si salva
 * subito, e la memoria si libera prima della prossima.
 *
 * QUANDO SERVE
 * ------------
 *   · dopo `caccia-insegne --scrivi`, per andare a prendere davvero il
 *     catalogo delle insegne appena aggiunte
 *   · quando un'insegna cambia sito e il catalogo vecchio non vale piu'
 *   · ogni tanto, perche' i negozi aggiungono e tolgono prodotti
 *
 *   npx tsx --env-file-if-exists=.env scripts/raccogli-catalogo.ts IT
 *   npx tsx --env-file-if-exists=.env scripts/raccogli-catalogo.ts IT --solo "Todis"
 *   npx tsx --env-file-if-exists=.env scripts/raccogli-catalogo.ts IT --nuove
 */

import { assicuraFonti, fontiDi } from "../src/api/catalogo-fonti.js";
import { daUnaFonte } from "../src/api/catalogo.js";
import { salvaCatalogo } from "../src/api/catalogo-magazzino.js";
import { cataloghi } from "../src/base/db.js";

const paese = (process.argv[2] ?? "").toUpperCase();
const soloNuove = process.argv.includes("--nuove");
const arg = (nome: string) =>
  process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : undefined;
const solo = arg("--solo");

if (!paese) {
  console.error("");
  console.error("  Serve il paese:  scripts/raccogli-catalogo.ts IT");
  console.error("");
  process.exit(1);
}

await assicuraFonti();
let elenco = fontiDi(paese);

if (solo) elenco = elenco.filter((f) => f.insegna.toLowerCase().includes(solo.toLowerCase()));

if (soloNuove) {
  /* «Nuove» vuol dire senza catalogo in magazzino, non «aggiunte di recente»:
     e' la condizione che conta, ed e' l'unica verificabile. */
  const gia = new Set(
    ((await (await cataloghi()).find({ paese }).project({ insegna: 1 }).toArray()) as Array<{
      insegna?: string;
    }>).map((x) => String(x.insegna ?? "")),
  );
  elenco = elenco.filter((f) => !gia.has(f.insegna));
}

if (elenco.length === 0) {
  console.log("");
  console.log(`Nessuna insegna da raccogliere per ${paese}.`);
  console.log("");
  process.exit(0);
}

const n = (v: number) => v.toLocaleString("it-IT");
console.log("");
console.log(`RACCOLTA ${paese} · ${elenco.length} insegne`);
console.log("");

let totale = 0;
let fatte = 0;
const partito = Date.now();

for (const f of elenco) {
  const eti = `  ${f.insegna.padEnd(26).slice(0, 26)}`;
  process.stdout.write(`${eti} ...`);
  try {
    const voci = await daUnaFonte(f);
    if (voci.length === 0) {
      console.log(`\r${eti} niente: la sitemap non da' schede prodotto`);
      continue;
    }
    await salvaCatalogo(
      paese,
      f.insegna,
      voci.map((v) => ({ url: v.url, nome: v.nome })),
    );
    totale += voci.length;
    fatte++;
    console.log(`\r${eti} ${n(voci.length).padStart(8)} indirizzi salvati`);
  } catch (err) {
    console.log(`\r${eti} non riuscita: ${err instanceof Error ? err.message : err}`);
  }
}

const minuti = Math.round((Date.now() - partito) / 60000);
console.log("");
console.log(`${fatte} insegne su ${elenco.length} · ${n(totale)} indirizzi · ${minuti} minuti`);
console.log("");
console.log("Adesso c'e' da leggerne i prezzi:");
console.log(`  npx tsx --env-file-if-exists=.env scripts/lettore.ts --solo ${paese} --paesi 1`);
console.log("");
process.exit(0);
