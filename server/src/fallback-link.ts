/**
 * Quando il link al prodotto muore, un posto dove andare comunque.
 *
 * IL PROBLEMA MISURATO
 * --------------------
 * Il motore trova prezzi veri, ma i suoi link reggono a intermittenza: in due
 * generazioni consecutive, dieci link validi su trenta e poi cinque su
 * ventinove. I motivi, contati sul registro: dodici indirizzi inesistenti,
 * sette siti che rispondono con un errore, cinque che non rispondono. Sono
 * quasi sempre prodotti di marca su piccoli negozi alimentari, di cui il
 * modello non conosce davvero gli indirizzi e che quindi ricostruisce a naso.
 *
 * Per chi usa l'app il risultato è la cosa peggiore: metà lista senza modo di
 * comprare.
 *
 * LA SOLUZIONE
 * ------------
 * L'indirizzo di RICERCA di un negozio non va indovinato: si costruisce, e si
 * apre sempre. `amazon.it/s?k=passata+700g` non può dare 404 — al massimo non
 * trova niente, ma la pagina c'è.
 *
 * Quindi: dove il link al prodotto regge si manda lì; dove cade si manda alla
 * ricerca di quel prodotto — sul sito del negozio se lo conosciamo, altrimenti
 * su Amazon, che esiste in venti paesi ed è la sola rete di sicurezza globale.
 *
 * Il link Amazon porta il tag di affiliazione quando configurato: la stessa
 * pagina, ma la vendita viene attribuita all'account del cliente. Le
 * commissioni non richiedono nessuna API — solo il tag.
 */

import { linkRicercaAmazon } from "./amazon.js";

/**
 * Nomi di paese verso codice ISO.
 *
 * L'app manda «Italia» o «Svizzera» perché è quello che l'utente ha scritto
 * nell'onboarding; qui serve la sigla. Senza conversione un utente italiano
 * finirebbe sul marketplace sbagliato.
 */
const ISO_PER_NOME: Record<string, string> = {
  italia: "IT", italy: "IT",
  germania: "DE", deutschland: "DE", germany: "DE",
  francia: "FR", france: "FR",
  spagna: "ES", espana: "ES", "españa": "ES", spain: "ES",
  "regno unito": "GB", "united kingdom": "GB", inghilterra: "GB", england: "GB",
  irlanda: "IE", ireland: "IE",
  "paesi bassi": "NL", olanda: "NL", nederland: "NL", netherlands: "NL",
  belgio: "BE", belgium: "BE",
  svizzera: "CH", schweiz: "CH", suisse: "CH", switzerland: "CH",
  austria: "AT", portogallo: "PT", portugal: "PT",
  grecia: "GR", greece: "GR", polonia: "PL", poland: "PL",
  svezia: "SE", sweden: "SE", danimarca: "DK", denmark: "DK",
  "stati uniti": "US", usa: "US", "united states": "US",
  canada: "CA", messico: "MX", mexico: "MX", brasile: "BR", brazil: "BR",
  giappone: "JP", japan: "JP", australia: "AU", india: "IN",
  turchia: "TR", turkey: "TR",
};

export function codicePaese(paese: string): string {
  const chiave = (paese ?? "").trim().toLowerCase();
  if (ISO_PER_NOME[chiave]) return ISO_PER_NOME[chiave];
  if (/^[a-z]{2}$/.test(chiave)) return chiave.toUpperCase();
  return "IT";
}

/**
 * Ricerca sul sito dei negozi che conosciamo.
 *
 * Sono quelli comparsi nelle prove con link funzionanti, più le grandi catene
 * dei paesi provati. La chiave è una porzione del nome come lo scrive il
 * modello — «Carrefour (Bologna)» contiene «carrefour» — perché il nome esatto
 * cambia da una risposta all'altra.
 *
 * Non è un elenco da completare a mano per duecento paesi: è una scorciatoia
 * per i casi frequenti. Tutto il resto passa da Amazon.
 */
const RICERCA_PER_NEGOZIO: Array<{ chiave: string; url: (q: string) => string }> = [
  { chiave: "carrefour", url: (q) => `https://www.carrefour.it/ricerca?q=${encodeURIComponent(q)}` },
  { chiave: "conad", url: (q) => `https://spesaonline.conad.it/ricerca?q=${encodeURIComponent(q)}` },
  { chiave: "coop", url: (q) => `https://www.easycoop.com/search?q=${encodeURIComponent(q)}` },
  { chiave: "esselunga", url: (q) => `https://www.esselunga.it/it/spesa-online/ricerca?q=${encodeURIComponent(q)}` },
  { chiave: "crai", url: (q) => `https://www.craiweb.it/ricerca?q=${encodeURIComponent(q)}` },
  { chiave: "tesco", url: (q) => `https://www.tesco.com/groceries/en-GB/search?query=${encodeURIComponent(q)}` },
  { chiave: "sainsbury", url: (q) => `https://www.sainsburys.co.uk/gol-ui/SearchResults/${encodeURIComponent(q)}` },
  { chiave: "rewe", url: (q) => `https://shop.rewe.de/productList?search=${encodeURIComponent(q)}` },
  { chiave: "kaufland", url: (q) => `https://www.kaufland.de/s/?search_value=${encodeURIComponent(q)}` },
  { chiave: "jumbo", url: (q) => `https://www.jumbo.com/zoeken?searchTerms=${encodeURIComponent(q)}` },
  { chiave: "albert heijn", url: (q) => `https://www.ah.nl/zoeken?query=${encodeURIComponent(q)}` },
  { chiave: "migros", url: (q) => `https://www.migros.ch/it/search?query=${encodeURIComponent(q)}` },
  { chiave: "consum", url: (q) => `https://tienda.consum.es/es/busqueda?q=${encodeURIComponent(q)}` },
  { chiave: "mercadona", url: (q) => `https://tienda.mercadona.es/search-results?query=${encodeURIComponent(q)}` },
  { chiave: "auchan", url: (q) => `https://www.auchan.fr/recherche?text=${encodeURIComponent(q)}` },
];

export interface Ripiego {
  url: string;
  /** Il nome da mostrare sul tasto: «cerca su Amazon». */
  negozio: string;
}

/**
 * Dove mandare l'utente quando il link al prodotto non si apre.
 *
 * Prima si prova la ricerca sul sito del negozio che aveva quel prezzo: è il
 * posto più vicino a ciò che l'utente si aspettava. Se quel negozio non lo
 * conosciamo, si ripiega sulla ricerca Amazon del suo paese.
 *
 * Restituisce `null` solo se nemmeno Amazon è disponibile in quel paese, e in
 * quel caso la riga resta senza link: è raro, ed è meglio del nulla travestito.
 */
export function linkDiRipiego(prodotto: string, negozio: string, paese: string): Ripiego | null {
  const nome = (negozio ?? "").toLowerCase();
  const noto = RICERCA_PER_NEGOZIO.find((r) => nome.includes(r.chiave));
  if (noto) return { url: noto.url(prodotto), negozio };

  const amazon = linkRicercaAmazon(prodotto, codicePaese(paese));
  return amazon ? { url: amazon, negozio: "Amazon" } : null;
}
