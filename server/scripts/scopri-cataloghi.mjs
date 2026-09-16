/**
 * Scopre i cataloghi, scendendo dove il primo tentativo si fermava.
 *
 * PERCHE' UN SECONDO SCRIPT
 * -------------------------
 * `prova-sitemap.mjs` ha fatto il giro veloce su 136 insegne e ne ha trovate
 * 47. Ma sotto-conta, e lo so perche' l'ho verificato a mano: Carrefour
 * Belgio, REWE, Migros e Albert Heijn pubblicano il catalogo e risultavano
 * «senza prodotti». Cinquantuno insegne sono in quella casella, e li' dentro
 * c'e' mezza Europa.
 *
 * COSA FA DI PIU'
 * ---------------
 * 1. PROVA TUTTE LE FIGLIE, non le prime otto scelte per nome. Carrefour
 *    Belgio chiama le sue `sitemap_0.xml`, `sitemap_1.xml`: nessuna parola le
 *    annuncia, e filtrando per nome sparivano.
 *
 * 2. SCENDE DUE LIVELLI. Parecchi negozi hanno un indice di indici, e al
 *    secondo salto il primo giro si fermava.
 *
 * 3. TENTA GLI INDIRIZZI CONSUETI quando `robots.txt` non risponde. Ventisei
 *    insegne sono cadute li', ma un `robots.txt` bloccato non significa che
 *    la sitemap non ci sia: spesso e' allo stesso posto di sempre.
 *
 * 4. ACCETTA SOGLIE PIU' BASSE. Venti prodotti in una sitemap sono pochi per
 *    un supermercato, ma sono la prova che quella e' la sitemap giusta — e
 *    accanto ce ne saranno altre.
 *
 * Costa piu' richieste e piu' tempo del primo giro. Va bene: si fa una volta,
 * e il risultato e' l'elenco delle fonti su cui l'app vive.
 *
 * Uso:  node scripts/scopri-cataloghi.mjs [--solo AT,BE,CH]
 */

import { writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Dove le sitemap stanno quasi sempre, quando `robots.txt` non parla. */
const POSTI_CONSUETI = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap-index.xml",
  "/sitemaps/sitemap.xml",
  "/sitemap/sitemap.xml",
  "/sitemap.xml.gz",
  "/product-sitemap.xml",
  "/sitemap_products_1.xml",
  "/sitemaps.xml",
];

/** Quante sitemap figlie aprire per insegna. Oltre, il tempo non rende. */
const MAX_FIGLIE = 14;
/** Quanti prodotti bastano a dire «questa e' la sitemap giusta». */
const MINIMO_PRODOTTI = 20;

async function prendi(url, { binario = false, ms = 30_000 } = {}) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Encoding": "gzip, deflate" },
      redirect: "follow",
      signal: AbortSignal.timeout(ms),
    });
    if (!res.ok) return { stato: res.status, corpo: null };
    if (binario) return { stato: res.status, corpo: Buffer.from(await res.arrayBuffer()) };
    return { stato: res.status, corpo: await res.text() };
  } catch (err) {
    return { stato: /timed? ?out|abort/i.test(String(err)) ? "timeout" : "rete", corpo: null };
  }
}

async function scarica(url) {
  if (url.endsWith(".gz")) {
    const r = await prendi(url, { binario: true, ms: 45_000 });
    if (!r.corpo) return null;
    try {
      return gunzipSync(r.corpo).toString("utf8");
    } catch {
      return null;
    }
  }
  const r = await prendi(url, { ms: 45_000 });
  return r.corpo;
}

const indirizzi = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);

/**
 * Questo indirizzo e' la scheda di un prodotto?
 *
 * Due forme coprono quasi tutti i negozi visti: un segmento che lo dichiara,
 * oppure un nome lungo seguito da un identificativo. Nel dubbio si scarta —
 * una categoria spacciata per prodotto manda l'utente sullo scaffale.
 */
