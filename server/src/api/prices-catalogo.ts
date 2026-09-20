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
 * CHI SCEGLIE FRA I CANDIDATI
 * ---------------------------
 * Il catalogo propone tre prodotti per ogni voce, confrontando le parole. E'
 * un criterio povero e si vedeva: «Orata fresca» finiva su «Ricotta fresca»,
 * «Pomodori da insalata» su «Rio Mare insalatissime» — nove voci su
 * diciassette, e non tutte giuste.
 *
 * Allora la scelta la fa il modello, ma solo la SCELTA: legge i tre nomi e
 * dice quale e' il prodotto giusto, o nessuno. Non cerca, non inventa
 * indirizzi, non naviga. Una chiamata sola per tutta la lista, poche centinaia
 * di token e ZERO grounding — che e' la voce cara, cinque centesimi su sei.
 *
 * Se la chiamata fallisce si tiene la scelta a parole: un abbinamento
 * imperfetto vale piu' di nessun prezzo.
 *
 * E copre solo i paesi censiti: fuori, restituisce vuoto e chi chiama ricade
 * sulle altre strade.
 */

import { cercaNelCatalogo } from "./catalogo.js";
import { quantitaDa } from "./quantita.js";
import { paesiConCatalogo } from "./catalogo-fonti.js";
import { verifyProductPage } from "./price-page.js";
import { ilSelettore, ilTraduttore } from "./aiuti-esterni.js";
import {
  traduciVoce,
  impara,
  LINGUA_DEL_PAESE as LINGUA_VOCABOLARIO,
} from "./vocabolario.js";
import { improntaUrl, prezziGiaVisti, salvaPrezzi, type PrezzoSalvato } from "./prezzi-magazzino.js";
import { scartiDi } from "./scarti.js";

/** La stessa forma che producono le altre due strade. */
export interface PrezzoGrezzo {
  prodotto: string;
  nome: string;
  prezzo: number | null;
  valuta: string;
  negozio: string;
  link: string;
  /**
   * Quanto era pertinente questo candidato: 0 e' il primo della classifica.
   *
   * Serve a impedire che un prodotto che c'entra poco prenda il posto d'onore
   * solo perche' costa meno. `Biona butter beans` costa meno di `Anchor salted
   * butter`, ma per chi ha scritto «butter» non e' un'alternativa piu'
   * conveniente: e' un'altra cosa.
   */
  posto?: number;
  /**
   * Quando questa pagina e' stata guardata l'ultima volta, in ISO.
   *
   * Un prezzo senza data e' una diceria: chi costruisce sopra la nostra API
   * deve poter dire all'utente «letto stamattina» o «letto tre giorni fa», e
   * deve poter scartare da solo quello che per lui e' troppo vecchio. Noi
   * dichiariamo quando abbiamo guardato; la soglia la sceglie lui.
   *
   * Per le schede che arrivano dal magazzino e' la data del magazzino, non
   * adesso — se no la risposta direbbe «fresco» di una cosa letta ieri.
   */
  letto?: string;
  /**
   * Questa pagina l'abbiamo GIA' aperta per leggerne il prezzo.
   *
   * Senza questo segno il verificatore la riapriva una seconda volta, per
   * scoprire cio' che sapevamo gia': meta' del tempo di questa strada se ne
   * andava a rifare un lavoro appena fatto.
   */
  giaVerificato?: boolean;
}

export interface EsitoCatalogo {
  prezzi: PrezzoGrezzo[];
  /** Voci per cui il catalogo non aveva nessun candidato. */
  senzaCandidati: number;
  /**
   * Voci che UN CANDIDATO CE L'AVEVANO, ma di cui non si e' aperta una pagina.
   *
   * E' la differenza fra «nessun negozio ha questo prodotto» e «il prodotto
   * c'e', non siamo riusciti ad aprirlo». Senza questo elenco le due cose
   * arrivano uguali a chi legge, e la prima e' una bugia: misurato, Aldi Nord
   * ha «Tomatenmark» a catalogo con due schede, e siccome le sue pagine non si
   * aprono spariva in silenzio.
   *
   * Qui non si vedeva perche' altri negozi rispondevano. Il giorno che
   * falliscono tutti, chi riceve deve sapere che vale la pena riprovare.
   */
  nonRaggiungibili: string[];
  /** Pagine aperte per leggere il prezzo: e' il costo in tempo di questa strada. */
  pagineAperte: number;
  secondi: number;
}

/**
 * Quanti prodotti del catalogo provare per ogni voce della lista.
 *
 * SEI, ed erano tre. Il numero dipende da quante insegne ha il paese: i
 * candidati si distribuiscono una per catena, e con tre se ne tentavano tre su
 * sei — spesso non quelle che i prezzi li espongono davvero.
 *
 * Misurato in Spagna, dove le insegne sono passate da due a sei: le voci con
 * prezzo erano SCESE da quattro a una su nove. Piu' catalogo e meno prezzi,
 * perche' i tentativi non bastavano a coprire le catene nuove.
 *
 * Costa pagine aperte, che e' il tempo di questa strada. Il tetto vero resta
 * quello dell'app: cinquantacinque secondi.
 */
const CANDIDATI_PER_VOCE = 6;

