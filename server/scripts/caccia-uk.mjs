/**
 * CACCIA AI NEGOZI ONLINE BRITANNICI.
 *
 * PERCHE' NON BASTA IL SITO DELL'INSEGNA
 * --------------------------------------
 * Il sito aziendale e il negozio online quasi mai coincidono. Morrisons vende
 * su `groceries.morrisons.com`, Waitrose su `waitrose.com/ecom`. Sondando solo
 * `morrisons.com` si conclude che Morrisons non abbia catalogo, ed e' falso —
 * ed e' l'errore che in Italia teneva nascoste meta' delle catene.
 *
 * Quindi per ogni marchio si generano tutte le varianti e si provano TUTTE:
 * non ci si ferma alla prima che risponde, perche' la prima che risponde e'
 * di solito il sito vetrina, che di prodotti non ne ha.
 *
 * UNA SOLA RICHIESTA DECIDE TUTTO IL RESTO, ED E' `robots.txt`
 * ------------------------------------------------------------
 * La prima versione provava anche cinque percorsi per host — `/groceries`,
 * `/ecom`, `/shop`… — e ci metteva ore. Era lavoro moltiplicato per niente:
 * `robots.txt` sta SEMPRE alla radice del dominio e dichiara le sitemap di
 * qualunque sottocartella. Waitrose dichiara dalla radice le sitemap di
 * `/ecom`. Chiesto il robots, i percorsi non servono piu'.
 *
 * TRE ESITI, E IL TERZO NON E' UN SI'
 * -----------------------------------
 *   regole lette, sitemap trovata   -> si guarda cosa c'e' dentro
 *   regole lette, vietato           -> si esclude, e si scrive perche'
 *   regole NON leggibili (403)      -> «non lo so», mai «via libera»
 *
 * L'ultimo caso e' Akamai davanti a Tesco, Sainsbury's e Asda: non risponde
 * nemmeno al robots. Contarlo come permesso sarebbe comodo e falso.
 */

import { writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const MARCHI = (process.env.MARCHI ?? "").trim()
  ? process.env.MARCHI.split(",").map((s) => s.trim())
  : [
      "tesco", "sainsburys", "asda", "coop", "coopfood", "marksandspencer",
      "ocado", "iceland", "aldi", "lidl", "booths", "spar", "nisalocally",
      "costcutter", "londis", "budgens", "abelandcole", "riverford",
      "planetorganic", "farmfoods", "heronfoods", "bmstores", "homebargains",
      "poundland", "snappyshopper", "jisp", "wholefoodsmarket",
      "hollandandbarrett", "gousto", "musclefood",
    ];

/** Gli indirizzi sotto cui un'insegna britannica puo' tenere il negozio online. */
function varianti(marchio) {
  const m = marchio.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const host = new Set();
  for (const t of ["co.uk", "com"]) {
    for (const s of ["", "www", "groceries", "shop", "store", "online", "orderline", "delivery"]) {
      host.add(s ? `${s}.${m}.${t}` : `${m}.${t}`);
    }
    for (const f of ["direct", "athome", "online", "shop", "groceries"]) host.add(`www.${m}${f}.${t}`);
  }
  return [...host];
}

async function prendi(url, ms = 12000, metodo = "GET") {
  try {
    const r = await fetch(url, {
      method: metodo,
      redirect: "follow",
      signal: AbortSignal.timeout(ms),
      headers: { "User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9" },
    });
    const base = {
      stato: r.status,
      finale: r.url,
      tipo: (r.headers.get("content-type") || "").split(";")[0],
    };
    if (metodo !== "GET") return { ...base, testo: "" };

    /* UNA SITEMAP `.gz` E' UN FILE COMPRESSO, NON UNA RISPOSTA COMPRESSA.
       `fetch` scompatta da solo il `Content-Encoding`, ma qui la compressione
       sta nel file: leggerlo come testo da' binario, il `<urlset` non si trova
       e l'insegna risulta senza catalogo. Lidl UK pubblica cosi'
       `product_sitemap.xml.gz`, e per questo risultava senza prodotti. */
    if (/\.gz(\?|$)/i.test(url)) {
      try {
        return { ...base, testo: gunzipSync(Buffer.from(await r.arrayBuffer())).toString("utf8") };
      } catch {
        return { ...base, testo: "" };
      }
    }
    return { ...base, testo: await r.text() };
  } catch {
    return { stato: 0, finale: url, tipo: "", testo: "" };
  }
}

/* ─────────────── A. chi risponde, e da dove ─────────────── */

/**
 * Vivo, e soprattutto DOVE finisce.
 *
 * L'indirizzo finale conta piu' di quello di partenza: meta' delle varianti
 * redirigono tutte allo stesso posto, e senza guardare dove arrivano si
 * interroga lo stesso sito otto volte credendo di sondarne otto.
 */
async function vivo(host) {
  /* SI RIPROVA CON GET, E NON E' PIGNOLERIA. Parecchi siti rispondono solo al
     GET: alcuni restituiscono 405 al HEAD, altri lo lasciano cadere e basta.
     Fidandosi del solo HEAD, B&M, Poundland e Home Bargains risultavano
     «nessun host risponde» pur essendo in piedi. Il GET si chiede una volta
     sola e solo a chi ha taciuto. */
  let r = await prendi(`https://${host}/`, 9000, "HEAD");
  if (r.stato === 0 || r.stato === 405) r = await prendi(`https://${host}/`, 12000);
  if (r.stato === 0 || r.stato >= 500) return null;

  let radice = `https://${host}`;
  try {
    const u = new URL(r.finale);
    radice = `${u.protocol}//${u.host}`;
  } catch {
    /* indirizzo finale illeggibile: si tiene quello di partenza */
  }
  return { host, stato: r.stato, radice };
}

/** A gruppi di otto: ventisei richieste insieme se ne perdono per strada. */
async function aGruppi(cose, quante, lavoro) {
  const esiti = [];
  for (let i = 0; i < cose.length; i += quante) {
    esiti.push(...(await Promise.all(cose.slice(i, i + quante).map(lavoro))));
  }
  return esiti;
}

/* ─────────────── B. le regole e le sitemap ─────────────── */

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

const SOLITI = ["/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml", "/product-sitemap.xml"];

/** Un HTML dove dovrebbe esserci XML e' una pagina di errore travestita. */
function paXml(r) {
  return r.stato === 200 && /<(urlset|sitemapindex)/i.test(r.testo);
}

async function regole(radice) {
  const rb = await prendi(`${radice}/robots.txt`, 10000);
  if (rb.stato === 403 || rb.stato === 401) return { esito: "illeggibile", sitemap: [] };
  if (rb.stato !== 200) return { esito: "assente", sitemap: SOLITI.map((p) => radice + p) };

  const { siti, vietaTutto } = robotsPerNoi(rb.testo);
  if (vietaTutto) return { esito: "vietato", sitemap: [] };
  return { esito: "ok", sitemap: siti.length ? siti.slice(0, 6) : SOLITI.map((p) => radice + p) };
}

/* ─────────────── C. dentro c'e' un prodotto? ─────────────── */

const PARE_PRODOTTO = /\/(p|product|products|produkt|item|items|pd|pdp|ip|groceries)\/[a-z0-9-]{3,}/i;

/** Roba che assomiglia a un prodotto ma non lo e': si impara dall'Italia. */
const SPAZZATURA = /\/medias\/|\.(jpe?g|png|gif|pdf|webp|svg|css|js)(\?|$)/i;

/**
 * UNA SCHEDA PRODOTTO NON E' UNA SCHEDA DI CIBO, E LA DIFFERENZA COSTA CARO.
 *
 * Contando le schede e basta, questa caccia dichiarava cinque insegne trovate.
 * Quattro erano sbagliate, e non di poco:
 *
 *   Tesco   198 schede  ->  /phones/products/…      telefoni
 *   M&S  13.907 schede  ->  …roll-neck-jumper/p/…   maglioni
 *   Aldi    142 schede  ->  /specialbuys/clothing/  categorie di vestiti
 *   Lidl  4.132 schede  ->  …men-s-rib-knit-sweater maglioni, e dal sito .com
 *
 * Tutte e quattro hanno un negozio online vero e una sitemap vera: quello che
 * non hanno e' la spesa. Un conteggio che le include gonfia il risultato del
 * doppio e manda a collegare cataloghi che a un'app di spesa non servono.
 *
 * Il controllo e' volutamente grossolano — guarda le parole nell'indirizzo —
 * perche' deve solo rispondere «questo scaffale e' di alimentari?», e a quella
 * domanda un pugno di esempi risponde bene quanto mille.
 */
const PARE_CIBO =
  /\b(milk|bread|cheese|butter|egg|chicken|beef|pork|lamb|fish|salmon|tuna|pasta|rice|flour|sugar|salt|oil|tomato|potato|onion|carrot|apple|banana|fruit|veg|salad|yoghurt|yogurt|cream|coffee|tea|juice|water|wine|beer|lager|cider|gin|vodka|whisky|snack|crisp|biscuit|chocolate|cereal|soup|sauce|bean|pea|corn|ham|bacon|sausage|pizza|frozen|organic|fresh|drink|food|grocer)\b/i;

/** Roba che dice apertamente di non essere cibo. */
const NON_E_CIBO =
  /\b(jumper|sweater|dress|shirt|trouser|jean|sock|shoe|boot|coat|jacket|knit|duvet|pillow|cushion|curtain|sofa|phone|laptop|tablet|tv|headphone|charger|toy|clothing|menswear|womenswear|lingerie|bra|homeware|furniture|garden|diy|bulb|specialbuys)\b/i;

/**
 * Su un campione di indirizzi, questo scaffale e' di alimentari?
 *
 * Si guarda il campione e non tutto: se le prime venti schede parlano di
 * maglioni, le altre tredicimila non parleranno di formaggio.
 */
function scaffaleAlimentare(urls) {
  const campione = urls.slice(0, 20);
  if (!campione.length) return { alimentare: false, cibo: 0, altro: 0 };
  const cibo = campione.filter((u) => PARE_CIBO.test(u) && !NON_E_CIBO.test(u)).length;
  const altro = campione.filter((u) => NON_E_CIBO.test(u)).length;

  /* SI BOCCIA CIO' CHE E' PALESEMENTE ALTRO, NON SI PROMUOVE CIO' CHE SEMBRA
     CIBO — ED E' UNA CORREZIONE, NON UN DETTAGLIO.
     La prima versione chiedeva che almeno un quarto delle schede contenesse
     una parola del vocabolario alimentare. Ha bocciato Co-op, che e' spesa
     vera: i suoi primi prodotti sono `andrew-peace-chardonnay` e
     `andrew-peace-shiraz`, e «chardonnay» non sta in nessun vocabolario
     ragionevole di cinquanta parole. Nemmeno «barilla», «heinz» o «hovis».
     Un elenco di nomi di marca e di vitigni non finisce mai.
     Al contrario, cio' che NON e' cibo lo dice da solo: maglioni, telefoni,
     piumoni, lampadine. Quella lista e' corta e sta ferma. */
  return { alimentare: altro <= cibo || altro < campione.length / 4, cibo, altro };
}

function indirizzi(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim());
}

