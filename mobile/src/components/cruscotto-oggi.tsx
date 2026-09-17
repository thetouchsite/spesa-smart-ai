/**
 * Il cruscotto di chi è entrato: cosa si mangia oggi, e cosa manca.
 *
 * PERCHE' NON LA STESSA HOME DI TUTTI
 * -----------------------------------
 * La home con l'eroe e «Crea il mio piano» è una vetrina: serve a chi non sa
 * ancora cosa fa l'app. A chi è già dentro, con un piano in corso, quella
 * schermata chiede ogni volta di ricominciare da capo — è l'unica cosa che
 * offre — mentre la domanda vera che si fa aprendo l'app alle sette di sera è
 * una sola: **cosa mangio stasera, e ho comprato tutto?**
 *
 * COME SI SA CHE GIORNO E' OGGI
 * -----------------------------
 * I giorni del piano hanno un nome — «Lunedì», «Monday» — e `dayIndex` lo
 * traduce in un numero. Si confronta con oggi e si mostra quel giorno. Se il
 * piano usa nomi che non si riconoscono, si mostra il primo giorno invece di
 * non mostrare niente: un piano c'è, e vedere il giorno sbagliato è meglio che
 * vedere una schermata vuota.
 *
 * COSA MANCA, DAVVERO
 * -------------------
 * Le voci non ancora spuntate nella lista della spesa — le stesse spunte che
 * si salvano da lì. Non è una stima: è quello che l'utente ha detto di non
 * avere ancora preso.
 */

import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Body, Button, Card, Ionicons, Label, Title } from "./ui";
import { CartaPiano } from "./carta-piano";
import { DishPhoto } from "./dish-photo";
import { useSession } from "../lib/state/session";
import { useUtente } from "../lib/state/utente";
import { fotoNota } from "../lib/recipes/foto";
import { dayIndex, localDay } from "../lib/days";
import { computeResults } from "../lib/results/compute-results";
import { pricingFromOffers } from "../lib/plan-full";
import { pricePlan } from "../lib/price-data/price-engine";
import type { PricingResult } from "../lib/price-data";
import { deviceDefaults, simboloValuta } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { kv } from "../lib/kv";
import { colors, font, radius, spacing } from "../theme";

const PASTI = [
  { chiave: "breakfast" as const, etichetta: "Colazione", icona: "sunny-outline" as const },
  { chiave: "lunch" as const, etichetta: "Pranzo", icona: "partly-sunny-outline" as const },
  { chiave: "dinner" as const, etichetta: "Cena", icona: "moon-outline" as const },
];

/** La stessa chiave che usa la lista della spesa. */
const CHIAVE_SPUNTE = "spesa.spuntati.v1";

/**
 * Come chiamare chi sta guardando.
 *
 * Il nome e' facoltativo alla registrazione, e chi lo salta si ritrovava il
 * proprio indirizzo email come titolo della schermata — in grassetto, a
 * ventotto punti. Un'email non e' un nome: e' una stringa tecnica, spesso
 * lunga, e vederla scritta grande fa sembrare l'app un pannello di
 * amministrazione.
 *
 * Se il nome non c'e', si prova la parte prima della chiocciola quando somiglia
 * a un nome; altrimenti non si finge di conoscerlo e si dice cosa fa la
 * schermata.
 */
function comeChiamarlo(nome?: string | null): string {
  const n = (nome ?? "").trim();
  if (n && !n.includes("@")) return n;

  const prima = n
    .split("@")[0]
    ?.replace(/[._-]+/g, " ")
    .trim();
  /* Solo se sembra un nome: «thetouchsite» o «info» non lo sono. Due parole,
     o una parola corta e senza cifre, passano. */
  if (prima && prima.length <= 14 && !/\d/.test(prima)) {
    return prima.charAt(0).toUpperCase() + prima.slice(1);
  }
  return "";
}

function salutoDelMomento(): string {
  const h = new Date().getHours();
  if (h < 11) return "Buongiorno";
  if (h < 18) return "Buon pomeriggio";
  return "Buonasera";
}

