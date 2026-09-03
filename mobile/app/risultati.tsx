/**
 * Risultati — la schermata che l'investitore guarda per prima.
 *
 * Regola ereditata dal prototipo e mantenuta: **nessun calcolo qui dentro.**
 * Ogni numero mostrato viene da `computeResults()`, che è l'unico posto dove
 * budget, risparmio, punteggio e confronto supermercati vengono decisi. Se un
 * numero è sbagliato si corregge lì, e cambia ovunque.
 *
 * I prezzi arrivano da `pricePlan()`, che oggi legge la tabella di riferimento
 * inclusa nell'app: nessuna rete, nessuna chiave. Quando il backend sarà in
 * linea la stessa funzione userà le fonti reali senza toccare questa schermata.
 */

import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Body, Button, Card, Label, Pill, Screen, Subtitle, Title } from "../src/components/ui";
import { useSession } from "../src/lib/state/session";
import { computeResults } from "../src/lib/results/compute-results";
import { pricePlan } from "../src/lib/price-data/price-engine";
import type { PricingResult } from "../src/lib/price-data";
import { colors, font, radius, spacing } from "../src/theme";

function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export default function RisultatiScreen() {
  const router = useRouter();
  const { profile, currentPlan } = useSession();
  const [pricing, setPricing] = useState<PricingResult | null>(null);
  const [loading, setLoading] = useState(true);

  const city = profile.city || "Bologna";
  const country = profile.country || "IT";

  useEffect(() => {
    if (!currentPlan) return;
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const result = await pricePlan(currentPlan, city, country);
        if (alive) setPricing(result);
      } catch (err) {
        // Senza prezzi la schermata resta utile: menù e lista ci sono
        // comunque, e `computeResults` sa gestire `pricing: null`.
        console.warn("[risultati] prezzi non disponibili:", err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [currentPlan, city, country]);

  const results = useMemo(
    () => (currentPlan ? computeResults({ profile, plan: currentPlan, pricing }) : null),
    [profile, currentPlan, pricing],
  );

  if (!currentPlan || !results) {
    return (
      <Screen>
        <View style={styles.empty}>
          <Title>Nessun piano</Title>
          <Subtitle>Rispondi alle domande e te ne prepariamo uno.</Subtitle>
          <Button label="Comincia" onPress={() => router.replace("/onboarding/citta")} />
        </View>
      </Screen>
    );
  }

  const cur = profile.currency || "EUR";
  const tone =
    results.status === "comfortable" ? "success" : results.status === "over" ? "danger" : "warning";
  const statusLabel = {
    comfortable: "Sei dentro il budget",
    optimized: "Budget usato quasi tutto",
    over: "Sopra il budget",
    too_low: "Budget troppo basso",
    unavailable: "Prezzi non disponibili",
  }[results.status];

  return (
    <Screen
      footer={
        <View style={styles.actions}>
          <Button label="Vedi il menù" onPress={() => router.push("/menu")} />
          <Button
            label="Lista della spesa"
            variant="secondary"
            onPress={() => router.push("/lista")}
          />
        </View>
      }
    >
      <View style={styles.head}>
        <Pill tone={tone as never}>{statusLabel}</Pill>
        <Title>Il tuo piano</Title>
        <Subtitle>
          {city} · {profile.household || "4"} persone ·{" "}
          {profile.frequency === "monthly" ? "un mese" : "una settimana"}
        </Subtitle>
      </View>

      {/* Spesa prevista contro budget: il confronto che conta davvero */}
      <Card>
        <Label>Spesa prevista</Label>
        <Body style={styles.bigNumber}>{money(results.estimatedSpend, cur)}</Body>
        <Body style={styles.muted}>
          su un budget di {money(results.budget, cur)}
          {results.savings > 0 ? ` · ti restano ${money(results.savings, cur)}` : ""}
          {results.overBudgetAmount > 0
            ? ` · sfori di ${money(results.overBudgetAmount, cur)}`
            : ""}
        </Body>
        <View style={styles.bar}>
          <View
            style={[
              styles.barFill,
              {
                width: `${Math.min(100, Math.max(2, results.ratio * 100))}%`,
                backgroundColor: results.ratio > 1 ? colors.destructive : colors.primary,
              },
            ]}
          />
        </View>
      </Card>

      <View style={styles.grid}>
        <Stat label="A persona al giorno" value={money(results.costPerPersonPerDay, cur)} />
        <Stat label="Punteggio" value={`${results.score.total}/100`} />
      </View>

      {results.annualSavings > 0 ? (
        <Card>
          <Label>Se continui così per un anno</Label>
          <Body style={styles.bigNumber}>{money(results.annualSavings, cur)}</Body>
          <Body style={styles.muted}>risparmiati rispetto al tuo budget attuale</Body>
        </Card>
      ) : null}

      {/* Onestà sui prezzi: obbligatoria, e va vista senza cercarla */}
      <Card style={styles.disclaimerCard}>
        <Label>Come leggere questi numeri</Label>
        <Body style={styles.small}>
          {loading
            ? "Sto calcolando i prezzi…"
            : results.savingsAvailable
              ? "Sono stime indicative basate sui prezzi medi del tuo paese, non rilevazioni dai supermercati. Dalla lista della spesa puoi verificare il prezzo reale di ogni prodotto."
              : `Alcuni prodotti non hanno un prezzo di riferimento (${results.missingPrices.length} su ${currentPlan.groceryList.length}), quindi il totale è parziale. Dalla lista puoi verificare i prezzi reali.`}
        </Body>
      </Card>

      {results.cheapestSupermarket ? (
        <Card>
          <Label>Confronto supermercati</Label>
          <Body>
            Il più conveniente per questa lista risulta{" "}
            <Body style={styles.bold}>{results.cheapestSupermarket.name}</Body>
          </Body>
          <Body style={styles.small}>
            Stima calcolata sui prezzi medi di catena, non su rilevazioni in negozio.
          </Body>
        </Card>
      ) : null}

      {currentPlan.savingTips.length > 0 ? (
        <Card>
          <Label>Come risparmiare ancora</Label>
          {currentPlan.savingTips.slice(0, 4).map((tip, i) => (
            <Body key={i} style={styles.tip}>
              • {tip}
            </Body>
          ))}
        </Card>
      ) : null}

      <Button
        label="Rifai il piano"
        variant="ghost"
        onPress={() => router.replace("/onboarding/citta")}
      />
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.stat}>
      <Body style={styles.statValue}>{value}</Body>
      <Body style={styles.statLabel}>{label}</Body>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { gap: spacing.sm, paddingTop: spacing.sm },
  empty: { gap: spacing.lg, paddingTop: spacing.xxxl, alignItems: "flex-start" },
  actions: { gap: spacing.sm },

  bigNumber: {
    fontSize: font.size.display,
    fontWeight: font.weight.bold,
    color: colors.foreground,
    letterSpacing: -1,
    lineHeight: font.size.display * 1.1,
  },
  muted: { fontSize: font.size.sm, color: colors.mutedForeground },
  small: { fontSize: font.size.sm, color: colors.mutedForeground, lineHeight: 20 },
  bold: { fontWeight: font.weight.semibold },
  tip: { fontSize: font.size.sm, color: colors.foreground, lineHeight: 21 },

  bar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.muted,
    overflow: "hidden",
    marginTop: spacing.sm,
  },
  barFill: { height: "100%", borderRadius: 4 },

  grid: { flexDirection: "row", gap: spacing.sm },
  stat: { flex: 1, gap: 2 },
  statValue: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.foreground },
  statLabel: { fontSize: font.size.xs, color: colors.mutedForeground },

  disclaimerCard: { backgroundColor: colors.muted, borderRadius: radius.md },
});
