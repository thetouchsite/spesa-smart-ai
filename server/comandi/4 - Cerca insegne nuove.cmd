@echo off
rem ---------------------------------------------------------------------------
rem  CERCA NEGOZI CHE NON ABBIAMO ANCORA.
rem
rem  E' da qui che i numeri crescono. I cataloghi che abbiamo sono gia' presi
rem  per intero - misurato: su centosedici insegne vive, una sola non ha
rem  catalogo. Rileggere meglio le sitemap non porta un prodotto in piu'.
rem
rem  Per ogni candidato fa tre prove, in quest'ordine:
rem
rem    1. SI PUO'?  legge il robots.txt. Se il negozio dice di no, l'insegna
rem                 finisce li' e non si guarda nemmeno quanto e' grossa.
rem    2. QUANTO?   raccoglie con lo stesso codice che poi fara' il lavoro
rem                 vero, quindi il numero che vedi e' quello che otterrai.
rem    3. RENDE?    apre per davvero venti schede e conta quante hanno il
rem                 prezzo scritto in pagina.
rem
rem  Il terzo passo e' quello che conta. Mercadona pubblica 4.316 indirizzi e
rem  ci ha dato 34 prezzi: un catalogo grosso che non dichiara i prezzi non e'
rem  un guadagno, e' lavoro per i lettori in cambio di niente.
rem
rem  QUESTO COMANDO NON SCRIVE NIENTE. Guarda e basta.
rem  Per aggiungerle davvero: «5 - Aggiungi le insegne trovate.cmd»
rem ---------------------------------------------------------------------------

chcp 65001 >nul
title Caccia insegne - MealMint
cd /d "%~dp0.."

if not exist ".env" (
  echo.
  echo   Manca il file .env in %CD%
  echo.
  pause
  exit /b 1
)

set PAESE=%1
if "%PAESE%"=="" (
  echo.
  echo   Paesi con un elenco di candidati gia' pronto:  IT  ES  FR  DE
  echo   Per gli altri serve dare il dominio a mano - vedi il LEGGIMI.
  echo.
  set /p PAESE="  paese: "
)
if "%PAESE%"=="" exit /b 1

echo.
call npx tsx --env-file-if-exists=.env scripts/caccia-insegne.ts %PAESE%

echo.
pause
