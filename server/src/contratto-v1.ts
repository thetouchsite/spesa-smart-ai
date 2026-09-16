/**
 * La forma che l'API promette. Versione 1.
 *
 * PERCHE' UN FILE APPOSTA
 * -----------------------
 * Dentro, il risultato ha la forma che gli e' comoda: `prezzi`, `prodotti`,
 * `catene`, `vincitore`, campi cresciuti man mano che serviva qualcosa. E'
 * normale e va bene — quella e' casa nostra.
 *
 * Fuori no. Fuori c'e' un contratto: chi ci costruisce sopra deve poter
 * scrivere il suo codice una volta e trovarlo funzionante domani. Se la forma
 * interna e quella pubblica sono lo stesso oggetto, ogni volta che dentro
 * cambia qualcosa si rompe qualcuno fuori — e non si puo' nemmeno riordinare
 * il codice senza fare danni a un cliente.
 *
 * Questo file e' la cerniera fra le due. Dentro cambia quando vogliamo; qui si
 * cambia solo passando a `/v2`.
 *
 * E' una funzione pura, senza import da nessuna parte: e' cio' che le permette
 * di stare dalla parte dell'API senza portarsi dietro mezzo server.
 *
 * LA COSA CHE CAMBIA DI PIU': SI RISPONDE PER OGNI VOCE CHIESTA
 * -------------------------------------------------------------
 * Oggi la risposta contiene una voce solo se qualcosa e' stato trovato. A
 * Monaco di Baviera sono state chieste sedici voci e ne sono tornate undici:
 * le altre cinque non c'erano, e chi riceveva la risposta non poteva sapere se
 * fossero state dimenticate, se il paese non fosse coperto, o se davvero in
 * Germania non si trovasse il petto di pollo.
 *
 * Qui ogni voce chiesta torna, sempre, con scritto cosa le e' successo.
 */

/** Cosa e' successo a una voce della spesa. Quattro cose diverse. */
export type Esito =
  /** C'e' il prodotto e c'e' il prezzo. */
  | "trovato"
  /** Il prodotto c'e', il negozio il prezzo non lo pubblica. Il link vale lo stesso. */
  | "nessun-prezzo-pubblicato"
  /** Nessuna insegna di quel paese ha qualcosa che corrisponda. */
  | "nessun-prodotto"
  /** Qualcosa c'era, ma non siamo riusciti ad aprirlo. Riprovare puo' servire. */
  | "non-raggiungibile";

export interface OffertaV1 {
  /** L'insegna, non il punto vendita: il listino e' della catena. */
  insegna: string;
  /** Il nome come lo scrive il negozio. */
  nome: string;
  /** Quanto si paga oggi. `null` quando il negozio non lo pubblica. */
  prezzo: number | null;
  valuta: string;
  /** Il listino barrato, quando e' in promozione. */
  prezzoPieno: number | null;
  /** Di quanto si risparmia, in percentuale. */
  sconto: number | null;
  /** La scheda del prodotto. E' un indirizzo vero, preso dalla sitemap. */
  link: string | null;
  /** Quando quella pagina e' stata guardata, in ISO. Un prezzo senza data e' una diceria. */
  letto: string | null;
}

export interface VoceV1 {
  /** Come l'aveva scritta chi ha chiesto. Torna uguale: serve a ritrovarsi. */
  voce: string;
  esito: Esito;
  /** Piu' insegne per la stessa voce: e' il confronto. Vuoto se l'esito non e' `trovato`. */
  offerte: OffertaV1[];
}

export interface RispostaPrezziV1 {
  voci: VoceV1[];
  copertura: {
    paese: string;
    /** Abbiamo un catalogo per quel paese? Se no, `nessun-prodotto` vuol dire un'altra cosa. */
    coperto: boolean;
    /** Quante insegne sono state confrontate in questa risposta. */
    insegne: number;
  };
  riepilogo: {
    chieste: number;
    trovate: number;
    /** Il totale della spesa comprando ogni voce dove costa meno. */
    totaleAlMiglioPrezzo: number;
    valuta: string;
  };
  /** Quanto ci e' voluto, in secondi. Lo diciamo noi: chi misura da fuori misura anche la rete. */
  secondi: number;
}

