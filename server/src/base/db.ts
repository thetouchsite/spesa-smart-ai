/**
 * MongoDB — connessione e collezioni.
 *
 * Driver ufficiale, niente ODM: le tre collezioni hanno forme semplici e
 * Mongoose aggiungerebbe uno strato di schemi che qui non serve a nessuno.
 *
 * Collezioni:
 *   users  — account (email + password con hash scrypt)
 *   plans  — piani salvati dall'utente, non più solo nel browser
 *   cache  — risposte AI condivise fra TUTTI gli utenti
 *   prezzi — schede prodotto gia' lette: prezzo, link e quando l'abbiamo visto
 *   cataloghi — gli indirizzi di ogni insegna, compressi: uno per insegna
 *
 * La collezione `cache` è quella che tiene in piedi i conti: senza, ogni
 * utente ripaga le stesse chiamate a Gemini (~0,15 € a piano). Con la cache
 * condivisa i piatti distinti sono poche centinaia in tutto il catalogo e a
 * regime il costo scende a ~0,02 € a piano.
 */

import { MongoClient, type Binary, type Collection, type Db, type ObjectId } from "mongodb";
import type { VerifyStatus } from "../api/price-page.js";

export interface UserDoc {
  _id?: unknown;
  email: string;
  passwordHash: string;
  displayName?: string;
  createdAt: Date;
  /**
   * Il numero di generazione dei token di questo utente.
   *
   * I token durano novanta giorni — giusto, per un'app che non deve chiedere
   * l'accesso ogni settimana. Ma senza questo campo cambiare la password NON
   * scollegava nessuno: chi si era preso il telefono, o il token, restava
   * dentro per tre mesi anche dopo che il legittimo proprietario aveva
   * cambiato tutto. Cambiare password alza il numero, i token vecchi portano
   * quello di prima e non valgono piu'.
   *
   * Assente vuol dire 1: gli utenti registrati prima di questo campo non vanno
   * scollegati per un aggiornamento del codice.
   */
  versioneToken?: number;
  /** Impronta del codice di recupero, mai il codice in chiaro. */
  recuperoHash?: string;
  recuperoScadeIl?: Date;
  /** Quanti tentativi sbagliati: al terzo il codice muore. */
  recuperoTentativi?: number;
}

export interface PlanDoc {
  _id?: unknown;
  userId: string;
  label: string;
  profile: Record<string, unknown>;
  plan: Record<string, unknown>;
  estimatedSpend: number;
  savings: number;
  score: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Una scheda prodotto gia' letta: prezzo, stato e quando l'abbiamo vista.
 *
 * L'indirizzo e' la chiave, perche' e' l'unica cosa che identifica davvero la
 * scheda — il nome lo scrive il negozio e puo' cambiare.
 *
 * Perche' esiste: senza, ogni richiesta riapre le stesse pagine. Con cento
 * persone che generano un piano a Madrid erano seimila richieste ai negozi
 * spagnoli invece di sessanta. Vedi `prezzi-magazzino.ts`.
 */
/**
 * Un prezzo in magazzino, nella forma stretta.
 *
 * PERCHE' I NOMI SONO DI UNA LETTERA
 * ----------------------------------
 * Perche' il nome del campo sta dentro OGNI documento. Con cinque milioni di
 * righe, chiamare `prezzo` una cosa che si potrebbe chiamare `p` costa
 * trenta megabyte di sole etichette.
 *
 * La forma di prima pesava 443 byte per riga, indici compresi, e il prezzo ne
 * occupava dodici. Tutto il resto era roba gia' scritta altrove:
 *
 *   _id       60 byte   l'indirizzo per esteso, ripetuto per ogni riga
 *   nome      25 byte   sta gia' nel catalogo
 *   insegna   17 byte   sta gia' nel catalogo
 *   verifica  22 byte   la parola «verificato», scritta cinque milioni di volte
 *   scadeIl   35 byte   ricavabile da `visto`
 *
 * A 443 byte in 440 MB liberi ci stanno un milione di prezzi. Bastava quello a
 * fermare il progetto: il magazzino si riempiva in tre notti e poi non poteva
 * piu' crescere.
 *
 * L'INDIRIZZO DIVENTA UN'IMPRONTA, E VA CAPITO COSA SI PERDE
 * ----------------------------------------------------------
 * `_id` non e' piu' l'indirizzo ma la sua impronta a 96 bit, sedici caratteri.
 * Quindi da una riga NON si risale piu' all'indirizzo: chi legge deve gia'
 * avere in mano l'URL e cercarne l'impronta. E' come funziona davvero — si
 * parte sempre da un candidato del catalogo — ma va saputo, perche' rende
 * impossibile «elencare i prezzi» senza passare dal catalogo.
 *
 * Perche' 96 bit e non 64: con cinque milioni di righe un'impronta a 64 bit
 * darebbe una collisione ogni tanto, e una collisione qui significa mostrare
 * il prezzo di un prodotto sotto il nome di un altro. E' esattamente il
 * difetto che abbiamo passato la serata a togliere.
 */
export interface PrezzoDoc {
  /** Impronta a 96 bit dell'indirizzo, in base64url: sedici caratteri. */
  _id: string;
  /** Il prezzo. Null quando la pagina si apre ma il prezzo non c'e'. */
  p: number | null;
  /** La valuta. */
  v: string;
  /**
   * La valuta non l'ha detta la pagina: l'abbiamo dedotta noi.
   *
   * PERCHE' UN CAMPO E NON UN SILENZIO
   * Una riga su cinque arrivava senza moneta, e riempirle guardando cosa
   * dichiarano le altre righe della stessa insegna e' una deduzione solida —
   * ma resta una deduzione. Senza questo segno, il giorno dopo non si
   * distingue piu' una valuta LETTA dalla pagina da una MESSA da noi, e
   * l'operazione su trecentocinquantacinquemila righe diventa irreversibile.
   *
   * Costa dieci byte sulle righe dedotte e niente su tutte le altre. Vale
   * anche verso chi comprera' i dati: «dedotta dal paese dell'insegna» e'
   * un'informazione, «EUR» e basta e' un'affermazione.
   */
  vd?: true;
  /** Com'e' andata la lettura, in un numero: vedi `STATO` in prezzi-magazzino. */
  s: number;
  /** Quando l'abbiamo letta. Fa da freschezza E da scadenza: il TTL e' su questa. */
  t: Date;
  /** Il numero dell'insegna, non il nome: serve al giro continuo e al cruscotto. */
  c: number;

