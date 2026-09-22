# MealMint — MASTER BRIEF
## Product · Market · Technical · Legal/Compliance · Pricing · Go-to-Market

**Version:** 1.1  
**Date:** 22 September 2026  
**Status:** MAIN SOURCE OF TRUTH FOR CLAUDE CODE — updated after Phase 1 delta, compliance review and infrastructure discussion

---

# 0. HOW CLAUDE MUST USE THIS DOCUMENT

This is the definitive working brief for MealMint.

It consolidates:

- the original product roadmap;
- the real repository/database technical audit;
- the updated product strategy;
- current competitor research;
- pricing benchmarks;
- commercialization strategy;
- operational legal/compliance rules;
- technical priorities;
- validation and kill/continue criteria.

If this document conflicts with older project files, use this precedence:

1. **`MEALMINT_MASTER_BRIEF.md`** — current operational source of truth
2. **`MEALMINT_TECHNICAL_AUDIT.md`** — technical evidence measured against the repository/database
3. **`MEALMINT_PRODUCT_AUDIT_AND_ROADMAP.md`** — original strategic background

Do not silently restore assumptions that the technical audit has already disproved.

Before any major implementation:

1. inspect the current repository;
2. verify that the relevant facts in this document still match the code/database;
3. propose the smallest compatible implementation;
4. preserve current working behavior;
5. avoid unnecessary architectural rewrites.

---

# 1. EXECUTIVE DECISION

## Should MealMint be continued?

**YES.**

Current evidence is strong enough to justify further development and an early commercial beta.

MealMint is no longer an idea that needs to be built before validation.

It already has:

- meaningful international coverage;
- a functioning acquisition pipeline;
- an existing API;
- API authentication and quotas;
- a large observed-price corpus;
- direct product purchase URLs;
- timestamps and freshness;
- a technically cheap acquisition model;
- a clear B2B developer use case;
- several existing companies proving that grocery-price APIs are a real commercial category.

## What should NOT happen?

Do not spend another six months building blindly before attempting to commercialize it.

The correct strategy is:

> improve irreversible data quality now + make the API production-ready + expose a public beta + measure willingness to pay.

---

# 2. PRODUCT VISION

MealMint should evolve from:

> a large collection of supermarket product pages and observed prices

into:

> a normalized grocery data infrastructure layer that developers, startups, AI agents and businesses can access through one API.

Long-term evolution:

```text
large acquisition engine
        ↓
grocery data API
        ↓
normalized grocery data platform
        ↓
historical + product intelligence infrastructure
```

The goal is not to become:

> “the company with the most scraped URLs.”

The goal is to become:

> **a broad, normalized and auditable grocery data layer.**

---

# 3. CURRENT MEASURED STATE

Figures measured on 22 September 2026.

## Scale

Approximately:

- **4,640,560 known product page URLs**
- **~1.65M observed prices**
- **~35% price coverage over known URLs**
- **251 retailers listed**
- **234 live retailers**
- **49 countries with catalogue coverage**
- **43 countries with observed prices**

Important:

- these are not 1.65M unique canonical products;
- one retailer page currently represents one offer;
- the same physical product sold by two retailers is usually two independent records.

---

# 4. CURRENT DATA QUALITY

Measured basic-layer quality is already strong.

Approximate measured values:

- **99.3%** of stored rows contain a price greater than zero;
- **99.4%** of product links successfully open;
- every observation carries a timestamp;
- a price is treated as fresh for approximately 72 hours;
- roughly 90% of stored prices are inside that 72-hour window.

Current product-level fields include:

- product/page name;
- observed price;
- currency;
- retailer;
- country;
- direct retailer product URL;
- exact observation timestamp;
- read/verification status.

Derived today on part of the corpus:

- quantity/package format;
- price per kg;
- price per litre.

Current package/quantity extraction succeeds on roughly 30% of rows.

---

# 5. CRITICAL TECHNICAL DISCOVERY: ENRICHMENT IS ALREADY AVAILABLE

The repository audit inspected twelve live retailer pages across eight countries.

Observed in the sample:

| Field | Presence |
|---|---:|
| JSON-LD | 12/12 |
| brand | 12/12 |
| image | 12/12 |
| retailer SKU | 12/12 |
| availability | 11/12 |
| breadcrumb | 9/12 |
| normalized/raw category | 7/12 |
| GTIN | 3/12 |
| list/original price | 2/12 |

The current `porzioneConPrezzi()` flow already retains the relevant HTML/JSON-LD in memory.

Therefore:

> brand, image and retailer SKU are primarily parsing/persistence problems, not new scraping projects.

Raw category and availability are also commonly available without an additional page request.

---

# 6. ENRICHMENT IS TIME-SENSITIVE

Pages are re-read automatically.

If enrichment extraction is added now:

> the normal read cycle progressively enriches the corpus without an extra acquisition campaign.

If enrichment is postponed:

> millions of pages may need to be revisited specifically for backfill.

Therefore simple enrichment must happen during the current refresh cycle.

This has the same strategic urgency as starting price history.

---

# 7. ANOTHER LARGE COVERAGE OPPORTUNITY

The audit identified roughly:

- **42 retailers**
- **~1.28M known product pages**
- **~600k real grocery products**

where pages are live but price is not directly readable in the static HTML because the retailer frontend obtains the price from an internal/frontend API.

Four dedicated readers already exist.

Approximately 38 remain.

Some retailer frontend APIs can also expose useful identifiers such as EAN.

This is potentially one of the cheapest large coverage gains available.

However:

> technical accessibility is not sufficient by itself.

Every new internal/frontend API integration must pass the compliance rules later in this document.

---

# 8. MAIN COMPETITIVE ADVANTAGE TODAY

## Breadth

MealMint's strongest current asset is international breadth.

The current dataset spans many more retailers and countries than several specialist competitors.

This does NOT mean MealMint is currently a better product.

Competitors may be stronger on:

- normalized product identity;
- GTIN;
- categories;
- stock;
- package size;
- historical data;
- canonical matching;
- production documentation;
- uptime;
- billing;
- customer-facing developer experience.

MealMint should therefore preserve:

## BREADTH

while rapidly building:

## DEPTH

The moat we want is:

> **broad international coverage + normalized product intelligence + historical observations.**

---

# 9. MARKET THESIS

The market is not primarily defined by Google search volume for keywords such as:

```text
grocery price API
supermarket API
supermarket price API
```

This is a B2B infrastructure market.

The customer does not need to be one of millions of consumers.

The customer needs to be a developer/company for whom:

> maintaining retailer-specific acquisition logic is more expensive and distracting than paying MealMint.

Core problem solved:

> “I need supermarket products and prices in my application, but I do not want to discover, parse, normalize and maintain dozens of separate retailers.”

---

# 10. WHO CAN BUY MEALMINT

Initial target segments:

## Tier 1 — strongest fit

- software developers;
- startups;
- food-tech companies;
- price-comparison applications;
- shopping-list applications;
- meal-planning applications;
- nutrition applications;
- AI shopping agents;
- LLM applications;
- software houses building for third parties.

## Tier 2 — later

- cashback services;
- loyalty services;
- affiliate applications;
- purchasing/procurement tools;
- BI/data teams;
- market researchers.

## Tier 3 — after product matching/history mature

- FMCG brands;
- manufacturers;
- distributors;
- retail intelligence teams;
- competitor-price monitoring;
- economic/research datasets.

---

# 11. COMPETITOR LANDSCAPE — CURRENT PUBLIC BENCHMARKS

Research date: 22 September 2026.

Competitor pages change frequently. Treat these as market benchmarks, not immutable facts.

---

## 11.1 Pepesto

Positioning:

> one grocery API across multiple European supermarkets and countries.

Current public pricing page advertises:

- Starter: **€29.90/month**
- Growth: **€79/month**, six-month commitment
- Partner: custom
- endpoint-based credit pricing
- all supported supermarkets/countries available under one key
- MCP support
- `/catalog` available on Growth/Partner

Example current request prices shown publicly:

- `/products`: €0.04 Starter / €0.02 Growth
- `/search`: €0.12 / €0.06
- `/oneshot`: €0.32 / €0.16
- `/session`: €1.20 / €0.60
- `/catalog`: €4.95 on Growth

