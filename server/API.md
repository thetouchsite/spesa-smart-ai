# MealMint Data API — v1

Prezzi veri della spesa, per paese, con il link alla scheda del negozio.

Mandi una lista della spesa e un paese, ricevi dei prezzi. Cosa ci fai poi —
un'app, un sito, un foglio di calcolo — non ci riguarda.

---

## In un minuto

```bash
curl -X POST https://api.esempio.it/v1/prezzi \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "items": ["Latte intero", "Pasta integrale", "Zucchine"],
    "country": "IT",
    "city": "Milano",
    "currency": "EUR"
  }'
```

```json
{
  "voci": [
    {
      "voce": "Latte intero",
      "esito": "trovato",
      "offerte": [
        {
          "insegna": "Eurospin",
          "nome": "Latte intero UHT a lunga conservazione",
          "prezzo": 0.85,
          "valuta": "EUR",
          "prezzoPieno": null,
          "sconto": null,
          "quantita": { "valore": 1000, "unita": "ml", "testo": "1 l" },
          "prezzoNormalizzato": { "valore": 0.85, "unita": "l" },
          "link": "https://...",
          "letto": "2026-09-16T17:37:41.000Z"
        }
      ]
    }
  ],
  "copertura": { "paese": "IT", "coperto": true, "insegne": 7 },
  "riepilogo": { "chieste": 3, "trovate": 3, "totaleAlMiglioPrezzo": 2.34, "valuta": "EUR" },
  "secondi": 1
}
```

---

## Le chiavi

Ogni chiamata porta una chiave nell'intestazione `Authorization`. Ce ne sono
due specie e **non sono intercambiabili**.

| | prefisso | dove sta | cosa puo' fare |
|---|---|---|---|
| **segreta** | `sk_live_` | su un server, mai in un'app | tutto |
| **pubblicabile** | `pk_live_` | puo' stare in un'app | catalogo e negozi; **non i prezzi** |

> **Perche' due.** Una chiave dentro un'app mobile non e' segreta: sta nel
> pacchetto che si installa, e tirarla fuori da un `.apk` e' una riga di
> comando. Se la tua chiave segreta viaggia dentro l'app, chiunque scarichi
> l'app puo' usare il tuo credito.
>
> La strada giusta e': il telefono parla col **tuo** server, il tuo server
> parla con noi. Se proprio ti serve chiamarci dal telefono, usa una chiave
> pubblicabile — che i prezzi non li puo' nemmeno vedere.

Ogni chiave ha un tetto di chiamate al giorno, che riparte a mezzanotte UTC.

---

## Le rotte

### `POST /v1/prezzi` · *chiave segreta*

I prezzi di una lista della spesa.

| campo | | |
|---|---|---|
| `items` | array di stringhe, da 1 a 24 | la lista |
| `country` | ISO a due lettere | `IT`, `GB`, `DE`, `ES`, `FR` |
| `city` | stringa | serve a scegliere le insegne presenti li' |
| `currency` | ISO a tre lettere | `EUR`, `GBP` |

**Scrivi la lista nella tua lingua.** Se chiedi «Funghi» in Inghilterra
troviamo `mushrooms`: c'e' un dizionario della spesa in sei lingue, e non ti
serve tradurre niente.

#### `esito` — quattro valori, e sono quattro cose diverse

Ogni voce che hai chiesto torna sempre, anche quando non abbiamo trovato
niente. Guardare `esito` e' il modo giusto di leggere la risposta.

| valore | vuol dire | cosa mostreresti |
|---|---|---|
| `trovato` | c'e' il prodotto e c'e' il prezzo | il prezzo |
| `nessun-prezzo-pubblicato` | il prodotto c'e', il negozio il prezzo non lo espone | «prezzo non pubblicato» + il link, che funziona |
| `nessun-prodotto` | nessuna insegna di quel paese ce l'ha | «non disponibile qui» |
| `non-raggiungibile` | qualcosa c'era, non siamo riusciti ad aprirlo | «riprova» |

Con `nessun-prezzo-pubblicato` le offerte ci sono lo stesso, con `prezzo:
null`: il nome del prodotto e il link valgono, e sono cio' che permette a chi
disegna di dire una cosa vera invece di «non disponibile».

Se `copertura.coperto` e' `false`, `nessun-prodotto` vuol dire un'altra cosa
ancora: quel paese non lo copriamo affatto.

#### `prezzoNormalizzato` — quanto costa un chilo

E' il campo che rende onesto il confronto. Senza, due confezioni di dimensione
diversa si confrontano guardando il cartellino, e il cartellino mente:

```
Carrefour   zucchine 500 g   1,39 €      2,78 €/kg
Aldi        zucchine 1 kg    2,19 €      2,19 €/kg   ← la piu' conveniente
```

Accanto c'e' `quantita`, con quanto ce n'e' dentro — grammi, millilitri o
pezzi — e com'era scritto nel nome, cosi' puoi verificare.

