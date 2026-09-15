/**
 * La sonda: dato un dominio, dice se ci si puo' prendere prezzi e link.
 *
 * PERCHE' UNA SONDA E NON DIECI PROVE A MANO
 * ------------------------------------------
 * Perche' le prove a mano le ho fatte, e ho sbagliato in tutti i modi
 * possibili: ho escluso Bennet (20.446 prodotti) per un parser di robots.txt
 * che leggeva attraverso i blocchi, ho perso meta' del catalogo Coop
 * fermandomi alla prima sitemap figlia, e ho letto il listino invece del
 * prezzo scontato per giorni. Ogni regola qui dentro e' una di quelle
 * cicatrici, scritta una volta sola in modo che non si possa dimenticarla.
 *
 * COSA FA, IN ORDINE
 * ------------------
 *   1. robots.txt, letto per BLOCCHI: le regole di User-agent:* finiscono dove
 *      comincia il prossimo User-agent. Un Disallow mirato conta quanto uno
 *      totale, se copre dove stanno i prodotti.
 *   2. EBSN: se /ebsn/api/products risponde, il catalogo e' interrogabile dal
 *      vivo e non serve nessuna sitemap. E' una piattaforma: chi ce l'ha, ce
 *      l'ha tutto.
 *   3. Le sitemap DICHIARATE in robots.txt. Non si indovina un percorso: su
 *      easycoop /sitemap.xml non esiste e la vera sta in /sitemap/sitemap.xml.
 *   4. Dentro un indice si scendono TUTTE le figlie, non le prime: i nomi non
 *      dicono cosa contengono.
 *   5. Se gli indirizzi non portano il nome del prodotto, lo si cerca nella
 *      sitemap delle IMMAGINI, dove <image:title> e' legato alla <loc>.
 *   6. Due schede prodotto aperte davvero, e il prezzo letto. Senza questo
 *      passo un censimento dice "si" anche per un guscio JavaScript da 3 kB —
 *      ed e' successo con Effepiu, NaturaSi e Cosaporto.
 *
 * USO
 *   node scripts/sonda-insegna.mjs https://www.esempio.it [altri...]
 *   node scripts/sonda-insegna.mjs --elenco file.txt
 */

import { gunzipSync } from "node:zlib";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

async function prendi(url, ms = 25000, json = false) {
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(ms),
      headers: {
        "User-Agent": UA,
        Accept: json ? "application/json" : "text/html,application/xhtml+xml,application/xml",
        "Accept-Language": "it-IT,it;q=0.9",
        ...(json ? { "X-Ebsn-Client": "site" } : {}),
      },
    });
    if (!r.ok) return { stato: r.status, testo: "" };
    const buf = Buffer.from(await r.arrayBuffer());
    const testo = url.endsWith(".gz") ? gunzipSync(buf).toString("utf8") : buf.toString("utf8");
    return { stato: r.status, testo };
  } catch (e) {
    return { stato: 0, testo: "", errore: String(e.name || e) };
  }
}

/* ─────────────────────────── 1. robots.txt ─────────────────────────── */

/**
 * Le regole che valgono per NOI, cioe' il blocco `User-agent: *`.
 *
 * Il mio primo parser usava una regex con un salto pigro fra "User-agent: *" e
 * "Disallow: /", e il salto attraversava i blocchi degli altri bot. Unes vieta
 * CazoodleBot e MJ12bot; a noi dice "Allow: /". Il test rispondeva "vieta
 * tutto" e buttava via quindicimila prodotti.
 */
