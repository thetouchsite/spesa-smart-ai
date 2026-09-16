/**
 * CENSIMENTO: chi pubblica una sitemap, e cosa c'e' dentro.
 *
 * Non e' la caccia ai domini — quella indovina gli indirizzi. Qui gli indirizzi
 * sono gia' noti, e la domanda e' una sola per ognuno: **esiste un indice dei
 * prodotti che possiamo leggere?**
 *
 * SI VA PIANO, E NON E' EDUCAZIONE ASTRATTA
 * -----------------------------------------
 * Aldi ci ha servito una sitemap e, dopo una ventina di richieste ravvicinate,
 * ha cominciato a rispondere 403 a tutte — comprese quelle che un minuto prima
 * dava. Non e' un divieto: e' un limite di frequenza, e lo si rispetta come si
 * rispetterebbe un divieto. Una pausa fra un indirizzo e l'altro costa qualche
 * minuto a noi e niente a loro.
 *
 * QUATTRO ESITI, TENUTI DISTINTI
 * ------------------------------
 *   sitemap con prodotti    l'indice c'e' e contiene schede: si puo' lavorare
 *   sitemap senza prodotti  l'indice c'e' ma elenca categorie o pagine
 *   nessuna sitemap         non la pubblicano: non e' un rifiuto, e' un'assenza
 *   non leggibile           403/401: non sappiamo, e «non so» non e' «si'»
 *
 * Tenerli separati conta, perche' suggeriscono mosse diverse: sul secondo si
 * cerca un altro indice, sul terzo si cambia strada, sul quarto si chiede il
 * permesso a un umano.
 */

import { writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { setTimeout as attendi } from "node:timers/promises";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

/** Pausa fra una richiesta e l'altra verso lo STESSO sito. */
const PAUSA_MS = Number(process.env.PAUSA_MS ?? 1500);
/** Pausa fra un'insegna e la successiva. */
const PAUSA_INSEGNA_MS = Number(process.env.PAUSA_INSEGNA_MS ?? 3000);

const DOMINI = (process.env.DOMINI ?? "").trim()
  ? process.env.DOMINI.split(",").map((s) => s.trim())
  : [
      // le tre chiuse, tenute in elenco perche' il «no» va registrato
      "www.tesco.com", "www.sainsburys.co.uk", "www.asda.com",
      // le grandi che ci servono
      "groceries.morrisons.com", "www.waitrose.com", "www.ocado.com",
      "www.aldi.co.uk", "www.lidl.co.uk", "www.iceland.co.uk",
      "www.coop.co.uk", "shop.coop.co.uk", "www.marksandspencer.com",
      // regionali e cooperative
      "www.booths.co.uk", "www.spar.co.uk", "www.scotmid.coop",
      "www.eastofengland.coop", "www.centralengland.coop", "www.lincolnshire.coop",
      // vicinato
      "www.nisalocally.co.uk", "www.costcutter.co.uk", "www.budgens.co.uk",
      "www.londis.co.uk", "www.premierstores.co.uk",
      // discount e surgelati
      "www.farmfoods.co.uk", "www.heronfoods.com", "www.poundland.co.uk",
      "www.bmstores.co.uk", "www.homebargains.co.uk",
      // online e specializzati
      "www.abelandcole.co.uk", "www.riverford.co.uk", "www.planetorganic.com",
      "www.hollandandbarrett.com", "www.approvedfood.co.uk", "www.milkandmore.co.uk",
      "www.oddbox.co.uk", "www.wholefoodsmarket.co.uk",
    ];

async function prendi(url, ms = 20000) {
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(ms),
      headers: { "User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9" },
    });
    const stato = r.status;
    if (!r.ok) return { stato, testo: "" };
    if (/\.gz(\?|$)/i.test(url)) {
      try {
        return { stato, testo: gunzipSync(Buffer.from(await r.arrayBuffer())).toString("utf8") };
      } catch {
        return { stato, testo: "" };
      }
    }
    return { stato, testo: await r.text() };
  } catch {
    return { stato: 0, testo: "" };
  }
}

/** Il blocco `User-agent: *` finisce al PROSSIMO User-agent, non a fine file. */
function robotsPerNoi(txt) {
  const siti = [];
  let dentro = false;
  let vietaTutto = false;
  for (const r of txt.split(/\r?\n/)) {
    const ua = r.match(/^\s*user-agent:\s*(.+)$/i);
    if (ua) {
      dentro = ua[1].trim() === "*";
      continue;
    }
    const sm = r.match(/^\s*sitemap:\s*(\S+)/i);
    if (sm) {
      siti.push(sm[1].trim());
      continue;
    }
    if (dentro && /^\s*disallow:\s*\/\s*$/i.test(r)) vietaTutto = true;
  }
  return { siti, vietaTutto };
}

const SOLITI = [
  "/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml",
  "/sitemaps/sitemap.xml", "/product-sitemap.xml", "/sitemap/sitemap.xml",
];

const indirizzi = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim());

