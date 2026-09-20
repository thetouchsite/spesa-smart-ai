/**
 * Il catalogo di un'insegna la cui sitemap NON contiene prodotti.
 *
 * IL CASO CHE HA FATTO NASCERE QUESTO COMANDO
 * -------------------------------------------
 * Todis e Despar. Due catene italiane vere, prezzi in chiaro, nessun login,
 * robots.txt che permette `/prodotto/`. Non erano in elenco, e per mesi la
 * risposta implicita e' stata «non hanno catalogo».
 *
 * Non era vero. Le loro sitemap ci sono e rispondono:
 *
 *     todisacasa.it/sitemap.xml      165 indirizzi
 *     shop.despar.com/sitemap.xml    220 indirizzi
 *
 * e dentro non c'e' NEMMENO UNA scheda prodotto: ci sono i reparti. «frutta»,
 * «salumi», «latte-burro-uova». Il nostro raccoglitore legge le sitemap e
 * scarta i reparti — giustamente, perche' un reparto mostrato all'utente e'
 * quattro prodotti con quattro prezzi diversi spacciati per uno. Cosi' di
 * quelle centonovantacinque pagine ne restavano zero, e l'insegna spariva.
 *
 * Il reparto pero' e' un pessimo prodotto e un OTTIMO indice: la pagina della
 * frutta di Todis, servita gia' fatta in HTML, contiene i link di 142 schede;
 * quella del latte di Despar 205. Quel che alle altre insegne da' la sitemap,
 * qui lo danno le vetrine.
 *
 * COSA FA, IN UNA RIGA
 * --------------------
 * Apre i reparti dichiarati in sitemap, raccoglie i link di prodotto che ci
 * trova dentro, e salva il catalogo esattamente come farebbe una sitemap
 * normale. Da li' in poi non c'e' niente di speciale: legge i prezzi il
 * lettore di sempre.
 *
 * PERCHE' NON L'HO MESSO DENTRO `daUnaFonte`
 * ------------------------------------------
 * Perche' `daUnaFonte` gira mentre un utente aspetta, e aprire duecento
 * pagine di reparto sono duecento richieste al negozio: e' lavoro da raccolta,
 * non da risposta. E perche' la regola che scarta i reparti e' costata cara
 * (tremila schede italiane buttate per averla allargata troppo) e non la tocco
 * per un caso particolare.
 *
 * QUANTO PESA PER IL NEGOZIO
 * --------------------------
 * Duecento richieste in tutto, una ogni secondo, una volta ogni tanto. Un
 * utente che sfoglia il sito ne fa di piu'. La pausa e' regolabile e il valore
 * di partenza e' quello prudente, non quello veloce: e' andata male una volta
 * in Spagna e sono stati 93.000 prezzi veri persi.
 *
 *   npx tsx --env-file-if-exists=.env scripts/raccogli-vetrine.ts IT Todis
 *   npx tsx --env-file-if-exists=.env scripts/raccogli-vetrine.ts IT Despar --pausa 1500
 *   npx tsx --env-file-if-exists=.env scripts/raccogli-vetrine.ts IT Todis --prova
 */

import { gzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { assicuraFonti, fontiDi } from "../src/api/catalogo-fonti.js";
import { salvaCatalogo } from "../src/api/catalogo-magazzino.js";
import { INTESTAZIONE_BROWSER } from "../src/base/intestazione.js";
import { posso } from "../src/base/robots.js";
import { nomeDaUrl } from "../src/api/catalogo.js";

const arg = (nome: string) =>
  process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : undefined;

const paese = (process.argv[2] ?? "").toUpperCase();
const chi = process.argv[3] ?? "";
const prova = process.argv.includes("--prova");
/** Una richiesta al secondo. Vedi sopra: il valore prudente, non il veloce. */
const PAUSA = Number(arg("--pausa") ?? 1000);
/** Quante vetrine al massimo. Serve solo a non restare appesi a un sito immenso. */
const MAX_VETRINE = Number(arg("--vetrine") ?? 600);

if (!paese || !chi) {
  console.error("");
  console.error("  Servono paese e insegna:  scripts/raccogli-vetrine.ts IT Todis");
  console.error("");
  process.exit(1);
}

const n = (v: number) => v.toLocaleString("it-IT");
const aspetta = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Una scheda prodotto, per come la scrivono i siti di questo tipo.
 *
 * `/prodotto/nome-per-esteso-1248405`: parole piu' codice, la stessa forma che
 * `paScheda` riconosce altrove. Tengo anche le varianti straniere perche' la
 * piattaforma e' la stessa e cambia solo la parola.
 */
const E_UNA_SCHEDA = /\/(prodotto|prodotti|product|producto|produkt)\/[^/?#]+$/i;

/** Il reparto: quel che qui serve aprire e altrove serve scartare. */
function vaAperta(u: string): boolean {
  if (E_UNA_SCHEDA.test(u)) return false;
  /* Le pagine di servizio non hanno prodotti e costano una richiesta ognuna.
     Sono poche e si riconoscono dal nome; nel dubbio si apre, perche' saltare
     un reparto vero costa piu' che aprire un «contatti». */
  return !/\/(come-funziona|contatti|privacy|cookie|condizioni|note-legali|faq|chi-siamo|login|registrati)(\?|$)/i.test(
    u,
  );
}

async function pagina(u: string): Promise<string | null> {
  try {
    const res = await fetch(u, {
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
      headers: { ...INTESTAZIONE_BROWSER, "Accept-Language": "it-IT,it;q=0.9,en;q=0.8" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

await assicuraFonti();
const fonte = fontiDi(paese).find((f) => f.insegna.toLowerCase().includes(chi.toLowerCase()));

if (!fonte) {
  console.error("");
  console.error(`  Nessuna fonte «${chi}» per ${paese}.`);
  console.error(`  Aggiungila prima:  scripts/aggiungi-insegna.ts`);
  console.error("");
  process.exit(1);
}

const radice = new URL(fonte.sitemap).origin;

/* SI CHIEDE IL PERMESSO PRIMA DI BUSSARE, NON DOPO.
   Non e' burocrazia: il motore lo vendiamo, e un divieto ignorato lo paga chi
   compra. Todis e Despar vietano il carrello e il login e permettono i
   prodotti — l'abbiamo letto, non supposto. */
const varco = await posso(`${radice}/prodotto/`);
if (!varco.ok) {
  console.error("");
  console.error(`  ${radice}/robots.txt non permette le schede prodotto (${varco.regola}). Non si passa sopra.`);
  console.error("");
  process.exit(1);
}

console.log("");
console.log(`VETRINE ${paese}|${fonte.insegna}`);
console.log(`  sitemap  ${fonte.sitemap}`);
console.log("");

const xml = await pagina(fonte.sitemap);
if (!xml) {
  console.error(`  la sitemap non ha risposto.`);
  process.exit(1);
}

const dichiarati = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) =>
  m[1].replace(/&amp;/g, "&"),
);
const vetrine = dichiarati.filter(vaAperta).slice(0, MAX_VETRINE);
const schedeInSitemap = dichiarati.filter((u) => E_UNA_SCHEDA.test(u));

console.log(`  ${n(dichiarati.length)} indirizzi in sitemap`);
console.log(`  ${n(schedeInSitemap.length)} sono schede prodotto`);
console.log(`  ${n(vetrine.length)} vetrine da aprire  (una ogni ${PAUSA}ms)`);
console.log("");

if (prova) {
  vetrine.slice(0, 8).forEach((u) => console.log(`    ${u}`));
  console.log("");
  console.log("  --prova: non ho aperto niente.");
  process.exit(0);
}

/* Le schede gia' in sitemap, se ce ne sono, entrano comunque: questo comando
   AGGIUNGE un modo di trovarle, non ne sostituisce un altro. */
const trovate = new Map<string, string>();
for (const u of schedeInSitemap) trovate.set(u, nomeDaUrl(u) ?? "");

let aperte = 0;
let vuote = 0;
const partito = Date.now();

for (const v of vetrine) {
  const eti = `  ${decodeURIComponent(v.replace(radice, "")).slice(0, 52).padEnd(52)}`;
  const html = await pagina(v);
  aperte++;
  if (!html) {
    console.log(`${eti}  non risponde`);
    await aspetta(PAUSA);
    continue;
  }

  const prima = trovate.size;
  for (const m of html.matchAll(/href="([^"]*\/(?:prodotto|product|producto)\/[^"?#]+)"/gi)) {
    const u = new URL(m[1], radice).toString();
    if (!u.startsWith(radice)) continue;
    if (!E_UNA_SCHEDA.test(u)) continue;
    if (trovate.has(u)) continue;
    /* IL NOME SI PRENDE DALL'INDIRIZZO, NON DAL TESTO DEL LINK.
       Il testo del link a volte e' «Aggiungi», a volte e' vuoto perche' il
       link avvolge l'immagine. L'indirizzo il nome ce l'ha sempre, ed e' la
       stessa fonte da cui lo prendono tutte le altre insegne: cambiarla qui
       vorrebbe dire due cataloghi scritti in due lingue diverse. */
    const nome = nomeDaUrl(u);
    if (!nome) continue;
    trovate.set(u, nome);
  }

  const nuovi = trovate.size - prima;
  if (nuovi === 0) vuote++;
  console.log(`${eti}  ${String(nuovi).padStart(4)} nuovi   (${n(trovate.size)})`);
  await aspetta(PAUSA);
}

const minuti = Math.round((Date.now() - partito) / 60000);
console.log("");
console.log(
  `  ${n(aperte)} vetrine aperte · ${n(vuote)} senza prodotti · ${n(trovate.size)} schede · ${minuti} minuti`,
);

if (trovate.size === 0) {
  console.log("");
  console.log("  Niente da salvare: le vetrine non contengono link di prodotto.");
  console.log("  Vuol dire che i prodotti li disegna il browser, e qui serve altro.");
  console.log("");
  process.exit(0);
}

const voci = [...trovate].map(([url, nome]) => ({ url, nome }));

try {
  await salvaCatalogo(paese, fonte.insegna, voci);
  console.log(`  salvate in magazzino.`);
} catch (err) {
  /* Stessa regola di `raccogli-catalogo`: il lavoro fatto non si butta perche'
     manca il posto dove scriverlo. Rifarlo domani vorrebbe dire duecento
     richieste in piu' allo stesso negozio per niente. */
  mkdirSync("diario/raccolto", { recursive: true });
  const nomeFile = `${paese}-${fonte.insegna.replace(/[^\p{L}\p{N}]+/gu, "_")}.txt.gz`;
  writeFileSync(
    `diario/raccolto/${nomeFile}`,
    gzipSync(Buffer.from(voci.map((v) => v.url).join("\n"), "utf8"), { level: 6 }),
  );
  console.log(`  SUL DISCO (diario/raccolto/${nomeFile}) — il database non le ha prese:`);
  console.log(`  ${err instanceof Error ? err.message.slice(0, 80) : err}`);
  console.log(`  Il lettore non le vede finche' non le travasi.`);
}

console.log("");
console.log("Adesso i prezzi:");
console.log(
  `  npx tsx --env-file-if-exists=.env scripts/lettore.ts --solo ${paese} --paesi 1 --minuti 60`,
);
console.log("");
process.exit(0);
