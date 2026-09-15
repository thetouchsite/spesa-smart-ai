/**
 * Build-time generator for the multilingual ingredient → catalog-key map.
 *
 * Source: Open Food Facts "ingredients" taxonomy (open data, ODbL).
 *   https://static.openfoodfacts.org/data/taxonomies/ingredients.json
 *
 * Why generated and not fetched at runtime: the taxonomy is ~3.2 MB and
 * covers 6.4k ingredients across every language. We only care about terms
 * that resolve to one of the 120 rows in `price-data/sources/manual/catalog.ts`,
 * which compresses to a few KB — small enough to ship inside a mobile bundle
 * and fast enough to resolve synchronously with no network call.
 *
 * Run:  node scripts/build-ingredient-map.mjs
 * Out:  src/lib/price-data/ingredient-map.generated.ts
 *
 * Re-run whenever the catalog gains rows or a new UI language is added.
 */

import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TAXONOMY_URL = "https://static.openfoodfacts.org/data/taxonomies/ingredients.json";
const CATALOG_PATH = join(ROOT, "src/lib/price-data/sources/manual/catalog.ts");
const OUT_PATH = join(ROOT, "src/lib/price-data/ingredient-map.generated.ts");

/** UI languages from `src/lib/i18n/translations.ts`. English is the catalog's
 *  own language and is matched directly, so it is not emitted here. */
const LANGS = ["it", "fr", "es", "de"];

// ─── Shared normalisation (kept byte-identical to resolve-ingredient.ts) ───

function normalise(s) {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Crude stemmer: strips English plurals and Romance-language plural/gender
 *  endings. Deliberately naive — it only has to collapse "carote"/"carota"
 *  and "onions"/"onion" onto a shared key, not to be linguistically correct. */
function stem(w) {
  if (w.length <= 3) return w;
  if (w.endsWith("es") && w.length > 5) return w.slice(0, -2);
  if (w.endsWith("s") && w.length > 4) return w.slice(0, -1);
  if (/[ieao]$/.test(w) && w.length > 4) return w.slice(0, -1);
  return w;
}

/** Words that qualify an ingredient without identifying it. A match must
 *  never be decided by these alone — that is what produced "latte intero"
 *  → "whole chicken" and "panna" → "fresh herbs". */
const QUALIFIERS = new Set([
  "fresh", "dried", "whole", "ground", "chopped", "sliced", "grated", "canned",
  "cooked", "raw", "extra", "virgin", "free", "range", "mixed", "fine",
  "large", "small", "baby", "organic", "peeled", "frozen", "smoked", "lean",
  "red", "green", "black", "white", "yellow",
]);

/** Function words dropped before matching, per language. */
const STOPWORDS = new Set([
  "di", "del", "della", "dei", "delle", "al", "alla", "in", "con", "da", "per", "e",
  "de", "du", "des", "la", "le", "les", "au", "aux", "et", "a",
  "el", "los", "las", "y", "con",
  "der", "die", "das", "und", "mit", "vom",
  "of", "the", "and", "with",
  "gr", "g", "kg", "ml", "cl",
]);

function tokens(s, dropQualifiers = false) {
  const all = normalise(s)
    .split(" ")
    .filter((t) => t && !STOPWORDS.has(t))
    .map(stem);
  if (!dropQualifiers) return all;
  const qualifierStems = new Set([...QUALIFIERS].map(stem));
  const core = all.filter((t) => !qualifierStems.has(t));
  return core.length > 0 ? core : all;
}

// ─── Catalog ──────────────────────────────────────────────────────────

function readCatalog() {
  const src = readFileSync(CATALOG_PATH, "utf8");
  const rows = [...src.matchAll(/\{ key: "([a-z_0-9]+)",\s*name: "([^"]+)"/g)];
  if (rows.length === 0) throw new Error("catalog.ts: no rows parsed — did the format change?");
  return rows.map((m) => ({ key: m[1], name: m[2] }));
}

/** Score an English ingredient name against the catalog. Requires at least one
 *  shared CORE noun so an adjective can never carry the match on its own. */
function matchCatalog(englishName, catalog) {
  const all = new Set(tokens(englishName));
  const core = new Set(tokens(englishName, true));
  if (core.size === 0) return null;
  let best = null;
  let bestScore = 0;
  for (const row of catalog) {
    const rowAll = new Set(tokens(row.name));
    const rowCore = new Set(tokens(row.name, true));
    const coreOverlap = [...core].filter((t) => rowCore.has(t)).length;
    if (coreOverlap === 0) continue;
    const allOverlap = [...all].filter((t) => rowAll.has(t)).length;
    const score =
      allOverlap / Math.max(all.size, rowAll.size) +
      0.5 * (coreOverlap / Math.max(core.size, rowCore.size));
    if (score > bestScore) {
      bestScore = score;
      best = row.key;
    }
  }
  return bestScore >= 0.4 ? best : null;
}

// ─── Build ────────────────────────────────────────────────────────────

async function main() {
  const catalog = readCatalog();
  console.log(`catalog: ${catalog.length} rows`);

  console.log(`fetching ${TAXONOMY_URL} …`);
  const res = await fetch(TAXONOMY_URL);
  if (!res.ok) throw new Error(`taxonomy fetch failed: HTTP ${res.status}`);
  const taxonomy = await res.json();
  console.log(`taxonomy: ${Object.keys(taxonomy).length} entries`);

  /** normalised foreign term → catalog key */
  const map = new Map();
  const perLang = Object.fromEntries(LANGS.map((l) => [l, 0]));

  for (const entry of Object.values(taxonomy)) {
    const names = entry?.name;
    if (!names?.en) continue;
    const key = matchCatalog(names.en, catalog);
    if (!key) continue;

    for (const lang of LANGS) {
      const term = names[lang];
      if (!term) continue;
      // Index the full term, the stopword-stripped form, and the core-noun
      // form, so "olio d'oliva", "olio oliva" and "oliva" all resolve.
      const variants = [
        normalise(term),
        tokens(term).join(" "),
        tokens(term, true).join(" "),
      ];
      for (const v of variants) {
        if (!v) continue;
        if (!map.has(v)) {
          map.set(v, key);
          perLang[lang] += 1;
        }
      }
    }
  }

  console.log("terms indexed per language:", perLang);
  console.log(`total terms: ${map.size}`);

  const sorted = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  const body = sorted.map(([term, key]) => `  ${JSON.stringify(term)}: "${key}",`).join("\n");

  const out = `/* eslint-disable */
/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 * Regenerate with: node scripts/build-ingredient-map.mjs
 *
 * Maps normalised non-English ingredient terms to a canonical catalog key
 * from \`price-data/sources/manual/catalog.ts\`.
 *
 * Derived from the Open Food Facts ingredients taxonomy (ODbL licence,
 * https://openfoodfacts.org). Languages: ${LANGS.join(", ")}.
 * ${sorted.length} terms · generated ${new Date().toISOString().slice(0, 10)}
 */

export const GENERATED_INGREDIENT_MAP: Record<string, string> = {
${body}
};
`;

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, out, "utf8");
  console.log(`wrote ${OUT_PATH} (${(out.length / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
