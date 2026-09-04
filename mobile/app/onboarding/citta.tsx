/**
 * Onboarding 1/6 — dove fai la spesa.
 *
 * La città determina paese, valuta e tabella prezzi di riferimento, quindi è
 * la prima domanda: tutto il resto ne dipende.
 *
 * Due vie, entrambe già implementate nella logica portata dal prototipo:
 * il GPS (`detectLocation`) e la ricerca testuale (`searchCities`). Il GPS
 * non è obbligatorio — se il permesso viene negato il campo di ricerca resta
 * la strada normale, non un ripiego.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Body, Button, Card, Label, Screen, Subtitle, Title } from "../../src/components/ui";
import { searchCities } from "../../src/lib/location";
import type { CityResult } from "../../src/lib/location/providers/types";
import { detectLocation, type ResolvedLocation } from "../../src/lib/location/geolocate";
import { saveResolvedLocation } from "../../src/lib/location/store";
import { resolveCountry } from "../../src/lib/country";
import { useSession } from "../../src/lib/state/session";
import { colors, font, radius, spacing } from "../../src/theme";
import { uiText } from "../../src/lib/ui-strings";
import { useI18n } from "../../src/lib/i18n";

export default function CittaScreen() {
  const { language } = useI18n();
  /** Testo nella lingua scelta dall'utente. */
  const ui = (t: string) => uiText(t, language);
  const router = useRouter();
  const { updateProfile } = useSession();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CityResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [chosen, setChosen] = useState<ResolvedLocation | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Una richiesta per battitura satura Nominatim e fa scattare il suo limite
  // d'uso. Si attende una pausa, e la richiesta precedente viene annullata.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 3) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      try {
        setResults(await searchCities(term, controller.signal));
      } catch (err) {
        if (!controller.signal.aborted) {
          setNotice("Ricerca non riuscita. Controlla la connessione.");
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const useGps = useCallback(async () => {
    setLocating(true);
    setNotice(null);
    try {
      const found = await detectLocation();
      if (!found) {
        setNotice("Non siamo riusciti a rilevare la posizione. Cerca la città qui sotto.");
        return;
      }
      setChosen(found);
      setQuery(found.city);
      setResults([]);
    } finally {
      setLocating(false);
    }
  }, []);

  function choose(city: CityResult) {
    // `resolveCountry` è l'unica fonte per valuta e nome del paese: se non
    // riconosce il codice restituisce stringhe vuote invece di indovinare,
    // e il passo successivo chiederà il paese all'utente.
    const profile = resolveCountry(city.countryCode);
    setChosen({
      lat: city.lat,
      lon: city.lon,
      city: city.name,
      country: profile?.name ?? "",
      countryCode: profile?.code ?? "",
      region: city.region,
      postcode: city.postcode,
      currency: profile?.currency ?? "",
      source: "manual",
    });
    setQuery(city.name);
    setResults([]);
    setNotice(null);
  }

  function next() {
    if (!chosen) return;
    saveResolvedLocation(chosen);
    // Il profilo va aggiornato QUI, non piu' avanti: prima il paese e la
    // valuta si scrivevano nel passo del budget, ma solo se il budget era
    // ancora vuoto. Chi cambiava citta' dopo aver gia' risposto restava
    // con il paese vecchio: Londra con "Italy - EUR".
    updateProfile({
      city: chosen.city,
      country: chosen.countryCode,
      ...(chosen.currency ? { currency: chosen.currency as never } : {}),
    });
    router.push("/onboarding/persone");
  }

  return (
    <Screen
      footer={
        <Button
          label={chosen ? `Continua con ${chosen.city}` : "Scegli una città"}
          onPress={next}
          disabled={!chosen}
        />
      }
    >
      <View style={styles.head}>
        <Body style={styles.step}>Passo 1 di 6</Body>
        <Title>{ui("Dove fai la spesa?")}</Title>
        <Subtitle>{ui("Serve per usare i prezzi di riferimento del tuo paese e trovare i negozi vicini.")}</Subtitle>
      </View>

      <Button
        label={locating ? "Rilevamento…" : "Usa la mia posizione"}
        variant="secondary"
        loading={locating}
        onPress={useGps}
      />

      <View style={styles.searchBox}>
        <Label>{ui("Oppure cerca la città")}</Label>
        <View style={styles.inputRow}>
          <TextInput
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              setChosen(null);
            }}
            placeholder="Es. Bologna"
            placeholderTextColor={colors.mutedForeground}
            style={styles.input}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel={ui("Cerca la tua città")}
          />
          {searching ? <ActivityIndicator color={colors.primary} style={styles.spinner} /> : null}
        </View>
      </View>

      {notice ? (
        <Card style={styles.notice}>
          <Body style={styles.noticeText}>{notice}</Body>
        </Card>
      ) : null}

      {results.map((city) => (
        <Pressable
          key={city.id}
          onPress={() => choose(city)}
          accessibilityRole="button"
          accessibilityLabel={`${city.name}, ${city.country}`}
          style={({ pressed }) => [styles.result, pressed && styles.resultPressed]}
        >
          <Label>{city.name}</Label>
          <Body style={styles.resultSub}>
            {[city.region, city.country].filter(Boolean).join(" · ")}
          </Body>
        </Pressable>
      ))}

      {query.trim().length >= 3 && !searching && results.length === 0 && !chosen ? (
        <Body style={styles.empty}>{ui("Nessuna città trovata. Prova con un nome più completo.")}</Body>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: spacing.sm, paddingTop: spacing.md },
  step: {
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    color: colors.primary,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  searchBox: { gap: spacing.sm },
  inputRow: { justifyContent: "center" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingRight: spacing.xxl,
    minHeight: 52,
    fontSize: font.size.md,
    color: colors.foreground,
  },
  spinner: { position: "absolute", right: spacing.lg },
  result: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 2,
  },
  resultPressed: { backgroundColor: colors.muted },
  resultSub: { fontSize: font.size.sm, color: colors.mutedForeground },
  notice: { backgroundColor: colors.warningBg },
  noticeText: { fontSize: font.size.sm },
  empty: {
    fontSize: font.size.sm,
    color: colors.mutedForeground,
    textAlign: "center",
    paddingVertical: spacing.lg,
  },
});
