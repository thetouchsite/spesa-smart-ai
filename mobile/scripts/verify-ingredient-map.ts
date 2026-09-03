/**
 * Verification harness for the multilingual ingredient resolver.
 *
 * Exercises the REAL shipped modules (generated map + manual overrides +
 * catalog matching) against a fixture of ingredient names in the form the
 * recipe engine actually produces them. Reports the resolution rate and,
 * more importantly, lists wrong resolutions separately from misses — a wrong
 * price on a common row is worse than no price at all.
 *
 * Run: node scripts/verify-ingredient-map.mjs   (built by the npm script)
 */
import { resolveIngredientKey } from "../src/lib/price-data/resolve-ingredient";

type Case = [term: string, expected: string | null];

const IT: Case[] = [
  ["Pomodori pelati", "tomatoes"], ["Petto di pollo", "chicken_breast"],
  ["Olio extra vergine di oliva", "olive_oil"], ["Cipolla", "onions"],
  ["Aglio", "garlic"], ["Mozzarella di bufala", "mozzarella"],
  ["Farina 00", "flour"], ["Basilico fresco", "fresh_herbs"],
  ["Parmigiano grattugiato", "parmesan"], ["Uova", "eggs"],
  ["Pasta", "pasta"], ["Riso", "rice"], ["Latte intero", "milk"],
  ["Burro", "butter"], ["Zucchine", "zucchini"], ["Melanzane", "eggplant"],
  ["Peperoni", "bell_peppers"], ["Carote", "carrots"], ["Patate", "potatoes"],
  ["Sedano", "celery"], ["Tonno in scatola", "tuna_can"], ["Ceci", "chickpeas"],
  ["Lenticchie rosse", "red_lentils"], ["Yogurt greco", "greek_yogurt"],
  ["Salmone", "salmon_fillet"], ["Limone", "lemons"], ["Spinaci", "spinach"],
  ["Funghi champignon", "mushrooms"], ["Panna da cucina", "cream"],
  ["Prosciutto cotto", "ham"], ["Manzo macinato", "beef_mince"],
  ["Fagioli neri", "black_beans"], ["Mele", "apples"], ["Banane", "bananas"],
  ["Miele", "honey"], ["Aceto balsamico", "balsamic_vinegar"],
  ["Zucchero", "sugar"], ["Sale fino", "salt"], ["Pepe nero", "black_pepper"],
  ["Spaghetti", "pasta"], ["Passata di pomodoro", "tomato_sauce"],
  ["400 g di ceci", "chickpeas"], ["Broccoli", "broccoli"],
  ["Rucola", "rocket"], ["Piselli", "peas"],
];

const OTHER: Case[] = [
  ["Courgettes", "zucchini"], ["Pommes de terre", "potatoes"],
  ["Huile d'olive", "olive_oil"], ["Poitrine de poulet", "chicken_breast"],
  ["Calabacín", "zucchini"], ["Patatas", "potatoes"], ["Garbanzos", "chickpeas"],
  ["Kartoffeln", "potatoes"], ["Kichererbsen", "chickpeas"], ["Zwiebel", "onions"],
];

/** English must pass through untouched so the existing matcher still owns it. */
const EN_PASSTHROUGH = ["Chicken breast", "Tomatoes", "Olive oil", "Greek yogurt"];

function run(label: string, cases: Case[]) {
  let ok = 0, wrong = 0, missed = 0;
  const problems: string[] = [];
  for (const [term, expected] of cases) {
    const got = resolveIngredientKey(term);
    if (got === expected) ok++;
    else if (got === null) { missed++; problems.push(`  MISS   ${term.padEnd(30)} atteso ${expected}`); }
    else { wrong++; problems.push(`  WRONG  ${term.padEnd(30)} atteso ${expected}, ottenuto ${got}`); }
  }
  const pct = Math.round((ok / cases.length) * 100);
  console.log(`\n${label}: ${ok}/${cases.length} = ${pct}%  (non trovati ${missed}, sbagliati ${wrong})`);
  if (problems.length) console.log(problems.join("\n"));
  return { ok, total: cases.length, wrong };
}

const it = run("ITALIANO", IT);
const other = run("FR / ES / DE", OTHER);

let passthroughOk = true;
for (const term of EN_PASSTHROUGH) {
  const got = resolveIngredientKey(term);
  // English may resolve (harmless — it maps to itself) but must never map to
  // an unrelated row. A null result is equally fine.
  if (got && !term.toLowerCase().includes(got.split("_")[0].slice(0, 4))) {
    console.log(`  EN DRIFT  ${term} -> ${got}`);
    passthroughOk = false;
  }
}

const total = it.ok + other.ok;
const count = it.total + other.total;
console.log(`\n${"─".repeat(60)}`);
console.log(`TOTALE: ${total}/${count} = ${Math.round((total / count) * 100)}%`);
console.log(`Risoluzioni errate: ${it.wrong + other.wrong}  ·  passthrough inglese: ${passthroughOk ? "ok" : "DRIFT"}`);
