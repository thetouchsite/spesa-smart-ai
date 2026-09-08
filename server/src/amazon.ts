/**
 * Amazon Product Advertising API — prezzi e link ufficiali, non indovinati.
 *
 * PERCHÉ SERVE
 * ------------
 * Il motore con ricerca trova prezzi veri ma i suoi link reggono a
 * intermittenza: in prove consecutive, dieci link validi su trenta e poi cinque
 * su ventinove. Il modello conosce bene gli indirizzi di pochi siti e sugli
 * altri tira a indovinare — dodici 404 in una sola generazione.
 *
 * E chiedergli di includere Amazon nel prompt non basta: provato, e in quella
 * generazione Amazon non è comparso nemmeno una volta. Il prompt suggerisce,
 * non garantisce.
 *
 * Questa API invece è deterministica: dà titolo, prezzo, immagine e indirizzo
 * ufficiali. Niente da verificare, niente da indovinare.
 *
 * COME SI INCASTRA
 * ----------------
 * NON sostituisce il motore: si aggiunge. Su ogni prodotto l'utente vede il
 * supermercato accanto ad Amazon e sceglie. È importante perché — misurato
 * sulle nostre prove — Amazon vende bene la dispensa (pasta, tonno, biscotti,
 * olio) e quasi mai il fresco: carne, latticini, uova e verdura non compaiono.
 * Da sola coprirebbe metà lista.
 *
 * CHE COSA SERVE PER ACCENDERLA
 * -----------------------------
 * Un account Amazon Associates (il programma di affiliazione) e tre chiavi:
 * AMAZON_ACCESS_KEY, AMAZON_SECRET_KEY, AMAZON_PARTNER_TAG. Senza, il modulo
 * resta spento e il resto funziona come prima.
 *
 * Due cose da sapere prima di proporla al cliente:
 *   - ogni acquisto dai link dell'app genera una COMMISSIONE al titolare
 *     dell'account, tipicamente fra l'1% e il 4% sull'alimentare;
 *   - Amazon chiede TRE VENDITE qualificate entro 180 giorni dall'iscrizione,
 *     altrimenti sospende l'accesso all'API. Con un'app appena lanciata è un
 *     rischio reale e va detto prima, non dopo.
 *
 * La richiesta va firmata con AWS Signature V4. È implementata qui a mano con
 * `node:crypto` invece di tirare dentro l'SDK di AWS: sono sessanta righe, e
 * l'SDK porterebbe decine di dipendenze per una sola chiamata.
 */

import { createHash, createHmac } from "node:crypto";

/**
 * I marketplace Amazon: host della API, regione di firma, e dominio del sito.
 *
 * Solo quelli che esistono davvero. Un paese senza marketplace proprio non
 * viene servito da qui — meglio nessuna offerta Amazon che un link a un sito
 * che non spedisce lì.
 */
const MARKETPLACE: Record<string, { host: string; region: string; sito: string }> = {
  IT: { host: "webservices.amazon.it", region: "eu-west-1", sito: "www.amazon.it" },
  DE: { host: "webservices.amazon.de", region: "eu-west-1", sito: "www.amazon.de" },
  FR: { host: "webservices.amazon.fr", region: "eu-west-1", sito: "www.amazon.fr" },
  ES: { host: "webservices.amazon.es", region: "eu-west-1", sito: "www.amazon.es" },
  NL: { host: "webservices.amazon.nl", region: "eu-west-1", sito: "www.amazon.nl" },
  SE: { host: "webservices.amazon.se", region: "eu-west-1", sito: "www.amazon.se" },
  PL: { host: "webservices.amazon.pl", region: "eu-west-1", sito: "www.amazon.pl" },
  BE: { host: "webservices.amazon.com.be", region: "eu-west-1", sito: "www.amazon.com.be" },
  GB: { host: "webservices.amazon.co.uk", region: "eu-west-1", sito: "www.amazon.co.uk" },
  US: { host: "webservices.amazon.com", region: "us-east-1", sito: "www.amazon.com" },
  CA: { host: "webservices.amazon.ca", region: "us-east-1", sito: "www.amazon.ca" },
  MX: { host: "webservices.amazon.com.mx", region: "us-east-1", sito: "www.amazon.com.mx" },
  BR: { host: "webservices.amazon.com.br", region: "us-east-1", sito: "www.amazon.com.br" },
  JP: { host: "webservices.amazon.co.jp", region: "us-west-2", sito: "www.amazon.co.jp" },
  AU: { host: "webservices.amazon.com.au", region: "us-west-2", sito: "www.amazon.com.au" },
  IN: { host: "webservices.amazon.in", region: "eu-west-1", sito: "www.amazon.in" },
  AE: { host: "webservices.amazon.ae", region: "eu-west-1", sito: "www.amazon.ae" },
  SG: { host: "webservices.amazon.sg", region: "us-west-2", sito: "www.amazon.sg" },
  TR: { host: "webservices.amazon.com.tr", region: "eu-west-1", sito: "www.amazon.com.tr" },
};

