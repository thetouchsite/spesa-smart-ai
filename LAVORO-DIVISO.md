# Chi fa cosa

**Operatore A — Antonio.** I dati: trovare insegne, sitemap, prodotti, negozi.
**Operatore B — Alberto.** L'API: farne un prodotto finito, che l'app
usa come si usa qualunque fornitore di dati.

Questo file si aggiorna **a ogni push**. Chi pusha scrive due righe in fondo,
sotto *Passaggio di consegne*, e chi tira le legge prima di ricominciare. Se il
file non è aggiornato il push è incompleto.

---

## Perché ci siamo divisi così

Misurato il 16 settembre 2026, richiesta prezzi su Milano, dieci voci:

```
fase prezzi                          17 s
   la scelta del modello             14,6 s   ← 86%
   tutto il resto                     2,4 s
       200.000 prodotti già in memoria
       44 schede aperte, 29 dal magazzino
```

Il lavoro vero dura **due secondi e mezzo**. Il resto è aspettare una chiamata
al modello che riordina dei nomi — che è anche il motivo per cui la stessa
domanda può dare risposte diverse, e per cui quando il modello tace la spesa
esce dimezzata senza un errore visibile.

Nello stesso giorno, prova su Monaco di Baviera: 16 voci chieste, 7 con un
prezzo. La causa principale non era il codice — era che delle undici fonti
tedesche **sei non sono supermercati** (tre drogherie, due consegne di bevande,
un'enoteca) e mancano Rewe, Edeka, Kaufland, Penny. Confronto: l'Italia ha
diciotto insegne, tutte supermercati, 208.671 prodotti.

Due problemi diversi, due persone.

---

## Operatore A — Antonio · i dati

**Il metro di misura:** quante voci di una spesa vera trovano un prodotto con
un prezzo, in ciascun paese. Non il numero di prodotti nel catalogo: quello
cresce anche aggiungendo lampadine.

### Cosa c'è da fare, in ordine di resa

1. **Germania.** Rewe, Edeka, Kaufland, Penny, Globus. Sono i quattro/cinque
   più grandi del paese e non ci sono. Verificare `robots.txt` e sitemap prima
   di qualunque altra cosa.
2. **Ripulire le fonti che non sono spesa.** Müller, Rossmann, dm sono
   drogherie; flaschenpost consegna bevande; Weinfreunde è un'enoteca. Occupano
   posti in classifica e rispondono con prodotti senza prezzo.
3. **Spagna e Francia.** Spagna ha otto fonti di cui cinque con resa sotto 0,25.
   Francia ne ha sei, e tre sono negozi bio.
4. **Rifare le rese** (`scripts/resa-insegne.mjs`) dopo ogni aggiunta. Una resa
   sbagliata è peggio di una mancante: finisce in `catalogo-fonti.ts` e da lì
   in poi quell'insegna viene provata per ultima per sempre.

### Regole che non si negoziano

- **`robots.txt` è vincolante.** Se dice no, è no.
- **403 e 429 non sono divieti, sono limiti di frequenza.** Ci siamo cascati
  tre volte: Aldi UK, Sainsbury's, poi Poundland e MuscleFood. La cura è
  rallentare — una pagina alla volta con un secondo e mezzo di pausa — non
  dichiarare l'insegna muta.
- **Non si aggira mai la protezione bot.** Niente impronte TLS finte. Tesco,
  Asda e Sainsbury's restano fuori se l'unico modo è quello.
- **Solo roba da mangiare.** M&S è uscito con 270.094 capi d'abbigliamento,
  Morrisons stava importando 5.849 lampadine.

### File di Antonio

```
server/src/catalogo-fonti.ts          generato — attenzione sotto
server/src/negozi.ts                  i punti vendita
server/src/catalogo-magazzino.ts      il magazzino dei cataloghi
server/src/prezzi-magazzino.ts        il magazzino dei prezzi
server/src/insegne-online.ts
server/scripts/aggiorna-fonti.mjs     caccia-*.mjs, censimento-*.mjs,
server/scripts/resa-insegne.mjs       verifica-insegne.mjs, cerca-insegne.mjs
```

> **`catalogo-fonti.ts` si rigenera, e rigenerandolo si perde roba.** Dentro ci
> sono sette insegne britanniche aggiunte a mano che il generatore non trova, e
> c'è la deduplica per sitemap che il generatore non fa (sedici insegne contate
> due volte, 225.731 prodotti doppi). Prima di rigenerare, leggere il commento
> in testa al file.

