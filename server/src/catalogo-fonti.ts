/**
 * Da dove viene il catalogo: una riga per insegna.
 *
 * Generato da `scripts/aggiorna-fonti.mjs` — non si scrive a mano, si
 * rigenera dopo una passata di raccolta.
 *
 * 144 insegne · 38 paesi · 2.675.799 prodotti
 *
 * I NUMERI SONO CONTATI, NON STIMATI
 * ----------------------------------
 * `stimati` e' quanti indirizzi di prodotto quell'insegna pubblica davvero,
 * contati uno per uno scendendo in tutto l'albero delle sitemap. La versione
 * precedente campionava e moltiplicava, e sbagliava di molto: Mercator
 * risultava con 336 prodotti e ne ha 17.241.
 *
 * LA RESA E' LA COSA PIU' IMPORTANTE DI QUESTO FILE
 * -------------------------------------------------
 * `resa` e' la quota di schede che il prezzo lo dichiara, misurata aprendone
 * trenta per insegna. Serve a decidere chi provare per primo, e non e' un
 * dettaglio: in Spagna, aggiungendo quattro catene, le voci con prezzo erano
 * SCESE da quattro a una su nove, perche' i candidati si concentravano sulle
 * insegne mute. Un catalogo grande non e' un catalogo utile.
 *
 * CHI NON C'E'
 * ------------
 * Chi nel `robots.txt` vieta le schede prodotto — Tesco, Sainsbury's, Lidl
 * Spagna e Polonia, Pingo Doce, Ahorramas, Hipercor, Walmart. E i generalisti
 * tipo Galaxus: hanno milioni di prodotti e non sono roba da mangiare.
 */

export interface FonteCatalogo {
  /** Sigla del paese, due lettere. */
  paese: string;
  insegna: string;
  dominio: string;
  /** La radice da cui parte la scansione: puo' essere un indice di sitemap. */
  sitemap: string;
  /**
   * Quota di schede che espongono il prezzo, da 0 a 1.
   *
   * Misurata su trenta schede sparse per il catalogo. Decide l'ordine in cui
   * si provano le insegne quando una voce della lista ha piu' candidati.
   */
  resa: number;
  /** Indirizzi di prodotto pubblicati, contati. */
  stimati: number;
}

