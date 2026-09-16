/**
 * La battuta di caccia grossa: cataloghi validi in tutta Europa.
 *
 * COSA FA, E PERCHE' CI METTE ORE
 * -------------------------------
 * Prende trecento e passa catene alimentari europee e, per ognuna, fa tre
 * cose in fila:
 *
 *   1. TROVA     cerca le sitemap — dichiarate in `robots.txt` o in una
 *                trentina di posti consueti — e le segue in profondita'
 *                finche' trova schede prodotto
 *   2. CONTA     stima quanti prodotti si raggiungono da quella radice
 *   3. PROVA     ne apre un campione VERO e misura quante schede rispondono e
 *                quante dichiarano il prezzo
 *
 * Il terzo passo e' quello che separa questo script dai precedenti, ed e'
 * anche il motivo per cui ci mette ore: aprire dodici pagine per trecento
 * insegne sono tremilaseicento richieste, con i tempi dei siti veri.
 *
 * PERCHE' IL TERZO PASSO E' INDISPENSABILE
 * ----------------------------------------
 * Perche' un catalogo grande non e' un catalogo utile. Misurato: in Spagna,
 * aggiungendo quattro catene, le voci con prezzo sono SCESE da quattro a una
 * su nove — Alcampo, Consum, Mercadona, Aldi ed El Corte Ingles pubblicano
 * centomila prodotti e il prezzo non lo dichiarano mai. Contare gli indirizzi
 * senza aprirli fa credere di aver guadagnato mentre si e' perso.
 *
 * COSA SCRIVE
 * -----------
 * `diario/scoperta-europa.json` a ogni insegna finita, non alla fine: se lo
 * script si ferma a meta' — rete, riavvio, un sito che lo blocca — il lavoro
 * fatto resta. E rilanciandolo riprende da dove era, saltando quelle gia'
 * misurate.
 *
 * Alla fine genera `diario/fonti-proposte.ts`, pronto da confrontare con
 * `src/catalogo-fonti.ts`. NON sovrascrive niente da solo: le fonti sono la
 * cosa su cui l'app vive, e ci si guarda dentro prima.
 *
 * SUL RISPETTO DEI SITI
 * ---------------------
 * Si legge `robots.txt` e si obbedisce: le insegne che vietano le schede
 * prodotto vengono scartate, per quanto grosso sia il loro catalogo. Fra una
 * richiesta e l'altra allo stesso dominio c'e' una pausa, e il campione e' di
 * dodici pagine — non si scarica nessun catalogo, si guarda se vale la pena.
 *
 * Uso:
 *   node scripts/scoperta-europa.mjs              tutto, da capo o riprendendo
 *   node scripts/scoperta-europa.mjs --solo ES,PT solo quei paesi
 *   node scripts/scoperta-europa.mjs --riparti    ignora il lavoro precedente
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
/*
 * Le candidate stanno in `insegne-europa.mjs`: e' un dato che cresce a ogni
 * giro, e tenerlo fuori dal programma vuol dire poterlo allungare senza
 * rileggere una riga di logica.
 */
import { INSEGNE as CANDIDATE } from "./insegne-europa.mjs";

/* ══════════════════════════════════════════════════════════════════
   LA RETE
   ══════════════════════════════════════════════════════════════════ */

/**
 * Gli header di un browser vero, non solo il suo nome.
 *
 * Misurato: mandando il solo `User-Agent`, `mercado.carrefour.com.br` risponde
 * 403; con l'intestazione completa curl riceve 200. I sistemi anti-bot
 * guardano tutto, e la loro assenza e' l'impronta che tradisce un programma.
 */
const INTESTAZIONE = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9,it;q=0.8",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
};

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

async function prendi(url, { binario = false, ms = 30_000 } = {}) {
  try {
    const res = await fetch(url, {
      headers: INTESTAZIONE,
      redirect: "follow",
      signal: AbortSignal.timeout(ms),
    });
    if (!res.ok) return null;
    return binario ? Buffer.from(await res.arrayBuffer()) : await res.text();
  } catch {
    return null;
  }
}

