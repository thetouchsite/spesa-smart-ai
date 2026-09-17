/**
 * Il riquadro dell'account dentro le impostazioni.
 *
 * PERCHE' UN COMPONENTE E NON ALTRE CENTO RIGHE IN `impostazioni.tsx`
 * -------------------------------------------------------------------
 * Quella schermata è già lunga e parla di lingua, profilo e dati. L'account è
 * un argomento a sé, con un suo stato e tre conferme distruttive: mescolarlo
 * avrebbe reso illeggibile l'una e nascosto l'altro.
 *
 * DUE FACCE, NON UNA CON DEGLI `IF`
 * ---------------------------------
 * Chi non è entrato vede un invito; chi è entrato vede i suoi comandi. Sono
 * due contenuti diversi, non lo stesso contenuto disabilitato — mostrare
 * «cambia password» in grigio a chi non ha un account è solo un modo di
 * chiedersi perché.
 */

import { useEffect, useState } from "react";
import { Alert, StyleSheet, Switch, View } from "react-native";
import { useRouter } from "expo-router";
import { Body, Button, Card, Ionicons, Label, ListRow } from "./ui";
import { useUtente } from "../lib/state/utente";
import {
  biometriaDisponibile,
  chiediConferma,
  impostaSbloccoRapido,
  nomeDelSensore,
  sbloccoRapidoAcceso,
} from "../lib/biometria";
import { colors, font, spacing } from "../theme";

export function SchedaAccount() {
  const router = useRouter();
  const { stato, utente, token, esci } = useUtente();

  const [sensore, setSensore] = useState<string | null>(null);
  const [rapido, setRapido] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!(await biometriaDisponibile())) return;
      const [nome, acceso] = await Promise.all([nomeDelSensore(), sbloccoRapidoAcceso()]);
      if (!vivo) return;
      setSensore(nome);
      setRapido(acceso);
    })();
    return () => {
      vivo = false;
    };
  }, [stato]);

  async function cambiaSblocco(acceso: boolean) {
    /* Accendendolo si chiede subito la conferma: se il dito non funziona è
       meglio scoprirlo adesso, con la password ancora fresca, che alla
       prossima apertura davanti a una schermata che non si sblocca. */
    if (acceso && !(await chiediConferma("Conferma per accendere lo sblocco rapido"))) return;
    setRapido(acceso);
    await impostaSbloccoRapido(acceso);
  }

  function confermaUscita() {
    Alert.alert("Vuoi uscire?", "I piani salvati restano al sicuro sul tuo account.", [
      { text: "Annulla", style: "cancel" },
      { text: "Esci", style: "destructive", onPress: () => void esci() },
    ]);
  }

  /* La cancellazione ha una schermata sua e non un avviso con campo dentro:
     `Alert.prompt` esiste solo su iPhone, e due strade per la stessa cosa
     vogliono dire che una delle due verra' provata meta' delle volte. */

  if (stato !== "dentro") {
    return (
      <Card>
        <Label icon="person-circle-outline">Account</Label>
        <Body style={styles.invito}>
          Senza account i piani restano su questo telefono. Con un account li ritrovi ovunque,
          anche se lo cambi o lo perdi.
        </Body>
        <View style={styles.bottoni}>
          <Button label="Accedi" variant="secondary" onPress={() => router.push("/accedi")} />
          <Button label="Crea un account" onPress={() => router.push("/registrati")} />
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <Label icon="person-circle-outline">Account</Label>

      <ListRow
        icon="mail-outline"
        title={utente?.displayName || "Il tuo account"}
        subtitle={utente?.email}
      />

      <ListRow
        icon="receipt-outline"
        title="I tuoi piani"
        subtitle="Lo storico, su qualunque telefono"
        onPress={() => router.push("/piani")}
      />

      <ListRow
        icon="key-outline"
        title="Cambia password"
        onPress={() => router.push("/cambia-password")}
      />

      {sensore ? (
        <ListRow
          icon="finger-print-outline"
          title="Sblocco rapido"
          subtitle={`Entra con ${sensore}, senza ridigitare la password`}
          right={
            <Switch
              value={rapido}
              onValueChange={(v) => void cambiaSblocco(v)}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          }
        />
      ) : null}

      <ListRow icon="log-out-outline" title="Esci" onPress={confermaUscita} />

      <ListRow
        icon="trash-outline"
        title="Cancella l'account"
        subtitle="Porta via anche tutti i piani salvati"
        onPress={() => router.push("/elimina-account")}
        right={<Ionicons name="chevron-forward" size={18} color={colors.destructive} />}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  invito: {
    fontSize: font.size.sm,
    color: colors.mutedForeground,
    marginBottom: spacing.md,
  },
  bottoni: { gap: spacing.sm },
});
