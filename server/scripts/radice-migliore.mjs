/**
 * Per ogni insegna, la sitemap che porta a PIU' prodotti.
 *
 * PERCHE'
 * -------
 * La scansione si ferma alla prima sitemap che contiene prodotti, e quella
 * spesso e' un frammento. Migros Turchia risultava con 338 prodotti e ne
 * caricava 70 — bicchieri e shampoo; Barbora Estonia otto elettrodomestici.
 * Non e' il catalogo a essere magro: e' che stavamo leggendo un file laterale.
 *
 * Coop l'aveva gia' mostrato: `/sitemap.xml` non esiste, la sitemap vera sta
 * in `/sitemap/sitemap.xml`, e cercandola dove sembrava ovvio si concludeva
 * che il catalogo non ci fosse.
 *
 * COSA FA
 * -------
 * Per ogni dominio prova TUTTE le radici plausibili — quelle dichiarate in
 * `robots.txt` piu' una ventina di percorsi consueti e le loro varianti — le
 * segue in profondita' e conta quante schede prodotto si raggiungono da
 * ciascuna. Vince quella che ne porta di piu'.
 *
 * Non scarica il catalogo intero: campiona le prime figlie di ogni indice e
 * stima. Serve a scegliere la radice, non a costruire il catalogo — quello lo
 * fa `catalogo.ts` a ogni aggiornamento.
 *
 * Uso:  node scripts/radice-migliore.mjs [--solo TR,EE,SI]
 */

import { writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Le varianti da provare, oltre a quelle dichiarate in `robots.txt`. */
const VARIANTI = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap-index.xml",
  "/sitemap/sitemap.xml",
  "/sitemaps/sitemap.xml",
  "/sitemaps/sitemap_index.xml",
  "/sitemap/index.xml",
  "/product-sitemap.xml",
  "/sitemap_products.xml",
  "/sitemap-products.xml",
  "/sitemaps/products.xml",
  "/sitemap/products.xml",
  "/sitemap_products_1.xml",
  "/sitemap-products-1.xml",
  "/sitemaps/sitemap-products-part1.xml",
  "/sitemap/product_0.xml",
  "/product1.xml",
  "/sitemap.xml.gz",
  "/sitemap_index.xml.gz",
];

/** Quante figlie campionare per stimare quanto porta una radice. */
const CAMPIONE_FIGLIE = 6;

async function prendi(url, binario = false, ms = 25_000) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Encoding": "gzip, deflate" },
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
    const b = await prendi(url, true, 40_000);
    if (!b) return null;
    try {
      return gunzipSync(b).toString("utf8");
    } catch {
      return null;
    }
  }
  return prendi(url, false, 40_000);
}

const indirizzi = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);

function paScheda(u) {
  if (
    /\/(p|pd|dp|product|products|producto|productos|produkt|produkte|prodotto|prodotti|produit|produits|artikel|item|items|urun|toode|toote|proizvod|termek|izdelek|vara|varer)\//i.test(
      u,
    )
  ) {
    return true;
  }
  return /[a-z]{3,}(?:-[a-z0-9]{2,}){2,}[/_-]\d{5,}/i.test(u);
}

/** Quante schede si raggiungono da questa radice, campionando. */
async function quantoPorta(url, livello = 0, visti = new Set()) {
  if (livello > 2 || visti.has(url) || visti.size > 40) return 0;
  visti.add(url);

  const xml = await scarica(url);
  if (!xml) return 0;

  const voci = indirizzi(xml);
  if (voci.length === 0) return 0;

  if (!/<sitemapindex/i.test(xml)) return voci.filter(paScheda).length;

  /* SI CAMPIONA, NON SI SCARICA TUTTO.
     Un indice puo' avere cento figlie da un megabyte: aprirle tutte per
     scegliere una radice sarebbe sproporzionato. Se ne aprono sei e si
     moltiplica — la stima serve a confrontare due radici fra loro, non a
     dichiarare un numero al cliente. */
  const figlie = voci.slice(0, CAMPIONE_FIGLIE);
  let somma = 0;
  for (const f of figlie) somma += await quantoPorta(f, livello + 1, visti);
  return voci.length > figlie.length
    ? Math.round((somma / figlie.length) * voci.length)
    : somma;
}

async function radiciDi(dominio) {
  const base = `https://${dominio.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  const radici = new Set();

  const rob = await prendi(`${base}/robots.txt`, false, 20_000);
  if (rob) {
    for (const m of rob.matchAll(/^sitemap:\s*(\S+)/gim)) radici.add(m[1].trim());
  }
  for (const v of VARIANTI) radici.add(`${base}${v}`);
  return [...radici];
}

async function main() {
  const { FONTI } = await import("../src/catalogo-fonti.js");

  const filtro = process.argv.includes("--solo")
    ? new Set(
        process.argv[process.argv.indexOf("--solo") + 1]
          .split(",")
          .map((s) => s.trim().toUpperCase()),
      )
    : null;
  const elenco = filtro ? FONTI.filter((f) => filtro.has(f.paese)) : FONTI;

  console.log(`${elenco.length} insegne, cercando la radice piu' ricca\n`);
  const esiti = [];

  for (const f of elenco) {
    const radici = await radiciDi(f.dominio);
    let migliore = { url: f.sitemap, stima: await quantoPorta(f.sitemap) };

    for (const r of radici) {
      if (r === f.sitemap) continue;
      const stima = await quantoPorta(r);
      if (stima > migliore.stima) migliore = { url: r, stima };
    }

    const cambia = migliore.url !== f.sitemap;
    esiti.push({ ...f, nuovaSitemap: migliore.url, nuovaStima: migliore.stima, cambia });
    console.log(
      `${f.paese}  ${f.insegna.padEnd(26).slice(0, 26)} ${String(f.stimati).padStart(7)} → ` +
        `${String(migliore.stima).padStart(7)}${cambia ? "  CAMBIA" : ""}`,
    );
  }

  const cambiate = esiti.filter((e) => e.cambia && e.nuovaStima > e.stimati);
  console.log("\n" + "═".repeat(66));
  console.log(`  radici migliori trovate: ${cambiate.length}/${esiti.length}`);
  console.log(
    `  prodotti stimati: ${esiti.reduce((n, e) => n + e.stimati, 0).toLocaleString("it-IT")} → ` +
      `${esiti.reduce((n, e) => n + Math.max(e.stimati, e.nuovaStima), 0).toLocaleString("it-IT")}`,
  );

  writeFileSync("diario/radici-migliori.json", JSON.stringify(esiti, null, 2), "utf8");
  console.log("\nDettaglio in diario/radici-migliori.json\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
