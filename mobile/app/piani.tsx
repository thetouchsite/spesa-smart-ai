/**
 * Lo storico: i piani già fatti.
 *
 * FUNZIONA ANCHE SENZA ACCOUNT
 * ----------------------------
 * Chi non è registrato vede i piani salvati sul telefono; chi lo è vede i suoi,
 * ovunque li abbia fatti. La schermata non se ne accorge: chiede l'elenco a
 * `getPlanStore()` e quello sa già da dove prenderlo. In fondo c'è l'invito a
 * registrarsi, che è il momento in cui l'utente capisce a cosa serve — dopo
 * aver visto i piani che rischia di perdere, non prima.
 *
 * L'ERRORE NON SI TRAVESTE DA ELENCO VUOTO
 * ----------------------------------------
 * «Non riesco a caricarli» e «non ne hai» sono due cose diverse, e la seconda
 * detta al posto della prima fa credere all'utente di aver perso tutto. Sono
 * due stati distinti, con due schermate distinte.
 */

import { useCallback, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Body,
  Button,
  Card,
  ErrorState,
  Ionicons,
  Loading,
  Screen,
  Subtitle,
  Title,
  TopBar,
} from "../src/components/ui";
import { getPlanStore, type SavedPlan } from "../src/lib/storage";
import { useUtente } from "../src/lib/state/utente";
import { SessioneScaduta } from "../src/lib/api/cliente";
import { colors, font, radius, spacing } from "../src/theme";
import { tornaIndietro } from "../src/lib/navigazione";

type Stato = "carico" | "pronto" | "errore";

export default function PianiScreen() {
  const router = useRouter();
  const { stato: accesso, scaduta } = useUtente();

  const [stato, setStato] = useState<Stato>("carico");
  const [piani, setPiani] = useState<SavedPlan[]>([]);
  const [aggiorno, setAggiorno] = useState(false);

  const carica = useCallback(
    async (silenzioso = false) => {
      if (!silenzioso) setStato("carico");
      try {
        setPiani(await getPlanStore().list());
        setStato("pronto");
      } catch (e) {
        /* Se il token non vale più si esce pulitamente invece di mostrare un
           errore incomprensibile: l'utente rivedrà i suoi piani locali. */
        if (e instanceof SessioneScaduta) {
          await scaduta();
          setPiani([]);
          setStato("pronto");
          return;
        }
        setStato("errore");
      }
    },
    [scaduta],
  );

  /* `useFocusEffect` e non `useEffect`: tornando qui dopo aver generato un
     piano nuovo, l'elenco deve già contenerlo. */
  useFocusEffect(
    useCallback(() => {
      void carica();
    }, [carica]),
  );

  function cancella(p: SavedPlan) {
    Alert.alert("Cancellare questo piano?", p.label, [
      { text: "Annulla", style: "cancel" },
      {
        text: "Cancella",
        style: "destructive",
        onPress: async () => {
          /* Si toglie subito dall'elenco e poi si chiede al server. Aspettare la
             risposta per far sparire una riga fa sembrare l'app lenta; se il
             server rifiuta, il ricaricamento la rimette al suo posto. */
          setPiani((attuali) => attuali.filter((x) => x.id !== p.id));
          try {
            await getPlanStore().delete(p.id);
          } catch {
            await carica(true);
          }
        },
      },
    ]);
  }

  if (stato === "carico") {
    return (
      <Screen barra>
        <TopBar title="I tuoi piani" onBack={() => tornaIndietro()} />
        <Loading text="Carico i tuoi piani…" />
      </Screen>
    );
  }

  if (stato === "errore") {
    return (
      <Screen>
        <TopBar title="I tuoi piani" onBack={() => tornaIndietro()} />
        <ErrorState
          text="Non riesco a caricare i tuoi piani. I piani non sono persi: è la connessione che manca."
          onRetry={() => void carica()}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <TopBar title="I tuoi piani" onBack={() => tornaIndietro()} />

      <ScrollView
        contentContainerStyle={styles.lista}
        refreshControl={
          <RefreshControl
            refreshing={aggiorno}
            onRefresh={async () => {
              setAggiorno(true);
              await carica(true);
              setAggiorno(false);
            }}
            tintColor={colors.primary}
          />
        }
      >
        {piani.length === 0 ? (
          <View style={styles.vuoto}>
            <Ionicons name="receipt-outline" size={44} color={colors.mutedForeground} />
            <Title>Ancora nessun piano</Title>
            <Subtitle>Quando ne generi uno, lo ritrovi qui.</Subtitle>
            <Button label="Generane uno" onPress={() => router.replace("/")} />
          </View>
        ) : (
          piani.map((p) => (
            <Card key={p.id}>
              <View style={styles.riga}>
                <View style={styles.testo}>
                  <Body style={styles.titolo}>{p.label}</Body>
                  <Body style={styles.data}>
                    {new Date(p.createdAt).toLocaleDateString("it-IT", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </Body>
                  <View style={styles.numeri}>
                    <Body style={styles.numero}>
                      Spesa {Math.round(p.estimatedSpend)} · Risparmio {Math.round(p.savings)}
                    </Body>
                  </View>
                </View>
                <Button
                  label=""
                  nomeAccessibile={`Cancella il piano ${p.label}`}
                  icon="trash-outline"
                  variant="ghost"
                  onPress={() => cancella(p)}
                  style={styles.cestino}
                />
              </View>
            </Card>
          ))
        )}

        {accesso !== "dentro" && piani.length > 0 ? (
          <Card>
            <Body style={styles.invito}>
              Questi piani stanno solo su questo telefono. Con un account li ritrovi ovunque, anche
              se lo cambi.
            </Body>
            <Button
              label="Crea un account"
              variant="secondary"
              onPress={() => router.push("/registrati")}
            />
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lista: { gap: spacing.md, paddingBottom: spacing.xxxl },
  vuoto: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xxxl },
  riga: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  testo: { flex: 1, gap: 2 },
  titolo: { fontSize: font.size.md, fontWeight: font.weight.semibold },
  data: { fontSize: font.size.sm, color: colors.mutedForeground },
  numeri: { flexDirection: "row", marginTop: spacing.xs },
  numero: {
    fontSize: font.size.xs,
    color: colors.mutedForeground,
    backgroundColor: colors.muted,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  cestino: { paddingHorizontal: spacing.sm },
  invito: { fontSize: font.size.sm, color: colors.mutedForeground, marginBottom: spacing.sm },
});
