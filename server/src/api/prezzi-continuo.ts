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
import { prendiTurni, rendiTurni, rinnovaTurni } from "./turni.js";
import { scartiDi, segnaScarti } from "./scarti.js";
import { prezzi as collezionePrezzi } from "../base/db.js";
import { verifyProductPage } from "./price-page.js";
import { GiroInCorso, battitoDiAttesa } from "./giri.js";
import { permessoDiLeggere, riepilogoPermessi } from "./permessi.js";
import {
  FRESCHEZZA_MS,
  improntaUrl,
  numeroInsegnaPubblico as numeroInsegna,
  salvaPrezzi,
  campiDallaPagina,
  salvataggiArrivano,
  type PrezzoSalvato,
} from "./prezzi-magazzino.js";
import { tutteLeFonti } from "./catalogo-fonti.js";
import { gunzip, gunzipSync, gzipSync } from "node:zlib";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
/**
 * Quante richieste insieme allo STESSO negozio, al massimo.
 *
 * E' il numero che decide se siamo ospiti o un assedio, e non dipende da
 * quanto e' potente la nostra macchina: dipende da quanto regge la loro.
 */
const PER_CATENA = Number(process.env.GIRO_PER_CATENA_INSIEME ?? 4);
/**
 * Una pausa fra una pagina e l'altra: siamo ospiti, anche alle tre di notte.
 *
 * CENTOVENTI MILLISECONDI NON SONO POCHI PER TUTTI.
 * Sono otto pagine al secondo per insegna, e per quasi tutte va benissimo. Le
 * spagnole no: Alcampo e Bonpreu aperte a freddo con cinque secondi di pausa
 * danno quattro prezzi su quattro, e col lettore addosso ne danno uno su
 * quattro. Non e' il numero di richieste insieme - era gia' sceso a una per
 * negozio - e' la frequenza.
 *
 * Si regola dal comando, cosi' un paese permaloso puo' avere il suo passo
 * senza rallentare tutti gli altri. Centootto mila indirizzi spagnoli al
 * cento per cento valgono un lettore che ci mette il doppio.
 */
const PAUSA_MS = Number(process.env.GIRO_PAUSA_MS ?? 120);
/**
 * Ogni quante righe si salva. Se il giro si ferma a meta', quel che e' fatto resta.
 *
 * Duecento righe pero' non bastano da sole: un'insegna che rende il quattro
 * per cento ci mette ore ad accumularne duecento, e in quelle ore i prezzi
 * stanno solo in memoria. Per questo `scaricaPrezzi` scrive anche a tempo.
 */
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

/** Le impronte gia' viste per insegna, anche se scadute: vedi il commento sui due elenchi. */
const maiViste = new Map<string, Set<string>>();

/**
 * Le insegne che ci hanno appena sbattuto la porta, e fino a quando.
 *
 * UN RIFIUTO NON VALE TRENTA GIORNI, MA NON VALE NEMMENO ZERO.
 * Una scheda aperta senza prezzo finisce fra gli scarti e non si riapre per un
 * mese: e' un fatto sul negozio. Un 403 no — dice solo che in quel momento non
 * ci hanno voluti, e trattarlo come «senza prezzo» aveva sepolto
 * centosettantamila pagine spagnole.
 *
 * Corretto quello, e' comparso il difetto opposto: non finendo piu' da nessuna
 * parte, le pagine rifiutate tornavano in coda a OGNI giro. Un lettore ha
 * aperto ventisettemilaseicento pagine di fila con zero prezzi, e le avrebbe
 * riaperte all'infinito — inutile per noi e sgradevole per loro.
 *
 * Due ore e' la via di mezzo: abbastanza perche' un blocco temporaneo passi,
 * poco perche' un'insegna sana non resti ferma una giornata. Dura quanto il
 * processo, quindi un lettore riavviato riprova subito: e' un freno, non una
 * condanna.
 */
const ritirateFinoA = new Map<string, number>();
const RITIRO_MS = 2 * 60 * 60 * 1000;

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

/**
 * Dove si tengono i cataloghi gia' scaricati.
 *
 * SCARICARLI COSTA QUARANTACINQUE SECONDI L'UNO, SCOMPATTARLI CINQUANTANOVE
 * MILLISECONDI.
 *
 * Misurato il 20 settembre su Atlas gratuito:
 *
 *     AR|Disco           4.302 KB   scaricato in 45.405 ms   scompattato in 59 ms
 *     CO|Carulla         5.543 KB   scaricato in 57.060 ms   scompattato in 92 ms
 *     UA|Auchan Ukraine  3.050 KB   scaricato in 31.498 ms   scompattato in 49 ms
 *
 * Cento kilobyte al secondo: e' la banda del piano, non il nostro codice. Con
 * dodici insegne per giro sono dieci minuti di attesa PRIMA di aprire una
 * pagina, e il tetto di memoria butta via i cataloghi appena letti, quindi al
 * giro dopo si riscaricano tutti. I lettori sembravano morti — zero CPU, zero
 * pagine — e stavano solo aspettando il download.
 *
 * Un catalogo pero' cambia una volta al mese. Tenerlo sul disco dopo il primo
 * scaricamento trasforma quei quarantacinque secondi in cinque millisecondi,
 * e non costa niente: sono gli stessi byte che Mongo ci manderebbe.
 *
 * La data di aggiornamento fa da chiave: se il catalogo sul database e' piu'
 * recente di quello sul disco, si riscarica. Cosi' il rinfresco settimanale
 * arriva lo stesso, senza che nessuno debba svuotare niente a mano.
 */
const CACHE = "diario/cataloghi";

/**
 * Dove si tiene l'elenco delle schede gia' viste, per non riscaricarlo.
 *
 * Una cartella diversa da quella dei cataloghi perche' sono due cose con due
 * vite: un catalogo cambia una volta al mese, questo elenco cresce ogni
 * minuto. Metterli insieme vorrebbe dire non poter buttare l'uno senza
 * l'altro.
 */
