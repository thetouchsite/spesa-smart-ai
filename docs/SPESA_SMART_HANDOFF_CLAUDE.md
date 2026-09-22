# Spesa Smart AI — Handoff tecnico per Claude / VS Code

## Contesto

Il cliente ha realizzato un prototipo/MVP con **Lovable**:

- URL: https://spesa-smart-ai-pilot.lovable.app/
- Il codice è stato scaricato da Lovable come **ZIP**.
- Il progetto è ora disponibile **in locale** sul PC.
- Per ora non vogliamo usare GitHub.
- Obiettivo: analizzare ciò che esiste, sistemare i bug e preparare la migrazione verso una vera app mobile.

## Obiettivo richiesto dal cliente

Il cliente vuole:

1. prendere il progetto React realizzato con Lovable;
2. correggere i bug;
3. migrare da **React Web** a **React Native**;
4. rendere l'app pronta per iOS e Android;
5. preparare le build;
6. pubblicare su **App Store** e **Google Play Store**.

La migrazione React → React Native **non va trattata come una conversione automatica**.

Potenzialmente riutilizzabili:
- business logic;
- API client;
- hooks;
- utility;
- TypeScript types;
- validazioni;
- servizi/backend;
- prompt e logica AI.

Probabilmente da riscrivere:
- UI HTML;
- CSS/Tailwind web;
- componenti DOM;
- routing web;
- componenti incompatibili con React Native;
- API browser-specifiche.

---

# Idea del prodotto

**Spesa Smart AI** vuole aiutare l'utente a:

- impostare un budget;
- organizzare la spesa alimentare;
- ridurre gli sprechi;
- ricevere suggerimenti;
- generare eventualmente menu/piani pasti;
- ottenere una lista della spesa compatibile con il budget;
- personalizzare il risultato in base a famiglia e preferenze.

Concetto:

> L'utente indica budget, persone e preferenze; il sistema genera una spesa e possibilmente un piano pasti cercando di rispettare il budget.

---

# Prima attività: audit completo del progetto

Prima di modificare codice, analizzare l'intero progetto.

## 1. Identificare lo stack

Controllare:

- React version;
- TypeScript / JavaScript;
- Vite / TanStack / altro;
- npm / yarn / pnpm;
- Tailwind;
- shadcn/ui;
- React Router / TanStack Router;
- state management;
- form library;
- validation library;
- query/data-fetching library.

Leggere in particolare:

```text
package.json
vite.config.*
tsconfig.json
src/
.env*
supabase/
```

se presenti.

## 2. Creare la mappa del progetto

Produrre una panoramica delle cartelle principali, ad esempio:

```text
src/
  components/
  pages/
  hooks/
  services/
  api/
  integrations/
  lib/
  utils/
  types/
```

Spiegare brevemente a cosa serve ogni area.

## 3. Identificare tutte le schermate

Per ogni schermata indicare:

- route;
- componente principale;
- funzionalità;
- stato:
  - funzionante;
  - parzialmente funzionante;
  - mock;
  - solo UI;
  - bug presente;
- backend reale sì/no.

---

# Verificare cosa è realmente funzionante

Lovable potrebbe aver generato schermate visivamente complete ma basate su:

- dati mock;
- array hardcoded;
- localStorage;
- placeholder;
- setTimeout;
- funzioni simulate;
- API non implementate.

Cercare nel codice:

```text
mock
dummy
fake
placeholder
TODO
FIXME
localStorage
setTimeout
Math.random
sampleData
demo
```

Segnalare tutto ciò che sembra simulato.

---

# Backend

Capire se esiste un backend reale.

Verificare presenza di:

- Supabase;
- Firebase;
- REST API custom;
- GraphQL;
- serverless functions;
- Edge Functions;
- servizi AI esterni.

Se usa Supabase, verificare:

- autenticazione;
- database;
- tabelle;
- storage;
- Edge Functions;
- RLS policies;
- variabili ambiente.

Non assumere che avere lo ZIP significhi avere anche database e servizi cloud.

---

# Variabili ambiente

Cercare:

```text
.env
.env.local
.env.example
```

NON stampare valori sensibili.

