/**
 * I negozi da provare, paese per paese.
 *
 * PERCHE' UN FILE SUO
 * -------------------
 * Perche' e' un elenco, non un programma: cresce di righe e non di logica, e
 * tenerlo dentro `caccia-insegne.ts` faceva scorrere duecento righe di dati
 * prima di arrivare al codice.
 *
 * COS'E' E COSA NON E'
 * --------------------
 * E' un punto di partenza da provare a macchina, non un dato acquisito. Un
 * dominio sbagliato costa una richiesta fallita e viene detto in chiaro; un
 * dominio mancante costa un'insegna che non troveremo mai. Quindi meglio largo
 * che stretto, e meglio sbagliato che assente.
 *
 * La caccia prova sei forme di ogni dominio — `www.`, `shop.`, `spesaonline.`
 * e le altre — perche' in parecchi paesi il sito dell'insegna e il suo negozio
 * online stanno su indirizzi diversi.
 *
 * COSA CI HA INSEGNATO L'ITALIA
 * -----------------------------
 * Su venti candidati italiani ne e' passato uno. Non per colpa dei domini:
 * misurato scendendo fino agli indirizzi, quelle catene il catalogo nelle
 * sitemap non lo mettono — la sitemap di Tigota' ha trentasei voci e sono
 * «chi siamo» e «black friday». In Italia la grande distribuzione e' fatta di
 * consorzi di negozi indipendenti, e il sito nazionale racconta l'azienda.
 *
 * Altrove non e' cosi', e le 119 insegne che gia' abbiamo vengono tutte da
 * sitemap: la strada funziona, ma la resa cambia molto da paese a paese.
 */

export interface Candidato {
  nome: string;
  dominio: string;
}

