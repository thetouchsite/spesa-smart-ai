/**
 * Da dove si scarica il catalogo dei prodotti, paese per paese.
 *
 * COSA SONO QUESTI INDIRIZZI
 * --------------------------
 * Sono le sitemap che i supermercati pubblicano da soli, per farsi trovare dai
 * motori di ricerca. Dentro c'e' l'elenco completo delle loro schede prodotto:
 * indirizzi VERI, scritti dal negozio, che non possono essere sbagliati.
 *
 * E' la differenza con la strada di prima. Finora l'indirizzo della scheda lo
 * chiedevamo al modello, che quando non lo sa se lo inventa — Cortilia 0
 * pagine aperte su 12, Eataly 0 su 4, tutti 404. Qui non c'e' niente da
 * indovinare: il modello sceglie fra prodotti che esistono.
 *
 * COME SONO STATI TROVATI
 * -----------------------
 * `scripts/prova-sitemap.mjs` ha esaminato 136 insegne in 62 paesi: legge il
 * `robots.txt`, segue le sitemap dichiarate, scende negli indici e guarda che
 * aspetto hanno gli indirizzi dentro. Queste sono quelle che hanno prodotti
 * VERI e che il `robots.txt` non vieta.
 *
 * TRE NON CI SONO, E MANCANO APPOSTA. Walmart Messico (94.399 prodotti),
 * Carrefour Emirati (19.446) e Walmart USA pubblicano il catalogo ma vietano
 * le schede prodotto ai programmi automatici. Il catalogo c'e', dicono di non
 * toccarlo, e non si tocca.
 *
 * IL GIAPPONE NON C'E' PERCHE' NON SI PUO'. Rakuten, LOHACO e Ito-Yokado non
 * lasciano leggere nemmeno il `robots.txt`; Aeon non ha sitemap. E' anche il
 * mercato dove il modello andava peggio: li' resta la strada vecchia.
 *
 * Rigenerato da `node scripts/prova-sitemap.mjs` piu' questo script.
 */

export interface FonteCatalogo {
  /** ISO 3166-1 alpha-2, maiuscolo. */
  paese: string;
  insegna: string;
  dominio: string;
  /** La sitemap che ha funzionato. */
  sitemap: string;
  /** Quanti prodotti ci ha trovato la scansione: serve a dimensionare, non e' una promessa. */
  stimati: number;
}

/**
 * Molte sitemap sono spezzate in piu' file: `...part1.xml`, `...-0.xml`,
 * `product1.xml`. Prendendo solo il primo si perde la maggior parte del
 * catalogo — Alcampo dichiara 86.773 prodotti ma il primo file ne ha una
 * frazione.
 *
 * Questa funzione genera i nomi dei file successivi, che poi si provano finche'
 * rispondono. Non si indovina quanti siano: si va avanti finche' c'e'.
 */
export function partiSuccessive(sitemap: string, quante = 30): string[] {
  const schemi: Array<[RegExp, (n: number) => string]> = [
    [/part(\d+)(\.xml)/i, (n) => `part${n}$2`],
    [/-(\d+)(\.xml)/i, (n) => `-${n}$2`],
    [/_(\d+)(\.xml)/i, (n) => `_${n}$2`],
    [/(\d+)(\.xml)/i, (n) => `${n}$2`],
  ];
  for (const [schema, fai] of schemi) {
    const m = schema.exec(sitemap);
    if (!m) continue;
    const primo = Number(m[1]);
    const fuori: string[] = [];
    for (let i = 1; i <= quante; i++) {
      fuori.push(sitemap.replace(schema, fai(primo + i)));
    }
    return fuori;
  }
  return [];
}