  /* ─── FASE 1: quel che la pagina dichiara e prima si buttava ───
     Tre numeri e un'impronta. Stanno QUI e non in `schede` perche' cambiano
     a ogni lettura come il prezzo: metterli fra i campi descrittivi
     vorrebbe dire riscrivere `schede` mezzo milione di volte al giorno.
     Tutti facoltativi: assente vuol dire NON OSSERVATO, mai zero. */

  /** Prezzo pieno, quando la pagina dichiara una promozione. */
  l?: number;
  /** Percentuale di sconto, arrotondata. */
  sc?: number;
  /** Disponibilita': 0 ignota, 1 disponibile, 2 esaurita, 3 scorte limitate. */
  av?: 0 | 1 | 2 | 3;
  /**
   * Impronta degli otto byte dei campi descrittivi che stanno in `schede`.
   *
   * SERVE A NON RILEGGERE `schede` A OGNI LOTTO.
   * Per sapere se marca, immagine o nome sono cambiati ci sono tre strade:
   * rileggere `schede` (una query in piu' ogni duecento pagine), riscriverla
   * sempre (mezzo milione di scritture al giorno di roba che non cambia mai),
   * oppure un upsert condizionato — che e' una trappola: quando il filtro non
   * combacia perche' nulla e' cambiato, `upsert: true` INSERISCE un doppione.
   *
   * L'impronta costa otto byte e toglie la domanda: la lettura del lotto su
   * `prezzi` si fa comunque per il prezzo, e torna anche questa.
   *
   * Una collisione fa perdere l'aggiornamento di un campo descrittivo, non
   * corrompe un prezzo. A otto byte e' un rischio che si accetta.
   */
  sh?: string;
}

/**
 * I campi descrittivi di una scheda: quel che NON cambia fra una lettura e
 * l'altra.
 *
 * PERCHE' UNA COLLEZIONE A PARTE E NON ALTRI CAMPI SU `prezzi`
 * ------------------------------------------------------------
 * Perche' `prezzi` si riscrive mezzo milione di volte al giorno e questi campi
 * non cambiano quasi mai. Sono anche lunghi: marca, indirizzo dell'immagine,
 * percorso della categoria e nome per esteso fanno circa 250 byte, contro i 77
 * dell'intera riga di prezzo. Messi la' dentro quadruplicherebbero la
 * collezione calda — l'opposto della compattazione che l'ha portata a 77 byte.
 *
 * Divisi per QUANTO CAMBIANO, non per argomento: e' la stessa regola che ha
 * fatto diventare l'insegna un numero invece di un nome.
 *
 * NIENTE TTL SU QUESTA COLLEZIONE. `prezzi.t` ne ha uno da trenta giorni, e
 * copiarlo qui cancellerebbe in silenzio i campi che stiamo raccogliendo.
 */
export interface SchedaDoc {
  /** Lo STESSO identificativo di `prezzi._id`: e' la chiave del collegamento. */
  _id: string;
  /** Il nome come lo dichiara la pagina — piu' completo di quello dell'indirizzo. */
  n?: string;
  /** La marca, dai dati strutturati. */
  b?: string;
  /** Il codice interno del negozio. Non e' un EAN: non attraversa le insegne. */
  sk?: string;
  /** L'INDIRIZZO dell'immagine, mai l'immagine. Vedi il commento qui sotto. */
  im?: string;
  /** Il percorso di categoria come lo scrive il negozio, non normalizzato. */
  cr?: string;
  /** Da dove sono stati presi: `jsonld`, `og`, `microdata`, `url`. */
  fo?: string;
  /** Quando sono stati osservati l'ultima volta. */
  t: Date;
}

/* SULL'IMMAGINE SI TIENE L'INDIRIZZO, MAI I BYTE.
   Un prezzo e' un fatto e i fatti non hanno un autore. Una fotografia di
   prodotto e' un'opera con un titolare, e copiarla e' riproduzione — un
   terreno molto piu' netto di tutta la questione sul diritto sui generis.
   Conservare l'indirizzo non lo e'.

   E per la stessa ragione qui NON c'e' la descrizione del prodotto, che pure
   sarebbe facile da prendere: un nome e' funzionale, tre paragrafi di testo
   promozionale sono scritti da qualcuno. E' la parte del dataset che meno
   somiglia a un dato e piu' a contenuto altrui. */

/**
 * Un intervallo di prezzo: da quando a quando quell'offerta e' stata a quella
 * cifra.
 *
 * SI SCRIVE SOLO QUANDO CAMBIA
 * ----------------------------
 * Una riga per ogni lettura sarebbe una riga ogni 72 ore per offerta, quasi
 * sempre identica a quella prima: circa 32 GB l'anno di ripetizioni. Con
 * `t` (prima volta vista a questa cifra) e `u` (ultima volta confermata), una
 * sfilza di letture uguali diventa una riga sola con una durata — che e' poi
 * quello che una serie di prezzi e' davvero. Da 32 GB a 2-3.
 *
 * Non si perde niente: i vuoti fra una riga e l'altra sono periodi senza
 * variazione per costruzione.
 *
 * PERCHE' NON DENTRO `prezzi`
 * ---------------------------
 * Si era valutato di tenere l'intervallo aperto sulla riga del prezzo: niente
 * indice parziale, unicita' garantita per costruzione, e 255 MB risparmiati.
 * Scartata per via del TTL: `prezzi.t` cancella la riga dopo trenta giorni, e
 * un prodotto letto a 2,99 per sei mesi e poi ritirato dal negozio perderebbe
 * tutta la sua storia un mese dopo. Che e' esattamente cio' che stiamo
 * cercando di conservare.
 *
 * NIENTE TTL SU QUESTA COLLEZIONE.
 */
export interface OsservazioneDoc {
  _id: ObjectId;
  /** L'offerta: lo stesso identificativo di `prezzi._id`. */
  o: string;
  p: number | null;
  /** Il prezzo pieno di allora, se c'era una promozione. */
  l?: number;
  v: string;
  /** Prima volta vista a questa cifra. */
  t: Date;
  /** Ultima volta confermata a questa cifra. */
  u: Date;
  /**
   * C'e' solo sull'intervallo ancora aperto.
   *
   * Il vincolo lo mette il database, non il codice: un indice unico PARZIALE
   * su `{ o: 1 }` limitato a `{ aperta: true }` rende impossibile avere due
   * intervalli aperti per la stessa offerta. Se la chiusura fallisce a meta',
   * l'inserimento viola l'indice e fallisce rumorosamente invece di lasciare
   * due righe aperte in silenzio.
   */
  aperta?: true;
}

/**
 * Cosa ci ha detto il `robots.txt` di un'insegna, e QUANDO ce l'ha detto.
 *
 * PERCHE' NON BASTA IL CAMPO SU `fonti`
 * -------------------------------------
 * `fonti.robots` dice com'e' la situazione ADESSO, e si sovrascrive a ogni
 * controllo. Risponde alla domanda «la possiamo leggere?», che e' quella che
 * serve stanotte.
 *
 * Non risponde all'altra, che e' quella che serve fra un anno: «il 14 marzo,
 * quando l'avete letta, il permesso c'era?». Se a giugno il negozio aggiunge
 * un divieto, il campo su `fonti` diventa DISALLOW e la risposta di marzo
 * sparisce — sostituita da quella che ci fa torto.
 *
 * PERCHE' NON SULLA RIGA DEL GIRO
 * -------------------------------
 * Era il posto ovvio, ed e' sbagliato per un motivo preciso: `giri` ha un TTL
 * di trenta giorni. Una prova che vive un mese non e' una prova — e sparirebbe
 * da sola, in silenzio, esattamente come sarebbe sparita la storia dei prezzi
 * se l'avessimo messa dentro `prezzi`. E' lo stesso errore, nello stesso
 * progetto, a tre settimane di distanza.
 *
 * Sulla riga del giro l'esito ci va lo stesso, ma come comodita' per chi
 * guarda il pannello domattina. La prova sta qui.
 *
 * SI SCRIVE SOLO QUANDO CAMBIA
 * ----------------------------
 * Come gli intervalli di prezzo, e per la stessa ragione: un controllo ogni
 * dodici ore su cinquanta insegne sarebbero trentaseimila righe l'anno quasi
 * tutte identiche. Con `t` (da quando dice questo) e `u` (ultima conferma),
 * un anno di «sempre permesso» e' una riga sola con una durata. Cinquanta
 * insegne, una manciata di righe ciascuna: qualche decina di kilobyte.
 *
 * NIENTE TTL SU QUESTA COLLEZIONE.
 */
export interface PermessoDoc {
  _id: ObjectId;
  /** L'insegna: `"PAESE|Insegna"`, come `fonti._id`. */
  f: string;
  /** Cosa dice il file. `IGNOTO` quando non risponde: vedi sotto. */
  e: "ALLOW" | "DISALLOW" | "PARZIALE" | "IGNOTO";
  /** La regola che ha vinto, testuale: `"Disallow: /prodotti/"`. */
  r: string;
  /** I percorsi provati, cosi' si puo' rifare il conto a mano. */
  pr: string[];
  /** Da quando dice questo. */
  t: Date;
  /** Ultima volta che l'ha confermato. */
  u: Date;
  /** Vero sull'ultima riga: l'esito in vigore. */
  aperta?: true;
}

/**
 * Il catalogo di un'insegna, compresso in un documento solo.
 *
 * Tre milioni di prodotti come tre milioni di documenti sarebbero 867 MB con
 * gli indici, e il piano gratuito ne da' 512. Gli stessi dati compressi, uno
 * per insegna, sono 55 MB. Vedi `catalogo-magazzino.ts`.
 */
export interface ChiaveDoc {
  _id: string;
  nome: string;
  specie: "segreta" | "pubblicabile";
  tettoGiornaliero: number;
  attiva: boolean;
  creata: Date;
}

export interface CatalogoDoc {
  _id: string; // "PAESE|Insegna"
  paese: string;
  insegna: string;
  prodotti: number;
  /** Indirizzo e nome per riga, separati da tabulazione, poi gzip. */
  dati: Binary;
  aggiornato: Date;
}

/**
 * Una parola che il dizionario ha imparato dal modello.
 *
 * Stava in un file dentro `diario/`, e su Render il disco e' effimero: a ogni
 * riavvio il file spariva, il dizionario ripartiva da zero e si ripagava il
 * modello per tradurre le stesse parole. In locale non si notava, perche' in
 * locale il disco resta.
 */
export interface ParolaDoc {
  _id: string; // "parola|lingua"
  tradotta: string;
  imparata: Date;
}

/**
 * Una fonte del catalogo: l'insegna, dove sta la sua sitemap, quanto rende.
 *
 * PERCHE' SUL DATABASE E NON PIU' SOLO IN UN FILE
 * -----------------------------------------------
 * L'elenco delle fonti e' sempre stato un file TypeScript scritto a mano, e i
 * suoi numeri non li confrontava nessuno col database. Al 16 settembre 2026 i
 * due dicevano cose diverse: il file 1.902.334 prodotti, il magazzino
 * 1.716.324, e dentro il file c'era Carrefour Brasile a 80.000 prodotti
 * mentre il magazzino non ne aveva nemmeno il catalogo.
 *
 * Due elenchi che dovrebbero dire la stessa cosa divergono sempre, perche' si
 * aggiornano in momenti diversi e con strumenti diversi: le rese le scriveva
 * uno script, i conteggi un altro, le aggiunte una persona a mano. Qui c'e'
 * una copia sola, e chi misura scrive li'.
 *
 * Il file resta come SEMENTE: serve al primo avvio, e serve quando il database
 * non risponde — meglio un elenco vecchio che nessun catalogo.
 */
export interface FonteDoc {
  _id: string; // "PAESE|Insegna"
  paese: string;
  insegna: string;
  dominio: string;
  sitemap: string;
  /** Quota di schede che espongono il prezzo, da 0 a 1. */
  resa: number;
  /** Indirizzi di prodotto pubblicati, contati. */
  stimati: number;
  /** Se c'e', l'insegna e' TENUTA FUORI e questa frase dice perche'. */
  esclusa?: string;

