/**
 * Il modello funziona davvero? — non «c'e' una chiave scritta nell'ambiente».
 *
 * PERCHE' ESISTE
 * --------------
 * `/health` rispondeva `aiConfigured: true` anche quando il modello era morto,
 * e ci ha ingannati due volte nella stessa sera. La quota Google era finita: la
 * chiave c'era ancora, scritta nel file, perfettamente valida come stringa — e
 * `isConfigured()` guarda esattamente quello, se la variabile d'ambiente esiste.
 *
 * Il commento sopra quella funzione dice «usato da /health per non mentire».
 * Faceva il contrario, e in buona fede: rispondeva alla domanda che le era
 * stata fatta. Solo che nessuno voleva sapere se la chiave era SCRITTA. Tutti
 * volevano sapere se FUNZIONAVA.
 *
 * Sono due domande diverse e adesso hanno due risposte diverse.
 *
 * COME LO SA
 * ----------
 * Non lo indovina e non va a chiedere: guarda com'e' andata l'ultima volta che
 * qualcuno ha chiamato per davvero. Una chiamata di prova costerebbe soldi a
 * ogni `/health`, e un monitoraggio che si paga viene spento.
 *
 * Quindi: finche' nessuno ha chiamato, la risposta e' `null` — «non lo so» —
 * che e' un'informazione vera, a differenza di un `true` ottimista.
 *
 * DICE ANCHE PERCHE'
 * ------------------
 * «Non funziona» sono cinque cose diverse e si rimediano in cinque modi: la
 * quota finita si alza, una chiave rifiutata si rigenera, un sovraccarico
 * passa da solo. Un booleano le appiattisce tutte, e chi guarda il
 * monitoraggio alle nove di sera ha bisogno di sapere quale delle cinque.
 */

/** Perche' non ha risposto. Sono i cinque casi che si sono visti davvero. */
export type CausaGuasto =
  | "quota-finita"
  | "chiave-rifiutata"
  | "sovraccarico"
  | "troppo-lento"
  | "rete"
  | "altro";

interface Esito {
  quando: number;
  modello: string;
  ok: boolean;
  causa?: CausaGuasto;
  messaggio?: string;
}

/**
 * Le ultime chiamate. Venti bastano: servono a dire «adesso funziona» o
 * «adesso no», non a fare statistica — quella sta nel diario.
 */
const QUANTE = 20;
const recenti: Esito[] = [];

/**
 * Da un messaggio d'errore al motivo.
 *
 * Le espressioni vengono dagli errori veri che Google ha restituito, non da
 * quel che immaginiamo possa succedere. Quando ne arriva uno nuovo che finisce
 * in `altro`, si aggiunge una riga qui.
 */
export function causaDi(messaggio: string): CausaGuasto {
  const m = messaggio.toLowerCase();
  if (/quota|resource.?exhausted|billing|limit exceeded/.test(m)) return "quota-finita";
  if (/api key|permission|unauthenticated|invalid.?credential|403/.test(m)) return "chiave-rifiutata";
  if (/overload|high demand|unavailable|try again|rate limit|429|503/.test(m)) return "sovraccarico";
  if (/timeout|timed out|aborted|abortsignal/.test(m)) return "troppo-lento";
  if (/fetch failed|econn|enotfound|network|socket/.test(m)) return "rete";
  return "altro";
}

/** Com'e' andata una chiamata. Da chiamare sempre, riuscita o no. */
export function annotaEsito(modello: string, ok: boolean, messaggio?: string): void {
  recenti.push({
    quando: Date.now(),
    modello,
    ok,
    causa: ok ? undefined : causaDi(messaggio ?? ""),
    // Il messaggio intero puo' contenere pezzi della richiesta: se ne tiene
    // un troncone, che basta a capire e non basta a farne uscire dei dati.
    messaggio: ok ? undefined : (messaggio ?? "").slice(0, 200),
  });
  if (recenti.length > QUANTE) recenti.shift();
}

export interface SaluteIA {
  /** La chiave e' scritta nell'ambiente. Dice poco, ma e' il primo requisito. */
  chiave: boolean;
  /**
   * L'ultima chiamata e' riuscita.
   *
   * `null` vuol dire che nessuno ha ancora chiamato da quando il servizio e'
   * acceso — non «si» e non «no». E' la differenza fra non sapere e mentire.
   */
  funziona: boolean | null;
  /** Quando qualcuno ha chiamato l'ultima volta. */
  ultimaChiamata: string | null;
  /** Se l'ultima e' andata male: perche', in una parola. */
  causa: CausaGuasto | null;
  /** E per esteso, per chi deve rimediare. */
  dettaglio: string | null;
  /** Su quante delle ultime chiamate. Una sola andata male puo' essere un caso. */
  ultime: { riuscite: number; fallite: number };
}

export function saluteIA(): SaluteIA {
  const chiave = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
  const ultima = recenti[recenti.length - 1];

  return {
    chiave,
    funziona: ultima ? ultima.ok : null,
    ultimaChiamata: ultima ? new Date(ultima.quando).toISOString() : null,
    causa: ultima && !ultima.ok ? (ultima.causa ?? "altro") : null,
    dettaglio: ultima && !ultima.ok ? (ultima.messaggio ?? null) : null,
    ultime: {
      riuscite: recenti.filter((e) => e.ok).length,
      fallite: recenti.filter((e) => !e.ok).length,
    },
  };
}
