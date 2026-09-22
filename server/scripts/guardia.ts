/**
 * Il guardiano: dice se i lettori stanno DAVVERO lavorando.
 *
 * PERCHE' NON BASTA GUARDARE IL PANNELLO
 * --------------------------------------
 * Il 22 settembre il conteggio e' rimasto fermo tre volte, per tre ragioni
 * diverse, e NESSUNA delle tre ha prodotto un errore visibile:
 *
 *   1. un intoppo del DNS ha rotto la connessione al database. I lettori
 *      hanno continuato a leggere per un'ora riportando rese del 92% e del
 *      98%, e non hanno scritto una riga. `salvaPrezzi` sta dentro
 *      l'interruttore, che per progetto inghiotte l'eccezione.
 *   2. i prezzi si salvavano ogni duecento righe, che per un'insegna al
 *      quattro per cento sono ore. Restavano in memoria, e il conteggio
 *      avanzava a raffiche.
 *   3. i lettori sono MORTI tutti insieme, perche' li avviavo con `nohup &`
 *      da un terminale che poi si chiudeva. Nessun errore, nessuna riga: solo
 *      un numero che non si muoveva.
 *
 * Il pannello in tutti e tre i casi mostrava un motore sano, perche' guarda
 * l'ultimo battito — e l'ultimo battito era di prima.
 *
 * COSA GUARDA QUESTO, E PERCHE' PROPRIO QUESTO
 * --------------------------------------------
 * Tre cose che insieme non si possono fingere:
 *
 *   PROCESSI   quanti lettori esistono davvero sulla macchina. Zero e'
 *              il caso 3, e non si vede da nessun'altra parte.
 *   BATTITI    chi ha scritto nel registro dei giri negli ultimi minuti. Un
 *              processo vivo che non batte sta montando la coda o e' bloccato.
 *   PRODOTTI   quanto e' cresciuto il conteggio mentre guardavamo. E' l'unico
 *              numero che nessuno dei tre guasti riesce a far salire, ed e'
 *              per questo che sta qui.
 *
 * Se i processi ci sono, i battiti arrivano e i prodotti non crescono, il
 * guasto e' fra il lettore e il database — il caso 1 o il 2.
 *
 *   npx tsx --env-file-if-exists=.env scripts/guardia.ts
 *   npx tsx --env-file-if-exists=.env scripts/guardia.ts --minuti 10
 */

import { execFileSync } from "node:child_process";
import { prezzi } from "../src/base/db.js";
import { chiStaLavorando } from "../src/api/giri.js";

const arg = (nome: string) =>
  process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : undefined;
/** Per quanto si guarda il conteggio. Cinque minuti: abbastanza da distinguere
 *  «fermo» da «lento», poco da non far aspettare chi lo lancia per sapere se
 *  deve riavviare qualcosa. */
const MINUTI = Number(arg("--minuti") ?? 5);

const n = (v: number) => v.toLocaleString("it-IT");

/** Quanti processi `lettore.ts` girano davvero. Tre per lettore: il comando,
 *  il caricatore di tsx e node. Si divide per tre e si arrotonda. */
function quantiLettori(): number {
  try {
    const fuori = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*lettore.ts*' }).Count",
      ],
      { encoding: "utf8", timeout: 30_000 },
    );
    return Math.round(Number(fuori.trim()) / 3);
  } catch {
    return -1;
  }
}

const P = await prezzi();

const processi = quantiLettori();
const vivi = await chiStaLavorando();
const prima = await P.countDocuments({ p: { $ne: null } } as never);
const inizio = Date.now();

console.log("");
console.log(`GUARDIA · guardo per ${MINUTI} minuti`);
console.log("");
console.log(`  processi lettore   ${processi < 0 ? "non so dirlo" : processi}`);
console.log(`  battiti recenti    ${vivi.length}`);
if (vivi.length > 0) {
  for (const v of vivi as Array<{ macchina?: string; aperte?: number; conPrezzo?: number }>) {
    console.log(
      `      ${String(v.macchina ?? "?").padEnd(10)} ${n(v.aperte ?? 0).padStart(8)} aperte · ` +
        `${n(v.conPrezzo ?? 0).padStart(8)} con prezzo`,
    );
  }
}
console.log(`  prodotti adesso    ${n(prima)}`);

await new Promise((r) => setTimeout(r, MINUTI * 60_000));

const dopo = await P.countDocuments({ p: { $ne: null } } as never);
const secondi = (Date.now() - inizio) / 1000;
const ritmo = (dopo - prima) / secondi;

console.log("");
console.log(`  prodotti dopo      ${n(dopo)}   (+${n(dopo - prima)}, ${ritmo.toFixed(1)}/s)`);
console.log("");

/* IL VERDETTO, DETTO IN MODO CHE NON SERVA INTERPRETARLO.
   Chi lancia questo comando vuole sapere una cosa sola: devo fare qualcosa?
   Un elenco di numeri lascia quella domanda aperta. */
if (processi === 0) {
  console.log("  NESSUN LETTORE E' ACCESO.");
  console.log("  powershell -ExecutionPolicy Bypass -File comandi\\avvia-lettori.ps1");
} else if (dopo === prima) {
  console.log("  I LETTORI CI SONO E IL CONTEGGIO NON SI MUOVE.");
  console.log("  Guarda nei registri se compare «non salvati» o «NON PRENDE PIU'»:");
  console.log("     %TEMP%\\lettore-*.log");
  console.log("  Se c'e', e' la connessione al database: basta riavviarli, la");
  console.log("  risoluzione del nome si rifa' e riparte. Se non c'e', i lettori");
  console.log("  stanno montando la coda — un catalogo grosso ci mette minuti.");
} else if (ritmo < 1) {
  console.log(`  Lento: ${ritmo.toFixed(1)} prodotti al secondo.`);
  console.log("  Normale subito dopo un riavvio, quando le code si rimontano.");
  console.log("  Se dura, prova:  npx tsx --env-file-if-exists=.env scripts/chi-rende-davvero.ts");
  console.log("  che apre sei schede per insegna una per volta e dice se e' colpa nostra.");
} else {
  const ore = (2_000_000 - dopo) / ritmo / 3600;
  console.log(`  Tutto a posto. Mancano ${n(Math.max(0, 2_000_000 - dopo))} prodotti ai due milioni,`);
  console.log(`  circa ${ore.toFixed(1)} ore a questo passo.`);
}
console.log("");
process.exit(0);
