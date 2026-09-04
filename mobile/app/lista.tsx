/**
 * Lista della spesa.
 *
 * Raggruppata per reparto, con le voci spuntabili mentre si fa la spesa —
 * è l'uso reale dell'app, in piedi davanti allo scaffale, e deve funzionare
 * con una mano sola.
 *
 * DA DOVE ARRIVANO I PREZZI
 * -------------------------
 * Da `pricePlan()`, non da `plan.groceryList`: il motore pasti produce le
 * voci con `estimatedCost` a zero, ed è il motore prezzi ad assegnare gli
 * importi. Leggere la lista grezza faceva mostrare "—" su ogni riga anche
 * quando la copertura era del 100%.
 *
 * `pricePlan` oggi legge la tabella di riferimento inclusa nell'app: nessuna
 * rete, risposta immediata. Quando il backend sarà in linea la stessa
 * funzione userà le fonti reali, e questa schermata non cambia.
 *
 * Le spunte vivono solo in questa sessione: legarle al piano salvato ha senso
 * quando ci sarà l'account, così una lista iniziata sul telefono si ritrova
 * anche altrove.
 */

import { useEffect, useMemo, useState } from "react";
import { Pressable, Share, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  Body,
  Button,
  Card,
  Ionicons,
  Label,
  ListRow,
  Loading,
  Screen,
  Subtitle,
  Title,
  TopBar,
} from "../src/components/ui";
import { useSession } from "../src/lib/state/session";
import { pricePlan } from "../src/lib/price-data/price-engine";
import type { PricingResult } from "../src/lib/price-data";
import { buildShoppingLink } from "../src/lib/shopping-links";
import { defaultRetailerFor } from "../src/lib/shopping-links/retailers";
import { buildWhatsAppMessage } from "../src/lib/export/whatsapp-share";
import { italianLabel, italianCategory } from "../src/lib/price-data/labels";
import { PriceCheckSheet } from "../src/components/price-check";
import { colors, font, radius, spacing } from "../src/theme";

interface Row {
  name: string;
  quantity: string;
  category: string;
  cost: number;
}

