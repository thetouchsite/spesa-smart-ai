/**
 * I cataloghi che nessuno potra' mai leggere.
 *
 * IL CRITERIO, E PERCHE' E' SICURO
 * --------------------------------
 * Il lettore cerca il catalogo di un'insegna con il nome della FONTE:
 * `cataloghi.findOne({ _id: "PAESE|Insegna" })`. Quindi un catalogo il cui
 * nome non corrisponde a nessuna fonte e' irraggiungibile per costruzione —
 * non «probabilmente inutile»: proprio non c'e' modo di arrivarci.
 *
 * Si tengono invece quelli delle insegne ESCLUSE: l'esclusione si toglie con
 * `fonte.ts --riammetti`, e in quel momento il catalogo serve di nuovo.
 *
 * DA DOVE VENGONO
 * ---------------
 * Da rinomine. Il 16 settembre diverse insegne hanno cambiato nome —
 * «Morrisons» e' diventata «Morrisons Groceries», «Barbora EE» e' diventata
 * «Barbora Estonia» — e il catalogo vecchio e' rimasto li' sotto il nome di
 * prima, mentre quello nuovo veniva ricostruito accanto. Due copie dello
 * stesso negozio, una viva e una muta.
 *
 * PERCHE' NON BASTAVA CONTARLI
 * ----------------------------
 * Perche' guardando solo i numeri sembravano catene perdute da recuperare —
 * trentaduemila prodotti di Morrisons «da riattivare». Erano gia' letti, sotto
 * l'altro nome. Prima di cancellare, questo comando mostra per ognuno se
 * esiste un gemello vivo, cosi' la decisione si prende guardando e non
 * contando.
 *
 *   npx tsx --env-file-if-exists=.env scripts/pulisci-cataloghi.ts           (mostra)
 *   npx tsx --env-file-if-exists=.env scripts/pulisci-cataloghi.ts --scrivi  (cancella)
 */

import { fonti, cataloghi } from "../src/base/db.js";

const scrivi = process.argv.includes("--scrivi");

/* Gli accenti si possono scrivere in due modi — «é» come una lettera sola o
   come «e» piu' un segno combinante — e per il codice sono stringhe diverse.
   Qui non e' successo (provato: gli orfani restano trentaquattro con o senza
   normalizzazione), ma costa una riga e toglie di mezzo il dubbio. */
const chiave = (s: string) => s.normalize("NFC");

const nomiDiFonte = new Set<string>();
const escluse = new Set<string>();
for (const f of await (await fonti()).find({}).project({ insegna: 1, esclusa: 1 }).toArray()) {
  const x = f as unknown as { insegna: string; esclusa?: string };
  nomiDiFonte.add(chiave(x.insegna));
  if (x.esclusa) escluse.add(chiave(x.insegna));
}

/** «Morrisons Groceries» e «Morrisons» sono lo stesso negozio: si confronta la radice. */
const radice = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(
      /\b(spesa|online|shop|groceries|grocery|a casa|e-?shop|e-?veikals|market|supermercati|supermercato|italia|casa|com)\b/g,
      "",
    )
    .replace(/[^a-z0-9]/g, "");

const tutti = await (await cataloghi())
  .find({}, { projection: { paese: 1, insegna: 1, prodotti: 1, aggiornato: 1 } })
  .toArray();

const vivi = tutti.filter((c) =>
  nomiDiFonte.has(chiave(String((c as unknown as { insegna: string }).insegna))),
);
const senzaFonte = tutti.filter(
  (c) => !nomiDiFonte.has(chiave(String((c as unknown as { insegna: string }).insegna))),
);

const n = (v: number) => v.toLocaleString("it-IT");
let link = 0;

/* SI CANCELLA SOLO CHI HA UN GEMELLO VIVO.
   Un catalogo senza fonte e' irraggiungibile, vero — ma «irraggiungibile» non
   vuol dire «di cui non importa niente»: se e' l'unica copia di ventimila
   indirizzi raccolti, buttarlo li perde per sempre, e nessuno sapra' mai che
   c'erano. Con un gemello vivo invece la copia esiste ancora e la
   cancellazione non toglie niente a nessuno.
   Gli altri restano dove sono: costano pochi megabyte e non fanno danno. */
type Cat = { _id: string; paese: string; insegna: string; prodotti: number; aggiornato: Date };

