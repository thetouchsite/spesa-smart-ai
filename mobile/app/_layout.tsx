/**
 * Layout radice.
 *
 * L'ORDINE DEGLI IMPORT QUI È SIGNIFICATIVO
 * ----------------------------------------
 * `polyfills` è la prima riga e non è un vezzo: installa `localStorage` come
 * effetto di import. `state/session.ts` configura zustand con
 * `createJSONStorage(() => window.localStorage)`, e quel getter viene
 * valutato al caricamento del modulo. Se i polyfill arrivano dopo, lo storage
 * è `undefined` e la prima scrittura sul profilo muore con
 * "Cannot read property 'setItem' of undefined".
 *
 * Poi, in sequenza:
 *   1. `hydrate()` riempie lo specchio in memoria leggendo AsyncStorage
 *   2. `persist.rehydrate()` fa rileggere a zustand l'archivio ora pieno —
 *      senza questo passaggio il profilo salvato non tornerebbe mai indietro,
 *      perché al caricamento del modulo lo specchio era vuoto
 *   3. solo allora si monta la navigazione
 */

import "../src/lib/polyfills";

import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { I18nProvider, useI18n } from "../src/lib/i18n";
import { hydrate } from "../src/lib/kv";
import { svegliaIlBackend } from "../src/lib/sveglia";
import { useSession } from "../src/lib/state/session";
import { useUtente } from "../src/lib/state/utente";
import { Dialogo } from "../src/components/dialogo";
import { colors, font, spacing } from "../src/theme";
import { uiText } from "../src/lib/ui-strings";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Si bussa PRIMA di leggere l'archivio, e senza aspettare: il backend
    // gratuito impiega un minuto a svegliarsi, e quel minuto deve scorrere
    // mentre l'utente fa l'onboarding, non mentre guarda una rotella.
    svegliaIlBackend();

    (async () => {
      try {
        await hydrate();
        // Ora che lo specchio è pieno, zustand può rileggere davvero.
        await useSession.persist.rehydrate();

        // La sessione dell'account vive in un altro posto — la cassaforte del
        // sistema, non AsyncStorage — e si riprende qui, prima di montare la
        // navigazione. Farlo dopo vorrebbe dire mostrare per un istante
        // l'app da sconosciuti anche a chi è già entrato: un lampeggio che
        // sembra un difetto. Se il server non risponde non butta fuori
        // nessuno: vedi `riprendi` in `state/utente.ts`.
        await useUtente.getState().riprendi();
      } catch (err) {
        // Nemmeno un archivio corrotto deve impedire l'avvio: si riparte
        // vuoti e lo si dice, invece di mostrare una schermata bianca.
        console.warn("[avvio] inizializzazione parziale:", err);
        if (!cancelled) setNotice("Alcune preferenze non sono state caricate.");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <View style={styles.splash}>
        {/* Il nome dell'app non si traduce, ed e' un bene: qui il provider
            della lingua non e' ancora montato — monta dopo l'idratazione,
            perche' deve poter leggere la lingua salvata. */}
        <Text style={styles.splashTitle}>MealMint</Text>
        <ActivityIndicator color={colors.primaryForeground} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      {/* Il provider sta qui e non piu' in basso: la lingua scelta deve
          valere per ogni schermata, compresa quella delle impostazioni che
          la cambia. */}
      <I18nProvider>
        <StatusBar style="dark" />
        {notice ? <Notice /> : null}
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: "slide_from_right",
          }}
        >
          {/* La classifica catene e' un approfondimento, non un passaggio
              del flusso: si apre come foglio dal basso e si chiude con uno
              scorrimento, senza portare l'utente via da dove si trova. */}
          <Stack.Screen name="dove-conviene" options={{ presentation: "modal" }} />

          {/* LE QUATTRO DELLA BARRA NON SCIVOLANO.
              Lo scorrimento da destra racconta un passo avanti: sei qui, ora
              vai li', e per tornare rifai la strada al contrario. Fra queste
              quattro non c'e' nessun passo avanti — sono lo stesso piano
              visto da quattro lati, ed e' esattamente quello che significa
              una barra in basso. Con l'animazione, ogni tocco della pillola
              costava un terzo di secondo e si vedevano due barre scorrere una
              sull'altra: sembrava che la barra sparisse e ne arrivasse
              un'altra. Senza, resta ferma dov'e' e cambia solo il contenuto —
              che e' il modo in cui tutti si aspettano che funzioni.

              Vale anche quando a menu' e lista ci si arriva dai risultati,
              e va bene cosi': dopo il primo piano quelle schermate non sono
              piu' una tappa, sono due dei quattro posti dove si vive. */}
          {["index", "menu", "lista", "piani"].map((nome) => (
            <Stack.Screen key={nome} name={nome} options={{ animation: "none" }} />
          ))}
        </Stack>

        {/* La finestra delle conferme: montata una volta qui, usata da
            chiunque con `confermaAzione`. Sta DOPO lo Stack perche' deve
            disegnarsi sopra qualunque schermata. */}
        <Dialogo />
      </I18nProvider>
    </SafeAreaProvider>
  );
}

/**
 * L'avviso di caricamento parziale.
 *
 * Componente a parte perche' e' l'unico testo del layout che va tradotto, e
 * per tradurlo serve stare DENTRO `I18nProvider`: il componente radice non
 * puo' usare l'hook, visto che e' lui a montare il provider.
 */
function Notice() {
  const { language } = useI18n();
  return (
    <Text style={styles.notice}>
      {uiText("Alcune preferenze non sono state caricate.", language)}
    </Text>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xl,
    backgroundColor: colors.primary,
  },
  splashTitle: {
    color: colors.primaryForeground,
    fontSize: font.size.xxl,
    fontWeight: font.weight.bold,
    letterSpacing: -0.5,
  },
  notice: {
    backgroundColor: colors.warningBg,
    color: colors.foreground,
    fontSize: font.size.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    textAlign: "center",
  },
});
