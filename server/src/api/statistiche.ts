/**
 * I conti pesanti del pannello: paese per paese, e quanto spazio resta.
 *
 * PERCHE' STANNO DA SOLI E NON DENTRO `pannello.ts`
 * -------------------------------------------------
 * Il pannello si rinfresca ogni cinque secondi. Le cose che mostra finora —
 * chi sta lavorando, quante righe ci sono — sono conteggi che Mongo risolve
 * con un indice e costano niente.
 *
 * Questi due no. Il conto per paese raggruppa duecentomila righe di prezzo, e
 * lo spazio interroga le statistiche di ogni collezione. Farli ogni cinque
 * secondi vorrebbe dire prendere a martellate il database per aggiornare dei
 * numeri che in cinque secondi non si muovono di un pixel.
 *
 * Quindi si calcolano una volta al minuto e si tengono da parte. Il pannello
 * dice quando sono stati presi, cosi' chi guarda sa cosa sta guardando.
 *
 * NIENTE CHE LEGGA I CATALOGHI PER INTERO
 * ---------------------------------------
 * Un catalogo e' un blocco compresso da quasi un megabyte per insegna: leggerli
 * tutti sono centocinquanta megabyte a botta. Il numero di prodotti sta pero'
 * anche in un campo a parte, `prodotti`, e con l'indice giusto Mongo risponde
 * senza toccare i blocchi. Per questo l'indice `{ paese: 1, prodotti: 1 }`
 * esiste: non serve a cercare niente, serve a non leggere niente.
 */

import { cataloghi, fonti, getDb, isDbConfigured, prezzi } from "../base/db.js";
import { FRESCHEZZA_MS } from "./prezzi-magazzino.js";

/** Quanto si tengono buoni i conti pesanti prima di rifarli. */
const VALIDI_MS = 60_000;

/** Il tetto del piano gratuito di Atlas. Da cambiare il giorno che si cresce. */
const TETTO_MB = Number(process.env.MONGO_TETTO_MB ?? 512);

export interface RigaPaese {
  paese: string;
  insegne: number;
  link: number;
  prezzi: number;
  /** Quota di link che hanno un prezzo fresco, da 0 a 1. */
  copertura: number;
}

/**
 * Una riga per insegna.
 *
 * PERCHE' NON BASTAVA IL PAESE
 * ----------------------------
 * «L'Italia sta al 26%» e' un numero che non dice cosa fare. L'Italia sono
 * ventotto insegne, e quel 26 e' la media fra una che pubblica tutto e una
 * che non pubblica niente: il lavoro da fare sta sempre in una di quelle due,
 * mai nella media. Guardando per insegna si vede quale vale la pena spingere
 * e quale e' un buco che non si chiudera' mai.
 */
export interface RigaInsegna {
  insegna: string;
  paese: string;
  link: number;
  prezzi: number;
  /** Quota di link con un prezzo fresco, da 0 a 1. */
  copertura: number;
}

export interface Spazio {
  datiMb: number;
  indiciMb: number;
  totaleMb: number;
  tettoMb: number;
  /** Quanto del piano e' pieno, da 0 a 1. */
  pieno: number;
  /** Quanti prezzi ci stanno ancora, al peso misurato di oggi. */
  prezziCheCiStanno: number;
  bytePerPrezzo: number;
}

let cache: {
  quando: number;
  paesi: RigaPaese[];
  insegne: RigaInsegna[];
  spazio: Spazio | null;
} | null = null;
let inCorso: Promise<void> | null = null;

export function contiPesanti(): {
  paesi: RigaPaese[];
  insegne: RigaInsegna[];
  spazio: Spazio | null;
  presiIl: string | null;
} {
  /* Si ricalcola in sottofondo e si risponde con quel che c'e'. Il pannello non
     deve MAI aspettare: se il conto ci mette tre secondi, li aspetterebbe chi
     ha aperto la pagina, ogni volta. */
  if (!cache || Date.now() - cache.quando > VALIDI_MS) void ricalcola();
  return {
    paesi: cache?.paesi ?? [],
    insegne: cache?.insegne ?? [],
    spazio: cache?.spazio ?? null,
    presiIl: cache ? new Date(cache.quando).toISOString() : null,
  };
}

