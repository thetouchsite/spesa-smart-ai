/**
 * Il confine fra l'API e l'app, verificato invece che ricordato.
 *
 * PERCHE' ESISTE
 * --------------
 * L'API deve poter essere staccata da questo repo, un giorno, con un `git mv`
 * e un `package.json`. Perche' resti possibile serve che valga una regola sola:
 *
 *     api/ non importa MAI niente da app/
 *
 * Il contrario si': l'app usa l'API come la userebbe un estraneo.
 *
 * Una regola scritta in un file la si dimentica in due settimane. Non per
 * cattiva volonta' — si sta sistemando un baco alle undici di sera, serve una
 * funzione che sta di la', si importa, e funziona. Nessuno se ne accorge.
 * Fra tre mesi i fili sono venti invece di tre e staccare l'API e' un mese di
 * lavoro invece di un pomeriggio.
 *
 * Quindi lo verifica il build.
 *
 * COME FUNZIONA, E PERCHE' NON FALLISCE SUBITO
 * --------------------------------------------
 * Oggi i fili ci sono gia': sono tre, misurati. Uno script che fallisse per
 * quelli renderebbe il build rosso da adesso fino a quando non sono tutti
 * tagliati, e un build sempre rosso e' un build che si smette di guardare.
 *
 * Allora fa il contrario, come un cricchetto: i tre di oggi stanno scritti qui
 * sotto in `TOLLERATI`, con accanto il motivo e quando spariranno. Passano. Un
 * filo NUOVO invece ferma tutto.
 *
 * E c'e' la regola che tiene onesto l'elenco: se un tollerato non esiste piu'
 * — perche' e' stato tagliato — lo script fallisce lo stesso, chiedendo di
 * toglierlo da qui. Cosi' il numero puo' solo scendere, e quello che scende non
 * puo' tornare su di nascosto.
 *
 * L'ALTRA REGOLA: OGNI FILE HA UN PADRONE
 * ---------------------------------------
 * Un file nuovo che nessuno ha dichiarato fa fallire lo script. Sembra
 * pedante e invece e' il pezzo che conta di piu': obbliga a rispondere «questo
 * e' API o e' app?» il giorno che il file nasce, che e' l'unico giorno in cui
 * la risposta e' facile.
 *
 * PRIMA E DOPO LO SPOSTAMENTO
 * ---------------------------
 * Adesso i file stanno tutti in `src/` e il padrone si legge in `PADRONI`.
 * Dopo lo spostamento si leggera' dal percorso — `src/api/...` e `src/app/...`
 * — e `PADRONI` servira' solo per quel che resta in mezzo. Lo script gestisce
 * tutte e due le situazioni, apposta: deve funzionare PRIMA dello spostamento,
 * per poterlo verificare.
 *
 * Uso:  node scripts/confine.mjs [--dettaglio]
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SORGENTE = "src";

/**
 * Chi possiede cosa, finche' i file stanno tutti nella stessa cartella.
 *
 *   api    il prodotto: catalogo, ricerca, prezzi, negozi
 *   app    il servizio al cliente: menu, ricette, utenti, liste salvate
 *   base   quel che serve a tutti e due, e che seguirebbe l'API se se ne va
 *   radice il punto in cui si montano tutti e due: puo' importare da ovunque
 */
const PADRONI = {
  // ── api ────────────────────────────────────────────────────────────
  catalogo: "api",
  "catalogo-fonti": "api",
  "catalogo-it": "api",
  "catalogo-magazzino": "api",
  "catalogo-notturno": "api",
  "prezzi-magazzino": "api",
  "price-page": "api",
  "prices-catalogo": "api",
  "prices-serpapi": "api",
  "prezzi-api": "api",
  negozi: "api",
  "insegne-online": "api",
  vocabolario: "api",
  sinonimi: "api",
  "fallback-link": "api",

  // ── app ────────────────────────────────────────────────────────────
  /* Il modello e la ricerca sul web stanno di qua per una ragione precisa:
     inventare un menu e' un servizio ed e' giusto che usi l'IA, dire quanto
     costa il latte a Milano e' un dato e un dato non si inventa. Se un giorno
     un file dell'API importa `gemini`, e' quella distinzione che si sta
     perdendo, e lo script deve dirlo. */
  "plan-grounded": "app",
  prompts: "app",
  gemini: "app",
  search: "app",
  amazon: "app",
  "amazon-search": "app",
  shopping: "app",
  auth: "app",

  // ── base ───────────────────────────────────────────────────────────
  db: "base",
  http: "base",
  diario: "base",
  quota: "base",
  interruttore: "base",
  schemas: "base",

  // ── radice ─────────────────────────────────────────────────────────
  index: "radice",
};

/**
 * I fili che ci sono gia', e che sappiamo.
 *
 * Ognuno dice PERCHE' esiste e QUANDO sparisce. Un tollerato senza una via
 * d'uscita scritta e' un tollerato per sempre, e allora tanto vale togliere lo
 * script.
 */
const TOLLERATI = [
  {
    da: "prices-catalogo",
    a: "plan-grounded",
    perche: "la scelta del modello fra i candidati, e il ripiego del dizionario",
    quando: "Fase 3: sparisce quando il modello esce dalla strada dei prezzi",
  },
  {
    da: "fallback-link",
    a: "amazon",
    perche: "il link di ricerca su Amazon quando non c'e' una scheda",
    quando: "Fase 1: il link di ripiego e' roba dell'app, non un dato",
  },
  {
    da: "prices-serpapi",
    a: "shopping",
    perche: "la strada prezzi via SerpAPI, che oggi non usiamo",
    quando: "Fase 1: o si sposta in app/, o si toglie del tutto",
  },
];

