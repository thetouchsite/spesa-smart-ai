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
 * ed e' la piu' importante di tutto il disegno: «68 EUR» dice quanto esce dal
 * portafoglio, «22 EUR» dice cosa ci resta dentro. La spesa non sparisce,
 * scende nella striscia insieme a prodotti e giorni.
 *
 * Quando il risparmio non si puo' calcolare — prezzi di una sola insegna, o
 * nessun prezzo vero — non si scrive zero e non si inventa: va grande la
 * spesa, e il titolo cambia di conseguenza.
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
  prodotti,
  giorni,
  onPress,
}: {
  spesa: number;
  valuta: string;
  /** Rispetto all'insegna piu' cara. `null` quando non si e' potuto calcolare. */
  risparmio?: number | null;
  prodotti: number;
  giorni: number;
  onPress: () => void;
}) {
  const siRisparmia = typeof risparmio === "number" && risparmio > 0;
  const cifra = Math.round(siRisparmia ? risparmio : spesa);

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
        siRisparmia
          ? `Il tuo piano: risparmi ${cifra} ${valuta} sulla settimana, spesa ${Math.round(spesa)} ${valuta}. Apri il piano`
          : `Il tuo piano: spesa ${cifra} ${valuta} sulla settimana. Apri il piano`
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
        {siRisparmia ? "Ecco quanto stai risparmiando." : "La tua settimana è pronta."}
      </Body>

      <View style={stili.cifra}>
        <Body style={stili.valuta}>{valuta}</Body>
        <Body style={stili.numero}>{cifra}</Body>
        <Body style={stili.periodo}>{siRisparmia ? "in meno" : "a settimana"}</Body>
      </View>
      {siRisparmia ? (
        <Body style={stili.nota}>rispetto all'insegna più cara della tua città</Body>
      ) : null}

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
    borderRadius: 32,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    overflow: "hidden",
    shadowColor: "#1D2A37",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 28,
    elevation: 4,
  },
  premuta: { opacity: 0.85 },

  /* React Native non ha la sfocatura senza una libreria nativa: sono cerchi
     enormi a opacita' bassa, che da lontano fanno lo stesso effetto. */
  macchia: { position: "absolute", borderRadius: 999 },
  macchiaAlta: {
    width: 200,
    height: 200,
    right: -70,
    top: -80,
    backgroundColor: colors.accent,
    opacity: 0.1,
  },
  macchiaBassa: {
    width: 180,
    height: 180,
    left: -60,
    bottom: -70,
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
    fontSize: 21,
    fontWeight: font.weight.bold,
    lineHeight: 27,
    color: colors.foreground,
    marginTop: spacing.sm,
  },

  cifra: { flexDirection: "row", alignItems: "flex-end", marginTop: spacing.md, gap: 4 },
  valuta: {
    fontFamily: SERIF,
    fontSize: 24,
    fontWeight: font.weight.bold,
    color: colors.accent,
    marginBottom: 8,
  },
  numero: {
    fontFamily: SERIF,
    fontSize: 54,
    lineHeight: 60,
    fontWeight: font.weight.bold,
    letterSpacing: -2,
    color: colors.accent,
  },
  periodo: {
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    color: colors.mutedForeground,
    marginBottom: 10,
    marginLeft: 2,
  },
  nota: { fontSize: font.size.xs, color: colors.mutedForeground, marginTop: 2 },

  striscia: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
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
});