export const CANDIDATI: Record<string, Candidato[]> = {
  NL: [
    { nome: "Albert Heijn", dominio: "www.ah.nl" },
    { nome: "Jumbo", dominio: "www.jumbo.com" },
    { nome: "Plus", dominio: "www.plus.nl" },
    { nome: "Coop NL", dominio: "www.coop.nl" },
    { nome: "Dirk", dominio: "www.dirk.nl" },
    { nome: "Ekoplaza", dominio: "www.ekoplaza.nl" },
    { nome: "Picnic", dominio: "picnic.app" },
  ],
  BE: [
    { nome: "Colruyt", dominio: "www.colruyt.be" },
    { nome: "Carrefour Belgique", dominio: "www.carrefour.be" },
    { nome: "Bioplanet", dominio: "www.bioplanet.be" },
    { nome: "Cora Belgique", dominio: "www.cora.be" },
  ],
  DE: [
    { nome: "Rewe", dominio: "shop.rewe.de" },
    { nome: "Edeka24", dominio: "www.edeka24.de" },
    { nome: "Kaufland", dominio: "www.kaufland.de" },
    { nome: "Netto Online", dominio: "www.netto-online.de" },
    { nome: "Bringmeister", dominio: "www.bringmeister.de" },
    { nome: "Mytime", dominio: "www.mytime.de" },
    { nome: "Knuspr", dominio: "www.knuspr.de" },
    { nome: "Alnatura", dominio: "www.alnatura.de" },
    { nome: "Denns Biomarkt", dominio: "www.denns-biomarkt.de" },
  ],
  FR: [
    { nome: "Intermarche", dominio: "www.intermarche.com" },
    { nome: "Auchan", dominio: "www.auchan.fr" },
    { nome: "Monoprix", dominio: "www.monoprix.fr" },
    { nome: "Franprix", dominio: "www.franprix.fr" },
    { nome: "Cora", dominio: "www.cora.fr" },
    { nome: "Super U", dominio: "www.coursesu.com" },
    { nome: "La Belle Vie", dominio: "www.labellevie.com" },
    { nome: "Grand Frais", dominio: "www.grandfrais.com" },
    { nome: "Biocoop", dominio: "www.biocoop.fr" },
  ],
  GB: [
    { nome: "Sainsburys", dominio: "www.sainsburys.co.uk" },
    { nome: "Asda", dominio: "groceries.asda.com" },
    { nome: "Waitrose", dominio: "www.waitrose.com" },
    { nome: "Iceland", dominio: "www.iceland.co.uk" },
    { nome: "Co-op UK", dominio: "shop.coop.co.uk" },
    { nome: "Ocado", dominio: "www.ocado.com" },
    { nome: "Holland and Barrett", dominio: "www.hollandandbarrett.com" },
  ],
  IE: [
    { nome: "Dunnes Stores", dominio: "www.dunnesstoresgrocery.com" },
    { nome: "Tesco Ireland", dominio: "www.tesco.ie" },
  ],
  ES: [
    { nome: "Eroski", dominio: "supermercado.eroski.es" },
    { nome: "Condis", dominio: "www.condisline.com" },
    { nome: "Ahorramas", dominio: "www.ahorramas.com" },
    { nome: "Carrefour Espana", dominio: "www.carrefour.es" },
    { nome: "Dia", dominio: "www.dia.es" },
    { nome: "Hipercor", dominio: "www.hipercor.es" },
    { nome: "Gadis", dominio: "www.gadis.es" },
    { nome: "BM Supermercados", dominio: "www.bmsupermercados.es" },
    { nome: "Alimerka", dominio: "www.alimerka.es" },
    { nome: "HiperDino", dominio: "www.hiperdino.es" },
    { nome: "Froiz", dominio: "www.froiz.com" },
    { nome: "Masymas", dominio: "www.masymas.com" },
  ],
  PT: [
    { nome: "Pingo Doce", dominio: "www.pingodoce.pt" },
    { nome: "Intermarche Portugal", dominio: "www.intermarche.pt" },
    { nome: "Mercadao", dominio: "www.mercadao.pt" },
    { nome: "Minipreco", dominio: "www.minipreco.pt" },
    { nome: "El Corte Ingles Portugal", dominio: "www.elcorteingles.pt" },
  ],
  AT: [
    { nome: "Spar Austria", dominio: "www.interspar.at" },
    { nome: "Unimarkt", dominio: "www.unimarkt.at" },
    { nome: "Gurkerl", dominio: "www.gurkerl.at" },
  ],
  CH: [
    { nome: "Migros", dominio: "www.migros.ch" },
    { nome: "Coop Svizzera", dominio: "www.coop.ch" },
    { nome: "Farmy", dominio: "www.farmy.ch" },
    { nome: "Lidl Svizzera", dominio: "www.lidl.ch" },
  ],
  PL: [
    { nome: "Frisco", dominio: "www.frisco.pl" },
    { nome: "Carrefour Polska", dominio: "www.carrefour.pl" },
    { nome: "Biedronka", dominio: "www.biedronka.pl" },
    { nome: "Lidl Polska", dominio: "www.lidl.pl" },
    { nome: "Delikatesy Centrum", dominio: "www.delikatesy.pl" },
    { nome: "E.Leclerc Polska", dominio: "www.eleclerc.pl" },
  ],
  CZ: [
    { nome: "Rohlik", dominio: "www.rohlik.cz" },
    { nome: "Kosik", dominio: "www.kosik.cz" },
    { nome: "Tesco CZ", dominio: "nakup.itesco.cz" },
    { nome: "Albert", dominio: "www.albert.cz" },
    { nome: "Globus", dominio: "www.globus.cz" },
  ],
  SK: [
    { nome: "Tesco SK", dominio: "potravinydomov.itesco.sk" },
    { nome: "Kaufland SK", dominio: "www.kaufland.sk" },
  ],
  HU: [
    { nome: "Tesco HU", dominio: "bevasarlas.tesco.hu" },
    { nome: "Spar HU Online", dominio: "www.spar.hu" },
    { nome: "Auchan Hungary", dominio: "online.auchan.hu" },
  ],
  RO: [
    { nome: "Carrefour Romania", dominio: "carrefour.ro" },
    { nome: "Mega Image", dominio: "www.mega-image.ro" },
    { nome: "Auchan Romania", dominio: "www.auchan.ro" },
    { nome: "Profi", dominio: "www.profi.ro" },
    { nome: "Kaufland Romania", dominio: "www.kaufland.ro" },
  ],
  BG: [
    { nome: "Kaufland Bulgaria", dominio: "www.kaufland.bg" },
    { nome: "Billa Bulgaria", dominio: "www.billa.bg" },
    { nome: "Fantastico", dominio: "www.fantastico.bg" },
  ],
  GR: [
    { nome: "AB Vassilopoulos", dominio: "www.ab.gr" },
    { nome: "Sklavenitis", dominio: "www.sklavenitis.gr" },
    { nome: "My Market", dominio: "www.mymarket.gr" },
  ],
  HR: [
    { nome: "Tommy", dominio: "www.tommy.hr" },
    { nome: "Plodine", dominio: "www.plodine.hr" },
    { nome: "Studenac", dominio: "www.studenac.hr" },
  ],
  SI: [
    { nome: "Spar Slovenija", dominio: "www.spar.si" },
    { nome: "Tus", dominio: "www.tus.si" },
  ],
  RS: [
    { nome: "Idea", dominio: "www.idea.rs" },
    { nome: "Univerexport", dominio: "www.univerexport.rs" },
  ],
  DK: [
    { nome: "Rema 1000", dominio: "shop.rema1000.dk" },
    { nome: "Coop Danmark Online", dominio: "www.coop.dk" },
    { nome: "Osuma", dominio: "www.osuma.dk" },
  ],
  SE: [
    { nome: "Willys", dominio: "www.willys.se" },
    { nome: "City Gross", dominio: "www.citygross.se" },
    { nome: "Mathem", dominio: "www.mathem.se" },
    { nome: "Hemkop", dominio: "www.hemkop.se" },
  ],
  NO: [
    { nome: "Meny", dominio: "meny.no" },
    { nome: "Oda", dominio: "oda.com" },
    { nome: "Coop Norge", dominio: "coop.no" },
  ],
  FI: [
    { nome: "S-kaupat", dominio: "www.s-kaupat.fi" },
    { nome: "K-ruoka", dominio: "www.k-ruoka.fi" },
    { nome: "Foodie", dominio: "www.foodie.fi" },
  ],
  EE: [
    { nome: "Selver", dominio: "www.selver.ee" },
    { nome: "Coop Eesti", dominio: "www.coop.ee" },
    { nome: "Maxima Eesti", dominio: "www.maxima.ee" },
  ],
  LV: [
    { nome: "Maxima Latvija", dominio: "www.maxima.lv" },
    { nome: "Elvi", dominio: "www.elvi.lv" },
  ],
  LT: [
    { nome: "Maxima Lietuva", dominio: "www.maxima.lt" },
    { nome: "IKI", dominio: "www.iki.lt" },
  ],
  IT: [
    { nome: "Sole365", dominio: "www.sole365.it" },
    { nome: "Il Gigante", dominio: "www.ilgigante.net" },
    { nome: "Migross", dominio: "www.migross.it" },
    { nome: "Tigota", dominio: "www.tigota.it" },
    { nome: "Bofrost", dominio: "www.bofrost.it" },
  ],
};

/**
 * Il secondo giro, sui paesi piu' scoperti.
 *
 * Misurato: la Svizzera aveva 678 indirizzi in tutto e la Finlandia 439,
 * mentre Migros, Coop.ch, S-kaupat e K-ruoka sono catene enormi. Non e' che
 * quei paesi non abbiano negozi online: e' che non li avevamo mai provati.
 *
 * Si uniscono a quelli di sopra invece di sostituirli: un'insegna gia' nota
 * viene saltata dalla caccia, quindi un doppione costa una riga e non una
 * richiesta.
 */
