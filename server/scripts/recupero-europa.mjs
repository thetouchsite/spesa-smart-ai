/**
 * La seconda passata: riprendersi quel che e' caduto per caso.
 *
 * COSA E' ANDATO STORTO LA PRIMA VOLTA
 * ------------------------------------
 * Continente pubblica centottantaduemila prodotti e ne abbiamo raccolti zero.
 * Non li vieta, non ci blocca: la richiesta della radice e' fallita una volta,
 * la coda e' rimasta vuota, e l'insegna e' stata segnata come finita. Wells
 * uguale. Un inciampo di rete valeva duecentomila prodotti.
 *
 * E c'e' il difetto gemello: la ricognizione scarta chi non apre le schede, ma
 * quel controllo non e' affidabile. Mercator risultava 0 pagine aperte su 7 —
 * e in raccolta ha dato 30 prezzi su 30. Quel giorno era solo di cattivo
 * umore. Cosi' sono rimasti fuori Muller, Greenweez, Interspar, Nemlig.
 *
 * COSA FA QUESTA PASSATA
 * ----------------------
 *   1. RIPROVA        tre tentativi con pausa crescente, invece di uno solo.
 *                     La maggior parte dei fallimenti e' passeggera.
 *   2. PIU' RADICI     non solo quella scelta dalla ricognizione: anche quelle
 *                     del `robots.txt` e le consuete. Si tiene la migliore.
 *   3. TETTO ALZATO    chi e' stato troncato ricomincia con piu' spazio.
 *
 * CHI RIPRENDE
 * ------------
 *   - le insegne con zero indirizzi che la ricognizione dava per buone
 *   - quelle che hanno reso meno di meta' di quanto promettevano
 *   - quelle scartate per «non apre le schede», che ora si riprovano
 *
 * Aggiorna `diario/raccolta-europa.json` al posto delle righe vecchie, cosi'
 * i conteggi restano uno solo e non si sommano due volte.
 *
 * Uso:  node scripts/recupero-europa.mjs --ore 3
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

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

const CAMPIONE = 30;
const TETTO_SITEMAP = 600;
const TETTO_INDIRIZZI = 400_000;

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

async function prendiUna(url, { binario = false, ms = 45_000 } = {}) {
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

/**
 * Tre tentativi, con pause che crescono.
 *
 * E' tutta la differenza fra questa passata e la prima: un rifiuto passeggero
 * — un limite di richieste, una connessione caduta — non deve costare
 * l'insegna intera.
 */
async function prendi(url, opzioni = {}, tentativi = 3) {
  for (let i = 0; i < tentativi; i++) {
    const r = await prendiUna(url, opzioni);
    if (r) return r;
    if (i < tentativi - 1) await attendi(2000 * (i + 1));
  }
  return null;
}

async function scarica(url, tentativi = 3) {
  if (url.endsWith(".gz")) {
    const b = await prendi(url, { binario: true, ms: 70_000 }, tentativi);
    if (!b) return null;
    try {
      return gunzipSync(b).toString("utf8");
    } catch {
      return null;
    }
  }
  return prendi(url, { ms: 70_000 }, tentativi);
}

const indirizzi = (x) => [...x.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);

const SEGMENTI_PRODOTTO =
  /\/(p|pd|dp|prod|product|products|producto|productos|produkt|produkte|produkty|prodotto|prodotti|produit|produits|artikel|artikelen|item|items|urun|toode|tooted|prece|preces|prekes|proizvod|termek|izdelek|vara|varer|varor|tuote|tuotteet|pdp|proizvodi)\//i;

const paScheda = (u) =>
  SEGMENTI_PRODOTTO.test(u) || /[a-z]{3,}(?:-[a-z0-9]{2,}){2,}[/_-]\d{5,}/i.test(u);

const FUORI_TEMA =
  /recipe|recept|rezept|ricett|blog|news|article|video|magazin|hjelp|help|service|klantenservice|store-?locator|filial|winkel|jobs|career|press|sitemap-?misc/i;

