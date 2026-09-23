/**
 * Chiedere il permesso prima di leggere, e ricordarsi di averlo chiesto.
 *
 * IL BUCO CHE QUESTO FILE CHIUDE
 * ------------------------------
 * `base/robots.ts` sa leggere un `robots.txt` da sempre, e lo sa leggere bene.
 * Ma fino a oggi glielo chiedeva soltanto `caccia-insegne`, cioe' il momento in
 * cui si VALUTA un negozio nuovo. Il lettore continuo — quello che apre
 * mezzo milione di pagine al giorno, tutti i giorni — non glielo chiedeva mai.
 *
 * Il permesso lo si verificava una volta, all'ingresso, e poi lo si dava per
 * acquisito per sempre. Un negozio che aggiunge un `Disallow` a marzo lo
 * avremmo continuato a leggere fino a quando a qualcuno non fosse venuto in
 * mente di lanciare uno script a mano.
 *
 * SULLE TRE RISPOSTE, E SULLA QUARTA
 * ----------------------------------
 * Un `robots.txt` puo' dire tre cose: si', no, e dipende dal percorso. Ma ci
 * sono anche i casi in cui non dice niente — il file non c'e', il server non
 * risponde, la rete cade, arriva un 503. Quella e' la QUARTA risposta, e
 * tenerla separata e' la decisione piu' importante di questo file:
 *
 *   **un silenzio non e' un divieto, e non sospende niente.**
 *
 * Il motivo e' che il contrario si rompe nel modo peggiore. Se un timeout
 * valesse come «no», un'ora di rete ballerina spegnerebbe meta' catalogo, e la
 * riaccensione richiederebbe qualcuno che se ne accorga. Peggio: sarebbe un
 * guasto che si traveste da scrupolo, e nessuno va a controllare gli scrupoli.
 * Si sospende solo su un `Disallow` LETTO, che combacia col percorso, in un
 * file che ha risposto.
 *
 * QUANTO SPESSO
 * -------------
 * Dodici ore per insegna, contate dentro il processo. Con cinquanta insegne
 * sono cento richieste al giorno in tutto — accanto alle cinquecentomila
 * pagine che apriamo, non e' una quantita' di cui discutere. E il lettore
 * continuo resta acceso per giorni: senza un intervallo, il ricordo del primo
 * minuto varrebbe fino al riavvio.
 */

import { fonti, permessi, type PermessoDoc } from "../base/db.js";
import { robotsDi, permesso } from "../base/robots.js";

export type Esito = PermessoDoc["e"];

export interface Verdetto {
  esito: Esito;
  /** La regola che ha deciso, testuale. Si legge nel pannello e nei log. */
  regola: string;
  /** I percorsi provati: serve per rifare il conto a mano. */
  percorsi: string[];
}

/** Ogni quanto si ricontrolla la stessa insegna. Vedi il commento in testa. */
const RICONTROLLA_OGNI_MS = 12 * 3_600_000;

/**
 * Quante pagine si provano per insegna.
 *
 * Una sola non basta a distinguere «vietato tutto» da «vietata quella». Le
 * coppie del tipo `Disallow: /promo/` + `Allow: /prodotti/` sono comuni, e con
 * un campione solo si finisce per spegnere un'insegna intera per una sezione.
 * Tre pagine prese lontane fra loro nel catalogo costano zero — il file si
 * scarica una volta e il confronto e' stringhe — e bastano a vedere la
 * differenza.
 */
const CAMPIONI = 3;

/**
 * La frase con cui marchiamo le insegne sospese DA QUI.
 *
 * Serve a non resuscitare quello che ha spento una persona. `esclusa` e'
 * l'interruttore generale e ci scrivono dentro anche gli umani, con motivi che
 * un `robots.txt` tornato permissivo non risolve — «Alcampo ci ha diffidati»
 * non si annulla perche' hanno cambiato un file. Quando il divieto sparisce
 * riaccendiamo solo cio' che porta questo prefisso.
 */
const PER_ROBOTS = "robots.txt:";

interface Ricordo extends Verdetto {
  quando: number;
}
const ricordo = new Map<string, Ricordo>();