  /* ─── SCHEDA DI CONFORMITA' ───
     `esclusa` resta ed e' l'interruttore generale: c'e' una frase, l'insegna
     sparisce da tutto. Questi campi non lo sostituiscono, lo affinano.

     RACCOGLIERE ED ESPORRE SONO DUE COSE DIVERSE, e con un interruttore solo
     non si possono dire. Leggere un negozio per la nostra app e rivendere gli
     stessi dati a terzi sono due esposizioni diverse di un ordine di
     grandezza, e la seconda e' quella che pesa. Un'insegna puo' stare a
     `raccolta: "ATTIVA"` e `esposizione: "RICHIEDE_REVISIONE"`: la leggiamo,
     non la vendiamo ancora.

     `riusoCommerciale: "VERDE"` NON vuol dire «legalmente sicuro». Vuol dire
     «nessuna criticita' evidente secondo la revisione interna corrente». La
     differenza non e' formale: e' l'unica lettura che il campo puo' reggere,
     visto che nessuno di questi giudizi viene da un legale.

     La giurisdizione c'e' perche' senza di lei la scheda non descrive niente:
     il diritto sui generis sulle banche dati e' europeo, e in catalogo ci sono
     Argentina, Brasile, Messico, Emirati, Arabia Saudita, India, Corea,
     Sudafrica, Stati Uniti e Canada. */

