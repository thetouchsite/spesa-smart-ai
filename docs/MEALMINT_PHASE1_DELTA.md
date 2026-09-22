# MealMint — Phase 1 Implementation Delta

Answer to `MEALMINT_MASTER_BRIEF.md` §70. Nothing in this document has been
implemented. It exists to be approved, rejected or amended first.

Measured against the live database on **23 September 2026**.

---

## 1. What changed since the technical audit

Almost nothing, which is itself the point.

| | 22 Sep (audit) | 23 Sep (now) | |
|---|---:|---:|---|
| `prezzi` rows | 1,655,602 | 1,664,311 | +8,709 |
| Database total | 410 MB | **412 MB** | of 512 MB free tier |
| `osservazioni` collection | absent | **absent** | history still not accumulating |
| 30-day TTL on `prezzi.t` | present | **present** | still a trap for history |
| Compliance fields on `fonti` | `esclusa`, `nota` | unchanged | no jurisdiction, no split statuses |

Repository commits since the audit are Antonio's reader work plus one fix of
mine (empty product name). **No Phase 1 work has started.**

Two days of reading produced 8,709 net new prices — the warehouse is close to
saturation against the 72-hour cycle, which means the read capacity is now
available for enrichment rather than growth.

---

## 2. The finding that changes the Phase 1 design

The brief (§19) says to persist eleven enrichment fields "during the existing
page read". Costed against the current record, that is the most expensive part
of Phase 1 — more expensive than the history it prioritises.

Current `prezzi` document: **77 bytes**.

| Field | Type | Cost/row | Changes on re-read? |
|---|---|---:|---|
| list price | number | ~11 B | yes |
| discount % | number | ~8 B | yes |
| availability | number | ~8 B | yes |
| **subtotal, numeric** | | **~27 B** | |
| brand | text | ~25 B | ~never |
| retailer SKU | text | ~22 B | never |
| page product name | text | ~50 B | ~never |
| raw category / breadcrumb | text | ~60 B | ~never |
| image URL | text | ~90 B | ~never |
| **subtotal, text** | | **~247 B** | |

Putting all eleven in `prezzi` takes it from 77 to ~350 bytes — **1,664,311 rows
× 350 B ≈ 580 MB of data plus a similar index**, against today's 121 MB + 122 MB.
It quadruples the hot collection that Antonio deliberately compacted, and it
does so with fields that **never change between reads**.

### Proposal: split by volatility, not by topic

```
prezzi          hot, compact, rewritten every read      (+27 B/row)
schede          descriptive, written once, rarely touched
osservazioni    append-on-change price history
```

This is the same reasoning that produced the 77-byte record: the reader touches
`prezzi` 500,000 times a day and `schede` almost never after the first read.

| Collection | Rows after first cycle | Data | Index | Total |
|---|---:|---:|---:|---:|
| `prezzi` (grown) | 1.66 M | ~166 MB | ~130 MB | ~296 MB |
| `schede` (new) | 1.66 M | ~415 MB | ~30 MB | ~445 MB |
| `osservazioni` (new) | 1.66 M initial | ~170 MB | ~85 MB | ~255 MB |
| `cataloghi` etc. (unchanged) | | ~170 MB | ~1 MB | ~171 MB |
| **Total** | | | | **~1.17 GB** |

Then growing at **~2–3 GB/year** of observations, matching the brief's estimate.

### A number the brief does not have

The first observation for every offer is a write with nothing to compare
against. That is **~255 MB written once**, before any actual price change is
recorded. It lands during the first 72-hour cycle after Phase 1 ships.

So the storage requirement is not "2–4 GB/year eventually". It is
**~1.2 GB within the first week**, then 2–3 GB/year.

---

## 3. Database plan required

**The free tier cannot hold Phase 1.** 412 MB of 512 MB today; ~1.17 GB needed
within a week of shipping.

| Option | Storage | Cost | Verdict |
|---|---|---|---|
| Atlas M0 (current) | 512 MB | free | **insufficient — blocks Phase 1** |
| Atlas Flex / M2 | 2 GB | ~9 €/mo | holds year one, tight by month 6 |
| **Atlas M10** | **10 GB** | **~57 €/mo** | **recommended — 3+ years of headroom** |
| Atlas M20 | 20 GB | ~150 €/mo | premature |

Recommendation: **M10**. M2 saves 48 €/month and buys a migration in six
months, during which the collection is live and growing.

This is the only decision in Phase 1 that is not an engineering task, and
everything else waits on it.

---

## 4. Schema changes

### 4.1 `prezzi` — three numeric fields added

`server/src/base/db.ts`, `PrezzoDoc`:

```ts
export interface PrezzoDoc {
  _id: string;   // unchanged — 96-bit hash of the URL
  p: number | null;
  v: string;
  s: number;
  t: Date;
  c: number;
  // added:
  l?: number;    // list/original price when the page declares a promotion
  sc?: number;   // discount percentage, rounded
  av?: 0 | 1 | 2 | 3;  // 0 unknown, 1 in stock, 2 out, 3 limited
}
```

