/**
 * Quanto rende un'insegna, misurato sulla sitemap invece che sul catalogo.
 *
 * PERCHE' UN SECONDO STRUMENTO
 * ----------------------------
 * `resa-insegne.mjs` costruisce il catalogo del paese e poi campiona: e'
 * esatto, perche' misura le stesse voci che l'app usera' davvero. Ma per farlo
 * scarica tutte le sitemap di tutte le insegne, e su Spagna e Francia insieme
 * non finisce entro un quarto d'ora — l'ho visto morire di timeout.
 *
 * Qui si va dritti: una sitemap alla volta, dieci indirizzi presi a passo
 * costante, aperti per vedere se il prezzo si legge. Non serve costruire
 * niente, e una misura su due paesi dura tre minuti invece di quindici.
 *
 * SI CAMPIONA QUEL CHE IL CATALOGO TERREBBE, NON QUEL CHE LA SITEMAP DICE
 * -----------------------------------------------------------------------
 * Prima versione: si prendevano gli indirizzi grezzi della sitemap. Carrefour
 * Italia e' venuto zero su dieci — ed e' l'insegna italiana che funziona
 * meglio. Le dieci pagine aperte erano categorie, e una categoria un prezzo
 * non ce l'ha.
 *
 * Una resa misurata cosi' e' peggio di nessuna resa: dice di buttare via
 * ventottomila prodotti buoni. Quindi gli indirizzi passano per `paScheda`,
 * lo stesso filtro del catalogo vero. Si misura cio' che l'app usera'.
 *
 * PERCHE' CONTA PIU' DI QUANTO SEMBRI
 * -----------------------------------
 * La resa decide quali insegne si provano per prime. Una sbagliata e' peggio
 * di una mancante: finisce in `catalogo-fonti.ts` e da li' in poi quell'insegna
 * va in fondo alla fila per sempre.
 *
 * Misurato oggi: Alcampo e' scritta a `resa: 0` e vale 86.773 prodotti. Dopo
 * la riparazione del lettore dei prezzi ne rende il 53%. Erano ottantaseimila
 * prodotti messi in coda per un numero vecchio.
 *
 * SUL RISPETTO DEI NEGOZI
 * -----------------------
 * Una pagina alla volta, un secondo di pausa, dieci per insegna. E' meno di
 * quanto faccia una persona che guarda un catalogo.
 *
 * Uso:
 *   npx tsx scripts/resa-veloce.ts ES FR
 *   npx tsx scripts/resa-veloce.ts ES --schede 20
 *   npx tsx scripts/resa-veloce.ts IT --link      solo gli indirizzi, da guardare
 *
 * SU `--link`
 * -----------
 * Stampa le schede e basta, senza aprirle. Serve quando una resa fa zero: il
 * numero dice che non si e' letto niente, non dice se la colpa e' del sito o
 * nostra. Con gli indirizzi in mano si apre il browser e si vede in tre
 * secondi cio' che una misura non sa distinguere: se la pagina il prezzo non
 * ce l'ha davvero, oppure ce l'ha e siamo noi a non vederlo.
 */

import { writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { FONTI } from "../src/api/catalogo-fonti.js";
import { paScheda } from "../src/api/catalogo.js";
import { verifyProductPage } from "../src/api/price-page.js";

const INTESTAZIONE = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/xml,text/xml,*/*;q=0.8",
  "Accept-Encoding": "gzip, deflate",
};

/** Quante schede aprire per insegna. Dieci bastano a separare 0 da 0,5. */
const SCHEDE = 10;
/** Pausa fra una pagina e l'altra dello stesso negozio. */
const PAUSA_MS = 1000;
/** Quante figlie di un indice aprire al massimo, prima di arrendersi. */
const MASSIMO_FIGLIE = 12;
/** Quanti piani di indici annidati. Auchan ne ha due, nessuno finora tre. */
const PIANI = 3;

const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));
const indirizzi = (x: string) => [...x.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);

async function scarica(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: INTESTAZIONE, signal: AbortSignal.timeout(40_000) });
    if (!r.ok) return null;
    if (url.endsWith(".gz")) {
      return gunzipSync(Buffer.from(await r.arrayBuffer())).toString("utf8");
    }
    return await r.text();
  } catch {
    return null;
  }
}

/**
 * Qualche indirizzo di SCHEDA, scendendo nell'indice finche' se ne trovano.
 *
 * Tre regole imparate sul campo, una per ogni volta che questa funzione ha
 * dichiarato vuota un'insegna che vuota non era:
 *
 * `paScheda` filtra sempre. Una sitemap mescola schede, categorie e pagine di
 * servizio, e aprire una categoria per misurare un prezzo da' zero per forza.
 * Cosi' Carrefour Italia risultava zero su dieci.
 *
 * Le figlie si aprono TUTTE finche' non bastano, non le prime. I nomi non
 * dicono cosa contengono, e la sitemap dei prodotti sta quasi sempre in fondo
 * all'elenco: dopo pagine, categorie e ricette.
 *
 * E si scende di PIU' di un piano. Auchan pubblica `sitemap-products.xml`, che
 * non e' un elenco di prodotti ma un altro indice con dentro sette figlie.
 * Fermandosi al primo piano si legge un indice e si conclude «nessun
 * indirizzo» — per 8.708 prodotti che stavano li' sotto.
 */
