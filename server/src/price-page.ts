/**
 * Apre la pagina del prodotto che l'AI ha indicato, e la giudica.
 *
 * PERCHÉ NON CI SI FIDA DEL MODELLO
 * ---------------------------------
 * Perché è stato misurato che a volte inventa. Nella prova del confronto fra
 * catene, Gemini ha scelto Esselunga — che ha il catalogo dietro login — e ha
 * *ricostruito* dodici indirizzi seguendo lo schema del sito: dodici 404 su
 * dodici. I prezzi erano probabilmente giusti, ma non c'era modo di provarlo.
 *
 * Un prezzo che non si può verificare non vale niente in un'app che promette
 * risparmio. Quindi ogni riga passa di qui: si apre la pagina, e solo ciò che
 * risponde davvero arriva all'utente con il suo link.
 *
 * E GIÀ CHE LA PAGINA È APERTA, SI LEGGE L'OFFERTA
 * ------------------------------------------------
 * L'AI riporta il prezzo visto durante la ricerca, che può essere il
 * **listino** mentre sullo scaffale c'è una **promozione**.
 *
 * Caso reale: la passata Carrefour. Gemini ha detto 0,95 €, la pagina mostrava
 * 0,79 € con 0,95 barrato — sconto del 17% fino al 13 settembre. Nessuno dei
 * due sbagliava: erano due prezzi diversi, entrambi veri. Leggendo la pagina
 * si ottengono entrambi, e l'app può dire «0,79 € — in offerta, risparmi
 * 0,16 € fino al 13 settembre». Per un'app che aiuta a spendere meno,
 * intercettare le promozioni **è il punto**.
 *
 * COSTO: zero. È una richiesta HTTP su una pagina che l'AI ha già trovato,
 * nessuna chiamata a servizi a pagamento.
 *
 * I dati vengono dai formati strutturati che i siti della GDO espongono per i
 * motori di ricerca (JSON-LD, microdati). È lettura di dati pubblici e
 * dichiarati, non scraping dell'impaginazione — quindi non si rompe al primo
 * restyling del sito.
 */

export interface PagePrice {
  /** Prezzo attualmente esposto: scontato, se c'è una promozione. */
  current: number;
  /** Prezzo pieno, quando il prodotto è in offerta. */
  list?: number;
  /** Quanto si risparmia rispetto al listino. */
  saving?: number;
  /** Percentuale di sconto, arrotondata. */
  discountPercent?: number;
  /** Fino a quando è valido, se dichiarato (ISO). */
  validUntil?: string;
  currency?: string;
}

/**
 * Esito del controllo.
 *
 *   "verificato"     la pagina si apre e dichiara un prezzo: massima fiducia
 *   "pagina-ok"      la pagina si apre ma il prezzo non è leggibile dal codice
 *                    (spesso è caricato via JavaScript): il link è buono, il
 *                    prezzo resta quello dell'AI
 *   "bloccato"       il sito rifiuta le richieste automatiche (403, 429).
 *                    La pagina ESISTE — dal telefono dell'utente si apre — ma
 *                    noi non possiamo leggerla: link buono, prezzo non
 *                    confermato
 *   "non-raggiungibile" 404, 410, timeout: la pagina non c'è. Link da buttare
 *
 * La distinzione fra "bloccato" e "non-raggiungibile" non è pignoleria.
 * Misurato a Zurigo: Coop ha risposto 403 a nove prodotti su nove. Trattandoli
 * come indirizzi inventati si buttavano nove link perfettamente validi, che
 * nel browser di una persona si aprono senza problemi. Un 404 dice «questa
 * pagina non esiste», un 403 dice «ho capito che sei un programma»: solo il
 * primo è un errore del modello.
 */
export type VerifyStatus = "verificato" | "pagina-ok" | "bloccato" | "non-raggiungibile";

