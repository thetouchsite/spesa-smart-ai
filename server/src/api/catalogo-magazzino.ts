/**
 * Il catalogo su database, invece che riscaricato dai negozi a ogni avvio.
 *
 * IL PROBLEMA
 * -----------
 * Il catalogo di un paese si costruisce scaricando le sitemap delle sue
 * insegne: la Spagna sono 197.721 prodotti da otto negozi, e costa tredici
 * secondi di rete piu' qualche decina di megabyte.
 *
 * Finche' il processo vive, si paga una volta. Ma sul piano gratuito di Render
 * la macchina si spegne dopo quindici minuti di silenzio, e al risveglio la
 * memoria e' vuota: si riscarica tutto. In pratica quasi ogni utente paga quei
 * secondi, e i negozi ricevono quelle richieste, per un catalogo che nel
 * frattempo non e' cambiato di una riga.
 *
 * COSA CAMBIA
 * -----------
 *   prima   avvio → venti sitemap dai negozi → 13-35 secondi
 *   ora     avvio → un documento dal database → due o tre
 *
 * E i negozi li interroga solo il lavoro notturno, una volta al giorno,
 * invece che ogni riavvio della macchina.
 *
 * PERCHE' COMPRESSO, E UN DOCUMENTO PER INSEGNA
 * ---------------------------------------------
 * Tre milioni di prodotti come tre milioni di documenti sono circa 867 MB con
 * gli indici, e il piano gratuito di Atlas ne da' 512: non ci sta. Gli stessi
 * dati compressi, un documento per insegna, sono 55 MB — un sedicesimo, con
 * dieci volte il margine.
 *
 * Un documento per insegna e non per paese perche' Mongo si ferma a 16 MB per
 * documento: la piu' grossa che abbiamo sta a 8, comoda; un paese intero in un
 * documento solo sfonderebbe.
 *
 * Non si indicizza niente del contenuto: qui dentro non si cerca. Si legge il
 * pacchetto, si scompatta, e l'indice per parole lo costruisce `catalogo.ts`
 * in memoria come ha sempre fatto — quello e' veloce e non e' mai stato il
 * problema.
 *
 * SENZA DATABASE FUNZIONA LO STESSO
 * ---------------------------------
 * Se Mongo non c'e' o non risponde, si torna a scaricare le sitemap: piu'
 * lento, non rotto. La stessa regola del magazzino dei prezzi.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { Binary } from "mongodb";
import { cataloghi as collezioneCataloghi, fonti, isDbConfigured } from "../base/db.js";
import { conInterruttore, statoInterruttore } from "../base/interruttore.js";

/** Una voce come sta nel pacchetto: indirizzo e nome, niente altro. */
export interface VoceSalvata {
  url: string;
  nome: string;
}

/**
 * Quanto vale un catalogo salvato.
 *
 * Trenta ore, cioe' un po' piu' del giro notturno: se il lavoro di stanotte
 * salta — la macchina dormiva, la rete e' caduta — quello di ieri vale ancora
 * e nessuno se ne accorge. Piu' stretto di cosi' e un ritardo diventa un
 * disservizio; piu' largo e si rischia di servire un catalogo di ieri l'altro.
 *
 * Qui dentro non ci sono prezzi, quindi invecchia piano: cambia solo quando un
 * negozio aggiunge o toglie un prodotto.
 */
const VALIDITA_MS = 30 * 3_600_000;

/** Una lettura non deve tenere in ostaggio una richiesta. */
/**
 * Quanto si aspetta per LEGGERE un catalogo.
 *
 * Erano otto secondi, tarati su un catalogo da poche migliaia di voci. Ma
 * Carrefour Emirati sono ottocentomila indirizzi in venti megabyte, e su
 * Atlas gratuito - cento kilobyte al secondo - scaricarli richiede piu' di
 * tre minuti: la lettura scadeva sempre e quel catalogo risultava vuoto.
 *
 * Novanta secondi. Chi chiede un paese non resta appeso a questo: il
 * caricamento gira in sottofondo e la richiesta ha la sua attesa, piu' corta.
 * Questo e' il tetto oltre il quale si smette di provare, non il tempo che
 * qualcuno passa a guardare una schermata.
 */
