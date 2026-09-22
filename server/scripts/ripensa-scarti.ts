/**
 * Riapre il caso delle schede archiviate come «niente prezzo».
 *
 * PERCHE' SERVE
 * -------------
 * Una scheda che si apre e non espone il prezzo finisce fra gli scarti e non
 * si riapre per trenta giorni. E' la regola che ha salvato la raccolta:
 * dieci milioni e mezzo di pagine aperte al giorno per quattro milioni e otto
 * di prezzi voleva dire cinque milioni e mezzo di aperture a vuoto, ripetute
 * all'infinito.
 *
 * Ma quella regola registra un GIUDIZIO, e il giudizio l'ha dato il lettore
 * che c'era quel giorno. Quando il lettore migliora — e in due giorni e'
 * migliorato parecchio: le intestazioni da browser, il JSON-LD letto come
 * JSON invece che a colpi di espressione regolare, il blocco delle spese di
 * spedizione scambiate per prezzo — quel giudizio resta lo stesso, sbagliato,
 * per un mese.
 *
 * Misurato il 21 settembre con la sonda:
 *
 *     PT Continente Online   77.122 scartate · il lettore ne legge 5 su 5
 *     NO Vinmonopolet        35.734 scartate · 5 su 5
 *     FR La Belle Vie        20.502 scartate · 4 su 5
 *     RO Auchan Romania      26.025 scartate · 2 su 5
 *     ZA Checkers Sixty60    93.882 scartate · 2 su 5
 *
 * Quattrocentomila indirizzi chiusi a chiave da decisioni prese da un codice
 * che non c'e' piu'.
 *
 * COME DECIDE
 * -----------
 * Non si fida di niente: apre davvero un campione di schede SCARTATE di
 * quell'insegna e conta quante danno un prezzo adesso. Se ne danno abbastanza,
 * l'archivio di quell'insegna si butta e le schede tornano in coda. Se non ne
 * danno, resta com'e' — e quello e' il caso in cui la regola sta funzionando.
 *
 * PERCHE' UNA SOGLIA E NON «ANCHE UNA SOLA»
 * -----------------------------------------
 * Perche' buttare l'archivio di un'insegna vuol dire rimetterne in coda
 * decine di migliaia, e se il prezzo davvero non c'e' si torna ad aprirle
 * tutte per niente — cioe' a disturbare quel negozio per niente. Una scheda su
 * cinque puo' essere un prodotto tornato disponibile; una su tre e' un'altra
 * cosa.
 *
 *   npx tsx --env-file-if-exists=.env scripts/ripensa-scarti.ts
 *   npx tsx --env-file-if-exists=.env scripts/ripensa-scarti.ts --scrivi
 *   npx tsx --env-file-if-exists=.env scripts/ripensa-scarti.ts --solo Continente --scrivi
 */

import { cataloghi, getDb } from "../src/base/db.js";
import { catalogoSalvato } from "../src/api/catalogo-magazzino.js";
import { assicuraFonti, tutteLeFonti } from "../src/api/catalogo-fonti.js";
import { dimenticaScarti, scartiDi } from "../src/api/scarti.js";
import { improntaUrl } from "../src/api/prezzi-magazzino.js";
import { verifyProductPage } from "../src/api/price-page.js";

const arg = (nome: string) =>
  process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : undefined;
const scrivi = process.argv.includes("--scrivi");
const solo = arg("--solo");
/** Quante schede scartate si aprono per decidere. */
const CAMPIONE = Number(arg("--campione") ?? 12);
/** Quante ne devono dare un prezzo perche' valga la pena riaprire tutto. */
const SOGLIA = Number(arg("--soglia") ?? 0.33);
/** Sotto questo numero di scarti non vale la pena disturbare nessuno. */
const MINIMO = Number(arg("--minimo") ?? 2000);
/** Una richiesta ogni tanto: qui non c'e' fretta e sono negozi veri. */
const PAUSA = Number(arg("--pausa") ?? 1200);

const n = (v: number) => v.toLocaleString("it-IT");
const aspetta = (ms: number) => new Promise((r) => setTimeout(r, ms));

await assicuraFonti();
const C = await cataloghi();

let elenco = tutteLeFonti().filter((f) => f.resa > 0);
if (solo) elenco = elenco.filter((f) => f.insegna.toLowerCase().includes(solo.toLowerCase()));

