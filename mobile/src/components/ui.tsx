/**
 * Primitive dell'interfaccia.
 *
 * Il prototipo usa shadcn/ui su Radix e Tailwind: HTML e CSS, che su mobile
 * non esistono. Invece di cercare un equivalente per ciascuno dei 45
 * componenti — la maggior parte dei quali l'app non usa — qui c'è il minimo
 * che le schermate impiegano davvero, scritto con le primitive React Native.
 *
 * Sono componenti pensati per il tocco: le aree cliccabili rispettano i 44pt
 * minimi indicati da Apple, e ogni elemento interattivo ha un'etichetta di
 * accessibilità.
 */

import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius, shadow, spacing } from "../theme";

/* ────────────────────────────── Schermata ────────────────────────────── */

/**
 * Contenitore di schermata: applica i margini di sicurezza (notch, barra
 * inferiore) e, se scorrevole, lascia spazio in fondo perché l'ultimo
 * elemento non finisca sotto il bordo del telefono.
 */
export function Screen({
  children,
  scroll = true,
  footer,
}: {
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const body = (
    <View style={[styles.screenBody, { paddingTop: insets.top + spacing.lg }]}>{children}</View>
  );

  return (
    <View style={styles.screen}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.xxxl }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>{footer}</View>
      ) : null}
    </View>
  );
}

/* ──────────────────────────────── Testo ──────────────────────────────── */

export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.title, style]}>{children}</Text>;
}

export function Subtitle({ children }: { children: ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Body({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

/* ──────────────────────────────── Scheda ─────────────────────────────── */

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}
    >
      {children}
    </Pressable>
  );
}

/* ─────────────────────────────── Pulsante ────────────────────────────── */

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.buttonPrimary,
        variant === "secondary" && styles.buttonSecondary,
        variant === "ghost" && styles.buttonGhost,
        pressed && !inactive && styles.buttonPressed,
        inactive && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "primary" ? colors.primaryForeground : colors.primary}
        />
      ) : (
        <Text
          style={[
            styles.buttonText,
            variant === "primary" && styles.buttonTextPrimary,
            variant !== "primary" && styles.buttonTextSecondary,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/* ──────────────────────────────── Pillola ────────────────────────────── */

/** Etichetta di stato. `tone` dichiara il significato, non solo il colore. */
export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <View style={[styles.pill, styles[`pill_${tone}`]]}>
      <Text style={[styles.pillText, styles[`pillText_${tone}`]]}>{children}</Text>
    </View>
  );
}

/* ────────────────────────────── Stati vuoti ──────────────────────────── */

export function Loading({ text }: { text?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} size="large" />
      {text ? <Text style={styles.centerText}>{text}</Text> : null}
    </View>
  );
}

export function ErrorState({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={[styles.centerText, { color: colors.destructive }]}>{text}</Text>
      {onRetry ? <Button label="Riprova" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

/* ─────────────────────────────── Stili ──────────────────────────────── */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenBody: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },

  title: {
    fontSize: font.size.xxl,
    fontWeight: font.weight.bold,
    color: colors.foreground,
    letterSpacing: -0.6,
    lineHeight: font.size.xxl * 1.15,
  },
  subtitle: {
    fontSize: font.size.md,
    color: colors.mutedForeground,
    lineHeight: font.size.md * 1.45,
  },
  label: {
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    color: colors.foreground,
  },
  body: {
    fontSize: font.size.md,
    color: colors.foreground,
    lineHeight: font.size.md * 1.45,
  },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.sm,
    ...shadow.card,
  },
  cardPressed: { opacity: 0.9, transform: [{ scale: 0.995 }] },

  button: {
    minHeight: 52, // sopra i 44pt minimi indicati da Apple
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: {
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  buttonGhost: { backgroundColor: "transparent" },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { fontSize: font.size.md, fontWeight: font.weight.semibold },
  buttonTextPrimary: { color: colors.primaryForeground },
  buttonTextSecondary: { color: colors.primary },

  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.muted,
  },
  pill_neutral: { backgroundColor: colors.muted },
  pill_success: { backgroundColor: colors.successBg },
  pill_warning: { backgroundColor: colors.warningBg },
  pill_danger: { backgroundColor: colors.dangerBg },
  pillText: { fontSize: font.size.xs, fontWeight: font.weight.semibold },
  pillText_neutral: { color: colors.mutedForeground },
  pillText_success: { color: colors.primary },
  pillText_warning: { color: "#8A5A08" },
  pillText_danger: { color: colors.destructive },

  center: { alignItems: "center", justifyContent: "center", gap: spacing.lg, padding: spacing.xl },
  centerText: {
    fontSize: font.size.md,
    color: colors.mutedForeground,
    textAlign: "center",
  },
});
