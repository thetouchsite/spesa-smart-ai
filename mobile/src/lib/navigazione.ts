/**
 * Tornare indietro senza rompersi.
 *
 * IL GUASTO
 * ---------
 * Su Android l'app moriva con
 *
 *     The action 'GO_BACK' was not handled by any navigator.
 *     Is there any screen to go back to?
 *
 * e la risposta a quella domanda era: no. Il flusso usa `router.replace` nei
 * due passaggi decisivi — dall'ultimo passo dell'onboarding all'elaborazione,
 * e da lì ai risultati — e `replace` CANCELLA la cronologia. Chi arriva ai
 * risultati non ha più niente dietro di sé. Apre la lista della spesa, preme
 * indietro, e la pila ha una voce sola.
 *
 * Non era un difetto dell'emulatore: succede su ogni telefono, ed è la strada
 * normale di chi genera un piano. Il tasto fisico di Android lo fa senza
 * nemmeno bisogno che si tocchi la freccia in alto.
 *
 * PERCHÉ NON BASTA TOGLIERE `replace`
 * -----------------------------------
 * Perché `replace` lì è giusto: dopo aver generato il piano, tornare alla
 * schermata di attesa significherebbe rigenerarlo — trenta secondi e qualche
 * centesimo — e tornare all'onboarding significherebbe rifare sei domande a
 * cui si è già risposto. La cronologia va tagliata; è il ritorno che deve
 * sapere dove andare quando non c'è nulla dietro.
 *
 * LA REGOLA
 * ---------
 * Se c'è una schermata precedente, ci si torna. Se non c'è, si va dove
 * l'utente si aspetterebbe di finire — dalla ricetta al menù, dalla lista ai
 * risultati, e dal resto alla home. Mai un errore, mai un vicolo cieco.
 */

import { router } from "expo-router";

/**
 * Dove finire quando dietro non c'è niente.
 *
 * Non è una preferenza estetica: è la schermata da cui quella pagina si
 * raggiunge normalmente, così il ritorno sembra un ritorno anche quando è in
 * realtà un salto.
 */
export type Ritorno = "/" | "/risultati" | "/menu" | "/lista";

/**
 * Torna alla schermata precedente, o a `destinazione` se non ce n'è una.
 *
 * `canGoBack()` è la domanda che il navigatore ci fa nell'errore: gliela
 * facciamo noi prima, invece di aspettare che sia lui a lamentarsi.
 */
export function tornaIndietro(destinazione: Ritorno = "/"): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(destinazione);
}