/* ─────────────────── da come sta dentro a come esce ─────────────────── */

/** La forma interna, descritta qui solo per quel che serve tradurre. */
interface Dentro {
  prodotti: Array<{
    prodotto: string;
    offerte: Array<{
      negozio: string;
      nome: string;
      prezzo: number | null;
      valuta?: string;
      verifica?: string;
      link?: string | null;
      letto?: string | null;
      scontoPercento?: number | null;
      sconto?: number | null;
      prezzoListino?: number | null;
    }>;
  }>;
  catene?: Array<unknown>;
  totali?: { spesaAlMiglioPrezzo?: number; valuta?: string };
  meta?: { secondiPrezzi?: number };
}

/**
 * Cosa e' successo a questa voce.
 *
 * L'ordine delle domande e' l'ordine in cui contano: se c'e' un prezzo il
 * resto non importa, e se non c'e' nessun candidato non ha senso chiedersi
 * perche' le pagine non si siano aperte.
 */
function esitoDi(offerte: Dentro["prodotti"][number]["offerte"]): Esito {
  if (offerte.length === 0) return "nessun-prodotto";
  if (offerte.some((o) => typeof o.prezzo === "number")) return "trovato";

  /* Nessun prezzo, ma delle schede c'erano. Le due cause si raccontano in modo
     diverso: «il negozio non lo pubblica» e' definitivo e all'utente si mostra
     il link, «non siamo riusciti ad aprirlo» invita a riprovare. */
  const tutteMute = offerte.every((o) => o.verifica === "non-raggiungibile");
  return tutteMute ? "non-raggiungibile" : "nessun-prezzo-pubblicato";
}

function offertaDi(
  o: Dentro["prodotti"][number]["offerte"][number],
  valutaPredefinita: string,
): OffertaV1 {
  return {
    insegna: o.negozio,
    nome: o.nome,
    prezzo: typeof o.prezzo === "number" ? o.prezzo : null,
    valuta: o.valuta || valutaPredefinita,
    prezzoPieno: typeof o.prezzoListino === "number" ? o.prezzoListino : null,
    sconto:
      typeof o.scontoPercento === "number"
        ? o.scontoPercento
        : typeof o.sconto === "number"
          ? o.sconto
          : null,
    link: o.link || null,
    letto: o.letto ?? null,
  };
}

/**
 * Traduce il risultato interno nella forma promessa.
 *
 * `chieste` sono le voci come le ha scritte chi ha chiesto, nel loro ordine:
 * si itera su QUELLE, non su quel che si e' trovato. E' l'unico modo perche'
 * una voce che non ha dato niente torni comunque, con scritto perche'.
 */
export function rispostaPrezziV1(
  dentro: Dentro,
  chieste: string[],
  paese: string,
  valuta: string,
  paeseCoperto: boolean,
): RispostaPrezziV1 {
  const perVoce = new Map<string, Dentro["prodotti"][number]>();
  for (const p of dentro.prodotti ?? []) perVoce.set(p.prodotto, p);

  const voci: VoceV1[] = chieste.map((voce) => {
    const offerte = perVoce.get(voce)?.offerte ?? [];
    const esito = esitoDi(offerte);
    return {
      voce,
      esito,
      /* Le offerte si mandano anche quando il prezzo non c'e': il link e il
         nome del prodotto valgono, e sono cio' che permette a chi disegna di
         scrivere «prezzo non pubblicato» invece di «non disponibile». */
      offerte: offerte.map((o) => offertaDi(o, valuta)),
    };
  });

  return {
    voci,
    copertura: {
      paese: paese.toUpperCase(),
      coperto: paeseCoperto,
      insegne: dentro.catene?.length ?? 0,
    },
    riepilogo: {
      chieste: chieste.length,
      trovate: voci.filter((v) => v.esito === "trovato").length,
      totaleAlMiglioPrezzo: dentro.totali?.spesaAlMiglioPrezzo ?? 0,
      valuta: dentro.totali?.valuta || valuta,
    },
    secondi: dentro.meta?.secondiPrezzi ?? 0,
  };
}
