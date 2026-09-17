/**
 * Guarda e corregge una fonte sul database. E' quello che prima era «apri il file».
 *
 * PERCHE'
 * -------
 * L'elenco delle insegne non sta piu' nel codice: sta nella collezione `fonti`
 * su Mongo, perche' due elenchi che dovrebbero dire la stessa cosa divergono
 * sempre. Ma un elenco che si puo' solo leggere non serve: serve un modo di
 * correggerlo che non sia aprire una shell di Mongo e scrivere a mano un
 * `updateOne`, dove una virgola sbagliata cancella una riga.
 *
 * Questo e' quel modo. Mostra, cambia un campo per volta, e ogni scrittura
 * dice cosa c'era prima.
 *
 * Uso:
 *   npx tsx --env-file-if-exists=.env scripts/fonte.ts IT Bennet
 *   ... scripts/fonte.ts IT Bennet --sitemap https://...
 *   ... scripts/fonte.ts IT Bennet --resa 0.8
 *   ... scripts/fonte.ts IT Bennet --stimati 20706
 *   ... scripts/fonte.ts IT Bennet --nota "quel che si e' imparato"
 *   ... scripts/fonte.ts BR "Carrefour Brasil" --escludi "motivo"
 *   ... scripts/fonte.ts BR "Carrefour Brasil" --riammetti
 *   ... scripts/fonte.ts --cerca carrefour
 */

import { fonti } from "../src/base/db.js";

const arg = (nome: string) =>
  process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : undefined;

function mostra(d: Record<string, unknown>) {
  console.log(`\n  ${d.paese} · ${d.insegna}`);
  console.log(`    dominio   ${d.dominio}`);
  console.log(`    sitemap   ${d.sitemap}`);
  console.log(`    resa      ${d.resa}`);
  console.log(`    stimati   ${String(d.stimati).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`);
  if (d.esclusa) console.log(`    ESCLUSA   ${d.esclusa}`);
  if (d.nota) console.log(`    nota      ${String(d.nota).slice(0, 300)}`);
}

async function main() {
  const c = await fonti();

  const cerca = arg("--cerca");
  if (cerca) {
    const trovate = await c
      .find({ insegna: { $regex: cerca, $options: "i" } })
      .project({ paese: 1, insegna: 1, resa: 1, stimati: 1, esclusa: 1 })
      .toArray();
    console.log(`\n  ${trovate.length} insegne con «${cerca}»:`);
    for (const t of trovate as Array<Record<string, unknown>>) {
      console.log(
        `    ${t.paese}  ${String(t.insegna).padEnd(24).slice(0, 24)} resa ${t.resa}  ${t.stimati}` +
          (t.esclusa ? "  [esclusa]" : ""),
      );
    }
    console.log("");
    process.exit(0);
  }

  const [paese, insegna] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!paese || !insegna) {
    console.log("Uso: scripts/fonte.ts PAESE \"Insegna\" [--sitemap … | --resa … | --nota …]");
    console.log("     scripts/fonte.ts --cerca parola");
    process.exit(1);
  }

  const id = `${paese.toUpperCase()}|${insegna}`;
  const prima = (await c.findOne({ _id: id })) as Record<string, unknown> | null;
  if (!prima) {
    console.log(`\n  non trovata: ${id}`);
    console.log("  (le maiuscole contano; prova `--cerca`)\n");
    process.exit(1);
  }

  const cambi: Record<string, unknown> = {};
  const toglie: Record<string, ""> = {};

  const sitemap = arg("--sitemap");
  if (sitemap) cambi.sitemap = sitemap;
  const resa = arg("--resa");
  if (resa !== undefined) cambi.resa = Number(resa);
  const stimati = arg("--stimati");
  if (stimati !== undefined) cambi.stimati = Number(stimati);
  const nota = arg("--nota");
  if (nota) cambi.nota = nota;
  const escludi = arg("--escludi");
  if (escludi) cambi.esclusa = escludi;
  if (process.argv.includes("--riammetti")) toglie.esclusa = "";

  if (Object.keys(cambi).length === 0 && Object.keys(toglie).length === 0) {
    mostra(prima);
    console.log("");
    process.exit(0);
  }

  console.log("\n  PRIMA:");
  mostra(prima);

  await c.updateOne(
    { _id: id },
    {
      ...(Object.keys(cambi).length ? { $set: { ...cambi, aggiornato: new Date() } } : {}),
      ...(Object.keys(toglie).length ? { $unset: toglie } : {}),
    },
  );

  const dopo = (await c.findOne({ _id: id })) as Record<string, unknown>;
  console.log("\n  DOPO:");
  mostra(dopo);
  console.log("");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
