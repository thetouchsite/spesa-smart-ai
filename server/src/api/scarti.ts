/**
 * Le schede che il prezzo non ce l'hanno.
 *
 * IL PROBLEMA, MISURATO
 * ---------------------
 * Il magazzino ricorda solo i successi. Una scheda aperta che non espone il
 * prezzo — pagina cambiata, prodotto esaurito, un negozio che il prezzo lo
 * mostra solo al carrello — non lascia nessuna riga. E siccome la coda si
 * costruisce escludendo cio' che e' gia' in magazzino, quella scheda non
 * risultera' MAI fresca: viene riaperta al giro dopo, e a quello dopo ancora.
 *
 * Misurato in una giornata: dieci milioni e mezzo di pagine aperte, di cui
 * quattro e otto con un prezzo. **Cinque milioni e mezzo di aperture a vuoto**,
 * ripetute all'infinito. Piu' della meta' del lavoro di cinque macchine.
 *
 * COME SI RICORDA UN FALLIMENTO SENZA RIEMPIRE IL DATABASE
 * --------------------------------------------------------
 * Non con una riga per scheda: sarebbero un milione di righe in una collezione
 * che ha gia' lo spazio contato. Con la stessa forma dei cataloghi — un
 * documento per insegna, dentro l'elenco delle impronte, compresso. Un milione
 * e mezzo di impronte da sedici caratteri sono trenta megabyte grezzi e circa
 * venti compressi: ci stanno, e si leggono in un colpo solo quando si monta la
 * coda di quell'insegna.
 *
 * PERCHE' SCADONO
 * ---------------
 * Perche' un negozio cambia. La scheda senza prezzo di oggi puo' averlo fra un
 * mese, e uno scarto per sempre sarebbe un pezzo di catalogo perso senza che
 * nessuno se ne accorga. Trenta giorni: abbastanza da non rileggerla ogni
 * notte, poco abbastanza da non perdere un negozio che ha cambiato sito.
 *
 * E SERVONO ANCHE A RISPONDERE ALLA DOMANDA VERA
 * ----------------------------------------------
 * «Di questo catalogo, quanto e' davvero prezzabile?» Oggi si risponde con la
 * resa campionata su poche schede per insegna. Con gli scarti si risponde con
 * il conto esatto: link, con prezzo, senza prezzo, non ancora provati.
 */

import { gunzipSync, gzipSync } from "node:zlib";
import { Binary, type Collection } from "mongodb";
import { getDb, isDbConfigured } from "../base/db.js";

export interface ScartoDoc {
  /** `PAESE|Insegna`, come i cataloghi. */
  _id: string;
  paese: string;
  insegna: string;
  /** Quante impronte ci sono dentro. Per non decomprimere solo per contarle. */
  quante: number;
  /** Le impronte, una per riga, gzip. */
  dati: Binary;
  aggiornato: Date;
}

async function scarti(): Promise<Collection<ScartoDoc>> {
  return (await getDb()).collection<ScartoDoc>("scarti");
}

/** Dopo quanto uno scarto si dimentica e la scheda si riprova. */
const VALIDI_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Le impronte da saltare per un'insegna.
 *
 * Vuoto quando non c'e' niente o quando l'elenco e' vecchio: in entrambi i
 * casi il lettore riprovera' le schede, che e' il comportamento prudente —
 * meglio rileggere per niente che dare per morto un negozio che e' tornato.
 */
/**
 * L'elenco tenuto a portata di mano, invece di riprenderlo ogni volta.
 *
 * PERCHE' SERVE ADESSO E PRIMA NO.
 * Finche' questi elenchi li leggeva solo il lettore andava benissimo
 * ricaricarli: una volta per insegna a ogni giro, e un giro dura minuti.
 * Adesso li consulta anche l'API, mentre un utente aspetta la sua lista della
 * spesa — e li' interrogare Mongo e decomprimere un paio di megabyte a ogni
 * richiesta costerebbe piu' della pagina che stiamo evitando di aprire, cioe'
 * esattamente il contrario del punto.
 *
 * Cinque minuti: un'impronta appena scritta arriva con quel ritardo al
 * massimo, e il prezzo del ritardo e' una pagina riaperta per niente.
 */