Current public coverage messaging:

- 28 supermarkets
- 13 countries

Important legal/commercial pattern:

- commercial apps built on the API are explicitly permitted;
- customers may show product data/prices;
- processed/derived data may be used inside broader services;
- raw API resale is restricted;
- separate Partner agreements apply to some redistribution cases;
- Pepesto states that the underlying information comes from publicly accessible retailer information and that it does not obtain separate retailer-specific database-right licences for the customer's downstream use.

**Lesson for MealMint:** excellent benchmark for developer positioning, pricing mechanics, MCP and Terms structure.

Sources:

- https://www.pepesto.com/pricing/
- https://www.pepesto.com/api-terms/
- https://www.pepesto.com/supermarkets/

---

## 11.2 MealCP

Positioning:

> European grocery price, catalogue, history and inventory API.

Public documentation exposes:

- search;
- complete product listing;
- product detail;
- price history;
- raw historical observations;
- stores;
- taxonomy;
- coverage;
- MCP/AI-oriented workflows.

Important:

`GET /v1/products` is explicitly documented for:

- full catalogue exports;
- nightly synchronization jobs;
- category sweeps.

Historical price APIs expose:

- first/last price;
- min/max;
- average;
- price change;
- raw observations.

Current beta documentation includes free API credits/rate limits.

**Lesson for MealMint:** benchmark for normalized response structure, history endpoints, coverage endpoint and developer documentation.

Sources:

- https://mealcp.com/
- https://mealcp.com/api/products/
- https://mealcp.com/api/prices/
- https://mealcp.com/getting-started/credits-and-limits/
- https://mealcp.com/integrations/rest/

---

## 11.3 Prisy

Italian price-intelligence company.

Publicly claims:

- **6M+ price observations**
- **170k+ products**
- **50+ chains**
- REST API
- historical data
- product matching
- exports
- supermarket price index

Current public pricing:

### Starter
**€99/month**

### Business
**€199/month**

### Enterprise
**from €600/month**

Prisy positions itself as:

> structured data, API-first, dashboard second.

Public information says its Supermarket Price Index uses official flyers and marketplaces, while its wider platform also covers other e-commerce/marketplace sources.

**Lesson for MealMint:** strong proof that Italian companies pay for structured pricing/intelligence and that €100–€600+ monthly B2B pricing is plausible once the dataset has deeper intelligence.

Sources:

- https://prisy.ai/
- https://prisy.ai/chi-siamo
- https://prisy.ai/privacy

---

## 11.4 BasketWatch Ireland

Focuses on Irish grocery retailers.

Public API pricing:

> **€0.001 per returned record**

Credit packs start at:

- €49.99
- €99.99
- €199.99
- €499.99
- €999.99

Credits do not expire.

Public product includes:

- current catalogue;
- prices;
- unit price;
- promotions;
- barcode;
- history;
- JSON API;
- CSV/historical exports;
- custom access.

Very important benchmark:

> BasketWatch openly monetizes grocery records themselves instead of only selling a SaaS dashboard.

It also has a source/rights policy:

> when terms, technical measures or rights-holder requests restrict collection, it may limit, pause or remove affected data.

**Lesson for MealMint:** pay-per-record is a viable pricing model and a useful benchmark for source-compliance operations.

Sources:

- https://basketwatchireland.com/
- https://basketwatchireland.com/pricing

---

## 11.5 WhichGrocer

Its API terms are an especially useful commercial/legal benchmark.

Public API terms allow:

- use inside customers' own applications;
- paid consumer products;
- display of identifiers, names, sizes, prices, promotion flags, retailers, URLs, timestamps and similar fields.

They prohibit:

- reselling raw API access;
- building a competing grocery-data API from the output;
- certain unauthorized downstream uses.

WhichGrocer explicitly says:

> it compiles data from publicly available retailer information plus its own matching, normalization and statistics.

It also says that if a retailer withdraws/challenges a feed, customer rights to retain/display that affected data may cease accordingly.

**Lesson for MealMint:** strong template for downstream licence restrictions, retailer-feed withdrawal and API customer Terms.

Source:

- https://www.whichgrocer.com/developers/terms

---

## 11.6 LoyaltyHub South Africa

Developer API publicly states that prices are:

> collected from public retailer sites.

Current pricing:

### Free
100 calls/month

### Starter
R199/month  
50,000 calls/month

### Business
R499/month  
500,000 calls/month

Features include:

- retailer filter;
- barcode;
- categories;
- grouped products;
- price history;
- timestamps;
- pagination;
- stock where available.

**Lesson for MealMint:** another direct precedent for collecting public retailer prices and monetizing them through an API.

Source:

- https://loyaltyhub.co.za/developers

---

## 11.7 OpenPriceEngine

Broader price-data provider covering grocery and other categories.

Public marketing currently claims:

- 2M+ tracked items;
- broad international coverage;
- historical data;
- developer REST API;
- MCP;
- daily new price points.

Current public premium offer:

> **$140 one-off for 12 months**

with broad data access.

**Lesson for MealMint:** confirms AI/MCP + historical-price data as a commercial direction, though its model is broader than grocery.

Sources:

- https://openpricengine.com/
- https://openpricengine.com/premium-plan/

---

# 12. COMPETITIVE CONCLUSION

The category clearly exists.

MealMint is NOT inventing an unprecedented business model.

There are multiple companies publicly selling:

```text
retailer data
        ↓
normalization
        ↓
API
        ↓
developer/business customers
```

The key question is therefore NOT:

> “Can grocery-price APIs exist?”

They clearly do.

The key questions are:

1. Can MealMint reach enough data quality?
2. Can it maintain breadth reliably?
3. Can it produce a developer experience better or broader than competitors?
4. Can it manage retailer-source compliance responsibly?
5. Will developers actually pay for MealMint rather than existing alternatives?

---

# 13. POSITIONING

Initial recommended commercial category:

# Grocery Data API

Alternative keyword/category:

# Grocery Price API

Suggested positioning:

> **Grocery prices. Hundreds of retailers. One API.**

Supporting line:

> Access recently observed supermarket prices, normalized product data and direct retailer links across dozens of markets.

Never claim:

> real-time

unless the actual acquisition latency later supports that claim.

Prefer:

- recently observed;
- latest observed;
- last updated at;
- observed at.

---

# 14. PUBLIC METRICS

Use rounded, dynamically updated metrics.

Example:

```text
1.6M+ observed prices
230+ retailers
40+ countries
```

Avoid hard-coding overly precise counts into marketing pages.

The corpus changes continuously.

---

# 15. PRODUCT TO SELL FIRST

## Developer Grocery API

Initial core functionality:

- product search;
- country filtering;
- retailer filtering;
- current/latest observed price;
- retailer/product URL;
- timestamps;
- product/offer metadata;
- shopping-list comparison where reliable.

Later:

- canonical product offers;
- historical prices;
- promotion history;
- GTIN lookup where coverage exists;
- category filters;
- MCP.

---

# 16. DO NOT SELL THESE CLAIMS YET

Do not position MealMint today as:

- perfect real-time price feed;
- complete enterprise price-intelligence system;
- guaranteed physical store inventory;
- universal GTIN database;
- fully canonical global grocery graph;
- complete per-store local price coverage.

These can become future products only when the underlying evidence supports them.

---

# 17. PRICE HISTORY — FINAL TECHNICAL DESIGN

Old recommendation:

> append a row for every refresh.

Rejected after repository audit.

Reason:

at the current read rate it could grow toward tens of GB/year while storing large numbers of identical consecutive prices.

## Correct design

Keep:

### `prezzi`
current/latest state.

Add:

### `osservazioni`
historical change events.

Write a new history row when any meaningful state changes:

- price;
- list/original price;
- discount/promotion state;
- currency.

Example:

```json
{
  "o": "offer_id",
  "p": 4.99,
  "l": 5.49,
  "v": "EUR",
  "t": "2026-09-22T12:00:00Z",
  "u": "2026-09-27T04:11:00Z"
}
```

Where:

- `t` = first seen;
- `u` = last seen.