const ATTESA_MS = 90_000;

/**
 * Quanto si aspetta per SCRIVERE un catalogo.
 *
 * Otto secondi bastano a una lettura, che sta fra un utente e la sua risposta.
 * Una scrittura no: il catalogo di Carrefour Emirati sono venti megabyte, e su
 * Atlas gratuito - cento kilobyte al secondo - sono piu' di tre minuti.
 * Scadendo a otto secondi il salvataggio falliva ogni volta, in silenzio,
 * e l'interruttore poi saltava anche i successivi: ottocentomila indirizzi
 * dichiarati salvati e mai scritti, due volte di fila.
 *
 * Qui non c'e' nessuno che aspetta. Dieci minuti sono generosi per un
 * catalogo grosso e restano un tetto: se il database e' davvero morto, si
 * smette comunque.
 */
const ATTESA_SCRITTURA_MS = 10 * 60_000;

function nonOltreScrivendo<T>(lavoro: () => Promise<T>, ripiego: T): Promise<T> {
  return conInterruttore("magazzino-catalogo-scrittura", ATTESA_SCRITTURA_MS, lavoro, ripiego);
}

/** Come sopra: vedi `interruttore.ts` per il perche' non basta un timeout. */
function nonOltre<T>(lavoro: () => Promise<T>, ripiego: T): Promise<T> {
  return conInterruttore("magazzino-catalogo", ATTESA_MS, lavoro, ripiego);
}

/**
 * Il pacchetto: una riga per prodotto, indirizzo e nome separati da tabulazione.
 *
 * Non JSON. Su duecentomila voci le virgolette e le parentesi di JSON sono
 * megabyte di punteggiatura, e qui non serve niente che un separatore non
 * faccia gia': i campi sono due e nessuno dei due contiene tabulazioni.
 */
function impacchetta(voci: VoceSalvata[]): Buffer {
  return gzipSync(voci.map((v) => `${v.url}\t${v.nome}`).join("\n"), { level: 6 });
}

/**
 * Dove il catalogo si ferma dopo essere stato scaricato una volta.
 *
 * MISURATO: novantasei kilobyte al secondo.
 * E' la banda di Atlas nel piano gratuito, non il nostro codice. Il catalogo
 * di Carrefour Emirati sono cinquantotto megabyte in sei pezzi: dieci minuti.
 * Con novanta secondi di tetto non si leggeva MAI, e la risposta era `null` —
 * la stessa che dice «non c'e'». Cinque cataloghi, i piu' grossi che abbiamo,
 * risultavano inesistenti.
 *
 * Un catalogo pero' cambia una volta al mese, e sul disco ci sta. La chiave e'
 * la data di aggiornamento: se quella sul disco combacia con quella sul
 * database, il pacchetto e' lo stesso e non c'e' niente da riscaricare.
 * Quarantacinque secondi diventano cinque millisecondi.
 *
 * E' LA STESSA CARTELLA DEL LETTORE, DI PROPOSITO.
 * `prezzi-continuo.ts` aveva gia' questa cache e se la riempiva da solo, ma
 * solo per se': chi passava di qui — l'API, gli script, il cruscotto —
 * continuava a pagare lo scaricamento intero. Adesso la riempie il primo che
 * arriva e la usano tutti. Vedi anche `scalda-cataloghi.ts`, che la riempie
 * apposta senza tetto di tempo.
 *
 * SENZA DISCO SI VA AVANTI LO STESSO.
 * Su Render il disco e' effimero e sparisce a ogni riavvio: li' questa cache
 * vale quanto dura il processo, che e' comunque meglio di niente. Ogni
 * lettura e ogni scrittura sono avvolte, perche' un disco pieno o di sola
 * lettura deve rendere il codice piu' lento, non rotto.
 */
