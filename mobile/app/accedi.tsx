/**
 * Entrare.
 *
 * PERCHE' L'ACCESSO NON SBARRA LA STRADA
 * --------------------------------------
 * L'app funziona anche senza account: il piano si genera, la lista si legge,
 * i negozi si trovano. L'account serve a non perdere i piani cambiando
 * telefono — che e' una cosa che si capisce dopo averne fatto uno, non prima.
 *
 * Per questo qui c'e' «continua senza account» e non e' scritto in piccolo:
 * obbligare a registrarsi prima di aver visto a cosa serve e' il modo piu'
 * rapido di far disinstallare un'app.
 */

import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Body, Button, Campo, Screen, Subtitle, Title, TopBar } from "../src/components/ui";
import { useUtente } from "../src/lib/state/utente";
import { portaSuIPianiLocali } from "../src/lib/storage";
import { RispostaNegativa } from "../src/lib/api/cliente";
import { colors, font, spacing } from "../src/theme";
import { tornaIndietro } from "../src/lib/navigazione";

export default function AccediScreen() {
  const router = useRouter();
  const { accedi } = useUtente();
  /* Chi arriva dalla registrazione o da un recupero ha gia' scritto la sua
     email: rifarla scrivere sarebbe una piccola scortesia gratuita. */
  const { email: emailIniziale } = useLocalSearchParams<{ email?: string }>();

  const [email, setEmail] = useState(emailIniziale ?? "");
  const [password, setPassword] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  async function invia() {
    if (inCorso) return;
    setErrore(null);

    if (!email.includes("@")) return setErrore("Serve un indirizzo email valido");
    if (password.length < 8) return setErrore("La password ha almeno otto caratteri");

    setInCorso(true);
    try {
      await accedi(email.trim(), password);
      /* I piani fatti prima di registrarsi vanno portati su, altrimenti
         l'utente li vede sparire proprio mentre fa la cosa che gli avevamo
         promesso servisse a non perderli. Non blocca niente se fallisce. */
      await portaSuIPianiLocali();
      router.replace("/");
    } catch (e) {
      setErrore(
        e instanceof RispostaNegativa ? e.message : "Non riesco a entrare. Riprova fra poco.",
      );
    } finally {
      setInCorso(false);
    }
  }

  return (
    <Screen>
      <TopBar title="Accedi" onBack={() => tornaIndietro()} />

      <View style={styles.testa}>
        <Title>Bentornato</Title>
        <Subtitle>I tuoi piani ti seguono su qualunque telefono.</Subtitle>
      </View>

      <View style={styles.modulo}>
        <Campo
          etichetta="Email"
          valore={email}
          onChange={setEmail}
          tipo="email"
          autoFocus={!emailIniziale}
        />
        <Campo
          etichetta="Password"
          valore={password}
          onChange={setPassword}
          segreto
          errore={errore}
          onInvio={invia}
        />

        <Button label="Entra" onPress={invia} loading={inCorso} />

        <Button
          label="Ho dimenticato la password"
          variant="ghost"
          onPress={() => router.push({ pathname: "/password-dimenticata", params: { email } })}
        />
      </View>

      <View style={styles.piede}>
        <Body style={styles.piedeTesto}>Non hai ancora un account?</Body>
        <Button
          label="Registrati"
          variant="secondary"
          onPress={() => router.replace({ pathname: "/registrati", params: { email } })}
        />
        <Button label="Continua senza account" variant="ghost" onPress={() => router.replace("/")} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  testa: { gap: spacing.xs, marginBottom: spacing.xl },
  modulo: { gap: spacing.lg },
  piede: { gap: spacing.sm, marginTop: spacing.xxl },
  piedeTesto: {
    textAlign: "center",
    color: colors.mutedForeground,
    fontSize: font.size.sm,
  },
});