async function ricalcola(): Promise<void> {
  if (inCorso) return inCorso;
  inCorso = (async () => {
    try {
      if (!isDbConfigured()) return;
      const [conti, spazio] = await Promise.all([contaPerPaese(), misuraSpazio()]);
      cache = { quando: Date.now(), paesi: conti.paesi, insegne: conti.insegne, spazio };
    } catch {
      /* Un conto che non riesce lascia in piedi quello di prima, che e' vecchio
         di un minuto: meglio di una pagina mezza vuota. */
    } finally {
      inCorso = null;
    }
  })();
  return inCorso;
}

async function contaPerPaese(): Promise<{ paesi: RigaPaese[]; insegne: RigaInsegna[] }> {
  /* I link: dal campo `prodotti`, non dai blocchi compressi. */
  /* SI CONTANO SOLO LE INSEGNE CHE QUALCUNO LEGGE.
     Il conto comprendeva tutti i cataloghi, anche quelli delle insegne
     escluse — CoopShop vuole l'accesso per mostrare il prezzo, Tigros lo vieta
     nel robots.txt — e quelli rimasti orfani, di insegne che nelle fonti non
     esistono piu'. Seicentomila link su due milioni e trecentomila: un quarto
     del catalogo che nessuno leggera' mai.

     Il danno non e' il numero grosso: e' che la copertura non poteva salire.
     L'Italia risultava ferma al 40% mentre il 96% delle schede leggibili era
     gia' stato letto, e chi guardava il pannello concludeva che la raccolta
     non andava avanti. Un denominatore sbagliato e' peggio di nessun conto,
     perche' sembra una misura. */
  const attive = new Set<string>();
  for (const f of await (await fonti()).find({ esclusa: { $exists: false } }).project({ insegna: 1 }).toArray()) {
    attive.add(String((f as { insegna?: string }).insegna ?? ""));
  }

  const link = new Map<string, { link: number; insegne: number }>();
  /* Gli stessi documenti, letti una volta sola, servono a due conti: il totale
     del paese e il dettaglio per insegna. Farne due passate vorrebbe dire due
     letture della stessa collezione per avere gli stessi numeri sommati in due
     modi diversi. */
  const linkInsegna = new Map<string, { insegna: string; paese: string; link: number }>();
  for (const c of await (await cataloghi())
    .find({}, { projection: { paese: 1, insegna: 1, prodotti: 1 } })
    .toArray()) {
    const paese = String((c as { paese?: string }).paese ?? "");
    const insegna = String((c as { insegna?: string }).insegna ?? "");
    const quanti = Number((c as { prodotti?: number }).prodotti ?? 0);
    if (!paese) continue;
    if (!attive.has(insegna)) continue;
    const g = link.get(paese) ?? { link: 0, insegne: 0 };
    link.set(paese, { link: g.link + quanti, insegne: g.insegne + 1 });
    if (insegna) linkInsegna.set(insegna, { insegna, paese, link: quanti });
  }

  /* I prezzi sono contati per NUMERO di insegna, che e' quel che la riga porta:
     il nome non c'e' piu', per non scriverlo cinque milioni di volte. La
     corrispondenza numero → paese la tiene l'elenco delle fonti. */
  const paeseDelNumero = new Map<number, string>();
  const insegnaDelNumero = new Map<number, string>();
  for (const f of await (await fonti()).find({}).project({ id: 1, paese: 1, insegna: 1 }).toArray()) {
    const id = (f as { id?: number }).id;
    if (typeof id !== "number") continue;
    paeseDelNumero.set(id, String((f as { paese: string }).paese));
    insegnaDelNumero.set(id, String((f as { insegna?: string }).insegna ?? ""));
  }

  const soglia = new Date(Date.now() - FRESCHEZZA_MS);
  const prezziPerPaese = new Map<string, number>();
  const prezziPerInsegna = new Map<string, number>();
  for (const r of await (await prezzi())
    .aggregate([{ $match: { t: { $gte: soglia } } }, { $group: { _id: "$c", n: { $sum: 1 } } }])
    .toArray()) {
    const ins = insegnaDelNumero.get(Number(r._id));
    if (ins) prezziPerInsegna.set(ins, (prezziPerInsegna.get(ins) ?? 0) + (r.n ?? 0));
    const p = paeseDelNumero.get(Number(r._id));
    /* Un numero che l'elenco non conosce e' di un'insegna tolta dopo: le sue
       righe scadranno da sole. Non si buttano in un paese a caso. */
    if (!p) continue;
    prezziPerPaese.set(p, (prezziPerPaese.get(p) ?? 0) + (r.n ?? 0));
  }

  const righe: RigaPaese[] = [];
  for (const [paese, v] of link) {
    const q = prezziPerPaese.get(paese) ?? 0;
    righe.push({
      paese,
      insegne: v.insegne,
      link: v.link,
      prezzi: q,
      copertura: v.link > 0 ? Math.min(1, q / v.link) : 0,
    });
  }
  /* In ordine di quanti link ha il paese: chi ha di piu' da fare sta in cima. */
  righe.sort((a, b) => b.link - a.link);

  /* Le insegne: stessa forma, stesso criterio d'ordine. Chi ha piu' da fare in
     cima, perche' e' li' che si decide dove spingere. */
  const perInsegna: RigaInsegna[] = [];
  for (const [nome, v] of linkInsegna) {
    const q = prezziPerInsegna.get(nome) ?? 0;
    perInsegna.push({
      insegna: nome,
      paese: v.paese,
      link: v.link,
      prezzi: q,
      copertura: v.link > 0 ? Math.min(1, q / v.link) : 0,
    });
  }
  perInsegna.sort((a, b) => b.link - a.link);

  return { paesi: righe, insegne: perInsegna };
}

