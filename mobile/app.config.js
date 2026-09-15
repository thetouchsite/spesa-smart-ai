/**
 * La configurazione dell'app, con una sola variante.
 *
 * Tutto il contenuto vero sta ancora in `app.json` — nome, icona, permessi,
 * identificativi — e questo file si limita a leggerlo e a cambiare UNA cosa
 * quando glielo si chiede.
 *
 * PERCHE' ESISTE
 * --------------
 * Per far aprire l'app al cliente dentro Expo Go, senza account Apple e senza
 * il nostro computer acceso.
 *
 * `eas update` pubblica il codice sui server di Expo, e ogni pubblicazione
 * porta una "runtime version": dice a quale guscio nativo quel codice si
 * attacca. Per un'app compilata da noi e' la versione dell'app, `1.0.0`, ed e'
 * giusto cosi' — un aggiornamento pensato per la 1.0.0 non deve finire dentro
 * la 2.0.0, che magari ha librerie native diverse.
 *
 * Ma Expo Go non e' una nostra build: e' un guscio gia' fatto che Apple e
 * Google distribuiscono, e accetta solo codice marcato con la SUA versione di
 * SDK. Chiede `exposdk:57.0.0` e di `1.0.0` non sa che farsene — risponde
 * "There is no channel named ..." e il cliente resta a guardare.
 *
 * Quindi: due pubblicazioni diverse dello stesso codice, con due etichette
 * diverse. `EXPO_GO_DEMO=1` sceglie quella per Expo Go.
 *
 *     npm run demo        pubblica per Expo Go (il cliente)
 *     eas update ...      pubblica per le nostre build (normale)
 *
 * SI PUO' TOGLIERE quando il cliente avra' l'app vera installata: da quel
 * momento serve solo la riga di `app.json`, e questo file diventa un giro
 * inutile.
 */

const base = require("./app.json");

/** La SDK di Expo Go che deve poter aprire questa pubblicazione. */
const SDK_EXPO_GO = "exposdk:57.0.0";

module.exports = () => {
  const config = { ...base.expo };

  if (process.env.EXPO_GO_DEMO === "1") {
    config.runtimeVersion = SDK_EXPO_GO;
  }

  return config;
};
