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
  /**
   * Il nome che la PAGINA dichiara, che spesso e' piu' completo di quello che
   * si ricava dall'indirizzo.
   *
   * Il catalogo prende i nomi dalle sitemap, cioe' dagli indirizzi, e li' il
   * formato spesso non c'e': `latte-intero` invece di «Latte intero UHT 1 l».
   * La pagina invece lo dichiara quasi sempre, e la stiamo gia' aprendo per
   * leggere il prezzo — quindi costa zero richieste in piu'.
   *
   * Serve al prezzo al chilo: senza il peso non si puo' calcolare, e oggi si
   * riesce solo per un terzo delle offerte.
   */
  nome?: string;
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
  /**
   * Il nome che la pagina dichiara, anche quando il prezzo non c'e'.
   *
   * Sta qui e non dentro `page` proprio per questo: `page` esiste solo se un
   * prezzo si e' letto, e il caso che ci interessa e' l'opposto — pagina
   * aperta, prezzo servito da un'API, nome per esteso disponibile.
   */
  nome?: string;
  /**
   * Marca, codice del negozio, indirizzo dell'immagine, disponibilita',
   * categoria grezza: quel che la pagina dichiara e che fino a ieri si
   * buttava.
   *
   * Sta accanto a `page` e non dentro, per la stessa ragione del nome: questi
   * campi esistono anche quando il prezzo non si e' potuto leggere, e quello
   * e' il caso normale per quarantadue insegne del catalogo.
   */
  scheda?: SchedaPagina;
}

import { haLettoreApi, prezzoDaApi } from "./prezzi-api.js";
import { INTESTAZIONE_BROWSER } from "../base/intestazione.js";
import { quantitaDa } from "./quantita.js";
import { schedaDallaPagina, type SchedaPagina } from "./scheda-pagina.js";

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

/**
 * La parte di pagina in cui vale la pena cercare un prezzo.
 *
 * Tagliare i primi N caratteri e' la cosa ovvia e su molti siti funziona,
 * perche' i dati strutturati stanno in alto. Su Coop no: le sue pagine pesano
 * 1,8 MB e il blocco `ld+json` comincia intorno al byte 838.000. Con qualunque
 * taglio ragionevole in testa, il prezzo c'era e non lo leggevamo — e la riga
 * finiva scartata come «prodotto senza prezzo», che e' una bugia comoda.
 *
 * Quindi non si taglia alla cieca: si tiene la testa, dove stanno microdata e
 * meta og, PIU' la finestra intorno ai blocchi di dati strutturati che cadono
 * fuori dalla testa.
 *
 * IL PRIMO BLOCCO NON E' SEMPRE QUELLO DEL PRODOTTO, E CI COSTAVA UN'INSEGNA.
 * La versione precedente cercava il PRIMO `ld+json` e, se cadeva dentro la
 * testa, si fermava li'. Ma un blocco in cima non e' per forza il prodotto:
 * quasi sempre e' l'`Organization` o il `WebSite` del sito, che prezzi non ne
 * ha. Heron Foods ne ha due — uno a 3.501 e uno a 139.856 — e il prezzo sta
 * nel secondo. Trovato il primo dentro la testa, il codice tornava la sola
 * testa e il prezzo restava fuori: l'insegna dichiarava zero prezzi su quattro
 * pagine su quattro, tutte con il prezzo scritto dentro.
 *
 * Ora si tiene la testa e si aggiungono le finestre attorno ai blocchi
 * successivi, fino a due: piu' di cosi' non serve a nessuna pagina vista, e il
 * testo da esaminare resta limitato.
 */
export function porzioneConPrezzi(html: string): string {
  if (html.length <= TESTA) return html;

  /* DOVE VALE LA PENA GUARDARE.
     La versione precedente prendeva la testa e, se i dati strutturati stavano
     oltre, una finestra attorno a quelli. Bastava finche' il prezzo stava in
     uno dei due posti — e non e' vero.

     Picard: pagina da 403.951 byte, `ld+json` al byte 36.662, quindi dentro la
     testa, quindi ci si fermava li'. Il prezzo vero stava al byte 267.087, in
     un attributo per Analytics che nessuno guardava. Un'insegna intera
     classificata come muta perche' cercavamo nel posto giusto per gli altri.

     Ora si raccolgono le finestre attorno a TUTTI i segni di prezzo che si
     trovano, non attorno al primo. Costa qualche ricerca di stringa su una
     pagina gia' in memoria: niente, rispetto a rileggere l'HTML intero con
     una dozzina di espressioni. */
  const pezzi = [html.slice(0, TESTA)];
  let preso = TESTA;

  for (const segno of SEGNI_DI_PREZZO) {
    if (preso >= TETTO) break;
    let da = TESTA;
    for (let quante = 0; quante < 3; quante++) {
      const i = html.indexOf(segno, da);
      if (i < 0) break;
      const inizio = Math.max(0, i - 400);
      const fine = Math.min(html.length, i + FINESTRA);
      pezzi.push(html.slice(inizio, fine));
      preso += fine - inizio;
      da = fine;
      if (preso >= TETTO) break;
    }
  }
  return pezzi.join("\n");
}

