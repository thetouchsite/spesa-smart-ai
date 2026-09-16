/**
 * Da dove viene il catalogo: le insegne, le loro sitemap, quanto rendono.
 *
 * L'ELENCO STA SUL DATABASE. QUI NON CI SONO PIU' DATI.
 * ====================================================
 * Fino al 16 settembre 2026 le insegne erano un array scritto a mano dentro
 * questo file, e il database era una copia che si riempiva per conto suo. Due
 * elenchi che dovrebbero dire la stessa cosa divergono SEMPRE, perche' li
 * aggiornano strumenti diversi in momenti diversi: le rese uno script, i
 * conteggi un altro, le aggiunte una persona.
 *
 * Misurato quel giorno, e sono tre numeri che dovevano essere uno:
 *
 *   il file diceva            1.902.334 prodotti
 *   il magazzino ne serviva   1.716.324
 *   e dentro il file c'era Carrefour Brasile a 80.000 prodotti, di cui il
 *   magazzino non aveva nemmeno il catalogo
 *
 * Adesso la collezione `fonti` e' l'unico posto dove si scrive. Chi misura
 * scrive li'. Questo file sa solo leggerla e tenerla in memoria.
 *
 * SE MONGO NON RISPONDE NON C'E' CATALOGO, E VA SAPUTO
 * ----------------------------------------------------
 * Prima un database muto rendeva l'app lenta: le sitemap si scaricavano al
 * volo. Adesso la rende VUOTA — senza insegne non c'e' niente da scaricare.
 * E' una scelta deliberata: una copia sola non puo' divergere da se stessa, e
 * il prezzo di quella garanzia e' questo.
 *
 * Le note che spiegavano le singole insegne — l'indice di Alcampo, il divieto
 * di Pingo Doce che non c'era, la `/p` di Carrefour Brasile — stanno nel campo
 * `nota` di ogni riga, sul database. Viaggiano col dato invece che con un
 * commento, quindi le vede anche chi il codice non lo apre.
 *
 * ── QUEL CHE SI E' IMPARATO, E VALE PER TUTTE ──────────────────────
 *
 * I NUMERI SONO CONTATI, NON STIMATI
 * `stimati` e' quanti indirizzi quell'insegna pubblica davvero, contati uno
 * per uno scendendo in tutto l'albero delle sitemap. La versione che
 * campionava e moltiplicava sbagliava di molto: Mercator risultava con 336
 * prodotti e ne ha 17.241.
 *
 * LA RESA E' LA COSA PIU' IMPORTANTE
 * `resa` e' la quota di schede che il prezzo lo dichiara. Decide chi provare
 * per primo, e non e' un dettaglio: in Spagna, aggiungendo quattro catene, le
 * voci con prezzo erano SCESE da quattro a una su nove, perche' i candidati si
 * concentravano sulle insegne mute. Un catalogo grande non e' un catalogo
 * utile. E una resa SBAGLIATA e' peggio di una mancante: manda quell'insegna
 * in fondo alla fila per sempre. E' costato Alcampo (86.555 prodotti), Iperal
 * (23.255), Consum (18.385), Naturasi (7.711) e dm Austria.
 *
 * LA GERMANIA NON SI RISOLVE CON I GRANDI
 * REWE, Edeka e Kaufland non ci sono, e non per un nostro difetto. REWE
 * pubblica 95.950 schede e su ognuna scrive «Konkreter Preis abhaengig vom
 * Standort»: senza scegliere un negozio col CAP il prezzo non esiste per
 * nessuno. Edeka e' un consorzio di negozianti indipendenti e i prezzi sono le
 * offerte del singolo mercato; ci respinge con 403 e aggirarlo non si fa.
 * Kaufland uguale. Il tedesco si copre con chi il prezzo lo fa nazionale: i
 * discount e le consegne online. Meno prodotti, ma con un prezzo.
 *
 * CHI NON C'E', E PERCHE'
 * I negozi che non vendono la spesa, tolti guardando cosa hanno dentro:
 * Muller, Rossmann e dm sono drogherie e fra il 6% e il 10% dei loro prodotti
 * sembra cibo; flaschenpost consegna bevande; Weinfreunde e' un'enoteca;
 * Marks & Spencer usciva con 270.094 capi d'abbigliamento. E chi nel
 * `robots.txt` vieta le schede: Tesco, Sainsbury's, Lidl Spagna e Polonia,
 * Ahorramas, Hipercor, Walmart.
 *
 * UN «NO» INVECCHIA
 * Pingo Doce era in quell'elenco ed era sbagliato. Riletto il 16 settembre
 * 2026: nessun `Disallow: /`, vieta soltanto carrello, pagamento e area
 * cliente. Le schede sono consentite, 7 su 10 danno il prezzo, 12.441
 * prodotti tenuti fuori da una nota che nessuno aveva piu' verificato. I
 * negozi cambiano il `robots.txt` senza dirlo, e un divieto dato per scontato
 * costa quanto un'insegna mai trovata.
 */

export interface FonteCatalogo {
  /** Sigla del paese, due lettere. */
  paese: string;
  insegna: string;
  dominio: string;
  /** La radice da cui parte la scansione: puo' essere un indice di sitemap. */
  sitemap: string;
  /**
   * Quota di schede che espongono il prezzo, da 0 a 1.
   *
   * Decide l'ordine in cui si provano le insegne quando una voce della lista
   * ha piu' candidati. A `0` il lavoro notturno non apre nemmeno le sue
   * pagine: non e' una scommessa sfortunata, e' una certezza misurata.
   */
  resa: number;
  /** Indirizzi di prodotto pubblicati, contati. */
  stimati: number;
  /** Quel che si e' imparato su questa insegna. Sta sul database, non qui. */
  nota?: string;
}

