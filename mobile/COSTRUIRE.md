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