If the next read has the same state:

> update `u`.

If the state changes:

> close the previous interval and append a new row.

Expected order of magnitude from the technical audit:

> roughly 2–4 GB/year instead of ~32 GB/year.

---

# 18. CRITICAL DATABASE ISSUE

Current MongoDB footprint is approximately:

> 410 MB / 512 MB free tier.

The current database also has a **30-day TTL index** on the current `prezzi.t` field.

Therefore:

## Rule

Historical data MUST use a separate collection with no 30-day TTL.

Do not accidentally apply the current `prezzi` TTL to history.

## Immediate business decision

Move the production data storage off the current free-tier constraint before history accumulation begins.

---

# 19. IMMEDIATE ENRICHMENT FIELDS

Persist during the existing page read:

- original/list price;
- saving;
- discount percentage;
- promotion expiry where available;
- brand;
- image URL;
- retailer SKU;
- availability;
- raw retailer category/breadcrumb;
- richer page-declared product name.

Do not wait for canonical normalization.

First preserve the raw information.

---

# 20. BRAND

Technical audit result:

> brand was available in JSON-LD on 12/12 sampled retailers.

Therefore initial approach:

1. structured metadata / JSON-LD;
2. measure actual corpus coverage;
3. add fallback dictionary/rules only if justified by real miss rate.

Do NOT build an LLM brand-extraction pipeline before measuring the structured-data coverage.

Store provenance:

```json
{
  "brand": "Ferrero",
  "brand_source": "jsonld"
}
```

Optional confidence may be added where needed.

---

# 21. RETAILER SKU

This field is strategically important.

Retailer SKU:

- is not a global GTIN;
- does not match products across chains;
- can be stable inside one retailer;
- may survive URL changes.

Today offer identity is strongly URL-based.

SKU can later help protect history from retailer URL churn.

Store:

```text
retailer_sku
retailer_id
source_url
```

---

# 22. GTIN / EAN

Do NOT overstate GTIN coverage.

Technical evidence suggests realistic near-term coverage may be approximately:

> 15–25%

rather than universal.

Potential sources:

1. JSON-LD;
2. validated number in URL;
3. retailer frontend/internal API;
4. structured page metadata.

Validate checksums.

Never classify an arbitrary 8/12/13/14 digit token as GTIN without validation.

Store:

```json
{
  "gtin": "...",
  "gtin_type": "GTIN13",
  "gtin_source": "jsonld",
  "gtin_validated": true
}
```

GTIN is valuable mainly as:

> a high-confidence seed for canonical product matching.

Do not initially market MealMint as a universal GTIN lookup service.

---

# 23. PACKAGE NORMALIZATION

Current success is roughly 30%.

A major opportunity is persisting the richer page name rather than relying only on sitemap-derived names.

Support:

### Weight
- g
- kg
- gr

### Volume
- ml
- cl
- l
- lt

### Multipack
- `6 x 33 cl`
- `10x330ml`
- `2 x 1.5 L`

### Count
- pieces
- capsules
- rolls
- bags
- units

Canonical structure example:

```json
{
  "package": {
    "count": 6,
    "unit_size": 330,
    "unit": "ml",
    "total_quantity": 1980,
    "normalized_unit": "l"
  }
}
```

Derived:

- price per kg;
- price per litre;
- price per unit.

---

# 24. CATEGORY NORMALIZATION

Two layers must remain separate.

## Source category

Preserve retailer data exactly:

```text
retailer_category
retailer_breadcrumb
```

## MealMint canonical taxonomy

Map retailer-specific categories into a common multilingual taxonomy.

Example:

```text
Food
  > Beverages
    > Soft Drinks
      > Cola
```

Canonical taxonomy is MEDIUM/HIGH complexity and should be introduced market by market.

Start with the highest-value countries.

---

# 25. CANONICAL PRODUCT MATCHING

This is likely the largest long-term value multiplier.

Today:

```text
Carrefour:
Coca Cola Zero 1 L

Bennet:
COCA COLA ZERO LT 1
```

are separate.

Future:

```text
canonical_product_id = mm_prod_x
```

and:

```text
canonical product
├── Carrefour offer
├── Bennet offer
├── Coop offer
└── Conad offer
```

## Matching order

### Level A — deterministic

Validated GTIN match.

### Level B — strong

Same:

- brand;
- normalized title;
- package;
- compatible category;
- country.

### Level C — candidate only

Semantic/token similarity without strong identifiers.

Never auto-merge uncertain Level C matches.

## Principle

> false positive product merges are worse than leaving duplicates unmatched.

Matching should initially be **country-local**.

Cross-country canonicalization can come later.

---

# 26. AVAILABILITY / STOCK

Structured data frequently exposes availability.

But:

> national-webshop `InStock` is not necessarily physical-store availability.

Therefore:

- extract it;
- preserve its source;
- do not make strong commercial guarantees from it;
- expose `UNKNOWN` where confidence is poor.

Example:

```json
{
  "availability": "IN_STOCK",
  "availability_source": "jsonld"
}
```

---

# 27. IMAGES AND DESCRIPTIONS

Technically images are often easy to obtain.

Commercial/legal strategy:

## Images

Prefer initially:

- storing the source image URL;
- using it internally for product matching/UI if appropriate.

Do not make image redistribution a core API promise until source-rights policy is settled.

## Descriptions

Low strategic priority.

Long retailer marketing descriptions can carry more copyright risk than factual product fields.

Do not prioritize redistributing them.

---

# 28. INTERNAL/FRONTEND RETAILER APIs

Some retailers load price via API calls from their public frontend.

These sources can be extremely valuable.

However every integration requires source review.

Do not:

- bypass authentication;
- steal private credentials;
- defeat CAPTCHA;
- defeat technical access controls;
- rotate proxies merely to evade blocking;
- circumvent access restrictions.

An endpoint used by a public browser frontend is not automatically prohibited, but it is not automatically authorized for commercial reuse either.

Classify such integrations as at least YELLOW until reviewed.

---

# 29. LEGAL / COMPLIANCE FRAMEWORK

## Important

This section is an operational risk-management framework for the product.

It is not a guarantee that any specific retailer use is legally risk-free.

The commercial API model itself is clearly used by existing companies.

The principal risk is source-specific:

> whether MealMint may systematically acquire and commercially re-use the relevant data from each retailer/source.

---

# 30. RELEVANT LEGAL CONCEPTS

## EU / Italy database rights

Italian Copyright Law Article 102-bis implements the database sui generis framework.

It defines:

- extraction;
- re-use;
- database maker rights.

A database maker that made a relevant investment may prohibit extraction/re-use of all or a substantial part.

Repeated/systematic extraction of non-substantial portions can also matter when it conflicts with normal exploitation or causes unjustified prejudice.

Official source:

https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:1941-04-22;633~art102bis-com5=

EU Database Directive context:

Directive 96/9/EC.

## EU text/data mining

Directive (EU) 2019/790 contains a text/data mining exception for lawfully accessible material, subject to conditions including appropriate reservation of rights by rightsholders.

This must NOT be treated as a blanket commercial resale licence for MealMint.

Official source:

https://eur-lex.europa.eu/eli/dir/2019/790/oj

## Relevant CJEU cases

### Innoweb — C-202/12

Concerned database rights and re-utilisation through a dedicated meta-search engine.

Source:

https://eur-lex.europa.eu/legal-content/EN/CASE/?uri=CELEX:62012CA0202

### Ryanair v PR Aviation — C-30/14

Shows that contractual limitations can remain relevant even where a database is not protected by the Database Directive, subject to applicable national law and the actual contractual circumstances.

Source:

https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=ecli:ECLI:EU:C:2015:10

---

# 31. WHAT THIS MEANS FOR MEALMINT

The correct conclusion is NOT:

> “Scraping public prices is illegal.”

Nor is it:

> “If a page is public, everything can automatically be commercially resold.”

The correct operational conclusion is:

> each retailer/source must be assessed and MealMint should be designed to minimize unnecessary legal exposure.

---

# 32. RETAILER COMPLIANCE RECORD

Every retailer must have an internal compliance profile.

Recommended fields:

```text
retailer_id
country

source_type:
  HTML
  JSON_LD
  FRONTEND_API
  OFFICIAL_API
  FEED
  OTHER

public_access:
  true / false

requires_auth:
  true / false

robots_status:
  ALLOW
  DISALLOW
  PARTIAL
  UNKNOWN

terms_status:
  REVIEWED
  NOT_REVIEWED

terms_scraping:
  ALLOW
  RESTRICT
  AMBIGUOUS
  UNKNOWN

technical_controls:
  NONE
  RATE_LIMIT
  LOGIN
  CAPTCHA
  OTHER

commercial_reuse_status:
  GREEN
  YELLOW
  RED

checked_at
notes
```

---

# 33. GREEN / YELLOW / RED MODEL

## GREEN

Typical characteristics:

- public page/data;
- no authentication;
- no circumvention;
- robots compatible;
- no clear relevant restriction identified;
- ordinary browser-accessible source.

Operational policy:

> normal collection and API exposure permitted under internal policy.

## YELLOW

Examples:

- public source but Terms ambiguous/restrictive;
- frontend/internal API;
- unclear database-right position;
- unclear commercial reuse;
- source presents technical/rate-limit sensitivity.

Operational policy:

> collect/expose only after review and with conservative limits.

## RED

Examples:

- robots disallow relevant path;
- authentication required;
- CAPTCHA/protection would need bypass;
- explicit source objection/takedown;
- private credentials required;
- technical measures would need evasion.

Operational policy:

> do not collect or immediately suspend.

---

# 34. CRAWLER RULES — MUST BE ENFORCED IN CODE

MealMint should maintain these rules:

1. access only public resources unless licensed otherwise;
2. respect `robots.txt`;
3. do not bypass login;
4. do not bypass CAPTCHA;
5. do not use proxy/IP rotation to evade blocking;
6. treat persistent 403/429 as a signal to stop/slow;
7. maintain retailer-specific request pacing;
8. keep acquisition logs;
9. implement an immediate retailer kill-switch;
10. preserve source URL and observation time;
11. never use hidden/private credentials from third parties.

The project already follows several of these principles.

Do not weaken them to increase coverage.

---

# 35. SOURCE DATA VS MEALMINT VALUE

MealMint's commercial value should increasingly come from its own transformation.

Prefer exposing:

- normalized name;
- brand;
- package;
- price;
- unit price;
- currency;
- retailer;
- country;
- GTIN where validated;
- canonical product mapping;
- observation timestamp;
- price history;
- promotion state;
- comparison;
- source URL.

This moves MealMint away from:

> “copy of retailer catalogue”

toward:

> “cross-retailer normalized data and intelligence layer.”

---

# 36. API EXPOSURE STRATEGY

Initial public API should be primarily query-oriented.

Recommended:

```text
GET /products/search
GET /products/{id}
GET /products/{id}/offers
GET /offers/{id}/history
POST /shopping-list/compare
GET /coverage
GET /retailers
```

Be conservative initially with:

```text
/export/full-retailer
/retailer/{id}/all-products-unlimited
/raw-database-download
```

Bulk/data licensing can later use:

> separate Enterprise contracts and compliance review.

Important:

query-based APIs do not magically eliminate database-right risk.

They do:

- give MealMint better access control;
- prevent easy database mirroring;
- make rate limiting practical;
- support a stronger “service” rather than raw dump positioning.

---

# 37. DOWNSTREAM CUSTOMER TERMS

MealMint's API Terms should grant a limited commercial licence.

Customers should be permitted to:

- call the API;
- use returned fields inside their applications;
- charge their own customers;
- display prices and product information;
- combine MealMint data with their own logic/content;
- cache data under documented freshness rules.

Default plans should prohibit:

- raw API resale;
- reselling MealMint as another grocery API;
- systematic harvesting to reconstruct the entire MealMint database;
- bypassing API limits;
- redistributing raw bulk feeds;
- falsely claiming retailer endorsement;
- presenting old observations as guaranteed current prices.

Bulk redistribution:

> separate Enterprise/Data Licence agreement.

This is broadly consistent with patterns used by competitors such as Pepesto and WhichGrocer.

---

# 38. RETAILER WITHDRAWAL / TAKEDOWN PROCESS

Create an operational process.

If a retailer or rights-holder contacts MealMint:

1. log the request;
2. immediately freeze new collection if credible;
3. optionally hide the source from public API;
4. preserve internal logs/evidence;
5. review source/Terms/legal status;
6. decide whether to:
   - resume;
   - restrict;
   - permanently remove.

Do not let an operational dispute become a prolonged automated crawl.

MealMint must support:

```text
retailer_enabled_for_collection
retailer_enabled_for_api
```

as separate flags.

---

# 39. PROVENANCE

Every offer should preserve provenance.

At minimum:

```text
retailer
source URL
observed_at
acquisition method
```

Normalized data should not overwrite source data.

Keep:

```text
raw/source
```

and:

```text
normalized
```

as distinguishable layers.

---

# 40. USER-FACING DATA DISCLAIMER

Documentation should clearly say something equivalent to:

> MealMint returns price observations collected from supported retailer sources. Prices, promotions and availability can change after observation. Always use `observed_at` / freshness fields and link users to the retailer for the final purchase price.

Do not claim that MealMint creates a binding retailer offer.

---

# 41. API PRODUCTION READINESS

Already present:

- private/public API key types;
- API-key/Bearer authentication;
- daily quotas;
- HTTP 401;
- HTTP 429;
- versioned `/v1` routes;
- input validation;
- basic CORS;
- uniform error envelope;
- request duration logging.

Main blockers:

## Critical

- free Render instance sleeps;
- insufficient memory;
- cold country index;
- database almost full.

## High

- no OpenAPI/Swagger;
- no pagination;
- no retailer filter;
- no durable usage accounting.

## Medium

- no per-minute limits;
- limited latency metrics;
- shared API/app deployment/domain;
- public contract uses Italian field names.

---

# 42. PERFORMANCE

Current architecture builds country search indexes in memory.

The current search itself is fast once the index is warm.

Problem:

> loading/index construction and memory.

Do NOT introduce Elasticsearch/Typesense/Redis/Meilisearch merely because cold start exists.

Current recommended sequence:

1. paid server with sufficient RAM;
2. measure memory per country;
3. preload high-traffic countries in background;
4. increase country cache;
5. measure again.

Only introduce a separate search engine if real production load proves the current architecture insufficient.

---

# 43. API PUBLIC CONTRACT

Do not break the current internal/client contract unnecessarily.

For international developer users, add English aliases or a new public normalized response layer.

Example future public shape:

```json
{
  "product": {
    "id": "mm_prod_...",
    "name": "Nutella",
    "brand": "Ferrero",
    "gtin": null,
    "category": "...",
    "package": {
      "value": 450,
      "unit": "g"
    }
  },
  "offers": [
    {
      "id": "mm_offer_...",
      "retailer": "Carrefour Italia",
      "country": "IT",
      "price": 4.99,
      "currency": "EUR",
      "unit_price": 11.09,
      "unit_price_uom": "kg",
      "observed_at": "...",
      "purchase_url": "..."
    }
  ]
}
```

---

# 44. MCP

MCP is strategically useful for AI-agent distribution.

But it does NOT create the core moat.

Implement only after the public REST API is stable.

Potential tools:

```text
search_products
get_product
find_offers
find_cheapest_offer
compare_shopping_list
get_price_history
get_retailer_coverage
```

MCP should call the same business logic/public API.

No separate data logic.

---

# 45. PRICING STRATEGY

Competitor evidence shows at least three viable models:

## A. Subscription + credits
Pepesto.

## B. Calls per month
LoyaltyHub / traditional API plans.

## C. Price per returned record
BasketWatch.

MealMint should initially optimize for:

> low friction for developers + understandable scaling + ability to charge high-volume customers fairly.

---

# 46. RECOMMENDED MEALMINT LAUNCH PRICING

This is a validation price model, not a permanent commitment.

Recommended hybrid:

## FREE

**€0**

Purpose:

> integration testing.

Suggested limits:

- 1,000–2,000 returned records/month;
- low per-minute rate;
- small max page size;
- core search only;
- visible freshness timestamp.

---

## DEVELOPER

**€29/month**

Suggested allowance:

- ~50,000 returned records/month;
- normal search/product endpoints;
- retailer/country filters;
- current/latest observations;
- basic history once available.

Target:

- indie developers;
- prototypes;
- small apps.

---

## GROWTH

**€79/month**

Suggested allowance:

- ~250,000 returned records/month;
- higher request rate;
- price history;
- promotions;
- larger pagination;
- basic support.

Target:

- startups;
- agencies;
- production apps.

---

## BUSINESS

**€199/month**

Suggested allowance:

- ~1M returned records/month;
- priority support;
- higher limits;
- batch operations where compliant;
- richer historical access.

Target:

- serious production integrations;
- data teams.

---

## ENTERPRISE

**from ~€600/month / custom**

Features can include:

- custom quotas;
- SLA;
- dedicated data requirements;
- approved bulk access;
- custom retailer integrations;
- dedicated infrastructure;
- data licensing terms;
- onboarding.

This intentionally mirrors market evidence from Prisy and other B2B data products without copying any single competitor.

---

# 47. SHOULD BILLING USE REQUESTS OR RECORDS?

Long term, records/credits are likely fairer.

Example:

```text
/search?q=milk&page_size=100
```

should not necessarily cost the same as a request returning one row.

Possible model:

> 1 credit = one returned record

or an endpoint-weighted credit system.

Before finalizing:

measure actual customer usage.

Do not over-engineer billing before beta.

---

# 48. PUBLIC WEBSITE MVP

Do NOT build a giant dashboard.

Pages:

## Home

Headline:

> **Grocery prices. Hundreds of retailers. One API.**

Subheading:

> Recently observed supermarket prices, normalized product data and direct retailer links across dozens of markets.

Metrics:

```text
1.6M+ observed prices
230+ retailers
40+ countries
```

CTA:

```text
Get API Key
Try Playground
View Docs
```

---

# 49. PLAYGROUND

Critical for conversion.

Example:

```text
Search: Nutella
Country: Italy
```

Result:

```text
Carrefour Italia
Nutella 450 g
€4.99
€11.09/kg
Observed: 20 Sep 2026
View retailer →
```

Purpose:

> user understands API value in under 30 seconds.

---

# 50. COVERAGE PAGES

Build public live coverage.

Examples:

```text
/grocery-api/italy
/grocery-api/germany
/grocery-api/france
/grocery-api/spain
/grocery-api/uk
```

Each can show:

- active retailers;
- indexed offers/products;
- freshness;
- capabilities.

Potential retailer-specific SEO pages only where accurate:

```text
/carrefour-api
/conad-api
/coop-api
```

Do not claim official partnerships unless they exist.

---

# 51. DOCUMENTATION

OpenAPI first.

Include:

- authentication;
- errors;
- rate limits;
- pagination;
- credits;
- freshness semantics;
- code samples;
- coverage;
- fields;
- legal/licensing restrictions.

Code examples:

- curl
- JavaScript
- Python

Create a public GitHub examples repository when ready.

Competitors actively use open examples as acquisition.

---

# 52. GO-TO-MARKET

Do not rely only on SEO.

Initial acquisition:

## Developer SEO

Target queries:

- grocery price API
- supermarket API
- supermarket price API
- grocery data API
- food prices API
- retail price API
- Carrefour API
- Conad API
- grocery API Italy
- grocery API Europe

## Direct outbound

Contact:

- food-tech startups;
- shopping applications;
- recipe/meal-planning startups;
- nutrition apps;
- cashback startups;
- AI-agent startups;
- software houses;
- data/market research companies.

Pitch:

> You can integrate one API instead of maintaining retailer-specific data collectors.

## Developer communities

Useful later:

- GitHub;
- Hacker News / Show HN;
- Product Hunt;
- Reddit developer/startup communities;
- LinkedIn;
- AI-agent/MCP communities.

---

# 53. SALES DISCOVERY QUESTIONS

For every qualified user ask:

```text
What are you building?
Which countries do you need?
Which retailers matter?
How many API calls / returned products do you expect?
Do you need history?
Do you need GTIN?
Do you need canonical matching?
Do you need promotions?
Do you need stock?
Do you need bulk export?
```

Do not guess the roadmap.

Let customer requests influence it.

---

# 54. VALIDATION METRICS

Track:

## Acquisition

- unique developer visitors;
- documentation visitors;
- playground users;
- API signups.

## Activation

- user receives key;
- first successful API call;
- number of users making >10 calls.

## Usage

- active API keys;
- calls;
- records returned;
- countries queried;
- retailers queried;
- failed/no-result queries.

## Commercial

- upgrade conversion;
- paid users;
- MRR;
- average revenue/customer;
- enterprise leads.

## Retention

- developers active after 7/30 days;
- recurring production usage;
- churn.

## Product demand

count requests for:

- GTIN;
- history;
- bulk;
- retailer additions;
- countries;
- matching;
- stock;
- MCP.

---

# 55. STRONG VALIDATION SIGNALS

Examples:

> “Can you add Mercadona?”

> “Do you have Carrefour France?”

> “Can I get six months of history?”

> “Do you have EAN?”

> “Can I use this for my production shopping app?”

> “What does 5M records/month cost?”

> “Can you provide an SLA?”

These are much stronger than:

- page views;
- likes;
- compliments;
- free signups that never call the API.

---

# 56. 30–60 DAY MARKET TEST

Once the API is genuinely production-ready:

run an active commercial test for approximately 30–60 days.

Activities must include:

- public website;
- real playground;
- docs;
- self-service key;
- pricing;
- targeted SEO;
- outbound to relevant companies;
- developer distribution.

Then evaluate.

Do not conclude there is no market after simply publishing a page and waiting.

---

# 57. KILL / CONTINUE CRITERIA

## CONTINUE / INVEST MORE

if evidence includes:

- qualified developer usage;
- recurring API activity;
- feature requests from serious users;
- paid customers;
- meaningful enterprise conversations;
- requests for more markets/retailers;
- repeat usage.

## REASSESS

if after a real distribution effort:

- almost no qualified signups;
- free users do not make calls;
- no one will pay;
- customer needs consistently fall outside MealMint's achievable data;
- source/compliance limitations destroy commercially relevant coverage.

---

# 58. IMPLEMENTATION PLAN

## PHASE 0 — Infrastructure/compliance gate

Immediate decisions:

1. move off the current 512 MB free database constraint before Phase 1 data accumulation;
2. keep the API/server always on;
3. implement the retailer compliance schema;
4. ensure history collections have no accidental TTL;
5. choose the production infrastructure after a short sizing/security review.

### Infrastructure direction under evaluation

The preferred long-term direction currently being evaluated is:

> **one production VPS hosting the MealMint application/services and MongoDB on the same machine**, with persistent storage and strict operational safeguards.

This is **not yet a final infrastructure decision**.

Atlas M10 remains a valid managed fallback/bridge and a useful cost/capacity benchmark, but it is **not the intended final architecture by default**.

If the VPS option is selected, it must include at minimum:

- MongoDB bound only to localhost/private network, never publicly exposed;
- authentication enabled;
- application and database isolated as separate services/containers;
- persistent volume for MongoDB;
- encrypted off-host backups;
- automated daily backups plus periodic full backups;
- tested restore procedure;
- disk/RAM/CPU monitoring and alerts;
- log rotation;
- firewall and minimum-open-port policy;
- OS/security updates;
- enough storage headroom for the first-cycle footprint and multi-year history growth;
- documented migration path to split application and database onto separate machines if load requires it.

Important:

> colocating application and database is acceptable for an early commercial stage if properly secured and backed up, but it creates a single-machine failure domain. Off-host backups and tested restore are therefore mandatory, not optional.

---

## PHASE 1 — Stop losing valuable data

Days, not months.

Implement:

- append-on-change history;
- original/list price persistence;
- discount fields;
- promotion expiry;
- brand from JSON-LD;
- image URL;
- retailer SKU;
- availability;
- raw category/breadcrumb;
- page product name;
- currency backfill.

