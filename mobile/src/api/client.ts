/**
 * Client HTTP verso `spesa-smart-api`.
 *
 * Sostituisce le server function di TanStack Start, che in React Native non
 * esistono. Il contratto è identico: dove il prototipo faceva
 * `generateAiRecipe({ data })`, qui si fa `post("/ai/recipe", data)` e la
 * risposta ha la stessa forma — così i moduli che le usavano non cambiano.
 *
 * L'indirizzo del backend arriva da `app.json` (`extra.apiUrl`) e in sviluppo
 * si può sovrascrivere con `EXPO_PUBLIC_API_URL`, utile perché su un telefono
 * fisico `localhost` è il telefono stesso: serve l'IP della macchina.
 */

import Constants from "expo-constants";
import { kv } from "../lib/kv";

const TOKEN_KEY = "auth.token";

function baseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  const fromConfig = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  const configured = (fromEnv || fromConfig || "http://localhost:3000").replace(/\/+$/, "");

  // In sviluppo su un telefono fisico, "localhost" e' il telefono stesso: il
  // backend gira sul computer e non risponderebbe mai. L'indirizzo di rete
  // della macchina lo conosce gia' Metro, ma DOVE lo tenga cambia da una
  // versione di Expo all'altra — per questo si provano piu' fonti invece di
  // fidarsi di una sola. Senza, ogni chiamata AI falliva e l'app ricadeva
  // sempre sul motore locale: ricette generiche, in inglese.
  if (__DEV__ && /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(configured)) {
    const port = configured.split(":")[2] ?? "3000";
    const host = metroHost();
    if (host) return `http://${host}:${port}`;
  }
  return configured;
}

/** Indirizzo di rete della macchina che serve il bundle, se ricavabile. */
function metroHost(): string | null {
  const candidates = [
    Constants.expoConfig?.hostUri,
    (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig
      ?.debuggerHost,
    (Constants as unknown as { manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } } })
      .manifest2?.extra?.expoGo?.debuggerHost,
    Constants.experienceUrl,
    // Ultima risorsa: l'URL da cui Metro ha caricato il bundle.
    typeof globalThis !== "undefined"
      ? (globalThis as { __DEV_SERVER_ORIGIN__?: string }).__DEV_SERVER_ORIGIN__
      : undefined,
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    const host = String(raw)
      .replace(/^\w+:\/\//, "")
      .split("/")[0]
      .split(":")[0];
    if (host && host !== "localhost" && host !== "127.0.0.1") return host;
  }
  return null;
}

/** Indirizzo effettivamente usato: mostrato dalla diagnostica in sviluppo. */
export function apiBaseUrl(): string {
  return baseUrl();
}

/** Errore con lo status HTTP, così il chiamante distingue 401 da 503. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getToken(): string | null {
  return kv.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) kv.setItem(TOKEN_KEY, token);
  else kv.removeItem(TOKEN_KEY);
}

export function isLoggedIn(): boolean {
  return getToken() !== null;
}

/**
 * Le chiamate AI possono richiedere parecchi secondi: l'estrazione di una
 * ricetta dal web scarica una pagina e poi interroga il modello. Un timeout
 * generoso evita di annullare richieste che stavano per riuscire, ma esiste
 * perché senza, una rete che non risponde lascerebbe la schermata a girare
 * per sempre.
 *
 * Non vale per tutte le chiamate allo stesso modo, ed è un errore che è
 * costato: il piano completo con la ricerca dei prezzi impiega fra 45 e 85
 * secondi, e questo limite lo troncava a 45. Il server finiva il lavoro — 57
 * secondi, prezzi trovati e verificati — ma l'app aveva già chiuso la
 * connessione e ripiegato sul motore vecchio, mostrando una lista senza
 * prezzi. Da fuori sembrava che il motore nuovo non funzionasse, mentre
 * funzionava benissimo e nessuno lo stava ad ascoltare.
 *
 * Per questo il tempo si passa per chiamata: chi sa quanto durerà la propria
 * lo dichiara.
 */
const TIMEOUT_MS = 45_000;

async function request<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  timeoutMs: number = TIMEOUT_MS,
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  /* LA CHIAVE DELL'API, che e' un'altra cosa dal token dell'utente.
     `Authorization` porta il token di chi ha fatto l'accesso e serve alle liste
     salvate; la chiave dice invece CHI E' L'APPLICAZIONE, e le rotte /v1 la
     pretendono.

     Va in un'intestazione sua perche' le due cose convivono: se si dividessero
     lo stesso posto, una delle due dovrebbe sloggiare, e a perderci sarebbe
     l'utente.

     UNA COSA DA SAPERE. Questa chiave sta dentro il pacchetto che si installa,
     quindi non e' segreta: chi vuole la tira fuori. E' voluto e non e' un
     rischio finche' ha un tetto stretto e si puo' revocare. Il giorno che ci
     sara' un server dell'app, la chiave si sposta li' e da qui sparisce — e'
     scritto in server/API.md. */
  const chiave = process.env.EXPO_PUBLIC_API_KEY;
  if (chiave) headers["X-Api-Key"] = chiave;

  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // Rete assente, DNS, timeout: al chiamante serve un messaggio mostrabile,
    // non "TypeError: Network request failed".
    throw new ApiError(0, "Connessione non riuscita. Verifica la rete e riprova.");
  }

  /**
   * Il corpo si legge DENTRO un try, e per un pezzo non era cosi'.
   *
   * `AbortSignal.timeout` non smette di sorvegliare quando arrivano le
   * intestazioni: se scade mentre il corpo sta ancora scendendo — ed e' il caso
   * delle risposte grosse, i prezzi sono una ventina di kilobyte — a rompersi
   * e' `res.text()`, che stava fuori dal try qui sopra. Il chiamante riceveva
   * un `TimeoutError: signal timed out` grezzo invece del messaggio
   * mostrabile, e finiva stampato come errore rosso in console.
   */
  let text: string;
  try {
    text = await res.text();
  } catch {
    throw new ApiError(0, "Connessione non riuscita. Verifica la rete e riprova.");
  }

  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      /* risposta non JSON: gestita sotto */
    }
  }

  if (!res.ok) {
    const message =
      (payload as { error?: string } | null)?.error ?? `Errore del server (${res.status})`;
    // Una sessione scaduta va ripulita subito, altrimenti ogni schermata
    // continua a inviare un token che il server rifiuta.
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, message);
  }

  return payload as T;
}

export function get<T>(path: string): Promise<T> {
  return request<T>("GET", path);
}

/**
 * Il backend accetta sia `{ data: {...} }` sia l'oggetto diretto. Manteniamo
 * l'involucro `data` perché è la forma che il codice portato già produce.
 */
export function post<T>(path: string, data?: unknown, timeoutMs?: number): Promise<T> {
  return request<T>("POST", path, data === undefined ? undefined : { data }, timeoutMs);
}

/** True se il backend risponde: usato dalla schermata di diagnostica. */
export async function ping(): Promise<{
  ok: boolean;
  aiConfigured: boolean;
  dbConfigured: boolean;
}> {
  try {
    return await get("/health");
  } catch {
    return { ok: false, aiConfigured: false, dbConfigured: false };
  }
}
