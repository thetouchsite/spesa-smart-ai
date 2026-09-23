# Spesa Smart — analisi tecnica

**4 settembre 2026** · tutti i numeri di questo documento sono **misurati**, non stimati.
Dove c'è un tempo o un costo, quella prova è stata eseguita e il risultato è quello scritto.

---

## In una pagina

Il prototipo prometteva prezzi reali dei supermercati e non li aveva: mostrava
stime da un listino interno, uguali per tutti, e link che portavano a pagine di
ricerca. La domanda di questo lavoro era una sola: **si possono avere prezzi
veri, con il link per comprare, a un costo sostenibile?**

Sì. La risposta è un motore che, dopo l'onboarding, fa **due chiamate a
un'intelligenza artificiale con la ricerca Google collegata** e produce menù,
ricette, lista della spesa e prezzi reali dei negozi della città dell'utente.

| | |
|---|---|
| Tempo per un piano completo | **45-85 secondi** |
| Costo per piano | **~0,03 $** (≈ 0,028 €) |
| Prezzi con link verificato | 10-21 per piano, secondo il paese |
| Paesi provati | Italia, Francia, Spagna, Paesi Bassi, Germania, Regno Unito |
| Lingue corrette | **6 su 6** |

E una cosa che il prototipo non faceva: **ogni prezzo mostrato è stato
controllato dal nostro server aprendo la pagina del prodotto.** Quello che non
si apre, non si mostra.

---

## 1. Come funziona il motore

### Due chiamate, non una

La prima idea era chiedere tutto in una volta: menù, ricette, lista e prezzi.
Non funziona, ed è stato misurato — non supposto.

Con un prompt lungo (quattromila caratteri, tutto insieme) il modello **smette
di cercare sul web** e risponde a memoria. La risposta torna senza il campo
`groundingMetadata`, che è il modo in cui Google dichiara «ho fatto queste
ricerche». Zero ricerche. Il piano sembra ottimo, i prezzi sono inventati.

Con un prompt corto e mirato ai soli prezzi (seicento caratteri), cerca: **dieci
ricerche, quattro catene, quattordici link validi su venti.**

> **Più piccola è la domanda, più il modello lavora davvero.**

Da qui la divisione in due fasi:

**FASE 1 — menù, ricette e lista della spesa**
Nessuna ricerca web: il modello lo scrive da sé, come faceva già il prototipo.
Non serve internet per sapere che il ragù vuole carne macinata. Senza ricerca
non c'è tariffa di ricerca, quindi **questa fase può girare sulla chiave
gratuita e non costa nulla.**
*Misurato: 7-8 secondi.*

**FASE 2 — prezzi e link**
Prompt corto, solo la lista della spesa: «quanto costano questi prodotti a
Bologna, su tre catene». Qui la ricerca serve, ed è l'unica cosa che si paga.
*Misurato: 44-73 secondi, 0,026-0,036 $.*

### Il server controlla, non si fida

Questa è la parte che distingue il lavoro fatto da una demo.

Il modello, quando una catena ha il catalogo dietro login, **ricostruisce gli
indirizzi a mano** seguendo lo schema del sito. Il risultato ha l'aria giusta e
non esiste. È stato misurato: in una prova ha scelto Esselunga e prodotto
**dodici indirizzi su dodici che davano 404.** I prezzi erano probabilmente
corretti, ma non c'era modo di dimostrarlo.

Quindi ogni riga passa da un controllo: **il nostro server apre la pagina.**

- La pagina si apre e dichiara il prezzo → `verificato`, massima fiducia
- La pagina si apre ma il prezzo è caricato via JavaScript → `pagina-ok`, il link è buono
- 404, timeout, blocco → **il link non viene mostrato**

Costo di questo controllo: **zero.** È una richiesta HTTP su una pagina che
l'AI ha già trovato.

### Il supermercato più conveniente lo sceglie il server