/** I percorsi da provare, presi lontani fra loro nel catalogo. */
function campiona(indirizzi: string[]): string[] {
  const buoni = indirizzi.filter(Boolean);
  if (buoni.length === 0) return [];
  if (buoni.length <= CAMPIONI) return buoni;
  const passo = Math.floor(buoni.length / CAMPIONI);
  return Array.from({ length: CAMPIONI }, (_, i) => buoni[i * passo]);
}

/**
 * Questa insegna si puo' leggere adesso?
 *
 * `indirizzi` sono le pagine che il giro sta per aprire: si provano quelle, non
 * la home. Un divieto su `/prodotti/` non si vede chiedendo il permesso per `/`.
 *
 * Non lancia mai: un controllo che fallisce restituisce `IGNOTO`, e `IGNOTO`
 * lascia lavorare. Vedi il commento in testa al file.
 *
 * Con `scrivi` a falso guarda e riferisce senza toccare niente: serve a
 * vedere cosa succederebbe prima che succeda.
 */
export async function permessoDiLeggere(
  paese: string,
  insegna: string,
  indirizzi: string[],
  scrivi = true,
): Promise<Verdetto> {
  const chiave = `${paese}|${insegna}`;
  const vecchio = ricordo.get(chiave);
  if (vecchio && Date.now() - vecchio.quando < RICONTROLLA_OGNI_MS) return vecchio;

  const verdetto = await chiedi(indirizzi);
  ricordo.set(chiave, { ...verdetto, quando: Date.now() });

  /* La prova a vuoto: si legge e si dice, non si tocca niente. Il giro
     continuo non la usa mai — chi legge deve rispettare quel che ha letto —
     ma un controllo lanciato a mano sull'intero catalogo puo' spegnere
     insegne vere, e quella e' una cosa che si guarda prima di farla. */
  if (!scrivi) return verdetto;

  /* La scrittura non si aspetta: il giro non deve rallentare per raccontare
     una cosa che ha gia' deciso. Se il database e' giu', il verdetto vale lo
     stesso — quel che si perde e' la prova, non il rispetto della regola. */
  void registra(chiave, verdetto).catch(() => {
    /* Un registro che non si scrive non deve fermare il lavoro che racconta. */
  });

  return verdetto;
}

async function chiedi(indirizzi: string[]): Promise<Verdetto> {
  const prove = campiona(indirizzi);
  if (prove.length === 0) {
    return { esito: "IGNOTO", regola: "nessuna pagina da provare", percorsi: [] };
  }

  let origine: string;
  const percorsi: string[] = [];
  try {
    for (const u of prove) percorsi.push(new URL(u).pathname);
    origine = new URL(prove[0]).origin;
  } catch {
    return { esito: "IGNOTO", regola: "indirizzi illeggibili", percorsi };
  }

  const r = await robotsDi(origine, true);
  if (r.assente) {
    return { esito: "IGNOTO", regola: "robots.txt non risponde", percorsi };
  }

  const esiti = percorsi.map((p) => permesso(r.regole, p));
  const si = esiti.filter((e) => e.ok).length;
  if (si === esiti.length) {
    return { esito: "ALLOW", regola: esiti[0].regola, percorsi };
  }
  if (si === 0) {
    return { esito: "DISALLOW", regola: esiti[0].regola, percorsi };
  }
  /* Alcune si' e alcune no: e' una regola di sezione, non un divieto
     sull'insegna. Non si sospende niente — si segnala, perche' significa che
     stiamo leggendo pagine che loro dividono in due gruppi, e qualcuno deve
     guardare quale dei due stiamo prendendo. */
  const vietata = esiti.find((e) => !e.ok);
  return {
    esito: "PARZIALE",
    regola: `${vietata?.regola ?? "?"} (${si} di ${esiti.length} permesse)`,
    percorsi,
  };
}

/**
 * Si scrive in due posti, e non e' una ripetizione.
 *
 *   `fonti`     com'e' ADESSO. Si sovrascrive. Serve a stanotte.
 *   `permessi`  com'e' STATO, con le date. Non si sovrascrive, non scade.
 *               Serve fra un anno, quando la domanda non e' piu' «possiamo?»
 *               ma «potevamo, quel giorno?».
 */
async function registra(chiave: string, v: Verdetto): Promise<void> {
  await Promise.all([segnaSullaFonte(chiave, v), segnaNelRegistro(chiave, v)]);
}