/** Quanto della testa si prende sempre: i dati strutturati stanno quasi sempre li'. */
const TESTA = 120_000;
/** Quanto si prende attorno a ogni segno di prezzo trovato piu' avanti. */
const FINESTRA = 40_000;
/** Oltre questo non si va: le pagine da megabyte esistono e la memoria no. */
const TETTO = 400_000;

/**
 * I segni che da queste parti potrebbe esserci un prezzo.
 *
 * Sia in chiaro sia con le virgolette codificate, perche' i dati dentro gli
 * attributi sono scritti cosi' — ed e' esattamente li' che stava il prezzo di
 * Picard.
 */
const SEGNI_DI_PREZZO = [
  "application/ld+json",
  '"price"',
  "&quot;price&quot;",
  "priceCurrency",
  "itemprop=\"price\"",
  "data-price",
  /* LastMile tiene il prezzo in un oggetto che non si chiama «price»:
     `"prc":{"p":1.99}`. Senza questo segno la finestra di lettura non ci
     arriva nemmeno, perche' le loro pagine pesano tre megabyte e mezzo. */
  '"prc":{"p"',
];

/** Legge prezzo, listino e scadenza dell'offerta dai dati strutturati. */
/**
 * Le entita' HTML sciolte, per i JSON nascosti dentro gli attributi.
 *
 * PERCHE' SERVE
 * -------------
 * Picard il prezzo ce l'ha nella pagina, e per noi era muta. Il motivo e' che
 * lo tiene dentro un attributo per Google Analytics:
 *
 *     data-gtm="{&quot;item_name&quot;:&quot;PAIN SANS GLUTEN&quot;,&quot;price&quot;:4.89}"
 *
 * E' JSON a tutti gli effetti, ma le virgolette sono `&quot;` perche' dentro
 * un attributo quelle vere chiuderebbero l'attributo stesso. Le nostre
 * espressioni cercano `"price"` con le virgolette vere e non combaciano mai.
 *
 * Un'insegna intera classificata come «non pubblica i prezzi» per sei
 * caratteri di codifica.
 *
 * Non e' un caso isolato: ogni sito che mette dati strutturati in un attributo
 * — e sono tanti, perche' e' come si passano informazioni a Analytics, a
 * Tag Manager, ai componenti — li codifica cosi'.
 */
function sciogliEntita(html: string): string {
  return html
    .replace(/&quot;/g, '"')
    .replace(/&#0?34;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Il nome del prodotto dichiarato dalla pagina.
 *
 * Sta in una funzione sua perche' serve in due momenti: quando si legge il
 * prezzo, e quando la pagina si apre ma il prezzo NON c'e' — che per le
 * insegne italiane e' il caso normale, perche' il prezzo arriva dalla loro
 * API e la pagina lo disegna dopo. Prima quel secondo caso non leggeva
 * niente, e quelle righe restavano col nome corto dell'indirizzo: senza
 * formato, niente prezzo al chilo.
 */
export function nomeDallaPagina(html: string): string | undefined {
  /* IL NOME DEL PRODOTTO, e la parte difficile e' che non sia quello del
     NEGOZIO.
     Il primo tentativo cercava il primo `"name"` della pagina, e campionando
     dodici schede italiane e' venuto fuori cosa c'e' davvero li' dentro:
     «Bologna» — la citta' del punto vendita — e «La Maremmana», il produttore.
     I dati strutturati di un negozio descrivono anche il negozio, e il suo
     nome viene quasi sempre prima di quello del prodotto.

     Quindi si cerca in tre posti, nell'ordine in cui e' probabile che parlino
     del prodotto:

       1. dentro un oggetto marcato `"@type":"Product"` — non c'e' dubbio
       2. `og:title`, che i siti riempiono per far bella figura quando il link
          si condivide: e' il nome del prodotto, a volte con la coda del
          negozio dopo una barra
       3. il titolo della pagina, per ultimo perche' e' quello piu' sporco

     Un nome sbagliato non fa danni — viene usato solo se contiene un peso, e
     «Bologna» un peso non ce l'ha — ma ogni nome sbagliato e' un'occasione
     persa di calcolare un prezzo al chilo. */
  const dentroProdotto = html.match(
    /"@type"\s*:\s*"Product"[^]{0,600}?"name"\s*:\s*"([^"]{3,120})"/i,
  )?.[1];
  const daOg = html
    .match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{3,140})["']/i)?.[1]
    ?.split(/[|–—]/)[0]
    ?.trim();
  const daTitolo = html.match(/<title[^>]*>([^<]{3,140})<\/title>/i)?.[1]
    ?.split(/[|–—]/)[0]
    ?.trim();

  /* Si tiene il primo che porta una quantita': e' l'unica cosa per cui questo
     nome serve, e sceglierlo cosi' evita di preferire un nome piu' «bello» ma
     inutile a uno brutto che pero' dice quanto pesa. */
  const candidati = [dentroProdotto, daOg, daTitolo].filter(
    (x): x is string => typeof x === "string" && x.length >= 3,
  );
  return candidati.find((x) => quantitaDa(x)) ?? candidati[0];
}

/**
 * Legge prezzo, listino e scadenza dell'offerta dai dati strutturati.
 *
 * Due passate: prima la pagina com'e', poi — solo se non si e' trovato niente
 * — la stessa pagina con le entita' sciolte. In quest'ordine perche' la
 * stragrande maggioranza dei siti il prezzo lo espone in chiaro, e sciogliere
 * mezzo megabyte di HTML per ogni scheda quando non serve sarebbe lavoro
 * buttato su decine di migliaia di pagine.
 */
