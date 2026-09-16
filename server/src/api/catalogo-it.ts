/**
 * Il catalogo italiano: link veri per costruzione, non indovinati.
 *
 * IL PROBLEMA CHE RISOLVE
 * -----------------------
 * Il motore con ricerca trova prezzi veri, ma gli indirizzi li ricostruisce a
 * naso quando non li conosce: seguono lo schema giusto del sito e non esistono.
 * Il controllo delle pagine ne butta molti, e l'utente resta con la riga senza
 * link; quelli che passano perche' il sito risponde 403 a chiunque — e un 403
 * non distingue una pagina che c'e' da una che non c'e' — arrivano all'utente
 * e danno 404 quando li apre.
 *
 * Qui il problema si toglie alla radice: **l'indirizzo non si indovina, si
 * legge dalla sitemap che il negozio stesso pubblica.** Un URL che sta nella
 * sitemap di Carrefour esiste per costruzione. Non c'e' niente da verificare
 * sull'esistenza: al massimo il prodotto e' finito, e allora la pagina lo dice.
 *
 * LA RICOGNIZIONE, FATTA IL 2026-09-15
 * ------------------------------------
 * Sondate trenta insegne italiane. Quasi tutte rispondono 404 ai percorsi di
 * ricerca ipotizzati — non perche' il catalogo sia chiuso, ma perche' il
 * percorso indovinato era sbagliato: lo stesso errore del modello, fatto da
 * noi. La regola che ne e' uscita, e che vale per chiunque aggiunga
 * un'insegna: **il percorso della sitemap si legge in `robots.txt`, non si
 * deduce.** Su easycoop.com `/sitemap.xml` non esiste e la sitemap sta in
 * `/sitemap/sitemap.xml`; cercandola dove sembrava ovvio avevamo concluso che
 * Coop non pubblicasse il catalogo, ed e' la seconda catena del paese.
 *
 *     Carrefour        26.725   sitemap + JSON-LD      ✓ link + prezzo
 *     Bennet           20.446   sitemap + JSON         ✓ link + prezzo
 *     Unes             15.363   sitemap + JSON         ✓ link + prezzo
 *     Coop             13.301   sitemap + JSON-LD      ✓ link + prezzo
 *     Unicoop Tirreno  10.230   sitemap + JSON-LD      ✓ link + prezzo
 *     Cortilia          6.377   sitemap + JSON-LD      ✓ link + prezzo
 *     Conad             5.026   sitemap + JSON-LD      ✓ link + prezzo
 *     Aldi                678   sitemap + JSON-LD      ✓ link + prezzo
 *     Eurospin          ricerca EBSN, dal vivo         ✓ link + prezzo
 *     Effepiu           ricerca EBSN, dal vivo         ✓ link + prezzo
 *     Tigros            1.500   prezzo solo in JS      ✓ solo link
 *
 * Circa NOVANTOTTOMILA prodotti indicizzati piu' due insegne interrogate dal
 * vivo: DIECI insegne italiane che si confrontano sulla stessa lista.
 *
 * Le fonti sono tre e stanno una accanto all'altra, non una al posto
 * dell'altra: l'indice costruito dalle sitemap, la ricerca EBSN (dove a
 * cercare e' il motore del negozio, non il nostro) e i volantini.
 *
 * IL NEGOZIO STA QUASI SEMPRE SU UN ALTRO DOMINIO. Conad vende su
 * `spesaonline.conad.it` e Unes su `spesaonline.unes.it`; guardando i siti
 * d'insegna si conclude che non abbiano catalogo. E' l'intuizione che ha
 * aperto meta' di questo elenco.
 *
 * HANNO IL CATALOGO MA NON I PREZZI, e per ora restano fuori: il loro
 * indirizzo e' vero e apribile, ma la pagina arriva come guscio di pochi kB e
 * il prezzo lo scrive il browser. Verificati uno per uno:
 *
 *     CoopShop (Nova Coop, Coop Lombardia, Coop Liguria)   54.581
 *     Iper La Grande i                                     21.054
 *     Esselunga                                            17.709
 *     Effepiu                                              11.167
 *     Basko                                                 9.044
 *     Eurospin                                              8.911
 *     NaturaSi                                              7.000
 *     Pam Panorama                                          6.135
 *
 * Sono centotrentacinquemila indirizzi veri che aspettano solo un'interfaccia
 * capace di mostrare un link senza un prezzo accanto. Il giorno che c'e', si
 * aggiungono con una riga ciascuno e `prezzoLeggibile: false`. Ne fanno parte
 * anche Effepiu, NaturaSi e Cosaporto, dati per buoni da una ricognizione
 * automatica e smentiti aprendo le pagine: gusci da tre a dodici kB.
 *
 * NON ENUMERABILI, e vale la pena sapere perche'. CosiComodo ospita quindici
 * insegne in un solo sito — Sole365, Il Gigante, Famila, Emisfero, Dok,
 * Galassia, Italmark, Mercato, Pan — ma pubblica solo un centinaio di pagine
 * di reparto ciascuna, non i cataloghi. Pam scrive i prezzi solo nel testo, e
 * il primo numero della pagina e' la soglia di spedizione gratuita: leggerlo
 * significherebbe spacciare 70,00 € per il prezzo dell'uva.
 *
 * Everli pubblica un catalogo ma `robots.txt` vieta `/supermercato/`, che e'
 * esattamente dove stanno i prodotti: escluso, e non si discute. Bofrost ha
 * una sitemap che contiene solo articoli di blog.
 *
 * QUANTO RENDE, MISURATO
 * ----------------------
 * Sulla lista vera di diciotto voci generata in produzione il 15 settembre:
 *
 *     116 pagine aperte, 116 riuscite    zero indirizzi morti
 *     87 offerte, 87 con link vero       il 100%
 *     16 voci su 18 con prezzo verificato
 *     dieci insegne a confronto
 *     12 secondi, costo zero             (4 per il catalogo, il resto verifica)
 *
 * Per confronto, il motore con ricerca sulla stessa lista: 18 voci su 18, ma
 * 62 secondi, 6 centesimi di dollaro e **22 link validi su 48**. Le due strade
 * non competono: il catalogo copre il certo, il motore riempie i buchi.
 *
 * Le tre voci sotto la soglia di confidenza non vengono dichiarate — meglio
 * una riga senza prezzo che un prodotto sbagliato con un prezzo giusto, che e'
 * l'errore piu' difficile da accorgersene.
 *
 * COME SI AGGIUNGE UN'INSEGNA
 * ---------------------------
 * Una riga in `CATALOGHI`. Serve solo che pubblichi una sitemap di prodotto e
 * che `robots.txt` non la vieti. Se i prezzi non sono leggibili dal server si
 * mette `prezzoLeggibile: false`: il link vale comunque, ed e' meta' del
 * problema risolto.
 */

import { readPrices, porzioneConPrezzi } from "./price-page.js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