Produrre solo l'elenco dei nomi richiesti, ad esempio:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
OPENAI_API_KEY
...
```

Segnalare eventuali variabili mancanti necessarie all'avvio.

---

# Intelligenza artificiale

Capire se l'AI è realmente implementata.

Verificare:

- provider;
- modello;
- endpoint;
- prompt;
- file coinvolti;
- se la chiamata avviene dal frontend o dal backend.

Se una API key privata AI viene utilizzata direttamente dal frontend:

**SEGNALARLO COME PROBLEMA CRITICO.**

Le chiavi private devono stare server-side.

---

# Funzionalità da individuare

## Budget

Verificare se esiste gestione di:

- budget giornaliero;
- budget settimanale;
- budget mensile;
- totale previsto;
- scostamento dal budget.

## Famiglia

Verificare:

- numero persone;
- adulti;
- bambini;
- numero pasti;
- numero giorni.

## Preferenze

Verificare:

- vegetariano;
- vegano;
- allergie;
- intolleranze;
- alimenti esclusi;
- preferenze.

## Piano pasti

Controllare se genera realmente:

- colazione;
- pranzo;
- cena;
- snack;
- menu settimanale.

## Lista della spesa

Controllare se viene generata dal piano pasti.

Capire se gestisce:

- prodotto;
- quantità;
- unità di misura;
- prezzo;
- categoria;
- totale.

---

# Prezzi supermercati — punto critico

Capire **da dove arrivano i prezzi**.

Possibili casi:

### Caso A — Prezzi stimati/inventati
L'AI produce un prezzo indicativo.

### Caso B — Database interno
Esiste un catalogo salvato nel database.

### Caso C — API esterna
I prezzi arrivano da servizi/API.

### Caso D — Scraping
I prezzi vengono estratti dai siti dei supermercati.

Indicare chiaramente quale soluzione viene usata oggi.

---

# Supermercati

Verificare se supporta supermercati reali come:

- Conad;
- Lidl;
- Carrefour;
- Esselunga;
- Eurospin;
- MD;
- Coop;
- altri.

Capire se:

- sceglie l'utente;
- sceglie l'app;
- vengono confrontati più supermercati;
- viene suggerito quello più economico.

---

# Offerte

Controllare se esiste una vera gestione di:

- promozioni;
- volantini;
- prodotti scontati;
- offerte temporanee.

Capire se l'AI modifica menu/spesa in base alle offerte.

---

# Account utente

Verificare:

- registrazione;
- login;
- logout;
- password reset;
- Google login;
- Apple login;
- profilo;
- persistenza sessione.

Capire dove vengono salvati i dati.

---

# Storico

Verificare se vengono salvati:

- spese precedenti;
- liste;
- menu;
- budget;
- risparmio;
- preferenze.

---

# Dispensa

Capire se l'utente può indicare cosa possiede già in casa e se l'app evita di ricomprarlo.

---

# Analisi bug

Avviare il progetto.

Prima:

```bash
npm install
```

Poi usare lo script corretto trovato in `package.json`, probabilmente:

```bash
npm run dev
```

Registrare ogni bug così:

```text
BUG-001
Descrizione:
Pagina:
Come riprodurlo:
Errore console:
Possibile causa:
Priorità:
```

Priorità:

```text
P0 = blocca completamente l'app
P1 = funzionalità principale non funzionante
P2 = problema importante
P3 = problema UI/minore
```

NON iniziare subito a correggere molti bug: prima produrre la fotografia completa dello stato attuale.

---

# Piano React Native

Dopo l'audit, proporre una strategia.

Stack possibile:

```text
React Native
Expo
TypeScript
Expo Router
TanStack Query
React Hook Form
Zod
```

Valutare in base al progetto reale.

## Potenzialmente riutilizzabile

```text
types/
services/
api/
utils/
hooks/
business logic
validation
AI prompts
```

## Probabilmente da riscrivere

```text
pages/
UI components
CSS
Tailwind web
navigation
browser APIs
DOM manipulation
```

Possibile struttura futura:

```text
mobile/
  app/
  components/
  features/
    auth/
    budget/
    grocery-list/
    meal-plan/
    profile/
  services/
  api/
  hooks/
  store/
  types/
  utils/
  assets/
```

Non crearla prima dell'audit.

---

# Pubblicazione iOS / Android

## Android

Da gestire:

- package name;
- signing;
- keystore;
- icona;
- splash;
- release build;
- Google Play Console;
- privacy policy;
- Data Safety;
- screenshots;
- store listing.

## iOS

Da gestire:

- bundle identifier;
- Apple Developer;
- certificates;
- provisioning;
- App Store Connect;
- privacy declarations;
- screenshots;
- review Apple.

Possibile utilizzo di:

```text
Expo EAS Build
Expo EAS Submit
```

---

# Domande ancora da chiarire col cliente

1. Qual è il problema principale che Spesa Smart deve risolvere?
2. Qual è il flusso ideale dell'utente?
3. I prezzi devono essere reali o stimati?
4. Da quali supermercati devono arrivare?
5. Esistono già API/cataloghi?
6. Deve confrontare più supermercati?
7. Deve utilizzare le offerte?
8. Deve generare menu settimanali?
9. Deve generare ricette?
10. Deve considerare allergie/intolleranze?
11. Deve gestire la dispensa?
12. Deve salvare lo storico?
13. Deve calcolare il risparmio?
14. Deve essere possibile modificare le proposte AI?
15. Vuole account utente?
16. Vuole login Apple/Google?
17. Vuole notifiche push?
18. Deve funzionare offline?
19. L'utente deve poter acquistare direttamente?
20. Il progetto parte solo dall'Italia?

---

# TASK IMMEDIATO PER CLAUDE

Prima di scrivere o modificare codice:

1. analizza l'intero progetto presente nella workspace;
2. leggi `package.json`;
3. identifica stack e dipendenze;
4. crea l'albero delle cartelle;
5. individua tutte le route/schermate;
6. individua backend e servizi esterni;
7. trova eventuali mock;
8. identifica la logica AI;
9. identifica problemi di sicurezza;
10. determina quali funzionalità sono realmente operative;
11. produci un report Markdown.

Il report deve terminare con:

```text
## Cosa possiamo riutilizzare in React Native

## Cosa dobbiamo riscrivere

## Funzionalità mancanti

## Bug individuati

## Rischi tecnici

## Domande da fare al cliente

## Piano consigliato di migrazione
```

**NON procedere subito alla migrazione React Native.**

Prima serve una fotografia completa dello stato attuale.

---

# Obiettivo finale

```text
Lovable React prototype
        ↓
Audit tecnico
        ↓
Bug fixing / stabilizzazione logica
        ↓
Separazione business logic / UI
        ↓
React Native + Expo
        ↓
iOS + Android
        ↓
Test
        ↓
App Store + Google Play
```

## Nota interna commerciale

Il lavoro va considerato come:

> **Realizzazione della versione mobile iOS/Android di Spesa Smart partendo dal prototipo esistente**

e non come semplice “conversione” del progetto Lovable.

La stima economica dipenderà fortemente dall'audit del codice e da quante funzionalità sono davvero implementate rispetto a quelle solo simulate.
