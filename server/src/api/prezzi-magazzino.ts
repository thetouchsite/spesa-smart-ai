/**
 * I prezzi gia' letti, tenuti da parte invece di rileggerli ogni volta.
 *
 * IL PROBLEMA
 * -----------
 * Ogni richiesta apriva le sue schede da zero. Madrid, dodici voci: sessanta
 * pagine scaricate. L'utente dopo, con una lista simile, ne scaricava altre
 * sessanta — spesso le stesse. Il prezzo del latte di Alcampo non cambia fra
 * le dieci e le dieci e un minuto, ma noi lo richiedevamo come se cambiasse.
 *
 * DUE COSE INSIEME, NON UNA
 * -------------------------
 * Sembra una questione di velocita' e in parte lo e' — una lettura dal
 * database sta sotto il centesimo di secondo, aprire una pagina ne prende fra
 * uno e otto. Ma la cosa piu' importante e' l'altra:
 *
 *   ogni pagina si apre UNA volta ogni ventiquattro ore, non una volta per
 *   utente.
 *
 * Con cento persone che generano un piano a Madrid, prima erano seimila
 * richieste ai negozi spagnoli; ora sono sessanta. E' il genere di differenza
 * che decide se un negozio ci considera un servizio o un fastidio, ed e' la
 * ragione per cui questo file conta piu' del tempo che fa risparmiare.
 *
 * PERCHE' VENTIQUATTRO ORE, E PERCHE' SI DICE
 * -------------------------------------------
 * Il prezzo salvato e' il prezzo di ieri, e su un'app che promette prezzi veri
 * questo va detto, non nascosto. La spesa cambia listino a settimana, le
 * promozioni piu' spesso: un giorno e' il compromesso fra non tornare a
 * bussare di continuo e non raccontare una cifra vecchia.
 *
 * Ogni riga porta con se' QUANDO e' stata vista, e chi la usa puo' decidere
 * cosa mostrare. Un prezzo senza data e' esattamente il tipo di numero che
 * abbiamo passato giorni a togliere di mezzo.
 *
 * COSA NON C'E' QUI DENTRO
 * ------------------------
 * Non e' un catalogo. Non si precaricano i prezzi dei due milioni e settecento
 * mila prodotti che le sitemap dichiarano: sarebbero due milioni e settecento
 * mila aperture di pagina, giorni di lavoro e un peso sui negozi che nessuno
 * ci ha autorizzato a mettere.
 *
 * Si riempie da solo, con cio' che le persone chiedono davvero. Le liste della
 * spesa pescano da un vocabolario piccolo — latte, pane, uova, pasta, pollo —
 * quindi dopo poche decine di generazioni per citta' il grosso c'e' gia'.
 *
 * SENZA DATABASE FUNZIONA LO STESSO
 * ---------------------------------
 * Se `MONGODB_URI` non c'e', ogni funzione qui dentro risponde «non ho niente»
 * e l'app apre le pagine come prima: piu' lenta, non rotta. Vale anche se il
 * database e' irraggiungibile a meta' richiesta — un magazzino che non
 * risponde non deve far fallire un piano.
 */

import { createHash } from "node:crypto";
import { isDbConfigured, prezzi as collezionePrezzi } from "../base/db.js";
import { conInterruttore, statoInterruttore } from "../base/interruttore.js";
import type { VerifyStatus } from "./price-page.js";

/** Una scheda prodotto gia' letta. */
export interface PrezzoSalvato {
  /** L'indirizzo della scheda: e' anche la chiave. */
  url: string;
  /** Null quando la pagina si apre ma il prezzo non e' nell'HTML. */
  prezzo: number | null;
  valuta: string;
  /** Il nome come lo scrive il negozio. */
  nome: string;
  insegna: string;
  verifica: VerifyStatus;
  /** Quando l'abbiamo letta. Chi mostra il prezzo puo' dirne l'eta'. */
  visto: Date;

  /* ─── QUEL CHE LA PAGINA DICHIARAVA E CHE SI BUTTAVA ───
     `price-page.ts` legge da sempre prezzo pieno, risparmio, percentuale di
     sconto e scadenza dell'offerta: sono dentro `PagePrice` da prima di
     questo lavoro. Solo che il magazzino non aveva dove metterli, e a ogni
     lettura finivano nel niente — mezzo milione di volte al giorno.

     Non e' un campo che mancava: e' un campo che raccoglievamo e gettavamo. */

