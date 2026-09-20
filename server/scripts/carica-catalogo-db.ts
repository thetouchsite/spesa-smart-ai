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
import { fonti } from "../src/base/db.js";

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

/** Le insegne che qualcuno cerca davvero. Si riempie all'avvio di `main`. */
let vive: Array<{ paese: string; insegna: string }> = [];

/**
 * Il nome con cui una fonte viva cerca questo catalogo, se esiste.
 *
 * Il confronto e' tollerante perche' il nome che arriva dal file e' mutilato:
 * gli accenti sono caduti e sono rimasti spazi. Si guarda la forma ridotta a
 * sole lettere e cifre, e in piu' si accetta che al nome del file MANCHINO
 * lettere rispetto a quello vero — che e' esattamente il danno degli accenti
 * perduti, e non succede fra due negozi diversi.
 */
function nomeDiFonte(paese: string, daFile: string): string | null {
  const ridotto = (x: string) => x.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
  const a = ridotto(daFile);
  const candidate = vive.filter((f) => f.paese === paese);

  const esatto = candidate.find((f) => ridotto(f.insegna) === a);
  if (esatto) return esatto.insegna;

  /* Al nome del file mancano lettere: deve restare una sottosequenza di
     quello vero, e mancargliene poche. Con piu' di tre di scarto non e' piu'
     un accento perduto, e' un altro negozio. */
  const mutilo = candidate.find((f) => {
    const b = ridotto(f.insegna);
    if (a.length >= b.length || b.length - a.length > 3) return false;
    let i = 0;
    for (const ch of b) if (i < a.length && a[i] === ch) i++;
    return i === a.length;
  });
  return mutilo ? mutilo.insegna : null;
}

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

  /* L'elenco delle insegne vive si legge una volta: e' il metro con cui si
     decide cosa vale la pena scrivere sul database. */
  vive = ((await (await fonti())
    .find({ esclusa: { $exists: false } })
    .project({ paese: 1, insegna: 1 })
    .toArray()) as Array<{ paese?: string; insegna?: string }>).map((f) => ({
    paese: String(f.paese ?? ""),
    insegna: String(f.insegna ?? ""),
  }));
  console.log(`${vive.length} insegne vive nelle fonti
`);

  let totale = 0;
  let scartati = 0;
  let saltati = 0;
  let saltatiLink = 0;
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

    /* IL NOME DEL FILE NON E' IL NOME DELL'INSEGNA, E CREDERLO COSTAVA CARO.
       Si salvava col nome del file, rimettendo spazi al posto degli
       underscore. Ma negli underscore gli accenti erano gia' andati persi:
       «Aldi Sued» tornava indietro come «Aldi S d», «El Corte Ingles» come
       «El Corte Ingl s». Chi legge cerca per `paese|insegna` col nome esatto
       delle fonti, quindi quei cataloghi non li trovava nessuno — restavano
       li' a gonfiare ogni totale senza servire a niente.

       Peggio: questo comando ricarica i file di una battuta di raccolta
       vecchia, dove c'erano anche insegne poi scartate a ragion veduta —
       Galaxus e' un generalista, Rossmann e dm sono profumerie. Rilanciarlo
       rimetteva dentro pure quelle, e annullava ogni pulizia fatta prima.
       Il 19 settembre sono tornati cosi' 437.480 indirizzi morti.

       Adesso si salva solo quel che una fonte viva cerca davvero, col nome
       che cerca lei. Il resto si dice e si lascia sul disco. */
    const daFile = insegnaFile.replace(/_/g, " ").trim();
    const insegna = nomeDiFonte(paese, daFile);
    if (!insegna) {
      saltati++;
      saltatiLink += voci.length;
      console.log(
        `${paese}  ${daFile.padEnd(30).slice(0, 30)} saltata: nessuna fonte viva la cerca`,
      );
      continue;
    }

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
  if (saltati > 0) {
    console.log(`  saltati             ${n(saltati)} cataloghi, ${n(saltatiLink)} indirizzi`);
    console.log(`                      nessuna fonte viva li cerca: sarebbero orfani appena nati.`);
    console.log(`                      I file restano sul disco — riammetti l'insegna e si ricaricano.`);
  }
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
