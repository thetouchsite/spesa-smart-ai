# spesa-smart-api

Backend Node.js dell'app Spesa Smart. Sostituisce le server function di
TanStack Start (che in React Native non esistono) e il gateway AI di Lovable.

Nessun framework: `node:http` e tre dipendenze. Dopo Lovable e TanStack, il
progetto non si lega a nient'altro.

## Cosa fa

1. **Custodisce le chiavi API.** Da un file `.apk` si estraggono in cinque
   minuti: la chiave Gemini non può stare dentro l'app.
2. **Account e piani su MongoDB.** I piani salvati non si perdono più
   cambiando telefono.
3. **Cache AI condivisa fra tutti gli utenti.** È ciò che porta il costo per
   piano generato da ~0,15 € a ~0,02 €: i piatti distinti nel catalogo sono
   poche centinaia, quindi a regime quasi ogni richiesta è già in cache.

## Avvio in locale

```bash
cd server
npm install
cp .env.example .env      # e compila i tre valori obbligatori
npm run dev
```

Verifica:

```bash
curl http://localhost:3000/health
# {"ok":true,"model":"gemini-3-flash-preview","aiConfigured":true,"dbConfigured":true,...}
```

`/health` dichiara la verità: se una chiave manca, `aiConfigured` è `false` e
gli endpoint `/ai/*` rispondono `503`. Va saputo dal monitoraggio, non
scoperto da un utente.

## Deploy su Railway

