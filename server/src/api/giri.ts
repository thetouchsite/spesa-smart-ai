/**
 * Il registro dei giri: chi sta lavorando adesso, e com'e' andata ieri notte.
 *
 * NOTA SUL NOME: esiste gia' un `base/diario.ts`, che e' un'altra cosa — un
 * registro su file di ogni generazione, per riguardare le risposte dopo. Due
 * moduli con lo stesso nome sono un invito a importare quello sbagliato, per
 * cui questo si chiama `giri`, come la collezione che scrive.
 *
 * IL PROBLEMA CHE RISOLVE
 * -----------------------
 * Finora, per sapere se il lettore stava lavorando, bisognava guardare il
 * terminale in cui era stato lanciato. Se quel terminale era chiuso, o il
 * lettore girava su un'altra macchina, la risposta era: non si sa. Ed e'
 * capitato piu' volte di crederlo fermo mentre macinava, e di crederlo vivo
 * mentre era morto da mezz'ora.
 *
 * PERCHE' IL DATABASE E NON LA MEMORIA
 * ------------------------------------
 * Lettore e pannello non girano sulla stessa macchina. Il lettore sta dove
 * costa poco restare accesi tutta la notte; il pannello sta dove sta l'API,
 * che deve rispondere subito a chi la chiama. L'unica cosa che i due hanno in
 * comune e' Mongo, quindi l'avanzamento passa da li'.
 *
 * Costa una scrittura ogni cinque secondi — una riga sola, sempre la stessa —
 * che accanto alle dodici al secondo dei prezzi non si nota.
 *
 * IL BATTITO DICE ANCHE QUANDO NON C'E'
 * -------------------------------------
 * La riga viva porta l'ora dell'ultimo colpo. Non esiste un messaggio «sono
 * morto»: un processo ucciso non fa in tempo a scriverlo. Quindi il pannello
 * non si chiede se il lettore ha detto di essere vivo, si chiede QUANDO l'ha
 * detto l'ultima volta. Se sono passati piu' di due minuti, e' morto — e non
 * serve che nessuno glielo comunichi.
 */

import { hostname, totalmem, loadavg, uptime } from "node:os";
import { readFileSync } from "node:fs";
import { comandi, giri, isDbConfigured, type GiroDoc } from "../base/db.js";

/** Oltre questo silenzio il lettore si considera morto, non lento. */
export const SILENZIO_MASSIMO_MS = 120_000;

/** Ogni quanto battere. Piu' fitto non serve, piu' rado sembra morto. */
const OGNI_MS = 5_000;

const QUESTA_MACCHINA = process.env.NOME_MACCHINA ?? hostname();

/**
 * La chiave del battito: macchina E processo.
 *
 * Il nome della macchina da solo non basta, e si e' visto alla prima prova. Su
 * uno stesso computer possono girare due lettori insieme — lo script lanciato
 * a mano e il lavoro notturno del server — e con una chiave sola si
 * sovrascrivevano a vicenda ogni cinque secondi. Il pannello mostrava un
 * numero che saltava da ventimila a cinquemila e tornava indietro: sembrava un
 * guasto del contatore, invece erano due contatori diversi nella stessa riga.
 *
 * Col numero del processo dentro, i due lettori compaiono come due righe, che
 * e' la verita'.
 */
const CHIAVE_BATTITO = `battito-${QUESTA_MACCHINA}-${process.pid}`;

/**
 * Il tetto di memoria VERO, che dentro un container non e' quello della macchina.
 *
 * `os.totalmem()` legge `/proc/meminfo`, e quel file dentro un container non e'
 * isolato: mostra il computer fisico. Su Render diceva 31.387 MB — trentun giga
 * del server condiviso con gli altri clienti — mentre il nostro servizio ne ha
 * 512. Il risultato era un indicatore cieco proprio dove serviva: potevamo
 * essere a 480 MB su 512, a un respiro dall'essere uccisi, e la barra restava
 * tranquilla perche' guardava il serbatoio della macchina accanto. E' successo:
 * Render ci ha uccisi per memoria mentre il pannello dava tutto sereno.
 *
 * Il limite vero sta nel cgroup. Due posti, perche' ci sono due versioni di
 * cgroup in giro, e nessuno dei due esiste fuori da Linux — su Windows si torna
 * alla RAM della macchina, che li' e' la risposta giusta: il PC non e' dentro
 * nessun container.
 */