  /** Prezzo pieno, quando la pagina dichiara una promozione. */
  listino?: number;
  /** Percentuale di sconto, arrotondata. */
  scontoPercento?: number;
  /** Fino a quando l'offerta e' dichiarata valida. */
  promoFino?: Date;
  /** 0 ignota, 1 disponibile, 2 esaurita, 3 scorte limitate. */
  disponibilita?: 0 | 1 | 2 | 3;
}

/**
 * Quanto vale un prezzo salvato. Settantadue ore.
 *
 * ERA VENTIQUATTRO, E QUEL NUMERO SI MANGIAVA IL MAGAZZINO.
 * Un magazzino che si svuota ogni giorno non puo' essere piu' grande di quanto
 * riesci a riempirlo in un giorno. Con 1,8 milioni di indirizzi e dodici
 * pagine al secondo, in ventiquattro ore se ne aprono un milione: il resto era
 * perennemente scaduto, e ogni notte si rifacevano gli stessi prodotti senza
 * mai arrivare agli altri.
 *
 * A settantadue ore il conto diventa 3,6 milioni, cioe' il doppio di quanti ne
 * abbiamo: la freschezza smette di essere il collo di bottiglia e resta solo lo
 * spazio sul database.
 *
 * E' ONESTO? Per la spesa si': il prezzo di base di un litro di latte non
 * cambia in tre giorni. Cambiano le promozioni, che durano una settimana — e
 * una promozione letta tre giorni fa e' ancora valida quattro giorni su sette.
 * Chi mostra il prezzo ha `visto` e puo' dirne l'eta'.
 *
 * Si cambia da `PREZZI_FRESCHI_ORE` senza toccare il codice, perche' e' un
 * compromesso commerciale e non una costante tecnica: il giorno che il cliente
 * vuole prezzi piu' recenti la leva e' questa, e costa piu' richieste ai negozi
 * e un magazzino piu' piccolo.
 */
export const FRESCHEZZA_MS = Number(process.env.PREZZI_FRESCHI_ORE ?? 72) * 3_600_000;

/**
 * Per quanto si tiene una riga prima di buttarla: trenta giorni.
 *
 * NON E' PIU' UN CAMPO. Prima ogni riga portava la sua data di scadenza —
 * trentacinque byte piu' il suo indice, moltiplicati per cinque milioni. Ora
 * la scadenza la calcola Mongo dall'indice TTL su `t`, che e' la data di
 * lettura e serviva comunque: un campo solo fa due mestieri.
 *
 * Trenta giorni non servono a mostrare la riga — dopo tre giorni e' gia'
 * vecchia — ma a sapere che quell'indirizzo esisteva, e a non rileggere da
 * capo il catalogo di una citta' visitata di rado. Il valore sta in
 * `base/db.ts`, dove si dichiara l'indice.
 */

/** Una lettura o una scrittura non deve tenere in ostaggio una richiesta. */
const ATTESA_MS = 4_000;

/* ══════════════════════════════════════════════════════════════════
   LA FORMA STRETTA: impronte al posto degli indirizzi
   ══════════════════════════════════════════════════════════════════ */

/**
 * L'impronta di un indirizzo: sedici caratteri al posto di sessanta byte.
 *
 * Novantasei bit di SHA-1, in base64url. Con cinque milioni di righe la
 * probabilita' di due indirizzi diversi con la stessa impronta e' di circa
 * uno su cento milioni di miliardi — mentre a sessantaquattro bit sarebbe
 * successo, e una collisione qui vuol dire mostrare il prezzo di un prodotto
 * sotto il nome di un altro.
 *
 * NON E' REVERSIBILE, ED E' IL PUNTO. Da una riga non si risale all'indirizzo:
 * chi cerca un prezzo ha gia' l'URL in mano — arriva sempre da un candidato
 * del catalogo — e ne calcola l'impronta. Quel che non si puo' piu' fare e'
 * «elencare i prezzi» senza passare dal catalogo, ed e' un prezzo che vale
 * quattrocento megabyte.
 */
export function improntaUrl(url: string): string {
  return createHash("sha1").update(url).digest("base64url").slice(0, 16);
}

/**
 * Com'e' andata la lettura, in un numero.
 *
 * La parola «verificato» scritta cinque milioni di volte sono centodieci
 * megabyte. Il numero ne costa sei.
 */
const STATO: Record<VerifyStatus, number> = {
  verificato: 0,
  "pagina-ok": 1,
  "non-raggiungibile": 2,
  bloccato: 3,
};
const STATO_INVERSO: VerifyStatus[] = ["verificato", "pagina-ok", "non-raggiungibile", "bloccato"];

