# Prompt da provare su ChatGPT web

Incollalo così com'è. Serve **GPT-5 con la ricerca web attiva** — se il modello
non cerca davvero, i prezzi e i link se li inventa, e ce ne accorgiamo subito
dalla verifica in fondo.

---

## Il prompt

```
Sei il motore di generazione di un'app per la spesa alimentare.
Devi produrre un piano completo, con prezzi e link VERI.

## CONTESTO UTENTE
- Città: Bologna
- Paese: Italia
- Persone in casa: 4
- Budget: 120 EUR a settimana
- Stile alimentare: mediterraneo
- Allergie e diete: nessuna
- Non gradito: niente funghi
- Valuta: EUR
- Lingua di tutte le risposte: italiano

## COSA DEVI PRODURRE

1. MENÙ — 7 giorni, con colazione, pranzo e cena per ogni giorno.
   Piatti italiani veri, che una famiglia a Bologna cucinerebbe davvero.
   Non traduzioni di piatti stranieri. Varia le proteine nella settimana.

2. RICETTE — per le 7 cene: ingredienti con dosi per 4 persone,
   procedimento in 4-8 passaggi, tempi di preparazione e cottura.

3. LISTA DELLA SPESA — aggregata dalle ricette, raggruppata per reparto,
   con le quantità arrotondate ai formati d'acquisto reali
   (non "370 g di pasta" ma "1 confezione da 500 g").

4. PREZZI REALI — per almeno 12 prodotti della lista:
   prezzo attuale, negozio, e link diretto alla pagina del prodotto.

## REGOLE TASSATIVE SUI PREZZI

- Cerca ORA sul web. Non usare prezzi che ricordi: sarebbero inventati.
- Usa possibilmente SEMPRE LO STESSO supermercato online, così i prezzi
  sono confrontabili fra loro.
- Il link deve essere la pagina che hai davvero aperto, non ricostruita.
- Se non trovi il prezzo di un prodotto, scrivi "prezzo": null.
  NON stimarlo, NON approssimarlo, NON dedurlo da prodotti simili.
- Prezzi da supermercato, non da gastronomia o negozio di esportazione.

## VINCOLO DI BUDGET

Calcola il totale della spesa sui prezzi che hai trovato. Se supera i 120 EUR,
sostituisci i piatti più costosi e rifai il conto. Dichiara il totale finale
e quanto resta del budget.

## FORMATO

Rispondi SOLO con questo JSON, senza testo prima o dopo:

{
  "menu": [
    {"giorno":"Lunedì","colazione":"","pranzo":"","cena":""}
  ],
  "ricette": [
    {"giorno":"Lunedì","piatto":"","porzioni":4,
     "ingredienti":[{"nome":"","quantita":""}],
     "passaggi":["",""],"prep_minuti":0,"cottura_minuti":0}
  ],
  "lista": [
    {"nome":"","quantita":"","reparto":""}
  ],
  "prezzi": [
    {"nome":"","prezzo":0,"valuta":"EUR","negozio":"","link":""}
  ],
  "totale": {"spesa_stimata":0,"budget":120,"resta":0,
             "prodotti_senza_prezzo":0}
}
```

---

## Cosa aspettarsi

Questo è ciò che ha prodotto **GPT-5 con ricerca web** sullo stesso compito,
misurato stanotte:

| | Risultato |
|---|---|
| Tempo | 157 secondi |
| Costo via API | $0,32 |
| Menù | 7 giorni completi |
| Lista | 38 voci |
| Prezzi trovati | **12 su 12** |
| Link che funzionano | **12 su 12** |

Prezzi restituiti, tutti da Carrefour e tutti verificati aprendo la pagina:

```
Carrefour Classic Passata di pomodoro     0,95 €
Carrefour Classic Spaghetti               0,50 €
Carrefour Filiera Qualità Petto di pollo  5,95 €
Carrefour Classic Latte UHT               1,39 €
Carrefour il Mercato 6 Uova               2,29 €
Vallelata Fior di Latte Mozzarella        1,99 €
```

Una seconda prova, sempre GPT-5, ha dato prezzi coerenti dallo stesso negozio:
passata 0,75 €, spaghetti Barilla 0,99 €, petto di pollo 5,34 €, mozzarella
1,09 €, latte 1,39 €, uova 2,29 €. Gli scostamenti fra le due chiamate sono
nell'ordine dei centesimi: sono prezzi reali che cambiano fra rilevazioni,
non numeri inventati.

## Come capire se ha barato

Il modo è uno solo: **apri i link.** Se la pagina si apre e mostra quel
prodotto, ha cercato davvero. Se dà 404 o porta a un prodotto diverso, ha
inventato — ed è esattamente quello che è successo con Gemini senza ricerca,
che ha risposto «la passata Mutti su Sole365 costa 1,45 €» con un indirizzo
inesistente.

## Se vuoi provare il caso peggiore

Togli dal prompt la riga «Cerca ORA sul web» e chiedi a un modello **senza**
ricerca attiva. Otterrai la stessa risposta, ugualmente sicura di sé, con
prezzi plausibili e link che non esistono. È la prova che il valore non sta
nel prompt: sta nell'avere lo strumento di ricerca collegato.