export const FONTI: FonteCatalogo[] = [
  { paese: "AL", insegna: "SPAR Albania Online", dominio: "shop.spar.al", sitemap: "https://shop.spar.al/wp-sitemap.xml", resa: 0.73, stimati: 2000 },
  { paese: "AL", insegna: "Spar Albania", dominio: "shop.spar.al", sitemap: "https://shop.spar.al/wp-sitemap.xml", resa: 0.73, stimati: 2000 },

  { paese: "AR", insegna: "Carrefour Argentina", dominio: "www.carrefour.com.ar", sitemap: "https://www.carrefour.com.ar/sitemap/product-0.xml", resa: 0.5, stimati: 422 },

  { paese: "AT", insegna: "Interspar", dominio: "www.interspar.at", sitemap: "https://www.interspar.at/shop/lebensmittel/sitemap.xml", resa: 0, stimati: 22489 },
  { paese: "AT", insegna: "Bipa", dominio: "www.bipa.at", sitemap: "https://www.bipa.at/main-sitemap.xml", resa: 1, stimati: 15317 },
  { paese: "AT", insegna: "dm Austria", dominio: "www.dm.at", sitemap: "https://www.dm.at/sitemap.xml", resa: 0, stimati: 13577 },
  { paese: "AT", insegna: "MPreis", dominio: "www.mpreis.at", sitemap: "https://www.mpreis.at/sitemap.xml", resa: 0.97, stimati: 12793 },
  { paese: "AT", insegna: "BILLA Online Shop", dominio: "shop.billa.at", sitemap: "https://shop.billa.at/sitemap.xml", resa: 1, stimati: 12536 },
  { paese: "AT", insegna: "BILLA", dominio: "shop.billa.at", sitemap: "https://shop.billa.at/sitemap.xml", resa: 1, stimati: 12536 },
  { paese: "AT", insegna: "Hofer", dominio: "www.hofer.at", sitemap: "https://www.hofer.at/sitemap_products.xml", resa: 0.9, stimati: 1157 },

  { paese: "BA", insegna: "Glovo Sarajevo - Spesa", dominio: "glovoapp.com", sitemap: "https://glovoapp.com/sitemap-index.xml", resa: 0, stimati: 373 },

  { paese: "BE", insegna: "Delhaize Online", dominio: "www.delhaize.be", sitemap: "https://www.delhaize.be/sitemap/delhaizesitemap-0.xml.gz", resa: 0, stimati: 14668 },
  { paese: "BE", insegna: "Delhaize", dominio: "www.delhaize.be", sitemap: "https://www.delhaize.be/sitemap/delhaizesitemapindex.xml", resa: 0, stimati: 14668 },
  { paese: "BE", insegna: "Okay", dominio: "www.okay.be", sitemap: "https://www.okay.be/sitemap.xml", resa: 0, stimati: 8126 },
  { paese: "BE", insegna: "Intermarché BE", dominio: "www.intermarche.be", sitemap: "https://www.intermarche.be/sitemap_index.xml", resa: 0, stimati: 214 },

  { paese: "BG", insegna: "eBag", dominio: "www.ebag.bg", sitemap: "https://www.ebag.bg/sitemap.xml", resa: 1, stimati: 34412 },
  { paese: "BG", insegna: "Lidl BG", dominio: "www.lidl.bg", sitemap: "https://www.lidl.bg/static/sitemap.xml", resa: 1, stimati: 683 },

  { paese: "BR", insegna: "Carrefour Brasil", dominio: "mercado.carrefour.com.br", sitemap: "https://mercado.carrefour.com.br/sitemap.xml", resa: 0.5, stimati: 80000 },

  { paese: "CA", insegna: "Voila by Sobeys", dominio: "voila.ca", sitemap: "https://voila.ca/sitemaps/sitemap-products-part1.xml", resa: 0, stimati: 50000 },

  { paese: "CH", insegna: "Lidl Svizzera", dominio: "www.lidl.ch", sitemap: "https://www.lidl.ch/static/sitemap.xml", resa: 1, stimati: 678 },

  { paese: "CZ", insegna: "Billa CZ", dominio: "www.billa.cz", sitemap: "https://www.billa.cz/sitemap.xml", resa: 1, stimati: 13303 },

  { paese: "DE", insegna: "Müller", dominio: "www.mueller.de", sitemap: "https://www.mueller.de/sitemaps/sitemap.xml", resa: 0, stimati: 70589 },
  { paese: "DE", insegna: "Rossmann", dominio: "www.rossmann.de", sitemap: "https://www.rossmann.de/de/sitemap_index.xml", resa: 0, stimati: 32301 },
  { paese: "DE", insegna: "dm", dominio: "www.dm.de", sitemap: "https://www.dm.de/sitemap.xml", resa: 0, stimati: 20966 },
  { paese: "DE", insegna: "Lidl Deutschland", dominio: "www.lidl.de", sitemap: "https://www.lidl.de/static/sitemap.xml", resa: 0.97, stimati: 12720 },
  { paese: "DE", insegna: "Aldi Süd", dominio: "www.aldi-sued.de", sitemap: "https://www.aldi-sued.de/sitemap_products.xml", resa: 1, stimati: 4786 },
  { paese: "DE", insegna: "flaschenpost Supermarkt", dominio: "www.flaschenpost.de", sitemap: "https://www.flaschenpost.de/sitemap_p.xml", resa: 0, stimati: 4154 },
  { paese: "DE", insegna: "flaschenpost", dominio: "www.flaschenpost.de", sitemap: "https://www.flaschenpost.de/sitemap.xml", resa: 0, stimati: 4154 },
  { paese: "DE", insegna: "Aldi Nord", dominio: "www.aldi-nord.de", sitemap: "https://www.aldi-nord.de/.aldi-nord-sitemap.xml", resa: 0, stimati: 3241 },
  { paese: "DE", insegna: "Alnatura", dominio: "www.alnatura.de", sitemap: "https://www.alnatura.de/sitemap.xml", resa: 0.4, stimati: 3115 },
  { paese: "DE", insegna: "Netto", dominio: "www.netto-online.de", sitemap: "https://www.netto-online.de/sitemap.xml", resa: 1, stimati: 1803 },
  { paese: "DE", insegna: "Weinfreunde", dominio: "www.weinfreunde.de", sitemap: "https://www.weinfreunde.de/sitemap.xml", resa: 1, stimati: 1162 },

  { paese: "DK", insegna: "BilkaToGo", dominio: "www.bilkatogo.dk", sitemap: "https://www.bilkatogo.dk/sitemap-products.xml", resa: 0, stimati: 37087 },
  { paese: "DK", insegna: "Føtex", dominio: "foetex.dk", sitemap: "https://foetex.dk/sitemap/sitemap-index.xml", resa: 1, stimati: 28338 },
  { paese: "DK", insegna: "Matas", dominio: "www.matas.dk", sitemap: "https://www.matas.dk/sitemap", resa: 0.93, stimati: 7441 },
  { paese: "DK", insegna: "Nemlig.com", dominio: "www.nemlig.com", sitemap: "https://www.nemlig.com/googleproductsitemap", resa: 0, stimati: 4046 },
  { paese: "DK", insegna: "Nemlig", dominio: "www.nemlig.com", sitemap: "https://www.nemlig.com/googleproductsitemap", resa: 0, stimati: 4046 },

  { paese: "EE", insegna: "Rimi Estonia", dominio: "www.rimi.ee", sitemap: "https://www.rimi.ee/epood/sitemap.xml", resa: 1, stimati: 58320 },
  { paese: "EE", insegna: "Barbora Estonia", dominio: "barbora.ee", sitemap: "https://barbora.ee/sitemap.xml", resa: 1, stimati: 18595 },
  { paese: "EE", insegna: "Barbora EE", dominio: "barbora.ee", sitemap: "https://barbora.ee/sitemap.xml", resa: 1, stimati: 18595 },

  { paese: "ES", insegna: "Naturitas", dominio: "www.naturitas.es", sitemap: "https://www.naturitas.es/sitemap.xml", resa: 1, stimati: 108646 },
  { paese: "ES", insegna: "Alcampo", dominio: "compraonline.alcampo.es", sitemap: "https://compraonline.alcampo.es/sitemaps/sitemap_index.xml", resa: 0, stimati: 86773 },
  { paese: "ES", insegna: "Alcampo Online", dominio: "www.compraonline.alcampo.es", sitemap: "https://www.compraonline.alcampo.es/sitemaps/sitemap-products-part1.xml", resa: 0.23, stimati: 50000 },
  { paese: "ES", insegna: "Bonpreu Esclat", dominio: "www.compraonline.bonpreuesclat.cat", sitemap: "https://www.compraonline.bonpreuesclat.cat/sitemaps/sitemap_index.xml", resa: 0.2, stimati: 21274 },
  { paese: "ES", insegna: "Consum", dominio: "tienda.consum.es", sitemap: "https://tienda.consum.es/sitemap.xml", resa: 0, stimati: 18385 },
  { paese: "ES", insegna: "Mercadona Online", dominio: "tienda.mercadona.es", sitemap: "https://tienda.mercadona.es/sitemap.xml", resa: 0, stimati: 4320 },
  { paese: "ES", insegna: "Aldi España", dominio: "www.aldi.es", sitemap: "https://www.aldi.es/.aldi-nord-sitemap.xml", resa: 0, stimati: 2483 },
  { paese: "ES", insegna: "El Corte Inglés", dominio: "www.elcorteingles.es", sitemap: "https://www.elcorteingles.es/entradas/sitemaps/sitemap.xml", resa: 0, stimati: 1370 },

  { paese: "FI", insegna: "Lidl Suomi", dominio: "www.lidl.fi", sitemap: "https://www.lidl.fi/static/sitemap.xml", resa: 1, stimati: 439 },

  { paese: "FR", insegna: "Greenweez", dominio: "cdn.greenweez.com", sitemap: "https://cdn.greenweez.com/sitemaps/sitemap-products_0.xml", resa: 0, stimati: 45317 },
  { paese: "FR", insegna: "Auchan", dominio: "www.auchan.fr", sitemap: "https://www.auchan.fr/sitemap.xml", resa: 1, stimati: 8708 },
  { paese: "FR", insegna: "Kazidomi", dominio: "www.kazidomi.com", sitemap: "https://www.kazidomi.com/sitemap/sitemap.xml", resa: 1, stimati: 8039 },
  { paese: "FR", insegna: "Naturalia", dominio: "www.naturalia.fr", sitemap: "https://www.naturalia.fr/media/sitemap_product.xml", resa: 1, stimati: 6072 },
  { paese: "FR", insegna: "La Grande Épicerie", dominio: "www.lagrandeepicerie.com", sitemap: "https://www.lagrandeepicerie.com/sitemap_index.xml", resa: 0.97, stimati: 3956 },
  { paese: "FR", insegna: "Picard", dominio: "www.picard.fr", sitemap: "https://www.picard.fr/sitemap_0.xml", resa: 0.97, stimati: 1569 },

  { paese: "GB", insegna: "Morrisons Groceries", dominio: "groceries.morrisons.com", sitemap: "https://groceries.morrisons.com/sitemaps/sitemap_index.xml", resa: 0.93, stimati: 32873 },
  { paese: "GB", insegna: "Morrisons", dominio: "groceries.morrisons.com", sitemap: "https://groceries.morrisons.com/sitemaps/sitemap_index.xml", resa: 0.93, stimati: 32873 },
  { paese: "GB", insegna: "Waitrose", dominio: "www.waitrose.com", sitemap: "https://www.waitrose.com/sitemapIndex.xml", resa: 1, stimati: 18182 },
  { paese: "GB", insegna: "Aldi UK", dominio: "www.aldi.co.uk", sitemap: "https://www.aldi.co.uk/sitemap_products.xml", resa: 0.93, stimati: 4989 },
  { paese: "GB", insegna: "Lidl UK", dominio: "www.lidl.co.uk", sitemap: "https://www.lidl.co.uk/static/sitemap.xml", resa: 1, stimati: 1820 },
  /* LE ALIMENTARI BRITANNICHE CHE LA RACCOLTA AUTOMATICA NON VEDE.
     Aggiunte a mano il 16 settembre, misurate una per una: la scoperta le
     manca perche' due di loro rispondono 403 se interrogate in fretta —
     Sainsbury's e Aldi — e le altre non si annunciano con nomi di sitemap
     riconoscibili. Andando a una richiesta ogni secondo e mezzo rispondono
     tutte, e il prezzo si legge: Sainsbury's 0,99 su un cetriolo, Co-op
     0/4 (solo link, la scheda la riempie il browser), Planet Organic 4/4.

     SE QUESTO FILE VIENE RIGENERATO, QUESTE RIGHE VANNO RIMESSE. Il
     generatore non le trova da solo, e senza di loro il Regno Unito passa da
     undici catene a quattro. */
  { paese: "GB", insegna: "Sainsbury's", dominio: "www.sainsburys.co.uk", sitemap: "https://www.sainsburys.co.uk/product-sitemap.xml", resa: 1, stimati: 9898 },
  { paese: "GB", insegna: "Co-op", dominio: "www.coop.co.uk", sitemap: "https://www.coop.co.uk/products/sitemap.xml", resa: 0, stimati: 3639 },
  { paese: "GB", insegna: "Planet Organic", dominio: "www.planetorganic.com", sitemap: "https://www.planetorganic.com/sitemap.xml", resa: 1, stimati: 3099 },
  { paese: "GB", insegna: "Poundland", dominio: "www.poundland.co.uk", sitemap: "https://www.poundland.co.uk/sitemap.xml", resa: 1, stimati: 1487 },
  { paese: "GB", insegna: "MuscleFood", dominio: "www.musclefood.com", sitemap: "https://www.musclefood.com/sitemap.xml", resa: 1, stimati: 318 },
  { paese: "GB", insegna: "Milk & More", dominio: "www.milkandmore.co.uk", sitemap: "https://www.milkandmore.co.uk/sitemap.xml", resa: 1, stimati: 269 },
  { paese: "GB", insegna: "Heron Foods", dominio: "heronfoods.com", sitemap: "https://heronfoods.com/sitemap.xml", resa: 1, stimati: 256 },

  /* TOLTE PERCHE' NON SONO SPESA, non perche' non funzionino.
     Marks & Spencer pubblica 270.094 schede e Pets at Home 16.156, con una
     resa alta: la raccolta le promuove perche' misura se il PREZZO si legge,
     non se il prodotto e' cibo. Ma sono maglioni e articoli per animali, e
     col tetto di 50.000 per insegna da sole riempirebbero il catalogo
     britannico soffocando le alimentari. Misurato sui nomi: M&S da' "wool
     rich roll neck jumper", "pure linen midi shirt dress".
     Stesso motivo per cui restano fuori B&M e Holland & Barrett. */

  { paese: "GR", insegna: "Masoutis", dominio: "www.masoutis.gr", sitemap: "https://www.masoutis.gr/images/sitemapthree.xml", resa: 0, stimati: 15434 },
  { paese: "GR", insegna: "Kritikos", dominio: "kritikos-sm.gr", sitemap: "https://kritikos-sm.gr/sitemap-1.xml", resa: 1, stimati: 5000 },
  { paese: "GR", insegna: "Sklavenitis", dominio: "www.sklavenitis.gr", sitemap: "https://www.sklavenitis.gr/sitemap/Products/sitemap_index.xml", resa: 1, stimati: 4552 },
  { paese: "GR", insegna: "Lidl Hellas", dominio: "www.lidl-hellas.gr", sitemap: "https://www.lidl-hellas.gr/static/sitemap.xml", resa: 1, stimati: 589 },

  { paese: "HR", insegna: "Tommy", dominio: "www.tommy.hr", sitemap: "https://www.tommy.hr/sitemap.xml", resa: 0.97, stimati: 28640 },
  { paese: "HR", insegna: "Konzum Online", dominio: "www.konzum.hr", sitemap: "https://www.konzum.hr/sitemap_products.xml", resa: 0.97, stimati: 11153 },
  { paese: "HR", insegna: "Konzum", dominio: "www.konzum.hr", sitemap: "https://www.konzum.hr/sitemap_products.xml", resa: 0.97, stimati: 11153 },

  { paese: "HU", insegna: "Aldi HU", dominio: "www.aldi.hu", sitemap: "https://www.aldi.hu/sitemap_products.xml", resa: 1, stimati: 806 },
  { paese: "HU", insegna: "Spar HU", dominio: "www.spar.at", sitemap: "https://www.spar.at/index.sitemap-index.xml", resa: 0, stimati: 459 },
  { paese: "HU", insegna: "Auchan Online", dominio: "auchan.hu", sitemap: "https://auchan.hu/sitemap.xml", resa: 1, stimati: 249 },
  { paese: "HU", insegna: "Auchan HU", dominio: "auchan.hu", sitemap: "https://auchan.hu/sitemap.xml", resa: 1, stimati: 249 },
  { paese: "HU", insegna: "Kifli.hu", dominio: "kifli.hu", sitemap: "https://www.kifli.hu/sitemap_products.xml", resa: 0.5, stimati: 28 },

  { paese: "IE", insegna: "Tesco Ireland", dominio: "www.tesco.ie", sitemap: "https://www.tesco.ie/sitemaps/en-IE/groceries/products-index.xml", resa: 0, stimati: 22467 },
  { paese: "IE", insegna: "SuperValu Online", dominio: "shop.supervalu.ie", sitemap: "https://shop.supervalu.ie/sitemap.xml", resa: 0, stimati: 11807 },
  { paese: "IE", insegna: "SuperValu", dominio: "shop.supervalu.ie", sitemap: "https://shop.supervalu.ie/sitemap.xml", resa: 0, stimati: 11807 },
  { paese: "IE", insegna: "Aldi Ireland", dominio: "www.aldi.ie", sitemap: "https://www.aldi.ie/sitemap_products.xml", resa: 0.97, stimati: 4300 },
  { paese: "IE", insegna: "Lidl Ireland", dominio: "www.lidl.ie", sitemap: "https://www.lidl.ie/static/sitemap.xml", resa: 1, stimati: 1494 },

  { paese: "IN", insegna: "JioMart", dominio: "www.jiomart.com", sitemap: "https://www.jiomart.com/sitemap.xml", resa: 0, stimati: 9332 },

  { paese: "IT", insegna: "CoopShop", dominio: "coopshop.it", sitemap: "https://coopshop.it/sitemap.xml", resa: 0, stimati: 54576 },
  { paese: "IT", insegna: "Carrefour Italia", dominio: "www.carrefour.it", sitemap: "https://www.carrefour.it/sitemap_index.xml", resa: 0.97, stimati: 28352 },
  { paese: "IT", insegna: "Iperal Spesa Online", dominio: "www.iperalspesaonline.it", sitemap: "https://www.iperalspesaonline.it/sitemap.xml", resa: 0, stimati: 23373 },
  { paese: "IT", insegna: "Iperal", dominio: "www.iperalspesaonline.it", sitemap: "https://www.iperalspesaonline.it/sitemap.xml", resa: 0, stimati: 23373 },
  { paese: "IT", insegna: "Bennet", dominio: "www.bennet.com", sitemap: "https://www.bennet.com/sitemap.xml", resa: 1, stimati: 20709 },
  { paese: "IT", insegna: "Esselunga a Casa", dominio: "spesaonline.esselunga.it", sitemap: "https://spesaonline.esselunga.it/sitemap_index.xml", resa: 0, stimati: 17716 },
  { paese: "IT", insegna: "Esselunga", dominio: "spesaonline.esselunga.it", sitemap: "https://spesaonline.esselunga.it/sitemap_index.xml", resa: 0, stimati: 17716 },
  { paese: "IT", insegna: "Alì Supermercati", dominio: "www.alisupermercati.it", sitemap: "https://www.alisupermercati.it/sitemap.xml", resa: 0, stimati: 17696 },
  { paese: "IT", insegna: "Unes", dominio: "www.spesaonline.unes.it", sitemap: "https://www.spesaonline.unes.it/sitemap.xml", resa: 0.93, stimati: 15363 },
  { paese: "IT", insegna: "Tigros", dominio: "www.tigros.it", sitemap: "https://www.tigros.it/sitemap.xml", resa: 0, stimati: 11835 },
  { paese: "IT", insegna: "Basko", dominio: "www.basko.it", sitemap: "https://www.basko.it/sitemap.xml", resa: 0, stimati: 9028 },
  { paese: "IT", insegna: "Naturasi", dominio: "www.naturasi.it", sitemap: "https://www.naturasi.it/sitemap.xml", resa: 0, stimati: 7711 },
  { paese: "IT", insegna: "Coop", dominio: "www.easycoop.com", sitemap: "https://www.easycoop.com/sitemap/sitemap.xml", resa: 1, stimati: 6636 },
  { paese: "IT", insegna: "Cortilia", dominio: "www.cortilia.it", sitemap: "https://www.cortilia.it/sitemap.xml", resa: 1, stimati: 6536 },
  { paese: "IT", insegna: "Pam", dominio: "www.pampanorama.it", sitemap: "https://www.pampanorama.it/sitemap.xml", resa: 0, stimati: 6165 },
  { paese: "IT", insegna: "Conad Spesa Online", dominio: "spesaonline.conad.it", sitemap: "https://spesaonline.conad.it/sitemap/products.xml", resa: 0.17, stimati: 5433 },
  { paese: "IT", insegna: "Conad", dominio: "spesaonline.conad.it", sitemap: "https://spesaonline.conad.it/sitemap/products.xml", resa: 0.17, stimati: 5433 },
  { paese: "IT", insegna: "Eataly", dominio: "www.eataly.net", sitemap: "https://www.eataly.net/sitemap.xml", resa: 1, stimati: 5073 },
  { paese: "IT", insegna: "Unicoop Tirreno", dominio: "coopacasa.coopetruria.coop.it", sitemap: "https://coopacasa.coopetruria.coop.it/sitemap_index.xml", resa: 0.7, stimati: 2033 },
  { paese: "IT", insegna: "Aldi", dominio: "www.aldi.it", sitemap: "https://www.aldi.it/sitemap_products.xml", resa: 1, stimati: 678 },
  { paese: "IT", insegna: "Aldi Italia", dominio: "www.aldi.it", sitemap: "https://www.aldi.it/sitemap_products.xml", resa: 1, stimati: 678 },
  { paese: "IT", insegna: "Lidl Italia", dominio: "www.lidl.it", sitemap: "https://www.lidl.it/static/sitemap.xml", resa: 1, stimati: 445 },

  { paese: "KR", insegna: "Emart Mall", dominio: "emart.ssg.com", sitemap: "https://emart.ssg.com/sitemap/best.xml", resa: 0, stimati: 498 },

  { paese: "LT", insegna: "Rimi Lituania", dominio: "www.rimi.lt", sitemap: "https://www.rimi.lt/e-parduotuve/sitemap.xml", resa: 1, stimati: 61956 },
  { paese: "LT", insegna: "LastMile", dominio: "www.lastmile.lt", sitemap: "https://www.lastmile.lt/sitemap.xml", resa: 0, stimati: 61013 },
  { paese: "LT", insegna: "Rimi e-shop", dominio: "www.rimi.lt", sitemap: "https://www.rimi.lt/e-parduotuve/sitemaps/categories/siteMap_rimiLtSite_Category_ru_1.xml", resa: 0.87, stimati: 702 },

  { paese: "LV", insegna: "Rimi Latvia", dominio: "www.rimi.lv", sitemap: "https://www.rimi.lv/e-veikals/sitemap.xml", resa: 1, stimati: 55793 },
  { paese: "LV", insegna: "Rimi e-veikals", dominio: "www.rimi.lv", sitemap: "https://www.rimi.lv/e-veikals/sitemaps/categories/siteMap_rimiLvSite_Category_en_1.xml", resa: 0.97, stimati: 724 },
  { paese: "LV", insegna: "Barbora Latvia", dominio: "barbora.lv", sitemap: "https://barbora.lv/sitemap.xml", resa: 1, stimati: 495 },
  { paese: "LV", insegna: "Barbora LV", dominio: "barbora.lv", sitemap: "https://barbora.lv/sitemap.xml", resa: 1, stimati: 495 },

  { paese: "NL", insegna: "Etos", dominio: "www.etos.nl", sitemap: "https://www.etos.nl/sitemap_index.xml", resa: 1, stimati: 9281 },
  { paese: "NL", insegna: "Spar NL", dominio: "www.spar.nl", sitemap: "https://www.spar.nl/sitemap.xml", resa: 0.97, stimati: 6647 },
  { paese: "NL", insegna: "Gall & Gall", dominio: "www.gall.nl", sitemap: "https://www.gall.nl/sitemap_index.xml", resa: 1, stimati: 4968 },
  { paese: "NL", insegna: "Dirk", dominio: "www.dirk.nl", sitemap: "https://www.dirk.nl/sitemap.xml", resa: 0.97, stimati: 4781 },

  { paese: "NO", insegna: "Vinmonopolet", dominio: "www.vinmonopolet.no", sitemap: "https://www.vinmonopolet.no/sitemap.xml", resa: 1, stimati: 36098 },
  { paese: "NO", insegna: "MENY Nettbutikk", dominio: "meny.no", sitemap: "https://meny.no/sitemap.xml", resa: 0.93, stimati: 10825 },
  { paese: "NO", insegna: "SPAR Nettbutikk", dominio: "spar.no", sitemap: "https://spar.no/sitemap.xml", resa: 0.93, stimati: 6983 },

  { paese: "PL", insegna: "Auchan Zakupy", dominio: "zakupy.auchan.pl", sitemap: "https://zakupy.auchan.pl/sitemaps/sitemap-products-part1.xml", resa: 0.17, stimati: 24140 },
  { paese: "PL", insegna: "Auchan Polska", dominio: "zakupy.auchan.pl", sitemap: "https://zakupy.auchan.pl/sitemaps/sitemap_index.xml", resa: 0.1, stimati: 24140 },
  { paese: "PL", insegna: "Rossmann Polska", dominio: "www.rossmann.pl", sitemap: "https://www.rossmann.pl/sitemap.xml", resa: 1, stimati: 14078 },

  { paese: "PT", insegna: "Continente Online", dominio: "www.continente.pt", sitemap: "https://www.continente.pt/sitemap_index.xml", resa: 0.7, stimati: 89297 },
  { paese: "PT", insegna: "Continente", dominio: "www.continente.pt", sitemap: "https://www.continente.pt/sitemap_index.xml", resa: 0.57, stimati: 89286 },
  { paese: "PT", insegna: "Auchan Portugal", dominio: "www.auchan.pt", sitemap: "https://www.auchan.pt/sitemap_index.xml", resa: 0.97, stimati: 44039 },
  { paese: "PT", insegna: "Recheio", dominio: "www.recheio.pt", sitemap: "https://www.recheio.pt/portal/sitemap.xml", resa: 0, stimati: 20283 },
  { paese: "PT", insegna: "Pingo Doce", dominio: "www.pingodoce.pt", sitemap: "https://www.pingodoce.pt/home/sitemap_index.xml", resa: 0, stimati: 12441 },
  { paese: "PT", insegna: "Wells", dominio: "www.wells.pt", sitemap: "https://www.wells.pt/sitemap_index.xml", resa: 0.97, stimati: 7859 },
  { paese: "PT", insegna: "Garrafeira Nacional", dominio: "www.garrafeiranacional.com", sitemap: "https://www.garrafeiranacional.com/pub/sitemap.xml", resa: 0, stimati: 413 },
  { paese: "PT", insegna: "Lidl Portugal", dominio: "www.lidl.pt", sitemap: "https://www.lidl.pt/static/sitemap.xml", resa: 1, stimati: 333 },

  { paese: "RO", insegna: "Freshful", dominio: "www.freshful.ro", sitemap: "https://www.freshful.ro/sitemap_index.xml", resa: 1, stimati: 46531 },

  { paese: "RS", insegna: "IDEA Online", dominio: "online.idea.rs", sitemap: "https://online.idea.rs/sitemap.xml", resa: 0, stimati: 10762 },
  { paese: "RS", insegna: "IDEA", dominio: "online.idea.rs", sitemap: "https://online.idea.rs/sitemap.xml", resa: 0, stimati: 10762 },
  { paese: "RS", insegna: "Maxi Online", dominio: "www.maxi.rs", sitemap: "https://www.maxi.rs/sitemap/delhaizesitemap-0.xml.gz", resa: 0, stimati: 9955 },
  { paese: "RS", insegna: "Maxi", dominio: "www.maxi.rs", sitemap: "https://www.maxi.rs/sitemap/delhaizesitemapindex.xml", resa: 0, stimati: 9955 },

  { paese: "SE", insegna: "ICA Handla Online", dominio: "ica.se", sitemap: "https://www.ica.se/recept/sitemaps/", resa: 0.5, stimati: 16539 },
  { paese: "SE", insegna: "Coop Sverige", dominio: "www.coop.se", sitemap: "https://www.coop.se/sitemap.xml", resa: 0, stimati: 14466 },
  { paese: "SE", insegna: "ICA", dominio: "www.ica.se", sitemap: "https://www.ica.se/butiker/sitemap.xml", resa: 0.07, stimati: 8297 },
  { paese: "SE", insegna: "Lidl Sverige", dominio: "www.lidl.se", sitemap: "https://www.lidl.se/static/sitemap.xml", resa: 1, stimati: 489 },

  { paese: "SI", insegna: "Mercator Online", dominio: "mercatoronline.si", sitemap: "https://mercatoronline.si/sitemap.xml", resa: 1, stimati: 17241 },
  { paese: "SI", insegna: "Mercator", dominio: "mercatoronline.si", sitemap: "https://mercatoronline.si/sitemap.xml", resa: 1, stimati: 17236 },
  { paese: "SI", insegna: "Hofer SI", dominio: "www.hofer.si", sitemap: "https://www.hofer.si/sitemap_products.xml", resa: 0.93, stimati: 1035 },

  { paese: "SK", insegna: "Billa SK", dominio: "www.billa.sk", sitemap: "https://www.billa.sk/sitemap.xml", resa: 0.93, stimati: 4286 },

  { paese: "TR", insegna: "Migros Sanal Market", dominio: "www.migros.com.tr", sitemap: "https://www.migros.com.tr/hermes/api/sitemaps/sitemap.xml", resa: 1, stimati: 350 },
  { paese: "TR", insegna: "Migros Turchia", dominio: "www.migros.com.tr", sitemap: "https://www.migros.com.tr/hermes/api/sitemaps/sitemap.xml", resa: 1, stimati: 350 },

  { paese: "US", insegna: "Kroger", dominio: "www.kroger.com", sitemap: "https://www.kroger.com/pdp-sitemap/kroger-product-details-sitemap-1.xml", resa: 0, stimati: 20000 },

  { paese: "ZA", insegna: "Checkers Sixty60", dominio: "www.checkers.co.za", sitemap: "https://www.checkers.co.za/sitemap.xml", resa: 0.43, stimati: 98307 },
];

/** I paesi per cui esiste almeno una fonte. */
export function paesiConCatalogo(): string[] {
  return [...new Set(FONTI.map((f) => f.paese))].sort();
}

/** Le fonti di un paese, le piu' generose per prime. */
export function fontiDi(paese: string): FonteCatalogo[] {
  return FONTI.filter((f) => f.paese === paese.toUpperCase()).sort((a, b) => b.resa - a.resa);
}

/**
 * Le parti successive di una sitemap numerata.
 *
 * Certi negozi spezzano il catalogo in `...-part1.xml`, `...-part2.xml` e non
 * pubblicano un indice che le elenchi: senza questo si caricherebbe un pezzo
 * solo credendo di avere tutto.
 */
export function partiSuccessive(sitemap: string, quante = 12): string[] {
  const m = /^(.*?)(\d+)(\.xml(?:\.gz)?)$/i.exec(sitemap);
  if (!m) return [];
  const [, prefisso, numero, coda] = m;
  const primo = Number(numero);
  return Array.from({ length: quante }, (_, i) => `${prefisso}${primo + i + 1}${coda}`);
}
