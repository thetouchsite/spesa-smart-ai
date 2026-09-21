/**
 * Quanto di quel che un negozio pubblica non riusciamo a riconoscere.
 *
 * IL CASO CHE L'HA FATTO NASCERE
 * ------------------------------
 * Ahorramas pubblica 4.594 schede in una sitemap che si chiama
 * `sitemap_0-product.xml`, e nel nostro catalogo ne aveva TRE. Non era il
 * negozio a essere magro, non era la rete: la loro forma di indirizzo —
 * `/garbanzos-con-espinacas-litoral-425g-13.html`, con un codice di due cifre
 * invece di sei — non passava `paScheda`.
 *
 * Quel difetto e' costato mesi di invisibilita' a un'insegna vera, e nessuno
 * se ne e' accorto perche' dal di fuori si vedeva solo un numero basso.
 * «Ahorramas ha 3 prodotti» si legge come «Ahorramas e' piccola».
 *
 * COSA MISURA
 * -----------
 * Per ogni insegna: quanti indirizzi dichiara la sua sitemap, e quanti ne
 * abbiamo in catalogo. Il rapporto fra i due e' il conto che conta:
 *
 *     catalogo / dichiarati vicino a 1    li leggiamo quasi tutti
 *     vicino a 0                          o sono quasi tutte categorie,
 *                                         oppure non riconosciamo la forma
 *
 * La differenza fra i due casi la fa l'occhio, non il programma: per questo
 * stampa alcuni degli indirizzi SCARTATI. Se sono `/categoria/...` va bene
 * cosi'; se somigliano a schede prodotto, c'e' un buco in `paScheda` e vale
 * la pena aprirne una col browser.
 *
 * NON APRE NESSUNA PAGINA DI PRODOTTO
 * -----------------------------------
 * Legge solo le sitemap, che sono fatte per essere lette da programmi e
 * costano al negozio una richiesta o due. Si puo' far girare senza pensieri.
 *
 *   npx tsx --env-file-if-exists=.env scripts/quanto-ne-perdiamo.ts
 *   npx tsx --env-file-if-exists=.env scripts/quanto-ne-perdiamo.ts --paese ES
 *   npx tsx --env-file-if-exists=.env scripts/quanto-ne-perdiamo.ts --minimo 5000
 */

import { cataloghi } from "../src/base/db.js";
import { assicuraFonti, fontiDi, tutteLeFonti } from "../src/api/catalogo-fonti.js";
import { paScheda } from "../src/api/catalogo.js";
import { INTESTAZIONE_BROWSER } from "../src/base/intestazione.js";

const arg = (nome: string) =>
  process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : undefined;
const soloPaese = (arg("--paese") ?? "").toUpperCase();
/** Sotto questo catalogo il rapporto e' rumore. */
const MINIMO = Number(arg("--minimo") ?? 1000);
/** Quante sitemap figlie seguire al massimo, per non restare appesi. */
const MAX_FIGLIE = Number(arg("--figlie") ?? 8);

const n = (v: number) => v.toLocaleString("it-IT");
const aspetta = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function scarica(u: string): Promise<string | null> {
  try {
    const res = await fetch(u, {
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
      headers: INTESTAZIONE_BROWSER,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function loc(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) =>
    m[1].replace(/&amp;/g, "&"),
  );
}

await assicuraFonti();
const C = await cataloghi();

const elenco = (soloPaese ? fontiDi(soloPaese) : tutteLeFonti()).filter((f) => f.resa > 0);

console.log("");
console.log(`QUANTO NE PERDIAMO · ${elenco.length} insegne · solo sitemap, nessuna scheda aperta`);
console.log("");

const sospette: Array<{ chi: string; dichiarati: number; nostri: number; esempi: string[] }> = [];

for (const f of elenco) {
  const doc = (await C.findOne(
    { _id: `${f.paese}|${f.insegna}` } as never,
    { projection: { prodotti: 1 } },
  )) as { prodotti?: number } | null;
  const nostri = Number(doc?.prodotti ?? 0);
  if (nostri < MINIMO) continue;

  const radice = await scarica(f.sitemap);
  if (!radice) {
    console.log(`  ${(f.paese + "|" + f.insegna).padEnd(28)} sitemap muta`);
    continue;
  }

  let tutti = loc(radice);
  /* Se e' un indice, si aprono le figlie: e' li' che stanno i prodotti, e
     contare l'indice vorrebbe dire misurare cinque righe contro centomila. */
  if (/<sitemapindex/i.test(radice)) {
    const figlie = tutti.slice(0, MAX_FIGLIE);
    tutti = [];
    for (const g of figlie) {
      const x = await scarica(g);
      if (x) tutti.push(...loc(x));
      await aspetta(400);
    }
  }

  /* SENZA DOPPIONI, O LO STRUMENTO MENTE DEL DOPPIO.
     Parecchi negozi elencano lo stesso indirizzo in piu' figlie dell'indice —
     una per lingua, una per «novita'», una per reparto. Contandoli tutti,
     questo comando diceva che Auchan Portogallo dichiara 86.437 indirizzi e
     noi ne abbiamo 43.212: quarantatremila persi, un allarme perfetto.

     Riraccolto davvero: 43.225. Non ne mancava nemmeno uno.

     Uno strumento diagnostico che gonfia del doppio e' peggio di nessuno
     strumento, perche' manda a cercare un difetto che non c'e' — e si
     riconosce proprio da questo, che i numeri escono esattamente doppi. */
  tutti = [...new Set(tutti)];

  if (tutti.length === 0) continue;
  const riconosciuti = tutti.filter(paScheda);
  const quota = riconosciuti.length / tutti.length;
  const scartati = tutti.filter((u) => !paScheda(u));

  /* Il segnale non e' «quanti ne scartiamo» ma «quanti ne abbiamo rispetto a
     quanti ne dichiara». Un'insegna che pubblica diecimila categorie e mille
     schede va benissimo; una che ne pubblica diecimila e ne abbiamo tre no. */
  const eti = `  ${(f.paese + "|" + f.insegna).padEnd(28)}`;
  console.log(
    `${eti} sitemap ${n(tutti.length).padStart(7)} · riconosciuti ${n(riconosciuti.length).padStart(7)} ` +
      `(${Math.round(quota * 100)}%) · in catalogo ${n(nostri).padStart(7)}`,
  );

  if (quota < 0.5 && scartati.length > 200) {
    sospette.push({
      chi: `${f.paese}|${f.insegna}`,
      dichiarati: tutti.length,
      nostri: riconosciuti.length,
      esempi: scartati.slice(0, 4),
    });
  }
  await aspetta(600);
}

console.log("");
if (sospette.length === 0) {
  console.log("  Nessuna insegna butta via piu' di meta' di quel che pubblica.");
} else {
  console.log(`  ${sospette.length} insegne da guardare con l'occhio:`);
  console.log("");
  for (const s of sospette) {
    console.log(`  ${s.chi} — riconosciamo ${n(s.nostri)} su ${n(s.dichiarati)}. Scartati, per esempio:`);
    s.esempi.forEach((u) => console.log(`      ${u.slice(0, 110)}`));
    console.log("");
  }
  console.log("  Se somigliano a schede prodotto, e' un buco in `paScheda`:");
  console.log("  aprine una col browser prima di toccare la regola.");
}
console.log("");
process.exit(0);