function paProdotto(u) {
  if (
    /\/(p|pd|dp|product|products|producto|productos|produkt|produkte|prodotto|prodotti|produit|produits|artikel|artikelen|item|items|urun|proizvod|termek|tuote|vara|produkty|produkt-detail|pdp)\//i.test(
      u,
    )
  ) {
    return true;
  }
  return /[a-z]{3,}(?:-[a-z0-9]{2,}){2,}[/_-]\d{5,}/i.test(u);
}

/** Le sitemap che non vale la pena aprire: parlano d'altro. */
const FUORI_TEMA =
  /recipe|recept|rezept|ricett|blog|news|article|video|magazin|hjelp|help|service|klantenservice|store-?locator|filial|winkel|jobs|career/i;

/**
 * Da una sitemap, arriva ai prodotti scendendo fino a due livelli.
 *
 * Restituisce quante schede ha contato e dove le ha trovate. Non si ferma alla
 * prima figlia buona: le somma, perche' i cataloghi grossi sono spezzati in
 * decine di file e fermarsi al primo darebbe un decimo del vero.
 */
async function esplora(url, livello = 0, visti = new Set()) {
  if (livello > 2 || visti.has(url)) return { prodotti: 0, dove: null, esempio: null };
  visti.add(url);

  const xml = await scarica(url);
  if (!xml) return { prodotti: 0, dove: null, esempio: null };

  const voci = indirizzi(xml);
  if (voci.length === 0) return { prodotti: 0, dove: null, esempio: null };

  // Sitemap piatta: si contano gli indirizzi che hanno forma di prodotto.
  if (!/<sitemapindex/i.test(xml)) {
    const schede = voci.filter(paProdotto);
    return schede.length >= MINIMO_PRODOTTI
      ? { prodotti: schede.length, dove: url, esempio: schede[0] }
      : { prodotti: 0, dove: null, esempio: null };
  }

  // E' un indice. Si aprono le figlie — TUTTE, tolte quelle che parlano
  // chiaramente d'altro — perche' il nome non dice quasi mai cosa contengono.
  const figlie = voci.filter((u) => !FUORI_TEMA.test(u)).slice(0, MAX_FIGLIE);

  let totale = 0;
  let dove = null;
  let esempio = null;
  for (const f of figlie) {
    const r = await esplora(f, livello + 1, visti);
    if (r.prodotti > 0) {
      totale += r.prodotti;
      dove ??= r.dove;
      esempio ??= r.esempio;
    }
  }
  return { prodotti: totale, dove, esempio };
}

/** Le sitemap dichiarate e cosa vieta a tutti i robot. */
function leggiRobots(testo) {
  const sitemap = [];
  const vietati = [];
  let perTutti = false;
  for (const riga of testo.split("\n").map((r) => r.trim())) {
    const m = /^sitemap:\s*(\S+)/i.exec(riga);
    if (m) {
      sitemap.push(m[1]);
      continue;
    }
    if (/^user-agent:/i.test(riga)) {
      perTutti = /^user-agent:\s*\*\s*$/i.test(riga);
      continue;
    }
    if (perTutti) {
      const d = /^disallow:\s*(\S*)/i.exec(riga);
      if (d && d[1]) vietati.push(d[1]);
    }
  }
  return { sitemap, vietati };
}

