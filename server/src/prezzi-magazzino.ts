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

import { isDbConfigured, prezzi as collezionePrezzi } from "./db.js";
import { conInterruttore, statoInterruttore } from "./interruttore.js";
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
}

/**
 * Quanto vale un prezzo salvato.
 *
 * Ventiquattro ore: vedi l'intestazione. Si cambia da `PREZZI_FRESCHI_ORE`
 * senza toccare il codice, perche' e' un compromesso commerciale e non una
 * costante tecnica — il giorno che il cliente vuole prezzi piu' recenti, la
 * leva e' questa e costa solo piu' richieste ai negozi.
 */
export const FRESCHEZZA_MS = Number(process.env.PREZZI_FRESCHI_ORE ?? 24) * 3_600_000;

/**
 * Per quanto si tiene una riga prima di buttarla.
 *
 * Trenta giorni. Non serve a mostrarla — dopo un giorno e' gia' vecchia — ma
 * a non rileggere da capo il catalogo di una citta' visitata di rado, e a
 * sapere che quell'indirizzo esisteva. Mongo cancella da solo alla scadenza.
 */
const CONSERVAZIONE_MS = 30 * 86_400_000;

/** Una lettura o una scrittura non deve tenere in ostaggio una richiesta. */
const ATTESA_MS = 4_000;

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
      const righe = await (await collezionePrezzi())
        .find({ _id: { $in: url }, visto: { $gte: soglia } })
        .toArray();

      const fuori = new Map<string, PrezzoSalvato>();
      for (const r of righe) {
        fuori.set(r._id, {
          url: r._id,
          prezzo: r.prezzo,
          valuta: r.valuta,
          nome: r.nome,
          insegna: r.insegna,
          verifica: r.verifica,
          visto: r.visto,
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
export async function salvaPrezzi(righe: PrezzoSalvato[]): Promise<void> {
  if (!isDbConfigured() || righe.length === 0) return;

  await nonOltre(
    async () => {
      const scade = new Date(Date.now() + CONSERVAZIONE_MS);
      await (await collezionePrezzi()).bulkWrite(
        righe.map((r) => ({
          updateOne: {
            filter: { _id: r.url },
            update: {
              $set: {
                prezzo: r.prezzo,
                valuta: r.valuta,
                nome: r.nome,
                insegna: r.insegna,
                verifica: r.verifica,
                visto: r.visto,
                scadeIl: scade,
              },
            },
            upsert: true,
          },
        })),
        { ordered: false },
      );
      return undefined;
    },
    undefined,
  );
}

/** Quanto e' vecchio un prezzo, in ore: serve a dirlo a chi lo guarda. */
export function oreDa(visto: Date): number {
  return Math.max(0, Math.round((Date.now() - visto.getTime()) / 3_600_000));
}

/** Quante righe ci sono in magazzino: per l'endpoint di stato. */
export async function statoMagazzino(): Promise<{
  /** `aperto` = il database non risponde e abbiamo smesso di chiederglielo. */
  interruttore: "chiuso" | "aperto";
  attivo: boolean;
  righe: number;
  fresche: number;
}> {
  if (!isDbConfigured()) return { interruttore: "chiuso" as const, attivo: false, righe: 0, fresche: 0 };

  return nonOltre(
    async () => {
      const c = await collezionePrezzi();
      const soglia = new Date(Date.now() - FRESCHEZZA_MS);
      const [righe, fresche] = await Promise.all([
        c.countDocuments(),
        c.countDocuments({ visto: { $gte: soglia } }),
      ]);
      return { interruttore: statoInterruttore("magazzino-prezzi"), attivo: true, righe, fresche };
    },
    { interruttore: "aperto" as const, attivo: true, righe: -1, fresche: -1 },
  );
}
