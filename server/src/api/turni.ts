/**
 * Chi legge quale paese, quando i lettori sono piu' di uno.
 *
 * IL PROBLEMA, DETTO COME SI PRESENTA
 * -----------------------------------
 * Ogni lettore si monta la coda da solo: chiede al magazzino cosa manca o e'
 * scaduto, e apre quelle schede. Finche' il lettore e' uno funziona benissimo.
 * Due lettori accesi insieme sugli stessi paesi si costruiscono pero' quasi la
 * STESSA coda — perche' la domanda che fanno al magazzino e' la stessa — e
 * aprono le stesse pagine due volte.
 *
 * Il magazzino non ne soffre: le scritture sono per impronta dell'indirizzo,
 * la seconda sovrascrive la prima con lo stesso valore. Il danno e' fuori da
 * noi. Ogni pagina doppia e' una richiesta in piu' a un negozio vero, e i
 * negozi non contano le nostre buone intenzioni: contano le richieste al
 * minuto. Il modo piu' rapido di farsi chiudere la porta in faccia e' mandare
 * due lettori sullo stesso sito senza saperlo.
 *
 * LA SOLUZIONE PIU' PICCOLA CHE FUNZIONA
 * --------------------------------------
 * Un biglietto per paese sul database, con una scadenza. Chi vuole leggere la
 * Spagna prende il biglietto «ES»; chi arriva dopo lo trova occupato e prende
 * un altro paese.
 *
 * IL BIGLIETTO E' UN AFFITTO BREVE, NON UNA PROPRIETA'
 * ----------------------------------------------------
 * La prima versione lo faceva scadere alla fine del giro: cinquanta minuti.
 * Sembra prudente e invece e' il guaio classico dei lucchetti — un lettore che
 * muore male, o una finestra chiusa col mouse, lasciano il paese bloccato per
 * quasi un'ora a nome di un processo che non esiste piu'. Si e' visto subito:
 * un PC con sedici paesi per giro, riavviato una volta, ne teneva trentuno.
 *
 * Adesso l'affitto dura pochi minuti e chi lavora lo rinnova mentre lavora.
 * Un lettore vivo lo tiene quanto gli serve; uno morto lo perde in tre minuti,
 * perche' morto non rinnova niente. E' lo stesso principio del battito: la
 * prova di essere vivi si da' continuando a darla, non dichiarandola una volta.
 *
 * PERCHE' IL PAESE E NON L'INSEGNA
 * --------------------------------
 * Perche' e' l'unita' in cui si ragiona gia' dappertutto: i cataloghi sono per
 * paese, la rotazione e' per paese, il pannello mostra i paesi. Bloccare per
 * insegna darebbe una spartizione piu' fine, e servira' il giorno che i
 * lettori saranno dieci; con due o tre macchine il paese basta, e trenta
 * paesi si dividono bene.
 *
 * E SE SONO TUTTI OCCUPATI?
 * -------------------------
 * Non si legge, e si dice. Meglio un lettore che aspetta il suo turno di due
 * che si pestano i piedi: il lavoro totale e' lo stesso, il numero di
 * richieste ai negozi e' la meta'.
 */

import { hostname } from "node:os";
import type { Collection } from "mongodb";
import { getDb, isDbConfigured } from "../base/db.js";

export interface TurnoDoc {
  /** `turno-ES`. Uno per paese: e' l'unicita' che fa da lucchetto. */
  _id: string;
  paese: string;
  macchina: string;
  pid: number;
  preso: Date;
  /** Passata questa, il biglietto vale come libero anche se nessuno lo ha reso. */
  scade: Date;
}

async function turni(): Promise<Collection<TurnoDoc>> {
  return (await getDb()).collection<TurnoDoc>("turni");
}

const CHI = process.env.NOME_MACCHINA ?? hostname();

/**
 * Prende i biglietti che riesce a prendere, in ordine di preferenza.
 *
 * Torna solo i paesi effettivamente presi: chi chiama deve lavorare su quelli,
 * non su quelli che aveva chiesto. Se torna vuoto, tutti erano occupati.
 *
 * SENZA DATABASE NON SI COORDINA NIENTE, E VA BENE
 * Un lettore che gira senza `MONGODB_URI` non ha nemmeno un magazzino dove
 * scrivere: e' una prova, ed e' l'unico caso in cui due lettori non possono
 * darsi fastidio. Si restituisce cio' che e' stato chiesto e si va avanti.
 */
