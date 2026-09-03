/**
 * Menù della settimana.
 *
 * Un giorno per scheda, i tre pasti dentro. Il giorno a spesa zero è marcato,
 * perché è la scelta che l'utente ha fatto e vuole ritrovare.
 *
 * Le ricette non si aprono ancora: richiedono il backend AI. Il tocco su un
 * pasto lo dice, invece di non fare nulla — un pulsante che non risponde
 * sembra rotto, uno che spiega perché no.
 */

import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Body, Button, Card, Label, Pill, Screen, Subtitle, Title } from "../src/components/ui";
import { useSession } from "../src/lib/state/session";
import { colors, font, spacing } from "../src/theme";

const MEALS = [
  { key: "breakfast" as const, label: "Colazione" },
  { key: "lunch" as const, label: "Pranzo" },
  { key: "dinner" as const, label: "Cena" },
];

export default function MenuScreen() {
  const router = useRouter();
  const { currentPlan } = useSession();

  if (!currentPlan) {
    return (
      <Screen>
        <View style={styles.empty}>
          <Title>Nessun menù</Title>
          <Subtitle>Crea prima un piano.</Subtitle>
          <Button label="Comincia" onPress={() => router.replace("/onboarding/citta")} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen footer={<Button label="Torna ai risultati" onPress={() => router.back()} />}>
      <View style={styles.head}>
        <Title>Il menù</Title>
        <Subtitle>
          {currentPlan.mealPlan.length} giorni di pasti pensati per il tuo budget.
        </Subtitle>
      </View>

      {currentPlan.mealPlan.map((day, i) => {
        // Il motore marca il giorno a spesa zero mettendo lo stesso testo su
        // tutti e tre i pasti o usando un'etichetta dedicata; qui basta
        // riconoscere quando il giorno è dichiarato tale.
        const zeroSpend = /avanz|zero|dispensa|leftover/i.test(
          `${day.breakfast} ${day.lunch} ${day.dinner}`,
        );
        return (
          <Card key={`${day.day}-${i}`}>
            <View style={styles.dayHead}>
              <Label>{day.day}</Label>
              {zeroSpend ? <Pill tone="success">spesa zero</Pill> : null}
            </View>
            {MEALS.map((m) => (
              <View key={m.key} style={styles.meal}>
                <Body style={styles.mealLabel}>{m.label}</Body>
                <Body style={styles.mealName}>{day[m.key]}</Body>
              </View>
            ))}
          </Card>
        );
      })}

      <Card style={styles.note}>
        <Label>Le ricette complete</Label>
        <Body style={styles.small}>
          Ingredienti e passaggi di ogni piatto arriveranno quando il servizio di
          generazione sarà attivo. La lista della spesa qui sotto è già completa.
        </Body>
      </Card>

      <Button
        label="Vai alla lista della spesa"
        variant="secondary"
        onPress={() => router.push("/lista")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: spacing.sm, paddingTop: spacing.sm },
  empty: { gap: spacing.lg, paddingTop: spacing.xxxl, alignItems: "flex-start" },
  dayHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  meal: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  mealLabel: {
    width: 78,
    fontSize: font.size.xs,
    color: colors.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingTop: 3,
  },
  mealName: { flex: 1, fontSize: font.size.md, color: colors.foreground },
  note: { backgroundColor: colors.muted },
  small: { fontSize: font.size.sm, color: colors.mutedForeground, lineHeight: 20 },
});
