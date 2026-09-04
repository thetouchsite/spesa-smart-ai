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
 * Da settembre 2026 c'è una fonte migliore: quando il piano è stato generato
 * dal motore con ricerca web, `planExtra.prodotti` porta i prezzi VERI di oggi
 * nei negozi della città dell'utente, con il link alla pagina del prodotto e
 * le alternative negli altri supermercati. Il server ha già aperto ogni pagina
 * per controllare che esista, quindi ciò che arriva qui è verificato.
 *
 * Quei prezzi hanno la precedenza. `pricePlan()` resta come ripiego: legge la
 * tabella di riferimento inclusa nell'app — nessuna rete, risposta immediata,
 * ma sono stime, e vengono etichettate come tali.
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
import { productLabel, categoryLabel } from "../src/lib/price-data/labels";
import { money, deviceDefaults } from "../src/lib/format";
import { useI18n } from "../src/lib/i18n";
import { PriceCheckSheet } from "../src/components/price-check";
import { colors, font, radius, spacing } from "../src/theme";
import { uiText } from "../src/lib/ui-strings";

interface Row {
  /** Nome mostrato all'utente, nella sua lingua. */
  name: string;
  /**
   * Nome originale dal catalogo, in inglese.
   *
   * Serve tenerlo separato: la ricerca del prezzo reale deve poter risalire
   * al prodotto, e da "Hähnchenbrustfilet" non ci riesce. Passando il nome
   * gia' tradotto, la ricerca partiva con la parola sbagliata e restituiva
   * negozi di esportazione a prezzi da gastronomia.
   */
  source: string;
  quantity: string;
  category: string;
  cost: number;
  /**
   * Da dove viene il prezzo.
   *
   * "reale" = trovato oggi sul sito del negozio e verificato aprendo la
   * pagina; "stima" = calcolato dalla tabella interna. La differenza va detta
   * all'utente, perché su un prezzo reale può contare e su una stima no.
   */
  kind: "reale" | "stima";
  /** Il negozio, quando il prezzo è reale. */
  store?: string;
  /** Link alla pagina del prodotto: solo se il server è riuscito ad aprirla. */
  link?: string;
  /** Quanti altri negozi hanno lo stesso prodotto a un prezzo diverso. */
  alternatives?: number;
  /** Quanto separa il prezzo migliore dal peggiore fra i negozi. */
  spread?: number | null;
  /** Presenti quando il prodotto è in promozione. */
  wasPrice?: number;
  discountPercent?: number;
  offerUntil?: string;
}

