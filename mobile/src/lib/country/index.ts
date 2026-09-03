/**
 * Global Country Resolver — single source of truth.
 *
 * `resolveCountry(input)` takes any of:
 *   - an ISO-3166-1 alpha-2 code ("IT", "gb")
 *   - a full country name in English or a common local form ("Italy", "Deutschland")
 *   - null / undefined  → returns null (no silent UK fallback)
 * and returns a fully-typed `CountryProfile`, or null if unknown.
 *
 * Every part of the app that needs country context (currency, locale, unit
 * system, retailers) MUST go through this resolver rather than reading its
 * own alias table. Do not add per-caller `?? "UK"` fallbacks — propagate
 * null up to the UI so it can ask the user to pick a country.
 */

import { COUNTRY_ROWS, NAME_TO_ALPHA2, type CountryRow } from "./data";
import { trackCountryResolved, trackUnknownCountry } from "@/lib/telemetry/global";

export interface CountryProfile {
  /** ISO-3166 alpha-2, uppercase. */
  code: string;
  /** English display name. */
  name: string;
  /** Primary BCP-47 language subtag. */
  language: string;
  /** Full BCP-47 locale. */
  locale: string;
  /** ISO-4217 currency code. */
  currency: string;
  /** Measurement system for weights/volumes/distances. */
  unitSystem: "metric" | "imperial";
  /**
   * Cooking-quantity convention derived from ISO locale:
   *  - "metric" — g / ml / kg / l  (most of the world)
   *  - "us"     — cups / oz / tsp / tbsp / °F  (US)
   *  - "imperial" — pints / oz, hybrid metric labels (UK-style)
   */
  cookingUnits: "metric" | "us" | "imperial";
  /** Primary IANA timezone. */
  timezone: string;
}

const BY_CODE = new Map<string, CountryRow>(
  COUNTRY_ROWS.map((r) => [r.code.toUpperCase(), r]),
);

const BY_NAME = new Map<string, CountryRow>();
for (const row of COUNTRY_ROWS) {
  BY_NAME.set(row.name.toLowerCase(), row);
}
for (const [alias, code] of Object.entries(NAME_TO_ALPHA2)) {
  const row = BY_CODE.get(code);
  if (row) BY_NAME.set(alias.toLowerCase(), row);
}

/** Countries whose cooking convention isn't captured by unitSystem alone. */
const COOKING_OVERRIDES: Record<string, CountryProfile["cookingUnits"]> = {
  US: "us",
  LR: "us", // Liberia
  MM: "us", // Myanmar uses mixed/US-adjacent for cooking
  GB: "imperial",
};

function deriveCookingUnits(row: CountryRow): CountryProfile["cookingUnits"] {
  return COOKING_OVERRIDES[row.code] ?? (row.unitSystem === "imperial" ? "imperial" : "metric");
}

function toProfile(row: CountryRow): CountryProfile {
  return { ...row, cookingUnits: deriveCookingUnits(row) };
}

/**
 * Resolve any country identifier into a full CountryProfile.
 * Returns null for unknown / empty inputs — never guesses.
 */
export function resolveCountry(input: string | null | undefined): CountryProfile | null {
  if (!input) {
    trackUnknownCountry({ input: input ?? "" });
    return null;
  }
  const raw = String(input).trim();
  if (!raw) {
    trackUnknownCountry({ input: raw });
    return null;
  }
  // Alpha-2 fast path
  if (raw.length === 2) {
    const row = BY_CODE.get(raw.toUpperCase());
    if (row) {
      const p = toProfile(row);
      trackCountryResolved({ input: raw, resolved: p.code, fallback: false });
      return p;
    }
  }
  const row = BY_NAME.get(raw.toLowerCase());
  if (row) {
    const p = toProfile(row);
    trackCountryResolved({ input: raw, resolved: p.code, fallback: false });
    return p;
  }
  trackUnknownCountry({ input: raw });
  return null;
}

/** Convert any country identifier to an ISO-3166 α-2 uppercase code, or null. */
export function toIsoAlpha2(input: string | null | undefined): string | null {
  const p = resolveCountry(input);
  return p?.code ?? null;
}

/** All resolvable countries, sorted by name. Handy for UI selectors. */
export function listCountries(): CountryProfile[] {
  return [...COUNTRY_ROWS]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(toProfile);
}

/**
 * Format money using the country's locale + currency. Never assumes a symbol
 * — `Intl.NumberFormat` picks the correct one (£, €, $, ¥, ₹, kr, …).
 *
 * `locale` may be overridden by the app's active UI language.
 */
export function formatMoney(
  amount: number,
  currency: string,
  locale?: string,
): string {
  try {
    return new Intl.NumberFormat(locale || undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Unknown currency code — degrade gracefully with the raw code prefix.
    return `${currency} ${amount.toFixed(2)}`;
  }
}
