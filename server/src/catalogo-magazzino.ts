/**
 * Il catalogo su database, invece che riscaricato dai negozi a ogni avvio.
 *
 * IL PROBLEMA
 * -----------
 * Il catalogo di un paese si costruisce scaricando le sitemap delle sue
 * insegne: la Spagna sono 197.721 prodotti da otto negozi, e costa tredici
 * secondi di rete piu' qualche decina di megabyte.
 *
 * Finche' il processo vive, si paga una volta. Ma sul piano gratuito di Render
 * la macchina si spegne dopo quindici minuti di silenzio, e al risveglio la
 * memoria e' vuota: si riscarica tutto. In pratica quasi ogni utente paga quei
 * secondi, e i negozi ricevono quelle richieste, per un catalogo che nel
 * frattempo non e' cambiato di una riga.
 *
 * COSA CAMBIA
 * -----------
 *   prima   avvio → venti sitemap dai negozi → 13-35 secondi
 *   ora     avvio → un documento dal database → due o tre
 *
 * E i negozi li interroga solo il lavoro notturno, una volta al giorno,
 * invece che ogni riavvio della macchina.
 *
 * PERCHE' COMPRESSO, E UN DOCUMENTO PER INSEGNA
 * ---------------------------------------------
 * Tre milioni di prodotti come tre milioni di documenti sono circa 867 MB con
 * gli indici, e il piano gratuito di Atlas ne da' 512: non ci sta. Gli stessi
 * dati compressi, un documento per insegna, sono 55 MB — un sedicesimo, con
 * dieci volte il margine.
 *
 * Un documento per insegna e non per paese perche' Mongo si ferma a 16 MB per
 * documento: la piu' grossa che abbiamo sta a 8, comoda; un paese intero in un
 * documento solo sfonderebbe.
 *
 * Non si indicizza niente del contenuto: qui dentro non si cerca. Si legge il
 * pacchetto, si scompatta, e l'indice per parole lo costruisce `catalogo.ts`
 * in memoria come ha sempre fatto — quello e' veloce e non e' mai stato il
 * problema.
 *
 * SENZA DATABASE FUNZIONA LO STESSO
 * ---------------------------------
 * Se Mongo non c'e' o non risponde, si torna a scaricare le sitemap: piu'
 * lento, non rotto. La stessa regola del magazzino dei prezzi.
 */

import { gunzipSync, gzipSync } from "node:zlib";
import { Binary } from "mongodb";
import { cataloghi as collezioneCataloghi, isDbConfigured } from "./db.js";
import { conInterruttore, statoInterruttore } from "./interruttore.js";

/** Una voce come sta nel pacchetto: indirizzo e nome, niente altro. */
export interface VoceSalvata {
  url: string;
  nome: string;
}

/**
 * Quanto vale un catalogo salvato.
 *
 * Trenta ore, cioe' un po' piu' del giro notturno: se il lavoro di stanotte
 * salta — la macchina dormiva, la rete e' caduta — quello di ieri vale ancora
 * e nessuno se ne accorge. Piu' stretto di cosi' e un ritardo diventa un
 * disservizio; piu' largo e si rischia di servire un catalogo di ieri l'altro.
 *
 * Qui dentro non ci sono prezzi, quindi invecchia piano: cambia solo quando un
 * negozio aggiunge o toglie un prodotto.
 */
const VALIDITA_MS = 30 * 3_600_000;

/** Una lettura non deve tenere in ostaggio una richiesta. */
const ATTESA_MS = 8_000;

/** Come sopra: vedi `interruttore.ts` per il perche' non basta un timeout. */
function nonOltre<T>(lavoro: () => Promise<T>, ripiego: T): Promise<T> {
  return conInterruttore("magazzino-catalogo", ATTESA_MS, lavoro, ripiego);
}

