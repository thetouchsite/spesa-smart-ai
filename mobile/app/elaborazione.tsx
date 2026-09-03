/**
 * Costruzione del piano.
 *
 * FINCHÉ IL BACKEND NON È IN LINEA
 * --------------------------------
 * Si usa `generateMealPlan`, il motore deterministico già presente nel
 * prototipo: pesca i piatti dai panieri di `style-catalog.ts` in base a
 * budget, numero di persone e stile. Non serve rete, non serve una chiave,
 * e produce lo stesso risultato che il cliente vede oggi nella sua demo.
 *
 * QUANDO IL BACKEND SARÀ DEPLOYATO
 * --------------------------------
 * `generateMealPlanWithAI` (già portato in `lib/ai/meal-ai.ts`) chiama gli
 * endpoint reali e arricchisce ogni pasto con ricette vere. Il passaggio è
 * la sola riga marcata più sotto: la schermata non cambia, perché entrambe
 * le vie restituiscono lo stesso tipo `Plan`.
 *
 * In ogni caso l'utente non resta mai a mani vuote — se la generazione
 * fallisce si mostra l'errore con la possibilità di riprovare, non una
 * schermata bianca.
 */

import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Body, Button, Loading, Screen, Subtitle, Title } from "../src/components/ui";
import { useSession } from "../src/lib/state/session";
import { generateMealPlan } from "../src/lib/meal-engine";
import { colors, font, spacing } from "../src/theme";

/** Messaggi mostrati a rotazione: la generazione è quasi istantanea, ma una
 *  schermata che sparisce di colpo sembra un errore. */
const BEATS = [
  "Scelgo i piatti della settimana…",
  "Metto insieme la lista della spesa…",
  "Controllo che stia nel budget…",
];

export default function ElaborazioneScreen() {
  const router = useRouter();
  const { profile, updateProfile, setPlan, setStatus, variantSeed } = useSession();
  const [beat, setBeat] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // In sviluppo React monta due volte: senza questa guardia il piano verrebbe
  // generato due volte e il secondo risultato sovrascriverebbe il primo.
  const started = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setBeat((b) => (b + 1) % BEATS.length), 900);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void build();
  }, []);

  async function build() {
    setError(null);
    setStatus("generating");
    try {
      // Il motore pretende questi due campi: se l'onboarding è stato saltato
      // o interrotto si usano valori sensati invece di fallire.
      const household = profile.household || "4";
      const country = profile.country || "IT";
      updateProfile({ household, country });

      // ── Unica riga da cambiare quando il backend sarà in linea: ──
      //    const plan = await generateMealPlanWithAI({ ...profile, household, country }, variantSeed);
      const { plan } = generateMealPlan({
        profile: { ...profile, household, country },
        seed: variantSeed,
      });

      setPlan(plan);
      setStatus("ready");
      router.replace("/risultati");
    } catch (err) {
      console.warn("[elaborazione] generazione fallita:", err);
      setStatus("error", String(err));
      setError("Non siamo riusciti a creare il piano. Riprova.");
    }
  }

  if (error) {
    return (
      <Screen>
        <View style={styles.center}>
          <Title>Qualcosa non ha funzionato</Title>
          <Subtitle>{error}</Subtitle>
          <Button
            label="Riprova"
            onPress={() => {
              started.current = false;
              void build();
            }}
          />
          <Button
            label="Torna indietro"
            variant="ghost"
            onPress={() => router.replace("/onboarding/extra")}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <View style={styles.center}>
        <Loading />
        <Title style={styles.title}>Sto preparando il tuo piano</Title>
        <Body style={styles.beat}>{BEATS[beat]}</Body>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    paddingVertical: spacing.xxxl,
  },
  title: { textAlign: "center" },
  beat: { color: colors.mutedForeground, fontSize: font.size.md, textAlign: "center" },
});
