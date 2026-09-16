# Obiettivo — un'API finita, non un server che funziona

Operatore B · Alberto · aperto il 16 settembre 2026

---

## Il punto

Non stiamo ottimizzando un server. Stiamo costruendo **un prodotto**: prezzi
veri della spesa, per paese, con il link alla scheda. Chi lo compra ci manda
una lista e riceve dei dati. Cosa ci faccia poi — un'app, un sito, un foglio di
calcolo — non ci riguarda.

L'app di MealMint diventa **uno dei clienti**, il primo. Prende i dati e li
disegna. Non ha logica di prezzi dentro, non sceglie prodotti, non parla con
nessun modello: chiede e mostra.

Oggi non è così. Oggi c'è un server che fa tutte e due le cose mescolate, e il
confine passa in mezzo ai file.

---

## Cosa manca davvero, misurato

Non sono opinioni: sono cose che ho aperto e guardato il 16 settembre.

### 1. Chiunque conosca l'indirizzo può usarla

`/ai/prices`, `/catalogo/cerca`, `/negozi` non chiedono niente a nessuno.
Nessuna chiave, nessun limite per chiamante, `Access-Control-Allow-Origin: *`
se non si configura una lista.

L'autenticazione che c'è — `auth.ts`, email e password — protegge quattro
rotte: `/me` e `/plans`. Sono **le liste salvate dell'app**, non l'API.

L'unico limite è il tetto di spesa globale (`SPESA_MAX_USD`), che è condiviso:
un estraneo che gira in tondo consuma la quota di tutti e si ferma il servizio.

Per una cosa che vogliamo tenere interna a Touchsite e far pagare, questo è il
buco più grosso. Non il più difficile — il più grosso.

### 2. Non c'è un contratto

Nessuna rotta è versionata. Zero `/v1`. Il giorno che cambiamo la forma di una
risposta, chi ci sta sopra si rompe e non ha modo di restare indietro.

E le rotte si chiamano `/ai/prices`: il nome dice come è fatto dentro, non cosa
dà. Un'API si chiama per quello che serve.

### 3. La risposta non è deterministica

Per decidere quale prodotto corrisponde a «Petto di pollo» si manda una lista
di nomi a un modello e si aspetta. Misurato, Milano, dieci voci:

```
fase prezzi                          17 s
   la scelta del modello             14,6 s   ← 86%
   tutto il resto                     2,4 s
```

Duecentomila prodotti si cercano e quarantaquattro schede si aprono in **due
secondi e mezzo**. Gli altri quattordici sono attesa.

Non è solo lentezza. È che **la stessa domanda può dare risposte diverse**, e
quando il modello non risponde — quota finita, rete giù — la spesa esce
dimezzata senza un errore visibile. È già successo: Londra, tre voci su sei
invece di otto su otto.

Un fornitore di dati non può rispondere «dipende».

### 4. Lo stato dice il falso

`/health` risponde `aiConfigured: true` anche quando il modello è morto. Ci ha
ingannati due volte in una sera.

### 5. Gli errori non distinguono le cause

«Nessun prezzo» oggi vuol dire tre cose diverse: *nessun negozio ha quel
prodotto*, *il negozio ce l'ha ma non pubblica il prezzo*, *non siamo riusciti
a chiedere*. Chi costruisce sopra la nostra API deve poterle distinguere,
perché all'utente finale si raccontano in tre modi diversi.

### 6. Non c'è niente da leggere

Nessuna documentazione, nessun esempio che si possa incollare e far partire.
Oggi l'unico modo di sapere cosa risponde `/ai/prices` è leggere
`index.ts:1094`.

---

## Dov'è la linea

Le rotte di oggi, divise per quello che sono davvero:

| **È l'API — il prodotto** | diventerà |
|---|---|
| `POST /ai/prices` | `POST /v1/prezzi` |
| `POST /catalogo/cerca` | `POST /v1/prodotti` |
| `POST /negozi` | `POST /v1/negozi` |
| `GET /catalogo/stato`, `GET /negozi/stato` | `GET /v1/copertura` |
| `GET /health` | `GET /v1/stato` |

| **È l'app — resta al cliente** |
|---|
| `/auth/register`, `/auth/login`, `/me` |
| `/plans`, `/plans/delete` |
| `/ai/menu`, `/ai/lista`, `/ai/menu-da-prodotti`, `/ai/plan-full` |
| `/ai/recipe`, `/ai/chef`, `/ai/plan`, `/ai/recipe-web` |