async function segnaSullaFonte(chiave: string, v: Verdetto): Promise<void> {
  const col = await fonti();
  const ora = new Date();

  /* IGNOTO NON SOVRASCRIVE UN VERDETTO, MA NON DEVE NEMMENO SPARIRE.
     La prima versione scriveva solo la data: «non sappiamo» sopra un «ci hanno
     detto di si'» letto ieri peggiora la scheda invece di aggiornarla, e
     quello resta vero.

     Ma il pannello, la sera stessa, ha mostrato Conad fra le «mai
     controllate» — e non e' vero: l'abbiamo interrogata, non ha risposto.
     «Non abbiamo chiesto» e «non siamo riusciti a chiedere» finivano nella
     stessa casella, che e' proprio la distinzione per cui quella tabella
     esiste.

     Quindi si scrive IGNOTO solo dove non c'era ancora niente. Un verdetto
     gia' noto resta; un'insegna che non ha mai risposto smette di sembrare
     una a cui nessuno ha chiesto. */
  if (v.esito === "IGNOTO") {
    await col.updateOne({ _id: chiave }, { $set: { controllatoIl: ora } });
    await col.updateOne(
      { _id: chiave, robots: { $exists: false } },
      { $set: { robots: "IGNOTO" } },
    );
    return;
  }

  if (v.esito === "DISALLOW") {
    await col.updateOne(
      { _id: chiave },
      {
        $set: {
          robots: v.esito,
          controllatoIl: ora,
          raccolta: "SOSPESA",
          esclusa: `${PER_ROBOTS} ${v.regola}`,
        },
      },
    );
    console.warn(`[permessi] ${chiave} ci ha detto di no (${v.regola}). Sospesa.`);
    return;
  }

  await col.updateOne({ _id: chiave }, { $set: { robots: v.esito, controllatoIl: ora } });

  /* E se l'avevamo sospesa NOI per questo motivo, si riaccende. Solo se il
     prefisso e' il nostro: vedi `PER_ROBOTS`. */
  if (v.esito === "ALLOW") {
    const riaccesa = await col.updateOne(
      { _id: chiave, esclusa: { $regex: `^${PER_ROBOTS}` } },
      { $set: { raccolta: "ATTIVA" }, $unset: { esclusa: "" } },
    );
    if (riaccesa.modifiedCount > 0) {
      console.info(`[permessi] ${chiave} non ci vieta piu' niente. Riaccesa.`);
    }
  }
}

async function segnaNelRegistro(chiave: string, v: Verdetto): Promise<void> {
  const col = await permessi();
  const ora = new Date();

  /* Se dice la stessa cosa di prima, non e' una riga nuova: e' la stessa che
     dura. Si sposta solo l'ultima conferma. */
  const conferma = await col.updateOne(
    { f: chiave, aperta: true, e: v.esito, r: v.regola },
    { $set: { u: ora } },
  );
  if (conferma.matchedCount > 0) return;

  /* E' cambiato. Si chiude quello di prima e se ne apre uno nuovo: l'indice
     unico parziale garantisce che aperto ce ne sia sempre e solo uno. */
  await col.updateOne({ f: chiave, aperta: true }, { $unset: { aperta: "" } });
  await col.insertOne({
    f: chiave,
    e: v.esito,
    r: v.regola,
    pr: v.percorsi,
    t: ora,
    u: ora,
    aperta: true,
  } as PermessoDoc);
}

/** Quel che si e' deciso finora, per la riga del giro. */
export function riepilogoPermessi(): {
  permesse: number;
  vietate: number;
  ignote: number;
  sospese?: string[];
} {
  let permesse = 0;
  let vietate = 0;
  let ignote = 0;
  const sospese: string[] = [];
  for (const [chiave, v] of ricordo) {
    if (v.esito === "DISALLOW") {
      vietate++;
      sospese.push(chiave);
    } else if (v.esito === "IGNOTO") ignote++;
    else permesse++;
  }
  return { permesse, vietate, ignote, ...(sospese.length ? { sospese } : {}) };
}