  /** Il paese la cui legge governa la fonte. ISO a due lettere. */
  giurisdizione?: string;
  /** La leggiamo? */
  raccolta?: "ATTIVA" | "SOSPESA" | "MAI";
  /** La vendiamo attraverso l'API? Il valore prudente e' RICHIEDE_REVISIONE. */
  esposizione?: "ABILITATA" | "RICHIEDE_REVISIONE" | "DISABILITATA";
  /** Come arrivano i dati: pagina, dati strutturati, API interna, API ufficiale, feed. */
  fonteTipo?: "HTML" | "JSON_LD" | "API_FRONTEND" | "API_UFFICIALE" | "FEED";
  /** Cosa dice il loro `robots.txt` sull'ultimo controllo. */
  robots?: "ALLOW" | "DISALLOW" | "PARZIALE" | "IGNOTO";
  /** Qualcuno ha letto le loro condizioni d'uso? Su tutte, oggi, no. */
  termini?: "RIVISTI" | "NON_RIVISTI";
  /** Il semaforo. VERDE = nessuna criticita' evidente, non «sicuro». */
  riusoCommerciale?: "VERDE" | "GIALLO" | "ROSSO";
  /** Quando la scheda e' stata guardata l'ultima volta. */
  controllatoIl?: Date;
  /**
   * Quel che si e' imparato su questa insegna, in chiaro.
   *
   * Stava nei commenti dentro `catalogo-fonti.ts`, e li' serviva solo a chi
   * apriva quel file. Attaccato alla riga viaggia col dato: lo vede chi
   * interroga il database, chi genera il cruscotto, e chi fra sei mesi si
   * chiede perche' Alcampo punta all'indice e non alla prima parte.
   *
   * Non e' decorazione. Ogni riga qui dentro e' costata una serata: la sitemap
   * sbagliata di Aldi Spagna, il volantino di Alcampo scambiato per una
   * scheda, il divieto di Pingo Doce che non c'era mai stato.
   */
  nota?: string;
  /**
   * Un numero stabile per questa insegna.
   *
   * Serve alle righe di prezzo: scriverci «Carrefour Italia» cinque milioni di
   * volte costa ottanta megabyte, un numero ne costa otto. Si assegna una
   * volta e non cambia — se cambiasse, tutti i prezzi salvati punterebbero
   * all'insegna sbagliata.
   */
  id?: number;
  /** Quando l'ha toccata l'ultima misura. */
  aggiornato: Date;
}

/** Una riga del diario dei giri. Vedi `giri()` per il perche'. */
/**
 * Un ordine per il lettore, lasciato sul database.
 *
 * PERCHE' NON UNA CHIAMATA DIRETTA
 * --------------------------------
 * Il pannello sta su una macchina, il lettore su un'altra — spesso dietro il
 * router di casa, senza indirizzo pubblico e senza nessuna porta aperta. Una
 * chiamata dal pannello al lettore non arriverebbe da nessuna parte, e aprire
 * una porta su un PC di casa per comandarlo da internet e' una pessima idea.
 *
 * Quindi non si chiama nessuno: si lascia un biglietto dove entrambi passano.
 * Il pannello lo scrive, il lettore lo legge insieme al battito che manda gia'
 * ogni cinque secondi. Costa zero richieste in piu' e funziona ovunque sia il
 * lettore, anche dietro sette firewall.
 *
 * IL PREZZO DA PAGARE, DETTO SUBITO
 * ---------------------------------
 * Fermare si puo' sempre, perche' c'e' qualcuno in ascolto. AVVIARE no: se sul
 * PC non gira nessun processo, non c'e' nessuno che possa leggere il biglietto.
 * Un pulsante «avvia» funziona solo dove il lettore vive come servizio sempre
 * acceso — cioe' sul VPS, che e' poi uno dei motivi per cui il VPS serve.
 */
export interface ComandoDoc {
  _id: "comando";
  azione: "ferma";
  /** Il nome di una macchina, oppure `tutti`. */
  per: string;
  quando: Date;
  /** Chi l'ha dato: resta scritto, perche' un giro fermato senza spiegazione fa perdere un'ora. */
  da: string;
}

export interface GiroDoc {
  /** `battito` per la riga viva, `giro-<quando>` per quelle finite. */
  _id: string;
  tipo: "battito" | "giro";
  /** Chi sta lavorando: il nome della macchina. Due lettori insieme si vedono. */
  macchina: string;
  /** Il numero del processo: distingue due lettori sulla STESSA macchina. */
  pid?: number;
  /** Che lavoro e': il giro continuo, la notte, una prova a mano. */
  lavoro: string;
  inizio: Date;
  /** L'ultima volta che ha dato segno di vita. Su una riga finita e' la fine. */
  tocco: Date;
  aperte: number;
  conPrezzo: number;
  saltate: number;
  /** Solo sulle righe finite: perche' ha smesso. */
  esito?: "tempo scaduto" | "catalogo finito" | "interrotto";
  paesi?: string[];
  /**
   * Com'e' andato il controllo dei permessi all'inizio del giro.
   *
   * E' una COMODITA', non la prova: questa riga scade dopo trenta giorni.
   * Serve a chi apre il pannello domattina e vuole sapere in una riga se
   * stanotte qualcuno ci ha detto di no. La prova, che non scade, sta in
   * `permessi` — vedi `PermessoDoc`.
   */
  robots?: { permesse: number; vietate: number; ignote: number; sospese?: string[] };
  /* Lo stato della macchina che sta leggendo, preso al volo insieme al battito.
     Serve perche' quando il lettore rallenta la prima domanda e' sempre «e' la
     macchina che non ce la fa, o sono i negozi che non rispondono?» — e senza
     questi tre numeri si risponde tirando a indovinare. */
  ramUsataMb?: number;
  ramTotaleMb?: number;
  carico?: number;
  accesaDaSec?: number;
}

export interface CacheDoc {
  _id: string; // chiave deterministica: endpoint + hash degli argomenti
  value: unknown;
  createdAt: Date;
  /** TTL: MongoDB cancella il documento da solo a questa data. */
  expiresAt: Date;
}

let client: MongoClient | null = null;
let db: Db | null = null;

export function isDbConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI);
}

