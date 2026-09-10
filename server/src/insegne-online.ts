/**
 * I negozi che, paese per paese, pubblicano davvero i prezzi online.
 *
 * DA DOVE VIENE
 * -------------
 * Da una ricognizione fatta a mano su cinquanta paesi europei, verificata il
 * 2026-09-08: per ogni catena si e' guardato se il catalogo e' consultabile
 * dal web, se i prezzi si vedono senza registrarsi e se si compra davvero.
 * Sono rimaste 115 insegne su 118 esaminate.
 *
 * POI LE ABBIAMO APERTE UNA PER UNA
 * ---------------------------------
 * `scripts/verifica-insegne.mjs` chiede a tutti e 118 gli indirizzi, con
 * l'identita' di un browser vero. Esito:
 *
 *     111/118 in piedi (94%)
 *      33     respingono i robot con un 403 — il sito c'e', l'utente entra
 *       6     non rispondono
 *       1     e' il Vaticano, che il censimento stesso dichiara senza negozi
 *
 * Dei sei, due sono morti davvero e li abbiamo tolti da qui: Farmy (nessun
 * DNS per www.farmy.ch) e CosiComodo (404 sulla home e su ogni percorso
 * provato). Due — IperDrive e Carrefour Andorra — hanno DNS e indirizzo IP
 * giusti ma vanno in timeout da noi: sembra un blocco per zona, non una
 * chiusura, e restano. Nemlig e Getir rispondono, solo in modo strano (302
 * ciclico il primo, 405 sulla home il secondo).
 *
 * Una cosa che il controllo NON dimostra: quante di queste mostrino i prezzi.
 * Su ventisei pagine con una cifra in valuta, tredici erano il carrello vuoto
 * — «0,00 €» — non un prodotto. I prezzi veri si sono visti su tredici siti;
 * per gli altri la pagina si disegna nel browser e al nostro server arriva un
 * guscio. Non e' una brutta notizia, e' un non-so: il motore i prezzi li
 * trova comunque, come mostrano le prove sul campo.
 *
 * A COSA SERVE
 * ------------
 * A non far cercare al vuoto. Il motore trova i prezzi cercando su Google, e
 * dove ha cercato bene la copertura e' piena; ma quando in un paese non sa
 * quali catene guardare, ripiega su negozietti e importatori — e' successo in
 * Italia con Cortilia ed Eataly, con un prodotto verificato su ventinove.
 * Questo elenco gli dice dove guardare per primo.
 *
 * ATTENZIONE, NON E' ACCESO DI DEFAULT.
 * Quando questo elenco e' stato costruito, il flusso "spesa prima" trovava
 * gia' un prezzo e un link per il 100% dei prodotti a Napoli e ad Atene:
 * suggerire insegne a un motore che gia' azzecca non puo' migliorare nulla e
 * puo' peggiorare, come e' successo l'ultima volta che il prompt e' stato
 * allungato. Si accende con INSEGNE_HINT=1 per provarlo dove la copertura
 * scende, e si misura con scripts/prova-spesa-prima.mjs.
 *
 * IL LIMITE DA SAPERE
 * -------------------
 * Copre l'Europa. Fuori — Giappone, Australia, Stati Uniti — non c'e' niente,
 * e la funzione restituisce un elenco vuoto: il motore si arrangia come prima,
 * che e' esattamente il comportamento voluto.
 */

export interface Insegna {
  /** Come si chiama, per il prompt e per l'etichetta mostrata all'utente. */
  nome: string;
  /** Il dominio: serve a riconoscere un link come "di un negozio vero". */
  dominio: string;
  /**
   * Catalogo completo e prezzi in chiaro, non solo una vetrina.
   * Le insegne "alta" vanno suggerite per prime.
   */
  alta: boolean;
}