---

## Operatore B — Alberto · l'API

**Il metro di misura:** un'API che si potrebbe vendere a qualcuno che non sia
noi. Secondi per rispondere e voci che prendono il prodotto giusto sono due
pezzi di quello, non il traguardo.

### L'obiettivo

**Costruire un'API finita, come la vende un fornitore di dati.** Non
velocizzare un server: fare un prodotto. Chi la compra manda una lista e riceve
dei dati. Cosa ci faccia poi non ci riguarda.

L'app di MealMint diventa **uno dei clienti**, il primo. Prende i dati e li
disegna: niente logica di prezzi dentro, nessuna scelta di prodotti, nessuna
chiamata a un modello. Chiede e mostra.

Il piano completo sta in **`server/OBIETTIVO-API.md`**. In breve, cosa manca
per poterla chiamare finita — tutto verificato, non supposto:

| | oggi |
|---|---|
| rotte protette da una chiave | **0** — `/ai/prices`, `/catalogo/cerca` e `/negozi` sono aperte a chiunque |
| limiti per chiamante | **nessuno** — c'è solo il tetto di spesa, ed è condiviso |
| rotte versionate | **0** — nessun `/v1`, quindi nessun contratto |
| risposta deterministica | **no** — la sceglie un modello, e se tace la spesa esce dimezzata |
| errori che dicono la causa | **no** — «nessun prezzo» sono tre cose diverse |
| documentazione | **nessuna** |

E la lentezza, che era il sospetto di partenza, è confermata: dei 17 secondi
della fase prezzi, **14,6 sono la chiamata al modello**. Ma è un sintomo di
quel «no» nella quarta riga, non il problema.

### Dove passa la linea

Serve anche a decidere cosa consegniamo al cliente e cosa resta nostro.

**È l'API (nostra):** `/ai/prices`, `/catalogo/cerca`, `/negozi`,
`/catalogo/stato`, `/health` → diventeranno `/v1/prezzi`, `/v1/prodotti`,
`/v1/negozi`, `/v1/copertura`, `/v1/stato`.

**È l'app (del cliente):** `/auth/*`, `/me`, `/plans`, `/ai/menu`,
`/ai/lista`, `/ai/plan-full`, `/ai/recipe*`, `/ai/chef`.

Il modello resta di là. Inventare un menu è un servizio, ed è giusto che usi
l'IA. Dire quanto costa il latte a Milano è un dato, e un dato non si inventa.

### I quattro tempi

1. **La linea e la chiave** — rotte `/v1`, chiavi con tetto, CORS chiuso,
   stato che non mente, errori che distinguono le cause.
2. **Il metro di misura** — 200 coppie *voce → prodotto giusto* scritte a mano,
   e lo script che le conta. **Prima di toccare la ricerca.** Senza, spegnere
   il modello è una scommessa.
3. **La ricerca brava da sola** — staccare la quantità dal nome, le dieresi
   tedesche, pesare le parole rare, preferire chi pubblica i prezzi. E solo
   alla fine togliere il modello, se il metro dice che non si peggiora.
4. **Quello che la rende vendibile** — documentazione, prezzo al chilo,
   conteggio delle chiamate per chiave, e il repo separato *quando* l'app non
   contiene più logica di prezzi.

### File di Alberto