const VARIANTI = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap-index.xml",
  "/sitemaps/sitemap.xml",
  "/sitemap/sitemap.xml",
  "/sitemaps/sitemap_index.xml",
  "/sitemap/index.xml",
  "/product-sitemap.xml",
  "/sitemap_products.xml",
  "/sitemap-products.xml",
  "/sitemaps/products.xml",
  "/sitemap/products.xml",
  "/sitemap.xml.gz",
  "/sitemap_index.xml.gz",
];

/** Tutte le radici che vale la pena provare per questa insegna. */
async function radici(sitemapNota) {
  const insieme = new Set();
  if (sitemapNota) insieme.add(sitemapNota);

  let base = null;
  try {
    base = new URL(sitemapNota).origin;
  } catch {
    return [...insieme];
  }

  const rob = await prendi(`${base}/robots.txt`, { ms: 20_000 }, 2);
  if (rob) for (const m of rob.matchAll(/^sitemap:\s*(\S+)/gim)) insieme.add(m[1].trim());
  for (const v of VARIANTI) insieme.add(`${base}${v}`);
  return [...insieme];
}

/** Tutto l'albero, in ampiezza, partendo da una radice. */
async function raccogli(radice, scadenza) {
  const trovati = new Set();
  const daAprire = [radice];
  const visti = new Set();
  let aperte = 0;

  while (daAprire.length > 0) {
    if (Date.now() > scadenza) break;
    if (aperte >= TETTO_SITEMAP || trovati.size >= TETTO_INDIRIZZI) break;

    const url = daAprire.shift();
    if (visti.has(url)) continue;
    visti.add(url);

    /* La radice si insiste, le figlie no.
       Se la radice non risponde non c'e' niente da fare; una figlia persa su
       cinquanta e' un graffio, e insistere su ognuna moltiplicherebbe i tempi
       per un guadagno che non si vede. */
    const xml = await scarica(url, url === radice ? 3 : 1);
    aperte++;
    await attendi(200);
    if (!xml) continue;

    const voci = indirizzi(xml);
    if (voci.length === 0) continue;

    if (/<sitemapindex/i.test(xml)) {
      for (const f of voci) if (!FUORI_TEMA.test(f) && !visti.has(f)) daAprire.push(f);
      continue;
    }
    for (const u of voci) {
      if (paScheda(u)) trovati.add(u);
      if (trovati.size >= TETTO_INDIRIZZI) break;
    }
  }
  return { indirizzi: [...trovati], sitemapAperte: aperte, finita: daAprire.length === 0 };
}

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

async function misuraPrezzi(tutti) {
  const passo = Math.max(1, Math.floor(tutti.length / CAMPIONE));
  const campione = [];
  for (let i = 0; i < tutti.length && campione.length < CAMPIONE; i += passo) {
    campione.push(tutti[i]);
  }

  let aperte = 0;
  let conPrezzo = 0;
  const esempi = [];
  for (const u of campione) {
    const html = await prendiUna(u, { ms: 30_000 });
    if (html && html.length > 2000) {
      aperte++;
      const p = leggiPrezzo(html);
      if (p != null) {
        conPrezzo++;
        if (esempi.length < 5) esempi.push({ url: u, prezzo: p });
      }
    }
    await attendi(350);
  }
  return { campione: campione.length, aperte, conPrezzo, esempi };
}

/* ══════════════════════════════════════════════════════════════════ */

const RACCOLTA = "diario/raccolta-europa.json";
const STATO = "diario/recupero-stato.json";
const CARTELLA = "diario/raccolto";

