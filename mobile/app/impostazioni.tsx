/**
 * Impostazioni: lingua, paese, dati.
 *
 * Il prototipo aveva un selettore lingua costruito su Radix e Tailwind, che
 * su mobile non si porta. Qui la stessa funzione, con l'elenco a piena
 * larghezza: su un telefono è più comodo di un menù a tendina.
 *
 * Le cinque lingue e le loro etichette arrivano da `i18n/translations.ts`,
 * il file che il prototipo ha già completo — circa duemila righe tradotte
 * che non c'era motivo di rifare.
 */

import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import {
  Body,
  Button,
  Card,
  Ionicons,
  Label,
  ListRow,
  Screen,
  Subtitle,
  Title,
  TopBar,
} from "../src/components/ui";
import { LANGUAGES, LANGUAGE_LABEL, type Language } from "../src/lib/i18n";
import { useI18n } from "../src/lib/i18n";
import { useSession } from "../src/lib/state/session";
import { resolveCountry } from "../src/lib/country";
import { loadResolvedLocation, clearResolvedLocation } from "../src/lib/location/store";
import { kv } from "../src/lib/kv";
import { QuotaDetail } from "../src/components/quota-banner";
import { colors, font, spacing } from "../src/theme";

export default function ImpostazioniScreen() {
  const router = useRouter();
  const { language, setLanguage } = useI18n();
  const { profile, resetProfile, setPlan } = useSession();
  const [saved, setSaved] = useState<string | null>(null);

  const location = loadResolvedLocation();
  const country = resolveCountry(profile.country);

  function choose(lang: Language) {
    setLanguage(lang);
    setSaved(LANGUAGE_LABEL[lang]);
    setTimeout(() => setSaved(null), 2000);
  }

  /**
   * Cancella tutto: profilo, piano e cache locali. È anche il primo passo
   * verso la cancellazione account, che Apple e Google impongono per ogni
   * app con registrazione — oggi non c'è account, ma i dati sì.
   */
  function wipe() {
    Alert.alert(
      "Cancellare i tuoi dati?",
      "Verranno rimossi il profilo, il piano salvato e le preferenze da questo telefono. L'operazione non si può annullare.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Cancella",
          style: "destructive",
          onPress: () => {
            resetProfile();
            setPlan(null);
            clearResolvedLocation();
            kv.clearPrefix("");
            router.replace("/");
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <TopBar title="Impostazioni" onBack={() => router.back()} />

      <View style={styles.head}>
        <Title>Impostazioni</Title>
        <Subtitle>Lingua dell'app, dati del tuo profilo e gestione delle informazioni.</Subtitle>
      </View>

      <Card>
        <Label icon="language-outline">Lingua</Label>
        {LANGUAGES.map((lang) => (
          <ListRow
            key={lang}
            title={LANGUAGE_LABEL[lang]}
            onPress={() => choose(lang)}
            right={
              language === lang ? (
                <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
              ) : (
                <Ionicons name="ellipse-outline" size={22} color={colors.border} />
              )
            }
          />
        ))}
        {saved ? <Body style={styles.saved}>Lingua impostata su {saved}</Body> : null}
      </Card>

      <Card>
        <Label icon="person-outline">Il tuo profilo</Label>
        <ListRow
          icon="location-outline"
          title="Città"
          subtitle={location?.city || profile.city || "non impostata"}
          onPress={() => router.push("/onboarding/citta")}
        />
        <ListRow
          icon="globe-outline"
          title="Paese e valuta"
          subtitle={country ? `${country.name} · ${country.currency}` : "non riconosciuto"}
        />
        <ListRow
          icon="people-outline"
          title="Persone"
          subtitle={profile.household || "non impostato"}
          onPress={() => router.push("/onboarding/persone")}
        />
        <ListRow
          icon="wallet-outline"
          title="Budget"
          subtitle={
            profile.budget
              ? `${profile.budget} ${profile.currency} ${profile.frequency === "monthly" ? "al mese" : "a settimana"}`
              : "non impostato"
          }
          onPress={() => router.push("/onboarding/budget")}
        />
        <ListRow
          icon="restaurant-outline"
          title="Stile alimentare"
          subtitle={profile.style || "non impostato"}
          onPress={() => router.push("/onboarding/stile")}
        />
      </Card>

      <Card>
        <Label icon="storefront-outline">Vicino a te</Label>
        <ListRow
          icon="map-outline"
          title="Supermercati vicini"
          subtitle="Cerca i negozi alimentari intorno alla tua posizione"
          onPress={() => router.push("/negozi")}
        />
      </Card>

      {__DEV__ ? (
        <Card>
          <Label icon="speedometer-outline">Consumo dei servizi (solo sviluppo)</Label>
          <QuotaDetail />
        </Card>
      ) : null}

      <Card>
        <Label icon="shield-outline">I tuoi dati</Label>
        <Body style={styles.small}>
          Profilo, piano e preferenze sono salvati solo su questo telefono. Nulla viene inviato a
          un server: quando arriveranno gli account, i dati potranno seguirti fra dispositivi e
          la sincronizzazione sarà una tua scelta.
        </Body>
        <Button label="Cancella i miei dati" variant="secondary" icon="trash-outline" onPress={wipe} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: spacing.xs },
  saved: {
    fontSize: font.size.sm,
    color: colors.primary,
    fontWeight: font.weight.semibold,
    paddingTop: spacing.xs,
  },
  small: { fontSize: font.size.sm, color: colors.mutedForeground, lineHeight: 20 },
});