const ALTRI: Record<string, Candidato[]> = {
  CH: [
    { nome: "Migros Online", dominio: "www.migros.ch" },
    { nome: "Coop Svizzera", dominio: "www.coop.ch" },
    { nome: "Farmy", dominio: "www.farmy.ch" },
    { nome: "Lidl Svizzera", dominio: "www.lidl.ch" },
    { nome: "Aldi Suisse", dominio: "www.aldi-suisse.ch" },
    { nome: "Volg", dominio: "www.volg.ch" },
  ],
  FI: [
    { nome: "S-kaupat", dominio: "www.s-kaupat.fi" },
    { nome: "K-ruoka", dominio: "www.k-ruoka.fi" },
    { nome: "Foodie", dominio: "www.foodie.fi" },
    { nome: "Lidl Suomi", dominio: "www.lidl.fi" },
  ],
  SK: [
    { nome: "Tesco SK", dominio: "potravinydomov.itesco.sk" },
    { nome: "Kaufland SK", dominio: "www.kaufland.sk" },
    { nome: "Lidl SK", dominio: "www.lidl.sk" },
    { nome: "Metro SK", dominio: "www.metro.sk" },
  ],
  SI: [
    { nome: "Spar Slovenija", dominio: "online.spar.si" },
    { nome: "Tus", dominio: "www.tus.si" },
    { nome: "Hofer", dominio: "www.hofer.si" },
    { nome: "Lidl Slovenija", dominio: "www.lidl.si" },
  ],
  HU: [
    { nome: "Tesco HU", dominio: "bevasarlas.tesco.hu" },
    { nome: "Spar HU", dominio: "www.spar.hu" },
    { nome: "Lidl HU", dominio: "www.lidl.hu" },
    { nome: "Aldi HU", dominio: "www.aldi.hu" },
    { nome: "Penny HU", dominio: "www.penny.hu" },
  ],
  SE: [
    { nome: "Willys", dominio: "www.willys.se" },
    { nome: "Hemkop", dominio: "www.hemkop.se" },
    { nome: "Lidl Sverige", dominio: "www.lidl.se" },
    { nome: "Apotea", dominio: "www.apotea.se" },
  ],
  BE: [
    { nome: "Delhaize BE", dominio: "www.delhaize.be" },
    { nome: "Aldi Belgie", dominio: "www.aldi.be" },
    { nome: "Lidl Belgique", dominio: "www.lidl.be" },
    { nome: "Spar BE", dominio: "www.spar.be" },
  ],
  RS: [
    { nome: "Idea", dominio: "www.idea.rs" },
    { nome: "Roda", dominio: "www.rodasmarket.rs" },
    { nome: "Lidl Srbija", dominio: "www.lidl.rs" },
    { nome: "DIS", dominio: "www.dis.rs" },
  ],
  HR: [
    { nome: "Konzum", dominio: "www.konzum.hr" },
    { nome: "Lidl Hrvatska", dominio: "www.lidl.hr" },
    { nome: "Spar Hrvatska", dominio: "www.spar.hr" },
    { nome: "Ntl", dominio: "www.ntl.hr" },
  ],
  BG: [
    { nome: "Lidl Bulgaria", dominio: "www.lidl.bg" },
    { nome: "Metro BG", dominio: "www.metro.bg" },
    { nome: "T Market", dominio: "www.tmarket.bg" },
  ],
  GR: [
    { nome: "Lidl Hellas", dominio: "www.lidl-hellas.gr" },
    { nome: "Bazaar", dominio: "www.bazaar.gr" },
    { nome: "Galaxias", dominio: "www.galaxias.gr" },
  ],
  PL: [
    { nome: "Auchan Polska", dominio: "zakupy.auchan.pl" },
    { nome: "Makro PL", dominio: "www.makro.pl" },
    { nome: "Aldi Polska", dominio: "www.aldi.pl" },
    { nome: "Netto PL", dominio: "www.netto.pl" },
  ],
  PT: [
    { nome: "Lidl Portugal", dominio: "www.lidl.pt" },
    { nome: "Aldi Portugal", dominio: "www.aldi.pt" },
    { nome: "Froiz Portugal", dominio: "www.froiz.pt" },
  ],
  IS: [
    { nome: "Kronan", dominio: "kronan.is" },
    { nome: "Netto IS", dominio: "www.netto.is" },
    { nome: "Hagkaup", dominio: "www.hagkaup.is" },
  ],
  LU: [
    { nome: "Cactus", dominio: "www.cactus.lu" },
    { nome: "Auchan Luxembourg", dominio: "www.auchan.lu" },
  ],
  IE: [
    { nome: "Tesco Ireland", dominio: "www.tesco.ie" },
    { nome: "Dunnes", dominio: "www.dunnesstoresgrocery.com" },
    { nome: "Lidl Ireland", dominio: "www.lidl.ie" },
  ],
  TR: [
    { nome: "Migros Sanal", dominio: "www.migros.com.tr" },
    { nome: "CarrefourSA", dominio: "www.carrefoursa.com" },
    { nome: "A101", dominio: "www.a101.com.tr" },
    { nome: "Sok Market", dominio: "www.sokmarket.com.tr" },
  ],
  GB: [
    { nome: "Sainsburys", dominio: "www.sainsburys.co.uk" },
    { nome: "Waitrose", dominio: "www.waitrose.com" },
    { nome: "Iceland", dominio: "www.iceland.co.uk" },
    { nome: "Booths", dominio: "www.booths.co.uk" },
    { nome: "Farmdrop", dominio: "www.abelandcole.co.uk" },
  ],
};

for (const [paese, elenco] of Object.entries(ALTRI)) {
  const visti = new Set((CANDIDATI[paese] ?? []).map((x) => x.dominio.toLowerCase()));
  CANDIDATI[paese] = [
    ...(CANDIDATI[paese] ?? []),
    ...elenco.filter((x) => !visti.has(x.dominio.toLowerCase())),
  ];
}

