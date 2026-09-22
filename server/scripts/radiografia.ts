/**
 * Quanti indirizzi hanno DAVVERO un prezzo. Insegna per insegna, dal database.
 *
 * PERCHE' NON SERVE RIAPRIRE UN MILIONE DI PAGINE
 * -----------------------------------------------
 * Perche' il magazzino tiene gia' il verdetto di ogni scheda che e' stata
 * aperta: se il prezzo c'era, la riga porta la cifra; se non c'era, la riga
 * c'e' lo stesso con la cifra a niente — ed e' apposta, e' cosi' che il
 * lettore sa di non doverla riaprire domani.
 *
 * Quindi la domanda «quanti ne hanno uno» si risponde contando, non
 * navigando. Per le schede mai aperte non si puo' sapere e non si finge di
 * saperlo: si dice quante sono e quante ci si aspetta che rendano, usando la
 * resa MISURATA su quelle gia' provate della stessa insegna.
 *
 * LA RESA DICHIARATA NON SI USA
 * -----------------------------
 * Nelle fonti c'e' un campo `resa`, scritto a mano o stimato su pochi
 * campioni mesi fa. Qui si ricalcola dai fatti: prezzi trovati diviso schede
 * aperte. Dove i due numeri litigano vince questo, perche' e' un conteggio e
 * non una stima — e capita che litighino parecchio.
 *
 *   npx tsx --env-file-if-exists=.env scripts/radiografia.ts
 *   npx tsx --env-file-if-exists=.env scripts/radiografia.ts IT
 *   npx tsx --env-file-if-exists=.env scripts/radiografia.ts --zavorra
 */

import { fonti, cataloghi, prezzi } from "../src/base/db.js";

const paese = (process.argv[2] ?? "").toUpperCase().replace(/^--.*/, "");
const soloZavorra = process.argv.includes("--zavorra");
const n = (v: number) => v.toLocaleString("it-IT");

const F = (await (await fonti())
  .find({})
  .project({ id: 1, insegna: 1, paese: 1, esclusa: 1, resa: 1 })
  .toArray()) as Array<{
  id?: number;
  insegna?: string;
  paese?: string;
  esclusa?: string;
  resa?: number;
}>;

const C = (await (await cataloghi())
  .find({})
  .project({ paese: 1, insegna: 1, prodotti: 1 })
  .toArray()) as Array<{ paese?: string; insegna?: string; prodotti?: number }>;

const linkDi = new Map<string, number>();
for (const c of C) linkDi.set(`${c.paese}|${c.insegna}`, c.prodotti ?? 0);

/* IL CONTO LO FA MONGO. Tirare giu' un milione di righe per contarle qui
   vorrebbe dire portarsi l'intera collezione attraverso la rete: minuti
   invece di secondi, e per avere gli stessi due numeri. */
const P = await prezzi();
const agg = (await P.aggregate([
  {
    $group: {
      _id: "$c",
      provate: { $sum: 1 },
      conPrezzo: { $sum: { $cond: [{ $ne: ["$p", null] }, 1, 0] } },
    },
  },
]).toArray()) as Array<{ _id: number; provate: number; conPrezzo: number }>;

const misure = new Map<number, { provate: number; conPrezzo: number }>();
for (const a of agg) misure.set(a._id, { provate: a.provate, conPrezzo: a.conPrezzo });

interface Riga {
  paese: string;
  insegna: string;
  link: number;
  provate: number;
  conPrezzo: number;
  maiAperte: number;
  resaVera: number | null;
  resaScritta: number;
  attesi: number;
}

const righe: Riga[] = [];

for (const f of F) {
  if (f.esclusa) continue;
  const chiave = `${f.paese}|${f.insegna}`;
  const link = linkDi.get(chiave) ?? 0;
  if (link === 0) continue;
  if (paese && f.paese !== paese) continue;

  const m = typeof f.id === "number" ? misure.get(f.id) : undefined;
  const provate = m?.provate ?? 0;
  const conPrezzo = m?.conPrezzo ?? 0;
  /* Le provate possono superare i link del catalogo: il catalogo si rifa' e
     qualche indirizzo sparisce, mentre la riga del prezzo resta finche' non
     scade. Un «mai aperte» negativo sarebbe un'invenzione. */
  const maiAperte = Math.max(0, link - provate);
  const resaVera = provate > 0 ? conPrezzo / provate : null;

  righe.push({
    paese: String(f.paese),
    insegna: String(f.insegna),
    link,
    provate,
    conPrezzo,
    maiAperte,
    resaVera,
    resaScritta: Number(f.resa ?? 0),
    attesi: Math.round(maiAperte * (resaVera ?? Number(f.resa ?? 0))),
  });
}