Add enrichment coverage metrics.

Goal:

> current 72-hour read cycle enriches the corpus automatically.

---

## PHASE 2 — Make API commercially usable

Implement:

- remove free-tier sleeping;
- solve/preload cold country indexes;
- measure memory per country;
- increase cache capacity;
- pagination;
- retailer filter;
- price range filter;
- durable request/usage accounting;
- per-minute rate limiting;
- OpenAPI;
- latency/error metrics;
- dedicated API host/domain;
- English public response layer.

---

## PHASE 3 — Normalize and expand

Implement:

- improved package parser;
- GTIN extraction/validation;
- raw category → canonical taxonomy;
- price outlier/locale validation;
- selected high-value readers for API-priced retailers.

Prioritize API-priced retailers by:

```text
commercial importance
× product count
× source compliance status
÷ engineering effort
```

---

## PHASE 4 — Intelligence

Implement:

- canonical products;
- GTIN-seeded matching;
- brand + package matching;
- confidence thresholds;
- historical price endpoints;
- promotion-history endpoints;
- comparison endpoints.

---

## PHASE 5 — Distribution

Implement/release:

- public site;
- playground;
- API key signup;
- billing;
- pricing;
- examples;
- MCP;
- outbound/SEO measurement.

Some Phase 5 work may begin during Phase 3/4 if the API is stable enough for beta.

Do not delay market validation merely to perfect matching.

---

# 59. QUICK WINS

High-value / low-effort items found by the technical audit:

- currency backfill;
- persist existing `list` / discount fields;
- brand from JSON-LD;
- image URL from JSON-LD;
- SKU from JSON-LD;
- preload major countries;
- protect history from the 30-day TTL;
- English aliases;
- expose freshness clearly.

---

# 60. DATA QUALITY METRICS TO IMPLEMENT

## Coverage

```text
known_urls
priced_urls
fresh_prices
dead_urls
blocked_urls
```

## Enrichment

```text
brand_coverage
sku_coverage
image_coverage
raw_category_coverage
availability_coverage
package_coverage
gtin_coverage
promotion_coverage
currency_coverage
```

Measure:

- global;
- by country;
- by retailer.

The 12-retailer audit is promising, but not enough to assume 234-retailer coverage.

---

# 61. MATCHING METRICS

Track:

```text
canonical_products
matched_offers
gtin_matches
brand_package_matches
unmatched_offers
candidate_matches
rejected_low_confidence_matches
```

Do not optimize a matching model without measuring false merges.

---

# 62. API METRICS

Track at least:

```text
requests
returned_records
latency_p50
latency_p95
error_rate
401
429
cache_hit_rate
country_load_time
country_evictions
```

Usage accounting must survive restarts/deploys before customers pay.

---

# 63. COMPLIANCE METRICS

Track:

```text
green_retailers
yellow_retailers
red_retailers
terms_reviewed
robots_allow
robots_disallow
frontend_api_sources
retailer_takedown_requests
sources_suspended
```

Compliance must be operational data, not a forgotten legal document.

---

# 64. DEVELOPMENT PRINCIPLES

## Do not destroy raw data

Normalized fields are additive.

Preserve:

- raw retailer name;
- retailer category;
- source URL;
- retailer SKU;
- observation time.

## Preserve provenance

Know where fields come from.

## Prefer deterministic extraction

Order:

1. structured source data;
2. deterministic parsing;
3. rules/dictionaries;
4. similarity/embeddings;
5. LLM only if there is a demonstrated unsolved long tail.

## Do not rewrite working architecture without evidence

The technical audit found that current search is fast once warm.

Solve measured problems, not fashionable problems.

---

# 65. WHAT CLAUDE MUST NOT DO

Do not:

- rewrite the whole project unnecessarily;
- add Elasticsearch merely to fix startup loading;
- implement expensive LLM enrichment for structured fields;
- break current API clients;
- accidentally create history under the current 30-day TTL;
- merge canonical products with weak confidence;
- call unvalidated numeric URL tokens EAN/GTIN;
- bypass retailer technical restrictions;
- implement proxy rotation for evasion;
- prioritize visual dashboard work over data preservation;
- claim “real-time” without evidence;
- expose full retailer bulk dumps by default;
- assume competitor behavior is legal proof;
- copy competitor Terms verbatim.

---

# 66. COMMERCIAL LONG-TERM PRODUCTS

One dataset may ultimately power several products.

## A. Developer Grocery API

Primary current focus.

## B. MCP / AI Grocery Data

After API stability.

## C. Historical Price API

Once enough history accumulates.

Be accurate about observation granularity.

## D. FMCG / Brand Monitoring

Later, requires:

- matching;
- brands;
- history;
- promotions.

## E. Consumer Comparison

Possible, but not current priority.

The API itself should be able to power such products.

---

# 67. WHAT MAKES MEALMINT EXCEPTIONAL

Not 10M raw URLs.

The target state is:

```text
large retailer coverage
+
fresh price observations
+
stable source provenance
+
brand
+
retailer SKU
+
package normalization
+
unit price
+
GTIN where available
+
canonical product matching
+
historical price changes
+
promotions
+
developer-friendly API
```

The most defensible product advantage is the combination of:

> breadth + normalization + history.

---

# 68. CURRENT RISK REGISTER

## Market risk — MEDIUM

The category exists, but MealMint still has to prove that enough customers prefer/pay for its specific coverage.

Mitigation:

> early commercial beta.

## Technical risk — LOW/MEDIUM

Core infrastructure works.

Known production issues are identifiable and fixable.

## Data-quality risk — MEDIUM

Breadth is large; normalization is incomplete.

Mitigation:

> enrichment + measured coverage + matching later.

## Legal/source-compliance risk — MEDIUM

Not a reason to stop the project.

Must be managed source by source.

Mitigation:

> compliance registry + crawler guardrails + conservative API exposure + takedown workflow + specialist review for high-risk/enterprise cases.

## Cost risk — LOW

Current architecture has historically been extremely inexpensive.

Production/storage costs will increase but remain small relative to B2B pricing if the architecture stays disciplined.

---

# 69. FINAL PRODUCT DECISION

MealMint should **not be discarded** at the current stage.

The evidence justifies:

1. preserving richer data immediately;
2. upgrading infrastructure;
3. progressively normalizing the dataset;
4. implementing source compliance as a first-class system;
5. launching a developer-facing API beta;
6. measuring real willingness to pay.

The project should only be reconsidered after:

> a technically credible beta has received a serious distribution/commercial test.

---

# 70. CLAUDE'S NEXT OPERATING INSTRUCTION

When this file is first added to the repository:

1. read this file completely;
2. read `MEALMINT_TECHNICAL_AUDIT.md`;
3. inspect current repository state;
4. do NOT immediately start a large refactor;
5. produce a short implementation delta describing what has changed since the audit;
6. propose Phase 1 file/schema changes;
7. explicitly identify:
   - database plan required;
   - new collection/indexes;
   - fields added to current documents;
   - API compatibility impact;
   - expected storage increase;
   - migration/backfill behavior;
   - compliance metadata additions;
8. wait for approval before any destructive migration.

After approval, Phase 1 has priority.

---

# 71. EXTERNAL SOURCES / MARKET REFERENCE

Research snapshot: 22 September 2026.

## Competitors

Pepesto:
- https://www.pepesto.com/
- https://www.pepesto.com/pricing/
- https://www.pepesto.com/api-terms/
- https://www.pepesto.com/supermarkets/

MealCP:
- https://mealcp.com/
- https://mealcp.com/getting-started/introduction/
- https://mealcp.com/api/products/
- https://mealcp.com/api/prices/
- https://mealcp.com/getting-started/credits-and-limits/
- https://mealcp.com/integrations/rest/

Prisy:
- https://prisy.ai/
- https://prisy.ai/chi-siamo
- https://prisy.ai/privacy

BasketWatch:
- https://basketwatchireland.com/
- https://basketwatchireland.com/pricing

WhichGrocer:
- https://www.whichgrocer.com/developers/terms

LoyaltyHub:
- https://loyaltyhub.co.za/developers

OpenPriceEngine:
- https://openpricengine.com/
- https://openpricengine.com/premium-plan/

