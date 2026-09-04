/**
 * Dove conviene fare la spesa.
 *
 * Sostituisce il confronto finto del prototipo — moltiplicatori scritti a
 * mano — con l'indagine Altroconsumo 2026: 1,5 milioni di prezzi, 1.158
 * punti vendita, 67 città.
 *
 * La distinzione che questa schermata deve mantenere: dice quale catena è
 * mediamente più economica, NON quanto costa la lista dell'utente in un
 * negozio preciso. Per quello c'è la verifica prodotto per prodotto nella
 * lista della spesa, e il collegamento in fondo ci porta.
 */

import { useMemo } from "react";
import { Linking, StyleSheet, View } from "react-native";
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
import {
  CHAIN_RANKING,
  REGION_SPEND,
  SURVEY,
  annualSaving,
  annualSpendFrom,
} from "../src/lib/price-data/chain-ranking";
import { moneyRounded, number } from "../src/lib/format";
import { useI18n } from "../src/lib/i18n";
import { colors, font, radius, spacing } from "../src/theme";

const KIND_LABEL: Record<string, string> = {
  discount: "discount",
  supermercato: "supermercato",
  ipermercato: "ipermercato",
};

export default function DoveConvieneScreen() {
  const router = useRouter();
  const { profile } = useSession();
  const { language } = useI18n();
  // Indagine sul mercato italiano: gli importi restano in euro, ma le
  // convenzioni di scrittura seguono la lingua di chi legge.
  const euro = (v: number) => moneyRounded(v, "EUR", language);

  const cheapest = CHAIN_RANKING[0];
  const dearest = CHAIN_RANKING[CHAIN_RANKING.length - 1];

  /**
   * Risparmio calcolato sul budget dell'utente, non su quello dell'indagine.
   * Il titolo "3.790 € l'anno" vale per una famiglia da 9.450 € di spesa
   * annua: mostrarlo a chi ne spende 4.000 sarebbe fuorviante.
   */
  const personal = useMemo(() => {
    const annual = annualSpendFrom(Number(profile.budget), profile.frequency);
    if (annual === 0) return null;
    return { annual, saving: annualSaving(dearest.index, cheapest.index, annual) };
  }, [profile.budget, profile.frequency, cheapest.index, dearest.index]);

  return (
    <Screen
      footer={
        <Button
          label="Verifica i prezzi della tua lista"
          icon="pricetag-outline"
          onPress={() => router.push("/lista")}
        />
      }
    >
      <TopBar title="Dove conviene" onBack={() => router.back()} />

      <View style={styles.head}>
        <Pill tone="success" icon="stats-chart-outline">
          Indagine {SURVEY.source} 2026
        </Pill>
        <Title>Dove conviene fare la spesa</Title>
        <Subtitle>
          Classifica delle catene italiane per convenienza, su rilevazione indipendente.
        </Subtitle>
      </View>

      {/* Il dato che colpisce, ma riferito al budget di chi guarda */}
      <GradientCard>
        <Body style={styles.heroLabel}>
          {personal ? "Scegliendo l'insegna giusta risparmi" : "Una famiglia di 4 persone risparmia"}
        </Body>
        <Body style={styles.heroValue}>
          {euro(personal ? personal.saving : SURVEY.maxAnnualSaving)}
        </Body>
        <Body style={styles.heroSub}>
          all'anno
          {personal
            ? ` sul tuo budget di ${euro(personal.annual)}`
            : `, su una spesa annua di ${euro(SURVEY.averageAnnualSpend)}`}
        </Body>
      </GradientCard>

      <Card>
        <Label icon="trophy-outline">La classifica</Label>
        <Body style={styles.small}>
          Indice 100 = la catena più economica della rilevazione. 117 significa prezzi mediamente
          del 17% più alti.
        </Body>

        {CHAIN_RANKING.map((chain, i) => {
          const tone = i === 0 ? "success" : i === CHAIN_RANKING.length - 1 ? "danger" : "neutral";
          return (
            <View key={chain.name} style={styles.chain}>
              <View style={styles.chainTop}>
                <View style={styles.chainName}>
                  <View style={[styles.rank, i === 0 && styles.rankFirst]}>
                    <Body style={[styles.rankText, i === 0 && styles.rankTextFirst]}>{i + 1}</Body>
                  </View>
                  <View style={styles.chainText}>
                    <Body style={styles.chainLabel}>{chain.name}</Body>
                    <Body style={styles.chainKind}>{KIND_LABEL[chain.kind]}</Body>
                  </View>
                </View>
                <Pill tone={tone as never}>{chain.index}</Pill>
              </View>

              <View style={styles.bar}>
                <View
                  style={[
                    styles.barFill,
                    {
                      // La barra parte da 100: mostra di quanto si è sopra
                      // il minimo, non il valore assoluto, che sarebbe piatto.
                      width: `${Math.min(100, ((chain.index - 100) / 35) * 100)}%`,
                      backgroundColor:
                        i === 0
                          ? colors.primary
                          : i === CHAIN_RANKING.length - 1
                            ? colors.destructive
                            : colors.accent,
                    },
                  ]}
                />
              </View>

              {chain.note ? <Body style={styles.chainNote}>{chain.note}</Body> : null}
            </View>
          );
        })}
      </Card>

      <Card>
        <Label icon="map-outline">Quanto pesa la regione</Label>
        <Body>
          Più economiche: <Body style={styles.bold}>{REGION_SPEND.cheapest.regions.join(" e ")}</Body>,
          circa {euro(REGION_SPEND.cheapest.annual)} l'anno a famiglia.
        </Body>
        <Body>
          Più care: <Body style={styles.bold}>{REGION_SPEND.dearest.regions.join(" e ")}</Body>,
          circa {euro(REGION_SPEND.dearest.annual)} — il {REGION_SPEND.dearest.deltaPercent}% in più.
        </Body>
      </Card>

      {/* Il limite di questi dati, detto senza girarci intorno */}
      <Card style={styles.note}>
        <Label icon="information-circle-outline">Cosa dicono questi numeri</Label>
        <Body style={styles.small}>
          Dicono quale catena è <Body style={styles.bold}>mediamente</Body> più economica sul
          paniere dell'indagine. Non dicono quanto costa la tua lista in un negozio preciso: i
          prezzi cambiano per punto vendita, offerta e periodo.
        </Body>
        <Body style={styles.small}>
          Per il costo reale dei tuoi prodotti, usa la verifica prezzo dalla lista della spesa.
        </Body>
      </Card>

      <Card>
        <Label icon="document-text-outline">La fonte</Label>
        <View style={styles.facts}>
          <Fact value={`${number(SURVEY.pricesCompared / 1_000_000, language)} mln`} label="prezzi rilevati" />
          <Fact value={String(SURVEY.stores)} label="punti vendita" />
          <Fact value={String(SURVEY.cities)} label="città" />
        </View>
        <Body style={styles.small}>
          {SURVEY.source} · {SURVEY.title} · rilevazione {SURVEY.fieldwork} su {SURVEY.categories}{" "}
          categorie di prodotto.
        </Body>
        <ListRow
          icon="open-outline"
          title="Leggi l'indagine completa"
          subtitle="altroconsumo.it"
          onPress={() => Linking.openURL(SURVEY.url).catch(() => {})}
        />
      </Card>
    </Screen>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.fact}>
      <Body style={styles.factValue}>{value}</Body>
      <Body style={styles.factLabel}>{label}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { gap: spacing.sm },
  heroLabel: { color: "rgba(255,255,255,0.85)", fontSize: font.size.sm },
  heroValue: {
    color: "#FFFFFF",
    fontSize: font.size.display,
    fontWeight: font.weight.bold,
    letterSpacing: -1,
    lineHeight: font.size.display * 1.1,
  },
  heroSub: { color: "rgba(255,255,255,0.9)", fontSize: font.size.sm },

  chain: { gap: spacing.xs, paddingVertical: spacing.sm },
  chainTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chainName: { flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 },
  rank: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  rankFirst: { backgroundColor: colors.successBg },
  rankText: { fontSize: font.size.sm, fontWeight: font.weight.bold, color: colors.mutedForeground },
  rankTextFirst: { color: colors.primary },
  chainText: { flex: 1 },
  chainLabel: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.foreground },
  chainKind: { fontSize: font.size.xs, color: colors.mutedForeground },
  chainNote: { fontSize: font.size.sm, color: colors.mutedForeground, lineHeight: 19 },

  bar: { height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 3 },

  facts: { flexDirection: "row", gap: spacing.sm },
  fact: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    gap: 2,
  },
  factValue: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.foreground },
  factLabel: { fontSize: font.size.xs, color: colors.mutedForeground, textAlign: "center" },

  note: { backgroundColor: colors.muted },
  small: { fontSize: font.size.sm, color: colors.mutedForeground, lineHeight: 20 },
  bold: { fontWeight: font.weight.semibold, color: colors.foreground },
});