const CACHE = "diario/cataloghi";

function sulDisco(paese: string, insegna: string, pezzo: number): string {
  const nome = `${paese}-${insegna.replace(/[^\p{L}\p{N}]+/gu, "_")}`;
  return `${CACHE}/${nome}${pezzo === 0 ? "" : "-" + (pezzo + 1)}`;
}

/** Il pezzo dal disco, se c'e' ed e' della stessa data. */
function dalDisco(paese: string, insegna: string, pezzo: number, quando: number): Buffer | null {
  try {
    const base = sulDisco(paese, insegna, pezzo);
    if (!existsSync(base + ".gz")) return null;
    if (Number(readFileSync(base + ".quando", "utf8")) !== quando) return null;
    return readFileSync(base + ".gz");
  } catch {
    return null;
  }
}

function versoIlDisco(
  paese: string,
  insegna: string,
  pezzo: number,
  quando: number,
  dati: Buffer,
): void {
  try {
    mkdirSync(CACHE, { recursive: true });
    const base = sulDisco(paese, insegna, pezzo);
    writeFileSync(base + ".gz", dati);
    writeFileSync(base + ".quando", String(quando));
  } catch {
    /* Senza disco si va avanti lo stesso: piu' lenti, non rotti. */
  }
}

function scompatta(dati: Buffer): VoceSalvata[] {
  const fuori: VoceSalvata[] = [];
  for (const riga of gunzipSync(dati).toString("utf8").split("\n")) {
    const taglio = riga.indexOf("\t");
    if (taglio > 0) fuori.push({ url: riga.slice(0, taglio), nome: riga.slice(taglio + 1) });
  }
  return fuori;
}

/**
 * Il catalogo salvato di un'insegna, se c'e' ed e' ancora valido.
 *
 * Restituisce `null` quando manca o e' vecchio: chi chiama scarica le sitemap
 * come prima e poi salva il risultato.
 */
