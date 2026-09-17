/**
 * Recuperare la password.
 *
 * DUE PASSI IN UNA SCHERMATA SOLA
 * -------------------------------
 * Prima l'email, poi il codice e la password nuova. Restano nella stessa
 * schermata di proposito: l'utente deve uscire dall'app per leggere il codice
 * nella posta, e al ritorno deve ritrovare esattamente il punto in cui era —
 * non un'altra pagina, non da capo.
 *
 * NON SI DICE SE L'EMAIL ESISTE
 * -----------------------------
 * Il server risponde allo stesso modo in ogni caso, e l'app non finge di
 * saperne di piu': si passa al secondo passo comunque. Dirlo qui vanificherebbe
 * la precauzione presa dall'altra parte — chi cerca di scoprire quali indirizzi
 * sono registrati guarderebbe l'app invece del server.
 *
 * IL CODICE NON ARRIVA ANCORA
 * ---------------------------
 * Finche' non c'e' un servizio di posta configurato, il codice esiste ma non
 * viene recapitato: resta nel registro del server. L'avviso in fondo lo dice,
 * perche' un utente bloccato che aspetta un'email che non arrivera' mai e' la
 * peggiore delle esperienze possibili.
 */

import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Body, Button, Campo, Card, Screen, Subtitle, Title, TopBar } from "../src/components/ui";
import { utenteApi, RispostaNegativa } from "../src/lib/api/cliente";
import { useUtente } from "../src/lib/state/utente";
import { colors, font, spacing } from "../src/theme";
import { tornaIndietro } from "../src/lib/navigazione";

export default function PasswordDimenticataScreen() {
  const router = useRouter();
  const { aggiornaToken } = useUtente();
  const { email: emailIniziale } = useLocalSearchParams<{ email?: string }>();

  const [passo, setPasso] = useState<1 | 2>(1);
  const [email, setEmail] = useState(emailIniziale ?? "");
  const [codice, setCodice] = useState("");
  const [password, setPassword] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  /* Solo in sviluppo il server restituisce il codice: mostrarlo evita di
     andare a leggere i log per ogni prova. In produzione arriva `undefined` e
     il riquadro non compare. */
  const [codiceDiProva, setCodiceDiProva] = useState<string | null>(null);

  async function chiediCodice() {
    if (inCorso) return;
    setErrore(null);
    if (!email.includes("@")) return setErrore("Serve un indirizzo email valido");

    setInCorso(true);
    try {
      const esito = await utenteApi.passwordDimenticata(email.trim());
      setCodiceDiProva(esito.codiceSoloPerProve ?? null);
      setPasso(2);
    } catch (e) {
      setErrore(e instanceof RispostaNegativa ? e.message : "Non riesco a inviare il codice.");
    } finally {
      setInCorso(false);
    }
  }

  async function reimposta() {
    if (inCorso) return;
    setErrore(null);
    if (!/^\d{6}$/.test(codice)) return setErrore("Il codice è di sei cifre");
    if (password.length < 8) return setErrore("La password ha almeno otto caratteri");

    setInCorso(true);
    try {
      const esito = await utenteApi.passwordReimposta(email.trim(), codice, password);
      /* Il server restituisce un token: si entra direttamente, senza far
         ridigitare la password appena scelta. */
      await aggiornaToken(esito.token);
      router.replace("/");
    } catch (e) {
      setErrore(e instanceof RispostaNegativa ? e.message : "Non riesco a cambiare la password.");
    } finally {
      setInCorso(false);
    }
  }

  return (
    <Screen>
      <TopBar title="Password dimenticata" onBack={() => tornaIndietro()} />

      {passo === 1 ? (
        <>
          <View style={styles.testa}>
            <Title>Ti mandiamo un codice</Title>
            <Subtitle>Sei cifre, valide venti minuti.</Subtitle>
          </View>
          <View style={styles.modulo}>
            <Campo
              etichetta="Email"
              valore={email}
              onChange={setEmail}
              tipo="email"
              autoFocus
              errore={errore}
              onInvio={chiediCodice}
            />
            <Button label="Mandami il codice" onPress={chiediCodice} loading={inCorso} />
          </View>
        </>
      ) : (
        <>
          <View style={styles.testa}>
            <Title>Scegli la password nuova</Title>
            <Subtitle>Se {email.trim()} è registrata, il codice è in arrivo.</Subtitle>
          </View>

          {codiceDiProva ? (
            <Card>
              <Body style={styles.prova}>
                Server in modalità di prova — il codice è{" "}
                <Body style={styles.prova}>{codiceDiProva}</Body>
              </Body>
            </Card>
          ) : null}

          <View style={styles.modulo}>
            <Campo
              etichetta="Codice"
              valore={codice}
              onChange={setCodice}
              tipo="cifre"
              autoFocus
              aiuto="Le sei cifre che hai ricevuto"
            />
            <Campo
              etichetta="Nuova password"
              valore={password}
              onChange={setPassword}
              segreto
              aiuto="Almeno otto caratteri"
              errore={errore}
              onInvio={reimposta}
            />
            <Button label="Cambia la password" onPress={reimposta} loading={inCorso} />
            <Button
              label="Non è arrivato, rimandalo"
              variant="ghost"
              onPress={() => {
                setPasso(1);
                setCodice("");
                setErrore(null);
              }}
            />
          </View>

          <Body style={styles.avviso}>
            Se il codice non arriva, il servizio di posta non è ancora attivo su questo server:
            scrivici e lo reimpostiamo a mano.
          </Body>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  testa: { gap: spacing.xs, marginBottom: spacing.xl },
  modulo: { gap: spacing.lg },
  prova: { fontWeight: font.weight.semibold, color: colors.accentForeground },
  avviso: {
    marginTop: spacing.xl,
    fontSize: font.size.sm,
    color: colors.mutedForeground,
    textAlign: "center",
  },
});
