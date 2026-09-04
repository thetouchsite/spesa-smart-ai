/**
 * Formattazione di importi e numeri, secondo la lingua dell'utente.
 *
 * PERCHÉ ESISTE
 * -------------
 * Avevo scritto `Intl.NumberFormat("it-IT", …)` in quattro schermate. Funziona
 * benissimo finché l'utente è italiano; a un francese mostra "1 234,56 €" con
 * le convenzioni sbagliate, e a un inglese l'euro al posto della sterlina.
 *
 * Il cliente vuole proporre l'app fuori dall'Italia, quindi la lingua e la
 * valuta arrivano da chi usa l'app, non dal paese di chi l'ha scritta.
 *
 * `Intl` sa già fare tutto: qui c'è solo la mappa lingua → locale e la
 * protezione dagli errori, perché un codice valuta non valido fa lanciare
 * `Intl.NumberFormat` e in una schermata di risultati è l'ultima cosa che
 * si vuole.
 */

import type { LabelLang } from "./price-data/labels";

/** Lingua dell'app → locale completo per la formattazione. */
const LOCALE: Record<string, string> = {
  it: "it-IT",
  en: "en-GB",
  fr: "fr-FR",
  es: "es-ES",
  de: "de-DE",
};

export function localeFor(language: string): string {
  return LOCALE[language] ?? "en-GB";
}

/**
 * Importo con simbolo di valuta.
 *
 * `currency` deve essere un codice ISO-4217. Se manca o non è valido si
 * ripiega su una formattazione semplice invece di far esplodere la schermata.
 */
export function money(value: number, currency: string, language = "en"): string {
  if (!Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat(localeFor(language), {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency || ""}`.trim();
  }
}

/** Importo arrotondato all'unità: per le cifre grandi, dove i centesimi distraggono. */
export function moneyRounded(value: number, currency: string, language = "en"): string {
  if (!Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat(localeFor(language), {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${Math.round(value)} ${currency || ""}`.trim();
  }
}

export function number(value: number, language = "en"): string {
  if (!Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat(localeFor(language)).format(value);
  } catch {
    return String(value);
  }
}

/**
 * Impostazioni di partenza ricavate dal dispositivo.
 *
 * Sostituiscono i valori italiani scritti a mano (`"Bologna"`, `"IT"`,
 * `"EUR"`) che avevo sparso nelle schermate. Un utente in Spagna che apre
 * l'app prima di rispondere alle domande non deve trovarsi l'Italia
 * preselezionata.
 */
export function deviceDefaults(): { language: LabelLang; country: string; currency: string } {
  let locale = "en-GB";
  try {
    locale = Intl.DateTimeFormat().resolvedOptions().locale || locale;
  } catch {
    /* runtime senza Intl: si resta sul default */
  }

  const [lang, region] = locale.split("-");
  const language = (["it", "en", "fr", "es", "de"].includes(lang) ? lang : "en") as LabelLang;
  const country = (region || "GB").toUpperCase();

  // Mappa minima paese → valuta: copre i mercati del catalogo prezzi.
  // Per gli altri paesi l'euro è il ripiego meno sbagliato, e comunque
  // l'utente sceglie la valuta al passo del budget.
  const CURRENCY: Record<string, string> = {
    IT: "EUR", FR: "EUR", ES: "EUR", DE: "EUR", NL: "EUR", PT: "EUR", IE: "EUR",
    AT: "EUR", BE: "EUR", GR: "EUR", FI: "EUR",
    GB: "GBP", US: "USD", CA: "CAD", CH: "CHF", JP: "JPY", BR: "BRL", AE: "AED",
    AU: "AUD", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN",
  };

  return { language, country, currency: CURRENCY[country] ?? "EUR" };
}

/**
 * Lingua parlata in un paese, per le ricerche di prodotto.
 *
 * NON è la lingua dell'interfaccia, ed è una distinzione che serve davvero.
 *
 * Un utente inglese che vive a Napoli legge l'app in inglese, ma sugli
 * scaffali dei negozi italiani i prodotti si chiamano in italiano. Cercare
 * "Potatoes" su Google Shopping Italia dà risultati scarsi; cercare
 * "Patatas" — perché l'utente aveva scelto lo spagnolo — dà una marca
 * italiana di patatine gourmet chiamata "Patatas Nana", che con le patate
 * non c'entra nulla.
 *
 * Quindi: interfaccia nella lingua dell'utente, ricerca nella lingua del
 * paese in cui fa la spesa.
 */
const COUNTRY_LANGUAGE: Record<string, LabelLang> = {
  IT: "it",
  FR: "fr", BE: "fr", LU: "fr",
  ES: "es", MX: "es", AR: "es", CL: "es", CO: "es",
  DE: "de", AT: "de", CH: "de",
  GB: "en", IE: "en", US: "en", CA: "en", AU: "en", NZ: "en",
};

export function languageOfCountry(country: string): LabelLang {
  return COUNTRY_LANGUAGE[(country || "").toUpperCase()] ?? "en";
}