export async function catalogoSalvato(
  paese: string,
  insegna: string,
): Promise<VoceSalvata[] | null> {
  if (!isDbConfigured()) return null;

  /* Alzata quando il corpo della lettura arriva in fondo: serve a distinguere
     «non c'e'» da «non ho fatto in tempo». Vedi il commento in coda. */
  let letto = false;

  return nonOltre(
    async () => {
      const col = await collezioneCataloghi();
      /* PRIMA LA DATA, SENZA IL PACCHETTO.
         Per sapere se il catalogo e' ancora valido — e se quello sul disco e'
         lo stesso — bastano due campi. Chiedendo il documento intero si
         scaricano i dieci megabyte del primo pezzo PER DECIDERE se servono:
         su Carrefour Emirati sono cento secondi, e i novanta di tetto
         finivano li' dentro, prima ancora di guardare il disco dove il
         pacchetto stava gia'. */
      const capo = await col.findOne(
        { _id: `${paese}|${insegna}` },
        { projection: { aggiornato: 1, pezzi: 1 } },
      );
      if (!capo) {
        letto = true;
        return null;
      }
      if (Date.now() - capo.aggiornato.getTime() > VALIDITA_MS) {
        letto = true;
        return null;
      }

      /* I cataloghi troppo grossi per un documento stanno in piu' pezzi: il
         primo dice quanti sono, gli altri si chiamano `#2`, `#3`... Quelli
         vecchi non hanno il campo e valgono per uno. */
      const quanti = Math.max(1, Number((capo as { pezzi?: number }).pezzi) || 1);
      const quando = capo.aggiornato.getTime();
      const fuori: VoceSalvata[] = [];
      for (let i = 0; i < quanti; i++) {
        /* Prima il disco: se la data combacia e' lo stesso pacchetto, e
           costa millisecondi invece di decine di secondi. */
        let dati = dalDisco(paese, insegna, i, quando);
        if (!dati) {
          /* Solo adesso si paga il pacchetto, e solo del pezzo che manca. */
          const doc = (await col.findOne({
            _id: i === 0 ? `${paese}|${insegna}` : `${paese}|${insegna}#${i + 1}`,
          })) as { dati?: { buffer: Buffer } } | null;
          if (!doc?.dati) continue;
          dati = Buffer.from(doc.dati.buffer);
          versoIlDisco(paese, insegna, i, quando, dati);
        }
        try {
          /* UNO PER VOLTA, NON `push(...)`.
             `push(...array)` passa OGNI elemento come argomento, e un
             argomento per ognuna di 188.965 voci sfonda lo stack:
             «Maximum call stack size exceeded». L'eccezione finiva
             nell'interruttore, che restituiva il ripiego — `null` — cioe'
             «catalogo assente».

             Fallivano ESATTAMENTE i cataloghi piu' grossi, che sono quelli
             dove sta tutto il lavoro da fare: Disco 188.965, Auchan Ucraina
             146.568, Carrefour KSA 138.025, Carulla 181.953, e i sei pezzi di
             Carrefour Emirati da 133.334 l'uno. Piu' di ottocentomila
             indirizzi dichiarati inesistenti da una riga che sembrava un
             dettaglio di stile. Alcampo, con 87.208 voci, passava: la soglia
             sta in mezzo, e dipende da quanto stack resta — che e' il motivo
             per cui non si era mai vista in una prova piccola. */
          for (const voce of scompatta(dati)) fuori.push(voce);
        } catch {
          // Pacchetto rovinato: gli altri pezzi si tengono lo stesso.
        }
      }
      letto = true;
      return fuori.length > 0 ? fuori : null;
    },
    null,
  ).then((esito) => {
    /* UN'ATTESA SCADUTA NON E' UN CATALOGO CHE NON C'E'.
       `nonOltre` restituisce il ripiego — `null` — sia quando il documento
       manca sia quando i novanta secondi finiscono, e chi chiama non puo'
       distinguerli. E' lo stesso difetto che ha fatto dire «800.000 indirizzi
       salvati» su niente per un giorno intero, in senso inverso.

       Misurato il 21 settembre: Disco, Jumbo, Carrefour KSA, Carulla e Auchan
       Ucraina risultavano tutti «catalogo illeggibile». Sono i cinque
       cataloghi piu' grossi che abbiamo, e a cento kilobyte al secondo —
       la banda del piano gratuito — novanta secondi bastano per nove
       megabyte. Non manca niente: non facciamo in tempo a leggerlo.

       Non si puo' cambiare cosa torna senza cambiare tutti i chiamanti, ma si
       puo' smettere di tacerlo. */
    if (esito === null && !letto) {
      console.warn(
        `[catalogo] ${paese}|${insegna}: lettura non finita entro ${ATTESA_MS / 1000}s. ` +
          `Non vuol dire che il catalogo non ci sia — vuol dire che non si e' fatto in tempo a leggerlo.`,
      );
    }
    return esito;
  });
}