/**
 * Quante insegne mostrare per una voce.
 *
 * Sei sono i candidati che si aprono; queste sono quelle che arrivano
 * all'utente. Cinque bastano a far vedere la forbice — nel riso carnaroli
 * italiano va da 1,99 a 3,29 — e oltre l'elenco diventa una lista da scorrere
 * invece di un confronto da leggere.
 */
const ALTERNATIVE_MAX = 5;

/**
 * Quante pagine tenere aperte in tutto.
 *
 * SEDICI, ED ERANO OTTO. Il numero e' salito perche' ora c'e' un secondo
 * freno, piu' preciso: al massimo due pagine per volta sullo stesso negozio
 * (vedi `aBrani`). Prima le otto potevano finire tutte sulla stessa insegna,
 * quindi il tetto basso serviva a proteggere LEI, non noi.
 *
 * Con il limite per dominio, sedici insieme su otto insegne sono due a testa:
 * il doppio del lavoro nello stesso tempo, e ogni negozio riceve meno
 * richieste di prima.
 *
 * Misurato su un piano londinese da sedici voci: 75 pagine, 62 secondi.
 */
const INSIEME = 16;

export function catalogoDisponibilePer(iso: string): boolean {
  return paesiConCatalogo().includes((iso || "").toUpperCase().slice(0, 2));
}

/**
 * Le pagine insieme, e appena una finisce ne parte un'altra.
 *
 * PERCHE' NON A ONDATE
 * --------------------
 * Prima si prendevano otto pagine, si aspettava che finissero TUTTE, e solo
 * allora partivano le otto dopo. Sembra la stessa cosa e non lo e': ogni
 * ondata costa quanto la sua pagina piu' lenta, e sette connessioni restano
 * ferme ad aspettare la ottava.
 *
 * Misurato su Madrid, dodici voci: 58 pagine, otto ondate, 58 secondi — con
 * il tetto per pagina a otto secondi, cioe' quasi ogni ondata aveva dentro un
 * negozio che arrivava al limite mentre gli altri sette avevano gia' finito.
 *
 * E 58 secondi sono oltre il muro: l'app molla a 55, perche' iOS chiude ogni
 * connessione a 60. La richiesta riusciva e l'utente vedeva un errore.
 *
 * Con la finestra scorrevole il totale non dipende piu' dalla somma delle
 * pagine lente, ma dal lavoro diviso per quante ne corrono insieme. Le
 * connessioni per singolo negozio restano poche: non stiamo chiedendo
 * di piu' ai negozi, stiamo solo smettendo di stare fermi.
 *
 * I risultati tornano nell'ordine di partenza, non di arrivo: chi chiama si
 * aspetta che la riga `i` sia la pagina `i`.
 */
async function aBrani<T, R>(
  cose: T[],
  quante: number,
  lavoro: (c: T) => Promise<R>,
  dominioDi?: (c: T) => string,
): Promise<R[]> {
  const fuori: R[] = new Array(cose.length);
  let prossima = 0;

  /* AL MASSIMO DUE PAGINE PER VOLTA SULLO STESSO NEGOZIO.
     Finora il limite era solo sul totale: otto pagine insieme, ma potevano
     essere tutte e otto dello stesso sito. E' esattamente il modo di prendersi
     un 429 — oggi e' successo misurando le rese, dodici schede simultanee a
     Poundland e MuscleFood, entrambe finite fra le insegne mute per un'ora.

     Contando per dominio si possono tenere PIU' connessioni aperte in tutto
     restando piu' gentili con ciascun negozio: sedici pagine insieme su otto
     insegne sono due a testa, meno di quanto ne prendesse una sola prima.

     Il conteggio e' per dominio e non per insegna perche' due insegne del
     nostro elenco possono stare sullo stesso server. */
  const aperte = new Map<string, number>();
  const PER_DOMINIO = 2;

  const lavoratore = async (): Promise<void> => {
    while (prossima < cose.length) {
      const mio = prossima++;
      const dom = dominioDi ? dominioDi(cose[mio]) : "";

      if (dom) {
        // Si aspetta che quel negozio abbia un posto libero, non che si liberi
        // tutta la coda: gli altri intanto continuano.
        while ((aperte.get(dom) ?? 0) >= PER_DOMINIO) {
          await new Promise((s) => setTimeout(s, 60));
        }
        aperte.set(dom, (aperte.get(dom) ?? 0) + 1);
      }

      try {
        fuori[mio] = await lavoro(cose[mio]);
      } finally {
        if (dom) aperte.set(dom, (aperte.get(dom) ?? 1) - 1);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(quante, cose.length) }, () => lavoratore()),
  );
  return fuori;
}


/** La scelta del modello per una voce: quale candidato, o nessuno. */
interface Scelta {
  voce: number;
  /** Tutti i candidati che corrispondono, il piu' adatto per primo. */
  scelti?: number[];
  /** La forma vecchia, una scelta sola: si accetta ancora se il modello la usa. */
  scelto?: number | null;
}

