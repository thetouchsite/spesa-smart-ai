/**
 * Dettaglio della ricetta.
 *
 * `fetchRecipe` prova il backend e ricade sul motore deterministico locale se
 * non risponde. La schermata mostra sempre qualcosa, e dichiara in fondo da
 * dove viene la ricetta.
 *
 * Quest'ultimo punto non e' un dettaglio: il prototipo attribuiva a siti reali
 * anche le ricette inventate dal modello, e un investitore che tocca il link
 * se ne accorge. Qui la fonte e' dichiarata per quello che e'.
 *
 * SCORCIATOIA: LA RICETTA CE L'ABBIAMO GIA'
 * -----------------------------------------
 * Quando il piano viene dal motore con ricerca, le ricette delle cene sono
 * gia' arrivate insieme al menu', nella lingua giusta e con le dosi calcolate
 * sul numero di persone del profilo. In quel caso non si chiama nessuno: la
 * schermata si apre subito invece di far aspettare dieci secondi per
 * riottenere qualcosa che e' gia' in memoria.
 */

import { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  Body,
  Button,
  Card,
  Label,
  Loading,
  Pill,
  Screen,
  Subtitle,
  Title,
  TopBar,
} from "../src/components/ui";
import { fetchRecipe, type ContentSource } from "../src/lib/content";
import type { Recipe } from "../src/lib/recipes/types";
import type { Recipe as GeneratedRecipe } from "../src/lib/plan-full";
import { DishPhoto } from "../src/components/dish-photo";
import { useFotoPiatto } from "../src/lib/recipes/foto";
import { useSession } from "../src/lib/state/session";
import { localDay } from "../src/lib/days";
import { useI18n } from "../src/lib/i18n";
import { productLabel } from "../src/lib/price-data/labels";
import { colors, font, radius, spacing } from "../src/theme";
import { uiText } from "../src/lib/ui-strings";
import { tornaIndietro } from "../src/lib/navigazione";

const DIFFICULTY: Record<string, string> = {
  easy: "facile",
  medium: "media",
  hard: "impegnativa",
};

const MEAL_LABEL: Record<string, string> = {
  breakfast: "Colazione",
  lunch: "Pranzo",
  dinner: "Cena",
};

/**
 * Cerca fra le ricette gia' generate quella del piatto richiesto.
 *
 * Il confronto e' sul nome normalizzato perche' il menu' e la ricetta possono
 * scriverlo in modo leggermente diverso — "Pasta al pomodoro e basilico" nel
 * menu', "Pasta al pomodoro" nella ricetta. Si accetta anche quando uno
 * contiene l'altro, che copre quasi tutti i casi senza inventare accostamenti.
 */
function matchGenerated(
  ricette: GeneratedRecipe[] | undefined,
  dish: string,
): GeneratedRecipe | null {
  if (!ricette?.length || !dish) return null;
  const norm = (t: string) =>
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9 ]/g, "")
      .trim();

  const target = norm(dish);
  return (
    ricette.find((r) => norm(r.piatto) === target) ??
    ricette.find((r) => {
      const p = norm(r.piatto);
      return p.length > 6 && (p.includes(target) || target.includes(p));
    }) ??
    null
  );
}

/**
 * Traduce la ricetta del motore nella forma che la schermata gia' usa.
 *
 * `sourceUrl` resta vuoto di proposito: la ricetta l'ha scritta il modello, e
 * attribuirla a un sito che non l'ha pubblicata sarebbe la stessa bugia del
 * prototipo. La schermata dichiara "generata dall'assistente" ed e' la verita'.
 */
