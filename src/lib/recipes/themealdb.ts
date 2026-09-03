/** TheMealDB provider — free, no key.
 *  Docs: https://www.themealdb.com/api.php */
import type { Recipe } from "./types";

const BASE = "https://www.themealdb.com/api/json/v1/1";

interface TmdbMeal {
  idMeal: string;
  strMeal: string;
  strInstructions: string;
  strMealThumb: string;
  strSource?: string;
  strCategory?: string;
  strArea?: string;
  [k: string]: string | undefined;
}

function pickFirstMeal(name: string, list: TmdbMeal[]): TmdbMeal | null {
  if (!list || list.length === 0) return null;
  const lc = name.toLowerCase();
  // Prefer the meal whose title shares the most tokens.
  const tokens = lc.split(/\s+/).filter((t) => t.length > 2);
  let best = list[0];
  let bestScore = -1;
  for (const m of list) {
    const ml = (m.strMeal || "").toLowerCase();
    let score = 0;
    for (const t of tokens) if (ml.includes(t)) score++;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

function extractIngredients(m: TmdbMeal) {
  const out: { name: string; quantity: string }[] = [];
  for (let i = 1; i <= 20; i++) {
    const ing = (m[`strIngredient${i}`] || "").trim();
    const qty = (m[`strMeasure${i}`] || "").trim();
    if (ing) out.push({ name: ing, quantity: qty || "to taste" });
  }
  return out;
}

function splitSteps(instructions: string): string[] {
  return instructions
    .split(/\r?\n|(?<=\.)\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 4)
    .slice(0, 12);
}

function detectAllergens(ings: { name: string }[]): string[] {
  const set = new Set<string>();
  for (const { name } of ings) {
    const n = name.toLowerCase();
    if (/(milk|cheese|butter|yogurt|cream|mozzarella|parmesan|feta|ricotta)/.test(n)) set.add("Milk");
    if (/(flour|bread|pasta|noodle|couscous|wheat|barley|rye|semolina)/.test(n)) set.add("Gluten");
    if (/egg/.test(n)) set.add("Egg");
    if (/(peanut|almond|cashew|walnut|hazelnut|pistachio)/.test(n)) set.add("Nuts");
    if (/(salmon|tuna|cod|shrimp|prawn|fish|anchovy)/.test(n)) set.add("Fish/Shellfish");
    if (/soy/.test(n)) set.add("Soy");
  }
  return Array.from(set);
}

/** Rough per-serving nutrition heuristic so the modal always has numbers. */
function estimateNutrition(ings: { name: string }[]) {
  let cal = 250, p = 12, c = 30, f = 8;
  for (const { name } of ings) {
    const n = name.toLowerCase();
    if (/(chicken|beef|pork|lamb|salmon|tuna|fish|egg)/.test(n)) { cal += 80; p += 10; f += 4; }
    if (/(rice|pasta|bread|flour|potato|noodle)/.test(n)) { cal += 90; c += 18; }
    if (/(cheese|butter|cream|oil)/.test(n)) { cal += 60; f += 6; }
    if (/(bean|lentil|chickpea)/.test(n)) { cal += 40; p += 5; c += 6; }
  }
  return { calories: cal, protein: p, carbs: c, fat: f };
}

async function fetchMealById(id: string): Promise<TmdbMeal | null> {
  try {
    const res = await fetch(`${BASE}/lookup.php?i=${id}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { meals: TmdbMeal[] | null };
    return json.meals?.[0] ?? null;
  } catch { return null; }
}

export async function fetchTheMealDbRecipe(
  name: string,
  area: string | null = null,
): Promise<Recipe | null> {
  try {
    // 1. Direct name search.
    const url = `${BASE}/search.php?s=${encodeURIComponent(name)}`;
    const res = await fetch(url);
    let meal: TmdbMeal | null = null;
    if (res.ok) {
      const json = (await res.json()) as { meals: TmdbMeal[] | null };
      meal = pickFirstMeal(name, json.meals || []);
      // If we filtered by area and the search result is the wrong area, drop it.
      if (meal && area && meal.strArea && meal.strArea !== area) meal = null;
    }

    // 2. Area-filtered fallback: list meals in the area and pick the best title match.
    if (!meal && area) {
      const areaRes = await fetch(`${BASE}/filter.php?a=${encodeURIComponent(area)}`);
      if (areaRes.ok) {
        const j = (await areaRes.json()) as { meals: TmdbMeal[] | null };
        const picked = pickFirstMeal(name, j.meals || []);
        if (picked?.idMeal) meal = await fetchMealById(picked.idMeal);
      }
    }

    if (!meal) return null;
    const ingredients = extractIngredients(meal);
    const steps = splitSteps(meal.strInstructions || "");
    if (steps.length === 0 || ingredients.length === 0) return null;
    return {
      id: `tmdb-${meal.idMeal}`,
      title: meal.strMeal,
      image: meal.strMealThumb,
      servings: 4,
      prepMinutes: 15,
      cookMinutes: 25,
      difficulty: steps.length > 8 ? "medium" : "easy",
      ingredients,
      steps,
      nutrition: estimateNutrition(ingredients),
      allergens: detectAllergens(ingredients),
      source: "themealdb",
      sourceUrl: meal.strSource,
    };
  } catch {
    return null;
  }
}