/**
 * Il numero di un'insegna dal suo nome.
 *
 * Scrivere «Carrefour Italia» in cinque milioni di righe costa ottanta
 * megabyte; il suo numero ne costa otto. I numeri li assegna il database
 * quando la fonte entra, e non cambiano piu': se cambiassero, tutti i prezzi
 * gia' salvati punterebbero all'insegna sbagliata.
 *
 * Zero vuol dire «non lo so»: capita se un prezzo arriva da un'insegna che
 * nell'elenco non c'e' piu'. La riga si salva lo stesso — il prezzo e' vero —
 * ma non si potra' raggrupparla per paese.
 */
export function numeroInsegnaPubblico(insegna: string): number {
  return numeroInsegna(insegna);
}

function numeroInsegna(insegna: string): number {
  return numeriDelleInsegne.get(insegna) ?? 0;
}

let numeriDelleInsegne = new Map<string, number>();

/** Chi carica le fonti passa di qui, cosi' i numeri sono quelli veri. */
export function ricordaNumeriInsegne(coppie: Array<[string, number]>): void {
  numeriDelleInsegne = new Map(coppie);
}

/** Il nome dell'insegna dal suo numero: serve al cruscotto e al giro continuo. */
export function insegnaDalNumero(n: number): string | undefined {
  for (const [nome, num] of numeriDelleInsegne) if (num === n) return nome;
  return undefined;
}

/**
 * Fa la cosa, ma non oltre il tempo dato: oltre, vale come «niente».
 *
 * E se va a vuoto piu' volte di fila smette di provare per qualche minuto.
 * Senza quella parte, un database irraggiungibile rende l'app PIU' lenta di
 * quanto sarebbe senza database: misurato in produzione, 55 secondi diventati
 * 146 perche' ogni singola interrogazione aspettava il suo timeout a vuoto.
 */
function nonOltre<T>(lavoro: () => Promise<T>, ripiego: T): Promise<T> {
  return conInterruttore("magazzino-prezzi", ATTESA_MS, lavoro, ripiego);
}

/**
 * I prezzi che abbiamo gia' e che valgono ancora, fra quelli chiesti.
 *
 * Restituisce solo le righe fresche: le vecchie non si cancellano — servono a
 * sapere che quell'indirizzo esisteva — ma non si spacciano per attuali.
 */
export async function prezziGiaVisti(url: string[]): Promise<Map<string, PrezzoSalvato>> {
  const vuota = new Map<string, PrezzoSalvato>();
  if (!isDbConfigured() || url.length === 0) return vuota;

  return nonOltre(
    async () => {
      const soglia = new Date(Date.now() - FRESCHEZZA_MS);

      /* Si cercano le IMPRONTE, e si tiene da parte quale indirizzo le ha
         generate: dalla riga non si torna indietro, quindi la corrispondenza
         la deve ricordare chi chiede. */
      const perImpronta = new Map<string, string>();
      for (const u of url) perImpronta.set(improntaUrl(u), u);

      const righe = await (await collezionePrezzi())
        .find({ _id: { $in: [...perImpronta.keys()] }, t: { $gte: soglia } })
        .toArray();

      const fuori = new Map<string, PrezzoSalvato>();
      for (const r of righe) {
        const suo = perImpronta.get(r._id);
        if (!suo) continue;
        fuori.set(suo, {
          url: suo,
          prezzo: r.p,
          valuta: r.v,
          /* Nome e insegna non stanno piu' qui: chi chiama li ha gia' dal
             catalogo, ed erano quarantadue byte per riga scritti due volte. */
          nome: "",
          insegna: "",
          verifica: STATO_INVERSO[r.s] ?? "pagina-ok",
          visto: r.t,
        });
      }
      return fuori;
    },
    vuota,
  );
}

/**
 * Mette da parte quel che si e' appena letto.
 *
 * Si scrive anche quando il prezzo e' `null`: sapere che quella pagina si apre
 * ma non dichiara il prezzo vale quanto sapere il prezzo — evita di tornare a
 * chiederlo domani per scoprire di nuovo la stessa cosa.
 *
 * Non si aspetta l'esito: chi chiama ha gia' i suoi dati in mano e l'utente
 * non deve attendere una scrittura che non cambia cio' che vedra'.
 */
