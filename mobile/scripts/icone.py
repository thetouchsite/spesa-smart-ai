# -*- coding: utf-8 -*-
"""
Le icone dell'app, ricavate dal logo MealMint.

Il logo è orizzontale — salvadanaio più scritta — e per l'icona serve solo il
salvadanaio: a sessanta pixel la parola «MealMint» diventa una macchia grigia.
Quindi si ritaglia il simbolo trovando dove finisce, invece di tagliare a una
percentuale fissa che il giorno che il logo cambia sbaglierebbe.

Tre file, tre misure diverse, e ognuna ha una regola sua:

  icon.png           1024×1024, SENZA trasparenza. iOS rifiuta le icone con
                     canale alfa, quindi il fondo va appiattito.
  adaptive-icon.png  1024×1024, il simbolo dentro il 66% centrale. Android la
                     ritaglia in cerchio, quadrato o goccia a seconda del
                     telefono: quello che sta fuori da quel cerchio può
                     sparire.
  splash-icon.png    il logo INTERO, scritta compresa. Qui c'è spazio e il
                     nome si legge: è il primo momento in cui l'utente lo vede.
"""
from PIL import Image
import sys, os

SORGENTE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "mealmint-logo.png")
ASSETS = sys.argv[1] if len(sys.argv) > 1 else "assets"

logo = Image.open(SORGENTE).convert("RGBA")
L, A = logo.size
print("logo %dx%d" % (L, A))


def contenuto(img):
    """Il rettangolo che contiene qualcosa, ignorando il trasparente."""
    return img.getbbox()


# ── Dove finisce il salvadanaio ──────────────────────────────────────
# Si scorrono le colonne da sinistra: dopo il simbolo c'è uno stacco di
# colonne vuote prima che cominci la scritta. Quello stacco è il taglio.
alfa = logo.split()[3]
piene = [x for x in range(L) if alfa.crop((x, 0, x + 1, A)).getbbox() is not None]

taglio = None
for i in range(1, len(piene)):
    if piene[i] - piene[i - 1] > 18:      # 18 px di vuoto = fine del simbolo
        taglio = piene[i - 1] + 1
        break
if taglio is None:
    taglio = int(L * 0.28)                # ripiego, se non c'è uno stacco netto
print("il simbolo finisce a x=%d (%.0f%% della larghezza)" % (taglio, 100 * taglio / L))

simbolo = logo.crop((0, 0, taglio, A))
simbolo = simbolo.crop(contenuto(simbolo))
print("simbolo %dx%d" % simbolo.size)


def quadrata(img, lato, occupa, fondo=None):
    """Il disegno centrato in un quadrato, occupando `occupa` del lato."""
    largo = int(lato * occupa)
    scala = min(largo / img.width, largo / img.height)
    piccolo = img.resize(
        (max(1, int(img.width * scala)), max(1, int(img.height * scala))),
        Image.LANCZOS,
    )
    tela = Image.new("RGBA", (lato, lato), fondo or (0, 0, 0, 0))
    tela.paste(piccolo, ((lato - piccolo.width) // 2, (lato - piccolo.height) // 2), piccolo)
    return tela


BIANCO = (255, 255, 255, 255)

# ── icon.png ─────────────────────────────────────────────────────────
# Fondo bianco pieno: il salvadanaio ha il contorno verde e su fondo verde
# quel contorno sparirebbe. E iOS il canale alfa lo rifiuta.
icona = quadrata(simbolo, 1024, 0.74, BIANCO).convert("RGB")
icona.save(os.path.join(ASSETS, "icon.png"), "PNG")

# ── adaptive-icon.png ────────────────────────────────────────────────
# Più piccolo, 62%: Android ritaglia in cerchio e quello che sta ai bordi si
# perde. Resta trasparente, il fondo lo mette `app.json`.
quadrata(simbolo, 1024, 0.62).save(os.path.join(ASSETS, "adaptive-icon.png"), "PNG")

# ── splash-icon.png ──────────────────────────────────────────────────
# Il logo intero: all'avvio c'è spazio e il nome deve leggersi.
quadrata(logo, 1024, 0.80).save(os.path.join(ASSETS, "splash-icon.png"), "PNG")

for f in ("icon.png", "adaptive-icon.png", "splash-icon.png"):
    p = os.path.join(ASSETS, f)
    im = Image.open(p)
    print("  %-20s %dx%d  %s  %d KB" % (f, im.width, im.height, im.mode, os.path.getsize(p) // 1024))
