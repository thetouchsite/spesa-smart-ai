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
 * UN PIANO SALVATO SI RIAPRE
 * ---------------------------
 * Per mesi non si poteva: ogni riga aveva la data, la spesa, il risparmio e un
 * cestino, e il cestino era l'unica cosa che si potesse fare a un piano
 * salvato. Un archivio da cui si puo' solo cancellare non e' un archivio, e
 * peggio ancora rendeva bugiarda la frase con cui si chiede l'account —
 * «ritrovi i tuoi piani ovunque»: li ritrovavi scritti in un elenco, non li
 * ritrovavi da usare.
 *
 * Riaprire un piano rimette in corso due cose: il piano e le risposte con cui
 * era stato fatto — citta', persone, budget, stile — perche' senza quelle le
 * porzioni e la valuta sarebbero quelle dell'ultimo piano, non di questo.
 *
 * I PREZZI VERI NON TORNANO INDIETRO, E VA BENE
 * ---------------------------------------------
 * Di un piano si salvano le ricette e le risposte, non le offerte dei negozi:
 * quelle scadono. Un piano di tre settimane fa riaperto con i prezzi di tre
 * settimane fa direbbe bugie con la faccia seria. Riaprendolo la lista li
 * ricalcola, e finche' non ha finito mostra la stima — che e' dichiarata come
 * tale, come dappertutto nell'app.
 *
 * L'ERRORE NON SI TRAVESTE DA ELENCO VUOTO
 * ----------------------------------------
 * «Non riesco a caricarli» e «non ne hai» sono due cose diverse, e la seconda
 * detta al posto della prima fa credere all'utente di aver perso tutto. Sono
 * due stati distinti, con due schermate distinte.
 */

import { useCallback, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { useSession } from "../src/lib/state/session";
import { SessioneScaduta } from "../src/lib/api/cliente";
import { colors, font, radius, spacing, spazioPerLaBarra } from "../src/theme";
import { tornaIndietro } from "../src/lib/navigazione";

type Stato = "carico" | "pronto" | "errore";

export default function PianiScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { stato: accesso, scaduta } = useUtente();
  const { currentPlan, setPlan, updateProfile, profile } = useSession();

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

  /**
   * Rimette in corso un piano salvato e porta ai risultati.
   *
   * Il profilo si ripristina insieme al piano: le porzioni, la valuta e la
   * citta' con cui i conti tornano sono quelle con cui il piano era stato
   * fatto, non quelle dell'ultima volta che si e' risposto alle domande.
   *
   * `planExtra` si azzera apposta — vedi la nota in cima al file: le offerte
   * salvate non esistono, e riproporre quelle vecchie sarebbe peggio che
   * ricalcolarle.
   */
  function metti(p: SavedPlan) {
    updateProfile({
      city: p.form.city,
      country: p.form.country ?? profile.country,
      household: p.form.household,
      budget: p.form.budget,
      currency: p.form.currency as typeof profile.currency,
      frequency: p.form.frequency,
      style: p.form.style,
      allergies: p.form.allergies,
      dislikes: p.form.dislikes,
      zeroSpendDay: p.form.zeroSpendDay,
    });
    setPlan(p.plan, null);
    /* `push` e non `replace`: la freccia indietro deve riportare all'elenco,
       che e' da dove si e' partiti. */
    router.push("/risultati");
  }

  function apri(p: SavedPlan) {
    /* SI CHIEDE CONFERMA SOLO QUANDO C'E' DAVVERO QUALCOSA DA PERDERE.
       Il piano in corso non si salva da solo — si salva premendo «Salva
       questo piano» in fondo ai risultati — quindi aprirne un altro puo'
       buttare via lavoro che nessuno ha messo al sicuro. Ma se un piano in
       corso non c'e', o e' gia' questo, non c'e' niente da chiedere: una
       domanda a cui la risposta e' sempre «si'» insegna solo a non leggere. */
    if (!currentPlan || currentPlan === p.plan) return metti(p);
    Alert.alert(
      "Aprire questo piano?",
      "Quello che hai in corso viene sostituito. Se non l'hai salvato, lo perdi.",
      [
        { text: "Annulla", style: "cancel" },
        { text: "Apri", onPress: () => metti(p) },
      ],
    );
  }

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
      <Screen barra>
        <TopBar title="I tuoi piani" onBack={() => tornaIndietro()} />
        <ErrorState
          text="Non riesco a caricare i tuoi piani. I piani non sono persi: è la connessione che manca."
          onRetry={() => void carica()}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} barra>
      <TopBar title="I tuoi piani" onBack={() => tornaIndietro()} />

      <ScrollView
        /* Questa schermata scorre per conto suo — `Screen` ha
           `scroll={false}` — quindi il posto per la pillola in fondo non lo
           fa nessun altro: senza, l'ultimo piano salvato ci finisce sotto. */
        contentContainerStyle={[styles.lista, { paddingBottom: spazioPerLaBarra(insets.bottom) }]}
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
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityLabel={`Apri il piano ${p.label}`}
              onPress={() => apri(p)}
              style={({ pressed }) => [pressed && styles.premuto]}
            >
              <Card>
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
                  {/* La freccia dice che la riga si apre. Senza, una scheda con
                      dentro un cestino sembra una scheda con dentro un cestino
                      — e nient'altro. */}
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.mutedForeground}
                    style={styles.freccia}
                  />
                </View>
              </Card>
            </Pressable>
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
  freccia: { marginTop: spacing.sm },
  premuto: { opacity: 0.7 },
  invito: { fontSize: font.size.sm, color: colors.mutedForeground, marginBottom: spacing.sm },
});