**`null` in tre casi, e sono tre cose diverse:** la roba a pezzo (sei uova non
si confrontano al chilo), la roba sfusa (un peso non ce l'ha), e i prodotti
il cui negozio il formato nel nome non lo scrive. Nessuno dei tre e' un
errore, e in nessuno inventiamo un numero per riempire la casella.

#### `letto` — quando quel prezzo e' stato visto

Una data ISO su ogni offerta. **Un prezzo senza data e' una diceria**, e la
soglia di quanto vecchio sia troppo vecchio la scegli tu: noi dichiariamo
quando abbiamo guardato.

Le pagine si leggono di continuo e si tengono in magazzino, quindi troverai un
misto fra «letto adesso» e «letto stamattina». Nessuna delle due e' un errore.

---

### `POST /v1/prodotti` · *anche chiave pubblicabile*

Cerca nel catalogo, senza aprire nessuna pagina e senza leggere prezzi.

```bash
curl -X POST https://api.esempio.it/v1/prodotti \
  -H "Authorization: Bearer pk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"paese": "GB", "q": "wholemeal bread", "quanti": 5}'
```

```json
{
  "richiesta": "wholemeal bread",
  "paese": "GB",
  "coperto": true,
  "prodotti": [
    { "insegna": "Morrisons", "nome": "Brown wholemeal bread", "link": "https://..." }
  ]
}
```

---

### `POST /v1/negozi` · *anche chiave pubblicabile*

I punti vendita di un paese, o di una citta'.

```bash
curl -X POST https://api.esempio.it/v1/negozi \
  -H "Authorization: Bearer pk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"paese": "GB", "citta": "London"}'
```

> Il listino e' dell'**insegna**, il negozio e' il **tuo**. Sei Eurospin da
> Milano a Palermo danno tutti lo stesso prezzo sullo stesso prodotto. Per
> questo negozi e prezzi sono due rotte diverse: mescolarli porterebbe ad
> attaccare lo sconto di un punto vendita all'indirizzo di un altro.

---

### `GET /v1/copertura` · *anche chiave pubblicabile*

Cosa copriamo, per intero — **anche quando e' brutto**. Quali paesi, quante
insegne, quanto e' pieno il magazzino dei prezzi.

Se stai valutando se comprare, guarda qui prima: e' meglio saperlo adesso che
scoprirlo con una lista della spesa che torna mezza vuota.

---

### `GET /v1/stato` · *qualunque chiave, non pesa sul tetto*

Se il servizio sta bene, e quante chiamate hai fatto oggi.

Non pesa sul tuo tetto di proposito: quando l'hai finito, e' proprio questa la
rotta che ti serve.

---

## Quando qualcosa va storto

| codice | vuol dire | che fare |
|---|---|---|
| `401` | chiave mancante, sbagliata o revocata | controlla l'intestazione `Authorization` |
| `403` | chiave **pubblicabile** su una rotta che vuole la segreta | i prezzi si chiedono da un server |
| `429` | tetto giornaliero raggiunto | riparte a mezzanotte UTC; `/v1/stato` dice quanto hai consumato |
| `400` | la richiesta non e' valida | il messaggio dice quale campo |
| `402` | il servizio ha raggiunto il suo tetto di spesa | temporaneo, scrivici |

Il corpo dell'errore e' sempre `{ "error": "..." }`, e il messaggio dice cosa
fare, non solo cosa e' successo.

---

## Cosa c'e' dietro, in due righe

I prodotti vengono dalle **sitemap che i negozi pubblicano loro**: sono
indirizzi veri, e per costruzione non si possono inventare. I prezzi si
leggono aprendo quelle pagine e tenendole in magazzino.

Non c'e' nessun modello che indovina: la stessa domanda da' la stessa
risposta, e continua a darla anche quando l'intelligenza artificiale del mondo
e' spenta. Per un'API di dati e' l'unica promessa che conti.

---

## I limiti, detti prima

- **Cinque paesi**: IT, GB, DE, ES, FR. Gli altri rispondono
  `copertura.coperto: false`.
- **Non tutti i negozi pubblicano i prezzi.** Alcuni li disegnano con
  JavaScript e nell'HTML non c'e' niente da leggere: li' l'esito e'
  `nessun-prezzo-pubblicato` e resta il link.
- **Tesco, Asda e Sainsbury's** non sono coperte per intero: ci sono modi per
  aggirare le loro protezioni e non li usiamo.
- **Il prezzo al chilo c'e' per circa un terzo delle offerte.** Il peso lo
  leggiamo dal nome del prodotto, e non tutti i negozi lo scrivono li':
  misurato su 88 offerte vere, 23% in Italia e 50% nel Regno Unito. Dove non
  c'e', `quantita` e `prezzoNormalizzato` sono `null` — e la roba sfusa un
  peso non ce l'ha proprio.
- Il conteggio delle chiamate vive in memoria e si azzera se il servizio si
  riavvia. E' un freno, non una contabilita'.