/**
 * Si connette al primo uso e riusa la connessione.
 *
 * Su Railway il servizio può ripartire a freddo: la connessione va creata
 * pigramente, non al caricamento del modulo, altrimenti un Mongo non ancora
 * pronto fa fallire l'avvio dell'intero processo.
 */
export async function getDb(): Promise<Db> {
  if (db) return db;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI non configurata");

  client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 8_000,
  });
  await client.connect();
  db = client.db(process.env.MONGODB_DB ?? "spesa_smart");

  // Indici creati una volta sola all'avvio. `unique` sull'email è ciò che
  // impedisce due account con la stessa mail in caso di doppia richiesta.
  await Promise.all([
    db.collection<UserDoc>("users").createIndex({ email: 1 }, { unique: true }),
    db.collection<PlanDoc>("plans").createIndex({ userId: 1, createdAt: -1 }),
    // expireAfterSeconds: 0 => Mongo usa il valore del campo come scadenza.
    db.collection<CacheDoc>("cache").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection<CacheDoc>("cache_api").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection<CacheDoc>("cache_app").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    /* NIENTE INDICE TTL SU `t`, E IL MOTIVO E' UNA MISURA.
       Far scadere le righe da sole dopo trenta giorni era comodissimo e
       costava SETTANTAQUATTRO BYTE PER RIGA — piu' dei settantasei dei dati
       veri. Misurato su un milione di righe: sessantasette megabyte per un
       servizio che uno script fa in pochi secondi una volta al giorno.

       Su due milioni di prodotti quell'indice sarebbe centoquarantotto
       megabyte, e il piano gratuito ne da' cinquecentododici in tutto: era la
       differenza fra starci e non starci.

       Adesso le righe vecchie le butta `scripts/butta-scaduti.ts`, che gira
       col timer settimanale. Il TTL era una garanzia, questo e' un
       promemoria: se il comando non gira, le righe vecchie restano. */
    // Si cercano sempre per indirizzo E per freschezza insieme: un indice solo
    // su `visto` farebbe scorrere tutte le righe recenti per trovarne dodici.
    // Il giro continuo chiede «di questa insegna, cosa e' ancora fresco».
    db.collection<PrezzoDoc>("prezzi").createIndex({ c: 1, t: -1 }),
    // Nessun indice sul contenuto: qui dentro non si cerca, si legge il
    // pacchetto della propria insegna e lo si scompatta.
    db.collection<CatalogoDoc>("cataloghi").createIndex({ paese: 1 }),
    /* Non serve a cercare: serve a NON LEGGERE. Il conto dei link per paese
       somma il campo `prodotti`, e senza questo indice Mongo aprirebbe ogni
       documento — che porta dentro un blocco compresso da quasi un megabyte.
       Centocinquanta megabyte letti per sommare centosessanta numeri. */
    db.collection<CatalogoDoc>("cataloghi").createIndex({ paese: 1, prodotti: 1 }),
    // Le fonti si chiedono sempre per paese, e quasi sempre ordinate per resa.
    db.collection<FonteDoc>("fonti").createIndex({ paese: 1, resa: -1 }),
    /* IL REGISTRO DEI PERMESSI, CHE NON SCADE.
       Un indice unico PARZIALE sulle righe aperte: e' il database a garantire
       che un'insegna abbia un esito in vigore solo, non il codice. Se una
       chiusura fallisce a meta', l'inserimento successivo sbatte contro
       l'indice e fallisce rumorosamente, invece di lasciare due verita' in
       giro senza che nessuno se ne accorga. */
    db.collection<PermessoDoc>("permessi").createIndex(
      { f: 1 },
      { unique: true, partialFilterExpression: { aperta: true } },
    ),
    db.collection<PermessoDoc>("permessi").createIndex({ f: 1, t: -1 }),
    /* Il diario si legge sempre in ordine di tempo, e le righe dei giri finiti
       dopo un mese non servono piu' a nessuno: le butta Mongo da sola. */
    db.collection<GiroDoc>("giri").createIndex({ tocco: -1 }),
    db.collection<GiroDoc>("giri").createIndex(
      { inizio: 1 },
      { expireAfterSeconds: 30 * 86_400, partialFilterExpression: { tipo: "giro" } },
    ),
  ]);

  console.info("[db] connesso a MongoDB");
  return db;
}

