/**
 * Il regista dei promemoria: non disegna niente, tiene in riga la coda.
 *
 * PERCHE' UN COMPONENTE CHE NON DISEGNA
 * -------------------------------------
 * Perche' deve stare in ascolto di cose che cambiano — il piano, le
 * preferenze, l'account — e in React l'unico modo di ascoltare e' essere
 * montati. Sta nel layout radice, e' montato sempre, e torna `null`.
 *
 * L'alternativa sarebbe riprogrammare da ogni punto che cambia un piano:
 * l'elaborazione, la schermata dei piani quando se ne attiva un altro, il
 * cestino quando si cancella quello in corso. Tre punti oggi, cinque fra un
 * mese, e uno dei cinque dimenticato — con l'app che continua ad annunciare
 * le cene di un piano che non esiste piu'. Qui il punto e' uno.
 *
 * COSA FA, IN ORDINE
 * ------------------
 * 1. Dice al sistema come mostrare una notifica arrivata ad app aperta.
 * 2. Riprogramma la coda ogni volta che il piano o le preferenze cambiano.
 * 3. Porta l'utente dove la notifica prometteva, quando la tocca.
 * 4. Consegna al server il token push, se c'e' un account.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { useSession } from "../lib/state/session";
import { useUtente } from "../lib/state/utente";
import { preferenzeCorrenti, usePromemoria } from "../lib/state/promemoria";
import { NOTIFICHE_POSSIBILI, riprogramma } from "../lib/notifiche";
import { registraToken } from "../lib/notifiche-push";

/**
 * Come si comporta una notifica che arriva mentre l'app e' aperta.
 *
 * Si mostra comunque. L'alternativa — silenzio se l'app e' in primo piano —
 * ha senso per una chat, dove il messaggio lo vedi gia' nella schermata che
 * stai guardando. Qui no: se alle sette di sera stai guardando la lista della
 * spesa e arriva «stasera si mangia orata», quell'informazione non e' sullo
 * schermo, e nasconderla vuol dire perderla.
 */
if (NOTIFICHE_POSSIBILI) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export function Promemoria() {
  const router = useRouter();
  const { currentPlan } = useSession();
  const { token } = useUtente();
  const preferenze = usePromemoria();

  /* La coda si rifa' quando cambia il piano o una preferenza. `JSON.stringify`
     sulle preferenze e non l'oggetto: zustand ne restituisce uno nuovo a ogni
     disegno, e con quello come dipendenza si riprogrammerebbe per sempre. */
  const impronta = JSON.stringify(preferenzeCorrenti(preferenze));
  useEffect(() => {
    if (!NOTIFICHE_POSSIBILI) return;
    void riprogramma(currentPlan, JSON.parse(impronta));
  }, [currentPlan, impronta]);

  /* Il tocco su una notifica. `data.rotta` dice dove andare, e i parametri
     viaggiano con lei: la ricetta ha bisogno di sapere quale piatto. */
  useEffect(() => {
    if (!NOTIFICHE_POSSIBILI) return;
    const iscrizione = Notifications.addNotificationResponseReceivedListener((risposta) => {
      const dati = risposta.notification.request.content.data as Record<string, string>;
      if (!dati?.rotta) return;
      if (dati.rotta === "/ricetta" && dati.piatto) {
        router.push({
          pathname: "/ricetta",
          params: { piatto: dati.piatto, pasto: dati.pasto ?? "dinner", giorno: dati.giorno ?? "" },
        });
        return;
      }
      router.push(dati.rotta as "/lista");
    });
    return () => iscrizione.remove();
  }, [router]);

  /* Il token push si consegna a ogni entrata. Cambia da solo — reinstalli
     l'app, ripristini un backup — e un token vecchio non da' errore: le
     notifiche partono e non arrivano. Vedi `notifiche-push.ts`. */
  const consegnato = useRef<string | null>(null);
  useEffect(() => {
    if (!token || consegnato.current === token) return;
    consegnato.current = token;
    void registraToken(token);
  }, [token]);

  return null;
}