const RICORDA_MS = 5 * 60 * 1000;
const aMente = new Map<string, { quando: number; elenco: Set<string> }>();

export async function scartiDi(insegna: string, paese: string): Promise<Set<string>> {
  if (!isDbConfigured()) return new Set();

  const chiave = `${paese}|${insegna}`;
  const avuto = aMente.get(chiave);
  if (avuto && Date.now() - avuto.quando < RICORDA_MS) return avuto.elenco;

  try {
    const doc = await (await scarti()).findOne({ _id: chiave });
    if (!doc) return new Set();
    if (Date.now() - new Date(doc.aggiornato).getTime() > VALIDI_MS) return new Set();
    const testo = gunzipSync(Buffer.from(doc.dati.buffer)).toString("utf8");
    const elenco = new Set(testo.split("\n").filter(Boolean));
    aMente.set(chiave, { quando: Date.now(), elenco });
    return elenco;
  } catch {
    return new Set();
  }
}

/** Dopo aver scritto impronte nuove, quel che si ricorda non vale piu'. */
export function dimenticaScarti(insegna?: string, paese?: string): void {
  if (insegna && paese) aMente.delete(`${paese}|${insegna}`);
  else aMente.clear();
}

/**
 * Aggiunge impronte all'elenco di un'insegna.
 *
 * Si rilegge, si unisce e si riscrive: un elenco da centomila voci pesa meno
 * di due megabyte compresso, e riscriverlo una volta a giro costa molto meno
 * di tenere centomila righe separate. L'unione e' necessaria perche' due
 * lettori possono lavorare la stessa insegna in momenti diversi.
 */
export async function segnaScarti(
  insegna: string,
  paese: string,
  impronte: string[],
): Promise<number> {
  if (!isDbConfigured() || impronte.length === 0) return 0;
  try {
    const col = await scarti();
    const id = `${paese}|${insegna}`;
    const doc = await col.findOne({ _id: id });

    const tutte = new Set<string>();
    if (doc && Date.now() - new Date(doc.aggiornato).getTime() <= VALIDI_MS) {
      for (const x of gunzipSync(Buffer.from(doc.dati.buffer)).toString("utf8").split("\n")) {
        if (x) tutte.add(x);
      }
    }
    for (const x of impronte) tutte.add(x);

    const testo = [...tutte].join("\n");
    await col.replaceOne(
      { _id: id },
      {
        paese,
        insegna,
        quante: tutte.size,
        dati: new Binary(gzipSync(Buffer.from(testo, "utf8"), { level: 6 })),
        aggiornato: new Date(),
      },
      { upsert: true },
    );
    /* Quel che si teneva a mente adesso e' vecchio di qualche impronta: si
       butta, cosi' la prossima domanda ripesca l'elenco intero. Senza questa
       riga il lettore riaprirebbe per cinque minuti schede che ha appena
       finito di scartare. */
    dimenticaScarti(insegna, paese);
    return tutte.size;
  } catch (err) {
    /* Lo scarto non salvato costa una rilettura, non un guasto: si tace e si
       va avanti. Il lavoro vero e' leggere i prezzi. */
    console.warn("[scarti] non salvati:", err instanceof Error ? err.message : err);
    return 0;
  }
}

/** Quanti scarti per insegna, per i conti della copertura. */
export async function quantiScarti(): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (!isDbConfigured()) return m;
  try {
    const limite = new Date(Date.now() - VALIDI_MS);
    for (const d of await (await scarti())
      .find({ aggiornato: { $gte: limite } })
      .project({ insegna: 1, quante: 1 })
      .toArray()) {
      const x = d as unknown as { insegna: string; quante: number };
      m.set(x.insegna, x.quante ?? 0);
    }
  } catch {
    /* niente conti, nessun danno */
  }
  return m;
}
