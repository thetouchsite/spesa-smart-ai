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
 * Non chiama niente e non sa che esiste un database: le uniche cose che si
 * porta dietro sono altre funzioni pure. E' cio' che le permette di stare
 * dalla parte dell'API senza trascinarsi mezzo server, e cio' che la rende
 * facile da provare — si passa un oggetto e si guarda cosa esce.
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

import { type Quantita, prezzoNormalizzato, quantitaDa } from "./quantita.js";

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
  /**
   * Quanto ci si puo' fidare di questo prezzo.
   *
   *   `verificato`  la pagina si e' aperta e il prezzo e' stato letto li' dentro
   *   `pagina-ok`   la pagina si e' aperta, il prezzo non era leggibile dal
   *                 codice — succede quando il negozio lo disegna con
   *                 JavaScript. Il prodotto e il link valgono lo stesso
   *   `bloccato`    il sito rifiuta le richieste automatiche: la pagina esiste
   *                 e da un telefono si apre, ma il prezzo non e' confermato
   *
   * Non e' la stessa cosa di `esito`, che parla della VOCE. Questo parla della
   * singola offerta, e serve a chi vuole mostrare due prezzi con due gradi di
   * fiducia diversi senza far finta che siano uguali.
   */
  fiducia: "verificato" | "pagina-ok" | "bloccato" | null;
  /**
   * Quanto ce n'e' dentro, letto dal nome: grammi, millilitri o pezzi.
   * `null` per la roba sfusa, che un peso non ce l'ha.
   */
  quantita: Quantita | null;
  /**
   * QUANTO COSTA UN CHILO. O un litro.
   *
   * E' il campo che rende onesto il confronto, e senza il quale l'app faceva
   * scegliere male: 500 g a 1,39 € sembrano meno di 1 kg a 2,19 €, e invece
   * sono 2,78 €/kg contro 2,19.
   *
   * `null` per i prodotti a pezzo — sei uova non si confrontano al chilo — e
   * per quelli senza peso nel nome. Dire «non lo so» e' un'informazione;
   * riempire la casella con un numero inventato e' il contrario.
   */
  prezzoNormalizzato: { valore: number; unita: "kg" | "l" } | null;
}

export interface VoceV1 {
  /** Come l'aveva scritta chi ha chiesto. Torna uguale: serve a ritrovarsi. */
  voce: string;
  esito: Esito;
  /** Piu' insegne per la stessa voce: e' il confronto. Vuoto se l'esito non e' `trovato`. */
  offerte: OffertaV1[];
}

/**
 * Quanto verrebbe a costare la spesa in una singola insegna.
 *
 * E' la domanda che l'utente si fa davvero — «dove mi conviene andare?» — e
 * non si risponde sommando i prezzi piu' bassi: quelli stanno sparsi in sei
 * negozi diversi, e nessuno fa sei spese.
 */
export interface InsegnaV1 {
  insegna: string;
  /** La somma dei soli prezzi la cui pagina si e' aperta davvero. */
  totale: number;
  /** Quante voci della lista questa insegna copre, con un prezzo verificato. */
  vociCoperte: number;
  /**
   * Ha abbastanza voci da poter essere confrontata con le altre.
   *
   * Un'insegna che copre tre voci su venti avrebbe il totale piu' basso di
   * tutte, e sarebbe una risposta falsa: e' bassa perche' manca, non perche'
   * costa poco.
   */
  confrontabile: boolean;
}