console.log("");
console.log(`RIPENSO GLI SCARTI · ${CAMPIONE} schede per insegna, soglia ${Math.round(SOGLIA * 100)}%`);
console.log("");

let liberati = 0;
const riaperte: string[] = [];

for (const f of elenco) {
  const scartate = await scartiDi(f.insegna, f.paese);
  if (scartate.size < MINIMO) continue;

  const doc = (await C.findOne(
    { _id: `${f.paese}|${f.insegna}` } as never,
    { projection: { prodotti: 1 } },
  )) as { prodotti?: number } | null;
  if (!doc) continue;

  const voci = await catalogoSalvato(f.paese, f.insegna);
  if (!voci) {
    console.log(`  ${(f.paese + "|" + f.insegna).padEnd(28)} catalogo non leggibile, salto`);
    continue;
  }

  /* IL CAMPIONE SI PRENDE FRA LE SCARTATE, NON FRA TUTTE.
     Aprendo schede a caso del catalogo si misurerebbe la resa dell'insegna,
     che sappiamo gia'. La domanda qui e' un'altra: proprio quelle che
     avevamo dichiarato senza prezzo, ce l'hanno? */
  const daProvare = voci.filter((v) => scartate.has(improntaUrl(v.url)));
  if (daProvare.length === 0) continue;

  /* Sparse per tutto l'elenco: le prime mille di un catalogo sono spesso
     una categoria sola, e una categoria non descrive l'insegna. */
  const passo = Math.max(1, Math.floor(daProvare.length / CAMPIONE));
  const campione = [];
  for (let i = 0; i < daProvare.length && campione.length < CAMPIONE; i += passo) {
    campione.push(daProvare[i]);
  }

  process.stdout.write(`  ${(f.paese + "|" + f.insegna).padEnd(28)} ${n(scartate.size).padStart(7)} scartate · provo ${campione.length} ...`);

  let con = 0;
  let rifiuti = 0;
  for (const x of campione) {
    const v = await verifyProductPage(x.url);
    if (v.page?.current != null) con++;
    else if (v.status === "bloccato") rifiuti++;
    await aspetta(PAUSA);
  }

  const quota = con / campione.length;
  const esito = `${con}/${campione.length} con prezzo`;

  /* UN'INSEGNA CHE CI RIFIUTA NON SI GIUDICA.
     Se meta' del campione torna «bloccato», quel che abbiamo misurato non e'
     se il prezzo c'e': e' che in questo momento non ci parlano. Buttare
     l'archivio su quella base rimetterebbe in coda decine di migliaia di
     schede da mandare a un sito che ci sta gia' dicendo di no. */
  if (rifiuti >= campione.length / 2) {
    console.log(`\r  ${(f.paese + "|" + f.insegna).padEnd(28)} ${n(scartate.size).padStart(7)} scartate · ${esito} · ${rifiuti} RIFIUTI: non giudico`);
    continue;
  }

  if (quota < SOGLIA) {
    console.log(`\r  ${(f.paese + "|" + f.insegna).padEnd(28)} ${n(scartate.size).padStart(7)} scartate · ${esito} · la regola funziona, lascio`);
    continue;
  }

  console.log(
    `\r  ${(f.paese + "|" + f.insegna).padEnd(28)} ${n(scartate.size).padStart(7)} scartate · ${esito} · ` +
      `DA RIAPRIRE${scrivi ? "" : " (prova a vuoto)"}`,
  );
  liberati += scartate.size;
  riaperte.push(`${f.paese}|${f.insegna}`);

  if (!scrivi) continue;

  /* Un documento solo per insegna — `PAESE|Insegna`, vedi `scartiDi`. Niente
     regex: qui una regex sarebbe un modo elaborato di cancellare per _id, con
     in piu' il rischio di prendere anche l'insegna che si chiama come questa
     piu' qualcosa. */
  await (await getDb()).collection("scarti").deleteOne({ _id: `${f.paese}|${f.insegna}` } as never);
  dimenticaScarti(f.insegna, f.paese);
}

console.log("");
console.log(`  ${riaperte.length} insegne · ${n(liberati)} schede tornano in coda`);
if (!scrivi && liberati > 0) {
  console.log("");
  console.log("  Niente e' stato toccato. Per farlo:  ... ripensa-scarti.ts --scrivi");
}
console.log("");
process.exit(0);
