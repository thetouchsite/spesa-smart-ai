/**
 * Tutti i negozi che vendono un prodotto della lista.
 *
 * Tocchi una riga e vedi dove si trova quel prodotto e a quanto, dal più
 * economico. Ogni riga apre la pagina del negozio.
 *
 * DA DOVE VENGONO QUESTI PREZZI
 * -----------------------------
 * Dal motore con ricerca, arrivati insieme al piano: sono gli stessi prezzi
 * che il server ha già verificato aprendo le pagine una per una. Niente viene
 * cercato adesso — è tutto già in memoria, quindi il riquadro si apre subito
 * e non costa nulla.
 *
 * Prima questo riquadro interrogava Google Shopping, e si vedeva perché non
 * andava bene: per «filetti di merluzzo» proponeva come più conveniente un
 * barattolino Amazon da 105 g a 2,15 CHF accanto a un surgelato svizzero da
 * 19,95. Prodotti diversi, formati diversi, paesi diversi — un confronto che
 * non significa niente. Il motore invece prezza LO STESSO prodotto della
 * lista nei negozi della città dell'utente.
 */

import { Linking, Modal, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Body, Button, Label, Title } from "./ui";
import type { ProductOffers } from "../lib/plan-full";
import { productLabel } from "../lib/price-data/labels";
import { money } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { colors, font, radius, spacing } from "../theme";
import { uiText } from "../lib/ui-strings";

export function PriceCheckSheet({
  itemName,
  offers,
  onClose,
}: {
  /** Nome del prodotto come compare nella lista. Null = riquadro chiuso. */
  itemName: string | null;
  /** Le offerte trovate dal motore per questo prodotto, già dalla più economica. */
  offers: ProductOffers | null;
  onClose: () => void;
}) {
  const { language } = useI18n();
  /** Testo nella lingua scelta dall'utente. */
  const ui = (t: string) => uiText(t, language);

  const righe = offers?.offerte ?? [];
  const migliore = righe[0] ?? null;

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
            <Label icon="pricetag-outline">{ui("Prezzo reale")}</Label>
            <Title style={styles.title}>
              {itemName ? (productLabel(itemName, language) ?? itemName) : ""}
            </Title>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ui("Chiudi")}
            onPress={onClose}
            hitSlop={12}
            style={styles.close}
          >
            <Ionicons name="close" size={22} color={colors.foreground} />
          </Pressable>
        </View>

        {righe.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="information-circle-outline" size={36} color={colors.mutedForeground} />
            <Body style={styles.emptyText}>
              {ui("Nessun negozio online ha questo prodotto a catalogo. Il prezzo non è stato trovato, e preferiamo non inventarlo.")}
            </Body>
          </View>
        ) : (
          <View style={styles.list}>
            {migliore ? (
              <View style={styles.best}>
                <Body style={styles.bestLabel}>{ui("Più conveniente")}</Body>
                <Body style={styles.bestPrice}>
                  {money(migliore.prezzo, migliore.valuta, language)}
                </Body>
                <Body style={styles.bestSource}>
                  {`${ui("da")} ${migliore.negozio}`}
                  {/* Quanto separa il più economico dal più caro: è il motivo
                      per cui questo riquadro esiste. */}
                  {offers?.differenza
                    ? ` · ${ui("risparmi")} ${money(offers.differenza, migliore.valuta, language)}`
                    : ""}
                </Body>
              </View>
            ) : null}

            {righe.map((o, i) => (
              <Pressable
                key={`${o.negozio}-${i}`}
                accessibilityRole="link"
                accessibilityLabel={`${o.nome}, ${o.prezzo} ${o.valuta}, ${o.negozio}`}
                disabled={!o.link}
                onPress={() => o.link && Linking.openURL(o.link).catch(() => {})}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <View style={styles.rowText}>
                  <Body style={styles.rowTitle} numberOfLines={2}>
                    {o.nome}
                  </Body>
                  <Body style={styles.rowSource}>
                    {o.negozio}
                    {/* Il negozio non ci ha lasciato leggere la pagina: il
                        prezzo è quello che l'AI ha visto, non uno confermato
                        da noi, e va detto. */}
                    {o.verifica === "bloccato" ? ` · ${ui("da confermare")}` : ""}
                  </Body>
                </View>
                <View style={styles.rowRight}>
                  <Body style={styles.rowPrice}>{money(o.prezzo, o.valuta, language)}</Body>
                  {/* Il prezzo pieno barrato, quando il prodotto è in offerta. */}
                  {o.prezzoListino && o.scontoPercento ? (
                    <Body style={styles.rowWas}>
                      {`${money(o.prezzoListino, o.valuta, language)} −${o.scontoPercento}%`}
                    </Body>
                  ) : null}
                  {o.link ? <Ionicons name="open-outline" size={15} color={colors.primary} /> : null}
                </View>
              </Pressable>
            ))}

            <Body style={styles.note}>
              {ui("Prezzi trovati sul web quando è stato creato il piano e verificati aprendo la pagina del prodotto. Toccando una riga si apre il negozio.")}
            </Body>
          </View>
        )}

        <Button label={ui("Chiudi")} variant="secondary" onPress={onClose} style={styles.closeBtn} />
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
  rowText: { flex: 1, gap: 1 },
  rowTitle: { fontSize: font.size.sm, color: colors.foreground, lineHeight: 19 },
  rowSource: { fontSize: font.size.xs, color: colors.mutedForeground },
  rowRight: { alignItems: "flex-end", gap: 2 },
  rowPrice: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.foreground },
  rowWas: {
    fontSize: font.size.xs,
    color: colors.mutedForeground,
    textDecorationLine: "line-through",
  },

  note: {
    fontSize: font.size.xs,
    color: colors.mutedForeground,
    lineHeight: 17,
    paddingTop: spacing.sm,
  },
  closeBtn: { marginTop: "auto" },
});