export default function ListaScreen() {
  /** Testo nella lingua scelta dall'utente. */
  const ui = (t: string) => uiText(t, language);
  const router = useRouter();
  const { currentPlan, planExtra, profile } = useSession();
  const { language } = useI18n();
  const [pricing, setPricing] = useState<PricingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState<Record<string, boolean>>({});
  // Prodotto per cui si sta verificando il prezzo reale: null = riquadro chiuso.
  const [checking, setChecking] = useState<string | null>(null);

  // Nessun valore italiano scritto a mano: se il profilo e' vuoto si
  // guarda il dispositivo, cosi' un utente spagnolo non trova l'Italia.
  const fallback = deviceDefaults();
  const cur = profile.currency || fallback.currency;
  const city = profile.city || "";
  const country = profile.country || fallback.country;

  useEffect(() => {
    if (!currentPlan) return;
    let alive = true;
    (async () => {
      try {
        // Con i prezzi veri del motore le stime non servono: sarebbero
        // scartate subito, e intanto la schermata mostrerebbe "Calcolo i
        // prezzi" per niente.
        if (planExtra?.prodotti?.length) return;
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
  }, [currentPlan, city, country, planExtra]);

  /**
   * Righe con il prezzo risolto. Il motore prezzi restituisce le stesse voci
   * arricchite; se non ha risposto si ricade sulla lista grezza, che ha nomi
   * e quantità ma importi a zero.
   */
  const rows: Row[] = useMemo(() => {
    if (!currentPlan) return [];

    // Prima scelta: i prezzi veri del motore con ricerca. Sono gia' nella
    // lingua e nella valuta giuste, gia' confrontati fra i negozi della citta'
    // e gia' verificati aprendo la pagina — non c'e' niente di meglio da
    // mostrare, e nessuna traduzione da fare.
    if (planExtra?.prodotti?.length) {
      const byName = new Map(
        planExtra.prodotti.map((p) => [p.prodotto.trim().toLowerCase(), p]),
      );

      return currentPlan.groceryList.map((g) => {
        const key = `${g.name} ${g.quantity}`.trim().toLowerCase();
        const found = byName.get(key) ?? byName.get(g.name.trim().toLowerCase());
        const best = found?.offerte?.[0];

        if (!best) {
          // Nessun prezzo verificato per questa voce: si mostra senza importo.
          // Un trattino e' onesto, un numero inventato no.
          return {
            name: g.name,
            source: g.name,
            quantity: g.quantity,
            category: g.category || "—",
            cost: 0,
            kind: "reale" as const,
          };
        }

        return {
          name: g.name,
          source: g.name,
          quantity: g.quantity,
          category: g.category || "—",
          cost: best.prezzo,
          kind: "reale" as const,
          store: best.negozio,
          link: best.link || undefined,
          alternatives: Math.max(0, (found?.offerte.length ?? 1) - 1),
          spread: found?.differenza ?? null,
          wasPrice: best.prezzoListino,
          discountPercent: best.scontoPercento,
          offerUntil: best.offertaFinoAl,
        };
      });
    }

    // Ripiego: le stime della tabella interna.
    if (pricing?.items?.length) {
      return pricing.items.map((i) => ({
        name: productLabel(i.name, language) ?? i.name,
        source: i.name,
        quantity: i.packQuantity ?? i.quantity,
        category: categoryLabel(i.category || "Other", language),
        cost: i.estimatedCost ?? 0,
        kind: "stima" as const,
      }));
    }
    return currentPlan.groceryList.map((g) => ({
      name: productLabel(g.name, language) ?? g.name,
      source: g.name,
      quantity: g.quantity,
      category: categoryLabel(g.category || "Other", language),
      cost: g.estimatedCost ?? 0,
      kind: "stima" as const,
    }));
  }, [currentPlan, pricing, planExtra, language]);

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
          <Title>{ui("Nessuna lista")}</Title>
          <Subtitle>{ui("Crea prima un piano.")}</Subtitle>
          <Button label="Comincia" onPress={() => router.replace("/onboarding/citta")} />
        </View>
      </Screen>
    );
  }

  const total = rows.reduce((sum, r) => sum + r.cost, 0);
  const realPrices = rows.some((r) => r.kind === "reale" && r.cost > 0);
  // Dichiarato sempre: un totale parziale spacciato per completo sembrerebbe
  // un affare e sarebbe solo un conto incompleto.
  const senzaPrezzo = rows.filter((r) => r.cost <= 0).length;
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
        language,
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
          <Button label={ui("Condividi la lista")} icon="share-social-outline" onPress={() => void shareList()} />
          <Button label={ui("Torna ai risultati")} variant="ghost" onPress={() => router.back()} />
        </View>
      }
    >
      <TopBar title={ui("Lista della spesa")} onBack={() => router.back()} />

      <View style={styles.head}>
        <Title>{ui("Lista della spesa")}</Title>
        <Subtitle>
          {rows.length} prodotti
          {total > 0
            ? ` · ${realPrices ? "totale" : "totale stimato"} ${money(total, cur, language)}`
            : ""}
        </Subtitle>
        {/* La provenienza dei prezzi non e' un dettaglio tecnico: cambia
            quanto l'utente puo' fidarsi del numero che legge. */}
        {realPrices ? (
          <Body style={styles.realNote}>
            {ui("Prezzi reali di oggi")}
            {planExtra?.meta?.insegneConfrontate
              ? ` · ${planExtra.meta.insegneConfrontate} supermercati confrontati`
              : ""}
            {senzaPrezzo > 0 ? ` · ${senzaPrezzo} voci senza prezzo` : ""}
          </Body>
        ) : null}
        {checked > 0 ? (
          <Body style={styles.progress}>
            {checked} di {rows.length} nel carrello
          </Body>
        ) : null}
      </View>

      {loading ? <Loading text={ui("Calcolo i prezzi…")} /> : null}

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
                  <Body style={styles.qty}>
                    {item.quantity}
                    {item.store ? ` · ${item.store}` : ""}
                  </Body>
                  {/* Le alternative sono il motivo per cui il confronto esiste:
                      va detto in chiaro quanto si risparmia scegliendo qui. */}
                  {item.alternatives ? (
                    <Body style={styles.alt}>
                      {item.spread
                        ? `${item.alternatives} altri negozi · fino a ${money(item.spread, cur, language)} in più`
                        : `disponibile in altri ${item.alternatives} negozi`}
                    </Body>
                  ) : null}
                </View>
                <View style={styles.rowRight}>
                  {item.cost > 0 ? (
                    <>
                      <Body style={styles.price}>{money(item.cost, cur, language)}</Body>
                      {/* Il prezzo barrato accanto allo sconto: e' il modo in
                          cui un'offerta si riconosce a colpo d'occhio. */}
                      {item.wasPrice && item.discountPercent ? (
                        <Body style={styles.offer}>
                          <Body style={styles.was}>{money(item.wasPrice, cur, language)}</Body>
                          {`  −${item.discountPercent}%`}
                        </Body>
                      ) : null}
                    </>
                  ) : (
                    <Body style={styles.noPrice}>—</Body>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Verifica il prezzo reale di ${item.name}`}
                    onPress={() => {
                      // Con un link verificato si va dritti alla pagina del
                      // prodotto; senza, si ricade sulla ricerca del prezzo.
                      if (item.link) void WebBrowser.openBrowserAsync(item.link);
                      else setChecking(item.source);
                    }}
                    hitSlop={10}
                    style={({ pressed }) => [styles.buyBtn, pressed && styles.rowPressed]}
                  >
                    <Ionicons
                      name={item.link ? "open-outline" : "pricetag-outline"}
                      size={16}
                      color={colors.primary}
                    />
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
            subtitle={ui("Cerca il primo prodotto della lista sul sito del negozio")}
            onPress={() => void buyOnline(items[0]?.source ?? rows[0]?.source ?? "")}
          />
        ))}
      </Card>

      <Card style={styles.note}>
        <Label icon="information-circle-outline">{ui("Sui prezzi e sui link")}</Label>
        <Body style={styles.small}>{ui("I prezzi in elenco sono stime indicative basate sui valori medi del tuo paese. L'icona accanto a ogni prodotto cerca il")}<Body style={styles.bold}>prezzo reale</Body>:
          prodotto, importo e venditore veri, con il link per comprarlo. Puoi anche aprire
          direttamente {retailer.name}.
        </Body>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  /** Il negozio alternativo: informazione utile, non deve gridare. */
  alt: {
    fontSize: font.size.xs,
    color: colors.primary,
    marginTop: 2,
  },
  /** Il prezzo pieno, barrato accanto allo sconto. */
  offer: {
    fontSize: font.size.xs,
    color: colors.muted,
    marginTop: 2,
  },
  was: {
    fontSize: font.size.xs,
    color: colors.muted,
    textDecorationLine: "line-through",
  },
  /** La riga che dichiara la provenienza dei prezzi. */
  realNote: {
    fontSize: font.size.xs,
    color: colors.primary,
    marginTop: spacing.xs,
  },
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
