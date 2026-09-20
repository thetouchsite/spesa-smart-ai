/**
 * Le righe che portano un prezzo inventato.
 *
 * COME SI RICONOSCE UN PREZZO FINTO SENZA APRIRE LA PAGINA
 * --------------------------------------------------------
 * Si guarda quante volte la stessa identica cifra compare in un'insegna. Un
 * catalogo vero ha prezzi sparsi: qualche ripetizione c'e' sempre — le offerte
 * a 0,99, i formati uguali — ma quando UNA cifra copre meta' del negozio, quella
 * cifra non descrive i prodotti. Descrive qualcos'altro che sta nella pagina e
 * che abbiamo scambiato per il prezzo.
 *
 * Trovati cosi', il 20 settembre:
 *
 *   DK Matas      7.355 prodotti, TUTTI a 31    la quota mensile di «Club Matas»
 *   ZA Checkers   6.831 su 13.053 a 37          la tariffa di consegna
 *   GB Poundland  807 su 1.483 a 1              vero: da Poundland tutto costa £1
 *
 * Il terzo caso e' il motivo per cui questo comando mostra prima e cancella
 * dopo. La ripetizione e' un indizio, non una prova: un negozio dove tutto
 * costa una sterlina ha davvero tutti i prodotti a uno, e cancellarlo
 * automaticamente sarebbe buttare dati buoni per eccesso di zelo.
 *
 * PERCHE' CANCELLARE E NON CORREGGERE
 * -----------------------------------
 * Perche' non sappiamo quale fosse il prezzo giusto: sappiamo solo che quello
 * scritto non lo era. Cancellata, la riga torna «mai provata» e il lettore la
 * riapre col codice corretto. Costa una lettura e restituisce la verita'.
 *
 * Un prezzo mancante e' un buco e si vede. Un prezzo SBAGLIATO e' un numero su
 * cui qualcuno decide dove fare la spesa.
 *
 *   npx tsx --env-file-if-exists=.env scripts/pulisci-prezzi-falsi.ts
 *   npx tsx --env-file-if-exists=.env scripts/pulisci-prezzi-falsi.ts --scrivi "DK|Matas=31" "ZA|Checkers Sixty60=37"
 */

import { fonti, prezzi } from "../src/base/db.js";

const scrivi = process.argv.includes("--scrivi");
const n = (v: number) => v.toLocaleString("it-IT");

/** Oltre questa quota, una cifra sola non descrive piu' un catalogo. */
const SOSPETTA = 0.15;
/** Sotto questo numero di ripetizioni non vale la pena guardare. */
const ABBASTANZA = 200;

const F = (await (await fonti()).find({}).project({ id: 1, insegna: 1, paese: 1 }).toArray()) as Array<{
  id?: number;
  insegna?: string;
  paese?: string;
}>;
const nomeDi = new Map<number, string>(
  F.filter((f) => typeof f.id === "number").map((f) => [f.id as number, `${f.paese}|${f.insegna}`]),
);

const P = await prezzi();

/* Il conto lo fa Mongo: per ogni insegna, la cifra piu' ripetuta e quanto pesa. */
const agg = (await P.aggregate([
  { $match: { p: { $ne: null } } },
  { $group: { _id: { c: "$c", p: "$p" }, q: { $sum: 1 } } },
  { $sort: { q: -1 } },
  { $group: { _id: "$_id.c", tot: { $sum: "$q" }, top: { $first: { p: "$_id.p", q: "$q" } } } },
]).toArray()) as Array<{ _id: number; tot: number; top: { p: number; q: number } }>;

const sospetti = agg
  .map((a) => ({
    numero: a._id,
    insegna: nomeDi.get(a._id) ?? `#${a._id}`,
    tot: a.tot,
    valore: a.top.p,
    volte: a.top.q,
    quota: a.top.q / a.tot,
  }))
  .filter((x) => x.quota >= SOSPETTA && x.volte >= ABBASTANZA)
  .sort((a, b) => b.volte - a.volte);

console.log("");
console.log("UNA CIFRA SOLA, RIPETUTA SU TANTI PRODOTTI DIVERSI");
console.log("");
console.log("insegna".padEnd(28) + "prodotti".padStart(10) + "cifra".padStart(10) + "volte".padStart(9) + "  quota");
for (const s of sospetti) {
  console.log(
    s.insegna.padEnd(28).slice(0, 28) +
      n(s.tot).padStart(10) +
      String(s.valore).padStart(10) +
      n(s.volte).padStart(9) +
      `  ${Math.round(s.quota * 100)}%`,
  );
}
console.log("");

/* QUALI CANCELLARE LO DICE CHI LANCIA, NON QUESTO CODICE.
   La ripetizione e' un indizio: da Poundland tutto costa davvero una sterlina.
   Si passano a mano le coppie da buttare, dopo averle guardate. */
const chieste = process.argv
  .slice(2)
  .filter((x) => x.includes("="))
  .map((x) => {
    const i = x.lastIndexOf("=");
    return { insegna: x.slice(0, i), valore: Number(x.slice(i + 1)) };
  });

if (!scrivi || chieste.length === 0) {
  console.log("Per cancellarne una, guardala prima e poi passala per nome e cifra:");
  console.log('  ... pulisci-prezzi-falsi.ts --scrivi "DK|Matas=31"');
  console.log("");
  process.exit(0);
}

for (const c of chieste) {
  const voce = sospetti.find((s) => s.insegna === c.insegna);
  if (!voce) {
    console.log(`  «${c.insegna}» non e' fra i sospetti: non tocco niente.`);
    continue;
  }
  const esito = await P.deleteMany({ c: voce.numero, p: c.valore } as never);
  console.log(`  ${c.insegna}: cancellate ${n(esito.deletedCount)} righe a ${c.valore}`);
}

console.log("");
console.log("Torneranno «mai provate»: il lettore le riaprira' col codice corretto.");
console.log("");
process.exit(0);
