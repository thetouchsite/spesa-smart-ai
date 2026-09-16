/**
 * L'attesa mentre nasce il piano.
 *
 * PERCHE' NON BASTA UNA ROTELLA
 * -----------------------------
 * Perche' l'attesa e' lunga: fra i cinquanta e i settanta secondi, misurati.
 * Una rotella che gira per un minuto non dice niente, e chi guarda comincia a
 * chiedersi se si e' bloccata — poi chiude l'app, e il piano che stava
 * arrivando lo paghiamo senza che nessuno lo veda.
 *
 * COSA MOSTRA INVECE
 * ------------------
 * I tre passi veri, che si accendono mentre succedono:
 *
 *   1. la lista della spesa      ~10 secondi
 *   2. i prezzi nei negozi       ~40 secondi, e' la parte lunga
 *   3. il menu' della settimana  ~15 secondi
 *
 * I tempi non sono inventati: vengono da diciassette generazioni misurate.
 * L'avanzamento e' quindi una STIMA basata sul tempo trascorso, non un
 * progresso reale comunicato dal server — e per questo non si mostra nessuna
 * percentuale. Un «73%» sarebbe una precisione che non abbiamo; tre passi che
 * si illuminano dicono la stessa cosa senza mentire.
 *
 * Se il piano arriva prima, la schermata sparisce e nessuno se ne accorge. Se
 * tarda, l'ultimo passo resta acceso e pulsa: nessuna barra che si blocca al
 * 99%, che e' il modo piu' sicuro di far sembrare rotta una cosa che funziona.
 */

import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Platform, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, font, spacing } from "../theme";

/** Il salvadanaio, senza la scritta: qui e' piccolo e il nome non si leggerebbe. */
const SIMBOLO = require("../../assets/adaptive-icon.png");

interface Passo {
  /** Da quanti secondi in poi questo passo e' quello in corso. */
  da: number;
  testo: string;
}

/** I tempi vengono dalle generazioni misurate, non da un'ipotesi. */
const PASSI: Passo[] = [
  { da: 0, testo: "Scelgo i piatti della settimana" },
  { da: 11, testo: "Cerco i prezzi nei negozi della tua città" },
  { da: 48, testo: "Metto insieme il piano" },
];

/**
 * Il web non ha il driver nativo.
 *
 * Chiedendoglielo lo stesso, React Native avvisa e ripiega sul filo
 * principale — lo stesso che sta aspettando la risposta del server. Il
 * risultato e' un'animazione che si blocca proprio mentre deve rassicurare,
 * ed e' esattamente quello che si vedeva nel browser.
 *
 * Su web si anima con i CSS del motore grafico; sul telefono resta nativa.
 */
const DRIVER_NATIVO = Platform.OS !== "web";

