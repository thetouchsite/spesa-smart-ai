/**
 * Il piano, in home: quanto partivi, quanto spendi, quanto resta in tasca.
 *
 * PERCHE' E' SCURA MENTRE TUTTO IL RESTO E' CHIARO
 * ------------------------------------------------
 * Non per fare la bella: perche' e' l'unica cosa in quella schermata che non
 * e' un elenco. Sotto ci sono i pasti di oggi e la spesa che manca — due
 * schede bianche con dentro delle righe — e una terza scheda bianca in cima si
 * leggeva come la prima riga di quell'elenco. Sul fondo scuro il numero
 * arancione e' la prima cosa che si vede entrando, che e' esattamente il suo
 * mestiere. Ed e' lo stesso verde quasi nero della barra in basso: il nero,
 * accanto al verde del marchio, vira al freddo e sembra di un'altra app.
 *
 * IL CONTO SI LEGGE COME UNO SCONTRINO
 * ------------------------------------
 * «Risparmi 82 €» da solo non si verifica: 82 rispetto a cosa? La striscia
 * dice da dove si parte — il budget che l'utente ha scritto lui — quanto si
 * spende davvero, e di quanto e' la differenza in percentuale. Tre numeri che
 * si controllano a vicenda: chi legge puo' fare la sottrazione a mente e
 * trovarla giusta. Il prezzo di partenza e' barrato perche' e' il modo in cui
 * si scrive un prezzo superato, ed e' gia' come la lista della spesa mostra
 * gli sconti dei supermercati.
 *
 * QUANDO IL BUDGET NON C'E'
 * -------------------------
 * Non si inventa un prezzo di partenza per avere uno sconto da mostrare:
 * senza budget non c'e' risparmio da dichiarare, va grande la spesa e la
 * striscia torna a dire prodotti e giorni. Un numero che non abbiamo non
 * diventa un numero brutto, diventa una frase onesta — e' la regola di tutta
 * l'app.
 *
 * E I NUMERI NON SE LI CALCOLA LEI
 * --------------------------------
 * Glieli passa `CruscottoOggi`, che li prende da `computeResults` — lo stesso
 * posto da cui li prende la schermata del piano. Per un giorno non e' stato
 * cosi': la carta faceva il suo conto e la schermata il suo, e si leggevano
 * due numeri diversi per lo stesso piano a un tocco di distanza. Due conti
 * giusti che rispondono a due domande diverse sono peggio di un conto
 * sbagliato: nessuno dei due sembra un errore, e non si capisce a chi credere.
 */

import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Body, Ionicons } from "./ui";
import { colors, font, spacing } from "../theme";

/** Il serif di sistema, come nell'eroe dei risultati. */
const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia" });

/** Lo stesso verde quasi nero della barra in basso. */
const FONDO = "#12241B";
const CHIARO = "#F4F7F3";
const SPENTO = "rgba(244, 247, 243, 0.62)";
const FILO = "rgba(244, 247, 243, 0.12)";

interface Colonna {
  testa: string;
  valore: string;
  icona: React.ComponentProps<typeof Ionicons>["name"];
  barrato?: boolean;
  acceso?: boolean;
}