/**
 * Il pacchetto: una riga per prodotto, indirizzo e nome separati da tabulazione.
 *
 * Non JSON. Su duecentomila voci le virgolette e le parentesi di JSON sono
 * megabyte di punteggiatura, e qui non serve niente che un separatore non
 * faccia gia': i campi sono due e nessuno dei due contiene tabulazioni.
 */
function impacchetta(voci: VoceSalvata[]): Buffer {
  return gzipSync(voci.map((v) => `${v.url}\t${v.nome}`).join("\n"), { level: 6 });
}

function scompatta(dati: Buffer): VoceSalvata[] {
  const fuori: VoceSalvata[] = [];
  for (const riga of gunzipSync(dati).toString("utf8").split("\n")) {
    const taglio = riga.indexOf("\t");
    if (taglio > 0) fuori.push({ url: riga.slice(0, taglio), nome: riga.slice(taglio + 1) });
  }
  return fuori;
}

/**
 * Il catalogo salvato di un'insegna, se c'e' ed e' ancora valido.
 *
 * Restituisce `null` quando manca o e' vecchio: chi chiama scarica le sitemap
 * come prima e poi salva il risultato.
 */
export async function catalogoSalvato(
  paese: string,
  insegna: string,
): Promise<VoceSalvata[] | null> {
  if (!isDbConfigured()) return null;

  return nonOltre(
    async () => {
      const doc = await (await collezioneCataloghi()).findOne({
        _id: `${paese}|${insegna}`,
      });
      if (!doc) return null;
      if (Date.now() - doc.aggiornato.getTime() > VALIDITA_MS) return null;
      try {
        return scompatta(Buffer.from(doc.dati.buffer));
      } catch {
        // Pacchetto rovinato: meglio riscaricare che servire spazzatura.
        return null;
      }
    },
    null,
  );
}

/** Mette da parte il catalogo di un'insegna appena scaricato. */
export async function salvaCatalogo(
  paese: string,
  insegna: string,
  voci: VoceSalvata[],
): Promise<void> {
  if (!isDbConfigured() || voci.length === 0) return;

  await nonOltre(
    async () => {
      const dati = impacchetta(voci);
      // Sedici megabyte e' il tetto di Mongo per documento: se un'insegna lo
      // sfonda si lascia stare invece di far fallire tutto il salvataggio.
      if (dati.length > 15_000_000) {
        console.warn(
          `[catalogo] ${paese} ${insegna}: pacchetto da ${(dati.length / 1048576).toFixed(1)} MB, ` +
            `troppo per un documento: non lo salvo`,
        );
        return undefined;
      }
      await (await collezioneCataloghi()).updateOne(
        { _id: `${paese}|${insegna}` },
        {
          $set: {
            paese,
            insegna,
            prodotti: voci.length,
            // Il driver vuole un Binary, non un Buffer nudo.
            dati: new Binary(dati),
            aggiornato: new Date(),
          },
        },
        { upsert: true },
      );
      return undefined;
    },
    undefined,
  );
}

/** Cosa c'e' in magazzino, per paese: serve allo stato e alle prove. */
export async function statoCataloghi(): Promise<{
  /** `aperto` = il database non risponde e abbiamo smesso di chiederglielo. */
  interruttore: "chiuso" | "aperto";
  attivo: boolean;
  insegne: number;
  prodotti: number;
  paesi: string[];
}> {
  if (!isDbConfigured()) return { interruttore: "chiuso" as const, attivo: false, insegne: 0, prodotti: 0, paesi: [] };

  return nonOltre(
    async () => {
      const righe = await (await collezioneCataloghi())
        .find({}, { projection: { paese: 1, prodotti: 1 } })
        .toArray();
      return {
        interruttore: statoInterruttore("magazzino-catalogo"),
        attivo: true,
        insegne: righe.length,
        prodotti: righe.reduce((n, r) => n + (r.prodotti ?? 0), 0),
        paesi: [...new Set(righe.map((r) => r.paese))].sort(),
      };
    },
    { interruttore: "aperto" as const, attivo: true, insegne: -1, prodotti: -1, paesi: [] },
  );
}
