# La squadra dei lettori, avviata in modo che sopravviva a chi la avvia.
#
# PERCHE' ESISTE QUESTO FILE
# --------------------------
# Il 22 settembre 2026 ho perso una notte di lavoro perche' avviavo i lettori
# con `nohup ... &` da dentro una chiamata di terminale. Su Windows quel
# processo padre, quando finisce, si porta dietro i figli: tutti e sette i
# lettori sono spariti insieme, senza un errore, senza una riga nei registri.
# Il conteggio e' rimasto fermo e il pannello continuava a mostrare un motore
# sano — perche' guardava l'ultimo battito, e l'ultimo battito era di prima.
#
# `Start-Process` stacca davvero. Ogni lettore diventa un processo suo, con la
# sua finestra nascosta e il suo registro, e sopravvive alla chiusura di
# qualunque terminale.
#
# COME SONO DIVISI, E PERCHE' COSI'
# ---------------------------------
# Un lettore per pool, non uno per continente. La ragione non e' l'ordine: e'
# che due insegne della STESSA PIATTAFORMA interrogate insieme fanno il doppio
# del carico su un backend solo, e quel backend risponde smettendo di dare i
# prezzi. E' costato mezza giornata due volte:
#
#   Alcampo e Bonpreu Esclat   stessa piattaforma. Insieme a 1,5 secondi
#                              davano 13 prezzi su 4.250 pagine; separati e a
#                              tre secondi, sei su sei.
#   Carrefour Emirati e Arabia stesso gruppo (MAF). Stessa storia.
#
# Per questo AE sta da solo e SA sta con ZA, che e' Shoprite — un'altra
# piattaforma, quindi quando una riposa l'altra lavora.
#
# E Carrefour Emirati va aperto UNA PAGINA PER VOLTA. Con due insieme a un
# secondo e mezzo si e' messo in pausa dopo venti rifiuti e ci e' rimasto;
# aperto uno alla volta ogni due secondi e mezzo da' cinque prezzi su sei. E'
# il pool piu' grande che abbiamo — 784.877 indirizzi — e lo si prende piano o
# non lo si prende affatto.
#
# Le pause sono misurate, non scelte: vedi `comandi/1 - Lettore continuo.cmd`
# per il ragionamento completo, e `scripts/chi-rende-davvero.ts` per rifare la
# misura quando un'insegna comincia a dare zero.
#
#   powershell -ExecutionPolicy Bypass -File comandi\avvia-lettori.ps1
#
# I registri finiscono in %TEMP%\lettore-<nome>.log.

$base = Split-Path -Parent $PSScriptRoot
$log  = $env:TEMP

$lettori = @(
  # nome      insieme  perCatena  pausa  paesi                                      quanti  memoria  vociMax
  @{ n = "R-AE";   ins = 1;  cat = 1; pausa = 2500; solo = "AE";                     paesi = 1;  mem = 2560; voci = 900000 },
  @{ n = "R-SAZA"; ins = 4;  cat = 1; pausa = 2000; solo = "SA,ZA";                  paesi = 2;  mem = 1280; voci = 250000 },
  @{ n = "R-ES";   ins = 2;  cat = 1; pausa = 3000; solo = "ES";                     paesi = 1;  mem = 1280; voci = 250000 },
  @{ n = "R-AR";   ins = 4;  cat = 1; pausa = 1600; solo = "AR";                     paesi = 1;  mem = 1536; voci = 300000 },
  @{ n = "R-UA";   ins = 6;  cat = 1; pausa = 1200; solo = "UA";                     paesi = 1;  mem = 1280; voci = 250000 },
  @{ n = "R-LAT";  ins = 12; cat = 1; pausa = 1500; solo = "CO,MX,BR,CL,PE,EG";      paesi = 6;  mem = 1280; voci = 250000 },
  @{ n = "R-EUR";  ins = 10; cat = 1; pausa = 1500; solo = "HR,SI,SK,CZ,HU,PL,GR,RS,TR,IT,GB,DE,FR,NO,FI,SE,DK,IE,NL,BE,CH,AT,PT,RO,LT,LV,EE,BG,AU,MY,IN,US,CA"; paesi = 14; mem = 1280; voci = 250000 }
)

# Chi gira gia' non si tocca: questo comando si puo' lanciare due volte senza
# ritrovarsi quattordici lettori che si pestano i piedi.
$vivi = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*lettore.ts*' } |
  ForEach-Object { if ($_.CommandLine -match 'NOME_MACCHINA=(\S+)') { $matches[1] } })

$avviati = 0
foreach ($l in $lettori) {
  $suoi = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like "*--solo $($l.solo) *" })
  if ($suoi.Count -gt 0) {
    Write-Output "  $($l.n.PadRight(8)) gia' acceso"
    continue
  }

  $env:NOME_MACCHINA           = $l.n
  $env:GIRO_INSIEME            = $l.ins
  $env:GIRO_PER_CATENA_INSIEME = $l.cat
  $env:GIRO_PAUSA_MS           = $l.pausa
  $env:GIRO_PER_INSEGNA        = 20000
  $env:GIRO_MAX_VOCI           = $l.voci
  $env:NODE_OPTIONS            = "--max-old-space-size=$($l.mem)"

  $suo = Join-Path $log "lettore-$($l.n).log"
  Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c npx tsx --env-file-if-exists=.env scripts/lettore.ts --solo $($l.solo) --paesi $($l.paesi) --minuti 600 > `"$suo`" 2>&1" `
    -WorkingDirectory $base -WindowStyle Hidden
  Write-Output "  $($l.n.PadRight(8)) avviato   ->  $suo"
  $avviati++
  Start-Sleep -Seconds 5
}

Write-Output ""
Write-Output "  $avviati avviati, $($lettori.Count - $avviati) erano gia' in piedi."
Write-Output "  Per vedere se lavorano:  npx tsx --env-file-if-exists=.env scripts/guardia.ts"
