/**
 * Lista della spesa.
 *
 * Raggruppata per reparto, con le voci spuntabili mentre si fa la spesa —
 * è l'uso reale dell'app, in piedi davanti allo scaffale, e va funzionare
 * con una mano sola.
 *
 * Le spunte vivono solo in questa sessione: legarle al piano salvato ha senso
 * quando ci sarà l'account, così una lista iniziata sul telefono si ritrova
 * anche altrove.
 */

import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Body, Button, Card, Label, Screen, Subtitle, Title } from "../src/components/ui";
import { useSession } from "../src/lib/state/session";
import { colors, font, radius, spacing } from "../src/theme";

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
  const [done, setDone] = useState<Record<string, boolean>>({});

  const cur = profile.currency || "EUR";

  /** Voci raggruppate per reparto, nell'ordine in cui il motore le produce. */
  const groups = useMemo(() => {
    if (!currentPlan) return [];
    const map = new Map<string, typeof currentPlan.groceryList>();
    for (const item of currentPlan.groceryList) {
      const key = item.category || "Altro";
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    return [...map.entries()];
  }, [currentPlan]);

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

  const total = currentPlan.groceryList.reduce((sum, i) => sum + (i.estimatedCost || 0), 0);
  const checked = Object.values(done).filter(Boolean).length;

  return (
    <Screen footer={<Button label="Torna ai risultati" onPress={() => router.back()} />}>
      <View style={styles.head}>
        <Title>Lista della spesa</Title>
        <Subtitle>
          {currentPlan.groceryList.length} prodotti · totale stimato {money(total, cur)}
        </Subtitle>
        {checked > 0 ? (
          <Body style={styles.progress}>
            {checked} di {currentPlan.groceryList.length} nel carrello
          </Body>
        ) : null}
      </View>

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
                {item.estimatedCost > 0 ? (
                  <Body style={styles.price}>{money(item.estimatedCost, cur)}</Body>
                ) : (
                  <Body style={styles.noPrice}>—</Body>
                )}
              </Pressable>
            );
          })}
        </Card>
      ))}

      <Card style={styles.note}>
        <Label>Sui prezzi</Label>
        <Body style={styles.small}>
          Sono stime indicative basate sui prezzi medi del tuo paese, non rilevazioni dai
          supermercati. La verifica del prezzo reale prodotto per prodotto arriverà con
          l'attivazione del servizio dedicato.
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

  note: { backgroundColor: colors.muted, borderRadius: radius.md },
  small: { fontSize: font.size.sm, color: colors.mutedForeground, lineHeight: 20 },
});