export async function users(): Promise<Collection<UserDoc>> {
  return (await getDb()).collection<UserDoc>("users");
}

export async function plans(): Promise<Collection<PlanDoc>> {
  return (await getDb()).collection<PlanDoc>("plans");
}

/**
 * LA CACHE E' DUE, NON UNA.
 *
 * Era una collezione sola, e dentro ci finivano tutte e due le meta' del
 * sistema: le risposte sui prezzi — che sono l'API, il prodotto — insieme ai
 * menu, alle ricette e alle liste, che sono l'app del cliente.
 *
 * Finche' vivono in casa insieme non e' un problema pratico: il problema e'
 * che il giorno in cui l'API se ne va per conto suo, quella collezione va
 * divisa a mano, con dentro qualche milione di documenti. Adesso costa cinque
 * righe; fra sei mesi e' una migrazione.
 *
 * E c'e' una ragione piu' immediata: le due meta' hanno vite diverse. Una
 * risposta sui prezzi scade in ventiquattro ore perche' i prezzi cambiano; un
 * menu potrebbe durare settimane. Nella stessa collezione si finisce per dare
 * a tutti la soglia piu' corta — che e' esattamente cio' che succedeva.
 *
 * Chi va dove lo dice il prefisso della chiave, che c'era gia':
 *
 *     prices                                   → api
 *     menu, lista, plan-full, menu-da-prodotti → app
 *     amazon, shopping                         → app (strade alternative)
 */
