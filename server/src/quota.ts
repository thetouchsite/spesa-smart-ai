/**
 * Contatore di consumo dei fornitori esterni.
 *
 * PERCHÉ SERVE
 * ------------
 * Ogni piano generato costa. Poco, ma costa: scoprire a metà di una
 * dimostrazione che la quota è finita è il modo peggiore di accorgersene,
 * perché l'app comincia a rispondere con errori davanti alla persona che
 * stai cercando di convincere.
 *
 * Qui si contano le chiamate effettivamente inviate al fornitore — quelle
 * servite dalla cache non contano, ed è esattamente il punto: mostrano
 * quanto la cache stia risparmiando.
 *
 * Il conteggio vive in memoria e riparte a ogni riavvio del processo. È un
 * indicatore per lo sviluppo, non contabilità: il numero vero lo tiene il
 * fornitore. Serve a vedere il consumo salire in tempo reale e a fermarsi
 * prima del muro.
 */

export type Provider = "gemini" | "grounding" | "serpapi";

interface Counter {
  used: number;
  /** Inizio della finestra corrente, in millisecondi. */
  windowStart: number;
}

/**
 * Le soglie da non superare.
 *
 * GEMINI (fatturazione attiva). I token si pagano a consumo e non hanno un
 * tetto: il limite qui è di prudenza, non tecnico. Serve ad accorgersi se
 * qualcosa genera in ciclo — 2.000 piani in un giorno, in sviluppo, non è
 * traffico: è un bug.
 *
 * GROUNDING. La ricerca Google si paga a parte e con una soglia vera: le
 * prime 5.000 richieste del mese sono gratuite, poi 14 $ ogni mille. È la
 * voce di costo che conta davvero, ed è per questo che ha un contatore suo.
 * Un piano completo = una richiesta con grounding, quante che siano le
 * ricerche che il modello fa al suo interno.
 *
 * SERPAPI. Piano gratuito, 250 ricerche al mese, e questa è una parete: a
 * 251 smette di rispondere. Con il motore Gemini con ricerca, SerpAPI resta
 * solo come ripiego per la verifica del singolo prodotto.
 */
const LIMITS: Record<Provider, { limit: number; windowMs: number; label: string }> = {
  gemini: { limit: 2_000, windowMs: 24 * 60 * 60 * 1000, label: "al giorno" },
  grounding: { limit: 5_000, windowMs: 30 * 24 * 60 * 60 * 1000, label: "al mese (poi 14 $/1.000)" },
  serpapi: { limit: 250, windowMs: 30 * 24 * 60 * 60 * 1000, label: "al mese" },
};

const counters: Record<Provider, Counter> = {
  gemini: { used: 0, windowStart: Date.now() },
  grounding: { used: 0, windowStart: Date.now() },
  serpapi: { used: 0, windowStart: Date.now() },
};

function roll(provider: Provider): Counter {
  const c = counters[provider];
  const { windowMs } = LIMITS[provider];
  if (Date.now() - c.windowStart > windowMs) {
    c.used = 0;
    c.windowStart = Date.now();
  }
  return c;
}

/** Registra una chiamata realmente inviata al fornitore. */
export function recordUse(provider: Provider): void {
  const c = roll(provider);
  c.used += 1;
  const { limit } = LIMITS[provider];
  const pct = Math.round((c.used / limit) * 100);
  if (pct >= 75) console.warn(`[quota] ${provider}: ${c.used}/${limit} (${pct}%) — quasi esaurita`);
  else if (pct >= 70) console.warn(`[quota] ${provider}: ${c.used}/${limit} (${pct}%)`);
}

export interface QuotaStatus {
  provider: Provider;
  used: number;
  limit: number;
  percent: number;
  /** "ok" sotto il 70%, "attenzione" fino al 90%, "critico" oltre. */
  level: "ok" | "attenzione" | "critico";
  window: string;
}

export function quotaStatus(): QuotaStatus[] {
  return (Object.keys(LIMITS) as Provider[]).map((provider) => {
    const c = roll(provider);
    const { limit, label } = LIMITS[provider];
    const percent = Math.min(100, Math.round((c.used / limit) * 100));
    return {
      provider,
      used: c.used,
      limit,
      percent,
      level: percent >= 75 ? "critico" : percent >= 50 ? "attenzione" : "ok",
      window: label,
    };
  });
}

/** True quando almeno un fornitore ha superato la soglia di attenzione. */
export function quotaNeedsAttention(): boolean {
  return quotaStatus().some((q) => q.level !== "ok");
}


/* ─────────────────────────── Tetto di spesa ─────────────────────────── */

/**
 * Quanto si è speso, e quando fermarsi.
 *
 * I contatori qui sopra dicono quante chiamate sono partite; questo dice
 * quanto sono costate. Serve perché il credito è piccolo e reale: cinque euro
 * su una chiave di prova, che a tre centesimi a piano sono centosessanta
 * generazioni — poche, se un ciclo impazzito ne fa una al secondo.
 *
 * Il tetto si legge da `SPESA_MAX_USD` e vale per la vita del processo, non
 * per il mese: riavviando si riparte da zero. Non è contabilità, è un freno
 * a mano — quello vero lo tiene Google, e sul suo cruscotto si può impostare
 * un limite mensile che nessun riavvio azzera.
 */
let spesoUsd = 0;

/** Il limite oltre il quale si smette di chiamare. 0 = nessun limite. */
const LIMITE_USD = Number(process.env.SPESA_MAX_USD ?? 2);

/** Registra il costo di una chiamata appena fatta. */
export function recordCost(usd: number): void {
  if (!Number.isFinite(usd) || usd <= 0) return;
  spesoUsd += usd;

  if (LIMITE_USD > 0) {
    const pct = Math.round((spesoUsd / LIMITE_USD) * 100);
    if (pct >= 80) {
      console.warn(
        `[spesa] $${spesoUsd.toFixed(3)} su $${LIMITE_USD} (${pct}%) — vicino al limite`,
      );
    }
  }
}

/** Vero quando il tetto è stato raggiunto e conviene fermarsi. */
export function budgetExhausted(): boolean {
  return LIMITE_USD > 0 && spesoUsd >= LIMITE_USD;
}

export function spendStatus(): { usd: number; limitUsd: number; percent: number } {
  return {
    usd: Number(spesoUsd.toFixed(4)),
    limitUsd: LIMITE_USD,
    percent: LIMITE_USD > 0 ? Math.min(100, Math.round((spesoUsd / LIMITE_USD) * 100)) : 0,
  };
}