/** Per codice ISO 3166-1 alpha-2, maiuscolo. */
const PER_PAESE: Record<string, Insegna[]> = {
  AD: [{ nome: "Carrefour Andorra 2000", dominio: "andorra2000.com", alta: true }],
  AL: [{ nome: "SPAR Albania Online", dominio: "shop.spar.al", alta: true }],
  AM: [{ nome: "SAS Online Supermarket", dominio: "sas.am", alta: true }],
  AT: [{ nome: "BILLA Online Shop", dominio: "shop.billa.at", alta: true }, { nome: "Gurkerl", dominio: "gurkerl.at", alta: true }],
  AZ: [{ nome: "Wolt Supermarkets Baku", dominio: "wolt.com", alta: false }, { nome: "Bravo Supermarket via Wolt", dominio: "wolt.com", alta: false }, { nome: "Wolt Market", dominio: "explore.wolt.com", alta: false }],
  BA: [{ nome: "Glovo Sarajevo - Spesa", dominio: "glovoapp.com", alta: false }],
  BE: [{ nome: "Delhaize Online", dominio: "delhaize.be", alta: true }, { nome: "Carrefour Belgium", dominio: "carrefour.be", alta: true }, { nome: "Collect&Go / Colruyt", dominio: "collectandgo.be", alta: true }],
  BG: [{ nome: "eBag", dominio: "ebag.bg", alta: true }],
  BY: [{ nome: "E-dostavka", dominio: "e-dostavka.by", alta: false }],
  CH: [{ nome: "Coop Online", dominio: "coop.ch", alta: true }, { nome: "Migros Online", dominio: "migros.ch", alta: true }, { nome: "Farmy", dominio: "farmy.ch", alta: true }],
  CY: [{ nome: "Alphamega Online", dominio: "alphamega.com.cy", alta: true }, { nome: "Foody Supermarket", dominio: "foody.com.cy", alta: false }],
  CZ: [{ nome: "Rohlik.cz", dominio: "rohlik.cz", alta: true }, { nome: "Košík.cz", dominio: "kosik.cz", alta: true }],
  DE: [{ nome: "REWE Online", dominio: "rewe.de", alta: true }, { nome: "flaschenpost Supermarkt", dominio: "flaschenpost.de", alta: true }, { nome: "Knuspr", dominio: "knuspr.de", alta: true }],
  DK: [{ nome: "Nemlig.com", dominio: "nemlig.com", alta: true }, { nome: "BilkaToGo", dominio: "bilkatogo.dk", alta: false }],
  EE: [{ nome: "Selver e-shop", dominio: "selver.ee", alta: true }, { nome: "Rimi e-store", dominio: "rimi.ee", alta: true }, { nome: "Barbora Estonia", dominio: "barbora.ee", alta: true }],
  ES: [{ nome: "DIA Online", dominio: "dia.es", alta: true }, { nome: "Mercadona Online", dominio: "tienda.mercadona.es", alta: true }, { nome: "Carrefour España", dominio: "carrefour.es", alta: true }, { nome: "Alcampo Online", dominio: "compraonline.alcampo.es", alta: true }],
  FI: [{ nome: "K-Ruoka", dominio: "k-ruoka.fi", alta: true }, { nome: "S-kaupat", dominio: "s-kaupat.fi", alta: true }],
  FR: [{ nome: "Carrefour France", dominio: "carrefour.fr", alta: true }, { nome: "Auchan Courses", dominio: "auchan.fr", alta: true }, { nome: "Monoprix", dominio: "monoprix.fr", alta: true }, { nome: "E.Leclerc Drive", dominio: "leclercdrive.fr", alta: true }],
  GB: [{ nome: "Tesco Groceries", dominio: "tesco.com", alta: true }, { nome: "Sainsbury's Groceries", dominio: "sainsburys.co.uk", alta: true }, { nome: "ASDA Groceries", dominio: "groceries.asda.com", alta: true }, { nome: "Morrisons Groceries", dominio: "groceries.morrisons.com", alta: true }, { nome: "Ocado", dominio: "ocado.com", alta: true }, { nome: "Waitrose", dominio: "waitrose.com", alta: true }, { nome: "Iceland Foods", dominio: "iceland.co.uk", alta: true }],
  GE: [{ nome: "Goodwill", dominio: "goodwill.ge", alta: true }],
  GR: [{ nome: "efood Supermarket", dominio: "e-food.gr", alta: false }, { nome: "AB Vassilopoulos via efood", dominio: "ab.gr", alta: false }],
  HR: [{ nome: "Konzum Online", dominio: "konzum.hr", alta: true }],
  HU: [{ nome: "Tesco Otthonról", dominio: "bevasarlas.tesco.hu", alta: true }, { nome: "Auchan Online", dominio: "auchan.hu", alta: true }, { nome: "Kifli.hu", dominio: "kifli.hu", alta: true }],
  IE: [{ nome: "Tesco Ireland Groceries", dominio: "tesco.ie", alta: true }, { nome: "SuperValu Online", dominio: "shop.supervalu.ie", alta: true }, { nome: "Dunnes Stores Grocery", dominio: "dunnesstoresgrocery.com", alta: false }],
  IS: [{ nome: "Wolt Supermarkets Reykjavik", dominio: "wolt.com", alta: false }],
  IT: [{ nome: "Conad Spesa Online", dominio: "spesaonline.conad.it", alta: true }, { nome: "Carrefour Italia", dominio: "carrefour.it", alta: true }, { nome: "Esselunga a Casa", dominio: "spesaonline.esselunga.it", alta: true }, { nome: "CoopShop", dominio: "coopshop.it", alta: true }, { nome: "EasyCoop", dominio: "easycoop.com", alta: true }, { nome: "Pam a Casa", dominio: "pamacasa.pampanorama.it", alta: true }, { nome: "Unes Spesa Online", dominio: "spesaonline.unes.it", alta: true }, { nome: "Tigros", dominio: "tigros.it", alta: false }, { nome: "Iperal Spesa Online", dominio: "iperalspesaonline.it", alta: true }, { nome: "IperDrive", dominio: "iperdrive.it", alta: true }, { nome: "Cortilia", dominio: "cortilia.it", alta: true }, { nome: "Everli", dominio: "it.everli.com", alta: false }],
  LI: [{ nome: "Migros Online", dominio: "migros.ch", alta: true }],
  LT: [{ nome: "Barbora Lithuania", dominio: "barbora.lt", alta: true }, { nome: "Rimi e-shop", dominio: "rimi.lt", alta: true }, { nome: "LastMile", dominio: "lastmile.lt", alta: false }],
  LU: [{ nome: "Auchan Luxembourg", dominio: "auchan.lu", alta: true }],
  LV: [{ nome: "Rimi e-veikals", dominio: "rimi.lv", alta: true }, { nome: "Barbora Latvia", dominio: "barbora.lv", alta: true }],
  MC: [{ nome: "Carrefour Market Monaco", dominio: "carrefour.fr", alta: true }, { nome: "Carrefour Monaco Fontvieille", dominio: "carrefour.fr", alta: true }],
  MD: [{ nome: "Linella Online", dominio: "linella.md", alta: true }, { nome: "METRO via Zakaz.md", dominio: "zakaz.md", alta: false }],
  ME: [{ nome: "IDEA Online", dominio: "idea.co.me", alta: true }],
  MK: [{ nome: "Wolt Supermarkets Skopje", dominio: "wolt.com", alta: false }, { nome: "Wolt Market", dominio: "explore.wolt.com", alta: false }],
  MT: [{ nome: "Greens Supermarket", dominio: "greens.com.mt", alta: true }, { nome: "Welbee's", dominio: "welbees.mt", alta: true }],
  NL: [{ nome: "Albert Heijn", dominio: "ah.nl", alta: true }, { nome: "Jumbo", dominio: "jumbo.com", alta: true }, { nome: "Picnic", dominio: "picnic.app", alta: false }],
  NO: [{ nome: "Oda", dominio: "oda.com", alta: true }, { nome: "SPAR Nettbutikk", dominio: "spar.no", alta: false }, { nome: "MENY Nettbutikk", dominio: "meny.no", alta: false }],
  PL: [{ nome: "Frisco.pl", dominio: "frisco.pl", alta: true }, { nome: "Auchan Zakupy", dominio: "zakupy.auchan.pl", alta: true }],
  PT: [{ nome: "Continente Online", dominio: "continente.pt", alta: true }, { nome: "Auchan Portugal", dominio: "auchan.pt", alta: true }, { nome: "Mercadão", dominio: "mercadao.pt", alta: false }],
  RO: [{ nome: "Mega Image Online", dominio: "mega-image.ro", alta: true }, { nome: "Freshful", dominio: "freshful.ro", alta: true }, { nome: "Sezamo", dominio: "sezamo.ro", alta: true }],
  RS: [{ nome: "IDEA Online", dominio: "online.idea.rs", alta: true }, { nome: "Maxi Online", dominio: "maxi.rs", alta: false }],
  RU: [{ nome: "Vprok / Perekrestok", dominio: "vprok.ru", alta: false }],
  SE: [{ nome: "ICA Handla Online", dominio: "ica.se", alta: false }, { nome: "Mathem", dominio: "mathem.se", alta: true }, { nome: "Willys Online", dominio: "willys.se", alta: false }],
  SI: [{ nome: "Mercator Online", dominio: "mercatoronline.si", alta: true }, { nome: "SPAR Online", dominio: "online.spar.si", alta: true }],
  SK: [{ nome: "Tesco Online Nákupy", dominio: "potravinydomov.itesco.sk", alta: true }],
  SM: [{ nome: "Lenny Spesa", dominio: "lenny.sm", alta: false }],
  TR: [{ nome: "Migros Sanal Market", dominio: "migros.com.tr", alta: true }, { nome: "CarrefourSA Online", dominio: "carrefoursa.com", alta: true }],
  UA: [{ nome: "Silpo", dominio: "shop.silpo.ua", alta: true }, { nome: "Zakaz.ua", dominio: "zakaz.ua", alta: false }],
  XK: [{ nome: "Wolt Supermarkets Pristina", dominio: "wolt.com", alta: false }],
};

