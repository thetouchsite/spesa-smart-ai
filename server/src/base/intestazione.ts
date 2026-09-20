/**
 * Come ci presentiamo a un sito.
 *
 * IL FATTO
 * --------
 * Misurato su `mercado.carrefour.com.br`:
 *
 *     curl con lo stesso User-Agent   →  200, pagina intera
 *     fetch di Node                   →  403
 *
 * Stessa identita' dichiarata, esito opposto. Mancavano `Accept`,
 * `Accept-Language` e i `Sec-Fetch-*`, che un browser manda sempre — e la loro
 * assenza e' l'impronta che tradisce un programma.
 *
 * PERCHE' STA IN `base` E NON IN UN MODULO SOLO
 * ---------------------------------------------
 * Perche' per mesi e' stato in uno solo, e l'altro ne ha pagato il prezzo.
 * Il raccoglitore dei cataloghi mandava tutti e nove gli header; il lettore
 * dei prezzi, nello stesso programma, ne mandava due — `User-Agent` e
 * `Accept: text/html`. Risultato: la sonda apriva le schede di Alcampo cinque
 * volte su cinque e il lettore vero zero volte su sei, sulle STESSE pagine.
 *
 * Centosessantamila indirizzi di Alcampo e Continente risultavano «pagine che
 * non si aprono» quando il problema era come bussavamo noi. E' il genere di
 * difetto che non si trova guardando i siti: si trova solo quando due pezzi
 * di casa propria danno risposte diverse alla stessa domanda.
 *
 * NON E' UN TRAVESTIMENTO
 * -----------------------
 * `robots.txt` lo leggiamo e lo rispettiamo, e queste sono le stesse
 * richieste che farebbe una persona con un browser. Serve a non misurare un
 * nostro difetto al posto del loro sito.
 */
export const INTESTAZIONE_BROWSER = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "Cache-Control": "no-cache",
} as const;
