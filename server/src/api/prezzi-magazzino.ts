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
export async function salvaPrezzi(righe: PrezzoSalvato[]): Promise<void> {
  if (!isDbConfigured() || righe.length === 0) return;

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

  return nonOltre(
    async () => {
      const c = await collezionePrezzi();
      const soglia = new Date(Date.now() - FRESCHEZZA_MS);
      const [righe, fresche, conPrezzo, freschiConPrezzo] = await Promise.all([
        c.countDocuments(),
        // `t`, non `visto`: nella forma stretta il campo ha un nome di una lettera.
        c.countDocuments({ t: { $gte: soglia } } as never),
        // `p` a null vuol dire «aperta, nessun prezzo in pagina».
        c.countDocuments({ p: { $ne: null } } as never),
        c.countDocuments({ p: { $ne: null }, t: { $gte: soglia } } as never),
      ]);
      return {
        interruttore: statoInterruttore("magazzino-prezzi"),
        attivo: true,
        righe,
        fresche,
        conPrezzo,
        freschiConPrezzo,
      };
    },
    {
      interruttore: "aperto" as const,
      attivo: true,
      righe: -1,
      fresche: -1,
      conPrezzo: -1,
      freschiConPrezzo: -1,
    },
  );
}