export async function prendiTurni(
  candidati: string[],
  quanti: number,
  minuti: number,
): Promise<string[]> {
  if (!isDbConfigured()) return candidati.slice(0, quanti);

  const c = await turni();
  const ora = new Date();
  const scade = new Date(ora.getTime() + minuti * 60_000);
  const presi: string[] = [];

  for (const paese of candidati) {
    if (presi.length >= quanti) break;
    try {
      /* Il filtro e' il lucchetto: si aggiorna SOLO se il biglietto e' scaduto
         o se e' gia' nostro. Mongo garantisce che fra due processi che ci
         provano insieme ne passi uno solo, perche' `_id` e' unico e
         l'aggiornamento e' atomico. */
      const esito = await c.updateOne(
        {
          _id: `turno-${paese}`,
          $or: [{ scade: { $lt: ora } }, { macchina: CHI, pid: process.pid }],
        },
        { $set: { paese, macchina: CHI, pid: process.pid, preso: ora, scade } },
        { upsert: true },
      );
      if (esito.matchedCount > 0 || esito.upsertedCount > 0) presi.push(paese);
    } catch {
      /* Chiave duplicata: un altro lettore ha preso il biglietto un istante
         prima. Non e' un errore, e' esattamente il lavoro del lucchetto. */
    }
  }
  return presi;
}

/**
 * Allunga i biglietti che sono nostri, di altri `minuti`.
 *
 * Si chiama mentre si lavora. Chi non chiama piu' — perche' e' morto — li
 * perde alla scadenza, ed e' esattamente cio' che deve succedere.
 */
export async function rinnovaTurni(paesi: string[], minuti: number): Promise<void> {
  if (!isDbConfigured() || paesi.length === 0) return;
  try {
    await (
      await turni()
    ).updateMany(
      { _id: { $in: paesi.map((p) => `turno-${p}`) }, macchina: CHI, pid: process.pid },
      { $set: { scade: new Date(Date.now() + minuti * 60_000) } },
    );
  } catch {
    /* Se non riesce, il giro perdera' i paesi alla scadenza e li riprendera'
       al giro dopo. Niente di rotto: solo un po' di lavoro rifatto. */
  }
}

/**
 * Rende i biglietti finito il giro.
 *
 * Si rende solo cio' che e' proprio: senza il filtro su macchina e pid, un
 * lettore che finisce un giro lungo libererebbe i paesi che nel frattempo si
 * e' preso qualcun altro.
 */
export async function rendiTurni(paesi: string[]): Promise<void> {
  if (!isDbConfigured() || paesi.length === 0) return;
  try {
    await (
      await turni()
    ).deleteMany({
      _id: { $in: paesi.map((p) => `turno-${p}`) },
      macchina: CHI,
      pid: process.pid,
    });
  } catch {
    /* Se non riesce, scadono da soli. E' il motivo per cui hanno una scadenza. */
  }
}

/**
 * Chi tiene ogni paese, adesso. Paese → nome della macchina.
 *
 * Serve a chi deve SCEGLIERE prima di partire, non a chi guarda: il pulsante
 * del pannello sceglieva i paesi con la sua rotazione e li passava al giro,
 * che li trovava occupati e non faceva niente. Da fuori il pulsante diceva
 * «Partito» e non partiva nulla — il modo peggiore di fallire, perche' non
 * lascia nemmeno il sospetto che qualcosa sia andato storto.
 */
export async function chiTieneIPaesi(): Promise<Map<string, string>> {
  const mappa = new Map<string, string>();
  for (const t of await turniInCorso()) mappa.set(t.paese, t.macchina);
  return mappa;
}

/** Chi ha in mano cosa, adesso. Per il pannello. */
export async function turniInCorso(): Promise<TurnoDoc[]> {
  if (!isDbConfigured()) return [];
  try {
    return await (await turni()).find({ scade: { $gt: new Date() } }).toArray();
  } catch {
    return [];
  }
}
