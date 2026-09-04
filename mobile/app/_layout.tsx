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
import { I18nProvider } from "../src/lib/i18n";
import { hydrate } from "../src/lib/kv";
import { useSession } from "../src/lib/state/session";
import { colors, font, spacing } from "../src/theme";
import { uiText } from "../src/lib/ui-strings";
import { useI18n } from "../src/lib/i18n";

export default function RootLayout() {
  const { language } = useI18n();
  /** Testo nella lingua scelta dall'utente. */
  const ui = (t: string) => uiText(t, language);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await hydrate();
        // Ora che lo specchio è pieno, zustand può rileggere davvero.
        await useSession.persist.rehydrate();
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
        <Text style={styles.splashTitle}>{ui("Spesa Smart")}</Text>
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
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
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
        </Stack>
      </I18nProvider>
    </SafeAreaProvider>
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