export interface VerifiedPrice {
  status: VerifyStatus;
  page?: PagePrice;
  /** Perché è stato scartato, quando lo è stato. */
  reason?: string;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

/** Numeri plausibili per un prodotto da spesa: fuori da qui è un errore di lettura. */
function sane(n: number): boolean {
  return Number.isFinite(n) && n > 0.05 && n < 500;
}

function firstNumber(html: string, patterns: RegExp[]): number | null {
  for (const re of patterns) {
    const m = html.match(re);
    if (!m) continue;
    const n = Number.parseFloat(String(m[1]).replace(",", "."));
    if (sane(n)) return n;
  }
  return null;
}

/** Legge prezzo, listino e scadenza dell'offerta dai dati strutturati. */
function readPrices(html: string): PagePrice | null {
  const current = firstNumber(html, [
    /"price"\s*:\s*"?([\d.,]+)"?/i,
    /"lowPrice"\s*:\s*"?([\d.,]+)"?/i,
    /itemprop=["']price["'][^>]*content=["']([\d.,]+)["']/i,
    /"salePrice"\s*:\s*"?([\d.,]+)"?/i,
  ]);
  if (current === null) return null;

  // Lo sconto può essere espresso come importo risparmiato oppure come prezzo
  // pieno: si prova prima l'importo, che è quello che Carrefour usa.
  const discountAmount = firstNumber(html, [/"discount"\s*:\s*"?([\d.,]+)"?/i]);
  const listed = firstNumber(html, [
    /"listPrice"\s*:\s*"?([\d.,]+)"?/i,
    /"regularPrice"\s*:\s*"?([\d.,]+)"?/i,
    /"originalPrice"\s*:\s*"?([\d.,]+)"?/i,
    /"strikePrice"\s*:\s*"?([\d.,]+)"?/i,
  ]);

  let list: number | undefined;
  if (listed !== null && listed > current) list = listed;
  else if (discountAmount !== null && discountAmount > 0) {
    const computed = Math.round((current + discountAmount) * 100) / 100;
    if (sane(computed) && computed > current) list = computed;
  }

  const out: PagePrice = {
    current,
    validUntil: html.match(/"priceValidUntil"\s*:\s*"([\d-]{8,10})"/i)?.[1] ?? undefined,
    currency: html.match(/"priceCurrency"\s*:\s*"([A-Z]{3})"/)?.[1] ?? undefined,
  };
  if (list) {
    out.list = list;
    out.saving = Math.round((list - current) * 100) / 100;
    out.discountPercent = Math.round(((list - current) / list) * 100);
  }
  return out;
}

/**
 * Apre la pagina e dice se il link regge.
 *
 * Non basta lo stato HTTP: parecchi siti rispondono 200 a una pagina di
 * errore. Per questo si guarda anche il testo.
 */
export async function verifyProductPage(url: string): Promise<VerifiedPrice> {
  if (!url || !/^https?:\/\//.test(url)) {
    return { status: "non-raggiungibile", reason: "nessun link" };
  }

  // I link di Google Shopping non sono pagine di prodotto: sono ricerche su
  // Google. Aprirli da qui porta alla schermata del consenso cookie — HTTP
  // 400 da un indirizzo senza cookie — e li faceva scartare tutti. Sul
  // telefono di una persona invece si aprono senza problemi.
  //
  // Non si possono verificare (non c'e' un prezzo da leggere in una pagina di
  // ricerca), ma il link e' buono: si conserva, dichiarando che il prezzo non
  // e' confermato. Vale la pena saperlo: questi link portano su Google
  // Shopping, non nel negozio.
  if (/^https?:\/\/(www\.)?google\.[a-z.]+\/search/i.test(url)) {
    return { status: "bloccato", reason: "pagina di Google Shopping, non del negozio" };
  }

  let html: string;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      // Otto secondi e non dodici: una pagina di supermercato che non
      // risponde entro otto non risponderà, e intanto tiene fermo un posto
      // nella coda dei controlli.
      signal: AbortSignal.timeout(8_000),
      headers: { "User-Agent": UA, Accept: "text/html" },
    });
    if (!res.ok) {
      // 403 e 429 sono difese anti-bot, non pagine mancanti: l'indirizzo è
      // buono e va consegnato all'utente, che lo aprirà da un browser vero.
      // 401 no: lì serve un account, e mandarci qualcuno è inutile.
      if (res.status === 403 || res.status === 429) {
        return { status: "bloccato", reason: `HTTP ${res.status}` };
      }
      return { status: "non-raggiungibile", reason: `HTTP ${res.status}` };
    }
    // Le pagine prodotto sono grandi: i dati strutturati stanno in alto,
    // quindi non serve tenerne più di così in memoria.
    html = (await res.text()).slice(0, 200_000);
  } catch {
    return { status: "non-raggiungibile", reason: "irraggiungibile" };
  }


  // Il 404 mascherato da 200: pagina servita correttamente, contenuto assente.
  if (
    /(pagina non trovata|prodotto non (?:trovato|disponibile)|404 not found|page not found|seite nicht gefunden|página no encontrada|page introuvable)/i.test(
      html.slice(0, 40_000),
    )
  ) {
    return { status: "non-raggiungibile", reason: "404 mascherato da 200" };
  }

  const page = readPrices(html);
  return page ? { status: "verificato", page } : { status: "pagina-ok" };
}