export interface RispostaPrezziV1 {
  voci: VoceV1[];
  /**
   * Il confronto fra insegne, dalla piu' conveniente. Vuoto quando non c'e'
   * abbastanza copertura per confrontare onestamente.
   */
  insegne: InsegnaV1[];
  /**
   * Quanto si risparmia scegliendo l'insegna piu' conveniente invece della
   * meno conveniente, fra quelle confrontabili — calcolato sulle sole voci
   * che hanno tutte, cosi' i due carrelli contengono le stesse cose.
   * `null` quando non c'e' abbastanza da confrontare.
   */
  risparmio: number | null;
  /** Su quante voci e' stato fatto quel confronto. `null` se non c'e' risparmio. */
  risparmioSuVoci: number | null;
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
    /**
     * La somma delle offerte MOSTRATE — la prima di ogni voce, quella che si
     * legge sullo schermo. E' il numero che deve tornare se qualcuno somma a
     * mano quello che vede.
     */
    totaleMostrato: number;
    /**
     * La somma comprando ogni voce dove costa meno, girando fra i negozi.
     * E' sempre minore o uguale a `totaleMostrato`.
     *
     * Prima questo campo esisteva gia' con questo nome e conteneva l'altro
     * numero: era la somma della PRIMA offerta, non della piu' economica. Su
     * una spesa da sei voci diceva 23,55 quando la piu' economica faceva
     * 8,86. Un nome che promette e non mantiene e' peggio di un campo che
     * manca, perche' nessuno va a controllarlo.
     */
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
  /** Voci che avevano candidati ma di cui nessuna pagina si e' aperta. */
  nonRaggiungibili?: string[];
  catene?: Array<{
    negozio: string;
    totale: number;
    verificati: number;
    proposti: number;
    utilizzabile: boolean;
  }>;
  vincitore?: { negozio: string; totale: number } | null;
  risparmioVsPiuCara?: number | null;
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
function esitoDi(
  offerte: Dentro["prodotti"][number]["offerte"],
  cadutaAprendo: boolean,
): Esito {
  /* SENZA OFFERTE, MA NON SEMPRE PER LO STESSO MOTIVO.
     «Nessun negozio ha questo prodotto» e «il prodotto c'e' ma non siamo
     riusciti ad aprirlo» arrivavano uguali a chi legge, e la prima e' una
     bugia che si vede: misurato, Aldi Nord ha «Tomatenmark» a catalogo con due
     schede, e siccome le sue pagine non si aprono spariva in silenzio.

     Se una voce aveva dei candidati e nessuna pagina ha risposto, l'esito e'
     `non-raggiungibile` — che invita a riprovare — non `nessun-prodotto`, che
     chiude la questione. */
  if (offerte.length === 0) return cadutaAprendo ? "non-raggiungibile" : "nessun-prodotto";
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
  /* La quantita' si legge QUI e non nelle strade dei prezzi, per due motivi.
     Vale per tutte e due — quella italiana e quella generica — senza doverla
     scrivere in due posti e senza il rischio che divergano, che e' gia'
     costato degli errori. E resta fuori dal motore: e' una cosa del
     contratto, cioe' di come si racconta un prezzo a chi lo riceve. */
  const quantita = quantitaDa(o.nome);
  const prezzo = typeof o.prezzo === "number" ? o.prezzo : null;

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
    fiducia:
      o.verifica === "verificato" || o.verifica === "pagina-ok" || o.verifica === "bloccato"
        ? o.verifica
        : null,
    quantita,
    prezzoNormalizzato: prezzoNormalizzato(prezzo, quantita),
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

  const caduteAprendo = new Set(dentro.nonRaggiungibili ?? []);

  const voci: VoceV1[] = chieste.map((voce) => {
    const offerte = perVoce.get(voce)?.offerte ?? [];
    const esito = esitoDi(offerte, caduteAprendo.has(voce));
    return {
      voce,
      esito,
      /* Le offerte si mandano anche quando il prezzo non c'e': il link e il
         nome del prodotto valgono, e sono cio' che permette a chi disegna di
         scrivere «prezzo non pubblicato» invece di «non disponibile». */
      offerte: offerte.map((o) => offertaDi(o, valuta)),
    };
  });

  /* CONFRONTABILE RISPETTO A COSA E' STATO CHIESTO, non a cio' che l'insegna
     ha proposto.
     Dentro, un'insegna passa il controllo se verifica meta' dei prodotti CHE
     HA PROPOSTO LEI. Vuol dire che una che ne propone due e li verifica
     entrambi e' «confrontabile» anche se la lista ne aveva venti — e siccome
     il suo totale e' la somma di due prezzi, vince. Visto succedere: su una
     lista di cinque voci, Bennet «piu' conveniente» a 3,19 € coprendone due.

     E' bassa perche' MANCA, non perche' costa poco, e dirlo a un utente e' una
     bugia che gli fa fare chilometri.

     Meta' della lista e' la soglia: sotto, non e' un confronto — e' una
     coincidenza. */
  const minimo = Math.max(2, Math.ceil(chieste.length / 2));

  /* E NON BASTA LA META': SI CONFRONTA CHI COPRE QUANTO CHI COPRE DI PIU'.
     Con la sola soglia di meta' lista restava fuori il caso peggiore. Su otto
     voci, misurato: Eurospin le copriva tutte e otto per 10,84 €, Eataly ne
     copriva cinque per 211,90 — perche' vende roba da regalo — e il
     «risparmio» diventava 201 euro. Vero come sottrazione, insensato come
     informazione: nessuno fa la spesa di tutti i giorni da Eataly, e comunque
     quei due totali non contano le stesse cose.

     Quindi si guarda chi copre di piu', e si confronta solo con chi gli sta
     vicino — una voce di tolleranza, perche' pretendere lo stesso identico
     numero lascerebbe spesso una sola insegna e niente da confrontare. */
  const coperturaMigliore = Math.max(
    0,
    ...(dentro.catene ?? []).filter((c) => c.utilizzabile).map((c) => c.verificati),
  );
  const soglia = Math.max(minimo, coperturaMigliore - 1);

  const insegne: InsegnaV1[] = (dentro.catene ?? []).map((c) => ({
    insegna: c.negozio,
    totale: c.totale,
    vociCoperte: c.verificati,
    confrontabile: c.utilizzabile && c.verificati >= soglia,
  }));

  /* IL RISPARMIO SI CALCOLA SULLE VOCI CHE HANNO TUTTI, NON SUI TOTALI.
     La tolleranza di una voce bastava a far rientrare il caso che voleva
     escludere: su sei voci, Eataly ne copriva cinque per 49,95 ed Eurospin
     tutte e sei per 8,86, e il «risparmio» diventava 41,09 — su una spesa
     che a schermo ne segnava 23,55. Un risparmio piu' grande della spesa.

     La sottrazione era giusta; erano i due addendi a non contenere le stesse
     cose. Quindi non si sottraggono piu' i totali: si prende l'insieme delle
     voci che TUTTE le insegne confrontabili hanno a listino, e si rifa' il
     carrello di ognuna su quelle e basta. Cosi' i due numeri contano gli
     stessi prodotti, e la differenza vuol dire qualcosa.

     I prezzi si rileggono dalle offerte che stiamo restituendo: chi riceve la
     risposta puo' rifare il conto da se' e ritrovare la stessa cifra. */
  const confrontabili = insegne.filter((i) => i.confrontabile && i.totale > 0);

  /** Per ogni insegna confrontabile: voce → quanto costa li'. */
  const carrelli = new Map<string, Map<string, number>>(
    confrontabili.map((i) => [i.insegna, new Map<string, number>()]),
  );
  for (const v of voci) {
    for (const o of v.offerte ?? []) {
      const suo = carrelli.get(o.insegna);
      if (!suo || typeof o.prezzo !== "number" || !(o.prezzo > 0)) continue;
      const gia = suo.get(v.voce);
      if (gia == null || o.prezzo < gia) suo.set(v.voce, o.prezzo);
    }
  }

  const comuni = voci
    .map((v) => v.voce)
    .filter((nome) => [...carrelli.values()].every((c) => c.has(nome)));

  /* Se le voci in comune sono poche il confronto torna a essere una
     coincidenza, e allora e' meglio non dire niente che dire un numero. */
  const abbastanza = comuni.length >= minimo;
  const somme = abbastanza
    ? [...carrelli.values()].map((c) =>
        comuni.reduce((s, nome) => s + (c.get(nome) ?? 0), 0),
      )
    : [];

  const risparmio =
    somme.length >= 2
      ? Math.round((Math.max(...somme) - Math.min(...somme)) * 100) / 100
      : null;
  const risparmioSuVoci = risparmio == null ? null : comuni.length;

  return {
    voci,
    insegne,
    risparmio,
    risparmioSuVoci,
    copertura: {
      paese: paese.toUpperCase(),
      coperto: paeseCoperto,
      insegne: dentro.catene?.length ?? 0,
    },
    riepilogo: {
      chieste: chieste.length,
      trovate: voci.filter((v) => v.esito === "trovato").length,
      totaleMostrato: dentro.totali?.spesaAlMiglioPrezzo ?? 0,
      /* Si ricalcola qui dalle offerte che stiamo restituendo, non da un
         totale preso altrove: cosi' il numero e' la somma di cifre che il
         chiamante ha in mano e puo' rifare da se'. */
      totaleAlMiglioPrezzo:
        Math.round(
          voci.reduce((somma, v) => {
            const prezzi = (v.offerte ?? [])
              .map((o) => o.prezzo)
              .filter((x): x is number => typeof x === "number" && x > 0);
            return prezzi.length ? somma + Math.min(...prezzi) : somma;
          }, 0) * 100,
        ) / 100,
      valuta: dentro.totali?.valuta || valuta,
    },
    secondi: dentro.meta?.secondiPrezzi ?? 0,
  };
}
