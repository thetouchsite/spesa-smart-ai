/**
 * Onboarding 5/6 — allergie, diete e cose che non vi piacciono.
 *
 * Le chiavi inviate al motore restano quelle del prototipo ("Gluten Free",
 * "Lactose Free", …) perché finiscono nei prompt e nei filtri delle ricette.
 * L'utente vede le etichette in italiano.
 *
 * Questo passo è saltabile: nessuna allergia è una risposta valida, quindi
 * l'avanti è sempre attivo.
 */

import { useState } from "react";
import { StyleSheet, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { Step, Toggle } from "../../src/components/onboarding";
import { Label } from "../../src/components/ui";
import { useSession } from "../../src/lib/state/session";
import { colors, font, radius, spacing } from "../../src/theme";
import { uiText } from "../../src/lib/ui-strings";
import { useI18n } from "../../src/lib/i18n";

const OPTIONS: Array<{ key: string; label: string }> = [
  { key: "Gluten Free", label: "Senza glutine" },
  { key: "Lactose Free", label: "Senza lattosio" },
  { key: "Vegetarian", label: "Vegetariano" },
  { key: "Vegan", label: "Vegano" },
];

export default function AllergieScreen() {
  const { language } = useI18n();
  /** Testo nella lingua scelta dall'utente. */
  const ui = (t: string) => uiText(t, language);
  const router = useRouter();
  const { profile, updateProfile } = useSession();
  const [dislikes, setDislikes] = useState(profile.dislikes);

  function toggle(key: string) {
    const on = profile.allergies.includes(key);
    updateProfile({
      allergies: on ? profile.allergies.filter((a) => a !== key) : [...profile.allergies, key],
    });
  }

  function next() {
    updateProfile({ dislikes: dislikes.trim() });
    router.push("/onboarding/extra");
  }

  return (
    <Step
      step="allergie"
      title="Qualcosa da evitare?"
      subtitle={ui("Escluderemo questi ingredienti da tutte le ricette. Puoi anche non scegliere nulla.")}
      canNext
      onNext={next}
    >
      {OPTIONS.map((o) => (
        <Toggle
          key={o.key}
          label={ui(o.label)}
          selected={profile.allergies.includes(o.key)}
          onPress={() => toggle(o.key)}
        />
      ))}

      <Label>{ui("Cosa non vi piace")}</Label>
      <TextInput
        value={dislikes}
        onChangeText={setDislikes}
        placeholder="Es. non mangiamo funghi, niente pesce crudo…"
        placeholderTextColor={colors.mutedForeground}
        style={styles.textarea}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
        accessibilityLabel={ui("Ingredienti che non vi piacciono")}
      />
    </Step>
  );
}

const styles = StyleSheet.create({
  textarea: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    padding: spacing.lg,
    fontSize: font.size.md,
    color: colors.foreground,
  },
});