function dovePosare(chiave: string): "cache_api" | "cache_app" {
  return chiave.startsWith("prices:") ? "cache_api" : "cache_app";
}

export async function cache(chiave?: string): Promise<Collection<CacheDoc>> {
  const db = await getDb();
  // Senza chiave — succede solo negli script di servizio — si risponde con
  // quella dell'app, che e' la piu' grande.
  return db.collection<CacheDoc>(chiave ? dovePosare(chiave) : "cache_app");
}

/**
 * La collezione di prima, che va svuotandosi da sola.
 *
 * Le voci hanno tutte una scadenza e Mongo le toglie: nel giro di qualche
 * giorno resta vuota e si puo' cancellare. Fino ad allora la si legge ancora,
 * se no il giorno del passaggio tutti pagherebbero di nuovo un lavoro gia'
 * fatto — e quel giorno c'era una dimostrazione al cliente in corso.
 */
export async function cacheVecchia(): Promise<Collection<CacheDoc>> {
  return (await getDb()).collection<CacheDoc>("cache");
}

export async function prezzi(): Promise<Collection<PrezzoDoc>> {
  return (await getDb()).collection<PrezzoDoc>("prezzi");
}

/**
 * Il registro dei giri: cosa sta facendo il lettore, e cosa ha fatto ieri.
 *
 * PERCHE' PASSA DAL DATABASE E NON DALLA MEMORIA
 * ----------------------------------------------
 * Il lettore e il pannello non girano sulla stessa macchina, e non e' un caso:
 * il lettore sta dove costa poco restare accesi tutta la notte, il pannello
 * sta dove sta l'API. Una variabile in memoria la vedrebbe solo il processo
 * che l'ha scritta, quindi il pannello mostrerebbe sempre «fermo» mentre il
 * lettore macina da un'altra parte.
 *
 * Il database e' l'unica cosa che i due hanno in comune. Quindi l'avanzamento
 * si scrive li': il lettore batte un colpo ogni tanto, il pannello lo legge.
 *
 * DUE TIPI DI RIGA
 * ----------------
 *   battito   una sola, sempre la stessa, sovrascritta: cosa sta succedendo
 *             ADESSO. Se la sua ora e' vecchia di qualche minuto, il lettore
 *             e' morto senza dire niente — ed e' proprio quello che si vuole
 *             vedere.
 *   giro      una per ogni giro finito: quanto e' durato, cosa ha prodotto.
 *             Serve a rispondere a «ieri notte e' andata?» senza leggere i log
 *             di un servizio che i log li tiene un'ora.
 */
