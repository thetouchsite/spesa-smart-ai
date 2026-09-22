@echo off
rem ---------------------------------------------------------------------------
rem  LA STESSA CACCIA, MA STAVOLTA SCRIVE.
rem
rem  Rifa' tutte e tre le prove e mette fra le fonti quelle che hanno reso,
rem  con la resa MISURATA e gli indirizzi CONTATI.
rem
rem  Ci mette molto di piu' del comando 4, ed e' voluto: qui il catalogo si
rem  percorre fino in fondo. La prova veloce si ferma a quattromila indirizzi
rem  per non farti aspettare, e scrivere quel numero come «quanti ne ha»
rem  vorrebbe dire mettere in archivio il tetto della prova invece del
rem  catalogo del negozio. Un numero che poi qualcuno legge come verita' non
rem  si scrive a occhio.
rem
rem  DOPO QUESTO, il catalogo va ancora raccolto per davvero:
rem  «6 - Raccogli il catalogo di un paese.cmd»
rem ---------------------------------------------------------------------------

chcp 65001 >nul
title Aggiungi insegne - MealMint
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
  set /p PAESE="  Quale paese?  "
)
if "%PAESE%"=="" exit /b 1

echo.
echo   Sto per AGGIUNGERE alle fonti le insegne di %PAESE% che superano le prove.
echo   Puo' volerci parecchio: i cataloghi si percorrono per intero.
echo.
set /p SICURO="  Vado? (s/n):  "
if /i not "%SICURO%"=="s" (
  echo.
  echo   Lasciato tutto com'era.
  echo.
  pause
  exit /b 0
)

set NODE_OPTIONS=--max-old-space-size=6144

echo.
call npx tsx --env-file-if-exists=.env scripts/caccia-insegne.ts %PAESE% --fondo --scrivi

echo.
pause
