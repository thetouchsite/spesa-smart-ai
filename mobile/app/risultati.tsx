/**
 * Risultati — la schermata che l'investitore guarda per prima.
 *
 * Regola ereditata dal prototipo e mantenuta: **nessun calcolo qui dentro.**
 * Ogni numero viene da `computeResults()`, unico posto dove budget, risparmio,
 * punteggio e confronto supermercati vengono decisi. Se un numero è sbagliato
 * si corregge lì, e cambia ovunque.
 *
 * I prezzi arrivano da `pricePlan()`, che oggi legge la tabella di riferimento
 * inclusa nell'app: nessuna rete, nessuna chiave. Quando il backend sarà in
 * linea la stessa funzione userà le fonti reali senza toccare questa schermata.
 */

import { useEffect, useMemo, useState } from "react";
import { Share, StyleSheet, View } from "react-native";
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
import { useSession } from "../src/lib/state/session";
import { QuotaBanner } from "../src/components/quota-banner";
import { computeResults } from "../src/lib/results/compute-results";
import { pricePlan } from "../src/lib/price-data/price-engine";
import type { PricingResult } from "../src/lib/price-data";
import { buildWhatsAppMessage } from "../src/lib/export/whatsapp-share";
import { money, deviceDefaults } from "../src/lib/format";
import { useI18n } from "../src/lib/i18n";
import { colors, font, radius, spacing } from "../src/theme";

const STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger"; icon: string }> = {
  comfortable: { label: "Sei dentro il budget", tone: "success", icon: "checkmark-circle-outline" },
  optimized: { label: "Budget usato quasi tutto", tone: "warning", icon: "speedometer-outline" },
  over: { label: "Sopra il budget", tone: "danger", icon: "alert-circle-outline" },
  too_low: { label: "Budget troppo basso", tone: "danger", icon: "warning-outline" },
  unavailable: { label: "Prezzi non disponibili", tone: "warning", icon: "help-circle-outline" },
};

