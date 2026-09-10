/**
 * Supermercati vicini.
 *
 * Dati reali da OpenStreetMap tramite Overpass: nomi, indirizzi e distanza
 * effettiva in linea d'aria. È una delle poche parti del prototipo che già
 * funzionava davvero, e non richiede né chiavi né backend.
 *
 * Il raggio è regolabile perché la densità di negozi cambia moltissimo fra
 * un centro storico e la campagna: 1 km in centro dà venti risultati, in
 * periferia nessuno.
 */

import { useCallback, useEffect, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import {
  Body,
  Button,
  Card,
  ErrorState,
  Ionicons,
  Label,
  ListRow,
  Loading,
  Pill,
  Screen,
  Subtitle,
  Title,
  TopBar,
} from "../src/components/ui";
import { searchNearbyStores } from "../src/lib/location";
import type { NearbyStore } from "../src/lib/location/providers/types";
import { loadResolvedLocation } from "../src/lib/location/store";
import { colors, font, radius, spacing } from "../src/theme";
import { uiText } from "../src/lib/ui-strings";
import { useI18n } from "../src/lib/i18n";
import { tornaIndietro } from "../src/lib/navigazione";

const RADII = [1, 3, 5, 10];

export default function NegoziScreen() {
  const { language } = useI18n();
  /** Testo nella lingua scelta dall'utente. */
  const ui = (t: string) => uiText(t, language);
  const [radius_, setRadius] = useState(3);
  const [stores, setStores] = useState<NearbyStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const location = loadResolvedLocation();

  const search = useCallback(async () => {
    if (!location) {
      setError("Non sappiamo dove sei. Torna indietro e scegli la città.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const found = await searchNearbyStores({
        lat: location.lat,
        lon: location.lon,
        radiusM: radius_ * 1000,
        limit: 30,
      });
      setStores(found);
      if (found.length === 0) {
        setError(`Nessun negozio entro ${radius_} km. Prova ad allargare il raggio.`);
      }
    } catch (err) {
      console.warn("[negozi] ricerca fallita:", err);
      setError("Ricerca non riuscita. Controlla la connessione.");
    } finally {
      setLoading(false);
    }
  }, [location?.lat, location?.lon, radius_]);

  useEffect(() => {
    void search();
  }, [search]);

  /** Apre l'app mappe del telefono sulle coordinate del negozio. */
  function openMaps(store: NearbyStore) {
    const label = encodeURIComponent(store.name);
    const url = Platform.select({
      ios: `maps://?q=${label}&ll=${store.lat},${store.lon}`,
      android: `geo:${store.lat},${store.lon}?q=${store.lat},${store.lon}(${label})`,
      default: `https://www.openstreetmap.org/?mlat=${store.lat}&mlon=${store.lon}`,
    });
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://www.openstreetmap.org/?mlat=${store.lat}&mlon=${store.lon}`),
    );
  }

  return (
    <Screen>
      <TopBar title="Supermercati vicini" onBack={() => tornaIndietro()} />

      <View style={styles.head}>
        <Title>{ui("Dove fare la spesa")}</Title>
        <Subtitle>
          {location?.city ? `Vicino a ${location.city}` : "Negozi alimentari intorno a te"} · dati
          OpenStreetMap
        </Subtitle>
      </View>

      <View style={styles.radii}>
        {RADII.map((r) => (
          <Pressable
            key={r}
            accessibilityRole="radio"
            accessibilityState={{ selected: radius_ === r }}
            accessibilityLabel={`Raggio ${r} chilometri`}
            onPress={() => setRadius(r)}
            style={({ pressed }) => [
              styles.radiusChip,
              radius_ === r && styles.radiusChipOn,
              pressed && styles.pressed,
            ]}
          >
            <Body style={[styles.radiusText, radius_ === r && styles.radiusTextOn]}>{r} km</Body>
          </Pressable>
        ))}
      </View>

      {loading ? <Loading text="Cerco i negozi…" /> : null}
      {!loading && error ? <ErrorState text={error} onRetry={search} /> : null}

      {!loading && stores.length > 0 ? (
        <Card>
          <Label icon="storefront-outline">{stores.length} negozi trovati</Label>
          {stores.map((s) => (
            <ListRow
              key={s.id}
              icon="cart-outline"
              title={s.name}
              subtitle={[s.address, s.openingHours].filter(Boolean).join(" · ") || undefined}
              onPress={() => openMaps(s)}
              right={
                <View style={styles.distance}>
                  <Body style={styles.distanceText}>
                    {s.distanceKm < 1
                      ? `${Math.round(s.distanceKm * 1000)} m`
                      : `${s.distanceKm.toFixed(1)} km`}
                  </Body>
                  <Ionicons name="navigate-outline" size={15} color={colors.primary} />
                </View>
              }
            />
          ))}
        </Card>
      ) : null}

      {!loading && stores.length > 0 ? (
        <Card style={styles.note}>
          <Label icon="information-circle-outline">Sui dati</Label>
          <Body style={styles.small}>
            Nomi, indirizzi e orari arrivano da OpenStreetMap, una mappa collaborativa: possono
            essere incompleti o non aggiornati. La distanza è in linea d'aria, non il percorso
            stradale.
          </Body>
        </Card>
      ) : null}

      <Button label={ui("Torna indietro")} variant="ghost" onPress={() => tornaIndietro()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: spacing.xs },
  radii: { flexDirection: "row", gap: spacing.sm },
  radiusChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  radiusChipOn: { borderColor: colors.primary, backgroundColor: colors.successBg },
  radiusText: { fontSize: font.size.sm, color: colors.mutedForeground },
  radiusTextOn: { color: colors.primary, fontWeight: font.weight.semibold },
  distance: { alignItems: "flex-end", gap: 2 },
  distanceText: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.foreground },
  pressed: { opacity: 0.8 },
  note: { backgroundColor: colors.muted },
  small: { fontSize: font.size.sm, color: colors.mutedForeground, lineHeight: 20 },
});