async function dentro(url) {
  const r = await prendi(url, 25000);
  if (!paXml(r)) return null;

  let loc = indirizzi(r.testo);
  const quanteFiglie = /<sitemapindex/i.test(r.testo) ? loc.length : 0;
  if (quanteFiglie) {
    /* SCEGLIERE LA FIGLIA GIUSTA E' PIU' INSIDIOSO DI QUANTO SEMBRI, E QUI CI
       SI E' SBAGLIATI DUE VOLTE.

       La prima: cercare «grocer» nell'indirizzo intero. L'host di Morrisons e'
       `groceries.morrisons.com`, quindi combaciavano tutte le sue figlie.
       La seconda: cercare «item» nel percorso. La parola SITEMAP contiene
       «item» — s-item-ap — e quindi combaciava, di nuovo, qualunque sitemap al
       mondo. In tutti e due i casi il filtro non filtrava, si aprivano le
       prime figlie in ordine alfabetico, e Morrisons finiva giudicata senza
       prodotti mentre ne pubblica trentamila: la prima figlia e'
       `sitemap-categories`, cinquemila lampadine e nessun prodotto.

       Quindi: si guarda il solo percorso, e prima si toglie di mezzo la parola
       «sitemap», che essendo in ogni indirizzo non distingue niente. */
    const etichetta = (u) => {
      let path = u;
      try {
        path = new URL(u).pathname;
      } catch {
        /* indirizzo storto: si guarda comunque il testo */
      }
      return path.replace(/sitemaps?/gi, "");
    };
    // Prima le figlie che dicono «prodotti», poi le altre: non si scarta
    // niente, si mette solo in ordine di probabilita'.
    const punteggio = (u) => (/produ|artikel|grocer|catalog/i.test(etichetta(u)) ? 0 : 1);
    const scelte = [...loc].sort((a, b) => punteggio(a) - punteggio(b)).slice(0, 4);
    loc = [];
    for (const f of scelte) {
      const y = await prendi(f, 25000);
      if (paXml(y)) loc.push(...indirizzi(y.testo));
      if (loc.length > 3000) break;
    }
  }
  const prod = loc.filter((u) => PARE_PRODOTTO.test(u) && !SPAZZATURA.test(u));
  const cibo = scaffaleAlimentare(prod);
  return {
    sitemap: url,
    figlie: quanteFiglie,
    visti: loc.length,
    prodotti: prod.length,
    ...cibo,
    esempi: prod.slice(0, 3),
  };
}