/* ─────────────────────────── il lavoro ─────────────────────────────── */

/** Tutti i .ts sotto src/, anche annidati. */
function tuttiIFile(cartella) {
  const fuori = [];
  for (const voce of readdirSync(cartella)) {
    const intero = join(cartella, voce);
    if (statSync(intero).isDirectory()) fuori.push(...tuttiIFile(intero));
    else if (voce.endsWith(".ts") && !voce.endsWith(".d.ts")) fuori.push(intero);
  }
  return fuori;
}

/**
 * Di chi e' questo file.
 *
 * Il percorso vince sulla tabella: dopo lo spostamento `src/api/ricerca.ts` e'
 * dell'API perche' sta li', senza bisogno di dichiararlo. La tabella serve
 * adesso, e dopo solo per quel che resta in `src/` nudo.
 */
function padroneDi(percorso) {
  const pezzi = relative(SORGENTE, percorso).split(sep);
  if (pezzi.length > 1) {
    if (pezzi[0] === "api") return "api";
    if (pezzi[0] === "app") return "app";
    if (pezzi[0] === "base") return "base";
  }
  const nome = pezzi[pezzi.length - 1].replace(/\.ts$/, "");
  return PADRONI[nome] ?? null;
}

/** Gli import relativi di un file, con il numero di riga. */
function importaDa(percorso) {
  const righe = readFileSync(percorso, "utf8").split(/\r?\n/);
  const fuori = [];
  righe.forEach((riga, i) => {
    // `from "./x.js"`, `from "../api/x.js"`, e anche gli import dinamici.
    const m = riga.match(/from ["'](\.[^"']+)\.js["']|import\(["'](\.[^"']+)\.js["']\)/);
    if (!m) return;
    const rif = m[1] ?? m[2];
    fuori.push({ riga: i + 1, nome: rif.split("/").pop(), rif });
  });
  return fuori;
}

const file = tuttiIFile(SORGENTE);
const dettaglio = process.argv.includes("--dettaglio");

const senzaPadrone = [];
const nuovi = [];
const trovati = new Set();

for (const percorso of file) {
  const mio = padroneDi(percorso);
  if (mio === null) {
    senzaPadrone.push(relative(SORGENTE, percorso));
    continue;
  }
  if (mio !== "api") continue;

  const io = relative(SORGENTE, percorso).replace(/\.ts$/, "").split(sep).pop();

  for (const imp of importaDa(percorso)) {
    // Il padrone dell'importato: stessa logica, ma partendo dal nome.
    const suo = PADRONI[imp.nome] ?? null;
    if (suo !== "app") continue;

    const chiave = `${io}→${imp.nome}`;
    trovati.add(chiave);
    if (!TOLLERATI.some((t) => t.da === io && t.a === imp.nome)) {
      nuovi.push(`  ${relative(SORGENTE, percorso)}:${imp.riga}  →  ${imp.nome}.ts`);
    }
  }
}

/* I tollerati che non esistono piu': l'elenco deve restare vero. */
const spariti = TOLLERATI.filter((t) => !trovati.has(`${t.da}→${t.a}`));

let male = false;

if (senzaPadrone.length) {
  male = true;
  console.error("\n✗ FILE SENZA PADRONE\n");
  console.error("  Questi file non sono dichiarati in scripts/confine.mjs.");
  console.error("  Sono dell'API o dell'app? Rispondere adesso costa un minuto;");
  console.error("  rispondere fra sei mesi vuol dire rileggerli tutti.\n");
  for (const f of senzaPadrone) console.error(`    ${f}`);
}

if (nuovi.length) {
  male = true;
  console.error("\n✗ FILO NUOVO FRA API E APP\n");
  console.error("  L'API ha importato qualcosa dall'app. Se resta, un giorno");
  console.error("  staccare l'API non sara' piu' un `git mv`.\n");
  for (const r of nuovi) console.error(r);
  console.error("\n  Le vie d'uscita, in ordine di preferenza:");
  console.error("    · spostare la funzione in base/, se serve a tutti e due");
  console.error("    · farne a meno nell'API");
  console.error("    · rovesciare il verso: che sia l'app a chiamare l'API");
  console.error("    · se proprio non se ne esce, aggiungerlo a TOLLERATI —");
  console.error("      ma con scritto PERCHE' e QUANDO sparisce.");
}

if (spariti.length) {
  male = true;
  console.error("\n✗ TOLLERATI CHE NON ESISTONO PIU'\n");
  console.error("  Questi fili sono stati tagliati: bell'affare. Vanno tolti da");
  console.error("  TOLLERATI, se no l'elenco racconta un debito che non c'e'");
  console.error("  piu' — e un filo uguale potrebbe rinascere senza che nessuno");
  console.error("  se ne accorga.\n");
  for (const t of spariti) console.error(`    ${t.da} → ${t.a}`);
}

if (male) {
  console.error("");
  process.exit(1);
}

const quanti = file.length;
const perPadrone = {};
for (const f of file) {
  const p = padroneDi(f) ?? "?";
  perPadrone[p] = (perPadrone[p] ?? 0) + 1;
}

console.log(
  `✓ confine api/app: ${quanti} file dichiarati ` +
    `(api ${perPadrone.api ?? 0}, app ${perPadrone.app ?? 0}, base ${perPadrone.base ?? 0}), ` +
    `${TOLLERATI.length} fili ancora da tagliare`,
);

if (dettaglio) {
  console.log("\n  i fili che restano:");
  for (const t of TOLLERATI) {
    console.log(`    ${t.da} → ${t.a}`);
    console.log(`        perche':  ${t.perche}`);
    console.log(`        va via:   ${t.quando}`);
  }
}
