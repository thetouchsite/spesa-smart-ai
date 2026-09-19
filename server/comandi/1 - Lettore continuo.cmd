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
rem  macchina, cambia questo o vedrai due righe identiche e non saprai quale e'
rem  quale.
if "%NOME_MACCHINA%"=="" set NOME_MACCHINA=%COMPUTERNAME%

rem  Quante pagine si aprono insieme. Il tetto per singolo negozio resta quello
rem  di sempre: la velocita' viene dall'avere tanti negozi diversi in coda, non
rem  dal premere piu' forte su uno solo.
set GIRO_INSIEME=48
set NODE_OPTIONS=--max-old-space-size=4096

:ciclo
echo.
echo ===========================================================================
echo   LETTORE - avvio: %DATE% %TIME%   (macchina: %NOME_MACCHINA%)
echo ===========================================================================
echo.

call npx tsx --env-file-if-exists=.env scripts/lettore.ts %*

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