/* ─────────────── la piattaforma condivisa ─────────────── */

/** I nomi dei bundle JS: due insegne con lo stesso insieme hanno lo stesso programma. */
function impronta(html) {
  const nomi = [...html.matchAll(/<script[^>]+src="([^"]+)"/gi)]
    .map((m) => (m[1].split("/").pop() || "").replace(/[._-][0-9a-f]{6,}/gi, "").replace(/\?.*/, ""))
    .filter((n) => n.endsWith(".js"));
  return [...new Set(nomi)].sort().slice(0, 6).join(",");
}

const API_PIATTAFORMA = [
  "/ebsn/api/products?q=milk&page_size=3",
  "/api/products?q=milk",
  "/api/catalog/search?q=milk",
];

async function piattaforma(radice) {
  const home = await prendi(`${radice}/`, 15000);
  let api = null;
  for (const p of API_PIATTAFORMA) {
    const r = await prendi(radice + p, 7000);
    if (r.stato === 200 && /json/.test(r.tipo) && r.testo.length > 80) {
      api = p.split("?")[0];
      break;
    }
  }
  return { impronta: home.stato === 200 ? impronta(home.testo) : "", api };
}

/* ─────────────── il giro ─────────────── */

const USCITA = process.env.USCITA ?? "caccia-uk.json";
const esiti = [];