export function leggiRobots(testo) {
  const righe = testo
    .split(/\r?\n/)
    .map((r) => r.replace(/#.*$/, "").trim())
    .filter(Boolean);

  const blocchi = [];
  let corrente = null;
  for (const riga of righe) {
    const m = riga.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const campo = m[1].toLowerCase();
    const valore = m[2].trim();
    if (campo === "user-agent") {
      if (!corrente || corrente.regole.length) {
        corrente = { agenti: [], regole: [] };
        blocchi.push(corrente);
      }
      corrente.agenti.push(valore.toLowerCase());
    } else if (corrente && (campo === "allow" || campo === "disallow")) {
      corrente.regole.push({ tipo: campo, path: valore });
    }
  }

  const nostro = blocchi.find((b) => b.agenti.includes("*"));
  const sitemap = [...testo.matchAll(/^\s*Sitemap:\s*(\S+)/gim)].map((m) => m[1].trim());
  if (!nostro) return { vietaTutto: false, vietati: [], sitemap };

  const vietaTutto =
    nostro.regole.some((r) => r.tipo === "disallow" && r.path === "/") &&
    !nostro.regole.some((r) => r.tipo === "allow" && r.path === "/");

  return {
    vietaTutto,
    vietati: nostro.regole.filter((r) => r.tipo === "disallow" && r.path).map((r) => r.path),
    sitemap,
  };
}

/** Un indirizzo cade sotto un Disallow? Serve per i divieti mirati. */
function vietato(url, vietati) {
  let percorso;
  try {
    percorso = new URL(url).pathname;
  } catch {
    return false;
  }
  return vietati.some((v) => v !== "/" && percorso.startsWith(v.replace(/\*$/, "")));
}

/* ───────────────────────────── 2. EBSN ───────────────────────────── */

/**
 * La piattaforma che parecchie insegne italiane hanno in comune.
 *
 * Si riconosce perche' `/ebsn/api/products` risponde in JSON senza chiave. Chi
 * ce l'ha non ha bisogno di sitemap: a cercare e' il motore del negozio, che
 * lo fa meglio di qualunque euristica nostra.
 */
async function provaEbsn(base) {
  const r = await prendi(`${base}/ebsn/api/products?q=latte&page_size=3`, 15000, true);
  if (r.stato !== 200 || !r.testo.includes("products")) return null;
  try {
    const j = JSON.parse(r.testo.replace(/^\s+/, ""));
    const ps = j?.data?.products ?? [];
    if (!ps.length) return { prodotti: 0, conPrezzo: false };
    // priceDisplay, NON price: price e' il listino e nasconde le promozioni.
    const conPrezzo = ps.filter((p) => (p.priceDisplay ?? p.price) != null).length;
    const p0 = ps[0];
    return {
      prodotti: ps.length,
      conPrezzo: conPrezzo > 0,
      esempio: p0?.name,
      prezzo: p0?.priceDisplay ?? p0?.price ?? null,
      listino: p0?.priceStandardDisplay ?? null,
      link: p0?.itemUrl ?? null,
    };
  } catch {
    return null;
  }
}

/* ──────────────────────── 3-5. le sitemap ──────────────────────── */

/**
 * Come si riconosce una scheda prodotto dall'indirizzo.
 *
 * L'ultima forma e' quella che mi era sfuggita, e costava un'insegna intera:
 * certe catene non mettono il nome nell'URL ma solo reparto e numero —
 * `/pasta-e-riso/riso/classico/1385014.html`. Senza questa riga la sonda
 * rispondeva "nessun prodotto" su Coop Centro Italia mentre la sua sitemap
 * immagini dichiarava undicimilanovecento nomi. Il segnale c'era, il
 * riconoscitore no.
 */
const PARE_PRODOTTO =
  /\/(p|prodotto|prodotti|product|products|articolo|produkt)\/|-\d{5,}\.html?$|\/p\/\d+$|\/\d{3,}\.html?$/i;

/** Le figlie di un indice: TUTTE, non le prime. */
async function scendi(xml, limite = 30) {
  const loc = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim());
  if (!/<sitemapindex/i.test(xml)) return { figlie: [], url: loc };
  return { figlie: loc.slice(0, limite), url: [] };
}

/** Indirizzo -> nome, dalla sitemap delle immagini. */
function nomiDaImmagini(xml) {
  const mappa = new Map();
  for (const blocco of xml.split(/<url>/i).slice(1)) {
    const loc = blocco.match(/<loc>([^<]+)<\/loc>/i)?.[1]?.trim();
    const titolo = blocco.match(/<image:title>([\s\S]*?)<\/image:title>/i)?.[1];
    if (loc && titolo && !mappa.has(loc)) {
      mappa.set(loc, titolo.replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, "&").trim());
    }
  }
  return mappa;
}

/* ──────────────────────── 6. il prezzo, davvero ──────────────────────── */

/** La finestra dove cercare: il JSON-LD non sta sempre in alto (Coop: byte 838.000). */
function porzioneUtile(html) {
  const testa = html.slice(0, 120_000);
  const i = html.search(/application\/ld\+json/i);
  if (i < 0 || i < 120_000) return testa;
  return `${testa}\n${html.slice(i, i + 200_000)}`;
}

