/**
 * Quanti supermercati pubblicano l'elenco dei loro prodotti.
 *
 * L'IDEA, E PERCHE' E' PIU' SOLIDA DI QUELLA DI PRIMA
 * ---------------------------------------------------
 * Finora l'indirizzo della scheda prodotto lo chiedevamo al modello, che
 * quando non lo sa se lo inventa: Cortilia 0 pagine aperte su 12, Eataly 0 su
 * 4, tutti 404. Ma i negozi quell'elenco lo pubblicano DA SOLI, in
 * `sitemap.xml`, perche' vogliono farsi trovare dai motori di ricerca. E'
 * un file che ci mettono a disposizione, non qualcosa da estorcere.
 *
 * Provato su Carrefour Italia: 26.728 prodotti, con il nome dentro
 * l'indirizzo; sette schede aperte su sette, sei prezzi leggibili su sette.
 * Il modello non deve piu' indovinare niente — sceglie soltanto quale prodotto
 * del catalogo corrisponde alla voce della lista.
 *
 * COSA MISURA QUESTO SCRIPT
 * -------------------------
 * Per ognuna delle insegne censite: se dichiara sitemap in `robots.txt`, se
 * fra quelle ce n'e' una di PRODOTTI, e quanti prodotti contiene. Il risultato
 * e' una mappa per paese: dove questa strada regge e dove no.
 *
 * CONTROLLA ANCHE I PERMESSI, e non e' un dettaglio di forma: se `robots.txt`
 * vieta le schede prodotto, quella catena non si tocca. Carrefour per esempio
 * vieta `/search` e il carrello ma non `/p/`, cioe' proprio le schede.
 *
 * Nessuna chiamata AI, nessun costo.
 *
 * Uso:  node scripts/prova-sitemap.mjs
 */

import { writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

/**
 * Ci presentiamo come un browser.
 *
 * Non per entrare dove non si potrebbe — `robots.txt` lo leggiamo e lo
 * rispettiamo — ma perche' molti siti rispondono 403 a qualunque cosa non
 * sembri un browser, e misureremmo il nostro travestimento invece del sito.
 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * NON SI GIUDICA DAL NOME DEL FILE, SI GUARDA DENTRO.
 *
 * La prima versione cercava "product" nel nome della sitemap, e sbagliava di
 * grosso: Carrefour Belgio le chiama `sitemap_0.xml`, `sitemap_1.xml` — senza
 * nessuna parola che le annunci — ed e' la stessa struttura di Carrefour
 * Italia, dove `sitemap_0` sono 26.728 prodotti. Migros non ha nemmeno un
 * indice: ha una sitemap piatta di pagine. Cosi' erano finite fra gli
 * "scoperti" Delhaize, REWE, Carrefour Belgio e Migros, cioe' mezza Europa.
 *
 * Ora si aprono le sitemap figlie e si guarda che aspetto hanno gli indirizzi
 * dentro. Costa qualche richiesta in piu' e vale la differenza fra venti paesi
 * e quanti sono davvero.
 */

/** Le parole che, nel nome di una sitemap, annunciano i prodotti. */
const SEGNALI_PRODOTTO =
  /produ[ck]t|prodott|producto|produit|artikel|items?[-_.]|catalog|pdp|goods|ürün|proizvod/i;

/** Quelle che annunciano tutt'altro: ricette, negozi, articoli del blog. */
const SEGNALI_ALTRO =
  /recipe|recept|rezept|ricett|store|winkel|filial|blog|news|article|video|category|categor|brand|marche|help|service|klantenservice/i;

async function prendi(url, { testo = true, scadenzaMs = 20_000 } = {}) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Encoding": "gzip, deflate" },
      redirect: "follow",
      signal: AbortSignal.timeout(scadenzaMs),
    });
    if (!res.ok) return { stato: res.status, corpo: null };
    if (!testo) return { stato: res.status, corpo: Buffer.from(await res.arrayBuffer()) };
    return { stato: res.status, corpo: await res.text() };
  } catch (err) {
    return { stato: /timed? ?out|abort/i.test(String(err)) ? "timeout" : "rete", corpo: null };
  }
}