```
server/src/catalogo.ts                ATTENZIONE — vedi sotto
server/src/prices-catalogo.ts         i prezzi, strada generica
server/src/catalogo-it.ts             i prezzi, strada italiana
server/src/price-page.ts              leggere il prezzo da una pagina
server/src/vocabolario.ts             il dizionario della spesa
server/src/sinonimi.ts                i sinonimi dentro un paese
server/src/index.ts                   le rotte
```

---

## L'unico punto dove ci pestiamo i piedi

**`server/src/catalogo.ts`** — 998 righe, e dentro ci sono due mestieri
diversi:

| righe | cosa fa | di chi |
|---|---|---|
| ~1–700 | leggere le sitemap, costruire il catalogo | **Antonio** |
| ~700–998 | `parole()`, `cercaNelCatalogo()`, la classifica | **Alberto** |

Finché stanno nello stesso file ogni push è un conflitto. **Da fare presto:
spostare la ricerca in `server/src/ricerca.ts`** e lasciare in `catalogo.ts`
solo la costruzione. Lo fa Alberto, in un commit che sposta e basta, senza
cambiare una riga di logica — così il diff si legge e il merge non fa male.

Fino ad allora: chi tocca `catalogo.ts` lo dice **prima**, qui sotto.

### Le altre regole del vivere insieme

- **`git pull` prima di ogni push.** Sempre. Ci è già costato un MERGE_HEAD
  bloccato.
- **Un commit fa una cosa sola** e il messaggio dice *perché*, non *cosa*: il
  *cosa* si legge nel diff.
- **Mai committare `.env` né `.env.backup-*`.** Dentro c'è la password di Mongo
  e la chiave Google. Da oggi sono in `.gitignore`, ma un `git add -A`
  distratto resta un modo per pubblicarle.
- **Le misure si scrivono, non si ricordano.** Numero, data, e come è stato
  ottenuto. Un numero senza il metodo è un'opinione con le cifre.

---

## Dove siamo, oggi

| paese | insegne | prodotti | note |
|---|---|---|---|
| Italia | 18 | 208.671 | tutte supermercati, funziona |
| Regno Unito | 11 | 74.982 | buono; Tesco/Asda/Sainsbury's fuori portata onesta |
| Germania | 11 | — | **6 non sono supermercati**, mancano i quattro grandi |
| Spagna | 8 | — | cinque su otto con resa sotto 0,25 |
| Francia | 6 | — | tre su sei sono negozi bio |

Magazzino Mongo collegato: Italia si carica in 2–3 s, Regno Unito in 1 s (erano
~141 s ciascuno).

---

## Passaggio di consegne

> Righe nuove **in cima**. Chi pusha scrive: data, chi, cosa cambia per l'altro.
> Se una modifica tocca il file dell'altro, si dice qui **prima** di farla.

**16 settembre 2026 — Alberto**
Fase 1 dell'API: cinque pezzi su otto. C'e' `npm run confine`, che fallisce il
build se `api/` importa da `app/` — i fili erano tre, adesso e' uno solo, e
quell'uno sparira' da se'. Poi: `/v1/prezzi`, `/v1/prodotti`, `/v1/negozi`,
`/v1/copertura`, `/v1/stato`, protette da una chiave; ogni voce chiesta torna
con un esito fra quattro; ogni prezzo dice di quando e'; e il tetto di spesa
adesso e' due, cosi' un menu non puo' piu' far rispondere `402` all'API.

*Per Antonio, tre cose:*
1. **Le rotte vecchie non sono cambiate.** Provato: stesse chiavi, stessa
   forma, nessuna chiave richiesta. I tuoi script continuano a funzionare.
2. **Un file nuovo adesso fa fallire il build** finche' non lo dichiari in
   `scripts/confine.mjs`. Trenta secondi, e serve a rispondere «e' API o e'
   app?» il giorno in cui la risposta e' ancora facile.
3. **Mi serve una finestra** per spostare i file in `api/` e `app/`: e' un
   `git mv` di trenta file e ti si scontrerebbe addosso. Dimmi quando non hai
   niente di aperto.

