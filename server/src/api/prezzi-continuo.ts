/**
 * Il giro che non finisce mai: ogni notte riprende da dove aveva lasciato.
 *
 * PERCHE' NON SI PARTE OGNI VOLTA DA CAPO
 * ---------------------------------------
 * Il magazzino dei prezzi si svuota da solo: una riga vale settantadue ore,
 * poi c'e' ma non si mostra piu'. Un lavoro notturno che ogni volta ricomincia
 * dalla prima voce della lista rifa' sempre gli stessi prodotti e non arriva
 * mai agli altri — e di catalogo ce n'e' 1,8 milioni.
 *
 * Qui si salta tutto quel che e' ancora fresco e si apre solo il resto. La
 * seconda notte tocca le schede che la prima non ha fatto in tempo a fare, la
 * terza quelle ancora dopo, e cosi' via.
 *
 * GIRA TUTTE LE NOTTI, MA OGNI PRODOTTO LO RIVEDE OGNI TRE GIORNI
 * ---------------------------------------------------------------
 * Non serve programmarlo «ogni tre o quattro giorni»: si regola da solo. La
 * soglia di freschezza e' settantadue ore, quindi una scheda letta stanotte
 * viene saltata domani e dopodomani, e riaperta la quarta notte. Il ritmo per
 * prodotto e' quello giusto, e intanto ogni notte e' piena di lavoro utile
 * invece di essere sprecata o saltata.
 *
 * DOVE SI FERMA DA SOLO, E VA SAPUTO PRIMA DI SPERARE
 * ---------------------------------------------------
 * FRESCHEZZA — non e' piu' il collo di bottiglia. A ventiquattro ore lo era:
 * dodici pagine al secondo per un giorno fanno un milione di schede, e tutto
 * il resto restava perennemente scaduto. A settantadue il conto e' 3,6
 * milioni, il doppio di quante ne abbiamo.
 *
 * SPAZIO — questo si'. 443 byte per riga, indici compresi: un milione di
 * prezzi sono 443 MB, e il piano Atlas gratuito ne ha 512 in tutto, di cui 69
 * gia' occupati dai cataloghi. Si supera in due modi, e nessuno dei due e'
 * codice da scrivere qui: accorciare la riga (l'indirizzo completo fa da
 * chiave e pesa piu' di tutto il resto) oppure pagare un piano piu' grande.
 *
 * SUL RISPETTO DEI NEGOZI
 * -----------------------
 * Un giro continuo non e' un giro veloce. Si tiene lo stesso passo del lavoro
 * mirato — otto pagine insieme, una pausa fra l'una e l'altra — e si smette
 * quando il tempo concesso finisce, non quando il catalogo finisce. Il tempo
 * lo decide chi chiama: di notte tanto, a mano poco.
 */

import { cataloghi } from "../base/db.js";
import { prezzi as collezionePrezzi } from "../base/db.js";
import { verifyProductPage } from "./price-page.js";
import { GiroInCorso } from "./giri.js";
import {
  FRESCHEZZA_MS,
  improntaUrl,
  numeroInsegnaPubblico as numeroInsegna,
  salvaPrezzi,
  type PrezzoSalvato,
} from "./prezzi-magazzino.js";
import { tutteLeFonti } from "./catalogo-fonti.js";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";

/* Decomprimere in modo SINCRONO congela tutto il processo finche' non ha
   finito: niente battito, niente risposta al pannello, niente. Su Render sono
   stati due minuti di silenzio con zero pagine aperte, e da fuori sembrava
   morto invece che occupato. La versione asincrona fa lo stesso lavoro su un
   altro filo, e il servizio resta vivo mentre lo fa. */
const decomprimi = promisify(gunzip);

/**
 * Quante pagine insieme.
 *
 * Erano otto quando si apriva un'insegna alla volta, e otto era il massimo
 * educato: erano otto richieste allo STESSO negozio. Adesso la coda alterna le
 * insegne, quindi sedici richieste insieme vanno quasi sempre a sedici negozi
 * diversi — e ognuno ne riceve una alla volta, cioe' meno di prima.
 */
const INSIEME = Number(process.env.GIRO_INSIEME ?? 16);
/** Una pausa fra una pagina e l'altra: siamo ospiti, anche alle tre di notte. */
const PAUSA_MS = 120;
/** Ogni quante righe si salva. Se il giro si ferma a meta', quel che e' fatto resta. */
const BLOCCO = 200;

