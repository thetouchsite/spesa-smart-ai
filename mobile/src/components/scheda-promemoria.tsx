/**
 * Gli interruttori dei promemoria, in Impostazioni.
 *
 * IL PERMESSO SI CHIEDE QUI, NON ALL'AVVIO
 * ----------------------------------------
 * L'utente ha appena mosso un interruttore chiamato «Cosa si mangia stasera»:
 * sa esattamente per cosa gli si sta chiedendo il permesso, e la finestra del
 * sistema arriva come conseguenza di una sua azione invece che come un
 * agguato. Chiesto all'avvio, prima ancora che sappia cosa fa l'app, si
 * prende un «no» che su iPhone e' definitivo — la seconda volta il sistema
 * non mostra nemmeno la domanda.
 *
 * E SE DICE DI NO, L'INTERRUTTORE TORNA INDIETRO
 * ----------------------------------------------
 * Lasciarlo acceso dopo un permesso negato sarebbe una bugia: l'app
 * mostrerebbe «promemoria attivo» e non arriverebbe mai niente. Torna spento,
 * e sotto compare la sola frase utile — che ormai si cambia idea solo dalle
 * impostazioni del telefono.
 *
 * SENZA PIANO NON SI PUO' ACCENDERE NIENTE
 * ----------------------------------------
 * Non c'e' nessuna cena da annunciare. Invece di lasciare interruttori che
 * non fanno niente, si dice perche' e si offre la strada.
 */

import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { useRouter } from "expo-router";
import { Body, Button, Card, Ionicons, Label } from "./ui";
import { useSession } from "../lib/state/session";
import { usePromemoria } from "../lib/state/promemoria";
import {
  NOTIFICHE_POSSIBILI,
  chiediPermesso,
  statoPermesso,
  type StatoPermesso,
} from "../lib/notifiche";
import { colors, font, radius, spacing } from "../theme";

const ORE_CENA = [17, 18, 19, 20];
const ORE_SPESA = [8, 9, 10, 17];
const GIORNI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export function SchedaPromemoria() {
  const router = useRouter();
  const { currentPlan } = useSession();
  const { cena, oraCena, spesa, giornoSpesa, oraSpesa, imposta } = usePromemoria();
  const [permesso, setPermesso] = useState<StatoPermesso>("da-chiedere");

  useEffect(() => {
    void statoPermesso().then(setPermesso);
  }, []);

  /* Sul web non esistono promemoria programmati: la scheda non compare, come
     gia' succede per l'impronta digitale. Un interruttore che non fa niente
     e' peggio di un interruttore che non c'e'. */
  if (!NOTIFICHE_POSSIBILI) return null;

  async function accendi(quale: "cena" | "spesa", acceso: boolean) {
    if (!acceso) {
      imposta({ [quale]: false } as never);
      return;
    }
    const ok = await chiediPermesso();
    setPermesso(await statoPermesso());
    /* Se il permesso non c'e' l'interruttore NON si accende: mostrarlo acceso
       mentre non arriva niente e' la bugia piu' facile da raccontare. */
    if (!ok) return;
    imposta({ [quale]: true } as never);
  }

  return (
    <Card>
      <Label icon="notifications-outline">Promemoria</Label>

      {!currentPlan ? (
        <View style={stili.senzaPiano}>
          <Body style={stili.nota}>
            Senza un piano non c'è nessuna cena da annunciare. Fanne uno e torna qui.
          </Body>
          <Button
            label="Crea un piano"
            variant="secondary"
            onPress={() => router.push("/onboarding/citta")}
          />
        </View>
      ) : (
        <>
          <View style={stili.riga}>
            <View style={stili.testo}>
              <Body style={stili.titolo}>Cosa si mangia stasera</Body>
              <Body style={stili.nota}>Il piatto del giorno, con la ricetta a un tocco.</Body>
            </View>
            <Switch
              value={cena}
              onValueChange={(v) => void accendi("cena", v)}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          {cena ? (
            <Scelta
              etichetta="ALLE"
              voci={ORE_CENA.map((h) => ({ chiave: String(h), testo: `${h}:00` }))}
              attiva={String(oraCena)}
              onScegli={(k) => imposta({ oraCena: Number(k) })}
            />
          ) : null}

          <View style={stili.filo} />

          <View style={stili.riga}>
            <View style={stili.testo}>
              <Body style={stili.titolo}>Il giorno della spesa</Body>
              <Body style={stili.nota}>Un promemoria prima di uscire, con la lista pronta.</Body>
            </View>
            <Switch
              value={spesa}
              onValueChange={(v) => void accendi("spesa", v)}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          {spesa ? (
            <>
              <Scelta
                etichetta="GIORNO"
                voci={GIORNI.map((g, i) => ({ chiave: String(i), testo: g }))}
                attiva={String(giornoSpesa)}
                onScegli={(k) => imposta({ giornoSpesa: Number(k) })}
              />
              <Scelta
                etichetta="ALLE"
                voci={ORE_SPESA.map((h) => ({ chiave: String(h), testo: `${h}:00` }))}
                attiva={String(oraSpesa)}
                onScegli={(k) => imposta({ oraSpesa: Number(k) })}
              />
            </>
          ) : null}

          {permesso === "no" ? (
            <View style={stili.avviso}>
              <Ionicons
                name="information-circle-outline"
                size={16}
                color={colors.accentForeground}
              />
              <Body style={stili.avvisoTesto}>
                Le notifiche sono bloccate per questa app. Si riattivano dalle impostazioni del
                telefono.
              </Body>
            </View>
          ) : null}
        </>
      )}
    </Card>
  );
}