*E una cosa per te che ho misurato:* `catalogo-fonti.ts` ha sei fonti tedesche
su undici che non sono supermercati — tre drogherie, due consegne di bevande,
un'enoteca — e mancano Rewe, Edeka, Kaufland, Penny. E' la causa principale del
«7 voci su 16» di Monaco.

**16 settembre 2026 — Antonio**
Germania da 11 fonti a 7, e da 25.665 prodotti a 47.012. Berlino: **11 voci su
12** con prezzo (erano 7 su 16 a Monaco).

*Tolte perche' non sono spesa:* Muller, Rossmann, dm (drogherie: fra il 6% e il
10% dei loro prodotti sembra cibo), flaschenpost — contata due volte, stesso
catalogo sotto due nomi — e Weinfreunde. Erano 167.000 prodotti a resa 0 che
occupavano il posto dei supermercati.

*Aggiunte:* **Knuspr** 15.177 prodotti resa 0,93 e **Mytime** 12.265 resa 1,00.
Misurate su quattordici schede ciascuna, aperte davvero.

*I quattro grandi restano fuori, e non per un difetto nostro.* REWE pubblica
95.950 schede e su ognuna scrive «Konkreter Preis abhaengig vom Standort»: il
prezzo dipende dal punto vendita, non esiste sulla pagina per nessuno. Edeka
sono negozianti indipendenti, i prezzi sono le offerte settimanali del singolo
mercato, e comunque ci risponde 403 su ogni pagina — verificato che dal browser
si apre, quindi il blocco e' contro di noi e aggirarlo e' vietato. Kaufland
uguale. Globus vieta le schede nel robots.txt.

*Per Alberto — due cose che toccano i tuoi file:*
1. `price-page.ts`: una pagina di rifiuto puo' far uscire un numero a caso
   marcato «verificato». REWE ci ha dato **299 euro per un sacchetto di
   zenzero** e 199 per le prugne: quei numeri stavano dentro dati in base64
   nella pagina di rifiuto. E' il difetto delle mele Lidl a 63 sterline, con
   una causa nuova.
2. L'abbinamento: a Berlino «Kartoffeln 2kg» ha preso **«Karotten 2kg
   beutel»** — patate contro carote. Due lettere di differenza.

*Nei miei file:* `paScheda()` ora riconosce tre forme di indirizzo invece di
una (codice prima del nome, trattini bassi, `.html` in fondo) — era quella la
ragione per cui Knuspr e Mytime risultavano vuote, e il registro diceva «la
sitemap non ha risposto» mentre rispondeva benissimo. Messaggio corretto.
`nomeDaUrl()` toglie il codice articolo dal nome: si vedeva «axe ice chill
3in1 duschgel 4501124639».

**16 settembre 2026 — Alberto**
Il dizionario della spesa (`vocabolario.ts`) sostituisce la traduzione a
richiesta: 102 concetti in sei lingue, il modello viene chiamato solo per le
parole sconosciute e la sua risposta finisce nel dizionario. Misurato su venti
voci nel catalogo britannico: candidati trovati da 45 a 160, sedici voci
migliorate, **zero peggiorate**. Londra: 8 voci su 8, zero chiamate al modello.
*Per Antonio:* non tocca niente di tuo. Ma il dizionario ha le parole tedesche
scritte senza `ae`/`oe`/`ue` — vanno corrette prima che vada in produzione,
altrimenti il tedesco peggiora. `.env.backup-*` adesso è in `.gitignore`.

**16 settembre 2026 — Alberto**
Aggiunte al filtro delle preparazioni le parole che facevano tornare pasta
sfoglia al posto della pasta: `sfoglia`, `insalat`, `condit`, `saltat`,
`grigliat`, `marinat`, `panat`, `pronto in`, `monoporzion`. In tutte e due le
strade. *Nota:* `grigliat` non intercetta «alla **griglia**» — manca ancora.