/* ══════════════════════════════════════════════════════════════════
   L'ELENCO IN MEMORIA
   ══════════════════════════════════════════════════════════════════ */

let vive: FonteCatalogo[] = [];
let caricate = false;
/** Un caricamento alla volta: dieci richieste all'avvio non fanno dieci letture. */
let inCorso: Promise<number> | null = null;

/**
 * L'elenco in uso.
 *
 * Vuoto finche' nessuno ha chiamato `caricaFontiDalDb`. Chi puo' aspettare usi
 * `assicuraFonti()`, che il caricamento lo fa da solo.
 */
export function tutteLeFonti(): FonteCatalogo[] {
  return vive;
}

/** Quante insegne abbiamo in mano, e se sono mai state lette. */
export function statoFonti(): { caricate: boolean; quante: number } {
  return { caricate, quante: vive.length };
}

/**
 * Rilegge le insegne dal database.
 *
 * Si chiama all'avvio e a ogni giro notturno: una resa corretta stanotte vale
 * gia' stanotte, senza aspettare un rilascio.
 *
 * Le righe con `esclusa` restano fuori. Non sono cancellate — il motivo per
 * cui stanno fuori e' scritto accanto a loro, perche' fra sei mesi qualcuno
 * non rifaccia una serata di prove per riscoprire che CoopShop vuole che uno
 * acceda.
 */
export async function caricaFontiDalDb(): Promise<number> {
  if (inCorso) return inCorso;
  inCorso = (async () => {
    try {
      const { fonti } = await import("../base/db.js");
      const righe = await (await fonti()).find({ esclusa: { $exists: false } }).toArray();
      if (righe.length > 0) {
        vive = righe.map((r) => ({
          paese: r.paese,
          insegna: r.insegna,
          dominio: r.dominio,
          sitemap: r.sitemap,
          resa: r.resa,
          stimati: r.stimati,
          ...(r.nota ? { nota: r.nota } : {}),
        }));
        caricate = true;
      }
      return vive.length;
    } catch {
      return vive.length;
    } finally {
      inCorso = null;
    }
  })();
  return inCorso;
}

/** Come sopra, ma non rilegge se l'elenco c'e' gia'. */
export async function assicuraFonti(): Promise<number> {
  if (caricate) return vive.length;
  return caricaFontiDalDb();
}

/**
 * Le insegne TENUTE FUORI, col motivo.
 *
 * Non entrano nel catalogo e non consumano il tetto per paese, ma non sono
 * cancellate: il motivo per cui stanno fuori e' scritto accanto a loro.
 * Cancellarle vorrebbe dire che fra sei mesi qualcuno le ritrova, le rimette,
 * e rifa' una serata di prove per riscoprire che CoopShop vuole che uno acceda.
 *
 * Misurato togliendo le cinque italiane: la quota di catalogo con prezzo
 * leggibile passa dal 42% al 77%, e la spesa di prova resta 16 voci su 16.
 * Non si perde niente, perche' quelle insegne un prezzo non lo davano a
 * nessuna delle sedici.
 *
 * Vale la pena ricontrollare chi dice «serve accedere»: un negozio che apre la
 * vetrina cambia idea da un giorno all'altro. Chi invece vieta l'API nel
 * `robots.txt` non cambia da solo — li' serve chiedere il permesso, ed e' una
 * decisione commerciale.
 */
export async function fontiEscluse(): Promise<Array<FonteCatalogo & { esclusa: string }>> {
  try {
    const { fonti } = await import("../base/db.js");
    const righe = await (await fonti()).find({ esclusa: { $exists: true } }).toArray();
    return righe.map((r) => ({
      paese: r.paese,
      insegna: r.insegna,
      dominio: r.dominio,
      sitemap: r.sitemap,
      resa: r.resa,
      stimati: r.stimati,
      esclusa: r.esclusa ?? "tenuta fuori",
      ...(r.nota ? { nota: r.nota } : {}),
    }));
  } catch {
    return [];
  }
}

/** Per le prove: svuota l'elenco in memoria. */
export function dimenticaFonti(): void {
  vive = [];
  caricate = false;
}

/** I paesi per cui esiste almeno una fonte. */
export function paesiConCatalogo(): string[] {
  return [...new Set(vive.map((f) => f.paese))].sort();
}

/**
 * Le fonti di un paese, la piu' generosa per prima.
 *
 * L'ordine conta: il tetto per paese taglia la coda, e cosi' taglia le insegne
 * che i prezzi non li danno invece di quelle che li danno.
 */
export function fontiDi(paese: string): FonteCatalogo[] {
  return vive.filter((f) => f.paese === paese.toUpperCase()).sort((a, b) => b.resa - a.resa);
}

/**
 * Le parti successive di una sitemap numerata.
 *
 * Certi negozi spezzano il catalogo in `...-part1.xml`, `...-part2.xml` e non
 * pubblicano un indice che le elenchi: senza questo si caricherebbe un pezzo
 * solo credendo di avere tutto.
 */
export function partiSuccessive(sitemap: string, quante = 12): string[] {
  const m = /^(.*?)(\d+)(\.xml(?:\.gz)?)$/i.exec(sitemap);
  if (!m) return [];
  const [, prefisso, numero, coda] = m;
  const primo = Number(numero);
  return Array.from({ length: quante }, (_, i) => `${prefisso}${primo + i + 1}${coda}`);
}
