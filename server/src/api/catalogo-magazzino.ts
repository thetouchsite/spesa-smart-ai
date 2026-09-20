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
import { cataloghi as collezioneCataloghi, fonti, isDbConfigured } from "../base/db.js";
import { conInterruttore, statoInterruttore } from "../base/interruttore.js";

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

  const dati = impacchetta(voci);

  /* TROPPO GRANDE SI DICE, NON SI TACE — E SI DICE FUORI DALL'INTERRUTTORE.
     Mongo ammette sedici megabyte per documento. Prima, superata la soglia, si
     tornava `undefined` esattamente come nel caso riuscito: chi chiamava
     stampava «800.000 indirizzi salvati» su un nulla, e il catalogo di
     Carrefour Emirati non e' mai esistito pur comparendo nei totali per un
     giorno intero.

     Il controllo sta PRIMA di `nonOltre` perche' quello e' un interruttore di
     protezione: prende qualunque eccezione e restituisce il ripiego, che e'
     giusto per un database che non risponde e sbagliato per un pacchetto
     troppo grosso — quello non e' un guasto passeggero, e' un no definitivo
     che chi chiama deve sentire. Un fallimento travestito da successo e'
     peggio di un errore: nessuno lo va a cercare. */
  if (dati.length > 15_000_000) {
    throw new Error(
      `pacchetto da ${(dati.length / 1048576).toFixed(1)} MB: oltre i 16 MB che Mongo ammette per documento`,
    );
  }

  await nonOltre(
    async () => {
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

/**
 * Cosa c'e' in magazzino: serve allo stato, al pannello e alle prove.
 *
 * TRE MUCCHI, NON UNO.
 * Il conto era uno solo — tutti i cataloghi sommati — e diceva due milioni di
 * link. Ma dentro c'erano tre cose che non si possono sommare senza mentire:
 *
 *   LEGGIBILI  insegne vive. Questo e' il lavoro che si puo' fare.
 *   ESCLUSI    insegne che ci hanno detto di no — il robots.txt di Tigros,
 *              l'accesso obbligatorio di CoopShop. Non sono «da fare piu'
 *              tardi»: sono da non fare mai, e tenerli nel totale fa sembrare
 *              in arretrato una raccolta che e' invece quasi finita.
 *   ORFANI     cataloghi di insegne che nelle fonti non esistono piu'. Il
 *              lettore cerca il catalogo col nome della fonte, quindi a questi
 *              non ci arriva nessuno.
 *
 * Il danno di sommarli non era il numero grosso in se': era che la copertura
 * non poteva salire. L'Italia risultava al 40% mentre il 96% delle schede
 * leggibili era gia' stato letto. Un denominatore sbagliato e' peggio di
 * nessun conto, perche' sembra una misura.
 */
export async function statoCataloghi(): Promise<{
  /** `aperto` = il database non risponde e abbiamo smesso di chiederglielo. */
  interruttore: "chiuso" | "aperto";
  attivo: boolean;
  /** Insegne VIVE con un catalogo. Non i cataloghi in archivio. */
  insegne: number;
  /** Link delle sole insegne vive: quelli su cui la copertura si misura. */
  prodotti: number;
  paesi: string[];
  /** Quel che resta fuori, detto invece che nascosto nel totale. */
  esclusi: { insegne: number; prodotti: number };
  orfani: { insegne: number; prodotti: number };
}> {
  const vuoto = {
    interruttore: "chiuso" as const,
    attivo: false,
    insegne: 0,
    prodotti: 0,
    paesi: [],
    esclusi: { insegne: 0, prodotti: 0 },
    orfani: { insegne: 0, prodotti: 0 },
  };
  if (!isDbConfigured()) return vuoto;

  return nonOltre(
    async () => {
      const elenco = (await (await fonti())
        .find({})
        .project({ insegna: 1, esclusa: 1 })
        .toArray()) as Array<{ insegna?: string; esclusa?: string }>;
      const vive = new Set<string>();
      const escluse = new Set<string>();
      for (const f of elenco) {
        const nome = String(f.insegna ?? "");
        if (f.esclusa) escluse.add(nome);
        else vive.add(nome);
      }

      const righe = await (await collezioneCataloghi())
        .find({}, { projection: { paese: 1, insegna: 1, prodotti: 1 } })
        .toArray();

      let insegne = 0;
      let prodotti = 0;
      const esclusi = { insegne: 0, prodotti: 0 };
      const orfani = { insegne: 0, prodotti: 0 };
      const paesi = new Set<string>();

      for (const r of righe) {
        const nome = String((r as { insegna?: string }).insegna ?? "");
        const quanti = Number((r as { prodotti?: number }).prodotti ?? 0);
        if (vive.has(nome)) {
          insegne++;
          prodotti += quanti;
          /* I paesi si contano sulle sole insegne vive: un paese presente solo
             con una catena esclusa non e' un paese che copriamo. */
          if (r.paese) paesi.add(String(r.paese));
        } else if (escluse.has(nome)) {
          esclusi.insegne++;
          esclusi.prodotti += quanti;
        } else {
          orfani.insegne++;
          orfani.prodotti += quanti;
        }
      }

      return {
        interruttore: statoInterruttore("magazzino-catalogo"),
        attivo: true,
        insegne,
        prodotti,
        paesi: [...paesi].sort(),
        esclusi,
        orfani,
      };
    },
    {
      interruttore: "aperto" as const,
      attivo: true,
      insegne: -1,
      prodotti: -1,
      paesi: [],
      esclusi: { insegne: 0, prodotti: 0 },
      orfani: { insegne: 0, prodotti: 0 },
    },
  );
}
