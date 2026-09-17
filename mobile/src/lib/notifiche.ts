/**
 * I promemoria: cosa si mangia stasera, e quando toccherebbe fare la spesa.
 *
 * PERCHE' LOCALI E NON DAL SERVER
 * -------------------------------
 * Perche' il telefono sa gia' tutto quello che serve. Il piano e' li', i
 * giorni sono li', il piatto di giovedi' sera e' li'. Far decidere al server
 * quando dire «stasera orata al forno» vorrebbe dire mandargli il piano di
 * ognuno, tenere i fusi orari di ognuno, e svegliare un processo ogni sera
 * per dire una cosa che il telefono poteva dirsi da solo — offline, anche in
 * aereo. Le notifiche dal server servono per cio' che il telefono NON puo'
 * sapere: che il petto di pollo della tua lista e' sceso di prezzo. Quelle
 * stanno in `notifiche-push.ts` e sono un'altra storia.
 *
 * SETTE NOTIFICHE SETTIMANALI, NON UNA AL GIORNO
 * -----------------------------------------------
 * Una notifica che si ripete ogni giorno puo' avere un testo solo, e il testo
 * qui cambia — lunedi' e' pasta e ceci, giovedi' e' orata. Quindi sono sette
 * promemoria settimanali, uno per giorno della settimana, ognuno col suo
 * piatto. Restano giusti finche' il piano e' quello; quando cambia si
 * riprogramma tutto da capo, e c'e' un punto solo da cui farlo.
 *
 * iOS ne tiene in coda 64. Sette cene piu' la spesa fanno otto.
 *
 * NON SI CHIEDE IL PERMESSO ALL'AVVIO
 * -----------------------------------
 * Il permesso si chiede quando l'utente accende l'interruttore, non quando
 * apre l'app la prima volta. Chiederlo a freddo — prima ancora che sappia
 * cosa fa l'app — e' il modo piu' sicuro di prendersi un «no» che su iPhone
 * e' definitivo: la seconda volta il sistema non mostra nemmeno la domanda, e
 * per cambiare idea bisogna andare nelle impostazioni del telefono.
 *
 * SUL WEB NON ESISTE NIENTE DI TUTTO QUESTO
 * -----------------------------------------
 * Il browser ha le sue notifiche, ma non le sa programmare per giovedi' sera
 * senza un service worker che resti vivo. Qui si dichiara che non si puo' e
 * l'interruttore non compare, come gia' si fa per l'impronta digitale.
 */

import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { dayIndex } from "./days";
import type { Plan } from "./models/plan-schema";

/** Su web non si programma niente: vedi la nota in cima. */
export const NOTIFICHE_POSSIBILI = Platform.OS !== "web";

/** Il canale Android. Senza, su Android 8+ le notifiche non compaiono. */
const CANALE = "promemoria";

export interface Preferenze {
  cena: boolean;
  /** Ora del promemoria della cena, 24h. */
  oraCena: number;
  spesa: boolean;
  /** Giorno della spesa, 0 = lunedi'. */
  giornoSpesa: number;
  oraSpesa: number;
}

export const PREFERENZE_INIZIALI: Preferenze = {
  cena: false,
  oraCena: 18,
  spesa: false,
  giornoSpesa: 5, // sabato
  oraSpesa: 9,
};

/**
 * Da indice nostro (0 = lunedi') a indice di expo-notifications (1 =
 * domenica). Due convenzioni diverse per la stessa cosa: qui si convertono
 * una volta sola, invece di ricordarsene in tre punti.
 */
function aGiornoExpo(indice: number): number {
  return ((indice + 1) % 7) + 1;
}

export type StatoPermesso = "si" | "no" | "da-chiedere";

export async function statoPermesso(): Promise<StatoPermesso> {
  if (!NOTIFICHE_POSSIBILI) return "no";
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === "granted") return "si";
  return canAskAgain ? "da-chiedere" : "no";
}

