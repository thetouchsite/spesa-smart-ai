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
 * Quaranta: i cataloghi veri sono spezzati in decine di file — Alcampo ne ha
 * una ventina — e fermarsi a poche significa caricare un frammento. Oltre, si
 * scaricano megabyte per prodotti che il tetto per insegna non fa entrare
 * comunque.
 */
const MAX_FIGLIE = 40;

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

const indirizzi = (xml: string): string[] =>
  [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);

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

  return migliore.replace(/[-_+]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Parole confrontabili: senza accenti, senza numeri isolati, senza sigle corte. */
export function parole(testo: string): string[] {
  const piano = testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return [...new Set(piano.split(/[^a-z0-9]+/).filter((p) => p.length > 2))];
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

function alimentarePlausibile(nome: string): boolean {
  return !NON_ALIMENTARI.some((re) => re.test(nome));
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
  /\b(frollin|biscott|merendin|brioche|briochin|croissant|cornett|snack|gelat[oi]|budin|torta|tortin|crostat|wafer|crackers|grissin|pandoro|panettone|colomba|ripien[oi]|farcit|arrost|affettat|precott|impanat|affumicat|stagionat|al forno)/i;

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
 */
function paScheda(u: string): boolean {
  if (
    /\/(p|product|products|producto|productos|produkt|produkte|prodotto|prodotti|produit|produits|artikel|item|items|urun|proizvod|pdp|dp)\//i.test(u)
  ) {
    return true;
  }
  return /[a-z]{3,}(?:-[a-z0-9]{2,}){2,}[/-]\d{6,}/i.test(u);
}

async function daUnaFonte(fonte: FonteCatalogo): Promise<VoceCatalogo[]> {
  const voci: VoceCatalogo[] = [];
  const visti = new Set<string>();

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

    // Un indice: le sue voci sono altre sitemap, non prodotti.
    if (/<sitemapindex/i.test(xml)) {
      // Tetto sulle figlie: alcuni indici ne hanno centinaia, e oltre un certo
      // punto si scaricano megabyte per prodotti che non entrano comunque.
      for (const figlia of indirizzi(xml).slice(0, MAX_FIGLIE)) {
        if (!gia.has(figlia)) daAprire.push(figlia);
      }
      continue;
    }

    for (const u of indirizzi(xml)) {
      if (visti.has(u)) continue;
      visti.add(u);
      if (!paScheda(u)) continue;
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
      console.warn(`[catalogo] ${paese} ${f.insegna}: niente (la sitemap non ha risposto)`);
    }
  }

  if (daDatabase > 0) {
    console.info(`[catalogo] ${paese}: ${daDatabase}/${fonti.length} insegne lette dal database`);
  }

  if (voci.length === 0) return null;

  // L'indice inverso: senza, ogni ricerca scorrerebbe centomila voci.
  const indice = new Map<string, number[]>();
  voci.forEach((v, i) => {
    for (const p of v.parole) {
      const dove = indice.get(p);
      if (dove) dove.push(i);
      else indice.set(p, [i]);
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
 * A parita' di parole trovate vince il nome PIU' CORTO, e non e' un dettaglio:
 * fra «Pomodori pelati» e «Pomodori pelati bio in confezione da 12 con
 * basilico», per una voce che dice «pomodori pelati» il primo e' quello
 * giusto. Il nome lungo di solito e' un formato particolare.
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
  for (const p of cercate) {
    const dove = cat.indice.get(p);
    if (!dove) continue;
    // Una parola presente in mezzo catalogo non distingue niente e rallenta.
    if (dove.length > cat.voci.length / 3) continue;
    for (const i of dove) conteggio.set(i, (conteggio.get(i) ?? 0) + 1);
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
    if (PREPARAZIONI.test(nome) && !cercate.some((w) => PREPARAZIONI.test(w))) return false;
    return true;
  };

  const validi = [...conteggio.entries()].filter(([i]) => ammesso(i));
  const complete = validi.filter(([, punti]) => punti === cercate.length);
  const usati = complete.length ? complete : validi;

  const ordinati = usati.sort(
    (a, b) => b[1] - a[1] || cat.voci[a[0]].nome.length - cat.voci[b[0]].nome.length,
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
  /* LE INSEGNE GENEROSE PER PRIME.
     A parita' di parole in comune conviene provare la catena che il prezzo lo
     dichiara. In Spagna solo Bonpreu lo fa — Alcampo, Consum, Mercadona, Aldi
     ed El Corte Ingles sono a zero — e senza questo ordine i candidati
     finivano su quelle mute. */
  const perResa = [...ordinati].sort(
    (a, b) => cat.voci[b[0]].resa - cat.voci[a[0]].resa || b[1] - a[1],
  );

  const scelti: typeof ordinati = [];
  const viste = new Set<string>();
  for (const riga of perResa) {
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
  };
}

/** Butta via quel che c'e' in memoria: il prossimo uso riscarica. */
export function svuotaCatalogo(): void {
  caricati.clear();
}
