/**
 * Porta nel database quel che si sapeva delle singole insegne.
 *
 * PERCHE' UNA VOLTA SOLA
 * ----------------------
 * Queste note stavano nei commenti dentro `catalogo-fonti.ts`, in mezzo alle
 * righe dell'elenco. Li' le vedeva solo chi apriva quel file — e quando
 * l'elenco si e' spostato sul database sarebbero rimaste indietro, che e' il
 * modo piu' comune di perdere il sapere di un progetto: non cancellandolo, ma
 * lasciandolo dov'era mentre il resto si sposta.
 *
 * Attaccate alla riga viaggiano col dato. Le vede chi interroga il database,
 * chi genera il cruscotto, e chi fra sei mesi si chiede perche' Alcampo punta
 * all'indice invece che alla prima parte.
 *
 * Questo script si lancia una volta. Da qui in poi le note si scrivono sul
 * database come tutto il resto.
 *
 * Uso:
 *   npx tsx --env-file-if-exists=.env scripts/porta-note.ts --vai
 */

import { fonti } from "../src/base/db.js";

const NOTE: Array<[string, string, string]> = [
  [
    "ES",
    "Alcampo",
    "Una riga sola: le due di prima erano lo stesso negozio contato due volte. " +
      "50.000 prodotti stanno in part1 e 36.555 in part2, quindi si punta all'indice " +
      "e `paScheda` scarta volantini, ricette e categorie. La riga grossa di prima " +
      "puntava alle vetrine dei volantini: pagine con venti prezzi ciascuna, da cui " +
      "ne leggevamo uno e lo attaccavamo a un nome ricavato dall'indirizzo.",
  ],
  [
    "ES",
    "Naturitas",
    "La resa resta 1 e NON si abbassa. Misurata a ritmo nostro da 4 pagine su 10, " +
      "ma tutte e quattro col prezzo: le altre sei non erano senza prezzo, erano " +
      "richieste rifiutate perche' andavamo troppo in fretta. Il rimedio e' rallentare " +
      "la raccolta, non mandare in fondo alla fila centomila schede che il prezzo ce " +
      "l'hanno. Verificato a mano: 10,16 EUR a schermo e in `og:price`, sulla stessa " +
      "scheda che la misura non era riuscita ad aprire.",
  ],
  [
    "ES",
    "Aldi España",
    "Puntava all'indice, e le sue ultime figlie sono i NEGOZI: risultavano 2.483 " +
      "«prodotti» che erano punti vendita con indirizzo e orari. La sitemap dei " +
      "prodotti e' `/sitemaps/.aldi-nord-sitemap-products.xml`.",
  ],
  [
    "DE",
    "Aldi Nord",
    "Stesso difetto di Aldi Spagna: puntava all'indice invece che a " +
      "`-products.xml`. Il prezzo pero' non ce l'ha lo stesso — e' un sito di " +
      "catalogo, non un negozio, e chiede la regione prima di mostrare qualcosa.",
  ],
  [
    "AT",
    "dm Austria",
    "Era a zero e un lettore per la sua API ce l'avevamo da giorni: stessa trappola " +
      "di Naturasi, un lettore scritto e mai chiamato, perche' il notturno non apre " +
      "le insegne a resa 0. Puntava all'indice invece che a `product-sitemap.xml`. " +
      "DA DECIDERE: e' una drogheria, e la regola dice «solo roba da mangiare» — su " +
      "otto schede aperte sei erano cosmetici, e in Germania dm era gia' stata tolta.",
  ],
  [
    "FR",
    "La Grande Épicerie",
    "Misurata 0 su 10 da `resa-veloce.ts` e 12 su 12 dal catalogo vero. Vince il " +
      "catalogo vero, e il perche' conta piu' del numero: `resa-veloce` campiona la " +
      "sitemap grezza, e l'indice di questa insegna porta a pagine `coup-de-coeur` " +
      "che hanno la forma di una scheda e non lo sono. Regola generale: quando le due " +
      "misure litigano ha ragione quella che campiona da `daUnaFonte`.",
  ],
  [
    "PT",
    "Pingo Doce",
    "ERA SEGNATA COME VIETATA DAL ROBOTS.TXT, E NON E' VERO. Riletto il 16 settembre " +
      "2026: nessun `Disallow: /`, vieta soltanto carrello, pagamento, area cliente e " +
      "la navigazione a filtri. Le schede sono consentite, la sitemap e' dichiarata, " +
      "e si legge il prezzo su 7 schede su 10. Dodicimila prodotti tenuti fuori da una " +
      "nota che nessuno aveva piu' verificato. Vale come avvertimento generale: un «no» " +
      "invecchia, e un divieto dato per scontato costa quanto un'insegna mai trovata.",
  ],
  [
    "IT",
    "Prezzemolo e Vitale",
    "Trovata provando trenta insegne italiane e spagnole: e' l'unica delle trenta che " +
      "pubblichi un catalogo con i prezzi dentro. Il nome del file e' scritto male da " +
      "loro, `stemap`, e va copiato cosi' com'e'. Dichiara 7.590 indirizzi ma ne " +
      "teniamo 722: solo quelli portano il codice articolo in fondo, e la forma degli " +
      "altri e' troppo generica per accettarla senza far entrare mezzo sito.",
  ],
  [
    "IT",
    "Iperal Spesa Online",
    "Era scritta a resa 0 e vale 23.255 voci che il catalogo trovava benissimo: era " +
      "la resa vecchia a mandarla in fondo alla fila. Il prezzo sta nell'HTML, non " +
      "serve nessun lettore. La sua sitemap ha DUE piani di indici annidati, ed e' " +
      "per questo che le misure veloci la davano vuota.",
  ],
  [
    "IT",
    "Naturasi",
    "Gira su EBSN come cinque altre italiane, ma a differenza loro l'API risponde con " +
      "`price` e il robots.txt la consente. Il prezzo in pagina non c'e': l'HTML e' un " +
      "guscio da 2,6 KB. Vedi il lettore in `prezzi-api.ts`.",
  ],
  [
    "IT",
    "Carrefour Italia",
    "Misurata due volte, 9 su 10 e 7 su 10: la resa scritta e' la somma delle due, " +
      "16 su 20. Un campione da dieci non basta a separare 0,7 da 0,9.",
  ],
  [
    "ES",
    "Consum",
    "Leggeva zero per una ragione che dai numeri non si vedeva: la sua sitemap " +
      "pubblica anche il valenzano, e cercare «melmelada maduixa» in un'API che " +
      "risponde «Mermelada Fresa» non trova niente. Il codice in fondo all'indirizzo " +
      "invece e' lo stesso nelle due lingue. Vedi il lettore in `prezzi-api.ts`.",
  ],
  [
    "HR",
    "Konzum",
    "Trovata sondando sedici insegne dell'Europa dell'Est e balcanica. Pubblica " +
      "`sitemap_products.xml` separata dal resto: 11.153 schede, prezzo in `og:price`.",
  ],
  [
    "CZ",
    "Billa",
    "Gli indirizzi ci sono, il prezzo no: il browser lo disegna dopo. Resta perche' " +
      "un nome e un link valgono anche senza prezzo, e il notturno non la apre nemmeno.",
  ],
  [
    "BR",
    "Carrefour Brasil",
    "PER TRE VOLTE DATA PER MORTA, E IL DIFETTO ERA NOSTRO. La sua sitemap pubblica " +
      "20.045 prodotti per file, per quattro file. Gli indirizzi sono in forma VTEX e " +
      "finiscono con `/p` SENZA barra finale, mentre `paScheda` cercava `/p/`. " +
      "Aggiunta la forma il 16 settembre 2026. Se torna a dare zero, prima di " +
      "cancellarla guardare se risponde 403: e' un limite di frequenza, non un divieto.",
  ],
  [
    "IT",
    "CoopShop",
    "Serve accedere per vedere il prezzo. L'API `/ebsn/api/products` e' CONSENTITA e " +
      "risponde, ma il campo `price` nella risposta non c'e' proprio. Verificato " +
      "aprendo la scheda con gli occhi.",
  ],
  [
    "IT",
    "Alì Supermercati",
    "IL PREZZO SULLA PAGINA SI VEDE — 18,90 euro, e pure il prezzo al chilo. Ma " +
      "l'HTML e' un guscio da 16 KB: la cifra la prende il browser da `/ebsn/api/`, " +
      "che il loro robots.txt vieta per nome. Non c'e' niente di rotto da riparare, " +
      "c'e' un permesso da chiedere.",
  ],
];

async function main() {
  const vai = process.argv.includes("--vai");
  const c = await fonti();
  let scritte = 0;
  let mancanti = 0;

  for (const [paese, insegna, nota] of NOTE) {
    const id = `${paese}|${insegna}`;
    const esiste = await c.findOne({ _id: id }, { projection: { _id: 1 } });
    if (!esiste) {
      mancanti++;
      console.log(`   ! non sul database: ${id}`);
      continue;
    }
    console.log(`   ${paese}  ${insegna}`);
    if (vai) await c.updateOne({ _id: id }, { $set: { nota } });
    scritte++;
  }

  console.log(
    `\n  ${scritte} note${vai ? " scritte" : " pronte (prova a vuoto, aggiungi --vai)"}` +
      (mancanti ? ` · ${mancanti} insegne non trovate` : ""),
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
