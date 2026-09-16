# Il metro di misura della ricerca

Questo file spiega `ricerca.json`, che è l'elenco delle prove.

## Perché non è un elenco di indirizzi

Il goal dice «200 coppie voce → prodotto giusto scritte a mano». La forma
ovvia sarebbe un elenco di indirizzi:

```
"Pasta integrale"  →  https://www.esselunga.it/.../pasta-integrale-500g
```

**Non funziona.** I cataloghi vengono dalle sitemap dei negozi e cambiano ogni
giorno: prodotti che escono, codici che si rinumerano, insegne che rifanno il
sito. Un elenco di indirizzi sarebbe scaduto in una settimana, e a quel punto
il metro misurerebbe quanto è vecchio se stesso invece di quanto è brava la
ricerca.

Peggio: renderebbe impossibile misurare un paese dopo che Antonio ci ha
aggiunto delle insegne, che è esattamente quando serve rimisurare.

## Cosa c'è invece

Per ogni voce, **cosa vuol dire azzeccarla**. Scritto a mano, una voce per
volta, guardando i cataloghi veri.

```json
{
  "voce": "Pasta integrale",
  "deve": ["pasta"],
  "unaDi": ["integral", "wholemeal", "vollkorn"],
  "mai": ["sfoglia", "biscott", "insalat", "sugo"]
}
```

- **`deve`** — parole che il nome del prodotto deve contenere tutte.
- **`unaDi`** — almeno una di queste. Serve per le cose che hanno più nomi
  legittimi: `integrale` in Italia, `wholemeal` in Inghilterra.
- **`mai`** — le trappole. Sono la parte che vale di più, perché sono state
  scritte guardando gli errori veri: `pasta sfoglia` per «pasta integrale`,
  `chiacchiere 500g` per «zucchine 500g», `pane al latte` per «latte».

Un prodotto è giusto se ha tutte le `deve`, almeno una delle `unaDi` (quando
ce ne sono) e nessuna delle `mai`.

## Cosa misura, e perché due numeri e non uno

Lo script prova ogni voce in due modi e conta quante ne azzecca ciascuno:

| | cosa fa |
|---|---|
| **classifica** | il primo prodotto che restituisce la ricerca, così com'è |
| **modello** | il prodotto che il modello sceglie fra i candidati |

Il secondo costa **14,6 secondi su 17** della fase prezzi. Il primo costa
zero. La domanda dell'intera Fase 3 è una sola: *quanto ci perdiamo a togliere
il modello?*

Oggi non lo sappiamo. Si sa solo che su dieci voci sceglievano cose diverse
dieci volte su dieci, e che **a occhio** in sette casi la classifica sembrava
migliore — `petto pollo` contro `petto di pollo a fette sottili`, `olio di
oliva` contro `olio extra vergine spray`. A occhio. Questo file serve a
smettere di dire «a occhio».

## Le regole per chi lo allarga

1. **Si scrive guardando il catalogo vero**, non a memoria. Cercare la voce,
   leggere cosa torna, e da lì scrivere le `mai`.
2. **Le `mai` si aggiungono quando si vede un errore**, non prima. Una trappola
   immaginata fa passare il metro senza insegnare niente; una trappola vista
   impedisce a quell'errore di tornare.
3. **Non si tocca una prova per far passare una modifica.** Se una modifica
   fa scendere il punteggio, ha perso la modifica. Cambiare il metro per far
   vincere il codice è l'unico modo di rendere questo file inutile.
4. **Le parole si scrivono senza accenti e al troncone.** Il catalogo scrive
   `integrale`, `integrali`, `integral bio`: `integral` le prende tutte.

## Come si lancia

```
npx tsx scripts/metro-ricerca.mjs
npx tsx scripts/metro-ricerca.mjs --paese IT
npx tsx scripts/metro-ricerca.mjs --senza-modello    # solo la classifica, gratis
```
