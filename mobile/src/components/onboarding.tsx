/**
 * Elementi comuni ai sei passi dell'onboarding.
 *
 * Il prototipo web ha un componente `Question` che incapsula intestazione,
 * corpo e pulsante avanti. Qui la stessa idea, adattata al tocco: le opzioni
 * hanno aree cliccabili generose e l'avanti sta in fondo, dove il pollice
 * arriva senza spostare la mano.
 */

import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Body, Button, Screen, Subtitle, Title } from "./ui";
import { colors, font, radius, spacing } from "../theme";

/** I sei passi, nell'ordine. Serve a numerare e a tornare indietro. */
export const STEPS = ["citta", "persone", "budget", "stile", "allergie", "extra"] as const;
export type StepName = (typeof STEPS)[number];

/**
 * Struttura di un passo. `canNext` disabilita l'avanti finché la risposta
 * manca: meglio un pulsante spento di un errore dopo il tocco.
 */
export function Step({
  step,
  title,
  subtitle,
  canNext,
  nextLabel,
  onNext,
  children,
}: {
  step: StepName;
  title: string;
  subtitle: string;
  canNext: boolean;
  nextLabel?: string;
  onNext: () => void;
  children: ReactNode;
}) {
  const index = STEPS.indexOf(step);
  return (
    <Screen
      footer={
        <Button label={nextLabel ?? "Continua"} onPress={onNext} disabled={!canNext} />
      }
    >
      <View style={styles.head}>
        <Progress current={index} />
        <Text style={styles.stepLabel}>
          Passo {index + 1} di {STEPS.length}
        </Text>
        <Title>{title}</Title>
        <Subtitle>{subtitle}</Subtitle>
      </View>
      <View style={styles.body}>{children}</View>
    </Screen>
  );
}

/** Barra di avanzamento: sei segmenti, quelli fatti pieni. */
function Progress({ current }: { current: number }) {
  return (
    <View style={styles.progress} accessibilityLabel={`Passo ${current + 1} di ${STEPS.length}`}>
      {STEPS.map((s, i) => (
        <View key={s} style={[styles.segment, i <= current && styles.segmentDone]} />
      ))}
    </View>
  );
}

/** Riga selezionabile a piena larghezza, con spunta a destra quando attiva. */
export function Choice({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        selected && styles.choiceOn,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.choiceText}>
        <Text style={[styles.choiceLabel, selected && styles.choiceLabelOn]}>{label}</Text>
        {hint ? <Text style={styles.choiceHint}>{hint}</Text> : null}
      </View>
      {selected ? <Text style={styles.tick}>✓</Text> : null}
    </Pressable>
  );
}

/** Casella quadrata per opzioni brevi (numero di persone). */
export function Tile({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, selected && styles.tileOn, pressed && styles.pressed]}
    >
      <Text style={[styles.tileLabel, selected && styles.tileLabelOn]}>{label}</Text>
    </Pressable>
  );
}

/** Opzione a selezione multipla (allergie e diete). */
export function Toggle({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.toggle, selected && styles.toggleOn, pressed && styles.pressed]}
    >
      <View style={[styles.checkbox, selected && styles.checkboxOn]}>
        {selected ? <Text style={styles.checkboxTick}>✓</Text> : null}
      </View>
      <Text style={[styles.toggleLabel, selected && styles.toggleLabelOn]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Riquadro informativo tenue, per note che non richiedono azione. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <View style={styles.note}>
      <Body style={styles.noteText}>{children}</Body>
    </View>
  );
}

/** Torna al passo precedente, o alla schermata iniziale dal primo. */
export function useBack(step: StepName) {
  const router = useRouter();
  const index = STEPS.indexOf(step);
  return () => {
    if (index <= 0) router.replace("/");
    else router.back();
  };
}

const styles = StyleSheet.create({
  head: { gap: spacing.sm, paddingTop: spacing.sm },
  body: { gap: spacing.sm, marginTop: spacing.md },

  progress: { flexDirection: "row", gap: 4, marginBottom: spacing.sm },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  segmentDone: { backgroundColor: colors.primary },

  stepLabel: {
    fontFamily: undefined,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    color: colors.primary,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },

  choice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  choiceOn: { borderColor: colors.primary, backgroundColor: colors.successBg },
  choiceText: { flex: 1, gap: 2 },
  choiceLabel: { fontSize: font.size.md, fontWeight: font.weight.medium, color: colors.foreground },
  choiceLabelOn: { fontWeight: font.weight.semibold },
  choiceHint: { fontSize: font.size.sm, color: colors.mutedForeground },
  tick: { fontSize: font.size.lg, color: colors.primary, fontWeight: font.weight.bold },

  tile: {
    flex: 1,
    aspectRatio: 1,
    minWidth: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  tileOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  tileLabel: { fontSize: font.size.lg, fontWeight: font.weight.semibold, color: colors.foreground },
  tileLabelOn: { color: colors.primaryForeground },

  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  toggleOn: { borderColor: colors.primary, backgroundColor: colors.successBg },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.8,
    borderColor: colors.mutedForeground,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  checkboxTick: { color: colors.primaryForeground, fontSize: 13, fontWeight: font.weight.bold },
  toggleLabel: { flex: 1, fontSize: font.size.md, color: colors.foreground },
  toggleLabelOn: { fontWeight: font.weight.semibold },

  pressed: { opacity: 0.85 },

  note: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    backgroundColor: colors.muted,
    marginTop: spacing.sm,
  },
  noteText: { fontSize: font.size.sm, color: colors.mutedForeground },
});
