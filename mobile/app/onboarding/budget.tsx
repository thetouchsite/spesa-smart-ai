/**
 * Onboarding 3/6 — budget.
 *
 * La valuta è preselezionata dal paese scelto al passo 1, non chiesta di
 * nuovo: chi ha scelto Bologna si aspetta l'euro già lì. Resta modificabile
 * perché il paese può non essere stato riconosciuto.
 *
 * Il simbolo della valuta viene da `Intl.NumberFormat`, come nel prototipo:
 * niente tabella di simboli scritta a mano da tenere aggiornata.
 */

import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Choice, Note, Step } from "../../src/components/onboarding";
import { Label } from "../../src/components/ui";
import { useSession } from "../../src/lib/state/session";
import { loadResolvedLocation } from "../../src/lib/location/store";
import { colors, font, radius, spacing } from "../../src/theme";
import { uiText } from "../../src/lib/ui-strings";
import { useI18n } from "../../src/lib/i18n";

/** Valute proposte. La prima è quella del paese scelto, se riconosciuta. */
const COMMON = ["EUR", "GBP", "USD", "CHF"];

function symbolOf(code: string): string {
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}

export default function BudgetScreen() {
  const { language } = useI18n();
  /** Testo nella lingua scelta dall'utente. */
  const ui = (t: string) => uiText(t, language);
  const router = useRouter();
  const { profile, updateProfile } = useSession();
  const [amount, setAmount] = useState(profile.budget);

  // La valuta del paese scelto al passo precedente vince sul valore di
  // partenza, ma solo finché l'utente non l'ha cambiata a mano.
  useEffect(() => {
    const loc = loadResolvedLocation();
    // Solo se il profilo non ha ancora una valuta: adesso la imposta il
    // passo della citta', che e' il posto giusto.
    if (loc?.currency && !profile.currency) {
      updateProfile({ currency: loc.currency as never, city: loc.city, country: loc.countryCode });
    }
  }, []);

  const currencies = useMemo(() => {
    const set = [profile.currency, ...COMMON].filter(Boolean);
    return [...new Set(set)].slice(0, 4);
  }, [profile.currency]);

  const symbol = symbolOf(profile.currency);
  const value = Number(amount.replace(",", "."));
  const valid = Number.isFinite(value) && value > 0;

  function next() {
    updateProfile({ budget: amount.replace(",", ".") });
    router.push("/onboarding/stile");
  }

  return (
    <Step
      step="budget"
      title="Quanto vuoi spendere?"
      subtitle={ui("Non lo supereremo. Se il budget non basta per mangiare bene, te lo diciamo.")}
      canNext={valid}
      onNext={next}
    >
      <Label>Importo</Label>
      <View style={styles.amountRow}>
        <View style={styles.symbolBox}>
          <Label>{symbol}</Label>
        </View>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="0"
          placeholderTextColor={colors.mutedForeground}
          keyboardType="decimal-pad"
          style={styles.input}
          accessibilityLabel={ui("Importo del budget")}
        />
      </View>

      <View style={styles.currencyRow}>
        {currencies.map((c) => (
          <Chip
            key={c}
            label={c}
            selected={profile.currency === c}
            onPress={() => updateProfile({ currency: c as never })}
          />
        ))}
      </View>

      <Label>{ui("Ogni quanto")}</Label>
      <Choice
        label={ui("A settimana")}
        hint={ui("Un piano di 7 giorni")}
        selected={profile.frequency === "weekly"}
        onPress={() => updateProfile({ frequency: "weekly" })}
      />
      <Choice
        label="Al mese"
        hint={ui("Un piano di 30 giorni")}
        selected={profile.frequency === "monthly"}
        onPress={() => updateProfile({ frequency: "monthly" })}
      />

      <Note>{ui("I prezzi non sono stime: li cerchiamo online, nei negozi che consegnano dove vivi, nel momento in cui creiamo il piano. Dove non li troviamo, te lo diciamo.")}</Note>
    </Step>
  );
}

function Chip({
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
      accessibilityLabel={`Valuta ${label}`}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && styles.chipPressed]}
    >
      <Label>{label}</Label>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  amountRow: { flexDirection: "row", gap: spacing.sm, alignItems: "stretch" },
  symbolBox: {
    minWidth: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    fontSize: font.size.xl,
    fontWeight: font.weight.semibold,
    color: colors.foreground,
  },
  currencyRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.successBg },
  chipPressed: { opacity: 0.8 },
});
