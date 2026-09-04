/**
 * Giorni della settimana, da qualunque lingua alla lingua dell'utente.
 *
 * PERCHÉ NON BASTA UNA TABELLA
 * ----------------------------
 * Avevo scritto una mappa `Monday → Lunedì`, dando per scontato che il piano
 * arrivasse in inglese. Non è così: il piano lo genera l'AI **nella lingua
 * della richiesta**, quindi i giorni possono arrivare come "Lunes", "Lundi",
 * "Montag" o "Lunedì". La mappa non trovava corrispondenza e li lasciava
 * passare, e sullo schermo comparivano giorni spagnoli sotto un'interfaccia
 * italiana.
 *
 * Qui il nome viene prima riconosciuto in una qualsiasi delle cinque lingue,
 * ridotto a un indice 0-6, e poi riscritto con `Intl` nella lingua di chi
 * guarda. Un piano generato in spagnolo mostrato a un inglese dice "Monday".
 *
 * Se il nome non è riconosciuto — l'AI a volte scrive "Giorno 1" — si
 * restituisce l'originale invece di indovinare.
 */

import { localeFor } from "./format";

/** Tutte le forme note, minuscole e senza accenti, → indice del giorno. */
const INDEX: Record<string, number> = {};

const NAMES: string[][] = [
  ["monday", "lunedi", "lunes", "lundi", "montag"],
  ["tuesday", "martedi", "martes", "mardi", "dienstag"],
  ["wednesday", "mercoledi", "miercoles", "mercredi", "mittwoch"],
  ["thursday", "giovedi", "jueves", "jeudi", "donnerstag"],
  ["friday", "venerdi", "viernes", "vendredi", "freitag"],
  ["saturday", "sabato", "sabado", "samedi", "samstag"],
  ["sunday", "domenica", "domingo", "dimanche", "sonntag"],
];

NAMES.forEach((forms, i) => {
  for (const f of forms) INDEX[f] = i;
});

function normalise(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/**
 * Indice 0-6 (lunedì = 0) del giorno, o `null` se il nome non è un giorno.
 *
 * Riconosce anche le forme abbreviate che l'AI produce a volte ("Lun", "Mon"):
 * bastano le prime tre lettere, che nelle cinque lingue non generano
 * ambiguità fra giorni diversi.
 */
export function dayIndex(name: string): number | null {
  const n = normalise(name);
  if (!n) return null;
  if (n in INDEX) return INDEX[n];

  const short = n.slice(0, 3);
  for (const [form, i] of Object.entries(INDEX)) {
    if (form.startsWith(short)) return i;
  }
  return null;
}

/** Cache: `Intl.DateTimeFormat` non è gratis e qui si chiama per ogni riga. */
const cache = new Map<string, string[]>();

function namesFor(language: string): string[] {
  const cached = cache.get(language);
  if (cached) return cached;

  let names: string[];
  try {
    const fmt = new Intl.DateTimeFormat(localeFor(language), { weekday: "long" });
    // 2024-01-01 era un lunedì: si parte da lì per avere l'ordine giusto.
    names = Array.from({ length: 7 }, (_, i) =>
      fmt.format(new Date(Date.UTC(2024, 0, 1 + i))),
    );
  } catch {
    names = NAMES.map((f) => f[0]);
  }

  names = names.map((n) => n.charAt(0).toUpperCase() + n.slice(1));
  cache.set(language, names);
  return names;
}

/**
 * Nome del giorno nella lingua dell'utente.
 * Restituisce l'originale quando non è riconoscibile come giorno.
 */
export function localDay(name: string, language = "it"): string {
  const i = dayIndex(name);
  if (i === null) return name;
  return namesFor(language)[i] ?? name;
}
