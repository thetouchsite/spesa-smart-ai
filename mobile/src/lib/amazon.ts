/**
 * Prodotti Amazon per una voce della lista, chiesti quando l'utente apre.
 *
 * PERCHÉ AL TOCCO
 * ---------------
 * Ogni ricerca costa un credito. Cercarli per tutta la lista significherebbe
 * diciotto crediti a generazione — e pagare anche i prodotti che nessuno
 * guarderà mai. Al tocco gli stessi crediti valgono cento consultazioni, ed è
 * l'utente a decidere quali gli interessano.
 *
 * Il server tiene una cache condivisa: due persone che aprono «passata di
 * pomodoro» in Italia consumano un credito solo.
 *
 * COSA AGGIUNGE ALLE OFFERTE DEL MOTORE
 * -------------------------------------
 * Un indirizzo che non è indovinato — l'ASIN viene dal catalogo — più la foto
 * del prodotto e il prezzo pieno barrato quando è in offerta. Il motore quelle
 * due cose non le dà.
 */

import { post, ApiError } from "@/api/client";
import type { Offer } from "@/lib/plan-full";

interface RispostaAmazon {
  ok: boolean;
  offerte: Array<{
    prodotto: string;
    nome: string;
    prezzo: number;
    valuta: string;
    negozio: string;
    link: string;
    immagine?: string;
    prezzoListino?: number;
    scontoPercento?: number;
    voto?: number;
  }>;
}

/**
 * Le offerte Amazon per un prodotto, già nella forma delle altre.
 *
 * Restituisce lista vuota quando non c'è niente o il servizio non è
 * configurato: è un arricchimento, non un requisito, e la sua assenza non deve
 * cambiare nulla di quello che l'utente vede.
 */
export async function offerteAmazon(prodotto: string, paese: string): Promise<Offer[]> {
  try {
    const r = await post<RispostaAmazon>(
      "/product/amazon",
      { query: prodotto, country: paese, limit: 3 },
      // Misurato fra 2 e 36 secondi: sotto il muro dei sessanta di iOS.
      50_000,
    );

    return (r.offerte ?? []).map((o) => ({
      negozio: o.negozio,
      immagine: o.immagine,
      nome: o.nome,
      prezzo: o.prezzo,
      valuta: o.valuta,
      link: o.link,
      // Verificato: l'ASIN viene dal catalogo Amazon, non da un indirizzo
      // dedotto. È l'unica fonte del progetto che non ha bisogno di controlli.
      verifica: "verificato" as const,
      prezzoListino: o.prezzoListino,
      scontoPercento: o.scontoPercento,
      risparmio:
        o.prezzoListino !== undefined
          ? Math.round((o.prezzoListino - o.prezzo) * 100) / 100
          : undefined,
    }));
  } catch (err) {
    // 503 = non configurato: previsto, non è un guasto e non si segnala.
    if (!(err instanceof ApiError && err.status === 503)) {
      console.info("[amazon] non disponibile:", (err as Error).message);
    }
    return [];
  }
}
