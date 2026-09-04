/**
 * Selettore di lingua sempre a portata di mano.
 *
 * PERCHÉ SEMPRE VISIBILE
 * ----------------------
 * Il prototipo del cliente ce l'aveva in ogni schermata, e aveva ragione:
 * un'app pensata per essere usata all'estero non può nascondere la lingua
 * dentro le impostazioni. Chi apre l'app e non capisce cosa legge deve
 * poterla cambiare subito, senza cercare.
 *
 * Occupa lo spazio di un'icona: il codice della lingua corrente (IT, EN, FR…)
 * dentro un tondo. Toccandolo si apre l'elenco, dove ogni lingua è scritta
 * nella lingua stessa — "Deutsch", non "Tedesco" — perché è l'unico modo
 * perché la trovi chi non capisce quella corrente.
 */

import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LANGUAGES, LANGUAGE_LABEL, useI18n, type Language } from "../lib/i18n";
import { colors, font, radius, spacing } from "../theme";

/** Bandiera della lingua: si riconosce prima del testo. */
const FLAG: Record<Language, string> = {
  it: "🇮🇹",
  en: "🇬🇧",
  fr: "🇫🇷",
  es: "🇪🇸",
  de: "🇩🇪",
};

export function LanguagePicker() {
  const { language, setLanguage } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Lingua: ${LANGUAGE_LABEL[language]}. Tocca per cambiare`}
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
      >
        <Text style={styles.triggerFlag}>{FLAG[language]}</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        {/* Tocco fuori dal riquadro = chiudi: su un telefono è il gesto
            atteso, e evita di dover cercare la X. */}
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={styles.title}>Language · Lingua</Text>

            {LANGUAGES.map((lang) => {
              const active = language === lang;
              return (
                <Pressable
                  key={lang}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={LANGUAGE_LABEL[lang]}
                  onPress={() => {
                    setLanguage(lang);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    active && styles.rowOn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.flag}>{FLAG[lang]}</Text>
                  <Text style={[styles.label, active && styles.labelOn]}>
                    {LANGUAGE_LABEL[lang]}
                  </Text>
                  {active ? (
                    <Ionicons name="checkmark-circle" size={21} color={colors.primary} />
                  ) : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  triggerFlag: { fontSize: 19 },
  pressed: { opacity: 0.7 },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.xs,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  title: {
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    color: colors.mutedForeground,
    marginBottom: spacing.sm,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 54,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  rowOn: { backgroundColor: colors.successBg },
  flag: { fontSize: 22 },
  label: { flex: 1, fontSize: font.size.md, color: colors.foreground },
  labelOn: { fontWeight: font.weight.semibold, color: colors.primary },
});
