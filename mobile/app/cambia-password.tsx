/**
 * Cambiare la password da dentro.
 *
 * PERCHE' CHIEDE ANCHE QUELLA ATTUALE
 * -----------------------------------
 * L'utente è già entrato: tecnicamente basterebbe la nuova. Ma «già entrato»
 * su un telefono vuol dire «il telefono è sbloccato», e un telefono sbloccato
 * lasciato sul tavolo non deve bastare a prendersi un account. I dieci secondi
 * in più li paga chi cambia la password, che è una cosa che si fa due volte
 * l'anno; senza, li pagherebbe chi se lo fa rubare.
 *
 * COSA SUCCEDE AGLI ALTRI TELEFONI
 * --------------------------------
 * Si scollegano. È il motivo per cui si cambia una password, e l'avviso lo
 * dice prima invece di lasciarlo scoprire a chi si ritrova fuori dal tablet.
 * Questo telefono no: il server restituisce un token nuovo e lo si sostituisce
 * al volo, altrimenti l'utente verrebbe buttato fuori dalla schermata in cui ha
 * appena confermato — e penserebbe a un guasto.
 */

import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Body, Button, Campo, Screen, Subtitle, Title, TopBar } from "../src/components/ui";
import { utenteApi, RispostaNegativa, SessioneScaduta } from "../src/lib/api/cliente";
import { useUtente } from "../src/lib/state/utente";
import { colors, font, spacing } from "../src/theme";
import { tornaIndietro } from "../src/lib/navigazione";

export default function CambiaPasswordScreen() {
  const router = useRouter();
  const { token, aggiornaToken, scaduta } = useUtente();

  const [attuale, setAttuale] = useState("");
  const [nuova, setNuova] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [fatto, setFatto] = useState(false);

  async function invia() {
    if (inCorso || !token) return;
    setErrore(null);
    if (nuova.length < 8) return setErrore("La nuova password ha almeno otto caratteri");
    if (nuova === attuale) return setErrore("La nuova password è uguale a quella di prima");

    setInCorso(true);
    try {
      const esito = await utenteApi.passwordCambia(token, attuale, nuova);
      await aggiornaToken(esito.token);
      setFatto(true);
    } catch (e) {
      if (e instanceof SessioneScaduta) {
        await scaduta();
        router.replace("/accedi");
        return;
      }
      setErrore(
        e instanceof RispostaNegativa ? e.message : "Non riesco a cambiare la password.",
      );
    } finally {
      setInCorso(false);
    }
  }

  if (fatto) {
    return (
      <Screen>
        <TopBar title="Password cambiata" onBack={() => tornaIndietro()} />
        <View style={styles.testa}>
          <Title>Fatto</Title>
          <Subtitle>
            Da adesso vale quella nuova. Gli altri telefoni in cui eri entrato sono stati
            scollegati.
          </Subtitle>
        </View>
        <Button label="Torna alle impostazioni" onPress={() => router.replace("/impostazioni")} />
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar title="Cambia password" onBack={() => tornaIndietro()} />

      <View style={styles.testa}>
        <Title>Cambia la password</Title>
        <Subtitle>Serve anche quella attuale: è la prova che sei tu.</Subtitle>
      </View>

      <View style={styles.modulo}>
        <Campo etichetta="Password attuale" valore={attuale} onChange={setAttuale} segreto autoFocus />
        <Campo
          etichetta="Nuova password"
          valore={nuova}
          onChange={setNuova}
          segreto
          aiuto="Almeno otto caratteri"
          errore={errore}
          onInvio={invia}
        />
        <Button label="Cambia la password" onPress={invia} loading={inCorso} />
      </View>

      <Body style={styles.avviso}>
        Cambiandola, gli altri dispositivi in cui hai fatto l'accesso verranno scollegati.
        Questo telefono resta dentro.
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  testa: { gap: spacing.xs, marginBottom: spacing.xl },
  modulo: { gap: spacing.lg },
  avviso: {
    marginTop: spacing.xl,
    fontSize: font.size.sm,
    color: colors.mutedForeground,
    textAlign: "center",
  },
});
