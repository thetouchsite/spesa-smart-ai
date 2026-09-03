/**
 * Canonical grocery catalog used by every country-level manual price set.
 *
 * One entry per ingredient. Per-country files only carry localised prices,
 * never names/units/quantities — this keeps the matcher consistent across
 * the world and makes adding a new country a 60-line price table, nothing
 * more. When a real supermarket feed lands it can return rows with these
 * same `key`s and slot in ahead of manual data without code changes.
 */

import type { IngredientCategory } from "../../types";

export interface CatalogItem {
  key: string;
  name: string;
  category: IngredientCategory;
  unit: "kg" | "g" | "l" | "ml" | "unit";
  quantity: number;
}

export const CATALOG: CatalogItem[] = [
  // ── Proteins ─────────────────────────────────────────────────
  { key: "chicken_breast",   name: "Chicken breast",            category: "Proteins",      unit: "kg",   quantity: 1   },
  { key: "free_range_chicken", name: "Free-range chicken",      category: "Proteins",      unit: "kg",   quantity: 1   },
  { key: "chicken_thighs",   name: "Chicken thighs",            category: "Proteins",      unit: "kg",   quantity: 1   },
  { key: "whole_chicken",    name: "Whole chicken",             category: "Proteins",      unit: "kg",   quantity: 1   },
  { key: "beef_mince",       name: "Beef mince",                category: "Proteins",      unit: "kg",   quantity: 1   },
  { key: "beef_steak",       name: "Beef steak",                category: "Proteins",      unit: "kg",   quantity: 1   },
  { key: "pork_loin",        name: "Pork loin",                 category: "Proteins",      unit: "kg",   quantity: 1   },
  { key: "sausages",         name: "Sausages",                  category: "Proteins",      unit: "g",    quantity: 400 },
  { key: "bacon",            name: "Bacon",                     category: "Proteins",      unit: "g",    quantity: 250 },
  { key: "ham",              name: "Sliced ham",                category: "Proteins",      unit: "g",    quantity: 200 },
  { key: "salmon_fillet",    name: "Salmon fillets",            category: "Proteins",      unit: "kg",   quantity: 1   },
  { key: "white_fish",       name: "White fish fillets",        category: "Proteins",      unit: "kg",   quantity: 1   },
  { key: "prawns",           name: "Prawns",                    category: "Proteins",      unit: "g",    quantity: 250 },
  { key: "tuna_can",         name: "Canned tuna",               category: "Proteins",      unit: "unit", quantity: 1   },
  { key: "eggs",             name: "Eggs",                      category: "Proteins",      unit: "unit", quantity: 12  },
  { key: "tofu",             name: "Tofu",                      category: "Proteins",      unit: "g",    quantity: 400 },
  { key: "red_lentils",      name: "Red lentils",               category: "Proteins",      unit: "g",    quantity: 500 },
  { key: "chickpeas",        name: "Chickpeas",                 category: "Proteins",      unit: "unit", quantity: 1   },
  { key: "black_beans",      name: "Black beans",               category: "Proteins",      unit: "unit", quantity: 1   },
  { key: "kidney_beans",     name: "Kidney beans",              category: "Proteins",      unit: "unit", quantity: 1   },
  { key: "greek_yogurt",     name: "Greek yogurt",              category: "Proteins",      unit: "kg",   quantity: 1   },
  { key: "yogurt",           name: "Natural yogurt",            category: "Proteins",      unit: "kg",   quantity: 1   },
  { key: "milk",             name: "Milk",                      category: "Proteins",      unit: "l",    quantity: 1   },
  { key: "cheddar",          name: "Cheddar cheese",            category: "Proteins",      unit: "g",    quantity: 250 },
  { key: "mozzarella",       name: "Mozzarella",                category: "Proteins",      unit: "g",    quantity: 250 },
  { key: "feta",             name: "Feta cheese",               category: "Proteins",      unit: "g",    quantity: 200 },
  { key: "parmesan",         name: "Parmesan",                  category: "Proteins",      unit: "g",    quantity: 200 },
  { key: "ricotta",          name: "Ricotta",                   category: "Proteins",      unit: "g",    quantity: 250 },

  // ── Vegetables ──────────────────────────────────────────────
  { key: "tomatoes",         name: "Tomatoes",                  category: "Vegetables",    unit: "kg",   quantity: 1   },
  { key: "cherry_tomatoes",  name: "Cherry tomatoes",           category: "Vegetables",    unit: "g",    quantity: 250 },
  { key: "cucumber",         name: "Cucumber",                  category: "Vegetables",    unit: "unit", quantity: 1   },
  { key: "bell_peppers",     name: "Bell peppers",              category: "Vegetables",    unit: "kg",   quantity: 1   },
  { key: "onions",           name: "Onions",                    category: "Vegetables",    unit: "kg",   quantity: 1   },
  { key: "garlic",           name: "Garlic",                    category: "Vegetables",    unit: "g",    quantity: 200 },
  { key: "carrots",          name: "Carrots",                   category: "Vegetables",    unit: "kg",   quantity: 1   },
  { key: "celery",           name: "Celery",                    category: "Vegetables",    unit: "unit", quantity: 1   },
  { key: "potatoes",         name: "Potatoes",                  category: "Vegetables",    unit: "kg",   quantity: 1   },
  { key: "sweet_potatoes",   name: "Sweet potatoes",            category: "Vegetables",    unit: "kg",   quantity: 1   },
  { key: "salad_greens",     name: "Mixed salad greens",        category: "Vegetables",    unit: "g",    quantity: 300 },
  { key: "spinach",          name: "Spinach",                   category: "Vegetables",    unit: "g",    quantity: 250 },
  { key: "rocket",           name: "Rocket",                    category: "Vegetables",    unit: "g",    quantity: 100 },
  { key: "kale",             name: "Kale",                      category: "Vegetables",    unit: "g",    quantity: 200 },
  { key: "broccoli",         name: "Broccoli",                  category: "Vegetables",    unit: "kg",   quantity: 1   },
  { key: "cauliflower",      name: "Cauliflower",               category: "Vegetables",    unit: "unit", quantity: 1   },
  { key: "zucchini",         name: "Zucchini",                  category: "Vegetables",    unit: "kg",   quantity: 1   },
  { key: "eggplant",         name: "Eggplant",                  category: "Vegetables",    unit: "kg",   quantity: 1   },
  { key: "mushrooms",        name: "Mushrooms",                 category: "Vegetables",    unit: "g",    quantity: 250 },
  { key: "asparagus",        name: "Asparagus",                 category: "Vegetables",    unit: "g",    quantity: 250 },
  { key: "green_beans",      name: "Green beans",               category: "Vegetables",    unit: "g",    quantity: 300 },
  { key: "peas",             name: "Peas",                      category: "Vegetables",    unit: "g",    quantity: 500 },
  { key: "corn",             name: "Sweetcorn",                 category: "Vegetables",    unit: "unit", quantity: 1   },
  { key: "leek",             name: "Leek",                      category: "Vegetables",    unit: "unit", quantity: 1   },
  { key: "cabbage",          name: "Cabbage",                   category: "Vegetables",    unit: "unit", quantity: 1   },
  { key: "seasonal_veg",     name: "Seasonal veg pack",         category: "Vegetables",    unit: "kg",   quantity: 2   },
  { key: "onions_garlic",    name: "Onions & garlic",           category: "Vegetables",    unit: "kg",   quantity: 1   },
  { key: "carrots_celery",   name: "Carrots & celery",          category: "Vegetables",    unit: "kg",   quantity: 1   },

  // ── Fruit ───────────────────────────────────────────────────
  { key: "bananas",          name: "Bananas",                   category: "Fruit",         unit: "kg",   quantity: 1   },
  { key: "apples",           name: "Apples",                    category: "Fruit",         unit: "kg",   quantity: 1   },
  { key: "oranges",          name: "Oranges",                   category: "Fruit",         unit: "kg",   quantity: 1   },
  { key: "lemons",           name: "Lemons",                    category: "Fruit",         unit: "kg",   quantity: 1   },
  { key: "strawberries",     name: "Strawberries",              category: "Fruit",         unit: "g",    quantity: 400 },
  { key: "blueberries",      name: "Blueberries",               category: "Fruit",         unit: "g",    quantity: 200 },
  { key: "raspberries",      name: "Raspberries",               category: "Fruit",         unit: "g",    quantity: 200 },
  { key: "grapes",           name: "Grapes",                    category: "Fruit",         unit: "kg",   quantity: 1   },
  { key: "pears",            name: "Pears",                     category: "Fruit",         unit: "kg",   quantity: 1   },
  { key: "peaches",          name: "Peaches",                   category: "Fruit",         unit: "kg",   quantity: 1   },
  { key: "melon",            name: "Melon",                     category: "Fruit",         unit: "unit", quantity: 1   },
  { key: "watermelon",       name: "Watermelon",                category: "Fruit",         unit: "kg",   quantity: 1   },
  { key: "avocado",          name: "Avocado",                   category: "Fruit",         unit: "unit", quantity: 1   },

  // ── Carbohydrates ───────────────────────────────────────────
  { key: "pasta",            name: "Pasta",                     category: "Carbohydrates", unit: "kg",   quantity: 1   },
  { key: "rice",             name: "Rice",                      category: "Carbohydrates", unit: "kg",   quantity: 1   },
  { key: "basmati_rice",     name: "Basmati rice",              category: "Carbohydrates", unit: "kg",   quantity: 1   },
  { key: "wholegrain_bread", name: "Wholegrain bread",          category: "Carbohydrates", unit: "unit", quantity: 1   },
  { key: "white_bread",      name: "White bread",               category: "Carbohydrates", unit: "unit", quantity: 1   },
  { key: "sourdough",        name: "Sourdough loaf",            category: "Carbohydrates", unit: "unit", quantity: 1   },
  { key: "tortillas",        name: "Tortillas",                 category: "Carbohydrates", unit: "unit", quantity: 8   },
  { key: "noodles",          name: "Noodles",                   category: "Carbohydrates", unit: "g",    quantity: 400 },
  { key: "oats",             name: "Oats",                      category: "Carbohydrates", unit: "g",    quantity: 500 },
  { key: "flour",            name: "Flour",                     category: "Carbohydrates", unit: "kg",   quantity: 1   },
  { key: "pizza_flour",      name: "Pizza flour",               category: "Carbohydrates", unit: "kg",   quantity: 1   },
  { key: "couscous",         name: "Couscous",                  category: "Carbohydrates", unit: "g",    quantity: 500 },
  { key: "quinoa",           name: "Quinoa",                    category: "Carbohydrates", unit: "g",    quantity: 500 },
  { key: "cereal",           name: "Breakfast cereal",          category: "Carbohydrates", unit: "g",    quantity: 500 },
  { key: "granola",          name: "Granola",                   category: "Carbohydrates", unit: "g",    quantity: 500 },

  // ── Healthy Fats ────────────────────────────────────────────
  { key: "olive_oil",        name: "Extra virgin olive oil",    category: "Healthy Fats",  unit: "ml",   quantity: 500 },
  { key: "sunflower_oil",    name: "Sunflower oil",             category: "Healthy Fats",  unit: "l",    quantity: 1   },
  { key: "butter",           name: "Butter",                    category: "Healthy Fats",  unit: "g",    quantity: 250 },
  { key: "mixed_nuts",       name: "Mixed nuts",                category: "Healthy Fats",  unit: "g",    quantity: 200 },
  { key: "almonds",          name: "Almonds",                   category: "Healthy Fats",  unit: "g",    quantity: 200 },
  { key: "walnuts",          name: "Walnuts",                   category: "Healthy Fats",  unit: "g",    quantity: 200 },
  { key: "peanut_butter",    name: "Peanut butter",             category: "Healthy Fats",  unit: "g",    quantity: 350 },
  { key: "seeds",            name: "Mixed seeds",               category: "Healthy Fats",  unit: "g",    quantity: 200 },

  // ── Pantry ──────────────────────────────────────────────────
  { key: "salt",             name: "Salt",                      category: "Pantry",        unit: "kg",   quantity: 1   },
  { key: "sugar",            name: "Sugar",                     category: "Pantry",        unit: "kg",   quantity: 1   },
  { key: "black_pepper",     name: "Black pepper",              category: "Pantry",        unit: "g",    quantity: 100 },
  { key: "spices",           name: "Mixed spices",              category: "Pantry",        unit: "g",    quantity: 100 },
  { key: "canned_tomatoes",  name: "Canned tomatoes",           category: "Pantry",        unit: "unit", quantity: 1   },
  { key: "tomato_sauce",     name: "Tomato sauce",              category: "Pantry",        unit: "ml",   quantity: 500 },
  { key: "pesto",            name: "Pesto",                     category: "Pantry",        unit: "g",    quantity: 190 },
  { key: "stock_cubes",      name: "Stock cubes",               category: "Pantry",        unit: "unit", quantity: 12  },
  { key: "soy_sauce",        name: "Soy sauce",                 category: "Pantry",        unit: "ml",   quantity: 250 },
  { key: "honey",            name: "Honey",                     category: "Pantry",        unit: "g",    quantity: 350 },
  { key: "jam",              name: "Jam",                       category: "Pantry",        unit: "g",    quantity: 350 },
  { key: "coffee",           name: "Coffee",                    category: "Pantry",        unit: "g",    quantity: 250 },
  { key: "tea",              name: "Tea bags",                  category: "Pantry",        unit: "unit", quantity: 40  },
  { key: "vinegar",          name: "Vinegar",                   category: "Pantry",        unit: "ml",   quantity: 500 },
  { key: "balsamic_vinegar", name: "Balsamic vinegar",          category: "Pantry",        unit: "ml",   quantity: 250 },
  { key: "mustard",          name: "Mustard",                   category: "Pantry",        unit: "g",    quantity: 200 },
  { key: "mayo",             name: "Mayonnaise",                category: "Pantry",        unit: "g",    quantity: 400 },
  { key: "ketchup",          name: "Ketchup",                   category: "Pantry",        unit: "g",    quantity: 400 },

  // ── Herbs, spices & world pantry (v3) ───────────────────────
  { key: "fresh_herbs",      name: "Fresh herbs",               category: "Vegetables",    unit: "unit", quantity: 1   },
  { key: "dried_herbs",      name: "Dried herbs",               category: "Pantry",        unit: "g",    quantity: 20  },
  { key: "paprika",          name: "Paprika",                   category: "Pantry",        unit: "g",    quantity: 50  },
  { key: "cinnamon",         name: "Cinnamon",                  category: "Pantry",        unit: "g",    quantity: 40  },
  { key: "tahini",           name: "Tahini",                    category: "Pantry",        unit: "g",    quantity: 300 },
  { key: "capers",           name: "Capers",                    category: "Pantry",        unit: "g",    quantity: 100 },
  { key: "olives",           name: "Olives",                    category: "Pantry",        unit: "g",    quantity: 200 },
  { key: "bulgur",           name: "Bulgur wheat",              category: "Carbohydrates", unit: "g",    quantity: 500 },
  { key: "pita",             name: "Pita bread",                category: "Carbohydrates", unit: "unit", quantity: 6   },
  { key: "cream",            name: "Cooking cream",             category: "Healthy Fats",  unit: "ml",   quantity: 300 },
];


export const CATALOG_BY_KEY: Record<string, CatalogItem> =
  Object.fromEntries(CATALOG.map((i) => [i.key, i]));
