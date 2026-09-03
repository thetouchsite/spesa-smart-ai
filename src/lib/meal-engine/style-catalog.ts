/**
 * Meal pools per food style × budget tier.
 *
 * The engine picks meals from `byStyle[style][tier]`, falling back to
 * `byStyle.Default[tier]` for any unknown style. Grocery templates use the
 * same tier key. Add a new style by appending an entry — no engine changes.
 */

import type { Tier } from "./tiers";

export interface MealPool {
  breakfast: string[];
  lunch: string[];
  dinner: string[];
}

export interface GroceryTemplateRow {
  category: "Proteins" | "Vegetables" | "Carbohydrates" | "Healthy Fats";
  name: string;
  /** Per-household-of-4, weekly. Engine scales by household + frequency. */
  quantity: string;
}

const DEFAULT_POOLS: Record<Tier, MealPool> = {
  low: {
    breakfast: ["Oatmeal & banana", "Toast & jam", "Scrambled eggs", "Porridge with apple"],
    lunch: ["Lentil soup", "Cheese sandwich", "Pasta salad", "Bean wrap", "Rice & beans"],
    dinner: ["Pasta and chickpeas", "Lentil curry", "Vegetable stir fry", "Bean chilli", "Egg fried rice", "Tomato pasta bake", "Potato & lentil stew"],
  },
  medium: {
    breakfast: ["Yogurt & granola", "Scrambled eggs & toast", "Peanut butter toast", "Fruit smoothie", "Oats with berries"],
    lunch: ["Mixed salad", "Chicken wrap", "Tuna pasta salad", "Hummus plate", "Veggie quesadilla"],
    dinner: ["Chicken rice bowl", "Tuna pasta", "Homemade pizza", "Chicken stir fry", "Lentil shepherd's pie", "Mediterranean salmon traybake", "Family pasta bake"],
  },
  premium: {
    breakfast: ["Avocado toast & poached egg", "Greek yogurt parfait", "Smoked salmon bagel", "Berry protein smoothie", "Shakshuka"],
    lunch: ["Grilled chicken Caesar", "Salmon poke bowl", "Quinoa Buddha bowl", "Steak salad", "Mediterranean mezze"],
    dinner: ["Pan-seared salmon", "Beef ragu pappardelle", "Roast chicken & vegetables", "Slow-cooked lamb tagine", "Miso glazed cod", "Sunday roast", "Mushroom risotto"],
  },
};

/** Style-specific overrides; missing keys fall back to defaults.
 *  Titles here are kept in sync with the local recipe DB
 *  (`src/lib/recipes/local-db/*`) so plan generation maps directly to a
 *  fully-detailed recipe. */
