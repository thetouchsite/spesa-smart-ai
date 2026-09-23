/**
 * Il controllo dei permessi, fatto adesso e a mano.
 *
 * DA QUANDO IL LETTORE LO FA DA SOLO, QUESTO SCRIPT SERVE A UN'ALTRA COSA
 * ----------------------------------------------------------------------
 * Il giro continuo chiede il permesso da se', ogni dodici ore per insegna,
 * usando gli indirizzi che sta per aprire (vedi `api/permessi.ts`). Quindi
 * questo file non e' piu' l'unico posto in cui la domanda si fa — ed e'
 * proprio per questo che NON rifa' il conto per conto suo.
 *
 * Due copie della stessa regola divergono sempre, e qui divergere vuol dire
 * che il pannello dice «permesso» mentre il lettore si comporta come se fosse
 * vietato, o peggio il contrario. La logica sta in un posto solo: questo
 * script la chiama, e scrive negli stessi due registri.
 *
 * A COSA SERVE ANCORA
 * -------------------
 *   · controllare SUBITO, senza aspettare il giro, quando si sospetta
 *     qualcosa o quando arriva una mail da un negozio;
 *   · controllare le insegne ORFANE, quelle che hanno un catalogo ma non una
 *     riga in `fonti`, che il lettore non guarda mai;
 *   · vedere in un elenco com'e' messo tutto il catalogo.
 *
 * Guarda e basta, salvo `--scrivi`.
 *
 *   npx tsx --env-file-if-exists=.env scripts/controlla-robots.ts GB|Morrisons EE|"Barbora EE"
 *   npx tsx --env-file-if-exists=.env scripts/controlla-robots.ts --tutte
 *   npx tsx --env-file-if-exists=.env scripts/controlla-robots.ts --tutte --scrivi
 *   npx tsx --env-file-if-exists=.env scripts/controlla-robots.ts            (le orfane)
 */

import { gunzipSync } from "node:zlib";
import { cataloghi, fonti } from "../src/base/db.js";
import { permessoDiLeggere } from "../src/api/permessi.js";

const argomenti = process.argv.slice(2);
const tutte = argomenti.includes("--tutte");
/* Come `valuta-mancante.ts`: si guarda per prima cosa, si scrive solo se lo
   si chiede. Un controllo che sospende insegne vere non deve poter partire
   per sbaglio, e la differenza fra le due modalita' deve essere visibile
   nella riga di comando, non nascosta in una variabile d'ambiente. */
const scrivi = argomenti.includes("--scrivi");
const chiesti = argomenti.filter((a) => !a.startsWith("--"));

const col = await cataloghi();
const note = new Set<string>();
for (const f of await (await fonti()).find({}).project({ insegna: 1 }).toArray()) {
  note.add(String((f as { insegna?: string }).insegna ?? ""));
}

/* UNO ALLA VOLTA, NON TUTTI INSIEME.
   La prima versione faceva `.toArray()`: dodici cataloghi scaricati e tenuti
   in memoria prima di controllare il primo. Con Carrefour UAE — ottocentomila
   prodotti — e la banda di Atlas gratuito, che e' un decimo di megabyte al
   secondo, sei minuti non erano bastati a stampare UNA riga. Dei duecento-
   trentacinque cataloghi non se ne parla proprio.

   E servivano TRE INDIRIZZI per ciascuno. Con un cursore si scarica uno, si
   prova, si butta: la memoria resta quella di un catalogo solo, e le righe
   compaiono man mano invece che tutte alla fine — che su un lavoro da dieci
   minuti e' la differenza fra «sta andando» e «e' bloccato». */
const cursore = col.find(chiesti.length ? { _id: { $in: chiesti } } : {});

const SIMBOLO = { ALLOW: "  si'   ", DISALLOW: "  NO    ", PARZIALE: "  meta' ", IGNOTO: "  ?     " };
const conto: Record<string, number> = { ALLOW: 0, DISALLOW: 0, PARZIALE: 0, IGNOTO: 0 };

let viste = 0;
for await (const c of cursore) {
  const x = c as unknown as {
    _id: string;
    paese: string;
    insegna: string;
    dati: { buffer: Buffer };
  };
  /* Senza `--tutte` ne' un elenco, si guardano solo le ORFANE: quelle con un
     catalogo e senza una riga in `fonti`, che il giro continuo non apre mai e
     quindi non controlla nessuno. */
  if (!chiesti.length && !tutte && note.has(x.insegna)) continue;
  viste++;

  const righe = gunzipSync(Buffer.from(x.dati.buffer)).toString("utf8").split("\n").filter(Boolean);
  if (righe.length === 0) continue;

  /* Gli stessi indirizzi che il lettore aprirebbe: e' su quelli che la
     domanda ha senso. Il permesso per la home non dice niente su `/prodotti/`. */
  const indirizzi = righe.map((r) => r.split("\t")[0]);
  const v = await permessoDiLeggere(x.paese, x.insegna, indirizzi, scrivi);
  conto[v.esito]++;

  console.log(
    `${x._id.padEnd(26)}${SIMBOLO[v.esito]}  ${v.regola.slice(0, 46).padEnd(48)}${v.percorsi[0]?.slice(0, 40) ?? ""}`,
  );
}

if (viste === 0) {
  console.log("  Niente da controllare.");
  process.exit(0);
}

console.log(
  `\n  ${conto.ALLOW} permesse · ${conto.DISALLOW} vietate · ${conto.PARZIALE} a meta' · ${conto.IGNOTO} senza risposta`,
);
if (!scrivi) {
  console.log("  PROVA A VUOTO: non e' stato scritto niente. Con --scrivi le vietate vengono sospese.");
} else if (conto.DISALLOW > 0) {
  console.log("  Le vietate sono state sospese. Vedi `fonti.esclusa` e la collezione `permessi`.");
}

/* Le scritture partono senza essere aspettate — il lettore non deve rallentare
   per raccontare — quindi qui si lascia un respiro prima di chiudere, o le
   ultime si perdono. */
await new Promise((r) => setTimeout(r, 2_000));
process.exit(0);