export interface Catalogo {
  id: string;
  nome: string;
  /** ISO del paese servito. Oggi solo IT. */
  paese: string;
  sitemap: string;
  /** Come si ricava nome e codice dall'indirizzo del prodotto. */
  slug: RegExp;
  /** Il prezzo si legge dal server, o la pagina e' un guscio riempito in JS? */
  prezzoLeggibile: boolean;
  /**
   * Il nome del prodotto sta nella sitemap delle IMMAGINI, non nell'indirizzo.
   *
   * Alcune catene indirizzano i prodotti per categoria e numero —
   * `/pasta-e-riso/pasta-di-semola/classica/256.html` — e del prodotto non
   * dicono niente. Sembrerebbero inutilizzabili: senza nome non si puo'
   * cercare, e aprire dodicimila pagine per leggerlo non e' una strada.
   *
   * Ma la sitemap delle immagini, che esiste per Google Immagini, lega a ogni
   * indirizzo il titolo del prodotto:
   *
   *     <loc>.../caffe-macinato-moka/89.html</loc>
   *     <image:title>CAFFE' LAVAZZA CREMA E GUSTO MACINATO SACC. G 250</image:title>
   *
   * E' lo stesso catalogo, scritto in un file diverso. Con questo si recupera
   * un'insegna intera che altrimenti resterebbe fuori.
   */
  nomiDaImmagini?: boolean;
}

export const CATALOGHI: Catalogo[] = [
  {
    id: "carrefour",
    nome: "Carrefour",
    paese: "IT",
    sitemap: "https://www.carrefour.it/sitemap_0-product.xml",
    // /p/<nome-prodotto>/<ean>.html — il codice a barre e' dentro l'indirizzo.
    slug: /\/p\/([^/]+)\/([^/]+)\.html$/,
    prezzoLeggibile: true,
  },
  {
    id: "easycoop",
    nome: "Coop",
    paese: "IT",
    /* IL PERCORSO E' QUELLO DICHIARATO, NON QUELLO OVVIO.
       `/sitemap.xml` su easycoop.com non esiste: la sitemap sta in
       `/sitemap/sitemap.xml`, e lo dice robots.txt. E' esattamente l'errore che
       il motore fa con gli indirizzi dei prodotti — indovinare invece di
       leggere — e per un giro l'abbiamo fatto anche noi, perdendo la catena
       piu' grande dopo Carrefour. */
    sitemap: "https://www.easycoop.com/sitemap/sitemap.xml",
    slug: /\/([^/]+?)-(\d{6,})\.html$/,
    prezzoLeggibile: true,
  },
  {
    id: "unes",
    nome: "Unes",
    paese: "IT",
    /* Il negozio sta su un SOTTODOMINIO DIVERSO dal sito dell'insegna:
       `spesaonline.unes.it`, non `unes.it`. Cercando sul dominio corporate si
       conclude che la catena non ha catalogo, ed e' sbagliato. Vale per Conad
       allo stesso modo. */
    sitemap: "https://www.spesaonline.unes.it/sitemap.xml",
    slug: /\/([^/]+)\/p\/(\d+)$/,
    prezzoLeggibile: true,
  },
  {
    id: "bennet",
    nome: "Bennet",
    paese: "IT",
    sitemap: "https://www.bennet.com/sitemap.xml",
    slug: /\/([^/]+)\/p\/([A-Za-z0-9_]+)$/,
    prezzoLeggibile: true,
  },
  {
    id: "conad",
    nome: "Conad",
    paese: "IT",
    /* Conad non ha robots.txt — risponde 404 — ma la sitemap dei prodotti c'e'
       lo stesso, a un percorso che nessuna regola dichiara. Nessuna regola
       significa nessun divieto, e l'indirizzo lo abbiamo trovato provandolo,
       non deducendolo. */
    sitemap: "https://spesaonline.conad.it/sitemap/products.xml",
    // Qui il nome sta DOPO /p/, non prima: /p/<nome>--<codice>.
    slug: /\/p\/([^/]+?)--(\d+)$/,
    prezzoLeggibile: true,
  },
  {
    id: "unicooptirreno",
    nome: "Unicoop Tirreno",
    paese: "IT",
    sitemap: "https://coopacasa.coopetruria.coop.it/sitemap_index.xml",
    // /<reparto>/<categoria>/<sottocategoria>/<numero>.html: del prodotto
    // l'indirizzo non dice nulla, il nome arriva dalle immagini.
    slug: /\/([^/]+)\/(\d+)\.html$/,
    prezzoLeggibile: true,
    nomiDaImmagini: true,
  },
  {
    id: "aldi",
    nome: "Aldi",
    paese: "IT",
    sitemap: "https://www.aldi.it/sitemap_products.xml",
    slug: /\/prodotto\/([^/]+?)-(\d{12,})$/,
    prezzoLeggibile: true,
  },
  {
    id: "cortilia",
    nome: "Cortilia",
    paese: "IT",
    sitemap: "https://www.cortilia.it/sitemap.xml",
    slug: /\/prodotti\/([^/]+?)_([A-Z0-9]+)$/,
    prezzoLeggibile: true,
  },
  /* LIDL E' STATO TOLTO, E VALE LA PENA SAPERE PERCHE'.
     La sua sitemap esiste, i prezzi si leggono, i link reggono: sembrava una
     buona catena. Ma i 451 prodotti che pubblica sono il non-alimentare della
     settimana — piante da giardino, detersivi, utensili. Su una lista della
     spesa agganciava il vagamente simile e proponeva sette voci per 497 euro.
     Il filtro anti-implausibile le buttava tutte, quindi il danno era nullo e
     il lavoro pure: cinque richieste HTTP a generazione per niente.
     Da riaprire il giorno in cui Lidl pubblichera' il catalogo alimentare. */
  {
    id: "tigros",
    nome: "Tigros",
    paese: "IT",
    sitemap: "https://www.tigros.it/product1.xml",
    slug: /\/product\/([^/]+)$/,
    // La pagina arriva come guscio da 3 kB: il prezzo lo scrive il browser.
    // Il link resta vero, e per chi compra e' cio' che conta.
    prezzoLeggibile: false,
  },
];

/* ─────────────────────────── Parole e confronto ─────────────────────────── */

/**
 * Parole che non distinguono un prodotto da un altro.
 *
 * Ci stanno anche le unita' di misura: "1 kg" non rende un prodotto diverso da
 * un altro, e tenerle faceva vincere confezioni a caso solo perche'
 * combaciava il formato.
 */
const STOP = new Set([
  "di", "da", "del", "della", "dei", "delle", "al", "alla", "con", "in", "e", "a",
  "il", "la", "lo", "i", "gli", "le", "un", "una", "confezione", "bottiglia",
  "bottiglie", "sacco", "pz", "kg", "gr", "ml", "lt", "cl", "fette", "medie",
  "tipo", "circa", "conf", "pezzi", "bio", "dop", "igp", "fresco", "surgelato",
]);

