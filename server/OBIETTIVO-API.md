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

## Come la usa l'app

L'app non deve sapere niente di come si trovano i prezzi. Chiede e disegna.

```
  app (React Native)                        l'utente vede
  └─ chiede al SUO server ──────┐
                                │
  app/ (del cliente)            │           il server dell'app
  └─ tiene la CHIAVE SEGRETA ───┤
     e chiama l'API             │
                                ▼
  api/ (di Touchsite)                       il prodotto
  └─ risponde con i dati
```

### Perché non è l'app a tenere la chiave

Questo è il punto da decidere adesso, perché dopo costa caro.

**Una chiave dentro un'app mobile non è segreta.** Sta nel pacchetto che si
installa, e tirarla fuori da un `.apk` è una riga di comando. Se la chiave di
MealMint viaggia dentro l'app, chiunque scarichi l'app ha la nostra API
gratis — e noi paghiamo Mongo e Google per farla funzionare.

Vale per qualunque chiave in un'app: non è un dettaglio nostro, è il motivo per
cui **nessun fornitore serio dà una chiave segreta a un'app**. Stripe, Google
Maps, Algolia: tutti hanno due tipi di chiave proprio per questo.

Per fortuna la struttura che stiamo costruendo la risolve da sola: il blocco
`app/` **è già un server**, ed è quello del cliente. La chiave sta lì.

### Le due chiavi

| | chi la tiene | cosa può fare |
|---|---|---|
| **chiave segreta** | il server dell'app, mai il telefono | tutto, con il tetto del contratto |
| **chiave pubblicabile** | il telefono, se proprio serve | solo le rotte di lettura, tetto stretto, legata al bundle dell'app |

La seconda serve solo se un giorno vogliamo che il telefono chiami l'API
direttamente per qualcosa di innocuo — la copertura, la ricerca prodotti.
Per i prezzi si passa dal server: sono la cosa che costa.

### Com'è una chiamata

Quello che l'app — cioè il suo server — manda:

```http
POST /v1/prezzi
Authorization: Bearer sk_live_...
Content-Type: application/json

{ "voci": ["Latte intero", "Pasta integrale"],
  "paese": "IT", "citta": "Milano", "valuta": "EUR" }
```

E quello che riceve. **Ogni prezzo dice da dove viene e di quando è**, e ogni
voce dice cosa le è successo — che è la differenza fra un dato e una diceria:

```json
{ "voci": [
    { "voce": "Latte intero",
      "esito": "trovato",
      "offerte": [
        { "insegna": "Carrefour", "nome": "Latte intero UHT 1 l",
          "prezzo": 1.19, "valuta": "EUR", "quantita": { "valore": 1, "unita": "l" },
          "prezzoAlLitro": 1.19,
          "link": "https://...", "letto": "2026-09-16T17:12:00Z" }
      ] },
    { "voce": "Pasta integrale",
      "esito": "nessun-prezzo-pubblicato",
      "offerte": [ { "insegna": "Esselunga", "nome": "Pasta integrale 500 g",
                     "prezzo": null, "link": "https://...",
                     "letto": "2026-09-16T17:12:00Z" } ] }
  ],
  "copertura": { "paese": "IT", "insegne": 18 },
  "secondi": 2.4 }
```

**`esito` ha quattro valori, non due:**

| valore | vuol dire | l'app scrive |
|---|---|---|
| `trovato` | c'è il prodotto e c'è il prezzo | il prezzo |
| `nessun-prezzo-pubblicato` | il prodotto c'è, il prezzo il negozio non lo espone | «prezzo non pubblicato» + il link |
| `nessun-prodotto` | in quel paese nessuna insegna ce l'ha | «non disponibile qui» |
| `non-raggiungibile` | non siamo riusciti a chiedere | «riprova» |

Oggi queste quattro cose arrivano all'app tutte uguali, come una voce senza
prezzo, e l'app non può che raccontarle nello stesso modo — che è sbagliato in
tre casi su quattro.

### Cosa sparisce dall'app

Quando questo funziona, dall'app se ne vanno: la scelta della fonte prezzi
(`EXPO_PUBLIC_PRICE_SOURCE`, che oggi **scavalca il server** ed è già costato
un «Londra 0 su 16»), ogni ragionamento su quale prodotto corrisponde a cosa, e
ogni chiamata a un modello per i prezzi.

Restano: chiedere, e disegnare.

---

## Come sta in repo

Per adesso l'API vive nello stesso repo dell'app. Ma ci vive **come un blocco a
sé**, e la regola che lo rende vero è una sola:

> **`api/` non importa mai niente da `app/`.**
> Il contrario sì: l'app usa l'API come la userebbe un estraneo.

Se quella regola vale, staccare l'API un giorno è un `git mv` più un
`package.json`. Se non vale, è un mese di lavoro.