export default function RisultatiScreen() {
  const router = useRouter();
  const { profile, currentPlan } = useSession();
  const { language } = useI18n();
  const [pricing, setPricing] = useState<PricingResult | null>(null);
  const [loading, setLoading] = useState(true);

  const fallback = deviceDefaults();
  const city = profile.city || "";
  const country = profile.country || fallback.country;
  // La classifica catene viene da un'indagine sul solo mercato italiano.
  const isItaly = country.toUpperCase() === "IT";

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
          <Ionicons name="clipboard-outline" size={44} color={colors.mutedForeground} />
          <Title>Nessun piano</Title>
          <Subtitle>Rispondi alle domande e te ne prepariamo uno.</Subtitle>
          <Button label="Comincia" onPress={() => router.replace("/onboarding/citta")} />
        </View>
      </Screen>
    );
  }

  const cur = profile.currency || fallback.currency;
  // Con un totale parziale lo stato del budget e' comunque significativo:
  // dire "prezzi non disponibili" sopra un numero valido confonde.
  const st =
    results.status === "unavailable" && results.estimatedSpend > 0
      ? { label: "Stima parziale", tone: "warning" as const, icon: "information-circle-outline" }
      : (STATUS[results.status] ?? STATUS.unavailable);

  async function share() {
    try {
      const message = buildWhatsAppMessage({
        plan: currentPlan!,
        profile,
        estimatedSpend: results!.estimatedSpend,
        savings: results!.savings,
        language,
      });
      await Share.share({ message });
    } catch (err) {
      console.warn("[risultati] condivisione fallita:", err);
    }
  }

  return (
    <Screen
      footer={
        <View style={styles.actions}>
          <Button label="Vedi il menù" icon="restaurant-outline" onPress={() => router.push("/menu")} />
          <Button
            label="Lista della spesa"
            variant="secondary"
            icon="cart-outline"
            onPress={() => router.push("/lista")}
          />
        </View>
      }
    >
      <TopBar
        title="Il tuo piano"
        onBack={() => router.replace("/")}
        right={
          <View style={styles.topActions}>
            {/* Approfondimento, non un passaggio del flusso: un'icona, non
                una riga che occupa spazio nella schermata principale. */}
            {isItaly ? (
              <Button
                label=""
                icon="trophy-outline"
                variant="ghost"
                style={styles.iconBtn}
                onPress={() => router.push("/dove-conviene")}
              />
            ) : null}
            <Button
              label=""
              icon="settings-outline"
              variant="ghost"
              style={styles.iconBtn}
              onPress={() => router.push("/impostazioni")}
            />
          </View>
        }
      />

      <QuotaBanner />

      <View style={styles.head}>
        <Pill tone={st.tone} icon={st.icon as never}>
          {st.label}
        </Pill>
        <Title>Il tuo piano</Title>
        <Subtitle>
          {city} · {profile.household || "4"} persone ·{" "}
          {profile.frequency === "monthly" ? "un mese" : "una settimana"}
        </Subtitle>
      </View>

      {/* Il dato principale, in evidenza: spesa contro budget */}
      <GradientCard>
        <Body style={styles.heroLabel}>
          {results.estimatedSpend > 0 && !results.savingsAvailable
            ? "Spesa prevista (parziale)"
            : "Spesa prevista"}
        </Body>
        <Body style={styles.heroValue}>{money(results.estimatedSpend, cur, language)}</Body>
        <Body style={styles.heroSub}>
          su {money(results.budget, cur, language)} di budget
          {results.savings > 0 ? ` · ti restano ${money(results.savings, cur, language)}` : ""}
          {results.overBudgetAmount > 0 ? ` · sfori di ${money(results.overBudgetAmount, cur, language)}` : ""}
        </Body>
        <View style={styles.bar}>
          <View
            style={[
              styles.barFill,
              { width: `${Math.min(100, Math.max(2, results.ratio * 100))}%` },
            ]}
          />
        </View>
      </GradientCard>

      <View style={styles.grid}>
        <Stat icon="person-outline" label="A persona / giorno" value={money(results.costPerPersonPerDay, cur, language)} />
        <Stat icon="ribbon-outline" label="Punteggio" value={`${results.score.total}/100`} />
      </View>

      {results.annualSavings > 0 ? (
        <Card>
          <Label icon="trending-up-outline">Se continui così per un anno</Label>
          <Body style={styles.bigNumber}>{money(results.annualSavings, cur, language)}</Body>
          <Body style={styles.muted}>risparmiati rispetto al tuo budget attuale</Body>
        </Card>
      ) : null}


      <Card>
        <Label icon="compass-outline">Vai a</Label>

        <ListRow
          icon="map-outline"
          title="Supermercati vicini"
          subtitle="Negozi alimentari intorno a te, con distanza"
          onPress={() => router.push("/negozi")}
        />
        <ListRow
          icon="share-social-outline"
          title="Condividi il piano"
          subtitle="Manda menù e lista a chi fa la spesa con te"
          onPress={() => void share()}
        />
        <ListRow
          icon="refresh-outline"
          title="Rifai il piano"
          subtitle="Ricomincia dalle domande"
          onPress={() => router.replace("/onboarding/citta")}
        />
      </Card>

      {currentPlan.savingTips.length > 0 ? (
        <Card>
          <Label icon="bulb-outline">Come risparmiare ancora</Label>
          {currentPlan.savingTips.slice(0, 4).map((tip, i) => (
            <View key={i} style={styles.tipRow}>
              <Ionicons name="checkmark" size={16} color={colors.primary} style={styles.tipIcon} />
              <Body style={styles.tip}>{tip}</Body>
            </View>
          ))}
        </Card>
      ) : null}

      {/* Onestà sui prezzi: obbligatoria, e va vista senza cercarla */}
      <Card style={styles.disclaimerCard}>
        <Label icon="information-circle-outline">Come leggere questi numeri</Label>
        <Body style={styles.small}>
          {loading
            ? "Sto calcolando i prezzi…"
            : results.savingsAvailable
              ? "Sono stime indicative basate sui prezzi medi del tuo paese, non rilevazioni dai supermercati. Dalla lista della spesa puoi verificare il prezzo reale di ogni prodotto."
              : results.estimatedSpend > 0
                ? `Totale parziale: ${results.missingPrices.length} prodotti su ${currentPlan.groceryList.length} non hanno un prezzo di riferimento, quindi la spesa reale sarà un po' più alta. Gli altri sono stime indicative, non rilevazioni dai supermercati.`
                : "Non abbiamo prezzi di riferimento sufficienti per questa lista. Menù e lista della spesa restano completi, e dalla lista puoi verificare il prezzo reale di ogni prodotto."}
        </Body>
      </Card>
    </Screen>
  );
}

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <Card style={styles.stat}>
      <Ionicons name={icon as never} size={19} color={colors.primary} />
      <Body style={styles.statValue}>{value}</Body>
      <Body style={styles.statLabel}>{label}</Body>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { gap: spacing.sm },
  empty: { gap: spacing.lg, paddingTop: spacing.xxxl, alignItems: "flex-start" },
  actions: { gap: spacing.sm },
  iconBtn: { minHeight: 38, width: 38, paddingHorizontal: 0 },
  topActions: { flexDirection: "row", gap: 2 },

  heroLabel: { color: "rgba(255,255,255,0.85)", fontSize: font.size.sm },
  heroValue: {
    color: "#FFFFFF",
    fontSize: font.size.display,
    fontWeight: font.weight.bold,
    letterSpacing: -1,
    lineHeight: font.size.display * 1.1,
  },
  heroSub: { color: "rgba(255,255,255,0.9)", fontSize: font.size.sm },
  bar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.28)",
    overflow: "hidden",
    marginTop: spacing.sm,
  },
  barFill: { height: "100%", borderRadius: 4, backgroundColor: "#FFFFFF" },

  bigNumber: {
    fontSize: font.size.xxl,
    fontWeight: font.weight.bold,
    color: colors.foreground,
    letterSpacing: -0.8,
  },
  muted: { fontSize: font.size.sm, color: colors.mutedForeground },
  small: { fontSize: font.size.sm, color: colors.mutedForeground, lineHeight: 20 },
  bold: { fontWeight: font.weight.semibold },

  tipRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  tipIcon: { marginTop: 3 },
  tip: { flex: 1, fontSize: font.size.sm, color: colors.foreground, lineHeight: 21 },

  grid: { flexDirection: "row", gap: spacing.sm },
  stat: { flex: 1, gap: 2, alignItems: "flex-start" },
  statValue: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.foreground },
  statLabel: { fontSize: font.size.xs, color: colors.mutedForeground },

  disclaimerCard: { backgroundColor: colors.muted, borderRadius: radius.md },
});
