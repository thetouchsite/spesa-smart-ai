/* ═══════════════════════════════════════════════════════════════════════════
   QUEL CHE LA PAGINA DICHIARA OLTRE AL PREZZO

   Fino a ieri questa pagina si apriva, se ne prendevano prezzo e nome, e il
   resto si buttava. Mezzo milione di volte al giorno.

   Sondate dodici insegne in otto paesi — Carrefour, Bennet, Coop, Morrisons,
   Sainsbury's, Lidl, Rimi, Continente, Planeta Huerto, Freshful, eBag, Tommy —
   il conto e' questo:

     JSON-LD        12 su 12      marca        12 su 12
     immagine       12 su 12      SKU          12 su 12
     disponibilita' 11 su 12      briciole      9 su 12
     categoria       7 su 12      GTIN          3 su 12

   Non e' roba da andare a prendere: e' roba che abbiamo gia' in mano.
   `porzioneConPrezzi()` tiene fino a 400 KB di pagina PROPRIO perche' i
   blocchi `ld+json` stiano dentro — e' stata scritta cosi' per il prezzo di
   Coop, che comincia al byte 838.000. Gli stessi byte portano anche questo.

   Nessuna richiesta in piu'. Nessun codice per insegna.

   PERCHE' SI PROVA A LEGGERE IL JSON E POI SI RIPIEGA SULLE ESPRESSIONI
   --------------------------------------------------------------------
   Perche' `porzioneConPrezzi` taglia, e un blocco tagliato a meta' non si apre
   piu'. Quando capita, le espressioni pescano lo stesso i singoli campi dal
   frammento: meglio una marca senza categoria che niente.

   COSA NON C'E' QUI, DI PROPOSITO
   -------------------------------
   La descrizione del prodotto. Un nome e' funzionale; tre paragrafi di testo
   promozionale sono scritti da qualcuno, ed e' la parte del dataset che meno
   somiglia a un dato e piu' a contenuto altrui. Costa poco lasciarla fuori.

   E dell'immagine si prende l'INDIRIZZO, mai i byte. Un prezzo e' un fatto e i
   fatti non hanno un autore; una fotografia di prodotto e' un'opera con un
   titolare, e copiarla e' riproduzione.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Quel che la pagina dichiara di se', oltre al prezzo. */
export interface SchedaPagina {
  /** La marca, come la scrive il negozio. */
  marca?: string;
  /** Il codice interno del negozio. Non e' un EAN: non attraversa le insegne. */
  sku?: string;
  /** L'INDIRIZZO dell'immagine. Mai i byte. */
  immagine?: string;
  /** 0 ignota, 1 disponibile, 2 esaurita, 3 scorte limitate. */
  disponibilita?: 0 | 1 | 2 | 3;
  /** Il percorso di categoria come lo scrive il negozio, non normalizzato. */
  categoria?: string;
  /** Da dove viene la maggior parte: `jsonld`, `og`, `misto`. */
  fonte?: string;
}

/** I blocchi `application/ld+json` di una pagina, aperti quando si aprono. */
function blocchiStrutturati(html: string): unknown[] {
  const fuori: unknown[] = [];
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  let quanti = 0;
  while ((m = re.exec(html)) !== null && quanti < 12) {
    quanti++;
    const testo = m[1].trim();
    /* UN TETTO ALLA DIMENSIONE, PERCHE' QUI ARRIVA LA PAGINA INTERA.
       Le pagine da due megabyte esistono — Sainsbury's ne fa 2,3 e Coop 2,2 —
       e un blocco enorme costerebbe piu' ad aprirlo di quanto vale. Mezzo
       megabyte tiene dentro qualunque scheda prodotto vista finora. */
    if (!testo || testo.length > 512_000) continue;
    try {
      fuori.push(JSON.parse(testo));
    } catch {
      /* Tagliato a meta' da `porzioneConPrezzi`, oppure scritto male: si
         lascia perdere questo blocco e si va avanti. Le espressioni piu'
         sotto recuperano quel che possono dal frammento. */
    }
  }
  return fuori;
}