### Quanto siamo lontani: misurato

Trenta file in `server/src`, divisi per quello che sono:

| blocco | file | cosa c'è dentro |
|---|---|---|
| **API** | 15 | catalogo, ricerca, prezzi, negozi, magazzini, vocabolario |
| **app** | 6 | menu, ricette, autenticazione, Amazon, shopping |
| **base** | 8 | database, http, diario, quota, interruttore |

E i fili che oggi impediscono di staccare — cioè i punti dove l'API importa
dall'app — sono **tre**:

```
fallback-link.ts:31      → amazon.ts          il link di ricerca Amazon
prices-catalogo.ts:47    → plan-grounded.ts   la scelta del modello
prices-serpapi.ts:30     → shopping.ts        la strada SerpAPI
```

Tre import. `catalogo-it.ts`, che sono milleduecento righe, non ne ha nessuno.

E il secondo — `plan-grounded` — **sparisce da solo** quando il modello esce
dalla strada dei prezzi, che è già il piano. Quindi i fili veri da tagliare
sono due, e tutti e due riguardano strade dei prezzi alternative che oggi non
usiamo.

### Come sarà

```
server/src/
  api/          il blocco. Non importa mai da app/
    rotte/        /v1/prezzi, /v1/prodotti, /v1/negozi, /v1/copertura, /v1/stato
    catalogo/     costruire il catalogo dalle sitemap      (Antonio)
    ricerca/      cercare dentro al catalogo               (Alberto)
    prezzi/       leggere il prezzo da una pagina
    negozi/       i punti vendita
    base/         database, http, diario, quota
  app/          resta al cliente. Puo' importare da api/
    menu, ricette, liste salvate, autenticazione
  index.ts      monta tutt'e due — per ora
```

### La regola si fa rispettare da sola

Una convenzione scritta in un file la si dimentica in due settimane. Quindi:
**uno script che legge gli import e fallisce se `api/` ne ha uno verso `app/`**,
e che gira insieme al build. Il giorno che qualcuno taglia la strada, il build
si ferma e dice quale riga.

Senza quello, fra tre mesi i fili sono venti invece di tre e nessuno se ne è
accorto.

### Due cose che «ordinata» vuol dire anche

- **Una sola strada per i prezzi.** Oggi ce ne sono due che fanno la stessa
  cosa: `catalogo-it.ts` per l'Italia e `prices-catalogo.ts` per tutto il
  resto. La distanza fra loro è già costata degli errori — una correzione fatta
  in una e non nell'altra. Un fornitore di dati non ha due implementazioni
  della stessa risposta.
- **`catalogo.ts` diviso.** 998 righe con dentro due mestieri: costruire il
  catalogo (Antonio) e cercarci dentro (Alberto). Vanno in `api/catalogo/` e
  `api/ricerca/`, con un commit che sposta e basta.

### Lo spostamento si fa in un colpo solo

Un commit che **sposta e rinomina, senza cambiare una riga di logica**. Così il
diff si legge, e se qualcosa si rompe si sa che è stato lo spostamento.

E si fa **d'accordo con Antonio**, in un momento in cui non ha lavoro aperto:
un `git mv` di trenta file contro delle modifiche non salvate è il modo più
veloce di perdere una giornata a entrambi.

---

## L'infrastruttura è in comune, ma per comodità

Oggi API e app girano nello stesso processo, sullo stesso database, con lo
stesso deploy. È una scelta pratica e va benissimo adesso: due deploy separati
per due cose che stanno cambiando tutti i giorni sarebbero solo due posti dove
sbagliare.

Ma «per comodità» è il modo in cui le cose diventano permanenti senza che
nessuno lo decida. Quindi si scrive qui **cosa è condiviso e quanto costa
separarlo**, e si ricontrolla ogni tanto. Finché questo elenco resta corto,
staccare resta facile.

### Cosa condividono, oggi

| | com'è | quanto costa separarlo |
|---|---|---|
| **il processo** | un solo Node, un solo deploy su Render | poco: due `index.ts`, la base è già comune |
| **il database** | stesso cluster, stesso database | **quasi niente, vedi sotto** |
| **il tetto di spesa** | `SPESA_MAX_USD` è uno, globale | poco, ma va fatto **presto** |
| **il `.env`** | uno solo, e non si sa quale variabile è di chi | poco, se si commenta adesso |
| **il diario e i log** | mescolati | poco |

### Il database è già quasi diviso

Cinque collezioni, e quattro hanno già un padrone chiaro:

```
  prezzi      API      i prezzi letti dalle schede
  cataloghi   API      i cataloghi per paese
  users       app      gli utenti
  plans       app      le liste salvate
  cache       ENTRAMBI  ← l'unica mescolata
```

