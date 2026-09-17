#!/bin/sh
# ---------------------------------------------------------------------------
#  Il lettore prezzi, su Linux — Raspberry Pi compreso.
#
#  `lettore.cmd` e' Windows e non gira qui: questo fa la stessa cosa. Si lancia
#  con `./lettore.sh`, legge il .env accanto, e comincia a girare. Si vede sul
#  pannello del backend perche' scrive il battito sullo stesso database.
#
#  PERCHE' UN RASPBERRY E' IL POSTO GIUSTO
#  Questo lavoro non ha bisogno di potenza: aspetta la rete quasi tutto il
#  tempo, e la CPU non e' mai il collo di bottiglia. Ha bisogno di STARE
#  ACCESO. Un Pi consuma come una lampadina da comodino, non fa rumore, e non
#  si spegne perche' qualcuno chiude il portatile — che e' esattamente il
#  motivo per cui su Render non funzionava e sul fisso si', ma solo finche' il
#  fisso resta acceso.
#
#  QUANTA MEMORIA HA IL TUO PI
#  Conta piu' del modello. Con 8 GB si tengono i valori del fisso; con 4 GB si
#  dimezzano; con 2 GB o meno si sta bassi, o il sistema ammazza il processo
#  come faceva Render. Il .env consigliato, per taglia:
#
#    8 GB: GIRO_MAX_VOCI=800000  GIRO_INSIEME=32  LETTORE_PAESI=12
#    4 GB: GIRO_MAX_VOCI=300000  GIRO_INSIEME=24  LETTORE_PAESI=8
#    2 GB: GIRO_MAX_VOCI=100000  GIRO_INSIEME=16  LETTORE_PAESI=5
#
#  E dagli un nome suo: NOME_MACCHINA=raspberry, o il pannello mostra due
#  righe che si chiamano uguale e non si capisce quale sia quale.
#
#  PER FARLO RIPARTIRE DA SOLO DOPO UN RIAVVIO
#  Questo ciclo copre il processo che muore. Non copre la corrente che va via.
#  Per quello serve systemd — sono sei righe, in fondo al file.
# ---------------------------------------------------------------------------

cd "$(dirname "$0")" || exit 1

if [ ! -f .env ]; then
  echo
  echo "  Manca il file .env in $(pwd)"
  echo "  Serve almeno MONGODB_URI."
  echo
  exit 1
fi

# La coda montata puo' arrivare a centinaia di migliaia di voci, e il tetto che
# Node si da' da solo su una macchina piccola sta sotto. Meglio dirglielo che
# scoprirlo con un processo ucciso alle quattro di notte.
: "${NODE_OPTIONS:=--max-old-space-size=2048}"
export NODE_OPTIONS

# Ctrl+C deve fermare il ciclo, non solo il giro: senza questa riga il lettore
# riparte subito e sembra che il Ctrl+C non funzioni.
trap 'echo; echo "  lettore fermato."; exit 0' INT TERM

while true; do
  echo
  echo "==========================================================================="
  echo "  avvio: $(date '+%d/%m/%Y %H:%M:%S')"
  echo "==========================================================================="

  npx tsx --env-file-if-exists=.env scripts/lettore.ts "$@"
  stato=$?

  # Uscita pulita: non si riparte.
  [ "$stato" -eq 0 ] && break

  echo
  echo "  il lettore e' uscito con codice $stato — riparto fra 30 secondi"
  echo "  (Ctrl+C per smettere davvero)"
  sleep 30
done

echo
echo "  lettore fermato."

# ---------------------------------------------------------------------------
#  PARTIRE DA SOLO A OGNI ACCENSIONE (systemd)
#
#  Scrivi /etc/systemd/system/lettore.service con dentro:
#
#    [Unit]
#    Description=Lettore prezzi MealMint
#    After=network-online.target
#
#    [Service]
#    WorkingDirectory=/home/pi/spesa-smart-ai/server
#    ExecStart=/home/pi/spesa-smart-ai/server/lettore.sh
#    Restart=always
#    RestartSec=30
#    User=pi
#
#    [Install]
#    WantedBy=multi-user.target
#
#  Poi:  sudo systemctl enable --now lettore
#  Per guardarlo:  journalctl -u lettore -f
# ---------------------------------------------------------------------------