export async function giri(): Promise<Collection<GiroDoc>> {
  return (await getDb()).collection<GiroDoc>("giri");
}

/** Gli ordini per il lettore. Una riga sola, sovrascritta. Vedi `ComandoDoc`. */
export async function comandi(): Promise<Collection<ComandoDoc>> {
  return (await getDb()).collection<ComandoDoc>("comandi");
}

export async function cataloghi(): Promise<Collection<CatalogoDoc>> {
  return (await getDb()).collection<CatalogoDoc>("cataloghi");
}

export async function vocabolario(): Promise<Collection<ParolaDoc>> {
  return (await getDb()).collection<ParolaDoc>("vocabolario");
}

export async function schede(): Promise<Collection<SchedaDoc>> {
  return (await getDb()).collection<SchedaDoc>("schede");
}

export async function osservazioni(): Promise<Collection<OsservazioneDoc>> {
  return (await getDb()).collection<OsservazioneDoc>("osservazioni");
}

/** Chi ci ha detto di si' e chi di no, con le date. Vedi `PermessoDoc`. */
export async function permessi(): Promise<Collection<PermessoDoc>> {
  return (await getDb()).collection<PermessoDoc>("permessi");
}

export async function fonti(): Promise<Collection<FonteDoc>> {
  return (await getDb()).collection<FonteDoc>("fonti");
}

/**
 * Le chiavi dell'API.
 *
 * Dentro c'e' l'IMPRONTA della chiave, non la chiave: se qualcuno legge il
 * database non ci trova niente di riutilizzabile. Il documento sta in
 * `chiavi.ts`, che e' anche l'unico posto che lo scrive.
 */
export async function chiavi(): Promise<Collection<ChiaveDoc>> {
  return (await getDb()).collection<ChiaveDoc>("chiavi");
}

export async function closeDb(): Promise<void> {
  await client?.close();
  client = null;
  db = null;
}