/**
 * Quante lettere devono combaciare perche' due parole possano essere la stessa.
 *
 * Coop non scrive i nomi per esteso, li tronca — e li tronca a lunghezze
 * diverse: `scamorz gl sp coop 300g`, `pass pom`, `latte fr int`. Sono nomi di
 * magazzino, non di scaffale.
 *
 * Tagliare tutto a una lunghezza fissa non funziona, ed e' stato provato: con
 * cinque lettere `pass` resta `pass` e `passata` diventa `passa`, che non
 * combaciano — quattordicimila prodotti restavano invisibili mentre l'indice
 * dichiarava di averli. Con quattro lettere combaciano, ma combaciano anche
 * `latte` e `lattuga`, che e' molto peggio.
 *
 * Quindi non si taglia: si confronta per PREFISSO. Due parole sono la stessa se
 * una comincia con l'altra e condividono almeno quattro lettere. `pass` sta in
 * `passata` e vanno insieme; `latte` non sta in `lattuga` — divergono alla
 * quinta — e restano separate. E' la regola che tiene entrambe le cose.
 */
const PREFISSO_MIN = 4;

/**
 * Prodotti che non possono MAI essere la risposta giusta.
 *
 * La lista della spesa nasce dalle ricette: e' tutta cibo da cucinare. Quindi
 * un croccantino per gatti o un detersivo non e' un abbinamento debole da
 * pesare — e' un abbinamento impossibile, e pesarlo e' solo un modo lento di
 * sbagliare.
 *
 * Serve perche' quando una voce si riduce a una parola sola e generica il
 * punteggio non basta piu' a distinguere. «Uova medie» perde «medie» (non
 * distingue niente) e «10» (e' un numero): resta «uova», e con quella sola
 * parola le caramelle `haribo uova al tegamino` valgono quanto le uova vere.
 * Misurato: vincevano pure, perche' costano meno — e un prezzo vero attaccato
 * al prodotto sbagliato e' l'errore di cui l'utente non si accorge.
 */
const NON_ALIMENTARI = [
  // Animali
  /\b(crocchett|croccantin|gatt[oi]?|cane|cani|cucciol|cuccioli|mangim)/i,
  // Casa e cura della persona
  /\b(detersiv|detergent|ammorbid|candeggi|sgrassat|anticalcar|shampoo|balsamo|bagnoschiuma|sapone|dentifric|deodorant|assorbent|pannolin|salviett|tovagliol|carta igienic|polish|insettic)/i,
  // Dolciumi da banco: non sono ingredienti di una ricetta
  /\b(haribo|caramell|gommos|liquiriz|chewing|lecca lecca)/i,
  // Cancelleria e casalinghi finiti nelle sitemap generaliste
  /\b(quaderno|portamine|matite|penna a sfera|astuccio|pila|batteri)/i,
];

function alimentarePlausibile(slug: string): boolean {
  return !NON_ALIMENTARI.some((re) => re.test(slug));
}

/**
 * La trappola dell'ingrediente dentro la preparazione.
 *
 * `frollini con uova` contiene la parola «uova» ed e' un biscotto. Quando la
 * voce della lista si riduce a una parola sola — «Uova medie 10» perde «medie»
 * e il numero — il punteggio da' ragione al biscotto, e il biscotto costa meno,
 * quindi vince il confronto fra insegne.
 *
 * Queste parole dicono «sono una preparazione, l'ingrediente che cerchi e'
 * dentro di me»: se compaiono nel nome del prodotto ma NON nella voce cercata,
 * il prodotto non e' quello che serve per cucinare.
 */
