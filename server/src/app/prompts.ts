/**
 * Prompt del progetto.
 *
 * Ripresi alla lettera dal prototipo: sono la parte migliore del lavoro
 * fatto su Lovable — curati, con regole esplicite di lingua e di contesto
 * culturale — e non c'era motivo di riscriverli. Cambiare un prompt cambia
 * l'output percepito dall'utente: si tocca qui e si verifica, mai di sfuggita
 * dentro un handler.
 */

import type { AiRecipeInput, ChefInput, PlanInput, WebRecipeInput } from "../base/schemas.js";


/**
 * La regola più importante di una ricetta dentro un'app per la spesa: si deve
 * poter cucinare con quello che si è comprato.
 *
 * Quando le ricette venivano generate insieme al menù, l'elenco della spesa
 * nasceva da loro ed erano coerenti per costruzione. Spostandole su una
 * chiamata separata — per dimezzare l'attesa iniziale — quel legame si è
 * rotto: la ricetta chiedeva ingredienti che nella lista non c'erano, e chi
 * apriva il piatto non poteva farlo. È il difetto peggiore possibile, perché
 * rompe la promessa dell'app.
 *
 * Passandole la lista, la ricetta torna a nascere da lì. Le eccezioni sono
 * dichiarate: sale, olio, acqua e spezie non stanno in nessuna lista della
 * spesa e nessuno se li aspetta.
 */
function vincoloDispensa(dispensa: string[], porzioni: number): string {
  if (!dispensa.length) return "";
  const elenco = dispensa.map((v) => `- ${v}`).join("\n");
  return `

INGREDIENTI DISPONIBILI — usa SOLO questi, sono la spesa già fatta:
${elenco}

Puoi dare per scontati solo: sale, pepe, olio, acqua, aceto e spezie comuni.
Non introdurre NESSUN altro ingrediente: chi legge ha comprato quella roba lì
e deve poter cucinare stasera. Se il piatto normalmente vorrebbe qualcosa che
non è nell'elenco, adatta la ricetta a ciò che c'è invece di aggiungerlo.
Le quantità restano quelle giuste per ${porzioni} porzioni.`;
}

export function recipePrompt(d: AiRecipeInput): string {
  return `Write a realistic ${d.mealType} recipe for "${d.dishName}".
${d.cuisine ? `Cuisine: ${d.cuisine}. Stay strictly within this culinary tradition.` : ""}
${d.country ? `Country context: this recipe is for a household in ${d.country}${d.city ? ` (${d.city})` : ""}. Adapt ingredients, brands, cuts, seasonings and cooking style to what is common, native and easily available in ${d.country}. Prefer dishes and preparations a local home cook would actually make.` : ""}
Servings: ${d.servings}.
CRITICAL LANGUAGE RULE: Write ALL text in language code "${d.language}" — the recipe title, ingredient names, step instructions and allergen labels. If the dish name "${d.dishName}" is in English, translate it naturally into ${d.language} (or replace it with the culturally equivalent local dish name in ${d.country || "the target country"}). NEVER emit any English text when the target language is not English.
Avoid these allergens/diets: ${d.allergies.join(", ") || "none"}.
Ingredients must be a complete, realistic list with metric quantities (g, ml, pcs). Provide 4-8 clear step-by-step instructions a home cook can follow. Provide approximate per-serving nutrition (kcal, protein g, carbs g, fat g) and any common allergens.${vincoloDispensa(d.dispensa, d.servings)}`;
}

/** Regole comuni ai due rami dell'estrazione web (pagina reale e sintesi). */
export function webSharedRules(d: WebRecipeInput): string {
  return `
Servings: ${d.servings}.
CRITICAL LANGUAGE: Write ALL output — title, ingredient names, step instructions, allergen labels — in language code "${d.language}". If the source page or dish name is in another language, translate it naturally. Never emit English text when the target language is not English.
${d.country ? `COUNTRY CONTEXT: household is in ${d.country}${d.city ? ` (${d.city})` : ""}. Adapt ingredients, brands, cuts and preparations to what is common and easily bought in ${d.country}. Prefer the local/native version of the dish.` : ""}
Avoid allergens/diets: ${d.allergies.join(", ") || "none"}.
${d.cuisine ? `Cuisine constraint: stay strictly within ${d.cuisine} tradition.` : ""}
Ingredients MUST be a complete realistic list with metric quantities (g, ml, pcs).
Steps MUST be 4-10 numbered, cookable instructions for a home cook.
Nutrition is approximate per serving.
If the dish is "Pizza Margherita" the recipe MUST include: flour, water, yeast, tomato sauce (or San Marzano tomatoes), mozzarella, fresh basil, olive oil, salt.
Return JSON matching the schema exactly.`;
}

