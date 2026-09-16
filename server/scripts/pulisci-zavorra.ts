/**
 * Toglie dal magazzino i cataloghi delle insegne che NON vendono la spesa.
 *
 * PERCHE' RESTANO LI' ANCHE DOPO ESSERE STATE TOLTE
 * -------------------------------------------------
 * Il magazzino dei cataloghi e' scritto da chi COSTRUISCE il catalogo, e chi
 * costruisce chiede solo le insegne in elenco. Quindi togliere una riga da
 * `catalogo-fonti.ts` la fa sparire dall'app all'istante — ma il suo documento
 * su Mongo nessuno lo cancella, perche' nessuno lo guarda piu'.
 *
 * Misurato il 16 settembre 2026: 48 insegne orfane, 817.411 indirizzi, un
 * terzo dei documenti su un piano Atlas da 512 MB.
 *
 * QUI SI TOGLIE SOLO LA ZAVORRA VERA, NON I DOPPIONI
 * --------------------------------------------------
 * Le orfane sono di due specie e vanno trattate diversamente:
 *
 *   ZAVORRA    insegne tolte per scelta perche' non vendono da mangiare —
 *              Galaxus e' un generalista, Marks & Spencer usciva con 270.094
 *              capi d'abbigliamento, Fressnapf vende cibo per cani. Queste si
 *              cancellano: non torneranno.
 *
 *   DOPPIONI   la stessa insegna sotto un nome vecchio. La chiave del
 *              magazzino e' `PAESE|Insegna`, quindi rinominare «Iperal» in
 *              «Iperal Spesa Online» abbandona il documento precedente e ne
 *              crea un altro. Sono una ventina, e vanno guardati uno per uno
 *              prima di toccarli: se il nome nuovo non ha ancora il suo
 *              documento, cancellare quello vecchio vuol dire che il primo
 *              utente di quel paese aspetta mezzo minuto.
 *
 * Gli accenti rotti — `M ller`, `F tex`, `Aldi S d`, `El Corte Ingl s` —
 * sono una terza cosa ancora: lo stesso nome salvato due volte, una versione
 * con la codifica sbagliata. Vanno cercati, perche' occupano il doppio.
 *
 * Uso:
 *   npx tsx --env-file-if-exists=.env scripts/pulisci-zavorra.ts          mostra
 *   npx tsx --env-file-if-exists=.env scripts/pulisci-zavorra.ts --vai    cancella
 */

import { cataloghi } from "../src/base/db.js";

/** Tolte per scelta: non vendono la spesa. Nome esatto come sta sul database. */
const ZAVORRA: Array<[string, string, string]> = [
  ["CH", "Galaxus", "generalista, milioni di articoli"],
  ["GB", "Marks Spencer", "usciva con 270.094 capi d'abbigliamento"],
  ["DE", "M ller", "drogheria"],
  ["DE", "Müller", "drogheria"],
  ["DE", "Fressnapf", "cibo per animali"],
  ["DE", "Rossmann", "drogheria"],
  ["DE", "dm", "drogheria"],
  ["GB", "Pets at Home", "cibo per animali"],
  ["NL", "Gall Gall", "enoteca"],
  ["DE", "flaschenpost", "consegna bevande"],
  ["DE", "flaschenpost Supermarkt", "consegna bevande"],
  ["DE", "Weinfreunde", "enoteca"],
  ["FR", "Zooplus France", "cibo per animali"],
  ["ES", "Vinissimus", "enoteca"],
];

async function main() {
  const vai = process.argv.includes("--vai");
  const c = await cataloghi();

  let trovate = 0;
  let link = 0;
  const daTogliere: string[] = [];

  for (const [paese, insegna, perche] of ZAVORRA) {
    const doc = (await c.findOne({ paese, insegna }, { projection: { _id: 1, prodotti: 1 } })) as
      | { _id: string; prodotti?: number }
      | null;
    if (!doc) {
      console.log(`   ·  ${paese} ${insegna.padEnd(24).slice(0, 24)} non c'e' gia' piu'`);
      continue;
    }
    trovate++;
    link += doc.prodotti ?? 0;
    daTogliere.push(doc._id);
    console.log(`   ✗  ${paese} ${insegna.padEnd(24).slice(0, 24)} ${String(doc.prodotti ?? 0).padStart(7)} link   ${perche}`);
  }

  console.log(`\n  ${trovate} insegne, ${link.toLocaleString("it")} indirizzi`);

  if (!vai) {
    console.log("\n  PROVA A VUOTO. Per cancellare davvero: aggiungi --vai\n");
    process.exit(0);
  }

  const esito = await c.deleteMany({ _id: { $in: daTogliere } as never });
  console.log(`\n  cancellati ${esito.deletedCount} documenti\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
