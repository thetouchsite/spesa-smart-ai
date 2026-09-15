/**
 * L'APK, costruito qui invece che sui server di Expo.
 *
 * PERCHE' UNO SCRIPT E NON UNA RIGA IN package.json
 * -------------------------------------------------
 * Perche' la riga in package.json era `cd android && gradlew assembleRelease`,
 * e quel comando funziona nel prompt di Windows ma NON in una shell POSIX,
 * dove serve `./gradlew`. Chi lo lanciava dal terminale sbagliato leggeva
 *
 *     "gradlew" non e' riconosciuto come comando interno o esterno
 *
 * dopo aver aspettato tutto il prebuild. Qui il nome giusto lo sceglie Node,
 * che sa su che sistema sta.
 *
 * COSA FA
 * -------
 * Genera la cartella nativa e poi la compila. Niente EAS, niente account,
 * niente coda: il file esce sulla macchina in qualche minuto.
 *
 * L'INDIRIZZO DEL BACKEND VIENE DA `.env`, NON DA `eas.json`. Sono due strade
 * diverse con le stesse tre variabili, ed e' la confusione piu' facile da
 * fare: si costruisce in locale credendo di usare la configurazione di EAS, e
 * si consegna un APK che punta a un indirizzo di rete locale. Per questo lo
 * script lo stampa prima di cominciare — se sbagliato, si ferma qui invece che
 * sul telefono di chi lo prova.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

/**
 * La cartella del progetto.
 *
 * `new URL(...).pathname` NON va bene, ed e' il genere di errore che si vede
 * solo su certe macchine: torna un percorso in forma di indirizzo web, con la
 * barra davanti alla lettera di unita' e gli spazi scritti `%20`. Questo
 * progetto sta in "Spesa Smart AI", quindi diventava "Spesa%20Smart%20AI" —
 * una cartella che non esiste. Il sintomo non aiutava per niente: `.env`
 * risultava assente, e poi `spawn cmd.exe ENOENT`, come se mancasse la shell
 * di Windows, quando mancava solo la cartella in cui eseguirla.
 *
 * `fileURLToPath` fa la conversione giusta su ogni sistema.
 */
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


function esegui(comando, argomenti, cartella) {
  return new Promise((risolvi, rifiuta) => {
    // Con la shell accesa va citato anche IL COMANDO, non solo i suoi
    // argomenti. Il percorso di questo progetto contiene uno spazio, e cmd
    // leggeva "C:\Users\anton\works\Spesa" come il programma da eseguire.
    const p = spawn(citaSeServe(comando), argomenti.map(citaSeServe), {
      cwd: cartella,
      stdio: "inherit",
      // Su Windows i comandi installati sono file .cmd, che non sono
      // eseguibili diretti: senza questo, spawn non li trova.
      shell: process.platform === "win32",
    });
    p.on("error", rifiuta);
    p.on("close", (codice) =>
      codice === 0 ? risolvi() : rifiuta(new Error(`${comando} è uscito con codice ${codice}`)),
    );
  });
}

/** Le variabili che finiranno cotte dentro l'APK. */
function mostraConfigurazione() {
  const percorso = join(RADICE, ".env");
  if (!existsSync(percorso)) {
    console.warn("\nATTENZIONE: manca .env — l'app non saprà a quale backend rivolgersi.\n");
    return;
  }
  const righe = readFileSync(percorso, "utf8")
    .split("\n")
    .filter((r) => r.startsWith("EXPO_PUBLIC_"));

  console.log("\nQuesto finisce dentro l'APK, e non si può cambiare dopo:\n");
  for (const r of righe) console.log("   " + r);

  const indirizzo = righe.find((r) => r.startsWith("EXPO_PUBLIC_API_URL="))?.split("=")[1] ?? "";
  if (/localhost|127\.0\.0\.1|192\.168\.|10\.0\./.test(indirizzo)) {
    console.log(
      "\n   ⚠  È un indirizzo di rete locale: l'APK funzionerà solo sui\n" +
        "      dispositivi collegati a questa rete. Per darlo a qualcun altro\n" +
        "      serve l'indirizzo pubblico del backend.\n",
    );
  }
  console.log("");
}

async function main() {
  mostraConfigurazione();

  console.log("1/2  genero la cartella nativa…\n");
  await esegui(comando("npx"), ["expo", "prebuild", "--platform", "android"], RADICE);

  const android = join(RADICE, "android");

  /**
   * Il percorso COMPLETO del wrapper, non il suo nome.
   *
   * Il nome da solo non basta: `cmd` cerca gli eseguibili nel PATH e, su
   * parecchie installazioni Windows, NON nella cartella corrente — c'e' una
   * politica di sistema che lo disattiva. Il risultato era
   *
   *     "gradlew.bat" non e' riconosciuto come comando interno o esterno
   *
   * subito dopo un prebuild andato benissimo, con il file li' dove doveva
   * essere. Con il percorso assoluto la questione non si pone.
   */
  const wrapper = join(
    android,
    process.platform === "win32" ? "gradlew.bat" : "gradlew",
  );
  if (!existsSync(wrapper)) {
    throw new Error("prebuild non ha prodotto il wrapper di Gradle: la cartella android è incompleta");
  }

  console.log("\n2/2  compilo (la prima volta sono dieci-quindici minuti)…\n");
  await esegui(wrapper, ["assembleRelease"], android);

  const apk = join(android, "app", "build", "outputs", "apk", "release", "app-release.apk");
  console.log("\n" + "─".repeat(60));
  if (existsSync(apk)) {
    const mb = (readFileSync(apk).length / 1024 / 1024).toFixed(1);
    console.log(`APK pronto — ${mb} MB\n\n   ${apk}\n`);
    console.log("Si manda com'è: chi lo riceve deve solo concedere");
    console.log("l'installazione da fonti sconosciute.\n");
  } else {
    console.log("Compilazione finita ma il file non è dove me lo aspettavo.");
    console.log(`Cercavo: ${apk}\n`);
  }
}

main().catch((err) => {
  console.error("\nBuild fallita:", err.message, "\n");
  process.exit(1);
});