## Legal

Italian Copyright Law / Database rights — Article 102-bis:
- https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:1941-04-22;633~art102bis-com5=

Directive (EU) 2019/790:
- https://eur-lex.europa.eu/eli/dir/2019/790/oj

CJEU C-202/12 — Innoweb:
- https://eur-lex.europa.eu/legal-content/EN/CASE/?uri=CELEX:62012CA0202

CJEU C-30/14 — Ryanair v PR Aviation:
- https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=ecli:ECLI:EU:C:2015:10

---

# 72. ONE-SENTENCE STRATEGY

> **Preserve what MealMint already sees, normalize it into a cross-retailer grocery data layer, expose it through a controlled developer API, manage source compliance retailer-by-retailer, and validate paying demand before overbuilding the platform.**

---

# 73. V1.1 CONSOLIDATED AMENDMENTS — PHASE 1 + LEGAL/COMPLIANCE

This section supersedes older wording elsewhere in the brief wherever there is a conflict.

## 73.1 Collection and commercial exposure are separate decisions

MealMint must track two distinct states per source:

```text
raccolta
esposizione
```

A source may be technically collected while not yet being commercially exposed through the developer API.

The existing `esclusa` flag remains the global emergency kill-switch.

## 73.2 Compliance status is not a legal opinion

`VERDE`, `GIALLO`, `ROSSO` are internal operational classifications. `VERDE` means no evident issue identified under the current internal review; it does not mean legally guaranteed/safe. Existing retailers default to `termini = NON_RIVISTI` and `esposizione = RICHIEDE_REVISIONE` until reviewed.

## 73.3 Jurisdiction must be explicit

Compliance must be evaluated as retailer + source country + source type + access method + applicable/likely jurisdiction + terms + technical restrictions. Use `giurisdizione = UNKNOWN` when not actually determined. Do not infer definitive governing law merely from retailer country.

## 73.4 Competitors prove the category, not legality

Pepesto, MealCP, Prisy, BasketWatch, WhichGrocer, LoyaltyHub and similar businesses prove that grocery-data APIs are a real category. Their behavior is a market benchmark, not a legal defence.

## 73.5 Innoweb must not be treated as an automatic equivalence

MealMint is not automatically identical to the CJEU Innoweb fact pattern. Innoweb involved a dedicated meta-search engine querying another database in real time; MealMint's intended model is primarily to serve data already acquired, normalized and stored in MealMint's own infrastructure. Database-right/re-utilisation questions may still exist.

The current fallback that opens retailer pages at API request time when the warehouse lacks a price deserves special attention and should be progressively retired as warehouse coverage improves.

## 73.6 Main real-world source risks

Likely escalation: source changes/technical breakage → IP/rate blocking → cease-and-desist/takedown → retailer suspension/removal → possible civil dispute if disagreement continues. Losing one retailer must never threaten the whole business.

## 73.7 Retailer frontend/internal APIs

Default frontend/internal APIs to `GIALLO` / `RICHIEDE_REVISIONE` until reviewed. Never bypass authentication, private credentials, CAPTCHA, technical access controls, or rotate proxies specifically to evade blocking. Engineering ROI alone must not decide whether a frontend API reader is enabled.

## 73.8 Standard product must not be a retailer dump

Keep the standard product query/service oriented: search, current offers, normalized product, history, comparison. Avoid unlimited full-retailer dump/raw database mirror in self-service plans. Bulk/data licensing requires separate compliance review and commercial terms.

## 73.9 Retailer-branded SEO pages

Do not prioritize aggressive pages like `/carrefour-api` or `/conad-api` during initial launch. If introduced later, use factual/nominative wording, do not imply partnership, do not use logos without a clear basis, and add an unofficial/non-affiliation notice where appropriate. Country/category coverage pages are safer initially.

## 73.10 Product images

Phase 1 may extract and store `imageUrl`, meaning the original source image URL. Default rule: store the reference/URL, not a permanent copied image file on MealMint storage/CDN. Do not build a mirrored image archive in Phase 1.

## 73.11 Robots monitoring

Store `ALLOW`, `DISALLOW`, `UNKNOWN`, `ERROR`. Automatic suspension only on confirmed `DISALLOW`; never on timeout, 5xx, parse failure or `UNKNOWN`. Re-enablement after automatic suspension should be manual/reviewed. Store checked-at plus rule hash/snapshot where practical. `robots.txt` is an operational policy signal, not a legal licence.

---

# 74. PHASE 1 FINAL DATA ARCHITECTURE

Final preferred split:

```text
prezzi          hot/current state
schede          relatively static descriptive metadata
osservazioni    append-on-change history
```

`prezzi` stays compact and may add volatile/current fields plus `sh` as a true 8-byte binary/64-bit descriptive fingerprint.

`schede` stores page-declared name, brand, retailer SKU, source image URL, raw category/breadcrumb and coarse provenance. No TTL.

`osservazioni` stores historical states and uses `aperta: true` with a unique partial index on `{o:1}` filtered by `aperta:true`, plus `{o:1,t:-1}` for history queries. No TTL.

# 75. OPEN-OBSERVATION ATOMICITY

For unchanged state, only update `u` on `{o, aperta:true}`. For changed state, close current + insert new open observation. The unique partial index prevents two simultaneous open rows, but close+insert are still two writes. Preferred solution: transaction on the uncommon changed-state branch, simple `$set u` on the common unchanged branch. A reconciliation mechanism is an acceptable alternative if explicitly implemented and tested.

# 76. `SCHEDE` WRITE AVOIDANCE

Use the 64-bit fingerprint `sh` in `prezzi` over page name, brand, retailer SKU, image URL and raw category/breadcrumb. If unchanged, do not touch `schede`; if changed/new, update `schede`. The fingerprint is only a write-avoidance optimization, not authoritative identity.

# 77. PROMOTION EXPIRY

The original brief requested promotion expiry where available. Phase 1 must either implement it explicitly and define whether expiry changes create historical state changes, or mark it deliberately deferred. Do not silently lose the requirement.

# 78. UPDATED STORAGE EXPECTATION

With the three-collection design, fingerprint, open-observation flag and indexes, current first-cycle estimate is approximately **1.25–1.30 GB**, then approximately **+2–3 GB/year**, subject to real price-change frequency and index sizes. The current 512 MB free tier is not viable.

# 79. INFRASTRUCTURE — CURRENT POSITION

## Preferred direction under evaluation

The current preferred final direction is:

> **a production VPS containing both the MealMint application/services and MongoDB**, at least in the early commercial phase.

This is still being evaluated and is not yet irrevocable. Atlas Dedicated/M10 remains a managed alternative/bridge, not the definitive target architecture.

### VPS minimum acceptance criteria

1. MongoDB not publicly exposed.
2. DB authentication enabled.
3. Application and DB isolated as separate services/containers.
4. Persistent storage.
5. Automated encrypted off-host backups.
6. Periodic full backup.
7. Tested restore procedure.
8. Disk/RAM/CPU monitoring.
9. Disk-space alerts well before exhaustion.
10. Firewall.
11. SSH hardening.
12. Security update process.
13. Log rotation.
14. Restart policies.
15. Documented disaster-recovery procedure.

Application + DB on one VPS creates a single-machine failure domain. This can be acceptable in an early commercial stage only if the trade-off is intentional and recovery is tested. Off-host backups are mandatory.

# 80. FINAL CLAUDE EXECUTION RULE

Claude may proceed with Phase 1 once infrastructure capable of holding the enlarged dataset is available. Before destructive operations, show final schema/indexes; confirm no TTL on `schede`/`osservazioni`; confirm history transition atomicity/reconciliation; confirm currency backfill only fills missing values; confirm `imageUrl` stores source URLs rather than copied files; confirm robots auto-suspension triggers only on confirmed `DISALLOW`; preserve `/v1` response compatibility in Phase 1.

After implementation, run an audit after one full 72-hour cycle and report actual enrichment coverage, storage, write volume and errors before Phase 2.


---

# 81. ANSWERS TO §75, §76, §77 AND THE §80 GATE

