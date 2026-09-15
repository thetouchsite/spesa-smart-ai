/**
 * L'elenco dei punti vendita, insegna per insegna.
 *
 * A COSA SERVE
 * ------------
 * A rispondere alla domanda che l'utente si fa davvero: non «quanto costa la
 * passata in Italia», ma «dove vado a prenderla stasera». Un prezzo senza un
 * negozio raggiungibile e' un numero; con il negozio diventa una spesa.
 *
 * Serve anche a non mentire. Le insegne italiane sono regionali, e i listini
 * pure: fra Coop Alleanza e Unicoop Tirreno lo stesso limone biologico costa
 * 2,98 € e 1,34 €. Mostrare a chi sta a Milano il prezzo di una cooperativa
 * toscana non e' un'approssimazione, e' un numero sbagliato. Sapere quali
 * insegne hanno un negozio vicino e' cio' che permette di filtrare.
 *
 * DA DOVE ARRIVA
 * --------------
 * Da `warehouse-locator/search`, il cercanegozi che le insegne sulla
 * piattaforma EBSN espongono per il loro stesso sito. Risponde in JSON, senza
 * chiave e senza sessione, con nome, indirizzo, citta', provincia, CAP e
 * coordinate. Eurospin ne dichiara 1.257.
 *
 * QUELLO CHE QUESTO ELENCO NON E'
 * -------------------------------
 * Non e' un elenco di prezzi per negozio, e quella cosa non esiste: verificato
 * aprendo lo stesso prodotto su sei Eurospin da Milano a Palermo, il listino e'
 * 1,19 € dappertutto. Quello che cambia da un negozio all'altro sono le
 * PROMOZIONI, e quelle il sito le calcola sul negozio che ti serve.
 *
 * Quindi: il prezzo e' dell'insegna, il negozio e' il tuo. Sono due cose
 * diverse e vanno dette separate, altrimenti si finisce per attaccare lo sconto
 * di un negozio all'indirizzo di un altro.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

/** Un giorno: i negozi aprono e chiudono, ma non fra le 9 e le 9 e un quarto. */
const SCADENZA_MS = 24 * 60 * 60 * 1000;

export interface Negozio {
  insegna: string;
  /** Identificativo interno dell'insegna: serve a ritrovarlo, non all'utente. */
  id: number;
  nome: string;
  indirizzo: string;
  citta: string;
  provincia: string;
  cap: string;
  latitudine?: number;
  longitudine?: number;
}

interface InsegnaConNegozi {
  insegna: string;
  paese: string;
  /** La base del sito EBSN che espone il cercanegozi. */
  base: string;
}

/**
 * Le insegne di cui sappiamo leggere i punti vendita.
 *
 * Sono quelle sulla piattaforma EBSN, riconoscibile perche' tutte le sue
 * chiamate stanno sotto `/ebsn/api/`. Se ne aggiunge una scrivendo una riga:
 * il cercanegozi ha la stessa forma su tutte.
 */
export const INSEGNE_CON_NEGOZI: InsegnaConNegozi[] = [
  { insegna: "Eurospin", paese: "IT", base: "https://online.eurospin.com" },
  { insegna: "Tigros", paese: "IT", base: "https://www.tigros.it" },
  { insegna: "Coop (Nova Coop, Lombardia, Liguria)", paese: "IT", base: "https://www.coopshop.it" },
  { insegna: "Basko", paese: "IT", base: "https://www.basko.it" },
  { insegna: "Iperal", paese: "IT", base: "https://www.iperalspesaonline.it" },
  { insegna: "Effepiù", paese: "IT", base: "https://www.myeffepiu.it" },
  { insegna: "Alì Supermercati", paese: "IT", base: "https://www.alisupermercati.it" },
  { insegna: "Iper La Grande i", paese: "IT", base: "https://iperdrive.iper.it" },
];

const cache = new Map<string, { negozi: Negozio[]; creatoIl: number }>();

interface RispostaLocator {
  data?: {
    warehouses?: Array<{
      warehouseId: number;
      name?: string;
      address?: {
        addressName?: string;
        address1?: string;
        city?: string;
        province?: string;
        postalcode?: string;
        latitude?: number;
        longitude?: number;
      };
    }>;
  };
}

