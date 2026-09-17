/**
 * Riconoscere, fra i negozi vicini, quelli dove la lista si compra davvero.
 *
 * A COSA SERVE
 * ------------
 * «Supermercati vicini» elenca tutto quello che OpenStreetMap conosce entro un
 * raggio: trenta insegne, dal discount alla bottega di quartiere. Utile, ma
 * indifferenziato — e intanto la lista della spesa SA da quali insegne vengono
 * i suoi prezzi. Le due informazioni non si parlavano.
 *
 * Con una stella accanto ai negozi della lista, quell'elenco smette di essere
 * una mappa e diventa una risposta: «vai lì, e paghi quello che hai visto».
 *
 * PERCHE' NON BASTA CONFRONTARE I NOMI
 * ------------------------------------
 * Non coincidono mai. La nostra insegna si chiama «Carrefour Italia» perche'
 * cosi' si chiama il sito da cui leggiamo i prezzi; OpenStreetMap la mappa
 * come «Carrefour Express», «Carrefour Market» o «Carrefour». «MD» diventa
 * «Discount Supermarket MD». «Esselunga» resta «Esselunga», ma e' l'eccezione.
 *
 * Quindi si confrontano le PAROLE SIGNIFICATIVE: si buttano quelle che
 * ricorrono in ogni nome di supermercato — market, discount, express, spa,
 * s.r.l. — e si guarda se quel che resta compare da entrambe le parti.
 *
 * MEGLIO PERDERNE UNO CHE SBAGLIARNE UNO
 * --------------------------------------
 * La regola e' severa di proposito: si confrontano parole intere, mai pezzi.
 * Mandare qualcuno in un negozio dove i prezzi che ha visto non valgono e'
 * molto peggio che non segnalargli un negozio dove varrebbero — nel secondo
 * caso non nota niente, nel primo fa un viaggio a vuoto e non si fida piu'.
 */

/** Parole che compaiono in mezzo mondo e non identificano nessuno. */
const GENERICHE = new Set([
  "supermercato",
  "supermercati",
  "supermarket",
  "market",
  "markket",
  "mini",
  "discount",
  "iper",
  "super",
  "express",
  "city",
  "local",
  "shop",
  "store",
  "alimentari",
  "negozio",
  "punto",
  "vendita",
  "spesa",
  "food",
  "italia",
  "italy",
  "spa",
  "srl",
  "sas",
  "snc",
  "s",
  "r",
  "l",
  "di",
  "del",
  "della",
  "the",
  "and",
  "e",
  "il",
  "lo",
  "la",
  "i",
  "gli",
  "le",
  "da",
  "a",
]);

/** Minuscole, senza accenti, senza punteggiatura. */
function semplifica(testo: string): string {
  return testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Le parole che identificano davvero un'insegna. */
function paroleUtili(nome: string): string[] {
  return (
    semplifica(nome)
      .split(" ")
      /* Due lettere bastano: «MD» e «DM» sono insegne vere, e scartarle
       perche' corte vorrebbe dire non riconoscere mai i discount. */
      .filter((p) => p.length >= 2 && !GENERICHE.has(p))
  );
}

/**
 * Le insegne da cui viene la spesa, pronte per il confronto.
 *
 * Si costruisce una volta e si riusa: la lista dei negozi vicini si ridisegna
 * a ogni scorrimento, e rifare questo lavoro trenta volte per schermata
 * sarebbe sprecato.
 */
export function insegneDellaLista(nomi: string[]): Set<string> {
  const parole = new Set<string>();
  for (const n of nomi) for (const p of paroleUtili(n)) parole.add(p);
  return parole;
}

/**
 * Questo negozio e' una delle insegne della lista?
 *
 * Confronta parole intere: «md» corrisponde a «Discount Supermarket MD» ma non
 * a «Mondadori», che con un confronto per pezzi sarebbe passato.
 */
export function eDellaLista(nomeNegozio: string, insegne: Set<string>): boolean {
  if (insegne.size === 0) return false;
  return paroleUtili(nomeNegozio).some((p) => insegne.has(p));
}

/**
 * Quale insegna, per poterlo scrivere.
 *
 * «Qui compri la tua lista» va bene, ma «Prezzi letti su Carrefour» e' meglio:
 * dice all'utente PERCHE' quel negozio e' segnato, e gli permette di non
 * fidarsi se secondo lui non e' lo stesso posto.
 */
export function insegnaCorrispondente(
  nomeNegozio: string,
  insegneConNome: Array<{ insegna: string; parole: string[] }>,
): string | null {
  const parole = new Set(paroleUtili(nomeNegozio));
  for (const i of insegneConNome) {
    if (i.parole.some((p) => parole.has(p))) return i.insegna;
  }
  return null;
}

/** Prepara l'elenco delle insegne con le loro parole, una volta sola. */
export function preparaInsegne(nomi: string[]): Array<{ insegna: string; parole: string[] }> {
  return [...new Set(nomi)]
    .map((insegna) => ({ insegna, parole: paroleUtili(insegna) }))
    .filter((i) => i.parole.length > 0);
}
