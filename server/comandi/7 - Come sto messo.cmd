@echo off
rem ---------------------------------------------------------------------------
rem  I NUMERI VERI, DIVISI PER QUELLO CHE SONO.
rem
rem  «Indirizzi» e «prezzi» sembrano lo stesso numero visto due volte e non lo
rem  sono per niente:
rem
rem    INDIRIZZI  schede che sappiamo esistere, prese dalle sitemap. E'
rem               l'elenco di cosa c'e' da andare a vedere.
rem    PREZZI     schede aperte davvero, col prezzo letto in pagina. E' quel
rem               che l'API puo' vendere.
rem
rem  La copertura e' il secondo diviso il primo, ed e' la sola cifra che dice
rem  se il lavoro sta andando avanti.
rem ---------------------------------------------------------------------------

chcp 65001 >nul
title Stato magazzino - MealMint
cd /d "%~dp0.."

if not exist ".env" (
  echo.
  echo   Manca il file .env in %CD%
  echo.
  pause
  exit /b 1
)

call npx tsx --env-file-if-exists=.env scripts/stato-magazzino.ts

echo.
pause
