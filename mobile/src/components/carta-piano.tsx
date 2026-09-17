/**
 * Il piano, in home, con lo stesso vestito che ha nei risultati.
 *
 * PERCHE' NON UNA CARTA VERDE QUALSIASI
 * -------------------------------------
 * Prima era un rettangolo col gradiente verde e la spesa scritta dentro:
 * corretto e dimenticabile. Il problema non era la bellezza, era che non
 * somigliava a niente. Chi la toccava finiva sulla schermata del piano, dove
 * lo stesso contenuto ha un'altra faccia — cifra arancione grande, macchie di
 * colore, la striscia dei tre numeri — e quel salto fa sembrare di essere
 * finiti altrove invece che dentro la cosa che si e' toccata.
 *
 * Adesso e' la versione piccola di `EroeRisparmio`. Stesso occhiello, stesso
 * serif, stesso arancione, stesse macchie sfocate: la carta in home e la
 * schermata in fondo al tocco si riconoscono come lo stesso oggetto, visto
 * prima da lontano e poi da vicino.
 *
 * QUALE NUMERO VA GRANDE
 * ----------------------
 * Il risparmio, non la spesa — quando c'e'. E' la stessa scelta dei risultati
 * ed e' la piu' importante di tutto il disegno: «68 €» dice quanto esce dal
 * portafoglio, «82 €» dice cosa ci resta dentro. La spesa non sparisce, scende
 * nella striscia insieme a prodotti e giorni.
 *
 * E I NUMERI NON SE LI CALCOLA LEI
 * --------------------------------
 * Glieli passa `CruscottoOggi`, che li prende da `computeResults` — lo stesso
 * posto da cui li prende la schermata del piano. Per un giorno non e' stato
 * cosi': la carta faceva il suo conto (risparmio rispetto all'insegna piu'
 * cara) e la schermata il suo (budget meno spesa), e si leggevano due numeri
 * diversi per lo stesso piano a un tocco di distanza. Due conti giusti che
 * rispondono a due domande diverse sono peggio di un conto sbagliato: nessuno
 * dei due sembra un errore, e non si capisce a quale credere.
 *
 * Quando il risparmio non c'e' — budget non impostato, o nessun prezzo — non
 * si scrive zero: va grande la spesa e il titolo cambia. Quando invece si e'
 * sopra il budget va grande di quanto, con il titolo dei risultati.
 */

import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Body, Ionicons } from "./ui";
import { colors, font, spacing } from "../theme";

/** Il serif di sistema, come nell'eroe dei risultati. */
const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia" });

export function CartaPiano({
  spesa,
  valuta,
  risparmio,
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
  /** Si sta spendendo piu' del budget. Cambia il titolo, non il disegno. */
  sfora?: boolean;
  /** «a settimana» o «al mese», secondo la frequenza scelta. */
  periodo?: string;
  prodotti: number;
  giorni: number;
  onPress: () => void;
}) {
  const quanto = typeof risparmio === "number" ? risparmio : 0;
  const siRisparmia = !sfora && quanto > 0;
  const mostraRisparmio = sfora ? quanto > 0 : siRisparmia;
  const cifra = Math.round(mostraRisparmio ? quanto : spesa);

  /* La striscia non ripete mai la cifra grande: se sopra c'e' il risparmio,
     sotto c'e' la spesa; se sopra c'e' gia' la spesa, restano in due. */
  const colonne: {
    icona: React.ComponentProps<typeof Ionicons>["name"];
    testa: string;
    valore: string;
  }[] = [
    ...(siRisparmia
      ? [
          {
            icona: "wallet-outline" as const,
            testa: "SPESA",
            valore: `${valuta}${Math.round(spesa)}`,
          },
        ]
      : []),
    { icona: "basket-outline", testa: "PRODOTTI", valore: String(prodotti) },
    { icona: "calendar-outline", testa: "GIORNI", valore: String(giorni) },
  ];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        sfora
          ? `Il tuo piano: ${cifra} ${valuta} sopra il budget. Apri il piano`
          : siRisparmia
            ? `Il tuo piano: risparmi ${cifra} ${valuta}, spesa ${Math.round(spesa)} ${valuta}. Apri il piano`
            : `Il tuo piano: spesa ${cifra} ${valuta}. Apri il piano`
      }
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
        <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
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
      {siRisparmia ? <Body style={stili.nota}>rispetto al budget che hai messo</Body> : null}

      <View style={stili.striscia}>
        {colonne.map((c) => (
          <View key={c.testa} style={stili.colonna}>
            <View style={stili.etichettaRiga}>
              <Ionicons name={c.icona} size={11} color={colors.mutedForeground} />
              <Body style={stili.etichetta}>{c.testa}</Body>
            </View>
            <Body style={stili.valore}>{c.valore}</Body>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const stili = StyleSheet.create({
  carta: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    overflow: "hidden",
    shadowColor: "#1D2A37",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  premuta: { opacity: 0.85 },

  /* React Native non ha la sfocatura senza una libreria nativa: sono cerchi
     enormi a opacita' bassa, che da lontano fanno lo stesso effetto. */
  macchia: { position: "absolute", borderRadius: 999 },
  macchiaAlta: {
    width: 150,
    height: 150,
    right: -54,
    top: -60,
    backgroundColor: colors.accent,
    opacity: 0.1,
  },
  macchiaBassa: {
    width: 130,
    height: 130,
    left: -46,
    bottom: -52,
    backgroundColor: colors.primary,
    opacity: 0.06,
  },

  testa: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  occhiello: { flexDirection: "row", alignItems: "center", gap: 6 },
  occhielloTesto: {
    fontSize: 11,
    fontWeight: font.weight.semibold,
    letterSpacing: 1.4,
    color: colors.mutedForeground,
  },

  titolo: {
    fontFamily: SERIF,
    fontSize: 17,
    fontWeight: font.weight.bold,
    lineHeight: 22,
    color: colors.foreground,
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
    color: colors.mutedForeground,
    marginBottom: 6,
    marginLeft: 2,
  },
  nota: { fontSize: font.size.xs, color: colors.mutedForeground, marginTop: 2 },

  striscia: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
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
    fontSize: 16,
    fontWeight: font.weight.bold,
    color: colors.foreground,
    marginTop: 3,
  },
});
