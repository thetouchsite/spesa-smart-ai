/**
 * L'elenco delle insegne da provare: chi vende da mangiare in Europa.
 *
 * PERCHE' STA IN UN FILE SUO
 * --------------------------
 * Perche' e' un dato, non un programma, ed e' la cosa che cresce. Gli script
 * che lo usano — la ricognizione e la raccolta — non cambiano mai; questo
 * elenco si allunga ogni volta che si scopre un mercato scoperto.
 *
 * COSA C'E' DENTRO
 * ----------------
 * Tre famiglie, tutte e tre con lo stesso diritto di stare qui, perche' quel
 * che conta e' se pubblicano un catalogo con dentro i prezzi:
 *
 *   catene       i supermercati veri, quelli col carrello
 *   consegne     chi il negozio non ce l'ha ma il catalogo si', da Picnic a
 *                Rohlik: spesso hanno i cataloghi meglio fatti d'Europa
 *   bottegai     drogherie, biologici, enoteche, gastronomie online — piccoli
 *                di catalogo ma quasi sempre generosi di prezzi, perche' sono
 *                negozi nati sul web e il prezzo e' il loro mestiere
 *
 * NIENTE CENSIMENTI PRONTI
 * ------------------------
 * Un elenco pubblico di chi vende la spesa online in Europa non esiste: quelli
 * che si trovano sono parziali, vecchi, o tutt'e due. Questo e' scritto a
 * mano, mercato per mercato.
 *
 * SUI MARKETPLACE
 * ---------------
 * Amazon ed eBay ci sono, ma senza illusioni — misurato: eBay pubblica solo
 * pagine di categoria e zero schede `/itm/`; Amazon le schede `/dp/` le
 * consente ma un catalogo non lo pubblica affatto, e blocca. Restano qui
 * perche' costano una richiesta e perche' cambiano idea ogni tanto; se
 * risponderanno, la ricognizione se ne accorgera' da sola.
 *
 * QUALI SONO FUORI, E PERCHE'
 * ---------------------------
 * Chi nel `robots.txt` vieta le schede prodotto non si tocca — Walmart, Tesco,
 * Sainsbury's, Lidl Spagna e Polonia, Pingo Doce, Ahorramas, Hipercor. Non
 * serve toglierle di qui: la ricognizione legge il `robots.txt` per prime cose
 * e le scarta da sola, e lasciarle nell'elenco documenta che ci si e' guardato.
 */

