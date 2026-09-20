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

import { gzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { assicuraFonti, fontiDi } from "../src/api/catalogo-fonti.js";
import { daUnaFonte } from "../src/api/catalogo.js";
import { salvaCatalogo } from "../src/api/catalogo-magazzino.js";
import { cataloghi } from "../src/base/db.js";

/**
 * Quando il database e' pieno, il catalogo si mette sul disco.
 *
 * PERCHE' NON BASTA FALLIRE
 * -------------------------
 * Atlas nel piano gratuito da' cinquecentododici megabyte, e a duecentosettanta
 * byte per riga di prezzo quel tetto arriva. Il momento in cui arriva e'
 * pessimo: la raccolta ha gia' percorso l'intero albero delle sitemap di
 * un'insegna — che sono minuti di lavoro e migliaia di richieste al negozio —
 * e perdere quel risultato perche' non c'e' posto dove scriverlo vorrebbe dire
 * rifarlo da capo domani, disturbando due volte lo stesso sito per niente.
 *
 * Il disco invece ce l'abbiamo. Il formato e' quello che `carica-catalogo-db`
 * gia' sa rileggere — un indirizzo per riga, compresso, `PAESE-Insegna.txt.gz`
 * — quindi quando lo spazio ci sara' il travaso e' un comando solo.
 *
 * NON E' UN RIPIEGO SILENZIOSO
 * ----------------------------
 * Si dice a schermo, ogni volta. Un catalogo che sta sul disco e non sul
 * database il lettore non lo vede: e' raccolto ma non ancora in servizio, e
 * chi guarda i numeri deve sapere che quella differenza esiste.
 */
const SUL_DISCO = "diario/raccolto";

function salvaSulDisco(paese: string, insegna: string, url: string[]): string {
  mkdirSync(SUL_DISCO, { recursive: true });
  const nome = `${paese}-${insegna.replace(/[^\p{L}\p{N}]+/gu, "_")}.txt.gz`;
  writeFileSync(`${SUL_DISCO}/${nome}`, gzipSync(Buffer.from(url.join("\n"), "utf8"), { level: 6 }));
  return nome;
}

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
let sulDisco = 0;
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
    try {
      await salvaCatalogo(
        paese,
        f.insegna,
        voci.map((v) => ({ url: v.url, nome: v.nome })),
      );
      console.log(`\r${eti} ${n(voci.length).padStart(8)} indirizzi salvati`);
    } catch (err) {
      /* Quasi sempre e' lo spazio finito. Qualunque sia il motivo, il lavoro
         appena fatto non si butta: va sul disco e lo si dice. */
      const nome = salvaSulDisco(paese, f.insegna, voci.map((v) => v.url));
      sulDisco++;
      console.log(
        `\r${eti} ${n(voci.length).padStart(8)} indirizzi SUL DISCO (${nome})` +
          `\n${" ".repeat(28)} il database non li ha presi: ${err instanceof Error ? err.message.slice(0, 60) : err}`,
      );
    }
    totale += voci.length;
    fatte++;
  } catch (err) {
    console.log(`\r${eti} non riuscita: ${err instanceof Error ? err.message : err}`);
  }
}

const minuti = Math.round((Date.now() - partito) / 60000);
console.log("");
console.log(`${fatte} insegne su ${elenco.length} · ${n(totale)} indirizzi · ${minuti} minuti`);
if (sulDisco > 0) {
  console.log("");
  console.log(`  ATTENZIONE: ${sulDisco} cataloghi sono finiti su ${SUL_DISCO}, non sul database.`);
  console.log("  Il lettore non li vede: sono raccolti ma non in servizio.");
  console.log("  Quando c'e' spazio:  npx tsx --env-file-if-exists=.env scripts/carica-catalogo-db.ts");
}
console.log("");
console.log("Adesso c'e' da leggerne i prezzi:");
console.log(`  npx tsx --env-file-if-exists=.env scripts/lettore.ts --solo ${paese} --paesi 1`);
console.log("");
process.exit(0);
