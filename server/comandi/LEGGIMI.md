# I comandi

Tutto quello che si lancia a doppio clic. Ogni comando apre una finestra nera,
lavora, e **resta aperta alla fine** così puoi leggere cosa ha fatto.

Prima volta su una macchina nuova: serve il file `.env` nella cartella
`server/` (quella sopra questa). Senza, ogni comando si ferma subito e te lo
dice — non sa a quale database parlare.

---

## Le due parole da non confondere

È la confusione che ha fatto sembrare ferma una raccolta quasi finita, quindi
vale la pena metterla in chiaro una volta sola.

| | cos'è | da dove viene |
|---|---|---|
| **indirizzi** | schede prodotto che *sappiamo esistere* | dalle sitemap dei negozi |
| **prezzi** | schede *aperte davvero*, col prezzo letto in pagina | dal lettore |

Gli indirizzi sono l'elenco di **cosa c'è da andare a vedere**. Non vuol dire
che li abbiamo aperti, e non vuol dire che abbiano un prezzo: tanti negozi
pubblicano la scheda e il prezzo non lo scrivono.

I prezzi sono **quel che l'API può vendere**.

La **copertura** è il secondo diviso il primo. È l'unica cifra che dice se il
lavoro sta andando avanti.

E gli indirizzi si dividono in tre mucchi che non si possono sommare:

- **leggibili** — insegne vive. Questo è il lavoro che si può fare.
- **esclusi** — negozi che ci hanno detto di no: il `robots.txt` di Tigros,
  l'accesso obbligatorio di CoopShop. Non sono «da fare più tardi», sono da
  **non fare mai**.
- **orfani** — cataloghi di insegne che nelle fonti non esistono più. Il
  lettore li cerca col nome della fonte, e quel nome non c'è: non ci arriva
  nessuno.

Sommandoli, l'Italia risultava al 40% mentre il 96% delle schede leggibili era
già stato letto.

---

## I comandi, in ordine di quanto li userai

### 1 · Lettore continuo
**Il motore.** Si apre e si lascia girare. Prende in prestito qualche paese fra
quelli che ne hanno più bisogno, ne legge i prezzi, li rende, ricomincia. Se
cade riparte da solo dopo trenta secondi.

Puoi tenerne aperti quanti ne vuoi, anche su macchine diverse: **i paesi si
prenotano**, quindi due lettori non fanno mai lo stesso lavoro due volte. Per
fermarlo davvero si chiude la finestra.

Se ne lanci più di uno sulla stessa macchina, cambia `NOME_MACCHINA` dentro il
file o nel pannello vedrai due righe identiche senza sapere quale è quale.

### 2 · Leggi tutto un paese
Un paese solo, fino in fondo, senza aspettare la rotazione. Risponde alla
domanda *«di questi indirizzi, quanti hanno davvero un prezzo?»*. È così che è
stata chiusa l'Italia.

I numeri dentro sono tarati per un PC vero (sedici giga): tiene in coda tutto
il catalogo di un paese invece di masticarlo a fette. Su un Raspberry vanno
abbassati — lì il file è un altro.

### 3 · Copertura di un paese
Il rapporto, insegna per insegna: quanti indirizzi, quanti letti col prezzo,
quanti provati senza trovarlo, quanti restano.

**È il rapporto da mostrare a un cliente**, perché il conto è esatto e non
campionato: sappiamo quali schede hanno reso *e* quali no.

### 4 · Cerca insegne nuove
**È da qui che i numeri crescono.** I cataloghi che abbiamo sono già presi per
intero — su centosedici insegne vive, una sola non ha catalogo. Rileggere
meglio le sitemap non porta un prodotto in più.

Per ogni candidato, tre prove in quest'ordine:

1. **Si può?** — legge il `robots.txt`. Se il negozio dice di no, l'insegna
   finisce lì e non si guarda nemmeno quanto è grossa.
2. **Quanto?** — raccoglie con lo stesso codice che poi farà il lavoro vero,
   quindi il numero che vedi è quello che otterrai.
3. **Rende?** — apre per davvero venti schede e conta quante hanno il prezzo.

Il terzo passo è quello che conta. Mercadona pubblica 4.316 indirizzi e ci ha
dato 34 prezzi; Aldi España 2.072 indirizzi e 20 prezzi. Un catalogo grosso che
non dichiara i prezzi non è un guadagno: è lavoro per i lettori e spazio su
Mongo, in cambio di niente.

Questo comando **non scrive niente**. Guarda e basta.

Paesi con un elenco di candidati già pronto: **IT, ES, FR, DE**. Per gli altri,
da terminale:

```
npx tsx --env-file-if-exists=.env scripts/caccia-insegne.ts PT --dominio "Pingo Doce=www.pingodoce.pt"
```

oppure un file di testo, una riga per negozio (`Nome=dominio`):

```
npx tsx --env-file-if-exists=.env scripts/caccia-insegne.ts PT --da mie-insegne.txt
```

### 5 · Aggiungi le insegne trovate
La stessa caccia, ma stavolta scrive. Ci mette molto di più ed è voluto: qui i
cataloghi si percorrono fino in fondo, perché gli «stimati» che finiscono in
archivio devono essere contati, non presi dal tetto di una prova veloce.

