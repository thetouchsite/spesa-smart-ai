/**
 * La barra di navigazione che galleggia in basso.
 *
 * PERCHE' NON E' UNA BARRA A SCHEDE VERA
 * --------------------------------------
 * L'app usa una pila di schermate, non delle schede: il percorso è un séguito
 * — sei domande, elaborazione, risultati, menù, lista — e trasformarlo in
 * schede vorrebbe dire poter saltare ai risultati prima di aver risposto a
 * niente. Qui la barra è una scorciatoia fra i quattro posti dove si torna
 * spesso, e compare solo dove ha senso.
 *
 * PERCHE' SOLO QUATTRO VOCI
 * -------------------------
 * Cinque cominciano a stringersi, e la quinta finisce sempre per essere
 * «altro» — che non è una destinazione, è una resa. Le impostazioni restano
 * dov'erano: in home e nella barra in alto dei risultati.
 *
 * LA VOCE ATTIVA HA IL NOME SCRITTO
 * ---------------------------------
 * Le altre sono icone sole. È il modo del riferimento e funziona: dice dove
 * sei senza dover riconoscere quattro simboli, e tiene la barra stretta.
 * Un'icona senza testo resta comunque leggibile da chi usa il lettore di
 * schermo, perché il nome sta in `accessibilityLabel`.
 *
 * E NON SI VEDE DA SCONOSCIUTI
 * ----------------------------
 * Tre delle quattro destinazioni, senza un piano, sono stanze vuote. Vedi
 * `if (stato !== "dentro")` più sotto.
 */

import { Pressable, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ALTEZZA_PILLOLA, colors, font, radius, shadow, spacing } from "../theme";
import { useUtente } from "../lib/state/utente";

interface Voce {
  chiave: string;
  dove: string;
  etichetta: string;
  icona: keyof typeof Ionicons.glyphMap;
}

const VOCI: Voce[] = [
  { chiave: "casa", dove: "/", etichetta: "Home", icona: "home" },
  { chiave: "menu", dove: "/menu", etichetta: "Menù", icona: "restaurant" },
  { chiave: "lista", dove: "/lista", etichetta: "Lista", icona: "cart" },
  /* Non piu' il segnalibro: un segnalibro vuol dire «messo da parte da te»,
     ed era giusto quando i piani si salvavano a mano. Adesso ci finiscono
     tutti da soli, e quello che si apre e' una pila di cose fatte. */
  { chiave: "piani", dove: "/piani", etichetta: "Piani", icona: "albums" },
];

export function BarraBasso() {
  const router = useRouter();
  const percorso = usePathname();
  const insets = useSafeAreaInsets();
  const { stato } = useUtente();

  /* CHI NON E' ENTRATO NON LA VEDE, e la regola sta qui invece che nelle
     quattro schermate che la mostrano: sparpagliata, ci si dimentica sempre
     della quinta.

     Il motivo non e' commerciale ma pratico: da sconosciuti tre delle quattro
     destinazioni sono vuote — non c'e' un menu', non c'e' una lista, non ci
     sono piani salvati. Una barra che porta in tre stanze vuote insegna solo
     che l'app non funziona. La strada, da li', e' una sola: generare un piano.
     Quando ce l'ha, la barra compare e porta in posti pieni. */
  if (stato !== "dentro") return null;

  return (
    <View
      style={[
        styles.contenitore,
        /* Sopra la barra gesti dei telefoni senza tasti fisici: senza questo
           margine la pillola ci finisce sotto e l'ultima voce non si preme. */
        { paddingBottom: Math.max(insets.bottom, spacing.md) },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.pillola}>
        {VOCI.map((v) => {
          const attiva = percorso === v.dove;
          return (
            <Pressable
              key={v.chiave}
              accessibilityRole="button"
              accessibilityState={{ selected: attiva }}
              accessibilityLabel={v.etichetta}
              onPress={() => {
                if (attiva) return;
                /* `replace` e non `push`: la barra serve a spostarsi, non a
                   impilare. Con `push`, premendo Home cinque volte, il tasto
                   indietro chiederebbe cinque volte di tornare da dove si
                   veniva. */
                router.replace(v.dove);
              }}
              style={({ pressed }) => [
                styles.voce,
                attiva && styles.voceAttiva,
                pressed && styles.premuta,
              ]}
            >
              <Ionicons
                name={attiva ? v.icona : (`${v.icona}-outline` as Voce["icona"])}
                size={20}
                color={attiva ? colors.primaryForeground : "#9AA6A0"}
              />
              {attiva ? <Text style={styles.voceTesto}>{v.etichetta}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenitore: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  pillola: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    /* Verde molto scuro, non nero: il nero accanto al verde del marchio vira
       al freddo, e la barra sembra di un'altra app. */
    backgroundColor: "#12241B",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    ...shadow.flottante,
  },
  voce: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    /* L'altezza viene dal tema, che e' anche la fonte del calcolo con cui
       le altre schermate le lasciano il posto: due numeri che devono
       restare uguali non si scrivono due volte. */
    minHeight: ALTEZZA_PILLOLA - spacing.sm * 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  voceAttiva: { backgroundColor: colors.primary, paddingHorizontal: spacing.lg },
  voceTesto: {
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    color: colors.primaryForeground,
  },
  premuta: { opacity: 0.7 },
});
