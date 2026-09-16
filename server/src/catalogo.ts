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

/** Un prodotto del catalogo. */
export interface VoceCatalogo {
  /** Nome ricavato dall'indirizzo: e' quello che si confronta con la lista. */
  nome: string;
  url: string;
  insegna: string;
  /** Parole del nome, gia' ripulite: si calcolano una volta, non a ogni ricerca. */
  parole: string[];
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
 * Quante sitemap figlie si aprono quando la prima e' un indice.
 *
 * Duecento coprono le insegne viste — Sainsbury's ne ha 165, Tesco 8 — e
 * fermano un indice malformato prima che tenga occupato il lavoro notturno per
 * ore. Chi ne ha di piu' viene troncato, e il troncamento si dichiara come
 * tutti gli altri.
 */
const FIGLIE_MAX = 200;

/** Chi e' stato tagliato dal tetto, e di quanto. Solo per dirlo, non per usarlo. */
const troncati = new Map<string, { insegna: string; tenuti: number; visteAlmeno: number }>();

const caricati = new Map<string, CatalogoPaese>();
/** Chi sta gia' scaricando un paese: due richieste insieme non lo scaricano due volte. */
const inCorso = new Map<string, Promise<CatalogoPaese | null>>();

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/* ─────────────────────────── Scaricare ─────────────────────────── */

async function scarica(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Encoding": "gzip, deflate" },
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

function nomeDaUrl(url: string): string | null {
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
  /\b(crocchett|croccantin|gatt[oi]?|cane|cani|cucciol|cuccioli|mangim)/i,
  /\b(detersiv|detergent|ammorbid|candeggi|sgrassat|anticalcar|shampoo|balsamo|bagnoschiuma|sapone|dentifric|deodorant|assorbent|pannolin|salviett|tovagliol|carta igienic|polish|insettic)/i,
  /\b(haribo|caramell|gommos|liquiriz|chewing|lecca lecca)/i,
  /\b(quaderno|portamine|matite|penna a sfera|astuccio|pila|batteri)/i,
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
  /\b(frollin|biscott|merendin|brioche|briochin|croissant|cornett|snack|gelat[oi]|budin|torta|tortin|crostat|wafer|crackers|grissin|pandoro|panettone|colomba|ripien[oi]|farcit|arrost|affettat|precott|impanat|affumicat|stagionat|al forno)/i;

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
function paScheda(u: string): boolean {
  if (NON_E_UNA_PAGINA.test(u)) return false;
  if (
    /\/(p|product|products|producto|productos|produkt|produkte|prodotto|prodotti|produit|produits|artikel|item|items|urun|proizvod|pdp|dp)\//i.test(u)
  ) {
    return true;
  }
  return /[a-z]{3,}(?:-[a-z0-9]{2,}){2,}[/-]\d{6,}/i.test(u);
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

  // La prima parte, poi le successive finche' rispondono: molte sitemap sono
  // spezzate, e fermarsi alla prima significa perdere il grosso del catalogo.
  const daProvare = [fonte.sitemap, ...partiSuccessive(fonte.sitemap)];

  for (const url of daProvare) {
    if (tagliato) break;
    const xml = await scarica(url);
    if (!xml) {
      // La prima deve rispondere; se cade una delle successive, e' finita.
      if (url === fonte.sitemap) break;
      break;
    }

    /* UN INDICE NON E' UN ELENCO DI PRODOTTI, E FINORA LO TRATTAVAMO COSI'.
       Parecchie insegne non pubblicano un file solo: pubblicano un
       `<sitemapindex>` che elenca altri file. Sainsbury's ne ha 165, Tesco 8.
       Letti come se fossero prodotti, quei 165 indirizzi vengono scartati da
       `paScheda` — giustamente, non sono schede — e l'insegna risulta con zero
       prodotti mentre ne pubblica quasi diecimila.

       Si scende di un livello solo: e' quanto basta per tutte le insegne viste,
       e un secondo livello moltiplicherebbe le richieste senza aggiungere
       niente. Il tetto `FIGLIE_MAX` c'e' perche' un indice sbagliato o enorme
       non deve poter tenere occupato il lavoro notturno per ore. */
    const figlie = /<sitemapindex/i.test(xml) ? indirizzi(xml).slice(0, FIGLIE_MAX) : [];
    const pagine: string[] = [];
    if (figlie.length) {
      for (const f of figlie) {
        if (voci.length >= MAX_PER_INSEGNA) break;
        const sotto = await scarica(f);
        if (sotto) pagine.push(...indirizzi(sotto));
      }
    } else {
      pagine.push(...indirizzi(xml));
    }

    for (const u of pagine) {
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
      voci.push({ nome, url: u, insegna: fonte.insegna, parole: p });
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
  for (const f of fonti) {
    const sue = await daUnaFonte(f);
    if (sue.length > 0) {
      voci.push(...sue);
      insegne.push(f.insegna);
      console.info(`[catalogo] ${paese} ${f.insegna}: ${sue.length} prodotti`);
    } else {
      console.warn(`[catalogo] ${paese} ${f.insegna}: niente (la sitemap non ha risposto)`);
    }
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
  const pronto = catalogoGiaPronto(paese);
  if (!pronto) {
    void catalogoDi(paese);
    console.info(`[catalogo] ${paese} non ancora pronto: lo carico per la prossima volta`);
    return [];
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
    if (paPreparazione(nome) && !cercate.some((w) => paPreparazione(w))) return false;
    return true;
  };

  const validi = [...conteggio.entries()].filter(([i]) => ammesso(i));
  const complete = validi.filter(([, punti]) => punti === cercate.length);
  const usati = complete.length ? complete : validi;

  /** Quanta parte del nome e' la cosa cercata: 2 parole su 3 batte 2 su 5. */
  const quota = (i: number, punti: number): number => {
    const quante = cat.voci[i].parole.length || 1;
    return punti / quante;
  };

  return usati
    .sort(
      (a, b) =>
        b[1] - a[1] ||
        quota(b[0], b[1]) - quota(a[0], a[1]) ||
        cat.voci[a[0]].nome.length - cat.voci[b[0]].nome.length,
    )
    .slice(0, quanti)
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