/**
 * Quante schede al massimo per insegna, in una passata.
 *
 * Senza questo tetto la rotazione fra i paesi non ruota: Naturitas ha centomila
 * indirizzi, e li aprirebbe tutti prima di lasciare il turno al paese dopo.
 * Il giro finirebbe con un paese pieno e trenta a zero — esattamente cio' che
 * la rotazione doveva evitare.
 *
 * Cinquecento e' abbastanza per fare differenza in un paese e poco abbastanza
 * per tornare presto. Chi ne ha di piu' li fa nella passata successiva: il
 * giro riprende sempre da quel che manca.
 */
/**
 * Quante schede per insegna in UN GIRO della rotazione.
 *
 * Era duemila, e con novantatre insegne faceva una coda da 186.000 voci
 * costruita tutta in anticipo: cinquantasette megabyte, su una macchina che ne
 * ha 512 in tutto. Render ha superato il limite e si e' riavviato da solo.
 *
 * Duecento tiene la coda sotto i sei megabyte e non cambia niente al risultato:
 * la rotazione fa piu' giri, e ogni giro riprende da cio' che manca. Il tempo
 * concesso e' lo stesso, le pagine aperte sono le stesse — cambia solo quanta
 * roba sta in memoria mentre si aprono.
 */
const MAX_PER_INSEGNA_A_GIRO = Number(process.env.GIRO_PER_INSEGNA ?? 200);

const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Finestra scorrevole: appena una pagina finisce ne parte un'altra. */
async function aBrani<T>(cose: T[], quante: number, lavoro: (c: T) => Promise<void>) {
  let prossima = 0;
  const lavoratore = async () => {
    while (prossima < cose.length) await lavoro(cose[prossima++]);
  };
  await Promise.all(Array.from({ length: Math.min(quante, cose.length) }, lavoratore));
}

/**
 * Gli indirizzi di un'insegna, tenuti da parte dopo la prima lettura.
 *
 * Un catalogo salvato e' un pacchetto compresso da decine di migliaia di
 * righe: leggerlo e decomprimerlo costa. Finche' si faceva un'insegna alla
 * volta fino in fondo si pagava una volta sola, ma da quando il giro ruota fra
 * i paesi ogni insegna torna ogni passata — e senza questa memoria si pagava
 * quel prezzo ogni volta.
 *
 * Misurato: il giro era sceso da ventuno pagine al secondo a una e mezza, e
 * non era la rete — era il gunzip.
 */
const cataloghiLetti = new Map<string, Array<{ url: string; nome: string }>>();

/**
 * Quante voci di catalogo si tengono in memoria, in tutto.
 *
 * Su Render ci sono 512 MB per tutto, e un milione e ottocentomila voci non ci
 * stanno. Quando si supera il tetto si butta via il catalogo letto per primo:
 * alla prossima passata si rilegge, e costa un gunzip invece di un 502.
 */
/* Ventimila e non sessantamila, e il valore di prima era una misura fatta su
   una macchina con sedici giga. Su Render, mezzo giga in tutto, sessantamila
   voci tenute in memoria piu' il picco della decompressione ci hanno fatti
   uccidere due volte in una notte: la seconda con la mail di Render alle 02:54.
   Chi ha memoria da spendere alza la variabile e se la riprende. */
const MAX_VOCI_IN_MEMORIA = Number(process.env.GIRO_MAX_VOCI ?? 20_000);
let vociInMemoria = 0;

function faiPosto(quante: number): void {
  while (vociInMemoria + quante > MAX_VOCI_IN_MEMORIA && cataloghiLetti.size > 0) {
    const primo = cataloghiLetti.keys().next().value as string;
    vociInMemoria -= cataloghiLetti.get(primo)?.length ?? 0;
    cataloghiLetti.delete(primo);
  }
}

/**
 * Quel che questo giro ha gia' fatto, insegna per insegna.
 *
 * La domanda «di questa insegna, cosa e' gia' fresco?» costa un viaggio al
 * database e puo' tornare centomila identificativi. Farla a ogni passata, per
 * centoventitre insegne, e' la seconda meta' del rallentamento.
 *
 * Si chiede una volta per giro, e poi si aggiunge quel che si prezza: dentro
 * un giro nessun altro scrive in quella collezione.
 */
const gia = new Map<string, Set<string>>();

async function indirizziDi(paese: string, insegna: string): Promise<Array<{ url: string; nome: string }>> {
  const chiave = `${paese}|${insegna}`;
  const gia = cataloghiLetti.get(chiave);
  if (gia) return gia;
  const letti = await leggiCatalogo(paese, insegna);
  faiPosto(letti.length);
  cataloghiLetti.set(chiave, letti);
  vociInMemoria += letti.length;
  return letti;
}

