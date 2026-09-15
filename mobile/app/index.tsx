/**
 * Schermata iniziale.
 *
 * Nel prototipo web è la parte alta della pagina unica. Su mobile diventa una
 * schermata a sé: due vie d'uscita — cominciare, oppure riprendere l'ultimo
 * piano se ce n'è uno salvato.
 *
 * La diagnostica in fondo compare solo in sviluppo: serve a noi per vedere se
 * il backend risponde, non all'utente.
 */

import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import {
  Body,
  Button,
  Card,
  GradientCard,
  Ionicons,
  Label,
  ListRow,
  Pill,
  Screen,
  Subtitle,
  Title,
  TopBar,
} from "../src/components/ui";
import { ping } from "../src/api/client";
import { useSession } from "../src/lib/state/session";
import { QuotaBanner } from "../src/components/quota-banner";
import { deviceDefaults } from "../src/lib/format";
import { BottoneCaldo, GrigliaPromesse, HeroHome } from "../src/components/hero-home";
import { colors, font, radius, spacing } from "../src/theme";
import { uiText } from "../src/lib/ui-strings";
import { useI18n } from "../src/lib/i18n";

const STEPS = [
  {
    icon: "chatbubbles-outline" as const,
    title: "Ci dici come mangi",
    text: "Città, persone, budget, stile, allergie.",
  },
  {
    icon: "restaurant-outline" as const,
    title: "Prepariamo il menù",
    text: "Sette giorni di pasti pensati per il tuo budget.",
  },
  {
    icon: "cart-outline" as const,
    title: "Fai la spesa",
    text: "Lista aggregata, con le quantità già arrotondate.",
  },
];