const orologio = (s) =>
  `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;

/** Chi merita una seconda occasione, e perche'. */
function daRiprendere() {
  const scoperta = existsSync("diario/scoperta-europa.json")
    ? JSON.parse(readFileSync("diario/scoperta-europa.json", "utf8"))
    : [];
  const raccolta = existsSync(RACCOLTA) ? JSON.parse(readFileSync(RACCOLTA, "utf8")) : [];
  const fatto = new Map(raccolta.map((r) => [`${r.paese}|${r.insegna}`, r]));

  const lista = [];
  for (const s of scoperta) {
    if (s.esito !== "PRODOTTI" || !s.sitemap) continue;
    const chiave = `${s.paese}|${s.nome}`;
    const r = fatto.get(chiave);

    if (!r) {
      // Scartata perche' non apriva le schede — ma quel controllo sbaglia:
      // Mercator dava 0 su 7 e in raccolta ha reso 30 prezzi su 30.
      lista.push({ ...base(s), perche: "mai provata" });
    } else if (r.indirizzi === 0) {
      lista.push({ ...base(s), perche: "zero indirizzi" });
    } else if (s.stimati > 3000 && r.indirizzi < s.stimati * 0.5) {
      lista.push({ ...base(s), perche: `resa bassa (${r.indirizzi} su ${s.stimati})` });
    } else if (!r.completa) {
      lista.push({ ...base(s), perche: "troncata" });
    }
  }
  return lista;

  function base(s) {
    return { paese: s.paese, insegna: s.nome, sitemap: s.sitemap, atteso: s.stimati };
  }
}

function scriviStato(avvio, scadenza, fatte, totale, guadagno, ultime) {
  writeFileSync(
    STATO,
    JSON.stringify(
      {
        avvio: new Date(avvio).toISOString(),
        aggiornato: new Date().toISOString(),
        trascorso: orologio((Date.now() - avvio) / 1000),
        restano: orologio(Math.max(0, (scadenza - Date.now()) / 1000)),
        avanzamento: `${fatte}/${totale}`,
        INDIRIZZI_GUADAGNATI: guadagno,
        ultime,
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function main() {
  const ore = process.argv.includes("--ore")
    ? Number(process.argv[process.argv.indexOf("--ore") + 1])
    : 3;
  const avvio = Date.now();
  const scadenza = avvio + ore * 3600 * 1000;
  mkdirSync(CARTELLA, { recursive: true });

  /* PRIMA LA SPESA, POI IL RESTO.
     Galaxus promette tre milioni e settecentomila prodotti, e sono scarpe
     Nike, sedie da ufficio e switch di rete: zero alimentari. Trendyol e'
     lo stesso caso e per giunta ci blocca. Restano in coda — se avanza tempo
     si prendono anche loro — ma non possono tenere occupati due lavoratori su
     tre mentre Continente, che di prodotti da mangiare ne ha centottantamila,
     aspetta il suo turno. */
  const GENERALISTI = new Set([
    "Galaxus", "Trendyol", "Hepsiburada", "Allegro", "eMAG", "Rozetka",
    "Bol.com", "Cdiscount", "Otto", "Alza", "Skroutz", "Amazon Italia",
    "Amazon España", "Amazon France", "Amazon Deutschland", "Amazon UK",
  ]);
  const coda = daRiprendere().sort((a, b) => {
    const ga = GENERALISTI.has(a.insegna) ? 1 : 0;
    const gb = GENERALISTI.has(b.insegna) ? 1 : 0;
    return ga - gb || (b.atteso ?? 0) - (a.atteso ?? 0);
  });
  const totale = coda.length;
  console.log(`${totale} insegne da riprendere · mi fermo fra ${ore} ore\n`);
  for (const c of coda.slice(0, 12)) {
    console.log(`   ${c.paese}  ${c.insegna.padEnd(22).slice(0, 22)} ${c.perche}`);
  }
  console.log();

  let guadagno = 0;
  let fatte = 0;
  const ultime = [];

  const lavoratore = async () => {
    while (coda.length > 0 && Date.now() < scadenza) {
      const f = coda.shift();
      const inizio = Date.now();

      /* SI PROVANO PIU' RADICI, E VINCE LA PIU' RICCA.
         La ricognizione ne sceglie una campionando, e campionando si sbaglia:
         una figlia laterale puo' sembrare piu' grossa dell'indice vero. */
      let migliore = { indirizzi: [], sitemapAperte: 0, finita: true, radice: f.sitemap };
      for (const r of await radici(f.sitemap)) {
        if (Date.now() > scadenza) break;
        const esito = await raccogli(r, scadenza);
        if (esito.indirizzi.length > migliore.indirizzi.length) {
          migliore = { ...esito, radice: r };
        }
        // Se la radice nota ha gia' dato quel che prometteva, basta cosi'.
        if (migliore.indirizzi.length >= (f.atteso ?? 0) * 0.8) break;
      }

      let prezzi = { campione: 0, aperte: 0, conPrezzo: 0, esempi: [] };
      if (migliore.indirizzi.length > 0) {
        prezzi = await misuraPrezzi(migliore.indirizzi);
        writeFileSync(
          `${CARTELLA}/${f.paese}-${f.insegna.replace(/[^a-zA-Z0-9]+/g, "_")}.txt.gz`,
          gzipSync(migliore.indirizzi.join("\n")),
        );
      }

      /* La riga vecchia si sostituisce, non si aggiunge: un'insegna deve
         contare una volta sola, o il totale si gonfia da se'. */
      const tutte = existsSync(RACCOLTA) ? JSON.parse(readFileSync(RACCOLTA, "utf8")) : [];
      const posto = tutte.findIndex((t) => t.paese === f.paese && t.insegna === f.insegna);
      const prima = posto >= 0 ? tutte[posto].indirizzi : 0;

      const riga = {
        paese: f.paese,
        insegna: f.insegna,
        sitemap: migliore.radice,
        indirizzi: migliore.indirizzi.length,
        atteso: f.atteso ?? 0,
        sitemapAperte: migliore.sitemapAperte,
        completa: migliore.finita,
        ...prezzi,
        secondi: Math.round((Date.now() - inizio) / 1000),
        recuperata: true,
      };
      if (migliore.indirizzi.length >= prima) {
        if (posto >= 0) tutte[posto] = riga;
        else tutte.push(riga);
        guadagno += migliore.indirizzi.length - prima;
        writeFileSync(RACCOLTA, JSON.stringify(tutte, null, 2), "utf8");
      }

      fatte++;
      const resa = riga.campione ? Math.round((riga.conPrezzo / riga.campione) * 100) : 0;
      const segno = migliore.indirizzi.length - prima;
      console.log(
        `${f.paese}  ${f.insegna.padEnd(22).slice(0, 22)} ` +
          `${String(migliore.indirizzi.length).padStart(7)} indirizzi ` +
          `(${segno >= 0 ? "+" : ""}${segno.toLocaleString("it-IT")}) · ` +
          `prezzo ${riga.conPrezzo}/${riga.campione} (${resa}%)`,
      );

      ultime.unshift({
        paese: f.paese,
        insegna: f.insegna,
        indirizzi: migliore.indirizzi.length,
        guadagno: segno,
        resa: `${resa}%`,
      });
      ultime.length = Math.min(ultime.length, 8);
      scriviStato(avvio, scadenza, fatte, totale, guadagno, ultime);
    }
  };

  await Promise.all([lavoratore(), lavoratore(), lavoratore()]);

  const tutte = JSON.parse(readFileSync(RACCOLTA, "utf8"));
  const totaleOra = tutte.reduce((n, t) => n + t.indirizzi, 0);

  console.log("\n" + "═".repeat(70));
  console.log(`  recuperate            ${fatte} insegne`);
  console.log(`  indirizzi guadagnati  ${guadagno.toLocaleString("it-IT")}`);
  console.log(`  TOTALE ORA            ${totaleOra.toLocaleString("it-IT")}`);
  console.log(`  tempo                 ${orologio((Date.now() - avvio) / 1000)}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
