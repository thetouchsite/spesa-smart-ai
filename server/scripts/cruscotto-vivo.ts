/**
 * Rigenera il cruscotto ogni tot minuti, finche' non lo si ferma.
 *
 * Serve mentre il giro dei prezzi lavora: i numeri cambiano di minuto in
 * minuto, e rifare a mano `quadro-db` e `cruscotto` ogni volta e' tempo speso
 * a guardare invece che a fare.
 *
 * NON PUBBLICA: scrive solo il file. La pubblicazione la fa chi ha in mano
 * l'indirizzo dell'artefatto.
 *
 * Uso:
 *   npx tsx --env-file-if-exists=.env scripts/cruscotto-vivo.ts <file.html> [--ogni 3]
 */

import { execFileSync } from "node:child_process";

const uscita = process.argv[2];
if (!uscita) {
  console.error("Uso: scripts/cruscotto-vivo.ts <file.html> [--ogni minuti]");
  process.exit(1);
}
const ogni =
  Number(
    process.argv.includes("--ogni") ? process.argv[process.argv.indexOf("--ogni") + 1] : 3,
  ) * 60_000;

const orario = () => new Date().toLocaleTimeString("it-IT");

async function unGiro() {
  try {
    execFileSync("npx", ["tsx", "--env-file-if-exists=.env", "scripts/quadro-db.ts"], {
      stdio: "pipe",
      shell: true,
    });
    const fuori = execFileSync("npx", ["tsx", "scripts/cruscotto.ts", uscita], {
      encoding: "utf8",
      shell: true,
    });
    console.log(`${orario()}  ${fuori.trim().split("\n").pop()}`);
  } catch (e) {
    console.log(`${orario()}  saltato: ${(e as Error).message.slice(0, 80)}`);
  }
}

await unGiro();
setInterval(() => void unGiro(), ogni);