/**
 * I paesi che non hanno un e-commerce alimentare proprio, ma sono serviti da
 * quello di un vicino: chi vive a San Marino compra sui siti italiani.
 */
const SERVITO_DA: Record<string, string> = {
  VA: "IT",
  SM: "IT",
  MC: "FR",
  LI: "CH",
};

/** Le insegne di un paese, le piu' complete per prime. Vuoto se non lo copriamo. */
export function insegnePerPaese(iso: string): Insegna[] {
  const cc = (iso || "").toUpperCase().slice(0, 2);
  const dirette = PER_PAESE[cc];
  if (dirette && dirette.length > 0) return [...dirette].sort((a, b) => Number(b.alta) - Number(a.alta));
  const vicino = SERVITO_DA[cc];
  return vicino ? insegnePerPaese(vicino) : [];
}

/** Acceso solo se richiesto: vedi la nota in cima al file. */
export function suggerimentoInsegneAttivo(): boolean {
  return process.env.INSEGNE_HINT === "1";
}

/**
 * La strada in cui i link NON li chiediamo al modello: li costruiamo noi.
 *
 * L'IDEA
 * ------
 * Il modello i prezzi li trova; i link se li inventa, perche' l'indirizzo
 * esatto di una scheda prodotto non ha modo di conoscerlo quando il catalogo
 * sta dietro un login. Misurato su Napoli: Cortilia 0 pagine aperte su 12,
 * Eataly 0 su 4, Amazon 0 su 6 — prezzi credibili, indirizzi inesistenti.
 *
 * Allora non glieli chiediamo. Gli si chiede il prodotto, il prezzo e il
 * negozio — scelto da un elenco chiuso — e l'indirizzo lo mette insieme
 * questo server dal dominio censito. Un link cosi' non puo' essere sbagliato:
 * nessuno lo ha inventato.
 *
 * COSA SI PERDE
 * -------------
 * L'utente arriva sulla ricerca del supermercato invece che sulla scheda del
 * prodotto: un tocco in piu'. Nell'ultimo giro su Napoli succedeva gia' per
 * trenta righe su trentacinque, quindi si perde molto meno di quanto sembri.
 *
 * Si accende con LINK_COSTRUITI=1 e vale solo dove il paese e' censito:
 * altrove non c'e' un elenco chiuso da dare, e si torna a chiedere i link.
 */
