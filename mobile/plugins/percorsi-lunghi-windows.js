/**
 * Rimette, dopo ogni prebuild, le due cose che servono a compilare su Windows.
 *
 * PERCHE' UN PLUGIN E NON UNA MODIFICA A MANO
 * -------------------------------------------
 * `npx expo prebuild` cancella la cartella `android` e la rigenera dal
 * modello. Qualunque riga scritta a mano dentro `android/` vive fino al
 * prebuild successivo e poi sparisce — senza dire niente. Chi la rifa' una
 * seconda volta di solito non collega le due cose, e cerca il guasto altrove.
 *
 * IL PROBLEMA CHE RISOLVE
 * -----------------------
 * Windows non accetta nomi di file oltre i 260 caratteri. Il file oggetto di
 * `RNGestureHandlerDetectorShadowNode.cpp` ne misurava 385, perche' ninja
 * trascrive dentro la cartella degli oggetti il percorso assoluto del
 * sorgente: la cartella del progetto finisce due volte nello stesso nome.
 *
 * Accorciare il percorso NON basta. Misurato su tutte le combinazioni: col
 * progetto su un disco `subst` e la cartella di build in `C:\c` si arriva a
 * 290 caratteri, trenta ancora di troppo. Non e' un percorso da accorciare,
 * e' troppo lungo di suo.
 *
 * E non basta nemmeno alzare `LongPathsEnabled` nel registro: un programma
 * ottiene i percorsi lunghi solo se lo dichiara nel proprio manifest, e il
 * ninja 1.10.2 dentro CMake 3.22.1 — quello che l'SDK installa di serie —
 * non lo dichiara. Verificato aprendo il binario.
 *
 * CMake 3.31.6 porta ninja 1.12.1, che il manifest ce l'ha, e in piu' smette
 * di ricopiare il percorso del sorgente: al suo posto mette un'impronta.
 * Il nome che prima ne misurava 385 diventa
 *
 *     7af11abc69aa50de3b9021c0b6beb9e9/RNGestureHandlerDetectorShadowNode.cpp.o
 *
 * Serve quindi, una volta sola sulla macchina:
 *     sdkmanager "cmake;3.31.6"
 *     reg add "HKLM\SYSTEM\CurrentControlSet\Control\FileSystem" ^
 *         /v LongPathsEnabled /t REG_DWORD /d 1 /f
 *
 * SOLO SU WINDOWS
 * ---------------
 * La versione si fissa solo se il prebuild gira su Windows. Su Linux il
 * problema non esiste, e pretendere li' una CMake 3.31.6 che il costruttore
 * in cloud non ha installata romperebbe una build che oggi funziona.
 */

const { withAppBuildGradle, withGradleProperties } = require("@expo/config-plugins");

const CMAKE = "3.31.6";

/* Heap e Metaspace. Con React Native 0.86 e la nuova architettura i 512 MB di
   Metaspace del modello finiscono a meta' build: il demone Gradle si spegne e
   la volta dopo si riparte da freddo. Vale su ogni sistema, non solo Windows. */
const MEMORIA = "-Xmx4096m -XX:MaxMetaspaceSize=1024m";

function conCMakeRecente(config) {
  if (process.platform !== "win32") return config;

  return withAppBuildGradle(config, (c) => {
    if (c.modResults.language !== "groovy") {
      throw new Error("percorsi-lunghi-windows: build.gradle non e' in groovy, non so dove scrivere");
    }
    if (c.modResults.contents.includes(`version "${CMAKE}"`)) return c;

    const apertura = /^android\s*\{/m;
    if (!apertura.test(c.modResults.contents)) {
      throw new Error("percorsi-lunghi-windows: non trovo il blocco `android {` in build.gradle");
    }
    c.modResults.contents = c.modResults.contents.replace(
      apertura,
      (trovato) =>
        `${trovato}\n` +
        `    // Messo da plugins/percorsi-lunghi-windows.js — il perche' sta li'.\n` +
        `    externalNativeBuild {\n        cmake {\n            version "${CMAKE}"\n        }\n    }\n`,
    );
    return c;
  });
}

function conMemoriaGradle(config) {
  return withGradleProperties(config, (c) => {
    const chiave = "org.gradle.jvmargs";
    const riga = c.modResults.find((v) => v.type === "property" && v.key === chiave);
    if (riga) riga.value = MEMORIA;
    else c.modResults.push({ type: "property", key: chiave, value: MEMORIA });
    return c;
  });
}

module.exports = (config) => conMemoriaGradle(conCMakeRecente(config));
