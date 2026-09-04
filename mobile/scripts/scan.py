import io, re, glob, json, os

known = set(json.load(io.open('src/lib/ui-strings.ts', encoding='utf-8')
    .split('const UI: Record<string, Entry> = {')[1].split('\n};')[0]
    .replace('\n', ' ').count('') * [] ) ) if False else set()

s_all = io.open('src/lib/ui-strings.ts', encoding='utf-8').read()
known = set(re.findall(r'^\s+"((?:[^"\]|\.)*)":\s*\{"it"', s_all, re.M))

IT = re.compile(r"[àèéìòùÀÈÉÌÒÙ]|\b(il|la|le|lo|gli|un|una|del|della|dei|delle|per|con|che|non|più|tuo|tua|tuoi|sono|puoi|vedi|dove|quando|cosa|questa|questo|alla|dal|sul|nel|una|come|prima|dopo|ogni|solo|anche|senza|torna|crea|scegli|cerca|apri|vai)\b", re.I)

found = set()
for f in sorted(glob.glob('app/**/*.tsx', recursive=True) + glob.glob('src/components/*.tsx')):
    s = io.open(f, encoding='utf-8').read()
    for m in re.finditer(r'\b(label|title|subtitle|hint|text|nextLabel|accessibilityLabel|placeholder)="([^"]{4,150})"', s):
        t = m.group(2).strip()
        if IT.search(t) and t not in known: found.add(t)
    for m in re.finditer(r'>\s*([A-ZÀ-Ùa-zà-ù][^<>{}\n]{6,180}?)\s*<', s):
        t = ' '.join(m.group(1).split())
        if IT.search(t) and t not in known and not t.startswith(('{', 'const', 'import')): found.add(t)
    # stringhe dentro variabili: label:, title:, note:
    for m in re.finditer(r'(?:label|title|hint|note|text|subtitle):\s*"([^"]{6,180})"', s):
        t = m.group(1).strip()
        if IT.search(t) and t not in known: found.add(t)

print(f"stringhe ancora in italiano: {len(found)}")
io.open('scripts/strings2.json', 'w', encoding='utf-8').write(json.dumps(sorted(found), ensure_ascii=False, indent=1))
for t in sorted(found)[:10]: print('  ', t[:76])
