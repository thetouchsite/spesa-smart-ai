/** Onboarding 2/6 — quante persone. Determina le porzioni e il costo per testa. */

import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Step, Tile } from "../../src/components/onboarding";
import { useSession } from "../../src/lib/state/session";
import { spacing } from "../../src/theme";
import { uiText } from "../../src/lib/ui-strings";
import { useI18n } from "../../src/lib/i18n";

const SIZES = ["1", "2", "3", "4", "5+"];

export default function PersoneScreen() {
  const { language } = useI18n();
  /** Testo nella lingua scelta dall'utente. */
  const ui = (t: string) => uiText(t, language);
  const router = useRouter();
  const { profile, updateProfile } = useSession();

  return (
    <Step
      step="persone"
      title={ui("Per quante persone?")}
      subtitle={ui("Serve a calcolare le porzioni delle ricette e la spesa a testa.")}
      canNext={!!profile.household}
      onNext={() => router.push("/onboarding/budget")}
    >
      <View style={styles.row}>
        {SIZES.map((n) => (
          <Tile
            key={n}
            label={n}
            selected={profile.household === n}
            onPress={() => updateProfile({ household: n })}
          />
        ))}
      </View>
    </Step>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm },
});