const VISTE = "diario/viste";

function schedarioSulDisco(paese: string, insegna: string): string {
  return `${VISTE}/${paese}-${insegna.replace(/[^\p{L}\p{N}]+/gu, "_")}.json.gz`;
}

interface Schedario {
  /** Quando e' stato scritto: da qui in poi si chiedono solo le novita'. */
  quando: number;
  viste: string[];
  fresche: string[];
}

function elencoDalDisco(paese: string, insegna: string): Schedario | null {
  try {
    const f = schedarioSulDisco(paese, insegna);
    if (!existsSync(f)) return null;
    const d = JSON.parse(gunzipSync(readFileSync(f)).toString("utf8")) as Schedario;
    if (!Array.isArray(d.viste) || typeof d.quando !== "number") return null;
    /* SCADE, E DEVE SCADERE.
       Un elenco che non scade non si accorge mai delle righe cancellate, e
       col tempo dichiara «gia' vista» meta' del catalogo che invece e' da
       rifare. Una settimana: abbastanza da coprire i riavvii di una
       giornata, poco da non diventare una bugia. */
    if (Date.now() - d.quando > 7 * 24 * 3_600_000) return null;
    return d;
  } catch {
    return null;
  }
}

function elencoSulDisco(paese: string, insegna: string, viste: Set<string>, fresche: Set<string>): void {
  try {
    mkdirSync(VISTE, { recursive: true });
    writeFileSync(
      schedarioSulDisco(paese, insegna),
      gzipSync(
        Buffer.from(
          JSON.stringify({ quando: Date.now(), viste: [...viste], fresche: [...fresche] }),
          "utf8",
        ),
        { level: 6 },
      ),
    );
  } catch {
    /* Senza disco si va avanti lo stesso: piu' lenti, non rotti. */
  }
}

function sulDisco(paese: string, insegna: string): string {
  return `${CACHE}/${paese}-${insegna.replace(/[^\p{L}\p{N}]+/gu, "_")}`;
}

