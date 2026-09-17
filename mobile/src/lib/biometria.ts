/**
 * Impronta e volto: entrare senza ridigitare la password.
 *
 * COSA FA DAVVERO, PERCHE' SI FRAINTENDE SEMPRE
 * ---------------------------------------------
 * L'impronta NON e' una password e non viene mandata da nessuna parte. Il
 * telefono non ci dice chi sei: ci dice soltanto *sì* o *no*, e quel sì vale
 * solo su quel telefono.
 *
 * Quindi il meccanismo e' questo: quando l'utente accede con email e password,
 * il token finisce nella cassaforte del sistema — Keychain su iPhone, Keystore
 * su Android. Alla riapertura, se l'impronta dice sì, il token si tira fuori e
 * si entra. Se dice no, resta dov'e' e si chiede la password.
 *
 * Il token e' quindi protetto quanto la serratura del telefono, che e' quello
 * che l'utente si aspetta — e non di piu': chi conosce il codice di sblocco del
 * telefono entra anche nell'app. E' il compromesso di ogni app che fa cosi', e
 * vale la pena saperlo invece di crederla piu' forte di quel che e'.
 *
 * SI PUO' SEMPRE FARNE A MENO
 * ---------------------------
 * Un telefono senza lettore, un utente che non l'ha configurato, un permesso
 * negato: sono tutti casi normali, non guasti. Ogni funzione qui dentro
 * risponde «no» senza sollevare eccezioni, e chi chiama ripiega sulla password.
 */

import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

/** Dove vive il token. Una chiave sola: due account insieme non servono. */
const CHIAVE_TOKEN = "mealmint.token";
/** Se l'utente ha acceso lo sblocco rapido. Sta accanto al token, nella stessa cassaforte. */
const CHIAVE_SCELTA = "mealmint.sblocco-rapido";

/** Questo telefono ha un lettore, ed e' stato configurato? */
export async function biometriaDisponibile(): Promise<boolean> {
  try {
    const [haHardware, registrata] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return haHardware && registrata;
  } catch {
    return false;
  }
}

/** Come si chiama, per poterlo scrivere sul pulsante invece di dire «biometria». */
export async function nomeDelSensore(): Promise<string> {
  try {
    const tipi = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (tipi.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return "il riconoscimento del volto";
    }
    if (tipi.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return "l'impronta";
    }
    return "lo sblocco del telefono";
  } catch {
    return "lo sblocco del telefono";
  }
}

/** Chiede la conferma al telefono. Torna `false` anche se l'utente annulla. */
export async function chiediConferma(motivo: string): Promise<boolean> {
  try {
    const esito = await LocalAuthentication.authenticateAsync({
      promptMessage: motivo,
      /* Il codice di sblocco resta una via d'uscita: un dito bagnato non deve
         chiudere fuori l'utente dal proprio account. */
      disableDeviceFallback: false,
      cancelLabel: "Usa la password",
    });
    return esito.success;
  } catch {
    return false;
  }
}

/* ────────────────────────────── La cassaforte ────────────────────────────── */

export async function salvaToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(CHIAVE_TOKEN, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    /* Cassaforte non disponibile: si resta senza sblocco rapido, non si
       blocca l'accesso. L'utente ridigitera' la password, che e' seccante ma
       non rotto. */
  }
}

export async function leggiToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(CHIAVE_TOKEN);
  } catch {
    return null;
  }
}

export async function dimenticaToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(CHIAVE_TOKEN);
  } catch {
    /* Se non si riesce a cancellare, il token scadra' da solo. */
  }
}

/** L'utente vuole lo sblocco rapido? Di serie no: si accende apposta. */
export async function sbloccoRapidoAcceso(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(CHIAVE_SCELTA)) === "1";
  } catch {
    return false;
  }
}

export async function impostaSbloccoRapido(acceso: boolean): Promise<void> {
  try {
    if (acceso) await SecureStore.setItemAsync(CHIAVE_SCELTA, "1");
    else await SecureStore.deleteItemAsync(CHIAVE_SCELTA);
  } catch {
    /* vedi sopra */
  }
}
