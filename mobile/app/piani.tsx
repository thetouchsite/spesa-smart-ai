/**
 * I piani: tutti quelli fatti, e quello che stai usando adesso.
 *
 * NON E' PIU' UN ARCHIVIO A PARTE
 * -------------------------------
 * Fino a ieri c'erano due oggetti che si chiamavano «piano»: quello in corso,
 * dentro la sessione, e i piani salvati, in un archivio che si riempiva solo
 * premendo un pulsante. I due non si parlavano: si cancellavano tutti i piani
 * salvati e quello in corso restava in home, perche' non era mai stato
 * nell'archivio. Chi guardava non poteva capirlo, perche' non c'era niente da
 * capire — erano due cose scollegate con lo stesso nome.
 *
 * Adesso ogni piano generato finisce qui da solo, e «in corso» e' un bollino
 * su una di queste righe: non un secondo magazzino, un segnalibro. Si tocca
 * una riga e quel piano diventa quello attivo — in home, nel menu', nella
 * lista. Si cancella la riga in corso e sparisce davvero, anche dalla home.
 *
 * PERCHE' «CREA UN PIANO» STA IN CIMA E NON IN FONDO
 * --------------------------------------------------
 * Perche' con dieci piani in elenco un pulsante in fondo si trova solo
 * scorrendo, e perche' in fondo c'e' la barra che galleggia. In cima e'
 * sempre alla stessa distanza dal pollice, che ci siano zero piani o venti.
 *
 * L'ERRORE NON SI TRAVESTE DA ELENCO VUOTO
 * ----------------------------------------
 * «Non riesco a caricarli» e «non ne hai» sono due cose diverse, e la seconda
 * detta al posto della prima fa credere all'utente di aver perso tutto. Sono
 * due stati distinti, con due schermate distinte.
 */

import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
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
import { confermaAzione } from "../src/lib/conferma";
import { colors, font, radius, spacing, spazioPerLaBarra } from "../src/theme";
import { tornaIndietro } from "../src/lib/navigazione";

type Stato = "carico" | "pronto" | "errore";