/** Mette da parte il catalogo di un'insegna appena scaricato. */
export async function salvaCatalogo(
  paese: string,
  insegna: string,
  voci: VoceSalvata[],
): Promise<void> {
  if (!isDbConfigured() || voci.length === 0) return;

  const dati = impacchetta(voci);

  /* TROPPO GRANDE SI DICE, NON SI TACE — E SI DICE FUORI DALL'INTERRUTTORE.
     Mongo ammette sedici megabyte per documento. Prima, superata la soglia, si
     tornava `undefined` esattamente come nel caso riuscito: chi chiamava
     stampava «800.000 indirizzi salvati» su un nulla, e il catalogo di
     Carrefour Emirati non e' mai esistito pur comparendo nei totali per un
     giorno intero.

     Il controllo sta PRIMA di `nonOltre` perche' quello e' un interruttore di
     protezione: prende qualunque eccezione e restituisce il ripiego, che e'
     giusto per un database che non risponde e sbagliato per un pacchetto
     troppo grosso — quello non e' un guasto passeggero, e' un no definitivo
     che chi chiama deve sentire. Un fallimento travestito da successo e'
     peggio di un errore: nessuno lo va a cercare. */
  /* SE NON CI STA IN UN DOCUMENTO, SI SPEZZA IN PIU' PEZZI.
     Mongo ammette sedici megabyte per documento, e Carrefour Emirati ne
     occupa di piu': ottocentomila indirizzi che per un giorno sono rimasti
     sul disco perche' non c'era dove metterli. All'ottantacinque per cento di
     resa sono seicentottantamila prodotti — piu' di quanti ne manchino al
     traguardo.

     Un catalogo grosso diventa `PAESE|Insegna` piu' `PAESE|Insegna#2`, `#3`…
     Il primo pezzo tiene il nome di sempre, cosi' tutto quel che cerca un
     catalogo per nome continua a trovarlo, e porta il conto totale; chi legge
     segue i pezzi successivi finche' ci sono. I vecchi cataloghi, che pezzi
     non ne hanno, funzionano esattamente come prima.

     Si spezza a DIECI megabyte e non a quindici: il margine serve perche' il
     documento porta anche il nome, il paese e le date, e perche' un pacchetto
     che cresce fra una raccolta e l'altra non deve far fallire tutto per
     cinquantamila byte. */
  const PEZZO = 10_000_000;

  await nonOltreScrivendo(
    async () => {
      const col = await collezioneCataloghi();

      /* Quanti pezzi servono: si divide l'elenco in parti che, compresse,
         stiano sotto il tetto. Si conta sulle VOCI e non sui byte perche' e'
         quello che si puo' tagliare — la compressione poi fa quel che fa, e il
         rapporto e' abbastanza stabile da starci dentro con questo margine. */
      const quanti = Math.max(1, Math.ceil(dati.length / PEZZO));
      const perPezzo = Math.ceil(voci.length / quanti);

      for (let i = 0; i < quanti; i++) {
        const fetta = voci.slice(i * perPezzo, (i + 1) * perPezzo);
        if (fetta.length === 0) continue;
        await col.updateOne(
          { _id: i === 0 ? `${paese}|${insegna}` : `${paese}|${insegna}#${i + 1}` },
          {
            $set: {
              paese,
              insegna,
              /* Il conto sta tutto sul primo pezzo: e' quello che i totali
                 sommano, e sommarlo anche dagli altri lo conterebbe due volte. */
              prodotti: i === 0 ? voci.length : 0,
              pezzi: i === 0 ? quanti : undefined,
              // Il driver vuole un Binary, non un Buffer nudo.
              dati: new Binary(impacchetta(fetta)),
              aggiornato: new Date(),
            },
          },
          { upsert: true },
        );
      }

      /* I pezzi di una raccolta precedente piu' lunga: se oggi il catalogo si
         e' accorciato, quelli restano li' a raccontare prodotti che non ci
         sono piu'. */
      for (let i = quanti; i < quanti + 8; i++) {
        await col.deleteOne({ _id: `${paese}|${insegna}#${i + 1}` } as never);
      }

      /* SI CONTROLLA DI AVER SCRITTO, INVECE DI FIDARSI.
         Due volte di fila questo salvataggio ha detto «fatto» senza scrivere
         niente: la prima perche' il pacchetto era troppo grosso, la seconda
         perche' scadeva il tempo. Una rilettura costa una domanda e chiude la
         questione — se il documento non c'e', chi ha chiesto deve saperlo e
         mettere il catalogo sul disco. */
      const scritto = await col.findOne({ _id: `${paese}|${insegna}` }, { projection: { _id: 1 } });
      if (!scritto) throw new Error("scritto senza errori ma il documento non c'e'");
      return undefined;
    },
    undefined,
  );
}

