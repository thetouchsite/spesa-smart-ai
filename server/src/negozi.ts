/**
 * L'elenco dei punti vendita, insegna per insegna.
 *
 * A COSA SERVE
 * ------------
 * A rispondere alla domanda che l'utente si fa davvero: non «quanto costa la
 * passata in Italia», ma «dove vado a prenderla stasera». Un prezzo senza un
 * negozio raggiungibile e' un numero; con il negozio diventa una spesa.
 *
 * Serve anche a non mentire. Le insegne italiane sono regionali, e i listini
 * pure: fra Coop Alleanza e Unicoop Tirreno lo stesso limone biologico costa
 * 2,98 € e 1,34 €. Mostrare a chi sta a Milano il prezzo di una cooperativa
 * toscana non e' un'approssimazione, e' un numero sbagliato. Sapere quali
 * insegne hanno un negozio vicino e' cio' che permette di filtrare.
 *
 * DA DOVE ARRIVA
 * --------------
 * Da `warehouse-locator/search`, il cercanegozi che le insegne sulla
 * piattaforma EBSN espongono per il loro stesso sito. Risponde in JSON, senza
 * chiave e senza sessione, con nome, indirizzo, citta', provincia, CAP e
 * coordinate. Eurospin ne dichiara 1.257.
 *
 * QUELLO CHE QUESTO ELENCO NON E'
 * -------------------------------
 * Non e' un elenco di prezzi per negozio, e quella cosa non esiste: verificato
 * aprendo lo stesso prodotto su sei Eurospin da Milano a Palermo, il listino e'
 * 1,19 € dappertutto. Quello che cambia da un negozio all'altro sono le
 * PROMOZIONI, e quelle il sito le calcola sul negozio che ti serve.
 *
 * Quindi: il prezzo e' dell'insegna, il negozio e' il tuo. Sono due cose
 * diverse e vanno dette separate, altrimenti si finisce per attaccare lo sconto
 * di un negozio all'indirizzo di un altro.
 */

import { cache, isDbConfigured } from "./db.js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

/** Un giorno: i negozi aprono e chiudono, ma non fra le 9 e le 9 e un quarto. */
const SCADENZA_MS = 24 * 60 * 60 * 1000;

export interface Negozio {
  insegna: string;
  /** Identificativo interno dell'insegna: serve a ritrovarlo, non all'utente. */
  id: number;
  nome: string;
  indirizzo: string;
  citta: string;
  provincia: string;
  cap: string;
  latitudine?: number;
  longitudine?: number;
}

interface InsegnaConNegozi {
  insegna: string;
  paese: string;
  /** La base del sito che espone il cercanegozi. */
  base: string;
  /**
   * Come si leggono i punti vendita di questa insegna.
   *
   *   "ebsn"     /ebsn/api/warehouse-locator/search: JSON completo, con
   *              indirizzo e coordinate. E' il caso migliore.
   *   "json"     un indirizzo JSON suo, con i campi scritti a modo suo.
   *   "sitemap"  niente JSON: le schede negozio stanno nella sitemap e del
   *              punto vendita si ricava la CITTA' dall'indirizzo, non la via.
   *              Meno dato, ma e' quello che serve alla domanda vera — quali
   *              insegne ti servono dove stai — e si ottiene senza aprire
   *              mille pagine.
   */
  via: "ebsn" | "json" | "sitemap";
  /** Per "json": l'indirizzo da chiamare. Per "sitemap": come riconoscere una scheda. */
  percorso?: string;
  schema?: RegExp;
}

/**
 * Le insegne di cui sappiamo leggere i punti vendita.
 *
 * Sono quelle sulla piattaforma EBSN, riconoscibile perche' tutte le sue
 * chiamate stanno sotto `/ebsn/api/`. Se ne aggiunge una scrivendo una riga:
 * il cercanegozi ha la stessa forma su tutte.
 */
