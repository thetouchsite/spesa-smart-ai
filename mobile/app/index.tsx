/**
 * Schermata iniziale.
 *
 * Nel prototipo web è la parte alta della pagina unica. Su mobile diventa una
 * schermata a sé, con due sole vie d'uscita: cominciare, oppure riprendere
 * l'ultimo piano. La diagnostica in fondo compare solo in sviluppo.
 */

import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { Body, Button, Card, Label, Pill, Screen, Subtitle, Title } from "../src/components/ui";
import { ping } from "../src/api/client";
import { colors, font, radius, spacing } from "../src/theme";

export default function Home() {
  const router = useRouter();
  const [api, setApi] = useState<{ ok: boolean; aiConfigured: boolean; dbConfigured: boolean } | null>(
    null,
  );

  // Lo stato del backend è utile solo a noi in sviluppo: se manca una chiave,
  // è meglio vederlo qui che scoprirlo a metà onboarding.
  useEffect(() => {
    if (__DEV__) ping().then(setApi);
  }, []);

  return (
    <Screen
      footer={
        <Button label="Crea il mio piano" onPress={() => router.push("/onboarding/citta")} />
      }
    >
      <View style={styles.hero}>
        <Pill tone="success">Spesa Smart</Pill>
        <Title>Mangia bene{"\n"}spendendo meno</Title>
        <Subtitle>
          Rispondi a sei domande e ricevi un menù settimanale con la lista della spesa già
          organizzata, dentro il tuo budget.
        </Subtitle>
      </View>

      <View style={styles.steps}>
        <Step n={1} title="Ci dici come mangi" text="Città, persone, budget, stile, allergie." />
        <Step n={2} title="Prepariamo il menù" text="Sette giorni di pasti pensati per il tuo budget." />
        <Step n={3} title="Fai la spesa" text="Lista aggregata, con le quantità già arrotondate." />
      </View>

      <Card>
        <Label>I prezzi mostrati</Label>
        <Body style={styles.disclaimer}>
          Sono <Body style={styles.bold}>stime indicative</Body> basate su una tabella di
          riferimento per il tuo paese, non rilevazioni dai supermercati. Puoi verificare il
          prezzo reale di un singolo prodotto dalla lista della spesa.
        </Body>
      </Card>

      {__DEV__ && api ? (
        <Card>
          <Label>Diagnostica (solo sviluppo)</Label>
          <Body style={styles.diag}>
            backend {api.ok ? "raggiungibile" : "NON raggiungibile"} · AI{" "}
            {api.aiConfigured ? "configurata" : "assente"} · database{" "}
            {api.dbConfigured ? "connesso" : "assente"}
          </Body>
        </Card>
      ) : null}

      <Link href="/accesso" style={styles.link}>
        Ho già un account
      </Link>
    </Screen>
  );
}

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}>
        <Body style={styles.stepNumText}>{n}</Body>
      </View>
      <View style={styles.stepBody}>
        <Label>{title}</Label>
        <Body style={styles.stepText}>{text}</Body>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.md, paddingTop: spacing.xl },
  steps: { gap: spacing.md, marginTop: spacing.sm },
  step: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  stepNum: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.successBg,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { color: colors.primary, fontWeight: font.weight.bold, fontSize: font.size.sm },
  stepBody: { flex: 1, gap: 2 },
  stepText: { fontSize: font.size.sm, color: colors.mutedForeground },
  disclaimer: { fontSize: font.size.sm, color: colors.mutedForeground },
  bold: { fontWeight: font.weight.semibold, color: colors.foreground },
  diag: { fontSize: font.size.xs, color: colors.mutedForeground },
  link: {
    textAlign: "center",
    color: colors.primary,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    paddingVertical: spacing.md,
  },
});
