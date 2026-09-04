/**
 * Primitive dell'interfaccia.
 *
 * Il prototipo usa shadcn/ui su Radix, Tailwind e icone lucide: HTML e CSS,
 * che su mobile non esistono. Qui c'è l'equivalente scritto con le primitive
 * React Native, con la stessa ricchezza visiva: icone, sfumature, immagini,
 * ombre.
 *
 * Le icone vengono da `@expo/vector-icons`, incluso in Expo Go: nessuna
 * dipendenza aggiuntiva e nessun file SVG da gestire. I nomi scelti sono gli
 * equivalenti Ionicons delle icone lucide del prototipo.
 *
 * Componenti pensati per il tocco: aree cliccabili sopra i 44pt indicati da
 * Apple, ed etichette di accessibilità su ogni elemento interattivo.
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
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LanguagePicker } from "./language-picker";
import { colors, font, radius, shadow, spacing } from "../theme";

export type IconName = keyof typeof Ionicons.glyphMap;

/* ────────────────────────────── Schermata ────────────────────────────── */

export function Screen({
  children,
  scroll = true,
  footer,
  edgeToEdge = false,
}: {
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
  /** Toglie il margine superiore: per le schermate che iniziano con un'immagine. */
  edgeToEdge?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const body = (
    <View style={[styles.screenBody, { paddingTop: edgeToEdge ? 0 : insets.top + spacing.lg }]}>
      {children}
    </View>
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

/**
 * Intestazione con freccia indietro e selettore di lingua.
 *
 * Il selettore compare per default in OGNI schermata: e' un'app pensata per
 * essere usata all'estero, e nascondere la lingua nelle impostazioni
 * significa che chi non capisce cosa legge non la trova. Il prototipo del
 * cliente lo aveva sempre in vista, ed era la scelta giusta.
 */
export function TopBar({
  title,
  onBack,
  right,
  showLanguage = true,
}: {
  title?: string;
  onBack?: () => void;
  right?: ReactNode;
  showLanguage?: boolean;
}) {
  return (
    <View style={styles.topBar}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Indietro"
          onPress={onBack}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </Pressable>
      ) : (
        <View style={styles.backBtn} />
      )}
      {title ? (
        <Text style={styles.topBarTitle} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      <View style={styles.topRight}>
        {showLanguage ? <LanguagePicker /> : null}
        {right}
      </View>
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

export function Label({ children, icon }: { children: ReactNode; icon?: IconName }) {
  if (!icon) return <Text style={styles.label}>{children}</Text>;
  return (
    <View style={styles.labelRow}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={styles.label}>{children}</Text>
    </View>
  );
}

export function Body({
  children,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  /** Tronca dopo N righe: utile sui nomi lunghi dei piatti. */
  numberOfLines?: number;
}) {
  return (
    <Text style={[styles.body, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
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

/** Scheda con sfumatura: per i dati che devono saltare all'occhio. */
export function GradientCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <LinearGradient
      colors={[colors.primary, colors.primaryGlow]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.gradientCard, style]}
    >
      {children}
    </LinearGradient>
  );
}

/* ─────────────────────────────── Pulsante ────────────────────────────── */

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const inactive = disabled || loading;
  const fg = variant === "primary" ? colors.primaryForeground : colors.primary;
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
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon ? <Ionicons name={icon} size={19} color={fg} /> : null}
          <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

/* ──────────────────────────────── Pillola ────────────────────────────── */

export function Pill({
  children,
  tone = "neutral",
  icon,
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
  icon?: IconName;
}) {
  const fg = {
    neutral: colors.mutedForeground,
    success: colors.primary,
    warning: "#8A5A08",
    danger: colors.destructive,
  }[tone];
  return (
    <View style={[styles.pill, styles[`pill_${tone}`]]}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text style={[styles.pillText, { color: fg }]}>{children}</Text>
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
      <Ionicons name="alert-circle-outline" size={38} color={colors.destructive} />
      <Text style={[styles.centerText, { color: colors.destructive }]}>{text}</Text>
      {onRetry ? <Button label="Riprova" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

/** Riga con icona a sinistra e freccia a destra: voce di elenco navigabile. */
export function ListRow({
  icon,
  title,
  subtitle,
  onPress,
  right,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
}) {
  const content = (
    <>
      {icon ? (
        <View style={styles.rowIcon}>
          <Ionicons name={icon} size={19} color={colors.primary} />
        </View>
      ) : null}
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {right ??
        (onPress ? (
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        ) : null)}
    </>
  );

  if (!onPress) return <View style={styles.listRow}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

export { Ionicons };

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

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  topRight: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  topBarTitle: {
    flex: 1,
    fontSize: font.size.md,
    fontWeight: font.weight.semibold,
    color: colors.foreground,
    textAlign: "center",
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
  label: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.foreground },
  labelRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  body: { fontSize: font.size.md, color: colors.foreground, lineHeight: font.size.md * 1.45 },

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

  gradientCard: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.xs,
    ...shadow.raised,
  },

  button: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  buttonInner: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.primary },
  buttonGhost: { backgroundColor: "transparent" },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { fontSize: font.size.md, fontWeight: font.weight.semibold },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  pill_neutral: { backgroundColor: colors.muted },
  pill_success: { backgroundColor: colors.successBg },
  pill_warning: { backgroundColor: colors.warningBg },
  pill_danger: { backgroundColor: colors.dangerBg },
  pillText: { fontSize: font.size.xs, fontWeight: font.weight.semibold },

  center: { alignItems: "center", justifyContent: "center", gap: spacing.lg, padding: spacing.xl },
  centerText: { fontSize: font.size.md, color: colors.mutedForeground, textAlign: "center" },

  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 52,
    paddingVertical: spacing.sm,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.successBg,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, gap: 1 },
  rowTitle: { fontSize: font.size.md, color: colors.foreground, fontWeight: font.weight.medium },
  rowSubtitle: { fontSize: font.size.sm, color: colors.mutedForeground },

  pressed: { opacity: 0.75 },
});