for (const marchio of MARCHI) {
  const t0 = Date.now();
  const vivi = (await aGruppi(varianti(marchio), 8, vivo)).filter(Boolean);

  // Radici distinte: otto varianti che redirigono allo stesso posto sono UN sito.
  const radici = [...new Set(vivi.map((v) => v.radice))];
  if (!radici.length) {
    esiti.push({ marchio, prodotti: 0, radici: 0 });
    console.log(`${marchio.padEnd(20)} — nessun host risponde`);
    continue;
  }

  const trovati = [];
  const nonAlimentari = [];
  let illeggibili = 0;
  let vietati = 0;
  let esaminati = 0;
  for (const radice of radici) {
    const reg = await regole(radice);
    if (reg.esito === "illeggibile") { illeggibili++; continue; }
    if (reg.esito === "vietato") { vietati++; continue; }
    esaminati++;
    for (const sm of reg.sitemap) {
      const d = await dentro(sm);
      if (!d || d.prodotti < 20) continue;
      if (!d.alimentare) {
        // Si registra e si tira dritto: e' un catalogo vero, ma non di spesa.
        nonAlimentari.push({ radice, prodotti: d.prodotti, esempio: d.esempi[0] });
        continue;
      }
      trovati.push({ radice, ...d });
      break;
    }
    if (trovati.length >= 2) break;
  }

  const sec = ((Date.now() - t0) / 1000).toFixed(0);
  if (trovati.length) {
    const migliore = trovati.sort((a, b) => b.prodotti - a.prodotti)[0];
    const p = await piattaforma(migliore.radice);
    esiti.push({ marchio, ...migliore, ...p, radici: radici.length });
    console.log(
      `${marchio.padEnd(20)} ${String(migliore.prodotti).padStart(6)} prod  ` +
        `${migliore.radice.replace("https://", "").padEnd(32)}${p.api ? " API:" + p.api : ""}  ${sec}s`,
    );
  } else {
    /* IL VERDETTO SI DA' SUL DOMINIO GIUSTO, NON SULL'INSIEME, E PRIMA NO.
       Le varianti di un marchio finiscono spesso su siti che con l'insegna non
       c'entrano: «iceland» e' anche un paese, e `iceland.com` e' tutt'altro.
       Aggregando, un divieto trovato su un dominio estraneo diventava il
       giudizio sull'insegna: Iceland Foods risultava «VIETATO da robots»
       mentre il suo robots non vieta niente. Ora conta cosa e' successo sui
       domini che hanno risposto, e i divieti si riportano a parte. */
    const perche = esaminati === 0
      ? illeggibili
        ? "regole NON leggibili (403)"
        : "nessun dominio esaminabile"
      : nonAlimentari.length
        ? "catalogo trovato, ma non di spesa"
        : "nessuna sitemap con prodotti";
    const nota = nonAlimentari.length
      ? `  [catalogo non alimentare: ${nonAlimentari[0].prodotti} schede, es. ${String(nonAlimentari[0].esempio).slice(0, 52)}]`
      : vietati
        ? `  [${vietati} domini omonimi vietano tutto]`
        : "";
    esiti.push({ marchio, prodotti: 0, illeggibili, vietati, esaminati, nonAlimentari, radici: radici.length });
    console.log(`${marchio.padEnd(20)} ${perche.padEnd(28)} (${radici.length} siti)${nota}  ${sec}s`);
  }
  writeFileSync(USCITA, JSON.stringify(esiti, null, 2));
}

console.log(`\n${"=".repeat(64)}`);
const conProdotti = esiti.filter((e) => e.prodotti > 0);
console.log(`marchi con prodotti:     ${conProdotti.length}/${MARCHI.length}`);
console.log(`prodotti visti in tutto: ${conProdotti.reduce((a, e) => a + e.prodotti, 0).toLocaleString("it-IT")}`);
console.log(`regole non leggibili:    ${esiti.filter((e) => e.illeggibili > 0).length}`);
console.log(`vietati da robots:       ${esiti.filter((e) => e.vietati > 0).length}`);

const perImpronta = new Map();
for (const e of conProdotti.filter((x) => x.impronta)) {
  perImpronta.set(e.impronta, [...(perImpronta.get(e.impronta) ?? []), e.marchio]);
}
const condivise = [...perImpronta.values()].filter((v) => v.length > 1);
if (condivise.length) {
  console.log("\nPIATTAFORME CONDIVISE (stesso bundle = stessa API):");
  condivise.forEach((v) => console.log("   ", v.join(" + ")));
}
