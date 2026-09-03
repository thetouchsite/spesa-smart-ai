/**
 * Archivio chiave/valore sincrono su AsyncStorage.
 *
 * PERCHÉ NON USARE AsyncStorage DIRETTAMENTE
 * ------------------------------------------
 * Il codice portato dal prototipo legge `localStorage` in modo sincrono in
 * una dozzina di punti: la cache delle ricette, la cache della geolocazione,
 * i piani salvati, la lingua scelta, lo store zustand. AsyncStorage è
 * asincrono, e convertire tutti quei punti significherebbe propagare `await`
 * fin dentro i componenti — molto lavoro, molte occasioni di sbagliare, per
 * dati che complessivamente stanno in poche centinaia di kilobyte.
 *
 * Qui teniamo uno specchio in memoria: `hydrate()` lo riempie una volta
 * all'avvio, le letture rispondono dalla memoria, le scritture aggiornano
 * memoria e disco (il disco senza attendere). L'API è la stessa di
 * `localStorage`, quindi il codice portato funziona senza modifiche.
 *
 * Limite noto e accettato: se l'app viene chiusa nell'istante fra una
 * scrittura e il suo salvataggio, quel valore si perde. Riguarda cache e
 * preferenze, non dati che l'utente si aspetta di ritrovare — i piani salvati
 * stanno sul backend.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

/** Prefisso comune: rende possibile un "cancella tutto" mirato. */
const PREFIX = "spesa.";

const memory = new Map<string, string>();
let hydrated = false;

/**
 * Carica tutte le chiavi in memoria. Va attesa una volta sola, nel layout
 * radice, PRIMA di montare l'app: un componente che legge prima
 * dell'idratazione vedrebbe un archivio vuoto e mostrerebbe l'onboarding a
 * un utente che aveva già un piano.
 */
export async function hydrate(): Promise<void> {
  if (hydrated) return;
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    if (keys.length > 0) {
      for (const [key, value] of await AsyncStorage.multiGet(keys)) {
        if (value !== null) memory.set(key, value);
      }
    }
  } catch (err) {
    // Un archivio illeggibile non deve impedire l'avvio: si riparte vuoti.
    console.warn("[kv] idratazione fallita, si parte da vuoto:", err);
  }
  hydrated = true;
}

export function isHydrated(): boolean {
  return hydrated;
}

function full(key: string): string {
  return key.startsWith(PREFIX) ? key : PREFIX + key;
}

export const kv = {
  getItem(key: string): string | null {
    return memory.get(full(key)) ?? null;
  },

  setItem(key: string, value: string): void {
    const k = full(key);
    memory.set(k, value);
    // Scrittura su disco senza attesa: l'interfaccia non deve mai bloccarsi
    // per salvare una preferenza.
    AsyncStorage.setItem(k, value).catch((err) =>
      console.warn("[kv] salvataggio fallito:", k, err),
    );
  },

  removeItem(key: string): void {
    const k = full(key);
    memory.delete(k);
    AsyncStorage.removeItem(k).catch(() => {});
  },

  /** Chiavi attualmente in memoria, prefisso incluso. */
  keys(): string[] {
    return [...memory.keys()];
  },

  /** Svuota le chiavi che iniziano per `prefix` (senza il prefisso comune). */
  clearPrefix(prefix: string): void {
    const target = full(prefix);
    const doomed = [...memory.keys()].filter((k) => k.startsWith(target));
    for (const k of doomed) memory.delete(k);
    AsyncStorage.multiRemove(doomed).catch(() => {});
  },
};

/**
 * Adattatore per `zustand/middleware/persist`, che si aspetta l'interfaccia
 * di `Storage`. Sincrono perché legge dallo specchio in memoria.
 */
export const zustandStorage = {
  getItem: (name: string) => kv.getItem(name),
  setItem: (name: string, value: string) => kv.setItem(name, value),
  removeItem: (name: string) => kv.removeItem(name),
};