const PREPARAZIONI =
  /\b(frollin|biscott|merendin|brioche|briochin|croissant|cornett|snack|gelat[oi]|budin|torta|tortin|crostat|wafer|crackers|grissin|pandoro|panettone|colomba|ripien[oi]|farcit|arrost|affettat|precott|impanat|affumicat|stagionat|al forno|sfoglia|insalat|salad|pronto in|gia' pronto|gia pronto|monoporzion|condit|saltat|grigliat|marinat|panat)/i;

function parole(s: string): string[] {
  let t = s;
  try {
    t = decodeURIComponent(s);
  } catch {
    /* slug con % non validi: si usa il grezzo */
  }
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
}

interface Voce {
  url: string;
  slug: string;
  codice: string;
  parole: string[];
  set: Set<string>;
}

interface Indice {
  catalogo: Catalogo;
  voci: Voce[];
  df: Map<string, number>;
  /** Prime quattro lettere -> tutte le parole dell'indice che cominciano cosi'. */
  perPrefisso: Map<string, string[]>;
  creatoIl: number;
}

/* ───────────────────────────── L'indice ───────────────────────────── */

const indici = new Map<string, Indice>();
const inCorso = new Map<string, Promise<Indice | null>>();

/** Un giorno. I cataloghi cambiano, ma non fra le 9 e le 9 e un quarto. */
const TTL_MS = 24 * 60 * 60 * 1000;

async function scarica(url: string): Promise<string> {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
    headers: { "User-Agent": UA, "Accept-Language": "it-IT,it;q=0.9" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (url.endsWith(".gz")) {
    const { gunzipSync } = await import("node:zlib");
    return gunzipSync(buf).toString("utf8");
  }
  return buf.toString("utf8");
}

/** Le `<loc>` di una sitemap, seguendo un eventuale indice. */
async function indirizzi(sitemap: string, slug: RegExp): Promise<string[]> {
  const xml = await scarica(sitemap);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim());

  if (!/<sitemapindex/i.test(xml)) return locs;

  /* E' UN INDICE: SI SCENDE NELLE FIGLIE.
     Prima si provano quelle che nel nome dichiarano di contenere prodotti,
     perche' su cataloghi grandi evita di scaricare le sitemap delle pagine
     editoriali. Ma il nome non e' garantito: Coop chiama le sue `sitemap-1-1`
     e `sitemap-1-2`, e filtrando per nome si perdevano quindicimila prodotti.
     Quindi, quando nessun nome parla di prodotti, si scendono comunque le
     prime figlie — tanto a decidere cos'e' un prodotto e' il pattern
     dell'indirizzo, non il nome del file. */
  const perNome = locs.filter((l) => /prod|catalog|articol/i.test(l));
  /* Ventiquattro figlie e non otto: Bennet spezza il catalogo in ventotto file
     e fermandosi a otto se ne leggevano ottomila prodotti su circa ventottomila.
     Sono ventiquattro richieste in piu' una volta al giorno, non per piano. */
  const figlie = (perNome.length ? perNome : locs).slice(0, 24);
  const fuori: string[] = [];
  for (const f of figlie) {
    try {
      const y = await scarica(f);
      for (const m of y.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
        const u = m[1].trim();
        if (slug.test(u)) fuori.push(u);
      }
    } catch {
      /* una figlia illeggibile non deve far cadere il resto */
    }
  }
  return fuori;
}

/** Da `&apos;` e compagnia al testo che ci si aspetta di leggere. */
function entita(s: string): string {
  return s
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Indirizzo prodotto -> nome, letto dalle sitemap delle immagini.
 *
 * I file sono grossi (dieci megabyte l'uno) e si leggono una volta al giorno.
 * Se ne aprono al massimo quattro: bastano a coprire il catalogo e il resto
 * sarebbe memoria consumata per niente su un servizio che ne ha poca.
 */
async function nomiDalleImmagini(sitemapIndice: string): Promise<Map<string, string>> {
  const nomi = new Map<string, string>();
  let xml: string;
  try {
    xml = await scarica(sitemapIndice);
  } catch {
    return nomi;
  }
  const figlie = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)]
    .map((m) => m[1].trim())
    .filter((u) => /-image\.xml|image.*\.xml$/i.test(u))
    .slice(0, 4);

  for (const f of figlie) {
    try {
      const y = await scarica(f);
      // Un blocco <url> per prodotto: il primo titolo utile e' il suo nome.
      for (const blocco of y.split(/<url>/i).slice(1)) {
        const loc = blocco.match(/<loc>([^<]+)<\/loc>/i)?.[1]?.trim();
        if (!loc || nomi.has(loc)) continue;
        const titolo = blocco.match(/<image:title>([\s\S]*?)<\/image:title>/i)?.[1];
        if (titolo) nomi.set(loc, entita(titolo).trim());
      }
    } catch {
      /* una figlia illeggibile non deve far cadere il resto */
    }
  }
  return nomi;
}

/**
 * Esportata per il conteggio: quante voci tiene DAVVERO questo indice.
 *
 * Serve perche' l'API ne ha due, e leggerne uno solo racconta meta' storia:
 * un'insegna a zero qui puo' essere piena nell'altro, e viceversa.
 */
export async function contaIndice(cat: Catalogo): Promise<number> {
  const i = await costruisci(cat);
  return i ? i.voci.length : 0;
}

async function costruisci(cat: Catalogo): Promise<Indice | null> {
  try {
    const urls = await indirizzi(cat.sitemap, cat.slug);
    const nomiImg = cat.nomiDaImmagini ? await nomiDalleImmagini(cat.sitemap) : null;
    const voci: Voce[] = [];
    const df = new Map<string, number>();

    for (const u of urls) {
      const m = u.match(cat.slug);
      if (!m) continue;
      // Il nome viene dall'indirizzo quando c'e'; dalla sitemap delle immagini
      // per le insegne che indirizzano i prodotti per categoria e numero.
      const slug = nomiImg ? (nomiImg.get(u) || "").toLowerCase() : (m[1] || "").replace(/-/g, " ");
      if (!slug) continue;
      // Si scarta qui, non al momento del confronto: cosi' il non-alimentare
      // non pesa nemmeno sulle frequenze delle parole.
      if (!alimentarePlausibile(slug)) continue;
      const p = parole(slug);
      if (!p.length) continue;
      const set = new Set(p);
      for (const w of set) df.set(w, (df.get(w) || 0) + 1);
      voci.push({ url: u, slug, codice: m[2] || "", parole: p, set });
    }

    if (!voci.length) {
      console.warn(`[catalogo] ${cat.nome}: sitemap letta ma nessun prodotto riconosciuto`);
      return null;
    }

    // Le parole raggruppate per prefisso: e' cio' che rende possibile
    // riconoscere `pass pom` come «passata di pomodoro» senza scorrere
    // quattordicimila nomi per ogni parola cercata.
    const perPrefisso = new Map<string, string[]>();
    for (const w of df.keys()) {
      const k = w.slice(0, PREFISSO_MIN);
      const lista = perPrefisso.get(k);
      if (lista) lista.push(w);
      else perPrefisso.set(k, [w]);
    }

    console.info(`[catalogo] ${cat.nome}: ${voci.length} prodotti indicizzati`);
    return { catalogo: cat, voci, df, perPrefisso, creatoIl: Date.now() };
  } catch (err) {
    // Un catalogo irraggiungibile non deve togliere gli altri: si prosegue.
    console.warn(`[catalogo] ${cat.nome} non indicizzato:`, (err as Error).message);
    return null;
  }
}

/** L'indice di un catalogo, costruito una volta e tenuto per un giorno. */
async function indice(cat: Catalogo): Promise<Indice | null> {
  const buono = indici.get(cat.id);
  if (buono && Date.now() - buono.creatoIl < TTL_MS) return buono;

  // Due richieste insieme non devono scaricare la stessa sitemap due volte.
  const giaInCorso = inCorso.get(cat.id);
  if (giaInCorso) return giaInCorso;

  const p = costruisci(cat).then((i) => {
    if (i) indici.set(cat.id, i);
    inCorso.delete(cat.id);
    return i;
  });
  inCorso.set(cat.id, p);
  return p;
}

/* ─────────────────────────── La corrispondenza ─────────────────────────── */

/**
 * Sotto questa confidenza non si dichiara niente.
 *
 * Tarata sulla lista vera del 15 settembre: a 0,55 passano quattordici voci
 * su diciotto e nessuna e' sbagliata. Abbassandola entrano «Mozzarella
 * vaccina» accoppiata a una mozzarella di formato diverso e «Pomodori a
 * grappolo» accoppiata ai pomodori plum: prezzi veri di prodotti sbagliati,
 * che e' l'errore di cui l'utente non si accorge.
 */
const SOGLIA = 0.55;

export interface RigaCatalogo {
  prodotto: string;
  nome: string;
  prezzo: number | null;
  valuta: string;
  negozio: string;
  link: string;
  /** Confidenza della corrispondenza, 0-1. Serve ai log, non all'utente. */
  confidenza: number;
  /**
   * Quando questa pagina e' stata guardata l'ultima volta, in ISO.
   * Stessa cosa di `PrezzoGrezzo.letto` sull'altra strada: un prezzo senza
   * data e' una diceria, e le due strade devono dire le stesse cose.
   */
  letto?: string;
  /** Il listino barrato, quando il prodotto e' in promozione. */
  prezzoListino?: number;
  /** Di quanto si risparmia, in percentuale. */
  scontoPercento?: number;
  /** Il negozio dell'insegna piu' vicino a chi chiede. Non e' la fonte del prezzo. */
  negozioPiuVicino?: string;
}

function cerca(idx: Indice, richiesta: string): { voce: Voce; score: number } | null {
  const q = parole(richiesta);
  if (!q.length) return null;

  const N = idx.voci.length;
  const idf = (w: string) => Math.log(N / (1 + (idx.df.get(w) || 0)));

  /* Ogni parola cercata diventa l'insieme delle parole dell'indice che possono
     essere la stessa: «passata» tira dentro anche «passat» e «pass», perche'
     una comincia con l'altra. Si calcola una volta sola per richiesta. */
  const espanse = q.map((w) => {
    const vicine = (idx.perPrefisso.get(w.slice(0, PREFISSO_MIN)) || []).filter(
      (t) => t.startsWith(w) || w.startsWith(t),
    );
    return { peso: idf(w), forme: new Set(vicine.length ? vicine : [w]) };
  });

  const testa = espanse[0];
  const pesoTot = espanse.reduce((s, e) => s + e.peso, 0) || 1;

  /* CI DEVONO ESSERE TUTTE.
     Prima qui si pretendeva la parola piu' rara della richiesta, pensando che
     fosse quella che identifica il prodotto. Non lo e': in «cuori di merluzzo
     surgelati» la parola piu' rara e' «cuori», perche' i cuori si contano sulle
     dita mentre di merluzzo il catalogo e' pieno. Il vincolo selezionava quindi
     proprio il termine sbagliato, e i «cuori di carciofo surgelati» passavano —
     costando meno, vincevano pure il confronto fra insegne.
     La regola che regge e' l'altra, ed e' piu' semplice da spiegare: il nome del
     prodotto deve contenere TUTTE le parole della voce cercata. Il carciofo non
     ha «merluzzo» e se ne va. Si perde qualche abbinamento parziale — «CUORI FIL
     MERLUZ BENN» non dice «surgelati» — ma un buco dichiarato costa molto meno
     di un prezzo giusto sul prodotto sbagliato, e il motore con ricerca i buchi
     li riempie. */

  // Le parole della voce cercata, per sapere se una «preparazione» era chiesta
  // davvero: chi scrive «biscotti» ha diritto ai biscotti.
  const chieste = new Set(q);

  let migliore: { voce: Voce; score: number } | null = null;

  for (const v of idx.voci) {
    /* LA TESTA DEVE ESSERCI, E DEVE STARE ALL'INIZIO.
       In italiano il sostantivo principale viene per primo: «passata di
       pomodoro», «zucchine verdi», «uova medie». Senza questo vincolo
       «Uova medie» agganciava le caramelle «Haribo uova al tegamino» e
       «Zucchine verdi» un «burger di lenticchie verdi e zucchine»: la parola
       c'era, ma come ingrediente in fondo al nome, non come prodotto. */
    let pos = -1;
    for (let i = 0; i < v.parole.length; i++) {
      if (testa.forme.has(v.parole[i])) {
        pos = i;
        break;
      }
    }
    if (pos < 0) continue;

    // Tutte le parole della voce devono comparire nel nome del prodotto.
    let tutte = true;
    for (const e of espanse) {
      let c1 = false;
      for (const f of e.forme) {
        if (v.set.has(f)) {
          c1 = true;
          break;
        }
      }
      if (!c1) {
        tutte = false;
        break;
      }
    }
    if (!tutte) continue;

    // Una preparazione vale solo se e' stata chiesta.
    if (PREPARAZIONI.test(v.slug) && !v.parole.some((w) => chieste.has(w) && PREPARAZIONI.test(w))) {
      continue;
    }

    let peso = 0;
    for (const e of espanse) {
      for (const f of e.forme) {
        if (v.set.has(f)) {
          peso += e.peso;
          break;
        }
      }
    }

    const penPosizione = pos <= 2 ? 0 : 0.18 + 0.06 * (pos - 2);
    const penLunghezza = 0.02 * Math.max(0, v.set.size - q.length);
    const score = peso / pesoTot - penLunghezza - penPosizione;

    if (!migliore || score > migliore.score) migliore = { voce: v, score };
  }

  return migliore && migliore.score >= SOGLIA ? migliore : null;
}

/* ──────────────────────────── Il prezzo ──────────────────────────── */

async function prezzoDi(url: string): Promise<{ prezzo: number | null; nome?: string }> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "it-IT,it;q=0.9" },
    });
    if (!res.ok) return { prezzo: null };
    // Non un taglio in testa: la finestra giusta, ovunque stiano i dati
    // strutturati. Su Coop cominciano oltre l'ottocentomillesimo carattere.
    const p = readPrices(porzioneConPrezzi(await res.text()));
    return { prezzo: p?.current ?? null };
  } catch {
    return { prezzo: null };
  }
}

