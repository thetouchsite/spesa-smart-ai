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

import { useEffect, useState } from "react";
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
import { localDay } from "../src/lib/days";
import { DishPhoto } from "../src/components/dish-photo";
import { fotoDiPiuPiatti, fotoNota } from "../src/lib/recipes/foto";
import { colors, font, radius, spacing } from "../src/theme";
import { uiText } from "../src/lib/ui-strings";
import { useI18n } from "../src/lib/i18n";
import { tornaIndietro } from "../src/lib/navigazione";

const MEALS = [
  { key: "breakfast" as const, label: "Colazione", icon: "sunny-outline" as const },
  { key: "lunch" as const, label: "Pranzo", icon: "partly-sunny-outline" as const },
  { key: "dinner" as const, label: "Cena", icon: "moon-outline" as const },
];

export default function MenuScreen() {
  const { language } = useI18n();
  /** Testo nella lingua scelta dall'utente. */
  const ui = (t: string) => uiText(t, language);
  const router = useRouter();
  const { currentPlan } = useSession();

  /* Le foto di tutta la settimana in una richiesta sola.
     Ventuno pasti sarebbero ventuno richieste, e con le miniature che si
     ridisegnano a ogni scorrimento diventerebbero molte di piu'. Qui si
     chiedono insieme una volta, e da li' in poi sono in memoria. */
  const [fotoPronte, setFotoPronte] = useState(0);
  useEffect(() => {
    const piatti = (currentPlan?.mealPlan ?? []).flatMap((g) =>
      MEALS.map((m) => (g as Record<string, unknown>)[m.key] as string).filter(Boolean),
    );
    if (piatti.length === 0) return;
    let vivo = true;
    void fotoDiPiuPiatti(piatti).then(() => {
      /* Un contatore invece delle foto: servono solo a far ridisegnare la
         schermata, e i valori veri li legge `fotoNota` dalla sua memoria. */
      if (vivo) setFotoPronte((n: number) => n + 1);
    });
    return () => {
      vivo = false;
    };
  }, [currentPlan]);
  void fotoPronte;

  if (!currentPlan) {
    return (
      <Screen barra>
        <TopBar onBack={() => tornaIndietro()} />
        <View style={styles.empty}>
          <Title>{ui("Nessun menù")}</Title>
          <Subtitle>{ui("Crea prima un piano.")}</Subtitle>
          <Button label={ui("Comincia")} onPress={() => router.replace("/onboarding/citta")} />
        </View>
      </Screen>
    );
  }

  /* IL PULSANTE «LISTA DELLA SPESA» NON C'E' PIU'.
     Era il footer di questa schermata, e diceva esattamente quello che dice
     la seconda voce della barra in basso, a tre centimetri di distanza. Due
     comandi identici uno sopra l'altro non sono una comodita': fanno dubitare
     che facciano la stessa cosa. */
  return (
    <Screen barra>
      <TopBar title={ui("Il menù")} onBack={() => tornaIndietro("/risultati")} />

      <View style={styles.head}>
        <Title>{ui("La tua settimana")}</Title>
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
              <Label icon="calendar-outline">{localDay(day.day, language)}</Label>
              {zeroSpend ? (
                <Pill tone="success" icon="leaf-outline">
                  {ui("spesa zero")}
                </Pill>
              ) : null}
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
                  {/* Senza foto vera si disegna un segnaposto: i servizi
                      gratuiti cadono, e un riquadro rotto e' peggio. Il
                      credito nelle miniature non si mostra — non ci starebbe —
                      e infatti compare sotto la foto grande, nella ricetta. */}
                  <DishPhoto uri={fotoNota(dish)?.url} nome={dish} style={styles.thumb} compatto />
                  <View style={styles.mealText}>
                    <View style={styles.mealTop}>
                      <Ionicons name={m.icon} size={13} color={colors.mutedForeground} />
                      <Body style={styles.mealLabel}>{ui(m.label)}</Body>
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
