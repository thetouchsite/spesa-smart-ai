/**
 * «Sei sicuro?», dove funziona davvero.
 *
 * PERCHE' ESISTE
 * --------------
 * `Alert.alert` di React Native, nella versione web, e' questo:
 *
 *     class Alert { static alert() {} }
 *
 * Una funzione vuota. Non un errore, non un avviso in console: non succede
 * niente. E siccome nell'app ogni cosa irreversibile passava di li' — cancella
 * questo piano, esci dall'account, cancella i miei dati — nel browser quei tre
 * pulsanti erano decorativi. Si premevano, non succedeva niente, e l'unica
 * conclusione ragionevole per chi guardava era che l'app fosse rotta.
 *
 * Il bello e' che il guasto si nasconde nel posto peggiore: nessuno scrive una
 * prova per «cancella», perche' cancellare durante le prove e' scomodo. E un
 * pulsante che non fa niente non lascia tracce nei registri.
 *
 * PERCHE' `window.confirm` E NON UN AVVISO DISEGNATO
 * --------------------------------------------------
 * Perche' un avviso disegnato da noi vuol dire uno stato in piu' per ogni
 * schermata che ne ha uno, e quattro schermate lo hanno. `window.confirm`
 * blocca la pagina, e' del sistema, si chiude con Esc, e chi usa un lettore di
 * schermo lo sente annunciato — tutte cose che un finto avviso fatto con dei
 * `View` va riscritto a mano per avere. Il giorno che ne serve uno con dentro
 * un campo di testo, allora si fa la schermata: e infatti la cancellazione
 * dell'account, che la password la chiede, una schermata ce l'ha gia'.
 *
 * TORNA UNA PROMESSA, NON UNA RICHIAMATA
 * --------------------------------------
 * `Alert.alert` chiede una funzione da chiamare dopo, e chi la scrive finisce
 * per annidare: conferma dentro conferma, e il filo del discorso si perde.
 * Qui si scrive `if (await chiediConferma(...)) { ... }`, che si legge nello
 * stesso ordine in cui accadono le cose.
 */

import { Alert, Platform } from "react-native";

export interface Domanda {
  titolo: string;
  /** La riga sotto: cosa succede davvero, non «questa azione e' irreversibile». */
  testo?: string;
  /** Il testo del pulsante che conferma. Un verbo, non «OK». */
  conferma: string;
  /** Rosso su iPhone, per le cose che non si annullano. */
  distruttiva?: boolean;
  annulla?: string;
}

export function confermaAzione({
  titolo,
  testo,
  conferma,
  distruttiva = false,
  annulla = "Annulla",
}: Domanda): Promise<boolean> {
  if (Platform.OS === "web") {
    /* `window.confirm` non mostra le etichette dei pulsanti — sono quelle del
       browser — quindi la domanda deve bastare da sola: il titolo, cosa
       succede, e infine il verbo, cosi' chi legge sa a cosa dice «OK». */
    const righe = [titolo, testo, conferma + "?"].filter(Boolean);
    try {
      return Promise.resolve(window.confirm(righe.join("\n\n")));
    } catch {
      /* Finestra senza `confirm` (un frame con permessi ridotti): meglio non
         fare niente che fare la cosa irreversibile senza aver chiesto. */
      return Promise.resolve(false);
    }
  }

  return new Promise((risolvi) => {
    Alert.alert(titolo, testo, [
      { text: annulla, style: "cancel", onPress: () => risolvi(false) },
      {
        text: conferma,
        style: distruttiva ? "destructive" : "default",
        onPress: () => risolvi(true),
      },
    ]);
  });
}
