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
import { ProdottiInsufficientiError } from "../src/lib/plan-full";
import { LoaderPiano } from "../src/components/loader-piano";
import { deviceDefaults } from "../src/lib/format";
import { useI18n } from "../src/lib/i18n";
import { colors, font, spacing } from "../src/theme";
import { uiText } from "../src/lib/ui-strings";

/** Messaggi mostrati a rotazione: la generazione è quasi istantanea, ma una
 *  schermata che sparisce di colpo sembra un errore. */
const BEATS = [
  "Scelgo i piatti della settimana…",
  "Metto insieme la lista della spesa…",
  "Controllo che stia nel budget…",
  "Ci siamo quasi…",
];

export default function ElaborazioneScreen() {
  /** Testo nella lingua scelta dall'utente. */
  const ui = (t: string) => uiText(t, language);
  const router = useRouter();
  const { profile, updateProfile, setPlan, setStatus, variantSeed } = useSession();
  const { language } = useI18n();
  const [beat, setBeat] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** Il caso in cui la generazione e' riuscita ma i prodotti non bastano. */
  const [pochi, setPochi] = useState<ProdottiInsufficientiError | null>(null);

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

  async function build(forzaFlusso?: "menu-prima") {
    setError(null);
    setPochi(null);
    setStatus("generating");
    try {
      // Il motore pretende questi due campi: se l'onboarding è stato saltato
      // o interrotto si usano valori sensati invece di fallire.
      const household = profile.household || "4";
      // Paese dal dispositivo se il profilo e' vuoto: l'app non e'
      // riservata all'Italia.
      const country = profile.country || deviceDefaults().country;
      updateProfile({ household, country });

      // Prova il backend; se non risponde usa il motore locale. Vedi
      // `lib/content.ts`: il ripiego e' il comportamento normale finche' il
      // backend non e' pubblicato, non un errore.
      const { plan, source, extra } = await fetchPlan(
        { ...profile, household, country },
        variantSeed,
        language,
        forzaFlusso,
      );
      if (__DEV__) {
        console.info(`[elaborazione] piano generato da: ${source}`);
        if (extra?.meta) {
          // In sviluppo interessa sapere se il modello ha DAVVERO cercato:
          // senza ricerca i prezzi vengono dalla sua memoria e valgono poco.
          console.info(
            `[elaborazione] ${extra.meta.secondi}s · ${extra.meta.ricerche} ricerche · ` +
              `prezzi verificati ${extra.meta.prezziVerificati}/${extra.meta.prezziTotali} · ` +
              `${extra.meta.insegneConfrontate} insegne · $${extra.meta.costoStimatoUsd}` +
              (extra.meta.ricercaEffettuata ? "" : " · ATTENZIONE: nessuna ricerca web"),
          );
        }
      }

      setPlan(plan, extra ?? null);
      setStatus("ready");
      router.replace("/risultati");
    } catch (err) {
      // Pochi prodotti comprabili NON e' un guasto: la generazione e' andata
      // bene, in quella citta' i negozi online pubblicano poco. Merita un
      // messaggio che dica cosa e' successo, non "riprova" — riprovare non
      // cambierebbe niente.
      if (err instanceof ProdottiInsufficientiError) {
        console.info("[elaborazione]", err.message);
        setStatus("error", err.message);
        setPochi(err);
        return;
      }
      console.warn("[elaborazione] generazione fallita:", err);
      setStatus("error", String(err));
      setError("Non siamo riusciti a creare il piano. Riprova.");
    }
  }

  if (pochi) {
    return (
      <Screen>
        <View style={styles.center}>
          <Title>{ui("Qui non riusciamo a farti la spesa")}</Title>
          {/* Frasi intere, non pezzi cuciti: `uiText` cerca la stringa completa
              in un dizionario, e un frammento come "A" non si traduce in
              nessuna lingua. I numeri restano fuori, che sono uguali ovunque. */}
          <Subtitle>
            {ui("Qui i negozi online pubblicano troppo poco per costruire una settimana di pasti. Preferiamo dirtelo, invece di proporti un piano che non potresti comprare.")}
          </Subtitle>
          <Body style={styles.conto}>
            {pochi.citta} · {pochi.trovati}/{pochi.cercati}{" "}
            {ui("prodotti con una pagina che si apre")}
          </Body>
          {pochi.comprabili.length > 0 && (
            <Body style={styles.trovati}>{pochi.comprabili.join(" · ")}</Body>
          )}
          <Button
            label={ui("Fai il piano lo stesso")}
            onPress={() => {
              started.current = false;
              // Di proposito la strada normale: il menù nasce prima dei prezzi,
              // quindi conterrà anche cose che online non si trovano. È una
              // scelta dell'utente, e ora è dichiarata.
              void build("menu-prima");
            }}
          />
          <Button
            label={ui("Cambia città")}
            variant="ghost"
            onPress={() => router.replace("/onboarding/citta")}
          />
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <View style={styles.center}>
          <Title>{ui("Qualcosa non ha funzionato")}</Title>
          <Subtitle>{error}</Subtitle>
          <Button
            label="Riprova"
            onPress={() => {
              started.current = false;
              void build();
            }}
          />
          <Button
            label={ui("Torna indietro")}
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
        <Title style={styles.title}>{ui("Sto preparando il tuo piano")}</Title>
        {/* I tre passi li mostra il loader, con i tempi veri: i messaggi a
            rotazione che c'erano qui dicevano cose generiche mentre il piano
            passava per fasi precise, e una di quelle dura quaranta secondi. */}
        <LoaderPiano
          etichette={[
            ui("Scelgo i piatti della settimana"),
            ui("Cerco i prezzi nei negozi della tua città"),
            ui("Metto insieme il piano"),
          ]}
        />
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
  /** I numeri del caso: si leggono a colpo d'occhio, quindi stanno soli. */
  conto: {
    color: colors.foreground,
    fontSize: font.size.md,
    textAlign: "center",
  },
  /** L'elenco dei pochi trovati: e' la prova di cio' che diciamo, quindi si
   *  legge, ma non deve competere con il messaggio principale. */
  trovati: {
    color: colors.mutedForeground,
    fontSize: font.size.sm,
    textAlign: "center",
  },
  beat: { color: colors.mutedForeground, fontSize: font.size.md, textAlign: "center" },
});
