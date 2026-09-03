/**
 * Multilingual ingredient resolver.
 *
 * PROBLEM THIS SOLVES
 * -------------------
 * The grocery list is recipe-driven, so its rows carry ingredient names in
 * the USER'S language ("Pomodori pelati", "Petto di pollo"). The manual price
 * catalog and its matcher are English-only ("Tomatoes", "Chicken breast").
 * With no bridge between the two, an Italian user's basket resolved to
 * `tier: "missing"` on nearly every row, which made `savingsAvailable` false
 * and blanked out savings, score, supermarket comparison and cost-per-person.
 *
 * HOW IT WORKS
 * ------------
 * `GENERATED_INGREDIENT_MAP` maps normalised non-English terms onto canonical
 * catalog keys. It is generated at build time from the Open Food Facts
 * ingredients taxonomy (see `scripts/build-ingredient-map.mjs`) and covers
 * it / fr / es / de. `MANUAL_OVERRIDES` fills the gaps the taxonomy misses —
 * mostly everyday Italian produce that OFF only carries in the singular, or
 * not at all.
 *
 * Resolution is synchronous, offline and allocation-light: no network call,
 * no API key. English input is left alone — callers fall through to the
 * existing English token matcher.
 *
 * KEEP IN SYNC: `normalise`, `stem` and `tokens` below must stay identical to
 * the copies in `scripts/build-ingredient-map.mjs`, or generated keys will not
 * be found at lookup time.
 */

import { GENERATED_INGREDIENT_MAP } from "./ingredient-map.generated";
import { CATALOG_BY_KEY } from "./sources/manual/catalog";

export function normalise(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Crude stemmer: strips English plurals and Romance plural/gender endings.
 *  Deliberately naive — it only has to collapse "carote"/"carota" and
 *  "onions"/"onion" onto a shared key, not to be linguistically correct. */
function stem(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith("es") && w.length > 5) return w.slice(0, -2);
  if (w.endsWith("s") && w.length > 4) return w.slice(0, -1);
  if (/[ieao]$/.test(w) && w.length > 4) return w.slice(0, -1);
  return w;
}

const QUALIFIERS = new Set([
  // English
  "fresh", "dried", "whole", "ground", "chopped", "sliced", "grated", "canned",
  "cooked", "raw", "extra", "virgin", "free", "range", "mixed", "fine",
  "large", "small", "baby", "organic", "peeled", "frozen", "smoked", "lean",
  "red", "green", "black", "white", "yellow",
  // Italiano — senza questi, "parmigiano grattugiato" non riduce mai al
  // sostantivo e non trova l'eccezione registrata su "parmigiano".
  "fresco", "fresca", "freschi", "fresche", "secco", "secca", "secchi",
  "intero", "intera", "interi", "macinato", "macinata", "grattugiato",
  "grattugiata", "tritato", "tritata", "affettato", "pelati", "pelato",
  "misto", "mista", "misti", "miste", "surgelato", "surgelati", "biologico",
  "rosso", "rossa", "rossi", "rosse", "verde", "verdi", "nero", "nera", "neri",
  "bianco", "bianca", "bianchi", "fino", "grosso",
  // Français / Español / Deutsch
  "frais", "fraiche", "seche", "moulu", "rape", "entier", "entiere",
  "fresco", "seco", "molido", "rallado", "entero", "picado",
  "frisch", "getrocknet", "gemahlen", "gerieben", "ganz",
]);

const STOPWORDS = new Set([
  "di", "del", "della", "dei", "delle", "al", "alla", "in", "con", "da", "per", "e",
  "de", "du", "des", "la", "le", "les", "au", "aux", "et", "a",
  "el", "los", "las", "y",
  "der", "die", "das", "und", "mit", "vom",
  "of", "the", "and", "with",
  "gr", "g", "kg", "ml", "cl",
]);

const QUALIFIER_STEMS = new Set([...QUALIFIERS].map(stem));

function tokens(s: string, dropQualifiers = false): string[] {
  const all = normalise(s)
    .split(" ")
    .filter((t) => t && !STOPWORDS.has(t))
    .map(stem);
  if (!dropQualifiers) return all;
  const core = all.filter((t) => !QUALIFIER_STEMS.has(t));
  return core.length > 0 ? core : all;
}

/**
 * Hand-maintained overrides, applied BEFORE the generated map.
 *
 * Two kinds of entry live here:
 *   1. Terms the OFF taxonomy simply lacks in a given language — Italian
 *      plurals such as "zucchine", "patate", "ceci", "mele" are the common
 *      case, and they are exactly the everyday items a shopping list is
 *      full of.
 *   2. Terms the taxonomy resolves too generically. "Olio extra vergine di
 *      oliva" collapses to plain "oil" upstream, which then scored against
 *      "Sunflower oil" — a wrong price on a very common row.
 *
 * Keys must already be normalised (lowercase, unaccented, punctuation
 * stripped). Values must be keys from `catalog.ts`.
 */
