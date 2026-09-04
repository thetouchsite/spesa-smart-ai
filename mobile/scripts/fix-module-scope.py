"""
Ripara le sostituzioni finite fuori dai componenti.

`apply-ui.py` ha tradotto anche le costanti dichiarate a livello di modulo
(gli array STEPS, OPTIONS, STYLES, STATUS in cima ai file), dove `ui` non
esiste ancora. Lì la stringa deve restare tale e venire tradotta al momento
in cui la si mostra.

Uso:  python scripts/fix-module-scope.py
"""

import io
import glob
import re


def first_component_at(src: str) -> int:
    """Posizione della prima funzione componente: prima di lì siamo nel modulo."""
    m = re.search(r"^(?:export default )?function \w+\(", src, re.M)
    return m.start() if m else len(src)


def main() -> None:
    files = sorted(glob.glob("app/**/*.tsx", recursive=True) + glob.glob("src/components/*.tsx"))
    fixed = 0

    for path in files:
        src = io.open(path, encoding="utf-8").read()
        cut = first_component_at(src)
        head, body = src[:cut], src[cut:]

        # Nel preambolo: ui("Testo") torna a "Testo"
        new_head = re.sub(r'\bui\((\"(?:[^\"\\]|\\.)*\")\)', r"\1", head)
        # anche nella forma {ui("Testo")}
        new_head = re.sub(r'\{ui\((\"(?:[^\"\\]|\\.)*\")\)\}', r"\1", new_head)

        if new_head != head:
            io.open(path, "w", encoding="utf-8").write(new_head + body)
            fixed += 1

    print(f"file riparati: {fixed}")


if __name__ == "__main__":
    main()
