# MealMint — Global Foundation Sprint (Phase 1)

Scope: **architecture only**. No UI changes, no new features, no changes to AI/pricing/savings/recipe engines' behavior. This refactor is invasive (25+ files touch currency, country, retailers, resolution) so I want to confirm the shape before I start moving code.

## Deliverables

### 1. Kill the `Currency` union
Replace `type Currency = "EUR"|"GBP"|"USD"|"AED"` with `type CurrencyCode = string` (ISO-4217).
- Touched: `src/lib/price-data/types.ts`, `src/lib/models/index.ts`, all consumers.
- Introduce one formatter helper `formatMoney(amount, currency, locale)` wrapping `Intl.NumberFormat`.
- Remove all `CURRENCY_SYM` / `£` / `€` / `$` / `AED` string literals from `.ts`/`.tsx`; symbols come from `Intl` only. Translations that already interpolate a currency stay as-is (they receive formatted strings from callers).

### 2. Global Country Resolver
New module `src/lib/country/index.ts` with:
```
resolveCountry(codeOrName: string | null): CountryProfile | null
type CountryProfile = {
  code: string          // ISO-3166 α-2
  name: string
  language: string      // BCP-47 primary (e.g. "it")
  locale: string        // BCP-47 (e.g. "it-IT")
  currency: string      // ISO-4217
  unitSystem: "metric"|"imperial"
  timezone: string      // IANA (best-guess primary)
}
```
- Data-driven from a bundled JSON dataset covering all ISO-3166 countries (single file, ~15KB). No cherry-picked "supported" list — every country resolves.
- Deletes the duplicated tables in `price-data/sources/manual` (`COUNTRY_BY_NAME`, `COUNTRY_REGION`, `COUNTRIES`) — those become thin re-exports backed by the resolver.
- Removes the hardcoded `COUNTRY_TO_PROFILE` in the meal engine / plan functions.

### 3. Remove silent UK/GBP/English defaults
- Every `?? "UK"`, `?? "GBP"`, `?? "London"` and `resolveCountrySpec` UK fallback becomes `null`.
- Callers that previously received a fallback now propagate `null` up to the UI boundary. The UI layer already prompts for a city — we extend that same prompt to also collect country when resolver returns `null`. **No new UI component**, just wiring through the existing onboarding path.
- Loader/SSR paths that need a country for prerender receive `null` and skip country-dependent work rather than defaulting.

### 4. Retailer Registry foundation
New directory `src/lib/retailers/registry/` with per-country JSON:
```
registry/
  _default.json          # global fallbacks (Amazon marketplaces where present)
  GB.json  IT.json  FR.json  DE.json  ES.json  US.json  AE.json
  JP.json  BR.json  ...   # seeded with what currently exists in code
```
Schema (data only, no logic):
```json
{
  "country": "IT",
  "retailers":  [{ "id":"esselunga", "name":"Esselunga", "kind":"grocery", "domains":["esselunga.it"], "coverage":{"cities":["milan","rome"]} }],
  "delivery":   [{ "id":"deliveroo-it", "provider":"deliveroo", "coverage":{"cities":["milan","rome"]}, "eta":"30-45m" }],
  "marketplaces":[{ "id":"amazon-it", "domain":"amazon.it", "fresh":{"cities":["milan","rome"],"eta":"same day"}, "marketplaceEta":"next day" }]
}
```
New service `src/lib/retailers/registry.ts` with:
- `loadRegistry(country)` — pure data access, memoised.
- `retailersFor(country, city?)`, `deliveryFor(country, city?)`, `marketplaceFor(country, city?)` — no `if (country === "…")` anywhere.
Migration of existing data:
- `AMAZON_FRESH_METROS`, `AMAZON_ETA`, `REMOTE_TOURIST_EXCLUDES` from `shopping-links/retailers.ts` move to the JSON files.
- `shopping-links/retailers.ts`, `buy-online/index.ts`, `product-search/retailer-match.ts`, `location/delivery-availability.ts` all switch from module-level maps to registry calls.

### 5. Replace country-specific branches
Grep target: `country === "…"`, `country.toLowerCase() === …`, `country == "UK"`, etc. Each site rewrites to `resolveCountry()` / `RetailerRegistry`. If a site cannot be re-expressed as data (rare), it's marked in the audit as "remaining hardcoded assumption" rather than left silently.

### 6. Telemetry
New module `src/lib/telemetry/global.ts` exposing a single event sink:
```
trackCountryResolved({ input, resolved, fallback })
trackProviderCoverage({ country, city, retailers, delivery, marketplaces })
trackUnknownCountry({ input })
trackFallbackUsage({ where, from, to })
```
Backend is a no-op console sink for now (`console.info("[telemetry]", …)`) — the tracked payload shape is the deliverable, not the transport. Call sites: resolver, registry, retailer selection, results compute.

## Explicitly out of scope (Phase 2)
Unit conversion, new providers, new countries, new APIs, wider i18n split, translations refactor, UI redesign for the new country picker (reuses existing city selector), currency-per-user setting, region tables beyond what resolver derives.

## Success criteria (I'll report these at end)
- Files changed list
- Country-specific code removed (grep counts before/after for `"UK"`, `"GBP"`, `Currency` union, `country ===`)
- Remaining hardcoded assumptions
- Global-readiness score before → after
- Estimated effort for Phase 2

## Risk
This touches the type surface of pricing (`Currency` → `string`) which ripples into every price-consuming component. TypeScript will flag them and I'll fix all sites in the same pass — no runtime behavior change expected because the underlying values are already ISO-4217 strings.

Approve and I'll execute the whole sprint end-to-end.