### 6 · Raccogli il catalogo di un paese
Va a prendere gli indirizzi. **Serve subito dopo il comando 5**: senza, le
insegne nuove restano nelle fonti senza catalogo e il lettore non ha niente da
aprire.

Serve anche quando un negozio rifà il sito, e ogni tanto perché i negozi
aggiungono e tolgono prodotti.

### 7 · Come sto messo
I numeri veri, divisi nei tre mucchi di sopra, con la copertura già calcolata.

### 8 · Pulizia cataloghi (mostra)
Mostra i cataloghi che nessuno può più leggere. **Mostra e basta.**

Per cancellare davvero serve il terminale:

```
npx tsx --env-file-if-exists=.env scripts/pulisci-cataloghi.ts --scrivi
```

Non è a doppio clic apposta: cancellare è l'unica cosa che non si disfa.

---

## Il giro normale

**Ogni giorno, senza pensarci**
Lascia aperto `1 - Lettore continuo` su ogni macchina che hai. Non serve altro.

**Quando vuoi chiudere un paese**
`2 - Leggi tutto un paese` → aspetti → `3 - Copertura di un paese` per vedere
com'è andata.

**Quando la copertura di un paese è alta e vuoi più prodotti**

```
4 · cerca   →   5 · aggiungi   →   6 · raccogli   →   2 · leggi
```

Guardi cosa c'è, aggiungi quelle che rendono, vai a prendere gli indirizzi,
leggi i prezzi. In quest'ordine: saltare il 6 lascia insegne senza catalogo, e
sembrerà che la caccia non sia servita a niente.

---

## Una regola che non si tocca

**Le insegne che ci dicono di no restano fuori.** Il `robots.txt` che vieta, il
negozio che pretende l'accesso: non si aggira, nemmeno quando il catalogo è
grosso e fa gola.

Non è scrupolo: **l'API si vende a un cliente**, e una diffida arriverebbe a
lui, non a noi. Un prodotto commerciale che poggia su dati presi contro il
volere di chi li pubblica non è un prodotto, è un rischio con una fattura
attaccata.

Per questo il comando 4 chiede il permesso **prima** di contare. Se contasse
prima, un catalogo grosso metterebbe addosso la voglia di trovare un modo — ed
è esattamente la voglia da non avere.

---

## Quando ci sarà il server

Questa cartella è per Windows, a doppio clic. Su un server Linux la stessa cosa
si fa una volta sola e poi non si tocca più:

```sh
cd ~/spesa-smart-ai/server
sudo bash comandi/server/installa-servizi.sh
```

Installa due cose:

**`lettore.service`** — il motore. Uguale al comando 1, ma senza finestra da
tenere aperta. Se muore, systemd lo rialza dopo trenta secondi; riparte anche
dopo un riavvio della macchina, da solo, senza che nessuno entri.

Lo script guarda quanta memoria ha la macchina e si taratura da sé. Mette anche
un tetto di memoria al lettore: se se la mangia tutta, meglio che muoia lui e
riparta pulito piuttosto che far scegliere la vittima al sistema, che potrebbe
benissimo ammazzare il database o buttarti fuori dall'ssh al posto suo.

**`catalogo.timer`** — ogni domenica notte rifà gli indirizzi dei cataloghi più
vecchi di un mese, venti per volta.

Non è un dettaglio. I negozi aggiungono e tolgono prodotti in continuazione, e
un elenco di sei mesi fa manda il lettore ad aprire pagine che non esistono
più: tempo speso, richieste fatte per niente, e schede segnate «senza prezzo»
che un prezzo ce l'avevano — semplicemente non stanno più lì. L'effetto è
subdolo, perché la copertura sembra scendere da sola e non si capisce perché.

Da guardare, poi:

```sh
journalctl -u lettore -f          # guardalo lavorare, dal vivo
systemctl status lettore          # come sta
systemctl list-timers catalogo    # quando tocca al prossimo rinfresco
sudo systemctl stop lettore       # fermalo DAVVERO
```

Dopo un aggiornamento del codice:

```sh
cd ~/spesa-smart-ai && git pull && cd server && npm ci
sudo systemctl restart lettore
```

Gli altri comandi (copertura, caccia, stato) si lanciano a mano quando servono,
con le stesse righe che trovi nelle schede qui sopra.

---

## Se qualcosa non va

**«Manca il file .env»** — il file va nella cartella `server/`, non in questa.

**Caratteri strani al posto delle lettere accentate** — i comandi impostano già
la codifica giusta; se succede lo stesso, la finestra è stata aperta da un'altra
che non l'aveva impostata.

**Il lettore dice «conto in corso» e sembra fermo** — sta aspettando il conto di
quanto resta da fare, che la prima volta è freddo. Dopo un minuto parte.

**Due lettori sulla stessa macchina si vedono uguali nel pannello** — cambia
`NOME_MACCHINA` in uno dei due.

**Un paese risulta preso da una macchina spenta** — le prenotazioni scadono da
sole dopo pochi minuti senza battito. Aspetta, non forzare.