function toRecipe(g: GeneratedRecipe, dish: string, servings: number): Recipe {
  const total = (g.prep_minuti ?? 0) + (g.cottura_minuti ?? 0);
  return {
    id: `gen-${norm32(g.piatto || dish)}`,
    title: g.piatto || dish,
    // Vuota: la cerca il backend, e se non c'e' si disegna il segnaposto.
    image: "",
    servings: g.porzioni || servings,
    prepMinutes: g.prep_minuti ?? 0,
    cookMinutes: g.cottura_minuti ?? 0,
    // Una soglia grossolana ma onesta: sotto la mezz'ora e' roba da tutti i
    // giorni, oltre l'ora richiede impegno.
    difficulty: total <= 30 ? "easy" : total <= 60 ? "medium" : "hard",
    ingredients: (g.ingredienti ?? []).map((i) => ({ name: i.nome, quantity: i.quantita })),
    steps: g.passaggi ?? [],
    nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    allergens: [],
    source: "ai",
    sourceUrl: "",
  };
}

/** Identificatore stabile a partire dal nome del piatto. */
function norm32(t: string): string {
  return (
    t
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 32) || "ricetta"
  );
}

export default function RicettaScreen() {
  /** Testo nella lingua scelta dall'utente. */
  const ui = (t: string) => uiText(t, language);
  const { profile, planExtra, currentPlan } = useSession();
  const { language } = useI18n();
  const params = useLocalSearchParams<{ piatto?: string; pasto?: string; giorno?: string }>();

  const dish = params.piatto ?? "";
  const mealType = (params.pasto as "breakfast" | "lunch" | "dinner") ?? "dinner";
  const servings = Math.max(1, parseInt((profile.household || "4").replace("+", ""), 10) || 4);

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const fotoTrovata = useFotoPiatto(recipe?.title);
  const [source, setSource] = useState<ContentSource>("locale");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dish) {
      setLoading(false);
      return;
    }
    // Se il piano con ricerca ha gia' portato questa ricetta, si usa quella:
    // niente attesa, niente chiamata, e il testo e' gia' nella lingua giusta.
    const gia = matchGenerated(planExtra?.ricette, dish);
    if (gia) {
      setRecipe(toRecipe(gia, dish, servings));
      setSource("ai");
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);
    (async () => {
      // `fetchRecipe` prova il backend e ricade sul motore locale: qui non
      // serve gestire l'errore, perche' una ricetta arriva sempre.
      const result = await fetchRecipe(dish, {
        servings,
        mealType,
        language,
        country: profile.country || "",
        allergies: profile.allergies,
        // La spesa gia' fatta. Senza, la ricetta si inventava ingredienti che
        // nella lista non c'erano, e chi apriva il piatto non poteva cucinarlo.
        dispensa: (currentPlan?.groceryList ?? []).map((g) => `${g.name} ${g.quantity}`.trim()),
      });
      if (!alive) return;
      setRecipe(result.recipe);
      setSource(result.source);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [dish, servings, mealType, profile.country, language, planExtra, currentPlan]);

  if (loading) {
    return (
      <Screen>
        <TopBar onBack={() => tornaIndietro("/menu")} />
        <Loading text={ui("Preparo la ricetta…")} />
      </Screen>
    );
  }

  if (!recipe) {
    return (
      <Screen>
        <View style={styles.empty}>
          <Title>{ui("Ricetta non trovata")}</Title>
          <Subtitle>{ui("Torna al menù e scegli un piatto.")}</Subtitle>
          <Button label={ui("Torna al menù")} onPress={() => tornaIndietro("/menu")} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen footer={<Button label={ui("Torna al menù")} onPress={() => tornaIndietro("/menu")} />}>
      {/* La foto arriva dal backend, che la cerca su Wikimedia Commons. Se la
          ricetta ne porta gia' una — quelle di TheMealDB ce l'hanno — vince
          quella: e' la foto DI QUEL piatto, non una trovata cercando il nome. */}
      <DishPhoto
        uri={recipe.image || fotoTrovata?.url}
        credito={recipe.image ? undefined : fotoTrovata?.credito}
        nome={recipe.title}
        style={styles.photo}
      />

      <View style={styles.head}>
        {params.giorno ? (
          <Body style={styles.eyebrow}>
            {localDay(params.giorno, language)} · {MEAL_LABEL[mealType] ?? ""}
          </Body>
        ) : null}
        <Title>{recipe.title}</Title>
        {recipe.description ? <Subtitle>{recipe.description}</Subtitle> : null}
      </View>

      <View style={styles.facts}>
        <Fact value={`${recipe.prepMinutes}′`} label="preparazione" />
        <Fact value={`${recipe.cookMinutes}′`} label="cottura" />
        <Fact
          value={`${recipe.servings}`}
          label={recipe.servings === 1 ? "porzione" : "porzioni"}
        />
        <Fact value={DIFFICULTY[recipe.difficulty] ?? recipe.difficulty} label={ui("difficoltà")} />
      </View>

      <Card>
        <Label>Ingredienti</Label>
        {recipe.ingredients.map((ing, i) => (
          <View key={`${ing.name}-${i}`} style={styles.ingredient}>
            <Body style={styles.ingName}>{productLabel(ing.name, language) ?? ing.name}</Body>
            <Body style={styles.ingQty}>{ing.quantity}</Body>
          </View>
        ))}
      </Card>

      <Card>
        <Label>{ui("Come si prepara")}</Label>
        {recipe.steps.map((step, i) => (
          <View key={i} style={styles.step}>
            <View style={styles.stepNum}>
              <Body style={styles.stepNumText}>{i + 1}</Body>
            </View>
            <Body style={styles.stepText}>{step}</Body>
          </View>
        ))}
      </Card>

      {recipe.nutrition ? (
        <Card>
          <Label>{ui("Valori per porzione")}</Label>
          <View style={styles.facts}>
            <Fact value={`${Math.round(recipe.nutrition.calories)}`} label="kcal" />
            <Fact value={`${Math.round(recipe.nutrition.protein)} g`} label="proteine" />
            <Fact value={`${Math.round(recipe.nutrition.carbs)} g`} label="carboidrati" />
            <Fact value={`${Math.round(recipe.nutrition.fat)} g`} label="grassi" />
          </View>
        </Card>
      ) : null}

      {recipe.allergens?.length ? (
        <Card>
          <Label>Allergeni</Label>
          <View style={styles.pills}>
            {recipe.allergens.map((a) => (
              <Pill key={a} tone="warning">
                {a}
              </Pill>
            ))}
          </View>
        </Card>
      ) : null}

      {/* Onestà sulla fonte: questa ricetta è costruita dall'app, non presa
          da un sito. Dirlo evita che un link porti altrove. */}
      <Card style={styles.note}>
        <Label icon="information-circle-outline">{ui("Da dove viene questa ricetta")}</Label>
        <Body style={styles.small}>
          {source === "ai"
            ? "Generata su misura per le tue preferenze, con ingredienti e dosi adattati al numero di persone."
            : "Versione classica del piatto, costruita dall'app senza collegarsi a internet. Con il servizio attivo le ricette sono su misura."}
        </Body>
      </Card>
    </Screen>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.fact}>
      <Body style={styles.factValue}>{value}</Body>
      <Body style={styles.factLabel}>{label}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: {
    width: "100%",
    height: 200,
    borderRadius: radius.lg,
    backgroundColor: colors.muted,
  },
  head: { gap: spacing.xs },
  eyebrow: {
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    color: colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  empty: { gap: spacing.lg, paddingTop: spacing.xxxl, alignItems: "flex-start" },

  facts: { flexDirection: "row", gap: spacing.sm },
  fact: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    gap: 2,
  },
  factValue: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.foreground },
  factLabel: { fontSize: font.size.xs, color: colors.mutedForeground },

  ingredient: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  ingName: { flex: 1, fontSize: font.size.md, color: colors.foreground },
  ingQty: { fontSize: font.size.md, color: colors.mutedForeground },

  step: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.sm },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.successBg,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { color: colors.primary, fontWeight: font.weight.bold, fontSize: font.size.sm },
  stepText: { flex: 1, fontSize: font.size.md, color: colors.foreground, lineHeight: 23 },

  pills: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  note: { backgroundColor: colors.muted },
  small: { fontSize: font.size.sm, color: colors.mutedForeground, lineHeight: 20 },
});
