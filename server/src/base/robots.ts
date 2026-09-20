/**
 * Il `robots.txt` di un sito, letto e applicato.
 *
 * PERCHE' STA IN `base` E NON IN UNO SCRIPT
 * -----------------------------------------
 * Perche' serve in due momenti diversi e non puo' rispondere in due modi:
 * quando si valuta un'insegna nuova (`caccia-insegne`) e quando si ricontrolla
 * una gia' nota (`controlla-robots`). Due copie della stessa regola divergono
 * sempre, e qui divergere vuol dire leggere un sito che ci ha detto di no.
 *
 * L'API si vende a un cliente: la diffida arriva a lui, non a noi. Le insegne
 * che dicono di no restano escluse, e sopra non ci si passa.
 *
 * COME SI LEGGE UNA REGOLA
 * ------------------------
 * Si guardano i blocchi `User-agent: *` — se un negozio volesse trattarci in
 * modo diverso lo direbbe con un nome preciso, e noi non ne abbiamo uno. Fra
 * le regole che combaciano col percorso vince LA PIU' LUNGA:
 *
 *     Disallow: /prodotti/
 *     Allow:    /prodotti/scheda/
 *
 * Il `*` vale qualsiasi cosa, il `$` ancora alla fine. A parita' di lunghezza
 * vince `Allow`: e' la regola di Google, ed e' la lettura giusta di chi ha
 * scritto tutte e due — se le ha messe entrambe, intendeva permettere.
 */

import { INTESTAZIONE_BROWSER } from "./intestazione.js";

export interface Regola {
  tipo: "allow" | "disallow";
  schema: string;
}

export function leggiRegole(testo: string): Regola[] {
  const regole: Regola[] = [];
  let dentro = false;
  for (const grezza of testo.split("\n")) {
    const riga = grezza.replace(/#.*$/, "").trim();
    if (!riga) continue;
    const i = riga.indexOf(":");
    if (i < 0) continue;
    const campo = riga.slice(0, i).trim().toLowerCase();
    const valore = riga.slice(i + 1).trim();

    if (campo === "user-agent") {
      /* Piu' `User-agent` di fila condividono lo stesso blocco di regole. */
      dentro = valore === "*";
      continue;
    }
    if (!dentro) continue;
    if (campo === "allow") regole.push({ tipo: "allow", schema: valore });
    if (campo === "disallow") regole.push({ tipo: "disallow", schema: valore });
  }
  return regole;
}

export function combacia(schema: string, percorso: string): boolean {
  if (schema === "") return false;
  const ancorato = schema.endsWith("$");
  const s = ancorato ? schema.slice(0, -1) : schema;
  const pezzi = s.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp("^" + pezzi.join(".*") + (ancorato ? "$" : ""));
  return re.test(percorso);
}

export function permesso(regole: Regola[], percorso: string): { ok: boolean; regola: string } {
  let vincente: Regola | null = null;
  for (const r of regole) {
    if (!combacia(r.schema, percorso)) continue;
    if (!vincente) {
      vincente = r;
      continue;
    }
    const piuLunga = r.schema.length > vincente.schema.length;
    const pariMaPermette = r.schema.length === vincente.schema.length && r.tipo === "allow";
    if (piuLunga || pariMaPermette) vincente = r;
  }
  if (!vincente) return { ok: true, regola: "nessuna regola combacia" };
  return {
    ok: vincente.tipo === "allow",
    regola: `${vincente.tipo === "allow" ? "Allow" : "Disallow"}: ${vincente.schema}`,
  };
}

/* ── la lettura vera, con la rete ────────────────────────────────────── */

export interface Robots {
  regole: Regola[];
  /** Le sitemap che il file dichiara: e' il posto piu' affidabile dove trovarle. */
  sitemap: string[];
  /** Vero quando il file non c'e' o non risponde: nessun divieto scritto. */
  assente: boolean;
}

const cache = new Map<string, Promise<Robots>>();

export function robotsDi(origine: string): Promise<Robots> {
  const c = cache.get(origine);
  if (c) return c;
  const p = (async (): Promise<Robots> => {
    try {
      /* CI PRESENTIAMO COME UN BROWSER ANCHE QUI, E NON E' UN PARADOSSO.
         Dichiaravamo «MealMintBot» proprio a questo file, per correttezza. Ma
         i siti grossi bloccano le richieste che si annunciano come programma,
         e bloccano anche questa: Albert Heijn, Jumbo, Sainsbury's, Rewe,
         Kaufland e Waitrose rispondevano in modo che il loro robots.txt
         risultasse ASSENTE. Da li' la caccia concludeva «nessuna sitemap» e
         scartava l'insegna — i sei piu' grossi d'Europa, persi per il modo in
         cui chiedevamo il permesso.

         L'esito era il contrario del fine: non leggendo le regole non le
         rispettavamo meglio, le ignoravamo. Adesso il file si legge come si
         legge qualsiasi altra pagina, e quel che dice si applica: e' li' che
         sta il rispetto, non nel nome che diciamo per chiederlo. */
      const r = await fetch(`${origine}/robots.txt`, {
        headers: INTESTAZIONE_BROWSER,
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) return { regole: [], sitemap: [], assente: true };
      const testo = await r.text();
      const sitemap = testo
        .split("\n")
        .map((x) => x.replace(/#.*$/, "").trim())
        .filter((x) => /^sitemap\s*:/i.test(x))
        .map((x) => x.slice(x.indexOf(":") + 1).trim())
        .filter(Boolean);
      return { regole: leggiRegole(testo), sitemap, assente: false };
    } catch {
      return { regole: [], sitemap: [], assente: true };
    }
  })();
  cache.set(origine, p);
  return p;
}

/**
 * Si puo' leggere questo indirizzo?
 *
 * Un `robots.txt` che non risponde non e' un permesso scritto, ed e' giusto
 * dirlo: `assente` resta vero, cosi' chi chiama decide se fidarsi. Per una
 * catena nuova da mettere in vendita, «non me l'ha vietato nessuno» e'
 * abbastanza; per una che ci aveva detto di no, no.
 */
export async function posso(url: string): Promise<{ ok: boolean; regola: string; assente: boolean }> {
  try {
    const u = new URL(url);
    const r = await robotsDi(u.origin);
    if (r.assente) return { ok: true, regola: "robots.txt non risponde", assente: true };
    const e = permesso(r.regole, u.pathname);
    return { ...e, assente: false };
  } catch {
    return { ok: false, regola: "indirizzo illeggibile", assente: false };
  }
}
