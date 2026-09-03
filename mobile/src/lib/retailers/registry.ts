/**
 * Retailer Registry — country-scoped, data-driven retailer metadata.
 *
 * Retailer availability, delivery ETAs, Amazon Fresh coverage and quick-
 * commerce coverage MUST live in JSON files under `./data/*.json`, one per
 * ISO α-2 country code, plus `_default.json` for global fallbacks. Adding
 * a country is a data change — never a code change. No `if (country === …)`
 * branches allowed in callers; ask the registry instead.
 *
 * Consumers (buy-online, shopping-links, delivery-availability) look up
 * capabilities via `retailersFor` / `deliveryFor` / `marketplaceFor` /
 * `isCityExcluded` / `amazonFreshEta`. The functions return typed results
 * ready to render.
 */

import type { RetailerRegistry, RetailerEntry, DeliveryEntry, MarketplaceEntry } from "./types";
import { resolveCountry } from "@/lib/country";
import { trackProviderCoverage, trackFallbackUsage } from "@/lib/telemetry/global";

// Bundled JSON — Vite inlines these at build so the registry works in SSR/edge.
import defaultRegistry from "./data/_default.json";
import gbRegistry from "./data/GB.json";
import itRegistry from "./data/IT.json";
import frRegistry from "./data/FR.json";
import deRegistry from "./data/DE.json";
import esRegistry from "./data/ES.json";
import usRegistry from "./data/US.json";
import aeRegistry from "./data/AE.json";
import jpRegistry from "./data/JP.json";
import brRegistry from "./data/BR.json";

const REGISTRIES: Record<string, RetailerRegistry> = {
  GB: gbRegistry as RetailerRegistry,
  IT: itRegistry as RetailerRegistry,
  FR: frRegistry as RetailerRegistry,
  DE: deRegistry as RetailerRegistry,
  ES: esRegistry as RetailerRegistry,
  US: usRegistry as RetailerRegistry,
  AE: aeRegistry as RetailerRegistry,
  JP: jpRegistry as RetailerRegistry,
  BR: brRegistry as RetailerRegistry,
};

const DEFAULT_REGISTRY = defaultRegistry as RetailerRegistry;

/** Load the registry for a country, or the global default. `country` may be
 *  any resolvable identifier (α-2, name); null returns the default set. */
export function loadRegistry(country: string | null | undefined): RetailerRegistry {
  const profile = country ? resolveCountry(country) : null;
  if (!profile) {
    trackFallbackUsage({ where: "retailer-registry", from: String(country ?? ""), to: "_default" });
    return DEFAULT_REGISTRY;
  }
  const hit = REGISTRIES[profile.code];
  if (!hit) {
    trackFallbackUsage({ where: "retailer-registry", from: profile.code, to: "_default" });
    return DEFAULT_REGISTRY;
  }
  return hit;
}

function cityMatches(coverage: string[] | undefined, city: string | null | undefined): boolean {
  if (!coverage || coverage.length === 0) return true; // no restriction = nationwide
  if (!city) return false;
  const c = city.trim().toLowerCase();
  return coverage.some((x) => x.toLowerCase() === c);
}

export function retailersFor(
  country: string | null | undefined,
  city?: string | null,
): RetailerEntry[] {
  const reg = loadRegistry(country);
  const list = reg.retailers.filter((r) => {
    if (r.excludeCities && city && r.excludeCities.some((x) => x.toLowerCase() === city.trim().toLowerCase())) {
      return false;
    }
    return cityMatches(r.coverage?.cities, city);
  });
  trackProviderCoverage({
    country: reg.country,
    city,
    retailers: list.length,
    delivery: reg.delivery.length,
    marketplaces: reg.marketplaces.length,
  });
  return list;
}

export function deliveryFor(
  country: string | null | undefined,
  city?: string | null,
): DeliveryEntry[] {
  const reg = loadRegistry(country);
  return reg.delivery.filter((d) => cityMatches(d.coverage?.cities, city));
}

export function marketplaceFor(
  country: string | null | undefined,
): MarketplaceEntry[] {
  return loadRegistry(country).marketplaces;
}

/** True when quick-commerce / fresh delivery should NOT be shown for this city
 *  (small islands, remote tourist zones, etc.). Data lives in each country JSON. */
export function isCityExcluded(country: string | null | undefined, city?: string | null): boolean {
  if (!city) return false;
  const reg = loadRegistry(country);
  const c = city.trim().toLowerCase();
  return (reg.remoteExcludes ?? []).some((x) => x.toLowerCase() === c);
}

/** Amazon Fresh ETA for a city, or null if no fresh coverage there. */
export function amazonFreshEta(country: string | null | undefined, city?: string | null): string | null {
  const reg = loadRegistry(country);
  const mkt = reg.marketplaces.find((m) => m.fresh);
  if (!mkt?.fresh) return null;
  const c = (city ?? "").trim().toLowerCase();
  const covered = (mkt.fresh.cities ?? []).some((x) => x.toLowerCase() === c);
  return covered ? mkt.fresh.eta : null;
}

/** Nationwide marketplace ETA (e.g. "Next day" for Amazon). */
export function marketplaceEta(country: string | null | undefined): string | null {
  const reg = loadRegistry(country);
  return reg.marketplaces[0]?.marketplaceEta ?? null;
}

export type { RetailerRegistry, RetailerEntry, DeliveryEntry, MarketplaceEntry } from "./types";
