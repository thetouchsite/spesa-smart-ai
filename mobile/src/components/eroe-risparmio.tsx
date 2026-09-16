/**
 * Il momento del risparmio: la prima cosa che si vede del piano.
 *
 * PERCHE' COSI'
 * -------------
 * E' il disegno del prototipo del cliente, portato in React Native. La nostra
 * versione mostrava gli stessi numeri ma li impaginava come un cruscotto —
 * «Spesa prevista» in cima, il risparmio come nota a margine — e raccontava
 * la cosa sbagliata: quanto si spende, invece di quanto si risparmia.
 *
 * Qui il protagonista e' una cifra sola, grande e arancione, e tutto il resto
 * le sta attorno. E' la differenza fra una schermata che informa e una che
 * fa venire voglia di continuare.
 *
 * LE SCELTE CHE SEMBRANO DECORATIVE E NON LO SONO
 * -----------------------------------------------
 * Il serif sulle cifre non e' un vezzo: separa i numeri — che sono il
 * contenuto — dal resto dell'interfaccia, che e' senza grazie. Sul web il
 * prototipo usa un font caricato; qui si usa quello di sistema, perche'
 * aggiungere un font al pacchetto costa mezzo megabyte e su un numero grande
 * la differenza non si vede.
 *
 * Le due macchie di colore dietro sono lo stesso trucco del prototipo, che li'
 * e' un `blur-3xl`. React Native non ha la sfocatura senza una libreria
 * nativa, quindi sono cerchi molto grandi a opacita' bassa: da lontano fanno
 * lo stesso effetto e non aggiungono dipendenze.
 *
 * QUANDO IL RISPARMIO NON SI PUO' CALCOLARE
 * -----------------------------------------
 * Non si inventa e non si scrive zero: si dice che manca e perche'. E' la
 * stessa regola di tutto il resto dell'app — un numero che non abbiamo non
 * diventa un numero brutto, diventa una frase onesta.
 */

import { Platform, StyleSheet, View } from "react-native";
import { Body, Ionicons } from "./ui";
import { colors, font, radius, spacing } from "../theme";

/** Il serif di sistema: Georgia su iOS, il serif di Android altrove. */
const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia" });

export interface EroeRisparmio {
  /** Quanto si risparmia nel periodo. Negativo non arriva qui: vedi `sfora`. */
  risparmio: number;
  /** Proiezione su un anno. */
  annuale: number;
  /** Simbolo della valuta, gia' scelto da chi chiama. */
  valuta: string;
  /** `true` quando si sta sopra il budget: cambia il titolo, non il disegno. */
  sfora: boolean;
  /** Settimanale o mensile. */
  periodo: string;
  /** Com'e' messo il budget, in una parola. */
  statoBudget: string;
  /** Il tono dello stato: decide il colore del pallino. */
  tono: "success" | "warning" | "danger";
  punteggio: number;
  /** Quando i prezzi non bastano per calcolare il risparmio. */
  senzaRisparmio?: string;
  /**
   * Quante voci restano fuori dal conto, quando il totale c'e' ma non e' pieno.
   *
   * Si dice sotto la cifra invece di nascondere la cifra: un totale su tredici
   * voci di sedici e' molto piu' utile di un trattino, purche' sia dichiarato
   * per quello che e'.
   */
  parziale?: string;
  /** Traduttore: la schermata sa in che lingua sta, questo componente no. */
  ui: (t: string) => string;
}

export function EroeRisparmio({
  risparmio,
  annuale,
  valuta,
  sfora,
  periodo,
  statoBudget,
  tono,
  punteggio,
  senzaRisparmio,
  parziale,
  ui,
}: EroeRisparmio) {
  const colorePallino =
    tono === "success" ? colors.primary : tono === "danger" ? colors.accent : colors.accent;

  return (
    <View style={stili.carta}>
      {/* Le macchie: decorazione, quindi invisibili a chi legge lo schermo. */}
      <View pointerEvents="none" style={[stili.macchia, stili.macchiaAlta]} />
      <View pointerEvents="none" style={[stili.macchia, stili.macchiaBassa]} />

      <View style={stili.occhiello}>
        <Ionicons name="sparkles" size={13} color={colors.accent} />
        <Body style={stili.occhielloTesto}>{ui("LA TUA SETTIMANA")}</Body>
      </View>

      <Body style={stili.titolo}>
        {senzaRisparmio
          ? ui("Il risparmio non è calcolabile")
          : sfora
            ? ui("Qualche ritocco e ci siamo.")
            : ui("Ecco come MealMint ti ha fatto risparmiare.")}
      </Body>

      {senzaRisparmio ? (
        <View style={stili.avviso}>
          <Body style={stili.avvisoTesto}>{senzaRisparmio}</Body>
        </View>
      ) : (
        <>
          <View style={stili.cifra}>
            <Body style={stili.valuta}>{valuta}</Body>
            <Body style={stili.numero}>{Math.round(Math.abs(risparmio))}</Body>
            <Body style={stili.periodo}>{periodo}</Body>
          </View>
          {parziale ? <Body style={stili.parziale}>{parziale}</Body> : null}
        </>
      )}

      <View style={stili.striscia}>
        <View style={stili.colonna}>
          <View style={stili.etichettaRiga}>
            <Ionicons name="calendar-outline" size={11} color={colors.mutedForeground} />
            <Body style={stili.etichetta}>{ui("ALL'ANNO")}</Body>
          </View>
          <Body style={[stili.valore, stili.valoreAccento]}>
            {senzaRisparmio ? "—" : `${valuta}${Math.round(annuale)}`}
          </Body>
        </View>

        <View style={stili.colonna}>
          <View style={stili.etichettaRiga}>
            <Ionicons name="wallet-outline" size={11} color={colors.mutedForeground} />
            <Body style={stili.etichetta}>{ui("BUDGET")}</Body>
          </View>
          <View style={stili.etichettaRiga}>
            <View style={[stili.pallino, { backgroundColor: colorePallino }]} />
            <Body style={stili.valoreStato}>{statoBudget}</Body>
          </View>
        </View>

        <View style={stili.colonna}>
          <View style={stili.etichettaRiga}>
            <Ionicons name="trophy-outline" size={11} color={colors.accent} />
            <Body style={stili.etichetta}>{ui("PUNTEGGIO")}</Body>
          </View>
          <Body style={stili.valore}>
            {senzaRisparmio ? "—" : punteggio}
            {senzaRisparmio ? null : <Body style={stili.su100}>/100</Body>}
          </Body>
        </View>
      </View>
    </View>
  );
}

