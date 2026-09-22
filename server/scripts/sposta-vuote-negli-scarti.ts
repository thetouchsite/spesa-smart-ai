/**
 * Le schede senza prezzo passano da `prezzi` a `scarti`.
 *
 * LA STESSA COSA DETTA DUE VOLTE, UNA DELLE QUALI CARA
 * ---------------------------------------------------
 * Quando il lettore apriva una scheda e il prezzo non c'era, scriveva due
 * ricordi: una riga intera in `prezzi` col prezzo a niente — centottantatre
 * byte fra dati e indici — e un'impronta in `scarti`, che e' un pezzo di testo
 * compresso insieme agli altri della stessa insegna e costa pochi byte.
 *
 * Tutti e due dicono «qui abbiamo gia' guardato». La riga non aggiunge niente:
 * nessuna ricerca la chiede, e l'unico che la consultava era il percorso dal
 * vivo dell'app, che adesso chiede agli scarti.
 *
 * PERCHE' ADESSO
 * --------------
 * Perche' l'obiettivo e' due milioni di prodotti con prezzo, e due milioni di
 * righe sono trecentosessanta megabyte su cinquecentododici del piano. Con le
 * righe vuote dentro non ci si arriva: ci si ferma a meta' col database pieno,
 * e un database pieno non e' un errore da leggere in un file — e' l'app che
 * smette di rispondere.
 *
 * SI SPOSTA, NON SI BUTTA
 * -----------------------
 * Prima si scrivono le impronte negli scarti, poi si cancellano le righe. Al
 * contrario si perderebbe il ricordo e il lettore riaprirebbe trecentomila
 * pagine per riscoprire quel che gia' sapeva.
 *
 * L'identificativo di una riga di prezzo E' l'impronta dell'indirizzo: sono la
 * stessa cosa, quindi lo spostamento non ha bisogno di ricalcolare niente.
 *
 * QUANDO INVECE VANNO BUTTATE, E NON SPOSTATE
 * -------------------------------------------
 * Spostare conserva il giudizio «qui il prezzo non c'era». Vale finche' quel
 * giudizio e' buono — e smette di valerlo quando il lettore impara a leggere
 * pagine che prima non sapeva leggere.
 *
 * Il 21 settembre `ripensa-scarti.ts` ha provato dieci insegne riaprendo
 * davvero le loro schede scartate: Continente ne leggeva 12 su 12, Checkers 4
 * su 12. Tolti i loro scarti, restavano pero' le righe vuote a fare lo stesso
 * lavoro da un altro posto — il lucchetto aperto e la porta chiusa:
 *
 *     ZA Checkers Sixty60   81.313 righe vuote
 *     PT Continente Online  43.539
 *
 * cioe' il 98% di tutte le righe vuote del magazzino. Per quelle dieci sono
 * state cancellate, non spostate. Per tutte le altre lo spostamento resta la
 * risposta giusta: il giudizio e' ancora buono, e riaprire trecentomila pagine
 * per riscoprire quel che gia' si sa e' disturbare dei negozi per niente.
 *
 * La regola, detta in una riga: si butta il ricordo solo dopo aver MISURATO
 * che e' sbagliato, insegna per insegna. Mai in blocco.
 *
 *   npx tsx --env-file-if-exists=.env scripts/sposta-vuote-negli-scarti.ts
 *   npx tsx --env-file-if-exists=.env scripts/sposta-vuote-negli-scarti.ts --scrivi
 */

import { fonti, prezzi } from "../src/base/db.js";
import { segnaScarti } from "../src/api/scarti.js";

const scrivi = process.argv.includes("--scrivi");
const n = (v: number) => v.toLocaleString("it-IT");

const F = (await (await fonti())
  .find({})
  .project({ id: 1, insegna: 1, paese: 1 })
  .toArray()) as Array<{ id?: number; insegna?: string; paese?: string }>;
const chi = new Map<number, { insegna: string; paese: string }>(
  F.filter((f) => typeof f.id === "number").map((f) => [
    f.id as number,
    { insegna: String(f.insegna), paese: String(f.paese) },
  ]),
);

const P = await prezzi();
const quante = await P.countDocuments({ p: null } as never);

console.log("");
console.log(`  righe senza prezzo in «prezzi»: ${n(quante)}`);
console.log(`  spazio che tengono: circa ${Math.round((quante * 183) / 1024 / 1024)} MB`);
console.log("");

if (!scrivi) {
  console.log("  Niente e' stato toccato. Per spostarle:  ... --scrivi");
  console.log("");
  process.exit(0);
}

/* Si lavora per insegna: l'elenco degli scarti si salva per insegna, e
   riscriverlo una volta sola per ognuna invece che a ogni riga e' la
   differenza fra qualche secondo e qualche ora. */
const perInsegna = new Map<number, string[]>();
const cursore = P.find({ p: null } as never, { projection: { _id: 1, c: 1 } });
let lette = 0;
for await (const r of cursore) {
  const doc = r as unknown as { _id: string; c: number };
  const g = perInsegna.get(doc.c) ?? [];
  g.push(doc._id);
  perInsegna.set(doc.c, g);
  if (++lette % 100_000 === 0) console.log(`  lette ${n(lette)}…`);
}

let spostate = 0;
let senzaCasa = 0;
for (const [numero, impronte] of perInsegna) {
  const f = chi.get(numero);
  if (!f) {
    /* Un numero che le fonti non conoscono piu': l'insegna e' stata tolta.
       Le sue righe si cancellano e basta — non c'e' nessun elenco di scarti a
       cui appartengano, e nessun lettore che le andra' a cercare. */
    senzaCasa += impronte.length;
    continue;
  }
  await segnaScarti(f.insegna, f.paese, impronte);
  spostate += impronte.length;
  console.log(`  ${f.paese}|${f.insegna}: ${n(impronte.length)} impronte negli scarti`);
}

const esito = await P.deleteMany({ p: null } as never);
console.log("");
console.log(`  ${n(spostate)} impronte salvate negli scarti`);
if (senzaCasa > 0) console.log(`  ${n(senzaCasa)} di insegne non piu' in elenco: solo cancellate`);
console.log(`  ${n(esito.deletedCount)} righe tolte da «prezzi»`);
console.log("");
process.exit(0);
