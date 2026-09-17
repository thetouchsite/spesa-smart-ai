/**
 * L'aggiornamento del catalogo, a mezzanotte.
 *
 * PERCHE' DI NOTTE E PERCHE' UNA VOLTA AL GIORNO
 * ----------------------------------------------
 * Di notte perche' scaricare le sitemap di un paese sono decine di megabyte e
 * qualche decina di secondi: farlo mentre qualcuno aspetta il suo piano
 * significherebbe rallentarlo per niente.
 *
 * DUE MESTIERI, NON UNO
 * ---------------------
 * Prima qui c'era scritto «qui dentro non ci sono prezzi», ed era vero: si
 * rinfrescavano gli indirizzi e basta, mentre i prezzi li leggeva l'app una
 * pagina alla volta con l'utente che aspettava. Il magazzino dei prezzi si
 * riempiva solo se qualcuno lanciava uno script a mano, quindi quasi mai.
 *
 * Ora la notte fa tutte e due le cose, in quest'ordine:
 *
 *   1. il CATALOGO — gli indirizzi, dalle sitemap. Cambia lentamente: un
 *      prodotto nuovo compare, uno vecchio sparisce.
 *   2. i PREZZI della spesa di base — le sessanta voci che tornano in quasi
 *      ogni lista, aperte una volta per tutti invece che una volta per
 *      ciascuno. Vedi `prezzi-notturni.ts`.
 *
 * Il prezzo letto stanotte vale ventiquattro ore. Piu' vecchio di cosi' non
 * si mostra: la pagina si riapre. Quindi al peggio l'app fa quel che faceva
 * prima, e al meglio — quasi sempre — trova tutto pronto.
 *
 * QUESTO NON E' UN CRON, ED E' IMPORTANTE SAPERLO
 * -----------------------------------------------
 * E' un timer dentro il processo. Se il processo non gira, non scatta — e sul
 * piano gratuito di Render il servizio si spegne dopo quindici minuti di
 * silenzio, quindi a mezzanotte quasi certamente dorme e l'appuntamento salta.
 *
 * Per questo c'e' anche il recupero all'avvio: appena il servizio si risveglia
 * controlla se il catalogo e' vecchio e, se lo e', lo rifa'. Il risultato e'
 * lo stesso — un catalogo mai piu' vecchio di un giorno — senza dipendere dal
 * fatto che qualcuno resti sveglio a mezzanotte.
 *
 * Su un piano a pagamento, dove il servizio non si spegne, il timer scatta
 * davvero e il recupero non serve quasi mai. Funziona in entrambi i casi senza
 * cambiare niente.
 *
 * QUALI PAESI
 * -----------
 * Non tutti e ventiquattro: scaricarli tutti sono centinaia di megabyte e il
 * piano gratuito ne ha 512 in tutto. Si aggiornano quelli indicati in
 * CATALOGO_PAESI, e gli altri si caricano da soli quando qualcuno li chiede.
 */

import { catalogoDi, dimenticaPaese, statoCatalogo } from "./catalogo.js";
import { caricaFontiDalDb, paesiConCatalogo, statoFonti } from "./catalogo-fonti.js";
import { riempiPrezzi } from "./prezzi-notturni.js";
import { giroContinuo } from "./prezzi-continuo.js";
import { cataloghi } from "../base/db.js";

/**
 * Quante voci della spesa di base prezzare per paese, ogni notte.
 *
 * Sessanta e' quanto ne serve: misurato, sessanta voci per sei paesi sono
 * circa duemila pagine, venti minuti spalmati. Alzarlo allunga la notte senza
 * aggiungere quasi niente — le voci oltre la sessantesima compaiono in una
 * lista su venti.
 */
const VOCI_PER_PAESE = Number(process.env.PREZZI_VOCI_PER_PAESE ?? 60);

/**
 * Quanti minuti dare al giro continuo, dopo il lavoro mirato.
 *
 * Il lavoro mirato prezza le voci della spesa di base: poche centinaia di
 * pagine per paese, ed e' quel che serve alle richieste vere. Il giro continuo
 * riempie il resto del catalogo, e a differenza del primo NON FINISCE MAI —
 * c'e' un milione e ottocentomila indirizzi. Percio' si da' un tempo, non un
 * obiettivo: quel che non fa stanotte lo fa domani, perche' riprende sempre da
 * cio' che manca.
 *
 * Quarantacinque minuti e' un valore prudente per il piano gratuito di Render,
 * dove la macchina si spegne dopo un quarto d'ora di silenzio e la tiene sveglia
 * solo un ping esterno. Su una macchina che non dorme si puo' alzare molto: a
 * ventuno pagine al secondo, quattro ore fanno trecentomila prezzi.
 *
 * A `0` il giro continuo non parte: resta solo il lavoro mirato.
 */
const MINUTI_GIRO_CONTINUO = Number(process.env.PREZZI_MINUTI_GIRO ?? 45);

/** Sotto questa eta' i cataloghi si considerano buoni e l'avvio non li rifa'. */
const ORE_PRIMA_DI_RIFARE = Number(process.env.CATALOGO_ORE_VALIDE ?? 20);

