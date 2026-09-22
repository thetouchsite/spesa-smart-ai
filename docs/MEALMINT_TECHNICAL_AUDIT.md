# MealMint — Technical Audit

Answer to `MEALMINT_PRODUCT_AUDIT_AND_ROADMAP.md`, written after inspecting the
repository and measuring the live database.

All figures measured on **22 September 2026** against the production MongoDB
and against twelve live retailer pages fetched for this audit. Nothing here is
estimated unless it says so.

---

## 0. The three findings that change the roadmap

Read these before the detail. Each one moves work between priorities.

### 0.1 The enrichment data is already inside the HTML we fetch today

The roadmap treats brand, category, image, stock and GTIN as future scraping
work (priorities 3-5, 8-9). They are not. I fetched twelve real product pages
across eight countries, including the six highest-volume retailers in the
warehouse, and looked at what their markup already contains:

| Retailer | Country | JSON-LD | brand | image | sku | availability | breadcrumb | category | gtin | list price |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Carrefour | IT | Y | Y | Y | Y | Y | Y | Y | | |
| Bennet | IT | Y | Y | Y | Y | Y | Y | | Y | |
| Coop | IT | Y | Y | Y | Y | Y | Y | | Y | Y |
| Morrisons | GB | Y | Y | Y | Y | Y | | | | Y |
| Sainsbury's | GB | Y | Y | Y | Y | Y | | | | |
| Lidl | GB | Y | Y | Y | Y | Y | Y | Y | | |
| Rimi | LT | Y | Y | Y | Y | Y | | Y | | |
| Continente | PT | Y | Y | Y | Y | Y | Y | | | |
| Planeta Huerto | ES | Y | Y | Y | Y | Y | Y | Y | Y | |
| Freshful | RO | Y | Y | Y | Y | | Y | Y | | |
| eBag | BG | Y | Y | Y | Y | Y | Y | Y | | |
| Tommy | HR | Y | Y | Y | Y | Y | Y | Y | | |
| **Total** | | **12/12** | **12/12** | **12/12** | **12/12** | **11/12** | **9/12** | **7/12** | **3/12** | **2/12** |

And `porzioneConPrezzi()` in `src/api/price-page.ts` **already keeps up to
400 KB of that HTML in memory**, deliberately including every
`application/ld+json` block — it was written that way because Coop hides its
price at byte 838,000 and Picard at byte 267,087. The parser reads price and
name out of it and throws the rest away.

**So brand, image and retailer SKU are not a scraping project. They are a
parsing project on bytes we already hold.** That moves them from HIGH to LOW
difficulty and from priority 12-13 to immediate.

### 0.2 Enrichment is as time-sensitive as price history, for the same reason

The roadmap's Priority 0 argument is right: history cannot be reconstructed
later, so start now. The same argument applies to enrichment and the roadmap
misses it.

Every page is re-read on a 72-hour cycle. If extraction is added to the reader
**today**, the entire 1.65M-record corpus is enriched within one cycle at
**zero additional requests**. If it is added in three months, someone has to
run a separate 1.65M-page re-read campaign to back-fill — which is weeks of
reading and a fresh load on retailers we are trying not to annoy.

Enrichment should ride the read cycle that is already running. Not doing so is
the expensive choice.

### 0.3 The biggest coverage lever is not in the roadmap at all

`src/api/prezzi-api.ts` documents it: **42 retailers, 1.28 million product
pages, around 600,000 genuine grocery items, all with live pages and zero
readable prices.** Their pages open fine; the price arrives from an internal
API and JavaScript draws it afterwards. We classified them as "does not publish
prices" when the truth is "publishes in another format".

Four readers exist today (Consum, dm, Naturasi, LastMile). Thirty-eight
retailers are waiting. One of the four — Consum — returns the **EAN** in its
API response.

For comparison: going from 1.65M to 5M prices is the roadmap's stretch goal.
This single item is worth ~600,000 of that gap, on retailers whose catalogue we
already have, and it also hands us GTINs on some of them.