/** Esegue `lavoro` su `voci` al massimo `n` per volta. */
async function aGruppi<T, R>(voci: T[], n: number, lavoro: (v: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < voci.length; i += n) {
    out.push(...(await Promise.all(voci.slice(i, i + n).map(lavoro))));
  }
  return out;
}

/* ──────────────────────────── L'ingresso ──────────────────────────── */

/* ─────────────────── La ricerca del negozio, invece dell'indice ─────────────────── */

/**
 * EBSN: la piattaforma che parecchie insegne italiane hanno in comune.
 *
 * COME SI E' TROVATA
 * ------------------
 * Tigros e CoopShop servono lo stesso identico pacchetto JavaScript
 * (`chunk-vendors`, `chunk-common`, `index`) e citano lo stesso endpoint
 * accessorio: stessa piattaforma sotto due marchi. Aprendo il pacchetto, tutte
 * le chiamate stanno sotto `/ebsn/api/`, e fra queste c'e' `/ebsn/api/products`
 * — la ricerca del catalogo. Risponde in JSON, senza chiave, a chiunque.
 *
 * PERCHE' VALE PIU' DI UN CATALOGO DA INDICIZZARE
 * -----------------------------------------------
 * Perche' a cercare il prodotto non siamo noi: e' il motore di ricerca del
 * negozio. Tutte le regole faticose di questo file — la parola piu' rara, il
 * sostantivo in testa, le preparazioni che contengono l'ingrediente — servono a
 * rifare male, da fuori, un lavoro che il negozio fa bene da dentro. Qui si
 * chiede «passata di pomodoro» e risponde lui, con il suo prodotto, il suo
 * prezzo e il suo indirizzo. Nessun indice da tenere, nessuna sitemap da
 * riscaricare, e il prezzo e' quello di adesso.
 *
 * QUELLE CHE RISPONDONO SENZA CHIEDERE IL NEGOZIO
 * -----------------------------------------------
 * EBSN gira su almeno otto insegne italiane — Tigros, CoopShop, Eurospin,
 * Iper, Iperal, Effepiu, Basko, Ali — ma cinque di loro il prezzo lo legano al
 * punto vendita scelto, e il punto vendita vive nella sessione: passarlo come
 * parametro non basta, provato. Restano queste tre, che il prezzo lo danno
 * subito. Le altre tornano utili il giorno che si tiene una sessione aperta
 * per negozio, ed e' un lavoro a se'.
 */
interface InsegnaEbsn {
  id: string;
  nome: string;
  base: string;
}

const EBSN: InsegnaEbsn[] = [
  { id: "eurospin", nome: "Eurospin", base: "https://online.eurospin.com" },
  { id: "effepiu", nome: "Effepiù", base: "https://www.myeffepiu.it" },
  /* ALTRE INSEGNE EBSN, TENUTE PER IL SOLO LINK. Vedi `EBSN_SOLO_LINK`. */
  /* ALI' E' STATO TOLTO, E IL MOTIVO E' MISURABILE.
     La sua EBSN risponde — una volta ha anche dato il prezzo — ma su tre
     tentativi consecutivi va in timeout a venti secondi tutte e tre le volte,
     mentre Eurospin ed Effepiu rispondono in due decimi. Un'insegna cosi' non
     aggiunge un prezzo: aggiunge un'attesa a ogni voce della lista, e su
     diciotto voci era lei da sola a portare il catalogo da sette secondi a
     quaranta. Si riapre il giorno che torna a rispondere. */
];

/**
 * Sei secondi, non dodici.
 *
 * Queste ricerche sono veloci per costruzione — le due insegne rimaste stanno
 * sotto il quarto di secondo — quindi un'attesa lunga non serve a recuperare
 * una risposta lenta: serve solo a far aspettare tutti quando un sito e' giu'.
 */
