/**
 * Caccia ai punti vendita delle insegne che NON usano EBSN.
 *
 * Le insegne sulla piattaforma EBSN regalano il cercanegozi da
 * `/ebsn/api/warehouse-locator/search`, ed e' cosi' che abbiamo i primi 1.764.
 * Tutte le altre — Carrefour, Conad, Coop, Bennet, Lidl, MD, Todis… — il
 * cercanegozi ce l'hanno lo stesso, solo scritto in un modo loro.
 *
 * Tre forme, in ordine di quanto sono comode:
 *
 *   1. UN INDIRIZZO CHE RISPONDE JSON. Il piu' pulito: nome, indirizzo, citta',
 *      CAP e spesso le coordinate, tutto strutturato.
 *   2. LE SCHEDE NEGOZIO NELLA SITEMAP. Meno comodo ma altrettanto vero: se il
 *      sito ha una pagina per punto vendita, quella pagina sta nella sitemap e
 *      dentro c'e' un `LocalBusiness`/`Store` in JSON-LD con l'indirizzo.
 *   3. NIENTE. Capita, e si dichiara.
 *
 * Non si indovina nulla di piu' del necessario: i percorsi provati qui sotto
 * sono quelli che le insegne italiane usano davvero, e ogni tentativo e' una
 * richiesta sola.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

async function prendi(url, ms = 12000, json = false) {
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(ms),
      headers: {
        "User-Agent": UA,
        Accept: json ? "application/json, text/plain, */*" : "text/html,application/xml",
        "Accept-Language": "it-IT,it;q=0.9",
      },
    });
    if (!r.ok) return { stato: r.status, testo: "", tipo: "" };
    return {
      stato: r.status,
      tipo: (r.headers.get("content-type") || "").split(";")[0],
      testo: await r.text(),
    };
  } catch {
    return { stato: 0, testo: "", tipo: "" };
  }
}

/**
 * Percorsi JSON che le insegne usano per il cercanegozi.
 *
 * Due vocabolari, perche' sono due lingue e non si sovrappongono: un'insegna
 * britannica non espone mai `/api/punti-vendita`, e una italiana non espone
 * mai `/branch-finder`. Provarli tutti costa una richiesta a vuoto per
 * percorso, che e' il prezzo di non doversi ricordare in che paese si e'.
 */
const VIE_JSON = [
  // italiano
  "/api/stores",
  "/api/store",
  "/api/negozi",
  "/api/punti-vendita",
  "/api/puntivendita",
  "/api/store-locator",
  "/api/storelocator/search",
  "/api/v1/stores",
  "/rest/stores",
  "/store-locator/api/stores",
  "/negozi.json",
  "/stores.json",
  "/punti-vendita.json",
  "/wp-json/wp/v2/negozi?per_page=100",
  "/wp-json/store-locator/v1/stores",
  // britannico
  "/api/branches",
  "/api/branch",
  "/api/shops",
  "/api/locations",
  "/api/store-finder",
  "/api/storefinder/stores",
  "/api/stores/all",
  "/api/v1/stores/all",
  "/store-finder/api/stores",
  "/storefinder/api/search",
  "/branches.json",
  "/locations.json",
  "/stores/all.json",
  "/bin/stores.json",
  "/graphql?query=%7Bstores%7Bname%20postcode%7D%7D",
];

/** Un oggetto che sembra un negozio: ha un indirizzo o delle coordinate. */
function pareNegozio(o) {
  if (!o || typeof o !== "object") return false;
  const k = Object.keys(o).map((x) => x.toLowerCase());
  const haPosto = k.some((x) => /address|indirizzo|via|citta|city|comune|cap|zip|postal/.test(x));
  const haCoord = k.some((x) => /lat/.test(x)) && k.some((x) => /lon|lng/.test(x));
  return haPosto || haCoord;
}

/** Cerca ricorsivamente il primo elenco di cose che sembrano negozi. */
function trovaElenco(nodo, prof = 0) {
  if (prof > 5 || !nodo || typeof nodo !== "object") return null;
  if (Array.isArray(nodo)) {
    if (nodo.length >= 3 && nodo.filter(pareNegozio).length >= Math.min(3, nodo.length)) return nodo;
    for (const v of nodo.slice(0, 20)) {
      const t = trovaElenco(v, prof + 1);
      if (t) return t;
    }
    return null;
  }
  for (const v of Object.values(nodo)) {
    const t = trovaElenco(v, prof + 1);
    if (t) return t;
  }
  return null;
}

async function viaJson(base) {
  for (const via of VIE_JSON) {
    const r = await prendi(base + via, 10000, true);
    if (r.stato !== 200 || !/json/.test(r.tipo)) continue;
    try {
      const elenco = trovaElenco(JSON.parse(r.testo));
      if (elenco && elenco.length >= 3) return { via, quanti: elenco.length, esempio: elenco[0] };
    } catch {
      /* non era JSON valido: si prova il prossimo */
    }
  }
  return null;
}

/** Le schede negozio dentro la sitemap. */
const PARE_NEGOZIO =
  /\/(negozi|negozio|punti-vendita|puntivendita|punto-vendita|store|stores|store-locator|store-finder|storefinder|filiali|branch|branches|shops|find-a-store|our-stores|locations)\//i;

async function viaSitemap(base) {
  const rb = await prendi(base + "/robots.txt", 10000);
  const dichiarate = [...rb.testo.matchAll(/^\s*Sitemap:\s*(\S+)/gim)].map((m) => m[1].trim());
  const candidate = dichiarate.length ? dichiarate : [base + "/sitemap.xml"];

  const trovati = new Set();
  for (const sm of candidate.slice(0, 3)) {
    const x = await prendi(sm, 25000);
    if (!x.testo) continue;
    const loc = [...x.testo.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim());
    if (/<sitemapindex/i.test(x.testo)) {
      // Solo le figlie che nel nome parlano di negozi: le altre sono prodotti.
      for (const f of loc.filter((l) => PARE_NEGOZIO.test(l) || /negoz|store|branch|shop|pdv|location/i.test(l)).slice(0, 6)) {
        const y = await prendi(f, 25000);
        for (const m of y.testo.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
          if (PARE_NEGOZIO.test(m[1])) trovati.add(m[1].trim());
        }
      }
    } else {
      for (const u of loc) if (PARE_NEGOZIO.test(u)) trovati.add(u);
    }
    if (trovati.size > 50) break;
  }
  return trovati.size >= 5 ? { quanti: trovati.size, esempio: [...trovati][0] } : null;
}

const INSEGNE = process.argv.slice(2);
if (!INSEGNE.length) {
  console.log("uso: node scripts/caccia-negozi.mjs https://www.esempio.it ...");
  process.exit(0);
}

for (const arg of INSEGNE) {
  const base = (arg.startsWith("http") ? arg : `https://${arg}`).replace(/\/+$/, "");
  const nome = base.replace(/^https?:\/\//, "");

  const j = await viaJson(base);
  if (j) {
    const e = j.esempio || {};
    const campi = Object.keys(e).slice(0, 6).join(",");
    console.log(nome.padEnd(32), "JSON".padEnd(8), String(j.quanti).padStart(5), j.via.padEnd(26), campi.slice(0, 48));
    continue;
  }
  const s = await viaSitemap(base);
  if (s) {
    console.log(nome.padEnd(32), "SITEMAP".padEnd(8), String(s.quanti).padStart(5), String(s.esempio).slice(0, 64));
    continue;
  }
  console.log(nome.padEnd(32), "—");
}
