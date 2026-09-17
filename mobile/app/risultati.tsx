/**
 * Risultati — la schermata che l'investitore guarda per prima.
 *
 * Regola ereditata dal prototipo e mantenuta: **nessun calcolo qui dentro.**
 * Ogni numero viene da `computeResults()`, unico posto dove budget, risparmio,
 * punteggio e confronto supermercati vengono decisi. Se un numero è sbagliato
 * si corregge lì, e cambia ovunque.
 *
 * I prezzi arrivano dal motore con ricerca quando c'e' — quelli veri dei negozi
 * della citta' dell'utente — e altrimenti da `pricePlan()`, che legge la tabella
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
import { EroeRisparmio, RigaBudget } from "../src/components/eroe-risparmio";
import { useSession } from "../src/lib/state/session";
import { QuotaBanner } from "../src/components/quota-banner";
import { SalvaPiano } from "../src/components/salva-piano";
import { computeResults } from "../src/lib/results/compute-results";
import { pricePlan } from "../src/lib/price-data/price-engine";
import { pricingFromOffers } from "../src/lib/plan-full";
import type { PricingResult } from "../src/lib/price-data";
import { buildWhatsAppMessage } from "../src/lib/export/whatsapp-share";
import { money, simboloValuta, deviceDefaults } from "../src/lib/format";
import { useI18n } from "../src/lib/i18n";
import { colors, font, radius, spacing } from "../src/theme";
import { uiText } from "../src/lib/ui-strings";

const STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger"; icon: string }> = {
  comfortable: { label: "Sei dentro il budget", tone: "success", icon: "checkmark-circle-outline" },
  optimized: { label: "Budget usato quasi tutto", tone: "warning", icon: "speedometer-outline" },
  over: { label: "Sopra il budget", tone: "danger", icon: "alert-circle-outline" },
  too_low: { label: "Budget troppo basso", tone: "danger", icon: "warning-outline" },
  unavailable: { label: "Prezzi non disponibili", tone: "warning", icon: "help-circle-outline" },
};

export default function RisultatiScreen() {
  /** Testo nella lingua scelta dall'utente. */
  const ui = (t: string) => uiText(t, language);
  const router = useRouter();
  const { profile, currentPlan, planExtra } = useSession();
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
        // I prezzi veri del motore con ricerca hanno la precedenza: sono di
        // oggi, dei negozi di questa citta', e coprono paesi che il catalogo
        // interno non conosce affatto. A Zurigo il catalogo non ha listini
        // svizzeri e la schermata mostrava "prezzi non disponibili" e 0,00 CHF
        // mentre i prezzi reali erano gia' in memoria.
        if (planExtra?.prodotti?.length) {
          if (alive) setPricing(pricingFromOffers(planExtra, currentPlan.groceryList));
          return;
        }
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
  }, [currentPlan, city, country, planExtra]);

  const results = useMemo(
    () => (currentPlan ? computeResults({ profile, plan: currentPlan, pricing }) : null),
    [profile, currentPlan, pricing],
  );

  if (!currentPlan || !results) {
    return (
      <Screen>
        <View style={styles.empty}>
          <Ionicons name="clipboard-outline" size={44} color={colors.mutedForeground} />
          <Title>{ui("Nessun piano")}</Title>
          <Subtitle>Rispondi alle domande e te ne prepariamo uno.</Subtitle>
          <Button label={ui("Comincia")} onPress={() => router.replace("/onboarding/citta")} />
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
          <Button label={ui("Vedi il menù")} icon="restaurant-outline" onPress={() => router.push("/menu")} />
          <Button
            label={ui("Lista della spesa")}
            variant="secondary"
            icon="cart-outline"
            onPress={() => router.push("/lista")}
          />
        </View>
      }
    >
      <TopBar
        title={ui("Il tuo piano")}
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
          {ui(st.label)}
        </Pill>
        <Title>{ui("Il tuo piano")}</Title>
        <Subtitle>
          {city} · {profile.household || "4"} persone ·{" "}
          {profile.frequency === "monthly" ? "un mese" : "una settimana"}
        </Subtitle>
      </View>

      {/* IL RISPARMIO, NON LA SPESA.
          Prima qui c'era «Spesa prevista» in grande e il risparmio come nota:
          i numeri erano gli stessi, ma la schermata raccontava quanto si
          spende invece di quanto si guadagna a usarla. E' il disegno del
          prototipo del cliente, ed e' quello giusto. */}
      <EroeRisparmio
        ui={ui}
        risparmio={results.status === "over" ? results.overBudgetAmount : results.savings}
        annuale={results.annualSavings}
        valuta={simboloValuta(cur, language)}
        sfora={results.status === "over"}
        periodo={ui(profile.frequency === "monthly" ? "al mese" : "a settimana")}
        statoBudget={ui(st.label)}
        tono={st.tone}
        punteggio={results.score.total}
        /* IL NUMERO SI MOSTRA QUANDO C'E' UN TOTALE, NON QUANDO LA
           COPERTURA E' PIENA.
           Qui prima si guardava `savingsAvailable`, che vuol dire «ogni voce
           ha un prezzo» — e con i prezzi veri la copertura piena e' rara.
           Misurato su Napoli: tredici voci su sedici con prezzo, 44,81 € di
           spesa, quattordici insegne confrontate, e l'app scriveva «il
           risparmio non e' calcolabile». Un risultato ottimo buttato via da un
           `if`.

           `basketTotal` e' null solo quando il totale non regge davvero —
           sotto il sessanta per cento di copertura. Sopra, il numero si mostra
           e si dichiara quante voci mancano: e' la stessa onesta' di prima,
           senza rinunciare a dire la cosa buona. */
        senzaRisparmio={
          results.basketTotal !== null
            ? undefined
            : ui("Non abbastanza prezzi per calcolarlo: le voci senza prezzo non entrano nel totale.")
        }
        parziale={
          results.basketTotal !== null && results.missingPrices.length > 0
            ? ui(`${results.missingPrices.length} voci senza prezzo, escluse dal conto`)
            : undefined
        }
      />

      {/* Le cifre del budget, una riga per voce come nel prototipo. */}
      <Card>
        <RigaBudget
          etichetta={ui(profile.frequency === "monthly" ? "Budget mensile" : "Budget settimanale")}
          valore={money(results.budget, cur, language)}
        />
        <RigaBudget
          etichetta={ui("Spesa stimata")}
          valore={results.basketTotal !== null ? money(results.estimatedSpend, cur, language) : "—"}
        />
        <View style={styles.filo} />
        <RigaBudget
          etichetta={ui(results.status === "over" ? "Sopra il budget di" : "Stai risparmiando")}
          valore={
            results.basketTotal !== null
              ? money(
                  results.status === "over" ? results.overBudgetAmount : results.savings,
                  cur,
                  language,
                )
              : ui("non calcolabile")
          }
          tipo={results.status === "over" ? "sfora" : "risparmio"}
        />
        <RigaBudget
          etichetta={ui("Risparmio annuo")}
          valore={results.basketTotal !== null ? money(results.annualSavings, cur, language) : "—"}
        />
      </Card>

      <View style={styles.grid}>
        <Stat icon="person-outline" label={ui("A persona / giorno")} value={money(results.costPerPersonPerDay, cur, language)} />
        <Stat icon="ribbon-outline" label={ui("Punteggio")} value={`${results.score.total}/100`} />
      </View>

      {results.annualSavings > 0 ? (
        <Card>
          <Label icon="trending-up-outline">{ui("Se continui così per un anno")}</Label>
          <Body style={styles.bigNumber}>{money(results.annualSavings, cur, language)}</Body>
          <Body style={styles.muted}>{ui("risparmiati rispetto al tuo budget attuale")}</Body>
        </Card>
      ) : null}


      <Card>
        <Label icon="compass-outline">Vai a</Label>

        <ListRow
          icon="map-outline"
          title={ui("Supermercati vicini")}
          subtitle={ui("Negozi alimentari intorno a te, con distanza")}
          onPress={() => router.push("/negozi")}
        />
        <ListRow
          icon="share-social-outline"
          title={ui("Condividi il piano")}
          subtitle={ui("Manda menù e lista a chi fa la spesa con te")}
          onPress={() => void share()}
        />
        <ListRow
          icon="refresh-outline"
          title={ui("Rifai il piano")}
          subtitle={ui("Ricomincia dalle domande")}
          onPress={() => router.replace("/onboarding/citta")}
        />
      </Card>

      {currentPlan.savingTips.length > 0 ? (
        <Card>
          <Label icon="bulb-outline">{ui("Come risparmiare ancora")}</Label>
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
        <Label icon="information-circle-outline">{ui("Come leggere questi numeri")}</Label>
        <Body style={styles.small}>
          {loading
            ? ui("Sto calcolando i prezzi…")
            : results.savingsAvailable
              ? ui("Prezzi trovati online nei negozi della tua zona, con i link controllati uno per uno. Dove nessun negozio pubblica il prezzo, la voce resta senza.")
              : results.estimatedSpend > 0
                // I numeri fuori dalla traduzione: sono uguali in ogni lingua,
                // e tenerli dentro obbligherebbe a un dizionario per ogni conta.
                ? `${results.missingPrices.length}/${currentPlan.groceryList.length} ` +
                  ui("prodotti sono rimasti senza prezzo, quindi la spesa vera sarà un po' più alta. Gli altri sono prezzi trovati online, non stime.")
                : ui("Non siamo riusciti a trovare abbastanza prezzi per questa lista. Il menù e la lista della spesa restano completi, e da ogni voce puoi cercare il prodotto nei negozi.")}
        </Body>
      </Card>

      {/* Il salvataggio sta in FONDO e non in cima: prima l'utente guarda i
          numeri, poi decide se tenerli. Un pulsante «salva» prima ancora che
          abbia letto cosa sta salvando e' un pulsante che non si preme. */}
      <SalvaPiano
        citta={city}
        form={profile}
        piano={currentPlan}
        spesaStimata={results.estimatedSpend}
        risparmio={results.savings}
        punteggio={results.score.total}
      />
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
  filo: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
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
