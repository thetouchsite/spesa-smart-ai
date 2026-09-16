/**
 * Il catalogo dei prodotti, costruito da noi.
 *
 * PERCHE' ESISTE
 * --------------
 * Perche' l'indirizzo della scheda prodotto il modello non lo sa, e quando non
 * lo sa se lo inventa. Misurato: Cortilia 0 pagine aperte su 12, Eataly 0 su 4,
 * Amazon 0 su 6 — prezzi credibili, indirizzi inesistenti.
 *
 * I supermercati pero' quell'elenco lo pubblicano da soli, in `sitemap.xml`,
 * per farsi trovare dai motori di ricerca. Scaricandolo una volta abbiamo
 * indirizzi VERI su cui il modello non deve piu' indovinare niente: sceglie
 * fra prodotti che esistono.
 *
 * COSA CAMBIA, IN CONCRETO
 * ------------------------
 *   prima    ogni richiesta  →  il modello indovina  →  apriamo  →  buttiamo
 *   ora      una volta al giorno  →  catalogo nostro  →  il modello sceglie
 *
 * Provato su Carrefour Italia: sette schede aperte su sette, sei prezzi
 * leggibili su sette. Il motore con la ricerca, nel suo giro migliore, di
 * prezzi riletti dalla pagina ne aveva tre su diciassette.
 *
 * QUANTA MEMORIA, E PERCHE' NON SI CARICA TUTTO
 * ---------------------------------------------
 * Le fonti censite dichiarano 759.884 prodotti. Tenerli tutti in memoria sono
 * oltre cento megabyte, e il piano gratuito di Render ne ha 512 in tutto:
 * l'app morirebbe. Quindi si carica UN PAESE ALLA VOLTA, tenendone in memoria
 * al massimo tre — quello che serve a un'app dove ogni utente cerca nel
 * proprio paese e basta.
 *
 * L'AGGIORNAMENTO
 * ---------------
 * Una volta al giorno a mezzanotte, piu' un colpo all'avvio se il catalogo e'
 * vecchio. I cataloghi cambiano lentamente, quindi un giorno va benissimo — e
 * soprattutto QUI NON CI SONO PREZZI: la sitemap e' un indice di indirizzi, il
 * prezzo si legge dalla pagina quando l'utente genera il piano, quindi e'
 * sempre di oggi.
 *
 * SUL RISPETTO DEI SITI
 * ---------------------
 * Si scarica cio' che pubblicano per essere scaricato, poche richieste al
 * giorno per negozio, e le insegne che nel `robots.txt` vietano le schede
 * prodotto non sono nemmeno nell'elenco delle fonti.
 */

import { gunzipSync } from "node:zlib";
import { fontiDi, paesiConCatalogo, partiSuccessive, type FonteCatalogo } from "./catalogo-fonti.js";
import { conSinonimi } from "./sinonimi.js";
import { catalogoSalvato, salvaCatalogo } from "./catalogo-magazzino.js";

/** Un prodotto del catalogo. */
export interface VoceCatalogo {
  /** Nome ricavato dall'indirizzo: e' quello che si confronta con la lista. */
  nome: string;
  url: string;
  insegna: string;
  /** Parole del nome, gia' ripulite: si calcolano una volta, non a ogni ricerca. */
  parole: string[];
  /**
   * Quanto rende l'insegna di questa voce: vedi `FonteCatalogo.resa`.
   *
   * Si copia qui perche' l'ordinamento dei candidati la consulta per ogni
   * riga, e risalire alla fonte a ogni confronto costerebbe piu' di un numero
   * duplicato.
   */
  resa: number;
}

interface CatalogoPaese {
  paese: string;
  voci: VoceCatalogo[];
  /** Indice inverso parola → posizioni, per non scorrere centomila voci a ogni ricerca. */
  indice: Map<string, number[]>;
  aggiornato: number;
  insegne: string[];
}

/**
 * Quanti paesi tenere in memoria insieme.
 *
 * Tre: chi usa l'app cerca nel proprio paese, e i casi in cui ne servono di
 * piu' sono le nostre prove. Oltre, si rischia il limite di memoria del piano
 * gratuito.
 */
const PAESI_IN_MEMORIA = 3;

/** Oltre questo, il catalogo si riscarica. */
const SCADENZA_MS = 26 * 60 * 60 * 1000;

/**
 * Quanto si aspetta il primo caricamento di un paese.
 *
 * Trentacinque secondi: la fase prezzi ne ha una cinquantina prima che l'app
 * molli — iOS chiude ogni connessione a sessanta — e un paese si carica fra i
 * tre e i venticinque. Il margine che resta serve ad aprire le schede e
 * leggere i prezzi.
 */
const ATTESA_CARICAMENTO_MS = 35_000;

/**
 * Tetto per insegna.
 *
 * Alcampo ne dichiara 86.773 e Checkers 98.424: senza un limite un paese solo
 * riempirebbe la memoria. Cinquantamila per insegna coprono abbondantemente
 * una lista della spesa, che di voci ne ha diciotto.
 *
 * MA IL TAGLIO VA DETTO, E PRIMA NON LO DICEVA NESSUNO. Quattro cataloghi lo
 * superano — Checkers, Alcampo, Auchan Portogallo, Voila — e insieme perdono
 * 136.481 indirizzi che non entrano mai in memoria. Non e' un errore: e' una
 * scelta, e finche' la memoria e' quella del piano gratuito resta giusta. Ma
 * un conteggio che dice «50.000» senza aggiungere «su 98.424» descrive il
 * limite, non il catalogo, e chi legge crede di avere tutto.
 *
 * Da qui in poi il troncamento si registra e si vede in `/catalogo/stato`.
 */
const MAX_PER_INSEGNA = 50_000;

/**
 * Tetto per PAESE, che prima non serviva.
 *
 * Finche' il catalogo si scaricava al volo, fermarsi a quaranta file di
 * sitemap per insegna teneva basso il totale da solo. Leggendolo dal database
 * quel freno non c'e' piu': il catalogo e' completo, ed e' esattamente cio'
 * che volevamo — ma l'Italia ha ventidue insegne, e ventidue cataloghi interi
 * hanno fatto cadere Render con un 502.
 *
 * Duecentomila voci sono circa sessanta megabyte fra nomi, indirizzi e indice
 * delle parole: tre paesi in memoria ci stanno nei 512 MB del piano gratuito,
 * con margine per il resto dell'app.
 *
 * Le insegne si servono in ordine di resa — le piu' generose per prime, lo fa
 * `fontiDi` — quindi se il tetto taglia, taglia quelle che i prezzi non li
 * dichiarano comunque.
 */
const MAX_PER_PAESE = 200_000;

/**
 * Quante sitemap figlie aprire per ogni indice.
 *
 * I cataloghi veri sono spezzati in decine di file — Alcampo ne ha una
 * ventina — e fermarsi a poche significa caricare un frammento.
 *
 * DUECENTO E NON QUARANTA, E IL MOTIVO E' UN'INSEGNA PRECISA. Sainsbury's non
 * spezza il catalogo in decine di file ma in CENTOSESSANTACINQUE, da sessanta
 * prodotti l'uno: con un tetto di quaranta ne entrerebbero 2.400 sui 9.898 che
 * pubblica, e l'insegna sembrerebbe piccola invece che tagliata. Duecento
 * coprono tutte quelle viste e fermano comunque un indice malformato prima che
 * tenga occupato il lavoro notturno per ore.
 */
const MAX_FIGLIE = 200;

/**
 * Le sitemap figlie che dichiarano nel nome di non contenere prodotti.
 *
 * Si guarda il solo percorso, e prima si toglie la parola «sitemap»: contiene
 * «item», e senza toglierla combacerebbe con qualunque file al mondo.
 */
