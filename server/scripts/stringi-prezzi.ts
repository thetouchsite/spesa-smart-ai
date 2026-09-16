/**
 * Porta il magazzino dei prezzi dalla forma larga a quella stretta.
 *
 * PERCHE'
 * -------
 * Una riga pesava 443 byte, indici compresi, e il prezzo ne occupava dodici.
 * Tutto il resto era roba gia' scritta nel catalogo — l'indirizzo per esteso,
 * il nome, l'insegna — piu' la parola «verificato» ripetuta a ogni riga e una
 * data di scadenza ricavabile da quella di lettura.
 *
 * A 443 byte, nei 440 MB liberi del piano Atlas ci stanno un milione di
 * prezzi. Era quello a fermare il progetto: il magazzino si riempiva in tre
 * notti e poi non poteva piu' crescere.
 *
 * PERCHE' SI BUTTA INVECE DI CONVERTIRE
 * -------------------------------------
 * Perche' la forma vecchia non basta a costruire quella nuova: l'insegna era
 * un nome e adesso e' un numero, e i numeri li ha solo l'elenco delle fonti —
 * una riga di un'insegna nel frattempo tolta non saprebbe che numero darsi.
 *
 * E soprattutto perche' costa meno rifarle: trentamila righe si riaprono in
 * venticinque minuti col giro continuo, e scrivere un convertitore per
 * risparmiare venticinque minuti e' tempo speso peggio.
 *
 * Il momento giusto e' ADESSO, con trentamila righe. Fra tre notti sarebbero
 * un milione, e allora convertire non sarebbe piu' una scelta.
 *
 * Uso:
 *   npx tsx --env-file-if-exists=.env scripts/stringi-prezzi.ts          mostra
 *   npx tsx --env-file-if-exists=.env scripts/stringi-prezzi.ts --vai    esegue
 */

import { prezzi } from "../src/base/db.js";

const n = (x: number) => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

async function main() {
  const vai = process.argv.includes("--vai");
  const c = await prezzi();

  const totale = await c.countDocuments({});
  const larghe = await c.countDocuments({ visto: { $exists: true } } as never);
  const strette = await c.countDocuments({ t: { $exists: true } } as never);

  console.log(`\n  righe in magazzino: ${n(totale)}`);
  console.log(`    forma larga (con \`visto\`): ${n(larghe)}`);
  console.log(`    forma stretta (con \`t\`)  : ${n(strette)}`);

  const indici = await c.indexes();
  console.log(`\n  indici: ${indici.map((i) => i.name).join(", ")}`);

  if (!vai) {
    console.log("\n  PROVA A VUOTO. Con --vai: si cancellano le righe larghe e si rifanno gli indici.\n");
    process.exit(0);
  }

  if (larghe > 0) {
    const esito = await c.deleteMany({ visto: { $exists: true } } as never);
    console.log(`\n  cancellate ${n(esito.deletedCount)} righe nella forma larga`);
  }

  /* Gli indici vecchi vanno via: puntano a campi che non esistono piu', e un
     indice su un campo assente occupa spazio senza servire a niente. */
  for (const i of indici) {
    if (i.name === "_id_") continue;
    const suVecchi = Object.keys(i.key).some((k) => ["visto", "scadeIl", "insegna"].includes(k));
    if (!suVecchi) continue;
    await c.dropIndex(i.name!);
    console.log(`  tolto l'indice ${i.name}`);
  }

  await c.createIndex({ t: 1 }, { expireAfterSeconds: 30 * 86_400 });
  await c.createIndex({ c: 1, t: -1 });
  console.log("  rifatti gli indici sulla forma stretta");

  const dopo: any = await (await import("../src/base/db.js")).prezzi();
  const stat: any = await dopo.aggregate([{ $collStats: { storageStats: {} } }]).toArray();
  const s = stat[0]?.storageStats;
  if (s) {
    const righe = s.count || 1;
    const byte = Math.round((s.size + s.totalIndexSize) / righe);
    console.log(`\n  adesso ${n(s.count)} righe · ${byte} byte l'una (dati + indici)`);
    console.log(`  in 440 MB ci stanno ${n(Math.floor((440 * 1048576) / Math.max(1, byte)))} prezzi`);
  }
  console.log("");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