/**
 * I blocchi che parlano di soldi ma non del prodotto.
 *
 * IL CASO CHE L'HA RESA NECESSARIA
 * --------------------------------
 * Checkers, in Sudafrica. Su ogni scheda senza prezzo il magazzino aveva
 * registrato 37 — lo stesso numero su prodotti diversi. Non era un prezzo:
 *
 *     "shippingRate":{"@type":"MonetaryAmount","value":37,"currency":"ZAR"}
 *
 * E' il costo di consegna. Le ultime due regole di `leggiDa` cercano
 * `"value": numero, "currency"` come ultima spiaggia, ed e' esattamente la
 * forma che ha la tariffa del corriere. 6.831 righe su 13.053, cioe' meta'
 * dell'insegna, portavano il prezzo del fattorino attaccato alla spesa.
 *
 * Un prezzo mancante e' un buco e si vede. Un prezzo SBAGLIATO e' un numero
 * che l'utente legge, confronta e su cui decide dove fare la spesa: e' il
 * danno peggiore che questo file possa fare, ed e' gia' successo una volta
 * con le mele di Lidl UK a 63 sterline (la guardia contro le tabelle di
 * indici, piu' sotto, nasce da li').
 *
 * Si tolgono PRIMA di cercare invece di scartarli dopo: dopo vorrebbe dire
 * riconoscere un prezzo sbagliato, e se sapessimo farlo non avremmo il
 * problema.
 */
const NON_E_IL_PRODOTTO =
  /"(?:shippingRate|shippingDetails|deliveryFee|deliveryCost|shippingCost|handlingFee|freight|serviceFee|minimumOrder)"\s*:\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/gi;

/**
 * Il prezzo dall'offerta del PRODOTTO, leggendo il JSON-LD come JSON.
 *
 * PERCHE' NON BASTANO LE ESPRESSIONI SUL TESTO
 * --------------------------------------------
 * Perche' cercano `"price"` ovunque capiti, e in una pagina di negozio quella
 * parola capita in parecchi posti che prezzi di prodotti non sono. Matas, in
 * Danimarca, aveva SETTEMILATRECENTOCINQUANTACINQUE prodotti tutti a 31 — il
 * cento per cento del suo catalogo. Trentuno corone e' la quota mensile del
 * loro programma fedelta':
 *
 *     {"@type":"PriceSpecification","price":31,"priceCurrency":"DKK",
 *      "description":"MånedsmedlemskabClubMatas"}
 *
 * Un abbonamento, attaccato a un rossetto di Dior.
 *
 * Togliere anche questo con un'altra esclusione sarebbe la terza toppa dopo
 * la tariffa di consegna e la tabella di indici di Lidl: tre sintomi della
 * stessa causa, cioe' che stiamo cercando una parola invece di leggere una
 * struttura. Il JSON-LD e' JSON, e dice DOVE sta il prezzo del prodotto —
 * dentro `offers` di un oggetto `Product`. Chiederlo li' e' esatto: o c'e', e
 * allora e' quello giusto, o non c'e', e allora si passa alle espressioni.
 *
 * Le espressioni restano, per i siti che il JSON-LD non ce l'hanno o ce
 * l'hanno rotto. Ma non sono piu' la prima risposta.
 */
function dallOffertaDelProdotto(html: string): number | null {
  for (const m of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    let dati: unknown;
    try {
      dati = JSON.parse(m[1].trim());
    } catch {
      /* Un blocco tagliato a meta' dalla porzione, o malformato: ce ne sono
         altri, e in fondo restano le espressioni. */
      continue;
    }

    /* Un documento JSON-LD puo' essere un oggetto, un elenco, o un `@graph`
       con dentro tutte le entita' della pagina. Si guardano tutti. */
    const candidati: unknown[] = Array.isArray(dati)
      ? dati
      : [dati, ...((dati as { "@graph"?: unknown[] })?.["@graph"] ?? [])];

    for (const c of candidati) {
      const o = c as { "@type"?: string | string[]; offers?: unknown; hasVariant?: unknown };
      const tipo = Array.isArray(o?.["@type"]) ? o["@type"].join(" ") : String(o?.["@type"] ?? "");
      if (!/Product/i.test(tipo)) continue;

      /* IL PREZZO PUO' STARE UN PIANO PIU' GIU'.
         Un `ProductGroup` e' un prodotto che esiste in varianti — le tonalita'
         di un rossetto, le taglie di una maglietta — e spesso il gruppo un
         prezzo non ce l'ha: ce l'ha ogni variante, in `hasVariant`. Matas e'
         fatto cosi', e guardando solo il piano di sopra si concludeva «questo
         prodotto non ha offerte» per poi ripiegare sulle espressioni e
         pescare la quota del programma fedelta'. */
      const varianti = Array.isArray(o.hasVariant) ? o.hasVariant : [];
      const daGuardare = [
        o.offers,
        ...varianti.map((v) => (v as { offers?: unknown })?.offers),
      ].filter(Boolean);
      if (daGuardare.length === 0) continue;

      /* `offers` puo' essere un'offerta sola, un elenco di offerte (taglie,
         formati) o un `AggregateOffer` con il minimo. Si prende la piu' bassa
         fra quelle valide: e' il prezzo a cui quel prodotto si compra. */
      const offerte = daGuardare.flatMap((x) => (Array.isArray(x) ? x : [x]));
      const prezzi: number[] = [];
      for (const off of offerte) {
        const x = off as { price?: unknown; lowPrice?: unknown; priceSpecification?: unknown };
        for (const v of [x?.price, x?.lowPrice, (x?.priceSpecification as { price?: unknown })?.price]) {
          const n = typeof v === "string" ? Number.parseFloat(v.replace(",", ".")) : Number(v);
          /* Lo zero non e' un prezzo: e' «non disponibile» scritto male, ed e'
             proprio il caso in cui prima si ripiegava sulla tariffa del
             corriere. */
          if (Number.isFinite(n) && n > 0.01 && n < 100_000) prezzi.push(n);
        }
      }
      if (prezzi.length > 0) return Math.min(...prezzi);
    }
  }
  return null;
}