const EBSN_ATTESA_MS = 6_000;

/**
 * Le insegne EBSN che il prezzo lo legano al punto vendita.
 *
 * Il loro prezzo non si raggiunge: `store/select` risponde 500 e la selezione
 * dell'indirizzo 419, perche' la sessione la costruisce il loro programma nel
 * browser con un token che non si ricava da fuori. Replicare una sessione
 * d'acquisto per leggere un prezzo sarebbe fragile e sbagliato, e non si fa.
 *
 * Ma il NOME e il LINK li danno eccome, senza sessione e senza negozio: la
 * ricerca risponde con il prodotto e il suo indirizzo, che e' un indirizzo
 * vero e apribile. Su un prodotto per cui nessuna delle altre insegne ha un
 * prezzo, l'utente oggi non riceve niente — nessun numero e nessun posto dove
 * andare. Una riga senza prezzo ma con un negozio vero e un link che si apre e'
 * strettamente meglio del vuoto, e resta onesta perche' il prezzo non c'e' e
 * non viene inventato.
 *
 * Per questo entrano SOLO dove manca tutto il resto: vedi `cercaNelCatalogo`.
 */
const EBSN_SOLO_LINK: InsegnaEbsn[] = [
  { id: "coopshop", nome: "Coop (Nova Coop, Lombardia, Liguria)", base: "https://www.coopshop.it" },
  { id: "iper", nome: "Iper La Grande i", base: "https://iperdrive.iper.it" },
  { id: "tigros-ebsn", nome: "Tigros", base: "https://www.tigros.it" },
  { id: "basko", nome: "Basko", base: "https://www.basko.it" },
  { id: "iperal", nome: "Iperal", base: "https://www.iperalspesaonline.it" },
];

interface ProdottoEbsn {
  name?: string;
  slug?: string;
  itemUrl?: string;
  /** Il LISTINO, non quello che si paga. Vedi `prezzoVero`. */
  price?: number | null;
  /** Quello che si paga davvero: promozione compresa. */
  priceDisplay?: number | null;
  /** Il listino barrato, quando c'e' una promozione. */
  priceStandardDisplay?: number | null;
  /** La promozione del punto vendita, quando c'e'. */
  warehousePromo?: { discountPerc?: number } | null;
  /** Per quale negozio e' questo prezzo. */
  deliveryWarehouse?: { warehouseId?: number; name?: string } | null;
}

/**
 * Il prezzo che l'utente paga davvero, e il listino barrato.
 *
 * `price` e' il LISTINO, `priceDisplay` e' il prezzo in cassa. Quando c'e' una
 * promozione i due numeri differiscono, e per un pezzo abbiamo letto il primo:
 * le carote da un chilo risultavano 1,19 € mentre sul sito erano 0,99 € con
 * 1,19 barrato e uno sconto del 16,8% dichiarato in `warehousePromo`.
 *
 * Su un'app che serve a spendere meno leggere il listino invece della
 * promozione e' l'errore piu' costoso possibile: mostra il prezzo peggiore e
 * nasconde esattamente cio' per cui l'utente l'ha aperta.
 */
function prezzoVero(p: ProdottoEbsn): {
  prezzo: number | null;
  listino?: number;
  scontoPercento?: number;
} {
  const pagato = p.priceDisplay ?? p.price ?? null;
  const listino = p.priceStandardDisplay ?? p.price ?? null;
  const out: { prezzo: number | null; listino?: number; scontoPercento?: number } = { prezzo: pagato };
  if (pagato != null && listino != null && listino > pagato) {
    out.listino = listino;
    out.scontoPercento = Math.round(((listino - pagato) / listino) * 100);
  }
  return out;
}

/**
 * Il nome restituito contiene tutte le parole cercate?
 *
 * La ricerca del negozio e' generosa: per «uova» propone volentieri i biscotti
 * con le uova. Lo stesso vincolo che vale sull'indice vale qui — se una parola
 * della voce non c'e', non e' quel prodotto.
 */
function combacia(nome: string, q: string[]): boolean {
  const parole_ = new Set(parole(nome));
  return q.every((w) =>
    [...parole_].some((t) => t.startsWith(w) || w.startsWith(t)),
  );
}

/* ───────────────────────────── I volantini ───────────────────────────── */

/**
 * I prezzi del volantino, che sono pubblici anche quando il catalogo non lo e'.
 *
 * Cinque insegne EBSN — CoopShop, Iper, Iperal, Tigros, Basko — il prezzo lo
 * legano al punto vendita, e il punto vendita vive in una sessione che non si
 * apre da fuori: `store/select` risponde 500, la selezione dell'indirizzo 419.
 * Replicare una sessione di acquisto per leggere un prezzo e' fragile e fuori
 * portata.
 *
 * Ma il volantino no: e' pubblico per definizione, perche' esiste per essere
 * letto da chiunque. `/ebsn/api/leaflet/search` da' i volantini in corso e
 * `/ebsn/api/leaflet/product-search?parent_leaflet_id=N` i prodotti che ci
 * stanno dentro, con il prezzo e l'indirizzo del prodotto.
 *
 * E' una fetta stretta del catalogo — le promozioni della settimana, non tutto
 * — ma per un'app che serve a spendere meno e' la fetta giusta: sono
 * esattamente i prodotti su cui si risparmia.
 *
 * QUANTO RENDE OGGI: NIENTE, ED E' UN RISULTATO ONESTO.
 * Dei sette siti EBSN provati solo Tigros pubblica i prodotti dentro i
 * volantini — 254 con prezzo, su cinque volantini; gli altri il volantino lo
 * mettono in PDF. E di quei 254, leggendoli uno per uno, la parte alimentare
 * vera e' minima: «REVELATIONS POLLO», «MOUSSE PESCE OCEANICO» e «BOCCONCINI
 * GELEE SALMONE» sono cibo per gatti, «EXCELLENCE 4 IN 1» e «GEL POWER» sono
 * detersivi. Su una lista della spesa vera questa fonte restituisce zero
 * righe, e lo zero e' la risposta giusta: agganciare «cosce di pollo» a un
 * bocconcino per gatti sarebbe il solito prezzo vero sul prodotto sbagliato.
 *
 * La funzione resta perche' costa una richiesta al giorno per insegna e si
 * accende da sola il giorno che una di loro pubblica il volantino alimentare —
 * che e' poi il caso che a quest'app interessa di piu'.
 */
interface VoceVolantino {
  nome: string;
  link: string;
  prezzo: number;
  parole: string[];
  set: Set<string>;
}

const volantini = new Map<string, { voci: VoceVolantino[]; creatoIl: number }>();

