/**
 * Le righe di prezzo che non dicono in che moneta sono.
 *
 * IL FATTO
 * --------
 * 355.575 righe su 1,8 milioni — una su cinque — hanno il prezzo giusto e il
 * campo `v` vuoto. Non sono sparse: sono insegne intere. La Belle Vie in
 * Francia ne ha 20.370, Freshful in Romania 46.902, Continente in Portogallo
 * 19.117. La loro pagina il prezzo lo dichiara, la valuta no, e il lettore non
 * ha nessun posto da cui prenderla.
 *
 * Finche' restano cosi', quei paesi non si possono vendere: un numero senza
 * moneta non e' un prezzo.
 *
 * PERCHE' NON UNA TABELLA PAESE→VALUTA SCRITTA A MANO
 * ---------------------------------------------------
 * Perche' esiste gia' in `app/amazon-search.ts`, copre venti paesi su
 * quarantanove, e quando non sa ripiega su EUR — che per la Romania scrive un
 * dato falso con l'aria di essere giusto. Una seconda copia farebbe lo stesso
 * errore con un anno di ritardo.
 *
 * La risposta e' nei dati. Su 355.575 righe da riempire, 329.010 stanno in
 * paesi dove TUTTE le righe che la valuta ce l'hanno dicono la stessa cosa:
 * Romania 78.783 righe e tutte RON, Ucraina 43.493 e tutte UAH. Li' dedurla
 * non e' un'ipotesi, e' leggere i testimoni.
 *
 * LA REGOLA, E PERCHE' HA DUE GUARDIE
 * -----------------------------------
 * Si riempie una riga quando, fra quelle che la valuta ce l'hanno:
 *
 *   · una sola moneta copre almeno il 99% — non il 100%, perche' l'Italia ha
 *     28 righe in dollari e 2 in dirham su 150.713 in euro, e pretendere
 *     l'unanimita' bloccherebbe 24.401 righe italiane per trenta rumori;
 *
 *   · i testimoni sono almeno dieci — perche' sotto quella soglia non si sta
 *     deducendo, si sta indovinando con un campione. La Colombia ne ha
 *     quattordici, e bastano; una insegna con due righe non basterebbe.
 *
 * Chi non passa le guardie resta vuoto. Il Regno Unito ha GBP al 97% e altre
 * sette monete: li' 2.085 righe restano com'erano, ed e' la risposta giusta.
 *
 * PRIMA L'INSEGNA, POI IL PAESE
 * -----------------------------
 * Un'insegna sa di se' piu' del suo paese: Milk & More vende in Regno Unito e
 * incassa in sterline, e guardando lei si sa senza guardare il paese. Ma
 * parecchie insegne la valuta non ce l'hanno MAI — La Belle Vie ha 20.370
 * righe e nemmeno un testimone — e per quelle si sale di un piano.
 *
 * RESTA SCRITTO CHE E' UNA DEDUZIONE
 * -----------------------------------
 * Ogni riga riempita porta `vd: true`. Senza quel segno, domani una valuta
 * letta dalla pagina e una messa da noi sono indistinguibili, e trecento-
 * cinquantacinquemila righe diventano irreversibili. Dieci byte sulle righe
 * toccate, niente sulle altre.
 *
 * NON SI SOVRASCRIVE MAI NIENTE
 * -----------------------------
 * Il filtro cerca solo le righe dove `v` e' vuoto, nullo o assente. Una riga
 * che una valuta ce l'ha non viene toccata nemmeno se sembra sbagliata: quella
 * e' un'altra indagine, e mescolarla a questa vorrebbe dire non sapere piu'
 * quale delle due ha scritto cosa.
 *
 * Uso:
 *   npx tsx --env-file-if-exists=.env scripts/valuta-mancante.ts           prova, non scrive
 *   npx tsx --env-file-if-exists=.env scripts/valuta-mancante.ts --scrivi  scrive davvero
 */

import { prezzi, fonti, isDbConfigured } from "../src/base/db.js";

const SCRIVI = process.argv.includes("--scrivi");
/** Quanto deve dominare una moneta per essere l'unica risposta. */
const DOMINIO = 0.99;
/** Quanti testimoni servono perche' sia una deduzione e non un'ipotesi. */
const TESTIMONI_MINIMI = 10;

const n = (x: number) => x.toLocaleString("it-IT");

/** La moneta che domina, se domina abbastanza e con abbastanza testimoni. */
function moneta(conte: Map<string, number>): { valuta: string; quota: number; testimoni: number } | null {
  let totale = 0;
  for (const q of conte.values()) totale += q;
  if (totale < TESTIMONI_MINIMI) return null;

  let miglioreV = "";
  let miglioreQ = 0;
  for (const [v, q] of conte) if (q > miglioreQ) { miglioreQ = q; miglioreV = v; }

  const quota = miglioreQ / totale;
  return quota >= DOMINIO ? { valuta: miglioreV, quota, testimoni: totale } : null;
}

