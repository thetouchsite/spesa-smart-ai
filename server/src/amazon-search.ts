/**
 * Prodotti Amazon veri: ASIN, prezzo, foto e indirizzo che si apre.
 *
 * PERCHÉ NON BASTAVA IL MOTORE
 * ----------------------------
 * Il modello con ricerca i link Amazon li trova, ma a intermittenza — in una
 * generazione ne ha prodotti zero nonostante gli fosse chiesto esplicitamente
 * — e soprattutto non si possono verificare: Amazon risponde 404 a qualunque
 * richiesta arrivi dal nostro server, sia per un prodotto vero sia per un
 * indirizzo inventato. Provato: non c'è modo di distinguerli.
 *
 * PERCHÉ NON L'API DI AMAZON
 * --------------------------
 * Perché non esiste più. La Product Advertising API è stata spenta il 15
 * maggio 2026 e oggi risponde 403; la sostituta, la Creators API, chiede dieci
 * vendite qualificate al mese per concedere l'accesso — e un'app che deve
 * ancora nascere non le ha.
 *
 * COSA FA QUESTO MODULO
 * ---------------------
 * Interroga SocialCrawl, che restituisce i prodotti Amazon con ASIN reale,
 * indirizzo diretto, prezzo, prezzo pieno barrato e fotografia. Niente da
 * indovinare e niente da verificare: l'ASIN o c'è o non c'è.
 *
 * IL CONTO
 * --------
 * Un credito per ricerca, cioè uno per prodotto della lista. I crediti si
 * comprano una volta e non scadono: 2.500 per 15 sterline sono circa
 * centoquaranta piani interi, 20.000 per 49 ne sono più di mille. Le ricerche
 * a vuoto vengono rimborsate.
 *
 * Senza la chiave il modulo resta spento e tutto il resto funziona come prima.
 */

const BASE = "https://www.socialcrawl.dev/v1";

export function isAmazonSearchConfigured(): boolean {
  return Boolean(process.env.SOCIALCRAWL_KEY);
}

/** Un prodotto Amazon, nella stessa forma che produce il motore. */
export interface AmazonProduct {
  prodotto: string;
  nome: string;
  prezzo: number;
  valuta: string;
  negozio: string;
  link: string;
  immagine?: string;
  /** Prezzo pieno, quando il prodotto è in offerta. */
  prezzoListino?: number;
  scontoPercento?: number;
  /** Voto medio e numero di recensioni: aiutano a scegliere fra prodotti simili. */
  voto?: number;
}

/**
 * I titoli arrivano con le entità HTML dentro: «Costa d&#x27;Oro».
 * Mostrarle così è il genere di dettaglio che fa sembrare un'app non finita.
 */
