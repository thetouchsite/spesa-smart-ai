import { unsplashFoodImage } from "./unsplash";
import type { Recipe, RecipeIngredient } from "./types";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

function has(text: string, pattern: RegExp): boolean {
  return pattern.test(text.toLowerCase());
}

function allergensFor(ingredients: RecipeIngredient[]): string[] {
  const names = ingredients.map((i) => i.name.toLowerCase()).join(" ");
  const out = new Set<string>();
  if (/(egg|eggs)/.test(names)) out.add("Egg");
  if (/(milk|cheese|mozzarella|feta|yogurt|butter|parmesan)/.test(names)) out.add("Milk");
  if (/(bread|toast|pasta|flour|couscous|pita|noodle|wrap|tortilla)/.test(names)) out.add("Gluten");
  if (/(salmon|tuna|cod|fish|prawn|shrimp)/.test(names)) out.add("Fish/Shellfish");
  if (/(soy|tofu|miso)/.test(names)) out.add("Soy");
  if (/(nut|almond|walnut|peanut)/.test(names)) out.add("Nuts");
  return [...out];
}

function normalizeTitle(dishName: string): string {
  return dishName.trim().replace(/\s+/g, " ") || "Recipe";
}

function recipeForKnownDish(name: string): RecipeIngredient[] | null {
  const n = name.toLowerCase();
  if (has(n, /lamb.*tagine|tagine.*lamb/)) {
    return [
      { name: "Lamb shoulder", quantity: "800 g" },
      { name: "Onions", quantity: "2" },
      { name: "Carrots", quantity: "3" },
      { name: "Chickpeas", quantity: "400 g" },
      { name: "Chopped tomatoes", quantity: "400 g" },
      { name: "Dried apricots", quantity: "100 g" },
      { name: "Couscous", quantity: "300 g" },
      { name: "Mixed spices", quantity: "20 g" },
      { name: "Olive oil", quantity: "30 ml" },
    ];
  }
  if (has(n, /avocado.*toast|toast.*avocado/)) {
    return [
      { name: "Avocado", quantity: "2" },
      { name: "Sourdough bread", quantity: "8 slices" },
      { name: "Eggs", quantity: "4" },
      { name: "Lemon", quantity: "1" },
      { name: "Olive oil", quantity: "20 ml" },
    ];
  }
  if (has(n, /scrambled.*egg|egg.*toast/)) {
    return [
      { name: "Eggs", quantity: "8" },
      { name: "Bread", quantity: "8 slices" },
      { name: "Butter", quantity: "30 g" },
      { name: "Milk", quantity: "60 ml" },
    ];
  }
  if (has(n, /yogurt|yoghurt|parfait/)) {
    return [
      { name: "Greek yogurt", quantity: "600 g" },
      { name: "Granola", quantity: "200 g" },
      { name: "Berries", quantity: "250 g" },
      { name: "Honey", quantity: "40 g" },
    ];
  }
  if (has(n, /salmon.*traybake|traybake.*salmon/)) {
    return [
      { name: "Salmon fillets", quantity: "600 g" },
      { name: "Cherry tomatoes", quantity: "400 g" },
      { name: "Zucchini", quantity: "2" },
      { name: "Lemon", quantity: "1" },
      { name: "Olive oil", quantity: "30 ml" },
    ];
  }
  if (has(n, /pizza|margherita/)) {
    return [
      { name: "Pizza flour", quantity: "500 g" },
      { name: "Tomato sauce", quantity: "300 ml" },
      { name: "Mozzarella", quantity: "300 g" },
      { name: "Fresh basil", quantity: "12 leaves" },
      { name: "Olive oil", quantity: "30 ml" },
    ];
  }
  return null;
}

function genericIngredients(dishName: string, mealType: MealType): RecipeIngredient[] {
  const n = dishName.toLowerCase();
  if (mealType === "breakfast") {
    if (has(n, /oat|porridge/)) {
      return [
        { name: "Oats", quantity: "300 g" },
        { name: "Milk", quantity: "800 ml" },
        { name: "Bananas", quantity: "2" },
        { name: "Honey", quantity: "30 g" },
      ];
    }
    return [
      { name: "Eggs", quantity: "6" },
      { name: "Bread", quantity: "6 slices" },
      { name: "Tomatoes", quantity: "300 g" },
      { name: "Olive oil", quantity: "20 ml" },
    ];
  }

  const protein = has(n, /lamb/) ? { name: "Lamb shoulder", quantity: "700 g" }
    : has(n, /salmon/) ? { name: "Salmon fillets", quantity: "600 g" }
    : has(n, /fish|cod/) ? { name: "White fish fillets", quantity: "700 g" }
    : has(n, /tuna/) ? { name: "Canned tuna", quantity: "3 tins" }
    : has(n, /beef/) ? { name: "Beef mince", quantity: "500 g" }
    : has(n, /chicken/) ? { name: "Chicken thighs", quantity: "800 g" }
    : has(n, /lentil/) ? { name: "Red lentils", quantity: "350 g" }
    : has(n, /bean/) ? { name: "Black beans", quantity: "800 g" }
    : { name: "Chickpeas", quantity: "800 g" };
  const carb = has(n, /pasta|spaghetti|noodle/) ? { name: "Pasta", quantity: "500 g" }
    : has(n, /couscous|tagine/) ? { name: "Couscous", quantity: "300 g" }
    : has(n, /bread|toast|wrap|gyros/) ? { name: "Wholegrain bread", quantity: "1 loaf" }
    : { name: "Rice", quantity: "400 g" };
  return [
    protein,
    carb,
    { name: "Tomatoes", quantity: "500 g" },
    { name: "Onions", quantity: "2" },
    { name: "Garlic", quantity: "3 cloves" },
    { name: "Olive oil", quantity: "30 ml" },
    { name: "Mixed spices", quantity: "10 g" },
  ];
}

export function buildDeterministicRecipe(
  dishName: string,
  opts: { servings?: number; mealType?: MealType; language?: string } = {},
): Recipe {
  const title = normalizeTitle(dishName);
  const mealType = opts.mealType ?? "dinner";
  const servings = Math.max(1, opts.servings ?? 4);
  const ingredients = recipeForKnownDish(title) ?? genericIngredients(title, mealType);
  const isBreakfast = mealType === "breakfast";
  return {
    id: `deterministic-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title,
    image: unsplashFoodImage(title),
    servings,
    prepMinutes: isBreakfast ? 10 : 15,
    cookMinutes: has(title, /tagine|stew|roast|traybake/) ? 45 : isBreakfast ? 10 : 25,
    difficulty: has(title, /tagine|risotto|ramen/) ? "medium" : "easy",
    ingredients,
    steps: [
      `Prepare the ingredients for ${title}.`,
      "Cook the main ingredients with the aromatics until fragrant and properly softened.",
      "Add the remaining ingredients and cook until the meal is tender, hot and cohesive.",
      "Taste, adjust seasoning, and serve in the planned portions.",
    ],
    nutrition: {
      calories: isBreakfast ? 380 : 560,
      protein: isBreakfast ? 18 : 30,
      carbs: isBreakfast ? 42 : 58,
      fat: isBreakfast ? 16 : 22,
    },
    allergens: allergensFor(ingredients),
    source: "fallback",
  };
}