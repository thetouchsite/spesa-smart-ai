"""
Sostituisce le stringhe italiane scritte a mano con `ui("...")`.

Applica solo le stringhe già presenti nel dizionario: se una manca, la lascia
com'è invece di rompere la compilazione. Idempotente — rieseguirlo non fa
danni.

Uso:  python scripts/apply-ui.py
"""

import io
import glob
import json
import os
import re

UI_FILE = "src/lib/ui-strings.ts"


def known_strings() -> set:
    src = io.open(UI_FILE, encoding="utf-8").read()
    return set(re.findall(r'^\s+"(.+?)":\s*\{"it"', src, re.M))


def ui_call(text: str) -> str:
    return f"ui({json.dumps(text, ensure_ascii=False)})"


def ensure_helper(src: str, path: str) -> str:
    """Aggiunge import e helper `ui` se non ci sono già."""
    rel = "../../src/lib" if path.replace(os.sep, "/").startswith("app/onboarding/") else (
        "../src/lib" if path.replace(os.sep, "/").startswith("app/") else "../lib"
    )

    if "uiText" not in src:
        m = re.search(r"^import .*?;\n(?![\s\S]*^import )", src, re.M)
        at = m.end() if m else 0
        src = (
            src[:at]
            + f'import {{ uiText }} from "{rel}/ui-strings";\n'
            + (f'import {{ useI18n }} from "{rel}/i18n";\n' if "useI18n" not in src else "")
            + src[at:]
        )

    if "const ui = " not in src:
        m = re.search(r"((?:export default )?function \w+\([^)]*\)\s*\{\n)", src)
        if m:
            hook = "" if "const { language } = useI18n();" in src else "  const { language } = useI18n();\n"
            src = (
                src[: m.end()]
                + hook
                + "  /** Testo nella lingua scelta dall'utente. */\n"
                + "  const ui = (t: string) => uiText(t, language);\n"
                + src[m.end() :]
            )
    return src


def main() -> None:
    known = known_strings()
    files = sorted(glob.glob("app/**/*.tsx", recursive=True) + glob.glob("src/components/*.tsx"))
    touched = 0

    for path in files:
        src = io.open(path, encoding="utf-8").read()
        original = src

        # attributi: label="Testo" -> label={ui("Testo")}
        def attr(m):
            name, text = m.group(1), m.group(2)
            return f"{name}={{{ui_call(text)}}}" if text in known else m.group(0)

        src = re.sub(
            r'\b(label|title|subtitle|hint|text|nextLabel|accessibilityLabel)="([^"]+)"',
            attr,
            src,
        )

        # testo fra tag: >Testo< -> >{ui("Testo")}<
        def jsx(m):
            text = " ".join(m.group(2).split())
            return f"{m.group(1)}{{{ui_call(text)}}}{m.group(3)}" if text in known else m.group(0)

        src = re.sub(r"(>)\s*([^<>{}\n][^<>{}]*?)\s*(<)", jsx, src)

        # proprietà: label: "Testo" -> label: ui("Testo")  (solo dentro componenti)
        def prop(m):
            key, text = m.group(1), m.group(2)
            return f"{key}: {ui_call(text)}" if text in known else m.group(0)

        src = re.sub(r"\b(label|title|hint|subtitle):\s*\"([^\"]+)\"", prop, src)

        if src != original:
            src = ensure_helper(src, path)
            io.open(path, "w", encoding="utf-8").write(src)
            touched += 1

    print(f"file aggiornati: {touched}")


if __name__ == "__main__":
    main()