export default function PianiScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { stato: accesso, scaduta } = useUtente();
  const { profile, currentPlan, pianoAttivoId, setPlan, setPianoAttivoId, updateProfile } =
    useSession();

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
   * Rende attivo un piano e porta ai risultati.
   *
   * Con il piano tornano anche le risposte con cui era stato fatto — città,
   * persone, budget, valuta, stile — o le porzioni e i conti sarebbero quelli
   * dell'ultimo piano invece che di questo.
   *
   * `planExtra` si azzera apposta: di un piano si conservano le ricette e le
   * risposte, non le offerte dei negozi, che scadono. Riproporre i prezzi di
   * tre settimane fa sarebbe dire bugie con la faccia seria; la lista li
   * ricalcola, e intanto mostra la stima.
   */
  function attiva(p: SavedPlan) {
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
    setPianoAttivoId(p.id);
    /* `push` e non `replace`: la freccia indietro deve riportare all'elenco,
       che è da dove si è partiti. */
    router.push("/risultati");
  }

  function cancella(p: SavedPlan) {
    void (async () => {
      const inCorso = p.id === pianoAttivoId;
      const si = await confermaAzione({
        titolo: "Cancellare questo piano?",
        testo: inCorso
          ? `«${p.label}» è il piano che stai usando: sparisce anche dalla home.`
          : p.label,
        conferma: "Cancella",
        distruttiva: true,
      });
      if (!si) return;

      /* Si toglie subito dall'elenco e poi si chiede al server. Aspettare la
         risposta per far sparire una riga fa sembrare l'app lenta; se il
         server rifiuta, il ricaricamento la rimette al suo posto. */
      setPiani((attuali) => attuali.filter((x) => x.id !== p.id));
      /* CANCELLARE IL PIANO IN CORSO LO CANCELLA DAVVERO.
         È il punto che prima non tornava: si svuotava l'elenco e in home
         restava un piano che l'utente credeva di aver buttato. */
      if (inCorso) {
        setPlan(null, null);
      }
      try {
        await getPlanStore().delete(p.id);
      } catch {
        await carica(true);
      }
    })();
  }

  const nuovo = (
    <Button
      label="Crea un piano nuovo"
      icon="sparkles-outline"
      onPress={() => router.push("/onboarding/citta")}
    />
  );

  if (stato === "carico") {
    return (
      <Screen barra>
        <TopBar title="Piani" onBack={() => tornaIndietro()} />
        <Loading text="Carico i tuoi piani…" />
      </Screen>
    );
  }

  if (stato === "errore") {
    return (
      <Screen barra>
        <TopBar title="Piani" onBack={() => tornaIndietro()} />
        <ErrorState
          text="Non riesco a caricare i tuoi piani. I piani non sono persi: è la connessione che manca."
          onRetry={() => void carica()}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} barra>
      <TopBar title="Piani" onBack={() => tornaIndietro()} />

      <ScrollView
        /* Questa schermata scorre per conto suo — `Screen` ha `scroll={false}`
           — quindi il posto per la pillola in fondo lo faccio io. */
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
        showsVerticalScrollIndicator={false}
      >
        {piani.length === 0 ? (
          <View style={styles.vuoto}>
            <View style={styles.vuotoDisco}>
              <Ionicons name="receipt-outline" size={30} color={colors.primary} />
            </View>
            <Title>Ancora nessun piano</Title>
            <Subtitle>Rispondi a sei domande e te ne prepariamo uno.</Subtitle>
            <View style={styles.vuotoBottone}>{nuovo}</View>
          </View>
        ) : (
          <>
            <View style={styles.testa}>
              <Body style={styles.conteggio}>
                {piani.length === 1 ? "Un piano" : `${piani.length} piani`}
                {currentPlan && pianoAttivoId ? " · uno in corso" : ""}
              </Body>
              {nuovo}
            </View>

            {piani.map((p) => (
              <RigaPiano
                key={p.id}
                piano={p}
                inCorso={p.id === pianoAttivoId}
                onApri={() => attiva(p)}
                onCancella={() => cancella(p)}
              />
            ))}

            {accesso !== "dentro" ? (
              <Card style={styles.invito}>
                <Body style={styles.invitoTesto}>
                  Questi piani stanno solo su questo telefono. Con un account li ritrovi ovunque,
                  anche se lo cambi.
                </Body>
                <Button
                  label="Crea un account"
                  variant="secondary"
                  onPress={() => router.push("/registrati")}
                />
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/**
 * Una riga dell'elenco.
 *
 * PERCHE' I NUMERI SONO TRE RIQUADRI E NON UNA FRASE
 * --------------------------------------------------
 * Erano «Spesa 72 · Risparmio 78» dentro una pillola grigia: una frase, e le
 * frasi si leggono, mentre qui serve confrontare. Tre riquadri con
 * l'etichetta sopra e la cifra sotto si scorrono in verticale fra un piano e
 * l'altro — quale ho speso meno? — che è la sola domanda che si fa aprendo
 * questo elenco.
 *
 * Le cifre sono in serif come tutte le cifre dell'app: separa i numeri, che
 * sono il contenuto, dal resto dell'interfaccia che è senza grazie.
 *
 * QUELLO IN CORSO SI VEDE DA LONTANO
 * ----------------------------------
 * Bordo verde e bollino. Senza, in un elenco di righe identiche l'unica
 * informazione che conta davvero — quale sto usando — bisognerebbe indovinarla.
 */
function RigaPiano({
  piano,
  inCorso,
  onApri,
  onCancella,
}: {
  piano: SavedPlan;
  inCorso: boolean;
  onApri: () => void;
  onCancella: () => void;
}) {
  const data = new Date(piano.createdAt);
  /* `textTransform: capitalize` metteva la maiuscola a OGNI parola —
     «Giovedì 17 Settembre» — e in italiano i mesi sono minuscoli. Qui si
     alza solo la prima lettera, che e' l'unica che va alzata. */
  const grezza = data.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const giorno = grezza.charAt(0).toUpperCase() + grezza.slice(1);
  const valuta = piano.form.currency === "GBP" ? "£" : piano.form.currency === "USD" ? "$" : "€";
  const giorni = piano.plan?.mealPlan?.length ?? 0;

  const numeri = [
    {
      testa: "SPESA",
      valore: piano.estimatedSpend > 0 ? valuta + Math.round(piano.estimatedSpend) : "—",
    },
    {
      testa: "RISPARMIO",
      valore: piano.savings > 0 ? valuta + Math.round(piano.savings) : "—",
      acceso: piano.savings > 0,
    },
    { testa: "GIORNI", valore: giorni > 0 ? String(giorni) : "—" },
  ];

  return (
    <Card style={[styles.carta, inCorso && styles.cartaInCorso]}>
      <View style={styles.riga}>
        {/* Il premibile e il cestino sono FRATELLI: un pulsante dentro un
            pulsante l'HTML lo vieta, e sul web React lo segnala. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            inCorso
              ? `${piano.label}, piano in corso. Aprilo`
              : `Rendi attivo il piano ${piano.label}`
          }
          onPress={onApri}
          style={({ pressed }) => [styles.premibile, pressed && styles.premuto]}
        >
          <View style={[styles.disco, inCorso && styles.discoInCorso]}>
            <Ionicons
              name={inCorso ? "radio-button-on" : "receipt-outline"}
              size={19}
              color={inCorso ? colors.primary : colors.mutedForeground}
            />
          </View>
          <View style={styles.testo}>
            <Body style={styles.titolo} numberOfLines={1}>
              {piano.label}
            </Body>
            <Body style={styles.data}>{giorno}</Body>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>

        <Button
          label=""
          nomeAccessibile={`Cancella il piano ${piano.label}`}
          icon="trash-outline"
          variant="ghost"
          onPress={onCancella}
          style={styles.cestino}
        />
      </View>

      <View style={styles.numeri}>
        {numeri.map((n) => (
          <View key={n.testa} style={styles.riquadro}>
            <Body style={styles.riquadroTesta}>{n.testa}</Body>
            <Body style={[styles.riquadroValore, n.acceso && styles.riquadroAcceso]}>
              {n.valore}
            </Body>
          </View>
        ))}
      </View>

      {inCorso ? (
        <View style={styles.bollino}>
          <Ionicons name="checkmark-circle" size={13} color={colors.primary} />
          <Body style={styles.bollinoTesto}>IN CORSO</Body>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  lista: { gap: spacing.md },
  testa: { gap: spacing.sm, marginBottom: spacing.xs },
  conteggio: {
    fontSize: font.size.sm,
    color: colors.mutedForeground,
  },

  vuoto: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxxl },
  vuotoDisco: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.tintaVerde,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  vuotoBottone: { alignSelf: "stretch", marginTop: spacing.lg },

  carta: { gap: spacing.md },
  cartaInCorso: { borderWidth: 1.5, borderColor: colors.primary },

  riga: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  premibile: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  premuto: { opacity: 0.6 },
  disco: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  discoInCorso: { backgroundColor: colors.tintaVerde },
  testo: { flex: 1, gap: 1 },
  titolo: { fontSize: font.size.md, fontWeight: font.weight.semibold },
  data: { fontSize: font.size.sm, color: colors.mutedForeground },
  cestino: { paddingHorizontal: spacing.sm },

  numeri: { flexDirection: "row", gap: spacing.sm },
  riquadro: {
    flex: 1,
    backgroundColor: colors.muted,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  riquadroTesta: {
    fontSize: 10,
    fontWeight: font.weight.semibold,
    letterSpacing: 0.6,
    color: colors.mutedForeground,
  },
  riquadroValore: {
    fontSize: font.size.md,
    fontWeight: font.weight.bold,
    color: colors.foreground,
    marginTop: 1,
  },
  riquadroAcceso: { color: colors.primary },

  bollino: { flexDirection: "row", alignItems: "center", gap: 5 },
  bollinoTesto: {
    fontSize: 10,
    fontWeight: font.weight.semibold,
    letterSpacing: 0.8,
    color: colors.primary,
  },

  invito: { marginTop: spacing.sm },
  invitoTesto: {
    fontSize: font.size.sm,
    color: colors.mutedForeground,
    marginBottom: spacing.sm,
  },
});
