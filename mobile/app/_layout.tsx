/**
 * Layout radice.
 *
 * Fa una cosa che deve avvenire nell'ordine giusto, prima di qualsiasi
 * schermata:
 *
 *   1. `hydrate()` carica l'archivio locale in memoria
 *   2. `installPolyfills()` installa `localStorage` e `navigator.language`,
 *      che il codice portato dal prototipo si aspetta di trovare
 *   3. solo allora monta la navigazione
 *
 * Montare prima significherebbe che una schermata legge un archivio vuoto e,
 * per esempio, mostra l'onboarding a chi aveva già un piano salvato.
 */

import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { hydrate } from "../src/lib/kv";
import { installPolyfills } from "../src/lib/polyfills";
import { colors, font, spacing } from "../src/theme";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await hydrate();
        installPolyfills();
      } catch (err) {
        // Nemmeno un archivio corrotto deve impedire l'avvio: si riparte
        // vuoti e lo si dice, invece di mostrare una schermata bianca.
        console.warn("[avvio] inizializzazione parziale:", err);
        if (!cancelled) setError("Alcune preferenze non sono state caricate.");
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
        <Text style={styles.splashTitle}>Spesa Smart</Text>
        <ActivityIndicator color={colors.primaryForeground} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {error ? <Text style={styles.notice}>{error}</Text> : null}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "slide_from_right",
        }}
      />
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