/** Le sitemap dichiarate, e cosa vietano a tutti i robot. */
function leggiRobots(testo) {
  const sitemap = [];
  const vietati = [];
  let perTutti = false;
  for (const riga of testo.split("\n").map((r) => r.trim())) {
    const m = /^sitemap:\s*(\S+)/i.exec(riga);
    if (m) { sitemap.push(m[1]); continue; }
    if (/^user-agent:/i.test(riga)) { perTutti = /^user-agent:\s*\*\s*$/i.test(riga); continue; }
    if (perTutti) {
      const d = /^disallow:\s*(\S*)/i.exec(riga);
      if (d && d[1]) vietati.push(d[1]);
    }
  }
  return { sitemap, vietati };
}

/** Un `.xml.gz` va scompattato prima di poterlo leggere. */
async function scarica(url) {
  if (url.endsWith(".gz")) {
    const r = await prendi(url, { testo: false, scadenzaMs: 40_000 });
    if (!r.corpo) return r;
    try { return { stato: r.stato, corpo: gunzipSync(r.corpo).toString("utf8") }; }
    catch { return { stato: "gz illeggibile", corpo: null }; }
  }
  return prendi(url, { scadenzaMs: 40_000 });
}

/**
 * Questo indirizzo sembra la scheda di un prodotto?
 *
 * Due forme, che coprono quasi tutti i negozi visti:
 *   - un segmento che lo dice   /p/  /product/  /prodotto/  /produkt/  /artikel/
 *   - oppure un codice a barre o un id lungo in fondo, preceduto da un nome
 *     lungo — e' la forma di `/p/ricotta-mista/0000020451479.html`
 */
function paProdotto(u) {
  if (/\/(p|product|products|producto|productos|produkt|produkte|prodotto|prodotti|produit|produits|artikel|item|items|urun|proizvod)\//i.test(u)) return true;
  // nome-lungo-con-trattini seguito da un identificativo numerico
  return /[a-z]{3,}(?:-[a-z0-9]{2,}){2,}[\/-]\d{6,}/i.test(u);
}

const indirizzi = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);

/**
 * Da una sitemap dichiarata, arriva a quella dei prodotti.
 *
 * Le sitemap sono spesso un indice che punta ad altre sitemap, quindi si
 * scende di un livello — non di piu': oltre, il tempo esplode e il guadagno no.
 */
async function cercaProdotti(url) {
  const r = await scarica(url);
  if (!r.corpo) return { stato: r.stato, prodotti: 0, dove: null, esempio: null };

  const voci = indirizzi(r.corpo);
  if (voci.length === 0) return { stato: r.stato, prodotti: 0, dove: null, esempio: null };

  // Sitemap piatta: si guarda direttamente che aspetto hanno gli indirizzi.
  if (!/<sitemapindex/i.test(r.corpo)) {
    const paiono = voci.filter(paProdotto);
    const quanti = paiono.length >= Math.max(20, voci.length * 0.3) ? paiono.length : 0;
    return { stato: r.stato, prodotti: quanti, dove: quanti ? url : null, esempio: paiono[0] ?? null };
  }

  // E' un indice. Si provano PRIMA quelle che si annunciano, poi le altre —
  // ma in entrambi i casi si decide guardando dentro, non dal nome.
  const annunciate = voci.filter((u) => SEGNALI_PRODOTTO.test(u) && !SEGNALI_ALTRO.test(u));
  const neutre = voci.filter((u) => !SEGNALI_PRODOTTO.test(u) && !SEGNALI_ALTRO.test(u));
  const daProvare = [...annunciate.slice(0, 3), ...neutre.slice(0, 5)];

  let totale = 0, dove = null, esempio = null;
  for (const c of daProvare) {
    const sotto = await scarica(c);
    if (!sotto.corpo) continue;

    // Un indice dentro un indice: succede, e si scende ancora una volta.
    if (/<sitemapindex/i.test(sotto.corpo)) {
      const nipoti = indirizzi(sotto.corpo).slice(0, 2);
      for (const n of nipoti) {
        const foglia = await scarica(n);
        if (!foglia.corpo) continue;
        const dentro = indirizzi(foglia.corpo).filter(paProdotto);
        if (dentro.length > 50) { totale += dentro.length; dove ??= n; esempio ??= dentro[0]; }
      }
      continue;
    }

    const dentro = indirizzi(sotto.corpo).filter(paProdotto);
    if (dentro.length > 50) { totale += dentro.length; dove ??= c; esempio ??= dentro[0]; }
  }

  return { stato: r.stato, prodotti: totale, dove, esempio, indiceCon: voci.length };
}