const NON_E_UN_ELENCO_PRODOTTI =
  /(categor|kategor|categoria|rubrique|recipe|ricett|rezept|receta|collection|store|negoz|filial|content|contenut|page|pagina|brand|marca|blog|news|article|author|tag|promo|offer|oferta|offerte|angebot|folleto|volantino)/i;

function percorsoDi(u: string): string {
  try {
    return new URL(u).pathname.replace(/sitemaps?/gi, "");
  } catch {
    return u.replace(/sitemaps?/gi, "");
  }
}

/** Chi e' stato tagliato dal tetto, e di quanto. Solo per dirlo, non per usarlo. */
const troncati = new Map<string, { insegna: string; tenuti: number; visteAlmeno: number }>();

const caricati = new Map<string, CatalogoPaese>();
/** Chi sta gia' scaricando un paese: due richieste insieme non lo scaricano due volte. */
const inCorso = new Map<string, Promise<CatalogoPaese | null>>();

/**
 * Gli header di un browser vero, non solo il suo nome.
 *
 * Mandare il solo `User-Agent` non basta: i sistemi anti-bot guardano TUTTA
 * l'intestazione, e `fetch` di Node ne manda molti meno di un browser.
 * Misurato su `mercado.carrefour.com.br`:
 *
 *     curl con lo stesso User-Agent   →  200, sitemap intera
 *     fetch di Node                   →  403
 *
 * Stessa identita' dichiarata, esito opposto. Mancavano `Accept`,
 * `Accept-Language` e i `Sec-Fetch-*`, che un browser manda sempre — e la loro
 * assenza e' l'impronta che tradisce un programma.
 *
 * Non e' un travestimento per entrare dove non si potrebbe: `robots.txt` lo
 * leggiamo e lo rispettiamo, e queste sono le stesse richieste che farebbe
 * una persona. E' per non misurare il nostro difetto al posto del loro sito.
 */
const INTESTAZIONE = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "Cache-Control": "no-cache",
} as const;

/* ─────────────────────────── Scaricare ─────────────────────────── */

async function scarica(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: INTESTAZIONE,
      redirect: "follow",
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return null;
    if (url.endsWith(".gz")) {
      try {
        return gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8");
      } catch {
        return null;
      }
    }
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Gli indirizzi dentro una sitemap, con le entita' XML rimesse a posto.
 *
 * DENTRO UN FILE XML LA `&` SI SCRIVE `&amp;`, E NOI LA LEGGEVAMO COSI'.
 * Finche' gli indirizzi non hanno parametri non si nota. Planet Organic pero'
 * spezza il catalogo con `sitemap_products_1.xml?from=5755746812061&amp;to=…`:
 * lasciato com'e', quell'indirizzo non e' quello vero, il server risponde
 * male e l'insegna risulta con zero prodotti. Stessa sorte a chiunque metta
 * due parametri in una sitemap.
 */
const indirizzi = (xml: string): string[] =>
  [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) =>
    m[1]
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#0?39;|&apos;/gi, "'"),
  );

/* ─────────────────────── Dal link al nome ──────────────────────── */

/**
 * Il nome del prodotto, ricavato dal suo indirizzo.
 *
 * `/p/mutti-passata-di-pomodoro-700-g/0000080042563.html` diventa
 * «mutti passata di pomodoro 700 g». Funziona perche' i negozi mettono il nome
 * nell'indirizzo per farsi trovare dai motori: e' la stessa ragione per cui
 * pubblicano le sitemap.
 *
 * Si scarta l'ultimo segmento quando e' solo cifre — e' il codice a barre — e
 * i segmenti di lingua o sezione, che non dicono niente del prodotto.
 */
const SEGMENTI_INUTILI = new Set([
  "p", "product", "products", "producto", "productos", "produkt", "produkte",
  "prodotto", "prodotti", "produit", "produits", "artikel", "item", "items",
  "shop", "store", "it", "en", "es", "fr", "de", "pt", "nl", "pl", "ro", "da",
  "sv", "hr", "hu", "lt", "sr", "bg", "ko", "za", "ca", "us", "www", "html",
]);

