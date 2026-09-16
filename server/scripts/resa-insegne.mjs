/**
 * Quanto rende ogni insegna: schede che si aprono, prezzi che si leggono.
 *
 * PERCHE' SERVE
 * -------------
 * Le insegne non sono intercambiabili. Carrefour dichiara il prezzo nei dati
 * strutturati e si legge sempre; Tigros, Iperal ed Esselunga lo disegnano con
 * JavaScript e nell'HTML non c'e' niente; certe sitemap sono vecchie e meta'
 * degli indirizzi da' 404.
 *
 * Finche' il catalogo aveva due insegne per paese non contava. Con sei conta
 * moltissimo, e in modo contro-intuitivo: in Spagna, AGGIUNGENDO quattro
 * catene le voci con prezzo sono SCESE da quattro a una su nove. I candidati
 * si distribuivano sulle catene nuove, e quelle il prezzo non lo espongono.
 *
 * Piu' catalogo e meno prezzi. La cura non e' togliere insegne — servono per
 * il confronto — ma sapere QUALI provare per prime.
 *
 * COSA MISURA
 * -----------
 * Per ogni fonte prende un campione di prodotti dal catalogo vero, apre le
 * loro schede e conta:
 *
 *   aperte     la pagina risponde e non e' un 404
 *   conPrezzo  ci si legge dentro un prezzo
 *
 * La resa e' `conPrezzo / campione`. Finisce in `catalogo-fonti.ts` e
 * l'ordine dei candidati la usa.
 *
 * Va rifatta ogni tanto: i negozi cambiano, le sitemap invecchiano. E' la
 * stessa ragione per cui `verifica-insegne.mjs` esiste.
 *
 * Uso:  node scripts/resa-insegne.mjs [--solo ES,PT]
 */

import { writeFileSync } from "node:fs";

/** Quanti prodotti provare per insegna. Dodici bastano a separare 0 da 0,8. */
const CAMPIONE = 12;

async function main() {
  const { FONTI, paesiConCatalogo } = await import("../src/api/catalogo-fonti.js");
  const { catalogoDi } = await import("../src/api/catalogo.js");
  const { verifyProductPage } = await import("../src/api/price-page.js");

  const filtro = process.argv.includes("--solo")
    ? new Set(
        process.argv[process.argv.indexOf("--solo") + 1]
          .split(",")
          .map((s) => s.trim().toUpperCase()),
      )
    : null;

  const paesi = (filtro ? [...filtro] : paesiConCatalogo()).filter((p) =>
    FONTI.some((f) => f.paese === p),
  );

  const esiti = [];

  for (const paese of paesi) {
    const cat = await catalogoDi(paese);
    if (!cat) {
      console.log(`${paese}  nessun catalogo`);
      continue;
    }

    // I prodotti si raggruppano per insegna: si misura ciascuna sui SUOI.
    const perInsegna = new Map();
    for (const v of cat.voci) {
      const lista = perInsegna.get(v.insegna);
      if (lista) lista.push(v);
      else perInsegna.set(v.insegna, [v]);
    }

    for (const [insegna, voci] of perInsegna) {
      // Campione sparso, non le prime dodici: l'inizio di una sitemap e'
      // spesso una categoria sola, e misurerebbe quella invece dell'insegna.
      const passo = Math.max(1, Math.floor(voci.length / CAMPIONE));
      const campione = [];
      for (let i = 0; i < voci.length && campione.length < CAMPIONE; i += passo) {
        campione.push(voci[i]);
      }

      /* UNA PAGINA ALLA VOLTA, CON UNA PAUSA — E LA MISURA CAMBIA.
         Con `Promise.all` si aprivano tutte e dodici le schede DELLO STESSO
         negozio nello stesso istante, e parecchi rispondono 429: troppe
         richieste. Il campione tornava con zero prezzi e l'insegna finiva fra
         le mute.

         Misurato sul Regno Unito: Poundland e MuscleFood davano 0 su 12 —
         entrambe pagine aperte, nessun prezzo. Riprovate una alla volta,
         rispondono. Erano due zeri inventati dalla fretta.

         E' lo stesso errore che aveva tenuto fuori dal catalogo Aldi UK e
         Sainsbury's: i loro 403 sembravano divieti ed erano limiti di
         frequenza. Qui il rischio e' peggiore, perche' un 429 non si vede —
         diventa una `resa: 0` scritta in `catalogo-fonti.ts`, e da li' in poi
         quell'insegna viene provata per ultima per sempre.

         Un secondo e mezzo per pagina: dodici schede diventano venti secondi
         per insegna, e questo script gira a mano, non a ogni richiesta. */
      const PAUSA_MS = 1500;
      let aperte = 0;
      let conPrezzo = 0;
      for (const v of campione) {
        const r = await verifyProductPage(v.url);
        if (r.status !== "non-raggiungibile") aperte++;
        if (r.page?.current) conPrezzo++;
        await new Promise((s) => setTimeout(s, PAUSA_MS));
      }

      const resa = campione.length ? conPrezzo / campione.length : 0;
      esiti.push({ paese, insegna, campione: campione.length, aperte, conPrezzo, resa });
      console.log(
        `${paese}  ${insegna.padEnd(26).slice(0, 26)} ` +
          `aperte ${String(aperte).padStart(2)}/${campione.length}  ` +
          `prezzo ${String(conPrezzo).padStart(2)}/${campione.length}  ` +
          `resa ${(resa * 100).toFixed(0).padStart(3)}%`,
      );
    }
  }

  esiti.sort((a, b) => b.resa - a.resa);
  console.log("\n" + "═".repeat(62));
  console.log("  LE PIU' GENEROSE");
  for (const e of esiti.slice(0, 10)) {
    console.log(`    ${(e.resa * 100).toFixed(0).padStart(3)}%  ${e.paese}  ${e.insegna}`);
  }
  console.log("\n  QUELLE CHE NON DANNO PREZZI (da provare per ultime)");
  for (const e of esiti.filter((x) => x.resa === 0)) {
    console.log(`      0%  ${e.paese}  ${e.insegna}`);
  }

  writeFileSync("diario/resa-insegne.json", JSON.stringify(esiti, null, 2), "utf8");
  console.log("\nDettaglio in diario/resa-insegne.json\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
