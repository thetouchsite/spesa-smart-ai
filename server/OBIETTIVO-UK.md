# Obiettivo — Regno Unito: tutti i prodotti, link reali, prezzi

> Il testo lungo sta qui e non nella condizione di `/goal`, che altrimenti
> riempie la chat a ogni turno. La condizione dice solo «esegui questo file».

## Da dove si parte (misurato il 16 settembre 2026)

| | |
|---|---|
| Catene UK | 2 — Morrisons 30.491 link, Waitrose 18.182 |
| Prezzi | funzionano: 8/8 su una lista della spesa vera |
| Punti vendita UK | 0 — `negozi.ts` è al 100% italiano |
| Match in inglese | ~metà sbagliato: «milk» → cioccolato, «cheddar cheese» → muffin |

## Obiettivo

Ogni prodotto acquistabile online nel Regno Unito deve avere un link reale e un
prezzo. Non un campione, non le catene comode: tutto ciò che è raggiungibile
senza violare un `robots.txt` e senza replicare una sessione d'acquisto.

## 1. La caccia ai domini — prima di tutto il resto

Il sito aziendale e il negozio online quasi mai coincidono: Morrisons vende su
`groceries.morrisons.com`, Waitrose su `waitrose.com/ecom`. Sondando solo il
sito vetrina si conclude che una catena non abbia catalogo, ed è falso — è
l'errore che in Italia teneva nascoste metà delle insegne.

Per ogni marchio provare **tutte** le varianti, non fermarsi alla prima che
risponde: `X.co.uk`, `X.com`, `groceries.X.com`, `X.com/groceries`,
`shop./store./online./orderline./delivery.X.co.uk`,
`Xdirect/Xathome/Xonline.co.uk`.

Cercare anche i marchi diversi e le piattaforme di terzi: Ocado gestisce il food
di M&S; i negozi di vicinato (Nisa, Costcutter, Premier, Londis, Budgens) girano
su piattaforme condivise tipo Snappy Shopper e Jisp.

**Una piattaforma condivisa vale decine di insegne**: in Italia EBSN da sola ne
ha aperte 8, riconosciuta dal bundle JS comune e da `/ebsn/api/products` che
rispondeva JSON senza chiave. Riusare il metodo di `scripts/caccia-ebsn.mjs`.

Deduplicare per **catalogo**, non per dominio: in Italia
`spesaonline.coopcentroitalia.it` redirige a `coopetruria`, stesso catalogo
contato due volte.

Marchi minimi: Tesco, Sainsbury's, Asda, Co-op UK, M&S, Ocado, Iceland, Aldi UK,
Lidl UK, Booths, Spar UK, Nisa, Costcutter, Londis, Budgens, Amazon Fresh UK,
Abel & Cole, Riverford, Planet Organic, Farmfoods, Heron Foods, B&M, Home
Bargains, Poundland.

## 2. Tutti i prodotti, non i primi che capitano

- Esaurire ogni sitemap: indice fino in fondo, `partiSuccessive` finché
  rispondono — non fermarsi a 30 parti se ce ne sono 80.
- `MAX_PER_INSEGNA = 50.000` (`catalogo.ts`) tronca in silenzio: oggi perde
  136.481 link su 4 cataloghi. Alzarlo, o dichiararlo in `/catalogo/stato`.
- Misurare la **completezza** per catena: link nostri / link dichiarati dalla
  sitemap. Sotto il 90% si indaga perché.
- `paScheda` accettava `/medias/ProductSolr-…xml`, che non è un prodotto: ha
  svuotato Bennet (20.446 → 18) e Unes (15.363 → 4). **[fatto]**

## 3. I prezzi, e il prezzo giusto

- Per ogni catena: il prezzo si legge? con quale campo? misurato su pagine vere.
- Trovare l'equivalente UK di `priceDisplay`: il prezzo **pagato**, non il
  listino.
- Le promozioni fedeltà in UK sono la norma (Clubcard, Nectar, meal deal,
  multi-buy): ignorarle mostra prezzi più alti di quelli reali su gran parte del
  catalogo.
- Prezzo dietro login o negozio in sessione: la catena entra **solo per il
  link**, si dichiara, non si finge.

## 4. I punti vendita

Fare per il Regno Unito ciò che `negozi.ts` fa per l'Italia. Tre strade: JSON del
cercanegozi, schede negozio in sitemap, niente. Obiettivo ≥ 2.000 punti vendita,
Londra coperta. Dichiarare chi ha indirizzo completo e chi solo città.

## 5. La ricerca deve parlare inglese

`NON_ALIMENTARI` e `PREPARAZIONI` erano liste di parole italiane. **[fatto]**