/** Una riga di prezzo dopo il controllo, pronta per il client. */
export interface CheckedRow {
  /** Ricerca di ripiego, quando la pagina del prodotto non si è aperta. */
  linkRicerca?: string;
  ricercaSu?: string;
  /** Voce della lista della spesa: uguale fra le insegne, serve a confrontarle. */
  prodotto?: string;
  nome: string;
  /** Miniatura del prodotto, quando la fonte la fornisce. */
  immagine?: string;
  prezzo: number | null;
  valuta: string;
  negozio: string;
  /** Vuoto quando la pagina non si apre: non si mostra un link rotto. */
  link: string;
  verifica: VerifyStatus;
  /** Prezzo pieno, presente solo se il prodotto è in offerta. */
  prezzoListino?: number;
  risparmio?: number;
  scontoPercento?: number;
  offertaFinoAl?: string;
}

/**
 * Controlla tutte le righe di prezzo di un piano.
 *
 * In parallelo ma a gruppi: troppe richieste simultanee allo stesso sito si
 * prendono un blocco, e comunque non è educato. Il gruppo procede al passo
 * del più lento, quindi il tempo massimo per pagina conta quanto la
 * concorrenza.
 *
 * Le righe non raggiungibili perdono il link, che non porta da nessuna parte,
 * ma tengono il prezzo: viene da una ricerca vera, e un indirizzo sbagliato
 * non dimostra che il numero lo sia. Resta dichiarato non verificato e non
 * entra nel totale — così è un'indicazione, non un impegno.
 *
 * Quelle solo bloccate invece si tengono per intero. Il sito ha rifiutato NOI,
 * non l'utente: dal suo telefono quel link si apre. Il prezzo resta quello del
 * modello, dichiarato come non confermato.
 */
