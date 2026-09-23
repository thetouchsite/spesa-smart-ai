/**
 * Quanto e' pieno il magazzino, campo per campo.
 *
 * LA DOMANDA A CUI RISPONDE
 * -------------------------
 * L'arricchimento — prezzo pieno, sconto, disponibilita', scadenza della
 * promozione, e domani marca, immagine, SKU, categoria — e' stato scritto,
 * compila e passa i controlli. Questo non dice che ARRIVI. Fra il codice
 * giusto e il dato nel magazzino ci sono un `git pull` che qualcuno deve
 * fare, un processo che qualcuno deve riavviare, e una pagina che il negozio
 * deve davvero dichiarare.
 *
 * Senza un numero, la risposta a «funziona?» e' un'impressione.
 *
 * PERCHE' SI GUARDANO LE RIGHE RECENTI, NON TUTTE
 * -----------------------------------------------
 * Il magazzino ha 1,8 milioni di righe scritte da un codice che quei campi non
 * li conosceva. La copertura sul totale restera' vicina allo zero per
 * settimane anche se tutto funziona alla perfezione — e' aritmetica, non
 * diagnosi: le righe vecchie si rinnovano al ritmo del ciclo di freschezza.
 *
 * Il numero che dice qualcosa e' la copertura sulle righe lette DA QUANDO il
 * codice nuovo gira. Se quella e' zero, c'e' un problema adesso. Se e' alta e
 * il totale e' basso, non c'e' nessun problema: c'e' solo da aspettare.
 *
 * Per questo le due colonne stanno accanto, e quella di destra e' quella da
 * leggere.
 *
 *   npx tsx --env-file-if-exists=.env scripts/copertura-campi.ts
 *   npx tsx --env-file-if-exists=.env scripts/copertura-campi.ts --ore 6
 *   npx tsx --env-file-if-exists=.env scripts/copertura-campi.ts --insegne
 */

import { insegnaDalNumero } from "../src/api/prezzi-magazzino.js";
import { prezzi, schede, fonti, permessi } from "../src/base/db.js";
import { tutteLeFonti, caricaFontiDalDb } from "../src/api/catalogo-fonti.js";

const arg = process.argv.slice(2);
const ore = Number(arg[arg.indexOf("--ore") + 1]) || 24;
const perInsegna = arg.includes("--insegne");
const DA = new Date(Date.now() - ore * 3_600_000);

const col = await prezzi();

/* I CAMPI, E COSA VUOL DIRE «CE L'HA».
   `$exists` e non `$ne: null`, perche' la regola di scrittura e' che un campo
   assente resta assente — non si scrive mai `null`. Se qui comparisse un
   conteggio fatto con `$ne`, vorrebbe dire che da qualche parte i null li
   stiamo scrivendo, ed e' una cosa che si vuole sapere. */
const CAMPI: Array<[string, string]> = [
  ["p", "riga di prezzo"],
  ["v", "valuta"],
  ["vd", "  di cui dedotta"],
  ["l", "prezzo pieno"],
  ["sc", "sconto %"],
  ["av", "disponibilita'"],
  ["pf", "scadenza promo"],
  ["sh", "impronta scheda"],
];

async function conta(filtro: Record<string, unknown>): Promise<number> {
  return col.countDocuments(filtro as never);
}

const totale = await conta({});
const recenti = await conta({ t: { $gte: DA } });

console.log(`\n  MAGAZZINO PREZZI`);
console.log(`  ${"".padEnd(24)}${"tutte".padStart(14)}${`ultime ${ore}h`.padStart(16)}`);
console.log(`  ${"righe".padEnd(24)}${totale.toLocaleString("it").padStart(14)}${recenti.toLocaleString("it").padStart(16)}`);
console.log(`  ${"-".repeat(52)}`);

/* `p` DA SOLO NON DICE NIENTE, E DIREBBE SEMPRE CENTO PER CENTO.
   Il campo c'e' anche quando vale `null` — e' cosi' per disegno: una pagina
   che si apre e non espone il prezzo lascia una riga con `p: null`, che e' un
   fatto da conservare. Contarlo con `$exists` darebbe 100% per sempre, che e'
   un numero vero e inutile. Quello che serve sapere e' quante righe hanno una
   CIFRA. */
const conCifra = await conta({ p: { $ne: null } });
const conCifraRecenti = await conta({ p: { $ne: null }, t: { $gte: DA } });
console.log(
  `  ${"prezzo, con una cifra".padEnd(24)}${(totale ? ((conCifra / totale) * 100).toFixed(1) + "%" : "-").padStart(8)}${conCifra.toLocaleString("it").padStart(12)}${(recenti ? ((conCifraRecenti / recenti) * 100).toFixed(1) + "%" : "-").padStart(8)}${conCifraRecenti.toLocaleString("it").padStart(12)}`,
);

for (const [campo, nome] of CAMPI) {
  const a = await conta({ [campo]: { $exists: true } });
  const b = await conta({ [campo]: { $exists: true }, t: { $gte: DA } });
  const qa = totale ? ((a / totale) * 100).toFixed(1) + "%" : "-";
  const qb = recenti ? ((b / recenti) * 100).toFixed(1) + "%" : "-";
  console.log(
    `  ${nome.padEnd(24)}${qa.padStart(8)}${a.toLocaleString("it").padStart(12)}${qb.padStart(8)}${b.toLocaleString("it").padStart(12)}`,
  );
}