async function scarica(url) {
  if (url.endsWith(".gz")) {
    const b = await prendi(url, { binario: true, ms: 50_000 });
    if (!b) return null;
    try {
      return gunzipSync(b).toString("utf8");
    } catch {
      return null;
    }
  }
  return prendi(url, { ms: 50_000 });
}

const indirizzi = (x) => [...x.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);

/* ══════════════════════════════════════════════════════════════════
   RICONOSCERE UNA SCHEDA PRODOTTO
   ══════════════════════════════════════════════════════════════════ */

const SEGMENTI_PRODOTTO =
  /\/(p|pd|dp|prod|product|products|producto|productos|produkt|produkte|produkty|prodotto|prodotti|produit|produits|artikel|artikelen|item|items|urun|toode|tooted|prece|preces|prekes|proizvod|termek|izdelek|vara|varer|varor|tuote|tuotteet|pdp|proizvodi)\//i;

function paScheda(u) {
  if (SEGMENTI_PRODOTTO.test(u)) return true;
  // nome-lungo-con-trattini seguito da un identificativo: la forma piu'
  // diffusa dopo il segmento esplicito.
  return /[a-z]{3,}(?:-[a-z0-9]{2,}){2,}[/_-]\d{5,}/i.test(u);
}

/** Sitemap che parlano d'altro: non vale la pena aprirle. */
const FUORI_TEMA =
  /recipe|recept|rezept|ricett|blog|news|article|video|magazin|hjelp|help|service|klantenservice|store-?locator|filial|winkel|jobs|career|press|sitemap-?misc|category|categor|marken|brand/i;

/* ══════════════════════════════════════════════════════════════════
   I TRE PASSI
   ══════════════════════════════════════════════════════════════════ */

const VARIANTI = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap-index.xml",
  "/sitemapindex.xml",
  "/sitemaps/sitemap.xml",
  "/sitemap/sitemap.xml",
  "/sitemaps/sitemap_index.xml",
  "/sitemap/index.xml",
  "/sitemaps.xml",
  "/product-sitemap.xml",
  "/product_sitemap.xml",
  "/sitemap_products.xml",
  "/sitemap-products.xml",
  "/sitemap_products_1.xml",
  "/sitemap-products-1.xml",
  "/sitemaps/products.xml",
  "/sitemap/products.xml",
  "/sitemap/product_0.xml",
  "/sitemaps/sitemap-products-part1.xml",
  "/product1.xml",
  "/sitemap.xml.gz",
  "/sitemap_index.xml.gz",
  "/wp-sitemap.xml",
  "/wp-sitemap-posts-product-1.xml",
  "/sitemap_index.xml?page=1",
];

/** Le radici da provare: quelle dichiarate piu' le consuete. */
async function radici(dominio) {
  const base = `https://${dominio}`;
  const fuori = new Set();
  let vieta = false;
  let robotsLetto = false;

  const rob = await prendi(`${base}/robots.txt`, { ms: 20_000 });
  if (rob) {
    robotsLetto = true;
    for (const m of rob.matchAll(/^sitemap:\s*(\S+)/gim)) fuori.add(m[1].trim());

    let perTutti = false;
    for (const riga of rob.split("\n").map((r) => r.trim())) {
      if (/^user-agent:/i.test(riga)) perTutti = /^user-agent:\s*\*\s*$/i.test(riga);
      else if (perTutti) {
        const d = /^disallow:\s*(\S+)/i.exec(riga);
        if (d && (SEGMENTI_PRODOTTO.test(d[1] + "/") || /^\/\s*$/.test(d[1]))) vieta = true;
      }
    }
  }
  for (const v of VARIANTI) fuori.add(`${base}${v}`);
  return { radici: [...fuori], vieta, robotsLetto };
}

/**
 * Da una radice, tutte le schede raggiungibili — contate, non scaricate.
 *
 * Campiona le figlie di un indice e moltiplica: serve a confrontare due
 * radici, non a dichiarare un numero. Raccoglie anche qualche indirizzo vero,
 * che servira' al terzo passo per aprire le pagine.
 */