export async function verifyPrices(
  rows: Array<{
    prodotto?: string;
    nome: string;
    prezzo: number | null;
    valuta: string;
    negozio: string;
    link: string;
    immagine?: string;
  }>,
  batchSize = 10,
): Promise<{ rows: CheckedRow[]; verificati: number; totali: number }> {
  const out: CheckedRow[] = [];

  for (let i = 0; i < rows.length; i += batchSize) {
    const checked = await Promise.all(
      rows.slice(i, i + batchSize).map(async (row): Promise<CheckedRow> => {
        const v = await verifyProductPage(row.link);

        if (v.status === "non-raggiungibile") {
          // Il LINK non vale niente e sparisce. Il prezzo invece si tiene: il
          // modello l'ha letto durante una ricerca vera, e un indirizzo
          // sbagliato non dimostra che anche il numero lo sia. Resta marcato
          // come non verificato e — questo conta — NON entra mai nel totale.
          console.info(`[verifica] link scartato per "${row.nome}": ${v.reason}`);
          return { ...row, link: "", verifica: v.status };
        }

        if (v.status === "bloccato") {
          // Link e prezzo restano: la pagina esiste, semplicemente non parla
          // con noi. Sara' l'app a dire che il prezzo non e' confermato.
          console.info(`[verifica] non leggibile "${row.nome}": ${v.reason} — tengo il link`);
          return { ...row, verifica: v.status };
        }

        // Il prezzo della pagina vince su quello dell'AI: è quello che
        // l'utente paga oggi, promozione compresa.
        const p = v.page;
        return {
          ...row,
          prezzo: p?.current ?? row.prezzo,
          verifica: v.status,
          prezzoListino: p?.list,
          risparmio: p?.saving,
          scontoPercento: p?.discountPercent,
          offertaFinoAl: p?.validUntil,
        };
      }),
    );
    out.push(...checked);
  }

  return {
    rows: out,
    // Quante righe hanno una pagina che ESISTE — vedi `paginaEsiste`, che
    // spiega perche' un 403 conta. Il nome e' rimasto "verificati" perche' lo
    // legge l'app, ma la cosa che misura e' "l'utente ha dove comprare": la
    // conferma del prezzo la porta solo lo stato `verificato`, ed e' contata a
    // parte.
    verificati: out.filter((r) => paginaEsiste(r.verifica)).length,
    totali: out.length,
  };
}

/* ─────────────────── Il confronto fra insegne, verificato ─────────────────── */

export interface StoreTotal {
  negozio: string;
  /** Somma dei soli prezzi la cui pagina si è aperta davvero. */
  totale: number;
  /** Quanti prodotti hanno retto la verifica. */
  verificati: number;
  /** Quanti ne aveva proposti il modello per questa insegna. */
  proposti: number;
  /** Vero quando l'insegna ha abbastanza prezzi controllabili da poter vincere. */
  utilizzabile: boolean;
}

export interface StoreComparison {
  catene: StoreTotal[];
  /** L'insegna più economica FRA QUELLE VERIFICABILI. Null se nessuna regge. */
  vincitore: StoreTotal | null;
  /** Differenza col totale più alto fra le insegne utilizzabili. */
  risparmio: number | null;
  /** Le righe della sola insegna vincente, quelle che l'utente vedrà. */
  righe: CheckedRow[];
}

/**
 * Sceglie il supermercato più conveniente fra quelli che si possono controllare.
 *
 * L'idea è dell'utente ed è quella giusta: invece di far scegliere il vincitore
 * al modello — che sceglie il più economico anche quando i suoi link non si
 * aprono — si prendono i prezzi di TUTTE le insegne, si aprono tutte le pagine,
 * e si scende la scala finché non si trova un'insegna davvero verificabile.
 *
 * Il risparmio così non è più una dichiarazione del modello: è una sottrazione
 * fra due somme di prezzi che qualcuno ha aperto.
 *
 * Un'insegna partecipa alla gara solo se almeno `minVerified` dei suoi prodotti
 * regge la verifica: un totale calcolato su tre prezzi su dodici sembrerebbe
 * bassissimo e vincerebbe per il motivo sbagliato.
 */
/**
 * La pagina di questa riga esiste?
 *
 * TRE STATI SU QUATTRO DICONO DI SI', e per un pezzo ne contavamo due.
 *
 *   verificato   la pagina si apre e ci dichiara il prezzo
 *   pagina-ok    la pagina si apre, il prezzo non e' leggibile dal codice
 *   bloccato     403: la pagina C'E', il sito non parla con i programmi
 *
 * Escludere `bloccato` sembrava prudenza ed era un errore di misura. Sull'asse
 * del PREZZO non c'e' nessuna differenza fra `bloccato` e `pagina-ok`: in
 * entrambi i casi il numero e' quello che il modello ha letto cercando, non
 * uno che abbiamo riletto noi. L'unica differenza e' se il nostro server e'
 * riuscito ad aprire la pagina — che riguarda noi, non chi compra.
 *
 * QUANTO COSTAVA. Ad Atene i siti greci rispondono 403 quasi sempre, e la
 * spesa settimanale per tre persone veniva mostrata a 12,30 EUR invece di
 * 63,81. A Zurigo, dove Coop aveva risposto 403 a nove prodotti su nove, il
 * totale era 0,00 CHF. Numeri sbagliati di cinque volte, o vuoti, con l'aria
 * di essere esatti — che e' peggio di un numero dichiarato incerto.
 */