/** Una scheda prodotto, in una qualunque delle forme viste in UK. */
const PARE_PRODOTTO = /\/(p|product|products|item|items|pd|pdp|ip)\/[a-z0-9-]{3,}|\/product\/[a-z0-9-]{3,}/i;
const SPAZZATURA = /\/medias\/|\.(jpe?g|png|gif|pdf|webp|svg|css|js)(\?|$)/i;

/** Scende di un livello in un indice, e riporta quanti prodotti ha visto. */
async function guardaDentro(url, profondita = 0) {
  const r = await prendi(url, 30000);
  await attendi(PAUSA_MS);
  if (r.stato !== 200 || !/<(urlset|sitemapindex)/i.test(r.testo)) {
    return { stato: r.stato, prodotti: 0, visti: 0, esempi: [] };
  }

  const loc = indirizzi(r.testo);
  const diretti = loc.filter((u) => PARE_PRODOTTO.test(u) && !SPAZZATURA.test(u));
  if (diretti.length >= 10 || profondita >= 2 || !/<sitemapindex/i.test(r.testo)) {
    return { stato: 200, prodotti: diretti.length, visti: loc.length, esempi: diretti.slice(0, 2) };
  }

  /* E' un indice: si scende. Prima nelle figlie che nel NOME DEL FILE parlano
     di prodotti — e il nome si guarda dopo aver tolto la parola «sitemap», che
     contiene «item» e altrimenti combacerebbe con tutte. */
  const nome = (u) => {
    try {
      return new URL(u).pathname.replace(/sitemaps?/gi, "");
    } catch {
      return u;
    }
  };
  const ordinate = [...loc].sort(
    (a, b) => (/produ|item|grocer|shop/i.test(nome(a)) ? 0 : 1) - (/produ|item|grocer|shop/i.test(nome(b)) ? 0 : 1),
  );

  let migliore = { stato: 200, prodotti: 0, visti: loc.length, esempi: [] };
  for (const figlia of ordinate.slice(0, 3)) {
    const d = await guardaDentro(figlia, profondita + 1);
    if (d.prodotti > migliore.prodotti) migliore = { ...d, visti: Math.max(d.visti, loc.length) };
    if (migliore.prodotti >= 100) break;
  }
  return migliore;
}

const esiti = [];
console.log("insegna".padEnd(30) + "robots".padEnd(10) + "sitemap".padEnd(12) + "prodotti  esempio");
console.log("-".repeat(96));

for (const dominio of DOMINI) {
  const radice = `https://${dominio}`;
  const rb = await prendi(`${radice}/robots.txt`, 12000);
  await attendi(PAUSA_MS);

  let statoRobots;
  let candidate = [];
  if (rb.stato === 403 || rb.stato === 401) {
    statoRobots = "403";
  } else if (rb.stato !== 200) {
    statoRobots = String(rb.stato || "muto");
    candidate = SOLITI.map((p) => radice + p);
  } else {
    const { siti, vietaTutto } = robotsPerNoi(rb.testo);
    if (vietaTutto) {
      statoRobots = "VIETA";
    } else {
      statoRobots = siti.length ? `ok (${siti.length})` : "ok (0)";
      candidate = siti.length ? siti.slice(0, 4) : SOLITI.map((p) => radice + p);
    }
  }

  let esito = { dominio, robots: statoRobots, sitemap: "—", prodotti: 0, esempio: "" };
  if (statoRobots !== "VIETA" && candidate.length) {
    for (const c of candidate) {
      const d = await guardaDentro(c);
      if (d.stato === 200) {
        esito = {
          dominio,
          robots: statoRobots,
          sitemap: d.prodotti > 0 ? "con prodotti" : "senza prod.",
          prodotti: d.prodotti,
          esempio: d.esempi[0] ?? "",
          url: c,
        };
        if (d.prodotti > 0) break;
      }
    }
  } else if (statoRobots === "403") {
    esito.sitemap = "non leggibile";
  }

  esiti.push(esito);
  console.log(
    dominio.padEnd(30) +
      esito.robots.padEnd(10) +
      esito.sitemap.padEnd(12) +
      String(esito.prodotti).padStart(8) +
      "  " +
      String(esito.esempio).replace(`https://${dominio}`, "").slice(0, 46),
  );
  writeFileSync(process.env.USCITA ?? "censimento.json", JSON.stringify(esiti, null, 2));
  await attendi(PAUSA_INSEGNA_MS);
}

console.log("\n" + "=".repeat(96));
const conProdotti = esiti.filter((e) => e.prodotti > 0);
console.log(`con indice prodotti leggibile : ${conProdotti.length}/${esiti.length}`);
console.log(`sitemap senza prodotti        : ${esiti.filter((e) => e.sitemap === "senza prod.").length}`);
console.log(`robots non leggibile (403)    : ${esiti.filter((e) => e.robots === "403").length}`);
console.log(`vieta tutto                   : ${esiti.filter((e) => e.robots === "VIETA").length}`);
console.log(`nessuna sitemap               : ${esiti.filter((e) => e.sitemap === "—").length}`);