export const FONTI: FonteCatalogo[] = [
  { paese: "AL", insegna: "SPAR Albania Online", dominio: "shop.spar.al", sitemap: "https://shop.spar.al/wp-sitemap-posts-product-1.xml", stimati: 2000 },
  { paese: "AR", insegna: "Carrefour Argentina", dominio: "www.carrefour.com.ar", sitemap: "https://www.carrefour.com.ar/sitemap/product-0.xml", stimati: 422 },
  { paese: "AT", insegna: "BILLA Online Shop", dominio: "shop.billa.at", sitemap: "https://shop.billa.at/sitemap.xml", stimati: 12330 },
  { paese: "BE", insegna: "Delhaize Online", dominio: "delhaize.be", sitemap: "https://www.delhaize.be/sitemap/delhaizesitemap-0.xml.gz", stimati: 14668 },
  { paese: "BG", insegna: "eBag", dominio: "ebag.bg", sitemap: "https://www.ebag.bg/en/sitemap_products_en.xml", stimati: 34778 },
  { paese: "CA", insegna: "Voila by Sobeys", dominio: "voila.ca", sitemap: "https://voila.ca/sitemaps/sitemap-products-part1.xml", stimati: 72010 },
  { paese: "DE", insegna: "flaschenpost Supermarkt", dominio: "flaschenpost.de", sitemap: "https://www.flaschenpost.de/sitemap_p.xml", stimati: 4154 },
  { paese: "DK", insegna: "BilkaToGo", dominio: "bilkatogo.dk", sitemap: "https://www.bilkatogo.dk/sitemap-products.xml", stimati: 37087 },
  { paese: "DK", insegna: "Nemlig.com", dominio: "nemlig.com", sitemap: "https://www.nemlig.com/googleproductsitemap", stimati: 4046 },
  { paese: "ES", insegna: "Alcampo Online", dominio: "compraonline.alcampo.es", sitemap: "https://www.compraonline.alcampo.es/sitemaps/sitemap-products-part1.xml", stimati: 86773 },
  { paese: "ES", insegna: "Mercadona Online", dominio: "tienda.mercadona.es", sitemap: "https://tienda.mercadona.es/sitemap.xml", stimati: 4320 },
  { paese: "GB", insegna: "Morrisons Groceries", dominio: "groceries.morrisons.com", sitemap: "https://groceries.morrisons.com/sitemaps/sitemap-products-part1.xml", stimati: 31023 },
  { paese: "GB", insegna: "Waitrose", dominio: "waitrose.com", sitemap: "https://www.waitrose.com/sitemaps/products_sitemap_0.xml", stimati: 18182 },
  { paese: "HR", insegna: "Konzum Online", dominio: "konzum.hr", sitemap: "https://www.konzum.hr/sitemap_products.xml", stimati: 11153 },
  { paese: "HU", insegna: "Auchan Online", dominio: "auchan.hu", sitemap: "https://auchan.hu/sitemaps/product-sitemap-0.xml", stimati: 52 },
  { paese: "IE", insegna: "SuperValu Online", dominio: "shop.supervalu.ie", sitemap: "https://shop.supervalu.ie/sitemap.xml", stimati: 11807 },
  { paese: "IN", insegna: "JioMart", dominio: "www.jiomart.com", sitemap: "https://www.jiomart.com/sitemap/custom.sitemap.xml", stimati: 846 },
  { paese: "IT", insegna: "Carrefour Italia", dominio: "carrefour.it", sitemap: "https://www.carrefour.it/sitemap_0-product.xml", stimati: 26728 },
  { paese: "IT", insegna: "Esselunga a Casa", dominio: "spesaonline.esselunga.it", sitemap: "https://spesaonline.esselunga.it/sitemap_product.xml", stimati: 17709 },
  // NON l'indirizzo firmato della sitemap figlia: contiene un token che il
  // sito ruota, e il giorno che ruota la fonte muore in silenzio. Dall'indice.
  { paese: "IT", insegna: "Unes", dominio: "spesaonline.unes.it", sitemap: "https://www.spesaonline.unes.it/sitemap.xml", stimati: 15363 },
  // Dall'INDICE, non da una figlia sola: `sitemap-1-1.xml` e' meta' catalogo,
  // l'altra meta' sta in `sitemap-1-2.xml`. Verificato: 6.633 -> 13.301.
  { paese: "IT", insegna: "Coop", dominio: "easycoop.com", sitemap: "https://www.easycoop.com/sitemap/sitemap.xml", stimati: 13301 },
  { paese: "IT", insegna: "Cortilia", dominio: "cortilia.it", sitemap: "https://www.cortilia.it/sitemap.xml", stimati: 6536 },
  { paese: "IT", insegna: "Tigros", dominio: "tigros.it", sitemap: "https://www.tigros.it/product1.xml", stimati: 4500 },
  { paese: "IT", insegna: "CoopShop", dominio: "coopshop.it", sitemap: "https://www.coopshop.it/sitemap/product_0.xml", stimati: 2999 },
  { paese: "IT", insegna: "Iperal Spesa Online", dominio: "iperalspesaonline.it", sitemap: "https://www.iperalspesaonline.it/product1.xml", stimati: 1500 },

  /* AGGIUNTE DOPO AVERLE APERTE UNA PER UNA.
     Quattro insegne che pubblicano il catalogo E il prezzo leggibile dal
     server, e che mancavano. Il negozio sta su un dominio diverso da quello
     dell'insegna — `spesaonline.conad.it`, non `conad.it` — ed e' il motivo
     per cui non si trovavano cercando dal sito principale. */
  { paese: "IT", insegna: "Bennet", dominio: "bennet.com", sitemap: "https://www.bennet.com/sitemap.xml", stimati: 20446 },
  { paese: "IT", insegna: "Unicoop Tirreno", dominio: "coopacasa.coopetruria.coop.it", sitemap: "https://coopacasa.coopetruria.coop.it/sitemap_index.xml", stimati: 10230 },
  { paese: "IT", insegna: "Conad", dominio: "spesaonline.conad.it", sitemap: "https://spesaonline.conad.it/sitemap/products.xml", stimati: 5026 },
  { paese: "IT", insegna: "Aldi", dominio: "aldi.it", sitemap: "https://www.aldi.it/sitemap_products.xml", stimati: 678 },
  { paese: "KR", insegna: "Emart Mall", dominio: "emart.ssg.com", sitemap: "https://emart.ssg.com/sitemap/best.xml", stimati: 498 },
  { paese: "LT", insegna: "LastMile", dominio: "lastmile.lt", sitemap: "https://www.lastmile.lt/sitemap-1.xml", stimati: 20000 },
  { paese: "PL", insegna: "Auchan Zakupy", dominio: "zakupy.auchan.pl", sitemap: "https://zakupy.auchan.pl/sitemaps/sitemap-products-part1.xml", stimati: 24140 },
  { paese: "PT", insegna: "Auchan Portugal", dominio: "auchan.pt", sitemap: "https://www.auchan.pt/sitemap_0-product.xml", stimati: 79274 },
  { paese: "RO", insegna: "Freshful", dominio: "freshful.ro", sitemap: "https://www.freshful.ro/sitemap/products.xml", stimati: 46413 },
  { paese: "RS", insegna: "IDEA Online", dominio: "online.idea.rs", sitemap: "https://online.idea.rs/sitemap.xml", stimati: 10762 },
  { paese: "RS", insegna: "Maxi Online", dominio: "maxi.rs", sitemap: "https://www.maxi.rs/sitemap/delhaizesitemap-0.xml.gz", stimati: 9955 },
  { paese: "SE", insegna: "ICA Handla Online", dominio: "ica.se", sitemap: "https://www.ica.se/sitemap/inspiration/", stimati: 1876 },
  { paese: "US", insegna: "Kroger", dominio: "www.kroger.com", sitemap: "https://www.kroger.com/pdp-sitemap/kroger-product-details-sitemap-1.xml", stimati: 40923 },
  { paese: "ZA", insegna: "Checkers Sixty60", dominio: "www.checkers.co.za", sitemap: "https://www.checkers.co.za/api/sitemaps/seq_product-sitemap_00.xml", stimati: 98424 },
];

/** I paesi per cui abbiamo almeno una fonte. */
export function paesiConCatalogo(): string[] {
  return [...new Set(FONTI.map((f) => f.paese))].sort();
}

/** Le fonti di un paese, dalla piu' ricca alla piu' magra. */
export function fontiDi(paese: string): FonteCatalogo[] {
  const cc = (paese || "").toUpperCase().slice(0, 2);
  return FONTI.filter((f) => f.paese === cc).sort((a, b) => b.stimati - a.stimati);
}
