@echo off
rem ---------------------------------------------------------------------------
rem  TUTTI I PAESI, UNO DOPO L'ALTRO, SENZA STARE QUI DAVANTI.
rem
rem  Prende il primo paese della lista, lo legge fino a che non c'e' piu'
rem  niente da aprire, passa al secondo. Alla fine si ferma da solo.
rem
rem  E' il comando 2 ripetuto, ma senza che tu debba tornare ogni due ore a
rem  digitare la sigla del paese dopo.
rem
rem  L'ORDINE NON E' CASUALE, ED E' LA PARTE CHE CONTA.
rem  Non e' «chi ha piu' indirizzi da aprire»: e' quanti di quegli indirizzi
rem  diventeranno davvero un prezzo. Sono due classifiche diverse e portano a
rem  ordini diversi. La Lituania ha 117.904 schede mai aperte e sembra il
rem  primo posto della lista, ma 61.013 sono di LastMile, che il prezzo non lo
rem  scrive mai: aprirle e' lavoro buttato. La Danimarca ne ha 42.687 e
rem  41.139 sono morte allo stesso modo - li' non c'e' quasi piu' niente da
rem  prendere.
rem
rem  Misurato il 20 settembre: 396.986 schede da aprire, di cui 326.678
rem  dovrebbero dare un prezzo. Le altre 387.676 stanno in insegne a resa
rem  zero e non le apre nessuno.
rem
rem  Se un paese lo sta gia' leggendo un'altra macchina, questo passa oltre
rem  invece di aspettare: e' il punto di avere una catena.
rem ---------------------------------------------------------------------------

chcp 65001 >nul
title Chiudo tutti i paesi - MealMint
cd /d "%~dp0.."

if not exist ".env" (
  echo.
  echo   Manca il file .env in %CD%
  echo.
  pause
  exit /b 1
)

rem  La lista. Cambiala pure: si legge da sinistra a destra.
rem  Per rifare l'ordine coi numeri di oggi:  7 - Come sto messo.cmd
set PAESI=%*
if "%PAESI%"=="" set PAESI=ES PT LT LV ZA EE RO BG

set NOME_MACCHINA=%COMPUTERNAME%-catena
set GIRO_INSIEME=56
set GIRO_PER_INSEGNA=200000
set GIRO_MAX_VOCI=400000
set NODE_OPTIONS=--max-old-space-size=6144

echo.
echo ===========================================================================
echo   IN FILA: %PAESI%
echo   avvio: %DATE% %TIME%
echo ===========================================================================

for %%P in (%PAESI%) do call :unPaese %%P

echo.
echo ===========================================================================
echo   FINITI TUTTI - %DATE% %TIME%
echo ===========================================================================
echo.
echo   Per vedere com'e' andata:  3 - Copertura di un paese.cmd
echo.
pause
exit /b 0

rem ---------------------------------------------------------------------------
:unPaese
set P=%1
set TENTATIVI=0

:riprova
echo.
echo   --- %P% --- %TIME%
echo.

call npx tsx --env-file-if-exists=.env scripts/lettore.ts --solo %P% --paesi 1 --minuti 120 --finoAFine

if %ERRORLEVEL% EQU 0 (
  echo.
  echo   %P% a posto.
  exit /b 0
)

rem  Un'uscita con errore quasi sempre e' la rete che ha singhiozzato: si
rem  riprova. Ma non all'infinito, o un paese rotto tiene in ostaggio tutti
rem  quelli dietro di lui e la catena non arriva mai in fondo.
set /a TENTATIVI+=1
if %TENTATIVI% GEQ 5 (
  echo.
  echo   %P% e' caduto cinque volte: lo lascio e vado avanti.
  echo   ^(riprovalo da solo dopo, col comando 2^)
  exit /b 0
)

echo.
echo   %P% caduto (codice %ERRORLEVEL%) - tentativo %TENTATIVI% di 5, riparto fra 30 secondi
timeout /t 30 /nobreak >nul
goto riprova