/**
 * Il reparto in cui cercare.
 *
 * Cercando senza reparto, «passata di pomodoro» restituisce anche libri di
 * cucina e magliette. Il nome del reparto alimentare cambia da marketplace a
 * marketplace: dove non è disponibile si cerca ovunque e si lascia filtrare
 * ai controlli di plausibilità a valle.
 */
const REPARTO_ALIMENTARI: Record<string, string> = {
  IT: "GroceryAndGourmetFood", DE: "GroceryAndGourmetFood", FR: "GroceryAndGourmetFood",
  ES: "GroceryAndGourmetFood", NL: "GroceryAndGourmetFood", SE: "GroceryAndGourmetFood",
  GB: "GroceryAndGourmetFood", US: "GroceryAndGourmetFood", CA: "GroceryAndGourmetFood",
  JP: "FoodAndBeverage", IN: "GroceryAndGourmetFood", AE: "GroceryAndGourmetFood",
};

export function isAmazonConfigured(): boolean {
  return Boolean(
    process.env.AMAZON_ACCESS_KEY &&
      process.env.AMAZON_SECRET_KEY &&
      process.env.AMAZON_PARTNER_TAG,
  );
}

/** Un'offerta Amazon, nella stessa forma che produce il motore AI. */
export interface AmazonOffer {
  prodotto: string;
  nome: string;
  prezzo: number | null;
  valuta: string;
  negozio: string;
  link: string;
  immagine?: string;
}

/* ─────────────────────── Firma AWS Signature V4 ─────────────────────── */

const sha256 = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");
const hmac = (key: Buffer | string, v: string) => createHmac("sha256", key).update(v, "utf8").digest();

/**
 * Costruisce le intestazioni firmate per una richiesta alla PA-API.
 *
 * È l'algoritmo standard di AWS: si costruisce una "richiesta canonica", se ne
 * fa l'impronta, la si mette in una stringa da firmare insieme a data e
 * regione, e si firma con una chiave derivata a scalini dalla chiave segreta.
 * Ogni passaggio deve corrispondere al byte, altrimenti Amazon risponde 403 e
 * non dice dove si è sbagliato — per questo è scritto disteso e non compresso.
 */