/**
 * Il terzo giro: i mercati fuori dall'Europa.
 *
 * Il censimento da cui veniamo era europeo, e si vede nei numeri: gli Stati
 * Uniti hanno ventimila indirizzi, il Canada cinquantamila, l'India novemila,
 * e Brasile, Messico e Australia non esistono proprio. Non perche' li' non si
 * faccia la spesa online — perche' nessuno li ha mai provati.
 *
 * E' anche l'unico posto dove restano indirizzi in quantita': in Europa
 * occidentale la caccia alle sitemap e' scesa a sei insegne ogni
 * quarantanove candidati.
 */
const FUORI_EUROPA: Record<string, Candidato[]> = {
  US: [
    { nome: "Walmart Grocery", dominio: "www.walmart.com" },
    { nome: "Target", dominio: "www.target.com" },
    { nome: "Publix", dominio: "www.publix.com" },
    { nome: "Safeway", dominio: "www.safeway.com" },
    { nome: "Albertsons", dominio: "www.albertsons.com" },
    { nome: "Wegmans", dominio: "www.wegmans.com" },
    { nome: "HEB", dominio: "www.heb.com" },
    { nome: "Meijer", dominio: "www.meijer.com" },
    { nome: "Giant Food", dominio: "giantfood.com" },
    { nome: "Stop and Shop", dominio: "stopandshop.com" },
    { nome: "Food Lion", dominio: "www.foodlion.com" },
    { nome: "Sprouts", dominio: "www.sprouts.com" },
    { nome: "Harris Teeter", dominio: "www.harristeeter.com" },
    { nome: "Vons", dominio: "www.vons.com" },
  ],
  CA: [
    { nome: "Loblaws", dominio: "www.loblaws.ca" },
    { nome: "Metro Canada", dominio: "www.metro.ca" },
    { nome: "Save On Foods", dominio: "www.saveonfoods.com" },
    { nome: "IGA Quebec", dominio: "www.iga.net" },
    { nome: "No Frills", dominio: "www.nofrills.ca" },
    { nome: "Real Canadian Superstore", dominio: "www.realcanadiansuperstore.ca" },
  ],
  BR: [
    { nome: "Pao de Acucar", dominio: "www.paodeacucar.com" },
    { nome: "Carrefour Brasil", dominio: "mercado.carrefour.com.br" },
    { nome: "Assai", dominio: "www.assai.com.br" },
    { nome: "Zona Sul", dominio: "www.zonasul.com.br" },
    { nome: "St Marche", dominio: "www.marche.com.br" },
    { nome: "Mambo", dominio: "www.mambo.com.br" },
  ],
  MX: [
    { nome: "Walmart Mexico", dominio: "super.walmart.com.mx" },
    { nome: "Chedraui", dominio: "www.chedraui.com.mx" },
    { nome: "Soriana", dominio: "www.soriana.com" },
    { nome: "La Comer", dominio: "www.lacomer.com.mx" },
    { nome: "City Market", dominio: "www.citymarket.com.mx" },
  ],
  AU: [
    { nome: "Woolworths", dominio: "www.woolworths.com.au" },
    { nome: "Coles", dominio: "www.coles.com.au" },
    { nome: "IGA Australia", dominio: "www.igashop.com.au" },
    { nome: "Harris Farm", dominio: "www.harrisfarm.com.au" },
  ],
  IN: [
    { nome: "BigBasket", dominio: "www.bigbasket.com" },
    { nome: "DMart", dominio: "www.dmart.in" },
    { nome: "Blinkit", dominio: "blinkit.com" },
    { nome: "Zepto", dominio: "www.zeptonow.com" },
  ],
  AE: [
    { nome: "Carrefour UAE", dominio: "www.carrefouruae.com" },
    { nome: "Lulu Hypermarket", dominio: "www.luluhypermarket.com" },
    { nome: "Spinneys", dominio: "www.spinneys.com" },
  ],
  ZA: [
    { nome: "Woolworths SA", dominio: "www.woolworths.co.za" },
    { nome: "Pick n Pay", dominio: "www.pnp.co.za" },
    { nome: "Makro SA", dominio: "www.makro.co.za" },
    { nome: "Shoprite", dominio: "www.shoprite.co.za" },
  ],
  NZ: [
    { nome: "Countdown", dominio: "www.woolworths.co.nz" },
    { nome: "New World", dominio: "www.newworld.co.nz" },
    { nome: "Pak n Save", dominio: "www.paknsave.co.nz" },
  ],
  JP: [
    { nome: "Rakuten Seiyu", dominio: "sm.rakuten.co.jp" },
    { nome: "Aeon", dominio: "shop.aeon.com" },
  ],
  IL: [
    { nome: "Shufersal", dominio: "www.shufersal.co.il" },
    { nome: "Rami Levy", dominio: "www.rami-levy.co.il" },
  ],
  UA: [
    { nome: "Silpo", dominio: "silpo.ua" },
    { nome: "ATB", dominio: "www.atbmarket.com" },
    { nome: "Novus", dominio: "novus.ua" },
  ],
};

for (const [paese, elenco] of Object.entries(FUORI_EUROPA)) {
  const visti = new Set((CANDIDATI[paese] ?? []).map((x) => x.dominio.toLowerCase()));
  CANDIDATI[paese] = [
    ...(CANDIDATI[paese] ?? []),
    ...elenco.filter((x) => !visti.has(x.dominio.toLowerCase())),
  ];
}

/**
 * Il quarto giro: America Latina, Golfo, Sud-est asiatico.
 *
 * Dopo i primi tre giri l'Europa occidentale e' spremuta — sei insegne ogni
 * quarantanove candidati — mentre il Brasile, il Messico e gli Emirati, provati
 * per la prima volta, hanno dato otto insegne su otto e quattrocentomila
 * indirizzi. Carrefour UAE da sola ne ha portati duecentocinquantamila.
 *
 * Il criterio per continuare e' quello: si va dove non abbiamo ancora guardato,
 * non dove abbiamo gia' guardato meglio.
 */
