/**
 * QUANTI LINK E QUANTI PREZZI ABBIAMO DAVVERO, INSEGNA PER INSEGNA.
 *
 * Non una stima: il conteggio passa dalle stesse funzioni che gira l'API —
 * `daUnaFonte` per i link, `verifyProductPage` per il prezzo. Un numero
 * misurato con codice diverso da quello in produzione descriverebbe lo script,
 * non l'API.
 *
 * DUE NUMERI DIVERSI, E VANNO TENUTI SEPARATI
 * -------------------------------------------
 *   LINK   = quante schede prodotto conosciamo. Si contano tutte.
 *   PREZZO = su quante di quelle riusciamo a leggere un prezzo. NON si contano
 *            tutte: aprire centomila pagine sarebbe scortese e inutile. Si
 *            apre un campione sparso e si riporta la resa, con il campione
 *            dichiarato accanto — una percentuale senza il suo denominatore
 *            non e' una misura.
 */

import { writeFileSync } from "node:fs";
import { FONTI } from "../dist/catalogo-fonti.js";
import { daUnaFonte } from "../dist/catalogo.js";
import { verifyProductPage } from "../dist/price-page.js";

const CAMPIONE = Number(process.env.CAMPIONE ?? 6);
const USCITA = process.env.USCITA ?? "conteggio.json";

/** Sparsi lungo tutto il catalogo: i primi di una sitemap sono spesso atipici. */
function campiona(voci, quante) {
  if (voci.length <= quante) return voci;
  const passo = Math.floor(voci.length / quante);
  return Array.from({ length: quante }, (_, i) => voci[i * passo]).filter(Boolean);
}

/**
 * Si puo' contare un paese solo: `PAESE=GB node scripts/conta-tutto.mjs`.
 *
 * Serve perche' il conteggio completo tocca trentanove insegne in ventiquattro
 * paesi e dura a lungo, mentre quasi sempre si vuole verificare il paese su cui
 * si sta lavorando. Senza filtro si finisce per misurare con script scritti al
 * momento, e un numero prodotto da codice diverso da quello che gira descrive
 * lo script, non l'API. Il filtro esiste per non avere quella scusa.
 */
const PAESE = (process.env.PAESE ?? "").trim().toUpperCase();
const DA_CONTARE = PAESE ? FONTI.filter((f) => f.paese === PAESE) : FONTI;


const righe = [];
console.log(`insegne da contare: ${DA_CONTARE.length}\n`);

for (const [n, f] of DA_CONTARE.entries()) {
  const t0 = Date.now();
  let voci = [];
  try {
    voci = await daUnaFonte(f);
  } catch (e) {
    console.log(`${String(n + 1).padStart(2)}/${DA_CONTARE.length}  ${f.paese} ${f.insegna.padEnd(22)} ERRORE ${e.message?.slice(0, 40)}`);
    righe.push({ paese: f.paese, insegna: f.insegna, dominio: f.dominio, link: 0, errore: String(e.message ?? e) });
    continue;
  }
  const secondi = ((Date.now() - t0) / 1000).toFixed(0);

  // Il prezzo si misura solo dove ci sono link da aprire.
  let conPrezzo = 0;
  let provati = 0;
  let inPromo = 0;
  const esempi = [];
  for (const v of campiona(voci, CAMPIONE)) {
    provati++;
    try {
      const r = await verifyProductPage(v.url);
      const pagato = r?.page?.current ?? null;
      if (pagato != null) {
        conPrezzo++;
        const listino = r.page.list ?? null;
        if (listino != null && listino > pagato) inPromo++;
        if (esempi.length < 2) esempi.push({ url: v.url, prezzo: pagato, listino });
      }
    } catch { /* una pagina che non risponde e' un dato, non un errore */ }
  }

  const resa = provati ? conPrezzo / provati : 0;
  righe.push({
    paese: f.paese, insegna: f.insegna, dominio: f.dominio,
    link: voci.length, stimatiPrima: f.stimati,
    campione: provati, conPrezzo, inPromo, resa, esempi, secondi: Number(secondi),
  });

  console.log(
    `${String(n + 1).padStart(2)}/${DA_CONTARE.length}  ${f.paese} ${f.insegna.padEnd(22)} ` +
    `${String(voci.length).padStart(6)} link   prezzo ${conPrezzo}/${provati}` +
    `${inPromo ? `  (${inPromo} in promo)` : ""}   ${secondi}s`,
  );
  writeFileSync(USCITA, JSON.stringify(righe, null, 2));
}

const tot = righe.reduce((a, r) => a + r.link, 0);
const conP = righe.filter((r) => r.conPrezzo > 0);
console.log(`\n${"=".repeat(64)}`);
console.log(`LINK TOTALI            ${tot.toLocaleString("it-IT")}`);
console.log(`INSEGNE CON LINK       ${righe.filter((r) => r.link > 0).length}/${DA_CONTARE.length}`);
console.log(`INSEGNE CON PREZZO     ${conP.length}/${DA_CONTARE.length}`);
const leggibili = conP.reduce((a, r) => a + r.link, 0);
console.log(`LINK CON PREZZO LEGGIBILE (stima da resa)  ~${Math.round(conP.reduce((a, r) => a + r.link * r.resa, 0)).toLocaleString("it-IT")} su ${leggibili.toLocaleString("it-IT")}`);
console.log(`\nscritto in ${USCITA}`);