/* LE RIGHE SCRITTE COL CODICE NUOVO, CONTATE IN UN ALTRO MODO.
   `av` c'e' quasi sempre quando il codice nuovo gira, perche' la
   disponibilita' la dichiara quasi ogni scheda. Se le righe recenti sono
   tante e questo numero e' zero, il lettore sta girando col codice vecchio in
   memoria: un `git pull` non aggiorna un processo gia' acceso. */
const conNuovi = await conta({ t: { $gte: DA }, $or: [{ l: { $exists: true } }, { av: { $exists: true } }] });
if (recenti > 0) {
  const q = ((conNuovi / recenti) * 100).toFixed(1);
  console.log(`\n  Righe recenti con almeno un campo nuovo: ${conNuovi.toLocaleString("it")} su ${recenti.toLocaleString("it")} (${q}%)`);
  if (conNuovi === 0) {
    console.log(`  → ZERO. Il lettore gira col codice vecchio in memoria: va chiuso e riaperto.`);
  }
} else {
  console.log(`\n  Nessuna riga letta nelle ultime ${ore} ore: non c'e' niente da misurare.`);
  console.log(`  → Controlla che un lettore sia acceso prima di leggere i numeri qui sopra.`);
}

/* ── LE SCHEDE, QUANDO CI SARANNO ─────────────────────────────────────
   La collezione esiste nello schema ma la Fase 1b e' spenta finche' non c'e'
   spazio. Se e' vuota si dice, invece di stampare otto zeri che sembrano un
   guasto. */
const sch = await schede();
const quanteSchede = await sch.estimatedDocumentCount();
console.log(`\n  SCHEDE (marca, SKU, immagine, categoria)`);
if (quanteSchede === 0) {
  console.log(`  Vuota: la Fase 1b e' spenta. Si accende quando c'e' spazio sul database.`);
} else {
  for (const [campo, nome] of [["b", "marca"], ["sk", "SKU"], ["im", "immagine"], ["cr", "categoria"]] as const) {
    const n = await sch.countDocuments({ [campo]: { $exists: true } } as never);
    console.log(`  ${nome.padEnd(24)}${((n / quanteSchede) * 100).toFixed(1).padStart(7)}%${n.toLocaleString("it").padStart(12)}`);
  }
}

/* ── I PERMESSI ───────────────────────────────────────────────────────
   Sta qui e non in uno script a parte perche' e' la stessa domanda: quel che
   raccogliamo, lo stiamo raccogliendo come si deve? Un magazzino pieno di
   campi e senza permessi controllati e' peggio di uno mezzo vuoto. */
await caricaFontiDalDb();
const quante = tutteLeFonti().length;
const per = await permessi();
const stato: Record<string, number> = {};
for (const r of await per.find({ aperta: true }).project({ e: 1 }).toArray()) {
  const e = String((r as unknown as { e: string }).e);
  stato[e] = (stato[e] ?? 0) + 1;
}
const controllate = Object.values(stato).reduce((a, b) => a + b, 0);
console.log(`\n  PERMESSI (robots.txt)`);
console.log(`  insegne attive            ${String(quante).padStart(7)}`);
console.log(`  mai controllate           ${String(Math.max(0, quante - controllate)).padStart(7)}`);
for (const [e, n] of Object.entries(stato).sort()) {
  console.log(`  ${e.toLowerCase().padEnd(24)}  ${String(n).padStart(7)}`);
}

/* Quando e' stato l'ultimo controllo: una data vecchia dice piu' di un
   conteggio giusto. */
const ultimo = await (await fonti())
  .find({ controllatoIl: { $exists: true } }, { projection: { controllatoIl: 1 } })
  .sort({ controllatoIl: -1 })
  .limit(1)
  .toArray();
const q = (ultimo[0] as unknown as { controllatoIl?: Date } | undefined)?.controllatoIl;
console.log(`  ultimo controllo          ${q ? q.toISOString().slice(0, 16).replace("T", " ") : "mai"}`);

/* ── PER INSEGNA, SOLO SE CHIESTO ─────────────────────────────────────
   Serve quando il numero generale e' basso e bisogna capire se e' tutto il
   catalogo o tre negozi che non dichiarano niente. */
if (perInsegna) {
  console.log(`\n  PER INSEGNA, ultime ${ore}h (solo chi ha letto qualcosa)`);
  const righe = await col
    .aggregate([
      { $match: { t: { $gte: DA } } },
      {
        $group: {
          _id: "$c",
          righe: { $sum: 1 },
          conAv: { $sum: { $cond: [{ $ifNull: ["$av", false] }, 1, 0] } },
          conL: { $sum: { $cond: [{ $ifNull: ["$l", false] }, 1, 0] } },
        },
      },
      { $sort: { righe: -1 } },
      { $limit: 30 },
    ] as never)
    .toArray();
  const paeseDi = new Map(tutteLeFonti().map((f) => [f.insegna, f.paese] as const));
  for (const r of righe as Array<{ _id: number; righe: number; conAv: number; conL: number }>) {
    /* Il numero non e' un hash: e' una tabella caricata insieme alle fonti,
       e il magazzino sa gia' rileggerla al contrario. */
    const insegna = insegnaDalNumero(r._id);
    const nome = insegna ? `${paeseDi.get(insegna) ?? "??"}|${insegna}` : `#${r._id}`;
    console.log(
      `  ${nome.slice(0, 26).padEnd(28)}${r.righe.toLocaleString("it").padStart(9)}  disp ${((r.conAv / r.righe) * 100).toFixed(0).padStart(3)}%  pieno ${((r.conL / r.righe) * 100).toFixed(0).padStart(3)}%`,
    );
  }
}

console.log("");
process.exit(0);
