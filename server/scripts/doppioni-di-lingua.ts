/**
 * Lo stesso prodotto, contato una volta per lingua.
 *
 * COSA HO TROVATO
 * ---------------
 * Xtrawine dichiara 104.961 indirizzi. Sono 26.475 prodotti: lo stesso vino
 * pubblicato sotto tredici prefissi di lingua.
 *
 *     /products/elio-grasso-barolo-riserva      24.602 indirizzi senza prefisso
 *     /it/products/...                           7.204
 *     /en-hk/products/...                        8.699
 *     /de-ch/, /fr-ch/, /it-ch/, /en-uk/ ...     6.700 ciascuno
 *
 * Leggerli tutti avrebbe aggiunto settantottomila prodotti al totale. Nessuno
 * inventato: ogni riga con un prezzo vero, letto da una pagina vera. E tutte
 * quante lo STESSO vino. Il numero sarebbe cresciuto e il catalogo no.
 *
 * E' il difetto peggiore che conosca, perche' non lascia tracce: niente
 * errori, niente righe rosse, solo un totale che sale e un cliente che apre
 * l'API e trova tredici volte il Barolo.
 *
 * COME SI SCEGLIE QUALE TENERE
 * ----------------------------
 * Si toglie il prefisso e si guarda cosa resta: due indirizzi che dopo il
 * taglio sono uguali sono lo stesso prodotto. Fra i doppioni si tiene UNO, e
 * l'ordine di preferenza e':
 *
 *   1. la lingua del paese del catalogo (`it` per l'Italia)
 *   2. l'indirizzo senza prefisso, che di solito e' quello canonico
 *   3. il primo che capita, in ordine, cosi' due esecuzioni danno lo stesso
 *      risultato
 *
 * PERCHE' NON LO DECIDE IL `<link rel=canonical>`
 * -----------------------------------------------
 * Perche' sarebbe la risposta giusta e costa una richiesta per prodotto: su
 * centomila indirizzi sono centomila pagine aperte per scoprire cosa buttare.
 * Il prefisso si legge dall'indirizzo e costa niente. Se un giorno un negozio
 * usa i prefissi per prodotti DAVVERO diversi, questo comando sbagliera' — per
 * questo senza `--scrivi` non tocca niente e mostra sempre degli esempi.
 *
 *   npx tsx --env-file-if-exists=.env scripts/doppioni-di-lingua.ts
 *   npx tsx --env-file-if-exists=.env scripts/doppioni-di-lingua.ts --paese IT
 *   npx tsx --env-file-if-exists=.env scripts/doppioni-di-lingua.ts --paese IT --solo Xtrawine --scrivi
 */

import { cataloghi, prezzi } from "../src/base/db.js";
import { catalogoSalvato, salvaCatalogo } from "../src/api/catalogo-magazzino.js";
import { assicuraFonti } from "../src/api/catalogo-fonti.js";
import { improntaUrl, numeroInsegnaPubblico } from "../src/api/prezzi-magazzino.js";

const arg = (nome: string) =>
  process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : undefined;
const scrivi = process.argv.includes("--scrivi");
const soloPaese = (arg("--paese") ?? "").toUpperCase();
const soloInsegna = arg("--solo");
/** Sotto questa soglia non vale la pena guardare: sono cataloghi piccoli. */
const MINIMO = Number(arg("--minimo") ?? 500);

const n = (v: number) => v.toLocaleString("it-IT");

/**
 * I prefissi di lingua, come li scrivono i negozi.
 *
 * `it`, `en-uk`, `fr-ch`, `de-de`. Due lettere, o due piu' due col trattino, e
 * SEMPRE come primo pezzo del percorso — un `it` in mezzo all'indirizzo e'
 * quasi sempre una parola, non una lingua.
 *
 * L'elenco delle lingue e' chiuso apposta. Con uno schema aperto qualunque
 * parola corta di due lettere all'inizio del percorso verrebbe presa per un
 * prefisso, e ci sono negozi che aprono il percorso con la sigla del reparto.
 */
const LINGUE =
  /^(aa|ab|af|am|ar|az|be|bg|bn|bs|ca|cs|cy|da|de|el|en|eo|es|et|eu|fa|fi|fr|ga|gl|he|hi|hr|hu|hy|id|is|it|ja|ka|kk|ko|lt|lv|mk|mn|ms|mt|nb|nl|nn|no|pl|pt|ro|ru|sk|sl|sq|sr|sv|sw|th|tr|uk|ur|vi|zh)(-[a-z]{2})?$/i;

/** L'indirizzo senza il prefisso di lingua, e la lingua che portava. */
function sfoderato(url: string): { nudo: string; lingua: string } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { nudo: url, lingua: "" };
  }
  const pezzi = u.pathname.split("/").filter(Boolean);
  if (pezzi.length >= 2 && LINGUE.test(pezzi[0])) {
    const lingua = pezzi[0].toLowerCase();
    u.pathname = "/" + pezzi.slice(1).join("/");
    return { nudo: u.toString(), lingua };
  }
  return { nudo: u.toString(), lingua: "" };
}

await assicuraFonti();
const P = await prezzi();
const C = await cataloghi();
let righeTolte = 0;
const filtro: Record<string, unknown> = {};
if (soloPaese) filtro.paese = soloPaese;
if (soloInsegna) filtro.insegna = { $regex: soloInsegna, $options: "i" };

/* Solo i capofila: i pezzi `#2`, `#3` non hanno un'insegna propria e
   `catalogoSalvato` li rimette insieme da solo. */
