/**
 * Le notifiche che decide il server: il prezzo sceso, l'offerta trovata.
 *
 * COSA FA IL TELEFONO, E COSA NON FA
 * ----------------------------------
 * Il telefono chiede al sistema un indirizzo a cui essere chiamato — il
 * «token push» — e lo consegna al nostro server. Da li' in poi non fa niente:
 * quando arrivera' una notifica, la mostrera' il sistema operativo, anche ad
 * app chiusa. Tutto il resto — chi notificare, quando, e cosa dire — e'
 * lavoro del server, e sta in `server/src/app/notifiche.ts`.
 *
 * PERCHE' IL TOKEN SI RIMANDA SEMPRE, ANCHE SE NON E' CAMBIATO
 * ------------------------------------------------------------
 * Perche' cambia da solo. Cambia se l'utente reinstalla l'app, se ripristina
 * il telefono da un backup, e ogni tanto senza motivi visibili. Un token
 * vecchio non da' errore: le notifiche partono e non arrivano, e nessuno se
 * ne accorge — ne' l'utente, che non sa cosa si sta perdendo, ne' noi, perche'
 * il servizio risponde «accettato». Rimandarlo a ogni avvio costa una
 * richiesta e toglie di mezzo l'intera categoria di guasti.
 *
 * SERVE UNA BUILD VERA
 * --------------------
 * `getExpoPushTokenAsync` ha bisogno delle credenziali della piattaforma —
 * FCM per Android, APNs per Apple — che esistono solo in una build firmata. In
 * Expo Go su Android non funziona piu' da SDK 53. Qui, se fallisce, non e'
 * un errore da mostrare: e' semplicemente un telefono su cui le push non ci
 * sono ancora, e l'app funziona identica senza.
 *
 * E SENZA ACCOUNT NON SI REGISTRA NIENTE
 * --------------------------------------
 * Un token senza un utente e' un indirizzo senza destinatario: il server non
 * saprebbe di chi e' la lista della spesa da confrontare coi prezzi. Chi non
 * ha un account non ha push, e non e' una limitazione da nascondere — e' il
 * motivo piu' concreto che abbiamo per proporre la registrazione.
 */

import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { chiama } from "./api/cliente";

export const PUSH_POSSIBILI = Platform.OS !== "web";

/**
 * L'indirizzo a cui questo telefono puo' essere chiamato.
 *
 * `null` quando non si puo' avere: emulatore, permesso negato, build senza
 * credenziali. Nessuno di questi e' un guasto da segnalare.
 */
export async function tokenPush(): Promise<string | null> {
  if (!PUSH_POSSIBILI) return null;
  /* Gli emulatori non hanno un servizio di notifica a cui iscriversi: la
     chiamata fallirebbe, e in sviluppo sembrerebbe un baco nostro. */
  if (!Device.isDevice) return null;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  if (!projectId) return null;

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch (err) {
    /* Build senza credenziali della piattaforma, o Expo Go su Android: si
       tace e si va avanti. L'app senza push funziona identica. */
    if (__DEV__) console.info("[push] token non disponibile:", err);
    return null;
  }
}

/**
 * Consegna il token al nostro server, legandolo all'utente che e' entrato.
 *
 * Silenziosa di proposito: se non riesce, l'utente non ha niente da fare e
 * niente da capire. Si riprovera' al prossimo avvio.
 */
export async function registraToken(tokenUtente: string | null): Promise<void> {
  if (!tokenUtente) return;
  const push = await tokenPush();
  if (!push) return;

  try {
    await chiama("POST", "/notifiche/registra", {
      token: tokenUtente,
      corpo: {
        push,
        piattaforma: Platform.OS,
        /* Il fuso serve al server per non mandare un'offerta alle quattro del
           mattino a chi sta in un altro continente. */
        fuso: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    });
  } catch (err) {
    if (__DEV__) console.info("[push] registrazione non riuscita:", err);
  }
}

/** Toglie questo telefono dalla lista: si chiama quando si esce dall'account. */
export async function dimenticaToken(tokenUtente: string | null): Promise<void> {
  if (!tokenUtente) return;
  const push = await tokenPush();
  if (!push) return;
  try {
    await chiama("POST", "/notifiche/dimentica", {
      token: tokenUtente,
      corpo: { push },
    });
  } catch {
    /* Se non riesce, il server lo scoprira' da solo: il servizio di Expo
       risponde «DeviceNotRegistered» per i token morti, ed e' li' che si
       puliscono. */
  }
}
