@echo off
rem ---------------------------------------------------------------------------
rem  CATALOGHI CHE NESSUNO POTRA' MAI LEGGERE.
rem
rem  Il lettore cerca il catalogo di un negozio col nome della fonte. Quando
rem  un'insegna viene rinominata, il catalogo vecchio resta li' sotto il nome
rem  di prima: irraggiungibile, ma ancora contato in ogni totale.
rem
rem  QUESTO COMANDO MOSTRA E BASTA. Divide quel che trova in tre:
rem
rem    DOPPIONI     hanno un gemello vivo: la copia esiste ancora altrove,
rem                 cancellarli non toglie niente a nessuno
rem    DA GUARDARE  il nome sembra lo stesso con una lettera persa per strada
rem                 - questi non si cancellano da soli, e per buone ragioni:
rem                 la regola accostava «Ali' Supermercati» ad «Aldi», e sono
rem                 diciassettemila indirizzi
rem    SENZA GEMELLO  unica copia di quegli indirizzi: non si toccano
rem
rem  Per cancellare davvero i doppioni, da terminale:
rem    npx tsx --env-file-if-exists=.env scripts/pulisci-cataloghi.ts --scrivi
rem
rem  Non e' a doppio clic apposta: cancellare e' l'unica cosa che non si
rem  disfa, e va fatta dopo aver guardato, non per sbaglio.
rem ---------------------------------------------------------------------------

chcp 65001 >nul
title Pulizia cataloghi - MealMint
cd /d "%~dp0.."

if not exist ".env" (
  echo.
  echo   Manca il file .env in %CD%
  echo.
  pause
  exit /b 1
)

call npx tsx --env-file-if-exists=.env scripts/pulisci-cataloghi.ts

echo.
pause
