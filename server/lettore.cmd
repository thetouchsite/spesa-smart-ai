@echo off
rem ---------------------------------------------------------------------------
rem  Il lettore prezzi, in una finestra sua.
rem
rem  Si lancia con un doppio clic. Apre una finestra, legge il .env accanto a
rem  questo file, e comincia a girare: un giro dopo l'altro, cambiando paesi.
rem  Si vede sul pannello del backend su Render, perche' scrive il battito sullo
rem  stesso database.
rem
rem  PERCHE' UN CICLO ATTORNO AL PROGRAMMA
rem  Il programma si rialza gia' da solo dopo l'errore di un giro. Questo ciclo
rem  serve per l'altro caso: quando muore il processo intero — Node che finisce
rem  la memoria, Windows che chiude tutto per un aggiornamento a meta' notte. Un
rem  lettore che si spegne alle tre e lo si scopre alle nove e' sei ore di
rem  magazzino perse, e nessuno se ne accorge finche' non guarda il pannello.
rem
rem  Per fermarlo: Ctrl+C due volte, oppure chiudi la finestra. Il pulsante
rem  «ferma» del pannello ferma il GIRO, non la finestra: dopo la pausa ne
rem  comincia un altro.
rem ---------------------------------------------------------------------------

rem  MANOPOLE CONSIGLIATE, nel .env accanto a questo file.
rem  Non stanno nel codice perche' i valori buoni per un PC ammazzano Render:
rem  la' ci sono 512 MB, qui sedici giga. I predefiniti del codice sono quelli
rem  prudenti, e chi ha una macchina vera se li alza qui.
rem
rem    NOME_MACCHINA=touchPrice     come ti chiami nel pannello
rem    LETTORE_MINUTI=45            quanto dura un giro
rem    LETTORE_PAESI=16             quanti paesi per giro
rem    GIRO_INSIEME=48              pagine aperte insieme
rem    GIRO_PER_INSEGNA=2000        quante schede per insegna, per giro
rem    GIRO_MAX_VOCI=1200000        tetto alla coda montata in memoria
rem
rem  Si va piu' forte in LARGHEZZA, non in pressione: piu' paesi insieme vuol
rem  dire piu' negozi diversi, e a ognuno arrivano MENO richieste al minuto.
rem  Alzare solo GIRO_INSIEME tenendo pochi paesi fa l'opposto, ed e' il modo
rem  di farsi bloccare.

title Lettore prezzi - MealMint
cd /d "%~dp0"

if not exist ".env" (
  echo.
  echo   Manca il file .env in %CD%
  echo   Serve almeno MONGODB_URI.
  echo.
  pause
  exit /b 1
)

:ciclo
echo.
echo ===========================================================================
echo   avvio: %DATE% %TIME%
echo ===========================================================================
rem  Memoria: la coda montata puo' arrivare a un milione di voci, e il tetto
rem  che Node si da' da solo su una macchina da 16 GB sta sotto. Meglio dirglielo
rem  che scoprirlo con un crash alle quattro di notte.
set NODE_OPTIONS=--max-old-space-size=8192

call npx tsx --env-file-if-exists=.env scripts/lettore.ts %*

rem  Uscita pulita (Ctrl+C, o «exit 0» del programma): non si riparte.
if %ERRORLEVEL% EQU 0 goto fine

echo.
echo   il lettore e' uscito con codice %ERRORLEVEL% — riparto fra 30 secondi
echo   (chiudi questa finestra per smettere davvero)
timeout /t 30 /nobreak >nul
goto ciclo

:fine
echo.
echo   lettore fermato.
pause