/** Chiede il permesso. Torna `true` solo se da adesso si puo' notificare. */
export async function chiediPermesso(): Promise<boolean> {
  if (!NOTIFICHE_POSSIBILI) return false;
  const attuale = await Notifications.getPermissionsAsync();
  if (attuale.status === "granted") return true;
  if (!attuale.canAskAgain) return false;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

async function preparaCanale(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CANALE, {
    name: "Promemoria",
    importance: Notifications.AndroidImportance.DEFAULT,
    /* Niente vibrazione insistente: e' un promemoria di cena, non un
       allarme. Il suono di sistema basta. */
    vibrationPattern: [0, 180],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/** I pasti del piano, giorno per giorno, gia' tradotti in indici. */
function cenePerGiorno(piano: Plan): { indice: number; piatto: string; giorno: string }[] {
  const fuori: { indice: number; piatto: string; giorno: string }[] = [];
  for (const g of piano.mealPlan ?? []) {
    const riga = g as unknown as Record<string, string>;
    const piatto = riga.dinner;
    const indice = dayIndex(riga.day ?? "");
    if (!piatto || indice === null) continue;
    /* Un solo promemoria per giorno della settimana: se il piano ha due
       lunedi' — succede coi piani da due settimane — vince il primo, perche'
       due notifiche alla stessa ora dello stesso giorno sono una di troppo. */
    if (fuori.some((x) => x.indice === indice)) continue;
    fuori.push({ indice, piatto, giorno: riga.day });
  }
  return fuori;
}

/**
 * Rifa' da zero la coda dei promemoria.
 *
 * Si cancella tutto e si riprogramma invece di aggiornare il singolo: sono
 * otto notifiche, costa niente, e aggiornare «solo quelle cambiate» vuol dire
 * tenere in giro un registro di cosa c'e' in coda — che prima o poi mente.
 *
 * Torna quante ne ha messe, che serve solo per il registro di sviluppo.
 */
export async function riprogramma(piano: Plan | null, preferenze: Preferenze): Promise<number> {
  if (!NOTIFICHE_POSSIBILI) return 0;

  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!piano) return 0;
  if (!preferenze.cena && !preferenze.spesa) return 0;
  if ((await statoPermesso()) !== "si") return 0;

  await preparaCanale();
  let messe = 0;

  if (preferenze.cena) {
    for (const c of cenePerGiorno(piano)) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Stasera si mangia",
          body: c.piatto,
          /* Il tocco porta alla ricetta di QUEL piatto, non alla home: una
             notifica che apre la schermata iniziale fa rifare all'utente la
             strada che la notifica prometteva di risparmiargli. */
          data: { rotta: "/ricetta", piatto: c.piatto, pasto: "dinner", giorno: c.giorno },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: aGiornoExpo(c.indice),
          hour: preferenze.oraCena,
          minute: 0,
          channelId: CANALE,
        },
      });
      messe++;
    }
  }

  if (preferenze.spesa) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Oggi tocca la spesa",
        /* Non si scrive quanti prodotti mancano: il numero verrebbe da adesso
           e la notifica arriva fra tre giorni. Un numero vecchio detto con
           sicurezza e' peggio di nessun numero. */
        body: "Apri la lista prima di uscire: c'è già tutto, con i prezzi.",
        data: { rotta: "/lista" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: aGiornoExpo(preferenze.giornoSpesa),
        hour: preferenze.oraSpesa,
        minute: 0,
        channelId: CANALE,
      },
    });
    messe++;
  }

  if (__DEV__) console.info(`[notifiche] programmate ${messe}`);
  return messe;
}

export async function annullaTutte(): Promise<void> {
  if (!NOTIFICHE_POSSIBILI) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** Cosa c'è davvero in coda. Serve alla schermata impostazioni per non mentire. */
export async function quanteInCoda(): Promise<number> {
  if (!NOTIFICHE_POSSIBILI) return 0;
  return (await Notifications.getAllScheduledNotificationsAsync()).length;
}