function paginaEsiste(stato: VerifyStatus): boolean {
  return stato === "verificato" || stato === "pagina-ok" || stato === "bloccato";
}

export function pickBestStore(rows: CheckedRow[], minVerified = 5): StoreComparison {
  const byStore = new Map<string, CheckedRow[]>();
  for (const r of rows) {
    const key = (r.negozio || "sconosciuto").trim();
    const list = byStore.get(key);
    if (list) list.push(r);
    else byStore.set(key, [r]);
  }

  const catene: StoreTotal[] = [...byStore.entries()]
    .map(([negozio, list]) => {
      // Solo i prezzi letti davvero: un totale costruito su numeri non
      // confermati non puo' vincere un confronto di convenienza.
      const good = list.filter(
        (r) => paginaEsiste(r.verifica) && r.prezzo != null,
      );
      return {
        negozio,
        totale: Math.round(good.reduce((s, r) => s + (r.prezzo ?? 0), 0) * 100) / 100,
        verificati: good.length,
        proposti: list.length,
        // Serve una base ampia, e almeno metà dei prodotti proposti.
        utilizzabile: good.length >= Math.min(minVerified, list.length) && good.length * 2 >= list.length,
      };
    })
    .sort((a, b) => a.totale - b.totale);

  const eleggibili = catene.filter((c) => c.utilizzabile && c.totale > 0);

  // Nessuna insegna regge: si restituisce comunque tutto ciò che si è salvato,
  // meglio pochi prezzi veri che nessun prezzo.
  if (!eleggibili.length) {
    return {
      catene,
      vincitore: null,
      risparmio: null,
      righe: rows.filter((r) => r.verifica !== "non-raggiungibile"),

    };
  }

  const vincitore = eleggibili[0];
  const piuCara = eleggibili[eleggibili.length - 1];

  return {
    catene,
    vincitore,
    // Con una sola insegna verificabile non c'è confronto, e dirlo è corretto.
    risparmio:
      eleggibili.length > 1 ? Math.round((piuCara.totale - vincitore.totale) * 100) / 100 : null,
    righe: rows.filter(
      (r) =>
        (r.negozio || "sconosciuto").trim() === vincitore.negozio &&
        r.verifica !== "non-raggiungibile",
    ),

  };
}

/* ─────────────── Le offerte, raggruppate per prodotto ─────────────── */

export interface Offer {
  negozio: string;
  /**
   * Dove mandare l'utente quando `link` non si è aperto.
   *
   * È la ricerca di quel prodotto sul sito del negozio, o su Amazon quando il
   * negozio non lo conosciamo. Si apre sempre — un indirizzo di ricerca non
   * può dare 404 — quindi nessun prodotto resta senza un posto dove andare.
   */
  linkRicerca?: string;
  /** Il nome per il tasto di ripiego: «cerca su Amazon». */
  ricercaSu?: string;
  /** Miniatura del prodotto, se la fonte la fornisce (Google Shopping sì). */
  immagine?: string;
  /* `verifica` dice quanto fidarsi: solo "verificato" e "pagina-ok" hanno un
     link, perche' solo per quelli la pagina si e' aperta davvero. */
  /** Il nome sullo scaffale di quel negozio. */
  nome: string;
  prezzo: number;
  valuta: string;
  link: string;
  verifica: VerifyStatus;
  /** Presenti solo se il prodotto è in promozione in quel negozio. */
  prezzoListino?: number;
  risparmio?: number;
  scontoPercento?: number;
  offertaFinoAl?: string;
}