async function conta(url, livello = 0, visti = new Set(), raccolti = []) {
  if (livello > 3 || visti.has(url) || visti.size > 50) return 0;
  visti.add(url);

  const xml = await scarica(url);
  if (!xml) return 0;
  const voci = indirizzi(xml);
  if (voci.length === 0) return 0;

  if (!/<sitemapindex/i.test(xml)) {
    const schede = voci.filter(paScheda);
    // Si tengono da parte alcuni indirizzi sparsi, per il campione.
    const passo = Math.max(1, Math.floor(schede.length / 6));
    for (let i = 0; i < schede.length && raccolti.length < 30; i += passo) {
      raccolti.push(schede[i]);
    }
    return schede.length;
  }

  const figlie = voci.filter((u) => !FUORI_TEMA.test(u));
  const campione = figlie.slice(0, 6);
  let somma = 0;
  for (const f of campione) {
    somma += await conta(f, livello + 1, visti, raccolti);
    await attendi(120);
  }
  return figlie.length > campione.length
    ? Math.round((somma / campione.length) * figlie.length)
    : somma;
}

/** Legge un prezzo da una pagina, con le forme piu' diffuse. */
function leggiPrezzo(html) {
  const schemi = [
    /"price"\s*:\s*"?([\d.,]+)"?/i,
    /"lowPrice"\s*:\s*"?([\d.,]+)"?/i,
    /"salePrice"\s*:\s*"?([\d.,]+)"?/i,
    /itemprop=["']price["'][^>]*content=["']([\d.,]+)["']/i,
    /<meta[^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["'][^>]+content=["']\s*([\d.,]+)/i,
    /"(?:currentPrice|finalPrice|unitPrice|sellingPrice|grossPrice)"\s*:\s*"?([\d.,]+)"?/i,
    /data-(?:product-)?price(?:-amount)?=["']\s*([\d.,]+)["']/i,
  ];
  for (const re of schemi) {
    const m = html.match(re);
    if (!m) continue;
    const n = Number.parseFloat(String(m[1]).replace(",", "."));
    if (Number.isFinite(n) && n > 0.01 && n < 100_000) return n;
  }
  return null;
}

/** Apre un campione di schede e misura quante rispondono e quante hanno prezzo. */
async function provaSchede(url) {
  let aperte = 0;
  let conPrezzo = 0;
  const esempi = [];

  for (const u of url) {
    const html = await prendi(u, { ms: 25_000 });
    if (html && html.length > 2000) {
      aperte++;
      const p = leggiPrezzo(html);
      if (p != null) {
        conPrezzo++;
        if (esempi.length < 3) esempi.push({ url: u, prezzo: p });
      }
    }
    // Una pausa fra una pagina e l'altra dello stesso negozio: sono ospiti.
    await attendi(400);
  }
  return { provate: url.length, aperte, conPrezzo, esempi };
}

/* ══════════════════════════════════════════════════════════════════
   IL GIRO
   ══════════════════════════════════════════════════════════════════ */

const DOVE = "diario/scoperta-europa.json";
const STATO = "diario/scoperta-stato.json";

/**
 * Il cruscotto: a che punto siamo, quanto manca, cosa si e' trovato finora.
 *
 * Si riscrive a ogni insegna finita, cosi' chi vuole sapere come sta andando
 * legge un file invece di guardare scorrere un log — e puo' farlo mentre lo
 * script gira, o da un'altra macchina, senza toccare niente.
 */
function scriviStato(avvio, esiti, totale, dafare) {
  const trascorsi = (Date.now() - avvio) / 1000;
  const fatte = esiti.length;
  const restano = dafare - (fatte - (totale - dafare));
  const alSecondo = fatte > 0 ? trascorsi / Math.max(1, fatte - (totale - dafare)) : 0;

  const utili = esiti.filter((e) => e.esito === "PRODOTTI" && e.resa > 0);
  const orologio = (s) =>
    `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;

  writeFileSync(
    STATO,
    JSON.stringify(
      {
        avvio: new Date(avvio).toISOString(),
        aggiornato: new Date().toISOString(),
        trascorso: orologio(trascorsi),
        stimaRimanente: orologio(Math.max(0, restano) * alSecondo),
        avanzamento: `${fatte}/${totale}`,
        percentuale: Math.round((fatte / totale) * 100),
        bottino: {
          conCatalogo: esiti.filter((e) => e.esito === "PRODOTTI").length,
          conPrezziConfermati: utili.length,
          paesi: [...new Set(utili.map((e) => e.paese))].sort(),
          prodottiStimati: utili.reduce((n, e) => n + e.stimati, 0),
          schedeAperteDavvero: esiti.reduce((n, e) => n + (e.aperte ?? 0), 0),
          prezziLettiDavvero: esiti.reduce((n, e) => n + (e.conPrezzo ?? 0), 0),
        },
        migliori: [...utili]
          .sort((a, b) => b.stimati - a.stimati)
          .slice(0, 20)
          .map((e) => ({
            paese: e.paese,
            insegna: e.nome,
            prodotti: e.stimati,
            resa: `${Math.round(e.resa * 100)}%`,
          })),
        ultime: esiti.slice(-8).map((e) => ({
          paese: e.paese,
          insegna: e.nome,
          esito: e.esito,
          prodotti: e.stimati ?? 0,
          resa: e.resa != null ? `${Math.round(e.resa * 100)}%` : null,
        })),
      },
      null,
      2,
    ),
    "utf8",
  );
}

function caricaPrecedenti() {
  if (!existsSync(DOVE)) return [];
  try {
    return JSON.parse(readFileSync(DOVE, "utf8"));
  } catch {
    return [];
  }
}

async function esamina([paese, nome, dominio]) {
  const inizio = Date.now();
  const { radici: rad, vieta, robotsLetto } = await radici(dominio);

  if (vieta) {
    return { paese, nome, dominio, esito: "vietata", robotsLetto, secondi: 0 };
  }

  let migliore = { url: null, stima: 0, indirizzi: [] };
  for (const r of rad) {
    const raccolti = [];
    const stima = await conta(r, 0, new Set(), raccolti);
    if (stima > migliore.stima) migliore = { url: r, stima, indirizzi: raccolti };
    // Se una radice porta gia' molto, non serve provarle tutte.
    if (migliore.stima > 5000) break;
  }

  if (!migliore.url || migliore.stima < 100) {
    return {
      paese,
      nome,
      dominio,
      esito: robotsLetto ? "nessun catalogo" : "irraggiungibile",
      robotsLetto,
      secondi: Math.round((Date.now() - inizio) / 1000),
    };
  }

  // Il terzo passo: le pagine vere.
  const campione = migliore.indirizzi.slice(0, 12);
  const prova = await provaSchede(campione);
  const resa = prova.provate ? prova.conPrezzo / prova.provate : 0;
  const apertura = prova.provate ? prova.aperte / prova.provate : 0;

  return {
    paese,
    nome,
    dominio,
    esito: "PRODOTTI",
    sitemap: migliore.url,
    stimati: migliore.stima,
    ...prova,
    resa: Number(resa.toFixed(2)),
    apertura: Number(apertura.toFixed(2)),
    robotsLetto,
    secondi: Math.round((Date.now() - inizio) / 1000),
  };
}

async function aBrani(cose, quante, lavoro) {
  const fuori = [];
  for (let i = 0; i < cose.length; i += quante) {
    fuori.push(...(await Promise.all(cose.slice(i, i + quante).map(lavoro))));
  }
  return fuori;
}

function scriviProposte(esiti) {
  const buone = esiti
    .filter((e) => e.esito === "PRODOTTI" && e.resa > 0 && e.apertura >= 0.5)
    .sort((a, b) => a.paese.localeCompare(b.paese) || b.stimati - a.stimati);

  const righe = buone.map(
    (b) =>
      `  { paese: ${JSON.stringify(b.paese)}, insegna: ${JSON.stringify(b.nome)}, ` +
      `dominio: ${JSON.stringify(b.dominio)}, sitemap: ${JSON.stringify(b.sitemap)}, ` +
      `resa: ${b.resa}, stimati: ${b.stimati} },`,
  );

  writeFileSync(
    "diario/fonti-proposte.ts",
    `/* Generato da scripts/scoperta-europa.mjs il ${new Date().toISOString().slice(0, 16)}.\n` +
      `   ${buone.length} insegne in ${new Set(buone.map((b) => b.paese)).size} paesi, ` +
      `${buone.reduce((n, b) => n + b.stimati, 0).toLocaleString("it-IT")} prodotti stimati.\n\n` +
      `   Tenute solo quelle con: catalogo trovato, almeno meta' delle schede che\n` +
      `   si aprono, e ALMENO UN PREZZO leggibile nel campione. Un catalogo grande\n` +
      `   senza prezzi peggiora l'app invece di migliorarla — misurato in Spagna. */\n\n` +
      `export const FONTI_PROPOSTE = [\n${righe.join("\n")}\n];\n`,
    "utf8",
  );
  return buone;
}

async function main() {
  const filtro = process.argv.includes("--solo")
    ? new Set(
        process.argv[process.argv.indexOf("--solo") + 1]
          .split(",")
          .map((s) => s.trim().toUpperCase()),
      )
    : null;
  const riparti = process.argv.includes("--riparti");

  const fatti = riparti ? [] : caricaPrecedenti();
  const gia = new Set(fatti.map((f) => `${f.paese}|${f.dominio}`));

  let elenco = CANDIDATE.filter(([p]) => !filtro || filtro.has(p));
  elenco = elenco.filter(([p, , d]) => !gia.has(`${p}|${d}`));

  console.log(
    `${CANDIDATE.length} insegne in elenco · ${fatti.length} gia' fatte · ` +
      `${elenco.length} da fare\n`,
  );

  const esiti = [...fatti];
  const avvio = Date.now();
  let contatore = 0;
  scriviStato(avvio, esiti, CANDIDATE.length, elenco.length);

  await aBrani(elenco, 4, async (c) => {
    const e = await esamina(c);
    esiti.push(e);
    contatore++;

    const riga =
      e.esito === "PRODOTTI"
        ? `${String(e.stimati).padStart(7)} prodotti · aperte ${e.aperte}/${e.provate} · ` +
          `prezzo ${e.conPrezzo}/${e.provate} · resa ${(e.resa * 100).toFixed(0)}%`
        : `        ${e.esito}`;
    console.log(
      `[${String(contatore).padStart(3)}/${elenco.length}] ${e.paese}  ` +
        `${e.nome.padEnd(22).slice(0, 22)} ${riga}`,
    );

    // Si salva a ogni insegna: se lo script si ferma, il lavoro resta.
    writeFileSync(DOVE, JSON.stringify(esiti, null, 2), "utf8");
    scriviStato(avvio, esiti, CANDIDATE.length, elenco.length);
    return e;
  });

  const buone = scriviProposte(esiti);

  console.log("\n" + "═".repeat(72));
  console.log("  ESITO DELLA CACCIA");
  console.log("═".repeat(72));
  const utili = esiti.filter((e) => e.esito === "PRODOTTI" && e.resa > 0);
  console.log(`  insegne esaminate          ${esiti.length}`);
  console.log(`  con catalogo               ${esiti.filter((e) => e.esito === "PRODOTTI").length}`);
  console.log(`  CON PREZZI LEGGIBILI       ${utili.length}`);
  console.log(`  paesi coperti              ${new Set(utili.map((e) => e.paese)).size}`);
  console.log(
    `  prodotti stimati           ${utili.reduce((n, e) => n + e.stimati, 0).toLocaleString("it-IT")}`,
  );
  console.log(`\n  proposte scritte: ${buone.length} in diario/fonti-proposte.ts`);

  console.log("\n  LE PIU' GENEROSE:");
  for (const e of [...utili].sort((a, b) => b.resa - a.resa || b.stimati - a.stimati).slice(0, 15)) {
    console.log(
      `    ${(e.resa * 100).toFixed(0).padStart(3)}%  ${e.paese}  ` +
        `${e.nome.padEnd(22).slice(0, 22)} ${e.stimati.toLocaleString("it-IT").padStart(9)}`,
    );
  }
  console.log();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
