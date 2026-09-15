/**
 * L'apertura della home, come nel prototipo del cliente.
 *
 * PERCHE' RIFARLA
 * ---------------
 * La nostra era corretta e piatta: una pastiglia, un titolo, un paragrafo. Il
 * prototipo del cliente aveva un carattere suo — un serif con il corsivo a
 * colorare la parola che conta, la sfumatura calda, il salvadanaio dentro una
 * tessera con due pastiglie che gli girano attorno — e quella differenza si
 * vede nel primo secondo, che e' l'unico che conta quando qualcuno apre l'app
 * per la prima volta.
 *
 * IL SERIF SENZA INSTALLARE NIENTE
 * --------------------------------
 * Il titolo vuole un carattere con le grazie, e l'app non ne ha nessuno
 * caricato. Aggiungerne uno vero significa `expo-font`, un file da mezzo mega
 * e una ricostruzione: si fa, ma non per una schermata.
 *
 * Qui si usa quello che il sistema ha gia' — Georgia su iOS, il serif di
 * sistema su Android — che su entrambi e' un carattere con le grazie
 * decoroso. Il giorno che si sceglie il font del marchio si cambia una riga.
 *
 * LE DUE PASTIGLIE CHE GALLEGGIANO
 * --------------------------------
 * Sono l'unico vezzo, e servono: rompono il quadrato della tessera e danno
 * profondita' a un'immagine che altrimenti sarebbe un francobollo. Una verde
 * e una arancione, cioe' i due colori del marchio messi vicini.
 */

import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors, font, radius, shadow, spacing } from "../theme";

/** Il carattere con le grazie che il sistema ha gia'. Vedi la nota in cima. */
export const SERIF = Platform.select({ ios: "Georgia", default: "serif" });

const SIMBOLO = require("../../assets/adaptive-icon.png");

export function HeroHome({
  titolo,
  titoloCorsivo,
  sottotitolo,
  azioni,
}: {
  titolo: string;
  /** La parte che va in corsivo e in verde: e' la promessa, non il contorno. */
  titoloCorsivo: string;
  sottotitolo: string;
  azioni: React.ReactNode;
}) {
  return (
    <LinearGradient
      colors={["#FFFFFF", "#FDF6EC", "#EAF3ED"]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={stili.carta}
    >
      <View style={stili.tesseraBox}>
        <View style={stili.tessera}>
          <Image source={SIMBOLO} style={stili.simbolo} resizeMode="contain" />
        </View>
        {/* Le due pastiglie: verde in basso a sinistra, arancione in alto a
            destra, cioe' agli angoli opposti — insieme suggeriscono un
            movimento attorno alla tessera. */}
        <View style={[stili.pastiglia, stili.pastigliaVerde]}>
          <Ionicons name="leaf" size={13} color="#FFFFFF" />
        </View>
        <View style={[stili.pastiglia, stili.pastigliaArancio]}>
          <Ionicons name="sparkles" size={13} color="#FFFFFF" />
        </View>
      </View>

      <Text style={stili.titolo}>
        {titolo}{" "}
        <Text style={stili.titoloCorsivo}>{titoloCorsivo}</Text>
      </Text>

      <Text style={stili.sottotitolo}>{sottotitolo}</Text>

      <View style={stili.azioni}>{azioni}</View>
    </LinearGradient>
  );
}

/**
 * Il pulsante principale, arancione come nel prototipo.
 *
 * E' l'unico elemento arancione della schermata, ed e' voluto: se fosse verde
 * come tutto il resto non si distinguerebbe da un titolo. Il colore qui non
 * decora, dice «si comincia da qui».
 */
export function BottoneCaldo({
  etichetta,
  onPress,
}: {
  etichetta: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && stili.premuto]}>
      <LinearGradient
        colors={[colors.accent, "#E87A00"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={stili.caldo}
      >
        <Ionicons name="sparkles" size={17} color="#FFFFFF" />
        <Text style={stili.caldoTesto}>{etichetta}</Text>
        <Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
      </LinearGradient>
    </Pressable>
  );
}

/** Le quattro promesse in griglia, come le pastiglie del prototipo. */
export function GrigliaPromesse({
  voci,
}: {
  voci: Array<{ icona: React.ComponentProps<typeof Ionicons>["name"]; testo: string }>;
}) {
  return (
    <View style={stili.griglia}>
      {voci.map((v) => (
        <View key={v.testo} style={stili.promessa}>
          <Ionicons name={v.icona} size={16} color={colors.primary} />
          <Text style={stili.promessaTesto} numberOfLines={1}>
            {v.testo}
          </Text>
        </View>
      ))}
    </View>
  );
}

const TESSERA = 86;

const stili = StyleSheet.create({
  carta: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.lg,
    ...shadow.card,
  },

  tesseraBox: { width: TESSERA + 26, height: TESSERA + 26, alignItems: "center", justifyContent: "center" },
  tessera: {
    width: TESSERA,
    height: TESSERA,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.raised,
  },
  simbolo: { width: TESSERA - 26, height: TESSERA - 26 },
  pastiglia: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
  },
  pastigliaVerde: { backgroundColor: colors.primaryGlow, left: 0, bottom: 12 },
  pastigliaArancio: { backgroundColor: colors.accent, right: 0, top: 10 },

  titolo: {
    fontFamily: SERIF,
    fontSize: 30,
    lineHeight: 37,
    fontWeight: font.weight.bold,
    color: colors.foreground,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  titoloCorsivo: {
    fontFamily: SERIF,
    fontStyle: "italic",
    color: colors.primary,
  },
  sottotitolo: {
    fontSize: font.size.md,
    lineHeight: 23,
    color: colors.mutedForeground,
    textAlign: "center",
    maxWidth: 320,
  },

  azioni: { alignSelf: "stretch", gap: spacing.md, marginTop: spacing.xs },
  caldo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: 15,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    ...shadow.raised,
  },
  caldoTesto: {
    color: "#FFFFFF",
    fontSize: font.size.md,
    fontWeight: font.weight.semibold,
  },
  premuto: { opacity: 0.88, transform: [{ scale: 0.99 }] },

  griglia: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  promessa: {
    // Due per riga: `48%` invece di `50%` lascia posto allo spazio fra loro.
    flexBasis: "48%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 11,
    paddingHorizontal: spacing.lg,
  },
  promessaTesto: {
    flexShrink: 1,
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
    color: colors.foreground,
  },
});