const gemelloDi = (c: unknown) => {
  const x = c as Cat;
  return vivi.find(
    (v) => (v as unknown as Cat).paese === x.paese && radice((v as unknown as Cat).insegna) === radice(x.insegna),
  ) as unknown as Cat | undefined;
};

/* LA LETTERA ACCENTATA NON E' CAMBIATA FORMA: E' SPARITA.
   «Aldi Süd» sta nei cataloghi come «Aldi S d», «El Corte Inglés» come
   «El Corte Ingl s»: da qualche parte, in un vecchio passaggio, il carattere
   accentato e' stato buttato via e al suo posto e' rimasto uno spazio. Non e'
   una questione di normalizzazione — quel segno proprio non c'e' piu'.
   Quindi il confronto per radice non li aggancia: «aldisd» non e' «aldisud».

   Si riconoscono cosi': il nome mutilato e' contenuto nell'altro nella stessa
   identica sequenza, con qualche lettera in meno. E' un indizio forte, non una
   prova — «Coop» sta dentro «Coop Danmark» senza essere lo stesso negozio — e
   per questo NON vanno nel mucchio da cancellare: si mostrano a parte, con
   accanto quanti indirizzi ha il presunto gemello, perche' a decidere sia un
   occhio umano e non questa regola. */
const mutilato = (corto: string, lungo: string) => {
  if (corto.length >= lungo.length) return false;
  if (lungo.length - corto.length > 3) return false;
  let i = 0;
  for (const ch of lungo) if (i < corto.length && corto[i] === ch) i++;
  return i === corto.length;
};

const forseGemelloDi = (c: unknown) => {
  const x = c as Cat;
  const a = radice(x.insegna);
  return vivi.find((v) => {
    const y = v as unknown as Cat;
    if (y.paese !== x.paese) return false;
    const b = radice(y.insegna);
    return mutilato(a, b) || mutilato(b, a);
  }) as unknown as Cat | undefined;
};

const daTogliere = senzaFonte.filter((c) => gemelloDi(c));
const daGuardare = senzaFonte.filter((c) => !gemelloDi(c) && forseGemelloDi(c));
const daTenere = senzaFonte.filter((c) => !gemelloDi(c) && !forseGemelloDi(c));

console.log("DOPPIONI: hanno un gemello vivo, si possono cancellare");
console.log("");
for (const c of daTogliere.sort((a, b) =>
  String((a as unknown as { _id: string })._id).localeCompare(String((b as unknown as { _id: string })._id)),
)) {
  const x = c as unknown as { _id: string; paese: string; insegna: string; prodotti: number; aggiornato: Date };
  link += x.prodotti ?? 0;

  const gemello = gemelloDi(c)!;
  console.log(
    `  ${x._id.padEnd(28)} ${n(x.prodotti ?? 0).padStart(7)} link  →  vive come «${gemello.insegna}» ` +
      `(${n(gemello.prodotti)} link, del ${new Date(gemello.aggiornato).toLocaleDateString("it-IT")})`,
  );
}

console.log("");
console.log("DA GUARDARE: il nome sembra lo stesso con una lettera persa per strada.");
console.log("Questi NON si cancellano da soli: controlla e decidi.");
for (const c of daGuardare) {
  const x = c as unknown as Cat;
  const f = forseGemelloDi(c)!;
  console.log(
    `  ${x._id.padEnd(28)} ${n(x.prodotti ?? 0).padStart(7)} link  ~  forse «${f.insegna}» (${n(f.prodotti)} link)`,
  );
}

console.log("");
console.log("SENZA GEMELLO: NON si toccano, sono l'unica copia di quegli indirizzi");
for (const c of daTenere) {
  const x = c as unknown as { _id: string; prodotti: number };
  console.log(`  ${x._id.padEnd(28)} ${n(x.prodotti ?? 0).padStart(7)} link`);
}

console.log("");
console.log(`${daTogliere.length} cataloghi · ${n(link)} link · circa ${Math.round((link * 20) / 1024 / 1024 * 10) / 10} MB`);
console.log(`(${escluse.size} insegne escluse: i loro cataloghi restano, servono se le riammetti)`);
console.log("");

if (!scrivi) {
  console.log("Niente e' stato cancellato. Rilancia con --scrivi per applicare.");
  process.exit(0);
}

const ids = daTogliere.map((c) => String((c as unknown as { _id: string })._id));
const esito = await (await cataloghi()).deleteMany({ _id: { $in: ids } });
console.log(`Cancellati ${esito.deletedCount} cataloghi.`);
process.exit(0);