/** Toglie il codice numerico che alcune insegne mettono davanti al nome. */
function nomePulito(grezzo: string): string {
  return grezzo.replace(/^\d+\s*-\s*/, "").trim();
}

async function scarica(ins: InsegnaConNegozi): Promise<Negozio[]> {
  try {
    const r = await fetch(`${ins.base}/ebsn/api/warehouse-locator/search`, {
      // Venti secondi: l'elenco e' grosso ma si scarica una volta al giorno,
      // non a ogni richiesta.
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": UA, Accept: "application/json", "X-Ebsn-Client": "site" },
    });
    if (!r.ok) return [];
    const j = JSON.parse((await r.text()).replace(/^\s+/, "")) as RispostaLocator;
    const fuori: Negozio[] = [];
    for (const w of j.data?.warehouses ?? []) {
      const a = w.address ?? {};
      fuori.push({
        insegna: ins.insegna,
        id: w.warehouseId,
        nome: nomePulito(String(w.name ?? a.addressName ?? "")),
        indirizzo: a.address1 ?? "",
        citta: a.city ?? "",
        provincia: a.province ?? "",
        cap: a.postalcode ?? "",
        latitudine: a.latitude,
        longitudine: a.longitude,
      });
    }
    return fuori;
  } catch {
    // Un cercanegozi che non risponde non deve togliere gli altri.
    return [];
  }
}

/** I punti vendita di un'insegna, scaricati una volta al giorno. */
export async function negoziDi(ins: InsegnaConNegozi): Promise<Negozio[]> {
  const buono = cache.get(ins.insegna);
  if (buono && Date.now() - buono.creatoIl < SCADENZA_MS) return buono.negozi;
  const negozi = await scarica(ins);
  if (negozi.length) console.info(`[negozi] ${ins.insegna}: ${negozi.length} punti vendita`);
  cache.set(ins.insegna, { negozi, creatoIl: Date.now() });
  return negozi;
}

/** Tutti i punti vendita di un paese, di tutte le insegne che sappiamo leggere. */
export async function tuttiINegozi(paeseIso: string): Promise<Negozio[]> {
  const iso = (paeseIso || "IT").toUpperCase().slice(0, 2);
  const insegne = INSEGNE_CON_NEGOZI.filter((i) => i.paese === iso);
  const liste = await Promise.all(insegne.map(negoziDi));
  return liste.flat();
}

/** Confronta due nomi di citta' ignorando accenti e maiuscole. */
function stessaCitta(a: string, b: string): boolean {
  const n = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const x = n(a);
  const y = n(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

export interface NegoziPerCitta {
  citta: string;
  /** Le insegne che hanno almeno un negozio li': sono quelle di cui ha senso
   *  mostrare i prezzi a chi sta in quella citta'. */
  insegne: string[];
  negozi: Negozio[];
}

/**
 * I punti vendita in una citta', e quali insegne la servono.
 *
 * L'elenco delle insegne e' la parte che conta per i prezzi: dice quali
 * listini hanno senso per chi sta li' e quali no.
 */
export async function negoziInCitta(paeseIso: string, citta: string): Promise<NegoziPerCitta> {
  const tutti = await tuttiINegozi(paeseIso);
  const negozi = citta ? tutti.filter((n) => stessaCitta(n.citta, citta)) : [];
  const insegne = [...new Set(negozi.map((n) => n.insegna))];
  return { citta, insegne, negozi };
}

/** Quanti punti vendita conosciamo, per insegna. Serve allo stato dell'API. */
export async function statoNegozi(paeseIso = "IT"): Promise<{
  paese: string;
  insegne: Array<{ insegna: string; negozi: number }>;
  totale: number;
}> {
  const iso = (paeseIso || "IT").toUpperCase().slice(0, 2);
  const insegne = INSEGNE_CON_NEGOZI.filter((i) => i.paese === iso);
  const righe = await Promise.all(
    insegne.map(async (i) => ({ insegna: i.insegna, negozi: (await negoziDi(i)).length })),
  );
  return {
    paese: iso,
    insegne: righe.sort((a, b) => b.negozi - a.negozi),
    totale: righe.reduce((s, r) => s + r.negozi, 0),
  };
}