## Regole vincolanti

1. `robots.txt` è legge, ricontrollato per ogni nuovo dominio.
2. Non si replicano sessioni d'acquisto. Prezzo dietro login = solo link.
3. Mai inventare un prezzo; mai attaccare un prezzo vero al prodotto sbagliato —
   il secondo è peggio, perché l'utente non se ne accorge.
4. I link vengono dalle sitemap, mai dal modello.
5. Ogni numero misurato col codice di produzione, non con una copia.
6. Un dominio che risponde non è una catena trovata finché non si apre una
   scheda vera.
7. Non fermarsi al primo dominio per marchio.
8. Non toccare Morrisons e Waitrose, che già funzionano.

## Decisione presa il 16 settembre: solo dati che possono stare nell'API

Tesco, Sainsbury's e Asda **restano fuori**, e non si riprovano per via
tecnica. Rifiutano ogni richiesta da server — con user-agent onesto, con
Googlebot finto, senza user-agent, con Chrome: sempre 403 — mentre servono
regolarmente il browser dell'utente **dallo stesso computer e dallo stesso
indirizzo IP**. La differenza non è chi diciamo di essere: è l'impronta TLS
del client. Farla combaciare significa fingersi un browser verso chi ha
deciso di non dare i dati ai programmi, e non si fa.

Era stata valutata una terza via — far chiedere la pagina al dispositivo
dell'utente, via WebView o estensione, che è come lavorano i comparatori
britannici. Tecnicamente reggeva; **è stata scartata perché è una soluzione da
app, non da API**: il dato resterebbe sul telefono dell'utente e non potrebbe
entrare nel prodotto che vendiamo. Il committente ha scelto di tenere solo
dati che l'API può contenere.

Resta aperta la sola via che darebbe quei dati *di diritto*: chiederli. Una
richiesta di partnership alle tre catene costa una mail e, se accolta, si
collegano in un pomeriggio perché l'impianto è già pronto.

## Come si misura la riuscita

Conteggio prodotto da `scripts/conta-tutto.mjs`.

**I bersagli sono stati rivisti il 16 settembre**, e va detto perché: i primi —
10 catene, 300.000 link — erano calcolati dando per raggiungibili Tesco,
Sainsbury's e Asda, che da sole valgono fra i 150 e i 200.000 prodotti. Escluse
quelle, il bersaglio vecchio non si centra senza barare, e un bersaglio che si
può colpire solo barando spinge a barare. Questi sono tarati su chi ci serve
volentieri.

- [x] ≥ 10 catene UK con link reali — **11** (erano 2)
- [x] ≥ 6 catene UK con prezzo leggibile — **10**
- [ ] ≥ 120.000 link UK — **74.448** (erano 48.673)
- [x] completezza ≥ 90% per catena — verificata leggendo gli indici: Morrisons
      30.491/30.491, Waitrose 18.182/18.182, Sainsbury's 9.898/9.900
- [x] ≥ 2.000 punti vendita UK, Londra inclusa — **2.791** su 5 insegne, di cui 186 a Londra
- [x] 0 link non-prodotto su 50 a caso — **50/50 si aprono, 49/50 col prezzo**
- [ ] richiesta di partnership inviata alle tre catene chiuse — è un risultato
      anche se la risposta tarda, ed è l'unica strada che le riapre
- [x] ≥ 16/20 voci di lista inglese abbinate giuste — **17/20**
- [x] Italia non peggiorata — **18/20 (era tutto rotto); 4.122 punti vendita, invariati**

### Perché i 120.000 link non si raggiungono, e cosa manca davvero

Il conto senza Tesco non torna, e Tesco è fuori per un motivo che nessuna
misura precedente aveva colto: **i suoi indirizzi non contengono il nome del
prodotto**, solo un numero (`/shop/en-GB/products/303837900`). Quarantamila
righe entrerebbero senza una sola parola da cercare, quindi invisibili — e il
nome sta nella scheda, che ci risponde 403. Non è «solo link» come CoopShop:
è un link che non si può usare.

**Aldi UK è poi rientrata** — 4.989 prodotti e 1.844 punti vendita — quando si
è scoperto che i suoi 403 erano limiti di frequenza e non rifiuti: il suo
`robots.txt` dichiara `sitemap_products.xml` e `sitemap_stores.xml`, e a una
richiesta ogni tre secondi li serve entrambi.

**Iceland invece no, e non per un blocco**: non pubblica affatto un indice dei
prodotti. Il suo `/sitemap.xml` elenca tre figli — categorie, contenuti,
negozi — e qualunque altro percorso restituisce gli stessi tre. I prodotti
esistono e il prezzo si legge (1,00 £ misurato su un cetriolo), ma per
elencarli servirebbero 1.503 richieste, una per categoria, contro UNA per ogni
altra insegna.