const ALTRI_MERCATI: Record<string, Candidato[]> = {
  BR: [
    { nome: "Carrefour Mercado", dominio: "mercado.carrefour.com.br" },
    { nome: "Sonda", dominio: "www.sondadelivery.com.br" },
    { nome: "Oba Hortifruti", dominio: "www.obahortifruti.com.br" },
    { nome: "Supermercado Now", dominio: "www.supermercadonow.com.br" },
    { nome: "Bistek", dominio: "www.bistek.com.br" },
    { nome: "Giassi", dominio: "www.giassi.com.br" },
    { nome: "Coop BR", dominio: "www.coopsp.com.br" },
  ],
  AR: [
    { nome: "Coto", dominio: "www.cotodigital3.com.ar" },
    { nome: "Disco", dominio: "www.disco.com.ar" },
    { nome: "Jumbo AR", dominio: "www.jumbo.com.ar" },
    { nome: "Vea", dominio: "www.vea.com.ar" },
    { nome: "La Anonima", dominio: "supermercado.laanonimaonline.com" },
  ],
  CL: [
    { nome: "Jumbo CL", dominio: "www.jumbo.cl" },
    { nome: "Lider", dominio: "www.lider.cl" },
    { nome: "Santa Isabel", dominio: "www.santaisabel.cl" },
    { nome: "Unimarc", dominio: "www.unimarc.cl" },
    { nome: "Tottus", dominio: "www.tottus.cl" },
  ],
  CO: [
    { nome: "Exito", dominio: "www.exito.com" },
    { nome: "Carulla", dominio: "www.carulla.com" },
    { nome: "Jumbo CO", dominio: "www.tiendasjumbo.co" },
    { nome: "Olimpica", dominio: "www.olimpica.com" },
    { nome: "Makro CO", dominio: "tienda.makro.com.co" },
  ],
  PE: [
    { nome: "Wong", dominio: "www.wong.pe" },
    { nome: "Plaza Vea", dominio: "www.plazavea.com.pe" },
    { nome: "Metro Peru", dominio: "www.metro.pe" },
    { nome: "Tottus Peru", dominio: "www.tottus.com.pe" },
  ],
  MX: [
    { nome: "Superama", dominio: "super.walmart.com.mx" },
    { nome: "HEB Mexico", dominio: "www.heb.com.mx" },
    { nome: "Fresko", dominio: "www.lacomer.com.mx" },
    { nome: "Merco", dominio: "www.merco.mx" },
  ],
  TH: [
    { nome: "Tops", dominio: "www.tops.co.th" },
    { nome: "Big C", dominio: "www.bigc.co.th" },
    { nome: "Makro Thailand", dominio: "www.makro.pro" },
  ],
  MY: [
    { nome: "Tesco Malaysia", dominio: "eshop.lotuss.com.my" },
    { nome: "Jaya Grocer", dominio: "www.jayagrocer.com" },
    { nome: "Village Grocer", dominio: "villagegrocer.com.my" },
  ],
  SG: [
    { nome: "FairPrice", dominio: "www.fairprice.com.sg" },
    { nome: "Cold Storage", dominio: "coldstorage.com.sg" },
    { nome: "Giant SG", dominio: "giant.sg" },
    { nome: "RedMart", dominio: "redmart.lazada.sg" },
  ],
  ID: [
    { nome: "Sayurbox", dominio: "www.sayurbox.com" },
    { nome: "Segari", dominio: "segari.id" },
    { nome: "TipTop", dominio: "www.tiptop.co.id" },
  ],
  PH: [
    { nome: "Landers", dominio: "www.landers.ph" },
    { nome: "Robinsons", dominio: "www.robinsonssupermarket.com.ph" },
    { nome: "Metromart", dominio: "www.metromart.com" },
  ],
  VN: [
    { nome: "Bach Hoa Xanh", dominio: "www.bachhoaxanh.com" },
    { nome: "Winmart", dominio: "winmart.vn" },
    { nome: "Co.opmart", dominio: "cooponline.vn" },
  ],
  SA: [
    { nome: "Panda", dominio: "www.panda.com.sa" },
    { nome: "Danube", dominio: "www.danube.sa" },
    { nome: "Carrefour KSA", dominio: "www.carrefourksa.com" },
    { nome: "Tamimi", dominio: "shop.tamimimarkets.com" },
  ],
  EG: [
    { nome: "Carrefour Egypt", dominio: "www.carrefouregypt.com" },
    { nome: "Gourmet Egypt", dominio: "www.gourmetegypt.com" },
  ],
  QA: [
    { nome: "Carrefour Qatar", dominio: "www.carrefourqatar.com" },
    { nome: "Lulu Qatar", dominio: "www.luluhypermarket.com" },
  ],
  KW: [
    { nome: "Carrefour Kuwait", dominio: "www.carrefourkuwait.com" },
    { nome: "Sultan Center", dominio: "sultancenter.com" },
  ],
  MA: [
    { nome: "Marjane", dominio: "www.marjane.ma" },
    { nome: "Carrefour Maroc", dominio: "www.carrefour.ma" },
  ],
  TR: [
    { nome: "Getir", dominio: "getir.com" },
    { nome: "Macrocenter", dominio: "www.macrocenter.com.tr" },
    { nome: "Metro Turkiye", dominio: "www.metro-tr.com" },
  ],
  PL: [
    { nome: "Zabka Jush", dominio: "www.zabkajush.pl" },
    { nome: "Stokrotka", dominio: "www.stokrotka.pl" },
    { nome: "Piotr i Pawel", dominio: "www.piotripawel.pl" },
  ],
  UA: [
    { nome: "Metro Ukraine", dominio: "metro.zakaz.ua" },
    { nome: "Auchan Ukraine", dominio: "auchan.zakaz.ua" },
    { nome: "Varus", dominio: "varus.zakaz.ua" },
  ],
};