/**
 * Vero se l'ultimo salvataggio e' arrivato davvero sul database.
 *
 * PERCHE' NON BASTA CHE `salvaPrezzi` NON ESPLODA
 * -----------------------------------------------
 * Perche' non esplode mai. Sta dentro l'interruttore, che per progetto
 * inghiotte l'eccezione e restituisce il ripiego: e' quel che salva l'API
 * quando il database fa i capricci, ed e' anche quel che rende un guasto
 * invisibile a chi scrive.
 *
 * Il 22 settembre 2026 un intoppo del DNS ha rotto la connessione dei lettori
 * — `getaddrinfo ENOTFOUND` sull'host di Atlas — e loro hanno continuato per
 * un'ora: aprivano pagine, trovavano prezzi, riportavano rese del 92% e del
 * 98%, e non scrivevano una riga. Dal pannello sembravano sani; un processo
 * nuovo si collegava benissimo, quindi nemmeno guardando il database si
 * capiva. Me ne sono accorto solo perche' tredici pagine al secondo con quelle
 * rese devono dare dieci prodotti al secondo, e ne davano uno.
 *
 * Chi legge questo valore puo' fare l'unica cosa sensata: fermarsi e dirlo.
 * Un lettore fermo si vede; un lettore che finge di lavorare no.
 */
let ultimoSalvataggioRiuscito = true;

export function salvataggiArrivano(): boolean {
  return ultimoSalvataggioRiuscito;
}

/**
 * Dalla lettura della pagina ai campi da salvare.
 *
 * STA IN UN POSTO SOLO PERCHE' I POSTI CHE SALVANO SONO TRE.
 * Il giro continuo, il giro notturno e la strada dei prezzi a richiesta
 * costruiscono tutti e tre una riga da un `VerifiedPrice`. Scritta tre volte,
 * questa conversione diverge: uno aggiunge un campo, gli altri due no, e
 * l'insegna che passa da quella strada perde meta' della scheda senza che
 * nessuno se ne accorga.
 */
export function campiDallaPagina(v: {
  page?: { list?: number; discountPercent?: number; validUntil?: string };
  scheda?: { disponibilita?: 0 | 1 | 2 | 3 };
}): Pick<PrezzoSalvato, "listino" | "scontoPercento" | "promoFino" | "disponibilita"> {
  const fuori: Pick<PrezzoSalvato, "listino" | "scontoPercento" | "promoFino" | "disponibilita"> = {};
  if (typeof v.page?.list === "number") fuori.listino = v.page.list;
  if (typeof v.page?.discountPercent === "number") fuori.scontoPercento = v.page.discountPercent;
  if (v.page?.validUntil) {
    /* La scadenza arriva come testo dai dati strutturati, e a volte e' un
       giorno solo (`2026-09-30`) e a volte un istante intero. `Date` regge
       tutte e due; quel che non regge lo scartiamo invece di salvare una data
       inventata. */
    const q = new Date(v.page.validUntil);
    if (!Number.isNaN(q.getTime())) fuori.promoFino = q;
  }
  if (v.scheda?.disponibilita !== undefined) fuori.disponibilita = v.scheda.disponibilita;
  return fuori;
}

/**
 * I campi che cambiano a ogni lettura, quando la pagina li dichiara.
 *
 * SI SCRIVONO SOLO QUANDO CI SONO, E NON SI CANCELLANO MAI.
 * Un `$set` con `undefined` scrive `null`, e `null` vorrebbe dire «letto, e
 * non c'era»: e' un'affermazione diversa da «non osservato». Su una scheda
 * che oggi dichiara la promozione e domani no, la differenza fra le due e'
 * tutto quel che distingue «l'offerta e' finita» da «non l'abbiamo vista».
 *
 * Quindi il campo assente resta assente. Chi legge trova `undefined` e sa che
 * non sa — che e' la risposta onesta.
 *
 * QUI NON C'E' L'IMPRONTA `sh`, E NON E' UNA DIMENTICANZA.
 * L'impronta serve a capire se i campi descrittivi sono cambiati, per non
 * riscrivere `schede` a ogni lettura. Ma scriverla ORA, con `schede` ancora
 * spenta, sarebbe una trappola: il giorno che si accende, l'impronta
 * combacerebbe gia' e il codice salterebbe la scrittura. `schede` resterebbe
 * vuota per sempre, senza dare nessun errore.
 *
 * `sh` si accende insieme a `schede`, mai prima.
 */