E anche `cache` è mescolata in modo gentile: le chiavi portano già un prefisso
che dice di chi sono.

```
  "prices"                  API
  "menu", "lista", "plan-full", "menu-da-prodotti"    app
  "amazon", "shopping"      strade dei prezzi alternative
```

Dividerla in due collezioni è quasi gratis **adesso**. Fra sei mesi, con dentro
qualche milione di documenti e magari un prefisso nuovo che non rispetta la
regola, è una migrazione.

### Il tetto di spesa è la cosa da sistemare presto

`SPESA_MAX_USD` è un contatore solo. Vuol dire che **se la generazione di un
menu brucia il budget, l'API smette di rispondere anche a chi paga** — e torna
`402` a tutti.

È l'unica cosa condivisa che fa male *oggi*, non un domani. Due contatori, uno
per blocco, e il problema sparisce.

### Cosa NON si separa adesso

Processo, deploy e cluster Mongo restano in comune finché il confine nel codice
non è dimostrato — cioè finché lo script del confine non passa da un po' di
tempo senza lamentarsi.

Dividere l'infrastruttura di due cose ancora intrecciate non le separa: crea
due posti dove sistemare lo stesso errore.

---

## Cosa vuol dire riuscito

1. **Si chiama con una chiave.** Ogni chiamata porta una chiave, la chiave ha
   un tetto di richieste, e chi sfora prende `429` con scritto quando riprovare.
   Senza chiave: `401`. Due specie: **segreta** per i server, **pubblicabile**
   per il telefono — con la seconda che non può chiedere prezzi. Una chiave
   segreta dentro un'app mobile non è segreta.
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
11. **`api/` non importa niente da `app/`**, e uno script lo verifica a ogni
    build. È la prova che la linea è tracciata davvero e non solo scritta.
12. **L'app non contiene logica di prezzi.** Se la togliamo dal repo, l'API
    continua a funzionare identica.

---

## L'ordine

### Fase 1 — il blocco, la linea e la chiave

Sono la parte che rende l'API *una cosa*, e nessuna dipende dal resto.

0. **Lo script del confine** — legge gli import e fallisce se `api/` ne ha uno
   verso `app/`. Si scrive prima dello spostamento: così lo spostamento stesso
   ha qualcosa che lo verifica, invece di essere «mi sembra a posto».
1. **Lo spostamento** in `api/` e `app/`, un commit che sposta e basta,
   d'accordo con Antonio.
2. **Le rotte `/v1`**, con le vecchie che continuano a rispondere e rimandano
   alle nuove: l'app in preview non si deve accorgere di niente.
3. **Le chiavi.** Una collezione su Mongo, un tetto di richieste al giorno per
   chiave, `401` senza e `429` oltre. La chiave dell'app di MealMint è la
   prima.
4. **CORS chiuso** a una lista, invece di `*`.
5. **`/v1/stato` che non mente** — a partire da `aiConfigured`.
6. **Gli errori che distinguono le tre cause.**

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

**16 settembre 2026 — Fase 1, cinque pezzi su otto**

Fatti, tutti provati facendoli fallire prima di dichiararli riusciti:

| pezzo | come si verifica |
|---|---|
| lo script del confine | `npm run confine`, attaccato a `npm run build` |
| da 3 fili a 1 | `npm run confine --dettaglio` |
| lo stato che non mente | chiave finta → `ia.funziona: false`, `causa: chiave-rifiutata` |
| i due tetti di spesa | app a tetto → `402`; l'API risponde lo stesso |
| `/v1` con i quattro esiti | Monaco: **16 risposte su 16 chieste** (erano 11) |
| ogni prezzo con la sua data | 18 offerte, **0 senza data** |
| le chiavi | `401` senza, `403` alla pubblicabile sui prezzi, `429` oltre il tetto |

Tre prove hanno trovato difetti che senza di loro sarebbero andati in
produzione:

- **il tetto vincolava solo dove qualcuno lo guardava.** Con l'app limitata a
  mezzo centesimo, tre menu sono passati lo stesso: `/ai/menu`, `/ai/lista` e
  `/ai/menu-da-prodotti` spendevano senza chiedere il permesso a nessuno — e
  non sforavano solo il tetto nuovo, anche quello complessivo, da sempre.
- **`/v1/stato` rispondeva `429`** a chi aveva finito il tetto: cioe' proprio a
  chi doveva vedere quanto aveva consumato e quando riparte.
- **`letto` non arrivava in fondo.** Il magazzino la data ce l'aveva e veniva
  buttata nel costruire la riga; poi `groupByProduct` la buttava una seconda
  volta.

Restano di Fase 1: lo spostamento in `api/` e `app/` — serve una finestra in
cui Antonio non ha lavoro aperto — e il CORS chiuso, che puo' rompere la
preview web e va fatto quando nessuno sta provando.

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
