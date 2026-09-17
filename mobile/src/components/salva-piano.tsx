/**
 * Il piano si archivia da solo: qui si dice soltanto dov'e' finito.
 *
 * COS'ERA PRIMA, E PERCHE' NON VA PIU' BENE
 * -----------------------------------------
 * Era «Salva questo piano», con il pulsante. L'archivio si riempiva solo se
 * l'utente se lo ricordava, e chi non se lo ricordava — quasi tutti — vedeva
 * il suo piano sparire alla generazione successiva, senza avvisi. Cioe'
 * l'app scaricava addosso a chi la usa il compito di proteggersi da una cosa
 * che faceva lei.
 *
 * E ne nasceva una confusione peggiore: due oggetti chiamati «piano» che non
 * si parlavano. Si cancellavano tutti i piani salvati e quello in corso
 * restava in home, perche' non era mai stato nell'archivio.
 *
 * Adesso il piano entra nell'archivio appena i numeri sono pronti, e questa
 * scheda fa la sola cosa che restava da fare: dire dov'e' finito, e a chi non
 * ha un account spiegare cosa si porta via un telefono perso.
 *
 * L'INVITO ALL'ACCOUNT RESTA QUI, E NON PER CASO
 * ----------------------------------------------
 * E' il momento giusto per chiederlo: l'utente ha appena visto numeri suoi,
 * ha qualcosa da perdere. Chiederglielo all'apertura, prima ancora di sapere
 * cosa fa l'app, sarebbe chiederglielo quando non ha niente da guadagnarci.
 * Cambia solo la frase: prima prometteva di salvare qualcosa che l'utente
 * doveva ancora salvare, adesso dice dov'e' gia'.
 */

import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Body, Button, Card, Ionicons } from "./ui";
import { useUtente } from "../lib/state/utente";
import { colors, font, spacing } from "../theme";

export function PianoArchiviato({
  /** `false` finche' l'archiviazione non e' riuscita: non si promette niente. */
  archiviato,
}: {
  archiviato: boolean;
}) {
  const router = useRouter();
  const { stato } = useUtente();

  return (
    <Card>
      <View style={styles.riga}>
        <Ionicons
          name={archiviato ? "checkmark-circle" : "bookmark-outline"}
          size={20}
          color={archiviato ? colors.primary : colors.mutedForeground}
        />
        <Body style={styles.titolo}>
          {archiviato ? "Questo piano è nei tuoi piani" : "Lo sto mettendo nei tuoi piani"}
        </Body>
      </View>

      <Body style={styles.nota}>
        {stato === "dentro"
          ? "Lo ritrovi da qualunque telefono, insieme a quelli di prima."
          : "Sta su questo telefono, insieme a quelli di prima. Con un account li ritrovi ovunque, anche se lo cambi o lo perdi."}
      </Body>

      <View style={styles.bottoni}>
        <Button
          label="Vedi i tuoi piani"
          variant="secondary"
          onPress={() => router.push("/piani")}
        />
        {stato !== "dentro" ? (
          <Button label="Crea un account" onPress={() => router.push("/registrati")} />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  riga: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  titolo: { fontSize: font.size.md, fontWeight: font.weight.semibold },
  nota: {
    fontSize: font.size.sm,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  bottoni: { gap: spacing.sm },
});
