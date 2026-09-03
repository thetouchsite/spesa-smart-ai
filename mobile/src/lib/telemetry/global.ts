/**
 * Global-first telemetry sink.
 *
 * Records the signals we need to understand which countries are being used,
 * where resolvers/registries fall back, and where coverage is thin. The
 * transport is a no-op console sink for now — replace `emit()` with a real
 * raccolta eventi in un secondo momento, senza toccare i punti di chiamata.
 *
 * All functions are safe to call from any runtime (SSR, edge, browser).
 * They never throw.
 */

export interface CountryResolvedEvent {
  input: string;
  resolved: string;      // ISO α-2
  fallback: boolean;     // true if a defaulting rule kicked in
}

export interface UnknownCountryEvent {
  input: string;
}

export interface ProviderCoverageEvent {
  country: string;
  city?: string | null;
  retailers: number;
  delivery: number;
  marketplaces: number;
}

export interface FallbackUsageEvent {
  where: string;          // e.g. "price-engine.city-tier"
  from: string;           // requested key
  to: string;             // what we actually used
}

type AnyEvent =
  | { kind: "country_resolved" } & CountryResolvedEvent
  | { kind: "unknown_country" } & UnknownCountryEvent
  | { kind: "provider_coverage" } & ProviderCoverageEvent
  | { kind: "fallback_usage" } & FallbackUsageEvent;

function emit(evt: AnyEvent): void {
  try {
    // eslint-disable-next-line no-console
    console.info("[telemetry:global]", evt);
  } catch {
    // Never let telemetry break the app.
  }
}

export function trackCountryResolved(e: CountryResolvedEvent): void {
  emit({ kind: "country_resolved", ...e });
}
export function trackUnknownCountry(e: UnknownCountryEvent): void {
  emit({ kind: "unknown_country", ...e });
}
export function trackProviderCoverage(e: ProviderCoverageEvent): void {
  emit({ kind: "provider_coverage", ...e });
}
export function trackFallbackUsage(e: FallbackUsageEvent): void {
  emit({ kind: "fallback_usage", ...e });
}
