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
 * `installPolyfills()` va chiamata UNA volta all'avvio, dopo `hydrate()` e
 * prima di montare qualunque componente.
 */

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
 * Se `Intl` mancasse, "it-IT" è il default sensato per questo prodotto.
 */
function deviceLanguage(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || "it-IT";
  } catch {
    return "it-IT";
  }
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

  // React Native definisce `navigator`, ma senza i campi di lingua che il
  // rilevamento automatico del prototipo si aspetta.
  const nav = g.navigator as Record<string, unknown> | undefined;
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