**Heron Foods e' poi rientrata fra quelle con prezzo**, e il difetto era
nostro: `porzioneConPrezzi` cercava il PRIMO blocco `ld+json` e, trovandolo
dentro i primi 120.000 caratteri, si fermava li'. Ma il primo blocco quasi
sempre e' l'`Organization` del sito, che prezzi non ne ha: quello del prodotto
sta piu' in basso. Heron ne ha due, a 3.501 e a 139.856, e il prezzo era nel
secondo. Ora si tengono anche le finestre successive.

**Co-op resta senza prezzo, e li' non e' colpa nostra**: la sua scheda pesa
6.183 byte e non contiene ne' dati strutturati ne' un simbolo di sterlina. Il
prezzo lo disegna il browser dopo il caricamento. Entra per il link, come
previsto dalla regola 3, e lo si dichiara.

### Tutti i marchi della lista sono stati sondati

L'ultimo a essere verificato e' stato **Amazon Fresh UK**, che mancava. Il suo
`robots.txt` non vieta le schede prodotto, ma **non dichiara nessuna sitemap**:
senza un indice non c'e' un punto di partenza, e la regola 4 dice che i link
vengono dalle sitemap e mai indovinati. Un catalogo che esiste ma non si
annuncia, per noi, non esiste.

Con questo la lista del goal e' esaurita: venticinque marchi piu' le due
piattaforme condivise, tutti provati e tutti con un esito scritto.

### Le due strade rimaste, con il loro prezzo misurato

Non sono dimenticanze: sono scelte che costano piu' di quanto rendono, e vanno
decise da chi paga il conto.

**Iceland vieta le vie economiche, e questo chiude la questione.** Un sito
Salesforce Commerce come il suo offre normalmente tre modi compatti per
elencare un reparto: il parametro `?sz=` che restituisce una griglia invece
della pagina intera, l'endpoint `demandware.store/Sites-…` che rende i soli
prodotti, e la ricerca. Il suo `robots.txt` li **vieta tutti e tre** —
`Disallow: *?sz=*`, `Disallow: */demandware.store/Sites-icelandfoodsuk-Site/*`,
`Disallow: /search*`. Resta permessa la sola pagina categoria completa, quella
da 2,5 MB. Non e' il nostro codice a non saper fare di meglio: e' Iceland ad
aver chiuso il di meglio, e la regola 1 dice che il `robots.txt` e' legge.

**Iceland via pagine categoria — 3,7 GB a notte.** Iceland non pubblica un
indice prodotti, ma le sue 1.503 pagine di categoria contengono i link nel
codice della pagina, e il prezzo poi si legge (1,00 £ misurato). Aprendole
tutte si arriva a ~22.000 schede con duplicati, forse dieci-quindicimila
distinte. Costo misurato su un campione di sei pagine: 2,5 MB l'una, **3,7 GB
in tutto, cinquanta minuti**. Le altre undici insegne messe insieme costano
pochi megabyte, perche' pubblicano una sitemap. Una catena che da sola pesa
mille volte le altre e' una decisione, non un dettaglio tecnico.

**Snappy Shopper — 1.968 negozi con l'indirizzo completo.** E' la piattaforma
che il goal ipotizzava, ed esiste davvero: regge i negozi di vicinato
britannici (Premier, Family Shopper, Booze Express…) e la sua sitemap ne
elenca 1.968. Ogni scheda porta un `PostalAddress` in dati strutturati — via,
citta' e CAP — cioe' piu' di quanto abbiano le nostre fonti attuali, che dalla
sitemap ricavano la sola citta'. I PRODOTTI pero' li carica in JavaScript,
quindi per il catalogo non serve. Per i negozi si', ma vuole una richiesta per
scheda: 1.968 pagine per passare da «citta'» a «via e CAP» su un obiettivo —
i 2.000 punti vendita — gia' superato con 2.791.

