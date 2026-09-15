/**
 * Cerca cataloghi in insegne che il censimento non ha.
 *
 * Il censimento copre 114 catene europee, ma per parecchi paesi ne ha una o
 * due — Portogallo e Polonia ne avevano una sola ciascuno — e la copertura di
 * un paese si misura in quante insegne si possono confrontare, non in quanti
 * prodotti ha la piu' grossa.
 *
 * Qui si prova un elenco scritto a mano di catene note per paese: per ognuna
 * si cercano le sitemap, si seguono in profondita' e si conta quante schede
 * prodotto si raggiungono. Quelle che rendono entrano fra le fonti.
 *
 * Uso:  node scripts/cerca-insegne.mjs
 */

import { writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const INTESTAZIONE = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
};

/** Catene note per paese, scritte a mano: il censimento non le aveva. */
const CANDIDATE = [
  // ── Spagna ──────────────────────────────────────────────────────
  { paese: "ES", nome: "Eroski", dominio: "supermercado.eroski.es" },
  { paese: "ES", nome: "Consum", dominio: "tienda.consum.es" },
  { paese: "ES", nome: "El Corte Inglés", dominio: "www.elcorteingles.es" },
  { paese: "ES", nome: "Lidl España", dominio: "www.lidl.es" },
  { paese: "ES", nome: "Aldi España", dominio: "www.aldi.es" },
  { paese: "ES", nome: "Condis", dominio: "www.condisline.com" },
  { paese: "ES", nome: "Bonpreu Esclat", dominio: "www.compraonline.bonpreuesclat.cat" },
  { paese: "ES", nome: "Ahorramas", dominio: "www.ahorramas.com" },
  { paese: "ES", nome: "Carrefour España", dominio: "www.carrefour.es" },
  { paese: "ES", nome: "Hipercor", dominio: "www.hipercor.es" },

  // ── Portogallo ──────────────────────────────────────────────────
  { paese: "PT", nome: "Pingo Doce", dominio: "www.pingodoce.pt" },
  { paese: "PT", nome: "Continente Online", dominio: "www.continente.pt" },
  { paese: "PT", nome: "Intermarché Portugal", dominio: "www.intermarche.pt" },
  { paese: "PT", nome: "Minipreço", dominio: "www.minipreco.pt" },
  { paese: "PT", nome: "El Corte Inglés Portugal", dominio: "www.elcorteingles.pt" },
  { paese: "PT", nome: "Lidl Portugal", dominio: "www.lidl.pt" },

  // ── Polonia ─────────────────────────────────────────────────────
  { paese: "PL", nome: "Frisco.pl", dominio: "www.frisco.pl" },
  { paese: "PL", nome: "Biedronka", dominio: "www.biedronka.pl" },
  { paese: "PL", nome: "Lidl Polska", dominio: "www.lidl.pl" },
  { paese: "PL", nome: "Carrefour Polska", dominio: "www.carrefour.pl" },
  { paese: "PL", nome: "Kaufland Polska", dominio: "www.kaufland.pl" },
  { paese: "PL", nome: "Delikatesy Centrum", dominio: "www.delikatesy.pl" },
  { paese: "PL", nome: "Makro Polska", dominio: "www.makro.pl" },
  { paese: "PL", nome: "E.Leclerc Polska", dominio: "www.leclerc.pl" },
];

const VARIANTI = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap-index.xml",
  "/sitemaps/sitemap.xml",
  "/sitemap/sitemap.xml",
  "/product-sitemap.xml",
  "/sitemap_products.xml",
  "/sitemaps/sitemap-products-part1.xml",
  "/sitemap/products.xml",
];

async function prendi(url, binario = false, ms = 25_000) {
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

const indirizzi = (x) => [...x.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);

function paScheda(u) {
  if (
    /\/(p|pd|dp|product|products|producto|productos|produkt|produkty|prodotto|produit|artikel|item|items|toode)\//i.test(
      u,
    )
  ) {
    return true;
  }
  return /[a-z]{3,}(?:-[a-z0-9]{2,}){2,}[/_-]\d{5,}/i.test(u);
}

/** Quante schede si raggiungono, campionando le figlie di un indice. */
async function quanto(url, livello = 0, visti = new Set()) {
  if (livello > 2 || visti.has(url) || visti.size > 30) return 0;
  visti.add(url);
  const xml = await scarica(url);
  if (!xml) return 0;
  const voci = indirizzi(xml);
  if (voci.length === 0) return 0;
  if (!/<sitemapindex/i.test(xml)) return voci.filter(paScheda).length;

  const campione = voci.slice(0, 5);
  let somma = 0;
  for (const f of campione) somma += await quanto(f, livello + 1, visti);
  return voci.length > campione.length
    ? Math.round((somma / campione.length) * voci.length)
    : somma;
}

async function esamina(c) {
  const base = `https://${c.dominio}`;
  const radici = new Set();
  const rob = await prendi(`${base}/robots.txt`, false, 18_000);
  let vieta = false;
  if (rob) {
    for (const m of rob.matchAll(/^sitemap:\s*(\S+)/gim)) radici.add(m[1].trim());
    // I divieti che valgono per tutti: se coprono le schede, si lascia stare.
    let perTutti = false;
    for (const riga of rob.split("\n").map((r) => r.trim())) {
      if (/^user-agent:/i.test(riga)) perTutti = /^user-agent:\s*\*\s*$/i.test(riga);
      else if (perTutti) {
        const d = /^disallow:\s*(\S+)/i.exec(riga);
        if (d && /^\/p(\/|$)|produ|prodotto|artikel/i.test(d[1])) vieta = true;
      }
    }
  }
  for (const v of VARIANTI) radici.add(`${base}${v}`);

  let migliore = { url: null, stima: 0 };
  for (const r of radici) {
    const s = await quanto(r);
    if (s > migliore.stima) migliore = { url: r, stima: s };
  }
  return { ...c, sitemap: migliore.url, stimati: migliore.stima, vieta, robots: Boolean(rob) };
}

async function aBrani(cose, n, f) {
  const out = [];
  for (let i = 0; i < cose.length; i += n) out.push(...(await Promise.all(cose.slice(i, i + n).map(f))));
  return out;
}

async function main() {
  console.log(`${CANDIDATE.length} insegne candidate\n`);
  const esiti = await aBrani(CANDIDATE, 5, async (c) => {
    const e = await esamina(c);
    const nota = e.vieta ? "  (il robots.txt vieta le schede)" : "";
    console.log(
      `${e.paese}  ${e.nome.padEnd(26).slice(0, 26)} ${String(e.stimati).padStart(7)}${nota}`,
    );
    return e;
  });

  const buone = esiti.filter((e) => e.stimati >= 200 && !e.vieta && e.sitemap);
  console.log("\n" + "═".repeat(62));
  console.log(`  utilizzabili: ${buone.length}/${esiti.length}`);
  for (const p of ["ES", "PT", "PL"]) {
    const q = buone.filter((b) => b.paese === p);
    console.log(
      `  ${p}: ${q.length} nuove · ${q.reduce((n, b) => n + b.stimati, 0).toLocaleString("it-IT")} prodotti`,
    );
  }
  writeFileSync("diario/insegne-nuove.json", JSON.stringify(esiti, null, 2), "utf8");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