/* ── la zavorra: catene provate abbastanza da sapere che non rendono ──── */

/**
 * Quante schede bastano per dire «questa insegna non da' prezzi».
 *
 * Cento. Con venti si sbaglia: un'insegna che rende il cinque per cento puo'
 * darne zero su venti per sfortuna, e verrebbe buttata avendo ragione lei.
 * Con cento, zero prezzi vuol dire zero.
 */
const ABBASTANZA = 100;

const zavorra = righe
  .filter((r) => r.provate >= ABBASTANZA && r.conPrezzo === 0)
  .sort((a, b) => b.link - a.link);

const maiProvate = righe.filter((r) => r.provate === 0).sort((a, b) => b.link - a.link);

if (soloZavorra) {
  console.log("");
  console.log("ZAVORRA: aperte almeno cento schede, prezzi trovati zero.");
  console.log("Non e' sfortuna: queste insegne il prezzo non lo scrivono in pagina.");
  console.log("");
  let morti = 0;
  for (const r of zavorra) {
    morti += r.link;
    console.log(
      `  ${r.paese}  ${r.insegna.padEnd(24).slice(0, 24)} ${n(r.link).padStart(8)} link · ` +
        `${n(r.provate).padStart(7)} provate · 0 prezzi · resa scritta ${r.resaScritta}`,
    );
  }
  console.log("");
  console.log(`  ${zavorra.length} insegne · ${n(morti)} indirizzi che non diventeranno mai un prezzo`);
  console.log("");
  process.exit(0);
}

/* ── il quadro ───────────────────────────────────────────────────────── */

const tot = righe.reduce(
  (a, r) => ({
    link: a.link + r.link,
    provate: a.provate + r.provate,
    conPrezzo: a.conPrezzo + r.conPrezzo,
    maiAperte: a.maiAperte + r.maiAperte,
    attesi: a.attesi + r.attesi,
  }),
  { link: 0, provate: 0, conPrezzo: 0, maiAperte: 0, attesi: 0 },
);

console.log("");
console.log(paese ? `RADIOGRAFIA ${paese}` : "RADIOGRAFIA · tutte le insegne vive");
console.log("");
console.log(
  "insegna".padEnd(26) +
    "link".padStart(9) +
    "provate".padStart(9) +
    "con prezzo".padStart(11) +
    "resa".padStart(7) +
    "mai aperte".padStart(11) +
    "attesi".padStart(9),
);

for (const r of righe.sort((a, b) => b.attesi - a.attesi || b.link - a.link)) {
  const resa = r.resaVera === null ? "  —" : `${Math.round(r.resaVera * 100)}%`;
  console.log(
    `${r.paese} ${r.insegna.padEnd(23).slice(0, 23)}` +
      n(r.link).padStart(9) +
      n(r.provate).padStart(9) +
      n(r.conPrezzo).padStart(11) +
      resa.padStart(7) +
      n(r.maiAperte).padStart(11) +
      n(r.attesi).padStart(9),
  );
}

console.log("");
console.log(`  indirizzi leggibili        ${n(tot.link).padStart(11)}`);
console.log(`  gia' provati               ${n(tot.provate).padStart(11)}   ${Math.round((tot.provate / Math.max(1, tot.link)) * 100)}%`);
console.log(`    col prezzo               ${n(tot.conPrezzo).padStart(11)}   <-- PRODOTTI VERI`);
console.log(`    senza                    ${n(tot.provate - tot.conPrezzo).padStart(11)}`);
console.log(`  mai aperti                 ${n(tot.maiAperte).padStart(11)}`);
console.log(`    di cui attesi col prezzo ${n(tot.attesi).padStart(11)}   (sulla resa misurata)`);
console.log("");
console.log(
  `  SU QUEL CHE ABBIAMO APERTO, IL ${Math.round((tot.conPrezzo / Math.max(1, tot.provate)) * 100)}% AVEVA UN PREZZO.`,
);
console.log(`  A LAVORO FINITO SI ARRIVEREBBE A CIRCA ${n(tot.conPrezzo + tot.attesi)} PRODOTTI.`);
console.log("");

if (zavorra.length > 0) {
  const morti = zavorra.reduce((a, r) => a + r.link, 0);
  console.log(`  ZAVORRA: ${zavorra.length} insegne, ${n(morti)} indirizzi provati a fondo e mai un prezzo.`);
  console.log(`  Per vederle:  scripts/radiografia.ts --zavorra`);
}
if (maiProvate.length > 0) {
  const ignoti = maiProvate.reduce((a, r) => a + r.link, 0);
  console.log(`  MAI TOCCATE: ${maiProvate.length} insegne, ${n(ignoti)} indirizzi di cui non sappiamo niente.`);
}
console.log("");
process.exit(0);