function firma(
  host: string,
  region: string,
  target: string,
  path: string,
  payload: string,
): Record<string, string> {
  const accessKey = process.env.AMAZON_ACCESS_KEY as string;
  const secretKey = process.env.AMAZON_SECRET_KEY as string;
  const service = "ProductAdvertisingAPI";

  // Amazon vuole il formato compatto: 20260908T143000Z
  const now = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const giorno = now.slice(0, 8);

  const headers: Record<string, string> = {
    "content-encoding": "amz-1.0",
    "content-type": "application/json; charset=utf-8",
    host,
    "x-amz-date": now,
    "x-amz-target": target,
  };

  // Le intestazioni firmate vanno in ordine alfabetico, minuscole, senza spazi.
  const nomiFirmati = Object.keys(headers).sort();
  const headersCanonici = nomiFirmati.map((k) => `${k}:${headers[k].trim()}\n`).join("");
  const elencoFirmati = nomiFirmati.join(";");

  const richiestaCanonica = [
    "POST",
    path,
    "", // nessun parametro nella query
    headersCanonici,
    elencoFirmati,
    sha256(payload),
  ].join("\n");

  const ambito = `${giorno}/${region}/${service}/aws4_request`;
  const daFirmare = ["AWS4-HMAC-SHA256", now, ambito, sha256(richiestaCanonica)].join("\n");

  // La chiave si deriva a scalini: data, regione, servizio, terminatore.
  const kData = hmac(`AWS4${secretKey}`, giorno);
  const kRegion = hmac(kData, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const firmaFinale = createHmac("sha256", kSigning).update(daFirmare, "utf8").digest("hex");

  return {
    ...headers,
    Authorization:
      `AWS4-HMAC-SHA256 Credential=${accessKey}/${ambito}, ` +
      `SignedHeaders=${elencoFirmati}, Signature=${firmaFinale}`,
  };
}

/* ────────────────────────── Ricerca prodotti ────────────────────────── */

interface RispostaAmazon {
  Errors?: Array<{ Code?: string; Message?: string }>;
  SearchResult?: {
    Items?: Array<{
      ASIN?: string;
      DetailPageURL?: string;
      ItemInfo?: { Title?: { DisplayValue?: string } };
      Images?: { Primary?: { Medium?: { URL?: string } } };
      Offers?: {
        Listings?: Array<{
          Price?: { Amount?: number; Currency?: string; DisplayAmount?: string };
        }>;
      };
    }>;
  };
}

/**
 * Cerca un prodotto su Amazon e restituisce fino a `quanti` offerte.
 *
 * Non lancia mai per un errore di Amazon: un prodotto senza offerta è una riga
 * in meno, non un piano perduto. Lancia solo se le chiavi mancano, che è un
 * errore di configurazione e va visto subito.
 */
export async function cercaSuAmazon(
  prodotto: string,
  paese: string,
  quanti = 2,
): Promise<AmazonOffer[]> {
  if (!isAmazonConfigured()) throw new Error("credenziali Amazon non configurate");

  const codice = (paese || "IT").toUpperCase().slice(0, 2);
  const mercato = MARKETPLACE[codice];
  // Nessun marketplace per quel paese: non si inventa: si restituisce vuoto.
  if (!mercato) return [];

  const path = "/paapi5/searchitems";
  const corpo = JSON.stringify({
    Keywords: prodotto,
    ...(REPARTO_ALIMENTARI[codice] ? { SearchIndex: REPARTO_ALIMENTARI[codice] } : {}),
    ItemCount: Math.min(10, Math.max(1, quanti)),
    PartnerTag: process.env.AMAZON_PARTNER_TAG,
    PartnerType: "Associates",
    Marketplace: mercato.sito,
    Resources: [
      "ItemInfo.Title",
      "Offers.Listings.Price",
      "Images.Primary.Medium",
    ],
  });

  let body: RispostaAmazon;
  try {
    const res = await fetch(`https://${mercato.host}${path}`, {
      method: "POST",
      headers: firma(
        mercato.host,
        mercato.region,
        "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems",
        path,
        corpo,
      ),
      body: corpo,
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status === 429) {
      // Amazon limita la frequenza: non è un guasto, è un ritmo da rispettare.
      console.warn("[amazon] limite di frequenza raggiunto, salto questo prodotto");
      return [];
    }

    body = (await res.json()) as RispostaAmazon;
  } catch (err) {
    console.warn(`[amazon] "${prodotto.slice(0, 40)}" non cercato:`, err);
    return [];
  }

  if (body.Errors?.length) {
    const primo = body.Errors[0];
    // NoResults è normalissimo: Amazon non vende tutto, il fresco quasi mai.
    if (primo.Code !== "NoResults") {
      console.warn(`[amazon] ${primo.Code}: ${(primo.Message ?? "").slice(0, 140)}`);
    }
    return [];
  }

  return (body.SearchResult?.Items ?? [])
    .map((item): AmazonOffer | null => {
      const listing = item.Offers?.Listings?.[0];
      const prezzo = listing?.Price?.Amount;
      // Senza prezzo non è un'offerta: capita per i prodotti non disponibili.
      if (typeof prezzo !== "number" || !item.DetailPageURL) return null;

      return {
        prodotto,
        nome: item.ItemInfo?.Title?.DisplayValue ?? prodotto,
        prezzo,
        valuta: listing?.Price?.Currency ?? "EUR",
        negozio: `Amazon${codice === "IT" ? ".it" : ""}`,
        // L'indirizzo arriva già con il tag di affiliazione dentro.
        link: item.DetailPageURL,
        immagine: item.Images?.Primary?.Medium?.URL,
      };
    })
    .filter((o): o is AmazonOffer => o !== null);
}

/**
 * Cerca su Amazon tutti i prodotti di una lista.
 *
 * A piccoli gruppi perché la PA-API limita la frequenza: il piano base concede
 * circa una richiesta al secondo, e superarla fa rispondere 429 a tutto il
 * resto. Tre per volta è prudente e resta sotto i venti secondi su una lista
 * di diciotto voci.
 */
export async function cercaListaSuAmazon(
  prodotti: string[],
  paese: string,
  gruppo = 3,
): Promise<{ offerte: AmazonOffer[]; trovati: number; cercati: number }> {
  const offerte: AmazonOffer[] = [];
  let trovati = 0;

  for (let i = 0; i < prodotti.length; i += gruppo) {
    const esiti = await Promise.all(
      prodotti.slice(i, i + gruppo).map((p) => cercaSuAmazon(p, paese, 2)),
    );
    for (const e of esiti) {
      if (e.length > 0) trovati++;
      offerte.push(...e);
    }
  }

  return { offerte, trovati, cercati: prodotti.length };
}