async function leggiCatalogo(paese: string, insegna: string): Promise<Array<{ url: string; nome: string }>> {
  const doc = await (await cataloghi()).findOne({ _id: `${paese}|${insegna}` });
  if (!doc?.dati) return [];
  try {
    const testo = (await decomprimi(Buffer.from(doc.dati.buffer))).toString("utf8");
    const fuori: Array<{ url: string; nome: string }> = [];
    /* Si scorre il testo a mano invece di `split("\n")`: quello costruisce un
       array di duecentomila stringhe che esiste solo per essere buttato riga
       dopo riga, e per un attimo la sua memoria si somma a quella del testo E a
       quella degli oggetti. Su mezzo giga quell'attimo e' l'uccisione. */
    let da = 0;
    while (da < testo.length) {
      let fine = testo.indexOf("\n", da);
      if (fine === -1) fine = testo.length;
      const t = testo.indexOf("\t", da);
      if (t > da && t < fine) {
        fuori.push({ url: testo.slice(da, t), nome: testo.slice(t + 1, fine) });
      }
      da = fine + 1;
    }
    return fuori;
  } catch {
    return [];
  }
}

export interface EsitoGiro {
  aperte: number;
  conPrezzo: number;
  saltate: number;
  secondi: number;
  finito: boolean;
}

/**
 * Apre schede finche' il tempo concesso non finisce, partendo dalle piu' vecchie.
 *
 * `minuti` e' un tetto, non un obiettivo: se il catalogo finisce prima, si
 * ferma prima e lo dice con `finito`.
 */