function tettoMemoria(): number {
  for (const dove of ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
    try {
      const t = readFileSync(dove, "utf8").trim();
      /* `max` vuol dire «nessun limite»: e' il caso di un Linux non in container. */
      if (t && t !== "max") {
        const n = Number(t);
        /* Un limite assurdamente grande e' il modo di cgroup v1 di dire «nessuno». */
        if (Number.isFinite(n) && n > 0 && n < 1024 ** 4) return n;
      }
    } catch {
      /* Il file non c'e': non siamo in un container, o non e' Linux. */
    }
  }
  return totalmem();
}

const TETTO_MEMORIA = tettoMemoria();

/**
 * Come sta chi legge, in tre numeri.
 *
 * La memoria e' quella DEL NOSTRO PROCESSO, non della macchina: `rss` e' cio'
 * che il sistema conta per decidere se ucciderci, quindi e' l'unico numero che
 * predice il guaio. Quella libera sulla macchina non c'entra niente — e su
 * Render parlava di un altro computer.
 *
 * Su Windows `loadavg()` torna sempre zero: e' una misura che il sistema non
 * tiene. Non si finge — si lascia zero, e il pannello scrive «non misurato»
 * invece di mostrare uno zero che sembra un carico bassissimo.
 */
function comeSta() {
  return {
    ramUsataMb: Math.round(process.memoryUsage().rss / 1048576),
    ramTotaleMb: Math.round(TETTO_MEMORIA / 1048576),
    carico: Math.round(loadavg()[0] * 100) / 100,
    accesaDaSec: Math.round(uptime()),
  };
}

/** Quello che un giro in corso racconta di sé. */
export interface GiroVivo {
  macchina: string;
  lavoro: string;
  inizio: Date;
  tocco: Date;
  aperte: number;
  conPrezzo: number;
  saltate: number;
  paesi?: string[];
  ramUsataMb?: number;
  ramTotaleMb?: number;
  carico?: number;
  accesaDaSec?: number;
}

/**
 * Un giro aperto, che si aggiorna da solo.
 *
 * Si crea all'inizio, gli si dicono i numeri quando cambiano, e si chiude alla
 * fine. Se il processo muore prima di `chiudi`, la riga resta con l'ora vecchia
 * — ed e' esattamente l'informazione che serve.
 */
