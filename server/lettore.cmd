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