async function main(): Promise<void> {
  if (!isDbConfigured()) {
    console.log("\n  Serve MONGODB_URI nel .env.\n");
    process.exit(1);
  }

  const col = await prezzi();
  const elenco = await fonti();

  /* Chi e' chi: dal numero dell'insegna al suo nome e al suo paese. */
  const righeFonti = await elenco.find({}, { projection: { id: 1, paese: 1, insegna: 1 } }).toArray();
  const paeseDi = new Map<number, string>();
  const nomeDi = new Map<number, string>();
  for (const f of righeFonti) {
    if (typeof f.id === "number") {
      paeseDi.set(f.id, f.paese);
      nomeDi.set(f.id, f.insegna);
    }
  }

  /* I testimoni: quante righe di ogni insegna dichiarano quale moneta.
     Una passata sola sull'aggregato, non un milione e ottocentomila letture. */
  const gruppi = (await col
    .aggregate<{ _id: { c: number; v: string }; q: number }>([
      { $group: { _id: { c: "$c", v: "$v" }, q: { $sum: 1 } } },
    ])
    .toArray());

  const perInsegna = new Map<number, Map<string, number>>();
  const perPaese = new Map<string, Map<string, number>>();
  const vuotePerInsegna = new Map<number, number>();

  for (const g of gruppi) {
    const insegna = g._id.c;
    const v = g._id.v;
    if (!v) {
      vuotePerInsegna.set(insegna, (vuotePerInsegna.get(insegna) ?? 0) + g.q);
      continue;
    }
    if (!perInsegna.has(insegna)) perInsegna.set(insegna, new Map());
    perInsegna.get(insegna)!.set(v, (perInsegna.get(insegna)!.get(v) ?? 0) + g.q);

    const p = paeseDi.get(insegna) ?? "?";
    if (!perPaese.has(p)) perPaese.set(p, new Map());
    perPaese.get(p)!.set(v, (perPaese.get(p)!.get(v) ?? 0) + g.q);
  }

  /* La decisione, insegna per insegna. */
  const daFare: Array<{ insegna: number; valuta: string; quante: number; come: string }> = [];
  const lasciate: Array<{ insegna: number; quante: number; perche: string }> = [];

  for (const [insegna, quante] of vuotePerInsegna) {
    const sua = moneta(perInsegna.get(insegna) ?? new Map());
    if (sua) {
      daFare.push({ insegna, valuta: sua.valuta, quante, come: `la sua insegna (${n(sua.testimoni)} testimoni)` });
      continue;
    }
    const p = paeseDi.get(insegna);
    const delPaese = p ? moneta(perPaese.get(p) ?? new Map()) : null;
    if (delPaese) {
      daFare.push({ insegna, valuta: delPaese.valuta, quante, come: `il paese ${p} (${n(delPaese.testimoni)} testimoni)` });
      continue;
    }
    const conte = perInsegna.get(insegna) ?? new Map();
    const monete = [...conte.keys()];
    lasciate.push({
      insegna,
      quante,
      perche: monete.length === 0
        ? "nessun testimone, ne' nell'insegna ne' nel paese"
        : `nel paese convivono ${monete.length > 1 ? monete.join(", ") : "monete diverse"}`,
    });
  }

  daFare.sort((a, b) => b.quante - a.quante);
  lasciate.sort((a, b) => b.quante - a.quante);

  console.log(SCRIVI ? "\n  SCRITTURA VERA\n" : "\n  PROVA — non scrive niente\n");
  console.log("  insegna                     paese  righe      moneta  dedotta da");
  let totale = 0;
  for (const d of daFare.slice(0, 25)) {
    totale += d.quante;
    console.log(
      "  " + (nomeDi.get(d.insegna) ?? "c" + d.insegna).slice(0, 26).padEnd(28) +
      (paeseDi.get(d.insegna) ?? "?").padEnd(7) +
      n(d.quante).padStart(9) + "  " + d.valuta.padStart(6) + "  " + d.come,
    );
  }
  const resto = daFare.slice(25).reduce((s, d) => s + d.quante, 0);
  if (resto) console.log(`  … e altre ${daFare.length - 25} insegne per ${n(resto)} righe`);
  totale += resto;

  console.log(`\n  DA RIEMPIRE: ${n(totale)} righe su ${daFare.length} insegne`);

  if (lasciate.length) {
    console.log("\n  LASCIATE COM'ERANO, di proposito:");
    for (const l of lasciate.slice(0, 10)) {
      console.log(
        "  " + (nomeDi.get(l.insegna) ?? "c" + l.insegna).slice(0, 26).padEnd(28) +
        (paeseDi.get(l.insegna) ?? "?").padEnd(7) +
        n(l.quante).padStart(9) + "  — " + l.perche,
      );
    }
    const restoL = lasciate.reduce((s, l) => s + l.quante, 0);
    console.log(`  in tutto ${n(restoL)} righe restano vuote, ed e' la risposta giusta`);
  }

  if (!SCRIVI) {
    console.log("\n  Per scrivere davvero: aggiungi --scrivi\n");
    process.exit(0);
  }

  console.log("\n  scrivo…");
  let scritte = 0;
  for (const d of daFare) {
    const r = await col.updateMany(
      /* SOLO LE VUOTE. Una riga che una valuta ce l'ha non si tocca. */
      { c: d.insegna, $or: [{ v: "" }, { v: null }, { v: { $exists: false } }] },
      /* `vd` dice che questa moneta l'abbiamo dedotta noi, non letta dalla
         pagina. Senza, l'operazione non si distingue piu' da un dato vero e
         non si puo' tornare indietro. */
      { $set: { v: d.valuta, vd: true } },
    );
    scritte += r.modifiedCount;
  }
  console.log(`  scritte ${n(scritte)} righe\n`);
  process.exit(0);
}

void main();