export async function giroContinuo(
  paesi: string[],
  minuti: number,
  onAvanzamento?: (fatte: number, conPrezzo: number) => void,
): Promise<EsitoGiro> {
  const scadenza = Date.now() + minuti * 60_000;
  const inizio = Date.now();
  let aperte = 0;
  let conPrezzo = 0;
  let saltate = 0;

  /* Il registro dei giri. Serve a chi guarda il pannello da un'altra macchina: senza,
     l'unico modo di sapere se il lettore sta lavorando e' avere sotto gli occhi
     il terminale in cui e' stato lanciato. Vedi `giri.ts`. */
  const giro = new GiroInCorso("giro continuo", paesi);
  /* Un battito SUBITO, prima di qualunque lavoro.
     Fra il «parti» e la prima pagina aperta c'e' il montaggio della coda, che
     legge e decomprime i cataloghi: e' la parte che consuma piu' memoria, ed e'
     quella in cui un piano da mezzo giga viene ucciso. Se il primo battito
     arrivasse dopo, un giro morto li' non lascerebbe nessuna traccia — ha detto
     «partito» e non e' successo niente, che e' esattamente cio' che si e' visto
     su Render. Col battito qui, la riga compare, poi diventa ambra, poi
     sparisce: si legge che e' morto montando la coda. */
  giro.segna(0, 0, 0);

  /* UNA CODA SOLA, MESCOLATA FRA I NEGOZI.
     La versione di prima faceva un'insegna alla volta e apriva otto pagine
     insieme dello STESSO negozio: se quel negozio era lento, otto lavoratori
     aspettavano lui. Misurato, il giro era sceso da ventuno pagine al secondo
     a una e tre quarti.

     Adesso si prepara una coda in cui le schede si alternano fra le insegne, e
     otto lavoratori ci pescano: ogni richiesta che parte va quasi sempre a un
     negozio diverso da quella prima. E' piu' veloce per noi — un negozio lento
     non ferma gli altri sette — ed e' piu' LEGGERO PER LORO, perche' ognuno
     riceve una richiesta alla volta invece di otto.

     E l'ordine della coda tiene insieme le due cose che servono: si alternano i
     PAESI, cosi' crescono tutti insieme invece che uno alla volta, e dentro
     ogni paese si parte dall'insegna piu' generosa. */
  const insegneTutte = tutteLeFonti().filter((f) => paesi.includes(f.paese) && f.resa > 0);
  const perPaese = new Map<string, typeof insegneTutte>();
  for (const f of insegneTutte) {
    const sue = perPaese.get(f.paese) ?? [];
    sue.push(f);
    perPaese.set(f.paese, sue);
  }
  for (const sue of perPaese.values()) sue.sort((a, b) => b.resa - a.resa);

  const insegne: typeof insegneTutte = [];
  for (let giro = 0; ; giro++) {
    let aggiunta = false;
    for (const sue of perPaese.values()) {
      if (giro >= sue.length) continue;
      insegne.push(sue[giro]);
      aggiunta = true;
    }
    if (!aggiunta) break;
  }

  /* PIU' TORNATE, NON UNA CODA SOLA.
     Con duecento schede per insegna la coda e' da diciottomila voci e si
     esaurisce in un quarto d'ora: senza questo ciclo il giro finirebbe molto
     prima del tempo concesso.

     Costruirla e consumarla piu' volte costa qualche secondo in piu' e tiene
     la memoria a sei megabyte invece di cinquantasette. E' il compromesso che
     e' costato un riavvio a Render: la prima versione la costruiva tutta in
     anticipo per risparmiare quei secondi. */
  let finito = false;
  let raccolte: PrezzoSalvato[] = [];

  while (Date.now() < scadenza && !finito) {
  /* Si costruisce la coda: da ogni insegna la sua quota, poi si mescola
     alternando le insegne fra loro. */
  const mazzi: Array<Array<{ url: string; nome: string; insegna: string }>> = [];
  for (const f of insegne) {
    if (Date.now() >= scadenza) break;
    const tutti = await indirizziDi(f.paese, f.insegna);
    if (tutti.length === 0) continue;

    let sue = gia.get(f.insegna);
    if (!sue) {
      const soglia = new Date(Date.now() - FRESCHEZZA_MS);
      sue = new Set(
        (
          await (await collezionePrezzi())
            .find({ c: numeroInsegna(f.insegna), t: { $gte: soglia } }, { projection: { _id: 1 } })
            .toArray()
        ).map((r) => r._id),
      );
      gia.set(f.insegna, sue);
    }

    const daFare = tutti.filter((x) => !sue.has(improntaUrl(x.url)));
    saltate += tutti.length - daFare.length;
    if (daFare.length === 0) continue;
    /* Solo la sua quota: senza questo tetto la coda terrebbe in memoria un
       milione e ottocentomila voci. Il resto alla prossima passata — quel che
       manca si ritrova, perche' il confronto e' sempre col magazzino. */
    mazzi.push(
      daFare.slice(0, MAX_PER_INSEGNA_A_GIRO).map((x) => ({ ...x, insegna: f.insegna })),
    );
  }

  const coda: Array<{ url: string; nome: string; insegna: string }> = [];
  for (let i = 0; ; i++) {
    let aggiunta = false;
    for (const m of mazzi) {
      if (i >= m.length) continue;
      coda.push(m[i]);
      aggiunta = true;
    }
    if (!aggiunta) break;
  }

    /* Coda vuota vuol dire che non c'e' piu' niente da aprire in nessuna
       insegna: tutto il catalogo e' fresco. E' il solo modo onesto di dire
       «finito». */
    if (coda.length === 0) {
      finito = true;
      break;
    }
    if (giro.devoFermarmi) break;

    let prossima = 0;
    const lavoratore = async () => {
      while (prossima < coda.length && Date.now() < scadenza && !giro.devoFermarmi) {
        const c = coda[prossima++];
        const v = await verifyProductPage(c.url);
        aperte++;
        raccolte.push({
          url: c.url,
          prezzo: v.page?.current ?? null,
          valuta: v.page?.currency ?? "",
          nome: c.nome.charAt(0).toUpperCase() + c.nome.slice(1),
          insegna: c.insegna,
          verifica: v.status,
          visto: new Date(),
        });
        if (v.page?.current != null) conPrezzo++;
        if (raccolte.length >= BLOCCO) await salvaPrezzi(raccolte.splice(0, raccolte.length));
        if (aperte % 50 === 0) {
          onAvanzamento?.(aperte, conPrezzo);
          giro.segna(aperte, conPrezzo, saltate);
        }
        await attendi(PAUSA_MS);
      }
    };

    await Promise.all(Array.from({ length: Math.min(INSIEME, coda.length) }, lavoratore));
    if (raccolte.length > 0) await salvaPrezzi(raccolte.splice(0, raccolte.length));
  }

  if (raccolte.length > 0) await salvaPrezzi(raccolte);

  await giro.chiudi(giro.devoFermarmi ? "interrotto" : finito ? "catalogo finito" : "tempo scaduto");

  return {
    aperte,
    conPrezzo,
    saltate,
    secondi: (Date.now() - inizio) / 1000,
    finito,
  };
}
