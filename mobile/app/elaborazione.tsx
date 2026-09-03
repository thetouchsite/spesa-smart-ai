/**
 * Costruzione del piano.
 *
 * `fetchPlan` prova il backend e, se non risponde entro pochi secondi, usa il
 * motore deterministico del prototipo. Entrambe le vie restituiscono lo stesso
 * tipo `Plan`, quindi questa schermata non sa quale sia stata usata e non deve
 * saperlo.
 *
 * Con il backend acceso i piatti sono italiani veri ("pasta e ceci",
 * "parmigiana"); senza, arrivano dai panieri di `style-catalog.ts`. In
 * entrambi i casi l'utente ottiene un piano completo: il ripiego non e' un
 * errore, e infatti non produce nessun avviso.
 */

import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Body, Button, Loading, Screen, Subtitle, Title } from "../src/components/ui";
import { useSession } from "../src/lib/state/session";
import { fetchPlan, type ContentSource } from "../src/lib/content";
import { colors, font, spacing } from "../src/theme";

/** Messaggi mostrati a rotazione: la generazione è quasi istantanea, ma una
 *  schermata che sparisce di colpo sembra un errore. */
const BEATS = [
  "Scelgo i piatti della settimana…",
  "Metto insieme la lista della spesa…",
  "Controllo che stia nel budget…",
  "Ci siamo quasi…",
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

      // Prova il backend; se non risponde usa il motore locale. Vedi
      // `lib/content.ts`: il ripiego e' il comportamento normale finche' il
      // backend non e' pubblicato, non un errore.
      const { plan, source } = await fetchPlan({ ...profile, household, country }, variantSeed);
      if (__DEV__) console.info(`[elaborazione] piano generato da: ${source}`);

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