/**
 * Catene fuori Europa, che il censimento non copre.
 *
 * Il censimento è europeo, ma le prove su Tokyo hanno mostrato che è proprio
 * lì che la ricerca del modello va peggio — 8% nel giro storto. Se una di
 * queste pubblica l'elenco prodotti, quel buco si chiude senza dipendere dal
 * modello, e è il posto dove serve di più.
 *
 * Nessuna è stata verificata prima: è esattamente ciò che questo giro scopre.
 */
const FUORI_EUROPA = [
  { paese: "JP", nome: "Rakuten Seiyu Netsuper", dominio: "sm.rakuten.co.jp" },
  { paese: "JP", nome: "LOHACO", dominio: "lohaco.yahoo.co.jp" },
  { paese: "JP", nome: "Aeon Netsuper", dominio: "shop.aeon.com" },
  { paese: "JP", nome: "Ito-Yokado", dominio: "iy-net.jp" },
  { paese: "AU", nome: "Woolworths", dominio: "www.woolworths.com.au" },
  { paese: "AU", nome: "Coles", dominio: "www.coles.com.au" },
  { paese: "NZ", nome: "Woolworths NZ", dominio: "www.woolworths.co.nz" },
  { paese: "US", nome: "Walmart", dominio: "www.walmart.com" },
  { paese: "US", nome: "Target", dominio: "www.target.com" },
  { paese: "US", nome: "Kroger", dominio: "www.kroger.com" },
  { paese: "CA", nome: "Loblaws", dominio: "www.loblaws.ca" },
  { paese: "CA", nome: "Voila by Sobeys", dominio: "voila.ca" },
  { paese: "BR", nome: "Pão de Açúcar", dominio: "www.paodeacucar.com" },
  { paese: "BR", nome: "Carrefour Brasil", dominio: "mercado.carrefour.com.br" },
  { paese: "MX", nome: "Walmart México", dominio: "super.walmart.com.mx" },
  { paese: "AR", nome: "Carrefour Argentina", dominio: "www.carrefour.com.ar" },
  { paese: "IN", nome: "BigBasket", dominio: "www.bigbasket.com" },
  { paese: "IN", nome: "JioMart", dominio: "www.jiomart.com" },
  { paese: "SG", nome: "FairPrice", dominio: "www.fairprice.com.sg" },
  { paese: "AE", nome: "Carrefour UAE", dominio: "www.carrefouruae.com" },
  { paese: "ZA", nome: "Checkers Sixty60", dominio: "www.checkers.co.za" },
  { paese: "KR", nome: "Emart Mall", dominio: "emart.ssg.com" },
];

