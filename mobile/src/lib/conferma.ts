/**
 * «Sei sicuro?», in una riga e con la faccia dell'app.
 *
 * COME SI USA
 * -----------
 *     if (await confermaAzione({ titolo: "…", conferma: "Cancella" })) { … }
 *
 * Torna una promessa e non una richiamata, cosi' il codice si legge
 * nell'ordine in cui accadono le cose. `Alert.alert` chiedeva una funzione da
 * chiamare dopo, e chi la scriveva finiva per annidare: conferma dentro
 * conferma, e il filo del discorso si perde.
 *
 * DUE FINESTRE DI SISTEMA SCARTATE, E PERCHE'
 * -------------------------------------------
 * `Alert.alert` di React Native, nella versione web, e' letteralmente
 * `class Alert { static alert() {} }`: una funzione vuota. Nel browser si
 * premeva «Cancella» e non succedeva niente — non un errore, non un avviso in
 * console: niente. Il primo rimedio e' stato `window.confirm`, che funziona
 * davvero ma e' la finestra grigia del browser, coi pulsanti in inglese e
 * sopra scritto «localhost:8081 dice». In mezzo a un'app curata sembra un
 * pezzo dimenticato, e per una cosa irreversibile e' il momento peggiore per
 * sembrare improvvisati.
 *
 * Adesso la finestra e' nostra — `components/dialogo.tsx`, montata una volta
 * sola nel layout radice — e questo file e' solo la porta d'ingresso: tiene
 * il nome che i cinque posti che la usano conoscono gia'.
 */

import { useDialogo, type Domanda } from "./state/dialogo";

export type { Domanda };

export function confermaAzione(domanda: Domanda): Promise<boolean> {
  return useDialogo.getState().chiedi(domanda);
}
