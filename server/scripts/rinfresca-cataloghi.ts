/**
 * Rifa' gli indirizzi dei cataloghi invecchiati. E' quello che gira da solo.
 *
 * PERCHE' UN CATALOGO INVECCHIA
 * -----------------------------
 * Perche' i negozi aggiungono e tolgono prodotti in continuazione. Un elenco
 * di indirizzi di sei mesi fa manda il lettore ad aprire pagine che non ci
 * sono piu': tempo speso, richieste fatte ai negozi per niente, e schede
 * segnate come «senza prezzo» che un prezzo ce l'avevano — semplicemente non
 * stanno piu' li'.
 *
 * L'effetto e' subdolo: la copertura sembra scendere da sola col passare dei
 * mesi e non si capisce perche'. Non e' il lettore che rallenta, e' l'elenco
 * che invecchia sotto.
 *
 * PERCHE' SOLO I VECCHI
 * ---------------------
 * Perche' rifarli tutti ogni domenica vorrebbe dire percorrere due milioni di
 * indirizzi per scoprire che quasi nessuno e' cambiato. Si guarda la data di
 * ognuno e si toccano solo quelli che l'hanno vecchia: il lavoro si spalma da
 * solo, e ogni catalogo finisce per essere rifatto una volta al mese circa
 * senza che nessuno debba tenerne il conto.
 *
 *   npx tsx --env-file-if-exists=.env scripts/rinfresca-cataloghi.ts
 *   npx tsx --env-file-if-exists=.env scripts/rinfresca-cataloghi.ts --giorni 7
 *   npx tsx --env-file-if-exists=.env scripts/rinfresca-cataloghi.ts --quante 20
 */

import { assicuraFonti, tutteLeFonti } from "../src/api/catalogo-fonti.js";
import { daUnaFonte } from "../src/api/catalogo.js";
import { salvaCatalogo } from "../src/api/catalogo-magazzino.js";
import { cataloghi } from "../src/base/db.js";

const arg = (nome: string) =>
  process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : undefined;

/** Oltre questa eta', un catalogo si rifa'. */
const GIORNI = Number(arg("--giorni") ?? 30);

/**
 * Quante insegne per volta.
 *
 * Un tetto c'e' perche' questo gira da solo di notte: se un giorno ne
 * risultassero vecchie centoventi tutte insieme, senza freno la macchina ci
 * passerebbe l'intera giornata e il lettore resterebbe fermo dietro. Meglio
 * venti a settimana, sempre, che tutto in una volta ogni tanto.
 */
const QUANTE = Number(arg("--quante") ?? 20);

await assicuraFonti();
const fonti = tutteLeFonti();

const salvati = (await (await cataloghi())
  .find({})
  .project({ paese: 1, insegna: 1, prodotti: 1, aggiornato: 1 })
  .toArray()) as Array<{ paese?: string; insegna?: string; prodotti?: number; aggiornato?: Date }>;

const quando = new Map<string, Date>();
for (const c of salvati) quando.set(`${c.paese}|${c.insegna}`, c.aggiornato ?? new Date(0));

const limite = Date.now() - GIORNI * 24 * 60 * 60 * 1000;

/* Prima i piu' vecchi. Un catalogo mai raccolto conta come vecchissimo: e'
   il caso delle insegne appena aggiunte dalla caccia, che altrimenti
   resterebbero in fondo alla fila dietro a quelle solo un po' stantie. */
const daFare = fonti
  .map((f) => ({ f, quando: quando.get(`${f.paese}|${f.insegna}`)?.getTime() ?? 0 }))
  .filter((x) => x.quando < limite)
  .sort((a, b) => a.quando - b.quando)
  .slice(0, QUANTE);

const n = (v: number) => v.toLocaleString("it-IT");

if (daFare.length === 0) {
  console.log(`[rinfresco] nessun catalogo piu' vecchio di ${GIORNI} giorni. Niente da fare.`);
  process.exit(0);
}

console.log(`[rinfresco] ${daFare.length} cataloghi piu' vecchi di ${GIORNI} giorni`);

let totale = 0;
let fatti = 0;

for (const { f, quando: q } of daFare) {
  const eta = q === 0 ? "mai raccolto" : `del ${new Date(q).toLocaleDateString("it-IT")}`;
  try {
    const voci = await daUnaFonte(f);
    if (voci.length === 0) {
      /* NON SI CANCELLA IL VECCHIO QUANDO IL NUOVO E' VUOTO.
         Una sitemap che oggi non risponde non vuol dire che il negozio abbia
         chiuso: vuol dire che oggi non risponde. Sostituire un catalogo buono
         con niente, in silenzio e di notte, e' il modo piu' rapido di perdere
         ventimila indirizzi per un guasto di rete durato un minuto. */
      console.log(`[rinfresco] ${f.paese}|${f.insegna} (${eta}): niente indirizzi, tengo il vecchio`);
      continue;
    }
    await salvaCatalogo(
      f.paese,
      f.insegna,
      voci.map((v) => ({ url: v.url, nome: v.nome })),
    );
    totale += voci.length;
    fatti++;
    console.log(`[rinfresco] ${f.paese}|${f.insegna} (${eta}): ${n(voci.length)} indirizzi`);
  } catch (err) {
    console.log(
      `[rinfresco] ${f.paese}|${f.insegna} (${eta}): non riuscito — ${err instanceof Error ? err.message : err}`,
    );
  }
}

console.log(`[rinfresco] finito: ${fatti} cataloghi rifatti, ${n(totale)} indirizzi`);
process.exit(0);