async function indiceVolantini(ins: InsegnaEbsn): Promise<VoceVolantino[]> {
  const buono = volantini.get(ins.id);
  if (buono && Date.now() - buono.creatoIl < TTL_MS) return buono.voci;

  const voci: VoceVolantino[] = [];
  try {
    const elenco = await fetch(`${ins.base}/ebsn/api/leaflet/search`, {
      signal: AbortSignal.timeout(EBSN_ATTESA_MS),
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!elenco.ok) throw new Error(`HTTP ${elenco.status}`);
    const le = JSON.parse((await elenco.text()).replace(/^\s+/, "")) as {
      data?: { leaflets?: Array<{ leafletId: number }> };
    };

    for (const v of (le.data?.leaflets ?? []).slice(0, 6)) {
      const res = await fetch(
        `${ins.base}/ebsn/api/leaflet/product-search?parent_leaflet_id=${v.leafletId}&page_size=200`,
        { signal: AbortSignal.timeout(EBSN_ATTESA_MS), headers: { "User-Agent": UA, Accept: "application/json" } },
      );
      if (!res.ok) continue;
      const j = JSON.parse((await res.text()).replace(/^\s+/, "")) as {
        data?: { products?: ProdottoEbsn[] };
      };
      for (const p of j.data?.products ?? []) {
        const { prezzo, listino, scontoPercento } = prezzoVero(p);
        const nome = (p.name || "").trim();
        if (prezzo == null || !nome || !p.itemUrl) continue;
        if (!alimentarePlausibile(nome)) continue;
        const par = parole(nome);
        if (!par.length) continue;
        voci.push({
          nome: nome.toLowerCase(),
          link: p.itemUrl.startsWith("http") ? p.itemUrl : ins.base + p.itemUrl,
          prezzo,
          parole: par,
          set: new Set(par),
        });
      }
    }
  } catch {
    /* un volantino irraggiungibile non deve togliere il resto */
  }

  if (voci.length) console.info(`[volantini] ${ins.nome}: ${voci.length} prodotti in promozione`);
  volantini.set(ins.id, { voci, creatoIl: Date.now() });
  return voci;
}

/** Le insegne di cui vale la pena leggere il volantino. */
const VOLANTINI: InsegnaEbsn[] = [
  { id: "tigros-vol", nome: "Tigros", base: "https://www.tigros.it" },
];

async function cercaNeiVolantini(items: string[], valuta: string): Promise<RigaCatalogo[]> {
  const fuori: RigaCatalogo[] = [];
  for (const ins of VOLANTINI) {
    const voci = await indiceVolantini(ins);
    if (!voci.length) continue;
    for (const item of items) {
      const q = parole(item);
      if (!q.length) continue;
      const v = voci.find(
        (x) =>
          q.every((w) => [...x.set].some((t) => t.startsWith(w) || w.startsWith(t))) &&
          (!PREPARAZIONI.test(x.nome) || q.some((w) => PREPARAZIONI.test(w))),
      );
      if (!v) continue;
      fuori.push({
        prodotto: item,
        nome: v.nome,
        prezzo: v.prezzo,
        valuta,
        negozio: ins.nome,
        link: v.link,
        confidenza: 1,
        letto: new Date().toISOString(),
      });
    }
  }
  return fuori;
}

/* ────────────────────── I punti vendita, per nome ────────────────────── */

interface PuntoVendita {
  id: number;
  nome: string;
  citta: string;
  provincia: string;
  cap: string;
}

const negozi = new Map<string, { punti: PuntoVendita[]; creatoIl: number }>();

/**
 * I punti vendita di un'insegna EBSN.
 *
 * `warehouse-locator/search` li restituisce tutti, senza sessione e senza
 * chiave: Eurospin ne ha 1.257, con nome, citta', provincia, CAP e coordinate.
 *
 * Serve a dire all'utente DOVE, non solo quanto: «Eurospin — San Martino Buon
 * Albergo (VR)» e' un'informazione diversa da «Eurospin», soprattutto per le
 * promozioni, che il sito calcola sul negozio che ti serve.
 */
async function puntiVendita(ins: InsegnaEbsn): Promise<PuntoVendita[]> {
  const buono = negozi.get(ins.id);
  if (buono && Date.now() - buono.creatoIl < TTL_MS) return buono.punti;
  const punti: PuntoVendita[] = [];
  try {
    const r = await fetch(`${ins.base}/ebsn/api/warehouse-locator/search`, {
      // Venti secondi: e' un elenco grosso (Eurospin ne ha 1.257) ma si
      // scarica una volta al giorno, non a ogni lista della spesa.
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": UA, Accept: "application/json", "X-Ebsn-Client": "site" },
    });
    if (r.ok) {
      const j = JSON.parse((await r.text()).replace(/^\s+/, "")) as {
        data?: { warehouses?: Array<{ warehouseId: number; name: string; address?: { city?: string; province?: string; postalcode?: string } }> };
      };
      for (const w of j.data?.warehouses ?? []) {
        punti.push({
          id: w.warehouseId,
          nome: String(w.name || "").replace(/^\d+\s*-\s*/, "").trim(),
          citta: w.address?.city || "",
          provincia: w.address?.province || "",
          cap: w.address?.postalcode || "",
        });
      }
    }
  } catch {
    /* un locator che non risponde non toglie i prezzi */
  }
  if (punti.length) console.info(`[negozi] ${ins.nome}: ${punti.length} punti vendita`);
  negozi.set(ins.id, { punti, creatoIl: Date.now() });
  return punti;
}

/** Il punto vendita piu' vicino alla citta' dichiarata dall'utente. */
function negozioPerCitta(punti: PuntoVendita[], citta: string): PuntoVendita | null {
  if (!citta) return null;
  const c = citta.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (!c) return null;
  const esatto = punti.find((p) => p.citta.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === c);
  if (esatto) return esatto;
  return punti.find((p) => p.citta.toLowerCase().includes(c) || c.includes(p.citta.toLowerCase())) ?? null;
}

async function cercaSuEbsn(
  items: string[],
  valuta: string,
  citta = "",
  insegne: InsegnaEbsn[] = EBSN,
  vuoleIlPrezzo = true,
): Promise<RigaCatalogo[]> {
  // Il negozio che serve la citta' dell'utente, una volta per insegna.
  const negozioDi = new Map<string, PuntoVendita | null>();
  if (citta) {
    await Promise.all(
      insegne.map(async (ins) => {
        negozioDi.set(ins.id, negozioPerCitta(await puntiVendita(ins), citta));
      }),
    );
  }
  const coppie: Array<{ item: string; ins: InsegnaEbsn }> = [];
  for (const item of items) for (const ins of insegne) coppie.push({ item, ins });

  const righe = await aGruppi(coppie, 16, async ({ item, ins }): Promise<RigaCatalogo | null> => {
    const q = parole(item);
    if (!q.length) return null;
    try {
      const url = `${ins.base}/ebsn/api/products?q=${encodeURIComponent(q.join(" "))}&page_size=6`;
      const res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(EBSN_ATTESA_MS),
        headers: { "User-Agent": UA, Accept: "application/json", "Accept-Language": "it-IT,it;q=0.9" },
      });
      if (!res.ok) return null;
      const j = (await res.json()) as { data?: { products?: ProdottoEbsn[] } };
      const prodotti = j?.data?.products ?? [];

      /* SI PRENDE IL PIU' CONVENIENTE, NON IL PRIMO.
         La ricerca del negozio ordina per pertinenza, e il primo risultato non
         e' quasi mai quello in offerta: cercando «passata di pomodoro» tornava
         la prima passata qualsiasi mentre due righe sotto c'era la stessa cosa
         a meta' prezzo. Su un'app che serve a spendere meno, fermarsi al primo
         significa nascondere proprio le promozioni — misurate, e sono tante:
         61 prodotti in saldo su 616 guardati fra Eurospin ed Effepiu, con
         sconti fino al 59%. */
      let migliore: RigaCatalogo | null = null;
      for (const p of prodotti) {
        const { prezzo, listino, scontoPercento } = prezzoVero(p);
        const nome = (p.name || "").trim();
        if (!nome || !p.itemUrl) continue;
        if (vuoleIlPrezzo && prezzo == null) continue;
        if (!alimentarePlausibile(nome)) continue;
        if (PREPARAZIONI.test(nome) && !q.some((w) => PREPARAZIONI.test(w))) continue;
        if (!combacia(nome, q)) continue;

        const riga: RigaCatalogo = {
          prodotto: item,
          nome: nome.toLowerCase(),
          prezzo,
          valuta,
          negozio: ins.nome,
          link: p.itemUrl.startsWith("http") ? p.itemUrl : ins.base + p.itemUrl,
          confidenza: 1,
          letto: new Date().toISOString(),
          ...(listino != null ? { prezzoListino: listino } : {}),
          ...(scontoPercento != null ? { scontoPercento } : {}),
          ...(negozioDi.get(ins.id)
            ? { negozioPiuVicino: `${negozioDi.get(ins.id)!.nome} (${negozioDi.get(ins.id)!.provincia})` }
            : {}),
        };
        // Senza prezzo si tiene il primo che combacia: non c'e' niente da
        // confrontare, e vale solo come posto dove andare.
        if (riga.prezzo == null) { migliore ??= riga; continue; }
        if (migliore?.prezzo == null || riga.prezzo < migliore.prezzo) migliore = riga;
      }
      return migliore;
    } catch {
      // Un'insegna che non risponde non deve togliere le altre.
      return null;
    }
  });

  return righe.filter((r): r is RigaCatalogo => r !== null);
}

