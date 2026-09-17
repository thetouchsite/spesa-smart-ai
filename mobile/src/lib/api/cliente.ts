/**
 * Il modo in cui l'app parla col nostro backend.
 *
 * PERCHE' UN POSTO SOLO
 * ---------------------
 * Fino a ieri l'app chiamava direttamente i fornitori esterni — Nominatim,
 * Overpass, TheMealDB — e ogni file si costruiva la sua `fetch` con la sua
 * scadenza e il suo modo di trattare gli errori. Per il nostro backend serve
 * l'opposto: c'e' un token da allegare a ogni richiesta, e una scadenza della
 * sessione da riconoscere. Sparpagliarli sarebbe il modo sicuro di dimenticarne
 * uno.
 *
 * LA SCADENZA DELLA SESSIONE NON E' UN ERRORE COME GLI ALTRI
 * ----------------------------------------------------------
 * Un 401 non vuol dire «e' andato storto qualcosa»: vuol dire che quel token
 * non vale piu' — e' scaduto, o la password e' stata cambiata da un altro
 * telefono. L'app non deve riprovare: deve dimenticare il token e riportare
 * l'utente all'accesso. Per questo il 401 ha un errore tutto suo, che chi
 * chiama puo' riconoscere senza leggere messaggi.
 */

const BASE = process.env.EXPO_PUBLIC_API_URL ?? "";

/** Venti secondi. Oltre, l'utente ha gia' deciso che non funziona. */
const ATTESA_MS = 20_000;

/** Il token non vale piu'. Chi la riceve deve far riaccedere, non riprovare. */
export class SessioneScaduta extends Error {
  constructor(messaggio = "Sessione scaduta") {
    super(messaggio);
    this.name = "SessioneScaduta";
  }
}

/** Il server ha risposto, ma ha detto di no. Il messaggio e' per l'utente. */
export class RispostaNegativa extends Error {
  constructor(
    readonly stato: number,
    messaggio: string,
  ) {
    super(messaggio);
    this.name = "RispostaNegativa";
  }
}

interface Opzioni {
  /** Il token, quando la rotta lo richiede. */
  token?: string | null;
  corpo?: unknown;
}

export async function chiama<T>(
  metodo: "GET" | "POST",
  percorso: string,
  { token, corpo }: Opzioni = {},
): Promise<T> {
  if (!BASE) {
    throw new RispostaNegativa(0, "Indirizzo del server non configurato (EXPO_PUBLIC_API_URL)");
  }

  let risposta: Response;
  try {
    risposta = await fetch(`${BASE}${percorso}`, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(ATTESA_MS),
    });
  } catch {
    /* Rete assente, server spento, richiesta scaduta: per chi guarda lo schermo
       sono la stessa cosa, e nessuna delle tre si risolve riprovando subito. */
    throw new RispostaNegativa(0, "Il server non risponde. Controlla la connessione.");
  }

  const testo = await risposta.text();
  let dati: unknown = null;
  try {
    dati = testo ? JSON.parse(testo) : null;
  } catch {
    /* Una risposta che non e' JSON e' quasi sempre una pagina di errore del
       proxy davanti al server. Il testo grezzo all'utente non serve. */
    throw new RispostaNegativa(risposta.status, "Risposta del server non leggibile");
  }

  if (risposta.status === 401) {
    throw new SessioneScaduta((dati as { error?: string })?.error ?? "Sessione scaduta");
  }
  if (!risposta.ok) {
    throw new RispostaNegativa(
      risposta.status,
      (dati as { error?: string })?.error ?? "Richiesta non riuscita",
    );
  }
  return dati as T;
}

/* ─────────────────────────── Le rotte dell'utente ─────────────────────────── */

export interface Identita {
  token: string;
  email: string;
  displayName?: string | null;
}

export const utenteApi = {
  registrati: (email: string, password: string, displayName?: string) =>
    chiama<Identita>("POST", "/auth/register", { corpo: { email, password, displayName } }),

  accedi: (email: string, password: string) =>
    chiama<Identita>("POST", "/auth/login", { corpo: { email, password } }),

  chiSono: (token: string) =>
    chiama<{ email: string; displayName: string | null; createdAt: string }>("GET", "/me", {
      token,
    }),

  passwordDimenticata: (email: string) =>
    chiama<{ ok: true; messaggio: string; codiceSoloPerProve?: string }>(
      "POST",
      "/auth/password/dimenticata",
      { corpo: { email } },
    ),

  passwordReimposta: (email: string, codice: string, password: string) =>
    chiama<{ token: string; email: string }>("POST", "/auth/password/reimposta", {
      corpo: { email, codice, password },
    }),

  passwordCambia: (token: string, attuale: string, nuova: string) =>
    chiama<{ token: string }>("POST", "/auth/password/cambia", {
      token,
      corpo: { attuale, nuova },
    }),

  eliminaAccount: (token: string, password: string) =>
    chiama<{ ok: true; pianiCancellati: number }>("POST", "/account/elimina", {
      token,
      corpo: { password },
    }),
};

export interface PianoSalvato {
  id: string;
  label: string;
  profile: Record<string, unknown>;
  plan: Record<string, unknown>;
  estimatedSpend: number;
  savings: number;
  score: number;
  createdAt: string;
  updatedAt: string;
}

export const pianiApi = {
  elenco: (token: string) => chiama<{ plans: PianoSalvato[] }>("GET", "/plans", { token }),

  salva: (
    token: string,
    piano: {
      label: string;
      profile: Record<string, unknown>;
      plan: Record<string, unknown>;
      estimatedSpend?: number;
      savings?: number;
      score?: number;
    },
  ) => chiama<{ id: string }>("POST", "/plans", { token, corpo: piano }),

  cancella: (token: string, id: string) =>
    chiama<{ ok: true }>("POST", "/plans/delete", { token, corpo: { id } }),
};
