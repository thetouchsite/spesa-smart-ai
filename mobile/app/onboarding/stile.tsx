/**
 * Onboarding 4/6 — stile alimentare.
 *
 * I valori inviati al motore restano quelli del prototipo ("Family Budget",
 * "Mediterranean", …): sono le chiavi con cui `style-catalog.ts` sceglie il
 * paniere di piatti. In interfaccia si mostrano tradotti.
 */

import { useRouter } from "expo-router";
import { Choice, Step } from "../../src/components/onboarding";
import { useSession } from "../../src/lib/state/session";

const STYLES: Array<{ key: string; label: string; hint: string }> = [
  { key: "Family Budget", label: "Famiglia, spesa contenuta", hint: "Piatti semplici, ingredienti economici" },
  { key: "Mediterranean", label: "Mediterraneo", hint: "Verdure, legumi, pesce, olio d'oliva" },
  { key: "Low Carb", label: "Pochi carboidrati", hint: "Più proteine e verdure, meno pasta e pane" },
  { key: "Japanese Inspired", label: "Ispirazione giapponese", hint: "Riso, pesce, zuppe, verdure croccanti" },
  { key: "Healthy Lifestyle", label: "Vita sana", hint: "Equilibrato, cereali integrali, poco processato" },
];

export default function StileScreen() {
  const router = useRouter();
  const { profile, updateProfile } = useSession();

  return (
    <Step
      step="stile"
      title="Come vi piace mangiare?"
      subtitle="Sceglieremo i piatti dentro questo stile per tutta la settimana."
      canNext={!!profile.style}
      onNext={() => router.push("/onboarding/allergie")}
    >
      {STYLES.map((s) => (
        <Choice
          key={s.key}
          label={s.label}
          hint={s.hint}
          selected={profile.style === s.key}
          onPress={() => updateProfile({ style: s.key })}
        />
      ))}
    </Step>
  );
}