const MANUAL_OVERRIDES: Record<string, string> = {
  // ── Italiano — ortaggi e frutta al plurale ──────────────────────────
  zucchine: "zucchini",
  zucchina: "zucchini",
  melanzane: "eggplant",
  melanzana: "eggplant",
  patate: "potatoes",
  patata: "potatoes",
  "patate dolci": "sweet_potatoes",
  mele: "apples",
  mela: "apples",
  banane: "bananas",
  banana: "bananas",
  arance: "oranges",
  arancia: "oranges",
  pere: "pears",
  pera: "pears",
  pesche: "peaches",
  pesca: "peaches",
  fragole: "strawberries",
  fragola: "strawberries",
  mirtilli: "blueberries",
  lamponi: "raspberries",
  uva: "grapes",
  anguria: "watermelon",
  melone: "melon",
  avocado: "avocado",
  limoni: "lemons",
  cetriolo: "cucumber",
  cetrioli: "cucumber",
  "peperone rosso": "bell_peppers",
  "pomodorini": "cherry_tomatoes",
  "pomodori ciliegino": "cherry_tomatoes",
  broccoli: "broccoli",
  cavolfiore: "cauliflower",
  cavolo: "cabbage",
  verza: "cabbage",
  "cavolo nero": "kale",
  rucola: "rocket",
  "insalata": "salad_greens",
  "insalata mista": "salad_greens",
  lattuga: "salad_greens",
  "fagiolini": "green_beans",
  piselli: "peas",
  mais: "corn",
  porro: "leek",
  porri: "leek",
  asparagi: "asparagus",
  finocchio: "seasonal_veg",

  // ── Italiano — dispensa e proteine ──────────────────────────────────
  uova: "eggs",
  uovo: "eggs",
  ceci: "chickpeas",
  "ceci secchi": "chickpeas",
  lenticchie: "red_lentils",
  fagioli: "black_beans",
  "fagioli rossi": "kidney_beans",
  "olio di oliva": "olive_oil",
  "olio d oliva": "olive_oil",
  "olio extra vergine di oliva": "olive_oil",
  "olio extravergine di oliva": "olive_oil",
  "olio evo": "olive_oil",
  "olio di semi": "sunflower_oil",
  "olio di semi di girasole": "sunflower_oil",
  parmigiano: "parmesan",
  "parmigiano reggiano": "parmesan",
  "grana padano": "parmesan",
  pecorino: "parmesan",
  "pane integrale": "wholegrain_bread",
  "pane bianco": "white_bread",
  "pane in cassetta": "white_bread",
  "pangrattato": "white_bread",
  "petto di tacchino": "chicken_breast",
  "cosce di pollo": "chicken_thighs",
  "sovracosce di pollo": "chicken_thighs",
  "pollo intero": "whole_chicken",
  "carne macinata": "beef_mince",
  "macinato di manzo": "beef_mince",
  "lonza di maiale": "pork_loin",
  salsiccia: "sausages",
  salsicce: "sausages",
  pancetta: "bacon",
  "prosciutto crudo": "ham",
  gamberi: "prawns",
  gamberetti: "prawns",
  "filetto di merluzzo": "white_fish",
  merluzzo: "white_fish",
  "passata di pomodoro": "tomato_sauce",
  passata: "tomato_sauce",
  "pomodori in scatola": "canned_tomatoes",
  "polpa di pomodoro": "canned_tomatoes",
  "brodo vegetale": "stock_cubes",
  dado: "stock_cubes",
  "erbe aromatiche": "fresh_herbs",
  basilico: "fresh_herbs",
  prezzemolo: "fresh_herbs",
  rosmarino: "fresh_herbs",
  salvia: "fresh_herbs",
  timo: "fresh_herbs",
  origano: "dried_herbs",
  "alloro": "dried_herbs",
  spezie: "spices",
  peperoncino: "spices",
  "noce moscata": "spices",
  cannella: "cinnamon",
  paprika: "paprika",
  olive: "olives",
  capperi: "capers",
  "aceto di vino": "vinegar",
  aceto: "vinegar",
  "yogurt bianco": "yogurt",
  ricotta: "ricotta",
  mascarpone: "cream",
  panna: "cream",
  "panna da cucina": "cream",
  "latte scremato": "milk",
  "farina 00": "flour",
  "farina 0": "flour",
  "farina di grano tenero": "flour",
  "farina manitoba": "pizza_flour",
  "semola": "flour",
  spaghetti: "pasta",
  penne: "pasta",
  fusilli: "pasta",
  rigatoni: "pasta",
  tagliatelle: "pasta",
  lasagne: "pasta",
  "riso arborio": "rice",
  "riso carnaroli": "rice",
  "riso basmati": "basmati_rice",
  couscous: "couscous",
  quinoa: "quinoa",
  avena: "oats",
  "fiocchi di avena": "oats",
  "frutta secca": "mixed_nuts",
  mandorle: "almonds",
  noci: "walnuts",
  "burro di arachidi": "peanut_butter",
  "semi misti": "seeds",
  tahina: "tahini",
  "salsa di soia": "soy_sauce",
  "piadine": "tortillas",
  tortillas: "tortillas",
  "pane pita": "pita",
  marmellata: "jam",
  "aceto balsamico": "balsamic_vinegar",
  maionese: "mayo",
  senape: "mustard",
  zucchero: "sugar",
  "zucchero di canna": "sugar",
  sale: "salt",
  "pepe nero": "black_pepper",
  pepe: "black_pepper",
  miele: "honey",
  caffe: "coffee",
  te: "tea",

  // ── Français — lacunes courantes ────────────────────────────────────
  courgettes: "zucchini",
  aubergines: "eggplant",
  "pommes de terre": "potatoes",
  "huile d olive": "olive_oil",
  "pois chiches": "chickpeas",
  lentilles: "red_lentils",

  // ── Español ─────────────────────────────────────────────────────────
  calabacin: "zucchini",
  berenjena: "eggplant",
  patatas: "potatoes",
  "aceite de oliva": "olive_oil",
  garbanzos: "chickpeas",
  lentejas: "red_lentils",

  // ── Deutsch ─────────────────────────────────────────────────────────
  zucchini: "zucchini",
  aubergine: "eggplant",
  kartoffeln: "potatoes",
  olivenol: "olive_oil",
  kichererbsen: "chickpeas",
  linsen: "red_lentils",
};