for (const [paese, elenco] of Object.entries(ALTRI_MERCATI)) {
  const visti = new Set((CANDIDATI[paese] ?? []).map((x) => x.dominio.toLowerCase()));
  CANDIDATI[paese] = [
    ...(CANDIDATI[paese] ?? []),
    ...elenco.filter((x) => !visti.has(x.dominio.toLowerCase())),
  ];
}

/**
 * Il quinto giro: le specializzate dei paesi che ci lasciano leggere.
 *
 * I supermercati generalisti europei sono finiti - li abbiamo tutti. Ma i
 * paesi che collaborano non sono finiti come MERCATO: restano le
 * specializzate, e misurate ieri rendono benissimo. Tannico 100%, Alko 100%,
 * Nicolas 95%, Pets at Home 90%, Harris Farm 100%.
 *
 * Conta piu' di quanto sembri: un'insegna europea si legge a sessanta pagine
 * al secondo, una sudamericana a una ogni tre secondi. Diecimila indirizzi
 * tedeschi valgono, in tempo macchina, quanto duecentomila argentini.
 *
 * Per questo si cerca qui e non altrove: non dove ci sono piu' indirizzi, ma
 * dove si possono davvero aprire.
 */
const SPECIALIZZATE: Record<string, Candidato[]> = {
  DE: [
    { nome: "Rossmann Shop", dominio: "www.rossmann.de" },
    { nome: "Muller DE", dominio: "www.mueller.de" },
    { nome: "Zooplus DE", dominio: "www.zooplus.de" },
    { nome: "Fressnapf Shop", dominio: "www.fressnapf.de" },
    { nome: "Weinfreunde DE", dominio: "www.weinfreunde.de" },
    { nome: "Getraenke Hoffmann", dominio: "www.getraenke-hoffmann.de" },
    { nome: "Vinos", dominio: "www.vinos.de" },
    { nome: "Hawesko", dominio: "www.hawesko.de" },
    { nome: "Reformhaus", dominio: "www.reformhaus.de" },
    { nome: "Koro", dominio: "www.korodrogerie.de" },
    { nome: "Gewuerzhaus", dominio: "www.gewuerzhaus.de" },
    { nome: "Seeberger", dominio: "www.seeberger.de" },
  ],
  FR: [
    { nome: "Zooplus FR", dominio: "www.zooplus.fr" },
    { nome: "Vente Privee Vin", dominio: "www.vinatis.com" },
    { nome: "Nicolas FR", dominio: "www.nicolas.com" },
    { nome: "Cave SF", dominio: "www.cavesf.com" },
    { nome: "Greenweez FR", dominio: "www.greenweez.com" },
    { nome: "Naturalia FR", dominio: "www.naturalia.fr" },
    { nome: "Onatera", dominio: "www.onatera.com" },
    { nome: "Aroma Zone", dominio: "www.aroma-zone.com" },
    { nome: "Maxicoffee", dominio: "www.maxicoffee.com" },
    { nome: "Bienmanger", dominio: "www.bienmanger.com" },
  ],
  GB: [
    { nome: "Zooplus UK", dominio: "www.zooplus.co.uk" },
    { nome: "Majestic Wine", dominio: "www.majestic.co.uk" },
    { nome: "Naked Wines", dominio: "www.nakedwines.com" },
    { nome: "Laithwaites", dominio: "www.laithwaites.co.uk" },
    { nome: "Ocado Zoom", dominio: "www.ocado.com" },
    { nome: "Bulk", dominio: "www.bulk.com" },
    { nome: "MuscleFood UK", dominio: "www.musclefood.com" },
    { nome: "Approved Food", dominio: "approvedfood.co.uk" },
    { nome: "Sous Chef", dominio: "www.souschef.co.uk" },
    { nome: "Real Foods", dominio: "www.realfoods.co.uk" },
  ],
  IT: [
    { nome: "Tannico IT", dominio: "www.tannico.it" },
    { nome: "Vino com IT", dominio: "www.vino.com" },
    { nome: "Callmewine", dominio: "www.callmewine.com" },
    { nome: "Zooplus IT", dominio: "www.zooplus.it" },
    { nome: "Arcaplanet IT", dominio: "www.arcaplanet.it" },
    { nome: "Bennet Online", dominio: "www.bennet.com" },
    { nome: "Il Gigante Spesa", dominio: "www.ilgigante.net" },
    { nome: "Coop Shop IT", dominio: "www.coopshop.it" },
    { nome: "Terre di Puglia", dominio: "www.terredipuglia.it" },
    { nome: "Gustorotondo", dominio: "www.gustorotondo.it" },
  ],
  ES: [
    { nome: "Zooplus ES", dominio: "www.zooplus.es" },
    { nome: "Bodeboca", dominio: "www.bodeboca.com" },
    { nome: "Vinissimus ES", dominio: "www.vinissimus.com" },
    { nome: "Tiendanimal ES", dominio: "www.tiendanimal.es" },
    { nome: "Herbolario Navarro", dominio: "www.herbolarionavarro.es" },
    { nome: "Naturitas ES", dominio: "www.naturitas.es" },
    { nome: "Planeta Huerto", dominio: "www.planetahuerto.es" },
  ],
  NL: [
    { nome: "Zooplus NL", dominio: "www.zooplus.nl" },
    { nome: "Gall en Gall", dominio: "www.gall.nl" },
    { nome: "Slijterij", dominio: "www.drankdozijn.nl" },
    { nome: "Holland en Barrett NL", dominio: "www.hollandandbarrett.nl" },
    { nome: "De Notenshop", dominio: "www.denotenshop.nl" },
  ],
  AT: [
    { nome: "Zooplus AT", dominio: "www.zooplus.at" },
    { nome: "Weinwelt", dominio: "www.weinwelt.at" },
    { nome: "Bipa AT", dominio: "www.bipa.at" },
    { nome: "Mueller AT", dominio: "www.mueller.at" },
  ],
  CH: [
    { nome: "Zooplus CH", dominio: "www.zooplus.ch" },
    { nome: "Flaschenpost CH", dominio: "www.flaschenpost.ch" },
    { nome: "Qoqa", dominio: "www.qoqa.ch" },
    { nome: "Brack", dominio: "www.brack.ch" },
  ],
  BE: [
    { nome: "Zooplus BE", dominio: "www.zooplus.be" },
    { nome: "Drinks Company", dominio: "www.drinkscompany.be" },
    { nome: "Bol Belgie", dominio: "www.bol.com" },
  ],
  PL: [
    { nome: "Zooplus PL", dominio: "www.zooplus.pl" },
    { nome: "Rossmann PL", dominio: "www.rossmann.pl" },
    { nome: "Hebe", dominio: "www.hebe.pl" },
    { nome: "Winezja", dominio: "www.winezja.pl" },
  ],
  CZ: [
    { nome: "Zooplus CZ", dominio: "www.zooplus.cz" },
    { nome: "Rohlik CZ", dominio: "www.rohlik.cz" },
    { nome: "Notino", dominio: "www.notino.cz" },
    { nome: "Dr Max", dominio: "www.drmax.cz" },
  ],
  SE: [
    { nome: "Zooplus SE", dominio: "www.zooplus.se" },
    { nome: "Apotea SE", dominio: "www.apotea.se" },
    { nome: "Arken Zoo", dominio: "www.arkenzoo.se" },
  ],
  DK: [
    { nome: "Zooplus DK", dominio: "www.zooplus.dk" },
    { nome: "Matas DK", dominio: "www.matas.dk" },
    { nome: "Nemlig DK", dominio: "www.nemlig.com" },
  ],
  NO: [
    { nome: "Zooplus NO", dominio: "www.zooplus.no" },
    { nome: "Vinmonopolet NO", dominio: "www.vinmonopolet.no" },
    { nome: "Apotek1", dominio: "www.apotek1.no" },
  ],
  FI: [
    { nome: "Zooplus FI", dominio: "www.zooplus.fi" },
    { nome: "Musti", dominio: "www.mustijamirri.fi" },
    { nome: "Alko FI", dominio: "www.alko.fi" },
  ],
  PT: [
    { nome: "Zooplus PT", dominio: "www.zooplus.pt" },
    { nome: "Celeiro PT", dominio: "www.celeiro.pt" },
    { nome: "Garrafeira Soares", dominio: "www.garrafeirasoares.pt" },
  ],
  IE: [
    { nome: "Zooplus IE", dominio: "www.zooplus.ie" },
    { nome: "Petstop", dominio: "www.petstop.ie" },
    { nome: "O Briens Wine", dominio: "www.obrienswine.ie" },
  ],
};

