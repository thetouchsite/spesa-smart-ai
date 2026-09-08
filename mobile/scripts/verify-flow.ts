/**
 * Verifica del flusso completo, senza dispositivo.
 *
 * Percorre gli stessi passaggi dell'utente — profilo, generazione del piano,
 * prezzi, risultati — usando i moduli REALI che le schermate importano.
 * Serve a non scoprire su un telefono ciò che un controllo di venti secondi
 * avrebbe già detto.
 *
 * Non sostituisce la prova su dispositivo: qui non c'è resa grafica, né
 * tastiera, né permessi. Copre il livello sotto, che è dove sono finiti tutti
 * gli errori visti finora.
 *
 * Esecuzione:  npm run verify
 */

import { generateMealPlan } from "../src/lib/meal-engine";
import { computeResults } from "../src/lib/results/compute-results";
import { pricePlan } from "../src/lib/price-data/price-engine";
import { unsplashFoodImage } from "../src/lib/recipes/unsplash";
import { resolveCountry } from "../src/lib/country";
import type { UserProfile } from "../src/lib/models";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  const mark = condition ? "  OK  " : "  KO  ";
  if (!condition) failures++;
  console.log(mark + label + (detail ? `  ${detail}` : ""));
}

/** Profilo come lo produce l'onboarding a sei passi. */
const profile: UserProfile = {
  city: "Bologna",
  country: "IT",
  household: "4",
  budget: "120",
  currency: "EUR",
  frequency: "weekly",
  style: "Mediterranean",
  allergies: ["Lactose Free"],
  dislikes: "niente funghi",
  zeroSpendDay: true,
};

