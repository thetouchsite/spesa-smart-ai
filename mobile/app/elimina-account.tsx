/**
 * Cancellare l'account.
 *
 * PERCHE' ESISTE
 * --------------
 * Non è una gentilezza: Apple e Google la impongono a ogni app che permette di
 * registrarsi, e dev'essere raggiungibile DALL'APP, non solo da un sito. È uno
 * dei motivi di rifiuto più frequenti in revisione, e anche uno dei più banali
 * da evitare.
 *
 * PERCHE' UNA SCHERMATA E NON UN AVVISO
 * -------------------------------------
 * Perché serve un campo per la password, e l'avviso con il campo dentro esiste
 * solo su iPhone. Ma anche perché una cosa irreversibile merita una schermata:
 * l'attrito qui è una caratteristica, non un difetto.
 *
 * SI DICE COSA SI PERDE, CON I NUMERI
 * -----------------------------------
 * «Tutti i tuoi dati» non vuol dire niente. «Quattordici piani salvati» sì, e
 * chi ha quattordici piani si ferma a pensarci.
 */

import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Body, Button, Campo, Card, Screen, Subtitle, Title, TopBar } from "../src/components/ui";
import { utenteApi, RispostaNegativa, SessioneScaduta } from "../src/lib/api/cliente";
import { useUtente } from "../src/lib/state/utente";
import { getPlanStore } from "../src/lib/storage";
import { colors, font, spacing } from "../src/theme";
import { tornaIndietro } from "../src/lib/navigazione";

export default function EliminaAccountScreen() {
  const router = useRouter();
  const { token, utente, esci, scaduta } = useUtente();

  const [password, setPassword] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [quantiPiani, setQuantiPiani] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const elenco = await getPlanStore().list();
        if (vivo) setQuantiPiani(elenco.length);
      } catch {
        /* Se non si riesce a contarli si tace il numero: meglio nessun numero
           che uno sbagliato in una schermata come questa. */
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  async function elimina() {
    if (inCorso || !token) return;
    setErrore(null);
    if (!password) return setErrore("Scrivi la password per confermare");

    setInCorso(true);
    try {
      await utenteApi.eliminaAccount(token, password);
      await esci();
      router.replace("/");
    } catch (e) {
      if (e instanceof SessioneScaduta) {
        await scaduta();
        router.replace("/accedi");
        return;
      }
      setErrore(e instanceof RispostaNegativa ? e.message : "Non riesco a cancellare l'account.");
    } finally {
      setInCorso(false);
    }
  }

  return (
    <Screen>
      <TopBar title="Cancella l'account" onBack={() => tornaIndietro()} />

      <View style={styles.testa}>
        <Title>Cancellare l'account?</Title>
        <Subtitle>Non si torna indietro.</Subtitle>
      </View>

      <Card>
        <Body style={styles.elenco}>Spariscono, per sempre:</Body>
        <Body style={styles.voce}>· il tuo account {utente?.email ? `(${utente.email})` : ""}</Body>
        <Body style={styles.voce}>
          ·{" "}
          {quantiPiani === null
            ? "tutti i piani che hai salvato"
            : quantiPiani === 1
              ? "il piano che hai salvato"
              : `i ${quantiPiani} piani che hai salvato`}
        </Body>
        <Body style={styles.nota}>
          L'app continua a funzionare senza account: i piani che farai da qui in avanti resteranno
          su questo telefono.
        </Body>
      </Card>

      <View style={styles.modulo}>
        <Campo
          etichetta="La tua password"
          valore={password}
          onChange={setPassword}
          segreto
          aiuto="Serve per essere sicuri che sia tu"
          errore={errore}
          onInvio={elimina}
        />
        <Button
          label="Cancella tutto, definitivamente"
          onPress={elimina}
          loading={inCorso}
          variant="secondary"
          style={styles.pericolo}
        />
        <Button label="No, torna indietro" variant="ghost" onPress={() => tornaIndietro()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  testa: { gap: spacing.xs, marginBottom: spacing.lg },
  elenco: { fontSize: font.size.sm, fontWeight: font.weight.semibold, marginBottom: spacing.xs },
  voce: { fontSize: font.size.sm, color: colors.foreground },
  nota: { fontSize: font.size.sm, color: colors.mutedForeground, marginTop: spacing.md },
  modulo: { gap: spacing.lg, marginTop: spacing.xl },
  pericolo: { borderColor: colors.destructive },
});