const elenco = (await C.find(filtro as never)
  .project({ paese: 1, insegna: 1, prodotti: 1 })
  .toArray()) as Array<{ _id: string; paese: string; insegna: string; prodotti?: number }>;

const capi = elenco
  .filter((x) => !String(x._id).includes("#"))
  .filter((x) => Number(x.prodotti ?? 0) >= MINIMO)
  .sort((a, b) => Number(b.prodotti ?? 0) - Number(a.prodotti ?? 0));

console.log("");
console.log(`DOPPIONI DI LINGUA · ${capi.length} cataloghi da almeno ${n(MINIMO)} voci`);
console.log("");

let gonfiaturaTotale = 0;
const colpiti: Array<{ paese: string; insegna: string; ind: number; veri: number }> = [];

for (const c of capi) {
  const voci = await catalogoSalvato(c.paese, c.insegna);
  if (!voci || voci.length === 0) continue;

  const perProdotto = new Map<string, Array<{ url: string; nome: string; lingua: string }>>();
  for (const v of voci) {
    const { nudo, lingua } = sfoderato(v.url);
    const sue = perProdotto.get(nudo);
    if (sue) sue.push({ ...v, lingua });
    else perProdotto.set(nudo, [{ ...v, lingua }]);
  }

  const veri = perProdotto.size;
  const gonfiatura = voci.length - veri;
  if (gonfiatura < 50) continue;

  gonfiaturaTotale += gonfiatura;
  colpiti.push({ paese: c.paese, insegna: c.insegna, ind: voci.length, veri });

  const perc = Math.round((gonfiatura / voci.length) * 100);
  console.log(
    `  ${(c.paese + "|" + c.insegna).padEnd(30)} ${n(voci.length).padStart(8)} indirizzi · ` +
      `${n(veri).padStart(8)} prodotti · ${n(gonfiatura).padStart(8)} doppioni (${perc}%)`,
  );

  /* SEMPRE UN ESEMPIO, ANCHE QUANDO NON SI SCRIVE.
     Questo comando decide di buttare degli indirizzi guardando solo la loro
     forma. Chi lo lancia deve poter controllare con gli occhi che i due
     indirizzi siano davvero lo stesso prodotto, prima di dirgli `--scrivi`. */
  const esempio = [...perProdotto.values()].find((g) => g.length > 1);
  if (esempio) {
    console.log(`       lo stesso prodotto in ${esempio.length} lingue, per esempio:`);
    esempio.slice(0, 3).forEach((e) => console.log(`         ${e.url}`));
  }

  if (!scrivi) continue;

  /* La preferenza: la lingua del paese, poi l'indirizzo senza prefisso, poi
     il primo in ordine — cosi' due esecuzioni danno lo stesso risultato. */
  const suo = c.paese.toLowerCase();
  const tenute = [...perProdotto.values()].map((g) => {
    const perLingua =
      g.find((x) => x.lingua === suo) ??
      g.find((x) => x.lingua.startsWith(suo + "-")) ??
      g.find((x) => x.lingua === "") ??
      [...g].sort((a, b) => a.url.localeCompare(b.url))[0];
    return { url: perLingua.url, nome: perLingua.nome };
  });

  try {
    await salvaCatalogo(c.paese, c.insegna, tenute);
    console.log(`       riscritto: ${n(tenute.length)} indirizzi.`);
  } catch (err) {
    console.log(`       NON riscritto: ${err instanceof Error ? err.message.slice(0, 70) : err}`);
    continue;
  }

  /* E SI TOLGONO ANCHE I PREZZI GIA' PRESI DAGLI INDIRIZZI BUTTATI.
     Riscrivere il catalogo impedisce i doppioni FUTURI e non tocca quelli
     gia' in magazzino: Tannico aveva 18.648 righe con prezzo per 9.324 vini,
     e senza questo pezzo sarebbero rimaste li' a gonfiare il totale per
     sempre, senza piu' un indirizzo nel catalogo che spiegasse da dove
     venivano.

     Si cancella solo cio' che il taglio ha appena scartato, e solo per questa
     insegna: non e' una pulizia generica, e' il rovescio esatto della
     riscrittura appena fatta. */
  const tenuti = new Set(tenute.map((x) => x.url));
  const buttate = voci.filter((v) => !tenuti.has(v.url)).map((v) => improntaUrl(v.url));
  const c2 = numeroInsegnaPubblico(c.insegna);
  let via = 0;
  for (let i = 0; i < buttate.length; i += 2000) {
    const esito = await P.deleteMany({
      c: c2,
      _id: { $in: buttate.slice(i, i + 2000) },
    } as never);
    via += esito.deletedCount;
  }
  if (via > 0) console.log(`       tolte ${n(via)} righe di prezzo dei doppioni.`);
  righeTolte += via;
}

console.log("");
if (colpiti.length === 0) {
  console.log("  Nessun catalogo ha doppioni di lingua degni di nota.");
} else {
  console.log(
    `  ${colpiti.length} cataloghi · ${n(gonfiaturaTotale)} indirizzi che sono lo stesso prodotto ` +
      `scritto in piu' lingue.`,
  );
  if (!scrivi) {
    console.log("");
    console.log("  Niente e' stato toccato. Guarda gli esempi qui sopra, e se sono davvero");
    console.log("  lo stesso prodotto:  ... doppioni-di-lingua.ts --scrivi");
  } else if (righeTolte > 0) {
    console.log(`  ${n(righeTolte)} righe di prezzo tolte dal totale: erano lo stesso prodotto`);
    console.log("  contato piu' volte, e il totale adesso e' piu' basso e piu' vero.");
  }
}
console.log("");
process.exit(0);
