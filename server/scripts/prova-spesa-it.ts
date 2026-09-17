/**
 * Una spesa vera in Italia: quante voci finiscono con un prezzo, e quanto costa.
 *
 * PERCHE' QUESTO E NON LA PERCENTUALE DEL CATALOGO
 * ------------------------------------------------
 * «Il 48% del catalogo italiano ha un prezzo leggibile» non e' una promessa
 * che si possa fare a un cliente: nessuno compra mezzo catalogo. Quel che si
 * promette e' «mi dici sedici cose e te ne prezzo tredici», ed e' un'altra
 * misura — dipende da quali insegne rispondono alle parole che la gente usa
 * davvero, non da quanti prodotti stanno in magazzino.
 *
 * Qui si simula il momento del piano: per ogni voce si chiedono i candidati
 * nell'ordine vero, si aprono finche' uno non da' un prezzo, e si segna quanto
 * e' costato. Poi si dice quanto di quel tempo se ne sono andate le insegne
 * che un prezzo non lo danno mai.
 */

import { catalogoDi, cercaNelCatalogo } from "../src/api/catalogo.js";
import { caricaFontiDalDb, tutteLeFonti } from "../src/api/catalogo-fonti.js";
import { verifyProductPage } from "../src/api/price-page.js";

const PAESE = (process.argv[2] ?? "IT").toUpperCase();
const CANDIDATI = 6;

const MUTE = new Set(tutteLeFonti().filter((f) => f.paese === PAESE && f.resa === 0).map((f) => f.insegna));

const LISTA = [
  "pasta di semola", "latte intero", "passata di pomodoro", "petto di pollo",
  "mozzarella", "olio extravergine di oliva", "uova", "pane",
  "riso", "zucchine", "parmigiano reggiano", "tonno in scatola",
  "yogurt bianco", "mele", "caffe macinato", "burro",
];

await caricaFontiDalDb();
const cat = await catalogoDi(PAESE);
if (!cat) { console.log(`catalogo ${PAESE} non disponibile`); process.exit(1); }
console.log(`catalogo ${PAESE}: ${cat.voci.length} voci, ${cat.insegne.length} insegne`);
console.log(`insegne senza prezzo: ${[...MUTE].join(", ")}\n`);

let conPrezzo = 0, aperteTot = 0, aperteMute = 0;
let msTot = 0, msMute = 0;

for (const voce of LISTA) {
  const candidati = await cercaNelCatalogo(PAESE, voce, CANDIDATI);
  let trovato: { prezzo: number; insegna: string } | null = null;
  let aperte = 0, mute = 0;

  for (const c of candidati) {
    const t = Date.now();
    const v = await verifyProductPage(c.url);
    const durata = Date.now() - t;
    aperte++; aperteTot++; msTot += durata;
    if (MUTE.has(c.insegna)) { mute++; aperteMute++; msMute += durata; }
    if (v.page?.current != null) { trovato = { prezzo: v.page.current, insegna: c.insegna }; break; }
  }

  if (trovato) conPrezzo++;
  console.log(
    `  ${voce.padEnd(26)} ${trovato ? `${String(trovato.prezzo).padStart(6)} EUR  ${trovato.insegna}` : "   nessun prezzo".padEnd(20)}` +
      `   (${aperte} pagine aperte, ${mute} da insegne senza prezzo)`,
  );
}

console.log(`\n${"=".repeat(70)}`);
console.log(`  ${conPrezzo} voci su ${LISTA.length} con un prezzo`);
console.log(`  ${aperteTot} pagine aperte in ${(msTot / 1000).toFixed(1)}s`);
console.log(`  di cui ${aperteMute} su insegne che un prezzo non lo danno mai: ${(msMute / 1000).toFixed(1)}s buttati (${Math.round(msMute / msTot * 100)}%)`);
process.exit(0);