/**
 * Overrides indexed under every form a lookup can take — raw, stopword-stripped
 * and core-noun — all stemmed the same way as the query. Without this the table
 * is written in dictionary form ("parmigiano") while lookups arrive stemmed
 * ("parmigian"), and the entry silently never fires.
 */
const OVERRIDE_INDEX: Record<string, string> = (() => {
  const idx: Record<string, string> = {};
  for (const [term, key] of Object.entries(MANUAL_OVERRIDES)) {
    for (const form of [normalise(term), tokens(term).join(" "), tokens(term, true).join(" ")]) {
      if (form && !idx[form]) idx[form] = key;
    }
  }
  return idx;
})();

/** Candidate lookup forms for a free-text ingredient name, most specific first. */
function candidates(raw: string): string[] {
  // Drop any leading quantity ("400 g pomodori pelati" → "pomodori pelati").
  const cleaned = normalise(raw).replace(/^[\d.,/ ]+/, "").trim();
  const out = [cleaned, tokens(cleaned).join(" "), tokens(cleaned, true).join(" ")];
  return [...new Set(out.filter(Boolean))];
}

/**
 * Resolve a possibly non-English ingredient name to a canonical catalog key.
 * Returns null for English input (or anything unrecognised) so callers keep
 * using the existing English matcher.
 */
export function resolveIngredientKey(ingredient: string): string | null {
  if (!ingredient) return null;

  for (const c of candidates(ingredient)) {
    const override = OVERRIDE_INDEX[c];
    if (override) return override;
    const generated = GENERATED_INGREDIENT_MAP[c];
    if (generated) return generated;
  }

  // Last resort: try individual words, longest first, so "petto pollo" still
  // resolves via "pollo" when the phrase itself is unknown. Single tokens are
  // ambiguous, so qualifiers are excluded from this pass.
  const words = [...new Set(tokens(ingredient, true))].sort((a, b) => b.length - a.length);
  for (const w of words) {
    if (w.length < 4) continue;
    const hit = OVERRIDE_INDEX[w] ?? GENERATED_INGREDIENT_MAP[w];
    if (hit) return hit;
  }

  return null;
}

/**
 * Resolve an ingredient name to the catalog row's ENGLISH name, which is what
 * the price rows are keyed on. Returns null when unresolved.
 */
export function resolveIngredientEnglishName(ingredient: string): string | null {
  const key = resolveIngredientKey(ingredient);
  if (!key) return null;
  return CATALOG_BY_KEY[key]?.name ?? null;
}