**Il modello resta di là.** Inventare un menu, scrivere una lista della spesa a
partire da delle ricette: quello è un servizio, ed è giusto che usi l'IA.
Dire quanto costa il latte a Milano è un dato, e un dato non si inventa.

Questa divisione è anche la risposta alla domanda commerciale: al cliente
consegniamo la colonna di destra, e la colonna di sinistra resta nostra.

---

## Cosa vuol dire riuscito

1. **Si chiama con una chiave.** Ogni chiamata porta una chiave, la chiave ha
   un tetto di richieste, e chi sfora prende `429` con scritto quando riprovare.
   Senza chiave: `401`.
2. **C'è un contratto.** Tutto sotto `/v1`, forme di risposta scritte, e la
   promessa che dentro `v1` non si rompe niente.
3. **La stessa domanda dà la stessa risposta.** Due chiamate identiche a
   distanza di un minuto tornano identiche. Si verifica staccando la chiave del
   modello: **il risultato non deve cambiare**.
4. **Sotto i 5 secondi** su dieci voci a catalogo caldo, e il tempo dichiarato
   nella risposta. Oggi 17.
5. **La precisione non peggiora.** Su duecento coppie *voce → prodotto giusto*
   scritte a mano prima di cominciare, senza modello se ne azzeccano **almeno
   quante con**. Se ne azzecca meno, il modello resta e si scrive perché.
6. **Ogni dato dice da dove viene e di quando è.** Insegna, link, e la data in
   cui quel prezzo è stato letto. Un prezzo senza data è una diceria.
7. **Gli errori distinguono le tre cause** del punto 5 qui sopra.
8. **Lo stato non mente.** `/v1/stato` dice la verità su cosa è vivo, compreso
   quando il modello non lo è.
9. **C'è una pagina che si legge**, con esempi che partono copiandoli.
10. **Funziona in cinque paesi**: IT, GB, DE, ES, FR.
11. **L'app non contiene logica di prezzi.** Se la togliamo dal repo, l'API
    continua a funzionare identica. È la prova che la linea è tracciata bene.

---

## L'ordine

### Fase 1 — la linea e la chiave

Sono la parte che rende l'API *una cosa*, e nessuna dipende dal resto.

1. **Le rotte `/v1`**, con le vecchie che continuano a rispondere e rimandano
   alle nuove: l'app in preview non si deve accorgere di niente.
2. **Le chiavi.** Una collezione su Mongo, un tetto di richieste al giorno per
   chiave, `401` senza e `429` oltre. La chiave dell'app di MealMint è la
   prima.
3. **CORS chiuso** a una lista, invece di `*`.
4. **`/v1/stato` che non mente** — a partire da `aiConfigured`.
5. **Gli errori che distinguono le tre cause.**

### Fase 2 — il metro di misura

**Viene prima di ogni modifica alla ricerca, e non si salta.**

Duecento coppie *voce → prodotto giusto*, scelte a mano sui cataloghi veri di
cinque paesi, in un file in repo, e uno script che dice quante ne azzecca la
classifica e quante il modello.

Un dato che lo rende urgente: oggi classifica e modello scelgono cose diverse
**dieci volte su dieci**, e a occhio in sette casi il primo della classifica è
migliore — `petto pollo` contro `petto di pollo a fette sottili`, `olio di
oliva` contro `olio extra vergine spray`. *A occhio.* Può darsi che quei
quattordici secondi servano a peggiorare la scelta. Può darsi di no. Adesso non
lo sappiamo, ed è esattamente il problema.

Senza questo, spegnere il modello è una scommessa, e discuterne è un parere
contro un altro.

### Fase 3 — la ricerca diventa brava da sola

In quest'ordine, misurando dopo ognuna con il metro della fase 2:

6. **Staccare la quantità dal nome.** Oggi il peso è una parola come le altre:
   cercando `zucchine 500g` è tornato **chiacchiere 500g**, un dolce fritto che
   pesa uguale. Quattro formati coprono tutto:

   | formato | Italia | Regno Unito |
   |---|---|---|
   | `500 g` staccato | 32,6% | 3,0% |
   | `500g` attaccato | 9,5% | **30,5%** |
   | `gr500` rovesciato | 13,3% | 0% |
   | `4 x 100g` | 0,7% | 2,0% |
   | **col peso nel nome** | **56,1%** | **35,4%** |

   I due paesi lo scrivono al contrario. Ecco perché il difetto si vede a
   macchie.