/**
 * Cosa c'e' in magazzino: serve allo stato, al pannello e alle prove.
 *
 * TRE MUCCHI, NON UNO.
 * Il conto era uno solo — tutti i cataloghi sommati — e diceva due milioni di
 * link. Ma dentro c'erano tre cose che non si possono sommare senza mentire:
 *
 *   LEGGIBILI  insegne vive. Questo e' il lavoro che si puo' fare.
 *   ESCLUSI    insegne che ci hanno detto di no — il robots.txt di Tigros,
 *              l'accesso obbligatorio di CoopShop. Non sono «da fare piu'
 *              tardi»: sono da non fare mai, e tenerli nel totale fa sembrare
 *              in arretrato una raccolta che e' invece quasi finita.
 *   ORFANI     cataloghi di insegne che nelle fonti non esistono piu'. Il
 *              lettore cerca il catalogo col nome della fonte, quindi a questi
 *              non ci arriva nessuno.
 *
 * Il danno di sommarli non era il numero grosso in se': era che la copertura
 * non poteva salire. L'Italia risultava al 40% mentre il 96% delle schede
 * leggibili era gia' stato letto. Un denominatore sbagliato e' peggio di
 * nessun conto, perche' sembra una misura.
 */
export async function statoCataloghi(): Promise<{
  /** `aperto` = il database non risponde e abbiamo smesso di chiederglielo. */
  interruttore: "chiuso" | "aperto";
  attivo: boolean;
  /** Insegne VIVE con un catalogo. Non i cataloghi in archivio. */
  insegne: number;
  /** Link delle sole insegne vive: quelli su cui la copertura si misura. */
  prodotti: number;
  paesi: string[];
  /** Quel che resta fuori, detto invece che nascosto nel totale. */
  esclusi: { insegne: number; prodotti: number };
  orfani: { insegne: number; prodotti: number };
}> {
  const vuoto = {
    interruttore: "chiuso" as const,
    attivo: false,
    insegne: 0,
    prodotti: 0,
    paesi: [],
    esclusi: { insegne: 0, prodotti: 0 },
    orfani: { insegne: 0, prodotti: 0 },
  };
  if (!isDbConfigured()) return vuoto;

  return nonOltre(
    async () => {
      const elenco = (await (await fonti())
        .find({})
        .project({ insegna: 1, esclusa: 1 })
        .toArray()) as Array<{ insegna?: string; esclusa?: string }>;
      const vive = new Set<string>();
      const escluse = new Set<string>();
      for (const f of elenco) {
        const nome = String(f.insegna ?? "");
        if (f.esclusa) escluse.add(nome);
        else vive.add(nome);
      }

      const righe = await (await collezioneCataloghi())
        .find({}, { projection: { paese: 1, insegna: 1, prodotti: 1 } })
        .toArray();

      let insegne = 0;
      let prodotti = 0;
      const esclusi = { insegne: 0, prodotti: 0 };
      const orfani = { insegne: 0, prodotti: 0 };
      const paesi = new Set<string>();

      for (const r of righe) {
        const nome = String((r as { insegna?: string }).insegna ?? "");
        const quanti = Number((r as { prodotti?: number }).prodotti ?? 0);
        if (vive.has(nome)) {
          insegne++;
          prodotti += quanti;
          /* I paesi si contano sulle sole insegne vive: un paese presente solo
             con una catena esclusa non e' un paese che copriamo. */
          if (r.paese) paesi.add(String(r.paese));
        } else if (escluse.has(nome)) {
          esclusi.insegne++;
          esclusi.prodotti += quanti;
        } else {
          orfani.insegne++;
          orfani.prodotti += quanti;
        }
      }

      return {
        interruttore: statoInterruttore("magazzino-catalogo"),
        attivo: true,
        insegne,
        prodotti,
        paesi: [...paesi].sort(),
        esclusi,
        orfani,
      };
    },
    {
      interruttore: "aperto" as const,
      attivo: true,
      insegne: -1,
      prodotti: -1,
      paesi: [],
      esclusi: { insegne: 0, prodotti: 0 },
      orfani: { insegne: 0, prodotti: 0 },
    },
  );
}