/** Scende dentro array e `@graph` finche' non trova il nodo del prodotto. */
function trovaProdotto(nodo: unknown, profondita = 0): Record<string, unknown> | null {
  if (!nodo || profondita > 6) return null;

  if (Array.isArray(nodo)) {
    for (const n of nodo) {
      const t = trovaProdotto(n, profondita + 1);
      if (t) return t;
    }
    return null;
  }

  if (typeof nodo !== "object") return null;
  const o = nodo as Record<string, unknown>;

  const tipo = o["@type"];
  const tipi = Array.isArray(tipo) ? tipo : [tipo];
  if (tipi.some((t) => typeof t === "string" && /product/i.test(t))) return o;

  if (o["@graph"]) return trovaProdotto(o["@graph"], profondita + 1);
  return null;
}

/** Il primo `BreadcrumbList` che si trova, per il percorso di categoria. */
function trovaBriciole(nodo: unknown, profondita = 0): Record<string, unknown> | null {
  if (!nodo || profondita > 6) return null;
  if (Array.isArray(nodo)) {
    for (const n of nodo) {
      const t = trovaBriciole(n, profondita + 1);
      if (t) return t;
    }
    return null;
  }
  if (typeof nodo !== "object") return null;
  const o = nodo as Record<string, unknown>;
  const tipo = o["@type"];
  const tipi = Array.isArray(tipo) ? tipo : [tipo];
  if (tipi.some((t) => typeof t === "string" && /breadcrumblist/i.test(t))) return o;
  if (o["@graph"]) return trovaBriciole(o["@graph"], profondita + 1);
  return null;
}

/**
 * Una stringa da un campo che puo' essere scritto in quattro modi.
 *
 * `brand` e' a volte una stringa, a volte `{name}`, a volte `{"@type":"Brand",
 * "name":...}`, a volte un elenco. Lo stesso vale per `image` e `category`.
 * Provarli tutti costa nulla; darne per scontato uno fa perdere l'insegna.
 */
function stringaDa(v: unknown, chiave = "name"): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) {
    for (const x of v) {
      const s = stringaDa(x, chiave);
      if (s) return s;
    }
    return undefined;
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return stringaDa(o[chiave] ?? o.url ?? o["@id"] ?? o.value, chiave);
  }
  return undefined;
}

/** Le parole di schema.org sulla disponibilita', ridotte a un numero. */
function disponibilitaDa(v: unknown): 0 | 1 | 2 | 3 | undefined {
  const s = stringaDa(v);
  if (!s) return undefined;
  const b = s.toLowerCase();
  if (/limitedavailability|limited_availability/.test(b)) return 3;
  if (/outofstock|out_of_stock|soldout|sold_out|discontinued/.test(b)) return 2;
  if (/instock|in_stock|instoreonly|onlineonly|preorder|backorder|presale/.test(b)) return 1;
  return undefined;
}

/** Il percorso delle briciole di pane: «Bevande > Bibite > Cola». */
function percorsoDa(briciole: Record<string, unknown> | null): string | undefined {
  if (!briciole) return undefined;
  const voci = briciole.itemListElement;
  if (!Array.isArray(voci)) return undefined;
  const nomi: string[] = [];
  for (const v of voci) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const n = stringaDa(o.name) ?? stringaDa(o.item);
    if (n && n.length < 60) nomi.push(n);
  }
  /* La prima briciola e' quasi sempre «Home» o il nome del negozio, e l'ultima
     e' il prodotto stesso: nessuna delle due e' una categoria. Si tengono
     quelle in mezzo, e se ne restano meno di una non vale la pena scrivere. */
  const utili = nomi.slice(1, -1);
  if (utili.length === 0) return undefined;
  return utili.join(" > ").slice(0, 200);
}

/** Meta di OpenGraph, quando i dati strutturati non bastano. */
function metaOg(html: string, nome: string): string | undefined {
  const re = new RegExp(
    '<meta[^>]+(?:property|name)\\s*=\\s*["\']' + nome + '["\'][^>]*>',
    "i",
  );
  const tag = re.exec(html)?.[0];
  if (!tag) return undefined;
  const c = /content\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
  return c?.trim() || undefined;
}

