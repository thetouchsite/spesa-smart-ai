# Costruire l'app installabile

Le spiegazioni che starebbero bene dentro `eas.json` e non ci possono stare:
quel file viene validato contro uno schema rigido, e **qualunque chiave in
più lo fa rifiutare** — compresa la `"//"` che di solito si usa per commentare
un JSON. L'errore è `eas.json is not valid. - "//" is not allowed`, e blocca
sia `eas init` sia `eas build`.

## I comandi

```bash
cd mobile
eas login          # una volta
eas init           # una volta: scrive il projectId dentro app.json
eas build -p android --profile preview
```

## Tre profili, e serve sapere quale

| profilo | cosa produce | a chi serve |
|---|---|---|
| `development` | APK con gli strumenti di sviluppo dentro | a noi: si ricarica il codice senza ricostruire |
| `preview` | **APK vero, installabile** | al cliente, via WhatsApp o link |
| `production` | AAB per il Play Store | solo al negozio |

**`preview` dichiara `buildType: "apk"` di proposito.** Il default di Android è
`.aab`, che è un formato che il Play Store apre e ricompila: sul telefono non
si installa. Senza quella riga si ottiene un file che non serve a nessuno, e
niente lo segnala.

## L'indirizzo del backend si cuoce dentro l'APK

Le variabili `EXPO_PUBLIC_*` non si leggono quando l'app parte: vengono
sostituite nel codice **al momento della build**. Quindi l'indirizzo scritto in
`eas.json` è quello che l'app userà per sempre, e cambiarlo richiede una build
nuova — venti minuti, più l'installazione.

Va messo l'indirizzo pubblico di Render:

```
https://spesa-smart-ai.onrender.com
```

e **non** un `192.168.*`, che esiste solo sulla rete di casa. Il nome del
servizio su Render decide il sottodominio: se il servizio viene rinominato,
questo file va aggiornato prima della build successiva.

## La prova generale, che costa cinque minuti invece di venti

`mobile/.env` porta le stesse tre variabili che `eas.json` mette nell'APK.
Puntandolo su Render, l'app che gira con `npx expo start` diventa una prova
generale vera: stesso codice, stesso backend, stessa configurazione.

```
EXPO_PUBLIC_API_URL=https://spesa-smart-ai.onrender.com
EXPO_PUBLIC_FLUSSO=spesa-prima
EXPO_PUBLIC_PRICE_SOURCE=ai
```

Se lì il piano arriva, l'APK funzionerà. Se non arriva, lo si scopre subito
invece che dopo una compilazione e un'installazione.

## Il keystore

Alla prima build EAS chiede se generare la firma Android: **sì**, la custodisce
lui. È la stessa firma che dovranno avere tutti gli aggiornamenti futuri — un
APK firmato con una chiave diversa Android lo rifiuta come se fosse un'altra
app.

## Costruirlo in locale, senza EAS

Si può, e su questa macchina tutto il necessario c'è già: SDK Android, Java 17,
emulatore.

```bash
npm run apk          # prebuild + gradle, in un colpo
npm run apk:apri     # apre la cartella dove finisce il file
```

L'APK esce in `android/app/build/outputs/apk/release/app-release.apk`.

**Quando conviene.** Il piano gratuito EAS dà 15 build Android al mese, una
alla volta, e ogni giro passa dal caricamento del progetto e dalla coda. In
locale non c'è nessun limite e dalla seconda volta in poi è molto più veloce —
la prima paga il download di Gradle e delle dipendenze native.

**Tre differenze che contano, e nessuna si annuncia da sola:**

**Le variabili vengono da un altro file.** La build locale legge `mobile/.env`;
EAS legge il blocco `env` del profilo in `eas.json`. Sono due posti diversi con
le stesse tre chiavi: se divergono, si finisce con un APK che punta a
`192.168.1.4` — cioè a niente, sul telefono di chiunque altro. Prima di
`npm run apk`, guardare `.env`.

**La firma non è la stessa.** EAS genera e custodisce un keystore vero. Il
modello di prebuild, senza configurazione, firma anche la release con la
**chiave di debug**: l'APK si installa e funziona, va benissimo per farlo
provare a un collega, ma è firmato con una chiave che ha chiunque e non è la
stessa con cui EAS firmerà le versioni successive. Android rifiuta un
aggiornamento firmato con una chiave diversa, quindi chi ha installato la
versione locale dovrà disinstallare prima di passare a una di EAS.

**`android/` compare nel progetto.** È generata, e sta in `.gitignore` apposta:
finché non è committata, `app.json` resta l'unica verità sulla configurazione
dell'app e ogni build la rilegge. Dal momento in cui la si committa diventa lei
la verità, e cambiare `app.json` non ha più effetto finché qualcuno non rifà
prebuild — senza che niente lo segnali.

## E iOS?

Solo con EAS, e non è una preferenza: **compilare per iOS richiede macOS con
Xcode**. Da Windows non esiste una strada locale. EAS compila sui propri Mac,
ed è la ragione più solida per tenerlo anche se l'Android lo si costruisce in
casa.

```bash
eas build -p ios --profile preview
```

**Ma iOS non è gratis come Android**, e le differenze sono tre:

| | Android | iOS |
|---|---|---|
| account a pagamento | no | **Apple Developer, 99 $/anno** |
| chi può installarlo | chiunque riceva il link | solo dispositivi registrati, o TestFlight |
| avviso all'installazione | "fonte sconosciuta", si accetta | nessuno, ma serve il passaggio sopra |

Per far provare l'app a qualcuno con un iPhone ci sono due strade:

- **ad hoc** — si registra l'UDID di ogni singolo dispositivo (`eas device:create`)
  e si ricostruisce l'app ogni volta che se ne aggiunge uno;
- **TestFlight** — si carica su App Store Connect e si invita per email, fino a
  diecimila persone senza registrare niente. È la strada sensata appena i
  tester sono più di due, e richiede comunque l'account a pagamento.

Esiste una build iOS gratuita (`"simulator": true`), ma gira solo nel simulatore
di un Mac: per un collega con un iPhone non serve a niente.