function leggiPrezzo(htmlIntero) {
  const html = porzioneUtile(htmlIntero);
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1].trim());
      const nodi = Array.isArray(j) ? j : j["@graph"] ? j["@graph"] : [j];
      for (const n of nodi) {
        const t = Array.isArray(n["@type"]) ? n["@type"].join() : n["@type"];
        if (!/Product/i.test(String(t || ""))) continue;
        const o = Array.isArray(n.offers) ? n.offers[0] : n.offers;
        if (o && o.price != null) return { via: "json-ld", nome: n.name, prezzo: Number(o.price) };
      }
    } catch {
      /* un blocco malformato non ferma gli altri */
    }
  }
  const micro = html.match(/itemprop=["']price["'][^>]*content=["']([\d.,]+)["']/i);
  if (micro) return { via: "microdata", prezzo: Number(micro[1].replace(",", ".")) };
  const og = html.match(/<meta[^>]+product:price:amount[^>]+content="([\d.,]+)"/i);
  if (og) return { via: "og", prezzo: Number(og[1].replace(",", ".")) };
  const dentro = html.match(/"(?:price|grossPrice|finalPrice|sellPrice)"\s*:\s*"?(\d+[.,]\d{1,2})"?/i);
  if (dentro) return { via: "json", prezzo: Number(dentro[1].replace(",", ".")) };
  return null;
}

/* ───────────────────────────── La sonda ───────────────────────────── */

export async function sonda(base) {
  const dominio = base.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const esito = { dominio, base, esito: "?", note: [] };

  // 1. robots
  const rb = await prendi(`${base}/robots.txt`, 12000);
  const regole = rb.testo ? leggiRobots(rb.testo) : { vietaTutto: false, vietati: [], sitemap: [] };
  if (regole.vietaTutto) {
    esito.esito = "robots-vieta";
    return esito;
  }

  // 2. EBSN: se c'e', si e' gia' finito
  const ebsn = await provaEbsn(base);
  if (ebsn && ebsn.prodotti > 0) {
    esito.ebsn = true;
    esito.esito = ebsn.conPrezzo ? "ebsn-con-prezzo" : "ebsn-solo-link";
    esito.esempio = ebsn.esempio;
    esito.prezzo = ebsn.prezzo;
    esito.link = ebsn.link;
    if (ebsn.listino && ebsn.prezzo && ebsn.listino > ebsn.prezzo) {
      esito.note.push(`promozione attiva: ${ebsn.prezzo} da ${ebsn.listino}`);
    }
    return esito;
  }

  // 3. le sitemap dichiarate — e solo quelle, se ce ne sono
  const candidate = regole.sitemap.length
    ? regole.sitemap
    : [`${base}/sitemap.xml`, `${base}/sitemap_index.xml`];

  let urlProdotto = [];
  let sitemapUsata = "";
  let nomi = new Map();

  for (const sm of candidate.slice(0, 4)) {
    const x = await prendi(sm, 40000);
    if (!x.testo) continue;
    const { figlie, url } = await scendi(x.testo);

    if (url.length) {
      const prod = url.filter((u) => PARE_PRODOTTO.test(u) && !vietato(u, regole.vietati));
      if (prod.length > urlProdotto.length) {
        urlProdotto = prod;
        sitemapUsata = sm;
      }
    }

    for (const f of figlie) {
      const y = await prendi(f, 40000);
      if (!y.testo) continue;
      if (/<image:/i.test(y.testo)) {
        for (const [k, v] of nomiDaImmagini(y.testo)) if (!nomi.has(k)) nomi.set(k, v);
        continue;
      }
      const dentro = [...y.testo.matchAll(/<loc>([^<]+)<\/loc>/gi)]
        .map((m) => m[1].trim())
        .filter((u) => PARE_PRODOTTO.test(u) && !vietato(u, regole.vietati));
      if (dentro.length) {
        urlProdotto.push(...dentro);
        sitemapUsata = sitemapUsata || sm;
      }
    }
    if (urlProdotto.length > 500) break;
  }

  if (!urlProdotto.length) {
    esito.esito = "nessun-prodotto";
    if (nomi.size) esito.note.push(`${nomi.size} nomi dalle immagini, ma nessun indirizzo prodotto`);
    return esito;
  }

  esito.prodotti = urlProdotto.length;
  esito.sitemap = sitemapUsata;
  if (nomi.size) esito.note.push(`${nomi.size} nomi dalla sitemap immagini`);

  // 6. due schede aperte davvero
  const campione = [
    urlProdotto[Math.floor(urlProdotto.length / 3)],
    urlProdotto[Math.floor((urlProdotto.length * 2) / 3)],
  ].filter(Boolean);

  const letti = [];
  for (const u of campione) {
    const p = await prendi(u, 25000);
    if (!p.testo) {
      letti.push({ url: u, stato: p.stato, prezzo: null, kb: 0 });
      continue;
    }
    const pr = leggiPrezzo(p.testo);
    letti.push({
      url: u,
      stato: p.stato,
      prezzo: pr?.prezzo ?? null,
      via: pr?.via,
      nome: pr?.nome,
      kb: Math.round(p.testo.length / 1024),
    });
  }
  esito.prove = letti;
  esito.esito = letti.some((l) => l.prezzo != null) ? "con-prezzo" : "solo-link";
  if (esito.esito === "solo-link" && letti.every((l) => l.kb < 40)) {
    esito.note.push("guscio JavaScript: il prezzo lo scrive il browser");
  }
  return esito;
}

/* ───────────────────────────── da riga di comando ───────────────────────────── */

const args = process.argv.slice(2);
if (args.length) {
  let domini = args;
  if (args[0] === "--elenco") {
    const { readFileSync } = await import("node:fs");
    domini = readFileSync(args[1], "utf8").split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  }
  for (const d of domini) {
    const base = d.startsWith("http") ? d.replace(/\/+$/, "") : `https://${d}`;
    const e = await sonda(base);
    const prezzo = e.prove?.find((p) => p.prezzo != null);
    console.log(
      e.dominio.padEnd(34),
      String(e.esito).padEnd(17),
      String(e.prodotti ?? (e.ebsn ? "live" : "")).padStart(7),
      prezzo ? `${prezzo.prezzo} € [${prezzo.via}]` : e.prezzo != null ? `${e.prezzo} €` : "",
      e.note.length ? ` — ${e.note.join("; ")}` : "",
    );
  }
}
