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
} from "../src/components/ui";
import { ping } from "../src/api/client";
import { useSession } from "../src/lib/state/session";
import { QuotaBanner } from "../src/components/quota-banner";
import { colors, font, radius, spacing } from "../src/theme";

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
  const router = useRouter();
  const { currentPlan, profile } = useSession();
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
    <Screen
      footer={
        <View style={styles.actions}>
          <Button
            label={currentPlan ? "Crea un nuovo piano" : "Crea il mio piano"}
            icon="sparkles-outline"
            onPress={() => router.push("/onboarding/citta")}
          />
          {currentPlan ? (
            <Button
              label="Riprendi l'ultimo piano"
              variant="secondary"
              icon="arrow-forward-outline"
              onPress={() => router.push("/risultati")}
            />
          ) : null}
        </View>
      }
    >
      <QuotaBanner />

      <View style={styles.hero}>
        <Pill tone="success" icon="leaf-outline">
          Spesa Smart
        </Pill>
        <Title>Mangia bene{"\n"}spendendo meno</Title>
        <Subtitle>
          Rispondi a sei domande e ricevi un menù settimanale con la lista della spesa già
          organizzata, dentro il tuo budget.
        </Subtitle>
      </View>

      {currentPlan ? (
        <GradientCard>
          <Body style={styles.resumeLabel}>Hai un piano in corso</Body>
          <Body style={styles.resumeValue}>
            {profile.city || "Il tuo piano"} · {profile.household || "4"} persone
          </Body>
          <Body style={styles.resumeSub}>
            {currentPlan.mealPlan.length} giorni · {currentPlan.groceryList.length} prodotti
          </Body>
        </GradientCard>
      ) : null}

      <Card>
        <Label icon="list-outline">Come funziona</Label>
        {STEPS.map((s, i) => (
          <View key={s.title} style={styles.step}>
            <View style={styles.stepNum}>
              <Ionicons name={s.icon} size={17} color={colors.primary} />
            </View>
            <View style={styles.stepBody}>
              <Body style={styles.stepTitle}>
                {i + 1}. {s.title}
              </Body>
              <Body style={styles.stepText}>{s.text}</Body>
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <ListRow
          icon="settings-outline"
          title="Impostazioni"
          subtitle="Lingua, profilo, dati"
          onPress={() => router.push("/impostazioni")}
        />
        <ListRow
          icon="map-outline"
          title="Supermercati vicini"
          subtitle="Negozi alimentari intorno a te"
          onPress={() => router.push("/negozi")}
        />
      </Card>

      <Card style={styles.disclaimer}>
        <Label icon="information-circle-outline">I prezzi mostrati</Label>
        <Body style={styles.small}>
          Sono <Body style={styles.bold}>stime indicative</Body> basate su una tabella di
          riferimento per il tuo paese, non rilevazioni dai supermercati. Dalla lista della spesa
          puoi aprire la pagina del prodotto sul sito del negozio.
        </Body>
      </Card>

      {__DEV__ && api ? (
        <Card style={styles.disclaimer}>
          <Label icon="pulse-outline">Diagnostica (solo sviluppo)</Label>
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
