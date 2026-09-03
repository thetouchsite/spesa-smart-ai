/**
 * Verifica del prezzo reale di un prodotto.
 *
 * Tocchi una riga della lista e l'app cerca quel prodotto su Google Shopping:
 * prezzo vero, venditore vero, link alla pagina d'acquisto. È l'unico punto
 * dell'app dove i numeri non sono stime.
 *
 * PERCHÉ SOLO SU RICHIESTA
 * ------------------------
 * Si paga a ricerca. Valorizzare in automatico una lista da 40 prodotti
 * consumerebbe la quota gratuita in sette liste. Una ricerca per tocco, invece,
 * dura per un'intera dimostrazione — e come esperienza è pure migliore:
 * l'utente verifica quello che gli interessa, non tutto.
 *
 * Se la quota è esaurita o il backend è spento, si spiega cosa è successo
 * invece di mostrare una schermata vuota.
 */

import { useEffect, useState } from "react";
import { Linking, Modal, Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Body, Button, Label, Loading, Title } from "./ui";
import { post, ApiError } from "../api/client";
import { colors, font, radius, spacing } from "../theme";

interface ShoppingItem {
  title: string;
  price: number | null;
  currency: string;
  source: string;
  link: string;
  thumbnail: string;
}

type Result =
  | { ok: true; items: ShoppingItem[] }
  | { ok: false; reason: "not-configured" | "no-results" | "error" };

const REASONS: Record<string, string> = {
  "not-configured":
    "La ricerca dei prezzi reali non è attiva su questo ambiente, oppure la quota gratuita del mese è esaurita.",
  "no-results": "Nessun prodotto trovato per questa voce. Prova con un nome più comune.",
  error: "Ricerca non riuscita. Controlla la connessione e riprova.",
  offline: "Il servizio prezzi non risponde. L'app continua a funzionare con le stime.",
};

function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function PriceCheckSheet({
  itemName,
  country,
  onClose,
}: {
  itemName: string | null;
  country: string;
  onClose: () => void;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!itemName) {
      setResult(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setResult(null);
    (async () => {
      try {
        const res = await post<Result>("/product/shopping", {
          query: itemName,
          country,
          limit: 6,
        });
        if (alive) setResult(res);
      } catch (err) {
        if (!alive) return;
        // 503 = chiave assente o quota finita: e' uno stato previsto, non un
        // guasto, e va spiegato con parole diverse da un errore di rete.
        const reason = err instanceof ApiError && err.status === 503 ? "not-configured" : "error";
        setResult({ ok: false, reason: reason as never });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [itemName, country]);

  const cheapest =
    result?.ok && result.items.length > 0
      ? result.items.reduce((min, i) =>
          (i.price ?? Infinity) < (min.price ?? Infinity) ? i : min,
        )
      : null;

  return (
    <Modal
      visible={!!itemName}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.sheet}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <View style={styles.headerText}>
            <Label icon="pricetag-outline">Prezzo reale</Label>
            <Title style={styles.title}>{itemName}</Title>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chiudi"
            onPress={onClose}
            hitSlop={12}
            style={styles.close}
          >
            <Ionicons name="close" size={22} color={colors.foreground} />
          </Pressable>
        </View>

        {loading ? <Loading text="Cerco il prodotto…" /> : null}

        {!loading && result?.ok === false ? (
          <View style={styles.empty}>
            <Ionicons name="information-circle-outline" size={36} color={colors.mutedForeground} />
            <Body style={styles.emptyText}>{REASONS[result.reason] ?? REASONS.error}</Body>
          </View>
        ) : null}

        {!loading && result?.ok ? (
          <View style={styles.list}>
            {cheapest?.price != null ? (
              <View style={styles.best}>
                <Body style={styles.bestLabel}>Più conveniente</Body>
                <Body style={styles.bestPrice}>{money(cheapest.price, cheapest.currency)}</Body>
                <Body style={styles.bestSource}>da {cheapest.source}</Body>
              </View>
            ) : null}

            {result.items.map((item, i) => (
              <Pressable
                key={`${item.title}-${i}`}
                accessibilityRole="link"
                accessibilityLabel={`${item.title}, ${item.price ?? "prezzo non disponibile"}, da ${item.source}`}
                onPress={() => item.link && Linking.openURL(item.link).catch(() => {})}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                {item.thumbnail ? (
                  <Image source={{ uri: item.thumbnail }} style={styles.thumb} contentFit="contain" />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}>
                    <Ionicons name="cube-outline" size={20} color={colors.mutedForeground} />
                  </View>
                )}
                <View style={styles.rowText}>
                  <Body style={styles.rowTitle} numberOfLines={2}>
                    {item.title}
                  </Body>
                  <Body style={styles.rowSource}>{item.source}</Body>
                </View>
                <View style={styles.rowRight}>
                  <Body style={styles.rowPrice}>
                    {item.price != null ? money(item.price, item.currency) : "—"}
                  </Body>
                  <Ionicons name="open-outline" size={15} color={colors.primary} />
                </View>
              </Pressable>
            ))}

            <Body style={styles.note}>
              Prezzi e venditori da Google Shopping, aggiornati al momento della ricerca. Toccando
              una riga si apre la pagina del negozio.
            </Body>
          </View>
        ) : null}

        <Button label="Chiudi" variant="secondary" onPress={onClose} style={styles.closeBtn} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, gap: spacing.lg },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  headerText: { flex: 1, gap: 4 },
  title: { fontSize: font.size.xl },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },

  empty: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xxxl },
  emptyText: {
    fontSize: font.size.sm,
    color: colors.mutedForeground,
    textAlign: "center",
    lineHeight: 20,
  },

  list: { flex: 1, gap: spacing.sm },
  best: {
    backgroundColor: colors.successBg,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: 2,
  },
  bestLabel: { fontSize: font.size.xs, color: colors.primary, fontWeight: font.weight.semibold },
  bestPrice: {
    fontSize: font.size.xxl,
    fontWeight: font.weight.bold,
    color: colors.primary,
    letterSpacing: -0.8,
  },
  bestSource: { fontSize: font.size.sm, color: colors.mutedForeground },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPressed: { opacity: 0.6 },
  thumb: { width: 46, height: 46, borderRadius: radius.sm, backgroundColor: colors.card },
  thumbEmpty: { alignItems: "center", justifyContent: "center", backgroundColor: colors.muted },
  rowText: { flex: 1, gap: 1 },
  rowTitle: { fontSize: font.size.sm, color: colors.foreground, lineHeight: 19 },
  rowSource: { fontSize: font.size.xs, color: colors.mutedForeground },
  rowRight: { alignItems: "flex-end", gap: 2 },
  rowPrice: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.foreground },

  note: {
    fontSize: font.size.xs,
    color: colors.mutedForeground,
    lineHeight: 17,
    paddingTop: spacing.sm,
  },
  closeBtn: { marginTop: "auto" },
});