export interface ProductOffers {
  /** La voce della lista della spesa. */
  prodotto: string;
  /** Le offerte trovate, dalla più economica alla più cara. */
  offerte: Offer[];
  /** Quanto si risparmia scegliendo la prima invece dell'ultima. */
  differenza: number | null;
}

/**
 * Mette una accanto all'altra le offerte dello stesso prodotto nei vari negozi.
 *
 * È il modo in cui l'app deve mostrare i prezzi — come già faceva il prototipo
 * del cliente: non un solo supermercato imposto, ma le alternative, così è
 * l'utente a scegliere dove comprare.
 *
 * I dati per farlo ci sono già e sono già stati pagati: il modello prezza lo
 * stesso paniere presso ogni insegna nella stessa chiamata, e tenere solo il
 * vincitore significherebbe buttare metà di ciò che si è verificato.
 *
 * Il raggruppamento usa il campo `prodotto`, che il modello scrive uguale per
 * tutte le insegne. Quando manca si ricade sul nome commerciale: si perde
 * l'accostamento, ma nessuna offerta va persa.
 */
export function groupByProduct(rows: CheckedRow[]): ProductOffers[] {
  const groups = new Map<string, Offer[]>();

  for (const r of rows) {
    // Una riga senza prezzo non è un'offerta. Una con prezzo ma senza pagina
    // che si apre lo è ancora, purché abbia un posto dove mandare l'utente.
    if (r.prezzo == null) continue;
    if (r.verifica === "non-raggiungibile" && !r.linkRicerca) continue;

    const key = (r.prodotto || r.nome).trim().toLowerCase();
    const offer: Offer = {
      negozio: r.negozio,
      immagine: r.immagine,
      linkRicerca: r.linkRicerca,
      ricercaSu: r.ricercaSu,
      nome: r.nome,
      prezzo: r.prezzo,
      valuta: r.valuta,
      // Un link che non si apre non si consegna mai: e' l'unica cosa che
      // l'utente potrebbe toccare, e porterebbe a una pagina inesistente.
      link: r.verifica === "non-raggiungibile" ? "" : r.link,
      verifica: r.verifica,
      prezzoListino: r.prezzoListino,
      risparmio: r.risparmio,
      scontoPercento: r.scontoPercento,
      offertaFinoAl: r.offertaFinoAl,
    };
    const list = groups.get(key);
    if (list) list.push(offer);
    else groups.set(key, [offer]);
  }

  return [...groups.entries()].map(([key, offerte]) => {
    // Dal piu' economico, e basta.
    //
    // Prima si mettevano davanti i verificati, e l'app finiva per chiamare
    // "piu' conveniente" qualcosa che non lo era: una salsiccia verificata a
    // 14,40 sopra la stessa a 5,99 non verificata. Detto a un utente e' falso,
    // e nessuna buona intenzione lo giustifica.
    //
    // La verifica non sparisce: resta l'etichetta su ogni riga, e soprattutto
    // decide che cosa entra nel TOTALE — che si calcola a parte, sui soli
    // prezzi di cui abbiamo aperto la pagina.
    offerte.sort((a, b) => a.prezzo - b.prezzo);

    const first = rows.find((r) => (r.prodotto || r.nome).trim().toLowerCase() === key);
    // La differenza si calcola solo fra prezzi verificati: confrontare un
    // prezzo controllato con uno che non lo e' darebbe un risparmio inventato.
    const sicuri = offerte.filter((o) => o.verifica !== "non-raggiungibile");

    return {
      prodotto: first?.prodotto || first?.nome || key,
      offerte,
      differenza:
        sicuri.length > 1
          ? Math.round((sicuri[sicuri.length - 1].prezzo - sicuri[0].prezzo) * 100) / 100
          : null,
    };
  });
}

/* ─────────────── Prezzi che non possono essere veri ─────────────── */