Il modello propone i prezzi di due o tre catene. **Non sceglie il vincitore**:
lo decide il server, dopo aver aperto le pagine, e vince **la più economica fra
quelle verificabili**. Se la più conveniente in assoluto ha il catalogo chiuso,
non può vincere — perché nessuno potrebbe controllare quel prezzo.

Così il risparmio dichiarato non è un'affermazione del modello: è una
sottrazione fra due somme di prezzi che qualcuno ha aperto.

### Le offerte

Già che la pagina è aperta, si legge anche il prezzo pieno. Caso reale della
prova: la passata Carrefour. Il modello ha detto **0,95 €**, la pagina mostrava
**0,79 €** con 0,95 barrato — sconto del 17% fino al 13 settembre.

Nessuno dei due sbagliava: erano due prezzi diversi, entrambi veri. Leggendo la
pagina si ottengono entrambi, e l'app può dire *«0,79 € — in offerta, risparmi
0,16 € fino al 13 settembre»*.

**Per un'app che aiuta a spendere meno, intercettare le promozioni è il punto.**

---

## 2. Perché Gemini e non ChatGPT

Le quattro soluzioni sono state provate sullo stesso identico compito: menù di
sette giorni per quattro persone a Bologna, 120 € di budget, dodici prezzi reali
con link. **Ogni link è stato aperto uno per uno** per contarli.

| Motore | Tempo | Costo | Prezzi | Link validi |
|---|---|---|---|---|
| **Gemini 3 Flash + ricerca** | **28 s** | **0,018 $** | 12/12 | **12/12** |
| Gemini 3.5 Flash + ricerca | 96 s | 0,034 $ | 12/12 | 12/12 |
| GPT-5 + web_search | 157 s | 0,322 $ | 12/12 | 12/12 |
| GPT-5-mini + web_search | 45-59 s | 0,03-0,11 $ | 4-7/12 | 9/12 |

GPT-5 dà la stessa qualità di Gemini 3 Flash, ma è **cinque volte più lento e
diciassette volte più caro**. GPT-5-mini costa poco ma sbaglia: metà dei prezzi
non li trova.

**La scelta è Gemini 3 Flash con ricerca Google.** A parità di risultato, il
resto sarebbe spendere di più per aspettare di più.

### La prova che la ricerca serve davvero

Lo stesso modello **senza** ricerca collegata, stesso prompt, ha risposto:

> «La passata Mutti su Sole365 costa 1,45 €» — con un indirizzo che dà 404.

Sicuro di sé, plausibile, completamente inventato. **Il valore non sta nel
prompt: sta nell'avere lo strumento di ricerca collegato.** È il motivo per cui
questa architettura non è replicabile incollando un prompt in ChatGPT.

---

## 3. Quanto costa davvero

### Il costo per piano

| Voce | Costo |
|---|---|
| Fase 1 — menù, ricette, lista | **0 $** (chiave gratuita, nessuna ricerca) |
| Fase 2 — prezzi con ricerca | **~0,03 $** |
| Controllo dei link | 0 $ |
| **Totale per piano** | **~0,03 $ ≈ 0,028 €** |

### Attenzione a due voci nascoste

**I token di ragionamento si pagano.** Il modello espone `candidatesTokenCount`
(la risposta visibile) e, separatamente, `thoughtsTokenCount` (il ragionamento
interno). Il secondo **non è incluso** nel primo e si paga a tariffa di output.
Su una chiamata reale erano 2.448 token su 6.188 di risposta: **ignorarli
sottostimava il conto del 40%.**

**La ricerca si paga a chiamata, non a ricerca.** 0,014 $ per richiesta, quante
che siano le ricerche che il modello fa al suo interno — in una prova ne ha
fatte 115. Questo ha una conseguenza importante: **confrontare tre supermercati
invece di uno non costa quasi nulla.** Misurato: un negozio 0,0182 $, tre
negozi 0,0179 $. Identico.

**Il credito gratuito.** La documentazione Google promette 5.000 ricerche
gratuite al mese. Il conto reale del progetto non lo conferma: dieci chiamate
hanno prodotto 0,29 € di addebito. **Le stime di questo documento assumono che
si paghi sempre** — meglio prudenti che sorpresi. Se il credito si applica, il
conto vero sarà più basso.

