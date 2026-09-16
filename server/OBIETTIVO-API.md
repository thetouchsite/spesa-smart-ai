# Obiettivo — l'API risponde da sola

Operatore B · Alberto · aperto il 16 settembre 2026

---

## Il punto

Un'API di dati non chiede a nessuno il permesso di rispondere. La nostra sì:
per decidere quale prodotto corrisponde a «Petto di pollo» manda una lista di
nomi a un modello e aspetta.

Misurato il 16 settembre, Milano, dieci voci:

```
fase prezzi                          17 s
   la scelta del modello             14,6 s   ← 86%
   tutto il resto                     2,4 s
```

Duecentomila prodotti si cercano e quarantaquattro schede si aprono in **due
secondi e mezzo**. Gli altri quattordici sono attesa.

E non è solo lentezza. Quando il modello non risponde — quota finita, rete giù —
la scelta salta e la spesa esce dimezzata, senza un errore visibile. È già
successo: Londra, tre voci su sei invece di otto su otto.

**Vogliamo che la risposta arrivi dai dati.** Se poi il modello serve ancora per
i casi difficili, che serva come aiuto, non come strada obbligata.

---

## Cosa vuol dire riuscito

1. **Il tempo.** La fase prezzi sotto i **5 secondi** su dieci voci, a catalogo
   caldo. Oggi 17.
2. **La precisione non peggiora.** Su un elenco di duecento coppie
   *voce → prodotto giusto*, scritte a mano prima di cominciare, la classifica
   da sola deve azzeccarne **almeno quante ne azzecca oggi il modello**. Se ne
   azzecca meno, non si spegne niente.
3. **Niente chiamate al modello** nella strada dei prezzi, in condizioni
   normali. Zero, non «poche».
4. **Se il modello è spento, il risultato è lo stesso.** Si stacca la chiave e
   si rifà la stessa spesa: deve uscire identica.
5. **Funziona in cinque paesi**, non solo in Italia: IT, GB, DE, ES, FR.
6. **Si può dimostrare.** Uno script che chiunque lancia e che stampa i numeri
   del punto 1 e 2. Le impressioni non contano.

---

## Come, in ordine

### 1. Prima il metro di misura

Duecento coppie *voce → prodotto giusto*, scelte a mano sui cataloghi veri, un
file che sta in repo, e uno script che dice quante ne azzecca la classifica e
quante il modello.

**Questo viene prima di ogni modifica.** Senza, ogni cambiamento è una
scommessa e la discussione diventa «a me sembra meglio».

Un dato che lo rende urgente: oggi classifica e modello scelgono cose diverse
**dieci volte su dieci**, e a occhio in sette casi il primo della classifica è
migliore — `petto pollo` contro `petto di pollo a fette sottili`, `olio di
oliva` contro `olio extra vergine spray`. *A occhio.* Può darsi che la
classifica sia già abbastanza brava e che quattordici secondi servano a
peggiorarla. Può darsi di no. Adesso non lo sappiamo, ed è il problema.

### 2. Staccare la quantità dal nome

Il peso oggi è una parola come le altre. Cercando `zucchine 500g` è tornato
**chiacchiere 500g** — un dolce fritto che pesa uguale.

Va letto come numero al momento in cui si costruisce il catalogo, tolto dalle
parole di ricerca, e tenuto da parte. Quattro formati coprono tutto:

| formato | Italia | Regno Unito |
|---|---|---|
| `500 g` staccato | 32,6% | 3,0% |
| `500g` attaccato | 9,5% | **30,5%** |
| `gr500` rovesciato | 13,3% | 0% |
| `4 x 100g` | 0,7% | 2,0% |
| **totale col peso** | **56,1%** | **35,4%** |

I due paesi lo scrivono al contrario: l'Italia stacca, l'Inghilterra attacca.
Ecco perché il difetto si vede a macchie.

### 3. Le dieresi tedesche

Il catalogo scrive `kaese`, `haehnchen`, `aepfel`, `broetchen`. La ricerca
toglie la dieresi e cerca `kase`, `hahnchen`, `apfel`, `brotchen`. Misurato su
sette parole: **0 risultati contro 5**, tutte e sette.

Vale per DE, AT, CH. E vale per `vocabolario.ts`, che le parole tedesche le ha
scritte nel modo che non trova niente.

### 4. Pesare le parole per quanto sono rare

`latte` da sola oggi pesca *pane al latte*, *mousse di latte*, *carezza di
latte*. Una parola che compare in mezzo catalogo non distingue niente; una che
compare di rado distingue quasi da sola. Oggi valgono uguale.

### 5. Preferire chi pubblica i prezzi

A parità di somiglianza, l'insegna con la resa più alta. A Monaco hanno
risposto flaschenpost e Aldi Nord — resa **0** tutti e due — e quattro voci
sono uscite col nome del negozio e un trattino al posto del prezzo.

### 6. Solo adesso, togliere il modello

E solo se il punto 1 dice che non si peggiora. Se dice il contrario: il modello
resta, e abbiamo imparato perché serve. Anche questo è un risultato.

---

## Cosa non si fa

- **Non si spegne il modello per far vedere un numero.** Se la precisione cala,
  ha vinto lui e si scrive perché.
- **Non si tocca la strada italiana e quella generica in modo diverso.** Sono
  già due (`catalogo-it.ts` e `prices-catalogo.ts`) e la distanza fra loro è
  costata degli errori. Ogni modifica va in tutte e due, o in nessuna.
- **Non si rompe la preview mentre Alberto mostra al cliente.** Si costruisce,
  si prova su un'altra porta, e si riavvia quando lo dice lui.
- **Non si toglie il prezzo nullo.** Una scheda che si apre col prodotto giusto
  e senza cifra vale: c'è il link. Va solo messa dopo chi la cifra ce l'ha.

---

## Da fare presto, prima che diventi un problema

`catalogo.ts` sono 998 righe con dentro due mestieri: costruire il catalogo
(Antonio) e cercarci dentro (Alberto). Finché stanno insieme ogni push è un
conflitto.

Spostare la ricerca in `ricerca.ts`, in un commit che sposta e basta — nessuna
riga di logica cambiata, così il diff si legge.

---

## Diario

> Le misure si scrivono qui: numero, data, e **come** è stato ottenuto. Un
> numero senza il metodo è un'opinione con le cifre.

**16 settembre 2026 — il punto di partenza**

| cosa | misura | come |
|---|---|---|
| fase prezzi, Milano, 10 voci | 17 s | `POST /ai/prices`, catalogo caldo |
| di cui la scelta del modello | 14,6 s | riga di log `la scelta del modello` |
| di cui tutto il resto | 2,4 s | differenza |
| catalogo IT in memoria | 200.000 prodotti, 18 insegne | `/catalogo/stato` |
| schede dal magazzino | 29 su 44 | riga di log `[magazzino]` |
| voci con prezzo, Milano | 10 su 10 | risposta |
| voci con prezzo, Londra | 8 su 8 | risposta, dopo il dizionario |
| voci con prezzo, Monaco | 7 su 16 | prova dell'utente, catalogo DE povero |
| costo in IA per piano | ~$0,019 | era $0,055–0,061 |
