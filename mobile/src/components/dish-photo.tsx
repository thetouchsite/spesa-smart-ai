/**
 * La foto di un piatto, o un segnaposto che non può rompersi.
 *
 * PERCHÉ ESISTE
 * -------------
 * I servizi di foto gratuiti cadono senza preavviso: Unsplash Source è stato
 * dismesso, LoremFlickr oggi risponde 500 su sette richieste su otto, Foodish
 * è sospeso. Ogni volta il risultato era lo stesso — un riquadro grigio rotto
 * in cima a ogni ricetta e accanto a ogni piatto del menù.
 *
 * Qui la regola è una: **o c'è una foto vera, o si disegna qualcosa di
 * intenzionale.** Mai un indirizzo sperando che risponda.
 *
 * Il segnaposto non è un vuoto: prende un colore stabile dal nome del piatto,
 * così lo stesso piatto ha sempre lo stesso aspetto e il menù della settimana
 * risulta variato invece che monotono.
 */

import { useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import type { ImageStyle } from "expo-image";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Body } from "./ui";
import { colors, font, radius } from "../theme";

/**
 * Sei fondi caldi, dal grano al pomodoro.
 *
 * Scelti perché convivono con il verde dell'app senza contendergli
 * l'attenzione: un segnaposto deve farsi guardare meno di una foto vera.
 */
const FONDI = ["#E8E2D4", "#E4E7DB", "#EDE3D8", "#DFE6E3", "#EAE4DE", "#E2E8E1"];
const INCHIOSTRI = ["#7A6A4F", "#5F6B52", "#84654B", "#4F6660", "#6E5F52", "#546654"];

/** Numero stabile dal nome: lo stesso piatto ha sempre lo stesso colore. */
function impronta(testo: string): number {
  let h = 0;
  for (let i = 0; i < testo.length; i++) h = (h * 31 + testo.charCodeAt(i)) >>> 0;
  return h;
}

export function DishPhoto({
  uri,
  nome,
  style,
  compatto = false,
  credito,
}: {
  /** Foto vera, quando il backend è riuscito a trovarla. Vuoto = segnaposto. */
  uri?: string;
  nome: string;
  /** Le misure del riquadro: le stesse per la foto e per il segnaposto. */
  style?: StyleProp<ViewStyle>;
  /** Nelle miniature del menù serve solo l'icona, senza iniziale. */
  compatto?: boolean;
  /**
   * Autore e licenza della foto.
   *
   * NON È DECORAZIONE: le foto arrivano da Wikimedia Commons, e le licenze
   * Creative Commons chiedono di citare l'autore. Senza questa riga staremmo
   * usando il lavoro di qualcuno violando la sola condizione che ci ha posto.
   * Nelle miniature si omette — non ci starebbe — e infatti lì la foto non si
   * mostra affatto.
   */
  credito?: string;
}) {
  // Una foto può anche esistere e non caricarsi: in quel caso si ricade sul
  // segnaposto invece di lasciare il riquadro vuoto.
  const [caduta, setCaduta] = useState(false);
  const mostraFoto = Boolean(uri) && !caduta;

  if (mostraFoto) {
    const foto = (
      <Image
        source={{ uri }}
        // Le due forme di stile non coincidono nei tipi, ma le proprieta' che
        // passiamo — misure e angoli — valgono per entrambe.
        style={style as StyleProp<ImageStyle>}
        contentFit="cover"
        transition={200}
        onError={() => setCaduta(true)}
        accessibilityLabel={`Foto di ${nome}`}
      />
    );

    if (!credito || compatto) return foto;
    return (
      <View>
        {foto}
        <Body style={styles.credito} numberOfLines={1}>
          {credito}
        </Body>
      </View>
    );
  }

  const i = impronta(nome) % FONDI.length;
  const iniziale = nome.trim().charAt(0).toUpperCase() || "•";

  return (
    <View
      style={[style, styles.segnaposto, { backgroundColor: FONDI[i] }]}
      accessibilityLabel={nome}
    >
      <Ionicons name="restaurant-outline" size={compatto ? 18 : 30} color={INCHIOSTRI[i]} />
      {compatto ? null : (
        <Body style={[styles.iniziale, { color: INCHIOSTRI[i] }]}>{iniziale}</Body>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  segnaposto: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: radius.sm,
  },
  credito: {
    fontSize: 10,
    color: colors.mutedForeground,
    marginTop: 4,
    textAlign: "right",
  },
  iniziale: {
    fontSize: font.size.lg,
    fontWeight: font.weight.semibold,
    letterSpacing: 1,
  },
});
