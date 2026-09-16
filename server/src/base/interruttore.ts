/**
 * Quando il database non risponde, si smette di chiederglielo.
 *
 * COSA E' SUCCESSO
 * ----------------
 * Messo `MONGODB_URI` su Render, la produzione e' passata da 55 a 146 secondi.
 * Il database c'era ma non rispondeva — l'allowlist di Atlas non conosceva gli
 * indirizzi di Render — e ogni interrogazione aspettava il suo timeout prima di
 * ripiegare: otto insegne per otto secondi di attesa a vuoto, piu' i prezzi.
 *
 * Il ripiego funzionava: nessuna richiesta e' fallita. Ma pagarlo una volta per
 * ogni chiamata ha reso l'app PIU' lenta di quanto fosse senza database, che e'
 * il modo peggiore di sbagliare — la protezione che diventa il danno.
 *
 * COME SI RIPARA
 * --------------
 * Un interruttore. Dopo qualche fallimento di fila si apre e per qualche minuto
 * le chiamate ripiegano SUBITO, senza nemmeno provare. Poi si richiude da solo
 * e si riprova: se nel frattempo il database e' tornato, si riprende a usarlo
 * senza che nessuno debba intervenire.
 *
 * E' la differenza fra «il database e' lento» e «il database e' spento»: la
 * prima si sopporta, la seconda si smette di aspettare.
 *
 * PERCHE' TRE FALLIMENTI E NON UNO
 * --------------------------------
 * Perche' un colpo a vuoto capita: una connessione che cade, un picco di
 * carico, il primo risveglio del cluster. Aprire l'interruttore al primo
 * inciampo vorrebbe dire rinunciare al database per tre minuti ogni volta che
 * la rete tossisce. Tre di fila invece sono un guasto.
 */

/** Quanti fallimenti di fila prima di smettere di provare. */
const SOGLIA = 3;

/** Per quanto si sta senza riprovare. Tre minuti: abbastanza da non pesare, */
/** poco abbastanza da riprendersi da solo dopo un guasto passeggero. */
const PAUSA_MS = 3 * 60_000;

interface Stato {
  fallimenti: number;
  ripartireDopo: number;
}

const stati = new Map<string, Stato>();

function stato(nome: string): Stato {
  let s = stati.get(nome);
  if (!s) {
    s = { fallimenti: 0, ripartireDopo: 0 };
    stati.set(nome, s);
  }
  return s;
}

/** L'interruttore e' aperto? Se si', non vale la pena nemmeno provare. */
export function saltare(nome: string): boolean {
  const s = stato(nome);
  if (s.ripartireDopo === 0) return false;
  if (Date.now() < s.ripartireDopo) return true;

  // Tempo scaduto: si richiude e si concede un tentativo.
  s.ripartireDopo = 0;
  s.fallimenti = 0;
  return false;
}

export function andataBene(nome: string): void {
  const s = stato(nome);
  s.fallimenti = 0;
  s.ripartireDopo = 0;
}

export function andataMale(nome: string): void {
  const s = stato(nome);
  if (++s.fallimenti < SOGLIA) return;
  s.ripartireDopo = Date.now() + PAUSA_MS;
  console.warn(
    `[${nome}] ${SOGLIA} tentativi a vuoto: smetto di provare per ` +
      `${PAUSA_MS / 60_000} minuti. L'app funziona lo stesso, piu' lenta.`,
  );
}

/**
 * Fa la cosa entro il tempo dato, e tiene il conto di com'e' andata.
 *
 * Se l'interruttore e' aperto restituisce il ripiego senza provare: e' tutto
 * il punto: non si aspetta un database che si sa gia' non rispondere.
 */
export async function conInterruttore<T>(
  nome: string,
  attesaMs: number,
  lavoro: () => Promise<T>,
  ripiego: T,
): Promise<T> {
  if (saltare(nome)) return ripiego;

  try {
    let scaduto = false;
    const esito = await Promise.race([
      lavoro(),
      new Promise<T>((r) =>
        setTimeout(() => {
          scaduto = true;
          r(ripiego);
        }, attesaMs),
      ),
    ]);
    if (scaduto) andataMale(nome);
    else andataBene(nome);
    return esito;
  } catch {
    andataMale(nome);
    return ripiego;
  }
}

/** Com'e' messo l'interruttore: serve all'endpoint di stato. */
export function statoInterruttore(nome: string): "chiuso" | "aperto" {
  return saltare(nome) ? "aperto" : "chiuso";
}
