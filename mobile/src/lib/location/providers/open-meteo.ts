/**
 * Ricerca città e posizione attuale — servizi che Android non blocca.
 *
 * IL PROBLEMA CHE RISOLVE
 * -----------------------
 * Nominatim **rifiuta okhttp**, la libreria con cui React Native fa le
 * richieste su Android: risponde `403 Access denied`. Non era un difetto
 * dell'emulatore — la ricerca città era rotta su ogni telefono Android, e chi
 * digitava «Napoli» leggeva «nessuna città trovata».
 *
 * Provato, tre identità:
 *
 *     okhttp/4.9.2                            403
 *     Dalvik/2.1.0 (Linux; U; Android 15)     403
 *     nessuna                                 200
 *
 * Non si aggira: la loro politica d'uso chiede di dichiararsi, e dichiararsi
 * è esattamente ciò che fa scattare il blocco.
 *
 * COSA C'È AL SUO POSTO
 * ---------------------
 * Open-Meteo Geocoding per cercare una città, BigDataCloud per riconoscere
 * dove si trova chi apre l'app. Gratuiti, senza chiave, e — verificato con
 * l'identità di okhttp e con quella di Android — rispondono a entrambe.
 *
 * In più Open-Meteo restituisce i nomi **nella lingua chiesta**: chi ha l'app
 * in italiano cerca «Atene» e «Lisbona», non «Athína» e «Lisboa».
 *
 * Overpass resta a trovare i negozi vicini: lì non ha mai dato problemi.
 */

import {
  type CityResult,
  type LatLon,
  type ReverseGeocodeResult,
} from "./types";

const GEOCODING = "https://geocoding-api.open-meteo.com/v1";
const REVERSE = "https://api.bigdatacloud.net/data/reverse-geocode-client";

/** Oltre otto secondi la schermata resterebbe in attesa senza motivo. */
const ATTESA_MS = 8000;

/** La lingua dell'app decide in che lingua tornano i nomi dei luoghi. */
function lingua(): string {
  return (process.env.EXPO_PUBLIC_LOCALE || "it").slice(0, 2);
}

/**
 * `fetch` con scadenza propria, che rispetta anche l'annullamento di chi
 * chiama — la schermata di ricerca annulla la richiesta a ogni tasto premuto.
 */
async function prendi(url: string, signal?: AbortSignal): Promise<Response | null> {
  const mio = new AbortController();
  const timer = setTimeout(() => mio.abort(), ATTESA_MS);
  const propaga = () => mio.abort();
  if (signal) {
    if (signal.aborted) mio.abort();
    else signal.addEventListener("abort", propaga);
  }
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: mio.signal });
    return res.ok ? res : null;
  } catch {
    // Rete assente o richiesta annullata: chi chiama mostrerà "nessun
    // risultato", che dal punto di vista di chi guarda è la verità.
    return null;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", propaga);
  }
}

interface RigaOpenMeteo {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  country_code?: string;
  /** Regione o stato: distingue la Napoli campana da quella di New York. */
  admin1?: string;
  postcodes?: string[];
}

function aCitta(r: RigaOpenMeteo): CityResult {
  return {
    id: String(r.id),
    name: r.name,
    country: r.country ?? r.country_code ?? "",
    countryCode: (r.country_code ?? "").toUpperCase(),
    region: r.admin1,
    postcode: r.postcodes?.[0],
    lat: r.latitude,
    lon: r.longitude,
  };
}

/** Le città che corrispondono a quanto digitato, in ordine di rilevanza. */
export async function searchCities(query: string, signal?: AbortSignal): Promise<CityResult[]> {
  const q = (query || "").trim();
  // Con una lettera sola tornerebbero mille omonimi di mezzo mondo.
  if (q.length < 2) return [];

  const url =
    `${GEOCODING}/search?name=${encodeURIComponent(q)}` +
    `&count=8&language=${lingua()}&format=json`;
  const res = await prendi(url, signal);
  if (!res) return [];

  try {
    const body = (await res.json()) as { results?: RigaOpenMeteo[] };
    return (body.results ?? []).filter((r) => r.name && r.country_code).map(aCitta);
  } catch {
    return [];
  }
}

/** Il primo risultato per un testo libero: serve quando la città arriva già scritta. */
export async function geocode(query: string, signal?: AbortSignal): Promise<CityResult | null> {
  const trovate = await searchCities(query, signal);
  return trovate[0] ?? null;
}

/** Dove si trova chi ha concesso la posizione. */
export async function reverseGeocode(
  point: LatLon,
  signal?: AbortSignal,
): Promise<ReverseGeocodeResult | null> {
  const url =
    `${REVERSE}?latitude=${point.lat}&longitude=${point.lon}` +
    `&localityLanguage=${lingua()}`;
  const res = await prendi(url, signal);
  if (!res) return null;

  try {
    const d = (await res.json()) as {
      city?: string;
      locality?: string;
      principalSubdivision?: string;
      countryName?: string;
      countryCode?: string;
      postcode?: string;
    };
    // `city` è vuoto fuori dai centri abitati; `locality` copre il resto.
    const nome = d.city || d.locality;
    if (!nome || !d.countryCode) return null;
    return {
      city: nome,
      countryCode: d.countryCode.toUpperCase(),
      country: d.countryName ?? d.countryCode,
      region: d.principalSubdivision || undefined,
      postcode: d.postcode || undefined,
    };
  } catch {
    return null;
  }
}
