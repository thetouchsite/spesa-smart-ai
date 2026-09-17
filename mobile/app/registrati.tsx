/**
 * Creare un account.
 *
 * TRE CAMPI, NON SETTE
 * --------------------
 * Nome, email, password. Non si chiede la conferma della password: con il
 * pulsante che mostra quello che si e' scritto, il secondo campo serve solo a
 * far sbagliare due volte invece di una. E non si chiede nient'altro — citta',
 * persone, allergie le sa gia' l'onboarding, e richiederle qui sarebbe
 * raccogliere due volte la stessa cosa.
 *
 * GLI OTTO CARATTERI SI DICONO PRIMA
 * ----------------------------------
 * Il minimo compare sotto il campo da subito, non come errore dopo l'invio.
 * Una regola detta prima e' un'istruzione; detta dopo e' un rimprovero.
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

export default function RegistratiScreen() {
  const router = useRouter();
  const { registrati } = useUtente();
  const { email: emailIniziale } = useLocalSearchParams<{ email?: string }>();

  const [nome, setNome] = useState("");
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
      await registrati(email.trim(), password, nome.trim() || undefined);
      /* I piani fatti prima di registrarsi vanno portati su, altrimenti
         l'utente li vede sparire proprio mentre fa la cosa che gli avevamo
         promesso servisse a non perderli. Non blocca niente se fallisce. */
      await portaSuIPianiLocali();
      router.replace("/");
    } catch (e) {
      /* Il 409 è l'unico errore che vale la pena tradurre in un'azione: chi
         ha già un account non deve rileggere il messaggio, deve poter andare
         all'accesso da lì. */
      const gia = e instanceof RispostaNegativa && e.stato === 409;
      setErrore(
        gia
          ? "Esiste già un account con questa email. Vai su «Accedi» qui sotto."
          : e instanceof RispostaNegativa
            ? e.message
            : "Non riesco a registrarti. Riprova fra poco.",
      );
    } finally {
      setInCorso(false);
    }
  }

  return (
    <Screen>
      <TopBar title="Registrati" onBack={() => tornaIndietro()} />

      <View style={styles.testa}>
        <Title>Crea il tuo account</Title>
        <Subtitle>Serve solo a ritrovare i tuoi piani su qualunque telefono.</Subtitle>
      </View>

      <View style={styles.modulo}>
        <Campo etichetta="Come ti chiami" valore={nome} onChange={setNome} aiuto="Facoltativo" />
        <Campo etichetta="Email" valore={email} onChange={setEmail} tipo="email" />
        <Campo
          etichetta="Password"
          valore={password}
          onChange={setPassword}
          segreto
          aiuto="Almeno otto caratteri"
          errore={errore}
          onInvio={invia}
        />

        <Button label="Crea l'account" onPress={invia} loading={inCorso} />
      </View>

      <View style={styles.piede}>
        <Body style={styles.piedeTesto}>Hai già un account?</Body>
        <Button
          label="Accedi"
          variant="secondary"
          onPress={() => router.replace({ pathname: "/accedi", params: { email } })}
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
