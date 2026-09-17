/**
 * Il cruscotto di chi è entrato: cosa si mangia oggi, e cosa manca.
 *
 * PERCHE' NON LA STESSA HOME DI TUTTI
 * -----------------------------------
 * La home con l'eroe e «Crea il mio piano» è una vetrina: serve a chi non sa
 * ancora cosa fa l'app. A chi è già dentro, con un piano in corso, quella
 * schermata chiede ogni volta di ricominciare da capo — è l'unica cosa che
 * offre — mentre la domanda vera che si fa aprendo l'app alle sette di sera è
 * una sola: **cosa mangio stasera, e ho comprato tutto?**
 *
 * COME SI SA CHE GIORNO E' OGGI
 * -----------------------------
 * I giorni del piano hanno un nome — «Lunedì», «Monday» — e `dayIndex` lo
 * traduce in un numero. Si confronta con oggi e si mostra quel giorno. Se il
 * piano usa nomi che non si riconoscono, si mostra il primo giorno invece di
 * non mostrare niente: un piano c'è, e vedere il giorno sbagliato è meglio che
 * vedere una schermata vuota.
 *
 * COSA MANCA, DAVVERO
 * -------------------
 * Le voci non ancora spuntate nella lista della spesa — le stesse spunte che
 * si salvano da lì. Non è una stima: è quello che l'utente ha detto di non
 * avere ancora preso.
 */

import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Body, Button, Card, Ionicons, Label, Title } from "./ui";
import { DishPhoto } from "./dish-photo";
import { useSession } from "../lib/state/session";
import { useUtente } from "../lib/state/utente";
import { fotoNota } from "../lib/recipes/foto";
import { dayIndex, localDay } from "../lib/days";
import { useI18n } from "../lib/i18n";
import { kv } from "../lib/kv";
import { colors, font, radius, spacing } from "../theme";

const PASTI = [
  { chiave: "breakfast" as const, etichetta: "Colazione", icona: "sunny-outline" as const },
  { chiave: "lunch" as const, etichetta: "Pranzo", icona: "partly-sunny-outline" as const },
  { chiave: "dinner" as const, etichetta: "Cena", icona: "moon-outline" as const },
];

/** La stessa chiave che usa la lista della spesa. */
const CHIAVE_SPUNTE = "spesa.spuntati.v1";

function salutoDelMomento(): string {
  const h = new Date().getHours();
  if (h < 11) return "Buongiorno";
  if (h < 18) return "Buon pomeriggio";
  return "Buonasera";
}

