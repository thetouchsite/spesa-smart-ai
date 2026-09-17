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
import { StyleSheet, View } from "react-native";
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
import { confermaAzione } from "../src/lib/conferma";
import { QuotaDetail } from "../src/components/quota-banner";
import { SchedaAccount } from "../src/components/scheda-account";
import { SchedaPromemoria } from "../src/components/scheda-promemoria";
import { colors, font, spacing } from "../src/theme";
import { uiText } from "../src/lib/ui-strings";
import { tornaIndietro } from "../src/lib/navigazione";

export default function ImpostazioniScreen() {
  /** Testo nella lingua scelta dall'utente. */
  const ui = (t: string) => uiText(t, language);
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
    void (async () => {
      const si = await confermaAzione({
        titolo: "Cancellare i tuoi dati?",
        testo:
          "Verranno rimossi il profilo, il piano salvato e le preferenze da questo telefono. L'operazione non si può annullare.",
        conferma: "Cancella",
        distruttiva: true,
      });
      if (!si) return;
      resetProfile();
      setPlan(null);
      clearResolvedLocation();
      kv.clearPrefix("");
      router.replace("/");
    })();
  }

  return (
    <Screen>
      <TopBar title={ui("Impostazioni")} onBack={() => tornaIndietro()} />

      <View style={styles.head}>
        <Title>Impostazioni</Title>
        <Subtitle>
          {ui("Lingua dell'app, dati del tuo profilo e gestione delle informazioni.")}
        </Subtitle>
      </View>

      <SchedaAccount />

      {/* Subito sotto l'account: sono le due cose che l'utente viene a
          cercare qui, e la lingua puo' aspettare due centimetri. */}
      <SchedaPromemoria />

      <Card>
        <Label icon="language-outline">{ui("Lingua")}</Label>
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
        <Label icon="person-outline">{ui("Il tuo profilo")}</Label>
        <ListRow
          icon="location-outline"
          title={ui("Città")}
          subtitle={location?.city || profile.city || "non impostata"}
          onPress={() => router.push("/onboarding/citta")}
        />
        <ListRow
          icon="globe-outline"
          title={ui("Paese e valuta")}
          subtitle={country ? `${country.name} · ${country.currency}` : "non riconosciuto"}
        />
        <ListRow
          icon="people-outline"
          title={ui("Persone")}
          subtitle={profile.household || "non impostato"}
          onPress={() => router.push("/onboarding/persone")}
        />
        <ListRow
          icon="wallet-outline"
          title={ui("Budget")}
          subtitle={
            profile.budget
              ? `${profile.budget} ${profile.currency} ${profile.frequency === "monthly" ? "al mese" : "a settimana"}`
              : "non impostato"
          }
          onPress={() => router.push("/onboarding/budget")}
        />
        <ListRow
          icon="restaurant-outline"
          title={ui("Stile alimentare")}
          subtitle={profile.style || "non impostato"}
          onPress={() => router.push("/onboarding/stile")}
        />
      </Card>

      <Card>
        <Label icon="storefront-outline">Vicino a te</Label>
        <ListRow
          icon="map-outline"
          title={ui("Supermercati vicini")}
          subtitle={ui("Cerca i negozi alimentari intorno alla tua posizione")}
          onPress={() => router.push("/negozi")}
        />
      </Card>

      {__DEV__ ? (
        <Card>
          <Label icon="speedometer-outline">{ui("Consumo dei servizi (solo sviluppo)")}</Label>
          <QuotaDetail />
        </Card>
      ) : null}

      <Card>
        <Label icon="shield-outline">{ui("I tuoi dati")}</Label>
        <Body style={styles.small}>
          Profilo, piano e preferenze sono salvati solo su questo telefono. Nulla viene inviato a un
          server: quando arriveranno gli account, i dati potranno seguirti fra dispositivi e la
          sincronizzazione sarà una tua scelta.
        </Body>
        <Button
          label={ui("Cancella i miei dati")}
          variant="secondary"
          icon="trash-outline"
          onPress={wipe}
        />
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
