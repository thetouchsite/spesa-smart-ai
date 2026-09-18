/**
 * Com'e' messo un paese, insegna per insegna.
 *
 * LA DOMANDA A CUI RISPONDE
 * -------------------------
 * «Di questi link, quanti hanno davvero un prezzo?» Fino a oggi si rispondeva
 * con la resa campionata su poche schede per insegna: una stima, utile per
 * decidere dove leggere, inutile per dire a un cliente cosa copriamo.
 *
 * Qui il conto e' esatto, perche' adesso il magazzino ricorda tutte e due le
 * cose: le schede che il prezzo ce l'hanno (righe in `prezzi`) e quelle che
 * sono state provate e non ce l'avevano (`scarti`). Quel che resta non e'
 * stato ancora guardato, e si dice cosi'.
 *
 *   npx tsx --env-file-if-exists=.env scripts/copertura-paese.ts IT
 *   npx tsx --env-file-if-exists=.env scripts/copertura-paese.ts        (tutti)
 */

import { fonti, cataloghi, prezzi as collezionePrezzi } from "../src/base/db.js";
import { quantiScarti } from "../src/api/scarti.js";

const paese = (process.argv[2] ?? "").toUpperCase();
const n = (v: number) => v.toLocaleString("it-IT");

const f = await (await fonti())
  .find(paese ? { paese, esclusa: { $exists: false } } : { esclusa: { $exists: false } })
  .toArray();
if (f.length === 0) {
  console.error(paese ? `Nessuna insegna attiva per ${paese}.` : "Nessuna insegna attiva.");
  process.exit(1);
}

const cat = await (await cataloghi()).find({}).project({ insegna: 1, prodotti: 1 }).toArray();
const linkDi = new Map<string, number>();
for (const c of cat) {
  const x = c as unknown as { insegna: string; prodotti: number };
  linkDi.set(x.insegna, (linkDi.get(x.insegna) ?? 0) + (x.prodotti ?? 0));
}

const scarti = await quantiScarti();
const prezzi = await collezionePrezzi();

let tLink = 0;
let tPrezzi = 0;
let tScarti = 0;

console.log(paese ? `COPERTURA ${paese}` : "COPERTURA, tutti i paesi");
console.log("");
console.log(
  "insegna".padEnd(26) + "link".padStart(9) + "con prezzo".padStart(12) +
    "senza".padStart(9) + "da provare".padStart(12) + "  validi",
);

const righe: Array<{ riga: string; daProvare: number }> = [];

for (const r of f) {
  /* Il numero dell'insegna e' un campo SALVATO nelle fonti, non si ricava
     dal nome: le righe dei prezzi portano quello per non riscrivere il nome
     cinque milioni di volte. */
  const x = r as unknown as { insegna: string; paese: string; id?: number };
  const link = linkDi.get(x.insegna) ?? 0;
  if (link === 0) continue;
  const conPrezzo =
    typeof x.id === "number" ? await prezzi.countDocuments({ c: x.id }) : 0;
  const senza = scarti.get(x.insegna) ?? 0;
  const daProvare = Math.max(0, link - conPrezzo - senza);
  const provati = conPrezzo + senza;
  const validi = provati > 0 ? Math.round((conPrezzo / provati) * 100) : 0;

  tLink += link;
  tPrezzi += conPrezzo;
  tScarti += senza;

  righe.push({
    daProvare,
    riga:
      `${x.insegna}`.slice(0, 25).padEnd(26) +
      n(link).padStart(9) +
      n(conPrezzo).padStart(12) +
      n(senza).padStart(9) +
      n(daProvare).padStart(12) +
      `  ${provati > 0 ? validi + "%" : "-"}`,
  });
}

for (const x of righe.sort((a, b) => b.daProvare - a.daProvare)) console.log(x.riga);

const provatiTot = tPrezzi + tScarti;
console.log("");
console.log(`link nel catalogo   ${n(tLink)}`);
console.log(`gia' provati        ${n(provatiTot)}  (${Math.round((provatiTot / Math.max(1, tLink)) * 100)}% del catalogo)`);
console.log(`  con prezzo        ${n(tPrezzi)}`);
console.log(`  senza prezzo      ${n(tScarti)}`);
console.log(`ancora da provare   ${n(Math.max(0, tLink - provatiTot))}`);
if (provatiTot > 0) {
  console.log("");
  if (tScarti === 0) {
    /* SENZA SCARTI IL NUMERO MENTE, E MENTE BENE.
       Fino a oggi il magazzino registrava solo i successi: le schede aperte
       che il prezzo non l'avevano non lasciavano traccia. Quindi «con prezzo
       diviso provati» fa per forza cento per cento — non perche' il catalogo
       sia perfetto, ma perche' i fallimenti non erano contati. Dirlo e'
       l'unica cosa onesta: un 100% compiaciuto su un dato monco e' peggio di
       nessun dato. */
    console.log("ATTENZIONE: nessuna scheda risulta «senza prezzo», e non vuol dire");
    console.log("che non ce ne siano. Gli scarti si registrano solo da oggi: finche' i");
    console.log("lettori non hanno rifatto un giro completo, la percentuale qui sotto");
    console.log("e' gonfiata, perche' i fallimenti di ieri non li contava nessuno.");
    console.log("");
  }
  console.log(
    `SU QUELLO CHE ABBIAMO PROVATO, IL ${Math.round((tPrezzi / provatiTot) * 100)}% HA UN PREZZO.`,
  );
}
process.exit(0);