/** Un campo singolo pescato da un frammento che non si e' potuto aprire. */
function campoGrezzo(html: string, nome: string): string | undefined {
  const re = new RegExp('"' + nome + '"\\s*:\\s*"([^"\\\\]{1,200})"', "i");
  return re.exec(html)?.[1]?.trim() || undefined;
}

/**
 * Legge dalla pagina quel che non e' il prezzo.
 *
 * Restituisce `undefined` solo quando non c'e' proprio niente: un campo solo
 * vale la pena tenerlo, perche' la scheda si completa alla lettura dopo.
 *
 * SI LAVORA SULLA FETTA, NON SULLA PAGINA INTERA, ED E' STATO MISURATO.
 * L'ipotesi era che le briciole di pane cadessero fuori dalla fetta che
 * `porzioneConPrezzi` ritaglia, e che passando il corpo intero la categoria
 * salisse da 6 insegne su 12 a 9. Provato: resta 6. Le altre tre scrivono le
 * briciole in microdati dentro l'HTML, non in un blocco `ld+json`, e li' un
 * lettore di JSON non arriva comunque.
 *
 * Quindi la pagina intera costava qualche millisecondo per pagina — mezzo
 * milione di volte al giorno — e non portava niente. Il 9 su 12 dell'audit
 * contava la PAROLA `BreadcrumbList` ovunque comparisse: il 6 su 12 e' quante
 * volte si riesce davvero a leggerla.
 */
export function schedaDallaPagina(html: string): SchedaPagina | undefined {
  const s: SchedaPagina = {};
  let daJson = 0;

  const blocchi = blocchiStrutturati(html);
  let prodotto: Record<string, unknown> | null = null;
  let briciole: Record<string, unknown> | null = null;
  for (const b of blocchi) {
    prodotto = prodotto ?? trovaProdotto(b);
    briciole = briciole ?? trovaBriciole(b);
  }

  if (prodotto) {
    const marca = stringaDa(prodotto.brand) ?? stringaDa(prodotto.manufacturer);
    if (marca && marca.length <= 80) { s.marca = marca; daJson++; }

    const sku = stringaDa(prodotto.sku) ?? stringaDa(prodotto.productID) ?? stringaDa(prodotto.mpn);
    if (sku && sku.length <= 64) { s.sku = sku; daJson++; }

    const img = stringaDa(prodotto.image, "url");
    if (img && /^https?:/i.test(img)) { s.immagine = img.slice(0, 500); daJson++; }

    const offerte = prodotto.offers;
    const d = disponibilitaDa(
      offerte && typeof offerte === "object"
        ? (Array.isArray(offerte) ? offerte[0] : offerte) &&
          ((Array.isArray(offerte) ? offerte[0] : offerte) as Record<string, unknown>).availability
        : undefined,
    );
    if (d !== undefined) { s.disponibilita = d; daJson++; }

    const cat = stringaDa(prodotto.category);
    if (cat && cat.length <= 200) { s.categoria = cat; daJson++; }
  }

  /* Le briciole battono `category` quando ci sono tutte e due: un percorso
     dice piu' di una parola sola, ed e' quel che servira' alla tassonomia. */
  const percorso = percorsoDa(briciole);
  if (percorso) { s.categoria = percorso; daJson++; }

  /* RIPIEGHI, quando il blocco era tagliato o il campo non c'era. */
  let daOg = 0;
  if (!s.immagine) {
    const og = metaOg(html, "og:image");
    if (og && /^https?:/i.test(og)) { s.immagine = og.slice(0, 500); daOg++; }
  }
  if (!s.marca) {
    const og = metaOg(html, "product:brand") ?? metaOg(html, "og:brand");
    if (og && og.length <= 80) { s.marca = og; daOg++; }
  }
  if (!s.marca) {
    const g = campoGrezzo(html, "brand");
    if (g && g.length <= 80) { s.marca = g; daOg++; }
  }
  if (!s.sku) {
    const g = campoGrezzo(html, "sku");
    if (g && g.length <= 64) { s.sku = g; daOg++; }
  }

  if (daJson === 0 && daOg === 0) return undefined;
  s.fonte = daJson > 0 && daOg > 0 ? "misto" : daJson > 0 ? "jsonld" : "og";
  return s;
}