function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export default function ListaScreen() {
  const router = useRouter();
  const { currentPlan, profile } = useSession();
  const [pricing, setPricing] = useState<PricingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState<Record<string, boolean>>({});
  // Prodotto per cui si sta verificando il prezzo reale: null = riquadro chiuso.
  const [checking, setChecking] = useState<string | null>(null);

  const cur = profile.currency || "EUR";
  const city = profile.city || "Bologna";
  const country = profile.country || "IT";

  useEffect(() => {
    if (!currentPlan) return;
    let alive = true;
    (async () => {
      try {
        const result = await pricePlan(currentPlan, city, country);
        if (alive) setPricing(result);
      } catch (err) {
        // Senza prezzi la lista resta utile: nomi e quantità ci sono.
        console.warn("[lista] prezzi non disponibili:", err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [currentPlan, city, country]);

  /**
   * Righe con il prezzo risolto. Il motore prezzi restituisce le stesse voci
   * arricchite; se non ha risposto si ricade sulla lista grezza, che ha nomi
   * e quantità ma importi a zero.
   */
  const rows: Row[] = useMemo(() => {
    if (!currentPlan) return [];
    if (pricing?.items?.length) {
      return pricing.items.map((i) => ({
        name: italianLabel(i.name) ?? i.name,
        quantity: i.packQuantity ?? i.quantity,
        category: italianCategory(i.category || "Altro"),
        cost: i.estimatedCost ?? 0,
      }));
    }
    return currentPlan.groceryList.map((g) => ({
      name: italianLabel(g.name) ?? g.name,
      quantity: g.quantity,
      category: italianCategory(g.category || "Altro"),
      cost: g.estimatedCost ?? 0,
    }));
  }, [currentPlan, pricing]);

  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of rows) {
      const list = map.get(row.category);
      if (list) list.push(row);
      else map.set(row.category, [row]);
    }
    return [...map.entries()];
  }, [rows]);

  if (!currentPlan) {
    return (
      <Screen>
        <View style={styles.empty}>
          <Title>Nessuna lista</Title>
          <Subtitle>Crea prima un piano.</Subtitle>
          <Button label="Comincia" onPress={() => router.replace("/onboarding/citta")} />
        </View>
      </Screen>
    );
  }

  const total = rows.reduce((sum, r) => sum + r.cost, 0);
  const checked = Object.values(done).filter(Boolean).length;
  const retailer = defaultRetailerFor(country);

  /**
   * Apre la ricerca del prodotto sul sito della catena, dentro l'app.
   * `buildShoppingLink` conosce oltre quaranta catene su sette paesi: il
   * link porta alla pagina di ricerca del negozio, non a un prezzo — quello
   * arrivera' con il servizio dedicato.
   */
  async function buyOnline(itemName: string) {
    try {
      const link = buildShoppingLink({ itemName, city, country, retailer });
      const url = link.productUrl ?? link.searchUrl;
      if (url) await WebBrowser.openBrowserAsync(url);
    } catch (err) {
      console.warn("[lista] apertura link fallita:", err);
    }
  }

  /** Condivide la lista con il messaggio gia' formattato del prototipo. */
  async function shareList() {
    try {
      const message = buildWhatsAppMessage({
        plan: currentPlan!,
        profile,
        estimatedSpend: total,
        savings: Math.max(0, (Number(profile.budget) || 0) - total),
        language: "it",
      });
      await Share.share({ message });
    } catch (err) {
      console.warn("[lista] condivisione fallita:", err);
    }
  }

  return (
    <Screen
      footer={
        <View style={styles.actions}>
          <Button label="Condividi la lista" icon="share-social-outline" onPress={() => void shareList()} />
          <Button label="Torna ai risultati" variant="ghost" onPress={() => router.back()} />
        </View>
      }
    >
      <TopBar title="Lista della spesa" onBack={() => router.back()} />

      <View style={styles.head}>
        <Title>Lista della spesa</Title>
        <Subtitle>
          {rows.length} prodotti
          {total > 0 ? ` · totale stimato ${money(total, cur)}` : ""}
        </Subtitle>
        {checked > 0 ? (
          <Body style={styles.progress}>
            {checked} di {rows.length} nel carrello
          </Body>
        ) : null}
      </View>

      {loading ? <Loading text="Calcolo i prezzi…" /> : null}

      {groups.map(([category, items]) => (
        <Card key={category}>
          <Label>{category}</Label>
          {items.map((item, i) => {
            const id = `${category}-${item.name}-${i}`;
            const isDone = !!done[id];
            return (
              <Pressable
                key={id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isDone }}
                accessibilityLabel={`${item.name}, ${item.quantity}`}
                onPress={() => setDone((d) => ({ ...d, [id]: !d[id] }))}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <View style={[styles.box, isDone && styles.boxOn]}>
                  {isDone ? <Body style={styles.tick}>✓</Body> : null}
                </View>
                <View style={styles.rowText}>
                  <Body style={[styles.name, isDone && styles.nameDone]}>{item.name}</Body>
                  <Body style={styles.qty}>{item.quantity}</Body>
                </View>
                <View style={styles.rowRight}>
                  {item.cost > 0 ? (
                    <Body style={styles.price}>{money(item.cost, cur)}</Body>
                  ) : (
                    <Body style={styles.noPrice}>—</Body>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Verifica il prezzo reale di ${item.name}`}
                    onPress={() => setChecking(item.name)}
                    hitSlop={10}
                    style={({ pressed }) => [styles.buyBtn, pressed && styles.rowPressed]}
                  >
                    <Ionicons name="pricetag-outline" size={16} color={colors.primary} />
                  </Pressable>
                </View>
              </Pressable>
            );
          })}
        </Card>
      ))}

      <PriceCheckSheet
        itemName={checking}
        country={country}
        onClose={() => setChecking(null)}
      />

      <Card>
        <Label icon="storefront-outline">Compra online</Label>
        {groups.slice(0, 1).map(([, items]) => (
          <ListRow
            key="apri-negozio"
            icon="open-outline"
            title={`Apri ${retailer.name}`}
            subtitle="Cerca il primo prodotto della lista sul sito del negozio"
            onPress={() => void buyOnline(items[0]?.name ?? rows[0]?.name ?? "")}
          />
        ))}
      </Card>

      <Card style={styles.note}>
        <Label icon="information-circle-outline">Sui prezzi e sui link</Label>
        <Body style={styles.small}>
          I prezzi in elenco sono stime indicative basate sui valori medi del tuo paese.
          L'icona accanto a ogni prodotto cerca il <Body style={styles.bold}>prezzo reale</Body>:
          prodotto, importo e venditore veri, con il link per comprarlo. Puoi anche aprire
          direttamente {retailer.name}.
        </Body>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: spacing.sm, paddingTop: spacing.sm },
  empty: { gap: spacing.lg, paddingTop: spacing.xxxl, alignItems: "flex-start" },
  progress: { fontSize: font.size.sm, color: colors.primary, fontWeight: font.weight.semibold },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 52,
    paddingVertical: spacing.sm,
  },
  rowPressed: { opacity: 0.6 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.8,
    borderColor: colors.mutedForeground,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  tick: { color: colors.primaryForeground, fontSize: 14, fontWeight: font.weight.bold },
  rowText: { flex: 1 },
  name: { fontSize: font.size.md, color: colors.foreground },
  nameDone: { textDecorationLine: "line-through", color: colors.mutedForeground },
  qty: { fontSize: font.size.sm, color: colors.mutedForeground },
  price: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.foreground },
  noPrice: { fontSize: font.size.sm, color: colors.mutedForeground },

  actions: { gap: spacing.sm },
  bold: { fontWeight: font.weight.semibold, color: colors.foreground },
  rowRight: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  buyBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.successBg,
  },
  note: { backgroundColor: colors.muted, borderRadius: radius.md },
  small: { fontSize: font.size.sm, color: colors.mutedForeground, lineHeight: 20 },
});