Written after the Phase 1 delta was approved. These close the four open
technical questions so implementation can start without further round-trips.

## 81.1 Open-observation atomicity — no transaction needed (§75)

The changed-state branch is `close` then `insert`, two writes. The question was
whether to wrap them in a transaction.

**Recommendation: do not.** Use failure detection plus self-repair instead.

**Why the order is safe.** `close` must come first. The unique partial index on
`{o: 1} where {aperta: true}` makes the reverse order impossible: inserting a
new open row while the previous one is still open violates the index and fails.
So `close` → `insert` is the only sequence the database will accept, and the
index is doing its job.

**The only failure mode** is a crash between the two writes, leaving an offer
with zero open observations. Nothing is corrupted and nothing is lost — the
closed interval is already durable, with its correct `t` and `u`.

**How it repairs itself.** On the unchanged branch, the update is
`updateOne({o, aperta: true}, {$set: {u: now}})`. When an offer has no open row,
`matchedCount` comes back `0`. That is the signal: insert a new open
observation. **The repair rides the next read of that page — at most 72 hours,
and usually much less.**

The cost of the gap is the exact start boundary of one interval for one offer.
Against a transaction, which would cost:

- a replica set on every deployment — **a single `mongod` on a VPS is not one by
  default**, and would have to be started as a single-node replica set. This
  belongs in §79's acceptance criteria as item 16, because a plain install would
  make every changed-price write fail;
- a distributed-transaction round trip on ~10% of 500,000 daily writes;
- a failure mode that is harder to reason about than "insert the missing row".

The reconciliation is explicit, it is one branch of the normal write path, and
it is testable by deleting an open row and confirming the next read restores it.
That satisfies §75's "acceptable alternative if explicitly implemented and
tested".

## 81.2 The fingerprint is binary (§76)

Accepted. `sh` is `BinData` of 8 bytes, not a hex string.

In BSON an 8-byte binary field costs 4 bytes of length, 1 of subtype and 8 of
payload; a 16-character hex string costs 4 bytes of length, 16 characters and a
terminator. **About 8 bytes per document, ~13 MB across the corpus**, for
nothing.

Confirming §76's own caveat: `sh` is a write-avoidance device only. It is never
an identity, never a join key, and never exposed. A collision loses one update
to a descriptive field; it cannot affect a price.

## 81.3 Promotion expiry — implemented, and deliberately not a state change (§77)

`PagePrice.validUntil` is already parsed by `price-page.ts` today. Phase 1
persists it as `pf` (*promo fino a*) on `prezzi`, beside `l` and `sc`, because
it is volatile and belongs with the other volatile fields.

**It is excluded from the `sh` fingerprint and from the observation state
comparison, on purpose.**

The observation state stays `(p, l, v)`. If expiry were part of it, a retailer
that renews a promotion every night — and several do — would generate a new
historical row every night for a price that never moved. That is precisely the
churn append-on-change exists to avoid, and it would be indistinguishable in the
data from a real daily price change.

The commercially meaningful events are: the price changed, a promotion started,
a promotion ended. All three are already captured by changes in `p` and `l`.
Expiry is a declaration about the future, frequently wrong and frequently
auto-renewed; its churn is noise, not history.

So: **stored and exposed, never a history trigger.** This is the explicit
decision §77 asked for, not a deferral.

## 81.4 Phase 1 splits in two, and half of it fits today (§80)

§80 gates Phase 1 on infrastructure able to hold the enlarged dataset. That is
correct for most of it and wrong for one part, and the part it is wrong about is
the most valuable per byte.

Measured headroom: **412 MB of 512 MB, so ~100 MB**.

### Phase 1a — fits in current headroom, no infrastructure decision required

| Work | Cost |
|---|---:|
| Compliance fields on `fonti` (251 rows) | 20 KB |
| Robots scheduling, auto-suspend on confirmed `DISALLOW`, outcome logged | a few KB/week |
| Currency backfill over ~327,592 rows missing `v` | ~4 MB |
| `l`, `sc`, `av`, `pf`, `sh` on `prezzi` | ~50 MB |
| **Total** | **~55 MB**, leaving ~45 MB |

None of the new `prezzi` fields is indexed, so index size does not grow.

**Why this half should not wait.** Original price, discount and expiry are
*already parsed on every page read and thrown away* — roughly 500,000 times a
day. This is not a missing field; it is a field we collect and discard. One
72-hour cycle after shipping, promotion data exists for every offer read, which
is the raw material for the brief's Product C and Product D.

It also carries the compliance work, which is the only part of Phase 1 where
delay produces exposure rather than merely lost storage.

### Phase 1b — requires the infrastructure decision

| Work | Cost |
|---|---:|
| `schede` — page name, brand, SKU, image URL, raw category | ~445 MB |
| `osservazioni` — append-on-change history | ~318 MB |

Both are written and gated behind an environment switch, off by default. On the
day the storage exists, the switch is flipped and the 72-hour cycle backfills
both with no re-reads and no extra requests to retailers.

### Consequence for §80

§80 stands unchanged for Phase 1b. For Phase 1a it is amended: **Claude may
proceed now**, because Phase 1a is additive, non-destructive, fits in existing
headroom, and every one of §80's preconditions is already satisfied — no TTL is
added, no `/v1` response changes, the currency backfill only fills empty fields,
`imageUrl` is not yet written at all, and robots auto-suspension triggers only
on a confirmed `DISALLOW`.

The audit §80 requires after one full 72-hour cycle applies to each half
separately.

---

# 82. WHAT PHASE 1 DELIBERATELY DOES NOT DO

Absorbed from the Phase 1 delta, which is retired. These are decisions, not
omissions: each one was considered and declined for a stated reason.

| Not done | Why |
|---|---|
| **Per-field provenance map** | `schede.fo` records provenance for the field set, not per field. A per-field map roughly triples the document for information nothing consumes yet. Addable later without migration. |
| **Brand dictionary, fuzzy matching, LLM fallback** | JSON-LD carries `brand` on 12 of 12 probed retailers. Ship the structured-data stage, measure the real miss rate, then decide. Writing the other four stages first is building for a problem that has not been measured. |
| **Canonical category taxonomy** | Phase 1 stores the raw retailer breadcrumb only. Mapping across 49 countries and many languages is Phase 3 work and would block Phase 1 for weeks. |
| **Secondary index on `schede`** | Roughly 40 MB for a query nobody makes. Searching by brand arrives with Phase 3. |
| **Exposing the new fields in `/v1`** | The public contract changes once, in Phase 2, together with the English alias layer — not twice. |
| **Touching `cataloghi`** | The gzipped-blob design is correct and orthogonal to everything in Phase 1. |
| **Storing product descriptions** | A product name is functional; three paragraphs of marketing copy are written by someone. It is the part of the dataset that least resembles data and most resembles someone else's content. Cheap to leave out, and it removes a whole front. |

## Rollback

Phase 1 is additive. Nothing is migrated, nothing is rewritten, nothing is
deleted.

- Existing `prezzi` documents keep their exact bytes. The new fields are
  optional; absent means not observed, never zero.
- `schede` and `osservazioni` start empty and are filled by the normal
  72-hour read cycle — no re-reads, no extra requests to retailers.
- The one non-additive operation is the currency backfill over ~327,592 rows
  missing `v`. It is deterministic (retailer → country → ISO 4217) and only
  ever writes into an empty field.

To undo Phase 1: drop the two new collections and ignore the optional fields.
The previous state is restored exactly.

## Document status after v1.1

| Document | Status |
|---|---|
| `MEALMINT_MASTER_BRIEF_v1.1.md` | **Living.** Decisions, architecture, legal, pricing, phases. Updated when a decision changes. |
| `MEALMINT_TECHNICAL_AUDIT.md` | **Frozen snapshot, 22 September 2026.** Kept for its evidence: the twelve-retailer structured-data probe and the repository module map. Where it conflicts with this brief, this brief wins. |
| `MEALMINT_PHASE1_DELTA.md` | **Retired.** Approved, and absorbed into §73-§82. |
| `MEALMINT_PRODUCT_AUDIT_AND_ROADMAP.md` | **Superseded and removed.** Its content became this brief. |
