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
import { insegnePerPaese, isoDaPaese } from "./insegne-online.js";

/**
 * Nomi di paese verso codice ISO.
 *
 * L'app manda «Italia» o «Svizzera» perché è quello che l'utente ha scritto
 * nell'onboarding; qui serve la sigla. Senza conversione un utente italiano
 * finirebbe sul marketplace sbagliato.
 */
/**
 * Il codice del paese, dall'elenco completo in `insegne-online`.
 *
 * Qui viveva una seconda mappa, piu' corta, che di `日本` non sapeva nulla e
 * rispondeva `IT`: chi cercava a Tokyo un prodotto senza link finiva su
 * amazon.it, in italiano, con prezzi in euro. Due elenchi di paesi in due file
 * diversi divergono sempre, e a divergere in silenzio ci mettono poco.
 *
 * L'Italia resta la risposta per chi non ha detto dove sta — ma ora e' una
 * scelta dichiarata, non il buco di una mappa incompleta.
 */
export function codicePaese(paese: string): string {
  return isoDaPaese(paese) || "IT";
}

/**
 * Ricerca sul sito dei negozi che conosciamo.
 *
 * Sono quelli comparsi nelle prove con link funzionanti, più le grandi catene
 * dei paesi provati. La chiave è una porzione del nome come lo scrive il
 * modello — «Carrefour (Bologna)» contiene «carrefour» — perché il nome esatto
 * cambia da una risposta all'altra.
 *
 * OGNI RIGA È STATA APERTA, non dedotta. È il punto: il 2026-09-09 tre di
 * questi indirizzi rispondevano 404 — Carrefour, Conad ed EasyCoop — e l'app
 * ci mandava sopra gli utenti a cui la pagina del prodotto non si era aperta.
 * Un vicolo cieco che ne sostituiva un altro. I pattern giusti li hanno detti
 * i siti stessi, leggendo il modulo di ricerca dalla loro home.
 *
 * CRAI è uscito: `craiweb.it` non risponde più affatto.
 *
 * Un 403 invece va benissimo e resta — Tesco, Kaufland, Sainsbury's respingono
 * i programmi, non le persone: dal telefono di chi usa l'app quelle pagine si
 * aprono.
 *
 * Non è un elenco da completare a mano per duecento paesi: sotto c'è la rete
 * di sicurezza che copre tutti gli altri.
 */
const RICERCA_PER_NEGOZIO: Array<{ chiave: string; url: (q: string) => string }> = [
  { chiave: "carrefour", url: (q) => `https://www.carrefour.it/search?q=${encodeURIComponent(q)}` },
  { chiave: "conad", url: (q) => `https://spesaonline.conad.it/search?query=${encodeURIComponent(q)}` },
  { chiave: "coop", url: (q) => `https://www.easycoop.com/catalogsearch/result/?q=${encodeURIComponent(q)}` },
  { chiave: "esselunga", url: (q) => `https://www.esselunga.it/it/spesa-online/ricerca?q=${encodeURIComponent(q)}` },
  { chiave: "tesco", url: (q) => `https://www.tesco.com/groceries/en-GB/search?query=${encodeURIComponent(q)}` },
  { chiave: "sainsbury", url: (q) => `https://www.sainsburys.co.uk/gol-ui/SearchResults/${encodeURIComponent(q)}` },
  { chiave: "rewe", url: (q) => `https://shop.rewe.de/productList?search=${encodeURIComponent(q)}` },
  { chiave: "kaufland", url: (q) => `https://www.kaufland.de/s/?search_value=${encodeURIComponent(q)}` },
  { chiave: "jumbo", url: (q) => `https://www.jumbo.com/producten/?searchTerms=${encodeURIComponent(q)}` },
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

  // Il negozio non è fra quelli con un indirizzo di ricerca scritto a mano,
  // ma potrebbe essere una delle 114 catene del censimento: allora la ricerca
  // gliela facciamo fare a Google, ristretta al suo dominio. Non è elegante,
  // ma è l'unica cosa che funziona per centoquattordici siti senza scrivere
  // centoquattordici indirizzi a mano — e soprattutto NON PUÒ SBAGLIARE: una
  // ricerca Google si apre sempre, e mostra le pagine di quel negozio.
  const censita = insegnePerPaese(isoDaPaese(paese)).find((i) => {
    const suo = i.nome.toLowerCase();
    // «Conad Spesa Online» dal censimento contro «Conad» dal modello: basta
    // che una delle due contenga la prima parola dell'altra.
    const prima = suo.split(/\s+/)[0];
    return nome.includes(prima) || suo.includes(nome.split(/\s+/)[0]);
  });
  if (censita) {
    return {
      url:
        "https://www.google.com/search?q=" +
        encodeURIComponent(`site:${censita.dominio} ${prodotto}`),
      negozio: censita.nome,
    };
  }

  const amazon = linkRicercaAmazon(prodotto, codicePaese(paese));
  if (amazon) return { url: amazon, negozio: "Amazon" };

  // Ultimo appiglio: il negozio non l'abbiamo riconosciuto e Amazon in quel
  // paese non c'è — è il caso del Portogallo — ma il paese sì. Allora si manda
  // alla catena principale di lì. Non è il negozio che aveva quel prezzo, e
  // l'etichetta lo dice apertamente mostrando il nome vero; è però un posto
  // dove quel prodotto si compra davvero, che è quello che serviva.
  const prima = insegnePerPaese(isoDaPaese(paese))[0];
  if (prima) {
    return {
      url:
        "https://www.google.com/search?q=" +
        encodeURIComponent(`site:${prima.dominio} ${prodotto}`),
      negozio: prima.nome,
    };
  }

  return null;
}
