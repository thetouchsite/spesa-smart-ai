@echo off
rem ---------------------------------------------------------------------------
rem  VA A PRENDERE GLI INDIRIZZI.
rem
rem  Percorre le sitemap di ogni insegna del paese e salva in magazzino gli
rem  indirizzi delle schede prodotto. Non legge prezzi: fa l'elenco di cosa
rem  c'e' da andare a vedere. I prezzi vengono dopo, col lettore.
rem
rem  QUANDO SERVE
rem    · subito dopo aver aggiunto insegne nuove (comando 5), se no quelle
rem      insegne restano nelle fonti senza catalogo e il lettore non ha niente
rem      da aprire
rem    · quando un negozio rifa' il sito e i vecchi indirizzi non valgono piu'
rem    · ogni tanto, perche' i negozi aggiungono e tolgono prodotti
rem ---------------------------------------------------------------------------

chcp 65001 >nul
title Raccolta catalogo - MealMint
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
echo   Solo le insegne che un catalogo non ce l'hanno ancora,
echo   oppure tutte quante daccapo?
echo.
echo     1 = solo le nuove   (veloce, e' quasi sempre questo)
echo     2 = tutte daccapo   (lungo: rifa' anche quelle che stanno gia' bene)
echo.
set /p MODO="  scelta [1]:  "

set NODE_OPTIONS=--max-old-space-size=6144

echo.
if "%MODO%"=="2" (
  call npx tsx --env-file-if-exists=.env scripts/raccogli-catalogo.ts %PAESE%
) else (
  call npx tsx --env-file-if-exists=.env scripts/raccogli-catalogo.ts %PAESE% --nuove
)

echo.
pause