/**
 * Le righe del budget: etichetta a sinistra, cifra a destra.
 *
 * Una riga per voce e un filo di separazione prima del risparmio, che e' la
 * cifra che conta e va staccata dalle altre due.
 */
export function RigaBudget({
  etichetta,
  valore,
  tipo = "normale",
}: {
  etichetta: string;
  valore: string;
  tipo?: "normale" | "risparmio" | "sfora";
}) {
  return (
    <View style={stili.rigaBudget}>
      <Body style={stili.rigaEtichetta}>{etichetta}</Body>
      <Body
        style={[
          stili.rigaValore,
          tipo === "risparmio" && stili.rigaRisparmio,
          tipo === "sfora" && stili.rigaSfora,
        ]}
      >
        {valore}
      </Body>
    </View>
  );
}

const stili = StyleSheet.create({
  carta: {
    backgroundColor: colors.card,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    overflow: "hidden",
    // Un'ombra larga e bassa: la scheda galleggia invece di essere incollata.
    shadowColor: "#1D2A37",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 28,
    elevation: 4,
  },
  macchia: { position: "absolute", borderRadius: 999 },
  macchiaAlta: {
    width: 230,
    height: 230,
    right: -70,
    top: -90,
    backgroundColor: colors.accent,
    opacity: 0.1,
  },
  macchiaBassa: {
    width: 210,
    height: 210,
    left: -60,
    bottom: -80,
    backgroundColor: colors.primary,
    opacity: 0.06,
  },

  occhiello: { flexDirection: "row", alignItems: "center", gap: 6 },
  occhielloTesto: {
    fontSize: 11,
    fontWeight: font.weight.semibold,
    letterSpacing: 1.4,
    color: colors.mutedForeground,
  },

  titolo: {
    fontFamily: SERIF,
    fontSize: 25,
    fontWeight: font.weight.bold,
    lineHeight: 31,
    color: colors.foreground,
    marginTop: spacing.md,
  },

  cifra: { flexDirection: "row", alignItems: "flex-end", marginTop: spacing.lg, gap: 4 },
  valuta: {
    fontFamily: SERIF,
    fontSize: 30,
    fontWeight: font.weight.bold,
    color: colors.accent,
    marginBottom: 10,
  },
  numero: {
    fontFamily: SERIF,
    fontSize: 68,
    lineHeight: 74,
    fontWeight: font.weight.bold,
    letterSpacing: -2,
    color: colors.accent,
  },
  periodo: {
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    color: colors.mutedForeground,
    marginBottom: 12,
    marginLeft: 2,
  },

  parziale: {
    fontSize: font.size.xs,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  avviso: {
    marginTop: spacing.lg,
    backgroundColor: colors.warningBg,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  avvisoTesto: { fontSize: font.size.sm, color: colors.foreground },

  striscia: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl },
  colonna: { flex: 1 },
  etichettaRiga: { flexDirection: "row", alignItems: "center", gap: 4 },
  etichetta: {
    fontSize: 10,
    fontWeight: font.weight.semibold,
    letterSpacing: 0.6,
    color: colors.mutedForeground,
  },
  valore: {
    fontFamily: SERIF,
    fontSize: 18,
    fontWeight: font.weight.bold,
    color: colors.foreground,
    marginTop: 3,
  },
  valoreAccento: { color: colors.accent },
  valoreStato: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.foreground },
  su100: { fontSize: font.size.xs, fontWeight: font.weight.regular, color: colors.mutedForeground },
  pallino: { width: 8, height: 8, borderRadius: 4, marginTop: 3 },

  rigaBudget: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: 5,
  },
  rigaEtichetta: { fontSize: font.size.sm, color: colors.mutedForeground, flexShrink: 1 },
  rigaValore: {
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    color: colors.foreground,
  },
  rigaRisparmio: { color: colors.primary },
  rigaSfora: { color: colors.accent },
});