/**
 * Una fila di pastiglie da scegliere.
 *
 * Non e' un selettore di orario di sistema: quello e' un'altra dipendenza
 * nativa, e per scegliere fra quattro ore ragionevoli sarebbe un cannone su
 * una zanzara. Quattro pastiglie si premono con un dito solo e si leggono
 * senza aprire niente.
 */
function Scelta({
  etichetta,
  voci,
  attiva,
  onScegli,
}: {
  etichetta: string;
  voci: { chiave: string; testo: string }[];
  attiva: string;
  onScegli: (chiave: string) => void;
}) {
  return (
    <View style={stili.scelta}>
      <Body style={stili.sceltaEtichetta}>{etichetta}</Body>
      <View style={stili.pastiglie}>
        {voci.map((v) => {
          const accesa = v.chiave === attiva;
          return (
            <Pressable
              key={v.chiave}
              accessibilityRole="button"
              accessibilityState={{ selected: accesa }}
              onPress={() => onScegli(v.chiave)}
              style={[stili.pastiglia, accesa && stili.pastigliaAccesa]}
            >
              <Body style={[stili.pastigliaTesto, accesa && stili.pastigliaTestoAcceso]}>
                {v.testo}
              </Body>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const stili = StyleSheet.create({
  riga: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  testo: { flex: 1 },
  titolo: { fontSize: font.size.md, fontWeight: font.weight.medium },
  nota: { fontSize: font.size.sm, color: colors.mutedForeground },
  filo: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },

  senzaPiano: { gap: spacing.md },

  scelta: { marginTop: spacing.xs, marginBottom: spacing.sm, gap: spacing.xs },
  sceltaEtichetta: {
    fontSize: 10,
    fontWeight: font.weight.semibold,
    letterSpacing: 0.8,
    color: colors.mutedForeground,
  },
  pastiglie: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  pastiglia: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.muted,
  },
  pastigliaAccesa: { backgroundColor: colors.primary },
  pastigliaTesto: { fontSize: font.size.sm, fontWeight: font.weight.medium },
  pastigliaTestoAcceso: { color: colors.primaryForeground },

  avviso: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    backgroundColor: colors.warningBg,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  avvisoTesto: { flex: 1, fontSize: font.size.sm, color: colors.foreground },
});
