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
import { paesiConCatalogo } from "./catalogo-fonti.js";
import { verifyProductPage } from "./price-page.js";
import { chiamaMenu, MENU_MODEL, parseJson } from "./plan-grounded.js";

/** La stessa forma che producono le altre due strade. */
export interface PrezzoGrezzo {
  prodotto: string;
  nome: string;
  prezzo: number | null;
  valuta: string;
  negozio: string;
  link: string;
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


/** La scelta del modello per una voce: quale candidato, o nessuno. */
interface Scelta {
  voce: number;
  scelto: number | null;
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
): Promise<Map<number, number | null>> {
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

Rispondi con il numero del prodotto scelto, oppure null se NESSUNO corrisponde
davvero — meglio nessuno che uno sbagliato. Una passata di pomodoro non e' una
passata di verdure, un'orata non e' una ricotta.
Preferisci il prodotto semplice a quello in confezione multipla o gia' cucinato.

Solo JSON:
{"scelte":[{"voce":0,"scelto":1},{"voce":1,"scelto":null}]}`;

  try {
    // Nessuna ricerca: e' la differenza fra qualche millesimo e cinque
    // centesimi. E il modello qui non deve sapere niente del mondo, solo
    // leggere dei nomi.
    const r = await chiamaMenu(MENU_MODEL, prompt, 60_000);
    const dati = parseJson(r.text) as { scelte?: Scelta[] };
    const mappa = new Map<number, number | null>();
    for (const s of dati.scelte ?? []) {
      if (typeof s?.voce === "number") mappa.set(s.voce, typeof s.scelto === "number" ? s.scelto : null);
    }
    console.info(
      `[catalogo] il modello ha scelto per ${mappa.size} voci ` +
        `($${r.cost.toFixed(4)}, nessuna ricerca)`,
    );
    return mappa;
  } catch (err) {
    console.warn("[catalogo] scelta non riuscita, tengo l'ordine del catalogo:", err);
    return new Map();
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

  // La scelta: una chiamata sola, senza ricerca, per tutta la lista.
  const scelte = await facciScegliere(candidature);

  /* SI APRE SOLO CIO' CHE IL MODELLO HA SCELTO.
     Prima si aprivano tutti e tre i candidati di ogni voce — cinquantuno
     pagine per diciassette prodotti — e si teneva il primo con un prezzo
     leggibile, cioe' spesso quello sbagliato. Ora la scelta arriva prima:
     meno pagine aperte, meno tempo, e quella giusta. */
  const daAprire = candidature.flatMap((c, i) => {
    const scelto = scelte.get(i);
    // Il modello dice "nessuno": la voce resta senza, ed e' la risposta giusta.
    // Meglio una voce vuota che un'orata che diventa una ricotta.
    if (scelte.has(i) && scelto === null) return [];

    /* IL SUO PREFERITO PER PRIMO, MA GLI ALTRI RESTANO DIETRO.
       Aprendo solo la pagina scelta la qualita' saliva — «Orata fresca»
       trovava finalmente un'orata — ma la copertura crollava da nove voci a
       cinque: se quella singola pagina non dichiara il prezzo in modo
       leggibile, la voce resta vuota anche se il prodotto era giusto.

       Quindi si tengono tutti, con il preferito in testa. Piu' avanti si
       prende il primo che ha un prezzo, e l'ordine fa il resto. */
    const preferito = typeof scelto === "number" ? c.candidati[scelto] : undefined;
    const ordinati = preferito
      ? [preferito, ...c.candidati.filter((k) => k !== preferito)]
      : c.candidati;
    return ordinati.map((k, posto) => ({ voce: c.voce, posto, ...k }));
  });

  const letti = await aBrani(daAprire, INSIEME, async (c) => {
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

    // Se la pagina non si apre proprio, quella si butta: un link rotto non
    // serve a nessuno.
    if (v.status === "non-raggiungibile") return null;

    const riga = {
      prodotto: c.voce,
      // Il nome del catalogo viene dall'indirizzo ed e' tutto minuscolo:
      // la prima lettera maiuscola lo rende leggibile in elenco.
      nome: c.nome.charAt(0).toUpperCase() + c.nome.slice(1),
      prezzo,
      valuta: v.page?.currency ?? valuta,
      negozio: c.insegna,
      link: c.url,
      giaVerificato: true,
    } satisfies PrezzoGrezzo;
    return { riga, posto: c.posto };
  });

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
  const perVoce = new Map<string, { riga: PrezzoGrezzo; posto: number }>();
  for (const r of letti) {
    if (!r) continue;
    const gia = perVoce.get(r.riga.prodotto);
    if (!gia) { perVoce.set(r.riga.prodotto, r); continue; }
    const hoPrezzo = r.riga.prezzo != null;
    const avevaPrezzo = gia.riga.prezzo != null;
    const meglio = hoPrezzo !== avevaPrezzo ? hoPrezzo : r.posto < gia.posto;
    if (meglio) perVoce.set(r.riga.prodotto, r);
  }
  const prezzi: PrezzoGrezzo[] = [...perVoce.values()].map((x) => x.riga);
  const secondi = (Date.now() - t0) / 1000;

  const conPrezzo = new Set(prezzi.filter((p) => p.prezzo != null).map((p) => p.prodotto)).size;
  const conProdotto = new Set(prezzi.map((p) => p.prodotto)).size;
  console.info(
    `[catalogo] ${secondi.toFixed(0)}s, ${daAprire.length} pagine aperte — ` +
      `${conProdotto}/${items.length} voci con prodotto e link, ` +
      `di cui ${conPrezzo} con il prezzo leggibile`,
  );

  return { prezzi, senzaCandidati, pagineAperte: daAprire.length, secondi };
}
