@echo off
rem ---------------------------------------------------------------------------
rem  IL MOTORE. Si apre, si lascia girare, non si tocca piu'.
rem
rem  Prende in prestito qualche paese fra quelli che ne hanno piu' bisogno, ne
rem  legge i prezzi, li rende, e ricomincia. Se cade riparte da solo dopo trenta
rem  secondi. Per fermarlo davvero si chiude la finestra.
rem
rem  Puoi tenerne aperte quante ne vuoi, anche su macchine diverse: i paesi si
rem  prenotano, quindi due lettori non fanno mai lo stesso lavoro due volte.
rem
rem  I NUMERI QUI SOTTO SONO STATI MISURATI, NON SCELTI
rem  --------------------------------------------------
rem  Il 20 settembre 2026 la raccolta e' passata da 599.336 a oltre un milione
rem  di prodotti, e quasi tutto il guadagno e' venuto da come si chiede, non da
rem  quanto forte. Tre cose imparate a caro prezzo:
rem
rem  QUANTE RICHIESTE A UN NEGOZIO ALLA VOLTA. Una. Non due, non quattro.
rem  Alcampo, in Spagna, aperto a freddo da' quattro prezzi su quattro; con due
rem  richieste insieme ne da' uno su quattro. Abbiamo perso 93.000 prezzi veri
rem  per averlo scoperto tardi: il lettore sovrascriveva i prezzi buoni con i
rem  rifiuti, e poi le righe vuote sono state cancellate.
rem
rem  QUANTO ASPETTARE FRA UNA PAGINA E L'ALTRA. Un secondo. Centoventi
rem  millisecondi - il valore di prima - sono otto pagine al secondo, e per i
rem  siti sudamericani e spagnoli sono troppe: rispondono 403 e smettono.
rem
rem  QUANTI NEGOZI INSIEME. Tanti. E' da li' che viene la velocita': sessanta
rem  pagine insieme su sessanta negozi DIVERSI sono educate, sessanta sullo
rem  stesso sono un assedio. Per questo la lista dei paesi va tenuta LARGA -
rem  restringendola, ogni lettore si ritrova due insegne in coda e la
rem  concorrenza crolla a due pagine alla volta.
rem ---------------------------------------------------------------------------

chcp 65001 >nul
title Lettore continuo - MealMint
cd /d "%~dp0.."

if not exist ".env" (
  echo.
  echo   Manca il file .env in %CD%
  echo   Senza quello il lettore non sa a quale database parlare.
  echo.
  pause
  exit /b 1
)

rem  Il nome con cui compare nel pannello. Se lanci piu' lettori sulla stessa
rem  macchina, cambia questo o vedrai due righe identiche senza sapere quale e'
rem  quale.
if "%NOME_MACCHINA%"=="" set NOME_MACCHINA=%COMPUTERNAME%

rem  Sessanta pagine insieme, ma UNA sola per negozio: vedi sopra.
set GIRO_INSIEME=60
set GIRO_PER_CATENA_INSIEME=1
set GIRO_PAUSA_MS=1000

rem  Trentamila schede per insegna a giro: abbastanza per fare strada, poco
rem  abbastanza da non tenere in memoria mezzo catalogo.
set GIRO_PER_INSEGNA=30000
set GIRO_MAX_VOCI=600000
set NODE_OPTIONS=--max-old-space-size=4096

:ciclo
echo.
echo ===========================================================================
echo   LETTORE - avvio: %DATE% %TIME%   (macchina: %NOME_MACCHINA%)
echo ===========================================================================
echo.

call npx tsx --env-file-if-exists=.env scripts/lettore.ts --paesi 12 --minuti 60 %*

if %ERRORLEVEL% EQU 0 goto fine

echo.
echo   uscito con codice %ERRORLEVEL% - riparto fra 30 secondi
echo   (per smettere davvero, chiudi questa finestra)
timeout /t 30 /nobreak >nul
goto ciclo

:fine
echo.
echo   Lettore fermato.
echo.
pause