export function CartaPiano({
  spesa,
  valuta,
  risparmio,
  budget = 0,
  sfora = false,
  periodo = "a settimana",
  prodotti,
  giorni,
  onPress,
}: {
  spesa: number;
  valuta: string;
  /**
   * Budget meno spesa. Quando `sfora` e' vero e' invece di quanto si e' sopra:
   * e' lo stesso valore che la schermata del piano mette in grande, ed e' lei
   * a sceglierlo — qui si disegna soltanto.
   */
  risparmio?: number | null;
  /** Il budget scritto dall'utente: il prezzo da cui si parte. 0 = non l'ha messo. */
  budget?: number;
  /** Si sta spendendo piu' del budget. Cambia le parole, non il disegno. */
  sfora?: boolean;
  /** «a settimana» o «al mese», secondo la frequenza scelta. */
  periodo?: string;
  prodotti: number;
  giorni: number;
  onPress: () => void;
}) {
  const quanto = typeof risparmio === "number" ? risparmio : 0;
  const siRisparmia = !sfora && quanto > 0;
  const grande = sfora ? quanto > 0 : siRisparmia;
  const cifra = Math.round(grande ? quanto : spesa);

  /* Lo scontrino si mostra solo se il budget c'e': senza, il prezzo di
     partenza sarebbe inventato, e lo sconto con lui. */
  const scontrino = budget > 0 && grande;
  const percentuale = budget > 0 ? Math.round((quanto / budget) * 100) : 0;

  const colonne: Colonna[] = scontrino
    ? [
        {
          testa: "PARTIVI DA",
          valore: valuta + String(Math.round(budget)),
          icona: "wallet-outline",
          barrato: true,
        },
        {
          testa: "SPESA",
          valore: valuta + String(Math.round(spesa)),
          icona: "cart-outline",
        },
        {
          testa: sfora ? "SOPRA DI" : "SCONTO",
          valore: (sfora ? "+" : "−") + String(percentuale) + "%",
          icona: sfora ? "alert-circle-outline" : "pricetag-outline",
          acceso: true,
        },
      ]
    : [
        { testa: "PRODOTTI", valore: String(prodotti), icona: "basket-outline" },
        { testa: "GIORNI", valore: String(giorni), icona: "calendar-outline" },
      ];

  const descrizione = sfora
    ? "Il tuo piano: " + cifra + " " + valuta + " sopra il budget. Apri il piano"
    : siRisparmia
      ? "Il tuo piano: partivi da " +
        Math.round(budget) +
        " " +
        valuta +
        ", spendi " +
        Math.round(spesa) +
        ", risparmi " +
        cifra +
        ". Apri il piano"
      : "Il tuo piano: spesa " + cifra + " " + valuta + ". Apri il piano";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={descrizione}
      onPress={onPress}
      style={({ pressed }) => [stili.carta, pressed && stili.premuta]}
    >
      {/* Decorazione: invisibile a chi legge lo schermo, e non intercetta i
          tocchi — altrimenti mezza carta non si potrebbe premere. */}
      <View pointerEvents="none" style={[stili.macchia, stili.macchiaAlta]} />
      <View pointerEvents="none" style={[stili.macchia, stili.macchiaBassa]} />

      <View style={stili.testa}>
        <View style={stili.occhiello}>
          <Ionicons name="sparkles" size={13} color={colors.accent} />
          <Body style={stili.occhielloTesto}>IL TUO PIANO</Body>
        </View>
        <Ionicons name="chevron-forward" size={18} color={SPENTO} />
      </View>

      <Body style={stili.titolo}>
        {sfora
          ? "Qualche ritocco e ci siamo."
          : siRisparmia
            ? "Ecco quanto stai risparmiando."
            : "La tua settimana è pronta."}
      </Body>

      <View style={stili.cifra}>
        <Body style={stili.valuta}>{valuta}</Body>
        <Body style={stili.numero}>{cifra}</Body>
        <Body style={stili.periodo}>{sfora ? "oltre il budget" : periodo}</Body>
      </View>

      <View style={stili.striscia}>
        {colonne.map((c) => (
          <View key={c.testa} style={stili.colonna}>
            <View style={stili.etichettaRiga}>
              <Ionicons name={c.icona} size={11} color={SPENTO} />
              <Body style={stili.etichetta}>{c.testa}</Body>
            </View>
            <Body
              style={[
                stili.valore,
                c.barrato && stili.valoreBarrato,
                c.acceso && stili.valoreAcceso,
              ]}
            >
              {c.valore}
            </Body>
          </View>
        ))}
      </View>

      {/* PRODOTTI E GIORNI CON LA LORO ICONA.
          Erano una riga di testo minuto sotto il conto, e a quella dimensione
          una riga di testo si salta. Con l'icona davanti diventano due cose da
          guardare invece che da leggere, e il numero si prende in un colpo
          d'occhio — che e' tutto quello che serve sapere di loro. */}
      {scontrino ? (
        <View style={stili.coda}>
          <View style={stili.codaVoce}>
            <Ionicons name="basket-outline" size={13} color={SPENTO} />
            <Body style={stili.codaTesto}>{prodotti} prodotti</Body>
          </View>
          <View style={stili.codaVoce}>
            <Ionicons name="calendar-outline" size={13} color={SPENTO} />
            <Body style={stili.codaTesto}>{giorni} giorni</Body>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const stili = StyleSheet.create({
  carta: {
    backgroundColor: FONDO,
    borderRadius: 24,
    padding: spacing.lg,
    overflow: "hidden",
    shadowColor: "#0A160F",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 22,
    elevation: 6,
  },
  premuta: { opacity: 0.88 },

  /* React Native non ha la sfocatura senza una libreria nativa: sono cerchi
     grandi a opacita' bassa, che da lontano fanno lo stesso effetto. */
  macchia: { position: "absolute", borderRadius: 999 },
  macchiaAlta: {
    width: 150,
    height: 150,
    right: -54,
    top: -60,
    backgroundColor: colors.accent,
    opacity: 0.16,
  },
  macchiaBassa: {
    width: 130,
    height: 130,
    left: -46,
    bottom: -52,
    backgroundColor: colors.primaryGlow,
    opacity: 0.22,
  },

  testa: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  occhiello: { flexDirection: "row", alignItems: "center", gap: 6 },
  occhielloTesto: {
    fontSize: 11,
    fontWeight: font.weight.semibold,
    letterSpacing: 1.4,
    color: SPENTO,
  },

  titolo: {
    fontFamily: SERIF,
    fontSize: 17,
    fontWeight: font.weight.bold,
    lineHeight: 22,
    color: CHIARO,
    marginTop: 6,
  },

  cifra: { flexDirection: "row", alignItems: "flex-end", marginTop: spacing.sm, gap: 3 },
  valuta: {
    fontFamily: SERIF,
    fontSize: 17,
    fontWeight: font.weight.bold,
    color: colors.accent,
    marginBottom: 6,
  },
  numero: {
    fontFamily: SERIF,
    fontSize: 38,
    lineHeight: 42,
    fontWeight: font.weight.bold,
    letterSpacing: -1.5,
    color: colors.accent,
  },
  periodo: {
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    color: SPENTO,
    marginBottom: 6,
    marginLeft: 2,
  },

  striscia: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    /* Un filo chiarissimo stacca il conto dalla cifra: sono due cose diverse,
       una e' l'annuncio e l'altra la prova. */
    borderTopWidth: 1,
    borderTopColor: FILO,
  },
  colonna: { flex: 1 },
  etichettaRiga: { flexDirection: "row", alignItems: "center", gap: 4 },
  etichetta: {
    fontSize: 10,
    fontWeight: font.weight.semibold,
    letterSpacing: 0.6,
    color: SPENTO,
  },
  valore: {
    fontFamily: SERIF,
    fontSize: 16,
    fontWeight: font.weight.bold,
    color: CHIARO,
    marginTop: 3,
  },
  /* Barrato, come i prezzi superati nella lista della spesa. */
  valoreBarrato: { color: SPENTO, textDecorationLine: "line-through" },
  valoreAcceso: { color: colors.accent },

  coda: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm },
  codaVoce: { flexDirection: "row", alignItems: "center", gap: 5 },
  codaTesto: { fontSize: font.size.xs, color: SPENTO },
});