### Il costo al crescere degli utenti

Assumendo un piano a settimana per utente e **nessuna cache**:

| Utenti attivi | Piani/mese | Costo AI/mese |
|---|---|---|
| 100 | 400 | **12 $** |
| 500 | 2.000 | **60 $** |
| 1.000 | 4.000 | **120 $** |
| 5.000 | 20.000 | **600 $** |

**Con la cache il conto crolla.** Le risposte sono condivise fra tutti gli
utenti: due famiglie con lo stesso profilo pagano una generazione sola. E
poiché i prezzi delle catene sono **nazionali**, la ricerca prezzi vale per
tutto il paese: un utente a Bologna e uno a Modena con la stessa lista
condividono lo stesso risultato.

Per confronto, le alternative allo stesso volume di 4.000 piani al mese:

| | Costo mensile |
|---|---|
| **Gemini 3 Flash + ricerca** | **120 $** |
| SerpAPI (ricerca prezzi a pagamento) | ~800 $ |
| GPT-5 + web_search | ~1.280 $ |

### Un avviso sulla data

I prezzi Gemini valgono fino al **31 dicembre 2026**. Dal **1° gennaio 2027
raddoppiano** (da 0,25/1,50 $ per milione di token a 0,50/3,00 $). Il costo per
piano passerebbe da 0,03 a circa 0,05 $. Va messo in conto in un piano
economico a dodici mesi.

---

## 4. L'app funziona all'estero?

Il cliente viaggia e vuole presentarla fuori dall'Italia, quindi la domanda non
poteva restare senza risposta. Sei paesi provati.

### Il menù: nessun problema, mai

**Lingua corretta al 100% in tutti i paesi**, giorni della settimana compresi.
E i piatti sono autenticamente locali, non traduzioni:

| Paese | Piatto proposto | |
|---|---|---|
| Italia | Petto di pollo alla piastra | ✓ |
| Francia | Poulet rôti au thym, purée maison | ✓ |
| Spagna | Tortilla de patatas | ✓ |
| Paesi Bassi | **Stamppot boerenkool met rookworst** | ✓ |
| Germania | (piatti tedeschi, allergie gestite) | ✓ |
| Regno Unito | Shepherd's Pie, porridge, toastie | ✓ |

Lo *stamppot* olandese è la prova migliore: è un piatto che nessuna traduzione
dall'italiano produrrebbe mai.

### I prezzi: dipende dal paese

Qui la situazione cambia, e va detto chiaramente perché è il limite principale.

| Paese | Prezzi verificati | Supermercati | Totale paniere |
|---|---|---|---|
| **Germania** | 21/25 | Kaufland + REWE | 38,90 € |
| **Italia** | 18/22 | Carrefour + Crai | 62,39 € |
| **Paesi Bassi** | 16/27 | Jumbo + Dirk | 30,45 € |
| **Spagna** | 11/18 | Consum + El Corte Inglés | 50,08 € |
| **Regno Unito** | 10/10 | Sainsbury's | 19,18 £ |
| **Francia** | **0/17** | nessuno | — |

Il confronto per prodotto che il prototipo prometteva, in tre paesi diversi:

```
Germania    Hähnchenbrust 500 g       Kaufland  4,99  |  REWE   5,49
Paesi Bassi Aardappelen 1 kg          Jumbo     1,29  |  Dirk   1,45
Paesi Bassi Bloemkool 1 stuk          Dirk      1,69  |  Jumbo  1,89
Italia      Farina 1 kg               Crai      1,09  |  Carrefour 1,09
```

### Un'annotazione sull'Italia

L'Italia parte svantaggiata, e non per colpa del motore: **le catene più
economiche non hanno un catalogo online.** Eurospin, Lidl, MD e In's pubblicano
volantini in PDF, non pagine prodotto. Esselunga, Conad e Coop il catalogo ce
l'hanno, ma dietro login o dietro la scelta del punto vendita.

