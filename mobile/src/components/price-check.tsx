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

import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Body, Button, Label, Title } from "./ui";
import type { Offer, ProductOffers } from "../lib/plan-full";
import { offerteAmazon } from "../lib/amazon";
import { productLabel } from "../lib/price-data/labels";
import { money } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { colors, font, radius, spacing } from "../theme";
import { uiText } from "../lib/ui-strings";

export function PriceCheckSheet({
  itemName,
  searchName,
  offers,
  country,
  onClose,
}: {
  /** Nome del prodotto come compare nella lista. Null = riquadro chiuso. */
  itemName: string | null;
  /**
   * Il termine con cui cercarlo nei negozi, quando diverso da quello mostrato.
   *
   * Un italiano ad Atene legge «Uva da tavola» ma nei negozi greci si cerca
   * «Σταφύλια»: mandando il nome italiano ad Amazon non tornava niente.
   */
  searchName?: string;
  /** Le offerte trovate dal motore per questo prodotto, già dalla più economica. */
  offers: ProductOffers | null;
  /** Serve a cercare sul sito Amazon giusto. */
  country: string;
  onClose: () => void;
}) {
  const { language } = useI18n();
  /** Testo nella lingua scelta dall'utente. */
  const ui = (t: string) => uiText(t, language);

  /**
   * Le offerte Amazon si chiedono solo ora, all'apertura del riquadro.
   *
   * Cercarle per tutta la lista costerebbe un credito a prodotto anche per
   * quelli che nessuno guarda. Così ne paga uno solo chi apre davvero — e il
   * server tiene una cache condivisa, quindi lo stesso prodotto non si paga
   * due volte.
   */
  const [amazon, setAmazon] = useState<Offer[]>([]);
  const [cercandoAmazon, setCercandoAmazon] = useState(false);

  /* AMAZON E' SPENTO, E CON LUI OGNI RICERCA ESTERNA.
     La lista mostra soltanto quello che trova il NOSTRO catalogo: prodotti
     con l'indirizzo scritto dal negozio, che non puo' essere sbagliato.

     Le ricerche esterne — Amazon via SocialCrawl, Google Shopping via
     SerpAPI — davano copertura in cambio di tre cose che non vogliamo:
     prodotti spesso sbagliati (i venditori del marketplace), un credito che
     si consuma a ogni tocco, e una dipendenza da servizi che possono chiudere
     — l'API di Amazon e' stata spenta a maggio, Google Custom Search chiude
     il 1° gennaio 2027.

     Il codice resta: si riaccende togliendo il commento qui sotto e rimettendo
     `amazon` nell'elenco delle righe. Non e' stato cancellato perche' il
     confronto puo' servire di nuovo.

  useEffect(() => {
    if (!itemName) {
      setAmazon([]);
      return;
    }
    let vivo = true;
    setCercandoAmazon(true);
    setAmazon([]);
    void offerteAmazon(searchName || itemName, country)
      .then((o) => {
        if (vivo) setAmazon(o);
      })
      .finally(() => {
        if (vivo) setCercandoAmazon(false);
      });
    return () => {
      vivo = false;
    };
  }, [itemName, searchName, country]);
  */

  /* SOLO IL NOSTRO CATALOGO, e l'ordine mette i prezzi prima.
     Chi ha un prezzo sale, dal piu' economico; chi ha solo il prodotto e il
     link resta sotto — trattare un prezzo mancante come zero lo farebbe
     sembrare l'offerta migliore, che e' la bugia piu' facile da raccontare. */
  const righe = [...(offers?.offerte ?? [])].sort((a, b) => {
    const pa = a.prezzo ?? Number.POSITIVE_INFINITY;
    const pb = b.prezzo ?? Number.POSITIVE_INFINITY;
    return pa - pb;
  });
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

        {righe.length === 0 && cercandoAmazon ? (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.primary} />
            <Body style={styles.emptyText}>{ui("Cerco altri negozi…")}</Body>
          </View>
        ) : righe.length === 0 ? (
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
                {/* La foto del prodotto, quando la fonte la dà: con Google
                    Shopping è il modo più rapido per accorgersi che il
                    risultato non è il prodotto che si cercava. */}
                {o.immagine ? (
                  <Image source={{ uri: o.immagine }} style={styles.thumb} contentFit="contain" />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}>
                    <Ionicons name="cube-outline" size={18} color={colors.mutedForeground} />
                  </View>
                )}
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

            {cercandoAmazon ? (
              <View style={styles.attesa}>
                <ActivityIndicator size="small" color={colors.mutedForeground} />
                <Body style={styles.attesaText}>{ui("Cerco anche su Amazon…")}</Body>
              </View>
            ) : null}

            <Body style={styles.note}>
              {/* NON SI DICE PIU' «VERIFICATI»: non e' sempre vero.
                  Ocado risponde HTTP 202 con un corpo vuoto, Sainsbury's
                  scrive «Page not found» con JavaScript: da server quelle
                  pagine sembrano buone e non lo sono. Promettere un controllo
                  che non abbiamo fatto e' peggio che ammettere il limite —
                  l'utente apre il link, trova un 404, e da quel momento non
                  crede piu' nemmeno ai prezzi giusti. */}
              {ui("I prezzi sono quelli trovati quando hai creato il piano: possono essere cambiati. Alcuni negozi non ci lasciano controllare la pagina, quindi tocca una riga e verifica sul sito.")}
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
  thumb: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.card },
  thumbEmpty: { alignItems: "center", justifyContent: "center", backgroundColor: colors.muted },
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

  attesa: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 10,
  },
  attesaText: { fontSize: font.size.xs, color: colors.mutedForeground },

  note: {
    fontSize: font.size.xs,
    color: colors.mutedForeground,
    lineHeight: 17,
    paddingTop: spacing.sm,
  },
  closeBtn: { marginTop: "auto" },
});
