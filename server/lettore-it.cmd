@echo off
rem ---------------------------------------------------------------------------
rem  L'Italia, tutta, su una macchina sola.
rem
rem  Il lettore normale gira su tutti i paesi e si sposta dove c'e' piu' da
rem  fare. Questo fa una cosa sola: prende l'Italia e non la molla finche' non
rem  ha provato ogni scheda del catalogo. Serve a rispondere a una domanda
rem  precisa — «di questi link italiani, quanti hanno davvero un prezzo?» —
rem  invece di aspettare che ci arrivi la rotazione.
rem
rem  PERCHE' SU QUESTA MACCHINA
rem  Sedici giga e sedici thread: puo' tenere in coda tutto il catalogo
rem  italiano insieme invece di masticarlo a fette da duemila per insegna. I
rem  Raspberry no, e infatti li' i valori sono altri.
rem
rem  LE MANOPOLE STANNO QUI, NON NEL .env
rem  Quello che si imposta prima di lanciare vince sul file, quindi questo
rem  comando ha i suoi numeri e non disturba il lettore normale ne' le altre
rem  macchine. Il .env serve solo per i segreti — il database, le chiavi.
rem ---------------------------------------------------------------------------

title Lettore ITALIA - MealMint
cd /d "%~dp0"

if not exist ".env" (
  echo.
  echo   Manca il file .env in %CD%
  echo.
  pause
  exit /b 1
)

rem  Il nome con cui compare nel pannello: si deve distinguere dal lettore
rem  normale che gira sulla stessa macchina, o vedi due righe uguali.
set NOME_MACCHINA=touchPrice-IT

rem  Quattordici insegne italiane per quattro richieste ciascuna: cinquantasei
rem  pagine insieme. Il tetto per negozio resta quello di sempre — la velocita'
rem  viene dall'avere tanti negozi diversi, non dal premere piu' forte su uno.
set GIRO_INSIEME=56

rem  Tutto il catalogo di un'insegna in un giro solo, invece di duemila alla
rem  volta: cosi' l'Italia finisce in una passata e non in cinquanta.
set GIRO_PER_INSEGNA=200000
set GIRO_MAX_VOCI=400000

rem  Node si tiene un tetto di memoria prudente: con una coda da quattrocento-
rem  mila voci serve dirglielo, se no si ferma proprio quando ha quasi finito.
set NODE_OPTIONS=--max-old-space-size=6144

:ciclo
echo.
echo ===========================================================================
echo   ITALIA - avvio: %DATE% %TIME%
echo ===========================================================================

call npx tsx --env-file-if-exists=.env scripts/lettore.ts --solo IT --paesi 1 --minuti 120 %*

if %ERRORLEVEL% EQU 0 goto fine

echo.
echo   uscito con codice %ERRORLEVEL% - riparto fra 30 secondi
echo   (chiudi questa finestra per smettere davvero)
timeout /t 30 /nobreak >nul
goto ciclo

:fine
echo.
echo   Italia finita, o lettore fermato.
echo.
echo   Per sapere come e' andata:
echo     npx tsx --env-file-if-exists=.env scripts/copertura-paese.ts IT
echo.
pause
