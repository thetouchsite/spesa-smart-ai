/**
 * LocaleResolver — thin, resolver-only facade over CountryResolver.
 *
 * Business logic must never inspect a country code directly. Instead it
 * asks the LocaleResolver for the specific facet it needs (currency
 * formatter, unit system, cooking convention, language …). Adding a new
 * country becomes a pure data change in `src/lib/country/data.ts`.
 *
 * There is intentionally no per-caller "if country === X" branching in
 * this module — every decision derives from the CountryProfile returned
 * by the resolver.
 */

import { resolveCountry, formatMoney, type CountryProfile } from "@/lib/country";

export interface LocaleContext {
  country: CountryProfile | null;
  /** Effective BCP-47 locale (UI language ↦ profile.language override). */
  locale: string;
  currency: string | null;
  unitSystem: "metric" | "imperial" | null;
  cookingUnits: "metric" | "us" | "imperial" | null;
}

/**
 * Resolve a full LocaleContext from a country identifier and optional
 * UI language. If country is unknown, currency/unit facets are null so
 * callers must handle the missing-country UI path — never silently
 * default to GBP/USD/metric.
 */
export function resolveLocale(
  country: string | null | undefined,
  uiLanguage?: string | null,
): LocaleContext {
  const profile = resolveCountry(country ?? null);
  const locale =
    uiLanguage && profile
      ? `${uiLanguage}-${profile.code}`
      : (uiLanguage || profile?.locale || "en");
  return {
    country: profile,
    locale,
    currency: profile?.currency ?? null,
    unitSystem: profile?.unitSystem ?? null,
    cookingUnits: profile?.cookingUnits ?? null,
  };
}

/**
 * Bind a currency formatter to a locale context. Uses Intl.NumberFormat
 * exclusively — no symbol tables, no custom formatting anywhere.
 *
 *   const money = currencyFormatter(ctx);
 *   money(12.5);      // "£12.50" / "€12,50" / "$12.50" / "¥13"
 *   money(0, { fractionDigits: 0 })
 */
export function currencyFormatter(
  ctx: Pick<LocaleContext, "locale" | "currency"> | { locale?: string; currency?: string | null },
): (amount: number, opts?: { fractionDigits?: number }) => string {
  const locale = ctx.locale || undefined;
  const currency = ctx.currency ?? null;
  return (amount, opts) => {
    if (!currency) {
      // No currency resolved — fall back to a plain, locale-aware number.
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: opts?.fractionDigits ?? 2,
        maximumFractionDigits: opts?.fractionDigits ?? 2,
      }).format(amount);
    }
    return formatMoney(amount, currency, locale ?? undefined);
  };
}

/** Convenience: single-shot currency format via the resolver. */
export function formatCurrency(
  amount: number,
  country: string | null | undefined,
  uiLanguage?: string | null,
): string {
  const ctx = resolveLocale(country, uiLanguage);
  return currencyFormatter(ctx)(amount);
}
