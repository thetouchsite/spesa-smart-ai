@echo off
rem ---------------------------------------------------------------------------
rem  UN PAESE SOLO, FINO IN FONDO.
rem
rem  Il lettore normale gira su tutti i paesi e si sposta dove c'e' piu' da
rem  fare. Questo fa una cosa sola: prende il paese che gli dici e non lo molla
rem  finche' non ha provato ogni scheda del catalogo.
rem
rem  Serve a rispondere a una domanda precisa - «di questi indirizzi, quanti
rem  hanno davvero un prezzo?» - invece di aspettare che ci arrivi la
rem  rotazione. E' come e' stata chiusa l'Italia.
rem
rem  I numeri qui sotto sono tarati per un PC vero (sedici giga, sedici
rem  thread): tiene in coda tutto il catalogo di un paese invece di masticarlo
rem  a fette. Su un Raspberry vanno abbassati, e infatti li' sono altri.
rem ---------------------------------------------------------------------------

chcp 65001 >nul
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
  echo   Quale paese? Due lettere.
  echo.
  echo     IT Italia    ES Spagna     PT Portogallo   FR Francia
  echo     DE Germania  GB Regno Unito   PL Polonia   NL Olanda
  echo.
  set /p PAESE="  paese: "
)
if "%PAESE%"=="" exit /b 1

title Lettore %PAESE% - MealMint

rem  Il nome nel pannello si deve distinguere dal lettore normale che gira sulla
rem  stessa macchina, o vedi due righe uguali.
set NOME_MACCHINA=%COMPUTERNAME%-%PAESE%

rem  Tante insegne diverse aperte insieme: la velocita' viene da li'. Il tetto
rem  per singolo negozio non si tocca.
set GIRO_INSIEME=56

rem  Tutto il catalogo di un'insegna in un giro solo invece di duemila alla
rem  volta: cosi' il paese finisce in una passata e non in cinquanta.
set GIRO_PER_INSEGNA=200000
set GIRO_MAX_VOCI=400000

rem  Con una coda da quattrocentomila voci Node va avvisato, se no si ferma
rem  proprio quando ha quasi finito.
set NODE_OPTIONS=--max-old-space-size=6144

:ciclo
echo.
echo ===========================================================================
echo   %PAESE% - avvio: %DATE% %TIME%
echo ===========================================================================
echo.

call npx tsx --env-file-if-exists=.env scripts/lettore.ts --solo %PAESE% --paesi 1 --minuti 120

if %ERRORLEVEL% EQU 0 goto fine

echo.
echo   uscito con codice %ERRORLEVEL% - riparto fra 30 secondi
echo   (per smettere davvero, chiudi questa finestra)
timeout /t 30 /nobreak >nul
goto ciclo

:fine
echo.
echo   %PAESE% finito, o lettore fermato.
echo.
echo   Per sapere com'e' andata, apri:  3 - Copertura di un paese.cmd
echo.
pause