const STYLE_OVERRIDES: Partial<Record<string, Partial<Record<Tier, Partial<MealPool>>>>> = {
  Italian: {
    low: {
      breakfast: ["Italian Breakfast Cornetto & Cappuccino", "Zucchini Frittata", "Toast & jam"],
      lunch: ["Minestrone Soup", "Tomato Bruschetta", "Caprese Salad"],
      dinner: ["Pasta Pomodoro", "Pasta and chickpeas", "Tomato pasta bake"],
    },
    medium: {
      breakfast: ["Italian Breakfast Cornetto & Cappuccino", "Zucchini Frittata", "Yogurt & granola"],
      lunch: ["Minestrone Soup", "Caprese Salad", "Tomato Bruschetta"],
      dinner: ["Pizza Margherita", "Pasta Pomodoro", "Spaghetti alla Carbonara", "Mushroom Risotto", "Chicken Cacciatore", "Family pasta bake", "Minestrone Soup"],
    },
    premium: {
      breakfast: ["Zucchini Frittata", "Italian Breakfast Cornetto & Cappuccino", "Yogurt & granola"],
      lunch: ["Caprese Salad", "Tomato Bruschetta", "Mixed salad"],
      dinner: ["Pizza Margherita", "Mushroom Risotto", "Spaghetti alla Carbonara", "Chicken Cacciatore", "Pasta Pomodoro", "Roast chicken & vegetables"],
    },
  },
  Mediterranean: {
    medium: {
      breakfast: ["Shakshuka", "Greek Yogurt with Honey & Nuts", "Yogurt & granola"],
      lunch: ["Greek Salad", "Hummus & Mezze Plate", "Tabbouleh"],
      dinner: ["Mediterranean Chicken Traybake", "Mediterranean Salmon Traybake", "Greek Baked Fish (Plaki)", "Chicken Gyros Bowl", "Rice-stuffed Peppers", "Chickpea stew"],
    },
    premium: {
      breakfast: ["Shakshuka", "Greek Yogurt with Honey & Nuts", "Avocado toast & poached egg"],
      lunch: ["Greek Salad", "Hummus & Mezze Plate", "Tabbouleh"],
      dinner: ["Mediterranean Salmon Traybake", "Mediterranean Chicken Traybake", "Greek Baked Fish (Plaki)", "Chicken Gyros Bowl", "Rice-stuffed Peppers", "Lamb tagine"],
    },
  },
  "Low Carb": {
    medium: {
      breakfast: ["Cheese & Spinach Omelette", "Greek Yogurt Berry Bowl", "Scrambled Eggs & Toast"],
      lunch: ["Tuna Avocado Salad", "Greek Salad", "Grilled Chicken & Greens"],
      dinner: ["Grilled Chicken & Greens", "Pan-seared Salmon with Asparagus", "Zoodle Bolognese", "Beef Lettuce Tacos", "Cauliflower Chicken Curry", "Stuffed Bell Peppers", "Steak & Salad"],
    },
    premium: {
      breakfast: ["Cheese & Spinach Omelette", "Greek Yogurt Berry Bowl"],
      lunch: ["Tuna Avocado Salad", "Grilled Chicken & Greens"],
      dinner: ["Steak & Salad", "Pan-seared Salmon with Asparagus", "Stuffed Bell Peppers", "Grilled Chicken & Greens", "Cauliflower Chicken Curry", "Zoodle Bolognese", "Beef Lettuce Tacos"],
    },
  },
  "Japanese Inspired": {
    medium: {
      breakfast: ["Miso Soup", "Tamagoyaki (Rolled Omelette)", "Scrambled Eggs & Toast"],
      lunch: ["Salmon Onigiri", "Salmon Sushi Bowl", "Miso Soup"],
      dinner: ["Chicken Teriyaki", "Salmon Sushi Bowl", "Yakisoba Noodles", "Chicken Katsu Curry", "Shoyu Ramen", "Miso Glazed Cod", "Veggie Gyoza & Rice"],
    },
    premium: {
      breakfast: ["Tamagoyaki (Rolled Omelette)", "Miso Soup", "Salmon Onigiri"],
      lunch: ["Salmon Sushi Bowl", "Salmon Onigiri"],
      dinner: ["Miso Glazed Cod", "Salmon Sushi Bowl", "Chicken Teriyaki", "Shoyu Ramen", "Chicken Katsu Curry", "Yakisoba Noodles", "Veggie Gyoza & Rice"],
    },
  },
  "Family Budget": {
    low: {
      breakfast: ["Banana Oatmeal", "Scrambled Eggs & Toast", "Toast & jam"],
      lunch: ["Hearty Lentil Soup", "Bean & Cheese Wrap", "Pasta salad"],
      dinner: ["Bean Chilli", "Family Pasta Bake", "Lentil Shepherd's Pie", "Egg Fried Rice", "Chickpea Curry", "Tomato Pasta with Tuna", "Hearty Lentil Soup"],
    },
    medium: {
      breakfast: ["Banana Oatmeal", "Scrambled Eggs & Toast", "Yogurt & granola"],
      lunch: ["Bean & Cheese Wrap", "Hearty Lentil Soup", "Tuna pasta salad"],
      dinner: ["Family Pasta Bake", "Bean Chilli", "Lentil Shepherd's Pie", "Tomato Pasta with Tuna", "Egg Fried Rice", "Chickpea Curry", "Homemade pizza"],
    },
  },
  "Healthy Lifestyle": {
    medium: { dinner: ["Buddha bowl", "Lentil shepherd's pie", "Salmon traybake", "Veggie chilli", "Chicken & quinoa", "Tofu stir fry", "Stuffed peppers"] },
    premium: { dinner: ["Pan-seared salmon", "Quinoa bowl", "Roast chicken & veg", "Miso cod", "Buddha bowl", "Beetroot risotto", "Tuna tartare"] },
  },
};

export function getMealPool(style: string, tier: Tier): MealPool {
  const styleOverrides = STYLE_OVERRIDES[style]?.[tier];
  const base = DEFAULT_POOLS[tier];
  if (!styleOverrides) return base;
  return {
    breakfast: styleOverrides.breakfast ?? base.breakfast,
    lunch: styleOverrides.lunch ?? base.lunch,
    dinner: styleOverrides.dinner ?? base.dinner,
  };
}