/**
 * Venditori che non fanno la spesa di tutti i giorni.
 *
 * Non è snobismo: i negozi di specialità italiane per l'estero vendono la
 * stessa passata a cinque volte il prezzo del supermercato. È un prezzo vero
 * di un prodotto vero, ma in un confronto sulla spesa settimanale non ci sta —
 * e se vince il confronto lo falsa del tutto.
 *
 * L'elenco è cresciuto sulle prove: `Italy Food Shop`, `Cicalia`, `Sicalb` e
 * simili sono comparsi con l'olio a 11,29 € contro i 6,75 di Carrefour.
 */
const VENDITORI_FUORI_CONTESTO = [
  "gourmet", "delicatessen", "specialit", "export", "italy food", "italian food",
  "made in italy", "eccellenz", "bottega", "enoteca", "vinicola", "cantina",
  "farmacia", "parafarmacia", "erboristeria", "integrat",
  "ingrosso", "wholesale", "grossist", "cash and carry",
  "wish", "aliexpress", "alibaba", "temu",
];

/** Parole nel titolo che tradiscono un formato diverso da quello cercato. */
const TITOLI_FUORI_CONTESTO = [
  "cartone da", "all'ingrosso", "bancale", "pallet",
  "integratore", "capsule", "compresse",
  "per animali", "per cani", "per gatti",
];

/**
 * Quanto vale una riga della spesa, e in quale valuta.
 *
 * Le soglie erano fisse — sotto 0,10 e sopra 100 — e funzionavano finché si
 * ragionava in euro. In Giappone hanno buttato via diciannove righe su venti:
 * un petto di pollo costa 356 yen, cioè poco più di due euro, ma il numero
 * superava cento e finiva scartato. Lo stesso sarebbe successo in Corea, in
 * Ungheria, in India.
 *
 * Quindi le soglie si scalano sulla valuta. I fattori qui sotto dicono
 * grosso modo quante unità valgono un euro: NON sono un cambio aggiornato e
 * non devono esserlo — servono solo a distinguere un ordine di grandezza da un
 * altro. Se lo yen si muove del venti per cento, questo controllo non se ne
 * accorge nemmeno, ed è giusto così.
 */
const UNITA_PER_EURO: Record<string, number> = {
  EUR: 1, USD: 1.1, GBP: 0.85, CHF: 0.95, CAD: 1.5, AUD: 1.65, NZD: 1.8,
  SGD: 1.45, ILS: 4, AED: 4, SAR: 4.1, PLN: 4.3, BRL: 6, DKK: 7.5,
  NOK: 11.5, SEK: 11.5, ZAR: 20, MXN: 20, CZK: 25, TRY: 40, INR: 90,
  JPY: 160, HUF: 390, KRW: 1450,
};

/**
 * Il tetto e il pavimento per una riga, nella valuta di quella riga.
 *
 * Cento euro è largo di proposito: un olio buono da un litro o un taglio di
 * carne pregiata possono superare i venticinque, e tagliarli sarebbe
 * sbagliato. Serve solo a fermare l'assurdo — sei uova a 250 €, che era un
 * bancale all'ingrosso riportato come se fosse una confezione.
 */
function soglie(valuta: string): { pavimento: number; tetto: number } {
  const fattore = UNITA_PER_EURO[(valuta ?? "EUR").toUpperCase()] ?? 1;
  return { pavimento: 0.1 * fattore, tetto: 100 * fattore };
}

/**
 * Scarta le righe che non possono essere la spesa di una famiglia.
 *
 * Vale per ENTRAMBE le strade — il motore AI e Google Shopping — perché il
 * difetto è lo stesso: la ricerca trova un prezzo vero di qualcosa che non è
 * il prodotto della lista. Applicarlo in un posto solo significa correggerlo
 * una volta sola.
 */
export function scartaImplausibili<
  T extends { nome: string; negozio: string; prezzo: number | null; valuta?: string },
