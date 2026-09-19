#!/usr/bin/env bash
# ---------------------------------------------------------------------------
#  LA MACCHINA CHE NON SI FERMA.
#
#  Installa due cose su un server Linux:
#
#    lettore.service   il motore. Legge prezzi in continuazione, e se muore
#                      per qualunque motivo systemd lo rialza dopo trenta
#                      secondi. Riparte anche dopo un riavvio della macchina.
#    catalogo.timer    una volta a settimana rifa' gli indirizzi: i negozi
#                      aggiungono e tolgono prodotti, e un catalogo di sei
#                      mesi fa manda il lettore ad aprire pagine che non
#                      esistono piu'.
#
#  PERCHE' IL TIMER NON E' UN DETTAGLIO
#  Senza, la copertura sembra scendere da sola col passare dei mesi e nessuno
#  capisce perche': non e' il lettore che rallenta, e' l'elenco che invecchia.
#
#  Uso:   sudo bash installa-servizi.sh
# ---------------------------------------------------------------------------

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Serve sudo:  sudo bash $0" >&2
  exit 1
fi

# La cartella `server/` sta due livelli sopra questo file.
QUI="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UTENTE="${SUDO_USER:-$(whoami)}"

if [ ! -f "$QUI/.env" ]; then
  echo "Manca $QUI/.env — senza, il lettore non sa a quale database parlare." >&2
  exit 1
fi

# Quanta memoria dare a Node. Si guarda quella della macchina invece di
# chiederlo: un numero sbagliato qui non da' errore, fa morire il lettore a
# meta' lavoro e sembra un guasto di rete.
MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if   [ "$MB" -ge 15000 ]; then HEAP=6144; INSIEME=56; PERINSEGNA=800000
elif [ "$MB" -ge 7000  ]; then HEAP=4096; INSIEME=32; PERINSEGNA=800000
elif [ "$MB" -ge 3500  ]; then HEAP=2560; INSIEME=40; PERINSEGNA=600000
else                          HEAP=1024; INSIEME=16; PERINSEGNA=100000
fi
echo "Memoria vista: ${MB} MB  →  heap ${HEAP} MB, ${INSIEME} pagine insieme"

cat > /etc/systemd/system/lettore.service <<UNIT
[Unit]
Description=Lettore prezzi MealMint
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${UTENTE}
WorkingDirectory=${QUI}
ExecStart=/usr/bin/env npx tsx --env-file-if-exists=.env scripts/lettore.ts
Restart=always
RestartSec=30
Environment=NODE_OPTIONS=--max-old-space-size=${HEAP}
Environment=GIRO_INSIEME=${INSIEME}
Environment=GIRO_PER_INSEGNA=${PERINSEGNA}
Environment=NOME_MACCHINA=%H

# Se il lettore si mangia la memoria, meglio che muoia lui e riparta pulito
# che non farsi scegliere la vittima dal sistema: senza questo, il kernel puo'
# decidere di ammazzare il database o la sessione ssh al posto suo.
MemoryMax=$(( MB * 80 / 100 ))M
OOMPolicy=stop

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/catalogo.service <<UNIT
[Unit]
Description=Rinfresca gli indirizzi dei cataloghi MealMint
After=network-online.target

[Service]
Type=oneshot
User=${UTENTE}
WorkingDirectory=${QUI}
Environment=NODE_OPTIONS=--max-old-space-size=${HEAP}
ExecStart=/usr/bin/env npx tsx --env-file-if-exists=.env scripts/rinfresca-cataloghi.ts
UNIT

cat > /etc/systemd/system/catalogo.timer <<UNIT
[Unit]
Description=Rinfresca i cataloghi una volta a settimana

[Timer]
# Di notte fra sabato e domenica: e' quando i negozi hanno meno gente e le
# loro sitemap rispondono piu' in fretta.
OnCalendar=Sun 03:00
# Se la macchina era spenta all'ora giusta, si recupera all'accensione invece
# di saltare la settimana.
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now lettore.service
systemctl enable --now catalogo.timer

echo
echo "Fatto. Da adesso il lettore riparte da solo: dopo un errore, dopo la"
echo "memoria esaurita, dopo un riavvio della macchina."
echo
echo "  journalctl -u lettore -f        guardalo lavorare, dal vivo"
echo "  systemctl status lettore        come sta"
echo "  systemctl list-timers catalogo  quando tocca al prossimo rinfresco"
echo "  sudo systemctl stop lettore     fermalo DAVVERO"
echo