export function CruscottoOggi() {
  const router = useRouter();
  const { language } = useI18n();
  const { currentPlan } = useSession();
  const { utente } = useUtente();

  /* Il giorno di oggi dentro il piano. `getDay()` conta da domenica, i giorni
     del piano da lunedì: la rotazione allinea i due calendari. */
  const oggi = useMemo(() => {
    const giorni = currentPlan?.mealPlan ?? [];
    if (giorni.length === 0) return null;
    const indiceOggi = (new Date().getDay() + 6) % 7;
    return giorni.find((g) => dayIndex(g.day) === indiceOggi) ?? giorni[0];
  }, [currentPlan]);

  /* Le voci non ancora prese. Si leggono dallo stesso posto in cui la lista
     le scrive: due verità sullo stesso fatto diventerebbero due verità
     diverse alla prima occasione. */
  const mancanti = useMemo(() => {
    const voci = currentPlan?.groceryList ?? [];
    if (voci.length === 0) return [];
    let spunte: Record<string, boolean> = {};
    try {
      spunte = JSON.parse(kv.getItem(CHIAVE_SPUNTE) ?? "{}") as Record<string, boolean>;
    } catch {
      spunte = {};
    }
    /* Gli identificativi della lista contengono categoria, nome e posizione.
       Qui basta il nome: se compare in una chiave spuntata, è preso. */
    const presi = new Set(
      Object.entries(spunte)
        .filter(([, v]) => v)
        .map(([k]) => k),
    );
    return voci.filter((v) => ![...presi].some((k) => k.includes(v.name)));
  }, [currentPlan]);

  if (!currentPlan) {
    return (
      <View style={styles.tutto}>
        <View style={styles.testa}>
          <Body style={styles.saluto}>{salutoDelMomento()}</Body>
          <Title>{utente?.displayName || "Bentornato"}</Title>
        </View>
        <Card>
          <Label icon="restaurant-outline">Nessun piano in corso</Label>
          <Body style={styles.vuoto}>
            Rispondi a sei domande e ti preparo il menù della settimana con la lista della spesa
            e i prezzi veri.
          </Body>
          <Button label="Crea il mio piano" onPress={() => router.push("/onboarding/citta")} />
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.tutto}>
      <View style={styles.testa}>
        <Body style={styles.saluto}>
          {salutoDelMomento()}
          {oggi ? ` · ${localDay(oggi.day, language)}` : ""}
        </Body>
        <Title>{utente?.displayName || "Oggi si mangia"}</Title>
      </View>

      {/* I tre pasti di oggi. È la ragione per cui si apre l'app la sera. */}
      {oggi ? (
        <Card>
          <Label icon="today-outline">Oggi</Label>
          {PASTI.map((p) => {
            const piatto = oggi[p.chiave];
            if (!piatto) return null;
            return (
              <Pressable
                key={p.chiave}
                accessibilityRole="button"
                accessibilityLabel={`${p.etichetta}: ${piatto}. Apri la ricetta`}
                onPress={() =>
                  router.push({
                    pathname: "/ricetta",
                    params: { piatto, pasto: p.chiave, giorno: oggi.day },
                  })
                }
                style={({ pressed }) => [styles.pasto, pressed && styles.premuto]}
              >
                <DishPhoto
                  uri={fotoNota(piatto)?.url}
                  nome={piatto}
                  style={styles.miniatura}
                  compatto
                />
                <View style={styles.pastoTesto}>
                  <View style={styles.pastoRiga}>
                    <Ionicons name={p.icona} size={13} color={colors.mutedForeground} />
                    <Body style={styles.pastoEtichetta}>{p.etichetta}</Body>
                  </View>
                  <Body style={styles.pastoNome} numberOfLines={2}>
                    {piatto}
                  </Body>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.border} />
              </Pressable>
            );
          })}
        </Card>
      ) : null}

      {/* Cosa manca. Il numero in grande, i primi nomi sotto: chi sta uscendo
          di casa vuole sapere QUANTO manca, non leggere tredici righe. */}
      <Card>
        <Label icon="cart-outline">La spesa</Label>
        {mancanti.length === 0 ? (
          <View style={styles.fattoRiga}>
            <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
            <Body style={styles.fatto}>Hai preso tutto</Body>
          </View>
        ) : (
          <>
            <Body style={styles.mancaNumero}>
              {mancanti.length === 1 ? "Manca 1 prodotto" : `Mancano ${mancanti.length} prodotti`}
            </Body>
            <Body style={styles.mancaNomi} numberOfLines={2}>
              {mancanti
                .slice(0, 4)
                .map((v) => v.name)
                .join(" · ")}
              {mancanti.length > 4 ? ` · e altri ${mancanti.length - 4}` : ""}
            </Body>
          </>
        )}
        <Button
          label={mancanti.length === 0 ? "Rivedi la lista" : "Apri la lista"}
          variant="secondary"
          onPress={() => router.push("/lista")}
        />
      </Card>

      <View style={styles.scorciatoie}>
        <Button
          label="Menù della settimana"
          icon="calendar-outline"
          variant="ghost"
          onPress={() => router.push("/menu")}
        />
        <Button
          label="Dove conviene comprare"
          icon="storefront-outline"
          variant="ghost"
          onPress={() => router.push("/negozi")}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tutto: { gap: spacing.lg },
  testa: { gap: 2 },
  saluto: { fontSize: font.size.sm, color: colors.mutedForeground },
  vuoto: { fontSize: font.size.sm, color: colors.mutedForeground, marginBottom: spacing.sm },

  pasto: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  premuto: { opacity: 0.7 },
  miniatura: { width: 52, height: 52, borderRadius: radius.md },
  pastoTesto: { flex: 1, gap: 2 },
  pastoRiga: { flexDirection: "row", alignItems: "center", gap: 4 },
  pastoEtichetta: {
    fontSize: font.size.xs,
    color: colors.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  pastoNome: { fontSize: font.size.md, fontWeight: font.weight.medium },

  mancaNumero: { fontSize: font.size.lg, fontWeight: font.weight.semibold },
  mancaNomi: { fontSize: font.size.sm, color: colors.mutedForeground, marginBottom: spacing.sm },
  fattoRiga: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  fatto: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.primary },

  scorciatoie: { gap: spacing.xs },
});
