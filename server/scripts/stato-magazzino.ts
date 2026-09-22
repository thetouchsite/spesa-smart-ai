/**
 * Come sto messo. I numeri veri, divisi per quello che sono.
 *
 * LA CONFUSIONE CHE TOGLIE DI MEZZO
 * ---------------------------------
 * «Link in catalogo» e «prezzi» sembrano lo stesso numero visto due volte, e
 * non lo sono affatto:
 *
 *   INDIRIZZI  schede prodotto che sappiamo esistere, prese dalle sitemap dei
 *              negozi. E' l'elenco di cosa c'e' da andare a vedere. Non vuol
 *              dire che le abbiamo aperte, ne' che abbiano un prezzo.
 *   PREZZI     schede aperte davvero, con un prezzo letto in pagina. E' quel
 *              che l'API puo' vendere.
 *
 * La copertura e' il secondo diviso il primo, ed e' la sola cifra che dice se
 * il lavoro sta andando avanti.
 *
 * E GLI INDIRIZZI SI DIVIDONO IN TRE, non in uno.
 * Sommarli faceva sembrare in arretrato una raccolta quasi finita: l'Italia
 * risultava al 40% mentre il 96% delle schede leggibili era gia' letto.
 *
 *   npx tsx --env-file-if-exists=.env scripts/stato-magazzino.ts
 */

import { cataloghi, fonti, prezzi } from "../src/base/db.js";

const n = (v: number) => v.toLocaleString("it-IT");
const pad = (v: number, l = 11) => n(v).padStart(l);

const elenco = (await (await fonti())
  .find({})
  .project({ insegna: 1, paese: 1, esclusa: 1 })
  .toArray()) as Array<{ insegna?: string; paese?: string; esclusa?: string }>;

const vive = new Set<string>();
const escluse = new Map<string, string>();
for (const f of elenco) {
  const nome = String(f.insegna ?? "");
  if (f.esclusa) escluse.set(nome, String(f.esclusa));
  else vive.add(nome);
}

const righe = (await (await cataloghi())
  .find({})
  .project({ paese: 1, insegna: 1, prodotti: 1 })
  .toArray()) as Array<{ paese?: string; insegna?: string; prodotti?: number }>;

let leggibili = 0;
let nLeggibili = 0;
let fuoriLegge = 0;
let nFuoriLegge = 0;
let orfani = 0;
let nOrfani = 0;
const paesi = new Set<string>();
const orfaniElenco: Array<{ id: string; quanti: number }> = [];

for (const r of righe) {
  const nome = String(r.insegna ?? "");
  const quanti = Number(r.prodotti ?? 0);
  if (vive.has(nome)) {
    leggibili += quanti;
    nLeggibili++;
    if (r.paese) paesi.add(String(r.paese));
  } else if (escluse.has(nome)) {
    fuoriLegge += quanti;
    nFuoriLegge++;
  } else {
    orfani += quanti;
    nOrfani++;
    orfaniElenco.push({ id: `${r.paese}|${nome}`, quanti });
  }
}

/* I PREZZI, NON LE RIGHE. Questo script nasce per non farsi illusioni e ne
   raccontava una: contava tutte le righe della collezione, comprese quelle
   aperte senza trovare un prezzo. Diceva 657.004 dove i prodotti veri erano
   620.559. */
const quanti = await (await prezzi()).countDocuments({ p: { $ne: null } } as never);
const copertura = leggibili > 0 ? Math.round((quanti / leggibili) * 100) : 0;

console.log("");
console.log("  STATO DEL MAGAZZINO");
console.log("  ═══════════════════");
console.log("");
console.log("  DA LEGGERE  indirizzi di schede prodotto, presi dalle sitemap");
console.log(`    leggibili      ${pad(leggibili)}   ${nLeggibili} insegne vive in ${paesi.size} paesi`);
console.log(`    escluse        ${pad(fuoriLegge)}   ${nFuoriLegge} insegne che ci hanno detto di no`);
console.log(`    orfani         ${pad(orfani)}   ${nOrfani} cataloghi che nessuna fonte cerca piu'`);
console.log("");
console.log("  LETTI       schede aperte davvero, con un prezzo in pagina");
console.log(`    prezzi         ${pad(quanti)}`);
console.log("");
console.log(`  COPERTURA      ${String(copertura).padStart(10)}%   (prezzi sugli indirizzi leggibili)`);
console.log("");

if (fuoriLegge > 0) {
  console.log("  Le escluse non sono «da fare piu' tardi»: sono da non fare mai.");
  for (const [nome, perche] of [...escluse].slice(0, 20)) {
    console.log(`    ${nome.padEnd(26).slice(0, 26)} ${String(perche).slice(0, 44)}`);
  }
  console.log("");
}

if (nOrfani > 0) {
  console.log("  Gli orfani non li raggiunge nessuno: il lettore cerca il catalogo");
  console.log("  col nome della fonte, e quel nome non esiste piu'.");
  for (const o of orfaniElenco.sort((a, b) => b.quanti - a.quanti).slice(0, 10)) {
    console.log(`    ${o.id.padEnd(30).slice(0, 30)} ${pad(o.quanti, 8)}`);
  }
  console.log("    Per guardarli:  scripts/pulisci-cataloghi.ts");
  console.log("");
}

process.exit(0);