/**
 * Fa scegliere al modello quale candidato corrisponde a ogni voce.
 *
 * Il prompt e' volutamente minuscolo: nomi, niente altro. Non gli si chiede
 * di cercare, di valutare prezzi o di essere creativo — solo di riconoscere
 * che «passata di pomodoro» e' quel Mutti da 700 g e non una passata di
 * verdure. E' la cosa che sa fare meglio, ed e' l'unica che gli resta.
 *
 * Restituisce una mappa voce → indice scelto. Se qualcosa va storto,
 * restituisce vuoto e chi chiama tiene l'ordine del catalogo.
 */
async function facciScegliere(
  candidature: Array<{ voce: string; candidati: Array<{ nome: string; insegna: string }> }>,
): Promise<Map<number, number[]>> {
  /* L'INTERRUTTORE, e non serve solo a misurare.
     `SCELTA_MODELLO=no` salta la chiamata e tiene l'ordine del catalogo —
     esattamente cio' che succede gia' quando il modello non risponde, quindi
     non e' una strada nuova da mantenere: e' la strada di ripiego, resa
     raggiungibile a comando.

     Serve a due cose. La prima e' il metro: confrontare «col modello» e
     «senza» cambiando UNA variabile sola. Senza l'interruttore si finisce a
     confrontare il primo per rilevanza con il piu' economico fra gli
     approvati, che differiscono per due cose e non dicono quale delle due
     conta.

     La seconda e' il criterio 3 del goal: staccare l'IA, rifare la stessa
     spesa, e vedere se viene identica. Finche' questa riga non c'era, quella
     prova si poteva fare solo rompendo la chiave. */
  /* SPENTA, PERCHE' IL METRO HA DETTO DI SPEGNERLA.
     Il piano prevedeva di togliere il modello solo se le misure avessero detto
     che non si peggiora. L'hanno detto, e hanno detto anche di piu': con il
     modello si azzecca MENO.

       200 prove, cinque paesi, stessa strada, una variabile sola
         senza il modello   157 su 200   79%
         con il modello     151 su 200   76%

     Due misure indipendenti, stessa direzione: la prima dava sei voci di
     scarto, la seconda tredici. Il numero balla — la strada apre pagine vere e
     i negozi rispondono come vogliono — ma il verso no.

     Sceglie peggio perche' fa la cosa che gli si chiede: guarda dei nomi e
     decide. Su venti nomi che si somigliano, un pareggio lo rompe a caso,
     mentre la classifica lo rompe sempre allo stesso modo — e allo stesso modo
     vuol dire anche che si puo' correggere.

     Cosa si guadagna a spegnerla, oltre alle sei voci:

       · LA STESSA DOMANDA DA' LA STESSA RISPOSTA. Sempre, anche domani.
       · STACCANDO LA CHIAVE non cambia niente. Non «quasi niente»: niente.
       · La fase prezzi scende da 17 secondi a poco piu' di uno.
       · Non si paga piu' nessuno per rispondere sui prezzi.

     Si riaccende con `SCELTA_MODELLO=si`, e serve a una cosa sola: rifare
     questo confronto quando la ricerca sara' cambiata. Il giorno che il metro
     dicesse il contrario, si riaccende per davvero — e si scrive perche'. */
  if (process.env.SCELTA_MODELLO !== "si") return new Map();

  const utili = candidature
    .map((c, i) => ({ ...c, i }))
    .filter((c) => c.candidati.length > 0);
  if (utili.length === 0) return new Map();

  /** A capo come costante: dentro un template annidato l'escape si perde. */
  const NL = String.fromCharCode(10);

  const elenco = utili
    .map(
      (c) =>
        `${c.i}. "${c.voce}"` +
        NL +
        c.candidati.map((k, j) => `   ${j}) ${k.nome} — ${k.insegna}`).join(NL),
    )
    .join(NL);

  const prompt = `Per ogni voce della spesa, scegli quale prodotto le corrisponde.

${elenco}

Rispondi con i numeri di TUTTI i prodotti che corrispondono davvero a quella
voce — servono a confrontare i prezzi fra negozi diversi. Elenco vuoto se non
corrisponde nessuno: meglio nessuno che uno sbagliato.

Una passata di pomodoro non e' una passata di verdure, un'orata non e' una
ricotta, la pasta integrale non e' la pasta sfoglia integrale.
Metti per primo il piu' adatto, e preferisci il prodotto semplice a quello in
confezione multipla o gia' cucinato.

Solo JSON:
{"scelte":[{"voce":0,"scelti":[1,3]},{"voce":1,"scelti":[]}]}`;

  try {
    // Nessuna ricerca: e' la differenza fra qualche millesimo e cinque
    // centesimi. E il modello qui non deve sapere niente del mondo, solo
    // leggere dei nomi.
    const scegli = ilSelettore();
    if (!scegli) return new Map();

    const t0 = Date.now();
    const risposta = await scegli(utili.map((c) => ({ voce: c.voce, candidati: c.candidati })));
    if (!risposta) return new Map();
    console.info(
      `[catalogo] la scelta: ${((Date.now() - t0) / 1000).toFixed(1)}s ` +
        `per ${utili.length} voci`,
    );
    const dati = { scelte: [...risposta.entries()].map(([voce, scelti]) => ({ voce, scelti })) };
    const mappa = new Map<number, number[]>();
    for (const s of dati.scelte ?? []) {
      if (typeof s?.voce !== "number") continue;
      /* Chi risponde consegna gia' una mappa: le forme strane del modello —
         un numero solo invece di un elenco — le raddrizza chi lo interroga,
         che e' il posto giusto perche' e' l'unico che sa com'e' fatto. */
      const elenco = Array.isArray(s.scelti)
        ? s.scelti.filter((x): x is number => typeof x === "number")
        : [];
      mappa.set(s.voce, elenco);
    }
    console.info(`[catalogo] scelte ricevute per ${mappa.size} voci`);
    return mappa;
  } catch (err) {
    console.warn("[catalogo] scelta non riuscita, tengo l'ordine del catalogo:", err);
    return new Map();
  }
}