export const INSEGNE_CON_NEGOZI: InsegnaConNegozi[] = [
  { via: "ebsn", insegna: "Eurospin", paese: "IT", base: "https://online.eurospin.com" },
  { via: "ebsn", insegna: "Tigros", paese: "IT", base: "https://www.tigros.it" },
  { via: "ebsn", insegna: "Coop (Nova Coop, Lombardia, Liguria)", paese: "IT", base: "https://www.coopshop.it" },
  { via: "ebsn", insegna: "Basko", paese: "IT", base: "https://www.basko.it" },
  { via: "ebsn", insegna: "Iperal", paese: "IT", base: "https://www.iperalspesaonline.it" },
  { via: "ebsn", insegna: "Effepiù", paese: "IT", base: "https://www.myeffepiu.it" },
  { via: "ebsn", insegna: "Alì Supermercati", paese: "IT", base: "https://www.alisupermercati.it" },
  { insegna: "Iper La Grande i", paese: "IT", base: "https://iperdrive.iper.it", via: "ebsn" },

  /* NON-EBSN, trovate con scripts/caccia-negozi.mjs.
     Penny pubblica un indirizzo JSON completo — citta', provincia, CAP e
     coordinate — ed e' il caso piu' pulito dopo EBSN. Carrefour ed Esselunga
     no: hanno una scheda per punto vendita nella sitemap, e da li' si ricava
     la citta' dall'indirizzo. Dell'indirizzo civico non sappiamo niente, e non
     lo si finge: il campo resta vuoto. */
  { insegna: "Penny Market", paese: "IT", base: "https://www.penny.it", via: "json", percorso: "/api/stores" },
  {
    insegna: "Carrefour",
    paese: "IT",
    base: "https://www.carrefour.it",
    via: "sitemap",
    schema: /\/punti-vendita\/([^/.]+)\.html$/i,
  },
  {
    insegna: "Esselunga",
    paese: "IT",
    base: "https://www.esselunga.it",
    via: "sitemap",
    schema: /\/negozi\/negozio\.esselunga-di-([^/?#]+)$/i,
  },

  /* Altre quattro trovate con la stessa sonda. Nova Coop e Unicoop Firenze
     sono cooperative Coop distinte da quelle gia' presenti: hanno negozi loro
     e — questo conta — listini loro, che e' il motivo per cui si tengono
     separate invece di fonderle in un unico "Coop". */
  {
    insegna: "Pam Panorama",
    paese: "IT",
    base: "https://www.pampanorama.it",
    via: "sitemap",
    schema: /\/punti-vendita\/([^/?#]+)$/i,
  },
  {
    insegna: "Unes",
    paese: "IT",
    base: "https://www.unes.it",
    via: "sitemap",
    // /it/punti-vendita/186-fagnano-olona: il numero davanti e' il codice del
    // negozio, e va tolto o la citta' diventa "186 Fagnano Olona".
    schema: /\/punti-vendita\/(?:\d+-)?([^/?#]+)$/i,
  },
  {
    insegna: "Unicoop Firenze",
    paese: "IT",
    base: "https://www.coopfirenze.it",
    via: "sitemap",
    schema: /\/negozi\/([^/?#]+)$/i,
  },
  {
    insegna: "Nova Coop",
    paese: "IT",
    base: "https://www.novacoop.it",
    via: "sitemap",
    // /punti-vendita/coop-torino-belgio: il prefisso "coop-" non e' la citta'.
    schema: /\/punti-vendita\/(?:coop-)?([^/?#]+)$/i,
  },

  /* ─────────────────────── REGNO UNITO ───────────────────────
     Le prime insegne fuori dall'Italia. Tutte e tre per sitemap: nessuna
     espone un cercanegozi in JSON, ma pubblica una pagina per punto vendita
     con la citta' nell'indirizzo, che e' quanto serve alla domanda vera —
     quali insegne ci sono dove sei.

     Trovate allargando `scripts/caccia-negozi.mjs`, che cercava solo i nomi
     italiani: `/api/negozi`, `/punti-vendita`. Un'insegna britannica non li
     usa mai, quindi lo strumento rispondeva «niente» su tutte e sette quelle
     provate. Aggiunto il vocabolario britannico — `branch`, `store-finder`,
     `find-a-store`, `locations` — ne sono uscite tre al primo colpo. */
  {
    insegna: "Lidl UK",
    paese: "GB",
    base: "https://www.lidl.co.uk",
    via: "sitemap",
    /* DUE LIVELLI, E PRIMA NE PRENDEVAMO UNO SOLO.
       Lidl pubblica `/store-finder/aberdeen/` — la pagina della citta', 121 in
       tutto — e sotto di essa `/store-finder/aberdeen/hutcheon-street/`, che e'
       il negozio vero: quelli sono 1.021. Uno schema che pretendeva un
       segmento solo prendeva le citta' e buttava i negozi, cioe' il novanta per
       cento di Lidl nel Regno Unito.
       Il segmento della via e' facoltativo: cosi' combaciano tutte e due le
       forme e la citta' si legge sempre dal primo. */
    schema: /\/store-finder\/([^/?#]+)(?:\/[^/?#]+)?\/?$/i,
  },
  {
    insegna: "Waitrose",
    paese: "GB",
    base: "https://www.waitrose.com",
    via: "sitemap",
    /* /find-a-store/<citta>, ma nella stessa cartella stanno anche quattro
       pagine che negozi non sono — la rubrica e gli orari di Natale e Pasqua.
       Senza l'esclusione finirebbero in elenco come se fossero comuni
       britannici, e un utente a «Christmas Opening Hours» non ci abita. */
    schema: /\/find-a-store\/(?!directory$|seasonal$|[^/?#]*opening-hours$)([^/?#]+)$/i,
  },
  {
    insegna: "Booths",
    paese: "GB",
    base: "https://www.booths.co.uk",
    via: "sitemap",
    // /store/carnforth/ — ventisei negozi nel nord-ovest, pochi ma tutti veri.
    schema: /\/store\/([^/?#]+)\/?$/i,
  },
  {
    insegna: "Aldi UK",
    paese: "GB",
    base: "https://www.aldi.co.uk",
    via: "sitemap",
    /* /store-finder/l/wimbledon — la `l` in mezzo e' un segmento di servizio
       del loro cercanegozi, non una citta'. Milleottocentoquarantaquattro
       punti vendita: da sola quasi raddoppia la copertura britannica. */
    schema: /\/store-finder\/l\/([^/?#]+)\/?$/i,
  },
  {
    insegna: "Budgens",
    paese: "GB",
    base: "https://www.budgens.co.uk",
    via: "sitemap",
    /* Il suo `robots.txt` non dichiara sitemap, ma `/sitemap.xml` c'e' e
       contiene 442 negozi: e' il ripiego che `daSitemap` prova gia' da solo.
       Gli slug sono in prevalenza nomi di luogo — Peterborough, Trowbridge,
       Broadstairs — con qualche via e qualche «budgens-» davanti, che si toglie
       o la citta' diventa «Budgens Holt». */
    schema: /\/our-stores\/(?:budgens-)?([^/?#]+)\/?$/i,
  },
];

/** Lo specchio in memoria: evita di interrogare il database a ogni richiesta. */
const memoria = new Map<string, { negozi: Negozio[]; creatoIl: number }>();

interface RispostaLocator {
  data?: {
    warehouses?: Array<{
      warehouseId: number;
      name?: string;
      address?: {
        addressName?: string;
        address1?: string;
        city?: string;
        province?: string;
        postalcode?: string;
        latitude?: number;
        longitude?: number;
      };
    }>;
  };
}

/** Toglie il codice numerico che alcune insegne mettono davanti al nome. */
function nomePulito(grezzo: string): string {
  return grezzo.replace(/^\d+\s*-\s*/, "").trim();
}

/** Dal nome nell'indirizzo al nome di una citta': "san-martino" -> "San Martino". */
function cittaDaSlug(slug: string): string {
  return decodeURIComponent(slug)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w/g, (c) => c.toUpperCase());
}

/**
 * Penny e le altre che pubblicano un JSON loro.
 *
 * Ogni insegna scrive i campi a modo suo, quindi si cercano per nome invece di
 * pretendere una forma: `city`/`citta`, `zip`/`cap`, `street`/`indirizzo`.
 * Costa poco ed evita una riga di codice per insegna.
 */
async function daJson(ins: InsegnaConNegozi): Promise<Negozio[]> {
  const r = await fetch(ins.base + (ins.percorso ?? "/api/stores"), {
    signal: AbortSignal.timeout(20_000),
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!r.ok) return [];
  const j = JSON.parse(await r.text()) as unknown;
  const arr = Array.isArray(j)
    ? j
    : ((j as { stores?: unknown[]; data?: unknown[] })?.stores ??
       (j as { data?: unknown[] })?.data ??
       []);

  const fuori: Negozio[] = [];
  for (const g of arr as Array<Record<string, unknown>>) {
    const pos = (g.position ?? g.coordinates ?? {}) as { lat?: number; lng?: number; lon?: number };
    const citta = String(g.city ?? g.citta ?? g.comune ?? "");
    if (!citta) continue;
    fuori.push({
      insegna: ins.insegna,
      id: fuori.length,
      nome: `${ins.insegna} ${citta}`,
      indirizzo: String(g.street ?? g.indirizzo ?? g.address ?? ""),
      citta,
      provincia: String(g.province ?? g.provincia ?? g.prov ?? ""),
      cap: String(g.zip ?? g.cap ?? g.postalCode ?? ""),
      latitudine: typeof pos.lat === "number" ? pos.lat : undefined,
      longitudine: typeof pos.lng === "number" ? pos.lng : (typeof pos.lon === "number" ? pos.lon : undefined),
    });
  }
  return fuori;
}

/**
 * Chi il cercanegozi non lo espone, ma ha una scheda per punto vendita.
 *
 * Della scheda si legge solo l'INDIRIZZO, non il contenuto: da
 * `/punti-vendita/como.html` si ricava «Como», e basta a sapere che Carrefour
 * serve Como. La via non la sappiamo e non la si inventa — il campo resta
 * vuoto, e chi legge vede che manca.
 *
 * Aprire mille pagine per avere il civico costerebbe mille richieste al giorno
 * per un dato che alla domanda vera — quali insegne mi servono qui — non
 * aggiunge niente.
 */
async function daSitemap(ins: InsegnaConNegozi): Promise<Negozio[]> {
  if (!ins.schema) return [];
  const rb = await fetch(ins.base + "/robots.txt", {
    signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": UA },
  });
  const testo = rb.ok ? await rb.text() : "";
  const dichiarate = [...testo.matchAll(/^\s*Sitemap:\s*(\S+)/gim)].map((m) => m[1].trim());
  const candidate = dichiarate.length ? dichiarate : [ins.base + "/sitemap.xml"];

  /* PRIMA QUELLE CHE PARLANO DI NEGOZI, POI LE ALTRE — E NON SOLO LE PRIME TRE.
     Aldi UK dichiara quattro sitemap e quella dei punti vendita e' la QUARTA:
     `sitemap.xml`, `sitemap_categories.xml`, `sitemap_products.xml`,
     `sitemap_stores.xml`. Fermandosi a tre si scaricavano due cataloghi di
     prodotti per non trovare nessun negozio, e l'insegna risultava a zero
     mentre ne pubblica milleottocentoquarantaquattro.
     Riordinare costa niente e di solito fa bastare la prima richiesta. */
  const ordinate = [...candidate].sort(
    (a, b) =>
      (/negoz|punti|store|shop|branch|location/i.test(a) ? 0 : 1) -
      (/negoz|punti|store|shop|branch|location/i.test(b) ? 0 : 1),
  );

  const visti = new Map<string, Negozio>();
  for (const sm of ordinate.slice(0, 6)) {
    const x = await fetch(sm, { signal: AbortSignal.timeout(30_000), headers: { "User-Agent": UA } });
    if (!x.ok) continue;
    const xml = await x.text();
    const loc = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim());

    const dentro: string[] = [];
    if (/<sitemapindex/i.test(xml)) {
      for (const f of loc.filter((l) => /negoz|punti|store/i.test(l)).slice(0, 4)) {
        const y = await fetch(f, { signal: AbortSignal.timeout(30_000), headers: { "User-Agent": UA } });
        if (!y.ok) continue;
        const yx = await y.text();
        dentro.push(...[...yx.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim()));
      }
    } else {
      dentro.push(...loc);
    }

    for (const u of dentro) {
      /* Si toglie la query PRIMA di riconoscere l'indirizzo.
         Unicoop Firenze scrive `/negozi/serre-di-rapolano?id=003452`, e uno
         schema che pretende la fine della stringa dopo il nome non combacia
         mai: l'insegna dava zero negozi mentre la sua sitemap ne elencava
         centosessanta. Vale per tutte, non solo per lei. */
      const pulito = u.split(/[?#]/)[0];
      const m = pulito.match(ins.schema);
      if (!m) continue;
      const citta = cittaDaSlug(m[1]);
      if (!citta || visti.has(u)) continue;
      visti.set(u, {
        insegna: ins.insegna,
        id: visti.size,
        nome: `${ins.insegna} ${citta}`,
        indirizzo: "",
        citta,
        provincia: "",
        cap: "",
      });
    }
    /* CENTO ERANO POCHI, E IL TETTO SI VEDEVA SOLO A CONTARE.
       Il taglio scatta dopo aver finito un file, quindi non tronca a meta': si
       ferma appena UN file ha gia' portato oltre cento negozi, e gli altri non
       si aprono. Va bene per un'insegna italiana di provincia, non per Lidl UK,
       che di punti vendita ne pubblica millequarantaquattro.
       Tremila e' abbondante per qualunque insegna nazionale e continua a
       fermare una sitemap malformata prima che riempia la memoria. */
    if (visti.size > 3000) break;
  }
  return [...visti.values()];
}

async function scarica(ins: InsegnaConNegozi): Promise<Negozio[]> {
  try {
    if (ins.via === "json") return await daJson(ins);
    if (ins.via === "sitemap") return await daSitemap(ins);
    const r = await fetch(`${ins.base}/ebsn/api/warehouse-locator/search`, {
      // Venti secondi: l'elenco e' grosso ma si scarica una volta al giorno,
      // non a ogni richiesta.
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": UA, Accept: "application/json", "X-Ebsn-Client": "site" },
    });
    if (!r.ok) return [];
    const j = JSON.parse((await r.text()).replace(/^\s+/, "")) as RispostaLocator;
    const fuori: Negozio[] = [];
    for (const w of j.data?.warehouses ?? []) {
      const a = w.address ?? {};
      fuori.push({
        insegna: ins.insegna,
        id: w.warehouseId,
        nome: nomePulito(String(w.name ?? a.addressName ?? "")),
        indirizzo: a.address1 ?? "",
        citta: a.city ?? "",
        provincia: a.province ?? "",
        cap: a.postalcode ?? "",
        latitudine: a.latitude,
        longitudine: a.longitude,
      });
    }
    return fuori;
  } catch {
    // Un cercanegozi che non risponde non deve togliere gli altri.
    return [];
  }
}

/**
 * I punti vendita di un'insegna, cercati in memoria, poi su database, poi sul
 * sito del negozio — in quest'ordine, e per un motivo preciso.
 *
 * PERCHE' NON BASTA LA MEMORIA
 * ----------------------------
 * Perche' la memoria muore col processo, e su Render il piano gratuito spegne
 * il servizio dopo quindici minuti di silenzio. Tenendo l'elenco solo in
 * memoria succedono tre cose, tutte sbagliate: il primo utente dopo ogni pausa
 * aspetta il riscaricamento, i siti dei negozi vengono interrogati decine di
 * volte al giorno per un dato che cambia una volta ogni tanto, e la fatica di
 * costruirlo si butta via a ogni risveglio.
 *
 * Su database l'elenco sopravvive ai riavvii e si riscarica una volta al
 * giorno davvero, non una volta per risveglio. Senza database si continua come
 * prima: nessuno resta senza risposta, si paga solo di piu' in attesa.
 */
const CHIAVE = (insegna: string) => `negozi:${insegna}`;

export async function negoziDi(ins: InsegnaConNegozi): Promise<Negozio[]> {
  const buono = memoria.get(ins.insegna);
  if (buono && Date.now() - buono.creatoIl < SCADENZA_MS) return buono.negozi;

  if (isDbConfigured()) {
    try {
      const salvato = await (await cache()).findOne({ _id: CHIAVE(ins.insegna) });
      if (salvato) {
        const negozi = salvato.value as Negozio[];
        memoria.set(ins.insegna, { negozi, creatoIl: Date.now() });
        console.info(`[negozi] ${ins.insegna}: ${negozi.length} dal database`);
        return negozi;
      }
    } catch (err) {
      // Un database irraggiungibile non deve togliere i negozi: si scarica.
      console.warn("[negozi] lettura dal database fallita, scarico:", err);
    }
  }

  const negozi = await scarica(ins);
  if (negozi.length) console.info(`[negozi] ${ins.insegna}: ${negozi.length} punti vendita`);
  memoria.set(ins.insegna, { negozi, creatoIl: Date.now() });

  if (negozi.length && isDbConfigured()) {
    try {
      await (await cache()).replaceOne(
        { _id: CHIAVE(ins.insegna) },
        {
          value: negozi,
          createdAt: new Date(),
          // Mongo cancella da solo alla scadenza: nessuna pulizia da ricordarsi.
          expiresAt: new Date(Date.now() + SCADENZA_MS),
        },
        { upsert: true },
      );
    } catch (err) {
      console.warn("[negozi] salvataggio non riuscito, resta in memoria:", err);
    }
  }
  return negozi;
}

/** Tutti i punti vendita di un paese, di tutte le insegne che sappiamo leggere. */
export async function tuttiINegozi(paeseIso: string): Promise<Negozio[]> {
  const iso = (paeseIso || "IT").toUpperCase().slice(0, 2);
  const insegne = INSEGNE_CON_NEGOZI.filter((i) => i.paese === iso);
  const liste = await Promise.all(insegne.map(negoziDi));
  return liste.flat();
}

/** Confronta due nomi di citta' ignorando accenti e maiuscole. */
function stessaCitta(a: string, b: string): boolean {
  const n = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const x = n(a);
  const y = n(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

export interface NegoziPerCitta {
  citta: string;
  /** Le insegne che hanno almeno un negozio li': sono quelle di cui ha senso
   *  mostrare i prezzi a chi sta in quella citta'. */
  insegne: string[];
  negozi: Negozio[];
}

/**
 * I punti vendita in una citta', e quali insegne la servono.
 *
 * L'elenco delle insegne e' la parte che conta per i prezzi: dice quali
 * listini hanno senso per chi sta li' e quali no.
 */
export async function negoziInCitta(paeseIso: string, citta: string): Promise<NegoziPerCitta> {
  const tutti = await tuttiINegozi(paeseIso);
  const negozi = citta ? tutti.filter((n) => stessaCitta(n.citta, citta)) : [];
  const insegne = [...new Set(negozi.map((n) => n.insegna))];
  return { citta, insegne, negozi };
}

/** Quanti punti vendita conosciamo, per insegna. Serve allo stato dell'API. */
export async function statoNegozi(paeseIso = "IT"): Promise<{
  paese: string;
  insegne: Array<{ insegna: string; negozi: number }>;
  totale: number;
}> {
  const iso = (paeseIso || "IT").toUpperCase().slice(0, 2);
  const insegne = INSEGNE_CON_NEGOZI.filter((i) => i.paese === iso);
  const righe = await Promise.all(
    insegne.map(async (i) => ({ insegna: i.insegna, negozi: (await negoziDi(i)).length })),
  );
  return {
    paese: iso,
    insegne: righe.sort((a, b) => b.negozi - a.negozi),
    totale: righe.reduce((s, r) => s + r.negozi, 0),
  };
}