Restano Carrefour e alcune insegne minori come Crai. Germania e Paesi Bassi
vanno meglio perché lì REWE, Kaufland, Jumbo e Dirk pubblicano tutto in chiaro.

Per i discount italiani, che online non ci sono proprio, l'app usa i dati
dell'**indagine Altroconsumo 2026** già integrati: non danno il prezzo del
singolo prodotto, ma dicono quanto costa mediamente fare la spesa in ciascuna
insegna. È l'unico modo di parlare di Eurospin, e va detto per quello che è —
una classifica di convenienza, non un prezzo.

**La Francia è l'unico buco.** Menù perfetto, ma le catene francesi respingono
le richieste automatiche e nessun link regge la verifica. Non è un difetto del
motore: è che Carrefour.fr e Auchan bloccano.

### Perché la copertura non è mai del 100%

Perché **una catena su tre ha il catalogo dietro login o dietro la scelta del
punto vendita**, e quale sia cambia ogni volta: in prove diverse sono cadute
Esselunga, poi Conad, poi EasyCoop. I loro prezzi restano visibili come
alternative dichiarate «non verificate», senza link — sono quasi sempre reali,
ma non possiamo dimostrarlo, e allora non guidano il totale.

**Il totale mostrato all'utente somma solo i prezzi verificati**, e l'app
dichiara sempre quante voci sono rimaste senza. Un conto parziale spacciato per
completo sembrerebbe un affare e sarebbe solo un conto incompleto.

---

## 5. Le altre API valutate

| Servizio | A cosa serve | Esito |
|---|---|---|
| **Gemini 3 Flash + Google Search** | Il motore: menù, prezzi, link | **Scelto.** 0,03 $/piano |
| **Gemini 3.5 Flash Lite** | Menù e ricette senza ricerca | **Scelto.** Gratuito |
| OpenAI GPT-5 + web_search | Stessa funzione | Scartato: 17× più caro, 5× più lento |
| OpenAI GPT-5-mini | Stessa funzione, economico | Scartato: metà dei prezzi non trovati |
| **SerpAPI** (Google Shopping) | Prezzo del singolo prodotto | **Di riserva.** 250 ricerche/mese gratis, poi ~50 $/mese. Con Gemini non è più necessario |
| **Open Food Facts** | Anagrafica prodotti, categorie | **Integrato.** Gratuito, aperto |
| **OpenStreetMap / Nominatim** | Città e coordinate | **Integrato.** Gratuito |
| **Lettura pagina prodotto** (JSON-LD) | Prezzo reale e offerte | **Integrato.** Gratuito |
| Altroconsumo (indagine 2026) | Classifica catene per convenienza | **Integrato, solo Italia.** Dati pubblici |
| DuckDuckGo (ricerca) | Ricerca ricette | **Non utilizzabile:** risponde 202 alle richieste automatiche |
| Gateway Lovable | Il ponte AI del prototipo | **Rimosso.** Dipendenza esterna non controllabile |
| MIMIT — Osservatorio prezzi | Prezzi ufficiali carburanti/alimentari | **Escluso:** non copre i prodotti da supermercato |
| Pepesto | Prezzi spesa online | **Escluso:** nessuna API pubblica |

---

## 6. Cosa è stato costruito

### Backend `server/` — Node.js puro, da pubblicare su Railway

Nessun framework: solo `node:http`. Custodisce le chiavi API (da un file `.apk`
si estraggono in cinque minuti), tiene la cache condivisa fra tutti gli utenti,
e sarà il ponte verso MongoDB per account e piani salvati.

Endpoint principali:

| | |
|---|---|
| `POST /ai/plan-full` | **Il motore.** Piano completo con prezzi veri |
| `POST /ai/recipe` · `/ai/recipe-web` | Ricette (percorso del prototipo, mantenuto) |
| `POST /auth/register` · `/auth/login` | Account, con password cifrate |
| `GET /health` | Stato, consumo delle chiavi, spesa accumulata |

