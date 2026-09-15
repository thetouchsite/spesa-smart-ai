/**
 * Ripubblica la demo che il cliente apre in Expo Go.
 *
 * Da lanciare ogni volta che si vuole che il cliente veda le modifiche: lui
 * non deve reinstallare niente, riapre e trova la versione nuova.
 *
 * PERCHE' UNO SCRIPT PER DUE RIGHE
 * --------------------------------
 * Perche' quelle due righe hanno tre trabocchetti, e sbagliarne uno pubblica
 * qualcosa che il cliente non riuscira' ad aprire — senza che nulla lo dica.
 *
 *   EXPO_GO_DEMO=1        marca la pubblicazione con la SDK di Expo Go invece
 *                         che con la versione dell'app. Senza, Expo Go
 *                         risponde "no channel named ..." e basta.
 *   --branch expo-go      il ramo collegato al canale che il link interroga
 *   --environment preview da dove prendere le variabili
 *
 * E impostare una variabile d'ambiente per un comando solo si scrive in modo
 * diverso su Windows e altrove, quindi lo fa Node.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";

const RADICE = fileURLToPath(new URL("..", import.meta.url));

/**
 * Mette le virgolette agli argomenti che ne hanno bisogno.
 *
 * Su Windows i comandi installati da npm sono file `.cmd`, e Node si rifiuta
 * di eseguirli senza passare da una shell — e' una protezione aggiunta dopo
 * una vulnerabilita' del 2024. Ma la shell RISPEZZA gli argomenti sugli spazi,
 * e nessuno rimette insieme i pezzi:
 *
 *     --message "Aggiornamento del 15/09/2026"
 *     →  Unexpected arguments: del, 15/09/2026
 *
 * Node non cita per noi quando `shell` e' acceso, quindi tocca a noi.
 */
function citaSeServe(argomento) {
  if (process.platform !== "win32") return argomento;
  return /[\s"]/.test(argomento) ? `"${argomento.replace(/"/g, '\\"')}"` : argomento;
}

/** Il nome vero dell'eseguibile: su Windows i comandi npm sono `.cmd`. */
function comando(nome) {
  return process.platform === "win32" ? `${nome}.cmd` : nome;
}


const messaggio =
  process.argv.slice(2).join(" ") ||
  `Aggiornamento del ${new Date().toLocaleDateString("it-IT")}`;

console.log(`\nPubblico per Expo Go: "${messaggio}"\n`);

const p = spawn(
  comando("eas"),
  [
    "update",
    "--branch", "expo-go",
    "--environment", "preview",
    "--message", citaSeServe(messaggio),
    "--non-interactive",
  ],
  {
    cwd: RADICE,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      EXPO_GO_DEMO: "1",
      // Il calcolo dell'impronta del progetto prende minuti e non serve:
      // qui la compatibilita' la garantisce la SDK dichiarata a mano.
      EAS_SKIP_AUTO_FINGERPRINT: "1",
    },
  },
);

p.on("close", (codice) => {
  if (codice === 0) {
    console.log(
      "\nFatto. Il cliente riapre Expo Go e trova la versione nuova:\n" +
        "non deve reinstallare, non deve fare niente.\n",
    );
  }
  process.exit(codice ?? 1);
});