---

## 1. Repository architecture

One repository, two halves, enforced by a build-time check.

```
server/
  src/
    api/      the product — 25 files
    app/      the MealMint consumer app's own AI — 14 files
    base/     shared plumbing — 9 files
  scripts/    operational tools, ~60 commands
  comandi/    double-click launchers for non-developers
mobile/       Expo / React Native client
```

`scripts/confine.mjs` runs on every build and fails if a file in `api/` imports
from `app/`. Current state: **49 files declared, 0 remaining cords**. The API
can be lifted out of this repository as a directory move; that was deliberate
work and it holds.

### Data flow

```
retailer sitemap
      │  catalogo-fonti.ts / catalogo.ts     (URL + name)
      ▼
  cataloghi           gzipped "url<TAB>name" per country|retailer
      │
      │  lettore.ts → prezzi-continuo.ts → price-page.ts
      │  (opens the page, reads the price)
      ▼
   prezzi             one compact row per URL
      │
      │  prices-catalogo.ts  (search + join)
      ▼
  contratto-v1.ts     the public shape
      ▼
  /v1/offerte
```

The reader and the API are separate processes that meet only in MongoDB. Two PCs,
a Raspberry Pi and the Render instance currently read in parallel, coordinating
through a per-country ticket lock (`turni.ts`). That architecture is sound and
should not be touched.

### Key modules

| File | Responsibility |
|---|---|
| `api/catalogo.ts` | builds and holds the in-memory word index per country |
| `api/catalogo-fonti.ts` | the retailer list — **now a seed only**, live list is in `fonti` |
| `api/price-page.ts` | fetches a page, finds the price, reads the name (1,342 lines) |
| `api/prezzi-magazzino.ts` | reads and writes the compact price rows |
| `api/prezzi-continuo.ts` | the continuous read loop |
| `api/turni.ts` | per-country lock so parallel readers never duplicate work |
| `api/prezzi-api.ts` | dedicated readers for shops that serve prices from an API |
| `api/quantita.ts` | package parsing and price-per-kg |
| `api/contratto-v1.ts` | the public response shape |
| `api/chiavi.ts` | API keys, key species, daily caps |
| `base/robots.ts` | robots.txt parsing and enforcement |
| `base/http.ts` | routing, CORS, uniform errors (178 lines) |

### How easy is it to add an enrichment field without a new page request?

**Easy, and this is the audit's central answer.** `verifyProductPage()` already
has the HTML. Adding a field means:

1. a new optional property on `PagePrice` (`price-page.ts:36`);
2. an extractor reading the JSON-LD already sliced out by `porzioneConPrezzi()`;
3. a new field on `PrezzoDoc` (`base/db.ts`) and its two mappings in
   `prezzi-magazzino.ts` (lines ~237 and ~270).

No new fetch, no new retailer-specific code for the fields that sit in JSON-LD.

---

## 2. Current database schema

Measured, not described from code.

| Collection | Documents | Data | Indexes | Bytes/doc |
|---|---:|---:|---:|---:|
| `prezzi` | 1,659,513 | 121 MB | 122 MB | **77** |
| `cataloghi` | 235 | 162 MB | 0.1 MB | gzipped blobs |
| `fonti` | 251 | small | small | |
| `scarti` | 165 | 4 MB | — | 337,775 dead URLs, gzipped |
| `giri` | 929 | small | — | reader heartbeats and history |
| `turni` | ~84 | tiny | — | country locks |
| `vocabolario` | 179 | tiny | — | learned translations |
| `chiavi` | 12 | tiny | — | API keys (fingerprints only) |
| **Total** | | **288 MB** | **122 MB** | **410 MB** |

### `prezzi` — the hot path

```json
{ "_id": "QU52pfSixR3yNXbf", "c": 77, "p": 110, "s": 0,
  "t": "2026-09-20T03:16:20.431Z", "v": "EUR" }
```