### App `mobile/` — React Native con Expo

Quindici schermate, apribile con Expo Go senza compilazione. Multilingua
completo: cinque lingue nell'interfaccia, il contenuto in qualunque lingua.

### Le protezioni

Cose che non si vedono ma che evitano brutte figure in una dimostrazione:

- **Tetto di spesa**: superata la soglia, il servizio risponde «tetto raggiunto»
  invece di consumare il credito fino all'ultimo centesimo
- **Contatore delle quote**: mostra il consumo in tempo reale
- **Recupero delle risposte troncate**: quando il modello si interrompe a metà,
  il JSON viene richiuso e la parte buona salvata — sei casi su sei recuperati.
  Meglio sei ricette su sette che nessun piano
- **Il server non cade**: un errore imprevisto viene annotato e il servizio
  resta in piedi. Serve: durante le prove un piano malformato ha portato giù
  anche le tre richieste successive
- **Cascata di ripieghi**: motore con ricerca → piano AI senza prezzi → motore
  locale. **L'utente riceve sempre un piano**, non un errore

---

## 7. Cosa manca ancora

Onesto e senza giri di parole.

| | Stato |
|---|---|
| Motore AI con prezzi reali | **Fatto e provato** |
| App React Native, 15 schermate | **Fatta** |
| Multilingua, sei paesi | **Fatto e provato** |
| Backend Node.js | **Fatto**, non ancora pubblicato |
| MongoDB — account e piani salvati | Da collegare (serve il deploy su Railway) |
| Login e profilo utente | Da fare |
| Esportazione in PDF | Da fare |
| Pubblicazione sugli store | Da fare — vedi sotto |

### Per pubblicare sugli store

| | Apple App Store | Google Play |
|---|---|---|
| Costo | 99 $/anno | 25 $ una tantum |
| Account azienda | Serve il **numero D-U-N-S** (gratuito, 1-2 settimane) | Serve la partita IVA |
| Account personale | Possibile, ma l'app esce a nome della persona | Idem |
| Tempi di revisione | 1-3 giorni, con possibili richieste | 1-7 giorni |
| Requisito | Informativa privacy pubblicata | Idem + dichiarazione sui dati raccolti |

**Il D-U-N-S va richiesto subito** se si vuole pubblicare a nome della società:
è gratuito ma richiede una o due settimane, ed è il collo di bottiglia tipico.

---

## 8. Cosa si può promettere al cliente

**Si può dire:**

- Menù settimanale con ricette complete, in qualunque lingua e paese
- Prezzi **reali** dei supermercati, con il link diretto al prodotto
- Confronto fra due o tre catene, con l'indicazione della più conveniente
- Le offerte in corso, con lo sconto e la data di scadenza
- Ogni prezzo mostrato **è stato controllato aprendo la pagina**
- Un piano completo in circa un minuto, a meno di tre centesimi

**Non si può promettere:**

- Il prezzo di *tutti* i prodotti: la copertura reale va dal 60% all'85% dei
  prodotti proposti, e dipende da quante catene di quel paese pubblicano il
  catalogo online
- Il prezzo del supermercato **sotto casa**: i listini online sono nazionali,
  non del singolo punto vendita
- La Francia, allo stato attuale: il menù sì, i prezzi verificati no
- Prezzi aggiornati al minuto: sono quelli del momento della generazione, e la
  cache li tiene per sette giorni

**La cosa da non dire mai** è che i prezzi sono tutti garantiti. La forza di
questa soluzione è esattamente l'opposto: mostra solo ciò che ha verificato, e
dichiara quello che manca. È ciò che la distingue da una demo che si sfalda
quando qualcuno tocca un link.

---

*Documento redatto il 4 settembre 2026. Le prove sono ripetibili con gli script
in `server/scripts/`: `prova-paesi.mjs`, `confronto-catene.mjs`,
`gemini-vs-gpt5.mjs`, `prova-recupero-json.mjs`.*
