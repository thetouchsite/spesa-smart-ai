/**
 * La finestra che chiede «sei sicuro?».
 *
 * STA NEL LAYOUT RADICE, MONTATA SEMPRE
 * -------------------------------------
 * Non si monta dove serve: si monta una volta e ascolta. Cosi' una funzione
 * qualsiasi, in qualsiasi file, puo' far comparire una domanda senza che la
 * sua schermata debba tenersi uno stato e un pezzo di markup.
 *
 * QUANDO E' CHIUSA NON C'E'
 * -------------------------
 * `if (!domanda) return null` prima di qualunque cosa: un `Modal` sempre
 * montato con `visible={false}` su Android intercetta comunque il tasto
 * indietro, e ci si ritrova con un tasto che non fa niente in schermate che
 * con gli avvisi non c'entrano.
 *
 * IL PULSANTE PERICOLOSO NON E' QUELLO A DESTRA
 * ---------------------------------------------
 * Annulla sta sotto, largo quanto l'altro, ed e' quello che il pollice trova
 * per primo salendo dal basso. Chi apre questa finestra per sbaglio deve
 * potersene andare con il gesto piu' comodo, non con quello piu' preciso.
 */

import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Body, Button } from "./ui";
import { useDialogo } from "../lib/state/dialogo";
import { colors, font, radius, spacing } from "../theme";

export function Dialogo() {
  const { domanda, rispondi } = useDialogo();
  if (!domanda) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible
      /* Il tasto indietro di Android e lo scorrimento verso il basso su iPhone
         valgono «annulla»: chiudere senza rispondere lascerebbe appesa per
         sempre la funzione che aspetta. */
      onRequestClose={() => rispondi(false)}
    >
      <Pressable
        style={stili.fondo}
        accessibilityRole="button"
        accessibilityLabel="Annulla"
        onPress={() => rispondi(false)}
      >
        {/* Il tocco sulla scheda non deve chiudere: si ferma qui. */}
        <Pressable style={stili.scheda} onPress={() => {}}>
          <Body style={stili.titolo}>{domanda.titolo}</Body>
          {domanda.testo ? <Body style={stili.testo}>{domanda.testo}</Body> : null}

          <View style={stili.bottoni}>
            <Button
              label={domanda.conferma}
              onPress={() => rispondi(true)}
              style={domanda.distruttiva ? stili.pericolo : undefined}
            />
            <Button
              label={domanda.annulla ?? "Annulla"}
              variant="ghost"
              onPress={() => rispondi(false)}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const stili = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: "rgba(12, 24, 18, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  scheda: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
    shadowColor: "#0A160F",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3,
    shadowRadius: 34,
    elevation: 12,
  },
  titolo: {
    fontSize: font.size.lg,
    fontWeight: font.weight.bold,
    color: colors.foreground,
  },
  testo: {
    fontSize: font.size.sm,
    color: colors.mutedForeground,
    marginTop: spacing.sm,
  },
  bottoni: { gap: spacing.sm, marginTop: spacing.xl },
  pericolo: { backgroundColor: colors.destructive },
});
