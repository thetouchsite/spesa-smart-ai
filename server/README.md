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
