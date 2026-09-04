/**
 * Menù della settimana.
 *
 * Ogni pasto è toccabile e porta alla ricetta: ingredienti, procedimento,
 * valori nutrizionali. È il percorso che nella demo si mostra per primo.
 *
 * Le foto dei piatti arrivano da `unsplashFoodImage`, che ora punta a un
 * servizio funzionante — nel prototipo del cliente erano tutte rotte perché
 * `source.unsplash.com` è stato dismesso.
 */

import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  Body,
  Button,
  Card,
  Ionicons,
  Label,
  Pill,
  Screen,
  Subtitle,
  Title,
  TopBar,
} from "../src/components/ui";
import { useSession } from "../src/lib/state/session";
import { unsplashFoodImage } from "../src/lib/recipes/unsplash";
import { colors, font, radius, spacing } from "../src/theme";

/** Il motore pasti produce i giorni in inglese. */
const DAY_IT: Record<string, string> = {
  Monday: "Lunedì", Tuesday: "Martedì", Wednesday: "Mercoledì", Thursday: "Giovedì",
  Friday: "Venerdì", Saturday: "Sabato", Sunday: "Domenica",
};

const MEALS = [
  { key: "breakfast" as const, label: "Colazione", icon: "sunny-outline" as const },
  { key: "lunch" as const, label: "Pranzo", icon: "partly-sunny-outline" as const },
  { key: "dinner" as const, label: "Cena", icon: "moon-outline" as const },
];

export default function MenuScreen() {
  const router = useRouter();
  const { currentPlan } = useSession();

  if (!currentPlan) {
    return (
      <Screen>
        <TopBar onBack={() => router.back()} />
        <View style={styles.empty}>
          <Title>Nessun menù</Title>
          <Subtitle>Crea prima un piano.</Subtitle>
          <Button label="Comincia" onPress={() => router.replace("/onboarding/citta")} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <Button
          label="Lista della spesa"
          icon="cart-outline"
          onPress={() => router.push("/lista")}
        />
      }
    >
      <TopBar title="Il menù" onBack={() => router.back()} />

      <View style={styles.head}>
        <Title>La tua settimana</Title>
        <Subtitle>
          {currentPlan.mealPlan.length} giorni di pasti. Tocca un piatto per vedere la ricetta.
        </Subtitle>
      </View>

      {currentPlan.mealPlan.map((day, i) => {
        const zeroSpend = /avanz|zero|dispensa|leftover/i.test(
          `${day.breakfast} ${day.lunch} ${day.dinner}`,
        );
        return (
          <Card key={`${day.day}-${i}`}>
            <View style={styles.dayHead}>
              <Label icon="calendar-outline">{DAY_IT[day.day] ?? day.day}</Label>
              {zeroSpend ? <Pill tone="success" icon="leaf-outline">spesa zero</Pill> : null}
            </View>

            {MEALS.map((m) => {
              const dish = day[m.key];
              if (!dish) return null;
              return (
                <Pressable
                  key={m.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${m.label}: ${dish}. Apri la ricetta`}
                  onPress={() =>
                    router.push({
                      pathname: "/ricetta",
                      params: { piatto: dish, pasto: m.key, giorno: day.day },
                    })
                  }
                  style={({ pressed }) => [styles.meal, pressed && styles.mealPressed]}
                >
                  <Image
                    source={{ uri: unsplashFoodImage(dish) }}
                    style={styles.thumb}
                    contentFit="cover"
                    transition={200}
                    accessibilityLabel={`Foto di ${dish}`}
                  />
                  <View style={styles.mealText}>
                    <View style={styles.mealTop}>
                      <Ionicons name={m.icon} size={13} color={colors.mutedForeground} />
                      <Body style={styles.mealLabel}>{m.label}</Body>
                    </View>
                    <Body style={styles.mealName} numberOfLines={2}>
                      {dish}
                    </Body>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
                </Pressable>
              );
            })}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: spacing.xs },
  empty: { gap: spacing.lg, paddingTop: spacing.xxxl, alignItems: "flex-start" },
  dayHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  meal: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  mealPressed: { opacity: 0.7 },
  thumb: {
    width: 62,
    height: 62,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
  },
  mealText: { flex: 1, gap: 2 },
  mealTop: { flexDirection: "row", alignItems: "center", gap: 5 },
  mealLabel: {
    fontSize: font.size.xs,
    color: colors.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  mealName: { fontSize: font.size.md, color: colors.foreground, lineHeight: 21 },
});