export function CruscottoOggi() {
  const router = useRouter();
  const { language } = useI18n();
  const { profile, currentPlan, planExtra } = useSession();
  const { utente } = useUtente();

  /**
   * I numeri della carta, calcolati come li calcola la schermata del piano.
   *
   * PERCHE' NON A MANO, QUI
   * -----------------------
   * Li facevo a mano, e dicevano un'altra cosa. La carta in home mostrava
   * «68 EUR» — la spesa — e la schermata in fondo al tocco «82 € risparmiati»:
   * due numeri diversi per lo stesso piano, a un tocco di distanza. Non era un
   * errore di calcolo, era peggio: contavano due cose diverse. La carta
   * guardava il risparmio rispetto all'insegna piu' cara, che senza prezzi
   * veri di piu' insegne non esiste; la schermata guarda il budget meno la
   * spesa, che esiste sempre.
   *
   * `computeResults` e' l'unico posto dove budget, risparmio e punteggio
   * vengono decisi — lo dice la sua schermata in cima al file — e adesso lo e'
   * anche per la home. `pricingFromOffers` e' sincrona e lavora su quello che
   * c'e' gia' in memoria: nessuna richiesta in piu' per disegnare una carta.
   */
  /**
   * I PREZZI SE LI DEVE ANDARE A PRENDERE ANCHE LA HOME.
   *
   * Prima qui si passava `pricing: null` quando le offerte non c'erano, e
   * `computeResults` senza prezzi restituisce zero — che e' corretto e
   * inutilizzabile: la carta annunciava «€0 a settimana» sopra un piano da
   * tredici prodotti. Uno zero grande e arancione e' la cosa peggiore che
   * questa schermata possa dire, perche' non sembra un dato mancante: sembra
   * un piano che non vale niente.
   *
   * La schermata del piano i prezzi se li va a prendere — con le offerte se ci
   * sono, con `pricePlan` se no — e la home deve fare lo stesso, o i due
   * numeri tornano a divergere. E' la stessa richiesta che l'utente farebbe
   * comunque un secondo dopo, aprendo il piano.
   */
  const [prezzi, setPrezzi] = useState<PricingResult | null>(null);
  const [calcolo, setCalcolo] = useState(false);

  const fallback = deviceDefaults();
  const citta = profile.city || "";
  const paese = profile.country || fallback.country;

  useEffect(() => {
    if (!currentPlan) return;
    /* Le offerte del motore con ricerca hanno la precedenza e non costano
       niente: sono gia' in memoria, la conversione e' sincrona. */
    if (planExtra?.prodotti?.length) {
      setPrezzi(pricingFromOffers(planExtra, currentPlan.groceryList));
      return;
    }
    let vivo = true;
    setCalcolo(true);
    (async () => {
      try {
        const esito = await pricePlan(currentPlan, citta, paese);
        if (vivo) setPrezzi(esito);
      } catch (err) {
        /* Senza prezzi la carta non mente: mostra il piano e dice che i
           prezzi non ci sono, invece di scrivere zero. */
        console.warn("[cruscotto] prezzi non disponibili:", err);
      } finally {
        if (vivo) setCalcolo(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [currentPlan, planExtra, citta, paese]);

  const conti = useMemo(
    () => (currentPlan ? computeResults({ profile, plan: currentPlan, pricing: prezzi }) : null),
    [profile, currentPlan, prezzi],
  );

  /* Il giorno di oggi dentro il piano. `getDay()` conta da domenica, i giorni
     del piano da lunedì: la rotazione allinea i due calendari. */
  const oggi = useMemo(() => {
    const giorni = currentPlan?.mealPlan ?? [];
    if (giorni.length === 0) return null;
    const indiceOggi = (new Date().getDay() + 6) % 7;
    return giorni.find((g) => dayIndex(g.day) === indiceOggi) ?? giorni[0];
  }, [currentPlan]);

  /* Le voci non ancora prese. Si leggono dallo stesso posto in cui la lista
     le scrive: due verità sullo stesso fatto diventerebbero due verità
     diverse alla prima occasione. */
  const mancanti = useMemo(() => {
    const voci = currentPlan?.groceryList ?? [];
    if (voci.length === 0) return [];
    let spunte: Record<string, boolean> = {};
    try {
      spunte = JSON.parse(kv.getItem(CHIAVE_SPUNTE) ?? "{}") as Record<string, boolean>;
    } catch {
      spunte = {};
    }
    /* Gli identificativi della lista contengono categoria, nome e posizione.
       Qui basta il nome: se compare in una chiave spuntata, è preso. */
    const presi = new Set(
      Object.entries(spunte)
        .filter(([, v]) => v)
        .map(([k]) => k),
    );
    return voci.filter((v) => ![...presi].some((k) => k.includes(v.name)));
  }, [currentPlan]);

  if (!currentPlan) {
    return (
      <View style={styles.tutto}>
        <View style={styles.testa}>
          <Body style={styles.saluto}>{salutoDelMomento()}</Body>
          <Title>{comeChiamarlo(utente?.displayName) || "Bentornato"}</Title>
        </View>
        <Card>
          <Label icon="restaurant-outline">Nessun piano in corso</Label>
          <Body style={styles.vuoto}>
            Rispondi a sei domande e ti preparo il menù della settimana con la lista della spesa e i
            prezzi veri.
          </Body>
          <Button label="Crea il mio piano" onPress={() => router.push("/onboarding/citta")} />
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.tutto}>
      <View style={styles.testa}>
        <Body style={styles.saluto}>
          {salutoDelMomento()}
          {oggi ? ` · ${localDay(oggi.day, language)}` : ""}
        </Body>
        <Title>{comeChiamarlo(utente?.displayName) || "Oggi si mangia"}</Title>
      </View>

      {/* IL PIANO, con lo stesso vestito che ha nella schermata dei risultati.
          Non e' un vezzo: chi tocca questa carta finisce li', e ritrovare lo
          stesso oggetto in fondo al tocco dice che si e' arrivati dove si
          voleva. Due stili diversi per la stessa cosa farebbero sembrare la
          seconda un'altra pagina. */}
      {conti ? (
        <CartaPiano
          spesa={conti.estimatedSpend}
          valuta={simboloValuta(profile.currency, language)}
          risparmio={conti.status === "over" ? conti.overBudgetAmount : conti.savings}
          budget={conti.budget}
          sfora={conti.status === "over"}
          periodo={profile.frequency === "monthly" ? "al mese" : "a settimana"}
          inAttesa={calcolo}
          prodotti={currentPlan.groceryList.length}
          giorni={currentPlan.mealPlan.length}
          onPress={() => router.push("/risultati")}
        />
      ) : null}

      {/* I tre pasti di oggi. È la ragione per cui si apre l'app la sera. */}
      {oggi ? (
        <Card>
          <Label icon="today-outline">Oggi</Label>
          {PASTI.map((p) => {
            const piatto = oggi[p.chiave];
            if (!piatto) return null;
            return (
              <Pressable
                key={p.chiave}
                accessibilityRole="button"
                accessibilityLabel={`${p.etichetta}: ${piatto}. Apri la ricetta`}
                onPress={() =>
                  router.push({
                    pathname: "/ricetta",
                    params: { piatto, pasto: p.chiave, giorno: oggi.day },
                  })
                }
                style={({ pressed }) => [styles.pasto, pressed && styles.premuto]}
              >
                <DishPhoto
                  uri={fotoNota(piatto)?.url}
                  nome={piatto}
                  style={styles.miniatura}
                  compatto
                />
                <View style={styles.pastoTesto}>
                  <View style={styles.pastoRiga}>
                    <Ionicons name={p.icona} size={13} color={colors.mutedForeground} />
                    <Body style={styles.pastoEtichetta}>{p.etichetta}</Body>
                  </View>
                  <Body style={styles.pastoNome} numberOfLines={2}>
                    {piatto}
                  </Body>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.border} />
              </Pressable>
            );
          })}
        </Card>
      ) : null}

      {/* Cosa manca. Il numero in grande, i primi nomi sotto: chi sta uscendo
          di casa vuole sapere QUANTO manca, non leggere tredici righe. */}
      <Card>
        <Label icon="cart-outline">La spesa</Label>
        {mancanti.length === 0 ? (
          <View style={styles.fattoRiga}>
            <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
            <Body style={styles.fatto}>Hai preso tutto</Body>
          </View>
        ) : (
          <>
            <Body style={styles.mancaNumero}>
              {mancanti.length === 1 ? "Manca 1 prodotto" : `Mancano ${mancanti.length} prodotti`}
            </Body>
            <Body style={styles.mancaNomi} numberOfLines={2}>
              {mancanti
                .slice(0, 4)
                .map((v) => v.name)
                .join(" · ")}
              {mancanti.length > 4 ? ` · e altri ${mancanti.length - 4}` : ""}
            </Body>
          </>
        )}
        <Button
          label={mancanti.length === 0 ? "Rivedi la lista" : "Apri la lista"}
          variant="secondary"
          onPress={() => router.push("/lista")}
        />
      </Card>

      <View style={styles.scorciatoie}>
        <Button
          label="Menù della settimana"
          icon="calendar-outline"
          variant="ghost"
          onPress={() => router.push("/menu")}
        />
        <Button
          label="Dove conviene comprare"
          icon="storefront-outline"
          variant="ghost"
          onPress={() => router.push("/negozi")}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tutto: { gap: spacing.lg },
  testa: { gap: 2 },
  saluto: { fontSize: font.size.sm, color: colors.mutedForeground },
  vuoto: { fontSize: font.size.sm, color: colors.mutedForeground, marginBottom: spacing.sm },

  pasto: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  premuto: { opacity: 0.7 },
  miniatura: { width: 52, height: 52, borderRadius: radius.md },
  pastoTesto: { flex: 1, gap: 2 },
  pastoRiga: { flexDirection: "row", alignItems: "center", gap: 4 },
  pastoEtichetta: {
    fontSize: font.size.xs,
    color: colors.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  pastoNome: { fontSize: font.size.md, fontWeight: font.weight.medium },

  mancaNumero: { fontSize: font.size.lg, fontWeight: font.weight.semibold },
  mancaNomi: { fontSize: font.size.sm, color: colors.mutedForeground, marginBottom: spacing.sm },
  fattoRiga: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  fatto: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.primary },

  scorciatoie: { gap: spacing.xs },
});
