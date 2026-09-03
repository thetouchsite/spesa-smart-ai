/** Recipe engine orchestrator.
 *
 *  Waterfall (v3 — chef-enhanced):
 *    1. Cache (localStorage).
 *    2. Local cuisine-tagged DB (`./local-db`).
 *    3. Chef AI Enhancement (rewrites title/description/steps only).
 *    4. Web extraction (real recipe sites → AI extraction).
 *    5. Chef AI Enhancement on the web result.
 *    6. AI fallback (schema-locked generation).
 *    7. Chef AI Enhancement on the AI fallback.
 *    8. Last-ditch minimal recipe so the UI never breaks.
 *
 *  HARD INVARIANT: the ingredient array, servings, nutrition and
 *  allergens returned by tiers 2/4/6 are the ONLY sources of truth for
 *  the grocery aggregator, pricing engine and savings calculation. The
 *  chef step re-attaches these fields byte-identical from the base
 *  recipe — the model is not allowed to touch them. */

import type { Recipe } from "./types";
import { unsplashFoodImage } from "./unsplash";
import { searchGoogleRecipe } from "./google-recipe-search";
import { generateAiRecipe } from "./ai-recipe.functions";
import { enhanceRecipeAsChef } from "./chef-enhance.functions";
import { findLocalRecipe, cuisineForStyle, type LocalCuisine } from "./local-db";
import { buildDeterministicRecipe } from "./deterministic-recipe";

export type { Recipe, RecipeIngredient, RecipeNutrition } from "./types";

const CACHE_PREFIX = "spesa.recipe.v4::";
const CACHE_VERSION = 4;

function cacheKey(dish: string, servings: number, lang: string, cuisine?: string | null) {
  return `${CACHE_PREFIX}${lang}::${cuisine || "any"}::${servings}::${dish.toLowerCase().trim()}`;
}

function readCache(key: string): Recipe | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v: number; r: Recipe };
    if (parsed.v !== CACHE_VERSION) return null;
    return parsed.r;
  } catch {
    return null;
  }
}

function writeCache(key: string, recipe: Recipe) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify({ v: CACHE_VERSION, r: recipe }));
  } catch { /* quota — best effort */ }
}

function scaleRecipe(r: Recipe, targetServings: number): Recipe {
  if (r.servings === targetServings || r.servings <= 0) return { ...r, servings: targetServings };
  const mul = targetServings / r.servings;
  return {
    ...r,
    servings: targetServings,
    ingredients: r.ingredients.map((i) => ({ name: i.name, quantity: scaleQty(i.quantity, mul) })),
  };
}

function scaleQty(qty: string, mul: number): string {
  const m = qty.match(/^([\d.,]+)\s*(.*)$/);
  if (!m) return qty;
  const n = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(n)) return qty;
  const unit = m[2] || "";
  const s = n * mul;
  const r = s >= 10 ? Math.round(s) : Math.round(s * 10) / 10;
  return `${r}${unit ? " " + unit : ""}`;
}

/** A "real" recipe must have a meaningful ingredient list AND method, plus
 *  basic nutrition. Anything sparser is treated as a partial result so the
 *  next provider in the chain gets a chance to return something cookable. */
function isComplete(r: Recipe | null): r is Recipe {
  if (!r) return false;
  if (r.ingredients.length < 4) return false;
  if (r.steps.length < 3) return false;
  if (!r.nutrition || !(r.nutrition.calories > 0)) return false;
  return true;
}

function fallbackRecipe(dish: string, servings: number, lang = "en"): Recipe {
  return buildDeterministicRecipe(dish, { servings, language: lang });
}

export interface GetRecipeOptions {
  servings?: number;
  language?: string;
  country?: string;
  city?: string;
  mealType?: "breakfast" | "lunch" | "dinner" | "snack";
  allergies?: string[];
  /** UI style label (e.g. "Italian", "Japanese Inspired", "Family Budget"). */
  style?: string;
  /** Pre-resolved cuisine bucket. Overrides `style` if provided. */
  cuisine?: LocalCuisine | null;
}

function resolveCuisine(opts: GetRecipeOptions): LocalCuisine | null {
  if (opts.cuisine !== undefined) return opts.cuisine;
  if (opts.style) return cuisineForStyle(opts.style);
  return null;
}

/** Apply Chef AI Enhancement without mutating ingredients/nutrition/allergens.
 *  If enhancement fails, the base recipe is returned untouched — savings
 *  and grocery aggregation are unaffected either way. */
/** Chef enhancement is cosmetic — never let it stall recipe resolution.
 *  If it takes longer than this, the base recipe (identical ingredients,
 *  nutrition and allergens) is used instead. */
const CHEF_TIMEOUT_MS = 6_000;

function withChefTimeout(base: Recipe, p: Promise<Recipe>): Promise<Recipe> {
  return new Promise<Recipe>((resolve) => {
    const timer = setTimeout(() => resolve(base), CHEF_TIMEOUT_MS);
    p.then((r) => { clearTimeout(timer); resolve(r); })
      .catch(() => { clearTimeout(timer); resolve(base); });
  });
}

async function chefEnhance(
  base: Recipe,
  ctx: { cuisine: LocalCuisine | null; country: string; language: string },
): Promise<Recipe> {
  return withChefTimeout(base, chefEnhanceInner(base, ctx));
}

