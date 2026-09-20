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