// ─── Grocery templates per tier (no prices — Price Engine fills them in) ───
const GROCERY_TEMPLATES: Record<Tier, GroceryTemplateRow[]> = {
  low: [
    { category: "Proteins", name: "Eggs", quantity: "12" },
    { category: "Proteins", name: "Red lentils", quantity: "1 kg" },
    { category: "Proteins", name: "Chickpeas", quantity: "3 cans" },
    { category: "Proteins", name: "Chicken thighs", quantity: "1 kg" },
    { category: "Vegetables", name: "Seasonal veg pack", quantity: "2 kg" },
    { category: "Vegetables", name: "Onions & garlic", quantity: "1 kg" },
    { category: "Vegetables", name: "Carrots & celery", quantity: "1 kg" },
    { category: "Carbohydrates", name: "Pasta", quantity: "2 kg" },
    { category: "Carbohydrates", name: "Rice", quantity: "2 kg" },
    { category: "Carbohydrates", name: "Wholegrain bread", quantity: "2 loaves" },
    { category: "Carbohydrates", name: "Oats", quantity: "1 kg" },
    { category: "Healthy Fats", name: "Sunflower oil", quantity: "1 l" },
  ],
  medium: [
    { category: "Proteins", name: "Chicken thighs", quantity: "1.5 kg" },
    { category: "Proteins", name: "Canned tuna", quantity: "3 tins" },
    { category: "Proteins", name: "Eggs", quantity: "12" },
    { category: "Proteins", name: "Red lentils", quantity: "500 g" },
    { category: "Proteins", name: "Chickpeas", quantity: "2 cans" },
    { category: "Vegetables", name: "Tomatoes", quantity: "1 kg" },
    { category: "Vegetables", name: "Mixed salad greens", quantity: "300 g" },
    { category: "Vegetables", name: "Onions & garlic", quantity: "1 kg" },
    { category: "Vegetables", name: "Seasonal veg pack", quantity: "2 kg" },
    { category: "Vegetables", name: "Bell peppers", quantity: "4" },
    { category: "Vegetables", name: "Carrots & celery", quantity: "1 kg" },
    { category: "Carbohydrates", name: "Pasta", quantity: "1.5 kg" },
    { category: "Carbohydrates", name: "Rice", quantity: "1 kg" },
    { category: "Carbohydrates", name: "Wholegrain bread", quantity: "2 loaves" },
    { category: "Carbohydrates", name: "Pizza flour", quantity: "1 kg" },
    { category: "Carbohydrates", name: "Oats", quantity: "500 g" },
    { category: "Healthy Fats", name: "Extra virgin olive oil", quantity: "500 ml" },
    { category: "Healthy Fats", name: "Butter", quantity: "250 g" },
    { category: "Healthy Fats", name: "Greek yogurt", quantity: "1 kg" },
    { category: "Healthy Fats", name: "Mixed nuts", quantity: "200 g" },
  ],
  premium: [
    { category: "Proteins", name: "Salmon fillets", quantity: "800 g" },
    { category: "Proteins", name: "Free-range chicken", quantity: "1.6 kg" },
    { category: "Proteins", name: "Grass-fed beef mince", quantity: "500 g" },
    { category: "Proteins", name: "Eggs (free-range)", quantity: "12" },
    { category: "Proteins", name: "Greek feta", quantity: "300 g" },
    { category: "Vegetables", name: "Heirloom tomatoes", quantity: "1 kg" },
    { category: "Vegetables", name: "Avocado", quantity: "4" },
    { category: "Vegetables", name: "Mixed salad greens", quantity: "400 g" },
    { category: "Vegetables", name: "Asparagus", quantity: "500 g" },
    { category: "Vegetables", name: "Bell peppers", quantity: "6" },
    { category: "Vegetables", name: "Mushrooms", quantity: "500 g" },
    { category: "Carbohydrates", name: "Sourdough loaf", quantity: "2" },
    { category: "Carbohydrates", name: "Pappardelle pasta", quantity: "1 kg" },
    { category: "Carbohydrates", name: "Arborio rice", quantity: "1 kg" },
    { category: "Carbohydrates", name: "Quinoa", quantity: "500 g" },
    { category: "Healthy Fats", name: "Extra virgin olive oil", quantity: "750 ml" },
    { category: "Healthy Fats", name: "Greek yogurt", quantity: "1 kg" },
    { category: "Healthy Fats", name: "Mixed nuts & seeds", quantity: "400 g" },
    { category: "Healthy Fats", name: "Aged parmesan", quantity: "200 g" },
  ],
};

export function getGroceryTemplate(_style: string, tier: Tier): GroceryTemplateRow[] {
  return GROCERY_TEMPLATES[tier];
}