export function linkCostruitiAttivo(iso: string): boolean {
  return process.env.LINK_COSTRUITI === "1" && insegnePerPaese(iso).length > 0;
}

/**
 * L'elenco chiuso da mettere nel prompt.
 *
 * Chiuso davvero: il negozio deve essere uno di questi, scritto identico,
 * perche' e' la chiave con cui poi si ritrova il dominio. Un nome fuori
 * elenco e' una riga che non sapremmo dove mandare.
 */
export function elencoChiuso(iso: string, quante = 8): string[] {
  return insegnePerPaese(iso).slice(0, quante).map((i) => i.nome);
}

/** Il dominio di un'insegna dell'elenco, dal nome che il modello ha scritto. */
export function dominioDiInsegna(iso: string, nome: string): string | null {
  const cercato = (nome || "").trim().toLowerCase();
  if (!cercato) return null;
  const insegne = insegnePerPaese(iso);
  const esatta = insegne.find((i) => i.nome.toLowerCase() === cercato);
  if (esatta) return esatta.dominio;
  // Il modello accorcia: «Conad» per «Conad Spesa Online». Si accetta, purche'
  // resti una sola corrispondenza — due sarebbero un tiro a indovinare.
  const parziali = insegne.filter(
    (i) => i.nome.toLowerCase().includes(cercato) || cercato.includes(i.nome.toLowerCase().split(/\s+/)[0]),
  );
  return parziali.length === 1 ? parziali[0].dominio : null;
}