export function readPrices(html: string): PagePrice | null {
  /* LA STRUTTURA SI LEGGE INTATTA, LE PAROLE SI CERCANO NEL RIPULITO.
     Togliere i blocchi di spedizione serve alle espressioni, che guardano il
     testo. Ma quei blocchi stanno DENTRO il JSON dell'offerta, e toglierli
     lascia un JSON monco che non si apre piu': Matas ha il prezzo giusto in
     `offers.priceSpecification.price`, e leggendo la versione ripulita si
     tornava a pescare i trentuno corone dell'abbonamento. Un rimedio che
     rompeva la cura. */
  const dallOfferta = dallOffertaDelProdotto(html);
  const pulito = html.replace(NON_E_IL_PRODOTTO, "");
  if (dallOfferta !== null) {
    const resto = leggiDa(pulito);
    /* Del resto si tiene quel che l'offerta non dice — listino, sconto,
       valuta — ma il prezzo corrente e' quello dell'offerta. */
    return { ...(resto ?? {}), current: dallOfferta } as PagePrice;
  }

  return leggiDa(pulito) ?? (pulito.includes("&quot;") ? leggiDa(sciogliEntita(pulito)) : null);
}

function leggiDa(html: string): PagePrice | null {
  const current = firstNumber(html, [
    /* IL PREZZO ATTACCATO ALLA SUA VALUTA, PRIMA DI TUTTO.
       Un prezzo vero sta quasi sempre a fianco di `priceCurrency`, dentro il
       blocco `Offer`. Cercare quella coppia per prima costa una regex e mette
       al riparo da tutti i numeri che si chiamano «price» senza esserlo.

       La guardia contro le tabelle di indici (spiegata sotto) vale anche qui:
       un numero preso da un dizionario non diventa un prezzo solo perche' piu'
       avanti nella pagina c'e' una valuta. */
    /"priceCurrency"\s*:\s*"[A-Z]{3}"[\s\S]{0,300}?"price"\s*:\s*"?([\d.,]+)"?/i,
    /(?<!"[a-zA-Z_]{2,24}"\s*:\s*\d{1,4}\s*,\s*"[a-zA-Z_]{2,24}"\s*:\s*\d{1,4}\s*,\s*)"price"\s*:\s*"?([\d.,]+)"?[\s\S]{0,300}?"priceCurrency"\s*:\s*"[A-Z]{3}"/i,

    /* Dati strutturati: la forma che i motori di ricerca chiedono.

       LA GUARDIA DAVANTI SERVE, E COSTA CARA NON AVERLA.
       Misurato su Lidl UK, mele Gala: dicevamo 63 sterline. Non era un errore
       di unita' — quel numero stava dentro una tabella di indici di campi che
       la pagina si porta dietro:

         "multipack":5,"preventSelling":5,"price":63,"productId":29

       cioe' «il campo price sta alla posizione 63». Il prodotto un prezzo non
       ce l'ha proprio: il suo `Offer` dice `InStoreOnly`, si compra solo in
       negozio. La risposta giusta era «nessun prezzo», e noi ne abbiamo
       inventato uno — la cosa peggiore che un'app di confronto possa fare.

       Due coppie `"nome":numero` di fila non sono un prodotto, sono un
       dizionario. Ne bastano due perche' un JSON legittimo puo' avere
       `"id":123,"price":2.49`, e quello va lasciato passare. */
    /(?<!"[a-zA-Z_]{2,24}"\s*:\s*\d{1,4}\s*,\s*"[a-zA-Z_]{2,24}"\s*:\s*\d{1,4}\s*,\s*)"price"\s*:\s*"?([\d.,]+)"?/i,
    /"lowPrice"\s*:\s*"?([\d.,]+)"?/i,
    /"salePrice"\s*:\s*"?([\d.,]+)"?/i,
    // Microdati, nell'attributo o nel testo.
    /* IL SIMBOLO DELLA VALUTA VIENE PRIMA DEL NUMERO, E CI COSTAVA UN'INSEGNA.
       SuperValu scrive `itemprop="price" content="€3.00"`. Lo schema
       pretendeva che il contenuto cominciasse con una cifra e non combaciava
       mai: undicimilaottocento indirizzi irlandesi dichiarati «senza prezzo»
       per un carattere. Si lasciano passare fino a tre caratteri davanti —
       il simbolo e un eventuale spazio — e non di piu', perche' oltre non e'
       piu' una valuta ma un altro campo. */
    /itemprop=["']price["'][^>]*content=["'][^\d]{0,3}([\d.,]+)["']/i,
    /itemprop=["']price["'][^>]*>\s*[^\d<]{0,6}([\d.,]+)/i,
    // I meta di Open Graph e di Facebook Commerce.
    /<meta[^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount|twitter:data1)["'][^>]+content=["']\s*([\d.,]+)/i,
    /<meta[^>]+content=["']\s*([\d.,]+)["'][^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["']/i,
    // Attributi che i negozi usano per i propri script.
    /data-(?:product-)?price(?:-amount)?=["']\s*([\d.,]+)["']/i,
    // Altri nomi dentro i blocchi JSON della pagina.
    /"(?:currentPrice|finalPrice|unitPrice|sellingPrice|priceValue|grossPrice)"\s*:\s*"?([\d.,]+)"?/i,
    // Generici, per ultimi: da soli non provano niente, ma vicino a una
    // valuta sono quasi sempre il prezzo.
    /"amount"\s*:\s*"?([\d.,]+)"?\s*,\s*"currency/i,
    /"value"\s*:\s*"?([\d.,]+)"?\s*,\s*"currency/i,
  ]);
  if (current === null) return null;

  // Lo sconto può essere espresso come importo risparmiato oppure come prezzo
  // pieno: si prova prima l'importo, che è quello che Carrefour usa.
  const discountAmount = firstNumber(html, [/"discount"\s*:\s*"?([\d.,]+)"?/i]);
  /* ATTENZIONE AL PREZZO AL CHILO TRAVESTITO DA LISTINO.
     Cortilia accanto al prezzo scrive `listpriceperquantityunit`: 13,68 su un
     prodotto da 3,42 €. Non e' un prezzo barrato, e' il costo al chilo — e
     preso per listino diventerebbe uno sconto del 75% che non esiste, cioe'
     esattamente la bugia che un'app di risparmio non puo' permettersi.
     Le espressioni qui sotto chiudono il nome con le virgolette apposta:
     "listPrice" combacia, "listpriceperquantityunit" no. Misurato su sei
     schede Cortilia: nessuna promozione dichiarata, che e' la risposta giusta. */
  const listed = firstNumber(html, [
    /"listPrice"\s*:\s*"?([\d.,]+)"?/i,
    /"regularPrice"\s*:\s*"?([\d.,]+)"?/i,
    /"originalPrice"\s*:\s*"?([\d.,]+)"?/i,
    /"strikePrice"\s*:\s*"?([\d.,]+)"?/i,
    /"(?:wasPrice|previousPrice|priceBeforeDiscount|rrp)"\s*:\s*"?([\d.,]+)"?/i,
    /* IL PREZZO BARRATO SCRITTO NELLA PAGINA, NON NEI DATI STRUTTURATI.
       Tutte le espressioni qui sopra cercano un campo JSON, e in Italia
       bastavano. In UK no: Aldi scrive
       `<del aria-label="Original price: £1.45">£1.45</del>` e Lidl
       `<span>Regular price £18.99</span>`, e nei loro dati strutturati il
       listino non c'e' affatto. Il risultato era un prezzo giusto senza la sua
       promozione: l'utente vedeva 1,39 £ senza sapere che erano 1,45 £
       scontati, cioe' proprio l'informazione per cui usa l'app.
       Stanno DOPO i campi JSON di proposito: i dati strutturati restano la
       fonte migliore, e queste entrano solo quando quelli tacciono. */
    /* I RIEMPITIVI NON DEVONO POTER MANGIARE CIFRE, E QUI E' SUCCESSO.
       Scritto `[^"']{0,8}` fra «price» e il numero, su
       `aria-label="Original price: £1.45"` il quantificatore goloso si e'
       preso «: £1.4» e ha catturato il `5` rimasto: listino 5 £ su un prodotto
       da 1,39, cioe' uno sconto del 72% inventato di sana pianta. Nemmeno il
       limite di plausibilita' lo fermava — 5 sta dentro sei volte 1,39.
       Con `[^"'\d]` il riempitivo si ferma alla prima cifra, che e' l'inizio
       del numero che stiamo cercando. */
    /aria-label=["'](?:original|was|regular|previous)[^"'\d]{0,10}price[^"'\d]{0,8}([\d.,]+)/i,
    /(?:regular|original|previous|was) price[^\d<]{0,10}([\d.,]+)/i,
    /<(?:del|s|strike)\b[^>]*>\s*[^\d<]{0,4}([\d.,]+)/i,
  ]);

  let list: number | undefined;
  /* Il listino dev'essere PLAUSIBILE, non solo piu' alto. Le espressioni sul
     testo della pagina sono piu' larghe di quelle sui campi JSON, quindi
     possono pescare un prezzo al chilo — la trappola di Cortilia, con 13,68
     preso per listino di un prodotto da 3,42. Oltre sei volte il prezzo pagato
     non e' una promozione, e' un'altra unita' di misura: e uno sconto
     dell'83% inventato fa piu' danno di nessuno sconto. */
  if (listed !== null && listed > current && listed <= current * 6) list = listed;
  else if (discountAmount !== null && discountAmount > 0) {
    const computed = Math.round((current + discountAmount) * 100) / 100;
    if (sane(computed) && computed > current) list = computed;
  }

  const nome = nomeDallaPagina(html);

  const out: PagePrice = {
    current,
    nome,
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
      /* TUTTA l'intestazione di un browser, non il solo nome.
         Con due header soli, le schede di Alcampo e Continente rispondevano
         403 al lettore mentre si aprivano cinque volte su cinque alla sonda,
         che li manda tutti. Centosessantamila indirizzi contati come «pagine
         che non si aprono» per come bussavamo noi. Vedi `base/intestazione`. */
      headers: INTESTAZIONE_BROWSER,
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

    /* UN 202 NON E' MAI UNA SCHEDA PRODOTTO.
       `202 Accepted` vuol dire «ho preso in carico la richiesta», non «ecco la
       pagina»: nessun negozio serve un prodotto cosi'. Chi risponde 202 sta
       facendo una difesa anti-bot che finge cortesia.

       Il guard sul corpo vuoto qui sotto non bastava, e Ocado lo dimostra: con
       `Accept: text/html` risponde 202 e un guscio di 2.490 byte — titolo
       vuoto, nessun dato strutturato, nessun prezzo — che passa i duemila
       caratteri e veniva dichiarato `pagina-ok`, cioe' «la pagina c'e', manca
       solo il prezzo». Non c'era niente. Cambiando una sola intestazione lo
       stesso indirizzo torna 202 con ZERO byte: e' la stessa difesa, vestita
       in due modi.

       Non riguarda un solo negozio: nel campione del 16 settembre rispondevano
       202 anche Voila (Canada), Alcampo (Spagna) e Auchan (Polonia), e tutti e
       tre finivano nell'elenco dell'utente come verificati. */
    if (res.status === 202) {
      return { status: "bloccato", reason: "HTTP 202: difesa anti-bot, non una pagina" };
    }
    // Le pagine prodotto sono grandi: i dati strutturati stanno in alto,
    // quindi non serve tenerne più di così in memoria.
    /* La finestra giusta, non i primi duecentomila caratteri.
       Il taglio in testa funziona finche' i dati strutturati stanno in alto, e
       su Coop non ci stanno: il blocco `ld+json` comincia oltre l'ottocentesimo
       migliaio. Qui l'effetto era piu' subdolo che altrove — la pagina si
       apriva, quindi il link passava come buono, ma senza prezzo la riga non
       entrava nel totale e l'insegna intera veniva dichiarata «troppi link
       rotti». Tre catene su undici sparivano per un taglio di stringa. */
    const corpo = await res.text();

    /* UN CORPO VUOTO NON E' UNA PAGINA BUONA.
       Ocado risponde `HTTP 202` con ZERO byte: e' una difesa anti-bot che dice
       «ricevuto» e non manda niente. Il nostro verificatore vedeva uno stato
       2xx, non trovava il prezzo in un corpo inesistente e concludeva
       `pagina-ok` — cioe' «la pagina c'e'». Non lo sapeva affatto, e il link
       finiva nell'elenco dell'utente sotto la scritta «verificato aprendo la
       pagina». Aprendolo davvero: «Page not found».
 
       Sotto i duemila caratteri non c'e' nessuna scheda prodotto: c'e' un
       guscio, un reindirizzo o un rifiuto. Si dichiara `bloccato`, che vuol
       dire «il sito non parla con noi»: e' la verita', e lascia decidere a chi
       legge invece di spacciare un'ipotesi per un controllo. */
    if (corpo.trim().length < 2000) {
      return {
        status: "bloccato",
        reason: `risposta vuota (HTTP ${res.status}, ${corpo.length} byte)`,
      };
    }

    html = porzioneConPrezzi(corpo);
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
  /* La scheda si legge una volta sola e serve a tutti e tre i rami: la pagina
     e' gia' aperta e la fetta e' gia' in memoria, quindi costa una scorsa. */
  const scheda = schedaDallaPagina(html);
  if (page) return { status: "verificato", page, scheda };

  /* LA PAGINA C'E' MA IL PREZZO NON E' SCRITTO DENTRO.
     Per quarantadue insegne del catalogo e' la norma, non l'eccezione: 1,28
     milioni di prodotti con le schede vive e nessun prezzo leggibile. Non lo
     nascondono — lo servono da un'API e la pagina lo disegna dopo.

     Si chiede a quella, ma solo se sappiamo come parlarle: chi non ha un
     lettore non paga nessuna richiesta in piu'. Vedi `prezzi-api.ts`. */
  if (haLettoreApi(url)) {
    const daApi = await prezzoDaApi(url);
    if (daApi) {
      return {
        status: "verificato",
        page: { current: daApi.prezzo, currency: daApi.valuta },
        scheda,
      };
    }
  }

  /* IL NOME SI RESTITUISCE ANCHE SENZA PREZZO.
     Qui la pagina c'e' e il prezzo no: per le insegne italiane e' la norma,
     perche' il prezzo lo servono da un'API. La riga il prezzo ce l'ha gia' —
     gliel'ha dato l'API — e quel che le manca e' il FORMATO, che sta nel nome
     per esteso. Leggerlo qui non costa niente: la pagina e' gia' aperta. */
  return { status: "pagina-ok", nome: nomeDallaPagina(html), scheda };
}

/** Una riga di prezzo dopo il controllo, pronta per il client. */
export interface CheckedRow {
  /** Quanto era pertinente il candidato: 0 e' il primo della classifica. */
  posto?: number;
  /**
   * Quando quella pagina e' stata guardata, in ISO.
   *
   * Viaggia dal magazzino o dalla lettura fino alla risposta senza che nessuno
   * la ricalcoli: se la si rigenerasse qui direbbe «adesso» anche di un prezzo
   * preso dal magazzino ieri, che e' il genere di bugia invisibile che
   * un'API di prezzi non si puo' permettere.
   */
  letto?: string;

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
  /**
   * Il negozio dell'insegna piu' vicino a chi ha chiesto.
   *
   * NON E' LA FONTE DEL PREZZO, e il nome di prima lo lasciava credere.
   * Si chiamava `puntoVendita` e compariva accanto all'importo: sembrava dire
   * "questo prezzo e' di questo negozio". Non lo e': il listino e'
   * dell'INSEGNA — verificato aprendo lo stesso prodotto su sei Eurospin da
   * Milano a Palermo, 1,19 € dappertutto — e il negozio e' solo quello dove
   * l'utente puo' andare a prenderlo.
   *
   * Sul listino la differenza non si vedeva. Su una PROMOZIONE si': quelle il
   * sito le calcola sul negozio che serve te, e mostrare uno sconto del 30%
   * accanto al nome di un negozio che potrebbe non applicarlo e' un numero
   * vero nel posto sbagliato — l'errore di cui l'utente non si accorge.
   */
  negozioPiuVicino?: string;
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
    /* Promozione gia' nota. Le insegne interrogate via API la dichiarano
       loro, e va conservata quando la pagina non ne sa nulla. */
    prezzoListino?: number;
    risparmio?: number;
    scontoPercento?: number;
    offertaFinoAl?: string;
    /** Il negozio dell'insegna piu' vicino a chi chiede. NON e' la fonte del prezzo. */
    negozioPiuVicino?: string;
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
          /* Anche qui il nome puo' migliorare: la pagina ha risposto qualcosa,
             solo non un prezzo. */
          const meglio =
            v.nome && quantitaDa(v.nome) && !quantitaDa(row.nome) ? v.nome.trim() : row.nome;
          return { ...row, nome: meglio, verifica: v.status };
        }

        /* Il prezzo della pagina vince su quello di partenza: è quello che
           l'utente paga oggi, promozione compresa.
           MA SOLO SE LA PAGINA LO DA'. Prima questi campi si riscrivevano
           comunque, anche con `undefined`: una riga che arrivava gia' con la
           sua promozione — succede per le insegne interrogate via API, dove il
           listino barrato e lo sconto li dichiara l'API stessa — passava di qui
           e usciva senza. La promozione veniva raccolta e poi buttata. */
        const p = v.page;
        /* IL NOME PIU' COMPLETO, se la pagina ne dichiara uno che porta il
           formato e quello che abbiamo non ce l'ha.
           Vale soprattutto per la strada italiana: quelle righe arrivano dalle
           API dei negozi e dai volantini, con nomi corti e spesso in
           maiuscolo, e la pagina non la aprono mai. Qui pero' si apre — per
           verificare il link — e leggere anche il nome non costa una richiesta
           in piu'. Senza formato non c'e' prezzo al chilo. */
        const dallaPagina = v.nome ?? p?.nome;
        const nomeMigliore =
          dallaPagina && quantitaDa(dallaPagina) && !quantitaDa(row.nome)
            ? dallaPagina.trim()
            : row.nome;

        return {
          ...row,
          nome: nomeMigliore,
          prezzo: p?.current ?? row.prezzo,
          verifica: v.status,
          prezzoListino: p?.list ?? row.prezzoListino,
          risparmio: p?.saving ?? row.risparmio,
          scontoPercento: p?.discountPercent ?? row.scontoPercento,
          offertaFinoAl: p?.validUntil ?? row.offertaFinoAl,
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
  /** `null` quando l'insegna da' il prodotto ma non il prezzo: vale il link. */
  prezzo: number | null;
  valuta: string;
  link: string;
  verifica: VerifyStatus;
  /**
   * Quando quella pagina e' stata guardata, in ISO.
   *
   * Viaggia dal magazzino o dalla lettura fino alla risposta senza che nessuno
   * la ricalcoli: se la si rigenerasse qui direbbe «adesso» anche di un prezzo
   * preso dal magazzino ieri, che e' il genere di bugia invisibile che
   * un'API di prezzi non si puo' permettere.
   */
  letto?: string;
  /** Quanto era pertinente il candidato: 0 e' il primo della classifica. */
  posto?: number;
  /** Il negozio dell'insegna piu' vicino a chi chiede. NON e' la fonte del prezzo. */
  negozioPiuVicino?: string;
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
    /* UNA RIGA SENZA PREZZO NON E' UN'OFFERTA — ma un posto dove andare si'.
       Per alcune insegne il prezzo e' irraggiungibile da fuori (vive nella
       sessione del loro sito) mentre il prodotto e il suo indirizzo si
       leggono benissimo. Prima queste righe si buttavano, e su un prodotto
       che nessun'altra insegna prezza l'utente restava con NIENTE: ne' un
       numero ne' un negozio.
       Ora passano, ma solo se il link e' stato aperto davvero. Non portano
       prezzo e non entrano in nessun totale — sono l'ultima spiaggia, e
       l'ordinamento piu' sotto le tiene in fondo perche' un'offerta senza
       prezzo non puo' mai essere «la piu' conveniente». */
    const soloLink = r.prezzo == null;
    if (soloLink && (r.verifica === "non-raggiungibile" || !r.link)) continue;
    if (!soloLink && r.verifica === "non-raggiungibile" && !r.linkRicerca) continue;

    const key = (r.prodotto || r.nome).trim().toLowerCase();
    const offer: Offer = {
      negozio: r.negozio,
      immagine: r.immagine,
      linkRicerca: r.linkRicerca,
      ricercaSu: r.ricercaSu,
      nome: r.nome,
      negozioPiuVicino: r.negozioPiuVicino,
      prezzo: r.prezzo,
      valuta: r.valuta,
      // Un link che non si apre non si consegna mai: e' l'unica cosa che
      // l'utente potrebbe toccare, e porterebbe a una pagina inesistente.
      link: r.verifica === "non-raggiungibile" ? "" : r.link,
      verifica: r.verifica,
      letto: r.letto,
      posto: r.posto,
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
    // Le righe senza prezzo restano in fondo: sono un posto dove andare, non
    // un prezzo, e non devono mai finire in cima come «piu' conveniente».
    /* CHI C'ENTRA POCO NON PUO' PRENDERE IL POSTO D'ONORE.
       Ordinando per solo prezzo, un prodotto che c'entra poco ma costa meno
       finiva primo e l'app lo chiamava «il piu' conveniente». Misurato su
       duecento voci: undici volte il prodotto giusto c'era, ma piu' in basso.

         «Butter»          mostrava  Biona butter beans 400g
                           il giusto era in seconda posizione: Anchor salted butter
         «Mozzarella»      mostrava  12 mozzarella sticks 175g
                           il giusto in terza: Galbani mozzarella
         «Mature cheddar»  mostrava  Taylors mature cheddar ONION (patatine)
                           il giusto in seconda: Cathedral city mature cheddar

       Non e' che costassero meno «della stessa cosa»: erano un'altra cosa.

       La cura non e' smettere di ordinare per prezzo — quello resta, ed e' cio'
       che l'utente e' venuto a fare. E' che sul prezzo si compete SOLO fra pari
       pertinenza. Il gruppo di testa e' chi sta entro una posizione dal
       migliore; dentro quel gruppo vince il piu' economico, e chi sta piu'
       indietro resta sotto per quanto costi poco.

       Una posizione di tolleranza e non zero, perche' fra il primo e il secondo
       candidato la differenza e' spesso il nome della marca, e li' il prezzo
       deve poter decidere. */
    const pertinenzaMigliore = Math.min(
      ...offerte.map((o) => (typeof o.posto === "number" ? o.posto : 99)),
    );
    const inTesta = (o: Offer) =>
      (typeof o.posto === "number" ? o.posto : 99) <= pertinenzaMigliore + 1;

    offerte.sort((a, b) => {
      // Le righe senza prezzo restano in fondo: sono un posto dove andare, non
      // un prezzo, e non devono mai finire in cima come «piu' conveniente».
      if (a.prezzo == null) return b.prezzo == null ? 0 : 1;
      if (b.prezzo == null) return -1;
      const ta = inTesta(a), tb = inTesta(b);
      if (ta !== tb) return ta ? -1 : 1;
      return a.prezzo - b.prezzo;
    });

    const first = rows.find((r) => (r.prodotto || r.nome).trim().toLowerCase() === key);
    // La differenza si calcola solo fra prezzi verificati: confrontare un
    // prezzo controllato con uno che non lo e' darebbe un risparmio inventato.
    const sicuri = offerte.filter((o) => o.prezzo != null && o.verifica !== "non-raggiungibile");

    return {
      prodotto: first?.prodotto || first?.nome || key,
      offerte,
      differenza:
        sicuri.length > 1
          ? Math.round(((sicuri[sicuri.length - 1].prezzo ?? 0) - (sicuri[0].prezzo ?? 0)) * 100) / 100
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

    const prezzi = g.offerte.map((o) => o.prezzo).filter((x): x is number => x != null);
    if (!prezzi.length) return g;
    const minimo = Math.min(...prezzi);
    const offerte = g.offerte.filter((o) => {
      // Le righe senza prezzo non sono mai un caso limite: non hanno numero.
      const troppo = o.prezzo != null && o.prezzo > minimo * 6;
      if (troppo) {
        console.info(
          `[plausibilita] tolta alternativa "${o.nome.slice(0, 40)}" da ${o.negozio}: ` +
            `${o.prezzo} contro ${minimo} del più economico`,
        );
      }
      return !troppo;
    });

    const sicuri = offerte.filter((o) => o.prezzo != null && o.verifica !== "non-raggiungibile");
    return {
      ...g,
      offerte,
      differenza:
        sicuri.length > 1
          ? Math.round(((sicuri[sicuri.length - 1].prezzo ?? 0) - (sicuri[0].prezzo ?? 0)) * 100) / 100
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
    // Il prezzo deve esserci: una riga «solo link» non puo' diventare il
    // prezzo migliore, o il totale sommerebbe un buco.
    gruppo.offerte.find((o) => o.prezzo != null && paginaEsiste(o.verifica)) ?? null
  );
}