1. **New Project → Deploy from GitHub repo**, scegli questo repository.
2. **Root Directory**: `server` (altrimenti Railway compila l'app web).
   Build `npm run build`, start `npm start` — rilevati in automatico.
3. **Add Service → Database → MongoDB.**
4. Nelle variabili del servizio API:

   | Variabile | Valore |
   |---|---|
   | `GOOGLE_GENERATIVE_AI_API_KEY` | da [AI Studio](https://aistudio.google.com/apikey) |
   | `MONGODB_URI` | `${{MongoDB.MONGO_URL}}` — riferimento, non incollare l'URI |
   | `AUTH_SECRET` | 32+ caratteri casuali (comando nel `.env.example`) |
   | `ALLOWED_ORIGINS` | il dominio del sito, se resta online |

5. **Networking → Generate Domain**, e usa quell'URL come `API_URL` nell'app.

`PORT` la imposta Railway: non va dichiarata.

## Il lettore prezzi su una macchina dedicata

Il lettore apre le schede prodotto dei supermercati e riempie il magazzino.
**Su Render non ci sta**: montare la coda legge e decomprime i cataloghi, ed è
la parte che consuma di più — su un piano da mezzo giga il processo viene
ucciso prima di aprire una pagina, e il servizio cade con un 502. Gira su
macchine nostre: un PC, un Raspberry, quello che resta acceso.

Si vede tutto dal pannello (`/pannello`) perché il battito passa dal database,
non dal processo: basta che `MONGODB_URI` sia lo stesso.

### Installazione su un Raspberry Pi

Serve Node 20: quello di apt su Bookworm è il 18 e non basta.

```sh
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

cd ~
git clone -b feat/react-native https://github.com/thetouchsite/spesa-smart-ai.git
cd spesa-smart-ai/server
npm ci
chmod +x lettore.sh
```

Il `.env` **non è nel repo**: si copia da una macchina che ce l'ha già.

```sh
# dal PC che ha il .env
scp server/.env touchsite@IP-DEL-PI:~/spesa-smart-ai/server/.env
```

Poi si tara sulla memoria che c'è. I valori buoni per un PC ammazzano un Pi
piccolo, esattamente come fanno con Render:

| RAM | `GIRO_MAX_VOCI` | `GIRO_INSIEME` | `LETTORE_PAESI` | `NODE_OPTIONS` |
|---|---|---|---|---|
| 8 GB | 800000 | 32 | 12 | `--max-old-space-size=4096` |
| 4 GB | 600000 | 40 | 14 | `--max-old-space-size=2560` |
| 2 GB | 100000 | 16 | 5 | `--max-old-space-size=1024` |

E dagli un nome suo, o nel pannello compaiono due righe che si chiamano
uguale: `NOME_MACCHINA=raspberry`.

### Farlo partire da solo, e restare acceso

`/etc/systemd/system/lettore.service`:

```ini
[Unit]
Description=Lettore prezzi MealMint
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=touchsite
WorkingDirectory=/home/touchsite/spesa-smart-ai/server
ExecStart=/home/touchsite/spesa-smart-ai/server/lettore.sh
Restart=always
RestartSec=30
Environment=NODE_OPTIONS=--max-old-space-size=2560

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now lettore
```

### I comandi di tutti i giorni

```sh
journalctl -u lettore -f          # guardalo lavorare, dal vivo
systemctl status lettore          # come sta
sudo systemctl restart lettore    # riavvialo
sudo systemctl stop lettore       # fermalo DAVVERO
```

Per aggiornarlo dopo un push:

```sh
cd ~/spesa-smart-ai && git pull && cd server && npm ci
sudo systemctl restart lettore
```

Su Windows, al posto del servizio c'è `lettore.cmd`: doppio clic, apre la sua
finestra, e il ciclo attorno lo rialza se il processo muore.

### Due cose che sembrano guasti e non lo sono

**«Tutti i paesi sono presi: aspetto».** Non è fermo. I paesi si prenotano —
un biglietto per paese sul database, che scade in tre minuti e si rinnova
lavorando — così due lettori accesi insieme non aprono le stesse pagine, che
sarebbe lavoro doppio e richieste doppie ai negozi veri. Quanti ne prende
ognuno lo decide la quota: paesi totali diviso lettori vivi. Si aggiusta da
sola quando una macchina si accende o si spegne, e non serve che nessuno
concordi niente con nessuno.

**Il pulsante «Ferma la lettura» del pannello non spegne la macchina.** Ferma
il *giro* in corso; dopo la pausa il lettore ne comincia un altro. Per
spegnerlo sul serio serve `systemctl stop`, ed è l'unico modo: il ciclo dello
script e `Restart=always` di systemd lo rialzano da tutto il resto —
catalogo finito, errore di rete, memoria esaurita, riavvio del Pi.

## Endpoint

| Metodo | Percorso | Auth | Descrizione |
|---|---|---|---|
| GET | `/health` | — | stato del servizio e delle configurazioni |
| POST | `/auth/register` | — | `{ email, password, displayName? }` → `{ token }` |
| POST | `/auth/login` | — | `{ email, password }` → `{ token }` |
| GET | `/me` | Bearer | profilo dell'utente |
| GET | `/plans` | Bearer | piani salvati, dal più recente |
| POST | `/plans` | Bearer | salva un piano |
| POST | `/plans/delete` | Bearer | `{ id }` |
| POST | `/ai/recipe` | — | ricetta generata dal modello |
| POST | `/ai/recipe-web` | — | ricerca web + estrazione strutturata |
| POST | `/ai/chef` | — | rifinitura "da chef" (non tocca gli ingredienti) |
| POST | `/ai/plan` | — | piano alimentare completo |

Il corpo accetta sia `{ "data": {...} }` (formato delle vecchie server
function) sia l'oggetto diretto, così il client può migrare senza rotture.

## Note per chi ci mette mano

**La ricerca ricette è dietro un'interfaccia** (`src/search.ts`). DuckDuckGo,
usato dal prototipo, a settembre 2026 risponde `HTTP 202` con una pagina
anti-bot: il regex trova zero risultati e — poiché 202 supera il controllo
`res.ok` — il codice originale proseguiva senza segnalare nulla, mostrando
ricette inventate attribuite a siti reali. Qui l'esito è dichiarato:
`extractionMode: "extracted"` solo quando una pagina è stata davvero letta,
altrimenti `"ai-assisted"` con `sourceUrl` vuoto. Passare a Brave sono due
variabili d'ambiente, zero modifiche al codice.

**Il contesto pagina è tagliato a ~15.000 caratteri** (era fino a 85.000).
A 21 ricette per piano quella differenza vale ~0,10 € a piano di soli token
in ingresso.