/**
 * La riga da infilare nel prompt dei prezzi.
 *
 * Corta di proposito: i prompt lunghi hanno gia' fatto smettere di cercare il
 * modello una volta, e sei nomi bastano a orientarlo senza sovrastare il resto
 * delle istruzioni.
 */
export function rigaInsegne(iso: string, quante = 6): string {
  if (!suggerimentoInsegneAttivo()) return "";
  const insegne = insegnePerPaese(iso).slice(0, quante);
  if (insegne.length === 0) return "";
  return `Catene con listino online in questo paese: ${insegne.map((i) => i.nome).join(", ")}.`;
}

/** Quanti paesi copriamo: serve alla documentazione e agli script di prova. */
export function paesiCoperti(): string[] {
  return Object.keys(PER_PAESE).sort();
}

/**
 * Dal nome del paese al suo codice.
 *
 * PERCHE' STA QUI E NON NEL SERVER
 * --------------------------------
 * Perche' tutto cio' che dipende dal paese — le insegne, il mercato Amazon,
 * il paese di ricerca — parte da questa conversione, e prima viveva dentro
 * `index.ts` con una dozzina di paesi soli. Fuori da quella dozzina tornava
 * `"it"`: cioe' `Ελλάδα` diventava Italia, e ad Atene si cercava su Amazon.it.
 * Un errore silenzioso, che non fa fallire niente e sbaglia tutto.
 *
 * Ora copre i cinquanta paesi del censimento piu' i principali fuori Europa,
 * ciascuno con il nome italiano, quello inglese e quello che gli abitanti
 * usano davvero — perche' l'app manda il paese nella lingua dell'utente.
 */