export function nomeDaUrl(url: string): string | null {
  let percorso: string;
  try {
    percorso = decodeURIComponent(new URL(url).pathname);
  } catch {
    return null;
  }

  const pezzi = percorso
    .split("/")
    .filter(Boolean)
    .map((p) => p.replace(/\.(html?|aspx|php)$/i, ""));

  // Il pezzo buono e' quello piu' lungo che non sia solo cifre e non sia un
  // segmento di servizio: e' quasi sempre lo slug del prodotto.
  let migliore: string | null = null;
  for (const p of pezzi) {
    if (/^\d+$/.test(p)) continue;
    if (SEGMENTI_INUTILI.has(p.toLowerCase())) continue;
    if (!migliore || p.length > migliore.length) migliore = p;
  }
  if (!migliore || migliore.length < 4) return null;

  /* VIA IL CODICE ARTICOLO, CHE NON E' PARTE DEL NOME.
     Quando il numero sta in un segmento suo viene gia' scartato sopra. Ma
     parecchi negozi lo infilano dentro lo slug, e allora resta attaccato:

         /125860-pfand-0-08              → «125860 pfand 0 08»   Knuspr
         /axe_duschgel_4501124639.html   → «axe duschgel 4501124639»  Mytime

     All'utente si mostrerebbe cosi', e nell'indice delle parole entrerebbe un
     numero che nessuna lista della spesa cerchera' mai. Si toglie solo quando
     e' lungo — cinque cifre o piu' — perche' «latte 1 l» e «uova 6» il numero
     ce l'hanno per buone ragioni. */
  const pulito = migliore
    .replace(/^\d{5,}[-_]/, "")
    .replace(/[-_]\d{6,}$/, "");

  const nome = (pulito.length >= 4 ? pulito : migliore)
    .replace(/[-_+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return nome.length >= 3 ? nome : null;
}

/**
 * L'ACCA CHE IL TEDESCO METTE AL POSTO DELLA DIERESI.
 *
 * Gli indirizzi dei negozi tedeschi non contengono ä, ö, ü: li scrivono ae,
 * oe, ue, perche' un URL sta nell'alfabeto inglese. Quindi il catalogo dice
 * `kaese`, `haehnchen`, `aepfel`, `broetchen`.
 *
 * Chi cerca invece scrive «Käse», e `parole()` toglie la dieresi ottenendo
 * `kase`. Le due forme non si incontrano mai. Misurato su sette parole
 * tedesche: ZERO risultati con la dieresi tolta, cinque con la traslitterazione.
 * Un'intera classe di parole irraggiungibile, in silenzio, su DE AT e CH.
 *
 * Perche' non si traslittera e basta: lo spagnolo scrive `pingüino` e il suo
 * indirizzo dice `pinguino`, non `pingueino`. Una regola sola romperebbe una
 * lingua per aggiustarne un'altra. Quindi si tengono TUTTE E DUE le forme —
 * nell'indice e nella ricerca — e si incontrano comunque.
 */
function tedescoDaIndirizzo(testo: string): string {
  return testo
    .replace(/ä/g, "ae").replace(/Ä/g, "Ae")
    .replace(/ö/g, "oe").replace(/Ö/g, "Oe")
    .replace(/ü/g, "ue").replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss");
}

/**
 * Le forme sotto cui ogni parola va cercata, una riga per parola di partenza.
 *
 * Il raggruppamento non e' un vezzo: chi conta i punti deve sapere che `kase`
 * e `kaese` sono LA STESSA parola chiesta, se no una voce con la dieresi
 * varrebbe il doppio di una senza e la classifica si storcerebbe.
 */
export function formeDelleParole(testo: string): string[][] {
  const dritte = parole(testo);
  const tradotte = parole(tedescoDaIndirizzo(testo));

  /* Le due liste hanno la stessa lunghezza e lo stesso ordine finche' la
     traslitterazione non cambia la lunghezza di una parola — e non la cambia
     mai: sostituisce lettere, non ne toglie. Se per qualche motivo divergono
     si torna alle sole forme dritte, che e' il comportamento di prima. */
  if (tradotte.length !== dritte.length) return dritte.map((p) => [p]);

  return dritte.map((p, i) => (p === tradotte[i] ? [p] : [p, tradotte[i]]));
}

/**
 * Le unita' di misura. Non dicono che cosa e' un prodotto, dicono quanto pesa.
 */
const UNITA = new Set([
  "kg", "gr", "grammi", "ml", "cl", "lt", "litri", "litro",
  "pz", "pezzi", "pezzo", "conf", "confezione", "bottiglia", "barattolo",
  "vasetto", "busta", "sacchetto", "pack", "pcs", "unid", "unidades",
  "stk", "stueck", "flasche", "packung", "piece", "pieces", "bouteille",
]);

/**
 * Parole confrontabili: senza accenti, senza sigle corte, E SENZA NUMERI.
 *
 * PERCHE' IL PESO NON E' UNA PAROLA DEL PRODOTTO
 * ----------------------------------------------
 * Il peso finiva nell'indice come qualsiasi altra parola, e due prodotti che
 * pesano uguale si somigliavano. Misurato, e visto da un utente in mezzo a una
 * dimostrazione al cliente:
 *
 *     «Pomodorini»          → POMODORI E POMODORINI      quattro candidati
 *     «Pomodorini 250 g»    → cuoco di bordo ORATA
 *                             alla mediterranea          uno, ed e' un'orata
 *
 * La lista della spesa le quantita' ce le ha per forza — «1 confezione da
 * 250 g» la scrive chi genera la lista — e bastavano a mandare la ricerca da
 * un'altra parte. Lo stesso in inglese: cercando «zucchine 500g» tornavano le
 * CHIACCHIERE, che pesano uguale.
 *
 * Via anche i codici prodotto, che cominciano per cifra — `1029250`,
 * `000000000000488` — e che erano puro rumore dentro l'indice.
 *
 * Il peso NON si butta: e' un dato, e diventera' il prezzo al chilo. Ma e' un
 * dato a parte, non una parola del nome.
 */
export function parole(testo: string): string[] {
  const piano = testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return [
    ...new Set(
      piano
        .split(/[^a-z0-9]+/)
        .filter((p) => p.length > 2)
        // Comincia per cifra: e' una quantita' o un codice, non un nome.
        .filter((p) => !/^[0-9]/.test(p))
        .filter((p) => !UNITA.has(p)),
    ),
  ];
}

/* ─────────────── Cosa non puo' MAI essere la risposta ─────────────── */

/**
 * Prodotti che una lista della spesa non chiede mai.
 *
 * La lista nasce dalle ricette: e' tutta roba da cucinare. Un croccantino per
 * gatti o un detersivo non e' un abbinamento debole da pesare piu' in basso —
 * e' impossibile, e pesarlo e' solo un modo lento di sbagliare.
 *
 * Serve soprattutto quando una voce si riduce a una parola sola e generica:
 * «Uova medie 10» perde «medie» e il numero, resta «uova», e con quella sola
 * parola le caramelle «uova al tegamino» valgono quanto le uova vere.
 * Misurato: vincevano pure, perche' costano meno.
 */
const NON_ALIMENTARI = [
  // ── animali ──────────────────────────────────────────────────────
  /* I supermercati veri il cibo per animali lo vendono, e ha nomi da cibo:
     «wet adult cat food tuna» rispondeva alla voce «Tuna tin». Togliere i
     negozi per animali dalle fonti non basta — serve anche qui. */
  /\b(crocchett|croccantin|gatt[oi]?|cane|cani|cucciol|cuccioli|mangim|croquett|katzen|hunde|tierfutter|pienso|racao|kattenvoer|hondenvoer)/i,
  /\b(cat food|dog food|pet food|kitten|puppy|cat treat|dog treat|adult cat|adult dog|comida para (?:gatos|perros)|nourriture pour (?:chats|chiens))/i,

  // ── pulizia e igiene ─────────────────────────────────────────────
  /\b(detersiv|detergent|ammorbid|candeggi|sgrassat|anticalcar|shampoo|shampooing|champu|champo|balsamo|bagnoschiuma|sapone|savon|jabon|seife|dentifric|toothpaste|zahnpasta|deodorant|assorbent|pannolin|couches|windeln|salviett|tovagliol|carta igienic|papier toilette|toilettenpapier|polish|insettic|lessive|waschmittel|limpiador)/i,

  /* ── COSMETICA ───────────────────────────────────────────────────
     Si traveste da cibo piu' di ogni altra categoria, perche' usa le stesse
     parole: «lait corporel» e «lait demaquillant» finivano fra i candidati
     per il latte, e in profumeria ci sono creme, burri e oli come in cucina. */
  /\b(corporel|demaq|maquillage|mascara|parfum|eau de toilette|cosmetic|haarfarbe|hidratante corporal|body lotion|body milk|creme solaire|protector solar|zonnebrand|nagellack|smalto)/i,

  // ── dolciumi che non sono un ingrediente ─────────────────────────
  /\b(haribo|caramell|gommos|liquiriz|chewing|lecca lecca|bonbon|gummibar|chicle)/i,

  // ── cartoleria ───────────────────────────────────────────────────
  /\b(quaderno|portamine|matite|penna a sfera|astuccio|pila|batteri|cahier|notizbuch)/i,

  /* ── UTENSILI E ELETTRODOMESTICI ─────────────────────────────────
     Il caso peggiore, perche' l'attrezzo porta il nome di cio' che cucina:
     «cuiseur a riz» per il riso, «grille-pain» per il pane, «eplucheur a
     pommes de terre» per le patate, «emulsionneur a lait» per il latte.
     Cercando l'ingrediente arrivava l'elettrodomestico — e vinceva, perche'
     costa di piu' e sembrava il prodotto di pregio.

     Solo parole che non possono essere cibo in nessuna delle lingue in
     catalogo: niente «pan», che in spagnolo e' il pane; niente «piatto» o
     «prato», che stanno dentro «piatto pronto». */
  /\b(tostapane|toaster|tostadora|torradeira|broodrooster|grille.?pain)/i,
  /\b(bollitore|bouilloire|wasserkocher|waterkoker|hervidor|chaleira|kettle)/i,
  /\b(pelapatate|eplucheur|peeler|pelador|descascador|schaler)/i,
  /\b(emulsionneur|montalatte|milchaufschaumer|frother)/i,
  /\b(cuociriso|cuiseur|rice cooker|arrocera|reiskocher)/i,
  /\b(frullator|mixeur|blender|batidora|liquidificador|standmixer|robot menager|robot de cocina)/i,
  /\b(padella|poele|sarten|frigideira|pfanne|koekenpan|frying pan)/i,
  /\b(pentola|kochtopf|olla a presion|panela de pressao|pressure cooker)/i,
  /\b(affettatric|trancheuse|aufschnittmaschine|slicer)/i,
  /\b(macchina da caffe|cafetiere|coffee maker|kaffeemaschine|cafeteira|cafetera)/i,
  /\b(apriscatole|tire.?bouchon|corkscrew|cavatapp|sacacorchos|korkenzieher)/i,
  /\b(huche a pain|boite a pain|portapane|bread bin|brotkasten|stoviglie|cookware|kitchenware|geschirr|vaisselle|utensil)/i,
  /\b(microonde|micro.?ondes|mikrowelle|microwave|frigorifer|refrigerateur|kuhlschrank|congelatore|congelador)/i,
];

/**
 * Le stesse categorie, in inglese.
 *
 * SONO UN ELENCO A PARTE E NON UN AMPLIAMENTO DI QUELLO SOPRA, per una ragione
 * pratica: le due lingue hanno trappole diverse e si romperebbero a vicenda.
 * «cane» in italiano e' l'animale; in inglese `cane` e' la canna da zucchero,
 * e `cane sugar` finirebbe fra i mangimi. Tenendole separate, ciascuna lista
 * resta leggibile e nessuna va indebolita per far posto all'altra.
 *
 * Senza queste righe il Regno Unito rispondeva «Cadbury Dairy Milk» — che e'
 * cioccolato — a chi cercava `milk`, e «cheddar cheese muffins» a chi cercava
 * del formaggio. Misurato il 16 settembre: circa meta' delle voci sbagliate.
 */
const NON_ALIMENTARI_EN = [
  /\b(dog|cat|puppy|kitten|pet|catnip|kibble)s?\b/i,
  /\b(detergent|washing up|laundry|bleach|softener|descal|shampoo|body wash|toothpaste|deodorant|nappies|nappy|wipes|kitchen roll|toilet roll|toilet tissue|polish|insect|air freshener|scented|fragrance)s?\b/i,
  /\b(sweet|candy|gummy|gummies|liquorice|licorice|lollipop|chewing gum|marshmallow)s?\b/i,
  /\b(notebook|pencil|biro|stationery|batteries|lightbulb)s?\b/i,
  /\b(chocolate|choc)s?\b/i,
  /* Le marche di dolciumi, come `haribo` nell'elenco italiano: il loro nome non
     dice mai «cioccolato», quindi a parole non si distinguono da un alimento.
     «Lion milk duo» e «Bounty milk duo» vincevano la ricerca di `milk` perche'
     contengono quella parola e costano poco — lo stesso meccanismo per cui in
     Italia le caramelle a forma di uovo battevano le uova. */
  /\b(dairy milk|milkybar|milky way|galaxy|bounty|snickers|twix|kitkat|kit kat|maltesers|aero|wispa|yorkie|curly wurly|freddo|toblerone|ferrero|kinder)s?\b/i,
  /\b(lion|mars|twirl|ripple|flake)\s+(bar|duo|milk|choc)/i,
];

function alimentarePlausibile(nome: string): boolean {
  return (
    !NON_ALIMENTARI.some((re) => re.test(nome)) && !NON_ALIMENTARI_EN.some((re) => re.test(nome))
  );
}

/**
 * La trappola dell'ingrediente dentro la preparazione.
 *
 * «Frollini con uova» contiene la parola «uova» ed e' un biscotto; «petto di
 * pollo al forno» contiene «petto» e «pollo» ed e' un affettato cotto. Queste
 * parole dicono «sono una preparazione, l'ingrediente che cerchi e' dentro di
 * me»: se compaiono nel prodotto ma NON nella voce cercata, non e' quello che
 * serve per cucinare.
 */
const PREPARAZIONI =
  /\b(frollin|biscott|merendin|brioche|briochin|croissant|cornett|snack|gelat[oi]|budin|torta|tortin|crostat|wafer|crackers|grissin|pandoro|panettone|colomba|ripien[oi]|farcit|arrost|affettat|precott|impanat|affumicat|stagionat|al forno|sfoglia|insalat|condit|saltat|grigliat|marinat|panat|pronto in|gia' pronto|monoporzion)/i;

/**
 * La stessa trappola, in inglese.
 *
 * «cheddar cheese muffins» contiene `cheddar cheese` ed e' un muffin;
 * «bread sauce mix» contiene `bread` ed e' una bustina di preparato. In una
 * lista della spesa nata da una ricetta nessuna delle due e' mai la risposta.
 *
 * Nota su `flavour` e `mix`: dicono entrambe «io imito quell'ingrediente, non
 * lo sono». Un `cheese flavour snack` non e' formaggio, e chi cucina se ne
 * accorgerebbe solo davanti ai fornelli.
 */
const PREPARAZIONI_EN =
  /\b(muffin|cupcake|cake|biscuit|cookie|pastry|pie|tart|crumble|doughnut|donut|brownie|flapjack|cereal bar|gravy|seasoning|stuffing|nugget|goujon|crisp|twist|mash|dip|chutney|pickle|mayo|mayonnaise|ketchup|dressing|sauce|drink|smoothie|squash|cordial)s?\b|\b(flavou?r(ed|s)?|breaded|crumbed|battered|smoked|cured|roast(ed)?|fried|marinated|instant|ready meal)\b|\b\w+ mix\b/i;

/**
 * I piatti, che sono un'altra cosa ancora.
 *
 * «Bombay potatoes» contiene `potatoes` ed e' un contorno indiano gia' pronto;
 * «minced beef onion» e' una scatoletta; «yoghurt mint raita» e' una salsa. Chi
 * scrive `potatoes` nella lista della spesa vuole le patate crude, e un piatto
 * pronto che le contiene non le sostituisce ai fornelli.
 *
 * Stanno separati dalle preparazioni perche' rispondono a una domanda diversa:
 * quelle sono «l'ingrediente e' dentro una lavorazione», questi sono «e' gia'
 * una ricetta». Tenerli distinti serve il giorno che si vorra' ammettere i
 * secondi e non le prime, o viceversa.
 */
const PIATTI_EN =
  /\b(curry|raita|korma|tikka|masala|bhaji|biryani|chow mein|risotto|paella|lasagne|lasagna|bolognese|casserole|stew|soup|salad|sandwich|wrap|pizza|bombay|szechuan|katsu|jalfrezi|madras|rogan josh)\b/i;

/**
 * Gli stessi piatti, in italiano.
 *
 * Mancavano, e si vedeva: cercando `cipolle` vinceva «zuppa di cipolle», e
 * cercando `pasta` vinceva «pasta e fagioli». Nessuna delle due si compra per
 * cucinare qualcos'altro.
 */
const PIATTI_IT =
  /\b(zuppa|minestr|vellutata|passato di|sugo|rag[uù]|risotto|lasagn|cannellon|tortell|raviol|insalat|panin|tramezzin|piadin|pizza|polpett|parmigiana|cotolett|spiedin|hamburger)/i;

/** Una preparazione o un piatto, in una qualunque delle lingue che copriamo. */
function paPreparazione(nome: string): boolean {
  return (
    PREPARAZIONI.test(nome) ||
    PREPARAZIONI_EN.test(nome) ||
    PIATTI_EN.test(nome) ||
    PIATTI_IT.test(nome)
  );
}

/* ──────────────────────── Costruire un paese ───────────────────── */



/**
 * Questo indirizzo e' una SCHEDA PRODOTTO, o una pagina qualsiasi?
 *
 * Serve perche' parecchie sitemap mescolano le due cose. EasyCoop, per dire,
 * nella stessa sitemap ha `/salumi-e-formaggi/formaggi/grana/` — che e' una
 * categoria — insieme ai prodotti veri. Senza questo controllo il catalogo si
 * riempiva di pagine di reparto, e cercando «Parmigiano Reggiano» rispondeva
 * con l'indirizzo dello scaffale invece che con una forma di parmigiano.
 *
 * Due forme, che coprono i negozi visti finora:
 *   - un segmento che lo dichiara   /p/  /product/  /prodotto/  /produkt/ …
 *   - un nome lungo seguito da un identificativo numerico, che e' la forma di
 *     `/p/ricotta-mista/0000020451479.html`
 *
 * Nel dubbio si scarta: una scheda in meno non si nota, una categoria spacciata
 * per prodotto manda l'utente nel posto sbagliato.
 *
 * PRIMA PERO' SI BUTTA VIA CIO' CHE NON E' NEMMENO UNA PAGINA, ED E' UNA
 * LEZIONE COSTATA TRENTACINQUEMILA PRODOTTI. La seconda forma qui sotto —
 * nome lungo piu' numero — descrive anche
 * `/medias/ProductSolr-it-EUR-19-16093393329043507599.xml`, che non e' una
 * scheda: e' un file interno del motore di ricerca, e per giunta protetto.
 * Bennet e Unes pubblicano migliaia di quegli indirizzi nella stessa sitemap
 * dei prodotti, e il catalogo se ne riempiva: Bennet 20.446 voci dichiarate,
 * 18 vere e tutte inservibili; Unes 15.363 contro 4.
 *
 * L'errore non dava errore. Le voci c'erano, il conteggio era alto, e a
 * crollare era solo la cosa che nessuno guardava: quante di quelle voci si
 * aprivano davvero.
 */
/*
 * Esportata perche' la misura della resa deve guardare le STESSE pagine che il
 * catalogo terra'. Campionando la sitemap grezza, Carrefour Italia risultava a
 * zero: le pagine aperte erano categorie, che un prezzo non ce l'hanno.
 */
export function paScheda(u: string): boolean {
  if (NON_E_UNA_PAGINA.test(u)) return false;
  if (E_UNA_VETRINA.test(u)) return false;
  if (
    /\/(p|product|products|producto|productos|produkt|produkte|prodotto|prodotti|produit|produits|artikel|item|items|urun|proizvod|pdp|dp)\//i.test(u)
  ) {
    return true;
  }
  /* LA STESSA FORMA, SCRITTA IN TRE MODI DIVERSI.
     Un nome lungo accanto a un codice: e' come quasi tutti i negozi scrivono
     l'indirizzo di una scheda. Ma ognuno lo compone a modo suo, e chiedere una
     sola disposizione fa sparire insegne intere.

     Misurato sulle tedesche: Knuspr pubblica 15.177 prodotti e Mytime 12.265,
     e per noi erano zero — «la sitemap non ha risposto», diceva il registro,
     mentre la sitemap rispondeva benissimo. Non riconoscevamo la forma.

         nome-poi-codice   /mutti-passata-700-g/0000080042563
         codice-poi-nome   /125860-pfand-0-08              ← Knuspr
         con trattini bassi /axe_duschgel_4501124639.html  ← Mytime */

  // Nome, poi il codice: la forma piu' diffusa.
  if (/[a-z]{3,}(?:-[a-z0-9]{2,}){2,}[/-]\d{6,}/i.test(u)) return true;

  // Il codice per primo, poi il nome.
  if (/\/\d{5,}-[a-z]{2,}[a-z0-9-]{4,}$/i.test(u)) return true;

  // Trattini bassi al posto dei trattini, con o senza `.html` in fondo.
  if (/[a-z]{3,}(?:_[a-z0-9]{2,}){2,}_\d{6,}(\.html?)?$/i.test(u)) return true;

  return false;
}

/**
 * Quello che una scheda prodotto non e' mai.
 *
 * `/medias/` e' la cartella degli allegati di SAP Commerce, su cui girano
 * parecchie insegne europee: dentro ci sono immagini, fogli di stile e gli
 * indici del motore di ricerca. Le estensioni servono per lo stesso motivo —
 * una sitemap puo' elencare un PDF o un XML, e nessuno dei due si apre come
 * una scheda.
 */
const NON_E_UNA_PAGINA = /\/medias\/|\.(xml|jpe?g|png|gif|pdf|webp|svg|css|js|zip|mp4)(\?|$)/i;

/**
 * Le vetrine: una pagina sola con dentro venti prodotti.
 *
 * E' PEGGIO DI UNA PAGINA VUOTA, E VA CAPITO PERCHE'.
 * Una categoria senza prezzi si scarta da se': non si legge niente e l'insegna
 * va in fondo alla fila. Una vetrina di volantino invece i prezzi ce li ha —
 * venti, uno per riquadro — e noi ne leggiamo uno.
 *
 * Il nome pero' lo ricaviamo dall'indirizzo, che su Alcampo dice
 * `producto-en-folleto-13-08-26-20-09-26`. Quindi si finisce per scrivere in
 * magazzino un prezzo vero, preso da un prodotto qualunque, sotto un nome che
 * non e' di nessun prodotto. Guardato con gli occhi: quella pagina vendeva
 * Play-Doh, contenitori e borracce, e a noi ne risultava «4 su 10 con prezzo».
 *
 * Un numero sbagliato che sembra giusto e' il difetto che costa di piu', ed e'
 * lo stesso delle mele Lidl a 63 sterline: nessun errore, nessun registro,
 * solo un prezzo assurdo davanti al cliente.
 *
 * Alcampo e Bonpreu Esclat girano sulla stessa piattaforma e hanno la stessa
 * cartella; da soli valevano 108.047 voci dichiarate.
 */
const E_UNA_VETRINA = /\/(offers|ofertas|offerte|promociones|promozioni|folleto|volantino|angebote|promotions)\//i;

/**
 * Le voci di UNA sola insegna.
 *
 * Esportata perche' il conteggio per insegna deve passare da qui e non da una
 * copia: un numero misurato con codice diverso da quello che gira non descrive
 * l'API, descrive lo script che lo ha misurato.
 */
export async function daUnaFonte(fonte: FonteCatalogo): Promise<VoceCatalogo[]> {
  const voci: VoceCatalogo[] = [];
  const visti = new Set<string>();
  /* Quante schede la sitemap ne DICHIARA, tenute o no. E' il denominatore
     della completezza: senza, «abbiamo 5.000 prodotti» non dice se sono tutti
     o un dodicesimo. */
  let schedeViste = 0;
  let tagliato = false;

  /* SI SEGUE L'INDICE, NON SI PRENDE UN FILE SOLO.
     Prima si apriva la sitemap indicata e si leggevano i suoi indirizzi come
     se fossero prodotti. Quando quella sitemap e' un INDICE — cioe' punta ad
     altre sitemap — dentro non ci sono prodotti ma altri file, che il filtro
     scartava: il catalogo veniva su vuoto o quasi.

     Misurato: Migros Turchia caricava 70 prodotti sui 338 trovati dalla
     scansione, e quei settanta erano bicchieri e shampoo; Barbora Estonia
     otto, tutti elettrodomestici. Non era il catalogo a essere magro, era il
     nostro modo di leggerlo.

     Ora: se e' un indice si aprono le figlie, una per una, fino al tetto per
     insegna. Se e' piatta si legge com'e', e si tentano comunque le parti
     successive — `...part2.xml`, `-1.xml` — perche' i cataloghi grossi sono
     spezzati e fermarsi al primo file ne darebbe un decimo. */
  const daAprire: string[] = [fonte.sitemap];
  const gia = new Set<string>();

  while (daAprire.length > 0 && voci.length < MAX_PER_INSEGNA) {
    const url = daAprire.shift()!;
    if (gia.has(url)) continue;
    gia.add(url);

    const xml = await scarica(url);
    if (!xml) continue;

    /* Un indice: le sue voci sono altre sitemap, non prodotti. Si rimettono in
       coda invece di aprirle qui, cosi' un indice che ne contiene un altro —
       e capita — viene seguito senza scrivere una discesa ricorsiva. */
    if (/<sitemapindex/i.test(xml)) {
      /* LE FIGLIE CHE DICHIARANO DI NON AVERE PRODOTTI NON SI APRONO.
         Un indice generale elenca di tutto: Morrisons ha `sitemap-products`
         accanto a `sitemap-categories`, `-recipes`, `-collections`. Aperte
         tutte, il suo catalogo comincia con «mini globe led light bulbs» —
         cinquemila pagine di reparto che entrano come se fossero prodotti e
         spingono fuori il cibo, perche' il tetto per insegna e' lo stesso.
         Il nome del file lo dice, e fidarsi del nome costa zero richieste. */
      for (const figlia of indirizzi(xml).slice(0, MAX_FIGLIE)) {
        if (NON_E_UN_ELENCO_PRODOTTI.test(percorsoDi(figlia))) continue;
        if (!gia.has(figlia)) daAprire.push(figlia);
      }
      continue;
    }

    for (const u of indirizzi(xml)) {
      if (visti.has(u)) continue;
      visti.add(u);
      if (!paScheda(u)) continue;
      schedeViste++;
      if (voci.length >= MAX_PER_INSEGNA) {
        tagliato = true;
        continue;
      }
      const nome = nomeDaUrl(u);
      if (!nome) continue;
      const p = parole(nome);
      if (p.length === 0) continue;
      /* Anche sotto il nome dell'altra lingua del paese, dove ce n'e' una.
         Bonpreu vende `llet` e la lista chiede `leche`: senza questo passaggio
         l'unica catena spagnola che dichiara i prezzi resta invisibile. */
      voci.push({
        nome,
        url: u,
        insegna: fonte.insegna,
        parole: conSinonimi(p, fonte.paese),
        resa: fonte.resa ?? 0.5,
      });
      if (voci.length >= MAX_PER_INSEGNA) break;
    }

    // Se questa era la sitemap dichiarata ed era piatta, si prova a chiedere
    // anche le sue parti successive.
    if (url === fonte.sitemap) {
      for (const parte of partiSuccessive(fonte.sitemap)) {
        if (!gia.has(parte)) daAprire.push(parte);
      }
    }
  }

  if (tagliato) {
    /* `visteAlmeno` e non «dichiarate»: appena scatta il tetto si smette di
       scaricare le parti successive, quindi il vero totale e' questo O PIU'.
       Un numero che finge di essere esatto quando non lo e' sarebbe peggio di
       un numero dichiarato approssimativo. */
    troncati.set(`${fonte.paese}|${fonte.insegna}`, {
      insegna: fonte.insegna,
      tenuti: voci.length,
      visteAlmeno: schedeViste,
    });
    console.warn(
      `[catalogo] ${fonte.paese} ${fonte.insegna}: tenute ${voci.length} schede su almeno ` +
        `${schedeViste} viste — il tetto di ${MAX_PER_INSEGNA} ha tagliato il resto`,
    );
  }

  return voci;
}


async function costruisci(paese: string): Promise<CatalogoPaese | null> {
  const fonti = fontiDi(paese);
  if (fonti.length === 0) return null;

  const inizio = Date.now();
  const voci: VoceCatalogo[] = [];
  const insegne: string[] = [];

  // Una fonte alla volta, non tutte insieme: sono file da megabyte e il piano
  // gratuito ha poca memoria. Qualche secondo in piu' vale la stabilita'.
  let daDatabase = 0;

  for (const f of fonti) {
    /* PRIMA IL DATABASE, I NEGOZI SOLO SE MANCA.
       Le sitemap di un paese sono decine di megabyte e fino a trentacinque
       secondi, e su Render la macchina si spegne dopo un quarto d'ora: senza
       questo passaggio quasi ogni utente pagava quel tempo, e i negozi
       ricevevano quelle richieste, per un catalogo che nel frattempo non era
       cambiato di una riga.

       Il salvataggio lo fa il lavoro notturno. Qui si legge e basta — tranne
       quando non c'e' niente da leggere: allora si scarica e si mette da parte
       per il prossimo risveglio. */
    const salvate = await catalogoSalvato(paese, f.insegna);
    if (salvate) {
      /* IL TETTO VALE ANCHE QUI, E LA PRIMA VERSIONE SE L'ERA DIMENTICATO.
         Scaricando dalle sitemap ci si ferma a quaranta file per insegna, e
         quel limite teneva bassa la memoria per conto suo. Il catalogo del
         database e' invece completo — ed e' il motivo per cui lo abbiamo
         fatto: la Spagna passa da 197.721 prodotti a 284.592 — ma senza freno
         l'Italia, che di insegne ne ha ventidue, ha saturato i 512 MB di
         Render e la macchina e' caduta con un 502.

         Piu' catalogo e' meglio finche' ci sta in memoria. */
      let presi = 0;
      for (const s of salvate) {
        if (presi >= MAX_PER_INSEGNA || voci.length >= MAX_PER_PAESE) break;
        const p = parole(s.nome);
        if (p.length === 0) continue;
        voci.push({
          nome: s.nome,
          url: s.url,
          insegna: f.insegna,
          parole: conSinonimi(p, f.paese),
          resa: f.resa ?? 0.5,
        });
        presi++;
      }
      insegne.push(f.insegna);
      daDatabase++;
      continue;
    }

    if (voci.length >= MAX_PER_PAESE) {
      console.info(`[catalogo] ${paese}: tetto di ${MAX_PER_PAESE} voci raggiunto, mi fermo`);
      break;
    }

    const sue = await daUnaFonte(f);
    if (sue.length > 0) {
      voci.push(...sue);
      insegne.push(f.insegna);
      console.info(`[catalogo] ${paese} ${f.insegna}: ${sue.length} prodotti`);
      // Messo da parte per il prossimo avvio: e' l'unica scrittura fatta
      // mentre qualcuno aspetta, e non se ne accorge perche' non si attende.
      void salvaCatalogo(
        paese,
        f.insegna,
        sue.map((v) => ({ url: v.url, nome: v.nome })),
      );
    } else {
      /* «Niente» ha due cause diverse e vanno distinte: la sitemap che non
         risponde e quella che risponde con indirizzi che non riconosciamo.
         Confonderle e' costato due insegne tedesche da 27.000 prodotti —
         cercavamo un difetto di rete dove c'era un difetto di lettura. */
      console.warn(
        `[catalogo] ${paese} ${f.insegna}: nessuna scheda riconosciuta ` +
          `(la sitemap non ha risposto, oppure i suoi indirizzi hanno una forma che non leggiamo)`,
      );
    }
  }

  if (daDatabase > 0) {
    console.info(`[catalogo] ${paese}: ${daDatabase}/${fonti.length} insegne lette dal database`);
  }

  if (voci.length === 0) return null;

  // L'indice inverso: senza, ogni ricerca scorrerebbe centomila voci.
  const indice = new Map<string, number[]>();
  voci.forEach((v, i) => {
    /* Sotto TUTTE le forme, non solo quella con la dieresi tolta: un prodotto
       che si chiama «Käse» si trova sia cercando `kase` sia cercando `kaese`,
       e uno che si chiama `kaese` — come scrivono gli indirizzi — pure. Le due
       scritture della stessa parola smettono di essere due parole. */
    for (const forme of formeDelleParole(v.nome)) {
      for (const p of forme) {
        const dove = indice.get(p);
        if (dove) dove.push(i);
        else indice.set(p, [i]);
      }
    }
  });

  console.info(
    `[catalogo] ${paese} pronto: ${voci.length} prodotti da ${insegne.length} insegne ` +
      `in ${((Date.now() - inizio) / 1000).toFixed(0)}s`,
  );
  return { paese, voci, indice, aggiornato: Date.now(), insegne };
}

/* ──────────────────────────── Uso ──────────────────────────────── */

/**
 * Il catalogo di un paese, scaricandolo se serve.
 *
 * Due richieste contemporanee sullo stesso paese non lo scaricano due volte:
 * la seconda aspetta la prima. Senza, due utenti che aprono l'app insieme
 * farebbero partire due scaricamenti da centomila prodotti.
 */
/** E' gia' in memoria e ancora valido? Non scarica niente, guarda e basta. */
export function catalogoGiaPronto(paese: string): boolean {
  const c = caricati.get((paese || "").toUpperCase().slice(0, 2));
  return Boolean(c && Date.now() - c.aggiornato < SCADENZA_MS);
}

export async function catalogoDi(paese: string): Promise<CatalogoPaese | null> {
  const cc = (paese || "").toUpperCase().slice(0, 2);

  const gia = caricati.get(cc);
  if (gia && Date.now() - gia.aggiornato < SCADENZA_MS) return gia;

  const giaInCorso = inCorso.get(cc);
  if (giaInCorso) return giaInCorso;

  const lavoro = costruisci(cc)
    .then((c) => {
      if (c) {
        caricati.set(cc, c);
        // Si tiene solo un pugno di paesi: il piu' vecchio esce.
        if (caricati.size > PAESI_IN_MEMORIA) {
          const vecchio = [...caricati.entries()].sort((a, b) => a[1].aggiornato - b[1].aggiornato)[0];
          if (vecchio) {
            caricati.delete(vecchio[0]);
            console.info(`[catalogo] ${vecchio[0]} tolto dalla memoria per fare posto a ${cc}`);
          }
        }
      }
      return c;
    })
    .finally(() => inCorso.delete(cc));

  inCorso.set(cc, lavoro);
  return lavoro;
}

export interface RisultatoCatalogo {
  nome: string;
  url: string;
  insegna: string;
  /** Quante parole della richiesta compaiono nel nome: serve a ordinare. */
  punteggio: number;
}

/**
 * Cerca un prodotto nel catalogo di un paese.
 *
 * Confronta le parole, non il testo: «passata di pomodoro» trova «Mutti
 * passata di pomodoro 700 g» anche se le parole in mezzo non coincidono.
 *
 * A parita' di parole trovate vince il nome in cui la cosa cercata PESA DI
 * PIU', cioe' occupa la quota maggiore delle parole del prodotto. Fra
 * «Pomodori pelati» e «Pomodori pelati bio in confezione da 12 con basilico»,
 * per una voce che dice «pomodori pelati» il primo e' quello giusto: il nome
 * lungo di solito e' un formato particolare.
 *
 * PERCHE' LA QUOTA E NON LA LUNGHEZZA IN CARATTERI, CHE C'ERA PRIMA
 * -----------------------------------------------------------------
 * Contare i caratteri e' un'approssimazione che si rompe appena le parole in
 * piu' sono corte. Cercando `cheddar cheese` vinceva «vintage cheddar cheese
 * twist» — quattro parole, di cui due sono un biscotto salato — su «morrisons
 * cheddar cheese», che e' del formaggio: il secondo ha piu' caratteri ma meno
 * parole estranee.
 *
 * La quota funziona in tutte e due le lingue che il catalogo copre, e non ha
 * bisogno di sapere quale sia. In inglese la testa del sintagma sta in fondo
 * («cheddar CHEESE»), in italiano in testa («LATTE di cocco»): una regola
 * basata sulla posizione andrebbe scritta due volte e sbaglierebbe sui
 * cataloghi misti. Quante parole del nome sono quella che cerchi, invece, si
 * misura uguale ovunque.
 */
export async function cercaNelCatalogo(
  paese: string,
  richiesta: string,
  quanti = 5,
): Promise<RisultatoCatalogo[]> {
  /* NESSUNO ASPETTA IL PRIMO CARICAMENTO.
     Scaricare il catalogo di un paese sono centoquarantamila prodotti e
     cinquantasette secondi su Render. Farlo DENTRO la richiesta di un utente
     significa che il primo della giornata aspetta un minuto in piu' — e
     l'app molla a cinquantacinque secondi, perche' iOS chiude le connessioni
     a sessanta. Misurato: `prices` annullata a 55,08 s.

     Quindi se il catalogo non c'e' ancora si comincia a scaricarlo e si
     risponde subito vuoto: questa richiesta usa le altre strade, e la
     prossima trovera' il catalogo pronto. */
  /* SI ASPETTA, MA NON ALL'INFINITO.
     Prima si rispondeva subito vuoto quando il catalogo non era in memoria,
     per non far aspettare nessuno. Aveva senso finche' dietro c'era il motore
     con la ricerca a coprire il buco. Da quando i prezzi vengono SOLO da qui,
     rispondere vuoto significa consegnare una lista senza un prezzo — ed e'
     successo davvero, in produzione: Polonia 0 su 17, Spagna 0 su 16,
     Portogallo 0 su 18, con `secondiPrezzi: 0`. Il catalogo non partiva mai,
     perche' su Render ogni richiesta lo trovava freddo.

     Ora si aspetta il caricamento, con un tetto: la fase prezzi ha una
     cinquantina di secondi prima che l'app molli, e un paese si carica in tre
     o venti. Se non ce la fa entro il tetto si risponde con quello che c'e' —
     una lista magra e onesta — e il caricamento prosegue per la volta dopo. */
  if (!catalogoGiaPronto(paese)) {
    const atteso = await Promise.race([
      catalogoDi(paese),
      new Promise<null>((r) => setTimeout(() => r(null), ATTESA_CARICAMENTO_MS)),
    ]);
    if (!atteso) {
      console.info(
        `[catalogo] ${paese} non pronto entro ${ATTESA_CARICAMENTO_MS / 1000}s: ` +
          `rispondo con quello che c'e', il caricamento prosegue`,
      );
    }
  }

  const cat = await catalogoDi(paese);
  if (!cat) return [];

  const cercate = parole(richiesta);
  if (cercate.length === 0) return [];

  // Quante volte ogni voce viene nominata dalle parole cercate.
  const conteggio = new Map<number, number>();

  /* E QUANTO PESANO QUELLE PAROLE, che non e' la stessa domanda.
     Contandole e basta, «wholemeal» vale quanto «pasta» — e siccome di roba
     integrale il catalogo e' pieno mentre la pasta e' una cosa sola, per
     «Wholemeal pasta» vinceva un PANE: aveva una parola su due, come tutti
     gli altri, e la spuntava sugli altri criteri.

     Misurato, gli stessi errori in quattro lingue:
       «Wholemeal pasta»      → Warburtons Wholemeal (pane)
       «Oignons jaunes»       → lentilles jaunes      (matcha solo il colore)
       «Yaourt grec nature»   → yaourt nature         (perde «grec»)
       «Carne picada»         → bolitas de carne      (perde «picada»)
       «Pommes Golden»        → puree pommes          (perde «golden»)

     Una parola che compare in mezzo catalogo non distingue niente; una che
     compare raramente distingue quasi da sola. Il peso e' il logaritmo di
     quante voci NON la contengono — la misura di quanto sorprende trovarla —
     ed e' la stessa cosa che fa qualunque motore di ricerca da cinquant'anni.
     Qui serve perche' le liste della spesa sono fatte cosi': un nome e uno o
     due aggettivi, e l'aggettivo da solo non e' mai la risposta. */
  const peso = new Map<number, number>();
  const quanteVoci = cat.voci.length || 1;

  for (const forme of formeDelleParole(richiesta)) {
    /* UNA PAROLA CHIESTA VALE UN PUNTO, anche quando si scrive in due modi.
       «Käse» si cerca come `kase` e come `kaese`, e un prodotto che le ha tutte
       e due nell'indice — perche' ce le ha messe il caricamento — non deve
       prendere due punti per una parola sola: varrebbe il doppio di chi si
       chiama «Gouda», e la classifica si storcerebbe a favore di chi ha la
       dieresi. Quindi le voci toccate si raccolgono e si contano una volta. */
    const toccate = new Set<number>();
    for (const p of forme) {
      const dove = cat.indice.get(p);
      if (!dove) continue;
      // Una parola presente in mezzo catalogo non distingue niente e rallenta.
      if (dove.length > cat.voci.length / 3) continue;
      for (const i of dove) toccate.add(i);
    }
    if (toccate.size === 0) continue;

    /* Quanto e' rara questa parola nel catalogo di QUESTO paese. Si misura
       ogni volta e non si scrive da nessuna parte: «bio» e' comune in
       Germania e rara altrove, e un elenco fatto a mano invecchierebbe a ogni
       insegna che Antonio aggiunge. */
    const rarita = Math.log(quanteVoci / toccate.size);

    for (const i of toccate) {
      conteggio.set(i, (conteggio.get(i) ?? 0) + 1);
      peso.set(i, (peso.get(i) ?? 0) + rarita);
    }
  }

  /* CHI HA TUTTE LE PAROLE VIENE PRIMA, E DI SOLITO BASTA LUI.
     Il conteggio da solo e' troppo generoso: in «Orata fresca» la parola
     «fresca» sta in mezzo catalogo, e una ricotta fresca prende un punto
     esattamente come un'orata. Chiedere TUTTE le parole della voce toglie di
     mezzo quel genere di abbinamento senza inventare punteggi.

     Ma non si impone: se nessun prodotto le ha tutte si torna al conteggio,
     perche' una voce scritta in modo insolito — «Cuori di merluzzo surgelati»
     contro «cuori di filetti di merluzzo» — deve comunque trovare qualcosa, e
     a scegliere fra i sopravvissuti c'e' comunque il modello, dopo.

     Fuori intanto due categorie che non possono mai essere la risposta: il
     non-alimentare e le preparazioni che contengono l'ingrediente cercato
     senza essere l'ingrediente. */
  const ammesso = (i: number): boolean => {
    const nome = cat.voci[i].nome;
    if (!alimentarePlausibile(nome)) return false;
    if (paPreparazione(nome) && !cercate.some((w) => paPreparazione(w))) return false;
    return true;
  };

  const validi = [...conteggio.entries()].filter(([i]) => ammesso(i));
  const complete = validi.filter(([, punti]) => punti === cercate.length);
  const usati = complete.length ? complete : validi;

  /** Quanta parte del nome e' la cosa cercata: 2 parole su 3 batte 2 su 5. */
  const quota = (i: number, punti: number): number => punti / (cat.voci[i].parole.length || 1);

  /* Due criteri diversi, tenuti tutti e due: la QUOTA dice quale nome parla
     davvero del prodotto cercato — senza, per «cheddar cheese» vinceva
     «vintage cheddar cheese twist» su «morrisons cheddar cheese» — e la
     diversita' per insegna qui sotto impedisce che i tre candidati finiscano
     tutti nella stessa catena. */
  const ordinati = usati.sort(
    (a, b) =>
      /* Il PESO viene prima del conteggio: chi ha la parola che distingue
         batte chi ne ha tante di comuni. A parita' di peso — cioe' quando
         hanno davvero le stesse parole — decidono i criteri di sempre. */
      (peso.get(b[0]) ?? 0) - (peso.get(a[0]) ?? 0) ||
      b[1] - a[1] ||
      quota(b[0], b[1]) - quota(a[0], a[1]) ||
      // A pari pertinenza vince chi il prezzo lo dichiara piu' spesso: e' il
      // posto giusto per la resa, dopo le due misure di quanto il nome
      // somiglia a cio' che e' stato chiesto.
      cat.voci[b[0]].resa - cat.voci[a[0]].resa ||
      cat.voci[a[0]].nome.length - cat.voci[b[0]].nome.length,
  );

  /* UN CANDIDATO PER INSEGNA, PRIMA DI RIPETERE.
     Ordinando solo per parole in comune, i candidati di una voce finivano
     quasi sempre nella STESSA catena — quella con i nomi piu' descrittivi — e
     se quella non espone i prezzi la voce restava vuota.

     Misurato in Spagna: aggiungendo quattro insegne le voci con prezzo sono
     SCESE da quattro a una su nove. Piu' catalogo e meno prezzi, perche' i
     candidati si concentravano invece di distribuirsi.

     Ora si prende il migliore di ogni insegna prima di prenderne un secondo
     dalla stessa. E' anche cio' che serve a un'app di confronto: tre offerte
     dello stesso negozio non sono un confronto. */
  /* LE INSEGNE GENEROSE PER PRIME, MA SOLO A PARITA' DI PERTINENZA.
     A parita' di parole in comune conviene provare la catena che il prezzo lo
     dichiara: in Spagna solo Bonpreu lo fa, e senza quell'ordine i candidati
     finivano sulle mute.

     LA RESA PERO' NON DEVE SCAVALCARE LA PERTINENZA, E PRIMA LO FACEVA.
     Ordinando per resa e SOLO POI per parole in comune, il candidato debole di
     una catena generosa batteva quello giusto di una catena avara. Misurato
     sullo stesso piano londinese, prima e dopo il merge: le voci con prodotto
     e link sono scese da 13 su 16 a 10 su 16, con cinquantuno pagine aperte
     invece di trentasette. Piu' lavoro, meno risultato.

     Si vedeva nei candidati: per «fresh spinach» arrivava «sainsburys fresh
     GNOCCHI», per «milk» arrivava «waitrose milk BUNS» — che e' pane. Erano
     entrati perche' la loro insegna dichiara i prezzi piu' spesso, non perche'
     somigliassero a quello che l'utente aveva scritto.

     Ora la resa fa da spareggio dentro `ordinati`, e la passata per insegna
     scorre in ordine di PERTINENZA: la diversita' resta — il migliore di ogni
     catena prima di prenderne un secondo dalla stessa — ma non compra il posto
     a un candidato sbagliato. */
  const scelti: typeof ordinati = [];
  const viste = new Set<string>();
  for (const riga of ordinati) {
    if (scelti.length >= quanti) break;
    const insegna = cat.voci[riga[0]].insegna;
    if (viste.has(insegna)) continue;
    viste.add(insegna);
    scelti.push(riga);
  }
  for (const riga of ordinati) {
    if (scelti.length >= quanti) break;
    if (!scelti.includes(riga)) scelti.push(riga);
  }

  return scelti
    .map(([i, punti]) => ({
      nome: cat.voci[i].nome,
      url: cat.voci[i].url,
      insegna: cat.voci[i].insegna,
      punteggio: punti,
    }));
}

/** Cosa c'e' in memoria adesso: serve all'endpoint di stato e alle prove. */
export function statoCatalogo() {
  return {
    paesiDisponibili: paesiConCatalogo(),
    caricati: [...caricati.values()].map((c) => ({
      paese: c.paese,
      prodotti: c.voci.length,
      insegne: c.insegne,
      aggiornato: new Date(c.aggiornato).toISOString(),
    })),
    inCaricamento: [...inCorso.keys()],
    /* Chi e' stato tagliato dal tetto. Un elenco vuoto significa «niente
       troncato», non «non lo sappiamo»: e' la differenza fra un silenzio e
       una risposta. */
    troncatiDalTetto: [...troncati.entries()].map(([chiave, t]) => ({
      paese: chiave.split("|")[0],
      insegna: t.insegna,
      tenuti: t.tenuti,
      visteAlmeno: t.visteAlmeno,
      tetto: MAX_PER_INSEGNA,
    })),
  };
}

/** Butta via quel che c'e' in memoria: il prossimo uso riscarica. */
export function svuotaCatalogo(): void {
  caricati.clear();
}