/**
 * I permessi raccolti, paese per paese.
 *
 * PERCHE' IL NUMERO DI INSEGNE STA ACCANTO AGLI ALTRI
 * ---------------------------------------------------
 * «Due vietate» non vuol dire niente da solo: su due insegne e' il paese
 * chiuso, su quaranta e' un dettaglio. Il denominatore non e' un di piu',
 * e' la meta' dell'informazione — e senza, chi guarda il pannello se lo va
 * a cercare altrove o, peggio, se lo immagina.
 *
 * E «senza risposta» sta in una colonna sua, lontano da «permesse». Sono due
 * cose che si somigliano e non sono la stessa: una vuol dire «abbiamo chiesto
 * e ci hanno detto di si'», l'altra vuol dire «non siamo riusciti a chiedere».
 * Metterle insieme racconterebbe una situazione piu' tranquilla del vero, ed
 * e' esattamente il tipo di arrotondamento che in una due diligence si paga.
 */
export interface PermessiPaese {
  paese: string;
  insegne: number;
  si: number;
  no: number;
  meta: number;
  ignote: number;
  /** Quelle a cui non ha ancora chiesto nessuno. */
  mai: number;
  /** L'ultimo controllo fatto in questo paese, quale che sia l'insegna. */
  ultimo?: string;
  /**
   * Le insegne che NON sono un semplice «si'», con nome e motivo.
   *
   * Un conteggio dice che c'e' qualcosa da guardare; non dice cosa. «DE: 1
   * vietata» manda comunque qualcuno ad aprire un terminale — ed e' il viaggio
   * che questo pannello esiste per risparmiare. Le permesse non si elencano:
   * sono duecentoventisei e non le legge nessuno.
   */
  daGuardare: Array<{ insegna: string; stato: Esito; regola?: string }>;
}

export async function permessiPerPaese(): Promise<PermessiPaese[]> {
  const col = await fonti();
  const righe = (await col
    .find({}, { projection: { paese: 1, insegna: 1, robots: 1, controllatoIl: 1, esclusa: 1 } })
    .toArray()) as unknown as Array<{
    paese?: string;
    insegna?: string;
    robots?: Esito;
    controllatoIl?: Date;
    esclusa?: string;
  }>;

  /* La regola che ha deciso sta nel registro, non sulla fonte: si prende da li'
     per poterla mostrare accanto al nome. Sono poche righe — una per insegna
     che ha un esito in vigore — e si leggono in una volta sola. */
  const regole = new Map<string, string>();
  try {
    for (const r of await (await permessi()).find({ aperta: true }).project({ f: 1, r: 1 }).toArray()) {
      const x = r as unknown as { f: string; r: string };
      regole.set(x.f, x.r);
    }
  } catch {
    /* Senza le regole la tabella si vede lo stesso, con i soli conteggi. */
  }

  const per = new Map<string, PermessiPaese>();
  for (const r of righe) {
    const paese = r.paese ?? "??";
    let x = per.get(paese);
    if (!x) {
      x = { paese, insegne: 0, si: 0, no: 0, meta: 0, ignote: 0, mai: 0, daGuardare: [] };
      per.set(paese, x);
    }
    x.insegne++;
    /* «Mai» si misura sulla DATA, non sul verdetto: un'insegna interrogata che
       non ha risposto ha una data e nessuna risposta, ed e' un terzo stato. */
    if (r.robots === "ALLOW") x.si++;
    else if (r.robots === "DISALLOW") x.no++;
    else if (r.robots === "PARZIALE") x.meta++;
    else if (r.robots === "IGNOTO" || r.controllatoIl) x.ignote++;
    else x.mai++;

    if (r.robots && r.robots !== "ALLOW") {
      x.daGuardare.push({
        insegna: r.insegna ?? "?",
        stato: r.robots,
        regola: regole.get(`${paese}|${r.insegna}`),
      });
    }
    if (r.controllatoIl) {
      const q = new Date(r.controllatoIl).toISOString();
      if (!x.ultimo || q > x.ultimo) x.ultimo = q;
    }
  }

  /* Prima i paesi che hanno qualcosa da guardare: un divieto, una regola di
     sezione, un silenzio. Poi i mai controllati. In fondo quelli a posto —
     che sono la maggioranza, e che nessuno apre il pannello per vedere. */
  return [...per.values()].sort((a, b) => {
    const peso = (x: PermessiPaese) => x.no * 1000 + x.meta * 100 + x.ignote * 10 + (x.mai ? 1 : 0);
    return peso(b) - peso(a) || b.insegne - a.insegne || a.paese.localeCompare(b.paese);
  });
}