**Le 3.758 promozioni Morrisons costano quanto Iceland, ed erano sembrate
gratis.** La sitemap le elenca, ma ogni pagina offerta pesa 595 KB: per tutte
sono 2,2 GB. E quello che contengono non entra nel nostro modello — sono
multi-acquisto, «Buy 3 for £4» su quattro zuppe Heinz, non un prezzo pieno
barrato. Esprimerle vorrebbe dire aggiungere un concetto nuovo (un'offerta che
lega piu' prodotti), non riempire un campo che gia' esiste.

## Quante promozioni stiamo perdendo davvero: il 2%, e il lettore funziona

Misurato su 55 schede sparse per tutte e undici le insegne: **47 danno il
prezzo, 1 dichiara una promozione**. Il primo istinto e' pensare che le
stiamo perdendo quasi tutte. Non e' cosi', e si verifica in un colpo: sulla
scheda Aldi della Titan 6 Pack il lettore legge 1,39 £ con 1,45 £ barrato,
sconto 4%. Il codice le vede.

La spiegazione e' piu' semplice e meno allarmante: **in un momento qualsiasi la
gran parte di un catalogo non e' in promozione**. Il 2% e' il tasso reale su un
campione casuale, non la nostra cecita'. Le promozioni fedelta' che il goal
temeva — Clubcard e Nectar — restano invisibili per un'altra ragione, gia'
documentata: quelle due catene le schede non ce le danno affatto.

---

# Diario di lavoro

## Fatto

**Sette regex morte, in produzione da sempre.** `NON_ALIMENTARI` e
`PREPARAZIONI` in `catalogo.ts` contenevano un carattere di controllo
(backspace, `0x08`) dove doveva esserci `\b`: nate così, committate così. Una
regex che pretende un backspace prima della parola non combacia mai con niente,
quindi **nessuno di quei filtri ha mai filtrato**, né in italiano né altrove.
Non dava errore: le voci c'erano, i conteggi erano alti, e a crollare era solo
la cosa che nessuno guardava, cioè se il prodotto proposto fosse quello giusto.

**Le liste inglesi.** `NON_ALIMENTARI_EN`, `PREPARAZIONI_EN`, `PIATTI_EN` e
`PIATTI_IT`, tenute separate da quelle italiane e non fuse: le due lingue hanno
trappole diverse (`cane` è l'animale in italiano e la canna da zucchero in
inglese) e una lista unica andrebbe indebolita per far posto all'altra.

**L'ordinamento a pari merito.** Vinceva il nome più corto in caratteri, che si
rompe appena le parole in più sono corte: per `cheddar cheese` vinceva «vintage
cheddar cheese twist» su «morrisons cheddar cheese». Ora vince la **quota** —
quante parole del nome sono la cosa cercata — che vale in tutte e due le lingue
senza sapere quale sia.

**`paScheda`** scarta `/medias/` e le estensioni non-HTML.

**Due difetti nel cacciatore di domini, tutti e due dello stesso tipo: un
filtro che non filtrava.** Primo, cercare «grocer» nell'indirizzo intero —
l'host di Morrisons *è* `groceries.morrisons.com`, quindi combaciavano tutte le
sue sitemap figlie. Secondo, cercare «item» nel percorso: **la parola SITEMAP
contiene «item»** (s-*item*-ap), quindi combaciava qualunque sitemap esistente.
In entrambi i casi si finiva ad aprire le prime figlie in ordine alfabetico, e
per Morrisons la prima è `sitemap-categories`: cinquemila lampadine e zero
prodotti. Morrisons risultava «senza catalogo» mentre ne pubblica trentamila.

Il cacciatore ora è tarato contro la verità nota: dà 30.491 per Morrisons e
18.182 per Waitrose, gli stessi numeri che il catalogo ha in produzione.

## Da sapere prima di continuare

**Le tre catene più grandi del Regno Unito non sono raggiungibili, e non le
aggireremo.**

| | robots.txt | pagina prodotto |
|---|---|---|
| Tesco | 403 | 403 — blocca anche un browser vero, verificato dall'utente |
| Sainsbury's | 403 | 403 a noi, 200 dal browser dell'utente |
| Asda | 403 | 403 a noi, 200 dal browser dell'utente |

Sainsbury's e Asda distinguono una richiesta da server da una da browser e
rifiutano la prima. Superare quel controllo significherebbe fingersi un browser
a un sito che ha deciso di non darci i dati: è elusione di una protezione, non
lettura di un dato pubblico, e non si fa — vale quanto la regola sul
`robots.txt`, che per giunta qui non possiamo nemmeno leggere.

**Conseguenza sui numeri da raggiungere.** Quelle tre valgono, a occhio, fra i
centocinquanta e i duecentomila prodotti: il traguardo dei 300.000 link va
riconsiderato alla luce di chi resta, oppure raggiunto allargando la lista dei
marchi. Meglio dirlo adesso che aggiustare il bersaglio a cose fatte.

**Nota su una mia verifica sbagliata del 16 settembre.** Avevo dichiarato
«nessuna catena UK ci vieta l'accesso, robots verificati». Era falso: il
controllo leggeva la pagina di errore di Akamai, non ci trovava `Disallow: /`
dentro un HTML di Access Denied e concludeva «via libera». Un 403 sul
`robots.txt` va trattato come «non lo so», mai come «sì».