function volatili(r: PrezzoSalvato): Record<string, unknown> {
  const campi: Record<string, unknown> = {};
  if (typeof r.listino === "number") campi.l = r.listino;
  if (typeof r.scontoPercento === "number") campi.sc = r.scontoPercento;
  if (r.promoFino instanceof Date && !Number.isNaN(r.promoFino.getTime())) campi.pf = r.promoFino;
  if (r.disponibilita !== undefined) campi.av = r.disponibilita;
  return campi;
}

export async function salvaPrezzi(righe: PrezzoSalvato[]): Promise<void> {
  if (!isDbConfigured() || righe.length === 0) return;

  /* La sentinella: se il corpo arriva in fondo, il database ha risposto. Se
     l'interruttore lo salta o l'eccezione lo interrompe, resta a false. */
  let arrivato = false;

  await nonOltre(
    async () => {
      await (await collezionePrezzi()).bulkWrite(
        righe.map((r) => ({
          updateOne: {
            filter: { _id: improntaUrl(r.url) },
            update: {
              $set: {
                p: r.prezzo,
                v: r.valuta,
                s: STATO[r.verifica] ?? 1,
                t: r.visto,
                c: numeroInsegna(r.insegna),
                ...volatili(r),
              },
            },
            upsert: true,
          },
        })),
        { ordered: false },
      );
      arrivato = true;
      return undefined;
    },
    undefined,
  );

  ultimoSalvataggioRiuscito = arrivato;
}

/** Quanto e' vecchio un prezzo, in ore: serve a dirlo a chi lo guarda. */
export function oreDa(visto: Date): number {
  return Math.max(0, Math.round((Date.now() - visto.getTime()) / 3_600_000));
}

/**
 * Cosa c'e' in magazzino.
 *
 * UNA RIGA NON E' UN PREZZO, E CHIAMARLA COSI' E' COSTATO UNA DOMANDA.
 * Il magazzino registra tutte le schede che il lettore ha aperto, comprese
 * quelle in cui il prezzo NON c'era: e' apposta, perche' e' cosi' che sa di
 * non doverle riaprire domani. Ma allora `righe` e `prezzi` sono due cose
 * diverse, e il pannello le mostrava come una sola — «prezzi freschi 769.351»
 * quando i prezzi veri erano meno di cinquecentomila.
 *
 * Un numero gonfio del cinquanta per cento su cui si decide quando comprare
 * un server non e' un dettaglio di etichetta.
 */
export async function statoMagazzino(): Promise<{
  /** `aperto` = il database non risponde e abbiamo smesso di chiederglielo. */
  interruttore: "chiuso" | "aperto";
  attivo: boolean;
  /** Tutte le schede provate, col prezzo e senza. */
  righe: number;
  /** Quelle provate di recente, col prezzo e senza. */
  fresche: number;
  /** Quelle che un prezzo ce l'hanno davvero. */
  conPrezzo: number;
  /** Quelle che un prezzo ce l'hanno E sono ancora valide: il numero vendibile. */
  freschiConPrezzo: number;
  /** C'e' solo quando i numeri sono vecchi: quando sono stati veri. */
  quando?: string;
}> {
  const vuoto = {
    interruttore: "chiuso" as const,
    attivo: false,
    righe: 0,
    fresche: 0,
    conPrezzo: 0,
    freschiConPrezzo: 0,
  };
  if (!isDbConfigured()) return vuoto;

  const fresco = await nonOltre(
    async () => {
      const c = await collezionePrezzi();
      const soglia = new Date(Date.now() - FRESCHEZZA_MS);

      /* SI CONTA IL CONTRARIO, ED E' QUATTRO VOLTE PIU' VELOCE.
         `{ p: { $ne: null } }` non puo' usare nessun indice: Mongo deve
         guardare tutte e 1,8 milioni di righe per scoprire che 1.784.008
         hanno una cifra. Misurato il 23 settembre: 1.016 ms per `conPrezzo`
         e 2.772 ms per `freschiConPrezzo`, su quattro secondi in tutto.

         Le righe SENZA prezzo pero' sono 12.388 — lo 0,7%. Contare quelle e
         sottrarle da' lo stesso identico numero leggendone centocinquanta
         volte di meno, e c'e' un indice parziale apposta (vedi `db.ts`) che
         indicizza solo loro: qualche decina di kilobyte.

         E per il totale c'e' `estimatedDocumentCount`, che legge i metadati
         della collezione invece di contare: 33 ms contro 573, stessa
         risposta. Si chiama «stimato» perche' dopo un arresto brusco puo'
         sbagliare di qualche riga — su un numero che sta in un riquadro a
         fianco di «1,8 milioni», non e' una differenza che qualcuno vede. */
      const [righe, fresche, senzaPrezzo, frescheSenzaPrezzo] = await Promise.all([
        c.estimatedDocumentCount(),
        // `t`, non `visto`: nella forma stretta il campo ha un nome di una lettera.
        c.countDocuments({ t: { $gte: soglia } } as never),
        // `p` a null vuol dire «aperta, nessun prezzo in pagina».
        c.countDocuments({ p: null } as never),
        c.countDocuments({ p: null, t: { $gte: soglia } } as never),
      ]);
      return {
        interruttore: statoInterruttore("magazzino-prezzi"),
        attivo: true,
        righe,
        fresche,
        conPrezzo: righe - senzaPrezzo,
        freschiConPrezzo: fresche - frescheSenzaPrezzo,
      };
    },
    null,
  );

  if (fresco) {
    ultimoBuono = { ...fresco, quando: new Date().toISOString() };
    return fresco;
  }

  /* IL RIPIEGO NON E' PIU' `-1`.
     Lo era, e il pannello lo mostrava tal quale: «prodotti con prezzo -1», in
     rosso. Vuol dire «non ho fatto in tempo a contare» e si legge «i dati sono
     spariti» — l'ha letto cosi' chi il pannello l'ha scritto, alle undici di
     mattina del 23 settembre, con 1.796.553 righe tranquillamente al loro
     posto.

     Un numero inventato sarebbe peggio del silenzio. Un numero VERO DI CINQUE
     MINUTI FA, con scritto di quando e', e' meglio di tutti e due: si legge, si
     sa quanto fidarsi, e nessuno va a cercare un guasto che non c'e'. */
  if (ultimoBuono) return { ...ultimoBuono, interruttore: "aperto" as const };

  return { ...vuoto, attivo: true, interruttore: "aperto" as const };
}

