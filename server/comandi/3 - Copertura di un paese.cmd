@echo off
rem ---------------------------------------------------------------------------
rem  «DI QUESTI INDIRIZZI, QUANTI HANNO DAVVERO UN PREZZO?»
rem
rem  Insegna per insegna: quanti indirizzi ha, quanti ne abbiamo letti col
rem  prezzo, quanti sono stati provati e il prezzo non ce l'avevano, quanti
rem  restano da guardare.
rem
rem  E' il rapporto da mostrare a un cliente, perche' il conto e' esatto e non
rem  campionato: si sa quali schede hanno reso E quali no.
rem
rem  Lascia in bianco il paese per averli tutti.
rem ---------------------------------------------------------------------------

chcp 65001 >nul
title Copertura - MealMint
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
  set /p PAESE="  Quale paese? (due lettere, vuoto = tutti):  "
)

echo.
call npx tsx --env-file-if-exists=.env scripts/copertura-paese.ts %PAESE%

echo.
pause