function ripulisci(testo: string): string {
  return testo
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

/**
 * La valuta arriva come "EU", che non è un codice valido.
 *
 * Lasciarla passare fa fallire la formattazione dei prezzi nell'app, che usa
 * Intl e pretende un codice ISO di tre lettere.
 */
function valuta(grezza: string | null | undefined, paese: string): string {
  const c = (grezza ?? "").toUpperCase();
  if (/^[A-Z]{3}$/.test(c)) return c;
  const perPaese: Record<string, string> = {
    IT: "EUR", DE: "EUR", FR: "EUR", ES: "EUR", NL: "EUR", BE: "EUR", IE: "EUR",
    GB: "GBP", US: "USD", CA: "CAD", JP: "JPY", AU: "AUD", IN: "INR", BR: "BRL",
    MX: "MXN", SE: "SEK", PL: "PLN", TR: "TRY", AE: "AED", SG: "SGD",
  };
  return perPaese[paese.toUpperCase()] ?? "EUR";
}

interface RispostaRicerca {
  success?: boolean;
  error?: string;
  data?: {
    items?: Array<{
      product?: {
        id?: string;
        url?: string;
        title?: string;
        price?: { current?: number | null; original?: number | null; currency?: string | null };
        rating?: { average?: number | null; count?: number | null };
        image_urls?: string | string[] | null;
      };
    }>;
  };
}

/**
 * Cerca un prodotto su Amazon.
 *
 * Non lancia mai per un errore del servizio: un prodotto senza offerta è una
 * riga in meno, non un piano perduto.
 */
export async function cercaProdottoAmazon(
  prodotto: string,
  paese: string,
  quanti = 2,
): Promise<AmazonProduct[]> {
  const key = process.env.SOCIALCRAWL_KEY;
  if (!key) return [];

  const cc = (paese || "IT").toUpperCase().slice(0, 2);
  const url = `${BASE}/amazon/product-search?query=${encodeURIComponent(prodotto)}&country=${cc}`;

  let body: RispostaRicerca;
  try {
    const res = await fetch(url, {
      headers: { "x-api-key": key, Accept: "application/json" },
      // Misurato fra 2 e 36 secondi: il limite sta largo perché una ricerca
      // riuscita in 40 vale più di un errore a 20.
      signal: AbortSignal.timeout(50_000),
    });
    if (!res.ok) {
      console.warn(`[amazon] HTTP ${res.status} per "${prodotto.slice(0, 40)}"`);
      return [];
    }
    body = (await res.json()) as RispostaRicerca;
  } catch (err) {
    console.warn(`[amazon] "${prodotto.slice(0, 40)}" non cercato:`, err);
    return [];
  }

  if (body.error) {
    console.warn(`[amazon] ${String(body.error).slice(0, 120)}`);
    return [];
  }

  const trovati: AmazonProduct[] = [];

  for (const voce of body.data?.items ?? []) {
    const p = voce.product;
    // I PREZZI ARRIVANO IN CENTESIMI. Verificato su un olio da un litro:
    // valori fra 650 e 1890, cioè 6,50-18,90 €. Prenderli per euro
    // mostrerebbe una bottiglia d'olio a 749 €.
    const centesimi = p?.price?.current;
    if (!p?.id || !p.url || typeof centesimi !== "number") continue;

    const prezzo = Math.round(centesimi) / 100;
    const listinoCent = p.price?.original;
    const listino = typeof listinoCent === "number" ? Math.round(listinoCent) / 100 : undefined;

    const foto = Array.isArray(p.image_urls) ? p.image_urls[0] : p.image_urls;

    trovati.push({
      prodotto,
      nome: ripulisci(p.title ?? prodotto),
      prezzo,
      valuta: valuta(p.price?.currency, cc),
      negozio: "Amazon",
      link: p.url,
      immagine: foto ?? undefined,
      prezzoListino: listino && listino > prezzo ? listino : undefined,
      scontoPercento:
        listino && listino > prezzo ? Math.round(((listino - prezzo) / listino) * 100) : undefined,
      voto: typeof p.rating?.average === "number" ? p.rating.average : undefined,
    });

    if (trovati.length >= quanti) break;
  }

  return trovati;
}

export interface EsitoAmazon {
  offerte: AmazonProduct[];
  /** Prodotti per cui Amazon ha almeno un'offerta. */
  trovati: number;
  cercati: number;
  /** Crediti consumati: uno per ricerca, serve a tenere il conto. */
  crediti: number;
}

/**
 * Cerca tutti i prodotti di una lista.
 *
 * Tutte insieme: il servizio consente cinquanta richieste in parallelo e
 * seicento al minuto, e le ricerche singole arrivano fino a mezzo minuto —
 * in sequenza una lista da diciotto voci prenderebbe dieci minuti.
 */
export async function cercaListaAmazon(
  prodotti: string[],
  paese: string,
  perProdotto = 2,
): Promise<EsitoAmazon> {
  if (!isAmazonSearchConfigured() || prodotti.length === 0) {
    return { offerte: [], trovati: 0, cercati: 0, crediti: 0 };
  }

  const esiti = await Promise.all(
    prodotti.map((p) => cercaProdottoAmazon(p, paese, perProdotto)),
  );

  return {
    offerte: esiti.flat(),
    trovati: esiti.filter((e) => e.length > 0).length,
    cercati: prodotti.length,
    crediti: prodotti.length,
  };
}
