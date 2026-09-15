/**
 * Svegliare il backend prima che serva.
 *
 * IL PROBLEMA
 * -----------
 * Il piano gratuito di Render spegne il servizio dopo quindici minuti senza
 * traffico, e riaccenderlo prende **circa un minuto**. La prima richiesta dopo
 * una pausa non aspetta tanto: l'app molla a 55 secondi — deve, perché iOS
 * chiude comunque ogni connessione a 60 — e l'utente vede fallire la
 * generazione senza capire perché.
 *
 * È il genere di guasto che si presenta nel momento peggiore: la mattina della
 * demo, alla prima apertura davanti al cliente, e mai mentre si prova.
 *
 * LA SOLUZIONE, CHE È UNA SOLA RIGA DI RETE
 * -----------------------------------------
 * Appena l'app si apre si bussa a `/health`. È una richiesta che non genera
 * niente e non costa niente, ma fa partire il risveglio. Da lì l'utente ha da
 * fare: sei schermate di onboarding, o almeno il tempo di guardare i propri
 * risultati. Quando arriva a chiedere un piano, il server è già in piedi.
 *
 * COSA NON FA
 * -----------
 * Non tiene sveglio niente e non riprova all'infinito: un solo colpo, e se
 * fallisce pazienza. Tenere caldo un servizio con richieste periodiche
 * significherebbe consumare le 750 ore mensili del piano gratuito per tenere
 * acceso un server che nessuno sta usando — e dopo poche settimane il servizio
 * verrebbe sospeso fino al mese dopo. Meglio svegliarlo quando c'è qualcuno.
 *
 * Fuori da Render tutto questo è innocuo: una richiesta a `/health` su un
 * server già acceso costa qualche millisecondo.
 */

const BASE = process.env.EXPO_PUBLIC_API_URL ?? "";

/**
 * Venti secondi.
 *
 * Il risveglio ne prende circa sessanta, quindi questa richiesta quasi sempre
 * scade prima che il servizio sia pronto — e va benissimo: la sveglia è già
 * suonata, il risveglio prosegue sul server anche se noi smettiamo di
 * ascoltare. Aspettare di più terrebbe aperta una connessione per nulla.
 */
const ATTESA_MS = 20_000;

/** Una volta per avvio: bussare due volte non sveglia prima. */
let bussato = false;

/**
 * Bussa al backend, senza aspettare e senza far fallire niente.
 *
 * Non restituisce nulla di utile di proposito: chi la chiama non deve
 * prendere decisioni sull'esito. Se il server è sveglio, bene; se non lo è,
 * lo sarà; se non esiste, le schermate se ne accorgeranno da sole quando
 * chiederanno qualcosa di vero.
 */
export function svegliaIlBackend(): void {
  if (bussato || !BASE) return;
  bussato = true;

  const inizio = Date.now();
  const scadenza = AbortSignal.timeout(ATTESA_MS);

  fetch(`${BASE}/health`, { signal: scadenza })
    .then((res) => {
      const secondi = ((Date.now() - inizio) / 1000).toFixed(1);
      // Sopra i cinque secondi il servizio era quasi certamente spento: è un
      // dato che serve a sapere se la sveglia sta facendo il suo lavoro.
      console.info(
        `[sveglia] backend pronto in ${secondi}s (HTTP ${res.status})` +
          (Number(secondi) > 5 ? " — era spento, ora e' caldo" : ""),
      );
    })
    .catch(() => {
      // Silenzio voluto. Un backend spento, irraggiungibile o inesistente non
      // è un errore da mostrare a chi ha appena aperto l'app: non ha ancora
      // chiesto niente.
      console.info("[sveglia] nessuna risposta: il risveglio prosegue da solo");
    });
}
