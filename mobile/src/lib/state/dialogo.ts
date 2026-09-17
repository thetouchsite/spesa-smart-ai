/**
 * Le domande dell'app, in un posto solo.
 *
 * PERCHE' UNO STATO GLOBALE PER UN AVVISO
 * ---------------------------------------
 * Chiedere «sei sicuro?» succede dentro una funzione — `cancella(p)`,
 * `wipe()`, `confermaUscita()` — non dentro il disegno. Un avviso fatto con
 * dei componenti vuole l'opposto: uno stato nella schermata, un pezzo di
 * markup in fondo al `return`, e due funzioni per aprire e chiudere. Fatto
 * cinque volte in cinque schermate sono cinque occasioni di scriverlo un po'
 * diverso, e la quinta finisce per non avere il tasto Annulla.
 *
 * Qui l'avviso e' montato una volta sola, nel layout radice, e chi deve
 * chiedere qualcosa scrive una riga:
 *
 *     if (await confermaAzione({ ... })) { ... }
 *
 * Lo stato globale non e' un lusso architetturale: e' quello che permette a
 * una funzione qualsiasi, in qualsiasi file, di far comparire una finestra
 * senza che la sua schermata sappia niente.
 *
 * PERCHE' NON QUELLO DI SISTEMA
 * -----------------------------
 * Perche' su web non esiste: `Alert.alert` di React Native, nella versione
 * web, e' una funzione vuota — si premeva «Cancella» e non succedeva niente.
 * Il ripiego era `window.confirm`, che funziona ma e' una finestra grigia del
 * browser con i pulsanti in inglese e il titolo «localhost:8081 dice». In
 * mezzo a un'app curata sembra un errore di programmazione, e per una cosa
 * irreversibile e' il momento peggiore per sembrare improvvisati.
 */

import { create } from "zustand";

export interface Domanda {
  titolo: string;
  /** Cosa succede davvero. Non «questa azione e' irreversibile». */
  testo?: string;
  /** Il verbo del pulsante che conferma. Mai «OK». */
  conferma: string;
  /** Rosso, per le cose che non si annullano. */
  distruttiva?: boolean;
  annulla?: string;
}

interface StatoDialogo {
  domanda: Domanda | null;
  /** Chi ha chiesto aspetta questa. Si chiama alla risposta, una volta sola. */
  risolvi: ((esito: boolean) => void) | null;
  chiedi: (domanda: Domanda) => Promise<boolean>;
  rispondi: (esito: boolean) => void;
}

export const useDialogo = create<StatoDialogo>((set, get) => ({
  domanda: null,
  risolvi: null,

  chiedi: (domanda) =>
    new Promise<boolean>((risolvi) => {
      /* Se una domanda era gia' aperta la si chiude con un no: due finestre
         sovrapposte non si possono rispondere, e lasciare la promessa vecchia
         appesa vorrebbe dire una funzione ferma per sempre a meta'. */
      const precedente = get().risolvi;
      if (precedente) precedente(false);
      set({ domanda, risolvi });
    }),

  rispondi: (esito) => {
    const risolvi = get().risolvi;
    set({ domanda: null, risolvi: null });
    if (risolvi) risolvi(esito);
  },
}));
