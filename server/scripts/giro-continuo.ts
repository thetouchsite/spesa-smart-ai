/**
 * Il giro continuo, a mano.
 *
 * Il ragionamento sta in `src/api/prezzi-continuo.ts`: si aprono le schede che
 * in magazzino non ci sono o sono scadute, le insegne piu' generose per prime,
 * e si smette quando il tempo concesso finisce — non quando il catalogo
 * finisce, perche' il catalogo non finisce mai.
 *
 * Uso:
 *   npx tsx --env-file-if-exists=.env scripts/giro-continuo.ts --minuti 30
 *   npx tsx --env-file-if-exists=.env scripts/giro-continuo.ts --solo IT,ES --minuti 10
 */

import { caricaFontiDalDb, paesiConCatalogo } from "../src/api/catalogo-fonti.js";
import { giroContinuo } from "../src/api/prezzi-continuo.js";
import { statoMagazzino } from "../src/api/prezzi-magazzino.js";

const n = (x: number) => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const arg = (nome: string) =>
  process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : undefined;

async function main() {
  if ((await caricaFontiDalDb()) === 0) {
    console.error("  il database non ha insegne");
    process.exit(1);
  }
  const minuti = Number(arg("--minuti") ?? 30);
  const paesi = (arg("--solo") ?? paesiConCatalogo().join(","))
    .split(",")
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);

  console.log(`giro continuo: ${paesi.length} paesi, fino a ${minuti} minuti`);
  console.log("prima:", await statoMagazzino());

  const e = await giroContinuo(paesi, minuti, (fatte, con) => {
    process.stdout.write(`\r  ${n(fatte)} aperte · ${n(con)} con prezzo   `);
  });

  console.log(
    `\n\n  ${n(e.aperte)} schede aperte · ${n(e.conPrezzo)} con prezzo ` +
      `(${Math.round((e.conPrezzo / Math.max(1, e.aperte)) * 100)}%) in ${e.secondi.toFixed(0)}s`,
  );
  console.log(`  ${n(e.saltate)} saltate perche' gia' fresche`);
  console.log(e.finito ? "  catalogo finito: non c'era altro da fare" : "  tempo scaduto: la prossima volta riprende da qui");
  console.log("dopo:", await statoMagazzino());
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