for (const [paese, elenco] of Object.entries(SPECIALIZZATE)) {
  const visti = new Set((CANDIDATI[paese] ?? []).map((x) => x.dominio.toLowerCase()));
  CANDIDATI[paese] = [
    ...(CANDIDATI[paese] ?? []),
    ...elenco.filter((x) => !visti.has(x.dominio.toLowerCase())),
  ];
}

/**
 * Il sesto giro: ancora specializzate, perche' il metodo funziona.
 *
 * Il quinto giro ne ha provate centosette e ne sono passate dieci, con
 * novantacinquemila indirizzi al novanta-cento per cento di resa. Un decimo
 * di quel che serve, con mezz'ora di lavoro: la scala si ottiene ripetendo.
 *
 * Qui ce ne sono altre centotrenta, sempre nei paesi che ci lasciano leggere:
 * biologico, enoteche, torrefazioni, integratori, gastronomie.
 */
const SPECIALIZZATE_2: Record<string, Candidato[]> = {
  DE: [
    { nome: "Alnatura Shop", dominio: "www.alnatura.de" },
    { nome: "Basic Bio", dominio: "www.basicbio.de" },
    { nome: "Bio Company", dominio: "www.biocompany.de" },
    { nome: "Vitalia", dominio: "www.vitalia-reformhaus.de" },
    { nome: "Kraeuterhaus", dominio: "www.kraeuterhaus.de" },
    { nome: "Vitafy", dominio: "www.vitafy.de" },
    { nome: "Foodspring", dominio: "www.foodspring.de" },
    { nome: "Nu3", dominio: "www.nu3.de" },
    { nome: "Dallmayr", dominio: "www.dallmayr.com" },
    { nome: "Tchibo", dominio: "www.tchibo.de" },
    { nome: "Gourmondo", dominio: "www.gourmondo.de" },
    { nome: "Frischeparadies", dominio: "www.frischeparadies.de" },
    { nome: "Wein und Vinos", dominio: "www.vinos.de" },
    { nome: "Belvini", dominio: "www.belvini.de" },
    { nome: "Weinquelle", dominio: "www.weinquelle.com" },
    { nome: "Tee Gschwendner", dominio: "www.teegschwendner.de" },
  ],
  FR: [
    { nome: "La Vie Claire", dominio: "www.lavieclaire.com" },
    { nome: "Naturalia Bio", dominio: "www.naturalia.fr" },
    { nome: "Satoriz", dominio: "www.satoriz.fr" },
    { nome: "Kazidomi", dominio: "www.kazidomi.com" },
    { nome: "Ducs de Gascogne", dominio: "www.ducsdegascogne.com" },
    { nome: "Fauchon", dominio: "www.fauchon.com" },
    { nome: "Vinatis", dominio: "www.vinatis.com" },
    { nome: "Millesima", dominio: "www.millesima.fr" },
    { nome: "iDealwine", dominio: "www.idealwine.com" },
    { nome: "Chateaunet", dominio: "www.chateaunet.com" },
    { nome: "Comptoir de Mathilde", dominio: "www.comptoirdemathilde.com" },
    { nome: "Grand Cru", dominio: "www.vinatis.com" },
  ],
  GB: [
    { nome: "Planet Organic", dominio: "www.planetorganic.com" },
    { nome: "Abel and Cole", dominio: "www.abelandcole.co.uk" },
    { nome: "Riverford", dominio: "www.riverford.co.uk" },
    { nome: "Wing Yip", dominio: "www.wingyipstore.co.uk" },
    { nome: "Whisky Exchange", dominio: "www.thewhiskyexchange.com" },
    { nome: "Master of Malt", dominio: "www.masterofmalt.com" },
    { nome: "Berry Bros", dominio: "www.bbr.com" },
    { nome: "Hotel Chocolat", dominio: "www.hotelchocolat.com" },
    { nome: "Cocoa Runners", dominio: "cocoarunners.com" },
    { nome: "Melbury and Appleton", dominio: "www.melburyandappleton.co.uk" },
    { nome: "Natures Healthbox", dominio: "www.natureshealthbox.co.uk" },
  ],
  IT: [
    { nome: "Bernabei", dominio: "www.bernabei.it" },
    { nome: "Xtrawine", dominio: "www.xtrawine.com" },
    { nome: "Signorvino", dominio: "www.signorvino.com" },
    { nome: "Il Giardino dei Libri", dominio: "www.ilgiardinodeilibri.it" },
    { nome: "Vinoclick", dominio: "www.vinoclick.it" },
    { nome: "Bottega Verde", dominio: "www.bottegaverde.it" },
    { nome: "Agricook", dominio: "www.agricook.it" },
    { nome: "Isolabella", dominio: "www.isolabellaspa.it" },
  ],
  ES: [
    { nome: "Herbolario Navarro ES", dominio: "www.herbolarionavarro.es" },
    { nome: "Bodeboca ES", dominio: "www.bodeboca.com" },
    { nome: "Uvinum", dominio: "www.uvinum.es" },
    { nome: "Decantalo", dominio: "www.decantalo.com" },
    { nome: "Kuanzu", dominio: "www.kuanzu.com" },
    { nome: "Tienda Vegana", dominio: "www.tiendavegana.com" },
  ],
  NL: [
    { nome: "Odin", dominio: "www.odin.nl" },
    { nome: "Marqt", dominio: "www.marqt.com" },
    { nome: "De Tuinen", dominio: "www.detuinen.nl" },
    { nome: "Vitaminstore", dominio: "www.vitaminstore.nl" },
    { nome: "Wijnvoordeel", dominio: "www.wijnvoordeel.nl" },
    { nome: "Gall en Gall NL", dominio: "www.gall.nl" },
  ],
  AT: [
    { nome: "Denns AT", dominio: "www.denns-biomarkt.at" },
    { nome: "Wein und Co", dominio: "www.weinco.at" },
    { nome: "Weinco AT", dominio: "www.weinco.at" },
  ],
  CH: [
    { nome: "Alnatura CH", dominio: "www.alnatura.ch" },
    { nome: "Flaschenpost CH", dominio: "www.flaschenpost.ch" },
    { nome: "Farmy CH", dominio: "www.farmy.ch" },
  ],
  SE: [
    { nome: "Life SE", dominio: "www.lifebutiken.se" },
    { nome: "Gymgrossisten", dominio: "www.gymgrossisten.com" },
    { nome: "Bodystore", dominio: "www.bodystore.com" },
    { nome: "Systembolaget", dominio: "www.systembolaget.se" },
  ],
  DK: [
    { nome: "Helsam", dominio: "www.helsam.dk" },
    { nome: "Aarstiderne", dominio: "www.aarstiderne.com" },
    { nome: "Vin med Mere", dominio: "www.vinmedmere.dk" },
  ],
  NO: [
    { nome: "Life NO", dominio: "www.lifebutikken.no" },
    { nome: "Sunkost", dominio: "www.sunkost.no" },
  ],
  FI: [
    { nome: "Ruohonjuuri", dominio: "www.ruohonjuuri.fi" },
    { nome: "Life FI", dominio: "www.life.fi" },
  ],
  PL: [
    { nome: "Bee Organic", dominio: "www.beeorganic.pl" },
    { nome: "Organic Market PL", dominio: "www.organicmarket.pl" },
    { nome: "Winestone", dominio: "www.winestone.pl" },
  ],
  CZ: [
    { nome: "Bezobalu", dominio: "www.bezobalu.org" },
    { nome: "Countrylife", dominio: "www.countrylife.cz" },
    { nome: "Vinotéka", dominio: "www.global-wines.cz" },
  ],
  PT: [
    { nome: "Go Natural", dominio: "www.gonatural.pt" },
    { nome: "Garrafeira Tio Pepe", dominio: "www.garrafeiratiopepe.pt" },
  ],
  IE: [
    { nome: "Nourish", dominio: "www.nourish.ie" },
    { nome: "Evergreen IE", dominio: "www.evergreen.ie" },
    { nome: "Wines Direct", dominio: "www.winesdirect.ie" },
  ],
  BE: [
    { nome: "Bioplanet BE", dominio: "www.bioplanet.be" },
    { nome: "Delhaize Wine", dominio: "www.delhaizewineworld.com" },
  ],
};

for (const [paese, elenco] of Object.entries(SPECIALIZZATE_2)) {
  const visti = new Set((CANDIDATI[paese] ?? []).map((x) => x.dominio.toLowerCase()));
  CANDIDATI[paese] = [
    ...(CANDIDATI[paese] ?? []),
    ...elenco.filter((x) => !visti.has(x.dominio.toLowerCase())),
  ];
}