/** [paese, insegna, dominio] */
export const INSEGNE = [
  // ══════════════════════════════════════════════════════════════════
  //  ITALIA
  // ══════════════════════════════════════════════════════════════════
  ["IT", "Carrefour Italia", "www.carrefour.it"],
  ["IT", "Esselunga", "spesaonline.esselunga.it"],
  ["IT", "Coop", "www.easycoop.com"],
  ["IT", "Conad", "spesaonline.conad.it"],
  ["IT", "Bennet", "www.bennet.com"],
  ["IT", "Unes", "www.spesaonline.unes.it"],
  ["IT", "Tigros", "www.tigros.it"],
  ["IT", "Iperal", "www.iperalspesaonline.it"],
  ["IT", "Pam", "www.pampanorama.it"],
  ["IT", "Cortilia", "www.cortilia.it"],
  ["IT", "Il Gigante", "www.ilgigante.net"],
  ["IT", "Alì Supermercati", "www.alisupermercati.it"],
  ["IT", "Basko", "www.basko.it"],
  ["IT", "Famila", "www.famila.it"],
  ["IT", "Iper La Grande i", "www.iper.it"],
  ["IT", "Decò", "www.decoitalia.it"],
  ["IT", "Crai", "www.crai-supermercati.it"],
  ["IT", "MD", "www.mdspa.it"],
  ["IT", "Eurospin", "www.eurospin.it"],
  ["IT", "Sole365", "www.sole365.it"],
  ["IT", "NaturaSì", "www.naturasi.it"],
  ["IT", "Coop Alleanza", "www.coopalleanza3-0.it"],
  ["IT", "Unicoop Firenze", "www.coopfirenze.it"],
  ["IT", "Aldi Italia", "www.aldi.it"],
  ["IT", "Lidl Italia", "www.lidl.it"],
  ["IT", "Todis", "www.todis.it"],
  ["IT", "Prestofresco", "www.prestofresco.com"],
  ["IT", "Everli", "www.everli.com"],
  ["IT", "Tuodì", "www.tuodi.it"],
  ["IT", "Emisfero", "www.emisfero.it"],
  ["IT", "In's Mercato", "www.insmercato.it"],
  ["IT", "Coal", "www.coal.it"],
  ["IT", "Conad Adriatico", "www.conadadriatico.it"],
  ["IT", "Eataly", "www.eataly.net"],
  ["IT", "Tannico", "www.tannico.it"],
  ["IT", "Vino.com", "www.vino.com"],
  ["IT", "Callmewine", "www.callmewine.com"],
  ["IT", "Bernabei", "www.bernabei.it"],
  ["IT", "Tigotà", "www.tigota.it"],
  ["IT", "Acqua e Sapone", "www.acquaesapone.it"],
  ["IT", "Risparmio Casa", "www.risparmiocasa.com"],
  ["IT", "Arcaplanet", "www.arcaplanet.it"],
  ["IT", "Zooplus Italia", "www.zooplus.it"],
  ["IT", "Macrolibrarsi", "www.macrolibrarsi.it"],
  ["IT", "Bottega Verde", "www.bottegaverde.it"],
  ["IT", "Farmacia Loreto", "www.farmacialoreto.it"],
  ["IT", "Amazon Italia", "www.amazon.it"],

  // ══════════════════════════════════════════════════════════════════
  //  SPAGNA
  // ══════════════════════════════════════════════════════════════════
  ["ES", "Alcampo", "www.compraonline.alcampo.es"],
  ["ES", "Mercadona", "tienda.mercadona.es"],
  ["ES", "Carrefour España", "www.carrefour.es"],
  ["ES", "Consum", "tienda.consum.es"],
  ["ES", "Eroski", "supermercado.eroski.es"],
  ["ES", "Bonpreu Esclat", "www.compraonline.bonpreuesclat.cat"],
  ["ES", "El Corte Inglés", "www.elcorteingles.es"],
  ["ES", "Aldi España", "www.aldi.es"],
  ["ES", "Condis", "www.condisline.com"],
  ["ES", "Froiz", "www.froiz.com"],
  ["ES", "Gadis", "www.gadisenlinea.es"],
  ["ES", "Masymas", "www.masymas.com"],
  ["ES", "BM Supermercados", "www.bmsupermercados.es"],
  ["ES", "Supercor", "www.supercor.es"],
  ["ES", "Caprabo", "www.capraboacasa.com"],
  ["ES", "Coviran", "www.coviran.es"],
  ["ES", "Alimerka", "www.alimerka.es"],
  ["ES", "Spar España", "www.spar.es"],
  ["ES", "Dia", "www.dia.es"],
  ["ES", "Lupa", "www.lupa.es"],
  ["ES", "Familia Supermercados", "www.superfamilia.es"],
  ["ES", "Hiperdino", "www.hiperdino.es"],
  ["ES", "Spar Gran Canaria", "www.sparcanarias.es"],
  ["ES", "Bon Area", "www.bonarea.com"],
  ["ES", "Vinissimus", "www.vinissimus.com"],
  ["ES", "Bodeboca", "www.bodeboca.com"],
  ["ES", "Enterbio", "www.enterbio.es"],
  ["ES", "Naturitas", "www.naturitas.es"],
  ["ES", "Primor", "www.primor.eu"],
  ["ES", "Tiendanimal", "www.tiendanimal.es"],
  ["ES", "Kiwoko", "www.kiwoko.com"],
  ["ES", "Amazon España", "www.amazon.es"],

  // ══════════════════════════════════════════════════════════════════
  //  PORTOGALLO
  // ══════════════════════════════════════════════════════════════════
  ["PT", "Continente", "www.continente.pt"],
  ["PT", "Auchan Portugal", "www.auchan.pt"],
  ["PT", "Pingo Doce", "www.pingodoce.pt"],
  ["PT", "Intermarché PT", "www.intermarche.pt"],
  ["PT", "Lidl Portugal", "www.lidl.pt"],
  ["PT", "Mercadão", "www.mercadao.pt"],
  ["PT", "El Corte Inglés PT", "www.elcorteingles.pt"],
  ["PT", "Minipreço", "www.minipreco.pt"],
  ["PT", "Recheio", "www.recheio.pt"],
  ["PT", "Froiz Portugal", "www.froiz.pt"],
  ["PT", "Meu Super", "www.meusuper.pt"],
  ["PT", "Garrafeira Nacional", "www.garrafeiranacional.com"],
  ["PT", "Celeiro", "www.celeiro.pt"],
  ["PT", "Wells", "www.wells.pt"],
  ["PT", "Amazon Portugal", "www.amazon.pt"],

  // ══════════════════════════════════════════════════════════════════
  //  FRANCIA
  // ══════════════════════════════════════════════════════════════════
  ["FR", "Carrefour France", "www.carrefour.fr"],
  ["FR", "Auchan", "www.auchan.fr"],
  ["FR", "Monoprix", "www.monoprix.fr"],
  ["FR", "Intermarché", "www.intermarche.com"],
  ["FR", "Casino", "www.casino.fr"],
  ["FR", "Cora", "www.cora.fr"],
  ["FR", "Franprix", "www.franprix.fr"],
  ["FR", "Super U", "www.coursesu.com"],
  ["FR", "Leclerc Drive", "www.leclercdrive.fr"],
  ["FR", "Naturalia", "www.naturalia.fr"],
  ["FR", "Grand Frais", "www.grandfrais.com"],
  ["FR", "Picard", "www.picard.fr"],
  ["FR", "La Fourche", "lafourche.fr"],
  ["FR", "Biocoop", "www.biocoop.fr"],
  ["FR", "Greenweez", "www.greenweez.com"],
  ["FR", "Kazidomi", "www.kazidomi.com"],
  ["FR", "Nicolas", "www.nicolas.com"],
  ["FR", "Vinatis", "www.vinatis.com"],
  ["FR", "Twil", "www.twil.fr"],
  ["FR", "La Grande Épicerie", "www.lagrandeepicerie.com"],
  ["FR", "Maisons du Monde Food", "www.maisonsdumonde.com"],
  ["FR", "Zooplus France", "www.zooplus.fr"],
  ["FR", "Parapharmacie Leclerc", "www.e.leclerc"],
  ["FR", "Cdiscount", "www.cdiscount.com"],
  ["FR", "Amazon France", "www.amazon.fr"],

  // ══════════════════════════════════════════════════════════════════
  //  GERMANIA
  // ══════════════════════════════════════════════════════════════════
  ["DE", "REWE", "www.rewe.de"],
  ["DE", "Edeka", "www.edeka.de"],
  ["DE", "Kaufland", "www.kaufland.de"],
  ["DE", "Lidl Deutschland", "www.lidl.de"],
  ["DE", "Aldi Süd", "www.aldi-sued.de"],
  ["DE", "Aldi Nord", "www.aldi-nord.de"],
  ["DE", "Netto", "www.netto-online.de"],
  ["DE", "Penny", "www.penny.de"],
  ["DE", "Knuspr", "www.knuspr.de"],
  ["DE", "flaschenpost", "www.flaschenpost.de"],
  ["DE", "Bringmeister", "www.bringmeister.de"],
  ["DE", "Alnatura", "www.alnatura.de"],
  ["DE", "Globus", "www.globus.de"],
  ["DE", "Müller", "www.mueller.de"],
  ["DE", "dm", "www.dm.de"],
  ["DE", "Rossmann", "www.rossmann.de"],
  ["DE", "Real", "www.real.de"],
  ["DE", "Famila Nordost", "www.famila-nordost.de"],
  ["DE", "Combi", "www.combi.de"],
  ["DE", "Marktkauf", "www.marktkauf.de"],
  ["DE", "Denns Biomarkt", "www.denns-biomarkt.de"],
  ["DE", "Basic Bio", "www.basicbio.de"],
  ["DE", "Weinfreunde", "www.weinfreunde.de"],
  ["DE", "Hawesko", "www.hawesko.de"],
  ["DE", "Getränkeland", "www.getraenkeland.de"],
  ["DE", "Zooplus", "www.zooplus.de"],
  ["DE", "Fressnapf", "www.fressnapf.de"],
  ["DE", "Otto", "www.otto.de"],
  ["DE", "Amazon Deutschland", "www.amazon.de"],

  // ══════════════════════════════════════════════════════════════════
  //  REGNO UNITO E IRLANDA
  // ══════════════════════════════════════════════════════════════════
  ["GB", "Morrisons", "groceries.morrisons.com"],
  ["GB", "Waitrose", "www.waitrose.com"],
  ["GB", "Iceland", "www.iceland.co.uk"],
  ["GB", "Co-op UK", "www.coop.co.uk"],
  ["GB", "Marks & Spencer", "www.marksandspencer.com"],
  ["GB", "Booths", "www.booths.co.uk"],
  ["GB", "Holland & Barrett", "www.hollandandbarrett.com"],
  ["GB", "Abel & Cole", "www.abelandcole.co.uk"],
  ["GB", "Riverford", "www.riverford.co.uk"],
  ["GB", "Asda", "groceries.asda.com"],
  ["GB", "Aldi UK", "www.aldi.co.uk"],
  ["GB", "Lidl UK", "www.lidl.co.uk"],
  ["GB", "Farmfoods", "www.farmfoods.co.uk"],
  ["GB", "Planet Organic", "www.planetorganic.com"],
  ["GB", "Whole Foods UK", "www.wholefoodsmarket.co.uk"],
  ["GB", "Majestic Wine", "www.majestic.co.uk"],
  ["GB", "Naked Wines", "www.nakedwines.com"],
  ["GB", "Boots", "www.boots.com"],
  ["GB", "Superdrug", "www.superdrug.com"],
  ["GB", "Wilko", "www.wilko.com"],
  ["GB", "Pets at Home", "www.petsathome.com"],
  ["GB", "Ocado Zoom", "www.ocado.com"],
  ["GB", "Amazon UK", "www.amazon.co.uk"],
  ["IE", "SuperValu", "shop.supervalu.ie"],
  ["IE", "Dunnes Stores", "www.dunnesstoresgrocery.com"],
  ["IE", "Tesco Ireland", "www.tesco.ie"],
  ["IE", "Centra", "www.centra.ie"],
  ["IE", "Aldi Ireland", "www.aldi.ie"],
  ["IE", "Lidl Ireland", "www.lidl.ie"],

  // ══════════════════════════════════════════════════════════════════
  //  PAESI BASSI E BELGIO
  // ══════════════════════════════════════════════════════════════════
  ["NL", "Albert Heijn", "www.ah.nl"],
  ["NL", "Jumbo", "www.jumbo.com"],
  ["NL", "Picnic", "picnic.app"],
  ["NL", "Plus", "www.plus.nl"],
  ["NL", "Dirk", "www.dirk.nl"],
  ["NL", "Coop NL", "www.coop.nl"],
  ["NL", "Ekoplaza", "www.ekoplaza.nl"],
  ["NL", "Hoogvliet", "www.hoogvliet.com"],
  ["NL", "Vomar", "www.vomar.nl"],
  ["NL", "Deen", "www.deen.nl"],
  ["NL", "Spar NL", "www.spar.nl"],
  ["NL", "Odin", "www.odin.nl"],
  ["NL", "Gall & Gall", "www.gall.nl"],
  ["NL", "Etos", "www.etos.nl"],
  ["NL", "Kruidvat", "www.kruidvat.nl"],
  ["NL", "Bol.com", "www.bol.com"],
  ["NL", "Amazon NL", "www.amazon.nl"],
  ["BE", "Delhaize", "www.delhaize.be"],
  ["BE", "Carrefour Belgium", "www.carrefour.be"],
  ["BE", "Colruyt", "www.collectandgo.be"],
  ["BE", "Okay", "www.okay.be"],
  ["BE", "Spar Belgio", "www.spar.be"],
  ["BE", "Cora Belgio", "www.cora.be"],
  ["BE", "Intermarché BE", "www.intermarche.be"],
  ["BE", "Bioplanet", "www.bioplanet.be"],
  ["BE", "Kruidvat BE", "www.kruidvat.be"],
  ["BE", "Amazon Belgio", "www.amazon.com.be"],

  // ══════════════════════════════════════════════════════════════════
  //  AUSTRIA E SVIZZERA
  // ══════════════════════════════════════════════════════════════════
  ["AT", "BILLA", "shop.billa.at"],
  ["AT", "Gurkerl", "www.gurkerl.at"],
  ["AT", "Interspar", "www.interspar.at"],
  ["AT", "Hofer", "www.hofer.at"],
  ["AT", "MPreis", "www.mpreis.at"],
  ["AT", "Unimarkt", "www.unimarkt.at"],
  ["AT", "Adeg", "www.adeg.at"],
  ["AT", "dm Austria", "www.dm.at"],
  ["AT", "Bipa", "www.bipa.at"],
  ["AT", "Weinwelt", "www.weinwelt.at"],
  ["CH", "Migros", "www.migros.ch"],
  ["CH", "Coop Svizzera", "www.coop.ch"],
  ["CH", "Farmy", "www.farmy.ch"],
  ["CH", "Lidl Svizzera", "www.lidl.ch"],
  ["CH", "Denner", "www.denner.ch"],
  ["CH", "Volg", "www.volg.ch"],
  ["CH", "Manor Food", "www.manor.ch"],
  ["CH", "Galaxus", "www.galaxus.ch"],

  // ══════════════════════════════════════════════════════════════════
  //  NORD EUROPA
  // ══════════════════════════════════════════════════════════════════
  ["SE", "ICA", "www.ica.se"],
  ["SE", "Willys", "www.willys.se"],
  ["SE", "Coop Sverige", "www.coop.se"],
  ["SE", "Mathem", "www.mathem.se"],
  ["SE", "Hemköp", "www.hemkop.se"],
  ["SE", "City Gross", "www.citygross.se"],
  ["SE", "Lidl Sverige", "www.lidl.se"],
  ["SE", "Apotea", "www.apotea.se"],
  ["SE", "Systembolaget", "www.systembolaget.se"],
  ["DK", "Nemlig", "www.nemlig.com"],
  ["DK", "BilkaToGo", "www.bilkatogo.dk"],
  ["DK", "Rema 1000", "shop.rema1000.dk"],
  ["DK", "Coop Danmark", "www.coop.dk"],
  ["DK", "Føtex", "www.foetex.dk"],
  ["DK", "Netto Danmark", "www.netto.dk"],
  ["DK", "Matas", "www.matas.dk"],
  ["NO", "Oda", "oda.com"],
  ["NO", "MENY", "meny.no"],
  ["NO", "Spar Norge", "spar.no"],
  ["NO", "Kiwi", "kiwi.no"],
  ["NO", "Coop Norge", "coop.no"],
  ["NO", "Vinmonopolet", "www.vinmonopolet.no"],
  ["FI", "K-Ruoka", "www.k-ruoka.fi"],
  ["FI", "S-kaupat", "www.s-kaupat.fi"],
  ["FI", "Alko", "www.alko.fi"],
  ["FI", "Lidl Suomi", "www.lidl.fi"],
  ["IS", "Kronan", "kronan.is"],
  ["IS", "Netto Islanda", "www.netto.is"],
  ["IS", "Hagkaup", "www.hagkaup.is"],

  // ══════════════════════════════════════════════════════════════════
  //  EUROPA CENTRALE
  // ══════════════════════════════════════════════════════════════════
  ["PL", "Frisco", "www.frisco.pl"],
  ["PL", "Auchan Polska", "zakupy.auchan.pl"],
  ["PL", "Carrefour Polska", "www.carrefour.pl"],
  ["PL", "Biedronka", "www.biedronka.pl"],
  ["PL", "Kaufland Polska", "www.kaufland.pl"],
  ["PL", "Selgros", "www.selgros24.pl"],
  ["PL", "Delikatesy Centrum", "www.delikatesy.pl"],
  ["PL", "Makro Polska", "www.makro.pl"],
  ["PL", "E.Leclerc Polska", "www.leclerc.pl"],
  ["PL", "Stokrotka", "www.stokrotka.pl"],
  ["PL", "Piotr i Paweł", "www.piotripawel.pl"],
  ["PL", "Rossmann Polska", "www.rossmann.pl"],
  ["PL", "Hebe", "www.hebe.pl"],
  ["PL", "Allegro", "allegro.pl"],
  ["PL", "Amazon Polska", "www.amazon.pl"],
  ["CZ", "Rohlik", "www.rohlik.cz"],
  ["CZ", "Košík", "www.kosik.cz"],
  ["CZ", "Albert", "www.albert.cz"],
  ["CZ", "Billa CZ", "www.billa.cz"],
  ["CZ", "Globus CZ", "www.globus.cz"],
  ["CZ", "Alza", "www.alza.cz"],
  ["CZ", "Notino", "www.notino.cz"],
  ["SK", "Kaufland SK", "www.kaufland.sk"],
  ["SK", "Billa SK", "www.billa.sk"],
  ["SK", "Rohlik SK", "www.rohlik.sk"],
  ["HU", "Auchan HU", "auchan.hu"],
  ["HU", "Kifli", "www.kifli.hu"],
  ["HU", "Spar HU", "www.spar.hu"],
  ["HU", "Aldi HU", "www.aldi.hu"],
  ["HU", "Rossmann HU", "www.rossmann.hu"],

  // ══════════════════════════════════════════════════════════════════
  //  EUROPA ORIENTALE E BALCANI
  // ══════════════════════════════════════════════════════════════════
  ["RO", "Mega Image", "www.mega-image.ro"],
  ["RO", "Freshful", "www.freshful.ro"],
  ["RO", "Sezamo", "www.sezamo.ro"],
  ["RO", "Carrefour România", "carrefour.ro"],
  ["RO", "Auchan România", "www.auchan.ro"],
  ["RO", "Kaufland România", "www.kaufland.ro"],
  ["RO", "Profi", "www.profi.ro"],
  ["RO", "eMAG", "www.emag.ro"],
  ["BG", "eBag", "www.ebag.bg"],
  ["BG", "Kaufland BG", "www.kaufland.bg"],
  ["BG", "Billa BG", "www.billa.bg"],
  ["BG", "Lidl BG", "www.lidl.bg"],
  ["HR", "Konzum", "www.konzum.hr"],
  ["HR", "Spar Croazia", "www.spar.hr"],
  ["HR", "Tommy", "www.tommy.hr"],
  ["HR", "Plodine", "www.plodine.hr"],
  ["SI", "Mercator", "mercatoronline.si"],
  ["SI", "Spar Slovenia", "www.spar.si"],
  ["SI", "Tuš", "www.tus.si"],
  ["SI", "Hofer SI", "www.hofer.si"],
  ["RS", "IDEA", "online.idea.rs"],
  ["RS", "Maxi", "www.maxi.rs"],
  ["RS", "Univerexport", "www.univerexport.rs"],
  ["GR", "Sklavenitis", "www.sklavenitis.gr"],
  ["GR", "AB Vassilopoulos", "www.ab.gr"],
  ["GR", "My Market", "www.mymarket.gr"],
  ["GR", "Masoutis", "www.masoutis.gr"],
  ["GR", "Kritikos", "www.kritikos-sm.gr"],
  ["GR", "Bazaar", "www.bazaar.gr"],
  ["GR", "e-Fresh", "www.e-fresh.gr"],
  ["GR", "Lidl Hellas", "www.lidl-hellas.gr"],
  ["GR", "Skroutz", "www.skroutz.gr"],
  ["EE", "Selver", "www.selver.ee"],
  ["EE", "Rimi Estonia", "www.rimi.ee"],
  ["EE", "Barbora EE", "barbora.ee"],
  ["EE", "Coop Estonia", "ecoop.ee"],
  ["EE", "Prisma EE", "www.prismamarket.ee"],
  ["LV", "Rimi Latvia", "www.rimi.lv"],
  ["LV", "Barbora LV", "barbora.lv"],
  ["LV", "Maxima LV", "www.maxima.lv"],
  ["LT", "Rimi Lituania", "www.rimi.lt"],
  ["LT", "Barbora LT", "barbora.lt"],
  ["LT", "LastMile", "www.lastmile.lt"],
  ["LT", "Maxima LT", "www.maxima.lt"],
  ["CY", "Alphamega", "www.alphamega.com.cy"],
  ["MT", "Welbees", "www.welbees.com.mt"],
  ["MT", "Greens Malta", "www.greensmalta.com"],
  ["MT", "Scotts Supermarket", "www.scottssupermarket.com"],
  ["LU", "Auchan Lussemburgo", "www.auchan.lu"],
  ["LU", "Cactus", "www.cactus.lu"],
  ["LU", "Delhaize LU", "www.delhaize.lu"],
  ["AL", "Spar Albania", "shop.spar.al"],
  ["MK", "Tinex", "www.tinex.mk"],
  ["ME", "IDEA Montenegro", "www.idea.me"],
  ["BA", "Bingo", "www.bingotuzla.ba"],
  ["UA", "Silpo", "silpo.ua"],
  ["UA", "Novus", "novus.online"],
  ["UA", "ATB", "www.atbmarket.com"],
  ["UA", "Rozetka", "rozetka.com.ua"],
  ["MD", "Linella", "linella.md"],
  ["TR", "Migros Turchia", "www.migros.com.tr"],
  ["TR", "CarrefourSA", "www.carrefoursa.com"],
  ["TR", "A101", "www.a101.com.tr"],
  ["TR", "ŞOK", "www.sokmarket.com.tr"],
  ["TR", "Getir", "www.getir.com"],
  ["TR", "Hepsiburada", "www.hepsiburada.com"],
  ["TR", "Trendyol", "www.trendyol.com"],
];

export default INSEGNE;