async function qualcheIndirizzo(
  sitemap: string,
  quanti: number,
  piano = 0,
): Promise<string[]> {
  if (piano > PIANI) return [];
  const xml = await scarica(sitemap);
  if (!xml) return [];
  const voci = indirizzi(xml);
  if (voci.length === 0) return [];

  if (!/<sitemapindex/i.test(xml)) return sparso(voci.filter(paScheda), quanti);

  /* Dal fondo verso l'inizio: e' li' che stanno i prodotti, di solito. */
  const raccolte: string[] = [];
  for (const figlia of [...voci].reverse().slice(0, MASSIMO_FIGLIE)) {
    raccolte.push(...(await qualcheIndirizzo(figlia, quanti * 3, piano + 1)));
    /* Tre volte quel che serve: cosi' `sparso` ha da cui scegliere davvero. */
    if (raccolte.length >= quanti * 3) break;
    await attendi(300);
  }
  return sparso(raccolte, quanti);
}

/** A passo costante, non i primi: l'inizio di una sitemap e' spesso una sola categoria. */
function sparso<T>(tutti: T[], quanti: number): T[] {
  if (tutti.length <= quanti) return tutti;
  const passo = tutti.length / quanti;
  return Array.from({ length: quanti }, (_, i) => tutti[Math.floor(i * passo)]);
}

async function main() {
  const quante = process.argv.includes("--schede")
    ? Number(process.argv[process.argv.indexOf("--schede") + 1])
    : SCHEDE;
  const paesi = process.argv
    .slice(2)
    .filter((a) => /^[A-Za-z]{2}$/.test(a))
    .map((a) => a.toUpperCase());

  if (paesi.length === 0) {
    console.log("Uso: npx tsx scripts/resa-veloce.ts ES FR [--schede 20]\n");
    process.exit(1);
  }

  const elenco = FONTI.filter((f) => paesi.includes(f.paese));

  /* Solo gli indirizzi: nessuna pagina aperta, nessun prezzo letto. */
  if (process.argv.includes("--link")) {
    for (const f of elenco) {
      const url = await qualcheIndirizzo(f.sitemap, quante);
      console.log(`
${f.paese} - ${f.insegna}  (resa scritta ${f.resa}, ${f.stimati} prodotti)`);
      if (url.length === 0) {
        console.log(`   nessuna scheda dalla sitemap: ${f.sitemap}`);
        continue;
      }
      for (const u of url.slice(0, 3)) console.log(`   ${u}`);
    }
    console.log("");
    process.exit(0);
  }

  console.log(`${elenco.length} insegne in ${paesi.join(" ")} · ${quante} schede ciascuna\n`);

  const esiti: Array<{
    paese: string;
    insegna: string;
    scritta: number;
    misurata: number;
    aperte: number;
    provate: number;
  }> = [];

  for (const f of elenco) {
    const url = await qualcheIndirizzo(f.sitemap, quante);
    if (url.length === 0) {
      console.log(
        `  ${f.paese}  ${f.insegna.padEnd(22).slice(0, 22)} nessun indirizzo dalla sitemap` +
          `  (scritta ${f.resa})`,
      );
      continue;
    }

    let aperte = 0;
    let conPrezzo = 0;
    for (const u of url) {
      const v = await verifyProductPage(u);
      if (v.status !== "non-raggiungibile") aperte++;
      if (v.page?.current != null) conPrezzo++;
      await attendi(PAUSA_MS);
    }

    const misurata = Number((conPrezzo / url.length).toFixed(2));
    esiti.push({
      paese: f.paese,
      insegna: f.insegna,
      scritta: f.resa,
      misurata,
      aperte,
      provate: url.length,
    });

    const differenza = Math.abs(misurata - f.resa);
    console.log(
      `  ${f.paese}  ${f.insegna.padEnd(22).slice(0, 22)} ` +
        `aperte ${aperte}/${url.length} · prezzo ${conPrezzo}/${url.length} · ` +
        `resa ${String(misurata).padStart(4)} (scritta ${f.resa})` +
        (differenza >= 0.25 ? "   ← DA CORREGGERE" : ""),
    );
  }

  const daCorreggere = esiti.filter((e) => Math.abs(e.misurata - e.scritta) >= 0.25);
  console.log("\n" + "═".repeat(66));
  console.log(`  misurate ${esiti.length} · da correggere ${daCorreggere.length}`);
  if (daCorreggere.length) {
    console.log("\n  Le righe nuove per catalogo-fonti.ts:");
    for (const e of daCorreggere) {
      console.log(`     ${e.paese} ${e.insegna}: resa ${e.scritta} → ${e.misurata}`);
    }
  }

  /* Il nome porta i paesi dentro: due misure lanciate insieme non si
     cancellano a vicenda. E' successo alla prima prova. */
  const dove = `diario/resa-${paesi.join("-").toLowerCase()}.json`;
  writeFileSync(dove, JSON.stringify(esiti, null, 2), "utf8");
  console.log(`
  dettaglio in ${dove}
`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