async function chefEnhanceInner(
  base: Recipe,
  ctx: { cuisine: LocalCuisine | null; country: string; language: string },
): Promise<Recipe> {
  try {

    const chef = await enhanceRecipeAsChef({
      data: {
        title: base.title,
        servings: base.servings,
        prepMinutes: base.prepMinutes,
        cookMinutes: base.cookMinutes,
        difficulty: base.difficulty,
        ingredients: base.ingredients.map((i) => ({ name: i.name, quantity: i.quantity })),
        baseSteps: base.steps,
        cuisine: ctx.cuisine ?? undefined,
        country: ctx.country,
        language: ctx.language,
      },
    });
    // Re-attach the immutable fields from `base` so the grocery list,
    // nutrition and allergens are byte-identical to the pre-chef recipe.
    return {
      ...base,
      title: chef.title || base.title,
      description: chef.description || base.description,
      steps: chef.steps.length >= 3 ? chef.steps : base.steps,
      prepMinutes: chef.prepMinutes || base.prepMinutes,
      cookMinutes: chef.cookMinutes || base.cookMinutes,
      difficulty: chef.difficulty || base.difficulty,
      // Immutable — explicitly re-pinned even though `...base` already set them.
      ingredients: base.ingredients,
      nutrition: base.nutrition,
      allergens: base.allergens,
      servings: base.servings,
      chefEnhanced: true,
    };
  } catch (err) {
    console.warn("[recipes] chef enhancement failed, using base:", err);
    return base;
  }
}

export async function getRecipe(dishName: string, opts: GetRecipeOptions = {}): Promise<Recipe> {
  const servings = Math.max(1, opts.servings ?? 4);
  const lang = opts.language ?? "en";
  const country = opts.country ?? "";
  const city = opts.city ?? "";
  const cuisine = resolveCuisine(opts);
  const key = cacheKey(dishName, servings, lang, cuisine ? `${cuisine}::${country}` : country);

  const cached = readCache(key);
  if (cached) return cached;

  const chefCtx = { cuisine, country, language: lang };

  // The local DB is English-only. Skip it for non-English users so we
  // don't render English titles/ingredients — the chef step can translate
  // the title but not the ingredient names.
  const englishOnlyOk = lang === "en";

  // 1. Local DB → Chef enhancement.
  if (englishOnlyOk) {
    const local = findLocalRecipe(dishName, { cuisine, mealType: opts.mealType });
    if (isComplete(local)) {
      const scaled = scaleRecipe(local, servings);
      const enhanced = await chefEnhance(scaled, chefCtx);
      writeCache(key, enhanced);
      return enhanced;
    }
  }

  // 2. Web extraction → Chef enhancement.
  try {
    const web = await searchGoogleRecipe({
      data: {
        dishName,
        cuisine: cuisine ?? undefined,
        mealType: opts.mealType,
        servings,
        language: lang,
        country,
        city,
        allergies: opts.allergies ?? [],
      },
    });
    if (web && web.ingredients.length >= 3 && web.steps.length >= 3) {
      const recipe: Recipe = {
        id: `web-${Date.now()}-${dishName.toLowerCase().replace(/\s+/g, "-")}`,
        title: web.title || dishName,
        image: web.image || unsplashFoodImage(dishName),
        servings: web.servings,
        prepMinutes: web.prepMinutes,
        cookMinutes: web.cookMinutes,
        difficulty: web.difficulty,
        ingredients: web.ingredients,
        steps: web.steps,
        nutrition: web.nutrition,
        allergens: web.allergens,
        source: web.extractionMode === "extracted" ? "web" : "web-ai",
        sourceUrl: web.sourceUrl || undefined,
        sourceWebsite: web.sourceWebsite || undefined,
      };
      const scaled = scaleRecipe(recipe, servings);
      const enhanced = await chefEnhance(scaled, chefCtx);
      writeCache(key, enhanced);
      return enhanced;
    }
  } catch (err) {
    console.warn("[recipes] web recipe search failed:", err);
  }

  // 3. AI fallback → Chef enhancement.
  try {
    const ai = await generateAiRecipe({
      data: {
        dishName,
        mealType: opts.mealType ?? "dinner",
        servings,
        language: lang,
        country,
        city,
        allergies: opts.allergies ?? [],
        cuisine: cuisine ?? undefined,
      },
    });
    const recipe: Recipe = {
      id: `ai-${Date.now()}-${dishName.toLowerCase().replace(/\s+/g, "-")}`,
      title: ai.title,
      image: unsplashFoodImage(dishName),
      servings: ai.servings,
      prepMinutes: ai.prepMinutes,
      cookMinutes: ai.cookMinutes,
      difficulty: ai.difficulty,
      ingredients: ai.ingredients,
      steps: ai.steps,
      nutrition: ai.nutrition,
      allergens: ai.allergens,
      source: "ai",
    };
    if (isComplete(recipe)) {
      const scaled = scaleRecipe(recipe, servings);
      const enhanced = await chefEnhance(scaled, chefCtx);
      writeCache(key, enhanced);
      return enhanced;
    }
  } catch (err) {
    console.warn("[recipes] AI fallback failed:", err);
  }

  return fallbackRecipe(dishName, servings, lang);
}