export class GiroInCorso {
  private ultimoInvio = 0;
  private fermami = false;
  private aperte = 0;
  private conPrezzo = 0;
  private saltate = 0;
  private readonly inizio = new Date();
  /* Le scritture non si aspettano: se Mongo e' lento, il lettore non deve
     rallentare per raccontare che sta andando veloce. */
  private inVolo: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly lavoro: string,
    private readonly paesi?: string[],
  ) {}

  /**
   * Da chiamare quando i numeri cambiano. Scrive solo ogni cinque secondi.
   *
   * Nella stessa occasione guarda se qualcuno ha lasciato un ordine di fermarsi:
   * e' gratis, perche' la connessione al database e' gia' aperta e il viaggio
   * si sta facendo comunque.
   */
  segna(aperte: number, conPrezzo: number, saltate = 0): void {
    this.aperte = aperte;
    this.conPrezzo = conPrezzo;
    this.saltate = saltate;
    const ora = Date.now();
    if (ora - this.ultimoInvio < OGNI_MS) return;
    this.ultimoInvio = ora;
    this.scrivi("battito");
    this.leggiOrdini();
  }

  /**
   * Qualcuno ha chiesto di fermarsi?
   *
   * Si guarda soltanto: chi lavora decide quando smettere, e lo fa in un punto
   * in cui fermarsi non perde niente — mai nel mezzo di una scrittura.
   */
  get devoFermarmi(): boolean {
    return this.fermami;
  }

  private leggiOrdini(): void {
    if (!isDbConfigured() || this.fermami) return;
    void (async () => {
      try {
        const c = await comandi();
        const o = await c.findOne({ _id: "comando" });
        /* Conta solo un ordine dato DOPO che questo giro e' partito. Senza
           questo, un «ferma» di ieri fermerebbe il giro di stanotte appena
           nato, per sempre, e nessuno capirebbe perche'. */
        if (!o || o.azione !== "ferma") return;
        if (o.per !== "tutti" && o.per !== QUESTA_MACCHINA) return;
        if (new Date(o.quando) <= this.inizio) return;
        this.fermami = true;
        console.info(`[giro] ordine di fermarsi, dato da ${o.da}. Chiudo appena posso.`);
      } catch {
        /* Un ordine non letto non deve fermare il lavoro. */
      }
    })();
  }

  /** Il giro e' finito: si archivia e la riga viva sparisce. */
  async chiudi(esito: GiroDoc["esito"]): Promise<void> {
    await this.inVolo;
    if (!isDbConfigured()) return;
    try {
      const c = await giri();
      const riga: GiroDoc = {
        _id: `giro-${this.inizio.toISOString()}-${QUESTA_MACCHINA}-${process.pid}`,
        tipo: "giro",
        macchina: QUESTA_MACCHINA,
        lavoro: this.lavoro,
        inizio: this.inizio,
        tocco: new Date(),
        aperte: this.aperte,
        conPrezzo: this.conPrezzo,
        saltate: this.saltate,
        ...comeSta(),
        esito,
        ...(this.paesi ? { paesi: this.paesi } : {}),
      };
      const { _id, ...corpo } = riga;
      await c.replaceOne({ _id }, corpo, { upsert: true });
      /* La riga viva di QUESTA macchina se ne va. Quella di un'altra macchina
         che sta ancora lavorando resta dov'e'. */
      await c.deleteOne({ _id: CHIAVE_BATTITO });
    } catch {
      /* Il registro non deve mai far fallire il lavoro che racconta. */
    }
  }

  private scrivi(tipo: "battito"): void {
    if (!isDbConfigured()) return;
    this.inVolo = (async () => {
      try {
        const c = await giri();
        await c.replaceOne(
          { _id: CHIAVE_BATTITO },
          {
            tipo,
            macchina: QUESTA_MACCHINA,
            lavoro: this.lavoro,
            inizio: this.inizio,
            tocco: new Date(),
            aperte: this.aperte,
            conPrezzo: this.conPrezzo,
            saltate: this.saltate,
            ...comeSta(),
            ...(this.paesi ? { paesi: this.paesi } : {}),
          },
          { upsert: true },
        );
      } catch {
        /* vedi sopra */
      }
    })();
  }
}

/**
 * Chi sta lavorando in questo momento, e da quale macchina.
 *
 * Torna solo i battiti recenti: uno vecchio di piu' di due minuti e' un
 * lettore morto, e mostrarlo come vivo sarebbe peggio che non mostrarlo.
 */
export async function chiStaLavorando(): Promise<GiroVivo[]> {
  if (!isDbConfigured()) return [];
  try {
    const c = await giri();
    const soglia = new Date(Date.now() - SILENZIO_MASSIMO_MS);
    const righe = await c.find({ tipo: "battito", tocco: { $gte: soglia } }).toArray();
    /* Si toglie quel che non serve invece di ricopiare quel che serve: la
       versione a mano aveva gia' perso per strada i dati della macchina, e
       ogni campo nuovo sarebbe sparito allo stesso modo, in silenzio. */
    return righe.map(({ _id, tipo, esito, ...resto }) => resto);
  } catch {
    return [];
  }
}

/**
 * I giri finiti, dal piu' recente.
 *
 * Comprende anche i battiti scaduti — un lettore morto senza chiudere — perche'
 * «l'ultimo giro e' finito male» e' proprio quello che si vuole sapere.
 */
export async function giriPassati(quanti = 12): Promise<Array<GiroVivo & { esito: string }>> {
  if (!isDbConfigured()) return [];
  try {
    const c = await giri();
    const soglia = new Date(Date.now() - SILENZIO_MASSIMO_MS);
    const righe = await c
      .find({ $or: [{ tipo: "giro" }, { tipo: "battito", tocco: { $lt: soglia } }] } as never)
      .sort({ tocco: -1 })
      .limit(quanti)
      .toArray();
    return righe.map(({ _id, tipo, esito, ...resto }) => ({
      ...resto,
      esito: esito ?? "morto senza chiudere",
    }));
  } catch {
    return [];
  }
}