const ISO_PER_NOME: Record<string, string> = {
  italia: "IT", italy: "IT",
  francia: "FR", france: "FR",
  spagna: "ES", "españa": "ES", espana: "ES", spain: "ES",
  germania: "DE", deutschland: "DE", germany: "DE",
  "paesi bassi": "NL", nederland: "NL", olanda: "NL", netherlands: "NL", holland: "NL",
  "regno unito": "GB", "united kingdom": "GB", uk: "GB", inghilterra: "GB",
  england: "GB", "gran bretagna": "GB", "great britain": "GB", scotland: "GB",
  svizzera: "CH", schweiz: "CH", suisse: "CH", switzerland: "CH", svizzera_it: "CH",
  austria: "AT", "österreich": "AT", osterreich: "AT",
  belgio: "BE", belgium: "BE", "belgië": "BE", belgique: "BE",
  portogallo: "PT", portugal: "PT",
  grecia: "GR", greece: "GR", "ελλάδα": "GR", ellada: "GR", "hellas": "GR",
  irlanda: "IE", ireland: "IE", eire: "IE",
  danimarca: "DK", denmark: "DK", danmark: "DK",
  svezia: "SE", sweden: "SE", sverige: "SE",
  norvegia: "NO", norway: "NO", norge: "NO",
  finlandia: "FI", finland: "FI", suomi: "FI",
  islanda: "IS", iceland: "IS", island: "IS",
  polonia: "PL", poland: "PL", polska: "PL",
  "repubblica ceca": "CZ", czechia: "CZ", "czech republic": "CZ", cesko: "CZ", "česko": "CZ",
  slovacchia: "SK", slovakia: "SK", slovensko: "SK",
  ungheria: "HU", hungary: "HU", magyarorszag: "HU", "magyarország": "HU",
  romania: "RO", "românia": "RO",
  bulgaria: "BG", "българия": "BG",
  croazia: "HR", croatia: "HR", hrvatska: "HR",
  slovenia: "SI", slovenija: "SI",
  serbia: "RS", srbija: "RS",
  montenegro: "ME", "crna gora": "ME",
  "bosnia ed erzegovina": "BA", "bosnia and herzegovina": "BA", bosna: "BA",
  "macedonia del nord": "MK", "north macedonia": "MK",
  albania: "AL", "shqipëri": "AL", shqiperi: "AL",
  kosovo: "XK", "kosovë": "XK",
  estonia: "EE", eesti: "EE",
  lettonia: "LV", latvia: "LV", latvija: "LV",
  lituania: "LT", lithuania: "LT", lietuva: "LT",
  ucraina: "UA", ukraine: "UA", "україна": "UA",
  bielorussia: "BY", belarus: "BY",
  moldavia: "MD", moldova: "MD",
  russia: "RU", "россия": "RU",
  turchia: "TR", turkey: "TR", "türkiye": "TR", turkiye: "TR",
  cipro: "CY", cyprus: "CY", "κύπρος": "CY",
  malta: "MT",
  lussemburgo: "LU", luxembourg: "LU",
  monaco: "MC", montecarlo: "MC",
  andorra: "AD",
  liechtenstein: "LI",
  "san marino": "SM",
  "citta del vaticano": "VA", "città del vaticano": "VA", "vatican city": "VA", vaticano: "VA",
  georgia: "GE", armenia: "AM", azerbaijan: "AZ", "azerbaigian": "AZ",
  // Fuori Europa: qui non abbiamo insegne, ma il codice serve lo stesso —
  // Amazon, la valuta, la ricerca per paese.
  "stati uniti": "US", "united states": "US", usa: "US", america: "US",
  canada: "CA", messico: "MX", mexico: "MX", brasile: "BR", brazil: "BR", brasil: "BR",
  argentina: "AR", cile: "CL", chile: "CL",
  giappone: "JP", japan: "JP", "日本": "JP", nippon: "JP",
  cina: "CN", china: "CN", "中国": "CN",
  "corea del sud": "KR", "south korea": "KR", "대한민국": "KR", korea: "KR",
  india: "IN", singapore: "SG", "emirati arabi uniti": "AE", "united arab emirates": "AE",
  "arabia saudita": "SA", "saudi arabia": "SA", israele: "IL", israel: "IL",
  egitto: "EG", egypt: "EG", marocco: "MA", morocco: "MA",
  sudafrica: "ZA", "south africa": "ZA",
  australia: "AU", "nuova zelanda": "NZ", "new zealand": "NZ",
  thailandia: "TH", thailand: "TH", vietnam: "VN", indonesia: "ID", "filippine": "PH",
  philippines: "PH", malesia: "MY", malaysia: "MY",
};

/**
 * Il codice ISO di un paese scritto in qualunque modo.
 *
 * Accetta gia' un codice a due lettere, cosi' chi lo ha lo passa e basta.
 * Chi non lo riconosce ottiene stringa vuota: chi chiama decide cosa farne,
 * ed e' meglio di un paese sbagliato spacciato per giusto.
 */
export function isoDaPaese(paese: string): string {
  const chiave = (paese ?? "").trim().toLowerCase();
  if (!chiave) return "";
  const noto = ISO_PER_NOME[chiave];
  if (noto) return noto;
  if (/^[a-z]{2}$/.test(chiave)) return chiave.toUpperCase();
  return "";
}