async function misuraSpazio(): Promise<Spazio> {
  const db = await getDb();
  const s = (await db.command({ dbStats: 1 })) as {
    dataSize?: number;
    indexSize?: number;
    storageSize?: number;
  };
  const dati = (s.storageSize ?? s.dataSize ?? 0) / 1048576;
  const indici = (s.indexSize ?? 0) / 1048576;
  const totale = dati + indici;

  /* Quanto pesa un prezzo DAVVERO, misurato adesso invece che stimato: e' la
     sola cifra che dice quando finisce lo spazio. Indici compresi, perche' qui
     gli indici pesano piu' dei dati. */
  const c = await prezzi();
  const quanti = await c.estimatedDocumentCount();
  const st = (await c
    .aggregate([{ $collStats: { storageStats: {} } }])
    .toArray()) as Array<{ storageStats?: { storageSize?: number; totalIndexSize?: number } }>;
  const ss = st[0]?.storageStats;
  const bytePerPrezzo =
    quanti > 0 && ss ? Math.round(((ss.storageSize ?? 0) + (ss.totalIndexSize ?? 0)) / quanti) : 0;

  return {
    datiMb: Math.round(dati * 10) / 10,
    indiciMb: Math.round(indici * 10) / 10,
    totaleMb: Math.round(totale * 10) / 10,
    tettoMb: TETTO_MB,
    pieno: Math.min(1, totale / TETTO_MB),
    bytePerPrezzo,
    prezziCheCiStanno:
      bytePerPrezzo > 0 ? Math.max(0, Math.floor(((TETTO_MB - totale) * 1048576) / bytePerPrezzo)) : 0,
  };
}
