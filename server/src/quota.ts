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
/**
 * DUE BORSELLINI, UN TETTO SOLO.
 *
 * Il contatore era uno, condiviso fra l'API e l'app. Vuol dire che la
 * generazione di un menu — che costa dieci volte una risposta sui prezzi —
 * poteva finire il credito e far rispondere `402` anche a chi l'API la paga.
 * Il cliente che compra i dati si vede chiudere la porta perche' un'altra
 * parte del sistema ha mangiato troppo.
 *
 * Adesso sono due, ma NON e' un permesso di spendere il doppio: il tetto
 * globale resta e vale sulla somma. Quello che cambia e' che l'app ha anche un
 * tetto suo, piu' basso, e quel che avanza fra i due e' RISERVATO all'API.
 *
 *     SPESA_MAX_USD       $2,00   il tetto vero, sulla somma
 *     SPESA_MAX_USD_APP   $1,50   quanto puo' arrivare a spendere l'app
 *                                 → $0,50 restano sempre per i prezzi
 *
 * Il tre quarti predefinito non e' una misura, e' un compromesso: lascia
 * all'app quasi tutto — perche' e' lei che spende — e tiene da parte abbastanza
 * per qualche decina di risposte sui prezzi, che costano un centesimo l'una.
 * Quando l'IA uscira' dalla strada dei prezzi (Fase 3) la riserva servira'
 * ancora meno, e questa riga si potra' semplificare.
 */
export type Blocco = "api" | "app";

const speso: Record<Blocco, number> = { api: 0, app: 0 };

/** Il limite sulla somma. 0 = nessun limite. */
const LIMITE_USD = Number(process.env.SPESA_MAX_USD ?? 2);

/** Quanto puo' arrivare a spendere l'app da sola. Il resto e' dell'API. */
const LIMITE_APP = Number(process.env.SPESA_MAX_USD_APP ?? LIMITE_USD * 0.75);

const totale = (): number => speso.api + speso.app;

/** Registra il costo di una chiamata appena fatta, e di chi era. */
export function recordCost(usd: number, blocco: Blocco = "app"): void {
  if (!Number.isFinite(usd) || usd <= 0) return;
  speso[blocco] += usd;

  if (LIMITE_USD > 0) {
    const pct = Math.round((totale() / LIMITE_USD) * 100);
    if (pct >= 80) {
      console.warn(
        `[spesa] $${totale().toFixed(3)} su $${LIMITE_USD} (${pct}%) — vicino al limite ` +
          `(api $${speso.api.toFixed(3)}, app $${speso.app.toFixed(3)})`,
      );
    }
  }
}

/**
 * Vero quando conviene fermarsi.
 *
 * Per l'app ci sono due modi di essere al limite: il tetto globale, e il suo.
 * Per l'API solo il globale — se si ferma lei, si e' fermato tutto, ed e'
 * giusto che sia l'ultima a cedere: e' il prodotto.
 */
export function budgetExhausted(blocco: Blocco = "app"): boolean {
  if (LIMITE_USD > 0 && totale() >= LIMITE_USD) return true;
  if (blocco === "app" && LIMITE_APP > 0 && speso.app >= LIMITE_APP) return true;
  return false;
}

/** Perche' si e' fermato, per dirlo a chi riceve il 402 invece di farlo indovinare. */
export function perchePieno(blocco: Blocco = "app"): string {
  if (LIMITE_USD > 0 && totale() >= LIMITE_USD) {
    return `tetto complessivo raggiunto ($${totale().toFixed(3)} su $${LIMITE_USD})`;
  }
  if (blocco === "app" && LIMITE_APP > 0 && speso.app >= LIMITE_APP) {
    return (
      `l'app ha raggiunto il suo tetto ($${speso.app.toFixed(3)} su $${LIMITE_APP}); ` +
      `il resto e' riservato alle risposte sui prezzi`
    );
  }
  return "nessun tetto raggiunto";
}

export function spendStatus(): {
  usd: number;
  limitUsd: number;
  percent: number;
  perBlocco: { api: number; app: number; limiteApp: number };
} {
  return {
    // I tre campi di prima, invariati: qualcuno li legge.
    usd: Number(totale().toFixed(4)),
    limitUsd: LIMITE_USD,
    percent: LIMITE_USD > 0 ? Math.min(100, Math.round((totale() / LIMITE_USD) * 100)) : 0,
    perBlocco: {
      api: Number(speso.api.toFixed(4)),
      app: Number(speso.app.toFixed(4)),
      limiteApp: LIMITE_APP,
    },
  };
}