/** I cataloghi disponibili per un paese. Fuori dall'Italia, nessuno: per ora. */
export function cataloghiPerPaese(iso: string): Catalogo[] {
  return CATALOGHI.filter((c) => c.paese === iso.toUpperCase());
}

/**
 * Per ogni voce della lista, il prodotto corrispondente in ogni catalogo.
 *
 * Restituisce righe nella stessa forma che il resto del motore gia' usa, cosi'
 * passano dallo stesso controllo dei link e dallo stesso confronto fra insegne:
 * niente qui scavalca la verifica, e il totale continua a sommare solo cio'
 * che e' stato aperto.
 */
export async function prezziDaiCataloghiIT(
  items: string[],
  paeseIso: string,
  valuta = "EUR",
  citta = "",
): Promise<RigaCatalogo[]> {
  const cataloghi = cataloghiPerPaese(paeseIso);
  const conEbsn = paeseIso.toUpperCase() === "IT";
  if (!cataloghi.length && !conEbsn) return [];

  const t0 = Date.now();

  /* Le due strade partono insieme: l'indice da sitemap e la ricerca delle
     insegne EBSN non si aspettano a vicenda. */
  const daEbsn = conEbsn ? cercaSuEbsn(items, valuta, citta) : Promise.resolve([] as RigaCatalogo[]);
  const daVolantini = conEbsn ? cercaNeiVolantini(items, valuta) : Promise.resolve([] as RigaCatalogo[]);
  const indiciPronti = (await Promise.all(cataloghi.map(indice))).filter(
    (i): i is Indice => i !== null,
  );
  if (!indiciPronti.length) return [];

  // Prima tutte le corrispondenze, senza toccare la rete.
  const candidati: Array<{ item: string; idx: Indice; voce: Voce; score: number }> = [];
  for (const item of items) {
    for (const idx of indiciPronti) {
      const m = cerca(idx, item);
      if (m) candidati.push({ item, idx, voce: m.voce, score: m.score });
    }
  }

  /* IL PREZZO NON SI LEGGE QUI, E PRIMA SI SBAGLIAVA.
     Questo modulo apriva ogni pagina candidata per leggerne il prezzo, e subito
     dopo il controllo dei link riapriva le stesse pagine per verificarle —
     leggendo il prezzo un'altra volta, perche' `verifyPrices` lo fa gia' e
     quello della pagina vince comunque su quello di partenza. Erano due
     scaricamenti per riga, su pagine che a volte pesano quasi due megabyte:
     ottantatre righe diventavano centosessantasei richieste, e sessanta
     secondi. Lasciando il prezzo a `null` il lavoro si dimezza e il risultato
     e' identico, perche' a riempirlo e' lo stesso codice di prima. */
  const tenute: RigaCatalogo[] = candidati.map((c) => ({
    prodotto: c.item,
    nome: c.voce.slug.replace(/\s+/g, " ").trim(),
    prezzo: null,
    valuta,
    negozio: c.idx.catalogo.nome,
    link: c.voce.url,
    confidenza: Number(c.score.toFixed(2)),
    letto: new Date().toISOString(),
  }));

  const [ebsn, promo] = await Promise.all([daEbsn, daVolantini]);

  /* I volantini vincono sulle altre righe della stessa insegna: e' lo stesso
     negozio, ma quel prezzo e' la promozione in corso — ed e' il numero che
     l'utente paga davvero questa settimana. */
  const insegnePromo = new Set(promo.map((r) => `${r.negozio}|${r.prodotto}`));
  const tutte: RigaCatalogo[] = [
    ...promo,
    ...[...tenute, ...ebsn].filter((r) => !insegnePromo.has(`${r.negozio}|${r.prodotto}`)),
  ];

  /* IL RIPIEGO: UN POSTO DOVE ANDARE, PER CIO' CHE NESSUNO PREZZA.
     Solo per le voci rimaste senza un solo prezzo da nessuna insegna. Costa
     cinque ricerche per voce scoperta, e si paga solo quando serve davvero. */
  const senzaPrezzo = items.filter(
    (i) => !tutte.some((r) => r.prodotto === i && r.prezzo != null),
  );
  if (senzaPrezzo.length) {
    const ripiego = await cercaSuEbsn(senzaPrezzo, valuta, citta, EBSN_SOLO_LINK, false);
    if (ripiego.length) {
      console.info(
        `[catalogo] ${ripiego.length} link di ripiego per ${senzaPrezzo.length} voci senza prezzo`,
      );
      tutte.push(...ripiego);
    }
  }

  const conPrezzo = tutte.filter((r) => r.prezzo != null).length;
  const insegne = new Set(tutte.map((r) => r.negozio)).size;
  console.info(
    `[catalogo] ${paeseIso}: ${tutte.length} righe da ${insegne} insegne ` +
      `(${conPrezzo} con prezzo; ${ebsn.length} dalla ricerca EBSN, ${promo.length} dai volantini) ` +
      `su ${items.length} voci, ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );

  return tutte;
}