async function leggiCatalogo(paese: string, insegna: string): Promise<Array<{ url: string; nome: string }>> {
  /* UN CATALOGO PUO' ESSERE SPEZZATO IN PIU' PEZZI.
     Mongo ammette sedici megabyte per documento e Carrefour Emirati ne occupa
     di piu': i cataloghi grossi si salvano come `PAESE|Insegna` piu' `#2`,
     `#3`... Il primo dice quanti sono; chi legge li rimette insieme. I
     cataloghi vecchi non hanno quel campo e valgono per uno, quindi
     continuano a funzionare senza sapere niente di tutto questo. */
  const col = await cataloghi();
  const capo = (await col.findOne(
    { _id: `${paese}|${insegna}` },
    { projection: { aggiornato: 1, pezzi: 1 } },
  )) as { aggiornato?: Date; pezzi?: number } | null;
  if (!capo) return [];

  const quanti = Math.max(1, Number(capo.pezzi) || 1);
  const quando = capo.aggiornato ? new Date(capo.aggiornato).getTime() : 0;
  const fuori: Array<{ url: string; nome: string }> = [];

  for (let i = 0; i < quanti; i++) {
    const id = i === 0 ? `${paese}|${insegna}` : `${paese}|${insegna}#${i + 1}`;
    const base = `${sulDisco(paese, insegna)}${i === 0 ? "" : "-" + (i + 1)}`;

    let dati: Buffer | null = null;
    try {
      if (existsSync(base + ".gz") && Number(readFileSync(base + ".quando", "utf8")) === quando) {
        dati = readFileSync(base + ".gz");
      }
    } catch {
      /* Cache illeggibile: si riscarica, che e' il ripiego giusto. */
    }

    if (!dati) {
      const doc = (await col.findOne({ _id: id })) as { dati?: { buffer: Buffer } } | null;
      if (!doc?.dati) continue;
      dati = Buffer.from(doc.dati.buffer);
      try {
        mkdirSync(CACHE, { recursive: true });
        writeFileSync(base + ".gz", dati);
        writeFileSync(base + ".quando", String(quando));
      } catch {
        /* Senza disco si va avanti lo stesso: piu' lenti, non rotti. */
      }
    }

    try {
      const testo = (await decomprimi(dati)).toString("utf8");
      /* Si scorre il testo a mano invece di split: quello costruisce un array
         di duecentomila stringhe che esiste solo per essere buttato riga dopo
         riga, e per un attimo la sua memoria si somma a quella del testo E a
         quella degli oggetti. */
      let da = 0;
      while (da < testo.length) {
        let capolinea = testo.indexOf(String.fromCharCode(10), da);
        if (capolinea === -1) capolinea = testo.length;
        const t = testo.indexOf(String.fromCharCode(9), da);
        if (t > da && t < capolinea) {
          fuori.push({ url: testo.slice(da, t), nome: testo.slice(t + 1, capolinea) });
        }
        da = capolinea + 1;
      }
    } catch {
      /* Un pezzo rovinato non deve far perdere gli altri. */
    }
  }

  return fuori;
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
  paesiChiesti: string[],
  minuti: number,
  onAvanzamento?: (fatte: number, conPrezzo: number) => void,
  /**
   * Solo queste insegne, e allora il biglietto e' per INSEGNA, non per paese.
   *
   * PERCHE' ESISTE
   * --------------
   * Il biglietto per paese serve a non aprire le stesse pagine due volte, ed
   * e' la regola giusta quando due lettori leggono lo stesso elenco. Ma
   * quell'elenco lo si legge una volta all'avvio: un lettore acceso ieri non
   * sa che oggi sono state aggiunte Todis, Despar e Xtrawine — e intanto,
   * tenendo il biglietto dell'Italia, impedisce a chiunque altro di leggerle.
   *
   * Misurato il 21 settembre: due Raspberry tenevano Italia ed Emirati per
   * ore; l'Italia e' rimasta a 102.181 prodotti e Xtrawine, 104.961 indirizzi
   * mai aperti, non e' stata toccata. Il lucchetto proteggeva dei negozi che
   * nessuno stava visitando.
   *
   * Con un elenco di insegne il biglietto diventa `IT|Xtrawine`: chi legge
   * quell'insegna la blocca per se', e chi tiene `IT` continua col suo lavoro
   * senza che i due si incontrino. E' piu' fine, non piu' permissivo — due
   * lettori sulla STESSA insegna si escludono esattamente come prima.
   */
  soloInsegne?: string[],
): Promise<EsitoGiro> {
  /* I PAESI SI PRENOTANO, NON SI DANNO PER SCONTATI.
     Due lettori accesi insieme — il PC di casa e Render, o due colleghi — si
     montano quasi la stessa coda, perche' la domanda che fanno al magazzino e'
     la stessa, e aprono le stesse pagine due volte. Il magazzino non ne
     soffre; i negozi si', ed e' il modo piu' rapido di farsi bloccare.

     Qui si prende un biglietto per paese. Chi trova occupato lavora su
     quelli liberi, e se sono tutti occupati non legge — che e' meglio di due
     lettori che si pestano i piedi: il lavoro totale e' lo stesso, le
     richieste ai negozi sono la meta'. Vedi `turni.ts`. */
  /* L'affitto dura poco e si rinnova lavorando: vedi `turni.ts`. Prenderlo
     per tutta la durata del giro vorrebbe dire che una finestra chiusa col
     mouse blocca quei paesi per quasi un'ora. */
  const VALIDITA_MIN = 3;
  /* Il biglietto e' per paese, o per insegna se e' stato chiesto un elenco:
     vedi `soloInsegne`. Quel che segue lavora comunque per paese — cambia solo
     il nome del lucchetto. */
  const perInsegna = (soloInsegne ?? []).filter((x) => x.trim().length > 0);
  /* SOLO LE COPPIE CHE ESISTONO DAVVERO.
     Il prodotto incrociato fra paesi e insegne genera combinazioni che non
     esistono — «AT|Berry Bros», «DE|Peck» — e per ognuna si prende un
     biglietto che non servira' mai a niente. Con otto paesi e venti insegne
     sono centosessanta righe scritte sul database per venti di lavoro vero,
     e un elenco dei biglietti illeggibile proprio quando serve capire chi
     tiene cosa.

     Le fonti sanno gia' quali coppie esistono: si chiede a loro. */
  const chiesti =
    perInsegna.length > 0
      ? tutteLeFonti()
          .filter((f) => paesiChiesti.includes(f.paese) && perInsegna.includes(f.insegna))
          .map((f) => `${f.paese}|${f.insegna}`)
      : paesiChiesti;
  const biglietti = await prendiTurni(chiesti, chiesti.length, VALIDITA_MIN);
  const paesi =
    perInsegna.length > 0
      ? [...new Set(biglietti.map((b) => b.split("|")[0]))]
      : biglietti;
  if (paesi.length === 0) {
    console.info("[giro] tutti i paesi sono presi da un altro lettore: salto il giro");
    /* E lo si scrive anche sul pannello: un lettore acceso che si ritira non
       apre nessun giro, quindi senza questa riga sarebbe indistinguibile da
       uno spento — proprio nel momento in cui uno si chiede perche' non
       lavora. Vedi `battitoDiAttesa`. */
    await battitoDiAttesa("in attesa: tutti i paesi occupati");
    return { aperte: 0, conPrezzo: 0, saltate: 0, secondi: 0, finito: false };
  }
  if (biglietti.length < chiesti.length) {
    const altrui = chiesti.filter((p) => !biglietti.includes(p));
    console.info(`[giro] gia' presi da un altro lettore: ${altrui.join(" ")}`);
  }

  const scadenza = Date.now() + minuti * 60_000;
  const inizio = Date.now();
  let ultimoRinnovo = Date.now();
  /* Le schede senza prezzo di questo giro, per insegna. Si salvano alla fine
     e non una per una: l'elenco si riscrive intero ogni volta, e farlo a ogni
     pagina vorrebbe dire riscrivere due megabyte per ogni scheda vuota. */
  const senzaPrezzo = new Map<string, string[]>();

  /**
   * Mette via le pagine morte MENTRE si lavora, non quando si ha finito.
   *
   * Le schede aperte senza prezzo non lasciano riga in `prezzi` e non stanno
   * ancora in `scarti`: finche' non ci finiscono, per la passata successiva
   * sono «mai viste» e tornano in cima alla coda. Il lettore riapre le stesse
   * pagine morte all'infinito.
   *
   * Si salvava a fine giro — con `--minuti 1400`, dopo un giorno. Poi a fine
   * passata: meglio, ma con ventimila schede per insegna una passata dura ore
   * e il problema restava. Misurato: 246.330 scarti fermi mentre i lettori
   * aprivano ventidue pagine al secondo, meta' senza prezzo.
   *
   * Adesso a tempo. Due minuti e' il compromesso: `segnaScarti` rilegge
   * l'elenco intero dell'insegna e lo riscrive — per Checkers, novantamila
   * impronte, e' un megabyte dentro e uno fuori — quindi farlo troppo spesso
   * costerebbe piu' delle pagine che risparmia. La soglia delle duecento
   * impronte serve allo stesso scopo.
   */
  let ultimoScarico = Date.now();
  let scaricando = false;
  const SCARICO_OGNI_MS = 120_000;

  /**
   * I prezzi si scrivono mentre si legge, non a fine passata.
   *
   * Si salvavano una volta sola, quando la passata finiva. Con ventimila
   * schede per insegna e cinque insegne in coda una passata sono centomila
   * pagine: a tre al secondo, nove ore. Nove ore di prezzi tenuti in memoria,
   * e se il processo cade — o se lo riavvio io per «sistemare» qualcosa — sono
   * tutti persi.
   *
   * Misurato il 22 settembre: i lettori riportavano rese dell'85% e del 94%
   * mentre il totale sul database non si muoveva di una riga, poi arrivava una
   * raffica. Non era un guasto: era il salvataggio che aspettava la fine di
   * una passata lunghissima.
   *
   * Duecento righe o due minuti, quel che viene prima. Duecento perche' una
   * scrittura in blocco da duecento costa quanto una da dieci; due minuti
   * perche' e' il massimo lavoro che accetto di perdere se la macchina si
   * spegne.
   */
  let ultimoPrezzo = Date.now();
  let scrivendo = false;

  const scaricaPrezzi = async (forza = false): Promise<void> => {
    if (scrivendo || raccolte.length === 0) return;
    if (!forza && raccolte.length < BLOCCO && Date.now() - ultimoPrezzo < 120_000) return;
    scrivendo = true;
    ultimoPrezzo = Date.now();
    try {
      await salvaPrezzi(raccolte.splice(0, raccolte.length));
    } finally {
      scrivendo = false;
    }
  };

  const scaricaScarti = async (forza = false): Promise<void> => {
    if (scaricando) return;
    if (!forza && Date.now() - ultimoScarico < SCARICO_OGNI_MS) return;
    scaricando = true;
    ultimoScarico = Date.now();
    try {
      for (const [insegna, impronte] of senzaPrezzo) {
        if (impronte.length === 0) continue;
        if (!forza && impronte.length < 200) continue;
        senzaPrezzo.set(insegna, []);
        await segnaScarti(insegna, paeseDi.get(insegna) ?? "", impronte);
        /* E si tengono anche qui: cosi' la coda montata subito dopo non le
           rimette davanti mentre `scartiDi` ha ancora l'elenco vecchio. */
        const viste = maiViste.get(insegna);
        if (viste) for (const i of impronte) viste.add(i);
      }
    } finally {
      scaricando = false;
    }
  };
  const paeseDi = new Map<string, string>();
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
  const insegneTutte = tutteLeFonti().filter(
    (f) =>
      paesi.includes(f.paese) &&
      f.resa > 0 &&
      (perInsegna.length === 0 || biglietti.includes(`${f.paese}|${f.insegna}`)),
  );
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
  /* Quanti salvataggi di fila non sono arrivati: vedi il controllo nel ciclo. */
  let senzaSalvare = 0;
  let raccolte: PrezzoSalvato[] = [];

  while (Date.now() < scadenza && !finito) {
  /* Si costruisce la coda: da ogni insegna la sua quota, poi si mescola
     alternando le insegne fra loro. */
  const mazzi: Array<Array<{ url: string; nome: string; insegna: string }>> = [];
  /* Almeno un'insegna ha schede mai viste? Se si', i mazzi di solo rinfresco
     si buttano: vedi il commento sulla composizione della coda. */
  let conNuove = false;
  const soloRinfresco: number[] = [];
  for (const f of insegne) {
    if (Date.now() >= scadenza) break;
    /* UN'INSEGNA IN PAUSA NON ENTRA NEMMENO IN CODA.
       Il controllo c'era gia', ma DENTRO il lavoratore: le sue schede
       entravano in coda e venivano saltate una per una, istantaneamente. Con
       una sola insegna in mano e quella in pausa, il giro montava cinquantamila
       voci, le scartava tutte in pochi millisecondi, e ricominciava — un ciclo
       a vuoto che gira a tutta velocita' senza aprire niente.

       Visto sul lettore degli Emirati: Carrefour ci aveva detto no venti volte
       di fila, il lettore ha fatto la cosa giusta mettendola in pausa due ore,
       e poi ha passato quelle due ore a rimontare la stessa coda migliaia di
       volte. Da fuori sembrava un lettore acceso che lavora. */
    if ((ritirateFinoA.get(f.insegna) ?? 0) > Date.now()) continue;
    const tutti = await indirizziDi(f.paese, f.insegna);
    if (tutti.length === 0) continue;

    /* SI CHIEDE IL PERMESSO, E SI CHIEDE QUI.
       Qui perche' e' l'unico punto in cui abbiamo in mano gli indirizzi VERI
       che stiamo per aprire: un `Disallow: /prodotti/` non si vede chiedendo
       il permesso per la home. E costa zero — gli indirizzi sono gia' in
       memoria, il file si scarica una volta ogni dodici ore per insegna.

       Prima di oggi questa domanda non la faceva nessuno: il permesso si
       controllava quando l'insegna entrava in catalogo e poi si dava per
       acquisito. Vedi `permessi.ts`.

       Un IGNOTO — il file non risponde, la rete e' caduta — lascia lavorare.
       Un silenzio non e' un divieto, e trattarlo come tale vorrebbe dire
       spegnere mezzo catalogo alla prima ora di rete ballerina. */
    const varco = await permessoDiLeggere(
      f.paese,
      f.insegna,
      tutti.map((x) => x.url),
    );
    /* E SI BATTE SUBITO DOPO, perche' quella sopra e' una chiamata di rete
       con quindici secondi di pazienza, e sta dentro il ciclo che monta la
       coda. Il battito in fondo al ciclo c'e' gia' ed e' li' per questo
       motivo; questo qui copre il pezzo che e' stato aggiunto dopo. `segna`
       scrive al massimo ogni cinque secondi, quindi non costa niente. */
    giro.segnaPermessi(riepilogoPermessi());
    giro.segna(aperte, conPrezzo, saltate);
    if (varco.esito === "DISALLOW") continue;

    /* DUE ELENCHI, NON UNO, E LA DIFFERENZA E' QUELLA FRA CRESCERE E GIRARE
       A VUOTO.

         FRESCHE  lette da meno di settantadue ore: si saltano, il prezzo ce
                  l'abbiamo ed e' buono.
         VISTE    lette una volta qualsiasi, anche mesi fa.

       Chi e' visto ma non fresco ha un prezzo scaduto: riaprirlo lo rinfresca,
       e serve — ma non aggiunge un prodotto, perche' la riga c'e' gia'. Chi non
       e' mai stato visto invece e' un prodotto in piu'.

       Trattarli allo stesso modo si e' visto nei numeri: tre lettori al cento
       per cento di resa, duecentomila pagine aperte, e il conto dei prodotti
       fermo allo stesso numero per due ore. Stavano rinfrescando, non
       scoprendo.

       Quindi prima le mai viste, poi le scadute. Il rinfresco non si perde: si
       fa dopo, quando non c'e' piu' niente di nuovo da prendere. */
    let sue = gia.get(f.insegna);
    let viste = maiViste.get(f.insegna);
    if (!sue || !viste) {
      const soglia = new Date(Date.now() - FRESCHEZZA_MS);
      const numero = numeroInsegna(f.insegna);

      /* PRIMA SI CHIEDE QUANTE SONO, CHE COSTA NIENTE.
         Per mettere le pagine mai viste in testa alla coda servono gli
         identificativi di quelle gia' lette. Chiederli tutti e' un
         trasferimento vero: su Atlas gratuito la banda e' cento kilobyte al
         secondo, e un'insegna con sessantamila righe sono venti secondi.

         Ma un'insegna appena aggiunta di righe non ne ha NESSUNA — e sono
         proprio quelle con i cataloghi piu' grossi, Argentina, Colombia,
         Ucraina. Per loro l'elenco che torna e' vuoto, e lo si e' aspettato
         per niente. Un conteggio costa una domanda e non trasferisce dati:
         se e' zero, si sa gia' che nessuna scheda e' stata vista. */
      const quante = await (await collezionePrezzi()).countDocuments({ c: numero } as never);

      /* E POI SI CHIEDE SOLO QUEL CHE MANCA.
         Questo elenco costa banda vera: Continente ha 89.000 righe, che a
         novantasei kilobyte al secondo — la banda misurata del piano — sono
         piu' di trenta secondi. Con venti insegne in mano sono dieci minuti
         prima di aprire una pagina, e sette lettori accesi se li dividono la
         stessa banda: ogni riavvio della squadra costava piu' di un'ora di
         lavoro perso, e stanotte di riavvii ne ho fatti otto.

         Le righe pero' non cambiano quasi mai: quelle di ieri sono ancora li'
         oggi. Si tiene l'elenco sul disco con la data dell'ultima lettura, e
         alla volta dopo si chiedono solo le righe toccate DA ALLORA. Su
         un'insegna ferma sono zero righe e un millisecondo.

         Le cancellazioni non si vedono — una riga sparita resta nell'elenco
         come «vista» — e va bene cosi': l'errore e' che una pagina non viene
         riaperta subito, e verra' riaperta quando l'elenco scade. Il
         contrario, credere nuova una pagina gia' letta, costerebbe una
         richiesta al negozio per niente. */
      const daDisco = elencoDalDisco(f.paese, f.insegna);
      const da = daDisco?.quando;
      const righe =
        quante === 0
          ? []
          : ((await (await collezionePrezzi())
              .find(
                da ? ({ c: numero, t: { $gte: new Date(da) } } as never) : ({ c: numero } as never),
                { projection: { _id: 1, t: 1 } },
              )
              .toArray()) as Array<{ _id: string; t?: Date }>);

      /* LE VISTE SI SOMMANO, LE FRESCHE NO.
         «Vista una volta» non scade mai: l'elenco sul disco vale per sempre e
         le novita' si aggiungono. «Fresca» invece scade a settantadue ore, e
         una riga che sul disco era fresca puo' non esserlo piu' — il
         controllo delta non la riporta indietro, perche' da allora nessuno
         l'ha toccata.

         Se l'elenco sul disco e' stato scritto DENTRO la finestra di
         freschezza, l'errore vale quanto e' vecchio l'elenco: minuti, e si
         accetta. Se e' piu' vecchio, le sue fresche si buttano tutte e
         valgono solo quelle appena lette. Sbagliare qui costa un prezzo
         rinfrescato in ritardo, mai un prodotto perso. */
      const frescheDelDisco = daDisco && daDisco.quando >= Date.now() - FRESCHEZZA_MS;
      viste = new Set(daDisco?.viste ?? []);
      sue = new Set(frescheDelDisco ? (daDisco?.fresche ?? []) : []);
      for (const r of righe) {
        viste.add(r._id);
        if (r.t && new Date(r.t) >= soglia) sue.add(r._id);
      }

      gia.set(f.insegna, sue);
      maiViste.set(f.insegna, viste);
      elencoSulDisco(f.paese, f.insegna, viste, sue);
    }

    /* SI SALTANO ANCHE LE SCHEDE CHE IL PREZZO NON CE L'HANNO.
       Il magazzino ricorda solo i successi: una scheda aperta che non espone
       il prezzo non lascia nessuna riga, quindi non risulta mai fresca e
       viene riaperta a ogni giro, per sempre. Misurato su una giornata: dieci
       milioni e mezzo di pagine aperte, quattro e otto con un prezzo — cinque
       milioni e mezzo di aperture a vuoto, ripetute all'infinito.

       Gli scarti scadono dopo trenta giorni, quindi un negozio che cambia
       sito viene comunque riprovato. Vedi `scarti.ts`. */
    const scartate = await scartiDi(f.insegna, f.paese);
    const candidate = tutti.filter(
      (x) => !sue.has(improntaUrl(x.url)) && !scartate.has(improntaUrl(x.url)),
    );
    /* Le mai viste davanti: sono l'unica parte della coda che fa crescere il
       numero dei prodotti. */
    /* SPARSE PER TUTTO L'ELENCO, NON LE PRIME IN FILA.
       Questa e' costata mezza giornata di lettori che sembravano bloccati.

       Il giro prende la sua quota con `daFare.slice(0, MAX_PER_INSEGNA_A_GIRO)`,
       cioe' le PRIME in ordine di catalogo, e l'ordine del catalogo e' quello
       della sitemap del negozio. Misurato il 21 settembre, sulle schede mai
       viste di due insegne:

           UA Auchan Ukraine   le prime 10 in ordine  0/10
                               10 sparse nell'elenco  9/10
           SA Carrefour KSA    le prime 10 in ordine  0/10
                               10 sparse nell'elenco  7/10

       L'inizio di quelle sitemap e' roba morta — prodotti tolti, una
       categoria sparita — e il lettore ci sbatteva contro a ogni giro,
       riportando lo zero per cento con i negozi che rispondevano benissimo.
       Dal di fuori e' identico a un blocco, e per un'ora l'ho creduto tale.

       Si prende quindi una voce ogni `passo`, coprendo tutto l'elenco. Non e'
       a caso: due giri di fila devono dare lo stesso ordine, altrimenti la
       coda non si esaurisce mai. Quel che si salta adesso torna al giro dopo,
       quando le prime saranno fra gli scarti e il passo si accorciera' da
       solo. */
    /* NON BASTA SCEGLIERLE SPARSE: VANNO ANCHE APERTE IN ORDINE SPARSO.
       Il primo rimedio prendeva una voce ogni `passo` e le lasciava in ordine
       di indice — 0, 9, 18, 27... Le prime cinquanta pagine aperte restavano
       quindi dentro i primi cinquecento indirizzi del catalogo, cioe' ancora
       dentro la testa morta. Misurato: il lettore argentino segnava zero su
       250 pagine mentre un campione sparso della stessa insegna dava 6 su 8.

       Ordinare per IMPRONTA risolve tutti e due i problemi in una riga.
       L'impronta e' gia' calcolata, e' distribuita come un numero a caso, ed
       e' STABILE: due giri di fila danno lo stesso ordine, che serve perche'
       la coda si esaurisca invece di rimescolarsi all'infinito. */
    const sparse = <T extends { url: string }>(elenco: T[], quante: number): T[] => {
      if (elenco.length === 0 || quante === 0) return [];
      const ordinato = [...elenco].sort((a, b) =>
        improntaUrl(a.url) < improntaUrl(b.url) ? -1 : 1,
      );
      return ordinato.slice(0, quante);
    };

    /* Le mai viste davanti, e sparse anche loro: sono l'unica parte della coda
       che fa crescere il numero dei prodotti, quindi e' li' che sbagliare
       ordine costa di piu'. */
    const maiVistePronte = candidate.filter((x) => !viste.has(improntaUrl(x.url)));
    const giaVistePronte = candidate.filter((x) => viste.has(improntaUrl(x.url)));

    /* PRIMA TUTTO IL NUOVO, IL RINFRESCO DOPO — E NON «UN PO' E UN PO'».
       La coda prendeva da un'insegna le sue mai viste e, se non bastavano a
       riempire la quota, la completava con le gia' viste da rinfrescare.
       Sembra ragionevole e non lo e', perche' le due cose non valgono
       uguale: una scheda mai vista e' un prodotto in piu', una gia' vista e'
       lo stesso prodotto con la data aggiornata.

       Con ventotto paesi quasi finiti in un lettore solo, quel riempitivo si
       mangiava la coda. Misurato il 23 settembre: UNDICI pagine al secondo
       aperte, rese fra il 76% e il 99% — e ZERO VIRGOLA OTTO righe nuove al
       secondo. Il motore girava a pieno regime rinfrescando roba che aveva
       gia', mentre Alcampo aspettava con 87.767 schede mai aperte e Disco con
       170.518.

       Adesso finche' esiste UNA sola insegna con schede mai viste, la coda e'
       fatta solo di quelle. Il rinfresco non si perde: quando non c'e' piu'
       niente di nuovo da prendere — ed e' il caso di parecchi paesi europei —
       il giro seguente lo fa tutto. */
    const daFare =
      maiVistePronte.length > 0
        ? sparse(maiVistePronte, MAX_PER_INSEGNA_A_GIRO)
        : sparse(giaVistePronte, MAX_PER_INSEGNA_A_GIRO);
    if (maiVistePronte.length > 0) conNuove = true;
    saltate += tutti.length - daFare.length;
    if (daFare.length === 0) continue;
    /* Solo la sua quota: senza questo tetto la coda terrebbe in memoria un
       milione e ottocentomila voci. Il resto alla prossima passata — quel che
       manca si ritrova, perche' il confronto e' sempre col magazzino. */
    /* UN BATTITO ANCHE MENTRE SI MONTA LA CODA.
       Chiedere al magazzino quali schede sono gia' fresche costa una domanda
       per insegna, e su un paese grosso sono ventiquattro domande che tornano
       centomila identificativi: minuti, non secondi. In quei minuti non si
       apre nessuna pagina, quindi con il battito legato alle pagine il lettore
       spariva dai vivi e diventava ambra — «zitto da 48s» — proprio mentre
       stava lavorando. Chi guardava il pannello lo dava per morto e lo
       riavviava, buttando via il lavoro fatto.

       `segna` scrive al massimo ogni cinque secondi, quindi chiamarla a ogni
       insegna non costa niente. I numeri restano a zero, ed e' giusto: zero
       pagine aperte e' la verita'. La riga pero' resta verde. */
    giro.segna(aperte, conPrezzo, saltate);
    /* E SI RINNOVA ANCHE IL BIGLIETTO, PER LO STESSO MOTIVO.
       L'affitto dura tre minuti e si rinnova lavorando; ma montare la coda di
       un paese grosso ne dura di piu', e in quei minuti non si apre nessuna
       pagina — quindi il rinnovo non arrivava mai. Il biglietto scadeva, il
       paese tornava libero, e un'altra macchina poteva prenderselo mentre
       questa ci stava gia' lavorando: il doppio lavoro che i biglietti
       esistono per evitare, causato dal meccanismo stesso.

       Visto sul lettore dedicato all'Italia: sparito dai vivi dopo due
       minuti, Italia di nuovo fra i paesi liberi, e il processo che
       continuava a montare la sua coda. */
    if (Date.now() - ultimoRinnovo > 60_000) {
      ultimoRinnovo = Date.now();
      void rinnovaTurni(biglietti, VALIDITA_MIN);
    }
    paeseDi.set(f.insegna, f.paese);
    if (maiVistePronte.length === 0) soloRinfresco.push(mazzi.length);
    mazzi.push(
      daFare.slice(0, MAX_PER_INSEGNA_A_GIRO).map((x) => ({ ...x, insegna: f.insegna })),
    );
  }

  /* Se qualcuno ha del nuovo, i mazzi di solo rinfresco escono dalla coda:
     rinfrescare mentre c'e' da scoprire e' spendere la stessa richiesta per
     un prodotto che abbiamo gia'. */
  if (conNuove && soloRinfresco.length > 0) {
    for (const i of soloRinfresco.sort((a, b) => b - a)) mazzi.splice(i, 1);
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
       «finito».

       Tranne quando la coda e' vuota perche' le insegne sono in PAUSA: li'
       non e' finito niente, sono loro che per ora non ci vogliono. Si aspetta
       che scada la prima, invece di dire «fatto» o di rimontare la coda a
       vuoto: aspettare e' esattamente la cosa giusta da fare quando qualcuno
       ti ha detto di no. */
    if (coda.length === 0) {
      const fraQuanto = [...ritirateFinoA.values()]
        .filter((q) => q > Date.now())
        .sort((a, b) => a - b)[0];
      if (fraQuanto && fraQuanto < scadenza) {
        const attesa = Math.min(fraQuanto - Date.now() + 1000, 5 * 60_000);
        console.info(
          `[giro] tutte le insegne in pausa: aspetto ${Math.round(attesa / 1000)}s invece di insistere`,
        );
        await battitoDiAttesa("in attesa: insegne in pausa dopo troppi rifiuti");
        await new Promise((r) => setTimeout(r, attesa));
        continue;
      }
      finito = true;
      break;
    }
    if (giro.devoFermarmi) break;

    let prossima = 0;

    /* QUANDO UN NEGOZIO CI DICE DI NO, SI SMETTE DI CHIEDERE.
       Misurato stanotte: Naturitas ha risposto 403 a CINQUANTATREMILA
       richieste di fila e ne abbiamo ricavato zero prezzi. Alcampo, che la
       mattina dava cinque prezzi su sei, dopo settantaseimila pagine rendeva
       l'uno per cento — non era cambiato il loro sito, l'avevamo rate-limitato
       noi col nostro stesso volume.

       Non e' solo lavoro buttato. E' insistere con qualcuno che ha gia' detto
       di no, decine di migliaia di volte, e l'API la rivende un cliente: la
       lamentela arriva a lui. Un blocco isolato puo' essere un caso; venti di
       fila sulla stessa insegna sono una risposta, e la risposta e' no.

       Ci si ferma per questo giro, non per sempre: al prossimo si riprova, e
       se nel frattempo si sono calmati si riparte. */
    const BASTA_COSI = 20;
    const bloccatiDiFila = new Map<string, number>();

    const lavoratore = async () => {
      while (prossima < coda.length && Date.now() < scadenza && !giro.devoFermarmi) {
        const c = coda[prossima++];
        if ((ritirateFinoA.get(c.insegna) ?? 0) > Date.now()) continue;

        const v = await verifyProductPage(c.url);
        aperte++;

        if (v.status === "bloccato") {
          const quanti = (bloccatiDiFila.get(c.insegna) ?? 0) + 1;
          bloccatiDiFila.set(c.insegna, quanti);
          if (quanti >= BASTA_COSI) {
            ritirateFinoA.set(c.insegna, Date.now() + RITIRO_MS);
            console.info(
              `
[giro] ${c.insegna}: ${quanti} rifiuti di fila, la lascio in pace due ore`,
            );
          }
        } else if (bloccatiDiFila.get(c.insegna)) {
          /* Una pagina che si apre azzera il conto: erano singhiozzi, non un no. */
          bloccatiDiFila.set(c.insegna, 0);
        }

        /* LA SCHEDA SENZA PREZZO NON SI SCRIVE PIU' IN `prezzi`.
           La stessa informazione finiva in due posti: una riga intera qui
           (centottantatre byte fra dati e indici) e un'impronta negli scarti
           (pochi byte, compressa). E' l'impronta a impedire di riaprirla; la
           riga pesava e basta. Erano 355.208 righe, sessantacinque megabyte.

           Conta adesso perche' due milioni di prodotti sono trecentosessanta
           megabyte su cinquecentododici del piano: con le righe vuote dentro
           non ci si arriva, ci si ferma a meta' col database pieno — che non
           e' un errore da leggere in un file, e' l'app che smette di
           rispondere. */
        if (v.page?.current != null) {
          raccolte.push({
            url: c.url,
            prezzo: v.page.current,
            valuta: v.page?.currency ?? "",
            nome: c.nome.charAt(0).toUpperCase() + c.nome.slice(1),
            insegna: c.insegna,
            verifica: v.status,
            visto: new Date(),
            ...campiDallaPagina(v),
          });
        }
        if (v.page?.current != null) conPrezzo++;
        /* NIENTE PREZZO E' UNA RISPOSTA; UN RIFIUTO NON LO E'.
           Si annota fra gli scarti solo quando la pagina si e' APERTA e il
           prezzo non c'era: quello e' un fatto sul negozio, vale trenta giorni
           e risparmia milioni di aperture inutili.

           Un 403 o un 202 invece non dicono niente sul prezzo, dicono che in
           quel momento non ci hanno voluti. Trattarli allo stesso modo ha
           congelato il danno peggiore di questa raccolta: martellate le
           insegne spagnole, i loro rifiuti sono finiti fra gli scarti, e
           centosettantamila pagine di Naturitas, Alcampo e Bonpreu sono
           diventate irraggiungibili per un mese - dopo che il prezzo che
           avevano ce l'eravamo gia' fatto scrivere sopra.

           Un rifiuto si riprova al giro dopo, magari piu' piano. */
        else if (v.status === "verificato" || v.status === "pagina-ok") {
          const per = senzaPrezzo.get(c.insegna) ?? [];
          per.push(improntaUrl(c.url));
          senzaPrezzo.set(c.insegna, per);
        }

        /* Costa un confronto di date per pagina, e ogni due minuti una
           scrittura per insegna. Vedi `scaricaScarti`. */
        void scaricaScarti();
        await scaricaPrezzi();
        /* Il salvataggio a blocchi di duecento sta in `scaricaPrezzi`, che alla
           soglia aggiunge un tetto di tempo: vedi li' il perche'. */
        if (aperte % 50 === 0) {
          onAvanzamento?.(aperte, conPrezzo);
          giro.segna(aperte, conPrezzo, saltate);
          /* Il rinnovo viaggia col battito, ma piu' di rado: allungare un
             affitto ogni cinque secondi sarebbe una scrittura inutile ogni
             cinque secondi, per trentuno paesi. */
          if (Date.now() - ultimoRinnovo > 60_000) {
            ultimoRinnovo = Date.now();
            void rinnovaTurni(biglietti, VALIDITA_MIN);
          }
        }
        await attendi(PAUSA_MS);
      }
    };

    /* QUANTI LAVORATORI: NON PIU' DI QUATTRO PER NEGOZIO.
       `INSIEME` e' il tetto della macchina — quanto puo' reggere lei. Ma la
       cortesia non si misura in pagine al secondo: si misura in richieste al
       minuto AL SINGOLO NEGOZIO, ed e' quella che fa scattare i blocchi.

       Finche' la coda alternava dodici paesi il conto tornava da solo:
       quaranta richieste sparse su sessanta catene fanno meno di una a testa.
       Ma con due soli paesi in coda le catene sono cinque o sei, e le stesse
       quaranta richieste diventano sette per negozio — lo stesso lavoro,
       otto volte piu' pesante per chi lo subisce.

       Quattro per catena e' il numero che regge: abbastanza da non aspettare
       un negozio lento, poco abbastanza da restare un visitatore e non un
       assedio. */
    const catene = new Set(coda.map((c) => c.insegna)).size;
    const quanti = Math.max(1, Math.min(INSIEME, catene * PER_CATENA, coda.length));
    if (quanti < INSIEME) {
      console.info(`[giro] ${catene} catene in coda: ${quanti} pagine insieme invece di ${INSIEME}`);
    }
    await Promise.all(Array.from({ length: quanti }, lavoratore));
    if (raccolte.length > 0) {
      await salvaPrezzi(raccolte.splice(0, raccolte.length));

      /* SE I SALVATAGGI NON ARRIVANO, SI SMETTE. NON SI FINGE.
         `salvaPrezzi` sta dentro l'interruttore e non esplode mai: quando il
         database non risponde restituisce il ripiego e il lettore va avanti
         convinto di lavorare. Il 22 settembre un intoppo del DNS ha rotto la
         connessione e i lettori hanno continuato per un'ora — pagine aperte,
         prezzi trovati, rese del 92%, e nemmeno una riga scritta. Dal pannello
         sembravano sani.

         Due tentativi a vuoto di fila bastano: un salvataggio che fallisce e
         poi riesce e' un singhiozzo di rete, due sono un guasto. Si chiude il
         giro dicendolo — il lettore esterno riparte da solo dopo trenta
         secondi, e ripartire rifa' la risoluzione del nome, che e'
         esattamente la cura. */
      if (!salvataggiArrivano()) {
        senzaSalvare++;
        if (senzaSalvare >= 2) {
          console.error(
            `
[giro] IL DATABASE NON PRENDE PIU' QUEL CHE LEGGO: ` +
              `due salvataggi a vuoto di fila. Chiudo il giro invece di continuare a ` +
              `leggere per niente — le pagine aperte da qui in poi sarebbero buttate.`,
          );
          break;
        }
      } else senzaSalvare = 0;
    }

    /* Il salvataggio degli scarti non sta piu' qui: vedi `scaricaScarti`, che
       gira a tempo dentro il lavoratore. Una passata con ventimila schede per
       insegna dura ore, e aspettarne la fine era quasi come aspettare la fine
       del giro. */
  }

  if (raccolte.length > 0) await salvaPrezzi(raccolte);

  /* Gli scarti si salvano prima di chiudere: se il giro e' stato interrotto,
     quel che si e' imparato resta comunque. */
  await scaricaScarti(true);
  for (const [insegna, impronte] of senzaPrezzo) {
    if (impronte.length === 0) continue;
    await segnaScarti(insegna, paeseDi.get(insegna) ?? "", impronte);
  }
  if (senzaPrezzo.size > 0) {
    const quante = [...senzaPrezzo.values()].reduce((t, x) => t + x.length, 0);
    console.info(`[giro] segnate ${quante} schede senza prezzo: non si riaprono per 30 giorni`);
  }

  await giro.chiudi(giro.devoFermarmi ? "interrotto" : finito ? "catalogo finito" : "tempo scaduto");
  /* Si rendono i biglietti appena finito, senza aspettare la scadenza: il
     lettore successivo puo' ripartire da questi paesi subito invece che fra
     cinquanta minuti. */
  await rendiTurni(biglietti);

  return {
    aperte,
    conPrezzo,
    saltate,
    secondi: (Date.now() - inizio) / 1000,
    finito,
  };
}
