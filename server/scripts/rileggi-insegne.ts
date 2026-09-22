/**
 * Dice al lettore di riprovare un'insegna che aveva dato per muta.
 *
 * PERCHE' SERVE UN COMANDO APPOSTA
 * --------------------------------
 * Il lettore e' fatto per non rifare due volte lo stesso lavoro, e lo ricorda
 * in due modi: una riga in `prezzi` col prezzo a niente («aperta, niente da
 * leggere») e un'impronta in `scarti` («non riaprirla per trenta giorni»).
 * Tutti e due dicono la stessa cosa — «qui abbiamo gia' guardato» — ed e'
 * giusto: senza, si riaprirebbero milioni di pagine per riscoprire ogni volta
 * che il prezzo non c'e'.
 *
 * Ma quei due ricordi non dicono «questa pagina non ha un prezzo». Dicono
 * «NOI non ci siamo riusciti», e le due cose coincidono solo finche' il
 * lettore resta lo stesso.
 *
 * Il 20 settembre non e' piu' vero. Due difetti nostri, corretti:
 * l'intestazione che mandavamo (due header invece di nove: Alcampo ci
 * rispondeva 403 e sembrava morto) e il JSON-LD cercato a parole invece che
 * letto come struttura. Dopo le correzioni, dodici insegne che davano zero
 * prezzi ne danno quattro o cinque su cinque — Konzum Online compresa, che
 * avevo dichiarato zavorra confermata su undicimila schede aperte.
 *
 * Sono 450.370 indirizzi che diventano prodotti senza scrivere altro codice.
 * Ma restano fermi finche' qualcuno non cancella quei ricordi, perche' il
 * lettore, giustamente, si fida di se stesso di ieri.
 *
 * COSA CANCELLA, E COSA NO
 * ------------------------
 * Solo le righe SENZA prezzo e le impronte degli scarti. Le righe con un
 * prezzo vero non si toccano: sono lavoro buono, e rifarle costerebbe letture
 * per riscoprire quel che gia' sappiamo.
 *
 *   npx tsx --env-file-if-exists=.env scripts/rileggi-insegne.ts            (mostra)
 *   npx tsx --env-file-if-exists=.env scripts/rileggi-insegne.ts --scrivi
 *   npx tsx --env-file-if-exists=.env scripts/rileggi-insegne.ts --scrivi --solo "Alcampo,Konzum Online"
 */

import { fonti, prezzi, getDb } from "../src/base/db.js";

const scrivi = process.argv.includes("--scrivi");
const arg = (nome: string) =>
  process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : undefined;
const n = (v: number) => v.toLocaleString("it-IT");

/**
 * Le insegne che la sonda ha visto leggere dal lettore di oggi.
 *
 * Scritte qui e non indovinate: ognuna e' stata provata aprendo cinque schede
 * vere dopo le correzioni, e ha dato un prezzo in almeno quattro. Metterne una
 * a caso vorrebbe dire far riaprire migliaia di pagine per riscoprire che il
 * prezzo non c'e'.
 */
const RECUPERATE = [
  "Checkers Sixty60",
  "Alcampo",
  "Rimi e-shop",
  "Rimi Latvia",
  "Vinmonopolet",
  "Rimi Estonia",
  "Freshful",
  "Auchan Zakupy",
  "Bonpreu Esclat",
  "Auchan Portugal",
  "Kifli.hu",
  "Konzum Online",
  "Barbora Estonia",
  "Matas",
];

const scelte = (arg("--solo") ?? "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);
const elenco = scelte.length > 0 ? scelte : RECUPERATE;

const F = (await (await fonti())
  .find({})
  .project({ id: 1, insegna: 1, paese: 1 })
  .toArray()) as Array<{ id?: number; insegna?: string; paese?: string }>;

const P = await prezzi();
const scarti = (await getDb()).collection("scarti");

let righeTot = 0;
let insegneTot = 0;

console.log("");
console.log(scrivi ? "RILETTURA — cancello i ricordi" : "RILETTURA — cosa cancellerei");
console.log("");

for (const nome of elenco) {
  const f = F.find((x) => String(x.insegna) === nome);
  if (!f || typeof f.id !== "number") {
    console.log(`  ${nome.padEnd(24).slice(0, 24)} non e' fra le fonti: salto`);
    continue;
  }

  const senza = await P.countDocuments({ c: f.id, p: null } as never);
  const conPrezzo = await P.countDocuments({ c: f.id, p: { $ne: null } } as never);
  const haScarti = (await scarti.countDocuments({ _id: `${f.paese}|${f.insegna}` } as never)) > 0;

  if (senza === 0 && !haScarti) {
    console.log(`  ${nome.padEnd(24).slice(0, 24)} niente da sbloccare`);
    continue;
  }

  righeTot += senza;
  insegneTot++;

  if (scrivi) {
    if (senza > 0) await P.deleteMany({ c: f.id, p: null } as never);
    if (haScarti) await scarti.deleteOne({ _id: `${f.paese}|${f.insegna}` } as never);
  }

  console.log(
    `  ${nome.padEnd(24).slice(0, 24)} ${n(senza).padStart(8)} righe senza prezzo` +
      (haScarti ? " + scarti" : "") +
      `  (ne tengo ${n(conPrezzo)} con prezzo)`,
  );
}

console.log("");
console.log(`  ${insegneTot} insegne · ${n(righeTot)} indirizzi tornano da leggere`);
console.log("");

if (!scrivi) {
  console.log("Niente e' stato toccato. Per farlo:  ... rileggi-insegne.ts --scrivi");
  console.log("");
  process.exit(0);
}

console.log("Adesso il lettore le riaprira'. Per lanciarlo su quei paesi:");
console.log("  npx tsx --env-file-if-exists=.env scripts/lettore.ts --solo ZA,ES,LT,LV,NO,EE,RO,PL,PT,HU,HR --paesi 4");
console.log("");
process.exit(0);
