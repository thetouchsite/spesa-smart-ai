# Chi fa cosa

**Operatore A — Antonio.** I dati: trovare insegne, sitemap, prodotti, negozi.
**Operatore B — Alberto.** L'API: velocità, precisione, togliere l'IA dalla strada dei prezzi.

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
al modello che riordina dei nomi. È lì che sta la lentezza, ed è lì che si
lavora.

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

**Il metro di misura:** secondi per rispondere, e quante voci prendono il
prodotto giusto. Le due cose insieme — andare veloce sbagliando è facile.

### L'obiettivo

Togliere il modello dalla strada dei prezzi, **senza peggiorare le scelte**.
Oggi il modello legge una lista di nomi e dice quali corrispondono. Costa
quattordici secondi e mezzo su diciassette, e ogni tanto non risponde affatto.

Un'API di dati non dovrebbe chiedere a nessuno il permesso di rispondere.

### Come, in ordine — e il primo non si salta

1. **Prima il metro, poi il lavoro.** Un elenco di duecento coppie
   *voce → prodotto giusto*, scelte a mano su IT, GB, DE, ES, FR, e uno script
   che dice quante ne azzecca. Senza questo non si può sapere se una modifica
   migliora o peggiora, e si finisce a discutere di impressioni.
   Misurato oggi: classifica e modello scelgono cose diverse **dieci volte su
   dieci** — ma in sette casi il primo della classifica sembra migliore
   (`petto pollo` contro `petto di pollo a fette sottili`). *Sembra*. Finché
   non c'è l'elenco, è un'impressione.
2. **Staccare la quantità dal nome.** Il peso oggi è una parola come le altre:
   cercando `zucchine 500g` è tornato **chiacchiere 500g**. Va letto come
   numero e tolto dalle parole di ricerca. Coperto: 56% dei nomi in Italia,
   35% in Inghilterra, in quattro formati (`500 g`, `500g`, `gr500`, `4x100g`).
3. **Le dieresi tedesche.** Il catalogo scrive `kaese`, `haehnchen`, `aepfel`;
   la ricerca cerca `kase`, `hahnchen`, `apfel`. Misurato: **0 risultati contro
   5**, su ogni parola provata. Riguarda DE, AT, CH. *(Tocca anche
   `vocabolario.ts`, che contiene le forme sbagliate.)*
4. **Pesare le parole per quanto sono rare.** `latte` da sola oggi pesca
   *pane al latte* e *mousse di latte*. Una parola che compare ovunque non
   distingue niente e non deve valere come una che compare di rado.
5. **A parità di somiglianza, preferire chi pubblica i prezzi.** A Monaco hanno
   risposto flaschenpost e Aldi Nord, resa **0** tutti e due: quattro righe con
   il nome del negozio e un trattino al posto del prezzo.
6. **Solo alla fine, togliere il modello** — e solo se il punto 1 dice che non
   si peggiora. Se dice il contrario, il modello resta e si è imparato perché.

### Poi, quando la scelta è solida

**Il prezzo al chilo.** Oggi l'app mette in colonna *zucchine 500 g a 1,39 €* e
*zucchine 1 kg a 2,19 €* e fa sembrare la prima più conveniente. Non lo è: sono
2,78 €/kg contro 2,19. Per un'app che promette di far risparmiare è il
confronto sbagliato al centro della schermata. Serve il punto 2 per farlo, e
serve una modifica anche sul lato app.

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