export function LoaderPiano({ etichette }: { etichette?: string[] }) {
  const passi = etichette?.length
    ? PASSI.map((p, i) => ({ ...p, testo: etichette[i] ?? p.testo }))
    : PASSI;

  const [passato, setPassato] = useState(0);
  const giro = useRef(new Animated.Value(0)).current;
  const respiro = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const inizio = Date.now();
    const orologio = setInterval(() => setPassato((Date.now() - inizio) / 1000), 500);

    // L'anello gira senza fermarsi: due secondi a giro, lineare — una rotazione
    // che accelera e rallenta sembra un video che si inceppa.
    const rotazione = Animated.loop(
      Animated.timing(giro, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: DRIVER_NATIVO,
      }),
    );

    // Il respiro del salvadanaio: lento, appena percettibile. Serve a dire
    // «sono vivo» anche nei momenti in cui non cambia nient'altro.
    const pulsazione = Animated.loop(
      Animated.sequence([
        Animated.timing(respiro, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: DRIVER_NATIVO,
        }),
        Animated.timing(respiro, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: DRIVER_NATIVO,
        }),
      ]),
    );

    rotazione.start();
    pulsazione.start();
    return () => {
      clearInterval(orologio);
      rotazione.stop();
      pulsazione.stop();
    };
  }, [giro, respiro]);

  const attuale = passi.reduce((n, p, i) => (passato >= p.da ? i : n), 0);

  const rotazioneStile = {
    transform: [
      {
        rotate: giro.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }),
      },
    ],
  };
  const respiroStile = {
    transform: [{ scale: respiro.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }],
  };

  return (
    <View style={stili.tutto}>
      <View style={stili.anelloBox}>
        {/* L'anello fermo: il solco su cui corre quello che gira. */}
        <View style={stili.anelloFermo} />
        {/* Un solo bordo colorato su quattro: girando disegna un arco. */}
        <Animated.View style={[stili.anelloVivo, rotazioneStile]} />
        <Animated.View style={[stili.dentro, respiroStile]}>
          <LinearGradient
            colors={[colors.successBg, colors.card]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={stili.sfondoSimbolo}
          >
            <Image source={SIMBOLO} style={stili.simbolo} resizeMode="contain" />
          </LinearGradient>
        </Animated.View>
      </View>

      <View style={stili.passi}>
        {passi.map((p, i) => {
          const fatto = i < attuale;
          const ora = i === attuale;
          return (
            <View key={p.testo} style={stili.passo}>
              <View
                style={[
                  stili.pallino,
                  fatto && stili.pallinoFatto,
                  ora && stili.pallinoOra,
                ]}
              />
              <Text
                style={[
                  stili.testoPasso,
                  fatto && stili.testoFatto,
                  ora && stili.testoOra,
                ]}
              >
                {p.testo}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const ANELLO = 132;

const stili = StyleSheet.create({
  /* LARGO QUANTO LA SCHERMATA, NON QUANTO IL CERCHIO.
     Il genitore centra i figli, quindi questo contenitore si restringeva al
     suo elemento piu' largo — l'anello — e l'elenco dei passi, che dentro
     chiede tutta la larghezza, la chiedeva a una colonna da centottanta pixel.
     Le tre righe andavano a capo ogni due parole. */
  tutto: { alignItems: "center", gap: spacing.xl, alignSelf: "stretch" },

  anelloBox: {
    width: ANELLO,
    height: ANELLO,
    alignItems: "center",
    justifyContent: "center",
  },
  anelloFermo: {
    ...StyleSheet.absoluteFill,
    borderRadius: ANELLO / 2,
    borderWidth: 4,
    borderColor: colors.muted,
  },
  anelloVivo: {
    ...StyleSheet.absoluteFill,
    borderRadius: ANELLO / 2,
    borderWidth: 4,
    // Tre lati trasparenti su quattro: quello che resta, ruotando, e' un arco
    // che corre attorno al cerchio. Senza librerie e senza disegnare curve.
    borderColor: "transparent",
    borderTopColor: colors.accent,
    borderRightColor: colors.primaryGlow,
  },
  dentro: { alignItems: "center", justifyContent: "center" },
  sfondoSimbolo: {
    width: ANELLO - 34,
    height: ANELLO - 34,
    borderRadius: (ANELLO - 34) / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  simbolo: { width: 58, height: 58 },

  passi: { gap: spacing.md, alignSelf: "stretch", paddingHorizontal: spacing.sm },
  passo: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  pallino: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  pallinoFatto: { backgroundColor: colors.primary },
  pallinoOra: {
    backgroundColor: colors.accent,
    // Il passo in corso e' l'unico con un alone: si trova a colpo d'occhio.
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  testoPasso: {
    flex: 1,
    fontSize: font.size.sm,
    color: colors.border,
  },
  testoFatto: { color: colors.mutedForeground },
  testoOra: {
    color: colors.foreground,
    fontWeight: font.weight.semibold,
    fontSize: font.size.md,
  },
});
