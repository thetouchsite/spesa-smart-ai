/**
 * Le insegne censite due volte.
 *
 * COSA SUCCEDE
 * ------------
 * Sette negozi stanno nell'elenco delle fonti sotto due nomi — «Billa» e
 * «Billa CZ», «Konzum» e «Konzum Online» — con lo stesso dominio e due
 * cataloghi quasi identici. Il lettore li tratta come due negozi diversi:
 * apre le stesse pagine due volte, e i prezzi finiscono sotto due insegne,
 * cosi' che l'app li mostra come se fossero due posti da confrontare.
 *
 * COME SI SCEGLIE QUALE TENERE
 * ----------------------------
 * Quella con piu' prodotti nel catalogo. Non per simpatia: un catalogo piu'
 * grande e' quasi sempre la sitemap completa, e quello piccolo un pezzo —
 * tenere il pezzo vorrebbe dire perdere prodotti che sappiamo esistere.
 *
 * NON SI CANCELLA, SI ESCLUDE
 * ---------------------------
 * Le fonti hanno gia' un campo `esclusa` con dentro il motivo. Cancellare la
 * riga perderebbe la storia — quando e' stata trovata, con che resa — e
 * renderebbe possibile che la scoperta automatica la ritrovi domani e la
 * rimetta dentro. Esclusa con un motivo scritto, invece, resta li' a dire
 * perche' non si legge.
 *
 *   npx tsx --env-file-if-exists=.env scripts/togli-insegne-doppie.ts          (mostra)
 *   npx tsx --env-file-if-exists=.env scripts/togli-insegne-doppie.ts --scrivi (applica)
 */

import { fonti, cataloghi } from "../src/base/db.js";

const scrivi = process.argv.includes("--scrivi");

const f = await (await fonti()).find({}).toArray();
const cat = await (await cataloghi()).find({}).project({ insegna: 1, prodotti: 1 }).toArray();

const prodottiDi = new Map<string, number>();
for (const c of cat) {
  const x = c as unknown as { insegna: string; prodotti: number };
  prodottiDi.set(x.insegna, (prodottiDi.get(x.insegna) ?? 0) + (x.prodotti ?? 0));
}

interface Fonte {
  _id: string;
  insegna: string;
  paese: string;
  dominio: string;
  resa?: number;
  esclusa?: string;
}

const perDominio = new Map<string, Fonte[]>();
for (const r of f) {
  const x = r as unknown as Fonte;
  if (x.esclusa || !x.dominio) continue;
  const k = `${x.paese}|${x.dominio.replace(/^www\./, "")}`;
  perDominio.set(k, [...(perDominio.get(k) ?? []), x]);
}

let tolte = 0;
let linkLiberati = 0;

for (const [dominio, elenco] of perDominio) {
  if (elenco.length < 2) continue;

  /* Si tiene quella col catalogo piu' grande; a parita', quella con la resa
     migliore, che e' la seconda domanda sensata. */
  const ordinate = [...elenco].sort((a, b) => {
    const pa = prodottiDi.get(a.insegna) ?? 0;
    const pb = prodottiDi.get(b.insegna) ?? 0;
    return pb - pa || (b.resa ?? 0) - (a.resa ?? 0);
  });
  const tenuta = ordinate[0];
  const doppie = ordinate.slice(1);

  console.log(`${dominio}`);
  console.log(`  TENGO   ${tenuta.insegna.padEnd(24)} ${prodottiDi.get(tenuta.insegna) ?? 0} prodotti`);
  for (const d of doppie) {
    const quanti = prodottiDi.get(d.insegna) ?? 0;
    console.log(`  ESCLUDO ${d.insegna.padEnd(24)} ${quanti} prodotti`);
    linkLiberati += quanti;
    tolte++;
    if (scrivi) {
      await (await fonti()).updateOne(
        { _id: d._id },
        { $set: { esclusa: `stesso negozio di «${tenuta.insegna}» (${dominio})` } },
      );
    }
  }
}

console.log("");
console.log(`${tolte} insegne doppie, ${linkLiberati.toLocaleString("it-IT")} link che non verranno piu' riletti.`);
console.log(scrivi ? "Applicato." : "Niente e' stato scritto: rilancia con --scrivi per applicare.");
process.exit(0);