All three optional. **Absent means "not observed", never "zero".** Existing
documents remain valid without migration.

### 4.2 `schede` — new collection

```ts
export interface SchedaDoc {
  _id: string;   // the SAME offer id as prezzi._id — join key, no extra index
  n?: string;    // product name as the page declares it
  b?: string;    // brand, from JSON-LD
  sk?: string;   // retailer SKU, from JSON-LD
  im?: string;   // image URL, from JSON-LD or og:image
  cr?: string;   // raw retailer category / breadcrumb path
  fo?: string;   // provenance: "jsonld" | "og" | "microdata" | "url"
  t: Date;       // when these fields were last observed
}
```

`fo` is the brief's provenance requirement (§39) at field-set level. A
per-field provenance map was considered and rejected for Phase 1: it triples
the document size for information nobody consumes yet. It can be added later
without migration.

**No TTL on this collection.**

### 4.3 `osservazioni` — new collection, append on change

```ts
export interface OsservazioneDoc {
  _id: ObjectId;
  o: string;      // offer id = prezzi._id
  p: number | null;
  l?: number;     // list price at the time
  v: string;
  t: Date;        // first seen at this state
  u: Date;        // last seen at this state
}
```

**No TTL on this collection.** This is the brief's §18 rule, and the reason it
exists: `prezzi.t` carries a 30-day TTL, and copying that index here would
silently delete the history within a month.

---

## 5. Indexes

| Collection | Index | Why |
|---|---|---|
| `prezzi` | `_id_`, `c_1_t_-1`, `t_1` (TTL 30d) | **unchanged** |
| `schede` | `_id_` only | joined by offer id; no other access pattern in Phase 1 |
| `osservazioni` | `_id_` | |
| `osservazioni` | `{ o: 1, t: -1 }` | the only query: this offer's history, newest first |

`schede` deliberately has no secondary index. Searching by brand is a Phase 3
concern and adding the index now costs ~40 MB for a query nobody makes.

**Explicitly not created:** any TTL index on `schede` or `osservazioni`.

---

## 6. Files touched

| File | Change | Size |
|---|---|---|
| `src/base/db.ts` | three fields on `PrezzoDoc`; `SchedaDoc` and `OsservazioneDoc`; accessors `schede()` and `osservazioni()` | ~60 lines |
| `src/api/price-page.ts` | extend `PagePrice` with brand, sku, image, availability, category; one JSON-LD reader working on the slice `porzioneConPrezzi()` already produces | ~150 lines |
| `src/api/prezzi-magazzino.ts` | `salvaPrezzi()` (line 283): read the batch's current state, write `prezzi` as now, write `schede` on change, append `osservazioni` on change | ~90 lines |
| `src/api/prezzi-magazzino.ts` | `PrezzoSalvato` gains the new optional fields | ~10 lines |
| `src/api/prices-catalogo.ts` | pass the new fields through when saving; prefer `schede.n` for the product name | ~20 lines |
| `scripts/valuta-mancante.ts` | **new** — currency backfill, one-off | ~80 lines |
| `scripts/copertura-campi.ts` | **new** — enrichment coverage metrics (brief §60) | ~60 lines |

Nothing in `contratto-v1.ts`, `index.ts` or `mobile/` is touched in Phase 1.

### The extraction point

`porzioneConPrezzi()` already slices out every `application/ld+json` block —
it was written that way because Coop hides its price at byte 838,000. The new
reader parses those blocks for `Product`, and takes `brand`, `sku`, `image`,
`offers.availability`, `category`. Probe result across twelve retailers in
eight countries: brand 12/12, image 12/12, sku 12/12, availability 11/12.

**No new page fetch. No retailer-specific code for these five fields.**

---

## 7. Append-on-change, concretely

`salvaPrezzi()` receives batches of 200 (`BLOCCO` in `prezzi-continuo.ts:108`).

```
1. find({_id: {$in: [...200 ids]}})         one indexed read, ~2 ms
2. for each row:
     state = (p, l, v)
     if no previous row              → write prezzi, write schede,
                                       append osservazione {t: now, u: now}
     if state unchanged              → write prezzi, update the open
                                       osservazione's u = now
     if state changed                → write prezzi, close the previous
                                       (u = now), append a new osservazione
     schede written only if a field differs from what is stored
3. three bulkWrites instead of one
```

Cost: one extra indexed read and two extra bulk writes per 200 pages. The
reader currently opens 200 pages in roughly 5 seconds; this adds single-digit
milliseconds.

**The "unchanged" branch is the common one** — that is the whole point of
append-on-change, and it is a field update on one document, not an insert.

---

## 8. API compatibility

**No breaking change. No response-shape change. No client change.**

| Surface | Impact |
|---|---|
| `/v1/offerte` | none — `contratto-v1.ts` untouched |
| `/v1/prodotti`, `/v1/negozi`, `/v1/copertura`, `/v1/stato` | none |
| `/v1/prezzi` legacy alias | none |
| `mobile/` | none |
| `prezziGiaVisti()` signature | unchanged; returns the same shape with new optional fields populated |