async function esamina(insegna) {
  const base = `https://${insegna.dominio}`;
  const rob = await prendi(`${base}/robots.txt`);

  if (!rob.corpo) {
    return { ...insegna, esito: "robots non leggibile", dettaglio: String(rob.stato) };
  }

  const { sitemap, vietati } = leggiRobots(rob.corpo);
  if (sitemap.length === 0) {
    // Molti siti la sitemap ce l'hanno anche senza dichiararla.
    const tentativo = await scarica(`${base}/sitemap.xml`);
    if (!tentativo.corpo) return { ...insegna, esito: "nessuna sitemap", vietati: vietati.length };
    sitemap.push(`${base}/sitemap.xml`);
  }

  for (const s of sitemap.slice(0, 4)) {
    const trovato = await cercaProdotti(s);
    if (trovato.prodotti > 0) {
      return {
        ...insegna,
        esito: "PRODOTTI",
        prodotti: trovato.prodotti,
        sitemap: trovato.dove,
        esempio: trovato.esempio,
        // Le schede prodotto sono aperte ai robot? Se non lo sono, non si tocca.
        vietaSchede: vietati.some((v) => /^\/p(\/|$)|prodott|produ[ck]t|producto|produit/i.test(v)),
        vietati: vietati.length,
      };
    }
  }
  return { ...insegna, esito: "sitemap senza prodotti", sitemapDichiarate: sitemap.length, vietati: vietati.length };
}

async function aBrani(elementi, quanti, lavoro) {
  const esiti = [];
  for (let i = 0; i < elementi.length; i += quanti) {
    esiti.push(...(await Promise.all(elementi.slice(i, i + quanti).map(lavoro))));
  }
  return esiti;
}

async function main() {
  const { insegnePerPaese, paesiCoperti } = await import("../src/api/insegne-online.js");

  const tutte = [];
  for (const iso of paesiCoperti()) {
    for (const i of insegnePerPaese(iso)) tutte.push({ paese: iso, ...i });
  }
  tutte.push(...FUORI_EUROPA.map((i) => ({ ...i, alta: true, fuoriEuropa: true })));

  const quantiPaesi = new Set(tutte.map((t) => t.paese)).size;
  console.log(`${tutte.length} insegne in ${quantiPaesi} paesi (${FUORI_EUROPA.length} fuori Europa)\n`);

  const esiti = await aBrani(tutte, 6, async (insegna) => {
    const e = await esamina(insegna);
    const marchio =
      e.esito === "PRODOTTI"
        ? `${String(e.prodotti).padStart(7)} prodotti${e.vietaSchede ? "  (ma robots.txt le vieta)" : ""}`
        : `        ${e.esito}`;
    console.log(`${e.paese}  ${e.nome.padEnd(26).slice(0, 26)} ${marchio}`);
    return e;
  });

  const conProdotti = esiti.filter((e) => e.esito === "PRODOTTI" && !e.vietaSchede);
  const paesiOk = new Set(conProdotti.map((e) => e.paese));

  console.log("\n" + "═".repeat(66));
  console.log("  ESITO");
  console.log("═".repeat(66));
  console.log(`  insegne con l'elenco prodotti aperto   ${conProdotti.length}/${esiti.length}`);
  console.log(`  paesi con almeno un'insegna cosi'      ${paesiOk.size}/${new Set(esiti.map((e) => e.paese)).size}`);
  console.log(`  prodotti indicizzabili in totale       ${conProdotti.reduce((s, e) => s + e.prodotti, 0).toLocaleString("it-IT")}`);

  console.log("\n  PAESI SCOPERTI (nessuna insegna con elenco prodotti):");
  const scoperti = [...new Set(esiti.map((e) => e.paese))].sort().filter((p) => !paesiOk.has(p));
  console.log("    " + (scoperti.join(" ") || "nessuno"));

  console.log("\n  LE PIU' RICCHE:");
  for (const e of [...conProdotti].sort((a, b) => b.prodotti - a.prodotti).slice(0, 12)) {
    console.log(`    ${e.paese}  ${e.nome.padEnd(26).slice(0, 26)} ${String(e.prodotti).padStart(7)}`);
  }

  const dove = new URL("../diario/sitemap-insegne.json", import.meta.url);
  writeFileSync(dove, JSON.stringify(esiti, null, 2), "utf8");
  console.log(`\nDettaglio in ${decodeURIComponent(dove.pathname)}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
