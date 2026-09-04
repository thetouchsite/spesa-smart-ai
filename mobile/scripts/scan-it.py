"""
Trova le stringhe ancora scritte in italiano dentro le schermate.

Serve a rispondere a una domanda precisa: cosa vedrebbe in italiano un utente
che ha scelto l'inglese? Ogni riga stampata è una stringa che non passa dal
dizionario delle traduzioni.

Uso:  python scripts/scan-it.py
Esce con codice 1 se ne trova: così può diventare un controllo automatico.
"""

import io
import json
import glob
import re
import sys

UI_FILE = "src/lib/ui-strings.ts"

# Parole che tradiscono l'italiano. Gli accenti da soli non bastano:
# "Continua" e "Torna al menu" non ne hanno.
ITALIAN = re.compile(
    r"[àèéìòùÀÈÉÌÒÙ]"
    r"|\b(il|la|le|lo|gli|un|una|del|della|dei|delle|per|con|che|non|piu|tuo|tua|tuoi"
    r"|sono|puoi|vedi|dove|quando|cosa|questa|questo|alla|dal|sul|nel|come|prima|dopo"
    r"|ogni|solo|anche|senza|torna|crea|scegli|cerca|apri|vai|nessun|nessuna|prezzi"
    r"|spesa|lista|giorno|giorni|settimana|persone|budget)\b",
    re.IGNORECASE,
)


def known_strings() -> set:
    """Stringhe già presenti nel dizionario."""
    src = io.open(UI_FILE, encoding="utf-8").read()
    return set(re.findall(r'^\s+"(.+?)":\s*\{"it"', src, re.M))


def scan() -> list:
    known = known_strings()
    found = set()

    files = sorted(
        glob.glob("app/**/*.tsx", recursive=True) + glob.glob("src/components/*.tsx")
    )
    for path in files:
        src = io.open(path, encoding="utf-8").read()

        # attributi JSX: label="Testo"
        for m in re.finditer(
            r'\b(label|title|subtitle|hint|text|nextLabel|accessibilityLabel|placeholder)'
            r'="([^"]{4,180})"',
            src,
        ):
            add(found, known, m.group(2))

        # testo fra tag: >Testo<
        for m in re.finditer(r">\s*([^<>{}\n][^<>{}]{5,180}?)\s*<", src):
            add(found, known, " ".join(m.group(1).split()))

        # proprietà di oggetti: label: "Testo"
        for m in re.finditer(r'(?:label|title|hint|note|text|subtitle):\s*"([^"]{5,180})"', src):
            add(found, known, m.group(1))

    return sorted(found)


def add(found: set, known: set, text: str) -> None:
    text = text.strip()
    if not text or text in known:
        return
    if text.startswith(("{", "const ", "import ", "http")):
        return
    if ITALIAN.search(text):
        found.add(text)


if __name__ == "__main__":
    missing = scan()
    print(f"stringhe ancora in italiano: {len(missing)}")
    for t in missing[:15]:
        print("  ", t[:78])
    io.open("scripts/strings2.json", "w", encoding="utf-8").write(
        json.dumps(missing, ensure_ascii=False, indent=1)
    )
    sys.exit(1 if missing else 0)