- `_id` — 96-bit hash of the URL, base64url, sixteen characters
- `c` — retailer number, not name (the comment explains: "Carrefour Italia"
  written five million times costs eighty megabytes, its number costs eight)
- `p` — price, `null` when the page opens and declares none
- `s` — read status: 0 verified, 1 page-ok, 2 unreachable, 3 blocked
- `t` — observation timestamp
- `v` — currency

Indexes: `_id_`, `c_1_t_-1` (the reader's queue), **`t_1` with a 30-day TTL**.

### `cataloghi` — the cold path

One document per `COUNTRY|Retailer`, holding every product URL and its
sitemap-derived name as gzipped `url<TAB>name` lines. 235 documents for
4.64M URLs. This is why the catalogue costs 162 MB instead of several
gigabytes, and it is also why there is no way to query a single product by URL
without decompressing an entire retailer.

### Two schema facts the roadmap needs to know

**The 30-day TTL on `prezzi.t` will silently delete price history.** If
observations are appended into a collection carrying that index, or into
`prezzi` itself, they evaporate after thirty days. Any history design must
either use a separate collection with no TTL or explicitly drop it there.

**The database is at 80% of the free tier.** 410 MB of MongoDB Atlas M0's
512 MB. Price history cannot start on the current plan — see section 3.

---

## 3. Price history — and a disagreement with the roadmap

### Can we store history without breaking the API? Yes.

`prezzi` is read only through `prezziGiaVisti(urls)` in
`prezzi-magazzino.ts`, which is called from exactly two places. A second
collection written alongside it touches neither the read path nor the response
shape. **Answer to the roadmap's section 42: yes, and the migration is
additive.**

### But storing every observation is the wrong design

The roadmap says "append-only observation model", implying one row per read.
Costed against the measured read rate:

```
~500,000 reads/day  ×  ~90 bytes  ×  2 (data + index)
  =  ~90 MB/day  =  ~2.7 GB/month  =  ~32 GB/year
```

That is an Atlas M20 (~150 €/month) within a year, for a dataset whose entire
current footprint is 410 MB. And most of those rows would be **identical to
the row before them**: a 72-hour cycle re-reads the same price over and over,
and grocery prices change on the order of weeks, not days.

### Proposed alternative — append on change

Write an observation only when the price, the original price or the currency
differs from the last one recorded for that offer. Keep `prezzi` exactly as it
is, as the "current value" table.

```json
{
  "o": "QU52pfSixR3yNXbf",        // offer id = the prezzi _id
  "p": 4.99,                       // price
  "l": 5.49,                       // list price, when the page declares one
  "v": "EUR",
  "t": "2026-09-22T12:00:00Z",     // first observation at this price
  "u": "2026-09-27T04:11:00Z"      // last observation at this price
}
```

Carrying both first-seen and last-seen turns a run of identical reads into one
row with a duration, which is what a price series actually is. Storage drops
roughly ten-fold — call it **2-4 GB/year** — and every analytical question the
roadmap lists (lowest, highest, average, volatility, promotion detection,
inflation) is answerable from it, because no information is lost: the gaps
between rows are periods of no change by construction.

The cost is one extra read per write to compare against the last row. At the
reader's rate that is noise, and it can be avoided entirely by keeping the last
price in the `prezzi` row we already write.

### Granularity, and what may honestly be claimed

A full pass over the catalogue takes days, so a series will have **3-7 day
granularity, not daily**. The roadmap's commercial framing ("Historical Price
API" for fintech and economic data companies) must match that. Selling a daily
series we cannot produce is the same category of mistake as claiming real-time
prices, which the roadmap rightly forbids.

### Difficulty: LOW to build, MEDIUM to fund

The code is a new collection and roughly fifty lines in `prezzi-magazzino.ts`.
The blocker is storage: **the database must move off the free tier before this
starts.** That is a decision, not an engineering task, and it should be taken
this week — every day of delay is a day of history that cannot be recovered.

---

## 4. Enrichment audit

Classification as the roadmap requested, based on the twelve-retailer probe.

| Field | Classification | Evidence | Difficulty |
|---|---|---|---|
| **Original price / promotion** | **ALREADY PARSED, NOT STORED** | `PagePrice` has `list`, `saving`, `discountPercent`, `validUntil`; `PrezzoDoc` has none of them | **LOW** |
| **Brand** | EXTRACT FROM HTML ALREADY FETCHED | JSON-LD `brand` present 12/12 | **LOW** |
| **Image** | EXTRACT FROM HTML ALREADY FETCHED | JSON-LD `image` 12/12, `og:image` 10/12 | **LOW** |
| **Retailer SKU** | EXTRACT FROM HTML ALREADY FETCHED | `sku` 12/12 | **LOW** |
| **Availability** | EXTRACT FROM HTML ALREADY FETCHED | `availability` 11/12 | **LOW to extract, MEDIUM to trust** |
| **Category** | EXTRACT FROM HTML ALREADY FETCHED | breadcrumb 9/12, `category` 7/12; union 11/12 | **MEDIUM** (raw is easy, taxonomy is not) |
| **Package size** | DERIVE FROM EXISTING DB + improve | `quantita.ts` succeeds on 30% of sitemap names; page names are richer | **MEDIUM** |
| **GTIN** | MIXED | JSON-LD only 3/12; URL token 11% of IT+GB; Consum's API returns it | **MEDIUM** |
| **Description** | EXTRACT FROM HTML ALREADY FETCHED | JSON-LD `description` common | **LOW, low value** |
| **Ingredients** | REQUIRES RETAILER-SPECIFIC LOGIC | not in JSON-LD on any of the twelve | **HIGH** |
| **Manufacturer** | NOT RELIABLE | distinct from brand, rarely declared | **HIGH** |
| **Store-level location** | NOT AVAILABLE | these are national online stores | **N/A** |

### Where the roadmap over-engineers

**Brand.** Section 18 proposes `structured data → dictionary → rules → fuzzy →
LLM fallback`, and warns against assuming the first word is the brand. The
warning is correct and the pipeline is unnecessary: the first stage alone
covers 12 retailers out of 12. Build stage one, measure the miss rate on real
data, and only then decide whether stages two to five are worth writing. My
expectation is that a dictionary for the long tail will be needed and the LLM
stage never will.

**Availability.** The roadmap's caution is right but understates one thing: a
`schema.org` `InStock` on a national webshop is close to meaningless, because
it usually reflects "this product exists in the catalogue", not "you can have
it tomorrow". Extract it with its source and confidence, expose it, and do not
build any commercial claim on it.

**Package parsing to 70-90%.** Reachable, but not by improving the parser
alone. Today it reads the **sitemap-derived** name (`latte-intero`); the page
name is much richer (`Latte intero UHT 1 l`). `price-page.ts` already captures
that name, and `prices-catalogo.ts` already prefers the longer of the two. The
lever is persisting the page name in `prezzi`, which costs storage — the
opposite of the compaction Antonio just did, and a trade to make consciously.

### GTIN: the honest position

3/12 retailers declare a GTIN in structured data. The 11% of URLs carrying an
EAN-shaped token is the larger source, and it is exactly where the roadmap's
own warning applies — `0000080050865` in a Carrefour URL is thirteen digits in
the right place, not a validated GTIN. Mandatory: checksum validation, and the
`gtin_source` / `gtin_validated` fields the roadmap specifies.

Realistic near-term coverage: **15-25%**, not the "very high strategic value"
the roadmap implies without a number. That is still enough to seed matching
(section 5), but it is not enough to sell GTIN lookup as a feature.

---

## 5. Product matching architecture

The roadmap's four-level confidence model is sound and I would not change it.
Two additions from what the code and data show.

### Use the retailer SKU as the stable key

`sku` is present 12/12 and the roadmap never mentions it. It is not a GTIN —
it does not cross retailers — but it is the retailer's own stable product
identifier, and it survives URL changes. Today an offer's identity is the hash
of its URL: if a retailer reorganises its paths, we lose the entire history of
that product. **Storing the SKU protects history against URL churn**, which
matters more once history exists.

### Matching is a country-local problem first

`cataloghi` is partitioned by `COUNTRY|Retailer` and every search already runs
inside one country. Cross-border matching (the same Nutella in Italy and
Germany) is a different and much harder problem — different package sizes,
different names, different formulations. Build matching **within a country**
first; it is where the comparison value is, and it is where the data is dense.

### Proposed model, additive to what exists

```
prodotti_canonici   { _id, nome, marca, gtin?, categoria?, formato }
prezzi              { _id, c, p, s, t, v, + pc?: canonical id, + fid?: confidence }
osservazioni        { o, p, l, v, t, u }
```

Adding `pc` and `fid` to the existing `prezzi` row costs about 20 bytes and no
migration: absent means unmatched. This keeps the hot path intact, which is the
roadmap's own stated constraint.

### Pipeline order

```
validated GTIN            → confidence 1.00   (~15-25% of offers, eventually)
brand + package + tokens  → 0.85-0.95         (needs brand and package first)
token similarity alone    → candidate, never merged automatically
```

The roadmap's rule that a false merge is worse than no merge is correct and
should be enforced in code, not in policy: the merge job should refuse to write
a `pc` below a threshold, and park the pair for review.

**Difficulty: HIGH**, and it depends on brand, package and GTIN all landing
first. It should not start before phase 3.

---

## 6. API production readiness

### What is already there

| | Status |
|---|---|
| API key authentication | Present — `sk_` / `pk_` species, only the sha256 fingerprint stored |
| `X-Api-Key` and `Bearer` | Both accepted |
| Daily quota, 429 | Present, resets at UTC midnight; `/v1/stato` deliberately exempt |
| 401 without a key | Verified this session |
| CORS | Present — `base/http.ts:103-112`, origin allowlist with `*` fallback |
| Uniform error shape | Present — `{ "error": "..." }`, 500s never leak internals |
| Request logging | Present — method, path, status, duration |
| Input validation | Present — schema parse, 400 with detail |
| Versioned routes | Present — `/v1/`, with `/v1/prezzi` kept alive as an alias |

This is a better starting point than the roadmap assumes. The alias mechanism
in particular means the roadmap's section 37 rename to
`POST /v1/shopping-list/compare` is free: `index.ts` already registers two
paths against one handler.

### Blockers for a public beta

| Blocker | Severity | Fix |
|---|---|---|
| **Cold start, 35 s** | **Critical** | see section 7 |
| **Runs on the free tier** | **Critical** | 512 MB, sleeps after 15 min idle |
| No pagination | High | `quanti` exists; add offset and a total |
| No OpenAPI | High | ~300 lines of YAML against five routes |
| No retailer / price-range filter | Medium | both are in-memory filters over existing data |
| No per-minute rate limit | Medium | only a daily cap exists; a burst can still hurt |
| No latency metrics | Medium | duration is logged but never aggregated |
| No dedicated domain | Medium | shares the app's Render instance |
| Italian field names | Low | `insegna`, `prezzo`, `offerte`. Fine for an Italian team, friction for a global developer API. Add an English alias layer; do not rename — the app depends on these |

### One thing the roadmap does not list and should

There is **no request-level audit trail**. `consumoDiOggi()` counts calls per
key in memory and loses them on restart. Before charging anyone, usage has to
survive a deploy — otherwise the first billing dispute is unanswerable.

---

## 7. Performance risks

### Why cold start takes 35 seconds

`catalogoDi(country)` builds a word index in memory on first request after a
restart:

1. read the gzipped catalogue documents for that country from Mongo
2. decompress
3. tokenise every product name
4. build the inverted index

Measured: 1-2 s per country warm, up to 35 s when Mongo is cold and the country
is large. Nothing preloads at startup — the first user pays for everyone.

### The memory ceiling is the real risk

`catalogo.ts:86` — `PAESI_IN_MEMORIA = 3`. The system serves **49 countries and
holds three**. The fourth evicts the first. I demonstrated this: warming five
countries in sequence evicted two.

Measured: the process reached **569 MB** with a handful of catalogues loaded,
against Render's 512 MB limit. That is not a future problem; it is why the
instance restarts.

### Recommended fix, in order

1. **Preload at startup** the few countries that carry the traffic, in the
   background, so no user pays for the index.
2. **Raise `PAESI_IN_MEMORIA`** after moving to an instance with real memory.
3. **Measure the per-country footprint** before choosing the instance size —
   this number does not exist yet and every capacity decision needs it.

### Do not introduce a search engine

The roadmap's section D asks whether Redis, Elasticsearch, Typesense, Meili or
SQLite/FTS would help, and tells me not to choose one for fashion. **None of
them, for now.** The current index answers a query in 1-2 ms once warm; the 35
seconds is a *loading* problem, not a *searching* problem, and every one of
those systems solves searching. Adding one would mean a second copy of the data
to keep in sync, a second thing to operate, and the same cold-load cost moved
elsewhere.

The moment to revisit is when a single machine can no longer hold the countries
being served — and the first step then is not Elasticsearch but partitioning by
country across processes, which the architecture already supports because
searches never cross borders.

---

## 8. Difficulty estimates

| Work | Difficulty | Why |
|---|---|---|
| Currency backfill from retailer country | **LOW** | deterministic, no re-fetch, ~327k rows |
| Persist original price and discount | **LOW** | already parsed, two fields to add |
| Brand, image, SKU from JSON-LD | **LOW** | present 12/12, HTML already in memory |
| Preload countries at startup | **LOW** | a loop over a list, at boot |
| Pagination, retailer filter | **LOW** | in-memory over existing data |
| OpenAPI document | **LOW** | five routes |
| Price history, append-on-change | **LOW to build, MEDIUM to fund** | needs paid storage first |
| Availability extraction | **LOW**; trusting it **MEDIUM** | present but semantically weak |
| Outlier investigation per currency | **MEDIUM** | 57,061 rows above 1000, needs per-currency thresholds |
| Category taxonomy | **MEDIUM-HIGH** | raw breadcrumb is easy, canonical mapping across 49 countries and many languages is not |
| GTIN extraction and validation | **MEDIUM** | three sources, checksum, honest coverage ceiling ~15-25% |
| Package parser to 70-90% | **MEDIUM** | needs the page name persisted, which costs storage |
| Readers for the 38 API-priced retailers | **MEDIUM**, per retailer | `prezzi-api.ts` says fifteen lines each *after* the discovery, and `sonda-prezzo.ts` automates the discovery |
| Canonical product matching | **HIGH** | depends on brand, package and GTIN |
| Per-request usage accounting | **MEDIUM** | needs durable storage and a rollup |

---

## 9. Recommended phases

Four phases. Ordering differs from the roadmap's section 34 for the reasons in
section 0.

### Phase 1 — Stop losing data (days, not weeks)

Everything here is irreversible loss if delayed.

1. **Decide the storage plan.** The database is at 80% of the free tier; history
   cannot start until this is resolved. This is the gate for everything else.
2. **Add extraction to the reader**: original price, discount, brand, image,
   SKU, availability, raw category — all from the JSON-LD already in memory.
   Every page read from that moment forward arrives enriched.
3. **Start append-on-change observations**, in a collection with no TTL.
4. **Backfill currency** from retailer country for the 327,592 rows missing it.

Rationale: after phase 1, the 72-hour read cycle back-fills the whole corpus by
itself. Every day this is postponed is a day of enrichment and history that has
to be paid for later with a separate read campaign.

### Phase 2 — Make the API serviceable (1-2 weeks)

5. Preload countries at startup; raise the in-memory country cap after
   measuring the per-country footprint.
6. Move off the free instance.
7. Pagination, retailer filter, price-range filter.
8. OpenAPI document and durable per-request usage accounting.
9. Investigate the 57,061 outliers per currency before selling those markets.

### Phase 3 — Normalize (3-6 weeks)

10. Persist the page-declared name; push package extraction toward 70%.
11. GTIN extraction from all three sources, with checksum validation and
    honest coverage reporting.
12. Category: store the raw retailer path now, map to a canonical taxonomy
    country by country, starting with the five largest.
13. Readers for the highest-volume of the 38 API-priced retailers — this is the
    cheapest large coverage gain available.

### Phase 4 — Intelligence and distribution (after phase 3 lands)

14. Canonical product matching, country-local first, GTIN-seeded.
15. Price history endpoints and comparison endpoints.
16. Public site, playground, signup, billing.
17. MCP server, calling the same public API.

---

## 10. Quick wins

Each of these is under a day and materially improves the product.

| Win | Effort | Effect |
|---|---|---|
| **Currency backfill** | hours | 20% of the corpus becomes sellable; no re-fetch |
| **Persist `list` / `saving` / `discountPercent`** | hours | promotion data starts accumulating; already parsed today and thrown away on every single read |
| **Brand + image + SKU from JSON-LD** | 1 day | three of the roadmap's "missing" fields, from bytes already in memory |
| **Preload countries at boot** | hours | removes the 35 s first-request penalty |
| **Drop the 30-day TTL awareness into the history design** | minutes | prevents silently deleting the history you just started keeping |
| **Expose `letto` prominently in docs** | hours | the honest-freshness positioning the roadmap asks for, already implemented |
| **English field aliases on `/v1` responses** | 1 day | removes the biggest friction for a non-Italian developer |

---

## 11. Where I disagree with the roadmap

Stated plainly, because the brief asked for it.

**1. "Append-only observation model" as written is ten times more expensive
than it needs to be.** Append on change, with first-seen and last-seen
timestamps, preserves every analytical use case at ~2-4 GB/year instead of
~32 GB/year. Section 3.

**2. Enrichment is not a phase-3 concern.** It is as time-sensitive as history,
because the read cycle that would back-fill it for free is running right now.
Section 0.2.

**3. The brand pipeline is over-engineered for the evidence.** JSON-LD covers
12/12 retailers. Build stage one, measure, then decide. Do not write the LLM
fallback. Section 4.

**4. GTIN's value is overstated without a number.** Realistic coverage is
15-25%, not near-universal. Enough to seed matching, not enough to sell as a
lookup feature. Say so publicly rather than discovering it in a sales call.

**5. The roadmap omits the single biggest coverage opportunity.** 42 retailers,
~600,000 grocery items, live pages, prices served from APIs, four readers
written and thirty-eight to go. Section 0.3.

**6. "Historical Price API" for fintech and economic data needs a granularity
caveat.** 3-7 day resolution, not daily. Same discipline as not claiming
real-time.

**7. The database being at 80% of a free tier is a blocker, not a detail.**
The roadmap's Priority 0 cannot begin until it is resolved, and the roadmap
does not mention it.

---

## 12. Answer to section 42

> Can we start storing historical price observations and current
> promotional/full-price fields without breaking the existing API?

**Yes to both, and the promotional fields are the easier half.**

Original price, saving, discount percentage and offer expiry are **already
parsed** by `price-page.ts` on every page read and discarded because
`PrezzoDoc` has nowhere to put them. Adding them is two fields on the document
and two lines in each of the mappings in `prezzi-magazzino.ts`. Nothing in the
read path or the response shape changes.

History is equally additive — a new collection, written beside `prezzi`,
touching neither `prezziGiaVisti()` nor `contratto-v1.ts`.

**The only thing standing in the way is storage.** Resolve the database plan
first; then both changes are a day's work, and the read cycle back-fills the
corpus by itself.