async function esamina(insegna) {
  const base = `https://${insegna.dominio.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  const rob = await prendi(`${base}/robots.txt`, { ms: 20_000 });

  let sitemap = [];
  let vietati = [];
  let robotsLetto = false;

  if (rob.corpo) {
    robotsLetto = true;
    ({ sitemap, vietati } = leggiRobots(rob.corpo));
  }

  /* IL `robots.txt` BLOCCATO NON VUOL DIRE CHE LA SITEMAP NON CI SIA.
     Ventisei insegne erano cadute qui al primo giro. Ma un sito che rifiuta
     `robots.txt` spesso serve la sitemap all'indirizzo di sempre: chiederlo
     costa una richiesta e recupera insegne intere. */
  if (sitemap.length === 0) {
    for (const p of POSTI_CONSUETI) {
      const prova = await scarica(`${base}${p}`);
      if (prova && /<(urlset|sitemapindex)/i.test(prova)) {
        sitemap.push(`${base}${p}`);
        break;
      }
    }
  }

  if (sitemap.length === 0) {
    return { ...insegna, esito: "nessuna sitemap", robotsLetto };
  }

  // Le schede prodotto sono aperte ai robot? Se non lo sono, non si tocca.
  const vietaSchede = vietati.some((v) =>
    /^\/p(\/|$)|prodott|produ[ck]t|producto|produit|\/dp\/|\/pd\//i.test(v),
  );

  for (const s of sitemap.slice(0, 5)) {
    const r = await esplora(s);
    if (r.prodotti > 0) {
      return {
        ...insegna,
        esito: "PRODOTTI",
        prodotti: r.prodotti,
        sitemap: r.dove,
        esempio: r.esempio,
        vietaSchede,
        robotsLetto,
      };
    }
  }
  return { ...insegna, esito: "sitemap senza prodotti", sitemapDichiarate: sitemap.length, robotsLetto };
}

async function aBrani(cose, quante, lavoro) {
  const fuori = [];
  for (let i = 0; i < cose.length; i += quante) {
    fuori.push(...(await Promise.all(cose.slice(i, i + quante).map(lavoro))));
  }
  return fuori;
}

async function main() {
  const { caricaFontiDalDb, tutteLeFonti } = await import("../src/api/catalogo-fonti.js");
  await caricaFontiDalDb();
  const FONTI = tutteLeFonti();
  const precedenti = JSON.parse(
    await import("node:fs").then((fs) => fs.promises.readFile("diario/sitemap-insegne.json", "utf8")),
  );

  // Si riprovano solo quelle che al primo giro non avevano dato prodotti:
  // le altre sono gia' fonti e non c'e' niente da scoprire.
  const gia = new Set(FONTI.map((f) => `${f.paese}|${f.insegna}`));
  const daRiprovare = precedenti
    .filter((x) => x.esito !== "PRODOTTI" && x.dominio)
    .filter((x) => !gia.has(`${x.paese}|${x.nome}`))
    .map((x) => ({ paese: x.paese, nome: x.nome, dominio: x.dominio }));

  const filtro = process.argv.includes("--solo")
    ? new Set(process.argv[process.argv.indexOf("--solo") + 1].split(",").map((s) => s.trim().toUpperCase()))
    : null;
  const elenco = filtro ? daRiprovare.filter((x) => filtro.has(x.paese)) : daRiprovare;

  console.log(`${elenco.length} insegne da riprovare, con il rilevatore che scende piu' a fondo\n`);

  const esiti = await aBrani(elenco, 5, async (i) => {
    const e = await esamina(i);
    const riga =
      e.esito === "PRODOTTI"
        ? `${String(e.prodotti).padStart(7)} prodotti${e.vietaSchede ? "  (ma il robots.txt le vieta)" : ""}`
        : `        ${e.esito}`;
    console.log(`${e.paese}  ${e.nome.padEnd(28).slice(0, 28)} ${riga}`);
    return e;
  });

  const nuove = esiti.filter((e) => e.esito === "PRODOTTI" && !e.vietaSchede);
  console.log("\n" + "═".repeat(68));
  console.log(`  RECUPERATE: ${nuove.length} insegne in ${new Set(nuove.map((e) => e.paese)).size} paesi`);
  console.log(`  prodotti in piu': ${nuove.reduce((n, e) => n + e.prodotti, 0).toLocaleString("it-IT")}`);
  console.log("═".repeat(68));

  writeFileSync("diario/cataloghi-nuovi.json", JSON.stringify(esiti, null, 2), "utf8");
  console.log("\nDettaglio in diario/cataloghi-nuovi.json\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
