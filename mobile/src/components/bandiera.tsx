/**
 * Le bandiere, disegnate invece che scritte con le emoji.
 *
 * PERCHE' NON LE EMOJI
 * --------------------
 * Perche' su Windows non esistono. Le emoji-bandiera sono coppie di lettere
 * speciali che il sistema operativo deve sapere di dover disegnare come una
 * bandiera: iOS e Android lo fanno, Windows no — e mostra le due lettere.
 *
 * Nel selettore di lingua si vedeva «IT» al posto di 🇮🇹, e sembrava una scelta
 * nostra. Non lo era: era il carattere di sistema che si arrendeva. E siccome
 * la demo al cliente si mostra dal browser su un portatile Windows, e' proprio
 * li' che si rompeva.
 *
 * Disegnate come rettangoli non dipendono da nessun carattere: identiche su
 * iPhone, Android, Windows e nel browser.
 *
 * SUL DISEGNO
 * -----------
 * Sono bandiere a strisce, che coprono quasi tutta l'Europa. Il Regno Unito no
 * — quello ha una croce sopra una diagonale — e li' si fa un'approssimazione
 * riconoscibile: campo blu, croce bianca, croce rossa. A sedici pixel nessuno
 * distingue di meglio, e la cosa importante e' che si riconosca al volo.
 */

import { StyleSheet, View } from "react-native";

type Striscia = { colore: string; parte?: number };

/** Le bandiere che servono: una per ogni lingua dell'app. */
const BANDIERE: Record<string, { verso: "verticale" | "orizzontale"; strisce: Striscia[] }> = {
  it: { verso: "verticale", strisce: [{ colore: "#008C45" }, { colore: "#F4F5F0" }, { colore: "#CD212A" }] },
  fr: { verso: "verticale", strisce: [{ colore: "#002395" }, { colore: "#FFFFFF" }, { colore: "#ED2939" }] },
  de: { verso: "orizzontale", strisce: [{ colore: "#000000" }, { colore: "#DD0000" }, { colore: "#FFCE00" }] },
  // Spagna: la banda gialla e' alta il doppio delle rosse.
  es: { verso: "orizzontale", strisce: [{ colore: "#AA151B" }, { colore: "#F1BF00", parte: 2 }, { colore: "#AA151B" }] },
};

export function Bandiera({ lingua, dimensione = 18 }: { lingua: string; dimensione?: number }) {
  const larghezza = Math.round(dimensione * 1.4);
  const cornice = {
    width: larghezza,
    height: dimensione,
    borderRadius: 3,
    overflow: "hidden" as const,
  };

  /* Il Regno Unito non e' a strisce: si disegna a parte. */
  if (lingua === "en") {
    const spessore = Math.max(2, Math.round(dimensione / 5));
    return (
      <View style={[cornice, stili.bordo, { backgroundColor: "#012169" }]}>
        <View style={[stili.barraOrizzontale, { height: spessore, backgroundColor: "#FFFFFF" }]} />
        <View
          style={[
            stili.barraOrizzontale,
            { height: Math.max(1, spessore - 2), backgroundColor: "#C8102E" },
          ]}
        />
        <View style={[stili.barraVerticale, { width: spessore, backgroundColor: "#FFFFFF" }]} />
        <View
          style={[
            stili.barraVerticale,
            { width: Math.max(1, spessore - 2), backgroundColor: "#C8102E" },
          ]}
        />
      </View>
    );
  }

  const b = BANDIERE[lingua];
  if (!b) return <View style={[cornice, stili.bordo, { backgroundColor: "#D8DCD9" }]} />;

  return (
    <View
      style={[
        cornice,
        stili.bordo,
        { flexDirection: b.verso === "verticale" ? "row" : "column" },
      ]}
    >
      {b.strisce.map((s, i) => (
        <View key={i} style={{ flex: s.parte ?? 1, backgroundColor: s.colore }} />
      ))}
    </View>
  );
}

const stili = StyleSheet.create({
  /* Un filo di bordo: senza, il bianco della Francia sparisce su fondo chiaro. */
  bordo: { borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(29,42,55,0.2)" },
  barraOrizzontale: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    transform: [{ translateY: -1 }],
  },
  barraVerticale: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "50%",
    transform: [{ translateX: -1 }],
  },
});
