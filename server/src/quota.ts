/**
 * Contatore di consumo delle chiavi gratuite.
 *
 * PERCHÉ SERVE
 * ------------
 * Le chiavi in uso sono su piano gratuito: Gemini concede circa 1.000
 * richieste al giorno, SerpAPI 250 ricerche al mese. Esaurirle a metà di una
 * dimostrazione è il modo peggiore di scoprirlo, perché l'app comincia a
 * rispondere con errori davanti alla persona che stai cercando di convincere.
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

export type Provider = "gemini" | "serpapi";

interface Counter {
  used: number;
  /** Inizio della finestra corrente, in millisecondi. */
  windowStart: number;
}

/**
 * Limiti dei piani gratuiti.
 *
 * Il numero di Gemini e' misurato, non stimato: la documentazione parla di
 * migliaia di richieste al giorno, ma l'errore restituito dall'API dice
 * "limit: 20, model: gemini-3-flash". Venti al giorno PER MODELLO, e si
 * esauriscono in mezz'ora di prove.
 *
 * Cambiare modello da' una quota nuova, ed e' il motivo per cui GEMINI_MODEL
 * e' una variabile d'ambiente. Ma per una dimostrazione seria serve la
 * fatturazione attiva: venti richieste non bastano nemmeno per un piano
 * completo con le sue ricette.
 */
const LIMITS: Record<Provider, { limit: number; windowMs: number; label: string }> = {
  gemini: { limit: 20, windowMs: 24 * 60 * 60 * 1000, label: "al giorno" },
  serpapi: { limit: 250, windowMs: 30 * 24 * 60 * 60 * 1000, label: "al mese" },
};

const counters: Record<Provider, Counter> = {
  gemini: { used: 0, windowStart: Date.now() },
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