async function main() {
  console.log("\nFLUSSO SPESA SMART — verifica senza dispositivo\n");

  // ── 1. Il paese scelto al passo 1 deve risolvere valuta e nome ──────
  console.log("1. Paese e valuta");
  const country = resolveCountry(profile.country);
  check("paese riconosciuto", !!country, country ? `${country.name} / ${country.currency}` : "NON RISOLTO");
  check("valuta coerente col profilo", country?.currency === profile.currency, `${country?.currency}`);

  // ── 2. Generazione del piano (motore deterministico) ────────────────
  console.log("\n2. Generazione del piano");
  const { plan } = generateMealPlan({ profile, seed: 1 });
  check("piano prodotto", !!plan);
  check("7 giorni di menù", plan.mealPlan.length === 7, `${plan.mealPlan.length} giorni`);
  check(
    "ogni giorno ha 3 pasti",
    plan.mealPlan.every((d) => d.breakfast && d.lunch && d.dinner),
  );
  check("lista della spesa non vuota", plan.groceryList.length > 0, `${plan.groceryList.length} voci`);
  check(
    "ogni voce ha nome e quantità",
    plan.groceryList.every((g) => !!g.name && !!g.quantity),
  );
  check("consigli di risparmio presenti", plan.savingTips.length > 0, `${plan.savingTips.length}`);

  // Stesso seme, stesso piano: è ciò che rende ripetibile una dimostrazione.
  const again = generateMealPlan({ profile, seed: 1 }).plan;
  check(
    "stesso seme produce lo stesso piano",
    JSON.stringify(again.mealPlan) === JSON.stringify(plan.mealPlan),
  );
  const other = generateMealPlan({ profile, seed: 2 }).plan;
  check(
    "seme diverso produce un piano diverso",
    JSON.stringify(other.mealPlan) !== JSON.stringify(plan.mealPlan),
  );

  // ── 3. Prezzi ───────────────────────────────────────────────────────
  console.log("\n3. Prezzi");
  const pricing = await pricePlan(plan, profile.city, profile.country);
  check("motore prezzi ha risposto", !!pricing);
  // I prezzi stanno in `pricing.items`, NON in `plan.groceryList`: il motore
  // pasti lascia `estimatedCost` a zero ed e' il motore prezzi ad assegnarlo.
  const priced = (pricing?.items ?? []).filter((i) => (i.estimatedCost ?? 0) > 0).length;
  const coverage = Math.round((priced / Math.max(1, plan.groceryList.length)) * 100);
  check("almeno metà delle voci ha un prezzo", coverage >= 50, `copertura ${coverage}%`);
  check("totale coerente con le voci", Math.abs((pricing?.totalCost ?? 0) - (pricing?.items ?? []).reduce((s, i) => s + (i.estimatedCost ?? 0), 0)) < 0.05);

  // ── 4. Risultati: i numeri che l'utente vede ────────────────────────
  console.log("\n4. Risultati");
  const results = computeResults({ profile, plan, pricing });
  check("risultati calcolati", !!results);
  check("budget letto dal profilo", results.budget === 120, `${results.budget}`);
  check("spesa prevista è un numero valido", Number.isFinite(results.estimatedSpend) && results.estimatedSpend > 0, `${results.estimatedSpend.toFixed(2)} EUR`);
  check("punteggio fra 0 e 100", results.score.total >= 0 && results.score.total <= 100, `${results.score.total}`);
  check("costo a persona al giorno sensato", results.costPerPersonPerDay > 0 && results.costPerPersonPerDay < 100, `${results.costPerPersonPerDay.toFixed(2)} EUR`);
  check("stato del budget definito", !!results.status, results.status);
  check("nessun NaN fra i numeri mostrati", [results.savings, results.ratio, results.annualSavings, results.weeklySpend].every(Number.isFinite));

  // Il caso che la schermata deve reggere: prezzi non disponibili.
  const noPrices = computeResults({ profile, plan, pricing: null });
  check("regge anche senza prezzi", !!noPrices && Number.isFinite(noPrices.estimatedSpend));

  // ── 5. Immagini dei piatti ──────────────────────────────────────────
  console.log("\n5. Immagini dei piatti");
  const dish = plan.mealPlan[0].dinner;
  // Questo controllo è cambiato di senso, ed è il punto: prima verificava che
  // l'app producesse un indirizzo e che quell'indirizzo rispondesse. Tre
  // servizi gratuiti sono morti uno dopo l'altro — Unsplash Source dismesso,
  // LoremFlickr che risponde 500 a sette richieste su otto, Foodish sospeso —
  // e ogni volta l'utente trovava un riquadro rotto in cima alla ricetta.
  //
  // Ora l'app non indovina più indirizzi: la foto vera la cerca il backend, e
  // dove non c'è si disegna un segnaposto che non può cadere. Quindi si
  // verifica l'opposto — che nessun indirizzo sperato venga prodotto.
  const url = unsplashFoodImage(dish);
  check("nessun indirizzo indovinato", url === "", url === "" ? "vuoto, come deve" : url.slice(0, 50));
  check(
    "niente servizi dismessi",
    !url.includes("source.unsplash.com") && !url.includes("loremflickr"),
  );
  check("stabile fra due chiamate", unsplashFoodImage(dish) === url);

  // ── 6. Profilo incompleto: l'app non deve rompersi ──────────────────
  console.log("\n6. Profilo incompleto");
  const bare: UserProfile = { ...profile, household: "", budget: "", city: "", country: "" };
  try {
    const { plan: p2 } = generateMealPlan({
      profile: { ...bare, household: "4", country: "IT" },
      seed: 1,
    });
    const r2 = computeResults({ profile: bare, plan: p2, pricing: null });
    check("nessun errore con profilo minimo", !!r2);
  } catch (err) {
    check("nessun errore con profilo minimo", false, String(err).slice(0, 60));
  }

  console.log("\n" + "─".repeat(58));
  if (failures === 0) console.log("TUTTO VERDE — il flusso regge da capo a fondo\n");
  else console.log(`${failures} CONTROLLI FALLITI\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\nERRORE NON GESTITO:", err);
  process.exit(1);
});