/** L'ultima lettura riuscita, per quando la prossima non fa in tempo. */
let ultimoBuono: {
  interruttore: "chiuso" | "aperto";
  attivo: boolean;
  righe: number;
  fresche: number;
  conPrezzo: number;
  freschiConPrezzo: number;
  quando: string;
} | null = null;

/**
 * Quanti dei campi nuovi stanno arrivando davvero.
 *
 * PERCHE' SI GUARDANO LE RIGHE RECENTI E NON TUTTE
 * ------------------------------------------------
 * Il magazzino ha 1,8 milioni di righe scritte da un codice che quei campi non
 * li conosceva. La copertura sul totale restera' vicina a zero per settimane
 * anche se tutto funziona alla perfezione: e' aritmetica, non diagnosi — le
 * righe vecchie si rinnovano al ritmo del ciclo di freschezza.
 *
 * Il numero che dice qualcosa e' la copertura sulle righe lette DA POCO. Se
 * quella e' zero mentre i lettori girano, i lettori hanno il codice vecchio in
 * memoria: un `git pull` non aggiorna un processo gia' acceso, e questa e'
 * l'unica spia che lo dice senza che nessuno debba sospettarlo.
 *
 * COSTA POCO PERCHE' GUARDA POCO
 * ------------------------------
 * Tutte le domande sono limitate alle ultime ore e passano dall'indice su `t`.
 * Non c'e' nessuna scansione dell'intero magazzino — quella e' l'errore che ha
 * reso `-1` il pannello per mezza mattinata.
 */
export async function coperturaCampi(ore = 24): Promise<{
  ore: number;
  righe: number;
  campi: Array<{ campo: string; nome: string; quante: number }>;
} | null> {
  if (!isDbConfigured()) return null;
  return nonOltre(
    async () => {
      const c = await collezionePrezzi();
      const da = new Date(Date.now() - ore * 3_600_000);
      const quanti = (campo: string) =>
        c.countDocuments({ t: { $gte: da }, [campo]: { $exists: true } } as never);
      const [righe, av, l, sc, pf, vd] = await Promise.all([
        c.countDocuments({ t: { $gte: da } } as never),
        quanti("av"),
        quanti("l"),
        quanti("sc"),
        quanti("pf"),
        quanti("vd"),
      ]);
      return {
        ore,
        righe,
        campi: [
          { campo: "av", nome: "disponibilita'", quante: av },
          { campo: "l", nome: "prezzo pieno", quante: l },
          { campo: "sc", nome: "sconto", quante: sc },
          { campo: "pf", nome: "scadenza promo", quante: pf },
          { campo: "vd", nome: "valuta dedotta", quante: vd },
        ],
      };
    },
    null,
  );
}