The new fields are **stored but not exposed** in Phase 1. Exposing them is a
Phase 2 decision that belongs with the English alias layer, so the public
contract changes once rather than twice.

One improvement arrives for free: `prices-catalogo.ts` currently falls back to
the sitemap-derived name when serving from the warehouse. With `schede.n`
populated it can serve the page-declared name — `Latte intero UHT 1 l` instead
of `latte-intero` — which also lifts package extraction above today's 30%.

---

## 9. Migration and backfill

**Nothing is migrated. Nothing is rewritten. Nothing is deleted.**

- Existing `prezzi` documents stay byte-for-byte as they are. The three new
  fields are optional; absent means not observed.
- `schede` and `osservazioni` start empty.
- The **72-hour read cycle backfills both by itself**. Within one cycle every
  actively-read offer has a `schede` row and an opening `osservazioni` row.
- The one exception is the **currency backfill**, which is a deliberate
  one-off write over ~327,000 rows that are missing `v`. It is deterministic
  (retailer → country → ISO 4217) and reversible: it only ever fills a field
  that is empty.

If Phase 1 has to be rolled back, deleting the two new collections and ignoring
three optional fields restores the previous state exactly.

---

## 10. Compliance metadata

Per the brief's §32 as amended in this conversation. Added to `FonteDoc` in
`src/base/db.ts`:

```ts
// replaces the single `esclusa` kill-switch, which stays as-is and keeps working
giurisdizione?: string;          // ISO country whose law governs the source
raccolta?: "ATTIVA" | "SOSPESA" | "MAI";
esposizione?: "ABILITATA" | "RICHIEDE_REVISIONE" | "DISABILITATA";
fonteTipo?: "HTML" | "JSON_LD" | "API_FRONTEND" | "API_UFFICIALE" | "FEED";
robots?: "ALLOW" | "DISALLOW" | "PARZIALE" | "IGNOTO";
termini?: "RIVISTI" | "NON_RIVISTI";
riusoCommerciale?: "VERDE" | "GIALLO" | "ROSSO";
controllatoIl?: Date;
```

Four points, reflecting the corrections agreed in this conversation:

1. **Collection and exposure are separate states.** A retailer can be
   `raccolta: ATTIVA` while `esposizione: RICHIEDE_REVISIONE` — read it for our
   own app, do not sell it yet. The single `esclusa` flag cannot express this.
2. **`giurisdizione` is mandatory**, because the EU matrix does not describe
   the ~15 non-EU countries in the catalogue.
3. **`VERDE` means "no evident issue under current internal review"**, not
   "legally safe". The field name must never be read as a legal conclusion.
4. **Default for every existing row: `termini: NON_RIVISTI`,
   `esposizione: RICHIEDE_REVISIONE`.** All 251 of them. That is the honest
   starting state, and it makes the review backlog visible instead of implied.

`esclusa` is kept and keeps working as the global kill-switch
(`catalogo-fonti.ts:138`). The new fields refine it; they do not replace it.

### One addition to the brief's six changes

The API still opens retailer pages **at request time** when the warehouse has
no price (`prices-catalogo.ts:665`). That path translates a user's query into
a live fetch against the source — the one part of MealMint that genuinely
resembles the Innoweb shape.

Filling the warehouse and retiring that fallback is the same action for three
reasons at once: latency (171 s → 1 s, measured), cost, and source exposure.
It belongs in the brief's risk register as a reason Phase 1 and Phase 2 matter
beyond performance.

---

## 11. What I recommend we do NOT do in Phase 1

- **No per-field provenance map.** Triples `schede`; nobody consumes it yet.
- **No brand dictionary, no fuzzy matching, no LLM fallback.** JSON-LD covers
  12/12 in the probe. Ship stage one, measure the miss rate on real data,
  decide then.
- **No canonical taxonomy.** Store the raw breadcrumb; mapping is Phase 3.
- **No secondary index on `schede`.** ~40 MB for a query nobody makes.
- **No exposure of the new fields in `/v1`.** One contract change in Phase 2,
  not two.
- **No touching `cataloghi`.** The gzipped-blob design is right and orthogonal.

---

## 12. Decisions required before any code is written

1. **The database plan.** M10 at ~57 €/month is the recommendation. Nothing in
   Phase 1 can start on the free tier. *This is the only blocking decision.*
2. **Approve the three-collection split** (`prezzi` / `schede` /
   `osservazioni`) instead of the brief's single enriched record.
3. **Approve the compliance field set**, and accept that every one of the 251
   retailers starts at `NON_RIVISTI` / `RICHIEDE_REVISIONE`.
4. **Confirm the currency backfill may write** to ~327,000 existing rows. It
   only fills empty fields, but it is the one non-additive operation in
   Phase 1.

Items 2–4 are reversible. Item 1 is a recurring cost.