/**
 * La lista della spesa nella lingua del paese in cui si compra.
 *
 * IL CATALOGO E' SCRITTO NELLA LINGUA DEL NEGOZIO, LA LISTA IN QUELLA
 * DELL'UTENTE, E FINCHE' COINCIDONO NON SI NOTA. Un italiano a Londra chiede
 * «Funghi» e nelle sitemap britanniche quella parola non esiste: c'e'
 * «mushrooms». Il catalogo aveva settantaquattromila prodotti giusti e
 * rispondeva «nessun negozio ha questo prodotto», che e' vero alla lettera e
 * falso nella sostanza.
 *
 * PEGGIO DEL NIENTE, PERO', E' QUELLO CHE TROVAVA PER SBAGLIO. Le parole
 * italiane combaciano con i prodotti di marca italiana venduti in Inghilterra:
 *
 *     Funghi          ->  Schwartz x Bella Italia pollo funghi
 *     Latte           ->  Co-op Cafe Latte 330ml
 *     Pane            ->  Crosta & Mollica pane pugliese
 *
 * Tre prezzi veri attaccati a tre prodotti sbagliati — l'errore di cui l'utente
 * non si accorge, che e' quello che questo codice ha il dovere di non fare.
 *
 * COME, E QUANTO COSTA. Una chiamata sola per tutta la lista, senza ricerca sul
 * web: al modello si chiede solo come si chiama quella cosa al supermercato di
 * quel paese. Se la chiamata fallisce si tengono le parole originali, cioe' il
 * comportamento di prima: una traduzione mancata non deve spegnere il catalogo.
 *
 * L'italiano non passa di qui: per l'Italia la lista e' gia' nella lingua
 * giusta e la chiamata si salta del tutto.
 */
const LINGUA_DEL_PAESE: Record<string, string> = {
  IT: "italiano", AT: "tedesco", DE: "tedesco", GB: "inglese", IE: "inglese",
  US: "inglese", CA: "inglese", ZA: "inglese", IN: "inglese", AU: "inglese",
  ES: "spagnolo", AR: "spagnolo", PT: "portoghese", BR: "portoghese",
  BE: "francese", PL: "polacco", RO: "rumeno", BG: "bulgaro", HR: "croato",
  RS: "serbo", HU: "ungherese", DK: "danese", SE: "svedese", NO: "norvegese",
  LT: "lituano", LV: "lettone", EE: "estone", SI: "sloveno", TR: "turco",
  KR: "coreano", AL: "albanese", BA: "bosniaco",
};

/** Le liste gia' risolte: la stessa spesa non si ripaga due volte. */
const tradotte = new Map<string, string[]>();

/**
 * PRIMA IL DIZIONARIO, POI — SE SERVE — IL MODELLO.
 *
 * `vocabolario.ts` conosce le parole della spesa in sei lingue. Nella
 * stragrande maggioranza delle liste le conosce TUTTE, e allora qui non si
 * chiama nessuno: la traduzione e' istantanea, gratis, e domani sara' identica.
 *
 * Quando avanza qualcosa che il dizionario non sa — «scamorza», «halloumi» —
 * si chiede al modello quelle parole li' e basta, non tutta la lista. E la
 * risposta si insegna al dizionario, cosi' la volta dopo non si chiede piu'.
 *
 * Il risultato: la prima spesa strana costa una chiamata, tutte le successive
 * costano zero. E se il modello e' spento — quota finita, rete giu' — la
 * traduzione NON si ferma: le parole conosciute passano lo stesso, e solo le
 * strane restano nella lingua di partenza. Prima, in quel caso, non passava
 * niente, e Londra dava tre voci su sei.
 */
