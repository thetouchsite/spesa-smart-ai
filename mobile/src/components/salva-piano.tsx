/**
 * «Salva questo piano», in fondo ai risultati.
 *
 * PERCHE' QUI E NON ALTROVE
 * -------------------------
 * L'archivio dei piani esisteva da prima, e i suoi due magazzini pure — quello
 * sul telefono e quello sul nostro backend. Ma NESSUNA schermata lo chiamava:
 * lo storico sarebbe rimasto vuoto per sempre, e la promessa dell'account
 * («ritrovi i tuoi piani») non avrebbe avuto niente da mantenere.
 *
 * E questo e' il punto giusto in cui chiedere l'account, che e' una cosa
 * diversa dal punto giusto in cui metterlo. Qui l'utente ha appena visto un
 * piano suo, con i suoi numeri: ha qualcosa da perdere. Chiedergli di
 * registrarsi all'apertura, prima ancora di sapere cosa fa l'app, sarebbe
 * chiederglielo quando non ha niente da guadagnarci.
 *
 * L'ETICHETTA SE LA SCRIVE DA SOLO
 * --------------------------------
 * Il nome del piano e' la citta' e la data, non un campo da compilare. Nessuno
 * ha voglia di dare un nome a una lista della spesa, e «Piano del 17 settembre
 * — Napoli» e' piu' utile di «asd» — che e' quello che si scrive davvero
 * quando un modulo insiste.
 */

import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Body, Button, Card, Ionicons } from "./ui";
import { getPlanStore } from "../lib/storage";
import { useUtente } from "../lib/state/utente";
import { SessioneScaduta } from "../lib/api/cliente";
import { colors, font, spacing } from "../theme";
import type { SavedPlanForm } from "../lib/saved-plans";

type Esito = "da-fare" | "salvo" | "fatto" | "errore";

export function SalvaPiano({
  citta,
  form,
  piano,
  spesaStimata,
  risparmio,
  punteggio,
}: {
  citta: string;
  form: SavedPlanForm;
  piano: unknown;
  spesaStimata: number;
  risparmio: number;
  punteggio: number;
}) {
  const router = useRouter();
  const { stato, scaduta } = useUtente();
  const [esito, setEsito] = useState<Esito>("da-fare");

  const etichetta = `${citta || "Il mio piano"} · ${new Date().toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
  })}`;

  async function salva() {
    if (esito === "salvo") return;
    setEsito("salvo");
    try {
      await getPlanStore().save({
        label: etichetta,
        form,
        plan: piano as never,
        estimatedSpend: spesaStimata,
        savings: risparmio,
        score: punteggio,
      });
      setEsito("fatto");
    } catch (e) {
      /* Sessione scaduta: si esce e si riprova sul telefono, cosi' il piano
         non si perde comunque. Salvare in locale e' meglio che non salvare. */
      if (e instanceof SessioneScaduta) {
        await scaduta();
        try {
          await getPlanStore().save({
            label: etichetta,
            form,
            plan: piano as never,
            estimatedSpend: spesaStimata,
            savings: risparmio,
            score: punteggio,
          });
          setEsito("fatto");
          return;
        } catch {
          /* niente da fare */
        }
      }
      setEsito("errore");
    }
  }

  if (esito === "fatto") {
    return (
      <Card>
        <View style={styles.riga}>
          <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
          <Body style={styles.fatto}>Piano salvato</Body>
        </View>
        <Body style={styles.nota}>
          {stato === "dentro"
            ? "Lo ritrovi da qualunque telefono, nei tuoi piani."
            : "È salvato su questo telefono. Con un account lo ritroveresti ovunque."}
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

  return (
    <Card>
      <View style={styles.riga}>
        <Ionicons name="bookmark-outline" size={20} color={colors.foreground} />
        <Body style={styles.titolo}>Salva questo piano</Body>
      </View>
      <Body style={styles.nota}>
        {stato === "dentro"
          ? "Lo ritroverai da qualunque telefono."
          : "Resterà su questo telefono. Con un account lo ritrovi ovunque, anche se lo cambi."}
      </Body>

      {esito === "errore" ? (
        <Body style={styles.errore}>Non sono riuscito a salvarlo. Riprova.</Body>
      ) : null}

      <View style={styles.bottoni}>
        <Button
          label={esito === "salvo" ? "Salvo…" : "Salva il piano"}
          loading={esito === "salvo"}
          onPress={salva}
        />
        {stato !== "dentro" ? (
          <Button
            label="Accedi per ritrovarlo ovunque"
            variant="ghost"
            onPress={() => router.push("/accedi")}
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  riga: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  titolo: { fontSize: font.size.md, fontWeight: font.weight.semibold },
  fatto: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.primary },
  nota: {
    fontSize: font.size.sm,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  errore: { fontSize: font.size.sm, color: colors.destructive, marginBottom: spacing.sm },
  bottoni: { gap: spacing.sm },
});