/**
 * I paesi da tenere sempre pronti.
 *
 * Vuoto significa "nessuno in anticipo": ogni paese si carica alla prima
 * richiesta che lo riguarda. E' il comportamento giusto finche' non si sa
 * dove sono gli utenti.
 */
function paesiDaScaldare(): string[] {
  const scelti = (process.env.CATALOGO_PAESI ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const noti = new Set(paesiConCatalogo());
  const buoni = scelti.filter((p) => noti.has(p));

  const ignorati = scelti.filter((p) => !noti.has(p));
  if (ignorati.length > 0) {
    console.warn(
      `[catalogo] nessuna fonte per ${ignorati.join(", ")}: ignorati. ` +
        `Disponibili: ${[...noti].join(" ")}`,
    );
  }
  return buoni;
}

/** Quanto manca alla prossima mezzanotte, ora del server. */
function finoAMezzanotte(): number {
  const ora = new Date();
  const poi = new Date(ora);
  poi.setHours(24, 0, 0, 0);
  return poi.getTime() - ora.getTime();
}

let inCorso = false;

/**
 * Rifa' il catalogo dei paesi scelti.
 *
 * Uno alla volta di proposito: sono file grossi, e farli insieme su mezzo
 * gigabyte di memoria e' il modo migliore per far morire il servizio nel
 * momento in cui nessuno guarda.
 */
export async function aggiornaCatalogo(motivo: string): Promise<void> {
  if (inCorso) {
    console.info("[catalogo] aggiornamento gia' in corso, salto");
    return;
  }
  const paesi = paesiDaScaldare();
  if (paesi.length === 0) {
    console.info(
      "[catalogo] nessun paese da tenere pronto (CATALOGO_PAESI vuota): " +
        "si caricheranno su richiesta",
    );
    return;
  }

  /* ALL'AVVIO NON SI RIFA' QUEL CHE E' GIA' FRESCO.
     Sessanta secondi dopo ogni avvio partiva l'aggiornamento completo. Su una
     macchina che resta in piedi e' giusto: si scalda il catalogo e via. Su una
     che viene uccisa per memoria e riavviata diventa una ruota da criceto —
     misurato su Render nella notte del 17 settembre: dieci cicli in cinque ore,
     uno ogni quarantadue minuti, ognuno con la sua ripassata alle sitemap di
     centosessanta negozi. Il lavoro non finiva mai e il carico lo prendevano
     loro.
     Se il magazzino dei cataloghi e' stato rinfrescato da poco non c'e' niente
     da rifare: quel che serve e' gia' su Mongo, e si legge da li'. */
  if (motivo === "avvio") {
    const eta = await etaCataloghi();
    if (eta !== null && eta < ORE_PRIMA_DI_RIFARE * 3_600_000) {
      console.info(
        `[catalogo] all'avvio non c'e' niente da rifare: i cataloghi hanno ` +
          `${(eta / 3_600_000).toFixed(1)}h. Si riparte a mezzanotte.`,
      );
      return;
    }
  }

  inCorso = true;
  const inizio = Date.now();
  console.info(`[catalogo] aggiornamento (${motivo}): ${paesi.join(" ")}`);

  /* PRIMA LE FONTI, POI I CATALOGHI.
     L'elenco delle insegne sta sul database, e il file `catalogo-fonti.ts` e'
     solo la semente per il primo avvio. Rileggerlo qui vuol dire che una resa
     corretta stanotte vale gia' stanotte, senza aspettare un rilascio.

     Se il database non risponde non cambia niente: si tiene la semente e si
     lavora lo stesso. Un elenco vecchio di qualche giorno fa girare l'app,
     nessun elenco la ferma. */
  const quante = await caricaFontiDalDb();
  console.info(
    quante > 0
      ? `[fonti] ${quante} insegne lette dal database`
      : `[fonti] database muto: resta la semente del file`,
  );

  try {
    for (const p of paesi) {
      try {
        const c = await catalogoDi(p);
        if (!c) {
          console.warn(`[catalogo] ${p}: nessuna fonte ha risposto`);
          continue;
        }

        /* I PREZZI SUBITO DOPO, SULLO STESSO PAESE.
           Qui e non in un secondo giro perche' il catalogo di questo paese e'
           in memoria adesso: rifarlo dopo costerebbe di nuovo trenta secondi e
           mezzo gigabyte.

           Se fallisce, il catalogo resta buono lo stesso — sono due mestieri
           separati e il secondo non deve poter rovinare il primo. */
        try {
          await riempiPrezzi(p, VOCI_PER_PAESE);
        } catch (err) {
          console.warn(`[prezzi] ${p} fallito (il catalogo resta buono):`, err);
        } finally {
          /* FINITO CON QUESTO PAESE, LO SI LASCIA ANDARE.
             Il catalogo resta salvato su Mongo: quel che si butta e' la copia
             in memoria, che costa sessanta megabyte ogni duecentomila voci.
             Il ricambio automatico ne tiene tre, ma con trentun paesi in fila
             sono comunque centottanta megabyte di roba gia' usata — ed e' cio'
             che ha fatto superare il limite a Render. */
          dimenticaPaese(p);
        }
      } catch (err) {
        // Un paese che fallisce non deve fermare gli altri.
        console.warn(`[catalogo] ${p} fallito:`, err);
      }
    }
    /* IL GIRO CONTINUO VIENE DOPO, E SOLO SE C'E' TEMPO.
       Prima si prezza quel che la gente chiede — la spesa di base, paese per
       paese — perche' se la notte viene interrotta e' quello che deve esserci.
       Il resto del catalogo e' un di piu' che si accumula col tempo. */
    /* Il giro continuo SOLO nell'appuntamento di mezzanotte. All'avvio e' la
       parte che consuma di piu', e su un riavvio dopo un'uccisione per memoria
       e' quella che rifa' uccidere: il ciclo si chiude e non si apre piu'. */
    if (MINUTI_GIRO_CONTINUO > 0 && motivo !== "avvio") {
      try {
        const e = await giroContinuo(paesi, MINUTI_GIRO_CONTINUO, (fatte, con) => {
          if (fatte % 500 === 0) console.info(`[prezzi] giro continuo: ${fatte} aperte, ${con} con prezzo`);
        });
        console.info(
          `[prezzi] giro continuo: ${e.aperte} aperte, ${e.conPrezzo} con prezzo, ` +
            `${e.saltate} gia' fresche, in ${e.secondi.toFixed(0)}s` +
            (e.finito ? " — catalogo finito" : " — tempo scaduto, riprende domani"),
        );
      } catch (err) {
        console.warn("[prezzi] giro continuo fallito:", err);
      }
    }

    const s = statoCatalogo();
    const sf = statoFonti();
    console.info(`[fonti] ${sf.quante} insegne in memoria`);
    const totale = s.caricati.reduce((n, c) => n + c.prodotti, 0);
    console.info(
      `[catalogo] aggiornamento finito in ${((Date.now() - inizio) / 1000).toFixed(0)}s — ` +
        `${totale} prodotti in memoria`,
    );
  } finally {
    inCorso = false;
  }
}

/**
 * Avvia il lavoro notturno.
 *
 * Il primo colpo e' subito dopo l'avvio, non a mezzanotte: serve a riempire il
 * catalogo quando il servizio si risveglia dopo essere stato spento. Ritardato
 * di un minuto perche' l'avvio non diventi lento — chi apre l'app in quel
 * momento non deve aspettare un catalogo che non ha ancora chiesto.
 */
export function avviaCatalogoNotturno(): void {
  if (process.env.CATALOGO_NOTTURNO === "0") {
    console.info("[catalogo] lavoro notturno disattivato (CATALOGO_NOTTURNO=0)");
    return;
  }

  /* PRIMA LE FONTI, POI GLI APPUNTAMENTI — E IN QUEST'ORDINE.
     L'elenco delle insegne sta sul database, e `paesiDaScaldare()` lo
     interroga per sapere quali paesi tenere pronti. Chiamandola prima che il
     database abbia risposto trova zero insegne, conclude «nessun paese» e non
     programma niente: il lavoro notturno non partirebbe mai, e il registro non
     direbbe nulla di strano.

     Ci sono cascato scrivendo questa stessa funzione, mezz'ora fa. */
  void caricaFontiDalDb().then((quante) => {
    console.info(
      quante > 0
        ? `[fonti] ${quante} insegne lette dal database`
        : "[fonti] il database non ha dato insegne: niente catalogo",
    );
    programma();
  });
}

/** Gli appuntamenti veri, chiamati solo dopo che le fonti ci sono. */
/**
 * Quanto tempo fa e' stato rinfrescato il catalogo piu' recente, in millisecondi.
 *
 * Torna `null` se non ce n'e' nessuno: in quel caso c'e' davvero da lavorare.
 */
async function etaCataloghi(): Promise<number | null> {
  try {
    const c = await cataloghi();
    const ultimo = await c.find({}).sort({ aggiornato: -1 }).limit(1).next();
    if (!ultimo?.aggiornato) return null;
    return Date.now() - new Date(ultimo.aggiornato).getTime();
  } catch {
    /* Se il database non risponde, meglio non rifare niente: chi non sa non
       tocca. A mezzanotte si riprova comunque. */
    return 0;
  }
}

function programma(): void {
  const paesi = paesiDaScaldare();
  if (paesi.length === 0) return;

  setTimeout(() => void aggiornaCatalogo("avvio"), 60_000).unref();

  const primoAppuntamento = finoAMezzanotte();
  console.info(
    `[catalogo] prossimo aggiornamento fra ${(primoAppuntamento / 3_600_000).toFixed(1)}h ` +
      `(mezzanotte), paesi: ${paesi.join(" ")}`,
  );

  setTimeout(() => {
    void aggiornaCatalogo("mezzanotte");
    // Da qui in poi ogni ventiquattro ore.
    setInterval(() => void aggiornaCatalogo("mezzanotte"), 24 * 60 * 60 * 1000).unref();
  }, primoAppuntamento).unref();
}