export default function Home() {
  const { language } = useI18n();
  /** Testo nella lingua scelta dall'utente. */
  const ui = (t: string) => uiText(t, language);
  const router = useRouter();
  const { currentPlan, profile } = useSession();
  // La classifica catene viene da un'indagine sul solo mercato italiano.
  const isItaly = (profile.country || deviceDefaults().country).toUpperCase() === "IT";
  const [api, setApi] = useState<{
    ok: boolean;
    aiConfigured: boolean;
    dbConfigured: boolean;
  } | null>(null);

  // Lo stato del backend è utile solo a noi in sviluppo: se manca una chiave,
  // meglio vederlo qui che scoprirlo a metà onboarding.
  useEffect(() => {
    if (__DEV__) ping().then(setApi);
  }, []);

  return (
    <Screen>
      <TopBar />

      <QuotaBanner />

      {/* L'INTESTAZIONE PORTA DENTRO IL PULSANTE.
          Prima stava in fondo allo schermo, in una barra fissa: corretto, ma
          separava la promessa dal gesto. Nel prototipo del cliente il tasto e'
          dentro la carta, sotto la frase che lo giustifica, e si legge come
          una cosa sola invece che come due. */}
      <HeroHome
        titolo={ui("Risparmia sulla spesa")}
        titoloCorsivo={ui("con l'IA")}
        sottotitolo={ui("Pianifica i pasti, trova i prezzi migliori e fai la spesa in modo intelligente ogni settimana.")}
        azioni={
          <>
            <BottoneCaldo
              etichetta={ui(currentPlan ? "Crea un nuovo piano" : "Crea il mio piano")}
              onPress={() => router.push("/onboarding/citta")}
            />
            {currentPlan ? (
              <Button
                label={ui("Riprendi l'ultimo piano")}
                variant="secondary"
                icon="arrow-forward-outline"
                onPress={() => router.push("/risultati")}
              />
            ) : null}
          </>
        }
      />

      <GrigliaPromesse
        voci={[
          { icona: "restaurant-outline", testo: ui("Ricette smart") },
          { icona: "location-outline", testo: ui("Negozi locali") },
          { icona: "pricetag-outline", testo: ui("Prezzi migliori") },
          { icona: "leaf-outline", testo: ui("Meno sprechi") },
        ]}
      />

      {currentPlan ? (
        <GradientCard>
          <Body style={styles.resumeLabel}>{ui("Hai un piano in corso")}</Body>
          <Body style={styles.resumeValue}>
            {profile.city || "Il tuo piano"} · {profile.household || "4"} persone
          </Body>
          <Body style={styles.resumeSub}>
            {currentPlan.mealPlan.length} giorni · {currentPlan.groceryList.length} prodotti
          </Body>
        </GradientCard>
      ) : null}

      <Card>
        <Label icon="list-outline">{ui("Come funziona")}</Label>
        {STEPS.map((s, i) => (
          <View key={s.title} style={styles.step}>
            <View style={styles.stepNum}>
              <Ionicons name={s.icon} size={17} color={colors.primary} />
            </View>
            <View style={styles.stepBody}>
              <Body style={styles.stepTitle}>
                {i + 1}. {ui(s.title)}
              </Body>
              <Body style={styles.stepText}>{ui(s.text)}</Body>
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <ListRow
          icon="settings-outline"
          title={ui("Impostazioni")}
          subtitle={ui("Lingua, profilo, dati")}
          onPress={() => router.push("/impostazioni")}
        />
        {/* L'indagine Altroconsumo copre solo il mercato italiano:
            mostrarla a un utente francese sarebbe fuorviante. */}
        {isItaly ? (
        <ListRow
            icon="trophy-outline"
            title={ui("Le catene più economiche")}
            subtitle={ui("Indagine Altroconsumo 2026")}
            onPress={() => router.push("/dove-conviene")}
          />
        ) : null}
        <ListRow
          icon="map-outline"
          title={ui("Supermercati vicini")}
          subtitle={ui("Negozi alimentari intorno a te")}
          onPress={() => router.push("/negozi")}
        />
      </Card>

      <Card style={styles.disclaimer}>
        <Label icon="information-circle-outline">{ui("I prezzi mostrati")}</Label>
        {/* UNA FRASE INTERA, NON PEZZI CUCITI. Qui c'era `ui("Sono")` seguito
            dal resto della frase come testo: in inglese "Sono" diventava "I am"
            e si incollava a quello che seguiva — «I amstime indicative basate su
            una tabella…». `uiText` cerca la stringa COMPLETA in un dizionario,
            quindi una parola isolata non si traduce, si sostituisce.

            E il testo diceva il falso. Parlava di «stime basate su una tabella
            di riferimento»: era vero nel prototipo, non piu' da quando i prezzi
            si cercano davvero online con i link verificati. Era la prima cosa
            che si leggeva aprendo l'app, e negava esattamente cio' che l'app fa
            di meglio. */}
        <Body style={styles.small}>
          {ui("I prezzi li cerchiamo online nei negozi che consegnano dove vivi, e ogni link viene aperto e controllato prima di mostrartelo. Dove nessun negozio pubblica il prezzo, la voce resta senza: preferiamo dirtelo che inventarlo.")}
        </Body>
      </Card>

      {__DEV__ && api ? (
        <Card style={styles.disclaimer}>
          <Label icon="pulse-outline">{ui("Diagnostica (solo sviluppo)")}</Label>
          <Body style={styles.diag}>
            backend {api.ok ? "raggiungibile" : "NON raggiungibile"} · AI{" "}
            {api.aiConfigured ? "configurata" : "assente"} · database{" "}
            {api.dbConfigured ? "connesso" : "assente"}
          </Body>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.md, paddingTop: spacing.md },
  actions: { gap: spacing.sm },

  resumeLabel: { color: "rgba(255,255,255,0.85)", fontSize: font.size.sm },
  resumeValue: {
    color: "#FFFFFF",
    fontSize: font.size.xl,
    fontWeight: font.weight.bold,
    letterSpacing: -0.4,
  },
  resumeSub: { color: "rgba(255,255,255,0.9)", fontSize: font.size.sm },

  step: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start", paddingVertical: 4 },
  stepNum: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.successBg,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBody: { flex: 1, gap: 1 },
  stepTitle: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.foreground },
  stepText: { fontSize: font.size.sm, color: colors.mutedForeground },

  disclaimer: { backgroundColor: colors.muted },
  small: { fontSize: font.size.sm, color: colors.mutedForeground, lineHeight: 20 },
  bold: { fontWeight: font.weight.semibold, color: colors.foreground },
  diag: { fontSize: font.size.xs, color: colors.mutedForeground },
});