export function webExtractPrompt(d: WebRecipeInput, url: string, host: string, page: string): string {
  return `You extract structured recipes from a web page.

Source URL: ${url}
Source website: ${host}

Below is the raw text/JSON-LD of the page. Convert it into a COMPLETE cookable recipe.
Use the page's real title, real ingredients with real quantities, real steps, and real image URL when present (prefer JSON-LD or OG_IMAGE). Fill nutrition with a realistic estimate if absent.
Set extractionMode = "extracted", sourceUrl = "${url}", sourceWebsite = "${host}", image = OG_IMAGE or "", and cuisine = the best matching cuisine label or "".
${webSharedRules(d)}

PAGE:
${page}`;
}

/**
 * Ramo di riserva quando nessuna pagina è leggibile.
 *
 * NOTA ONESTÀ: qui la ricetta è generata, non estratta. `sourceUrl` resta
 * vuoto di proposito — il prototipo ci metteva l'URL del primo risultato di
 * ricerca anche quando la pagina non era mai stata letta, e l'utente che
 * cliccava trovava una ricetta diversa da quella mostrata. Il client
 * etichetta questo caso come "ricetta generata".
 */
export function webSynthesizePrompt(d: WebRecipeInput): string {
  return `Write a complete, authentic recipe for "${d.dishName}".
Synthesize the classic version of this dish as an experienced home cook would prepare it.
Set extractionMode = "ai-assisted", sourceWebsite = "", sourceUrl = "", image = "", and cuisine = the best matching cuisine label or "".
${webSharedRules(d)}${vincoloDispensa(d.dispensa, d.servings)}`;
}

export function chefPrompt(d: ChefInput): string {
  const ingredients = d.ingredients.map((i) => `- ${i.quantity} ${i.name}`).join("\n");
  const base = d.baseSteps.length > 0 ? d.baseSteps.map((s, i) => `${i + 1}. ${s}`).join("\n") : "(nessun passaggio di partenza)";
  return `You are a Michelin-trained private chef guiding a confident home cook.

Rewrite ONLY the culinary experience of this recipe: title, a short appetising description, and the cooking instructions. Add technique cues (heat level, texture, timing, seasoning moments, resting, plating) that make the result genuinely better.

HARD CONSTRAINTS — violating these breaks the shopping list:
- Do NOT add, remove or substitute any ingredient.
- Do NOT change quantities or servings.
- Work strictly with the ingredients listed below.

${d.cuisine ? `Cuisine: ${d.cuisine}. Respect its techniques and seasoning logic.` : ""}
${d.country ? `The cook is in ${d.country}: use equipment and terms familiar there.` : ""}
Servings: ${d.servings}.
CRITICAL LANGUAGE RULE: write title, description and every step in language code "${d.language}". Never emit English when the target language is not English.

TITLE: ${d.title}

INGREDIENTS (immutable):
${ingredients}

BASE STEPS:
${base}

Return 4-10 steps. Keep each step one clear action a cook can follow without re-reading.`;
}

export function planPrompt(d: PlanInput, budgetDisplay: string): string {
  const periodDays = d.frequency === "weekly" ? 7 : 30;
  return `You are a smart food budget planner for families. Generate a realistic, locally-priced food plan.

USER:
- Location: ${d.city}${d.country ? `, ${d.country}` : ""}
- Household size: ${d.household} people
- Budget: ${budgetDisplay} ${d.frequency}
- Food style: ${d.style}
- Allergies/diet: ${d.allergies.join(", ") || "none"}
- Dislikes: ${d.dislikes || "none"}

CRITICAL LANGUAGE RULE: Write ALL generated text — meal names (breakfast/lunch/dinner), grocery item names, categories, saving tips and budgetAnalysis — in language code "${d.language}". NEVER emit English text when the target language is not English.

${d.country ? `COUNTRY / CULTURAL RULE: this household is in ${d.country}. Generate meal names, dishes, cuts of meat, grocery items and brands that are native, common and easily bought in ${d.country}. Prefer local dishes families actually eat there (e.g. Italy → pasta e ceci, parmigiana, risotto; UK → shepherd's pie, jacket potato; Germany → Kartoffelsalat, Rouladen; France → boeuf bourguignon, ratatouille; Spain → tortilla, lentejas). Do not just translate English dish names.` : ""}

RULES:
- Use realistic local grocery prices for ${d.city}${d.country ? `, ${d.country}` : ""}.
- NEVER intentionally exceed the user budget. Keep a safety margin when possible.
- Generate a ${periodDays}-day meal plan (one entry per day).
- Status:
  - "comfortable" if estimatedCost <= 85% of budget
  - "optimized" if estimatedCost is 85-98% of budget
  - "critical" if estimatedCost is 98-100% of budget
  - "too_low" ONLY if a minimally nutritious plan for this household is impossible within budget. In that case provide recommendedBudget (comfortable) and minimumBudget (bare minimum).
- For non-too_low statuses, set recommendedBudget and minimumBudget to null.
- All monetary numbers must be in ${d.currency} (no symbols, plain numbers).
- safetyMargin = budget - estimatedCost.
- Provide a concise grocery list grouped logically by category (Produce, Proteins, Dairy, Pantry, etc.).
- Provide 3-5 short money-saving tips tailored to the user.
- budgetAnalysis: 1-2 sentence summary.`;
}