async function nelleParoleDelPaese(items: string[], paeseIso: string): Promise<string[]> {
  const paese = paeseIso.toUpperCase();
  const lingua = LINGUA_DEL_PAESE[paese];
  if (!lingua || lingua === "italiano") return items;

  const chiave = `${paese}|${items.join("|").toLowerCase()}`;
  const gia = tradotte.get(chiave);
  if (gia) return gia;

  const codice = LINGUA_VOCABOLARIO[paese];

  /* Paesi che il vocabolario non copre — polacco, rumeno, turco... — restano
     sulla vecchia strada: tutta la lista al modello. Sono pochi prodotti e
     poche richieste, e scrivere seicento parole di polacco a mano per coprirli
     non si ripaga. */
  if (!codice) return tuttoAlModello(items, chiave, lingua);

  const rese = items.map((voce) => traduciVoce(voce, codice));
  const sconosciute = [...new Set(rese.flatMap((r) => r.sconosciute))];

  if (sconosciute.length === 0) {
    const pulite = rese.map((r, i) => r.tradotta || items[i]);
    tradotte.set(chiave, pulite);
    console.info(
      `[vocabolario] ${paese}: lista risolta dal dizionario, nessuna chiamata — ` +
        pulite.slice(0, 4).map((x, i) => `${items[i]}->${x}`).join(", "),
    );
    return pulite;
  }

  /* Restano parole ignote. Si chiedono UNA A UNA — cioe' un elenco di parole,
     non di frasi — perche' solo una parola singola si puo' rimettere nel
     dizionario e riusare domani. Una frase tradotta in blocco serve una volta
     sola e poi non torna mai piu' identica.

     E si chiedono a CHIUNQUE sia stato collegato, senza sapere chi sia: se non
     c'e' nessuno — perche' l'API gira per conto suo — si tengono le parole
     conosciute e le altre restano nella lingua di partenza. E' il caso normale
     di un'API staccata, non un guasto. */
  const traduci = ilTraduttore();
  if (!traduci) {
    const parziali = rese.map((r, i) => r.tradotta || items[i]);
    console.info(
      `[vocabolario] ${paese}: nessun traduttore collegato, uso il dizionario da solo ` +
        `(${sconosciute.length} parole restano in lingua originale)`,
    );
    return parziali;
  }

  try {
    const fuori = await traduci(sconosciute, lingua);
    if (!Array.isArray(fuori) || fuori.length !== sconosciute.length) {
      throw new Error("forma inattesa");
    }

    let apprese = 0;
    for (const [i, parola] of sconosciute.entries()) {
      const t = fuori[i];
      if (typeof t === "string" && t.trim()) {
        impara(parola, codice, t.trim());
        apprese++;
      }
    }

    // Rifatta ORA, con le parole appena imparate dentro al dizionario.
    const pulite = items.map((voce, i) => traduciVoce(voce, codice).tradotta || items[i]);
    tradotte.set(chiave, pulite);
    console.info(
      `[vocabolario] ${paese}: ${apprese} parole nuove imparate — ` +
        sconosciute.slice(0, 5).join(", "),
    );
    return pulite;
  } catch (err) {
    /* IL PUNTO DI TUTTO QUESTO. Il modello non ha risposto, ma le parole che il
       dizionario conosceva sono gia' tradotte: si tengono quelle. Le ignote
       restano com'erano, e magari qualcuna combacia lo stesso — i marchi si
       scrivono uguali dappertutto. */
    const parziali = rese.map((r, i) => r.tradotta || items[i]);
    console.warn(
      `[vocabolario] ${paese}: modello non raggiungibile, uso il dizionario da solo ` +
        `(${sconosciute.length} parole restano in lingua originale):`,
      err,
    );
    return parziali;
  }
}