>(rows: T[]): { tenute: T[]; scartate: number } {
  const tenute = rows.filter((r) => {
    if (r.prezzo == null) return true; // senza prezzo non c'è niente da giudicare

    const { pavimento, tetto } = soglie(r.valuta ?? "EUR");
    if (r.prezzo < pavimento || r.prezzo > tetto) {
      console.info(
        `[plausibilita] scartato "${r.nome.slice(0, 50)}": ${r.prezzo} ${r.valuta ?? "EUR"} ` +
          `fuori dalla scala ${pavimento}–${tetto}`,
      );
      return false;
    }

    const venditore = (r.negozio ?? "").toLowerCase();
    if (VENDITORI_FUORI_CONTESTO.some((v) => venditore.includes(v))) {
      console.info(`[plausibilita] scartato "${r.nome.slice(0, 40)}": venditore ${r.negozio}`);
      return false;
    }

    const titolo = (r.nome ?? "").toLowerCase();
    if (TITOLI_FUORI_CONTESTO.some((v) => titolo.includes(v))) {
      console.info(`[plausibilita] scartato "${r.nome.slice(0, 50)}": formato non da spesa`);
      return false;
    }

    return true;
  });

  return { tenute, scartate: rows.length - tenute.length };
}

/**
 * Toglie le offerte troppo care rispetto alla più economica dello stesso prodotto.
 *
 * Il confronto fra venditori serve a mostrare quanto si risparmia, ma se
 * un'offerta costa sei volte l'altra non è un'alternativa: è un prodotto
 * diverso, o un formato diverso, e mostrarla fa sembrare enorme un risparmio
 * che non esiste. Nella prova, sei uova a 4,80 accanto a sei uova a 250
 * producevano «risparmi 245,20 €».
 *
 * Sei volte è una soglia larga: fra il primo prezzo e il prodotto di marca
 * ci sta un fattore due o tre, e quello deve passare.
 */
export function togliOutlier(gruppi: ProductOffers[]): ProductOffers[] {
  return gruppi.map((g) => {
    if (g.offerte.length < 2) return g;

    const minimo = Math.min(...g.offerte.map((o) => o.prezzo));
    const offerte = g.offerte.filter((o) => {
      const troppo = o.prezzo > minimo * 6;
      if (troppo) {
        console.info(
          `[plausibilita] tolta alternativa "${o.nome.slice(0, 40)}" da ${o.negozio}: ` +
            `${o.prezzo} contro ${minimo} del più economico`,
        );
      }
      return !troppo;
    });

    const sicuri = offerte.filter((o) => o.verifica !== "non-raggiungibile");
    return {
      ...g,
      offerte,
      differenza:
        sicuri.length > 1
          ? Math.round((sicuri[sicuri.length - 1].prezzo - sicuri[0].prezzo) * 100) / 100
          : null,
    };
  });
}


/**
 * Il prezzo più basso di cui abbiamo aperto la pagina, prodotto per prodotto.
 *
 * Serve al TOTALE, ed è una selezione diversa da quella che vede l'utente:
 * l'elenco mostra tutte le offerte dal prezzo più basso, il totale somma solo
 * quelle il cui negozio ha davvero quella pagina.
 *
 * IL CONFINE È SULLA PAGINA, NON SUL PREZZO, e per un pezzo è stato messo nel
 * posto sbagliato. Escludere le pagine bloccate sembrava prudenza — «non
 * sommare numeri che nessuno ha controllato» — ma le pagine `pagina-ok`
 * passavano già, e il loro prezzo è altrettanto non controllato. Il risultato
 * era il numero preciso e sbagliato che si voleva evitare: 12,30 € invece di
 * 63,81 per la spesa settimanale di tre persone ad Atene, e 0,00 CHF a Zurigo.
 *
 * Fuori dal totale restano solo le righe il cui link non si apre: quelle sì,
 * sommarle significherebbe contare un negozio che non ha quel prodotto. E
 * quante sono lo si dichiara sempre.
 */
export function migliorePrezzoVerificato(gruppo: ProductOffers): Offer | null {
  return (
    gruppo.offerte.find((o) => paginaEsiste(o.verifica)) ?? null
  );
}
