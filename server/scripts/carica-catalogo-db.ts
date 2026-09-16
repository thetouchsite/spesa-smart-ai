/**
 * Porta su Mongo i tre milioni di indirizzi raccolti stanotte.
 *
 * DA DOVE VENGONO
 * ---------------
 * `scoperta-europa.mjs` ha sondato 348 insegne europee, `raccolta-europa.mjs`
 * ne ha percorso l'albero delle sitemap per intero contando ogni indirizzo uno
 * per uno, e ha lasciato il risultato in `diario/raccolto/` — un file gzip per
 * insegna, 3.030.740 indirizzi in 55 MB.
 *
 * Finora quei file stavano solo su un disco. Qui entrano nel database, che e'
 * l'unico posto da cui l'API li puo' leggere.
 *
 * PERCHE' NON UN DOCUMENTO PER PRODOTTO
 * -------------------------------------
 * Tre milioni di documenti con i loro indici sono circa 867 MB, e il piano
 * gratuito di Atlas ne da' 512: non ci starebbero. Gli stessi dati come un
 * pacchetto compresso per insegna sono 55 MB — un sedicesimo, con dieci volte
 * il margine. Vedi `catalogo-magazzino.ts`.
 *
 * COSA NON FA, E VA DETTO CHIARO
 * ------------------------------
 * Non verifica niente. Questi sono indirizzi che i negozi pubblicano nelle
 * loro sitemap: sono reali — nessuno li ha inventati, ed e' la differenza da
 * cui e' nato tutto il progetto — ma nessuno li ha ancora aperti.
 *
 * Quanti siano vivi e quanti dichiarino il prezzo lo dice `campiona-tutto.ts`,
 * che ne apre un campione per insegna. Aprirli tutti sarebbero sei giorni e
 * mezzo di richieste ai negozi: non si fa.
 *
 * Uso:
 *   npx tsx scripts/carica-catalogo-db.ts            tutto
 *   npx tsx scripts/carica-catalogo-db.ts --solo ES  un paese
 */

import { readdirSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { nomeDaUrl } from "../src/api/catalogo.js";
import { salvaCatalogo, statoCataloghi } from "../src/api/catalogo-magazzino.js";

const CARTELLA = "diario/raccolto";

/**
 * Quanti indirizzi tenere per insegna.
 *
 * Centomila. Il tetto serve alle insegne fuori misura — Galaxus ne ha mezzo
 * milione, ed e' un negozio di elettronica finito nel giro per sbaglio — non
 * ai supermercati, che stanno tutti sotto. Oltre questa soglia il pacchetto
 * rischia i 16 MB per documento di Mongo, e un catalogo troncato e' meglio di
 * un salvataggio fallito.
 */
const TETTO = 100_000;

const n = (x: number) => x.toLocaleString("it-IT");

async function main() {
  const filtro = process.argv.includes("--solo")
    ? new Set(
        process.argv[process.argv.indexOf("--solo") + 1]
          .split(",")
          .map((s) => s.trim().toUpperCase()),
      )
    : null;

  const file = readdirSync(CARTELLA)
    .filter((f) => f.endsWith(".txt.gz"))
    .filter((f) => !filtro || filtro.has(f.slice(0, 2).toUpperCase()));

  console.log(`${file.length} insegne da caricare\n`);
  console.log("prima:", await statoCataloghi());
  console.log();

  let totale = 0;
  let scartati = 0;
  const inizio = Date.now();

  for (const f of file) {
    // Il nome del file e' "PAESE-Insegna_con_underscore.txt.gz": il paese sono
    // le prime due lettere, il resto e' l'insegna con i caratteri sostituiti.
    const paese = f.slice(0, 2).toUpperCase();
    const insegnaFile = f.slice(3).replace(/\.txt\.gz$/, "");

    const url = gunzipSync(readFileSync(`${CARTELLA}/${f}`))
      .toString("utf8")
      .split("\n")
      .filter(Boolean);

    /* Il nome si ricava dall'indirizzo, come fa il catalogo a runtime: e'
       quello che si confronta con la lista della spesa. Gli indirizzi da cui
       non si cava un nome leggibile non servono a niente — nessuna voce li
       trovera' mai — e portarseli dietro sarebbe peso morto nel pacchetto. */
    const voci: Array<{ url: string; nome: string }> = [];
    for (const u of url) {
      if (voci.length >= TETTO) break;
      const nome = nomeDaUrl(u);
      if (!nome) {
        scartati++;
        continue;
      }
      voci.push({ url: u, nome });
    }

    if (voci.length === 0) {
      console.log(`${paese}  ${insegnaFile.padEnd(30).slice(0, 30)} nessun nome ricavabile`);
      continue;
    }

    /* L'insegna si salva con il nome del FILE, non con quello delle fonti:
       chi legge (`catalogo.ts`) cerca per `paese|insegna`, e il nome nelle
       fonti ha accenti e spazi che nel file sono diventati underscore. Si
       rimettono come erano. */
    const insegna = insegnaFile.replace(/_/g, " ").trim();

    await salvaCatalogo(paese, insegna, voci);
    totale += voci.length;
    console.log(
      `${paese}  ${insegna.padEnd(30).slice(0, 30)} ${n(voci.length).padStart(9)} indirizzi` +
        (url.length > voci.length ? `  (di ${n(url.length)})` : ""),
    );
  }

  console.log("\n" + "═".repeat(66));
  console.log(`  caricati            ${n(totale)} indirizzi`);
  console.log(`  scartati (no nome)  ${n(scartati)}`);
  console.log(`  tempo               ${((Date.now() - inizio) / 1000).toFixed(0)}s`);
  console.log("\ndopo:", await statoCataloghi());
  console.log(
    "\nSono indirizzi VERI e MAI APERTI: quanti siano vivi e quanti diano un\n" +
      "prezzo lo dice scripts/campiona-tutto.ts.\n",
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