/** La vecchia strada, per le lingue che il vocabolario non copre. */
async function tuttoAlModello(
  items: string[],
  chiave: string,
  lingua: string,
): Promise<string[]> {
  const traduci = ilTraduttore();
  if (!traduci) {
    console.info(`[catalogo] nessun traduttore collegato: tengo le parole originali`);
    return items;
  }

  try {
    const fuori = await traduci(items, lingua);
    if (!Array.isArray(fuori) || fuori.length !== items.length) throw new Error("forma inattesa");

    // Una voce vuota o non tradotta torna com'era: meglio la parola originale
    // di una casella bianca.
    const pulite = fuori.map((x, i) => (typeof x === "string" && x.trim() ? x.trim() : items[i]));
    tradotte.set(chiave, pulite);
    console.info(
      `[catalogo] lista tradotta in ${lingua}: ` +
        pulite.slice(0, 4).map((x, i) => `${items[i]}->${x}`).join(", "),
    );
    return pulite;
  } catch (err) {
    console.warn(`[catalogo] traduzione in ${lingua} non riuscita, tengo le parole originali:`, err);
    return items;
  }
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
    return { prezzi: [], nonRaggiungibili: [], senzaCandidati: items.length, pagineAperte: 0, secondi: 0 };
  }

  /* Si cerca nella lingua del negozio, ma la voce mostrata resta quella
     dell'utente: chi legge la lista vuole rivedere «Funghi», non «mushrooms».
     Per questo `voce` tiene l'originale e solo la ricerca usa la traduzione. */
  const cercabili = await nelleParoleDelPaese(items, paeseIso);

  // Poi i candidati: e' tutto lavoro in memoria, istantaneo dopo il primo
  // caricamento del paese.
  const candidature = await Promise.all(
    items.map(async (voce, i) => ({
      voce,
      candidati: await cercaNelCatalogo(paeseIso, cercabili[i] ?? voce, CANDIDATI_PER_VOCE),
    })),
  );

  const senzaCandidati = candidature.filter((c) => c.candidati.length === 0).length;
  if (senzaCandidati > 0) {
    console.info(`[catalogo] ${senzaCandidati}/${items.length} voci senza nessun candidato`);
  }

  // La scelta: una chiamata sola, senza ricerca, per tutta la lista.
  const scelte = await facciScegliere(candidature);

  /* SI APRE SOLO CIO' CHE IL MODELLO HA SCELTO.
     Prima si aprivano tutti e tre i candidati di ogni voce — cinquantuno
     pagine per diciassette prodotti — e si teneva il primo con un prezzo
     leggibile, cioe' spesso quello sbagliato. Ora la scelta arriva prima:
     meno pagine aperte, meno tempo, e quella giusta. */
  const daAprire = candidature.flatMap((c, i) => {
    const approvati = scelte.get(i);

    /* SI APRONO SOLO I CANDIDATI APPROVATI, E PRIMA NON ERA COSI'.
       Il modello sceglieva UN prodotto, poi si aprivano tutti e sei i
       candidati e si mostravano come alternative quelli che avevano un
       prezzo — compresi quelli che lui aveva scartato.

       Si vedeva: per «pasta integrale» finivano in elenco «pasta sfoglia
       integrale» e «pasta sfoglia con farina integrale», per «riso» una
       pagina di categoria chiamata «pasta pane riso». Prodotti veri, prezzi
       veri, voce sbagliata — l'errore che l'utente non puo' riconoscere.

       Ora al modello si chiedono TUTTI quelli che corrispondono, non uno, e
       si apre solo quell'elenco. Costa meno pagine e le alternative sono
       tutte vagliate: il confronto fra negozi resta, la spazzatura no. */
    if (approvati && approvati.length > 0) {
      return approvati
        .map((n) => c.candidati[n])
        .filter((k): k is (typeof c.candidati)[number] => Boolean(k))
        .map((k, posto) => ({ voce: c.voce, posto, ...k }));
    }

    // Il modello dice "nessuno": la voce resta senza, ed e' la risposta giusta.
    // Meglio una voce vuota che un'orata che diventa una ricotta.
    if (approvati) return [];

    /* Il modello non ha risposto affatto — chiamata fallita, quota finita.
       Allora si tengono tutti i candidati, come si faceva prima: un
       abbinamento imperfetto vale piu' di una voce vuota, e almeno il link
       si apre. */
    return c.candidati.map((k, posto) => ({ voce: c.voce, posto, ...k }));
  });

  /* PRIMA SI GUARDA IN MAGAZZINO.
     Le schede lette nelle ultime ventiquattro ore non si riaprono: il prezzo
     del latte di Alcampo non cambia fra le dieci e le dieci e un minuto, e
     richiederlo a ogni utente voleva dire, con cento persone su Madrid,
     seimila richieste ai negozi spagnoli invece di sessanta.

     Se il database non c'e' o non risponde, la mappa torna vuota e si apre
     tutto come prima: piu' lento, non rotto. */
  const inMagazzino = await prezziGiaVisti(daAprire.map((c) => c.url));
  const daSalvare: PrezzoSalvato[] = [];

  /* CHI ABBIAMO GIA' PROVATO SENZA TROVARE UN PREZZO.
     Prima questo lo diceva una riga in `prezzi` col prezzo a niente: la si
     trovava in magazzino e non si riapriva la pagina. Quelle righe adesso non
     si scrivono piu' — erano sessantacinque megabyte per ripetere quel che gli
     scarti dicono in pochi byte — quindi la stessa risposta va chiesta a loro.

     Senza questo pezzo l'app tornerebbe ad aprire dal vivo, mentre l'utente
     aspetta, le stesse pagine che sappiamo gia' essere mute: un risparmio di
     spazio pagato in secondi di attesa, cioe' un pessimo affare. */
  const insegneInGioco = [...new Set(daAprire.map((c) => c.insegna))];
  const scartatePerInsegna = new Map<string, Set<string>>();
  await Promise.all(
    insegneInGioco.map(async (ins) => scartatePerInsegna.set(ins, await scartiDi(ins, paeseIso))),
  );

  const letti = await aBrani(
    daAprire,
    INSIEME,
    async (c) => {
    const salvato = inMagazzino.get(c.url);
    if (salvato) {
      if (salvato.verifica === "non-raggiungibile") return null;
      return {
        riga: {
          prodotto: c.voce,
          nome: salvato.nome,
          prezzo: salvato.prezzo,
          valuta: salvato.valuta || valuta,
          negozio: c.insegna,
          link: c.url,
          // La data del MAGAZZINO: e' quando quel prezzo e' stato letto.
          letto: salvato.visto?.toISOString(),
          giaVerificato: true,
        } satisfies PrezzoGrezzo,
        posto: c.posto,
      };
    }

    /* Provata e muta: si risponde come rispondeva il magazzino, senza
       aprire niente. */
    if (scartatePerInsegna.get(c.insegna)?.has(improntaUrl(c.url))) {
      return {
        riga: {
          prodotto: c.voce,
          nome: c.nome,
          prezzo: null,
          valuta,
          negozio: c.insegna,
          link: c.url,
          giaVerificato: true,
        } satisfies PrezzoGrezzo,
        posto: c.posto,
      };
    }

    const v = await verifyProductPage(c.url);

    /* LA PAGINA CHE NON DICHIARA IL PREZZO NON SI BUTTA.
       Misurato: su ventiquattro schede aperte, ventidue rispondono 200 ma il
       prezzo non e' nell'HTML — Tigros, Iperal, Esselunga, Unes e CoopShop lo
       disegnano con JavaScript, e li' non c'e' niente da leggere.

       Buttarle era uno spreco, perche' il PRODOTTO era quello giusto:
       `pere-abate`, `zucchine-chiare`, `podere-uova-fresche-medie`. Si perdeva
       un abbinamento corretto e un indirizzo che si apre, per una cifra
       mancante.

       Quindi restano, con `prezzo: null`. L'app le mostra come voce con il suo
       prodotto e il suo link: manca il prezzo, e lo dice. Non entrano nel
       totale — sommare quello che non si sa e' precisamente cio' che non
       vogliamo fare. */
    const prezzo = v.page?.current ?? null;

    /* IL NOME PIU' COMPLETO FRA I DUE, e conta perche' ci sta dentro il peso.
       Il nome del catalogo viene dall'indirizzo: `latte-intero`. Quello che la
       pagina dichiara di solito e' per esteso: «Latte intero UHT 1 l». Il peso
       sta nel secondo, e senza peso non c'e' prezzo al chilo — che oggi si
       riesce a dare solo per un terzo delle offerte.

       Non si prende sempre quello della pagina: a volte e' un titolo di
       vetrina, con dentro il nome del negozio e uno slogan. Si prende solo
       quando aggiunge una QUANTITA' che l'altro non aveva, cioe' solo quando
       porta l'informazione che ci manca. */
    const nomeCatalogo = c.nome.charAt(0).toUpperCase() + c.nome.slice(1);
    const nomePagina = v.page?.nome?.trim();
    const meglio = Boolean(
      nomePagina && !quantitaDa(nomeCatalogo) && quantitaDa(nomePagina),
    );
    if (meglio) {
      console.info(`[nome] dalla pagina: «${nomeCatalogo}» → «${nomePagina}»`);
    } else if (nomePagina && !quantitaDa(nomeCatalogo)) {
      console.info(`[nome] la pagina non aiuta: «${nomeCatalogo}» ← «${nomePagina?.slice(0, 50)}»`);
    }
    const nome = meglio ? (nomePagina as string) : nomeCatalogo;

    /* Si mette da parte anche quel che non si mostra.
       Sapere che una pagina non si apre, o che si apre e il prezzo non lo
       dichiara, vale quanto sapere il prezzo: evita di tornare a chiederlo
       domani per riscoprire la stessa cosa. */
    daSalvare.push({
      url: c.url,
      prezzo,
      valuta: v.page?.currency ?? valuta,
      nome,
      insegna: c.insegna,
      verifica: v.status,
      visto: new Date(),
    });

    // Se la pagina non si apre proprio, quella si butta: un link rotto non
    // serve a nessuno.
    if (v.status === "non-raggiungibile") return null;

    const riga = {
      prodotto: c.voce,
      nome,
      prezzo,
      valuta: v.page?.currency ?? valuta,
      negozio: c.insegna,
      link: c.url,
      // Letta adesso, in questa richiesta.
      letto: new Date().toISOString(),
      giaVerificato: true,
    } satisfies PrezzoGrezzo;
    return { riga, posto: c.posto };
    },
    /* Il dominio serve al freno per negozio: due pagine per volta a testa.
       Se l'indirizzo e' storto si usa la stringa intera — peggio che peggio
       quel candidato aspetta un po' di piu', ma non salta il conteggio. */
    (c) => {
      try {
        return new URL(c.url).hostname;
      } catch {
        return c.url;
      }
    },
  );

  /* Il magazzino si riempie senza far aspettare nessuno.
     L'utente ha gia' i suoi prezzi in mano: una scrittura che non cambia cio'
     che vedra' non deve stare sulla sua strada. Se fallisce, domani si
     rileggono le pagine — come si faceva prima, e nessuno se ne accorge. */
  void salvaPrezzi(daSalvare);
  if (daSalvare.length < daAprire.length) {
    console.info(
      `[magazzino] ${daAprire.length - daSalvare.length}/${daAprire.length} schede ` +
        `prese da database invece che dai negozi`,
    );
  }

  /* UNO PER VOCE, IL PRIMO CHE HA UN PREZZO.
     `letti` puo' contenere piu' candidati della stessa voce: si tiene quello
     con la posizione piu' bassa, cioe' il preferito del modello se ha un
     prezzo, altrimenti il migliore degli altri. Mostrarli tutti darebbe la
     stessa voce due volte con due prodotti diversi. */
  /* UNA RIGA CON IL PREZZO BATTE SEMPRE UNA SENZA.
     Tenendo solo la posizione, il candidato preferito dal modello vinceva
     anche quando la sua pagina non dichiarava il prezzo — e poi veniva
     scartato piu' avanti, portandosi via una riga con il prezzo che stava
     appena dietro. Otto voci diventavano sette.

     Quindi prima si guarda se c'e' il prezzo, e solo a parita' la posizione. */
  /* TUTTE LE INSEGNE CHE HANNO UN PREZZO, NON SOLO LA PRIMA.
     Qui si teneva una riga sola per voce, e le altre — gia' aperte, gia'
     lette, gia' pagate in richieste — venivano buttate. Il motivo scritto era
     che tre candidati di tre catene non sono lo STESSO prodotto, quindi
     mostrarli come confronto sarebbe fuorviante.

     E' vero alla lettera, ma per una spesa e' il confronto che serve: chi
     compra il riso carnaroli vuole sapere che da Aldi costa 1,99 e da Unicoop
     3,29, anche se le due confezioni non sono identiche. L'Italia lo fa gia' —
     passa da `prezziDaiCataloghiIT`, che restituisce una riga per insegna — e
     nell'app si vede: sei negozi su un solo riso. Fuori dall'Italia si vedeva
     un prezzo solo, e non perche' mancassero i dati.

     Una riga per INSEGNA, non per candidato: due prodotti dello stesso negozio
     non sono un confronto, sono la stessa voce due volte. E chi non ha il
     prezzo entra solo se non c'e' nessun altro, perche' una riga senza cifra
     vale come ripiego e non come alternativa. */
  /* Quali voci avevano candidati e quali hanno prodotto almeno una riga: la
     differenza e' l'elenco di chi e' caduto aprendo le pagine. */
  const conCandidati = new Set(
    candidature.filter((c) => c.candidati.length > 0).map((c) => c.voce),
  );
  const conRighe = new Set(letti.filter(Boolean).map((r) => r!.riga.prodotto));
  const nonRaggiungibili = [...conCandidati].filter((v) => !conRighe.has(v));
  if (nonRaggiungibili.length) {
    console.info(
      `[catalogo] ${nonRaggiungibili.length} voci avevano candidati ma nessuna ` +
        `pagina si e' aperta: ${nonRaggiungibili.slice(0, 4).join(", ")}`,
    );
  }

  const perVoceInsegna = new Map<string, { riga: PrezzoGrezzo; posto: number }>();
  for (const r of letti) {
    if (!r) continue;
    const chiave = `${r.riga.prodotto}|${r.riga.negozio}`;
    const gia = perVoceInsegna.get(chiave);
    if (!gia) { perVoceInsegna.set(chiave, r); continue; }
    /* PRIMA LA PERTINENZA, POI IL PREZZO — ed era il contrario.
       Di ogni insegna si tiene una riga sola, e finora vinceva quella che il
       prezzo ce l'aveva: a parita' di niente sembra ragionevole, e invece
       faceva uscire il prodotto SBAGLIATO ogni volta che il giusto non
       dichiarava il prezzo.

       Misurato su duecento voci: ventuno volte il prodotto giusto era stato
       proposto dalla ricerca e poi perso, e parecchie erano questo caso.
         «Tomato puree»    → «Essential tomatoes» batteva «Cirio tomato puree»
         «Möhren»          → «Frosta bio karotten» batteva «naturwert bio moehren»

       Mostrare la cosa sbagliata con un prezzo e' peggio che mostrare quella
       giusta senza: nel secondo caso c'e' `nessun-prezzo-pubblicato`, il link
       si apre e l'utente vede il prezzo con i suoi occhi. Nel primo vede una
       cifra vera attaccata a un prodotto che non ha chiesto — ed e' l'errore
       che non puo' riconoscere.

       Il prezzo resta, ma come spareggio: fra due candidati altrettanto
       pertinenti vince quello che una cifra ce l'ha. */
    const meglio =
      r.posto !== gia.posto
        ? r.posto < gia.posto
        : (r.riga.prezzo != null) && gia.riga.prezzo == null;
    if (meglio) perVoceInsegna.set(chiave, r);
  }

  const perVoce = new Map<string, Array<{ riga: PrezzoGrezzo; posto: number }>>();
  for (const r of perVoceInsegna.values()) {
    const lista = perVoce.get(r.riga.prodotto) ?? [];
    lista.push(r);
    perVoce.set(r.riga.prodotto, lista);
  }

  const prezzi: PrezzoGrezzo[] = [];
  for (const lista of perVoce.values()) {
    const conPrezzo = lista.filter((x) => x.riga.prezzo != null);
    const tenute = conPrezzo.length ? conPrezzo : lista.slice(0, 1);
    // Dal piu' economico: e' l'ordine in cui l'app le mostra.
    tenute.sort((a, b) => (a.riga.prezzo ?? Infinity) - (b.riga.prezzo ?? Infinity));
    prezzi.push(
      ...tenute.slice(0, ALTERNATIVE_MAX).map((x) => ({ ...x.riga, posto: x.posto })),
    );
  }
  const secondi = (Date.now() - t0) / 1000;

  const conPrezzo = new Set(prezzi.filter((p) => p.prezzo != null).map((p) => p.prodotto)).size;
  const conProdotto = new Set(prezzi.map((p) => p.prodotto)).size;
  console.info(
    `[catalogo] ${secondi.toFixed(0)}s, ${daAprire.length} pagine aperte — ` +
      `${conProdotto}/${items.length} voci con prodotto e link, ` +
      `di cui ${conPrezzo} con il prezzo leggibile`,
  );

  return {
    prezzi,
    nonRaggiungibili,
    senzaCandidati, pagineAperte: daAprire.length, secondi };
}
