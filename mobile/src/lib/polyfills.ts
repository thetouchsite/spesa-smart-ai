/**
 * Compatibilità per il codice portato dal prototipo web.
 *
 * La logica di calcolo arriva dal web quasi identica — è la parte migliore
 * del prototipo e riscriverla sarebbe stato uno spreco. Usa però due API del
 * browser che React Native non ha: `localStorage` e `navigator.language`.
 *
 * Invece di modificare una dozzina di file (cache ricette, cache posizione,
 * piani salvati, sessione, lingua) e rischiare di introdurre errori in codice
 * che oggi funziona, qui installiamo le due API mancanti. Il codice portato
 * resta identico al web, e quando una correzione arriva da una parte vale
 * anche per l'altra.
 *
 * ORDINE, CHE QUI E' TUTTO
 * ------------------------
 * L'installazione avviene come EFFETTO DI IMPORT, non dentro un effetto
 * React. Motivo: `state/session.ts` configura zustand con
 * `createJSONStorage(() => window.localStorage)`, e quel getter viene
 * valutato quando il modulo si carica — molto prima che un componente venga
 * montato. Installando in un `useEffect` lo storage risultava `undefined` e
 * ogni scrittura sul profilo moriva con "Cannot read property 'setItem' of
 * undefined".
 *
 * Questo file va quindi importato PRIMA di qualunque altro modulo che
 * tocchi lo stato: in `app/_layout.tsx` è la prima riga di import.
 *
 * `hydrate()` resta asincrona: al caricamento lo specchio è vuoto e zustand
 * legge un archivio vuoto. Per questo, a idratazione finita, il layout
 * richiama `useSession.persist.rehydrate()` — senza, il profilo salvato non
 * tornerebbe mai indietro.
 */

import * as Location from "expo-location";
import { kv } from "./kv";

/** Implementazione di `Storage` appoggiata allo specchio sincrono di `kv`. */
function makeLocalStorage(): Storage {
  return {
    get length() {
      return kv.keys().length;
    },
    key(index: number): string | null {
      return kv.keys()[index] ?? null;
    },
    getItem(key: string): string | null {
      return kv.getItem(key);
    },
    setItem(key: string, value: string): void {
      kv.setItem(key, String(value));
    },
    removeItem(key: string): void {
      kv.removeItem(key);
    },
    clear(): void {
      for (const k of kv.keys()) kv.removeItem(k);
    },
  } as Storage;
}

/**
 * Lingua del dispositivo.
 *
 * `Intl` è disponibile in Hermes su React Native 0.76, quindi ricaviamo la
 * lingua da lì invece di aggiungere `expo-localization` per un solo dato.
 * Se `Intl` mancasse si usa "en-GB": l'app non e' riservata all'Italia,
 * e l'inglese e' il ripiego meno sbagliato per un utente qualunque.
 */
function deviceLanguage(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || "en-GB";
  } catch {
    return "en-GB";
  }
}

/**
 * `navigator.geolocation` appoggiato a expo-location.
 *
 * `detectLocation()` nel codice portato chiama `getCurrentPosition` con le
 * callback del browser. Qui riproduciamo quella firma: la richiesta del
 * permesso avviene dentro, come fa il browser, così il chiamante non cambia.
 *
 * Il permesso negato non è un errore da propagare: il flusso ha già la via
 * alternativa della ricerca per città, quindi si risponde con l'errore
 * previsto e l'interfaccia mostra il campo di testo.
 */
function makeGeolocation() {
  return {
    getCurrentPosition(
      onSuccess: (pos: { coords: { latitude: number; longitude: number } }) => void,
      onError?: (err: { code: number; message: string }) => void,
      options?: { timeout?: number; enableHighAccuracy?: boolean },
    ) {
      (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== "granted") {
            onError?.({ code: 1, message: "Permesso di posizione negato" });
            return;
          }
          const pos = await Location.getCurrentPositionAsync({
            accuracy: options?.enableHighAccuracy
              ? Location.Accuracy.High
              : Location.Accuracy.Balanced,
          });
          onSuccess({
            coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
          });
        } catch (err) {
          onError?.({ code: 2, message: String(err) });
        }
      })();
    },
    watchPosition() {
      // Non usata dall'app: dichiarata perché il tipo `Geolocation` la prevede.
      return 0;
    },
    clearWatch() {},
  };
}

let installed = false;

export function installPolyfills(): void {
  if (installed) return;

  const g = globalThis as Record<string, unknown>;

  if (!g.localStorage) {
    Object.defineProperty(g, "localStorage", {
      value: makeLocalStorage(),
      writable: false,
      configurable: true,
    });
  }

  // React Native definisce `navigator`, ma senza i campi di lingua né la
  // geolocalizzazione che il codice portato si aspetta.
  const nav = g.navigator as Record<string, unknown> | undefined;
  if (nav && !nav.geolocation) {
    try {
      Object.defineProperty(nav, "geolocation", {
        value: makeGeolocation(),
        configurable: true,
      });
    } catch {
      console.warn("[polyfills] navigator.geolocation non impostabile: resta la ricerca per città");
    }
  }
  if (nav && typeof nav.language !== "string") {
    const lang = deviceLanguage();
    try {
      Object.defineProperty(nav, "language", { value: lang, configurable: true });
      Object.defineProperty(nav, "languages", { value: [lang], configurable: true });
    } catch {
      // Alcuni runtime rendono `navigator` non estendibile: il codice
      // portato ha già un valore di ripiego, quindi non è un errore fatale.
      console.warn("[polyfills] navigator.language non impostabile, si usa il default");
    }
  }

  installed = true;
}

// Eseguita al caricamento del modulo, non su chiamata: vedi la nota
// sull'ordine in testa al file.
installPolyfills();