7. **Le dieresi tedesche.** Il catalogo scrive `kaese`, `haehnchen`, `aepfel`,
   `broetchen`; la ricerca cerca `kase`, `hahnchen`, `apfel`, `brotchen`.
   Misurato su sette parole: **0 risultati contro 5**, tutte e sette. Riguarda
   DE, AT, CH — e riguarda `vocabolario.ts`, che le ha scritte nel modo che non
   trova niente.

8. **Pesare le parole per quanto sono rare.** `latte` da sola pesca *pane al
   latte*, *mousse di latte*, *carezza di latte*. Una parola che compare in
   mezzo catalogo non distingue niente; una rara distingue quasi da sola. Oggi
   valgono uguale.

9. **A parità di somiglianza, preferire chi pubblica i prezzi.** A Monaco hanno
   risposto flaschenpost e Aldi Nord — resa **0** tutti e due — e quattro voci
   sono uscite col nome del negozio e un trattino al posto del prezzo.

10. **Togliere il modello**, e solo se il metro dice che non si peggiora.

### Fase 4 — quello che la rende vendibile

11. **La documentazione**, con esempi che partono copiandoli.
12. **Il prezzo al chilo.** Oggi l'app mette in colonna *zucchine 500 g a
    1,39 €* e *zucchine 1 kg a 2,19 €* e fa sembrare la prima più conveniente.
    Non lo è: 2,78 €/kg contro 2,19. Per un'app che promette di far risparmiare
    è il confronto sbagliato al centro della schermata. Serve il punto 6.
13. **Contare le chiamate per chiave**, che è quello che serve per fatturare.
14. **Il repo separato**, quando la linea è netta e l'app non contiene più
    logica di prezzi. Prima no: dividere due cose ancora intrecciate crea solo
    due posti dove sistemare lo stesso errore.

---

## Cosa non si fa

- **Non si rompe la preview** mentre Alberto mostra al cliente. Si costruisce,
  si prova su un'altra porta, si riavvia quando lo dice lui.
- **Non si spegne il modello per far vedere un numero.** Se la precisione cala,
  ha vinto lui e si scrive perché. Anche questo è un risultato.
- **Non si divide il repo adesso.** Prima la linea dentro, poi il taglio fuori.
- **Non si toccano le due strade dei prezzi in modo diverso.**
  `catalogo-it.ts` e `prices-catalogo.ts` sono già due, e la distanza fra loro
  è costata degli errori. Ogni modifica va in tutte e due, o in nessuna.
- **Non si toglie il prezzo nullo.** Una scheda che si apre col prodotto giusto
  e senza cifra vale: c'è il link, e lo dice. Va solo messa dopo chi la cifra
  ce l'ha.
- **Non si promette copertura che non c'è.** `/v1/copertura` dice la verità
  anche quando è brutta: la Germania oggi ha sei fonti su undici che non sono
  supermercati.

---

## Da fare presto, prima che diventi un problema

`catalogo.ts` sono 998 righe con dentro due mestieri: costruire il catalogo
dalle sitemap (Antonio) e cercarci dentro (Alberto). Finché stanno insieme ogni
push è un conflitto.

Spostare la ricerca in `ricerca.ts` con un commit che **sposta e basta** —
nessuna riga di logica cambiata, così il diff si legge e il merge non fa male.

---

## Diario

> Le misure si scrivono qui: numero, data, e **come** è stato ottenuto. Un
> numero senza il metodo è un'opinione con le cifre.

**16 settembre 2026 — il punto di partenza**

| cosa | misura | come |
|---|---|---|
| fase prezzi, Milano, 10 voci | 17 s | `POST /ai/prices`, catalogo caldo |
| di cui la scelta del modello | 14,6 s | log `la scelta del modello` |
| di cui tutto il resto | 2,4 s | differenza |
| catalogo IT in memoria | 200.000 prodotti, 18 insegne | `/catalogo/stato` |
| schede dal magazzino | 29 su 44 | log `[magazzino]` |
| voci con prezzo, Milano | 10 su 10 | risposta |
| voci con prezzo, Londra | 8 su 8 | risposta, dopo il dizionario |
| voci con prezzo, Monaco | 7 su 16 | prova dell'utente, catalogo DE povero |
| costo in IA per piano | ~$0,019 | era $0,055–0,061 |
| rotte protette da una chiave | **0** | `grep requireUser src/index.ts` |
| rotte versionate | **0** | nessun `/v1` |
| limiti per chiamante | **nessuno** | solo il tetto di spesa, globale |
