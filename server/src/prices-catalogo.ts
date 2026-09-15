/**
 * I prezzi dal catalogo nostro, senza chiedere niente al modello.
 *
 * COS'E' CAMBIATO
 * ---------------
 * Le altre due strade partono da una domanda al modello: «dove si compra la
 * passata di pomodoro, e quanto costa?». Lui il prezzo lo trova, l'indirizzo
 * se lo inventa quando non lo sa — Cortilia 0 pagine aperte su 12, Eataly 0
 * su 4, Amazon 0 su 6.
 *
 * Qui il modello non entra affatto. L'indirizzo lo prende dal catalogo, che
 * viene dalle sitemap pubblicate dai negozi stessi, e il prezzo si legge
 * aprendo quella pagina — la stessa lettura che gia' facciamo per verificare.
 *
 *   modello  →  catalogo      quale prodotto corrisponde     resta al modello? NO
 *   catalogo →  indirizzo     dove sta la scheda             garantito dal negozio
 *   pagina   →  prezzo        quanto costa oggi              letto adesso
 *
 * COSA SI GUADAGNA
 * ----------------
 * Nessun link inventato, per costruzione. E soprattutto NESSUN COSTO: sparisce
 * il grounding, che sono cinque dei sei centesimi che costa un piano. Questa
 * strada costa zero in chiamate al modello.
 *
 * COSA SI PERDE
 * -------------
 * L'abbinamento fra la voce della lista e il prodotto del catalogo lo fa un
 * conteggio di parole, non un'intelligenza: «pasta di semola» puo' finire su
 * «pasta e fagioli». Su diciassette voci ne azzecca una dozzina. Il passo
 * successivo e' far scegliere al modello fra i candidati che il catalogo
 * propone — poche centinaia di token, nessuna ricerca, quindi quasi gratis.
 *
 * E copre solo i paesi censiti: fuori, restituisce vuoto e chi chiama ricade
 * sulle altre strade.
 */

import { cercaNelCatalogo } from "./catalogo.js";
import { paesiConCatalogo } from "./catalogo-fonti.js";
import { verifyProductPage } from "./price-page.js";

/** La stessa forma che producono le altre due strade. */
export interface PrezzoGrezzo {
  prodotto: string;
  nome: string;
  prezzo: number | null;
  valuta: string;
  negozio: string;
  link: string;
}

export interface EsitoCatalogo {
  prezzi: PrezzoGrezzo[];
  /** Voci per cui il catalogo non aveva nessun candidato. */
  senzaCandidati: number;
  /** Pagine aperte per leggere il prezzo: e' il costo in tempo di questa strada. */
  pagineAperte: number;
  secondi: number;
}

/**
 * Quanti prodotti del catalogo provare per ogni voce della lista.
 *
 * Tre: il primo non e' sempre il migliore — l'abbinamento a parole sbaglia — e
 * aprendo tre pagine si ha qualche possibilita' che almeno una dichiari il
 * prezzo. Oltre, il tempo cresce e il guadagno no.
 */
const CANDIDATI_PER_VOCE = 3;

/** Quante pagine aprire insieme. Otto e' gentile e abbastanza veloce. */
const INSIEME = 8;

export function catalogoDisponibilePer(iso: string): boolean {
  return paesiConCatalogo().includes((iso || "").toUpperCase().slice(0, 2));
}

async function aBrani<T, R>(cose: T[], quante: number, lavoro: (c: T) => Promise<R>): Promise<R[]> {
  const fuori: R[] = [];
  for (let i = 0; i < cose.length; i += quante) {
    fuori.push(...(await Promise.all(cose.slice(i, i + quante).map(lavoro))));
  }
  return fuori;
}

/**
 * Prezzi per una lista della spesa, presi dal catalogo.
 *
 * Restituisce una riga per ogni candidato con un prezzo leggibile: piu' righe
 * per la stessa voce sono il confronto fra negozi, che e' cio' che l'app mostra.
 */
export async function generatePricesCatalogo(
  items: string[],
  paeseIso: string,
  valuta: string,
): Promise<EsitoCatalogo> {
  const t0 = Date.now();

  if (!catalogoDisponibilePer(paeseIso)) {
    console.info(`[catalogo] nessuna fonte per ${paeseIso}: questa strada non e' percorribile`);
    return { prezzi: [], senzaCandidati: items.length, pagineAperte: 0, secondi: 0 };
  }

  // Prima i candidati: e' tutto lavoro in memoria, istantaneo dopo il primo
  // caricamento del paese.
  const candidature = await Promise.all(
    items.map(async (voce) => ({
      voce,
      candidati: await cercaNelCatalogo(paeseIso, voce, CANDIDATI_PER_VOCE),
    })),
  );

  const senzaCandidati = candidature.filter((c) => c.candidati.length === 0).length;
  if (senzaCandidati > 0) {
    console.info(`[catalogo] ${senzaCandidati}/${items.length} voci senza nessun candidato`);
  }

  // Poi le pagine, che sono la parte lenta.
  const daAprire = candidature.flatMap((c) =>
    c.candidati.map((k) => ({ voce: c.voce, ...k })),
  );

  const letti = await aBrani(daAprire, INSIEME, async (c) => {
    const v = await verifyProductPage(c.url);

    // Il prezzo si prende solo se la pagina lo dichiara davvero. Qui non c'e'
    // un modello che possa proporne uno: o lo leggiamo, o non c'e'.
    const prezzo = v.page?.current ?? null;
    if (prezzo == null) return null;

    return {
      prodotto: c.voce,
      // Il nome del catalogo viene dall'indirizzo ed e' tutto minuscolo:
      // la prima lettera maiuscola lo rende leggibile in elenco.
      nome: c.nome.charAt(0).toUpperCase() + c.nome.slice(1),
      prezzo,
      valuta: v.page?.currency ?? valuta,
      negozio: c.insegna,
      link: c.url,
    } satisfies PrezzoGrezzo;
  });

  const prezzi: PrezzoGrezzo[] = letti.filter((r) => r !== null);
  const secondi = (Date.now() - t0) / 1000;

  const conPrezzo = new Set(prezzi.map((p) => p.prodotto)).size;
  console.info(
    `[catalogo] ${secondi.toFixed(0)}s, ${daAprire.length} pagine aperte, ` +
      `${prezzi.length} prezzi letti per ${conPrezzo}/${items.length} voci`,
  );

  return { prezzi, senzaCandidati, pagineAperte: daAprire.length, secondi };
}
