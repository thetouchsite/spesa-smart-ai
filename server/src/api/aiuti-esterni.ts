/**
 * Quel poco che l'API si fa dare da fuori, senza sapere da chi.
 *
 * IL FILO CHE RESTAVA
 * -------------------
 * `api/` non importa mai niente da `app/` — lo verifica il build. Ne restava
 * uno solo, e stava qui: per tradurre una parola che il dizionario della spesa
 * non conosce, la strada dei prezzi importava il client del modello, che vive
 * di la'.
 *
 * Un filo solo, e piccolo. Ma finche' c'e', «staccare l'API» non e' un `git mv`
 * e un package.json: e' quello piu' una funzione da riscrivere.
 *
 * COME SI TAGLIA: SI ROVESCIA IL VERSO
 * ------------------------------------
 * Invece di andarsi a prendere il modello, l'API dichiara *cosa le servirebbe*
 * e aspetta che qualcuno glielo dia. Chi lo da' — `index.ts`, che monta tutti e
 * due i blocchi — lo prende dall'app.
 *
 * Il risultato e' che l'API non sa piu' che esista un modello. Sa che esiste
 * un traduttore, che potrebbe non esserci, e in quel caso si arrangia.
 *
 * ED E' ANCHE PIU' ONESTO DI PRIMA
 * --------------------------------
 * Prima il ripiego era implicito: se la chiamata falliva si tenevano le parole
 * originali, e funzionava, ma solo perche' qualcuno ci aveva pensato. Adesso
 * «il traduttore puo' non esserci» e' scritto nel tipo, e chi scrive codice
 * nuovo non puo' dimenticarsene: il compilatore non glielo permette.
 *
 * Staccata da questo repo, l'API funziona senza che nessuno colleghi niente —
 * con il dizionario da solo, che copre la stragrande maggioranza delle liste.
 */

/**
 * Traduce delle parole nella lingua di un paese.
 *
 * Riceve SOLO le parole che il dizionario non conosce, mai la lista intera:
 * una parola tradotta si puo' rimettere nel dizionario e riusare domani, una
 * frase no.
 *
 * Restituisce `null` quando non ce la fa. Non lancia: chi chiama sta gia'
 * rispondendo a qualcuno, e una traduzione mancata non deve spegnere il
 * catalogo.
 */
export type Traduttore = (
  parole: string[],
  lingua: string,
) => Promise<string[] | null>;

/**
 * Sceglie, fra dei candidati, quali corrispondono a ciascuna voce.
 *
 * Oggi non lo collega nessuno, ed e' voluto: le misure dicono che la
 * classifica sceglie meglio. Il posto resta perche' il confronto va rifatto
 * quando la ricerca cambiera', e perche' un giorno un cliente potrebbe volere
 * quel comportamento.
 */
export type Selettore = (
  voci: Array<{ voce: string; candidati: Array<{ nome: string; insegna: string }> }>,
) => Promise<Map<number, number[]> | null>;

let traduttore: Traduttore | null = null;
let selettore: Selettore | null = null;

/** Chi monta i due blocchi insieme passa di qui. Nessun altro. */
export function collegaTraduttore(t: Traduttore | null): void {
  traduttore = t;
}

export function collegaSelettore(s: Selettore | null): void {
  selettore = s;
}

/**
 * Il traduttore, se qualcuno l'ha collegato.
 *
 * `null` non e' un errore: e' la condizione normale di un'API che gira per
 * conto suo. Chi chiama deve saper funzionare senza.
 */
export function ilTraduttore(): Traduttore | null {
  return traduttore;
}

export function ilSelettore(): Selettore | null {
  return selettore;
}
